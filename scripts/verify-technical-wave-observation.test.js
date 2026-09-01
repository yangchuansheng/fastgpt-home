const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

const {
  CAPACITY_RELATIVE_PATH,
  evaluateTechnicalWaveObservation,
  readTechnicalWaveObservation
} = require('./lib/technical-wave-observation');

const ROOT = path.resolve(__dirname, '..');
const retainedCapacityAuthority = require(`./fixtures/${path.basename(CAPACITY_RELATIVE_PATH)}`);

function passingCapacityAuthority() {
  const authority = structuredClone(retainedCapacityAuthority);
  authority.status = 'approved';
  authority.limits.maxWaveArtifactBytes = 3_000_000;
  authority.limits.maxSearchProjectionBytes = 900_000;
  authority.limits.maxStaticFileCount = 4_500;
  authority.limits.maxBuildDurationSeconds = 420;
  return authority;
}

function passingRecord() {
  const record = structuredClone(readTechnicalWaveObservation(ROOT));
  record.status = 'passed';
  record.deployedBaseline.status = 'production-observed';
  record.deployedBaseline.deployedRevision = record.deployedBaseline.candidateRevision;
  record.production.startedAt = '2026-08-01T00:00:00.000Z';
  record.production.endedAt = '2026-08-15T00:00:00.000Z';
  record.production.statusCounts = { 200: 200 };
  record.production.canonicalChecked = 200;
  record.production.sitemapMembership = 200;
  record.production.sitemapMissing = 0;
  record.production.crawlAnomalies = 0;
  record.search.startedAt = '2026-08-01T00:00:00.000Z';
  record.search.endedAt = '2026-08-15T00:00:00.000Z';
  record.search.source = 'google-search-console';
  record.search.metrics = {
    discovered: 200,
    indexed: 160,
    canonicalSelected: 160,
    duplicatePages: 0,
    excludedPages: 0,
    crawlAnomalies: 0
  };
  record.search.trends = [
    { capturedAt: record.search.startedAt, discovered: 0, indexed: 0 },
    { capturedAt: record.search.endedAt, discovered: 200, indexed: 160 }
  ];
  record.observedIssues = [];
  record.releaseVeto = { status: 'clear', unresolvedIssueIds: [] };
  record.capacity.status = 'passed';
  record.capacity.observed.initialJavaScriptGzipBytes = 1_743_000;
  record.capacity.observed.staticFileCount = 4_200;
  record.capacity.observed.buildDurationSeconds = 360;
  record.nextSlice.status = 'ticket-created';
  record.nextSlice.ticket = { issue: 999, label: 'ready-for-agent' };
  return record;
}

function blockerCodes(record, capacityAuthority = passingCapacityAuthority()) {
  return evaluateTechnicalWaveObservation(record, ROOT, { capacityAuthority }).blockers.map(
    ({ code }) => code
  );
}

test('retained observation truthfully blocks expansion and the CLI exits nonzero', () => {
  const result = evaluateTechnicalWaveObservation(readTechnicalWaveObservation(ROOT), ROOT);
  assert.equal(result.status, 'blocked');
  assert.equal(result.wavePageCount, 200);
  assert.equal(result.nextSliceCount, 200);
  assert(result.blockers.some(({ code }) => code === 'production-window-short'));
  assert(result.blockers.some(({ code }) => code === 'production-404-observed'));
  assert(result.blockers.some(({ code }) => code === 'search-window-short'));
  assert(result.blockers.some(({ code }) => code === 'release-veto-active'));
  assert(!result.blockers.some(({ code }) => code === 'blocker-disposition-missing'));

  const cli = spawnSync(process.execPath, ['scripts/verify-technical-wave-observation.js'], {
    cwd: ROOT,
    encoding: 'utf8'
  });
  assert.equal(cli.status, 1);
  assert.match(cli.stderr, /production-404-observed/);
  assert.match(cli.stdout, /TECHNICAL_WAVE_OBSERVATION_RESULT=/);
});

test('a complete healthy contract closes both windows and unlocks one bounded ticket', () => {
  const result = evaluateTechnicalWaveObservation(passingRecord(), ROOT, {
    capacityAuthority: passingCapacityAuthority()
  });
  assert.equal(result.status, 'passed');
  assert.deepEqual(result.blockers, []);
  assert.equal(result.productionHours, 14 * 24);
  assert.equal(result.searchHours, 14 * 24);
});

test('window, HTTP, and release-veto mutations block expansion', () => {
  const cases = [
    [
      'production-window-short',
      (record) => (record.production.endedAt = '2026-08-02T00:00:00.000Z')
    ],
    ['search-window-short', (record) => (record.search.endedAt = '2026-08-10T00:00:00.000Z')],
    [
      'production-404-observed',
      (record) => (record.production.statusCounts = { 200: 199, 404: 1 })
    ],
    [
      'production-5xx-observed',
      (record) => (record.production.statusCounts = { 200: 199, 500: 1 })
    ],
    [
      'release-veto-active',
      (record) => {
        record.observedIssues = [
          { id: 'test-veto', status: 'release-veto-open', disposition: 'Retest.' }
        ];
        record.releaseVeto = { status: 'active', unresolvedIssueIds: ['test-veto'] };
      }
    ]
  ];
  for (const [expected, mutate] of cases) {
    const record = passingRecord();
    mutate(record);
    assert(blockerCodes(record).includes(expected), expected);
  }
});

test('baseline, capacity, and rollback mutations keep the release frozen', () => {
  const cases = [
    [
      'deployed-registry-digest-drift',
      (record) => (record.deployedBaseline.registrySha256 = 'a'.repeat(64))
    ],
    [
      'capacity-searchProjectionBytes-exceeded',
      (_record, capacityAuthority) => (capacityAuthority.limits.maxSearchProjectionBytes = 1)
    ],
    [
      'capacity-staticFileCount-missing',
      (record) => (record.capacity.observed.staticFileCount = null)
    ],
    [
      'rollback-identity-digest-drift',
      (record) => (record.rollback.removedIdentitySetSha256 = 'b'.repeat(64))
    ],
    [
      'rollback-staticExport-evidence-drift',
      (record) => (record.rollback.surfaceIdentitySetSha256.staticExport = 'c'.repeat(64))
    ]
  ];
  for (const [expected, mutate] of cases) {
    const record = passingRecord();
    const capacityAuthority = passingCapacityAuthority();
    mutate(record, capacityAuthority);
    assert(blockerCodes(record, capacityAuthority).includes(expected), expected);
  }
});

test('authority statuses, sources, and origins reject contradictory records', () => {
  const cases = [
    ['deployed-status-invalid', (record) => (record.deployedBaseline.status = 'passed')],
    [
      'production-source-invalid',
      (record) => (record.production.ownerOrigin = 'https://example.com')
    ],
    ['search-source-invalid', (record) => (record.search.source = 'spreadsheet')],
    ['capacity-status-invalid', (record) => (record.capacity.status = 'unknown')],
    ['next-slice-status-invalid', (record) => (record.nextSlice.status = 'ready')]
  ];
  for (const [expected, mutate] of cases) {
    const record = passingRecord();
    mutate(record);
    assert(blockerCodes(record).includes(expected), expected);
  }
});

test('next slice rejects more than 200 candidates and a missing native block edge', () => {
  const oversized = passingRecord();
  oversized.nextSlice.candidateIds.push('week05-0465');
  oversized.nextSlice.selectedCount = oversized.nextSlice.candidateIds.length;
  assert(blockerCodes(oversized).includes('next-slice-capacity-invalid'));

  const missingBlock = passingRecord();
  delete missingBlock.nextSlice.block;
  assert(blockerCodes(missingBlock).includes('next-slice-native-block-missing'));
});
