const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { sha256, stableJson } = require('./lib/technical-authority');
const {
  ACCEPTANCE_COMMANDS,
  CONTRACT_RELATIVE_PATH,
  COUNTS,
  deriveStates,
  verifyApprovalEvidence,
  verifyProductionHttpEvidence,
  verifyProductionHttpEvidenceFile,
  verifySwitchBundleBinding,
  verifyTechnicalFullReleaseApproval
} = require('./verify-technical-full-release-approval');

const ROOT = path.resolve(__dirname, '..');

function mutateContract(mutate) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'full-release-approval-'));
  const contractPath = path.join(temporaryRoot, 'contract.json');
  const contract = JSON.parse(fs.readFileSync(path.join(ROOT, CONTRACT_RELATIVE_PATH), 'utf8'));
  mutate(contract);
  fs.writeFileSync(contractPath, `${JSON.stringify(contract, null, 2)}\n`);
  return { temporaryRoot, contractPath };
}

function assertContractRejected(mutate, pattern) {
  const { temporaryRoot, contractPath } = mutateContract(mutate);
  try {
    assert.throws(() => verifyTechnicalFullReleaseApproval({ contractPath }), pattern);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

function getEvidenceContext() {
  const contract = JSON.parse(fs.readFileSync(path.join(ROOT, CONTRACT_RELATIVE_PATH), 'utf8'));
  const closure = JSON.parse(
    fs.readFileSync(path.join(ROOT, contract.lineage.identityClosure.path), 'utf8')
  );
  const productionSwitch = JSON.parse(
    fs.readFileSync(path.join(ROOT, contract.lineage.productionSwitch.path), 'utf8')
  );
  return {
    closure,
    identityClosureSha256: contract.lineage.identityClosure.sha256,
    recordsSha256: closure.recordsSha256,
    identitySetSha256: contract.releaseUnit.identitySetSha256,
    earliestProductionObservation:
      Date.parse(productionSwitch.maintenanceWindow.startsAt) + 20 * 60_000,
    now: Date.parse('2026-09-23T17:00:00.000Z')
  };
}

function buildCandidateApprovalEvidence(context = getEvidenceContext()) {
  return {
    schemaVersion: 1,
    issue: 278,
    kind: 'full-release-candidate-approval',
    status: 'passed',
    sourceRevision: 'a'.repeat(40),
    candidateCount: COUNTS.candidate,
    targetCount: COUNTS.target,
    recordsSha256: context.recordsSha256,
    identitySetSha256: context.identitySetSha256,
    checks: Object.fromEntries(
      Object.keys(ACCEPTANCE_COMMANDS)
        .filter((key) => key !== 'http')
        .map((key) => [key, 'passed'])
    ),
    approvals: {
      releaseManager: {
        role: 'release-manager',
        status: 'approved',
        approver: 'release-manager-on-call',
        approvedAt: '2026-09-08T14:05:00.000Z'
      },
      productionOwner: {
        role: 'production-owner',
        status: 'approved',
        approver: 'production-owner-on-call',
        approvedAt: '2026-09-08T14:10:00.000Z'
      }
    },
    candidateBundle: {
      path: '/release/full-release-bundle',
      sha256: 'b'.repeat(64),
      sourceRevision: 'a'.repeat(40),
      pageCount: COUNTS.target,
      variants: ['cn', 'io', 'preview']
    },
    previousBundle: {
      path: '/release/previous-release-bundle',
      sha256: 'c'.repeat(64),
      sourceRevision: 'd'.repeat(40),
      pageCount: COUNTS.baseline,
      immutable: true,
      complete: true
    }
  };
}

function buildProductionHttpEvidence(context = getEvidenceContext()) {
  const records = context.closure.records.map((identity) => {
    const owner = identity.locale === 'zh' ? 'cn' : 'io';
    const url = `${owner === 'cn' ? 'https://fastgpt.cn' : 'https://fastgpt.io'}${
      identity.canonicalPath
    }`;
    return {
      identityKey: identity.identityKey,
      owner,
      url,
      statusCode: 200,
      redirectCount: 0,
      canonicalUrl: url,
      ownerDomainMatched: true,
      sitemapMember: true
    };
  });
  return {
    schemaVersion: 1,
    issue: 278,
    kind: 'full-release-production-http',
    status: 'passed',
    source: 'live-production-http',
    environment: 'production',
    capturedAt: '2026-09-08T14:30:00.000Z',
    sourceRevision: 'a'.repeat(40),
    bundleSha256: 'b'.repeat(64),
    identityClosureSha256: context.identityClosureSha256,
    recordsSha256: context.recordsSha256,
    identitySetSha256: context.identitySetSha256,
    candidateCount: COUNTS.candidate,
    ownerCounts: COUNTS.owners.candidate,
    recordResultsSha256: sha256(stableJson(records)),
    records,
    statusCounts: { 200: COUNTS.candidate },
    redirects: 0,
    http5xx: 0,
    canonicalMismatches: 0,
    sitemapMissing: 0,
    ownerIsolationFailures: 0
  };
}

test('the approval contract records the current evidence-driven block', () => {
  assert.deepEqual(verifyTechnicalFullReleaseApproval(), {
    issue: 278,
    approvalState: 'blocked',
    releaseState: 'blocked',
    approved: false,
    candidateCount: 2585,
    targetCount: 4007,
    approvalBlockers: 3,
    releaseBlockers: 4
  });
});

test('successful capacity measurement remains separate from release safety', () => {
  const contract = JSON.parse(fs.readFileSync(path.join(ROOT, CONTRACT_RELATIVE_PATH), 'utf8'));
  const capacity = JSON.parse(
    fs.readFileSync(path.join(ROOT, contract.lineage.capacityReport.path), 'utf8')
  );
  assert.equal(capacity.decision.safeOneShotFullRelease, false);
  assert.deepEqual(capacity.decision.blockers, ['docker-publication-is-cn-only']);
  assert.equal(contract.requiredEvidence[0].status, 'passed');
  assert.equal(contract.approved, false);
  assert.equal(contract.releaseState, 'blocked');
});

test('the release unit remains bound to issues 274 through 277', () => {
  const contract = JSON.parse(fs.readFileSync(path.join(ROOT, CONTRACT_RELATIVE_PATH), 'utf8'));
  const capacityBytes = fs.readFileSync(path.join(ROOT, contract.lineage.capacityReport.path));
  const capacity = JSON.parse(capacityBytes);
  const buildDecisionBytes = fs.readFileSync(path.join(ROOT, contract.lineage.buildDecision.path));
  const productionSwitchBytes = fs.readFileSync(
    path.join(ROOT, contract.lineage.productionSwitch.path)
  );
  assert.equal(contract.lineage.capacityReport.sha256, sha256(capacityBytes));
  assert.equal(contract.lineage.capacityReport.sourceRevision, capacity.sourceRevision);
  assert.equal(
    contract.lineage.capacityReport.reportRevision,
    '36c7b31a93197cb05c026dee0f9111d2919fef13'
  );
  assert.equal(contract.lineage.buildDecision.sha256, sha256(buildDecisionBytes));
  assert.equal(
    contract.lineage.buildDecision.sourceRevision,
    '36c7b31a93197cb05c026dee0f9111d2919fef13'
  );
  assert.equal(
    contract.lineage.buildDecision.contractRevision,
    'a037fd114a6e52762253f9324065dffdca92599f'
  );
  assert.equal(contract.lineage.productionSwitch.sha256, sha256(productionSwitchBytes));
  assert.equal(
    contract.lineage.productionSwitch.sourceRevision,
    '38ef16c5eb87918873666a6f657c2017047dbb3e'
  );
  for (const [name, pattern] of [
    ['identityClosure', /identity closure digest drift/],
    ['capacityReport', /capacity report digest drift/],
    ['buildDecision', /build decision digest drift/],
    ['productionSwitch', /production switch digest drift/]
  ]) {
    assertContractRejected((contract) => {
      contract.lineage[name].sha256 = '0'.repeat(64);
    }, pattern);
  }
  assertContractRejected((contract) => {
    contract.lineage.identityClosure.recordsSha256 = '0'.repeat(64);
  }, /Expected values to be strictly equal/);
});

test('counts, commands, failure thresholds, activation, and rollback are immutable', () => {
  assertContractRejected((contract) => {
    contract.releaseUnit.candidateCount = 2584;
  }, /Expected values to be strictly equal/);
  assertContractRejected((contract) => {
    contract.acceptanceCommands.http = 'true';
  }, /acceptance command drift/);
  assertContractRejected((contract) => {
    contract.majorFailure.thresholds.pop();
  }, /major failure threshold drift/);
  assertContractRejected((contract) => {
    contract.activation.command = 'deploy';
  }, /activation command drift/);
  assertContractRejected((contract) => {
    contract.baselineRestore.immutable = false;
  }, /Expected values to be strictly deep-equal/);
});

test('post-switch HTTP evidence does not deadlock pre-release approval', () => {
  assert.deepEqual(
    deriveStates({
      'successful-4007-page-capacity-rerun': 'passed',
      'build-decision-ready': 'passed',
      'production-switch-ready': 'passed',
      'candidate-approval-evidence-recorded': 'passed',
      'production-http-evidence-recorded': 'blocked'
    }),
    {
      approvalBlockers: [],
      releaseBlockers: ['production-http-evidence-recorded'],
      approvalState: 'approved',
      releaseState: 'blocked',
      approved: true
    }
  );
  assert.throws(
    () => verifyTechnicalFullReleaseApproval({ requireApproved: true }),
    /full release approval is blocked: build-decision-ready, production-switch-ready, candidate-approval-evidence-recorded/
  );
});

test('successful capacity rerun clears only its approval blocker', () => {
  assertContractRejected((contract) => {
    contract.requiredEvidence[0].status = 'blocked';
  }, /successful-4007-page-capacity-rerun status does not match evidence/);
  assertContractRejected((contract) => {
    contract.lineage.capacityReport.successfulRerun = false;
  }, /capacity rerun state drift/);
  assertContractRejected((contract) => {
    contract.lineage.capacityReport.failureCode = 'ENOSPC';
  }, /Expected values to be strictly equal/);
});

test('unrelated JSON cannot forge candidate approval evidence', () => {
  const packageBytes = fs.readFileSync(path.join(ROOT, 'package.json'));
  const packageSha256 = crypto.createHash('sha256').update(packageBytes).digest('hex');
  assertContractRejected((contract) => {
    const reference = { path: 'package.json', sha256: packageSha256 };
    contract.candidate.approvalEvidence = reference;
    contract.candidate.sourceRevision = 'a'.repeat(40);
    contract.candidate.bundle = {};
    contract.requiredEvidence[3] = {
      ...contract.requiredEvidence[3],
      status: 'passed',
      evidence: reference
    };
    contract.approvalBlockers.pop();
    contract.releaseBlockers.splice(3, 1);
  }, /candidate approval evidence schema version drift/);
});

test('candidate approval evidence binds the source, candidate bundle, and immutable baseline', () => {
  const context = getEvidenceContext();
  const evidence = buildCandidateApprovalEvidence(context);
  assert.deepEqual(verifyApprovalEvidence(evidence, context), {
    sourceRevision: 'a'.repeat(40),
    bundleSha256: 'b'.repeat(64)
  });
  assert.throws(
    () => verifyApprovalEvidence({ ...evidence, sourceRevision: 'e'.repeat(40) }, context),
    /Expected values to be strictly equal/
  );
  assert.throws(
    () =>
      verifyApprovalEvidence(
        { ...evidence, previousBundle: { ...evidence.previousBundle, complete: false } },
        context
      ),
    /Expected values to be strictly equal/
  );
});

test('candidate approval stays bound to the production switch bundle pair', () => {
  const approval = buildCandidateApprovalEvidence();
  const switchBundle = {
    candidateSourceRevision: approval.sourceRevision,
    candidateBundle: { sha256: approval.candidateBundle.sha256 },
    baselineBundle: { sha256: approval.previousBundle.sha256 }
  };
  assert.doesNotThrow(() => verifySwitchBundleBinding(approval, switchBundle));
  for (const [field, mutate, pattern] of [
    [
      'source',
      (evidence) => (evidence.candidateSourceRevision = 'e'.repeat(40)),
      /source revision drift/
    ],
    [
      'candidate',
      (evidence) => (evidence.candidateBundle.sha256 = 'e'.repeat(64)),
      /bundle digest drift/
    ],
    [
      'baseline',
      (evidence) => (evidence.baselineBundle.sha256 = 'e'.repeat(64)),
      /baseline digest drift/
    ]
  ]) {
    const drifted = structuredClone(switchBundle);
    mutate(drifted);
    assert.throws(() => verifySwitchBundleBinding(approval, drifted), pattern, field);
  }
});

test('production HTTP evidence covers every frozen canonical with typed live results', () => {
  const context = getEvidenceContext();
  const evidence = buildProductionHttpEvidence(context);
  assert.deepEqual(verifyProductionHttpEvidence(evidence, context), {
    sourceRevision: 'a'.repeat(40),
    bundleSha256: 'b'.repeat(64)
  });

  const badStatus = structuredClone(evidence);
  badStatus.records[0].statusCode = 404;
  badStatus.recordResultsSha256 = sha256(stableJson(badStatus.records));
  assert.throws(() => verifyProductionHttpEvidence(badStatus, context), /HTTP status drift/);

  const badCanonical = structuredClone(evidence);
  badCanonical.records[0].canonicalUrl = 'https://fastgpt.io/wrong';
  badCanonical.recordResultsSha256 = sha256(stableJson(badCanonical.records));
  assert.throws(() => verifyProductionHttpEvidence(badCanonical, context), /self-canonical drift/);

  assert.throws(
    () =>
      verifyProductionHttpEvidence(
        { ...evidence, capturedAt: '2026-09-08T14:19:59.999Z' },
        context
      ),
    /captured before the production switch completed/
  );
  assert.throws(
    () =>
      verifyProductionHttpEvidence(
        { ...evidence, capturedAt: '2026-09-24T00:00:00.000Z' },
        context
      ),
    /captured in the future/
  );
});

test('production HTTP evidence CLI boundary requires the exact artifact digest', () => {
  const context = getEvidenceContext();
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'full-release-http-evidence-'));
  const evidencePath = path.join(temporaryRoot, 'evidence.json');
  try {
    const bytes = Buffer.from(`${JSON.stringify(buildProductionHttpEvidence(context))}\n`);
    fs.writeFileSync(evidencePath, bytes);
    assert.doesNotThrow(() =>
      verifyProductionHttpEvidenceFile(evidencePath, sha256(bytes), context)
    );
    assert.throws(
      () => verifyProductionHttpEvidenceFile(evidencePath, '0'.repeat(64), context),
      /production HTTP evidence file digest drift/
    );
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
