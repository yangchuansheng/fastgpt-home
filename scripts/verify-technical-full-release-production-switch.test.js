const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  CONTRACT_RELATIVE_PATH,
  evaluateMajorIncident,
  verifyActivationCandidate,
  verifyPrerequisiteEvidence,
  verifyTechnicalFullReleaseProductionSwitch
} = require('./verify-technical-full-release-production-switch');

const ROOT = path.resolve(__dirname, '..');

function mutateContract(mutate) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'full-release-production-switch-'));
  const contractPath = path.join(temporaryRoot, 'contract.json');
  const contract = JSON.parse(fs.readFileSync(path.join(ROOT, CONTRACT_RELATIVE_PATH), 'utf8'));
  mutate(contract);
  fs.writeFileSync(contractPath, `${JSON.stringify(contract, null, 2)}\n`);
  return { temporaryRoot, contractPath };
}

function assertContractRejected(mutate, pattern) {
  const { temporaryRoot, contractPath } = mutateContract(mutate);
  try {
    assert.throws(() => verifyTechnicalFullReleaseProductionSwitch({ contractPath }), pattern);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

test('the production switch contract retains an evidence-driven blocked plan', () => {
  assert.deepEqual(verifyTechnicalFullReleaseProductionSwitch(), {
    issue: 277,
    switchState: 'blocked',
    observationState: 'blocked',
    releaseState: 'blocked',
    targetPages: 4007,
    candidateCanonicals: 2585,
    maintenanceWindowMinutes: 120,
    blockers: 9,
    switchBlockers: 7,
    observationBlockers: 2
  });
});

test('the production switch stays bound to issues 274 and 276', () => {
  const contract = JSON.parse(fs.readFileSync(path.join(ROOT, CONTRACT_RELATIVE_PATH), 'utf8'));
  const identityClosure = JSON.parse(
    fs.readFileSync(path.join(ROOT, contract.lineage.identityClosure.path), 'utf8')
  );
  const buildDecisionBytes = fs.readFileSync(path.join(ROOT, contract.lineage.buildDecision.path));
  const buildDecision = JSON.parse(buildDecisionBytes);

  assert.equal(
    contract.lineage.identityClosure.sha256,
    crypto
      .createHash('sha256')
      .update(fs.readFileSync(path.join(ROOT, contract.lineage.identityClosure.path)))
      .digest('hex')
  );
  assert.equal(contract.lineage.identityClosure.recordsSha256, identityClosure.recordsSha256);
  assert.equal(
    contract.lineage.buildDecision.sha256,
    crypto.createHash('sha256').update(buildDecisionBytes).digest('hex')
  );
  assert.equal(contract.lineage.buildDecision.sourceRevision, buildDecision.sourceRevision);

  assertContractRejected((contract) => {
    contract.lineage.identityClosure.sha256 = '0'.repeat(64);
  }, /identity closure digest drift/);
  assertContractRejected((contract) => {
    contract.lineage.buildDecision.sha256 = '0'.repeat(64);
  }, /build decision digest drift/);
  assertContractRejected((contract) => {
    contract.lineage.buildDecision.sourceRevision = 'a'.repeat(40);
  }, /build decision source revision drift/);
});

test('stale capacity evidence keeps the production switch blocked', () => {
  assertContractRejected((contract) => {
    contract.switchBlockers.shift();
  }, /stale capacity measurement must block the production switch/);
});

test('roles, window, and handoff keep one coordinated CN and IO switch', () => {
  const contract = JSON.parse(fs.readFileSync(path.join(ROOT, CONTRACT_RELATIVE_PATH), 'utf8'));
  assert.equal(contract.maintenanceWindow.startsAt, '2026-09-08T14:00:00.000Z');
  assert.equal(contract.maintenanceWindow.endsAt, '2026-09-08T16:00:00.000Z');
  assert.equal(contract.maintenanceWindow.scheduleState, 'pending-approval');
  assertContractRejected((contract) => {
    contract.roles.incidentCommand.accountableRole = 'release-engineer';
  }, /role binding drift/);
  assertContractRejected((contract) => {
    contract.maintenanceWindow.productionTargets = ['cn'];
  }, /maintenance window production targets drift/);
  assertContractRejected((contract) => {
    contract.handoff.toRoles.pop();
  }, /handoff recipient drift/);
});

test('observation covers every candidate canonical on its owning domain', () => {
  assertContractRejected((contract) => {
    contract.observation.candidateCanonicalCount = 2584;
  }, /candidate canonical count drift/);
  assertContractRejected((contract) => {
    contract.observation.ownerCounts.cn -= 1;
  }, /observation owner count drift/);
  assertContractRejected((contract) => {
    contract.observation.productionEvidence = { claimed: 'passed' };
  }, /production evidence must be null until an auditable artifact is recorded/);
});

test('major incidents restore the complete 1,422-page baseline', () => {
  assertContractRejected((contract) => {
    contract.majorIncident.thresholds.pop();
  }, /major incident threshold drift/);
  assertContractRejected((contract) => {
    contract.baselineRestore.pageCount = 1421;
  }, /baseline restore page count drift/);
  assertContractRejected((contract) => {
    contract.baselineRestore.rebuild = true;
  }, /baseline restore must reuse the previous complete artifact/);

  const contract = JSON.parse(fs.readFileSync(path.join(ROOT, CONTRACT_RELATIVE_PATH), 'utf8'));
  const healthy = Object.fromEntries(
    contract.majorIncident.thresholds.map(({ metric }) => [metric, 0])
  );
  assert.deepEqual(evaluateMajorIncident(contract, healthy), {
    majorIncident: false,
    triggeredMetrics: [],
    authorizationRole: 'incident-commander',
    command: null
  });
  const incident = evaluateMajorIncident(contract, { ...healthy, 'canonical-mismatch': 1 });
  assert.equal(incident.majorIncident, true);
  assert.deepEqual(incident.triggeredMetrics, ['canonical-mismatch']);
  assert.equal(incident.command, contract.baselineRestore.command);
});

test('release state and blockers are derived from prerequisite evidence', () => {
  assertContractRejected((contract) => {
    contract.releaseState = 'ready';
  }, /release state does not match prerequisite evidence/);
  assertContractRejected((contract) => {
    contract.switchState = 'ready';
  }, /switch state does not match pre-switch evidence/);
  assertContractRejected((contract) => {
    contract.observationState = 'ready';
  }, /observation state does not match post-switch evidence/);
  assertContractRejected((contract) => {
    contract.releaseBlockers.pop();
  }, /release blocker set drift/);
  assertContractRejected((contract) => {
    contract.releasePrerequisites[0] = {
      ...contract.releasePrerequisites[0],
      status: 'passed',
      evidence: {
        kind: 'full-release-capacity-success',
        path: 'package.json',
        sha256: '0'.repeat(64)
      }
    };
  }, /successful-4007-page-capacity-rerun evidence digest drift/);
});

test('an unrelated JSON file cannot satisfy a typed prerequisite', () => {
  const packageBytes = fs.readFileSync(path.join(ROOT, 'package.json'));
  const packageSha256 = crypto.createHash('sha256').update(packageBytes).digest('hex');
  assertContractRejected((contract) => {
    contract.releasePrerequisites[0] = {
      ...contract.releasePrerequisites[0],
      status: 'passed',
      evidence: {
        kind: 'full-release-capacity-success',
        path: 'package.json',
        sha256: packageSha256
      }
    };
    contract.switchBlockers.shift();
    contract.releaseBlockers.shift();
  }, /successful-4007-page-capacity-rerun evidence schema version drift/);
});

test('production activation requires pre-switch readiness only', () => {
  const contract = JSON.parse(fs.readFileSync(path.join(ROOT, CONTRACT_RELATIVE_PATH), 'utf8'));
  assert.equal(contract.activation.gate, 'switchState');
  assert.match(contract.activation.command, /--require-ready/);
  assert.throws(
    () => verifyTechnicalFullReleaseProductionSwitch({ requireReady: true }),
    /production switch is blocked: successful-4007-page-capacity-rerun/
  );
  const result = spawnSync(
    process.execPath,
    [
      'scripts/verify-technical-full-release-production-switch.js',
      '--require-ready',
      'a'.repeat(40),
      'b'.repeat(64)
    ],
    { cwd: ROOT, encoding: 'utf8' }
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /production switch is blocked/);
  assert.doesNotMatch(result.stderr, /production-observation-evidence-recorded/);

  const bundleEvidence = {
    candidateSourceRevision: 'a'.repeat(40),
    candidateBundle: { sha256: 'b'.repeat(64) }
  };
  assert.doesNotThrow(() =>
    verifyActivationCandidate(
      bundleEvidence,
      'a'.repeat(40),
      'b'.repeat(64),
      contract.maintenanceWindow,
      '2026-09-08T14:15:00.000Z'
    )
  );
  assert.throws(
    () =>
      verifyActivationCandidate(
        bundleEvidence,
        'c'.repeat(40),
        'b'.repeat(64),
        contract.maintenanceWindow,
        '2026-09-08T14:15:00.000Z'
      ),
    /activation source revision differs from approved evidence/
  );
  assert.throws(
    () =>
      verifyActivationCandidate(
        bundleEvidence,
        'a'.repeat(40),
        'd'.repeat(64),
        contract.maintenanceWindow,
        '2026-09-08T14:15:00.000Z'
      ),
    /activation bundle digest differs from approved evidence/
  );
  assert.throws(
    () =>
      verifyActivationCandidate(
        bundleEvidence,
        'a'.repeat(40),
        'b'.repeat(64),
        contract.maintenanceWindow,
        '2026-09-08T16:00:00.000Z'
      ),
    /activation time is outside the approved deployment interval/
  );
  assert.throws(
    () =>
      verifyActivationCandidate(
        bundleEvidence,
        'a'.repeat(40),
        'b'.repeat(64),
        contract.maintenanceWindow,
        '2026-09-08T15:59:00.000Z'
      ),
    /activation time is outside the approved deployment interval/
  );
});

test('approval, handoff, and observation evidence follows the switch timeline', () => {
  const contract = JSON.parse(fs.readFileSync(path.join(ROOT, CONTRACT_RELATIVE_PATH), 'utf8'));
  const context = {
    identitySetSha256: contract.observation.identitySetSha256,
    window: contract.maintenanceWindow,
    now: Date.parse('2026-09-23T17:00:00.000Z')
  };
  const common = (kind) => ({
    schemaVersion: 1,
    issue: 277,
    kind,
    status: 'passed',
    recordedAt: '2026-09-23T16:00:00.000Z',
    candidateSourceRevision: 'a'.repeat(40),
    candidateBundleSha256: 'b'.repeat(64)
  });
  const verify = (code, evidence) =>
    verifyPrerequisiteEvidence(code, { kind: evidence.kind }, evidence, context);

  const approvals = {
    ...common('full-release-approvals'),
    approvals: {
      merge: {
        role: 'release-manager',
        status: 'approved',
        approver: 'release-manager-on-call',
        approvedAt: '2026-09-08T14:05:00.000Z'
      },
      production: {
        role: 'production-owner',
        status: 'approved',
        approver: 'production-owner-on-call',
        approvedAt: '2026-09-08T14:10:00.000Z'
      }
    }
  };
  assert.doesNotThrow(() => verify('merge-and-production-approvals-recorded', approvals));
  assert.throws(
    () =>
      verify('merge-and-production-approvals-recorded', {
        ...approvals,
        approvals: {
          ...approvals.approvals,
          merge: { ...approvals.approvals.merge, approvedAt: '2026-09-08T13:59:00.000Z' }
        }
      }),
    /outside the maintenance pre-switch phase/
  );

  const handoff = {
    ...common('full-release-on-call-handoff'),
    fromRole: contract.handoff.fromRole,
    toRoles: contract.handoff.toRoles,
    acceptedInputs: contract.handoff.requiredInputs,
    completedAt: '2026-09-08T14:14:59.000Z'
  };
  assert.doesNotThrow(() => verify('on-call-handoff-recorded', handoff));
  assert.throws(
    () =>
      verify('on-call-handoff-recorded', { ...handoff, completedAt: '2026-09-08T14:15:00.000Z' }),
    /outside the maintenance pre-switch phase/
  );

  const production = {
    ...common('full-release-production-observation'),
    source: 'live-http',
    candidateCanonicalCount: 2585,
    identitySetSha256: context.identitySetSha256,
    ownerCounts: { cn: 2095, io: 490 },
    startedAt: '2026-09-08T14:20:00.000Z',
    endedAt: '2026-09-11T14:20:00.000Z',
    statusCounts: { 200: 2585 },
    redirects: 0,
    canonicalChecked: 2585,
    canonicalMismatches: 0,
    sitemapMembership: 2585,
    sitemapMissing: 0,
    ownerIsolationChecked: 2585,
    ownerIsolationFailures: 0,
    contentHygieneFindings: 0
  };
  assert.doesNotThrow(() => verify('production-observation-evidence-recorded', production));
  assert.throws(
    () =>
      verify('production-observation-evidence-recorded', {
        ...production,
        startedAt: '2026-09-08T14:10:00.000Z',
        endedAt: '2026-09-11T14:10:00.000Z'
      }),
    /starts before the coordinated pointer swap completes/
  );
  assert.throws(
    () =>
      verify('production-observation-evidence-recorded', {
        ...production,
        recordedAt: '2026-09-11T14:19:59.000Z'
      }),
    /recorded before its observation window ended/
  );

  const search = {
    ...common('full-release-search-observation'),
    source: 'google-search-console',
    observedCanonicalCount: 2585,
    identitySetSha256: context.identitySetSha256,
    ownerCounts: { cn: 2095, io: 490 },
    startedAt: '2026-09-08T14:20:00.000Z',
    endedAt: '2026-09-22T14:20:00.000Z',
    canonicalSelectionMismatches: 0,
    duplicatePages: 0,
    excludedPages: 0,
    crawlAnomalies: 0
  };
  assert.doesNotThrow(() => verify('search-observation-evidence-recorded', search));
  assert.throws(
    () =>
      verify('search-observation-evidence-recorded', {
        ...search,
        startedAt: '2026-09-08T14:10:00.000Z',
        endedAt: '2026-09-22T14:10:00.000Z'
      }),
    /starts before the coordinated pointer swap completes/
  );
  assert.throws(
    () =>
      verify('search-observation-evidence-recorded', {
        ...search,
        recordedAt: '2026-09-22T14:19:59.000Z'
      }),
    /recorded before its observation window ended/
  );
});
