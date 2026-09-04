const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  isCapacityReportReady,
  summarizeExport,
  validateCapacityReport
} = require('./lib/technical-full-release-capacity');
const { buildReaderPage } = require('./lib/technical-wave');
const {
  captureVariant,
  parseArgs,
  sanitizeFailure
} = require('./verify-technical-full-release-capacity');

test('capacity runner requires both frozen source roots', () => {
  assert.throws(() => parseArgs([]), /source roots are required/);
  assert.deepEqual(
    parseArgs(['--w5-source-root', '/w5', '--w6-source-root', '/w6', '--report', '/report']),
    {
      mode: 'run',
      w5SourceRoot: '/w5',
      w6SourceRoot: '/w6',
      report: '/report'
    }
  );
});

test('committed capacity evidence stays bound to the current closure', () => {
  const root = path.resolve(__dirname, '..');
  const report = JSON.parse(
    fs.readFileSync(
      path.join(root, 'scripts/fixtures/technical-authority/full-release-capacity.json')
    )
  );
  validateCapacityReport(report, root);
  const mutated = structuredClone(report);
  mutated.projection.pages += 1;
  assert.throws(() => validateCapacityReport(mutated, root), /projection drift/);
});

test('stale capacity measurements require the rerun blocker and keep release unsafe', () => {
  const root = path.resolve(__dirname, '..');
  const report = JSON.parse(
    fs.readFileSync(
      path.join(root, 'scripts/fixtures/technical-authority/full-release-capacity.json')
    )
  );
  validateCapacityReport(report, root);

  const digestDrift = structuredClone(report);
  digestDrift.measurementBinding.currentRecordsSha256 = '0'.repeat(64);
  assert.throws(() => validateCapacityReport(digestDrift, root), /current digest drift/);

  const missingBlocker = structuredClone(report);
  missingBlocker.decision.blockers = missingBlocker.decision.blockers.filter(
    (blocker) => blocker !== 'capacity-rerun-required-after-source-normalization'
  );
  assert.throws(() => validateCapacityReport(missingBlocker, root), /rerun blocker is missing/);

  const safeStale = structuredClone(report);
  safeStale.decision = { safeOneShotFullRelease: true, blockers: [] };
  assert.throws(() => validateCapacityReport(safeStale, root), /stale measurement cannot be safe/);
});

test('capacity decisions reject a safe report with failed variant measurements', () => {
  const root = path.resolve(__dirname, '..');
  const report = JSON.parse(
    fs.readFileSync(
      path.join(root, 'scripts/fixtures/technical-authority/full-release-capacity.json')
    )
  );
  const forged = structuredClone(report);
  forged.measurementBinding = {
    ...forged.measurementBinding,
    measuredRecordsSha256: forged.measurementBinding.currentRecordsSha256,
    status: 'current',
    rerunRequired: false
  };
  forged.decision = { safeOneShotFullRelease: true, blockers: [] };
  assert.throws(() => validateCapacityReport(forged, root), /decision blockers drift/);
  assert.equal(isCapacityReportReady(report), false);
});

test('capacity projections use the canonical Wave 1 page builder', () => {
  const authority = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, '..', 'src/content/tech-center/authority/week05-authority.json')
    )
  );
  const page = buildReaderPage(authority.candidates[0]);
  assert.equal(page.projection.slug, '/zh/troubleshoot/bge-rerank-v2-m3-docker-gpu-fix');
  assert.equal(page.projection.categoryLabel, '故障排查');
  assert.match(page.document, /## 适用环境与版本范围/);
});

test('export summary records files, bytes, and initial JavaScript budget', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'full-release-capacity-'));
  try {
    fs.mkdirSync(path.join(root, 'out/tech-center'), { recursive: true });
    fs.mkdirSync(path.join(root, 'out/_next/static'), { recursive: true });
    fs.mkdirSync(path.join(root, 'scripts/fixtures'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'out/tech-center.html'),
      '<script src="/_next/static/technical-center.js"></script>'
    );
    fs.writeFileSync(path.join(root, 'out/_next/static/technical-center.js'), 'export{};');
    fs.writeFileSync(
      path.join(root, 'scripts/fixtures/technical-center-budget.json'),
      JSON.stringify({ baselineGzipBytes: 1000, maxIncreaseBytes: 100 })
    );
    const result = summarizeExport(root, 'cn');
    assert.equal(result.staticFileCount, 2);
    assert(result.exportBytes > 0);
    assert(result.initialJavaScriptGzipBytes > 0);
    assert.equal(result.initialJavaScriptMaxGzipBytes, 1100);
    assert.equal(result.initialJavaScriptWithinBudget, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a failed variant is recorded without interrupting the capacity run', async () => {
  const result = await captureVariant('preview', async () => {
    throw new Error('ENOSPC fixture');
  });
  assert.equal(result.variant, 'preview');
  assert.equal(result.buildSucceeded, false);
  assert.equal(result.failure, 'ENOSPC fixture');
  assert.equal(result.staticFileCount, null);
});

test('failure evidence omits the disposable host path', () => {
  assert.equal(
    sanitizeFailure('ENOSPC at /tmp/capacity/repo/.next/trace', '/tmp/capacity/repo'),
    'ENOSPC at <disposable-root>/.next/trace'
  );
});
