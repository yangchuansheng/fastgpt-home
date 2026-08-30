const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');

const {
  CAPACITY_RELATIVE_PATH,
  OBSERVATION_RELATIVE_PATH,
  NEXT_WAVE_RELATIVE_PATH,
  evaluateWeek06Wave1Observation,
  readWeek06Wave1Observation,
  verifyWeek06Wave1Observation
} = require('./lib/week06-wave1-observation');

const ROOT = path.resolve(__dirname, '..');

test('Week06 Wave 1 observation records the unavailable deployment and blocks expansion', () => {
  const record = readWeek06Wave1Observation(ROOT);
  const result = evaluateWeek06Wave1Observation(record, ROOT);

  assert.equal(record.schemaVersion, 1);
  assert.equal(record.kind, 'week06-wave1-observation');
  assert.equal(record.issue, 267);
  assert.equal(record.wave, 'wave-1');
  assert.equal(result.status, 'blocked');
  assert.equal(result.wavePageCount, 50);
  assert.equal(result.productionObservedUrlCount, 50);
  assert.equal(result.production.statusCounts['404'], 50);
  assert.equal(result.production.sitemapMissing, 50);
  assert.equal(result.search.metricsByOwner.cn.discovered, null);
  assert.equal(result.search.metricsByOwner.io.discovered, null);
  assert(result.blockers.some(({ code }) => code === 'production-404-observed'));
  assert(result.blockers.some(({ code }) => code === 'search-source-not-provided'));
  assert(result.blockers.some(({ code }) => code === 'capacity-static-file-count-missing'));
  assert.equal(record.nextSlice.status, 'candidate-only');
  assert.equal(record.nextSlice.ticket, null);
});

test('Week06 Wave 1 observation freezes all 50 identities and reproducible artifacts', () => {
  const record = readWeek06Wave1Observation(ROOT);
  const result = evaluateWeek06Wave1Observation(record, ROOT);

  assert.match(result.identitySetSha256, /^[a-f0-9]{64}$/);
  assert.equal(result.baselinePageCount, 1422);
  assert.equal(result.releaseArtifactCount, 57);
  assert.equal(result.rollback.status, 'passed');
  assert.equal(result.nextSliceCount, 200);
  assert.equal(result.nextSlice.localeCounts.en, 200);
  assert.equal(result.nextSlice.gates.glossary, 'blocked');
  assert.equal(result.nextSlice.gates.githubTroubleshooting, 'blocked');
  assert.equal(result.nextSlice.gates.comparison, 'blocked');
  assert.equal(record.nextSlice.block.issue, 267);
  assert.equal(record.nextSlice.block.nativeEdge, 'blocks');
  assert.equal(record.artifacts.capacity.path, CAPACITY_RELATIVE_PATH);
  assert.equal(record.artifacts.nextWave.path, NEXT_WAVE_RELATIVE_PATH);
  assert.equal(
    OBSERVATION_RELATIVE_PATH,
    'src/content/tech-center/authority/week06-wave1-observation.json'
  );
});

test('Week06 Wave 1 observation rejects missing owner coverage, stale baseline, and expansion edge', () => {
  const cases = [
    ['production-url-coverage-incomplete', (record) => record.production.urls.pop()],
    [
      'baseline-identity-digest-drift',
      (record) => (record.deployedBaseline.identitySetSha256 = 'a'.repeat(64))
    ],
    [
      'production-owner-status-count-drift',
      (record) => (record.production.statusCountsByOwner.cn = { 200: 25 })
    ],
    [
      'capacity-wave0-digest-drift',
      (record) => (record.capacity.baseline.wave0Sha256 = 'b'.repeat(64))
    ],
    ['next-slice-native-block-missing', (record) => delete record.nextSlice.block]
  ];

  for (const [expected, mutate] of cases) {
    const record = structuredClone(readWeek06Wave1Observation(ROOT));
    mutate(record);
    const result = evaluateWeek06Wave1Observation(record, ROOT);
    assert(
      result.blockers.some(({ code }) => code === expected),
      expected
    );
  }
});

test('Week06 Wave 1 observation verifier keeps a blocked record explicit', () => {
  assert.throws(
    () => verifyWeek06Wave1Observation(ROOT),
    /production-404-observed|search-source-not-provided/
  );
});
