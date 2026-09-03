#!/usr/bin/env node

/** Verify the issue #276 one-shot Technical Center release build decision. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
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

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`${label} is unreadable: ${error.message}`);
  }
}

function verifyTechnicalFullReleaseBuildDecision({
  rootDir = ROOT,
  decisionPath = path.join(rootDir, DECISION_RELATIVE_PATH)
} = {}) {
  const contract = readJson(decisionPath, 'Technical full-release build decision');
  assert.equal(contract.schemaVersion, 1);
  assert.equal(contract.issue, 276);
  assert.equal(contract.status, 'closed');
  assert.match(contract.sourceRevision, /^[0-9a-f]{40}$/);

  const evidencePath = path.join(rootDir, contract.evidence.capacityReport.path);
  const evidenceBytes = fs.readFileSync(evidencePath);
  assert.equal(
    sha256(evidenceBytes),
    contract.evidence.capacityReport.sha256,
    'capacity report digest drift'
  );
  const capacity = validateCapacityReport(JSON.parse(evidenceBytes), rootDir);
  assert.equal(contract.evidence.capacityReport.issue, capacity.issue);
  assert.equal(contract.evidence.capacityReport.sourceRevision, capacity.sourceRevision);
  assert.equal(contract.evidence.capacityReport.pages, capacity.projection.pages);
  assert.equal(contract.evidence.capacityReport.recordsSha256, capacity.projection.recordsSha256);

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
  assert.deepEqual(contract.evidence.observedBoundary.failingVariants, VARIANTS);
  assert.deepEqual(
    failedVariants,
    VARIANTS,
    'capacity evidence no longer proves three ENOSPC failures'
  );
  assert.equal(contract.evidence.observedBoundary.failureCode, 'ENOSPC');
  assert.equal(contract.evidence.observedBoundary.maxPeakRssBytes, maxPeakRssBytes);
  assert.equal(
    contract.evidence.observedBoundary.maxPartialNextBuildBytes,
    maxPartialNextBuildBytes
  );
  assert.equal(contract.evidence.observedBoundary.projectionBytes, projectionBytes);
  assert.equal(contract.evidence.observedBoundary.conclusion, 'working-storage-boundary');

  const decision = contract.decision;
  assert.equal(decision.path, 'increase-build-resources');
  assert.equal(
    decision.coordinator,
    'npm run verify:release -- --retain-success-artifacts <staging-directory>'
  );
  assert.deepEqual(decision.commands, {
    preflight: 'npm run verify:technical-full-release-build-decision',
    build: 'npm run verify:release -- --retain-success-artifacts <staging-directory>',
    activate: 'kubectl set image deployment/fastgpt-home fastgpt-home=<immutable-artifact-image>',
    rollback:
      'kubectl set image deployment/fastgpt-home fastgpt-home=<previous-complete-artifact-image>'
  });
  assert.equal(decision.resources.nodeMajor, 24);
  assert.equal(decision.resources.caseSensitiveFilesystem, true);
  assert(decision.resources.minimumLogicalCpuCount >= capacity.environment.logicalCpuCount);
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
  assert(decision.resources.workingDisk.postSuccessHeadroomRatio >= 1.25);
  assert(decision.resources.workingDisk.finalMinimumRule);

  assert.equal(decision.build.sourceCommitCount, 1);
  assert.deepEqual(decision.build.variants, VARIANTS);
  assert.equal(decision.build.parallelism, 1);
  assert.equal(
    decision.build.splitStaticGeneration,
    false,
    'split static generation is outside the selected path'
  );
  assert.equal(decision.build.cleanBetweenVariants, true);
  assert.equal(decision.build.sealOnlyAfterEveryVariantPasses, true);
  assert.equal(decision.artifact.count, 1, 'exactly one release artifact is required');
  assert.equal(decision.artifact.immutable, true);
  assert.equal(decision.artifact.digestAlgorithm, 'sha256');
  assert.deepEqual(decision.artifact.layout, ['cn/out', 'io/out', 'preview/out', 'manifest.json']);
  assert.equal(decision.artifact.sourceRevisionPinned, true);
  assert.deepEqual(decision.integrityChecks, INTEGRITY_CHECKS);

  assert.equal(decision.productionSwitch.count, 1);
  assert.equal(decision.productionSwitch.strategy, 'artifact-id-pointer-swap');
  assert.equal(decision.productionSwitch.requiresCompleteBundle, true);
  assert.deepEqual(decision.productionSwitch.variants, VARIANTS);
  assert.equal(decision.rollback.strategy, 'previous-complete-artifact');
  assert.equal(decision.rollback.command, decision.commands.rollback);
  assert.equal(decision.rollback.recordPreviousArtifactBeforeSwitch, true);
  assert.equal(decision.rollback.verifyPreviousArtifactDigest, true);
  assert.equal(decision.rollback.switchCount, 1);
  assert.equal(decision.rollback.rebuild, false);

  assert.deepEqual(
    contract.alternatives.map((alternative) => alternative.path),
    REJECTED_ALTERNATIVES
  );
  contract.alternatives.forEach((alternative) => {
    assert.equal(alternative.disposition, 'rejected', 'unsafe alternative disposition drift');
    assert(alternative.reason, `${alternative.path} rejection reason is required`);
  });
  assert(
    contract.releaseBlockers.includes('successful-4007-page-capacity-rerun-on-selected-runner')
  );
  assert(contract.releaseBlockers.includes('all-cn-io-preview-post-build-gates-pass'));
  assert(contract.releaseBlockers.includes('full-release-prebuild-state-transition-is-approved'));
  assert(contract.releaseBlockers.includes('io-and-preview-artifact-publication-path-is-approved'));
  assert(
    contract.releaseBlockers.includes('single-bundle-manifest-and-rollback-artifact-are-recorded')
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

if (require.main === module) {
  try {
    const result = verifyTechnicalFullReleaseBuildDecision();
    console.log(
      `[verify-technical-full-release-build-decision] decision passed: pages=${result.pages} path=${result.path} artifact=${result.releaseArtifacts} switch=${result.productionSwitches}`
    );
  } catch (error) {
    console.error(`[verify-technical-full-release-build-decision] ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { DECISION_RELATIVE_PATH, verifyTechnicalFullReleaseBuildDecision };
