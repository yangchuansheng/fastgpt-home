const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  DECISION_RELATIVE_PATH,
  deriveObservedBoundary,
  verifyReleaseBundle,
  verifyResourcePreflight,
  verifyObservedBoundary,
  verifyTechnicalFullReleaseBuildDecision
} = require('./verify-technical-full-release-build-decision');
const { sha256 } = require('./lib/technical-authority');

const ROOT = path.resolve(__dirname, '..');

function mutateDecision(mutate) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'full-release-build-decision-'));
  const sourcePath = path.join(ROOT, DECISION_RELATIVE_PATH);
  const decisionPath = path.join(temporaryRoot, 'decision.json');
  const decision = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  mutate(decision);
  fs.writeFileSync(decisionPath, `${JSON.stringify(decision, null, 2)}\n`);
  return { temporaryRoot, decisionPath };
}

function assertDecisionRejected(mutate, pattern) {
  const { temporaryRoot, decisionPath } = mutateDecision(mutate);
  try {
    assert.throws(() => verifyTechnicalFullReleaseBuildDecision({ decisionPath }), pattern);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

function historicalFailureVariant(variant, index) {
  const peakRssBytes = [5560156160, 5125996544, 4805099520][index];
  const partialNextBuild = [
    { fileCount: 75461, bytes: 3361445970 },
    { fileCount: 20254, bytes: 1930090493 },
    { fileCount: 29866, bytes: 3442494968 }
  ][index];
  return {
    variant,
    status: 1,
    signal: null,
    durationMilliseconds: 80000 + index,
    peakRssBytes,
    buildSucceeded: false,
    failure: `ENOSPC historical fixture for ${variant}`,
    partialNextBuild,
    staticFileCount: null,
    exportBytes: null,
    initialJavaScriptGzipBytes: null,
    initialJavaScriptMaxGzipBytes: null,
    initialJavaScriptWithinBudget: null,
    postBuildVerified: false,
    postBuildChecks: []
  };
}

test('the full release build decision selects a larger one-shot runner', () => {
  const result = verifyTechnicalFullReleaseBuildDecision();

  assert.deepEqual(result, {
    issue: 276,
    pages: 4007,
    path: 'increase-build-resources',
    variants: ['cn', 'io', 'preview'],
    releaseArtifacts: 1,
    productionSwitches: 1,
    rollback: 'previous-complete-artifact'
  });
});

test('the decision stays bound to the frozen capacity evidence', () => {
  assertDecisionRejected((decision) => {
    decision.sourceRevision = '0'.repeat(40);
  }, /decision source revision drift/);
  assertDecisionRejected((decision) => {
    decision.evidence.capacityReport.sha256 = '0'.repeat(64);
  }, /capacity report digest drift/);
  assertDecisionRejected((decision) => {
    decision.evidence.observedBoundary.projectionBytes += 1;
  }, /observed projection size drift/);
  assertDecisionRejected((decision) => {
    decision.alternatives.find(({ path }) => path === 'optimize-existing-projections').reason =
      'Registry and search projections total 5,254,333 bytes.';
  }, /projection alternative evidence drift/);
});

test('the observed boundary accepts the successful runner report', () => {
  const report = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, 'scripts/fixtures/technical-authority/full-release-capacity.json')
    )
  );
  const observedBoundary = deriveObservedBoundary(report);

  assert.deepEqual(observedBoundary, {
    failingVariants: [],
    failureCode: null,
    maxPeakRssBytes: 3985747968,
    maxPartialNextBuildBytes: 0,
    projectionBytes: 5254285,
    conclusion: 'within-measured-capacity'
  });
  assert.deepEqual(verifyObservedBoundary(report, observedBoundary), observedBoundary);
});

test('the observed boundary preserves the historical three-variant ENOSPC report', () => {
  const report = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, 'scripts/fixtures/technical-authority/full-release-capacity.json')
    )
  );
  report.variants = report.variants.map(({ variant }, index) =>
    historicalFailureVariant(variant, index)
  );

  assert.deepEqual(deriveObservedBoundary(report), {
    failingVariants: ['cn', 'io', 'preview'],
    failureCode: 'ENOSPC',
    maxPeakRssBytes: 5560156160,
    maxPartialNextBuildBytes: 3442494968,
    projectionBytes: 5254285,
    conclusion: 'working-storage-boundary'
  });
});

test('the observed boundary rejects mixed or inconsistent capacity measurements', () => {
  const report = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, 'scripts/fixtures/technical-authority/full-release-capacity.json')
    )
  );
  const mixed = structuredClone(report);
  mixed.variants[0] = historicalFailureVariant(mixed.variants[0].variant, 0);
  assert.throws(
    () => deriveObservedBoundary(mixed),
    /one homogeneous successful run or three historical ENOSPC failures/
  );

  const forged = structuredClone(report);
  forged.variants[0].partialNextBuild = { fileCount: 1, bytes: 1 };
  assert.throws(
    () => deriveObservedBoundary(forged),
    /successful capacity must omit partial Next.js build evidence/
  );

  const missingGate = structuredClone(report);
  missingGate.variants[0].postBuildChecks.pop();
  assert.throws(
    () => deriveObservedBoundary(missingGate),
    /one homogeneous successful run or three historical ENOSPC failures/
  );
});

test('the decision rejects split builds and preserves release atomicity', () => {
  assertDecisionRejected((decision) => {
    decision.decision.build.splitStaticGeneration = true;
  }, /split static generation is outside the selected path/);
  assertDecisionRejected((decision) => {
    decision.decision.artifact.count = 3;
  }, /exactly one release artifact is required/);
});

test('the resource floor keeps measured memory headroom and requires a successful disk rerun', () => {
  assertDecisionRejected((decision) => {
    decision.decision.resources.minimumMemoryBytes =
      decision.evidence.observedBoundary.maxPeakRssBytes;
  }, /memory headroom is below policy/);
  assertDecisionRejected((decision) => {
    decision.decision.resources.minimumMemoryBytes = 25769803775;
  }, /memory floor is below selected release policy/);
  assertDecisionRejected((decision) => {
    decision.decision.resources.workingDisk.successfulCapacityRerunRequired = false;
  }, /successful capacity rerun is required/);
});

test('every unsafe alternative remains explicitly rejected', () => {
  assertDecisionRejected((decision) => {
    decision.alternatives.find(
      (alternative) => alternative.path === 'split-build-and-merge'
    ).disposition = 'accepted';
  }, /unsafe alternative disposition drift/);
});

test('resource preflight rejects a runner below the selected disk floor', () => {
  const contract = JSON.parse(fs.readFileSync(path.join(ROOT, DECISION_RELATIVE_PATH), 'utf8'));
  assert.throws(
    () =>
      verifyResourcePreflight(contract, {
        nodeMajor: 24,
        caseSensitiveFilesystem: true,
        logicalCpuCount: 10,
        memoryBytes: 25769803776,
        freeWorkingDiskBytes: 17179869183
      }),
    /free working disk is below the decision floor/
  );
  assert.throws(
    () =>
      verifyResourcePreflight(contract, {
        nodeMajor: 24,
        caseSensitiveFilesystem: false,
        logicalCpuCount: 10,
        memoryBytes: 25769803776,
        freeWorkingDiskBytes: 17179869184
      }),
    /filesystem case sensitivity drift/
  );
});

test('the release gate blocks a 4,007-page activation while prerequisites remain', () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'full-release-policy-'));
  const contentPolicyPath = path.join(temporaryRoot, 'technical-content-policy.json');
  try {
    fs.writeFileSync(contentPolicyPath, JSON.stringify({ expectedPageCount: 4007 }));
    assert.throws(
      () => verifyTechnicalFullReleaseBuildDecision({ contentPolicyPath }),
      /activation is blocked until every release prerequisite/
    );
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('release state and blockers are derived from prerequisite evidence', () => {
  assertDecisionRejected((decision) => {
    decision.releaseState = 'ready';
  }, /state does not match prerequisite evidence/);
  assertDecisionRejected((decision) => {
    decision.releaseBlockers.pop();
  }, /blocker set drift/);
  assertDecisionRejected((decision) => {
    decision.releasePrerequisites[0] = {
      ...decision.releasePrerequisites[0],
      status: 'passed',
      evidence: { path: 'package.json', sha256: '0'.repeat(64) }
    };
  }, /evidence digest drift/);
});

test('an unrelated JSON file cannot satisfy a passed release prerequisite', () => {
  const packageBytes = fs.readFileSync(path.join(ROOT, 'package.json'));
  const packageSha256 = sha256(packageBytes);
  assertDecisionRejected((decision) => {
    decision.releasePrerequisites[0] = {
      ...decision.releasePrerequisites[0],
      status: 'passed',
      evidence: {
        kind: 'full-release-capacity-success',
        path: 'package.json',
        sha256: packageSha256
      }
    };
    decision.releaseBlockers.shift();
  }, /successful-4007-page-capacity-rerun-on-selected-runner evidence schema version drift/);
});

test('capacity evidence cannot be paired with forged passed prerequisites', () => {
  assertDecisionRejected((decision) => {
    decision.releaseState = 'ready';
    decision.releaseBlockers = [];
    decision.releasePrerequisites = decision.releasePrerequisites.map((prerequisite) => ({
      ...prerequisite,
      status: 'passed',
      evidence: {
        path: 'package.json',
        sha256: sha256(fs.readFileSync(path.join(ROOT, 'package.json')))
      }
    }));
  }, /evidence reference kind drift/);
});

test('activation and rollback reject an unexpected bundle digest', () => {
  const retainedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'activation-bundle-'));
  const variants = ['cn', 'io', 'preview'];
  const sourceRevision = 'a'.repeat(40);
  try {
    for (const variant of variants) {
      fs.mkdirSync(path.join(retainedRoot, variant), { recursive: true });
      fs.writeFileSync(path.join(retainedRoot, variant, 'index.html'), variant);
    }
    const { finalizeSuccessArtifactBundle } = require('./lib/release-artifacts');
    const manifest = finalizeSuccessArtifactBundle(retainedRoot, sourceRevision, variants);
    assert.equal(
      verifyReleaseBundle(retainedRoot, sourceRevision, manifest.bundleSha256).bundleSha256,
      manifest.bundleSha256
    );
    assert.throws(
      () => verifyReleaseBundle(retainedRoot, sourceRevision, '0'.repeat(64)),
      /release bundle digest drift/
    );
  } finally {
    fs.rmSync(retainedRoot, { recursive: true, force: true });
  }
});
