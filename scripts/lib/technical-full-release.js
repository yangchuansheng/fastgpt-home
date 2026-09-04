const fs = require('node:fs');
const path = require('node:path');

const {
  fileSha256,
  identityKey,
  loadTechnicalAuthority,
  sha256,
  stableJson,
  validateTechnicalAuthority,
  verifyPersistedArtifacts
} = require('./technical-authority');
const { loadTechnicalWaveState } = require('./technical-wave-baseline');
const { looseFrontMatter } = require('./week06-technical-candidate');
const { verifyWeek06TechnicalAuthority } = require('../verify-week06-technical-authority');

const FULL_RELEASE_RELATIVE_PATH =
  'src/content/tech-center/authority/full-release-identity-closure.json';
const FULL_RELEASE_IMPORT_MANIFEST_RELATIVE_PATH =
  'src/content/tech-center/authority/full-release-import-manifest.json';
const REGISTRY_RELATIVE_PATH = 'src/components/tech-center/entries.json';
const W5_AUTHORITY_RELATIVE_PATH = 'src/content/tech-center/authority/week05-authority.json';
const W6_AUTHORITY_RELATIVE_PATH =
  'src/content/tech-center/authority/week06-candidate-manifest.json';
const BASELINE_PAGE_COUNT = 1422;
const PENDING_PAGE_COUNT = 2585;
const TARGET_PAGE_COUNT = 4007;
const EXPECTED_BATCHES = Object.freeze({
  W5: Object.freeze({ accepted: 854, published: 250, pending: 604 }),
  W6: Object.freeze({ accepted: 2031, published: 50, pending: 1981 })
});
const RECORD_FIELDS = [
  'batch',
  'authorityId',
  'identityKey',
  'locale',
  'canonicalPath',
  'category',
  'sourceFile',
  'sourceUrl',
  'sourceSha256',
  'bodySha256'
];
const BATCHES = ['W5', 'W6'];

function readJson(repoRoot, relativePath) {
  const filePath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(filePath))
    throw new Error(`Required closure input is missing: ${relativePath}`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function extractSourceRootArgs(argv) {
  const options = {
    w5SourceRoot: process.env.WEEK05_TECHNICAL_SOURCE_ROOT,
    w6SourceRoot: process.env.WEEK06_TECHNICAL_SOURCE_ROOT
  };
  const remaining = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (
      token === '--w5-source-root' ||
      token === '--w5-source' ||
      token === '--w6-source-root' ||
      token === '--w6-source'
    ) {
      const value = argv[++index];
      if (!value || value.startsWith('--')) throw new Error(`${token} requires a directory`);
      options[token.includes('w5') ? 'w5SourceRoot' : 'w6SourceRoot'] = value;
    } else {
      remaining.push(token);
    }
  }
  if (
    (options.w5SourceRoot && !options.w6SourceRoot) ||
    (!options.w5SourceRoot && options.w6SourceRoot)
  ) {
    throw new Error('W5 and W6 source roots must be provided together');
  }
  return { options, remaining };
}

function assertDigest(value, label) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`${label} must be a lowercase SHA-256 digest`);
  }
}

function assertText(value, label) {
  if (typeof value !== 'string' || !value.trim())
    throw new Error(`${label} must be non-empty text`);
}

function assertHttps(value, label) {
  assertText(value, label);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be an absolute HTTPS URL`);
  }
  if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) {
    throw new Error(`${label} must be a public HTTPS URL`);
  }
}

function assertCount(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
}

function parseEntryIdentity(entry, index) {
  assertText(entry?.slug, `registry.entries[${index}].slug`);
  const match = entry.slug.match(/^\/([^/]+)(\/.*)$/);
  if (!match)
    throw new Error(`Invalid technical registry identity at index ${index}: ${entry.slug}`);
  return { locale: match[1], canonicalPath: match[2] };
}

function createRegistry(registry) {
  if (!Array.isArray(registry)) throw new Error('Technical registry must be an array');
  const entriesByIdentity = new Map();
  registry.forEach((entry, index) => {
    const identity = parseEntryIdentity(entry, index);
    const key = identityKey(identity);
    if (entriesByIdentity.has(key))
      throw new Error(`Technical registry identity collision: ${key}`);
    entriesByIdentity.set(key, { entry, identity });
  });
  return { entries: registry, entriesByIdentity };
}

function loadRegistry(repoRoot) {
  return createRegistry(readJson(repoRoot, REGISTRY_RELATIVE_PATH));
}

function loadClosureRegistry(repoRoot, replayedState) {
  const manifestPath = path.join(repoRoot, FULL_RELEASE_IMPORT_MANIFEST_RELATIVE_PATH);
  if (!fs.existsSync(manifestPath)) return loadRegistry(repoRoot);
  const fullReleaseImport = readJson(repoRoot, FULL_RELEASE_IMPORT_MANIFEST_RELATIVE_PATH);
  if (
    fullReleaseImport.status === 'repository-consistent' &&
    fullReleaseImport.counts?.total === TARGET_PAGE_COUNT
  ) {
    return createRegistry(replayedState.entries);
  }
  return loadRegistry(repoRoot);
}

function validateCandidateForClosure(candidate, batch, index) {
  const label = `${batch}.accepted[${index}]`;
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new Error(`${label} must be an object`);
  }
  assertText(candidate.id, `${label}.id`);
  assertText(candidate.identity?.locale, `${label}.identity.locale`);
  assertText(candidate.identity?.canonicalPath, `${label}.identity.canonicalPath`);
  if (!['en', 'zh'].includes(candidate.identity.locale)) {
    throw new Error(`${label}.identity.locale is outside the release scope`);
  }
  if (
    !/^\/[a-z0-9]+(?:[/-][a-z0-9]+)*$/.test(candidate.identity.canonicalPath) ||
    candidate.identity.canonicalPath !== candidate.identity.canonicalPath.toLowerCase()
  ) {
    throw new Error(`${label}.identity.canonicalPath must be a normalized lowercase path`);
  }
  assertText(candidate.category, `${label}.category`);
  assertText(candidate.provenance?.sourceFile, `${label}.provenance.sourceFile`);
  assertHttps(candidate.provenance?.sourceUrl, `${label}.provenance.sourceUrl`);
  assertDigest(candidate.provenance?.sourceSha256, `${label}.provenance.sourceSha256`);
  const bodySha256 = candidate.provenance.bodySha256 || candidate.provenance.sourceBodySha256;
  assertDigest(bodySha256, `${label}.provenance.bodySha256`);
  if (candidate.state !== 'accepted' || candidate.decision?.disposition !== 'accepted') {
    throw new Error(`${label} must be a final accepted decision`);
  }
  if (candidate.decision.operation !== 'add') {
    throw new Error(`${label} must use the append-only add operation`);
  }
  return {
    batch,
    authorityId: candidate.id,
    identityKey: identityKey(candidate.identity),
    locale: candidate.identity.locale,
    canonicalPath: candidate.identity.canonicalPath,
    category: candidate.category,
    sourceFile: candidate.provenance.sourceFile,
    sourceUrl: candidate.provenance.sourceUrl,
    sourceSha256: candidate.provenance.sourceSha256,
    bodySha256
  };
}

function getAcceptedCandidates(authority, batch) {
  if (batch === 'W5') {
    const candidatesById = new Map(
      authority.candidates.map((candidate) => [candidate.id, candidate])
    );
    return authority.final.accepted.map((candidateId) => {
      const candidate = candidatesById.get(candidateId);
      if (!candidate) throw new Error(`W5 accepted authority id is missing: ${candidateId}`);
      return candidate;
    });
  }
  return authority.candidates.filter((candidate) => candidate.state === 'accepted');
}

function loadAndValidateAuthorities(repoRoot) {
  const w5 = loadTechnicalAuthority(repoRoot);
  validateTechnicalAuthority(w5, {
    repoRoot,
    verifyHistory: true,
    verifyArtifacts: true
  });
  verifyPersistedArtifacts(w5, repoRoot);
  const w6Result = verifyWeek06TechnicalAuthority(repoRoot);
  const w6 = readJson(repoRoot, W6_AUTHORITY_RELATIVE_PATH);
  if (w6Result.accepted !== EXPECTED_BATCHES.W6.accepted) {
    throw new Error(`W6 accepted count changed: ${w6Result.accepted}`);
  }
  return {
    W5: getAcceptedCandidates(w5, 'W5'),
    W6: getAcceptedCandidates(w6, 'W6')
  };
}

function buildBatchRecords(batch, candidates) {
  const records = candidates.map((candidate, index) =>
    validateCandidateForClosure(candidate, batch, index)
  );
  const identities = new Set();
  for (const record of records) {
    if (identities.has(record.identityKey)) {
      throw new Error(`${batch} accepted identity collision: ${record.identityKey}`);
    }
    identities.add(record.identityKey);
  }
  return records;
}

function buildEvidence() {
  return { missing: [], drift: [], crossBatchConflicts: [] };
}

function compareRegistryToReplay(registry, replayedState, evidence) {
  const replayedByIdentity = new Map(
    replayedState.entries.map((entry, index) => {
      const identity = parseEntryIdentity(entry, index);
      return [identityKey(identity), entry];
    })
  );
  for (const identity of replayedByIdentity.keys()) {
    if (!registry.entriesByIdentity.has(identity)) {
      evidence.missing.push({ kind: 'published-registry-identity', identityKey: identity });
    }
  }
  for (const identity of registry.entriesByIdentity.keys()) {
    if (!replayedByIdentity.has(identity)) {
      evidence.drift.push({
        kind: 'unexpected-published-registry-identity',
        identityKey: identity
      });
    }
  }
  const observedDigest = sha256(stableJson(registry.entries));
  const replayedDigest = sha256(stableJson(replayedState.entries));
  if (observedDigest !== replayedDigest) {
    evidence.drift.push({
      kind: 'registry-replay',
      expectedSha256: replayedDigest,
      observedSha256: observedDigest,
      expectedPageCount: replayedState.entries.length,
      observedPageCount: registry.entries.length
    });
  }
}

function comparePublishedMetadata(records, registry, evidence) {
  for (const record of records) {
    const published = registry.entriesByIdentity.get(record.identityKey);
    if (!published) continue;
    const drift = {};
    if (published.entry.category !== record.category) {
      drift.category = { expected: record.category, observed: published.entry.category };
    }
    if (Object.keys(drift).length) {
      evidence.drift.push({
        kind: 'published-entry-metadata',
        batch: record.batch,
        authorityId: record.authorityId,
        identityKey: record.identityKey,
        fields: drift
      });
    }
  }
}

function collectCrossBatchConflicts(w5Records, w6Records) {
  const w5ByIdentity = new Map(w5Records.map((record) => [record.identityKey, record]));
  return w6Records
    .filter((record) => w5ByIdentity.has(record.identityKey))
    .map((record) => ({
      identityKey: record.identityKey,
      W5: w5ByIdentity.get(record.identityKey).authorityId,
      W6: record.authorityId
    }));
}

function identitySetSha256(records) {
  return sha256(stableJson(records.map((record) => record.identityKey).sort()));
}

function buildClosure(repoRoot = path.resolve(__dirname, '../..')) {
  const authorities = loadAndValidateAuthorities(repoRoot);
  const replayedState = loadTechnicalWaveState(repoRoot, 'week06-wave1');
  const registry = loadClosureRegistry(repoRoot, replayedState);
  const evidence = buildEvidence();
  compareRegistryToReplay(registry, replayedState, evidence);

  const allRecords = {};
  for (const batch of BATCHES) {
    allRecords[batch] = buildBatchRecords(batch, authorities[batch]);
    comparePublishedMetadata(allRecords[batch], registry, evidence);
  }
  const crossBatchConflicts = collectCrossBatchConflicts(allRecords.W5, allRecords.W6);
  evidence.crossBatchConflicts.push(...crossBatchConflicts);

  const batches = {};
  const pendingRecords = [];
  for (const batch of BATCHES) {
    const expected = EXPECTED_BATCHES[batch];
    const acceptedRecords = allRecords[batch];
    const publishedRecords = acceptedRecords.filter((record) =>
      registry.entriesByIdentity.has(record.identityKey)
    );
    const pending = acceptedRecords.filter(
      (record) => !registry.entriesByIdentity.has(record.identityKey)
    );
    if (acceptedRecords.length !== expected.accepted) {
      evidence.drift.push({
        kind: 'accepted-count',
        batch,
        expected: expected.accepted,
        observed: acceptedRecords.length
      });
    }
    if (publishedRecords.length !== expected.published || pending.length !== expected.pending) {
      evidence.drift.push({
        kind: 'batch-closure-count',
        batch,
        expected: { published: expected.published, pending: expected.pending },
        observed: { published: publishedRecords.length, pending: pending.length }
      });
    }
    batches[batch] = {
      authorityId: batch === 'W5' ? 'week05' : 'week06',
      authorityPath: batch === 'W5' ? W5_AUTHORITY_RELATIVE_PATH : W6_AUTHORITY_RELATIVE_PATH,
      authoritySha256: fileSha256(
        path.join(
          repoRoot,
          batch === 'W5' ? W5_AUTHORITY_RELATIVE_PATH : W6_AUTHORITY_RELATIVE_PATH
        )
      ),
      accepted: acceptedRecords.length,
      published: publishedRecords.length,
      pending: pending.length,
      acceptedIdentitySetSha256: identitySetSha256(acceptedRecords),
      pendingIdentitySetSha256: identitySetSha256(pending),
      pendingCategories: pending.reduce(
        (counts, record) => ({ ...counts, [record.category]: (counts[record.category] || 0) + 1 }),
        {}
      )
    };
    pendingRecords.push(...pending);
  }

  if (pendingRecords.length !== PENDING_PAGE_COUNT) {
    evidence.drift.push({
      kind: 'pending-count',
      expected: PENDING_PAGE_COUNT,
      observed: pendingRecords.length
    });
  }

  const blocked =
    evidence.missing.length || evidence.drift.length || evidence.crossBatchConflicts.length;

  return {
    schemaVersion: 1,
    issue: {
      number: 274,
      url: 'https://github.com/labring/fastgpt-home/issues/274'
    },
    status: blocked ? 'blocked' : 'closed',
    publicationUnit: 'technical-full-release',
    sourceContract: {
      digestAlgorithm: 'sha256',
      W5: { sourceNormalization: 'raw UTF-8 file', bodyDigest: 'source-file digest' },
      W6: {
        sourceNormalization: 'UTF-8 text with CRLF/CR normalized to LF',
        bodyDigest: 'content after front matter'
      }
    },
    baseline: {
      pageCount: registry.entries.length,
      registryPath: REGISTRY_RELATIVE_PATH,
      registrySha256: sha256(stableJson(registry.entries)),
      identitySetSha256: identitySetSha256(
        [...registry.entriesByIdentity.keys()].map((key) => ({ identityKey: key }))
      ),
      replayedThrough: 'week06-wave1'
    },
    batches,
    counts: {
      baseline: BASELINE_PAGE_COUNT,
      pending: pendingRecords.length,
      target: BASELINE_PAGE_COUNT + pendingRecords.length
    },
    evidence,
    recordsSha256: sha256(stableJson(pendingRecords)),
    records: pendingRecords
  };
}

function validateRecord(record, index) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new Error(`closure.records[${index}] must be an object`);
  }
  if (JSON.stringify(Object.keys(record).sort()) !== JSON.stringify([...RECORD_FIELDS].sort())) {
    throw new Error(`closure.records[${index}] field set changed`);
  }
  if (!BATCHES.includes(record.batch))
    throw new Error(`closure.records[${index}].batch is unsupported`);
  assertText(record.authorityId, `closure.records[${index}].authorityId`);
  assertText(record.identityKey, `closure.records[${index}].identityKey`);
  assertText(record.locale, `closure.records[${index}].locale`);
  assertText(record.canonicalPath, `closure.records[${index}].canonicalPath`);
  assertText(record.category, `closure.records[${index}].category`);
  assertText(record.sourceFile, `closure.records[${index}].sourceFile`);
  assertHttps(record.sourceUrl, `closure.records[${index}].sourceUrl`);
  assertDigest(record.sourceSha256, `closure.records[${index}].sourceSha256`);
  assertDigest(record.bodySha256, `closure.records[${index}].bodySha256`);
  if (record.identityKey !== identityKey(record)) {
    throw new Error(`closure.records[${index}] identity key drift`);
  }
}

function validateClosureArtifact(closure) {
  if (!closure || typeof closure !== 'object' || Array.isArray(closure)) {
    throw new Error('Technical full-release closure must be an object');
  }
  if (closure.schemaVersion !== 1 || !['closed', 'blocked'].includes(closure.status)) {
    throw new Error('Technical full-release closure header changed');
  }
  if (closure.issue?.number !== 274) throw new Error('Technical full-release issue number changed');
  if (closure.publicationUnit !== 'technical-full-release') {
    throw new Error('Technical full-release publication unit changed');
  }
  assertCount(closure.baseline?.pageCount, 'closure.baseline.pageCount');
  assertDigest(closure.baseline.registrySha256, 'closure.baseline.registrySha256');
  assertDigest(closure.baseline.identitySetSha256, 'closure.baseline.identitySetSha256');
  if (closure.baseline.replayedThrough !== 'week06-wave1') {
    throw new Error('Technical full-release replay boundary changed');
  }
  for (const batch of BATCHES) {
    const expected = EXPECTED_BATCHES[batch];
    const observed = closure.batches?.[batch];
    if (!observed) throw new Error(`Technical full-release ${batch} batch record is missing`);
    for (const field of ['accepted', 'published', 'pending']) {
      assertCount(observed[field], `closure.batches.${batch}.${field}`);
      if (closure.status === 'closed' && observed[field] !== expected[field]) {
        throw new Error(`Technical full-release ${batch}.${field} changed`);
      }
    }
    if (observed.accepted !== observed.published + observed.pending) {
      throw new Error(`Technical full-release ${batch} count invariant changed`);
    }
    assertDigest(observed.authoritySha256, `closure.batches.${batch}.authoritySha256`);
    assertDigest(
      observed.acceptedIdentitySetSha256,
      `closure.batches.${batch}.acceptedIdentitySetSha256`
    );
    assertDigest(
      observed.pendingIdentitySetSha256,
      `closure.batches.${batch}.pendingIdentitySetSha256`
    );
  }
  if (!closure.counts || closure.counts.baseline !== closure.baseline.pageCount) {
    throw new Error('Technical full-release count contract changed');
  }
  if (
    closure.counts.pending !== closure.records?.length ||
    closure.counts.target !== closure.counts.baseline + closure.counts.pending
  ) {
    throw new Error('Technical full-release count invariant changed');
  }
  if (
    closure.status === 'closed' &&
    (closure.counts.baseline !== BASELINE_PAGE_COUNT ||
      closure.counts.pending !== PENDING_PAGE_COUNT ||
      closure.counts.target !== TARGET_PAGE_COUNT)
  ) {
    throw new Error('Technical full-release count contract changed');
  }
  if (!Array.isArray(closure.records)) {
    throw new Error('Technical full-release pending record count changed');
  }
  const identities = new Set();
  const batchCounts = { W5: 0, W6: 0 };
  closure.records.forEach((record, index) => {
    validateRecord(record, index);
    if (closure.status === 'closed' && identities.has(record.identityKey)) {
      throw new Error(`Technical full-release pending identity collision: ${record.identityKey}`);
    }
    identities.add(record.identityKey);
    batchCounts[record.batch] += 1;
  });
  if (
    batchCounts.W5 !== closure.batches.W5.pending ||
    batchCounts.W6 !== closure.batches.W6.pending
  ) {
    throw new Error(
      `Technical full-release pending batch counts changed: ${JSON.stringify(batchCounts)}`
    );
  }
  assertDigest(closure.recordsSha256, 'closure.recordsSha256');
  if (closure.recordsSha256 !== sha256(stableJson(closure.records))) {
    throw new Error('Technical full-release records digest changed');
  }
  for (const name of ['missing', 'drift', 'crossBatchConflicts']) {
    if (!Array.isArray(closure.evidence?.[name])) {
      throw new Error(`Technical full-release evidence.${name} must be an array`);
    }
  }
  const findingCount = ['missing', 'drift', 'crossBatchConflicts'].reduce(
    (count, name) => count + closure.evidence[name].length,
    0
  );
  if (
    (closure.status === 'closed' && findingCount) ||
    (closure.status === 'blocked' && !findingCount)
  ) {
    throw new Error('Technical full-release status does not match its evidence');
  }
  return closure;
}

function resolveSourceRoot(sourceRoot, batch, sourceFile) {
  const root = path.resolve(sourceRoot);
  const candidates = [
    root,
    path.join(root, batch === 'W5' ? '程序化技术页-第3批' : '程序化技术页-第4批')
  ];
  for (const candidate of candidates) {
    const sourcePath = path.resolve(candidate, sourceFile);
    if (sourcePath === candidate || !sourcePath.startsWith(`${candidate}${path.sep}`)) {
      throw new Error(`${batch} source file escapes the source root: ${sourceFile}`);
    }
    if (fs.existsSync(sourcePath)) return candidate;
  }
  return candidates[0];
}

function verifySourceRecords(records, { w5SourceRoot, w6SourceRoot } = {}) {
  const roots = { W5: w5SourceRoot, W6: w6SourceRoot };
  const provided = BATCHES.filter((batch) => roots[batch]);
  if (!provided.length) {
    return {
      mode: 'authority-recorded',
      recorded: records.length,
      requested: 0,
      verified: 0,
      missing: [],
      drift: []
    };
  }
  if (provided.length !== BATCHES.length) {
    throw new Error('Source digest verification requires both W5 and W6 source roots');
  }
  const result = {
    mode: 'external-source-root',
    recorded: records.length,
    requested: records.length,
    verified: 0,
    missing: [],
    drift: []
  };
  const resolvedRoots = {
    W5: resolveSourceRoot(
      w5SourceRoot,
      'W5',
      records.find((record) => record.batch === 'W5').sourceFile
    ),
    W6: resolveSourceRoot(
      w6SourceRoot,
      'W6',
      records.find((record) => record.batch === 'W6').sourceFile
    )
  };
  for (const record of records) {
    const sourceRoot = resolvedRoots[record.batch];
    const sourcePath = path.resolve(sourceRoot, record.sourceFile);
    if (sourcePath === sourceRoot || !sourcePath.startsWith(`${sourceRoot}${path.sep}`)) {
      result.missing.push({ ...record, reason: 'source-path-escape' });
      continue;
    }
    if (!fs.existsSync(sourcePath)) {
      result.missing.push({
        batch: record.batch,
        authorityId: record.authorityId,
        sourceFile: record.sourceFile,
        reason: 'missing-source'
      });
      continue;
    }
    const raw = fs.readFileSync(sourcePath);
    const source = record.batch === 'W6' ? raw.toString('utf8').replace(/\r\n?/g, '\n') : raw;
    const sourceDigest = sha256(source);
    const body = record.batch === 'W6' ? looseFrontMatter(source).body : source;
    const bodyDigest = sha256(body);
    if (sourceDigest !== record.sourceSha256 || bodyDigest !== record.bodySha256) {
      result.drift.push({
        batch: record.batch,
        authorityId: record.authorityId,
        sourceFile: record.sourceFile,
        expected: { sourceSha256: record.sourceSha256, bodySha256: record.bodySha256 },
        observed: { sourceSha256: sourceDigest, bodySha256: bodyDigest },
        reason: 'source-digest-drift'
      });
      continue;
    }
    result.verified += 1;
  }
  return result;
}

function addSourceEvidence(closure, sourceVerification) {
  closure.evidence.missing.push(
    ...sourceVerification.missing.map((finding) => ({ kind: 'body-source', ...finding }))
  );
  closure.evidence.drift.push(
    ...sourceVerification.drift.map((finding) => ({ kind: 'body-source', ...finding }))
  );
  if (sourceVerification.missing.length || sourceVerification.drift.length) {
    closure.status = 'blocked';
  }
  return closure;
}

function verifyTechnicalFullRelease(
  repoRoot = path.resolve(__dirname, '../..'),
  { w5SourceRoot, w6SourceRoot, artifactPath } = {}
) {
  const expected = buildClosure(repoRoot);
  const closurePath = artifactPath || path.join(repoRoot, FULL_RELEASE_RELATIVE_PATH);
  if (!fs.existsSync(closurePath))
    throw new Error(`Technical full-release closure is missing: ${closurePath}`);
  const observed = JSON.parse(fs.readFileSync(closurePath, 'utf8'));
  validateClosureArtifact(observed);
  if (stableJson(observed) !== stableJson(expected)) {
    throw new Error(
      `Technical full-release closure drift: ${JSON.stringify({
        expectedStatus: expected.status,
        expectedEvidence: expected.evidence,
        expectedRecordsSha256: expected.recordsSha256,
        observedStatus: observed.status,
        observedRecordsSha256: observed.recordsSha256
      })}`
    );
  }
  const sourceVerification = verifySourceRecords(observed.records, { w5SourceRoot, w6SourceRoot });
  if (
    observed.status === 'blocked' ||
    sourceVerification.missing.length ||
    sourceVerification.drift.length
  ) {
    throw new Error(
      `Technical full-release evidence is unresolved: ${JSON.stringify({
        closure: observed.evidence,
        sources: sourceVerification
      })}`
    );
  }
  return {
    baseline: observed.counts.baseline,
    W5: observed.batches.W5,
    W6: observed.batches.W6,
    pending: observed.counts.pending,
    target: observed.counts.target,
    recordsSha256: observed.recordsSha256,
    evidence: observed.evidence,
    sourceVerification
  };
}

function writeClosureArtifact(repoRoot, closure) {
  validateClosureArtifact(closure);
  const filePath = path.join(repoRoot, FULL_RELEASE_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, stableJson(closure));
  return filePath;
}

module.exports = {
  BASELINE_PAGE_COUNT,
  EXPECTED_BATCHES,
  FULL_RELEASE_RELATIVE_PATH,
  PENDING_PAGE_COUNT,
  TARGET_PAGE_COUNT,
  addSourceEvidence,
  buildClosure,
  collectCrossBatchConflicts,
  extractSourceRootArgs,
  identitySetSha256,
  validateClosureArtifact,
  verifySourceRecords,
  verifyTechnicalFullRelease,
  writeClosureArtifact
};
