#!/usr/bin/env node

/** Verify the closed Week06 technical authority and its zero-page Wave0 release. */

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const EXPECTED = {
  candidates: 2034,
  locales: { en: 515, zh: 1519 },
  categories: {
    api: 31,
    compare: 3,
    deploy: 394,
    glossary: 280,
    integration: 45,
    model: 61,
    node: 51,
    troubleshoot: 992,
    tutorial: 177
  },
  relations: 6,
  relationPages: 11,
  accepted: 2031,
  denied: 3,
  failed: 137,
  gateFailed: 104,
  retirees: 33,
  unsupportedGlossary: 2158,
  baselinePages: 1172
};
const ARTIFACTS = [
  'week06-candidate-manifest.json',
  'week06-disposition-ledger.json',
  'week06-identity-ledger.json',
  'week06-security-ledger.json',
  'week06-operation-risk-ledger.json',
  'week06-duplicate-ledger.json',
  'week06-provenance.json',
  'week06-wave0-content.json',
  'week06-wave0-projection.json',
  'week06-wave0-selection.json',
  'week06-rollback.json',
  'week06-exclusion-ledger.json',
  'week06-compare-disposition.json'
];

function readJson(name, rootDir = ROOT) {
  return JSON.parse(
    fs.readFileSync(path.join(rootDir, 'src/content/tech-center/authority', name), 'utf8')
  );
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function assertDigest(value, label) {
  assert.match(value, /^[a-f0-9]{64}$/, `${label} must be a SHA-256 digest`);
}

function assertHttps(value, label) {
  assert.equal(typeof value, 'string', `${label} must be text`);
  assert.match(value, /^https:\/\/[^\s/]+(?:\/|$)/, `${label} must be a public HTTPS URL`);
}

function assertNoCredentialShape(value, label) {
  assert.doesNotMatch(value, /\bsk-[A-Za-z0-9][A-Za-z0-9_-]{5,}\b/i, label);
  assert.doesNotMatch(value, /\bBearer\s+(?!\[REDACTED_CREDENTIAL\])[A-Za-z0-9._~+/=-]{6,}/i, label);
  assert.doesNotMatch(value, /\beyJ[A-Za-z0-9._-]{20,}\b/, label);
}

function identityKey(identity) {
  return `${identity.locale}|${identity.canonicalPath}`;
}

function verifyCandidate(candidate, index, relationByCandidate) {
  const label = `candidate[${index}]`;
  assert.match(candidate.id, /^week06-\d{4}$/);
  assert.equal(candidate.identity.owner, candidate.identity.locale === 'zh' ? 'cn' : 'io');
  assert.match(candidate.identity.locale, /^(?:zh|en)$/);
  assert.match(candidate.identity.canonicalPath, /^\/[a-z0-9]+(?:[/-][a-z0-9]+)*$/);
  assert.equal(
    candidate.identity.sourcePath,
    `/${candidate.identity.locale}${candidate.identity.canonicalPath}`
  );
  assert.equal(candidate.action, candidate.category === 'compare' ? 'route-to-comparison' : 'add');
  assert.equal(
    candidate.finalDisposition,
    candidate.category === 'compare' ? 'denied' : 'accepted'
  );
  assert.equal(candidate.state, candidate.finalDisposition);
  assert.equal(candidate.decision.disposition, candidate.finalDisposition);
  assert.equal(candidate.decision.operation, candidate.action);
  assert.equal(candidate.input.integrityStatus, 'resolved');
  assert.match(
    candidate.provenance.sourceFile,
    /^(?:中文-fastgpt\.cn|英文-fastgpt\.io)\/[a-z0-9]+(?:[/-][a-z0-9]+)*\.md$/
  );
  assert.equal(candidate.sourceClassification.sourceUrl, candidate.provenance.sourceUrl);
  assert.equal(candidate.sourceClassification.sourceReference, candidate.provenance.sourceReference);
  assert.equal(typeof candidate.provenance.sourceReference, 'string');
  assert.equal(candidate.gates.security, 'passed');
  assert.equal(candidate.gates.operationRisk, 'passed');
  assert.equal(candidate.gates.readerBodyHygiene, 'passed');
  assertDigest(candidate.provenance.sourceSha256, `${label}.provenance.sourceSha256`);
  assertDigest(candidate.provenance.sourceBodySha256, `${label}.provenance.sourceBodySha256`);
  assertDigest(candidate.provenance.bodySha256, `${label}.provenance.bodySha256`);
  assertDigest(candidate.provenance.workbookSha256, `${label}.provenance.workbookSha256`);
  assert.equal(candidate.provenance.sourceBodySha256, candidate.provenance.bodySha256);
  assert.equal(candidate.provenance.workbookRow, candidate.workbookRow);
  assertNoCredentialShape(candidate.evidence.fingerprint, `${label}.evidence.fingerprint`);
  assert.equal(
    candidate.evidence.status,
    candidate.category === 'compare' ? 'needs-evidence' : 'verified'
  );
  if (candidate.category === 'compare') {
    assert.deepEqual(candidate.evidence.sources, []);
    assert.equal(candidate.sourceClassification.code, 'comparison-kb');
  } else {
    assert.equal(candidate.evidence.sources.length, 1);
    assertHttps(candidate.evidence.sources[0], `${label}.evidence.sources[0]`);
    assertHttps(candidate.provenance.sourceUrl, `${label}.provenance.sourceUrl`);
  }
  for (const finding of candidate.security.findings) {
    assert(['redacted', 'cleared', 'denied'].includes(finding.disposition));
    assertDigest(finding.fingerprint, `${label}.security.finding.fingerprint`);
    assert.equal(finding.replacement, '[REDACTED_CREDENTIAL]');
    assertNoCredentialShape(JSON.stringify(finding), `${label}.security.finding`);
  }
  for (const finding of candidate.operationRisk.findings) {
    assert(['denied', 'safeguarded', 'cleared'].includes(finding.disposition));
    assertDigest(finding.fingerprint, `${label}.operation.finding.fingerprint`);
    assertNoCredentialShape(JSON.stringify(finding), `${label}.operation.finding`);
  }
  const expectedRelations = relationByCandidate.get(candidate.id) || [];
  assert.deepEqual(
    candidate.relations.map((relation) => relation.id),
    expectedRelations.map((relation) => relation.id)
  );
}

function verifyArtifactDigests(release, rootDir = ROOT) {
  assert.deepEqual(
    release.artifacts.map((artifact) => artifact.path).sort(),
    ARTIFACTS.map((name) => `src/content/tech-center/authority/${name}`).sort()
  );
  release.artifacts.forEach((artifact) => {
    assertDigest(artifact.sha256, `${artifact.path}.sha256`);
    const filePath = path.join(rootDir, artifact.path);
    assert.equal(sha256(fs.readFileSync(filePath)), artifact.sha256, `${artifact.path} drift`);
  });
}

function verifyWeek06TechnicalAuthority(rootDir = ROOT) {
  const manifest = readJson('week06-candidate-manifest.json', rootDir);
  const disposition = readJson('week06-disposition-ledger.json', rootDir);
  const identity = readJson('week06-identity-ledger.json', rootDir);
  const security = readJson('week06-security-ledger.json', rootDir);
  const operationRisk = readJson('week06-operation-risk-ledger.json', rootDir);
  const duplicate = readJson('week06-duplicate-ledger.json', rootDir);
  const provenance = readJson('week06-provenance.json', rootDir);
  const content = readJson('week06-wave0-content.json', rootDir);
  const projection = readJson('week06-wave0-projection.json', rootDir);
  const selection = readJson('week06-wave0-selection.json', rootDir);
  const rollback = readJson('week06-rollback.json', rootDir);
  const exclusions = readJson('week06-exclusion-ledger.json', rootDir);
  const comparison = readJson('week06-compare-disposition.json', rootDir);
  const release = readJson('week06-wave0-release-manifest.json', rootDir);
  const canonicalRelease = readJson('week06-release-manifest.json', rootDir);

  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.batch, 'week06');
  assert.equal(manifest.status, 'closed');
  assert.equal(manifest.summary.candidateCount, EXPECTED.candidates);
  assert.deepEqual(manifest.summary.locales, EXPECTED.locales);
  assert.deepEqual(manifest.summary.categories, EXPECTED.categories);
  assert.deepEqual(manifest.summary.state, {
    accepted: EXPECTED.accepted,
    denied: EXPECTED.denied,
    pendingReview: 0,
    inputIntegrityQuarantine: 0
  });
  assert.deepEqual(manifest.summary.disposition, {
    accepted: EXPECTED.accepted,
    denied: EXPECTED.denied,
    comparisonRouted: EXPECTED.denied
  });
  assert.deepEqual(manifest.summary.exclusions, {
    failed: EXPECTED.failed,
    gateFailed: EXPECTED.gateFailed,
    mergedRetirees: EXPECTED.retirees,
    unsupportedGlossary: EXPECTED.unsupportedGlossary
  });
  assert.equal(manifest.summary.projectionCount, 0);
  assert.equal(manifest.summary.publicationCount, 0);
  assert.equal(manifest.summary.yaml.pass, 2028);
  assert.equal(manifest.summary.yaml.quarantined, 6);
  assert.equal(manifest.summary.yaml.resolved, 6);
  assert.equal(manifest.automatedGates.closure, 'governance-complete');
  assert.equal(manifest.automatedGates.securityScan, 'passed');
  assert.equal(manifest.automatedGates.operationRiskScan, 'passed');
  assert.equal(manifest.automatedGates.duplicateRetrieval, 'passed');
  assert.equal(manifest.automatedGates.readerBodyHygiene, 'passed');
  assert.equal(manifest.candidates.length, EXPECTED.candidates);

  const ids = new Set();
  const identities = new Set();
  const categoryCounts = {};
  const localeCounts = {};
  const relationByCandidate = new Map();
  manifest.relations.forEach((relation) => {
    assert.equal(relation.resolution, 'distinct');
    assert.equal(relation.relatedCandidateIds.length, 2);
    relation.relatedCandidateIds.forEach((candidateId) => {
      const list = relationByCandidate.get(candidateId) || [];
      list.push(relation);
      relationByCandidate.set(candidateId, list);
    });
  });
  manifest.candidates.forEach((candidate, index) => {
    verifyCandidate(candidate, index, relationByCandidate);
    assert(!ids.has(candidate.id), `duplicate candidate ID ${candidate.id}`);
    assert(
      !identities.has(identityKey(candidate.identity)),
      `duplicate identity ${identityKey(candidate.identity)}`
    );
    ids.add(candidate.id);
    identities.add(identityKey(candidate.identity));
    categoryCounts[candidate.category] = (categoryCounts[candidate.category] || 0) + 1;
    localeCounts[candidate.identity.locale] = (localeCounts[candidate.identity.locale] || 0) + 1;
  });
  assert.deepEqual(localeCounts, EXPECTED.locales);
  assert.deepEqual(categoryCounts, EXPECTED.categories);
  assertDigest(manifest.candidateManifestSha256, 'candidateManifestSha256');
  assert.equal(
    manifest.candidateManifestSha256,
    sha256(JSON.stringify(manifest.candidates)),
    'candidate manifest digest drift'
  );

  assert.equal(manifest.relations.length, EXPECTED.relations);
  assert.equal(
    new Set(manifest.relations.flatMap((relation) => relation.relatedCandidateIds)).size,
    EXPECTED.relationPages
  );
  assert.equal(duplicate.relationCount, EXPECTED.relations);
  assert.equal(duplicate.resolvedRelationCount, EXPECTED.relations);
  assert.equal(duplicate.unresolvedRelationCount, 0);
  duplicate.relations.forEach((relation) => {
    assert.equal(relation.resolution, 'distinct');
    relation.relatedCandidateIds.forEach((candidateId) => assert(ids.has(candidateId)));
  });

  assert.equal(disposition.candidateCount, EXPECTED.candidates);
  assert.equal(disposition.accepted.length, EXPECTED.accepted);
  assert.equal(disposition.denied.length, EXPECTED.denied);
  assert.deepEqual(disposition.pending, []);
  assert.equal(disposition.decisions.length, EXPECTED.candidates);
  assert.equal(identity.candidateCount, EXPECTED.candidates);
  assert.equal(identity.unresolvedCount, 0);
  assert.equal(identity.records.length, EXPECTED.candidates);
  assert.deepEqual(identity.conflicts, []);
  assert.equal(security.candidateCount, EXPECTED.candidates);
  assert.equal(security.unresolvedCount, 0);
  assert.equal(operationRisk.candidateCount, EXPECTED.candidates);
  assert.equal(operationRisk.unresolvedCount, 0);
  assert.equal(provenance.sources.length, EXPECTED.candidates);
  assert.equal(provenance.sourceSetSha256, manifest.provenance.sourceSetSha256);
  assert.equal(manifest.provenance.sourceSetSha256, manifest.closure.sourceSetSha256);
  assert.equal(
    provenance.sourceSetSha256,
    sha256(
      manifest.candidates
        .map((candidate) => `${candidate.id}|${candidate.provenance.sourceSha256}`)
        .join('\n')
    ),
    'source set digest drift'
  );
  const provenanceByCandidate = new Map(
    provenance.sources.map((source) => [source.candidateId, source])
  );
  assert.equal(provenanceByCandidate.size, EXPECTED.candidates);
  manifest.candidates.forEach((candidate) => {
    const source = provenanceByCandidate.get(candidate.id);
    assert(source, `missing provenance for ${candidate.id}`);
    assert.equal(source.workbookRow, candidate.workbookRow);
    assert.equal(source.sourceFile, candidate.provenance.sourceFile);
    assert.equal(source.sourceUrl, candidate.provenance.sourceUrl);
    assert.equal(source.sourceReference, candidate.provenance.sourceReference);
    assert.equal(source.sourceSha256, candidate.provenance.sourceSha256);
    assert.equal(source.bodySha256, candidate.provenance.sourceBodySha256);
  });

  assert.equal(exclusions.failedCount, EXPECTED.failed);
  assert.equal(exclusions.gateFailedCount, EXPECTED.gateFailed);
  assert.equal(exclusions.mergedRetireeCount, EXPECTED.retirees);
  assert.equal(exclusions.failed.length, EXPECTED.failed);
  assert.equal(exclusions.mergedRetirees.length, EXPECTED.retirees);
  assert.equal(exclusions.unsupportedGlossary.count, EXPECTED.unsupportedGlossary);
  assert(exclusions.failed.every((entry) => entry.disposition === 'denied'));
  assert(
    exclusions.mergedRetirees.every(
      (entry) => entry.reason === 'merged-into-retained-candidate'
    )
  );
  assert.equal(comparison.candidateCount, EXPECTED.denied);
  assert.equal(comparison.candidates.length, EXPECTED.denied);
  assert(comparison.candidates.every((entry) => entry.action === 'route-to-comparison'));
  assert(comparison.candidates.every((entry) => entry.disposition === 'excluded'));
  assert(comparison.candidates.every((entry) => entry.reason === 'comparison-candidate'));
  assert(comparison.candidates.every((entry) => entry.evidence === 'https://github.com/labring/fastgpt-home/issues/257'));

  assert.equal(content.status, 'governance-complete');
  assert.equal(content.readerCount, 0);
  assert.equal(content.publicationCount, 0);
  assert.deepEqual(content.sources, []);
  assert.equal(projection.status, 'empty');
  assert.equal(projection.mode, 'dry-run');
  assert.equal(projection.governanceStatus, 'governance-complete');
  assert.equal(projection.publicationCount, 0);
  assert.equal(projection.publicPageDelta, 0);
  assert.equal(projection.baselinePageCount, EXPECTED.baselinePages);
  assert.equal(projection.resultingPageCount, EXPECTED.baselinePages);
  assert.deepEqual(projection.identities, []);
  assert.deepEqual(selection.selected, []);
  assert.deepEqual(selection.projection, []);
  assert.equal(selection.status, 'closed');
  assert.equal(rollback.status, 'ready');
  assert.deepEqual(rollback.affectedIdentities, []);
  assert.equal(rollback.baseline.pageCount, EXPECTED.baselinePages);
  assert.equal(rollback.baseline.registrySha256, manifest.baseline.registrySha256);

  const baselineRegistry = path.join(rootDir, 'src/components/tech-center/entries.json');
  assert.equal(
    JSON.parse(fs.readFileSync(baselineRegistry, 'utf8')).length,
    EXPECTED.baselinePages
  );
  assert.equal(sha256(fs.readFileSync(baselineRegistry)), manifest.baseline.registrySha256);
  assert.equal(manifest.baseline.pageCount, EXPECTED.baselinePages);
  assert.equal(manifest.baseline.status, 'deployed-registry');
  assert.equal(
    manifest.baseline.authoritySha256,
    sha256(fs.readFileSync(path.join(rootDir, manifest.baseline.authorityPath)))
  );
  verifyArtifactDigests(release, rootDir);
  assert.deepEqual(canonicalRelease, release);
  assert.equal(release.status, 'closed');
  assert.equal(release.governanceStatus, 'governance-complete');
  assert.deepEqual(release.blockers, []);
  assert.equal(release.projection.mode, 'dry-run');
  assert.equal(release.projection.publicPageDelta, 0);
  assert.equal(release.projection.publicationCount, 0);
  assert.equal(release.projection.acceptedCandidateCount, EXPECTED.accepted);
  assert.equal(release.projection.excludedCandidateCount, EXPECTED.denied);
  assert.equal(release.baseline.registrySha256, manifest.baseline.registrySha256);
  assert.equal(release.baseline.releaseManifestSha256, manifest.baseline.releaseManifestSha256);
  assert.equal(release.baseline.authoritySha256, manifest.baseline.authoritySha256);

  return {
    candidates: EXPECTED.candidates,
    locales: EXPECTED.locales,
    accepted: EXPECTED.accepted,
    denied: EXPECTED.denied,
    relationPages: EXPECTED.relationPages,
    failed: EXPECTED.failed,
    projection: projection.publicationCount,
    baseline: EXPECTED.baselinePages
  };
}

if (require.main === module) {
  try {
    const result = verifyWeek06TechnicalAuthority();
    console.log(
      `[verify-week06-technical-authority] closed: candidates=${result.candidates} zh=${result.locales.zh} en=${result.locales.en} accepted=${result.accepted} denied=${result.denied} relationPages=${result.relationPages} excluded=${result.failed} projection=${result.projection} baseline=${result.baseline}`
    );
  } catch (error) {
    console.error(`[verify-week06-technical-authority] ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { verifyWeek06TechnicalAuthority };
