#!/usr/bin/env node

/** Validate the retained production and search observation for Week05 Wave 2. */

const fs = require('node:fs');
const path = require('node:path');
const {
  fileSha256,
  identityKey,
  loadTechnicalAuthority,
  sha256,
  stableJson
} = require('./technical-authority');
const {
  REGISTRY_RELATIVE_PATH,
  SEARCH_RELATIVE_PATH,
  WAVE_RELEASE_MANIFEST_RELATIVE_PATH,
  WAVE_ROLLBACK_RELATIVE_PATH
} = require('./technical-wave2');
const { filterWeek06Wave1Projection } = require('./technical-wave-baseline');

const OBSERVATION_RELATIVE_PATH = 'src/content/tech-center/authority/week05-wave2-observation.json';
const CAPACITY_RELATIVE_PATH = 'scripts/fixtures/technical-wave-observation-capacity.json';
const PRODUCTION_WINDOW_HOURS = 72;
const SEARCH_WINDOW_HOURS = 14 * 24;
const REQUIRED_ROLLBACK_SURFACES = ['registry', 'search', 'sitemap', 'staticExport'];

function readJson(repoRoot, relativePath) {
  const filePath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(filePath)) throw new Error(`Missing observation artifact: ${relativePath}`);
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Unable to parse observation artifact ${relativePath}: ${error.message}`);
  }
}

function durationHours(startedAt, endedAt) {
  const start = Date.parse(startedAt);
  const end = Date.parse(endedAt);
  return Number.isNaN(start) || Number.isNaN(end) ? 0 : (end - start) / 3_600_000;
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function evaluateTechnicalWaveObservation(
  record,
  repoRoot = path.resolve(__dirname, '../..'),
  options = {}
) {
  const blockers = [];
  const block = (code, detail) => blockers.push(detail ? { code, detail } : { code });
  const release = readJson(repoRoot, WAVE_RELEASE_MANIFEST_RELATIVE_PATH);
  const rollback = readJson(repoRoot, WAVE_ROLLBACK_RELATIVE_PATH);
  const currentEntries = readJson(repoRoot, REGISTRY_RELATIVE_PATH);
  const currentSearch = [
    ...readJson(repoRoot, SEARCH_RELATIVE_PATH),
    ...(fs.existsSync(path.join(repoRoot, 'public/tech-center/search-index.en.json'))
      ? readJson(repoRoot, 'public/tech-center/search-index.en.json')
      : [])
  ];
  const historicalProjection = filterWeek06Wave1Projection(
    repoRoot,
    currentEntries,
    currentSearch,
    (entry) => {
      const match = entry?.slug?.match(/^\/([^/]+)(\/.*)$/);
      if (!match) throw new Error(`Invalid technical entry slug: ${entry?.slug}`);
      return { locale: match[1], canonicalPath: match[2] };
    }
  );
  const entries = historicalProjection.entries;
  const search = historicalProjection.search;
  const authority = loadTechnicalAuthority(repoRoot);
  const identitySet = release.identitySet || [];
  const identitySetSha256 = sha256(stableJson(identitySet));

  if (
    record?.schemaVersion !== 1 ||
    record?.kind !== 'week05-technical-wave-observation' ||
    record?.batch !== 'week05' ||
    record?.wave !== 'wave-2'
  ) {
    block('observation-header-invalid');
  }
  if (record?.issues?.release !== 258 || record?.issues?.observation !== 263) {
    block('observation-issue-lineage-invalid');
  }

  const deployed = record?.deployedBaseline || {};
  if (!['not-observed', 'production-observed'].includes(deployed.status)) {
    block('deployed-status-invalid');
  }
  if (!/^[a-f0-9]{40}$/.test(deployed.candidateRevision || '')) {
    block('deployed-candidate-revision-invalid');
  }
  if (!/^[a-f0-9]{40}$/.test(deployed.deployedRevision || '')) {
    block('deployed-revision-missing');
  }
  if (
    (deployed.status === 'not-observed' && deployed.deployedRevision !== null) ||
    (deployed.status === 'production-observed' &&
      deployed.deployedRevision !== deployed.candidateRevision)
  ) {
    block('deployed-status-revision-drift');
  }
  if (deployed.pageCount !== 1372 || deployed.wavePageCount !== identitySet.length) {
    block('deployed-page-count-drift');
  }
  if (entries.length !== deployed.pageCount || search.length !== deployed.pageCount) {
    block('deployed-registry-search-count-drift');
  }
  const artifacts = new Map(release.artifacts.map((artifact) => [artifact.path, artifact.sha256]));
  const historicalProjectionBytes = {
    [REGISTRY_RELATIVE_PATH]: stableJson(entries),
    [SEARCH_RELATIVE_PATH]: stableJson(search)
  };
  for (const [label, relativePath, expected] of [
    ['registry', REGISTRY_RELATIVE_PATH, deployed.registrySha256],
    ['search', SEARCH_RELATIVE_PATH, deployed.searchSha256]
  ]) {
    if (
      expected !== artifacts.get(relativePath) ||
      expected !== sha256(historicalProjectionBytes[relativePath])
    ) {
      block(`deployed-${label}-digest-drift`);
    }
  }
  if (
    deployed.releaseManifestSha256 !==
    fileSha256(path.join(repoRoot, WAVE_RELEASE_MANIFEST_RELATIVE_PATH))
  ) {
    block('deployed-release-manifest-digest-drift');
  }
  if (deployed.identitySetSha256 !== identitySetSha256) {
    block('deployed-identity-digest-drift');
  }

  const production = record?.production || {};
  if (
    production.source !== 'live-http-full-wave' ||
    production.ownerOrigin !== 'https://fastgpt.cn' ||
    production.isolationOrigin !== 'https://fastgpt.io'
  ) {
    block('production-source-invalid');
  }
  if (production.observedIdentitySetSha256 !== identitySetSha256) {
    block('production-identity-coverage-drift');
  }
  const productionHours = durationHours(production.startedAt, production.endedAt);
  if (productionHours < PRODUCTION_WINDOW_HOURS) block('production-window-short');
  if (
    production.urlCount !== identitySet.length ||
    production.observedUrlCount !== identitySet.length
  ) {
    block('production-url-coverage-incomplete');
  }
  const statusCounts = production.statusCounts || {};
  const http404 = statusCounts['404'] || 0;
  const http5xx = Object.entries(statusCounts).reduce(
    (count, [status, value]) =>
      count + (/^5\d\d$/.test(status) && isNonNegativeInteger(value) ? value : 0),
    0
  );
  if (http404 > 0) block('production-404-observed', String(http404));
  if (http5xx > 0) block('production-5xx-observed', String(http5xx));
  if (statusCounts['200'] !== identitySet.length) block('production-http-200-incomplete');
  if (production.redirects !== 0) block('production-redirect-observed');
  if (production.canonicalChecked !== identitySet.length || production.canonicalMismatches !== 0) {
    block('production-canonical-incomplete');
  }
  if (
    production.sitemapStatus !== 200 ||
    production.sitemapMembership !== identitySet.length ||
    production.sitemapMissing !== 0
  ) {
    block('production-sitemap-incomplete');
  }
  if (production.ownerIsolationFailures !== 0) block('production-owner-isolation-failed');
  if (production.ownerIsolationObservedUrlCount !== identitySet.length) {
    block('production-owner-isolation-coverage-incomplete');
  }
  if (production.crawlAnomalies !== 0) block('production-crawl-anomaly');

  const searchObservation = record?.search || {};
  if (!['not-provided', 'google-search-console'].includes(searchObservation.source)) {
    block('search-source-invalid');
  }
  if (searchObservation.source === 'not-provided') block('search-source-not-provided');
  const searchHours = durationHours(searchObservation.startedAt, searchObservation.endedAt);
  if (searchHours < SEARCH_WINDOW_HOURS) block('search-window-short');
  const searchMetrics = searchObservation.metrics || {};
  for (const name of [
    'discovered',
    'indexed',
    'canonicalSelected',
    'duplicatePages',
    'excludedPages',
    'crawlAnomalies'
  ]) {
    if (!isNonNegativeInteger(searchMetrics[name])) block(`search-${name}-missing`);
  }
  if (searchMetrics.canonicalSelected !== searchMetrics.indexed) {
    block('search-canonical-selection-drift');
  }
  if (searchMetrics.duplicatePages > 0) block('search-duplicate-pages-observed');
  if (searchMetrics.excludedPages > 0) block('search-exclusions-observed');
  if (searchMetrics.crawlAnomalies > 0) block('search-crawl-anomalies-observed');
  if (!Array.isArray(searchObservation.trends) || searchObservation.trends.length < 2) {
    block('search-trends-missing');
  } else if (
    searchObservation.trends[0]?.capturedAt !== searchObservation.startedAt ||
    searchObservation.trends.at(-1)?.capturedAt !== searchObservation.endedAt
  ) {
    block('search-trend-window-drift');
  }

  const observedIssues = Array.isArray(record?.observedIssues) ? record.observedIssues : [];
  const unresolvedIssues = [];
  for (const issue of observedIssues) {
    if (
      !issue?.id ||
      !issue.disposition ||
      !['resolved', 'release-veto-open'].includes(issue.status)
    ) {
      block('observed-issue-disposition-missing');
      continue;
    }
    if (issue.status === 'release-veto-open') unresolvedIssues.push(issue.id);
  }
  const veto = record?.releaseVeto || {};
  if (
    JSON.stringify([...(veto.unresolvedIssueIds || [])].sort()) !==
    JSON.stringify([...unresolvedIssues].sort())
  ) {
    block('release-veto-issue-set-drift');
  }
  if (unresolvedIssues.length || veto.status !== 'clear') block('release-veto-active');

  const rollbackEvidence = record?.rollback || {};
  if (rollbackEvidence.status !== 'passed' || rollbackEvidence.resultingPageCount !== 1172) {
    block('rollback-proof-incomplete');
  }
  if (rollbackEvidence.removedIdentitySetSha256 !== identitySetSha256) {
    block('rollback-identity-digest-drift');
  }
  if (
    rollbackEvidence.artifact?.path !== WAVE_ROLLBACK_RELATIVE_PATH ||
    rollbackEvidence.artifact?.sha256 !==
      fileSha256(path.join(repoRoot, WAVE_ROLLBACK_RELATIVE_PATH))
  ) {
    block('rollback-artifact-binding-drift');
  }
  if (
    rollbackEvidence.test?.command !== 'node --test scripts/verify-technical-wave2.test.js' ||
    rollbackEvidence.test?.assertion !==
      'Wave 2 projection failure restores every staged surface' ||
    rollbackEvidence.test?.status !== 'passed'
  ) {
    block('rollback-test-binding-drift');
  }
  const rollbackTestedAt = Date.parse(rollbackEvidence.testedAt);
  const recordedAt = Date.parse(record?.recordedAt);
  if (Number.isNaN(rollbackTestedAt) || Number.isNaN(recordedAt) || rollbackTestedAt > recordedAt) {
    block('rollback-tested-at-invalid');
  }
  for (const surface of REQUIRED_ROLLBACK_SURFACES) {
    if (rollbackEvidence.surfaceIdentitySetSha256?.[surface] !== identitySetSha256) {
      block(`rollback-${surface}-evidence-drift`);
    }
    if (sha256(stableJson(rollback.surfaceIdentitySets?.[surface])) !== identitySetSha256) {
      block(`rollback-${surface}-identity-drift`);
    }
  }
  for (const [name, value] of [
    ['registry', rollback.priorCompleteState.registrySha256],
    ['search', rollback.priorCompleteState.searchSha256],
    ['projection', rollback.priorCompleteState.projectionSha256],
    ['release-manifest', rollback.priorCompleteState.releaseManifestSha256],
    ['rollback', rollback.priorCompleteState.rollbackSha256]
  ]) {
    if (rollbackEvidence.priorCompleteState?.[name] !== value) {
      block(`rollback-${name}-restore-drift`);
    }
  }

  const capacity = record?.capacity || {};
  const capacityBlockerStart = blockers.length;
  const observedCapacity = capacity.observed || {};
  if (!['blocked', 'passed'].includes(capacity.status)) block('capacity-status-invalid');
  if (
    capacity.limitAuthority?.path !== CAPACITY_RELATIVE_PATH ||
    capacity.limitAuthority?.sha256 !== fileSha256(path.join(repoRoot, CAPACITY_RELATIVE_PATH))
  ) {
    block('capacity-limit-authority-drift');
  }
  const limitAuthority = options.capacityAuthority || readJson(repoRoot, CAPACITY_RELATIVE_PATH);
  if (
    limitAuthority.schemaVersion !== 1 ||
    limitAuthority.kind !== 'technical-wave-observation-capacity' ||
    !['incomplete', 'approved'].includes(limitAuthority.status)
  ) {
    block('capacity-limit-authority-invalid');
  }
  const technicalBudget = readJson(repoRoot, 'scripts/fixtures/technical-center-budget.json');
  if (
    limitAuthority.policySource !== 'https://github.com/labring/fastgpt-home/issues/252' ||
    limitAuthority.sourceArtifacts?.[0]?.path !== 'scripts/fixtures/technical-center-budget.json' ||
    limitAuthority.sourceArtifacts?.[0]?.sha256 !==
      fileSha256(path.join(repoRoot, 'scripts/fixtures/technical-center-budget.json'))
  ) {
    block('capacity-limit-source-drift');
  }
  const limits = limitAuthority.limits || {};
  if (
    limits.maxInitialJavaScriptGzipBytes !==
    technicalBudget.baselineGzipBytes + technicalBudget.maxIncreaseBytes
  ) {
    block('capacity-initial-javascript-limit-drift');
  }
  const artifactBytes = release.artifacts.reduce((total, artifact) => {
    const historicalBytes = historicalProjectionBytes[artifact.path];
    return (
      total +
      (historicalBytes === undefined
        ? fs.statSync(path.join(repoRoot, artifact.path)).size
        : Buffer.byteLength(historicalBytes))
    );
  }, 0);
  const expectedCapacity = {
    registryBytes: Buffer.byteLength(historicalProjectionBytes[REGISTRY_RELATIVE_PATH]),
    searchProjectionBytes: Buffer.byteLength(historicalProjectionBytes[SEARCH_RELATIVE_PATH]),
    waveArtifactBytes: artifactBytes
  };
  for (const [name, value] of Object.entries(expectedCapacity)) {
    if (observedCapacity[name] !== value) block(`capacity-${name}-drift`);
  }
  for (const [name, limitName] of [
    ['waveArtifactBytes', 'maxWaveArtifactBytes'],
    ['searchProjectionBytes', 'maxSearchProjectionBytes'],
    ['initialJavaScriptGzipBytes', 'maxInitialJavaScriptGzipBytes'],
    ['staticFileCount', 'maxStaticFileCount'],
    ['buildDurationSeconds', 'maxBuildDurationSeconds']
  ]) {
    if (!isNonNegativeInteger(observedCapacity[name]) || !isNonNegativeInteger(limits[limitName])) {
      block(`capacity-${name}-missing`);
    } else if (observedCapacity[name] > limits[limitName]) {
      block(`capacity-${name}-exceeded`);
    }
  }
  if (limits.maxWavePages !== 200 || identitySet.length > limits.maxWavePages) {
    block('capacity-wave-page-limit-drift');
  }
  const capacityFailed = blockers.length > capacityBlockerStart;
  if (
    (capacity.status === 'passed' && capacityFailed) ||
    (capacity.status === 'blocked' && !capacityFailed)
  ) {
    block('capacity-status-drift');
  }

  const nextSlice = record?.nextSlice || {};
  if (!['candidate-only', 'ticket-created'].includes(nextSlice.status)) {
    block('next-slice-status-invalid');
  }
  const candidateIds = Array.isArray(nextSlice.candidateIds) ? nextSlice.candidateIds : [];
  if (
    candidateIds.length < 1 ||
    candidateIds.length > 200 ||
    nextSlice.selectedCount !== candidateIds.length ||
    new Set(candidateIds).size !== candidateIds.length
  ) {
    block('next-slice-capacity-invalid');
  }
  const previousIds = new Set([
    ...readJson(repoRoot, 'src/content/tech-center/authority/week05-wave1-selection.json')
      .candidateIds,
    ...readJson(repoRoot, 'src/content/tech-center/authority/week05-wave2-selection.json')
      .candidateIds
  ]);
  const candidatesById = new Map(
    authority.candidates.map((candidate) => [candidate.id, candidate])
  );
  const expectedCandidateIds = authority.final.accepted
    .filter((candidateId) => !previousIds.has(candidateId))
    .slice(0, 200);
  if (JSON.stringify(candidateIds) !== JSON.stringify(expectedCandidateIds)) {
    block('next-slice-selection-drift');
  }
  const nextIdentities = [];
  for (const candidateId of candidateIds) {
    const candidate = candidatesById.get(candidateId);
    if (
      !candidate ||
      candidate.state !== 'accepted' ||
      candidate.decision?.disposition !== 'accepted' ||
      previousIds.has(candidateId)
    ) {
      block('next-slice-candidate-ineligible', candidateId);
      continue;
    }
    if (
      !candidate.evidence?.sources?.length ||
      candidate.evidence.sources.some((source) => {
        try {
          const url = new URL(source);
          return (
            url.protocol !== 'https:' ||
            url.hostname !== 'github.com' ||
            !url.pathname.startsWith('/labring/FastGPT/')
          );
        } catch {
          return true;
        }
      })
    ) {
      block('next-slice-official-source-invalid', candidateId);
    }
    nextIdentities.push(identityKey(candidate.identity));
  }
  if (nextSlice.identitySetSha256 !== sha256(stableJson(nextIdentities))) {
    block('next-slice-identity-digest-drift');
  }
  if (nextSlice.block?.issue !== 263 || nextSlice.block?.nativeEdge !== 'blocks') {
    block('next-slice-native-block-missing');
  }

  const healthBlockerCount = blockers.length;
  if (healthBlockerCount === 0) {
    if (!Number.isInteger(nextSlice.ticket?.issue) || nextSlice.ticket.issue < 1) {
      block('next-slice-ticket-missing');
    }
    if (nextSlice.ticket?.label !== 'ready-for-agent') block('next-slice-ready-label-missing');
  }
  if (
    (nextSlice.status === 'candidate-only' && nextSlice.ticket !== null) ||
    (nextSlice.status === 'ticket-created' && !nextSlice.ticket)
  ) {
    block('next-slice-ticket-status-drift');
  }
  const issueIds = new Set(observedIssues.map((issue) => issue.id));
  const dispositionBlockers = [...blockers];
  for (const { code } of dispositionBlockers) {
    if (!issueIds.has(record?.blockerRegistry?.[code])) {
      block('blocker-disposition-missing', code);
    }
  }
  const status = blockers.length ? 'blocked' : 'passed';
  if (record?.status !== status) block('observation-status-drift');
  return {
    blockers,
    capacity: expectedCapacity,
    identitySetSha256,
    nextSliceCount: candidateIds.length,
    productionHours,
    searchHours,
    status: blockers.length ? 'blocked' : 'passed',
    wavePageCount: identitySet.length
  };
}

function readTechnicalWaveObservation(repoRoot = path.resolve(__dirname, '../..')) {
  return readJson(repoRoot, OBSERVATION_RELATIVE_PATH);
}

function verifyTechnicalWaveObservation(repoRoot = path.resolve(__dirname, '../..')) {
  const result = evaluateTechnicalWaveObservation(readTechnicalWaveObservation(repoRoot), repoRoot);
  if (result.blockers.length) {
    throw new Error(result.blockers.map(({ code }) => code).join(', '));
  }
  return result;
}

module.exports = {
  CAPACITY_RELATIVE_PATH,
  OBSERVATION_RELATIVE_PATH,
  PRODUCTION_WINDOW_HOURS,
  SEARCH_WINDOW_HOURS,
  evaluateTechnicalWaveObservation,
  readTechnicalWaveObservation,
  verifyTechnicalWaveObservation
};
