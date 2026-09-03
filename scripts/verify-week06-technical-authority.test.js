const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { SCAN_PATH, verifyWeek06PrivacyScan } = require('./lib/week06-privacy-scan');
const { verifyWeek06TechnicalAuthority } = require('./verify-week06-technical-authority');

const ROOT = path.resolve(__dirname, '..');
const AUTHORITY_DIR = path.join(ROOT, 'src/content/tech-center/authority');

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(AUTHORITY_DIR, name), 'utf8'));
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

test('closed Week06 authority preserves the exact candidate and exclusion contract', () => {
  const result = verifyWeek06TechnicalAuthority(ROOT);
  const manifest = readJson('week06-candidate-manifest.json');
  const duplicate = readJson('week06-duplicate-ledger.json');
  const exclusions = readJson('week06-exclusion-ledger.json');
  const projection = readJson('week06-wave0-projection.json');

  assert.deepEqual(result, {
    candidates: 2034,
    locales: { en: 515, zh: 1519 },
    accepted: 2031,
    denied: 3,
    relationPages: 11,
    failed: 137,
    projection: 0,
    baseline: 1172,
    unresolved: {
      identity: 0,
      duplicate: 0,
      evidence: 0,
      credential: 0,
      privacy: 0,
      operationRisk: 0,
      comparisonRouting: 0,
      hygiene: 0
    },
    privacyScanSha256: 'ba257d22afeaa8aa61b4ef5123144a44b653c642876aa691e6fbcc95828fc1e3'
  });
  assert.equal(manifest.candidates.length, 2034);
  assert.equal(duplicate.relationCount, 6);
  assert.equal(
    new Set(manifest.relations.flatMap((relation) => relation.relatedCandidateIds)).size,
    11
  );
  assert.equal(exclusions.failedCount, 137);
  assert.equal(exclusions.gateFailedCount + exclusions.mergedRetireeCount, 137);
  assert.equal(projection.resultingPageCount, 1172);
  assert.equal(projection.publicationCount, 0);
});

test('Week06 release evidence remains byte-stable and matches every artifact digest', () => {
  const release = readJson('week06-wave0-release-manifest.json');
  const canonicalRelease = readJson('week06-release-manifest.json');

  assert.deepEqual(canonicalRelease, release);
  for (const artifact of release.artifacts) {
    const artifactPath = path.join(ROOT, artifact.path);
    assert.equal(sha256(fs.readFileSync(artifactPath)), artifact.sha256, `${artifact.path} drift`);
  }
});

test('Week06 privacy evidence rejects an unresolved reviewed finding', () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'week06-privacy-scan-'));
  try {
    const scan = JSON.parse(fs.readFileSync(SCAN_PATH, 'utf8'));
    scan.findings[0].disposition = 'pending-review';
    scan.unresolvedCount = 1;
    const scanPath = path.join(temporaryRoot, 'privacy-scan.json');
    fs.writeFileSync(scanPath, JSON.stringify(scan));
    assert.throws(() => verifyWeek06PrivacyScan(ROOT, scanPath), /unresolved privacy disposition/);

    const escaped = JSON.parse(fs.readFileSync(SCAN_PATH, 'utf8'));
    escaped.input.path = '../candidate-manifest.json';
    const escapedPath = path.join(temporaryRoot, 'escaped-privacy-scan.json');
    fs.writeFileSync(escapedPath, JSON.stringify(escaped));
    assert.throws(
      () => verifyWeek06PrivacyScan(ROOT, escapedPath),
      /privacy scan input escapes repository root/
    );
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
