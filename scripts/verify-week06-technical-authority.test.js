const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

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
    baseline: 1172
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
