const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  DECISION_RELATIVE_PATH,
  verifyTechnicalFullReleaseBuildDecision
} = require('./verify-technical-full-release-build-decision');

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
  const { temporaryRoot, decisionPath } = mutateDecision((decision) => {
    decision.evidence.capacityReport.sha256 = '0'.repeat(64);
  });
  try {
    assert.throws(
      () => verifyTechnicalFullReleaseBuildDecision({ decisionPath }),
      /capacity report digest drift/
    );
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('the decision rejects split builds and preserves release atomicity', () => {
  const split = mutateDecision((decision) => {
    decision.decision.build.splitStaticGeneration = true;
  });
  const multipleArtifacts = mutateDecision((decision) => {
    decision.decision.artifact.count = 3;
  });
  try {
    assert.throws(
      () => verifyTechnicalFullReleaseBuildDecision({ decisionPath: split.decisionPath }),
      /split static generation is outside the selected path/
    );
    assert.throws(
      () =>
        verifyTechnicalFullReleaseBuildDecision({ decisionPath: multipleArtifacts.decisionPath }),
      /exactly one release artifact is required/
    );
  } finally {
    fs.rmSync(split.temporaryRoot, { recursive: true, force: true });
    fs.rmSync(multipleArtifacts.temporaryRoot, { recursive: true, force: true });
  }
});

test('the resource floor keeps measured memory headroom and requires a successful disk rerun', () => {
  const memory = mutateDecision((decision) => {
    decision.decision.resources.minimumMemoryBytes =
      decision.evidence.observedBoundary.maxPeakRssBytes;
  });
  const disk = mutateDecision((decision) => {
    decision.decision.resources.workingDisk.successfulCapacityRerunRequired = false;
  });
  try {
    assert.throws(
      () => verifyTechnicalFullReleaseBuildDecision({ decisionPath: memory.decisionPath }),
      /memory headroom is below policy/
    );
    assert.throws(
      () => verifyTechnicalFullReleaseBuildDecision({ decisionPath: disk.decisionPath }),
      /successful capacity rerun is required/
    );
  } finally {
    fs.rmSync(memory.temporaryRoot, { recursive: true, force: true });
    fs.rmSync(disk.temporaryRoot, { recursive: true, force: true });
  }
});

test('every unsafe alternative remains explicitly rejected', () => {
  const { temporaryRoot, decisionPath } = mutateDecision((decision) => {
    decision.alternatives.find(
      (alternative) => alternative.path === 'split-build-and-merge'
    ).disposition = 'accepted';
  });
  try {
    assert.throws(
      () => verifyTechnicalFullReleaseBuildDecision({ decisionPath }),
      /unsafe alternative disposition drift/
    );
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
