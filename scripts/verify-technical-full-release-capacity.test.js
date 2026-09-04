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
  assertCapacityReportReady,
  captureVariant,
  parseArgs,
  sanitizeFailure
} = require('./verify-technical-full-release-capacity');

const ROOT = path.resolve(__dirname, '..');

function readCapacityFixture() {
  return JSON.parse(
    fs.readFileSync(
      path.join(ROOT, 'scripts/fixtures/technical-authority/full-release-capacity.json')
    )
  );
}

test('capacity runner can measure the repository projection without external source roots', () => {
  assert.deepEqual(parseArgs([]), {
    mode: 'run',
    w5SourceRoot: undefined,
    w6SourceRoot: undefined,
    report: path.resolve(__dirname, 'fixtures/technical-authority/full-release-capacity.json')
  });
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

test('committed capacity evidence records a successful three-variant measurement', () => {
  const report = readCapacityFixture();
  assert.equal(report.sourceRevision, 'b8b94710e7659fe1ceb8726158c268d021bb08cb');
  assert.deepEqual(report.measurementBinding, {
    measuredRecordsSha256: report.projection.recordsSha256,
    currentRecordsSha256: report.projection.recordsSha256,
    status: 'current',
    rerunRequired: false
  });
  assert.deepEqual(report.decision, {
    safeOneShotFullRelease: false,
    blockers: ['docker-publication-is-cn-only']
  });
  assert.deepEqual(
    report.variants.map(
      ({ variant, status, buildSucceeded, postBuildVerified, postBuildChecks }) => ({
        variant,
        status,
        buildSucceeded,
        postBuildVerified,
        postBuildCheckCount: postBuildChecks.length
      })
    ),
    [
      {
        variant: 'cn',
        status: 0,
        buildSucceeded: true,
        postBuildVerified: true,
        postBuildCheckCount: 8
      },
      {
        variant: 'io',
        status: 0,
        buildSucceeded: true,
        postBuildVerified: true,
        postBuildCheckCount: 8
      },
      {
        variant: 'preview',
        status: 0,
        buildSucceeded: true,
        postBuildVerified: true,
        postBuildCheckCount: 8
      }
    ]
  );
  assert(
    report.variants.every((variant) => variant.postBuildChecks.every((check) => check.status === 0))
  );
  validateCapacityReport(report, ROOT);
  assert.equal(isCapacityReportReady(report), false);
  assert.throws(() => assertCapacityReportReady(report), /docker-publication-is-cn-only/);

  const mutated = structuredClone(report);
  mutated.projection.pages += 1;
  assert.throws(() => validateCapacityReport(mutated, ROOT), /projection drift/);
});

test('stale capacity measurements require the rerun blocker and keep release unsafe', () => {
  const current = readCapacityFixture();
  const report = structuredClone(current);
  report.measurementBinding = {
    measuredRecordsSha256: '9'.repeat(64),
    currentRecordsSha256: current.projection.recordsSha256,
    status: 'stale-after-source-normalization',
    rerunRequired: true,
    rerunBlocker: 'capacity-rerun-required-after-source-normalization'
  };
  report.decision = {
    safeOneShotFullRelease: false,
    blockers: [
      'prebuild-rejects-a-registry-that-has-consumed-the-frozen-pending-closure',
      'docker-publication-is-cn-only',
      'capacity-rerun-required-after-source-normalization'
    ]
  };
  validateCapacityReport(report, ROOT);
  assert.equal(isCapacityReportReady(report), false);

  const digestDrift = structuredClone(report);
  digestDrift.measurementBinding.currentRecordsSha256 = '0'.repeat(64);
  assert.throws(() => validateCapacityReport(digestDrift, ROOT), /current digest drift/);

  const missingBlocker = structuredClone(report);
  missingBlocker.decision.blockers = missingBlocker.decision.blockers.filter(
    (blocker) => blocker !== 'capacity-rerun-required-after-source-normalization'
  );
  assert.throws(() => validateCapacityReport(missingBlocker, ROOT), /rerun blocker is missing/);

  const safeStale = structuredClone(report);
  safeStale.decision = { safeOneShotFullRelease: true, blockers: [] };
  assert.throws(() => validateCapacityReport(safeStale, ROOT), /stale measurement cannot be safe/);
});

test('capacity decisions reject a report with failed variant measurements', () => {
  const report = readCapacityFixture();
  const failed = structuredClone(report);
  failed.variants[1] = {
    ...failed.variants[1],
    status: 1,
    buildSucceeded: false,
    failure: 'ENOSPC fixture',
    partialNextBuild: { fileCount: 1, bytes: 1 },
    staticFileCount: null,
    exportBytes: null,
    initialJavaScriptGzipBytes: null,
    initialJavaScriptMaxGzipBytes: null,
    initialJavaScriptWithinBudget: null,
    postBuildVerified: false,
    postBuildChecks: []
  };
  failed.decision = {
    safeOneShotFullRelease: false,
    blockers: [
      'docker-publication-is-cn-only',
      'one-or-more-static-exports-failed',
      'io-post-build-gate-failed'
    ]
  };
  validateCapacityReport(failed, ROOT);
  assert.equal(isCapacityReportReady(failed), false);
  assert.throws(() => assertCapacityReportReady(failed), /static export capacity failed/);

  const forgedSafe = structuredClone(failed);
  forgedSafe.decision = { safeOneShotFullRelease: true, blockers: [] };
  assert.throws(() => validateCapacityReport(forgedSafe, ROOT), /decision blockers drift/);
});

test('capacity evidence rejects registry and search digest drift', () => {
  const report = readCapacityFixture();

  const registryDrift = structuredClone(report);
  registryDrift.projection.registry.sha256 = '0'.repeat(64);
  assert.throws(() => validateCapacityReport(registryDrift, ROOT), /capacity projection drift/);

  const searchDrift = structuredClone(report);
  searchDrift.projection.search.en.bytes += 1;
  assert.throws(() => validateCapacityReport(searchDrift, ROOT), /capacity projection drift/);

  const sourceVerificationDrift = structuredClone(report);
  sourceVerificationDrift.projection.sourceFilesVerified = 2585;
  assert.throws(
    () => validateCapacityReport(sourceVerificationDrift, ROOT),
    /capacity projection drift/
  );
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
  const projection = projectTechnicalContent({ repoRoot: root });

  assert.deepEqual(projection.localePages, { zh: 3492, en: 515 });
  assert.equal(projection.pages, 4007);
  assert.equal(projection.sourceFilesVerified, 0);
  assert.equal(projection.sourceVerification, 'authority-recorded');
  assert.equal(projection.repositoryProjectionVerified, 2585);
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
