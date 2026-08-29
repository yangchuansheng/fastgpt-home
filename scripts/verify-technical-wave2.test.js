const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  WAVE_MAX_CANDIDATES,
  buildWavePackage,
  chooseWave2Candidates,
  loadWave2Selection,
  verifyWave2Source
} = require('./lib/technical-wave2');
const { parseArgs } = require('./verify-technical-wave2');
const { applyRollbackProjection, loadTechnicalAuthority } = require('./lib/technical-authority');
const { verifyProjectionConsistency } = require('./lib/technical-projection');

const ROOT = path.resolve(__dirname, '..');

function readRegistry() {
  return JSON.parse(
    fs.readFileSync(path.join(ROOT, 'src/components/tech-center/entries.json'), 'utf8')
  );
}

test('Wave 2 selection is bounded and passes every publication gate', () => {
  const authority = loadTechnicalAuthority(ROOT);
  const selection = loadWave2Selection(ROOT);
  const candidates = chooseWave2Candidates(authority, readRegistry(), selection, ROOT).candidates;

  assert.equal(candidates.length, 200);
  assert(candidates.length <= WAVE_MAX_CANDIDATES);
  assert.deepEqual(
    candidates.map((candidate) => candidate.id),
    selection.candidateIds
  );
  assert.equal(new Set(candidates.map((candidate) => candidate.id)).size, candidates.length);
  assert(candidates.every((candidate) => candidate.state === 'accepted'));
  assert(candidates.every((candidate) => candidate.decision.disposition === 'accepted'));
  assert(candidates.every((candidate) => candidate.decision.operation === 'add'));
  assert(candidates.every((candidate) => candidate.evidence.status === 'verified'));
  assert(candidates.every((candidate) => candidate.evidence.sources.length > 0));
  assert(candidates.every((candidate) => candidate.security.status !== 'needs-review'));
  assert(candidates.every((candidate) => candidate.operationRisk.level !== 'D0'));
  assert(candidates.every((candidate) => candidate.identity.locale === 'zh'));
});

test('Wave 2 package and source verification preserve one identity set', () => {
  const result = verifyWave2Source(ROOT);
  assert.equal(result.wave, 'wave-2');
  assert.equal(result.baselineWave, 'wave-1');
  assert.equal(result.selectedCount, 200);
  assert.equal(result.acceptedAdd, 200);
  assert.equal(result.acceptedUpdate, 0);
  assert.equal(result.baselinePageCount, 1172);
  assert.equal(result.resultingPageCount, 1372);
  assert.match(result.baselineRegistrySha256, /^[a-f0-9]{64}$/);
  assert.match(result.baselineSearchSha256, /^[a-f0-9]{64}$/);
  assert.match(result.sourceSetSha256, /^[a-f0-9]{64}$/);
  assert.equal(result.sourceVerified, true);
  assert.equal(result.exportVerified, false);
  assert.equal(result.releaseEligible, false);

  const wavePackage = buildWavePackage(ROOT);
  verifyProjectionConsistency(wavePackage.projection);
  const expectedKeys = wavePackage.projection.identities.map((identity) => identity.key).sort();
  for (const surface of [
    'registry',
    'search',
    'sitemap',
    'staticExport',
    'releaseRecord',
    'rollback'
  ]) {
    assert.deepEqual(
      wavePackage.projection[surface].map((entry) => entry.identity || entry.key).sort(),
      expectedKeys,
      surface
    );
  }
  assert.equal(wavePackage.entries.length, 1372);
  assert.equal(wavePackage.search.length, 1372);
});

test('Wave 2 CLI arguments keep source and export modes explicit', () => {
  assert.deepEqual(parseArgs([]), { export: false, outDir: null, variant: 'cn' });
  assert.deepEqual(parseArgs(['--export', '--variant', 'preview', '--out-dir', 'out']), {
    export: true,
    outDir: 'out',
    variant: 'preview'
  });
  assert.throws(() => parseArgs(['--out-dir', 'out']), /requires --export/);
  assert.throws(() => parseArgs(['--variant', 'invalid']), /must be cn, io, or preview/);
});

test('Wave 2 projection failure restores every staged surface', () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'technical-wave2-rollback-'));
  const files = ['registry', 'search', 'sitemap', 'static-export', 'release', 'rollback'].map(
    (surface) => path.join(temporaryRoot, `${surface}.json`)
  );
  const before = files.map((filePath) => {
    fs.writeFileSync(filePath, `baseline:${path.basename(filePath)}\n`);
    return fs.readFileSync(filePath);
  });

  try {
    assert.throws(
      () =>
        applyRollbackProjection({
          files,
          contents: files.map(() => Buffer.from('wave-2\n')),
          failAt: 4
        }),
      /Projection failure at surface 4/
    );
    files.forEach((filePath, index) => assert.deepEqual(fs.readFileSync(filePath), before[index]));
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
