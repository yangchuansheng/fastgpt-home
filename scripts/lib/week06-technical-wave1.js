#!/usr/bin/env node

/** Build and verify the Week06 bilingual Technical Content Wave 1. */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  applyRollbackProjection,
  fileSha256,
  identityKey,
  sha256,
  stableJson
} = require('./technical-authority');
const { verifyProjectionConsistency } = require('./technical-projection');
const { loadTechnicalWaveState } = require('./technical-wave-baseline');
const delivery = require('./week06-wave1-delivery');
const {
  assertReaderHygiene,
  buildReaderPage,
  normalizeRelativePath,
  parseSourceBody,
  readerPath,
  resolveRepositoryPath,
  sanitizePublicText,
  validateSelectedIdentity
} = require('./week06-wave1-content');
const { buildSearchProjection } = require('../import-technical-content');

const SELECTION_RELATIVE_PATH = 'src/content/tech-center/authority/week06-wave1-selection.json';
const CONTRACT_RELATIVE_PATH = 'scripts/fixtures/technical-authority/week06-wave1-contract.json';
const AUTHORITY_RELATIVE_PATH = 'src/content/tech-center/authority/week06-candidate-manifest.json';
const REGISTRY_RELATIVE_PATH = 'src/components/tech-center/entries.json';
const ZH_SEARCH_RELATIVE_PATH = 'public/tech-center/search-index.json';
const EN_SEARCH_RELATIVE_PATH = 'public/tech-center/search-index.en.json';
const CONTENT_RELATIVE_PATH = 'src/content/tech-center/authority/week06-wave1-content.json';
const MANIFEST_RELATIVE_PATH = 'src/content/tech-center/authority/week06-wave1-manifest.json';
const PROJECTION_RELATIVE_PATH = 'src/content/tech-center/authority/week06-wave1-projection.json';
const RELEASE_RELATIVE_PATH =
  'src/content/tech-center/authority/week06-wave1-release-manifest.json';
const FULL_RELEASE_IMPORT_MANIFEST_RELATIVE_PATH =
  'src/content/tech-center/authority/full-release-import-manifest.json';
const ROLLBACK_RELATIVE_PATH = 'src/content/tech-center/authority/week06-wave1-rollback.json';
const BASELINE_RELEASE_RELATIVE_PATH =
  'src/content/tech-center/authority/week05-wave2-release-manifest.json';
const BASELINE_PAGE_COUNT = 1372;
const RESULTING_PAGE_COUNT = 1422;
const OWNER_ORIGINS = { zh: 'https://fastgpt.cn', en: 'https://fastgpt.io' };
const APPROVED_SOURCE_CLASSIFICATIONS = {
  official: new Set(['official-document', 'official-upgrade-note']),
  errorCode: new Set(['open-source-error-code']),
  model: new Set(['official-document']),
  glossary: new Set(['supported-glossary-source'])
};
const PUBLIC_SURFACES = [
  'registry',
  'search',
  'sitemap',
  'staticExport',
  'releaseRecord',
  'rollback'
];
const READER_CONTENT_CONTRACT = [
  'reader-content',
  'official-https-citation',
  'applicability-and-version-scope',
  'problem-or-concept-fingerprint',
  'security-and-operation-guardrails',
  'rollback-guidance',
  'reader-body-hygiene'
];

function readJson(repoRoot, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

function isFullReleaseImported(repoRoot) {
  const manifestPath = path.join(repoRoot, FULL_RELEASE_IMPORT_MANIFEST_RELATIVE_PATH);
  if (!fs.existsSync(manifestPath)) return false;
  const manifest = readJson(repoRoot, FULL_RELEASE_IMPORT_MANIFEST_RELATIVE_PATH);
  return manifest.status === 'repository-consistent' && manifest.counts?.total === 4007;
}

function parseEntryIdentity(entry) {
  const match = entry.slug?.match(/^\/([^/]+)(\/.*)$/);
  if (!match) throw new Error(`Invalid technical registry identity: ${entry.slug}`);
  return { locale: match[1], canonicalPath: match[2] };
}

function assertPublicHttps(value, label) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a public HTTPS URL`);
  }
  if (
    url.protocol !== 'https:' ||
    !url.hostname.includes('.') ||
    url.username ||
    url.password ||
    /^(?:localhost|127\.|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/i.test(url.hostname)
  ) {
    throw new Error(`${label} must be a public HTTPS URL`);
  }
}

function candidateCohort(candidate) {
  if (candidate.category === 'model') return 'model';
  if (candidate.category === 'glossary') return 'glossary';
  if (candidate.sourceClassification?.code === 'open-source-error-code') return 'errorCode';
  return 'official';
}

function splitSearchProjection(entries) {
  const projection = buildSearchProjection(entries);
  return {
    zh: projection.filter((entry) => entry.locale === 'zh'),
    en: projection.filter((entry) => entry.locale === 'en')
  };
}

function buildBaseline(repoRoot) {
  const historical = loadTechnicalWaveState(repoRoot, 'week05-wave2');
  const baseline = {
    entries: historical.entries,
    search: historical.searchByLocale
  };
  if (baseline.entries.length !== BASELINE_PAGE_COUNT) {
    throw new Error(
      `Week06 Wave 1 baseline must contain ${BASELINE_PAGE_COUNT} pages; found ${baseline.entries.length}`
    );
  }
  const expectedSearch = splitSearchProjection(baseline.entries);
  if (
    JSON.stringify(baseline.search.zh) !== JSON.stringify(expectedSearch.zh) ||
    JSON.stringify(baseline.search.en) !== JSON.stringify(expectedSearch.en)
  ) {
    throw new Error('Week06 Wave 1 baseline search projection drift');
  }
  const release = readJson(repoRoot, BASELINE_RELEASE_RELATIVE_PATH);
  if (release.wave !== 'wave-2' || release.resultingPageCount !== BASELINE_PAGE_COUNT) {
    throw new Error('Week06 Wave 1 baseline release drift');
  }
  const artifacts = new Map(release.artifacts.map((artifact) => [artifact.path, artifact.sha256]));
  const registrySha256 = sha256(stableJson(baseline.entries));
  const zhSearchSha256 = sha256(stableJson(baseline.search.zh));
  if (
    artifacts.get(REGISTRY_RELATIVE_PATH) !== registrySha256 ||
    artifacts.get(ZH_SEARCH_RELATIVE_PATH) !== zhSearchSha256
  ) {
    throw new Error('Week06 Wave 1 baseline does not match the deployed Week05 Wave 2 artifacts');
  }
  return {
    wave: 'week05-wave-2',
    pageCount: BASELINE_PAGE_COUNT,
    registrySha256,
    searchSha256: {
      zh: zhSearchSha256,
      en: sha256(stableJson(baseline.search.en))
    },
    releaseManifestPath: BASELINE_RELEASE_RELATIVE_PATH,
    releaseManifestSha256: fileSha256(path.join(repoRoot, BASELINE_RELEASE_RELATIVE_PATH)),
    entries: baseline.entries,
    search: baseline.search
  };
}

function loadWeek06Wave1Selection(repoRoot = path.resolve(__dirname, '../..')) {
  const selectionPath = path.join(repoRoot, SELECTION_RELATIVE_PATH);
  const selection = JSON.parse(fs.readFileSync(selectionPath, 'utf8'));
  if (
    selection.schemaVersion !== 1 ||
    selection.issue !== 266 ||
    selection.batch !== 'week06' ||
    selection.wave !== 'wave-1' ||
    selection.status !== 'approved'
  ) {
    throw new Error('Week06 Wave 1 selection metadata drift');
  }
  if (!Array.isArray(selection.candidateIds) || selection.candidateIds.length !== 50) {
    throw new Error('Week06 Wave 1 selection must contain exactly 50 candidate IDs');
  }
  if (!Array.isArray(selection.identitySet) || selection.identitySet.length !== 50) {
    throw new Error('Week06 Wave 1 selection must contain exactly 50 identities');
  }
  if (new Set(selection.candidateIds).size !== selection.candidateIds.length) {
    throw new Error('Week06 Wave 1 selection contains duplicate candidate IDs');
  }
  if (new Set(selection.identitySet).size !== selection.identitySet.length) {
    throw new Error('Week06 Wave 1 selection contains duplicate identities');
  }
  return selection;
}

function loadWeek06Wave1Contract(repoRoot = path.resolve(__dirname, '../..')) {
  const contract = readJson(repoRoot, CONTRACT_RELATIVE_PATH);
  if (
    contract.schemaVersion !== 1 ||
    contract.kind !== 'week06-bilingual-technical-wave1-contract' ||
    contract.issue !== 266 ||
    contract.batch !== 'week06' ||
    contract.wave !== 'wave-1' ||
    contract.mode !== 'publish' ||
    contract.authorityPath !== AUTHORITY_RELATIVE_PATH ||
    contract.selectionPath !== SELECTION_RELATIVE_PATH ||
    contract.baseline?.pageCount !== BASELINE_PAGE_COUNT ||
    contract.expected?.publicationCount !== 50 ||
    contract.expected?.resultingPageCount !== RESULTING_PAGE_COUNT ||
    JSON.stringify(contract.surfaces) !== JSON.stringify(PUBLIC_SURFACES) ||
    contract.writeStrategy !== 'stage-all-then-rename-and-restore-on-error'
  ) {
    throw new Error('Week06 Wave 1 contract metadata drift');
  }
  return contract;
}

function verifyWeek06Wave1Selection(repoRoot = path.resolve(__dirname, '../..')) {
  const contract = loadWeek06Wave1Contract(repoRoot);
  const selection = loadWeek06Wave1Selection(repoRoot);
  const authority = readJson(repoRoot, AUTHORITY_RELATIVE_PATH);
  const entries = readJson(repoRoot, REGISTRY_RELATIVE_PATH);
  if (authority.status !== 'closed' || authority.closure?.status !== 'governance-complete') {
    throw new Error('Week06 authority must be governance-complete');
  }
  const candidatesById = new Map(
    authority.candidates.map((candidate) => [candidate.id, candidate])
  );
  const selected = selection.candidateIds.map((candidateId) => {
    const candidate = candidatesById.get(candidateId);
    if (!candidate) throw new Error(`Unknown Week06 Wave 1 candidate: ${candidateId}`);
    return candidate;
  });
  const selectedIdentityKeys = selected.map((candidate) => identityKey(candidate.identity));
  const selectedKeySet = new Set(selectedIdentityKeys);
  const baselineEntries = entries.filter(
    (entry) => !selectedKeySet.has(identityKey(parseEntryIdentity(entry)))
  );
  const baselineIdentityKeys = new Set(baselineEntries.map(parseEntryIdentity).map(identityKey));

  for (const candidate of selected) {
    const label = candidate.id;
    const cohort = candidateCohort(candidate);
    validateSelectedIdentity(candidate);
    if (
      candidate.state !== 'accepted' ||
      candidate.finalDisposition !== 'accepted' ||
      candidate.action !== 'add' ||
      candidate.decision?.disposition !== 'accepted' ||
      candidate.decision?.operation !== 'add'
    ) {
      throw new Error(`${label} must be in final accepted add state`);
    }
    if (candidate.evidence?.status !== 'verified' || !candidate.evidence.sources?.length) {
      throw new Error(`${label} must have verified source evidence`);
    }
    if (!APPROVED_SOURCE_CLASSIFICATIONS[cohort].has(candidate.sourceClassification?.code)) {
      throw new Error(`${label} must belong to an approved source cohort`);
    }
    candidate.evidence.sources.forEach((source, index) =>
      assertPublicHttps(source, `${label} evidence source ${index + 1}`)
    );
    assertPublicHttps(candidate.provenance?.sourceUrl, `${label} provenance source`);
    if (
      !candidate.evidence.fingerprint?.trim() ||
      !candidate.evidence.applicability?.trim() ||
      candidate.provenance.sourceBodySha256 !== candidate.provenance.bodySha256
    ) {
      throw new Error(`${label} source fingerprint or digest drift`);
    }
    for (const digest of [
      candidate.provenance.sourceSha256,
      candidate.provenance.sourceBodySha256,
      candidate.provenance.workbookSha256
    ]) {
      if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error(`${label} source digest drift`);
    }
    if (
      Object.values(candidate.gates || {}).some((gate) => gate !== 'passed') ||
      candidate.security?.status === 'needs-review' ||
      candidate.security?.findings?.some((finding) => finding.disposition === 'denied') ||
      candidate.operationRisk?.decision !== 'cleared' ||
      candidate.operationRisk?.findings?.some((finding) => finding.disposition !== 'cleared') ||
      candidate.operationRisk?.level === 'D0'
    ) {
      throw new Error(`${label} has an unresolved publication gate`);
    }
    const expectedOwner = candidate.identity.locale === 'zh' ? 'cn' : 'io';
    if (candidate.identity.owner !== expectedOwner) throw new Error(`${label} owner leak`);
    if (baselineIdentityKeys.has(identityKey(candidate.identity))) {
      throw new Error(`${label} collides with the production registry`);
    }
  }

  if (new Set(selectedIdentityKeys).size !== selected.length) {
    throw new Error('Week06 Wave 1 selected identities collide');
  }
  if (JSON.stringify(selectedIdentityKeys) !== JSON.stringify(selection.identitySet)) {
    throw new Error('Week06 Wave 1 approved identity set drift');
  }
  const localeCounts = { zh: 0, en: 0 };
  const cohortCounts = { official: 0, errorCode: 0, model: 0, glossary: 0 };
  for (const candidate of selected) {
    localeCounts[candidate.identity.locale] += 1;
    cohortCounts[candidateCohort(candidate)] += 1;
  }
  if (
    JSON.stringify(localeCounts) !== JSON.stringify(selection.expectedCounts.locales) ||
    JSON.stringify(localeCounts) !== JSON.stringify(contract.expected.locales)
  ) {
    throw new Error('Week06 Wave 1 locale count drift');
  }
  if (
    JSON.stringify(cohortCounts) !== JSON.stringify(selection.expectedCounts.cohorts) ||
    JSON.stringify(cohortCounts) !== JSON.stringify(contract.expected.cohorts)
  ) {
    throw new Error('Week06 Wave 1 cohort count drift');
  }
  return {
    contract,
    selection,
    selected,
    selectedCount: selected.length,
    localeCounts,
    cohortCounts,
    identityCollisions: 0,
    readerPathCollisions: 0,
    ownerLeaks: 0,
    authoritySha256: fileSha256(path.join(repoRoot, AUTHORITY_RELATIVE_PATH)),
    selectionSha256: fileSha256(path.join(repoRoot, SELECTION_RELATIVE_PATH)),
    contractSha256: fileSha256(path.join(repoRoot, CONTRACT_RELATIVE_PATH)),
    sourceSetSha256: sha256(
      stableJson(
        selected.map((candidate) => ({
          candidateId: candidate.id,
          sourceSha256: candidate.provenance.sourceSha256,
          sourceBodySha256: candidate.provenance.sourceBodySha256
        }))
      )
    )
  };
}

function buildContentManifest({ selectionEvidence, projectedEntries, readerDocuments }) {
  const entriesByIdentity = new Map(
    projectedEntries.map((entry) => [identityKey(parseEntryIdentity(entry)), entry])
  );
  const sources = selectionEvidence.selected.map((candidate) => {
    const identity = identityKey(candidate.identity);
    const pathName = readerPath(candidate);
    const document = readerDocuments.get(pathName);
    const entry = entriesByIdentity.get(identity);
    if (!document || !entry) throw new Error(`${candidate.id} reader projection is incomplete`);
    return {
      candidateId: candidate.id,
      identity: candidate.identity,
      cohort: candidateCohort(candidate),
      operation: candidate.decision.operation,
      sourceUrl: candidate.provenance.sourceUrl,
      sourceSha256: candidate.provenance.sourceSha256,
      sourceBodySha256: candidate.provenance.sourceBodySha256,
      sourceSetSha256: selectionEvidence.sourceSetSha256,
      importedBodySha256: sha256(pageBody(document)),
      sourceBinding: 'recorded-approved-source-digests',
      evidence: {
        status: candidate.evidence.status,
        fingerprint: sanitizePublicText(candidate.evidence.fingerprint),
        applicability: sanitizePublicText(candidate.evidence.applicability)
      },
      securityStatus: candidate.security.status,
      operationRisk: candidate.operationRisk.level,
      readerPath: pathName,
      readerSha256: sha256(document),
      registryEntrySha256: sha256(stableJson(entry))
    };
  });
  return {
    schemaVersion: 1,
    issue: 266,
    batch: 'week06',
    wave: 'wave-1',
    status: 'repository-consistent',
    repositoryConsistent: true,
    sourceVerified: false,
    readerContentContract: READER_CONTENT_CONTRACT,
    sourceSetSha256: selectionEvidence.sourceSetSha256,
    readerCount: sources.length,
    localeCounts: selectionEvidence.localeCounts,
    cohortCounts: selectionEvidence.cohortCounts,
    identitySet: sources.map((source) => identityKey(source.identity)),
    sources
  };
}

function pageBody(document) {
  return parseSourceBody(document, 'technical reader').body.trim();
}

function buildProjection({ selectionEvidence, projectedEntries, projectedSearch }) {
  const selectedKeys = new Set(
    selectionEvidence.selected.map((candidate) => identityKey(candidate.identity))
  );
  const identities = selectionEvidence.selected.map((candidate) => ({
    key: identityKey(candidate.identity),
    candidateId: candidate.id,
    locale: candidate.identity.locale,
    owner: candidate.identity.owner,
    canonicalPath: candidate.identity.canonicalPath,
    reviewPath: candidate.identity.sourcePath,
    canonical: `${OWNER_ORIGINS[candidate.identity.locale]}${candidate.identity.canonicalPath}`
  }));
  const registry = projectedEntries
    .filter((entry) => selectedKeys.has(identityKey(parseEntryIdentity(entry))))
    .map((entry) => ({ identity: identityKey(parseEntryIdentity(entry)), ...entry }));
  const search = [...projectedSearch.zh, ...projectedSearch.en].filter((entry) =>
    selectedKeys.has(entry.identity)
  );
  const sitemap = identities.map((identity) => ({
    identity: identity.key,
    owner: identity.owner,
    url: identity.canonical
  }));
  const staticExport = identities.map((identity) => ({
    identity: identity.key,
    owner: identity.owner,
    language: identity.locale === 'zh' ? 'zh-CN' : 'en',
    path: identity.canonicalPath,
    reviewPath: identity.reviewPath,
    canonical: identity.canonical,
    status: 200
  }));
  const releaseRecord = identities.map((identity) => ({
    candidateId: identity.candidateId,
    identity: identity.key,
    status: 'repository-consistent',
    repositoryConsistent: true,
    sourceVerified: false,
    fixtureVerified: true,
    exportVerified: false,
    releaseEligible: false,
    productionObserved: false,
    publicationCount: 1
  }));
  const rollback = identities.map((identity) => ({
    candidateId: identity.candidateId,
    identity: identity.key,
    action: 'remove-week06-wave1-projection',
    baselinePageCount: BASELINE_PAGE_COUNT
  }));
  const projection = {
    schemaVersion: 1,
    issue: 266,
    batch: 'week06',
    wave: 'wave-1',
    mode: 'publish',
    consistency: 'identity-set-verified',
    governanceStatus: 'governance-complete',
    repositoryConsistent: true,
    sourceVerified: false,
    fixtureVerified: true,
    exportVerified: false,
    releaseEligible: false,
    productionObserved: false,
    baselinePageCount: BASELINE_PAGE_COUNT,
    acceptedCandidateCount: identities.length,
    acceptedAdd: identities.length,
    acceptedUpdate: 0,
    publicPageDelta: identities.length,
    publicationCount: identities.length,
    resultingPageCount: BASELINE_PAGE_COUNT + identities.length,
    localeCounts: selectionEvidence.localeCounts,
    cohortCounts: selectionEvidence.cohortCounts,
    identitySet: identities.map((identity) => identity.key),
    surfaces: PUBLIC_SURFACES,
    identities,
    registry,
    search,
    sitemap,
    staticExport,
    releaseRecord,
    rollback
  };
  verifyProjectionConsistency(projection);
  return projection;
}

function buildRollback({ baseline, projection, readerPaths }) {
  const surfaceIdentitySets = Object.fromEntries(
    PUBLIC_SURFACES.map((surface) => [
      surface,
      projection[surface].map((entry) => entry.identity || entry.key)
    ])
  );
  const priorCompleteState = [
    { path: REGISTRY_RELATIVE_PATH, exists: true, sha256: baseline.registrySha256 },
    {
      path: ZH_SEARCH_RELATIVE_PATH,
      exists: true,
      sha256: baseline.searchSha256.zh
    },
    {
      path: EN_SEARCH_RELATIVE_PATH,
      exists: true,
      sha256: baseline.searchSha256.en
    },
    ...readerPaths.map((pathName) => ({ path: pathName, exists: false, sha256: null })),
    ...[
      CONTENT_RELATIVE_PATH,
      MANIFEST_RELATIVE_PATH,
      PROJECTION_RELATIVE_PATH,
      RELEASE_RELATIVE_PATH,
      ROLLBACK_RELATIVE_PATH
    ].map((pathName) => ({ path: pathName, exists: false, sha256: null }))
  ];
  return {
    schemaVersion: 1,
    issue: 266,
    batch: 'week06',
    wave: 'wave-1',
    status: 'ready',
    strategy: 'stage-all-then-rename-and-restore-on-error',
    baselinePageCount: baseline.pageCount,
    resultingPageCount: projection.resultingPageCount,
    identitySet: projection.identitySet,
    affectedIdentities: projection.identitySet,
    publicSurfaces: [
      REGISTRY_RELATIVE_PATH,
      ZH_SEARCH_RELATIVE_PATH,
      EN_SEARCH_RELATIVE_PATH,
      ...readerPaths,
      CONTENT_RELATIVE_PATH,
      MANIFEST_RELATIVE_PATH,
      PROJECTION_RELATIVE_PATH,
      RELEASE_RELATIVE_PATH,
      ROLLBACK_RELATIVE_PATH
    ],
    surfaceIdentitySets,
    priorCompleteState,
    rollbackAction:
      'Restore all prior bytes and remove every Wave 1-only file before serving another export.',
    identities: projection.rollback
  };
}

function buildWeek06Wave1Package(repoRoot = path.resolve(__dirname, '../..'), { sourceRoot } = {}) {
  const selectionEvidence = verifyWeek06Wave1Selection(repoRoot);
  const baseline = buildBaseline(repoRoot);
  const readerDocuments = new Map();
  const pages = new Map();
  let sourceDigestVerifiedCount = 0;
  for (const candidate of selectionEvidence.selected) {
    const page = buildReaderPage(repoRoot, candidate, sourceRoot);
    const pathName = readerPath(candidate);
    readerDocuments.set(pathName, page.document);
    pages.set(candidate.id, page);
    if (page.sourceDigestVerified) sourceDigestVerifiedCount += 1;
  }
  const entries = [
    ...baseline.entries,
    ...selectionEvidence.selected.map((candidate) => pages.get(candidate.id).projection)
  ];
  const search = splitSearchProjection(entries);
  const content = buildContentManifest({
    selectionEvidence,
    projectedEntries: entries,
    readerDocuments
  });
  const projection = buildProjection({
    selectionEvidence,
    projectedEntries: entries,
    projectedSearch: search
  });
  const readerPaths = [...readerDocuments.keys()];
  const rollback = buildRollback({ baseline, projection, readerPaths });
  const baselineRecord = {
    wave: baseline.wave,
    pageCount: baseline.pageCount,
    registrySha256: baseline.registrySha256,
    searchSha256: baseline.searchSha256,
    releaseManifestPath: baseline.releaseManifestPath,
    releaseManifestSha256: baseline.releaseManifestSha256
  };
  const manifest = {
    schemaVersion: 1,
    issue: 266,
    batch: 'week06',
    wave: 'wave-1',
    status: 'repository-consistent',
    identitySet: projection.identitySet,
    baseline: baselineRecord,
    selection: {
      path: SELECTION_RELATIVE_PATH,
      sha256: selectionEvidence.selectionSha256,
      candidateIds: selectionEvidence.selection.candidateIds,
      identitySet: projection.identitySet,
      selectedCount: selectionEvidence.selectedCount,
      localeCounts: selectionEvidence.localeCounts,
      cohortCounts: selectionEvidence.cohortCounts,
      reviewer: selectionEvidence.selection.reviewer,
      criteria: selectionEvidence.selection.criteria
    },
    counts: {
      baselinePageCount: baseline.pageCount,
      acceptedCandidateCount: projection.acceptedCandidateCount,
      acceptedAdd: projection.acceptedAdd,
      acceptedUpdate: projection.acceptedUpdate,
      publicPageDelta: projection.publicPageDelta,
      resultingPageCount: projection.resultingPageCount
    },
    content: {
      path: CONTENT_RELATIVE_PATH,
      sha256: sha256(stableJson(content)),
      readerCount: content.readerCount,
      identitySet: content.identitySet
    },
    projection: {
      path: PROJECTION_RELATIVE_PATH,
      sha256: sha256(stableJson(projection)),
      identitySet: projection.identitySet
    },
    rollback: {
      path: ROLLBACK_RELATIVE_PATH,
      sha256: sha256(stableJson(rollback)),
      identitySet: rollback.identitySet
    },
    provenance: {
      contractPath: CONTRACT_RELATIVE_PATH,
      contractSha256: selectionEvidence.contractSha256,
      authorityPath: AUTHORITY_RELATIVE_PATH,
      authoritySha256: selectionEvidence.authoritySha256,
      sourceSetSha256: selectionEvidence.sourceSetSha256
    },
    verification: {
      repositoryConsistent: true,
      sourceVerified: false,
      fixtureVerified: true,
      exportVerified: false,
      releaseEligible: false,
      productionObserved: false,
      evidenceSource: 'repository-projection-and-staged-static-owner-fixture'
    }
  };
  const artifactBytes = new Map([
    [REGISTRY_RELATIVE_PATH, stableJson(entries)],
    [ZH_SEARCH_RELATIVE_PATH, stableJson(search.zh)],
    [EN_SEARCH_RELATIVE_PATH, stableJson(search.en)],
    [CONTENT_RELATIVE_PATH, stableJson(content)],
    [MANIFEST_RELATIVE_PATH, stableJson(manifest)],
    [PROJECTION_RELATIVE_PATH, stableJson(projection)],
    [ROLLBACK_RELATIVE_PATH, stableJson(rollback)]
  ]);
  const releaseManifest = {
    schemaVersion: 1,
    issue: 266,
    batch: 'week06',
    wave: 'wave-1',
    status: 'repository-consistent',
    repositoryConsistent: true,
    sourceVerified: false,
    fixtureVerified: true,
    exportVerified: false,
    releaseEligible: false,
    productionObserved: false,
    sourceSetSha256: content.sourceSetSha256,
    identitySet: projection.identitySet,
    localeCounts: projection.localeCounts,
    baseline: baselineRecord,
    resultingPageCount: projection.resultingPageCount,
    writeStrategy: 'rollback-on-error',
    postWriteVerification: 'required',
    evidence: {
      source: 'week06-candidate-manifest',
      fixture: 'cn-io-preview-static-owner-projection',
      production: 'pending-live-http-observation'
    },
    artifacts: [...readerDocuments.entries(), ...artifactBytes.entries()].map(
      ([pathName, bytes]) => ({ path: pathName, sha256: sha256(bytes) })
    )
  };
  artifactBytes.set(RELEASE_RELATIVE_PATH, stableJson(releaseManifest));
  const fileRelativePaths = [...readerPaths, ...artifactBytes.keys()];
  const priorContentByPath = new Map([
    [REGISTRY_RELATIVE_PATH, stableJson(baseline.entries)],
    [ZH_SEARCH_RELATIVE_PATH, stableJson(baseline.search.zh)],
    [EN_SEARCH_RELATIVE_PATH, stableJson(baseline.search.en)]
  ]);
  return {
    selectionEvidence,
    baseline: baselineRecord,
    readerDocuments,
    entries,
    search,
    content,
    projection,
    rollback,
    manifest,
    releaseManifest,
    sourceDigestVerifiedCount,
    fileRelativePaths,
    files: fileRelativePaths.map((pathName) =>
      resolveRepositoryPath(repoRoot, pathName, `Week06 Wave 1 surface ${pathName}`)
    ),
    contents: [...readerDocuments.values(), ...artifactBytes.values()],
    priorContents: fileRelativePaths.map((pathName) => priorContentByPath.get(pathName) ?? null)
  };
}

function writeWeek06Wave1Package(wavePackage, failAt) {
  applyRollbackProjection({ files: wavePackage.files, contents: wavePackage.contents, failAt });
  return {
    publicationCount: wavePackage.projection.publicationCount,
    resultingPageCount: wavePackage.projection.resultingPageCount
  };
}

function verifyWeek06Wave1Source(
  repoRoot = path.resolve(__dirname, '../..'),
  { verifyExportFixtures = true, sourceRoot } = {}
) {
  const expected = buildWeek06Wave1Package(repoRoot, { sourceRoot });
  const useHistoricalRegistry = isFullReleaseImported(repoRoot);
  const artifacts = {
    entries: useHistoricalRegistry ? expected.entries : readJson(repoRoot, REGISTRY_RELATIVE_PATH),
    zhSearch: useHistoricalRegistry
      ? expected.search.zh
      : readJson(repoRoot, ZH_SEARCH_RELATIVE_PATH),
    enSearch: useHistoricalRegistry
      ? expected.search.en
      : readJson(repoRoot, EN_SEARCH_RELATIVE_PATH),
    content: readJson(repoRoot, CONTENT_RELATIVE_PATH),
    manifest: readJson(repoRoot, MANIFEST_RELATIVE_PATH),
    projection: readJson(repoRoot, PROJECTION_RELATIVE_PATH),
    rollback: readJson(repoRoot, ROLLBACK_RELATIVE_PATH),
    releaseManifest: readJson(repoRoot, RELEASE_RELATIVE_PATH)
  };
  for (const [label, actual, projected] of [
    ['registry', artifacts.entries, expected.entries],
    ['Chinese search', artifacts.zhSearch, expected.search.zh],
    ['English search', artifacts.enSearch, expected.search.en],
    ['content', artifacts.content, expected.content],
    ['manifest', artifacts.manifest, expected.manifest],
    ['projection', artifacts.projection, expected.projection],
    ['rollback', artifacts.rollback, expected.rollback],
    ['release manifest', artifacts.releaseManifest, expected.releaseManifest]
  ]) {
    if (JSON.stringify(actual) !== JSON.stringify(projected)) {
      throw new Error(`Week06 Wave 1 ${label} projection drift`);
    }
  }
  for (const [pathName, document] of expected.readerDocuments) {
    const filePath = path.join(repoRoot, pathName);
    if (!fs.existsSync(filePath) || fs.readFileSync(filePath, 'utf8') !== document) {
      throw new Error(`Week06 Wave 1 reader projection drift: ${pathName}`);
    }
    assertReaderHygiene(document, pathName);
    const locale = pathName.split('/')[3];
    if (locale === 'en' && /[\u3400-\u9fff]/.test(document.split('\n---\n\n')[1] || '')) {
      throw new Error(`Week06 Wave 1 English reader locale drift: ${pathName}`);
    }
  }
  const identitySets = [
    expected.selectionEvidence.selection.identitySet,
    artifacts.content.identitySet,
    artifacts.manifest.identitySet,
    artifacts.manifest.selection.identitySet,
    artifacts.manifest.content.identitySet,
    artifacts.manifest.projection.identitySet,
    artifacts.manifest.rollback.identitySet,
    artifacts.projection.identitySet,
    artifacts.rollback.identitySet,
    artifacts.rollback.affectedIdentities,
    artifacts.releaseManifest.identitySet
  ];
  const identitySet = JSON.stringify(expected.projection.identitySet);
  for (const surface of identitySets) {
    if (surface.length !== 50 || JSON.stringify(surface) !== identitySet) {
      throw new Error('Week06 Wave 1 identity set drift across release surfaces');
    }
  }
  verifyProjectionConsistency(artifacts.projection);
  const releaseArtifactPaths = new Set(artifacts.releaseManifest.artifacts.map(({ path }) => path));
  for (const pathName of [
    ...expected.readerDocuments.keys(),
    REGISTRY_RELATIVE_PATH,
    ZH_SEARCH_RELATIVE_PATH,
    EN_SEARCH_RELATIVE_PATH,
    CONTENT_RELATIVE_PATH,
    MANIFEST_RELATIVE_PATH,
    PROJECTION_RELATIVE_PATH,
    ROLLBACK_RELATIVE_PATH
  ]) {
    if (!releaseArtifactPaths.has(pathName)) {
      throw new Error(`Week06 Wave 1 release artifact missing: ${pathName}`);
    }
  }
  for (const artifact of artifacts.releaseManifest.artifacts) {
    const artifactDigest =
      artifact.path === REGISTRY_RELATIVE_PATH
        ? sha256(stableJson(artifacts.entries))
        : artifact.path === ZH_SEARCH_RELATIVE_PATH
        ? sha256(stableJson(artifacts.zhSearch))
        : artifact.path === EN_SEARCH_RELATIVE_PATH
        ? sha256(stableJson(artifacts.enSearch))
        : fileSha256(path.join(repoRoot, artifact.path));
    if (artifactDigest !== artifact.sha256) {
      throw new Error(`Week06 Wave 1 release artifact digest drift: ${artifact.path}`);
    }
  }
  if (
    artifacts.content.sourceSetSha256 !== expected.selectionEvidence.sourceSetSha256 ||
    artifacts.manifest.provenance.sourceSetSha256 !== expected.selectionEvidence.sourceSetSha256 ||
    artifacts.releaseManifest.sourceSetSha256 !== expected.selectionEvidence.sourceSetSha256
  ) {
    throw new Error('Week06 Wave 1 source-set digest drift');
  }
  if (verifyExportFixtures) {
    const exportEvidence = verifyWeek06Wave1ExportFixtures(repoRoot);
    if (
      JSON.stringify(exportEvidence.ownerPages) !==
        JSON.stringify({ cn: 25, io: 25, preview: 50 }) ||
      exportEvidence.productionObserved !== 0 ||
      exportEvidence.stagedPagesVerified !== 100 ||
      exportEvidence.ownerLeaks !== 0 ||
      exportEvidence.localeDrift !== 0 ||
      exportEvidence.sitemapDrift !== 0 ||
      exportEvidence.searchDrift !== 0 ||
      exportEvidence.brokenInternalLinks !== 0
    ) {
      throw new Error('Week06 Wave 1 staged export evidence drift');
    }
  }
  return {
    issue: 266,
    wave: 'wave-1',
    selectedCount: expected.selectionEvidence.selectedCount,
    publicationCount: expected.projection.publicationCount,
    localeCounts: expected.projection.localeCounts,
    cohortCounts: expected.projection.cohortCounts,
    baselinePageCount: expected.baseline.pageCount,
    resultingPageCount: expected.projection.resultingPageCount,
    sourceSetSha256: expected.content.sourceSetSha256,
    projectionDrift: 0,
    ownerLeaks: 0,
    hygieneFindings: 0,
    repositoryConsistent: true,
    sourceVerified: expected.sourceDigestVerifiedCount === 50,
    sourceDigestVerifiedCount: expected.sourceDigestVerifiedCount,
    fixtureVerified: verifyExportFixtures,
    exportVerified: false,
    releaseEligible: false,
    productionObserved: false,
    rollback: 'ready'
  };
}

function verifyWeek06Wave1RollbackOnError(repoRoot = path.resolve(__dirname, '../..')) {
  const wavePackage = buildWeek06Wave1Package(repoRoot);
  const actualBefore = wavePackage.files.map((filePath) => fs.readFileSync(filePath));
  const actualDigests = actualBefore.map((bytes) => sha256(bytes));
  const failAt = Math.ceil(wavePackage.files.length / 2);
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'week06-wave1-rollback-'));
  const files = wavePackage.fileRelativePaths.map((relativePath, index) => {
    const copiedPath = resolveRepositoryPath(
      temporaryRoot,
      relativePath,
      `Week06 Wave 1 rollback fixture ${relativePath}`
    );
    const prior = wavePackage.priorContents[index];
    if (prior !== null) {
      fs.mkdirSync(path.dirname(copiedPath), { recursive: true });
      fs.writeFileSync(copiedPath, prior);
    }
    return copiedPath;
  });
  try {
    let observedFailure;
    try {
      applyRollbackProjection({
        files,
        contents: wavePackage.contents,
        failAt
      });
    } catch (error) {
      observedFailure = error;
    }
    if (
      !observedFailure ||
      !new RegExp(`Projection failure at surface ${failAt}`).test(observedFailure.message)
    ) {
      throw new Error('Week06 Wave 1 partial-write failure was not observed');
    }
    let byteDrift = 0;
    let digestDrift = 0;
    let existingSurfaceCount = 0;
    let absentSurfaceCount = 0;
    files.forEach((filePath, index) => {
      const prior = wavePackage.priorContents[index];
      if (prior === null) {
        absentSurfaceCount += 1;
        if (fs.existsSync(filePath)) {
          byteDrift += 1;
          digestDrift += 1;
        }
        return;
      }
      existingSurfaceCount += 1;
      if (!fs.existsSync(filePath)) {
        byteDrift += 1;
        digestDrift += 1;
        return;
      }
      const restored = fs.readFileSync(filePath);
      const expected = Buffer.from(prior);
      if (!restored.equals(expected)) byteDrift += 1;
      if (sha256(restored) !== sha256(expected)) digestDrift += 1;
    });
    wavePackage.files.forEach((filePath, index) => {
      const current = fs.readFileSync(filePath);
      if (!current.equals(actualBefore[index])) byteDrift += 1;
      if (sha256(current) !== actualDigests[index]) digestDrift += 1;
    });
    if (byteDrift || digestDrift) {
      throw new Error(`Week06 Wave 1 rollback drift: bytes=${byteDrift} digests=${digestDrift}`);
    }
    return {
      restored: true,
      surfaceCount: wavePackage.files.length,
      existingSurfaceCount,
      absentSurfaceCount,
      byteDrift,
      digestDrift
    };
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

function verifyWeek06Wave1Export(repoRoot, options) {
  return delivery.verifyWeek06Wave1Export(repoRoot, options, verifyWeek06Wave1Source);
}

function verifyWeek06Wave1ExportFixtures(repoRoot) {
  return delivery.verifyWeek06Wave1ExportFixtures(repoRoot, verifyWeek06Wave1Source);
}

function verifyWeek06Wave1Live(repoRoot, options) {
  return delivery.verifyWeek06Wave1Live(repoRoot, options, verifyWeek06Wave1Source);
}

function writeWeek06Wave1ExportFixture(repoRoot, outDir, variant) {
  return delivery.writeWeek06Wave1ExportFixture(repoRoot, outDir, variant);
}

module.exports = {
  BASELINE_PAGE_COUNT,
  CONTRACT_RELATIVE_PATH,
  CONTENT_RELATIVE_PATH,
  EN_SEARCH_RELATIVE_PATH,
  MANIFEST_RELATIVE_PATH,
  PROJECTION_RELATIVE_PATH,
  REGISTRY_RELATIVE_PATH,
  RELEASE_RELATIVE_PATH,
  RESULTING_PAGE_COUNT,
  ROLLBACK_RELATIVE_PATH,
  SELECTION_RELATIVE_PATH,
  ZH_SEARCH_RELATIVE_PATH,
  buildWeek06Wave1Package,
  loadWeek06Wave1Contract,
  loadWeek06Wave1Selection,
  verifyWeek06Wave1Selection,
  verifyWeek06Wave1RollbackOnError,
  verifyWeek06Wave1Export,
  verifyWeek06Wave1ExportFixtures,
  verifyWeek06Wave1Live,
  verifyWeek06Wave1Source,
  writeWeek06Wave1ExportFixture,
  writeWeek06Wave1Package
};
