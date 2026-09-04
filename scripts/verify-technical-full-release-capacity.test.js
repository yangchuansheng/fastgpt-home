const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  currentPathBlockers,
  isCapacityReportReady,
  projectTechnicalContent,
  summarizeExport,
  validateCapacityReport,
  validateImportedProjection
} = require('./lib/technical-full-release-capacity');
const {
  FULL_RELEASE_RELATIVE_PATH,
  validateClosureArtifact
} = require('./lib/technical-full-release');
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
  assert(
    report.decision.blockers.includes(
      'prebuild-rejects-a-registry-that-has-consumed-the-frozen-pending-closure'
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

test('capacity projection reuses a repository-consistent import without rewriting surfaces', () => {
  const root = path.resolve(__dirname, '..');
  const surfacePaths = [
    'src/components/tech-center/entries.json',
    'public/tech-center/search-index.json',
    'public/tech-center/search-index.en.json'
  ];
  const before = new Map(
    surfacePaths.map((relativePath) => [
      relativePath,
      fs.readFileSync(path.join(root, relativePath))
    ])
  );
  const projection = projectTechnicalContent({
    repoRoot: root,
    sourceVerifier(records) {
      return { verified: records.length, missing: [], drift: [] };
    }
  });

  assert.deepEqual(projection.localePages, { zh: 3492, en: 515 });
  assert.equal(projection.pages, 4007);
  assert.equal(projection.sourceFilesVerified, 2585);
  for (const [relativePath, content] of before) {
    assert.deepEqual(fs.readFileSync(path.join(root, relativePath)), content);
  }
});

test('repository-consistent projection rejects a reader path drift', () => {
  const sourceRoot = path.resolve(__dirname, '..');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'full-release-import-'));
  try {
    const closurePath = path.join(sourceRoot, FULL_RELEASE_RELATIVE_PATH);
    const closure = validateClosureArtifact(JSON.parse(fs.readFileSync(closurePath, 'utf8')));
    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(sourceRoot, 'src/content/tech-center/authority/full-release-import-manifest.json')
      )
    );
    manifest.pages[0].readerPath = '../outside.md';
    const authorityRoot = path.join(root, 'src/content/tech-center/authority');
    fs.mkdirSync(authorityRoot, { recursive: true });
    fs.copyFileSync(closurePath, path.join(authorityRoot, 'full-release-identity-closure.json'));
    fs.writeFileSync(
      path.join(authorityRoot, 'full-release-import-manifest.json'),
      JSON.stringify(manifest)
    );
    const entries = JSON.parse(
      fs.readFileSync(path.join(sourceRoot, 'src/components/tech-center/entries.json'))
    );
    assert.throws(
      () => validateImportedProjection(root, closure, entries),
      /imported projection drift/
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('capacity blockers ignore the historical prebuild command heuristic', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'full-release-path-'));
  try {
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ scripts: { prebuild: 'node scripts/verify-technical-full-release.js' } })
    );
    fs.writeFileSync(path.join(root, 'Dockerfile'), 'FROM node:22-alpine\n');
    assert.deepEqual(currentPathBlockers(root), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('capacity blockers retain the CN-only Docker publication constraint', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'full-release-path-'));
  try {
    fs.writeFileSync(
      path.join(root, 'Dockerfile'),
      'RUN test "$NEXT_PUBLIC_SITE_VARIANT" = "cn" || (echo "unsupported" >&2; exit 1)\n'
    );
    assert.deepEqual(currentPathBlockers(root), ['docker-publication-is-cn-only']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
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
