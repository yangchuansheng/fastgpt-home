#!/usr/bin/env node

/** Verify the issue #278 atomic Technical Center full-release approval contract. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { sha256, stableJson } = require('./lib/technical-authority');
const { validateClosureArtifact } = require('./lib/technical-full-release');
const { validateCapacityReport, VARIANTS } = require('./lib/technical-full-release-capacity');

const ROOT = path.resolve(__dirname, '..');
const CONTRACT_RELATIVE_PATH = 'scripts/fixtures/technical-authority/full-release-approval.json';
const COUNTS = {
  baseline: 1422,
  candidate: 2585,
  target: 4007,
  locales: {
    baseline: { zh: 1397, en: 25 },
    candidate: { zh: 2095, en: 490 },
    target: { zh: 3492, en: 515 }
  },
  owners: {
    baseline: { cn: 1397, io: 25 },
    candidate: { cn: 2095, io: 490 },
    target: { cn: 3492, io: 515 }
  }
};
const REQUIRED_EVIDENCE = [
  ['successful-4007-page-capacity-rerun', 'pre-release'],
  ['build-decision-ready', 'pre-release'],
  ['production-switch-ready', 'pre-release'],
  ['candidate-approval-evidence-recorded', 'pre-release'],
  ['production-http-evidence-recorded', 'post-switch']
];
const ACCEPTANCE_COMMANDS = {
  source:
    'npm run verify:technical-full-release -- --w5-source-root "$W5_SOURCE_ROOT" --w6-source-root "$W6_SOURCE_ROOT"',
  export: 'npm run verify:release -- --retain-success-artifacts "$RELEASE_STAGING_DIR"',
  canonical:
    'npm run verify:technical-export -- --variant "$RELEASE_VARIANT" --out-dir "$RELEASE_VARIANT_OUT"',
  hreflang:
    'npm run verify:technical-export -- --variant "$RELEASE_VARIANT" --out-dir "$RELEASE_VARIANT_OUT"',
  sitemap:
    'npm run verify:technical-export -- --variant "$RELEASE_VARIANT" --out-dir "$RELEASE_VARIANT_OUT"',
  ownerIsolation:
    'npm run verify:technical-export -- --variant "$RELEASE_VARIANT" --out-dir "$RELEASE_VARIANT_OUT"',
  contentHygiene:
    'node scripts/verify-content-hygiene.js --mode html --root "$RELEASE_VARIANT_OUT" --variant "$RELEASE_VARIANT"',
  bundle:
    'npm run verify:technical-full-release-build-decision -- --verify-bundle "$RELEASE_BUNDLE" "$RELEASE_SOURCE_COMMIT" "$RELEASE_BUNDLE_SHA256"',
  http: 'npm run verify:technical-full-release-approval -- --verify-http-evidence "$PRODUCTION_HTTP_EVIDENCE" "$PRODUCTION_HTTP_EVIDENCE_SHA256"'
};
const UPSTREAM_REVISIONS = {
  identityClosure: 'f7f847806d6ac83c17d4cc5e1fc29b591477143e',
  capacityReport: '4b13834a32e1477a39270fa0ae2ea84bd33c56ae',
  buildDecision: '7f2d539d8d1ecc429aac7645a9f1167a16ab2814',
  productionSwitch: 'c8ac1a47d72cc5095a90e3c6e8a8ad4d307e92fd'
};
const FAILURE_THRESHOLDS = [
  { metric: 'owner-unavailable', operator: '>=', value: 1 },
  { metric: 'candidate-http-404', operator: '>=', value: 1 },
  { metric: 'candidate-http-5xx-rate-percent', operator: '>=', value: 1 },
  { metric: 'canonical-mismatch', operator: '>=', value: 1 },
  { metric: 'sitemap-missing', operator: '>=', value: 1 },
  { metric: 'owner-isolation-failure', operator: '>=', value: 1 },
  { metric: 'content-hygiene-finding', operator: '>=', value: 1 },
  { metric: 'release-bundle-or-source-mismatch', operator: '>=', value: 1 }
];

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`${label} is unreadable: ${error.message}`);
  }
}

function verifyArtifact(rootDir, reference, label) {
  assert.match(reference?.sha256 || '', /^[a-f0-9]{64}$/, `${label} digest is invalid`);
  const artifactPath = path.resolve(rootDir, reference?.path || '');
  assert(
    artifactPath.startsWith(`${path.resolve(rootDir)}${path.sep}`),
    `${label} path escapes the repository`
  );
  const bytes = fs.readFileSync(artifactPath);
  assert.equal(sha256(bytes), reference.sha256, `${label} digest drift`);
  try {
    return JSON.parse(bytes);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

function assertRevision(value, label) {
  assert.match(value || '', /^[a-f0-9]{40}$/, `${label} revision is invalid`);
}

function assertDigest(value, label) {
  assert.match(value || '', /^[a-f0-9]{64}$/, `${label} digest is invalid`);
}

function verifyApprovalEvidence(evidence, context) {
  assert.equal(evidence?.schemaVersion, 1, 'candidate approval evidence schema version drift');
  assert.equal(evidence?.issue, 278, 'candidate approval evidence issue binding drift');
  assert.equal(evidence?.kind, 'full-release-candidate-approval');
  assert.equal(evidence?.status, 'passed', 'candidate approval evidence status must be passed');
  assertRevision(evidence.sourceRevision, 'candidate approval evidence source');
  assert.equal(evidence.candidateCount, COUNTS.candidate);
  assert.equal(evidence.targetCount, COUNTS.target);
  assert.equal(evidence.recordsSha256, context.recordsSha256);
  assert.equal(evidence.identitySetSha256, context.identitySetSha256);
  assert.deepEqual(
    evidence.checks,
    Object.fromEntries(
      Object.keys(ACCEPTANCE_COMMANDS)
        .filter((key) => key !== 'http')
        .map((key) => [key, 'passed'])
    )
  );
  for (const [name, role] of [
    ['releaseManager', 'release-manager'],
    ['productionOwner', 'production-owner']
  ]) {
    assert.equal(evidence.approvals?.[name]?.role, role, `${name} approval role drift`);
    assert.equal(evidence.approvals?.[name]?.status, 'approved', `${name} approval status drift`);
    assert.match(evidence.approvals?.[name]?.approver || '', /\S/, `${name} approver missing`);
    assert(
      Number.isFinite(Date.parse(evidence.approvals?.[name]?.approvedAt)),
      `${name} approval timestamp is invalid`
    );
  }
  assert.equal(evidence.candidateBundle?.pageCount, COUNTS.target);
  assert.deepEqual(evidence.candidateBundle?.variants, VARIANTS);
  assert.equal(evidence.candidateBundle?.sourceRevision, evidence.sourceRevision);
  assert.match(evidence.candidateBundle?.path || '', /\S/, 'candidate bundle path missing');
  assertDigest(evidence.candidateBundle?.sha256, 'candidate bundle');
  assert.equal(evidence.previousBundle?.pageCount, COUNTS.baseline);
  assert.equal(evidence.previousBundle?.immutable, true);
  assert.equal(evidence.previousBundle?.complete, true);
  assertRevision(evidence.previousBundle?.sourceRevision, 'previous bundle source');
  assert.match(evidence.previousBundle?.path || '', /\S/, 'previous bundle path missing');
  assertDigest(evidence.previousBundle?.sha256, 'previous bundle');
  return {
    sourceRevision: evidence.sourceRevision,
    bundleSha256: evidence.candidateBundle.sha256
  };
}

function verifyProductionHttpEvidence(evidence, context) {
  assert.equal(evidence?.schemaVersion, 1, 'production HTTP evidence schema version drift');
  assert.equal(evidence?.issue, 278, 'production HTTP evidence issue binding drift');
  assert.equal(evidence?.kind, 'full-release-production-http');
  assert.equal(evidence?.status, 'passed', 'production HTTP evidence status must be passed');
  assert.equal(evidence?.source, 'live-production-http');
  assert.equal(evidence?.environment, 'production');
  assertRevision(evidence.sourceRevision, 'production HTTP evidence source');
  assertDigest(evidence.bundleSha256, 'production HTTP evidence bundle');
  assert.equal(evidence.identityClosureSha256, context.identityClosureSha256);
  assert.equal(evidence.recordsSha256, context.recordsSha256);
  assert.equal(evidence.identitySetSha256, context.identitySetSha256);
  assert.equal(evidence.candidateCount, COUNTS.candidate);
  assert.deepEqual(evidence.ownerCounts, COUNTS.owners.candidate);
  const capturedAt = Date.parse(evidence.capturedAt);
  assert(Number.isFinite(capturedAt), 'production HTTP evidence timestamp is invalid');
  assert(
    capturedAt >= context.earliestProductionObservation,
    'production HTTP evidence was captured before the production switch completed'
  );
  assert(Array.isArray(evidence.records), 'production HTTP evidence records must be an array');
  assert.equal(
    evidence.records.length,
    COUNTS.candidate,
    'production HTTP evidence record count drift'
  );
  assert.equal(
    evidence.recordResultsSha256,
    sha256(stableJson(evidence.records)),
    'production HTTP evidence record digest drift'
  );

  const expectedRecordsByIdentity = new Map(
    context.closure.records.map((record) => [record.identityKey, record])
  );
  const seenIdentityKeys = new Set();
  for (const [index, result] of evidence.records.entries()) {
    const label = `production HTTP evidence records[${index}]`;
    const identity = expectedRecordsByIdentity.get(result?.identityKey);
    assert(identity, `${label} has an unknown identity`);
    assert(!seenIdentityKeys.has(result.identityKey), `${label} duplicates an identity`);
    seenIdentityKeys.add(result.identityKey);
    const owner = identity.locale === 'zh' ? 'cn' : 'io';
    const expectedUrl = `${owner === 'cn' ? 'https://fastgpt.cn' : 'https://fastgpt.io'}${
      identity.canonicalPath
    }`;
    assert.equal(result.owner, owner, `${label} owner drift`);
    assert.equal(result.url, expectedUrl, `${label} URL drift`);
    assert.equal(result.statusCode, 200, `${label} HTTP status drift`);
    assert.equal(result.redirectCount, 0, `${label} redirect count drift`);
    assert.equal(result.canonicalUrl, expectedUrl, `${label} self-canonical drift`);
    assert.equal(result.ownerDomainMatched, true, `${label} owner domain drift`);
    assert.equal(result.sitemapMember, true, `${label} sitemap membership drift`);
  }
  assert.equal(
    seenIdentityKeys.size,
    expectedRecordsByIdentity.size,
    'production HTTP evidence identity coverage drift'
  );
  assert.deepEqual(evidence.statusCounts, { 200: COUNTS.candidate });
  assert.equal(evidence.redirects, 0);
  assert.equal(evidence.http5xx, 0);
  assert.equal(evidence.canonicalMismatches, 0);
  assert.equal(evidence.sitemapMissing, 0);
  assert.equal(evidence.ownerIsolationFailures, 0);
  return { sourceRevision: evidence.sourceRevision, bundleSha256: evidence.bundleSha256 };
}

function verifyProductionHttpEvidenceFile(filePath, expectedSha256, context) {
  assertDigest(expectedSha256, 'production HTTP evidence file');
  const bytes = fs.readFileSync(filePath);
  assert.equal(sha256(bytes), expectedSha256, 'production HTTP evidence file digest drift');
  try {
    return verifyProductionHttpEvidence(JSON.parse(bytes), context);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`production HTTP evidence file is not valid JSON: ${error.message}`);
    }
    throw error;
  }
}

function verifySwitchBundleBinding(approvalEvidence, switchBundleEvidence) {
  assert.equal(
    approvalEvidence.sourceRevision,
    switchBundleEvidence.candidateSourceRevision,
    'candidate approval and production switch source revision drift'
  );
  assert.equal(
    approvalEvidence.candidateBundle.sha256,
    switchBundleEvidence.candidateBundle?.sha256,
    'candidate approval and production switch bundle digest drift'
  );
  assert.equal(
    approvalEvidence.previousBundle.sha256,
    switchBundleEvidence.baselineBundle?.sha256,
    'candidate approval and production switch baseline digest drift'
  );
}

function deriveStates(statusByCode) {
  const approvalBlockers = REQUIRED_EVIDENCE.filter(
    ([code, phase]) => phase === 'pre-release' && statusByCode[code] !== 'passed'
  ).map(([code]) => code);
  const releaseBlockers = REQUIRED_EVIDENCE.filter(([code]) => statusByCode[code] !== 'passed').map(
    ([code]) => code
  );
  return {
    approvalBlockers,
    releaseBlockers,
    approvalState: approvalBlockers.length ? 'blocked' : 'approved',
    releaseState: releaseBlockers.length ? 'blocked' : 'released',
    approved: approvalBlockers.length === 0
  };
}

function verifyTechnicalFullReleaseApproval({
  rootDir = ROOT,
  contractPath = path.join(rootDir, CONTRACT_RELATIVE_PATH),
  requireApproved = false,
  expectedSourceRevision,
  expectedBundleSha256
} = {}) {
  const contract = readJson(contractPath, 'Technical full-release approval contract');
  assert.equal(contract.schemaVersion, 1, 'approval schema version drift');
  assert.equal(contract.issue, 278, 'approval issue binding drift');
  assert.equal(contract.status, 'closed', 'approval contract must be closed');
  assert.equal(contract.scope, 'atomic-full-release-approval', 'approval scope drift');

  const closure = validateClosureArtifact(
    verifyArtifact(rootDir, contract.lineage?.identityClosure, 'identity closure')
  );
  assert.equal(contract.lineage.identityClosure.issue, 274);
  assert.equal(
    contract.lineage.identityClosure.sourceRevision,
    UPSTREAM_REVISIONS.identityClosure,
    'identity closure source revision drift'
  );
  assert.equal(contract.lineage.identityClosure.recordsSha256, closure.recordsSha256);
  assert.deepEqual(closure.counts, {
    baseline: COUNTS.baseline,
    pending: COUNTS.candidate,
    target: COUNTS.target
  });
  const localeCounts = closure.records.reduce(
    (counts, record) => ({ ...counts, [record.locale]: counts[record.locale] + 1 }),
    { zh: 0, en: 0 }
  );
  const identitySetSha256 = sha256(
    stableJson(closure.records.map(({ identityKey }) => identityKey))
  );
  assert.deepEqual(localeCounts, COUNTS.locales.candidate, 'candidate locale count drift');

  const capacity = validateCapacityReport(
    verifyArtifact(rootDir, contract.lineage?.capacityReport, 'capacity report'),
    rootDir
  );
  assert.equal(contract.lineage.capacityReport.issue, 275);
  assert.equal(contract.lineage.capacityReport.sourceRevision, capacity.sourceRevision);
  assert.equal(
    contract.lineage.capacityReport.reportRevision,
    UPSTREAM_REVISIONS.capacityReport,
    'capacity report contract revision drift'
  );
  assert.equal(contract.lineage.capacityReport.targetPages, COUNTS.target);
  assert.equal(capacity.projection.pages, COUNTS.target);
  assert.equal(capacity.projection.recordsSha256, closure.recordsSha256);
  const failedVariants = capacity.variants
    .filter(({ buildSucceeded, postBuildVerified }) => !buildSucceeded || !postBuildVerified)
    .map(({ variant }) => variant);
  const capacityReady = failedVariants.length === 0 && capacity.decision.safeOneShotFullRelease;
  assert.equal(contract.lineage.capacityReport.successfulRerun, capacityReady);
  assert.deepEqual(contract.lineage.capacityReport.failedVariants, failedVariants);
  if (!capacityReady) {
    assert(capacity.variants.every(({ failure }) => failure?.includes('ENOSPC')));
    assert.equal(contract.lineage.capacityReport.failureCode, 'ENOSPC');
  }

  const decision = verifyArtifact(rootDir, contract.lineage?.buildDecision, 'build decision');
  assert.equal(contract.lineage.buildDecision.issue, 276);
  assert.equal(
    contract.lineage.buildDecision.contractRevision,
    UPSTREAM_REVISIONS.buildDecision,
    'build decision contract revision drift'
  );
  assert.equal(contract.lineage.buildDecision.sourceRevision, decision.sourceRevision);
  assert.equal(contract.lineage.buildDecision.pathDecision, decision.decision?.path);
  assert.equal(decision.decision?.path, 'increase-build-resources');

  const productionSwitch = verifyArtifact(
    rootDir,
    contract.lineage?.productionSwitch,
    'production switch'
  );
  assert.equal(contract.lineage.productionSwitch.issue, 277);
  assert.equal(
    contract.lineage.productionSwitch.sourceRevision,
    UPSTREAM_REVISIONS.productionSwitch,
    'production switch source revision drift'
  );
  assert.deepEqual(contract.lineage.productionSwitch.window, {
    timezone: productionSwitch.maintenanceWindow?.timezone,
    startsAt: productionSwitch.maintenanceWindow?.startsAt,
    endsAt: productionSwitch.maintenanceWindow?.endsAt
  });
  assert.deepEqual(Object.keys(productionSwitch.roles || {}), [
    'mergeApproval',
    'productionApproval',
    'deployment',
    'seoObservation',
    'incidentCommand',
    'rollbackExecution',
    'onCallHandoff'
  ]);
  const switchBundlePrerequisite = productionSwitch.releasePrerequisites?.find(
    ({ code }) => code === 'single-candidate-and-baseline-bundles-recorded'
  );
  let switchBundleEvidence;
  if (switchBundlePrerequisite?.status === 'passed') {
    switchBundleEvidence = verifyArtifact(
      rootDir,
      switchBundlePrerequisite.evidence,
      'production switch bundle evidence'
    );
  }

  assert.equal(contract.releaseUnit?.atomic, true);
  assert.equal(contract.releaseUnit?.baselineCount, COUNTS.baseline);
  assert.equal(contract.releaseUnit?.candidateCount, COUNTS.candidate);
  assert.equal(contract.releaseUnit?.targetCount, COUNTS.target);
  assert.deepEqual(contract.releaseUnit?.localeCounts, COUNTS.locales);
  assert.deepEqual(contract.releaseUnit?.ownerCounts, COUNTS.owners);
  assert.equal(contract.releaseUnit?.recordsSha256, closure.recordsSha256);
  assert.equal(contract.releaseUnit?.identitySetSha256, identitySetSha256);
  assert.deepEqual(contract.acceptanceCommands, ACCEPTANCE_COMMANDS, 'acceptance command drift');
  assert.deepEqual(
    contract.majorFailure?.thresholds,
    FAILURE_THRESHOLDS,
    'major failure threshold drift'
  );
  assert.equal(contract.majorFailure?.triggerMode, 'any-threshold');
  assert.equal(contract.activation?.gate, 'approvalState');
  assert.equal(
    contract.activation?.command,
    `npm run verify:technical-full-release-approval -- --require-approved "$RELEASE_SOURCE_COMMIT" "$RELEASE_BUNDLE_SHA256" && ${productionSwitch.activation.command}`,
    'activation command drift'
  );
  assert.deepEqual(contract.baselineRestore, {
    pageCount: COUNTS.baseline,
    strategy: productionSwitch.baselineRestore.strategy,
    immutable: true,
    requiresCompleteArtifact: true,
    command: productionSwitch.baselineRestore.command
  });

  const context = {
    closure,
    identityClosureSha256: contract.lineage.identityClosure.sha256,
    recordsSha256: closure.recordsSha256,
    identitySetSha256,
    earliestProductionObservation:
      Date.parse(productionSwitch.maintenanceWindow.startsAt) + 20 * 60_000
  };
  let approvalBinding;
  if (contract.candidate?.approvalEvidence) {
    const evidence = verifyArtifact(
      rootDir,
      contract.candidate.approvalEvidence,
      'candidate approval evidence'
    );
    approvalBinding = verifyApprovalEvidence(evidence, context);
    assert.equal(contract.candidate.sourceRevision, approvalBinding.sourceRevision);
    assert.deepEqual(contract.candidate.bundle, evidence.candidateBundle);
    if (switchBundleEvidence) {
      verifySwitchBundleBinding(evidence, switchBundleEvidence);
    }
  } else {
    assert.equal(contract.candidate?.sourceRevision, null);
    assert.equal(contract.candidate?.bundle, null);
  }
  let httpBinding;
  if (contract.candidate?.productionHttpEvidence) {
    const evidence = verifyArtifact(
      rootDir,
      contract.candidate.productionHttpEvidence,
      'production HTTP evidence'
    );
    httpBinding = verifyProductionHttpEvidence(evidence, context);
    assert.deepEqual(httpBinding, approvalBinding, 'production HTTP candidate binding drift');
  }

  const statusByCode = {
    'successful-4007-page-capacity-rerun': capacityReady ? 'passed' : 'blocked',
    'build-decision-ready': decision.releaseState === 'ready' ? 'passed' : 'blocked',
    'production-switch-ready': productionSwitch.switchState === 'ready' ? 'passed' : 'blocked',
    'candidate-approval-evidence-recorded': approvalBinding ? 'passed' : 'blocked',
    'production-http-evidence-recorded': httpBinding ? 'passed' : 'blocked'
  };
  assert.deepEqual(
    contract.requiredEvidence?.map(({ code, phase }) => [code, phase]),
    REQUIRED_EVIDENCE,
    'required evidence set drift'
  );
  for (const item of contract.requiredEvidence) {
    assert.equal(
      item.status,
      statusByCode[item.code],
      `${item.code} status does not match evidence`
    );
    const expectedReference =
      item.code === 'candidate-approval-evidence-recorded'
        ? contract.candidate.approvalEvidence
        : item.code === 'production-http-evidence-recorded'
        ? contract.candidate.productionHttpEvidence
        : null;
    assert.deepEqual(item.evidence, expectedReference, `${item.code} evidence reference drift`);
  }
  const states = deriveStates(statusByCode);
  assert.deepEqual(
    contract.approvalBlockers,
    states.approvalBlockers,
    'approval blocker set drift'
  );
  assert.deepEqual(contract.releaseBlockers, states.releaseBlockers, 'release blocker set drift');
  assert.equal(
    contract.approvalState,
    states.approvalState,
    'approval state does not match evidence'
  );
  assert.equal(contract.releaseState, states.releaseState, 'release state does not match evidence');
  assert.equal(contract.approved, states.approved, 'approved flag does not match evidence');

  if (requireApproved && !states.approved) {
    throw new Error(`full release approval is blocked: ${states.approvalBlockers.join(', ')}`);
  }
  if (requireApproved) {
    assertRevision(expectedSourceRevision, 'requested activation source');
    assertDigest(expectedBundleSha256, 'requested activation bundle');
    assert.equal(
      expectedSourceRevision,
      approvalBinding.sourceRevision,
      'activation source revision drift'
    );
    assert.equal(
      expectedBundleSha256,
      approvalBinding.bundleSha256,
      'activation bundle digest drift'
    );
  }

  return {
    issue: 278,
    approvalState: states.approvalState,
    releaseState: states.releaseState,
    approved: states.approved,
    candidateCount: COUNTS.candidate,
    targetCount: COUNTS.target,
    approvalBlockers: states.approvalBlockers.length,
    releaseBlockers: states.releaseBlockers.length
  };
}

if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    const requireApproved = args[0] === '--require-approved' && args.length === 3;
    const httpEvidencePath =
      args[0] === '--verify-http-evidence' && args.length === 3 ? args[1] : null;
    if (args.length && !requireApproved && !httpEvidencePath)
      throw new Error(`Unknown option: ${args[0]}`);
    const result = verifyTechnicalFullReleaseApproval({
      requireApproved,
      expectedSourceRevision: requireApproved ? args[1] : undefined,
      expectedBundleSha256: requireApproved ? args[2] : undefined
    });
    if (httpEvidencePath) {
      const contract = readJson(
        path.join(ROOT, CONTRACT_RELATIVE_PATH),
        'Technical full-release approval contract'
      );
      const closure = validateClosureArtifact(
        verifyArtifact(ROOT, contract.lineage.identityClosure, 'identity closure')
      );
      const productionSwitch = verifyArtifact(
        ROOT,
        contract.lineage.productionSwitch,
        'production switch'
      );
      verifyProductionHttpEvidenceFile(path.resolve(httpEvidencePath), args[2], {
        closure,
        identityClosureSha256: contract.lineage.identityClosure.sha256,
        recordsSha256: closure.recordsSha256,
        identitySetSha256: contract.releaseUnit.identitySetSha256,
        earliestProductionObservation:
          Date.parse(productionSwitch.maintenanceWindow.startsAt) + 20 * 60_000
      });
    }
    console.log(
      `[verify-technical-full-release-approval] contract passed: approval=${result.approvalState} release=${result.releaseState} candidate=${result.candidateCount} target=${result.targetCount} blockers=${result.releaseBlockers}`
    );
  } catch (error) {
    console.error(`[verify-technical-full-release-approval] ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  ACCEPTANCE_COMMANDS,
  CONTRACT_RELATIVE_PATH,
  COUNTS,
  deriveStates,
  verifyApprovalEvidence,
  verifyProductionHttpEvidence,
  verifyProductionHttpEvidenceFile,
  verifySwitchBundleBinding,
  verifyTechnicalFullReleaseApproval
};
