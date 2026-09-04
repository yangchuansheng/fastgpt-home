#!/usr/bin/env node

/** Verify the issue #276 one-shot Technical Center release build decision. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { sha256 } = require('./lib/technical-authority');
const { VARIANTS, validateCapacityReport } = require('./lib/technical-full-release-capacity');

const ROOT = path.resolve(__dirname, '..');
const DECISION_RELATIVE_PATH =
  'scripts/fixtures/technical-authority/full-release-build-decision.json';
const REJECTED_ALTERNATIVES = [
  'reuse-current-resources',
  'optimize-existing-projections',
  'split-build-and-merge',
  'multiple-release-artifacts-or-switches'
];
const INTEGRITY_CHECKS = [
  'source-commit-equality',
  'variant-set-exact',
  'variant-post-build-gates',
  'route-canonical-hreflang-sitemap',
  'collision-free-namespaced-layout',
  'sha256-file-inventory',
  'bundle-sha256'
];
const RELEASE_BLOCKERS = [
  'successful-4007-page-capacity-rerun-on-selected-runner',
  'all-cn-io-preview-post-build-gates-pass',
  'full-release-prebuild-state-transition-is-approved',
  'coordinated-cn-io-release-controller-binding-is-approved',
  'single-bundle-manifest-and-rollback-artifact-are-recorded'
];
const PREREQUISITE_EVIDENCE_KINDS = {
  'successful-4007-page-capacity-rerun-on-selected-runner': 'full-release-capacity-success',
  'all-cn-io-preview-post-build-gates-pass': 'full-release-candidate-validation',
  'full-release-prebuild-state-transition-is-approved': 'full-release-prebuild-transition',
  'coordinated-cn-io-release-controller-binding-is-approved': 'full-release-controller-binding',
  'single-bundle-manifest-and-rollback-artifact-are-recorded': 'full-release-bundle-pair'
};
const POST_BUILD_CHECKS = [
  'sourceData',
  'staticExport',
  'canonical',
  'sitemap',
  'ownerIsolation',
  'contentHygiene',
  'rollback'
];

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`${label} is unreadable: ${error.message}`);
  }
}

function verifyResourcePreflight(contract, observed) {
  const resources = contract.decision.resources;
  assert.equal(observed.nodeMajor, resources.nodeMajor, 'runner Node.js major version drift');
  assert.equal(
    observed.caseSensitiveFilesystem,
    resources.caseSensitiveFilesystem,
    'runner filesystem case sensitivity drift'
  );
  assert(
    observed.logicalCpuCount >= resources.minimumLogicalCpuCount,
    'runner logical CPU count is below the decision floor'
  );
  assert(
    observed.memoryBytes >= resources.minimumMemoryBytes,
    'runner memory is below the decision floor'
  );
  assert(
    observed.freeWorkingDiskBytes >= resources.workingDisk.minimumFreeBytesAtStart,
    'runner free working disk is below the decision floor'
  );
}

function assertDigest(value, label) {
  assert.match(value || '', /^[a-f0-9]{64}$/, `${label} digest is invalid`);
}

function verifyPrerequisiteEvidence(rootDir, prerequisite) {
  const label = `${prerequisite.code} evidence`;
  const kind = PREREQUISITE_EVIDENCE_KINDS[prerequisite.code];
  assert.equal(prerequisite.evidence?.kind, kind, `${label} reference kind drift`);
  assert.match(prerequisite.evidence?.sha256 || '', /^[a-f0-9]{64}$/, `${label} digest is invalid`);
  const evidencePath = path.resolve(rootDir, prerequisite.evidence.path);
  assert(
    evidencePath.startsWith(`${path.resolve(rootDir)}${path.sep}`),
    `${label} path escapes the repository`
  );
  const evidence = readJson(evidencePath, label);
  assert.equal(evidence.schemaVersion, 1, `${label} schema version drift`);
  assert.equal(evidence.issue, 276, `${label} issue binding drift`);
  assert.equal(evidence.kind, kind, `${label} kind drift`);
  assert.equal(evidence.status, 'passed', `${label} status must be passed`);
  assert(Number.isFinite(Date.parse(evidence.recordedAt)), `${label} recordedAt is invalid`);
  assert(
    Date.parse(evidence.recordedAt) <= Date.now(),
    `${label} recordedAt is in the future`
  );
  assert.match(evidence.sourceRevision || '', /^[a-f0-9]{40}$/, `${label} source revision is invalid`);
  assert.equal(evidence.targetPages, 4007, `${label} target page count drift`);
  assert.deepEqual(evidence.variants, VARIANTS, `${label} variant set drift`);
  assertDigest(evidence.candidateBundleSha256, `${label} candidate bundle`);

  if (prerequisite.code === 'successful-4007-page-capacity-rerun-on-selected-runner') {
    assert.deepEqual(
      evidence.variantResults,
      { cn: 'passed', io: 'passed', preview: 'passed' },
      `${label} variant result drift`
    );
    assertDigest(evidence.capacityReportSha256, `${label} capacity report`);
  } else if (prerequisite.code === 'all-cn-io-preview-post-build-gates-pass') {
    assert.deepEqual(Object.keys(evidence.checks || {}), POST_BUILD_CHECKS, `${label} check set drift`);
    for (const check of POST_BUILD_CHECKS) {
      assert.equal(evidence.checks[check], 'passed', `${label} ${check} must be passed`);
    }
  } else if (prerequisite.code === 'full-release-prebuild-state-transition-is-approved') {
    assert.equal(evidence.approved, true, `${label} approval flag drift`);
    assert.match(evidence.approvedBy || '', /\S/, `${label} approver missing`);
    assert.match(evidence.transitionId || '', /\S/, `${label} transition ID missing`);
  } else if (prerequisite.code === 'coordinated-cn-io-release-controller-binding-is-approved') {
    assert.deepEqual(evidence.targets, ['cn', 'io'], `${label} target set drift`);
    assert.equal(evidence.controllerBinding, true, `${label} controller binding drift`);
    assert.match(evidence.controller || '', /\S/, `${label} controller missing`);
  } else if (prerequisite.code === 'single-bundle-manifest-and-rollback-artifact-are-recorded') {
    assert.equal(evidence.candidateBundle?.pageCount, 4007, `${label} candidate page count drift`);
    assert.equal(evidence.candidateBundle?.sourceRevision, evidence.sourceRevision);
    assertDigest(evidence.candidateBundle?.sha256, `${label} candidate bundle`);
    assert.equal(evidence.candidateBundle.sha256, evidence.candidateBundleSha256);
    assert.equal(evidence.baselineBundle?.pageCount, 1422, `${label} baseline page count drift`);
    assert.equal(evidence.baselineBundle?.complete, true, `${label} baseline completeness drift`);
    assertDigest(evidence.baselineBundle?.sha256, `${label} baseline bundle`);
  }
  return evidence;
}

function verifyTechnicalFullReleaseBuildDecision({
  rootDir = ROOT,
  decisionPath = path.join(rootDir, DECISION_RELATIVE_PATH),
  contentPolicyPath = path.join(rootDir, 'src/lib/technical-content-policy.json')
} = {}) {
  const contract = readJson(decisionPath, 'Technical full-release build decision');
  assert.equal(contract.schemaVersion, 1, 'decision schema version drift');
  assert.equal(contract.issue, 276, 'decision issue binding drift');
  assert.equal(contract.status, 'closed', 'decision status must be closed');
  assert.equal(contract.scope, 'decision-contract', 'decision scope drift');
  assert(
    ['blocked', 'ready'].includes(contract.releaseState),
    'full release state must follow prerequisite evidence'
  );
  assert.match(contract.sourceRevision, /^[0-9a-f]{40}$/, 'decision source revision is invalid');

  const evidencePath = path.join(rootDir, contract.evidence.capacityReport.path);
  const evidenceBytes = fs.readFileSync(evidencePath);
  assert.equal(
    sha256(evidenceBytes),
    contract.evidence.capacityReport.sha256,
    'capacity report digest drift'
  );
  const capacity = validateCapacityReport(JSON.parse(evidenceBytes), rootDir);
  assert.equal(
    contract.evidence.capacityReport.issue,
    capacity.issue,
    'capacity issue binding drift'
  );
  assert.equal(
    contract.evidence.capacityReport.sourceRevision,
    capacity.sourceRevision,
    'capacity source revision drift'
  );
  assert.equal(
    contract.evidence.capacityReport.pages,
    capacity.projection.pages,
    'capacity page count drift'
  );
  assert.equal(
    contract.evidence.capacityReport.recordsSha256,
    capacity.projection.recordsSha256,
    'capacity identity digest drift'
  );
  const staleCapacityMeasurement =
    capacity.measurementBinding?.status === 'stale-after-source-normalization';
  const rerunPrerequisite = contract.releasePrerequisites?.find(
    ({ code }) => code === 'successful-4007-page-capacity-rerun-on-selected-runner'
  );
  if (staleCapacityMeasurement && contract.releaseState === 'ready' && rerunPrerequisite?.status === 'passed') {
    assert.equal(
      contract.releaseState,
      'blocked',
      'stale capacity measurement cannot mark the release ready'
    );
    assert.equal(
      rerunPrerequisite?.status,
      'blocked',
      'stale capacity measurement must keep the rerun prerequisite blocked'
    );
  }

  const failedVariants = capacity.variants
    .filter((variant) => variant.buildSucceeded === false && variant.failure.includes('ENOSPC'))
    .map((variant) => variant.variant);
  const maxPeakRssBytes = Math.max(...capacity.variants.map((variant) => variant.peakRssBytes));
  const maxPartialNextBuildBytes = Math.max(
    ...capacity.variants.map((variant) => variant.partialNextBuild.bytes)
  );
  const projectionBytes =
    capacity.projection.registry.bytes +
    capacity.projection.search.zh.bytes +
    capacity.projection.search.en.bytes;
  assert.deepEqual(
    contract.evidence.observedBoundary.failingVariants,
    VARIANTS,
    'observed failing variant set drift'
  );
  assert.deepEqual(failedVariants, VARIANTS, 'capacity evidence must prove three ENOSPC failures');
  assert.equal(
    contract.evidence.observedBoundary.failureCode,
    'ENOSPC',
    'observed failure class drift'
  );
  assert.equal(
    contract.evidence.observedBoundary.maxPeakRssBytes,
    maxPeakRssBytes,
    'observed peak RSS drift'
  );
  assert.equal(
    contract.evidence.observedBoundary.maxPartialNextBuildBytes,
    maxPartialNextBuildBytes,
    'observed partial Next.js build size drift'
  );
  assert.equal(
    contract.evidence.observedBoundary.projectionBytes,
    projectionBytes,
    'observed projection size drift'
  );
  assert.equal(
    contract.evidence.observedBoundary.conclusion,
    'working-storage-boundary',
    'observed capacity conclusion drift'
  );
  const decision = contract.decision;
  assert.equal(decision.path, 'increase-build-resources', 'selected build path drift');
  assert.equal(
    decision.coordinator,
    'npm run verify:release -- --retain-success-artifacts "$RELEASE_STAGING_DIR"',
    'release coordinator command drift'
  );
  assert.deepEqual(
    decision.commands,
    {
      preflight: 'npm run verify:technical-full-release-build-decision -- --preflight-resources',
      build: 'npm run verify:release -- --retain-success-artifacts "$RELEASE_STAGING_DIR"',
      activate:
        'npm run verify:technical-full-release-build-decision -- --verify-bundle "$RELEASE_BUNDLE" "$RELEASE_SOURCE_COMMIT" "$RELEASE_BUNDLE_SHA256" && "$RELEASE_CONTROLLER" activate --artifact "$RELEASE_BUNDLE" --targets cn,io --record-previous "$PREVIOUS_RELEASE_BUNDLE"',
      rollback:
        'npm run verify:technical-full-release-build-decision -- --verify-bundle "$PREVIOUS_RELEASE_BUNDLE" "$PREVIOUS_RELEASE_SOURCE_COMMIT" "$PREVIOUS_RELEASE_BUNDLE_SHA256" && "$RELEASE_CONTROLLER" activate --artifact "$PREVIOUS_RELEASE_BUNDLE" --targets cn,io'
    },
    'release command contract drift'
  );
  assert.equal(decision.resources.nodeMajor, 24, 'runner Node.js major version drift');
  assert.equal(
    decision.resources.caseSensitiveFilesystem,
    true,
    'runner filesystem must be case-sensitive'
  );
  assert(
    decision.resources.minimumLogicalCpuCount >= capacity.environment.logicalCpuCount,
    'runner logical CPU floor is below measured capacity host'
  );
  assert(
    decision.resources.minimumMemoryBytes >= capacity.environment.physicalMemoryBytes,
    'memory headroom is below policy'
  );
  assert(
    decision.resources.minimumMemoryBytes >= maxPeakRssBytes * 1.4,
    'memory headroom is below policy'
  );
  assert(
    decision.resources.workingDisk.minimumFreeBytesAtStart >= maxPartialNextBuildBytes * 4,
    'working disk bootstrap floor is below policy'
  );
  assert.equal(
    decision.resources.workingDisk.successfulCapacityRerunRequired,
    true,
    'successful capacity rerun is required'
  );
  assert(
    decision.resources.workingDisk.postSuccessHeadroomRatio >= 1.25,
    'successful disk measurement headroom is below policy'
  );

  assert.equal(decision.build.sourceCommitCount, 1, 'exactly one source commit is required');
  assert.deepEqual(decision.build.variants, VARIANTS, 'build variant set drift');
  assert.equal(decision.build.parallelism, 1, 'build variants must run sequentially');
  assert.equal(
    decision.build.splitStaticGeneration,
    false,
    'split static generation is outside the selected path'
  );
  assert.equal(decision.build.cleanBetweenVariants, true, 'variant build cleanup is required');
  assert.equal(
    decision.build.sealOnlyAfterEveryVariantPasses,
    true,
    'artifact sealing must follow every variant gate'
  );
  assert.equal(decision.artifact.count, 1, 'exactly one release artifact is required');
  assert.equal(decision.artifact.immutable, true, 'release artifact must be immutable');
  assert.equal(decision.artifact.digestAlgorithm, 'sha256', 'artifact digest algorithm drift');
  assert.deepEqual(
    decision.artifact.layout,
    ['cn/', 'io/', 'preview/', 'manifest.json'],
    'release bundle layout drift'
  );
  assert.equal(
    decision.artifact.sourceRevisionPinned,
    true,
    'release artifact must pin its source revision'
  );
  assert.deepEqual(decision.integrityChecks, INTEGRITY_CHECKS, 'integrity check set drift');

  assert.equal(decision.productionSwitch.count, 1, 'exactly one production switch is required');
  assert.equal(
    decision.productionSwitch.strategy,
    'coordinated-cn-io-artifact-pointer-swap',
    'production switch strategy drift'
  );
  assert.equal(
    decision.productionSwitch.requiresCompleteBundle,
    true,
    'production switch must require a complete bundle'
  );
  assert.deepEqual(
    decision.productionSwitch.productionTargets,
    ['cn', 'io'],
    'production switch target set drift'
  );
  assert.deepEqual(
    decision.productionSwitch.verificationOnlyVariants,
    ['preview'],
    'verification-only variant set drift'
  );
  assert.equal(decision.rollback.strategy, 'previous-complete-artifact', 'rollback strategy drift');
  assert.equal(decision.rollback.command, decision.commands.rollback, 'rollback command drift');
  assert.equal(
    decision.rollback.recordPreviousArtifactBeforeSwitch,
    true,
    'rollback must record the previous artifact before switching'
  );
  assert.equal(
    decision.rollback.verifyPreviousArtifactDigest,
    true,
    'rollback must verify the previous artifact digest'
  );
  assert.equal(decision.rollback.switchCount, 1, 'rollback must use one switch');
  assert.equal(decision.rollback.rebuild, false, 'rollback must reuse a complete artifact');

  assert.deepEqual(
    contract.alternatives.map((alternative) => alternative.path),
    REJECTED_ALTERNATIVES,
    'alternative path set drift'
  );
  contract.alternatives.forEach((alternative) => {
    assert.equal(alternative.disposition, 'rejected', 'unsafe alternative disposition drift');
    assert(alternative.reason, `${alternative.path} rejection reason is required`);
  });
  assert.deepEqual(
    contract.releasePrerequisites.map(({ code }) => code),
    RELEASE_BLOCKERS,
    'full release prerequisite set drift'
  );
  for (const prerequisite of contract.releasePrerequisites) {
    assert(
      ['blocked', 'passed'].includes(prerequisite.status),
      `${prerequisite.code} prerequisite status drift`
    );
    if (prerequisite.status === 'passed') {
      const prerequisitePath = path.resolve(rootDir, prerequisite.evidence?.path || '');
      assert(
        prerequisitePath.startsWith(`${path.resolve(rootDir)}${path.sep}`),
        `${prerequisite.code} evidence path escapes the repository`
      );
      assert.equal(
        sha256(fs.readFileSync(prerequisitePath)),
        prerequisite.evidence.sha256,
        `${prerequisite.code} evidence digest drift`
      );
      verifyPrerequisiteEvidence(rootDir, prerequisite);
    } else {
      assert.equal(prerequisite.evidence, null, `${prerequisite.code} blocked evidence drift`);
    }
  }
  const releaseBlockers = contract.releasePrerequisites
    .filter(({ status }) => status !== 'passed')
    .map(({ code }) => code);
  assert.deepEqual(contract.releaseBlockers, releaseBlockers, 'full release blocker set drift');
  assert.equal(
    contract.releaseState,
    releaseBlockers.length === 0 ? 'ready' : 'blocked',
    'full release state does not match prerequisite evidence'
  );
  if (staleCapacityMeasurement) {
    assert.equal(
      contract.releaseState,
      'blocked',
      'stale capacity measurement cannot mark the release ready'
    );
    assert.equal(
      rerunPrerequisite?.status,
      'blocked',
      'stale capacity measurement must keep the rerun prerequisite blocked'
    );
  }
  const contentPolicy = readJson(contentPolicyPath, 'Technical content policy');
  assert(
    contentPolicy.expectedPageCount < capacity.projection.pages || releaseBlockers.length === 0,
    '4,007-page activation is blocked until every release prerequisite has recorded evidence'
  );

  return {
    issue: contract.issue,
    pages: capacity.projection.pages,
    path: decision.path,
    variants: decision.build.variants,
    releaseArtifacts: decision.artifact.count,
    productionSwitches: decision.productionSwitch.count,
    rollback: decision.rollback.strategy
  };
}

function verifyReleaseBundle(bundlePath, sourceRevision, expectedBundleSha256) {
  assert.match(sourceRevision, /^[a-f0-9]{40}$/, 'release bundle source commit is invalid');
  assert.match(expectedBundleSha256, /^[a-f0-9]{64}$/, 'release bundle digest is invalid');
  const { verifySuccessArtifactBundle } = require('./lib/release-artifacts');
  const manifest = verifySuccessArtifactBundle(bundlePath, sourceRevision, VARIANTS);
  assert.equal(manifest.bundleSha256, expectedBundleSha256, 'release bundle digest drift');
  return manifest;
}

if (require.main === module) {
  try {
    const contract = readJson(
      path.join(ROOT, DECISION_RELATIVE_PATH),
      'Technical full-release build decision'
    );
    const args = process.argv.slice(2);
    if (args[0] === '--preflight-resources' && args.length === 1) {
      const filesystem = fs.statfsSync(ROOT);
      require('./lib/release-artifacts').assertCaseSensitiveFilesystem();
      verifyResourcePreflight(contract, {
        nodeMajor: Number(process.versions.node.split('.')[0]),
        caseSensitiveFilesystem: true,
        logicalCpuCount: os.cpus().length,
        memoryBytes: os.totalmem(),
        freeWorkingDiskBytes: Number(filesystem.bavail) * Number(filesystem.bsize)
      });
    } else if (args[0] === '--verify-bundle' && args.length === 4) {
      verifyReleaseBundle(path.resolve(args[1]), args[2], args[3]);
    } else if (args.length) {
      throw new Error(`Unknown option: ${args[0]}`);
    }
    const result = verifyTechnicalFullReleaseBuildDecision();
    console.log(
      `[verify-technical-full-release-build-decision] decision passed: pages=${result.pages} path=${result.path} artifact=${result.releaseArtifacts} switch=${result.productionSwitches}`
    );
  } catch (error) {
    console.error(`[verify-technical-full-release-build-decision] ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  DECISION_RELATIVE_PATH,
  verifyPrerequisiteEvidence,
  verifyReleaseBundle,
  verifyResourcePreflight,
  verifyTechnicalFullReleaseBuildDecision
};
