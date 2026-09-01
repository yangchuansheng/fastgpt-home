#!/usr/bin/env node

/** Validate Week06 Wave 1 observation evidence and the gated follow-on slice. */

const fs = require('node:fs');
const path = require('node:path');
const { fileSha256, identityKey, sha256, stableJson } = require('./technical-authority');
const {
  EN_SEARCH_RELATIVE_PATH,
  PROJECTION_RELATIVE_PATH,
  REGISTRY_RELATIVE_PATH,
  RELEASE_RELATIVE_PATH,
  ROLLBACK_RELATIVE_PATH,
  SELECTION_RELATIVE_PATH,
  ZH_SEARCH_RELATIVE_PATH,
  verifyWeek06Wave1Source
} = require('./week06-technical-wave1');

const OBSERVATION_RELATIVE_PATH = 'src/content/tech-center/authority/week06-wave1-observation.json';
const NEXT_WAVE_RELATIVE_PATH = 'src/content/tech-center/authority/week06-wave2-ticket.json';
const CAPACITY_RELATIVE_PATH =
  'scripts/fixtures/technical-authority/week06-wave1-observation-capacity.json';
const AUTHORITY_RELATIVE_PATH = 'src/content/tech-center/authority/week06-candidate-manifest.json';
const WAVE1_MANIFEST_RELATIVE_PATH = 'src/content/tech-center/authority/week06-wave1-manifest.json';
const WAVE1_CONTENT_RELATIVE_PATH = 'src/content/tech-center/authority/week06-wave1-content.json';
const WAVE1_RELEASE_RELATIVE_PATH = RELEASE_RELATIVE_PATH;
const WAVE1_ROLLBACK_RELATIVE_PATH = ROLLBACK_RELATIVE_PATH;
const WAVE0_READINESS_RELATIVE_PATH =
  'scripts/fixtures/technical-authority/week06-wave0-readiness.json';
const PRODUCTION_WINDOW_HOURS = 72;
const SEARCH_WINDOW_HOURS = 14 * 24;
const MAX_NEXT_WAVE_CANDIDATES = 200;
const REQUIRED_SEARCH_METRICS = [
  'discovered',
  'indexed',
  'canonicalSelected',
  'duplicatePages',
  'excludedPages',
  'crawlAnomalies'
];
const OWNER_ORIGINS = { cn: 'https://fastgpt.cn', io: 'https://fastgpt.io' };
const OFFICIAL_SOURCE_HOST = 'doc.fastgpt.cn';
const NEXT_WAVE_EXCLUDED_CATEGORIES = new Set(['glossary', 'compare', 'troubleshoot']);
const WAVE1_SELECTION_PATH = SELECTION_RELATIVE_PATH;
const WAVE1_SURFACE_PATHS = [
  REGISTRY_RELATIVE_PATH,
  ZH_SEARCH_RELATIVE_PATH,
  EN_SEARCH_RELATIVE_PATH,
  WAVE1_CONTENT_RELATIVE_PATH,
  WAVE1_MANIFEST_RELATIVE_PATH,
  PROJECTION_RELATIVE_PATH,
  ROLLBACK_RELATIVE_PATH
];

function readJson(repoRoot, relativePath) {
  const filePath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(filePath))
    throw new Error(`Missing Week06 Wave 1 observation artifact: ${relativePath}`);
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Unable to parse ${relativePath}: ${error.message}`);
  }
}

function isDigest(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function isCount(value) {
  return Number.isInteger(value) && value >= 0;
}

function durationHours(startedAt, endedAt) {
  const start = Date.parse(startedAt);
  const end = Date.parse(endedAt);
  return Number.isNaN(start) || Number.isNaN(end) ? 0 : (end - start) / 3_600_000;
}

function parseEntryIdentity(entry) {
  const match = entry?.slug?.match(/^\/([^/]+)(\/.*)$/);
  if (!match) throw new Error(`Invalid Technical Page registry slug: ${entry?.slug}`);
  return { locale: match[1], canonicalPath: match[2] };
}

function readPriorCandidateIds(repoRoot) {
  const paths = [
    'src/content/tech-center/authority/week05-wave1-selection.json',
    'src/content/tech-center/authority/week05-wave2-selection.json',
    WAVE1_SELECTION_PATH
  ];
  return new Set(paths.flatMap((relativePath) => readJson(repoRoot, relativePath).candidateIds));
}

function isOfficialLowRiskCandidate(candidate, priorIds, existingKeys) {
  if (
    candidate.state !== 'accepted' ||
    candidate.finalDisposition !== 'accepted' ||
    candidate.action !== 'add' ||
    candidate.decision?.disposition !== 'accepted' ||
    candidate.decision?.operation !== 'add' ||
    candidate.operationRisk?.level !== 'none' ||
    priorIds.has(candidate.id) ||
    NEXT_WAVE_EXCLUDED_CATEGORIES.has(candidate.category) ||
    !['official-document', 'official-upgrade-note'].includes(candidate.sourceClassification?.code)
  ) {
    return false;
  }
  const sources = [...(candidate.evidence?.sources || []), candidate.provenance?.sourceUrl];
  if (!sources.length || sources.some((source) => !source)) return false;
  if (
    sources.some((source) => {
      try {
        const url = new URL(source);
        return url.protocol !== 'https:' || url.hostname !== OFFICIAL_SOURCE_HOST;
      } catch {
        return true;
      }
    })
  ) {
    return false;
  }
  if (candidate.security?.status === 'needs-review') return false;
  if (candidate.security?.findings?.some((finding) => finding.disposition === 'denied'))
    return false;
  return !existingKeys.has(identityKey(candidate.identity));
}

function selectNextWaveCandidates(
  repoRoot = path.resolve(__dirname, '../..'),
  limit = MAX_NEXT_WAVE_CANDIDATES
) {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_NEXT_WAVE_CANDIDATES) {
    throw new Error(`Next Wave candidate limit must be 1-${MAX_NEXT_WAVE_CANDIDATES}`);
  }
  const authority = readJson(repoRoot, AUTHORITY_RELATIVE_PATH);
  const entries = readJson(repoRoot, REGISTRY_RELATIVE_PATH);
  const priorIds = readPriorCandidateIds(repoRoot);
  const existingKeys = new Set(entries.map(parseEntryIdentity).map(identityKey));
  const eligible = authority.candidates.filter((candidate) =>
    isOfficialLowRiskCandidate(candidate, priorIds, existingKeys)
  );
  const candidates = eligible.slice(0, limit);
  const identities = candidates.map((candidate) => ({
    key: identityKey(candidate.identity),
    candidateId: candidate.id,
    locale: candidate.identity.locale,
    owner: candidate.identity.locale === 'zh' ? 'cn' : 'io',
    canonicalPath: candidate.identity.canonicalPath,
    reviewPath: candidate.identity.sourcePath,
    sourceUrl: candidate.provenance.sourceUrl
  }));
  const localeCounts = identities.reduce(
    (counts, identity) => ({ ...counts, [identity.locale]: (counts[identity.locale] || 0) + 1 }),
    { zh: 0, en: 0 }
  );
  return {
    candidates,
    identities,
    candidateIds: candidates.map((candidate) => candidate.id),
    identitySet: identities.map((identity) => identity.key),
    identitySetSha256: sha256(stableJson(identities.map((identity) => identity.key))),
    localeCounts,
    eligibleCount: eligible.length,
    excluded: {
      glossary: authority.candidates.filter((candidate) => candidate.category === 'glossary')
        .length,
      githubTroubleshooting: authority.candidates.filter(
        (candidate) =>
          candidate.category === 'troubleshoot' &&
          candidate.evidence?.sources?.some((source) => source.includes('github.com'))
      ).length,
      comparison: authority.candidates.filter((candidate) => candidate.category === 'compare')
        .length
    }
  };
}

function loadWave1Baseline(repoRoot = path.resolve(__dirname, '../..')) {
  const source = verifyWeek06Wave1Source(repoRoot, { verifyExportFixtures: false });
  const manifest = readJson(repoRoot, WAVE1_MANIFEST_RELATIVE_PATH);
  const content = readJson(repoRoot, WAVE1_CONTENT_RELATIVE_PATH);
  const projection = readJson(repoRoot, PROJECTION_RELATIVE_PATH);
  const release = readJson(repoRoot, WAVE1_RELEASE_RELATIVE_PATH);
  const rollback = readJson(repoRoot, WAVE1_ROLLBACK_RELATIVE_PATH);
  const identitySet = projection.identitySet;
  if (
    source.resultingPageCount !== 1422 ||
    manifest.counts?.resultingPageCount !== 1422 ||
    release.resultingPageCount !== 1422 ||
    rollback.resultingPageCount !== 1422 ||
    identitySet.length !== 50 ||
    new Set(identitySet).size !== identitySet.length
  ) {
    throw new Error('Week06 Wave 1 baseline count or identity set drift');
  }
  for (const surface of [
    content.identitySet,
    manifest.identitySet,
    manifest.selection?.identitySet,
    manifest.content?.identitySet,
    manifest.projection?.identitySet,
    manifest.rollback?.identitySet,
    rollback.identitySet,
    release.identitySet
  ]) {
    if (JSON.stringify(surface) !== JSON.stringify(identitySet)) {
      throw new Error('Week06 Wave 1 baseline identity set drift');
    }
  }
  const artifacts = new Map(
    (release.artifacts || []).map((artifact) => [artifact.path, artifact.sha256])
  );
  for (const relativePath of WAVE1_SURFACE_PATHS) {
    if (
      !artifacts.has(relativePath) ||
      fileSha256(path.join(repoRoot, relativePath)) !== artifacts.get(relativePath)
    ) {
      throw new Error(`Week06 Wave 1 release artifact drift: ${relativePath}`);
    }
  }
  const identitySetSha256 = sha256(stableJson(identitySet));
  return {
    source,
    identitySet,
    identitySetSha256,
    pageCount: 1422,
    baselinePageCount: 1372,
    localeCounts: { zh: 25, en: 25 },
    projectionSha256: fileSha256(path.join(repoRoot, PROJECTION_RELATIVE_PATH)),
    manifestSha256: fileSha256(path.join(repoRoot, WAVE1_MANIFEST_RELATIVE_PATH)),
    releaseManifestSha256: fileSha256(path.join(repoRoot, WAVE1_RELEASE_RELATIVE_PATH)),
    rollbackSha256: fileSha256(path.join(repoRoot, WAVE1_ROLLBACK_RELATIVE_PATH)),
    releaseArtifacts: release.artifacts
  };
}

function evaluateProduction(record, baseline, blockers) {
  const production = record.production || {};
  if (production.source !== 'live-http-wave1') blockers.push({ code: 'production-source-invalid' });
  if (JSON.stringify(production.ownerOrigins) !== JSON.stringify(OWNER_ORIGINS)) {
    blockers.push({ code: 'production-owner-origins-invalid' });
  }
  if (production.observedIdentitySetSha256 !== baseline.identitySetSha256) {
    blockers.push({ code: 'production-identity-coverage-drift' });
  }
  const urls = Array.isArray(production.urls) ? production.urls : [];
  const observedKeys = urls.map((entry) => entry?.identity);
  if (
    production.urlCount !== baseline.identitySet.length ||
    urls.length !== baseline.identitySet.length ||
    new Set(observedKeys).size !== baseline.identitySet.length
  ) {
    blockers.push({ code: 'production-url-coverage-incomplete' });
  }
  if (
    JSON.stringify([...observedKeys].sort()) !== JSON.stringify([...baseline.identitySet].sort())
  ) {
    blockers.push({ code: 'production-identity-list-drift' });
  }
  const baselineByIdentity = new Map(
    baseline.identitySet.map((identity) => {
      const separator = identity.indexOf('|');
      const locale = identity.slice(0, separator);
      const canonicalPath = identity.slice(separator + 1);
      return [identity, { locale, canonicalPath, owner: locale === 'zh' ? 'cn' : 'io' }];
    })
  );
  const statusCounts = {};
  const statusCountsByOwner = { cn: {}, io: {} };
  for (const entry of urls) {
    if (!entry?.url || !entry?.owner || !isCount(entry.status)) {
      blockers.push({ code: 'production-url-record-invalid' });
      continue;
    }
    statusCounts[entry.status] = (statusCounts[entry.status] || 0) + 1;
    const expected = baselineByIdentity.get(entry.identity);
    if (!expected) {
      blockers.push({ code: 'production-identity-list-drift' });
      continue;
    }
    statusCountsByOwner[expected.owner][entry.status] =
      (statusCountsByOwner[expected.owner][entry.status] || 0) + 1;
    const expectedUrl = `${OWNER_ORIGINS[expected.owner]}${expected.canonicalPath}`;
    if (
      entry.owner !== expected.owner ||
      entry.locale !== expected.locale ||
      entry.canonicalPath !== expected.canonicalPath ||
      entry.url !== expectedUrl
    ) {
      blockers.push({ code: 'production-owner-url-drift' });
    }
  }
  if (JSON.stringify(statusCounts) !== JSON.stringify(production.statusCounts || {})) {
    blockers.push({ code: 'production-status-count-drift' });
  }
  if (
    JSON.stringify(statusCountsByOwner) !== JSON.stringify(production.statusCountsByOwner || {})
  ) {
    blockers.push({ code: 'production-owner-status-count-drift' });
  }
  for (const [owner, expectedCount] of [
    ['cn', baseline.localeCounts.zh],
    ['io', baseline.localeCounts.en]
  ]) {
    const observedCount = Object.values(statusCountsByOwner[owner]).reduce(
      (total, count) => total + count,
      0
    );
    if (observedCount !== expectedCount) {
      blockers.push({ code: 'production-owner-url-coverage-incomplete' });
    }
  }
  if ((production.statusCounts?.['404'] || 0) > 0)
    blockers.push({ code: 'production-404-observed' });
  const fiveXx = Object.entries(production.statusCounts || {}).reduce(
    (count, [status, value]) => count + (/^5\d\d$/.test(status) ? value : 0),
    0
  );
  if (fiveXx > 0) blockers.push({ code: 'production-5xx-observed' });
  if (production.statusCounts?.['200'] !== baseline.identitySet.length) {
    blockers.push({ code: 'production-http-200-incomplete' });
  }
  if (production.redirects !== 0) blockers.push({ code: 'production-redirect-observed' });
  if (
    production.canonicalChecked !== baseline.identitySet.length ||
    production.canonicalMismatches !== 0
  ) {
    blockers.push({ code: 'production-canonical-incomplete' });
  }
  if (production.canonicalChecked === urls.length && production.canonicalMismatches === 0) {
    for (const entry of urls) {
      const expected = baselineByIdentity.get(entry.identity);
      if (
        expected &&
        entry.canonical !== `${OWNER_ORIGINS[expected.owner]}${expected.canonicalPath}`
      ) {
        blockers.push({ code: 'production-canonical-record-drift' });
      }
    }
  }
  if (
    production.languageChecked !== baseline.identitySet.length ||
    production.languageMismatches !== 0
  ) {
    blockers.push({ code: 'production-language-incomplete' });
  }
  if (production.languageChecked === urls.length && production.languageMismatches === 0) {
    for (const entry of urls) {
      const expected = baselineByIdentity.get(entry.identity);
      const expectedLanguage = expected?.locale === 'zh' ? 'zh-CN' : 'en';
      if (expected && entry.language !== expectedLanguage) {
        blockers.push({ code: 'production-language-record-drift' });
      }
    }
  }
  if (
    production.sitemapStatusByOwner?.cn !== 200 ||
    production.sitemapStatusByOwner?.io !== 200 ||
    production.sitemapMembership !== baseline.identitySet.length ||
    production.sitemapMissing !== 0
  ) {
    blockers.push({ code: 'production-sitemap-incomplete' });
  }
  if (
    production.ownerIsolationObservedUrlCount !== baseline.identitySet.length ||
    production.ownerIsolationFailures !== 0
  ) {
    blockers.push({ code: 'production-owner-isolation-incomplete' });
  }
  if (production.crawlAnomalies !== 0) blockers.push({ code: 'production-crawl-anomaly' });
  const hours = durationHours(production.startedAt, production.endedAt);
  if (hours < PRODUCTION_WINDOW_HOURS) blockers.push({ code: 'production-window-short' });
  return { ...production, hours, observedUrlCount: urls.length };
}

function evaluateSearch(record, blockers) {
  const search = record.search || {};
  if (!['google-search-console', 'not-provided'].includes(search.source)) {
    blockers.push({ code: 'search-source-invalid' });
  }
  if (search.source === 'not-provided') blockers.push({ code: 'search-source-not-provided' });
  const metricsByOwner = search.metricsByOwner || {};
  for (const owner of ['cn', 'io']) {
    const metrics = metricsByOwner[owner];
    if (
      !metrics ||
      REQUIRED_SEARCH_METRICS.some((name) => !(isCount(metrics[name]) || metrics[name] === null))
    ) {
      blockers.push({ code: `search-${owner}-metrics-missing` });
      continue;
    }
    if (metrics.duplicatePages > 0) blockers.push({ code: `search-${owner}-duplicates-observed` });
    if (metrics.excludedPages > 0) blockers.push({ code: `search-${owner}-exclusions-observed` });
    if (metrics.crawlAnomalies > 0) blockers.push({ code: `search-${owner}-crawl-anomaly` });
    if (isCount(metrics.indexed) && metrics.canonicalSelected !== metrics.indexed) {
      blockers.push({ code: `search-${owner}-canonical-selection-drift` });
    }
  }
  const aggregate = search.metrics || {};
  if (
    REQUIRED_SEARCH_METRICS.some((name) => !(isCount(aggregate[name]) || aggregate[name] === null))
  ) {
    blockers.push({ code: 'search-aggregate-metrics-missing' });
  }
  for (const name of REQUIRED_SEARCH_METRICS) {
    const ownerValues = ['cn', 'io'].map((owner) => metricsByOwner[owner]?.[name]);
    if (ownerValues.every(isCount) && isCount(aggregate[name])) {
      const ownerTotal = ownerValues.reduce((total, value) => total + value, 0);
      if (aggregate[name] !== ownerTotal) {
        blockers.push({ code: 'search-aggregate-metrics-drift' });
      }
    }
  }
  const hours = durationHours(search.startedAt, search.endedAt);
  if (hours < SEARCH_WINDOW_HOURS) blockers.push({ code: 'search-window-short' });
  if (!Array.isArray(search.trends) || search.trends.length < 2) {
    blockers.push({ code: 'search-trends-missing' });
  } else if (
    search.trends[0]?.capturedAt !== search.startedAt ||
    search.trends.at(-1)?.capturedAt !== search.endedAt
  ) {
    blockers.push({ code: 'search-trend-window-drift' });
  }
  return { ...search, hours, metricsByOwner };
}

function evaluateCapacity(record, repoRoot, baseline, blockers) {
  const capacity = record.capacity || {};
  const authority = readJson(repoRoot, CAPACITY_RELATIVE_PATH);
  if (
    capacity.limitAuthority?.path !== CAPACITY_RELATIVE_PATH ||
    capacity.limitAuthority?.sha256 !== fileSha256(path.join(repoRoot, CAPACITY_RELATIVE_PATH))
  ) {
    blockers.push({ code: 'capacity-authority-drift' });
  }
  if (capacity.baseline?.wave0Path !== WAVE0_READINESS_RELATIVE_PATH) {
    blockers.push({ code: 'capacity-wave0-binding-drift' });
  }
  if (
    capacity.baseline?.wave0Sha256 !==
    fileSha256(path.join(repoRoot, WAVE0_READINESS_RELATIVE_PATH))
  ) {
    blockers.push({ code: 'capacity-wave0-digest-drift' });
  }
  if (
    capacity.baseline?.pageCount !== 1372 ||
    capacity.baseline?.nextPageCount !== baseline.pageCount
  ) {
    blockers.push({ code: 'capacity-page-count-drift' });
  }
  const observed = capacity.observed || {};
  const limits = authority.limits || {};
  const fields = [
    ['initialJavaScriptGzipBytes', 'maxInitialJavaScriptGzipBytes'],
    ['zhSearchProjectionBytes', 'maxZhSearchProjectionBytes'],
    ['enSearchProjectionBytes', 'maxEnSearchProjectionBytes'],
    ['staticFileCount', 'maxStaticFileCount'],
    ['exportBytes', 'maxExportBytes'],
    ['buildDurationSeconds', 'maxBuildDurationSeconds']
  ];
  for (const [observedName, limitName] of fields) {
    if (!isCount(observed[observedName])) {
      blockers.push({
        code: `capacity-${observedName.replace(
          /[A-Z]/g,
          (letter) => `-${letter.toLowerCase()}`
        )}-missing`
      });
    }
    if (limits[limitName] === null || limits[limitName] === undefined) {
      blockers.push({
        code: `capacity-${observedName.replace(
          /[A-Z]/g,
          (letter) => `-${letter.toLowerCase()}`
        )}-limit-missing`
      });
    } else if (isCount(observed[observedName]) && observed[observedName] > limits[limitName]) {
      blockers.push({
        code: `capacity-${observedName.replace(
          /[A-Z]/g,
          (letter) => `-${letter.toLowerCase()}`
        )}-exceeded`
      });
    }
  }
  if (isCount(observed.zhSearchProjectionBytes) && isCount(observed.enSearchProjectionBytes)) {
    if (
      observed.searchProjectionBytes !==
      observed.zhSearchProjectionBytes + observed.enSearchProjectionBytes
    ) {
      blockers.push({ code: 'capacity-search-projection-drift' });
    }
  }
  return { ...capacity, authority, blockers: blockers.slice() };
}

function evaluateIssues(record, blockers) {
  const observedIssues = Array.isArray(record.observedIssues) ? record.observedIssues : [];
  const issueById = new Map();
  for (const issue of observedIssues) {
    if (
      !issue?.id ||
      !['resolved', 'release-veto-open'].includes(issue.status) ||
      !issue.disposition
    ) {
      blockers.push({ code: 'observed-issue-disposition-missing' });
      continue;
    }
    issueById.set(issue.id, issue);
  }
  const unresolvedIds = observedIssues
    .filter((issue) => issue.status === 'release-veto-open')
    .map((issue) => issue.id)
    .sort();
  const veto = record.releaseVeto || {};
  if (
    JSON.stringify(unresolvedIds) !== JSON.stringify([...(veto.unresolvedIssueIds || [])].sort())
  ) {
    blockers.push({ code: 'release-veto-issue-set-drift' });
  }
  if (blockers.length && veto.status !== 'active') blockers.push({ code: 'release-veto-active' });
  if (!blockers.every(({ code }) => issueById.has(record.blockerRegistry?.[code]))) {
    blockers.push({ code: 'blocker-disposition-missing' });
  }
  return { observedIssues, issueById };
}

function evaluateReleaseAndRollback(record, repoRoot, baseline, blockers) {
  const release = record.artifacts?.release || {};
  const rollback = record.artifacts?.rollback || {};
  if (
    release.path !== WAVE1_RELEASE_RELATIVE_PATH ||
    release.sha256 !== baseline.releaseManifestSha256 ||
    fileSha256(path.join(repoRoot, release.path)) !== release.sha256 ||
    release.status !== 'passed'
  ) {
    blockers.push({ code: 'release-artifact-incomplete' });
  }
  if (
    !Array.isArray(release.artifacts) ||
    release.artifacts.length !== baseline.releaseArtifacts.length
  ) {
    blockers.push({ code: 'release-artifact-list-incomplete' });
  } else {
    const expectedByPath = new Map(
      baseline.releaseArtifacts.map((artifact) => [artifact.path, artifact.sha256])
    );
    for (const artifact of release.artifacts) {
      if (
        expectedByPath.get(artifact.path) !== artifact.sha256 ||
        fileSha256(path.join(repoRoot, artifact.path)) !== artifact.sha256
      ) {
        blockers.push({ code: `release-artifact-drift:${artifact.path}` });
      }
    }
  }
  if (
    rollback.path !== WAVE1_ROLLBACK_RELATIVE_PATH ||
    rollback.sha256 !== baseline.rollbackSha256 ||
    fileSha256(path.join(repoRoot, rollback.path)) !== rollback.sha256 ||
    rollback.status !== 'passed' ||
    rollback.test?.status !== 'passed' ||
    rollback.test?.command !== 'node scripts/verify-week06-wave1.js --rollback-on-error'
  ) {
    blockers.push({ code: 'rollback-artifact-incomplete' });
  }
  return { release, rollback };
}

function evaluateNextWave(record, repoRoot, blockers) {
  const expected = selectNextWaveCandidates(repoRoot);
  const ticketPath = path.join(repoRoot, NEXT_WAVE_RELATIVE_PATH);
  const ticket = readJson(repoRoot, NEXT_WAVE_RELATIVE_PATH);
  if (
    record.artifacts?.nextWave?.path !== NEXT_WAVE_RELATIVE_PATH ||
    record.artifacts?.nextWave?.sha256 !== fileSha256(ticketPath) ||
    ticket.schemaVersion !== 1 ||
    ticket.kind !== 'week06-official-technical-wave-ticket' ||
    ticket.issue !== 267 ||
    ticket.status !== 'candidate-only'
  ) {
    blockers.push({ code: 'next-slice-ticket-artifact-drift' });
  }
  if (
    JSON.stringify(ticket.selection?.candidateIds) !== JSON.stringify(expected.candidateIds) ||
    ticket.selection?.identitySetSha256 !== expected.identitySetSha256 ||
    ticket.block?.issue !== 267 ||
    ticket.block?.nativeEdge !== 'blocks'
  ) {
    blockers.push({ code: 'next-slice-ticket-selection-drift' });
  }
  const nextSlice = record.nextSlice || {};
  if (!['candidate-only', 'ticket-created'].includes(nextSlice.status)) {
    blockers.push({ code: 'next-slice-status-invalid' });
  }
  if (
    nextSlice.selectedCount !== expected.candidateIds.length ||
    nextSlice.selectedCount < 1 ||
    nextSlice.selectedCount > MAX_NEXT_WAVE_CANDIDATES
  ) {
    blockers.push({ code: 'next-slice-capacity-invalid' });
  }
  if (JSON.stringify(nextSlice.candidateIds) !== JSON.stringify(expected.candidateIds)) {
    blockers.push({ code: 'next-slice-selection-drift' });
  }
  if (nextSlice.identitySetSha256 !== expected.identitySetSha256) {
    blockers.push({ code: 'next-slice-identity-digest-drift' });
  }
  if (JSON.stringify(nextSlice.localeCounts) !== JSON.stringify(expected.localeCounts)) {
    blockers.push({ code: 'next-slice-locale-count-drift' });
  }
  if (nextSlice.block?.issue !== 267 || nextSlice.block?.nativeEdge !== 'blocks') {
    blockers.push({ code: 'next-slice-native-block-missing' });
  }
  if (nextSlice.status === 'candidate-only' && nextSlice.ticket !== null) {
    blockers.push({ code: 'next-slice-ticket-status-drift' });
  }
  if (
    nextSlice.status === 'ticket-created' &&
    (!nextSlice.ticket || nextSlice.ticket.label !== 'ready-for-agent')
  ) {
    blockers.push({ code: 'next-slice-ready-label-missing' });
  }
  for (const gate of ['glossary', 'githubTroubleshooting', 'comparison']) {
    if (nextSlice.gates?.[gate] !== 'blocked')
      blockers.push({ code: `next-slice-${gate}-gate-open` });
  }
  return expected;
}

function evaluateWeek06Wave1Observation(record, repoRoot = path.resolve(__dirname, '../..')) {
  const baseline = loadWave1Baseline(repoRoot);
  const blockers = [];
  if (
    record?.schemaVersion !== 1 ||
    record?.kind !== 'week06-wave1-observation' ||
    record?.issue !== 267 ||
    record?.batch !== 'week06' ||
    record?.wave !== 'wave-1'
  ) {
    blockers.push({ code: 'observation-header-invalid' });
  }
  const deployed = record.deployedBaseline || {};
  if (!['not-observed', 'production-observed'].includes(deployed.status)) {
    blockers.push({ code: 'baseline-status-invalid' });
  }
  if (!/^[a-f0-9]{40}$/.test(deployed.candidateRevision || '')) {
    blockers.push({ code: 'baseline-candidate-revision-invalid' });
  }
  if (deployed.status === 'not-observed' && deployed.deployedRevision !== null) {
    blockers.push({ code: 'baseline-deployed-revision-drift' });
  }
  if (deployed.status === 'not-observed') {
    blockers.push({ code: 'baseline-production-observation-missing' });
  }
  if (
    deployed.status === 'production-observed' &&
    deployed.deployedRevision !== deployed.candidateRevision
  ) {
    blockers.push({ code: 'baseline-deployed-revision-drift' });
  }
  if (
    deployed.pageCount !== baseline.pageCount ||
    deployed.wavePageCount !== baseline.identitySet.length ||
    deployed.identitySetSha256 !== baseline.identitySetSha256 ||
    deployed.releaseManifestSha256 !== baseline.releaseManifestSha256
  ) {
    blockers.push({ code: 'baseline-identity-digest-drift' });
  }
  const production = evaluateProduction(record, baseline, blockers);
  const search = evaluateSearch(record, blockers);
  evaluateCapacity(record, repoRoot, baseline, blockers);
  const { release, rollback } = evaluateReleaseAndRollback(record, repoRoot, baseline, blockers);
  const nextSliceRecord = record.nextSlice || {};
  const nextSlice = evaluateNextWave(record, repoRoot, blockers);
  const { candidates: _candidates, ...nextSliceSelection } = nextSlice;
  evaluateIssues(record, blockers);
  const uniqueBlockers = [...new Map(blockers.map((blocker) => [blocker.code, blocker])).values()];
  const status = uniqueBlockers.length ? 'blocked' : 'passed';
  if (record.status !== status) uniqueBlockers.push({ code: 'observation-status-drift' });
  return {
    status: uniqueBlockers.length ? 'blocked' : 'passed',
    blockers: uniqueBlockers,
    identitySetSha256: baseline.identitySetSha256,
    baselinePageCount: baseline.pageCount,
    wavePageCount: baseline.identitySet.length,
    productionObservedUrlCount: production.observedUrlCount,
    production,
    search,
    rollback,
    releaseArtifactCount: release.artifacts?.length || 0,
    nextSliceCount: nextSlice.candidateIds.length,
    nextSlice: { ...nextSliceSelection, ...nextSliceRecord }
  };
}

function readWeek06Wave1Observation(repoRoot = path.resolve(__dirname, '../..')) {
  return readJson(repoRoot, OBSERVATION_RELATIVE_PATH);
}

function verifyWeek06Wave1Observation(repoRoot = path.resolve(__dirname, '../..')) {
  const result = evaluateWeek06Wave1Observation(readWeek06Wave1Observation(repoRoot), repoRoot);
  if (result.blockers.length) {
    throw new Error(result.blockers.map(({ code }) => code).join(', '));
  }
  return result;
}

module.exports = {
  AUTHORITY_RELATIVE_PATH,
  CAPACITY_RELATIVE_PATH,
  MAX_NEXT_WAVE_CANDIDATES,
  NEXT_WAVE_RELATIVE_PATH,
  OBSERVATION_RELATIVE_PATH,
  PRODUCTION_WINDOW_HOURS,
  SEARCH_WINDOW_HOURS,
  evaluateWeek06Wave1Observation,
  loadWave1Baseline,
  readWeek06Wave1Observation,
  selectNextWaveCandidates,
  verifyWeek06Wave1Observation
};
