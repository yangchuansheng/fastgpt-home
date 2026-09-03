#!/usr/bin/env node

/** Verify the issue #277 Technical Center production switch window and role contract. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { sha256, stableJson } = require('./lib/technical-authority');

const ROOT = path.resolve(__dirname, '..');
const CONTRACT_RELATIVE_PATH =
  'scripts/fixtures/technical-authority/full-release-production-switch.json';
const ROLE_BINDINGS = {
  mergeApproval: 'release-manager',
  productionApproval: 'production-owner',
  deployment: 'release-engineer',
  seoObservation: 'seo-owner',
  incidentCommand: 'incident-commander',
  rollbackExecution: 'release-engineer',
  onCallHandoff: 'site-reliability-on-call'
};
const APPROVAL_ORDER = ['mergeApproval', 'productionApproval', 'deployment', 'seoObservation'];
const PHASES = [
  { name: 'preflight-and-handoff', startMinute: 0, endMinute: 15 },
  { name: 'coordinated-pointer-swap', startMinute: 15, endMinute: 20 },
  { name: 'owner-smoke-verification', startMinute: 20, endMinute: 45 },
  { name: 'stabilization-observation', startMinute: 45, endMinute: 120 }
];
const HANDOFF_RECIPIENTS = ['seo-owner', 'site-reliability-on-call', 'incident-commander'];
const HANDOFF_INPUTS = [
  'candidate-source-revision',
  'candidate-bundle-path-and-sha256',
  'previous-baseline-bundle-path-and-sha256',
  'maintenance-window-start-and-end',
  'role-assignee-and-contact-roster',
  'observation-dashboard-and-evidence-path',
  'rollback-command'
];
const REQUIRED_CHECKS = [
  'http-status',
  'self-canonical',
  'sitemap-membership',
  'owner-isolation',
  'content-hygiene',
  'search-canonical-selection'
];
const INCIDENT_THRESHOLDS = [
  { metric: 'release-bundle-or-source-mismatch', operator: '>=', value: 1 },
  { metric: 'owner-unavailable', operator: '>=', value: 1 },
  { metric: 'candidate-http-404', operator: '>=', value: 1 },
  { metric: 'candidate-http-5xx-rate-percent', operator: '>=', value: 1 },
  { metric: 'canonical-mismatch', operator: '>=', value: 1 },
  { metric: 'sitemap-missing', operator: '>=', value: 1 },
  { metric: 'owner-isolation-failure', operator: '>=', value: 1 },
  { metric: 'content-hygiene-finding', operator: '>=', value: 1 }
];
const PREREQUISITES = [
  'successful-4007-page-capacity-rerun',
  'complete-source-and-export-validation',
  'single-candidate-and-baseline-bundles-recorded',
  'named-role-roster-recorded',
  'merge-and-production-approvals-recorded',
  'maintenance-window-approved',
  'on-call-handoff-recorded',
  'production-observation-evidence-recorded',
  'search-observation-evidence-recorded'
];
const PRE_SWITCH_PREREQUISITES = PREREQUISITES.slice(0, 7);
const POST_SWITCH_PREREQUISITES = PREREQUISITES.slice(7);
const STALE_CAPACITY_RERUN_BLOCKER = 'successful-4007-page-capacity-rerun';
const EVIDENCE_KINDS = {
  'successful-4007-page-capacity-rerun': 'full-release-capacity-success',
  'complete-source-and-export-validation': 'full-release-candidate-validation',
  'single-candidate-and-baseline-bundles-recorded': 'full-release-bundle-pair',
  'named-role-roster-recorded': 'full-release-role-roster',
  'merge-and-production-approvals-recorded': 'full-release-approvals',
  'maintenance-window-approved': 'full-release-maintenance-window',
  'on-call-handoff-recorded': 'full-release-on-call-handoff',
  'production-observation-evidence-recorded': 'full-release-production-observation',
  'search-observation-evidence-recorded': 'full-release-search-observation'
};
const VALIDATION_CHECKS = [
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

function verifyArtifact(rootDir, artifact, label) {
  assert.match(artifact?.sha256 || '', /^[a-f0-9]{64}$/, `${label} digest is invalid`);
  const artifactPath = path.resolve(rootDir, artifact?.path || '');
  assert(
    artifactPath.startsWith(`${path.resolve(rootDir)}${path.sep}`),
    `${label} path escapes the repository`
  );
  const bytes = fs.readFileSync(artifactPath);
  assert.equal(sha256(bytes), artifact.sha256, `${label} digest drift`);
  try {
    return JSON.parse(bytes);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

function assertTimestamp(value, label) {
  assert(Number.isFinite(Date.parse(value)), `${label} timestamp is invalid`);
}

function assertDigest(value, label) {
  assert.match(value || '', /^[a-f0-9]{64}$/, `${label} digest is invalid`);
}

function assertWindow(startedAt, endedAt, minimumHours, label) {
  assertTimestamp(startedAt, `${label} start`);
  assertTimestamp(endedAt, `${label} end`);
  assert(
    Date.parse(endedAt) - Date.parse(startedAt) >= minimumHours * 3_600_000,
    `${label} is shorter than ${minimumHours} hours`
  );
}

function assertAtOrBefore(value, latest, label) {
  assertTimestamp(value, label);
  assert(Date.parse(value) <= latest, `${label} occurs after its allowed boundary`);
}

function assertBetween(value, earliest, latest, label) {
  assertTimestamp(value, label);
  const observed = Date.parse(value);
  assert(
    observed >= earliest && observed < latest,
    `${label} is outside the maintenance pre-switch phase`
  );
}

function verifyActivationCandidate(
  bundleEvidence,
  sourceRevision,
  bundleSha256,
  window,
  observedAt = Date.now()
) {
  assert.match(sourceRevision || '', /^[a-f0-9]{40}$/, 'activation source revision is invalid');
  assertDigest(bundleSha256, 'activation bundle');
  assert.equal(
    sourceRevision,
    bundleEvidence.candidateSourceRevision,
    'activation source revision differs from approved evidence'
  );
  assert.equal(
    bundleSha256,
    bundleEvidence.candidateBundle.sha256,
    'activation bundle digest differs from approved evidence'
  );
  const activationTime = typeof observedAt === 'number' ? observedAt : Date.parse(observedAt);
  assert(Number.isFinite(activationTime), 'activation time is invalid');
  assert(
    activationTime >= Date.parse(window.startsAt) + 15 * 60_000 &&
      activationTime < Date.parse(window.endsAt),
    'activation time is outside the approved deployment interval'
  );
}

function verifyPrerequisiteEvidence(code, reference, evidence, context) {
  const label = `${code} evidence`;
  assert.equal(reference.kind, EVIDENCE_KINDS[code], `${label} reference kind drift`);
  assert.equal(evidence.schemaVersion, 1, `${label} schema version drift`);
  assert.equal(evidence.issue, 277, `${label} issue binding drift`);
  assert.equal(evidence.kind, EVIDENCE_KINDS[code], `${label} kind drift`);
  assert.equal(evidence.status, 'passed', `${label} status must be passed`);
  assertTimestamp(evidence.recordedAt, `${label} recordedAt`);
  assert.match(
    evidence.candidateSourceRevision || '',
    /^[a-f0-9]{40}$/,
    `${label} candidate source revision is invalid`
  );
  assertDigest(evidence.candidateBundleSha256, `${label} candidate bundle`);

  if (code === 'successful-4007-page-capacity-rerun') {
    assert.equal(evidence.targetPages, 4007, `${label} target page count drift`);
    assert.deepEqual(
      evidence.variants,
      { cn: 'passed', io: 'passed', preview: 'passed' },
      `${label} variant result drift`
    );
  } else if (code === 'complete-source-and-export-validation') {
    assert.equal(evidence.targetPages, 4007, `${label} target page count drift`);
    assert.deepEqual(
      Object.keys(evidence.checks || {}),
      VALIDATION_CHECKS,
      `${label} check set drift`
    );
    for (const check of VALIDATION_CHECKS) {
      assert.equal(evidence.checks[check], 'passed', `${label} ${check} must be passed`);
    }
  } else if (code === 'single-candidate-and-baseline-bundles-recorded') {
    assert.equal(evidence.candidateBundle?.pageCount, 4007, `${label} candidate page count drift`);
    assert.deepEqual(evidence.candidateBundle?.variants, ['cn', 'io', 'preview']);
    assert.equal(
      evidence.candidateBundle?.sourceRevision,
      evidence.candidateSourceRevision,
      `${label} candidate source revision drift`
    );
    assert.match(
      evidence.candidateBundle?.path || '',
      /\S/,
      `${label} candidate bundle path missing`
    );
    assertDigest(evidence.candidateBundle?.sha256, `${label} candidate bundle`);
    assert.equal(
      evidence.candidateBundle.sha256,
      evidence.candidateBundleSha256,
      `${label} candidate bundle digest drift`
    );
    assert.equal(evidence.baselineBundle?.pageCount, 1422, `${label} baseline page count drift`);
    assert.match(
      evidence.baselineBundle?.path || '',
      /\S/,
      `${label} baseline bundle path missing`
    );
    assertDigest(evidence.baselineBundle?.sha256, `${label} baseline bundle`);
  } else if (code === 'named-role-roster-recorded') {
    assert.deepEqual(
      Object.keys(evidence.assignments || {}),
      Object.keys(ROLE_BINDINGS),
      `${label} assignment set drift`
    );
    for (const [name, role] of Object.entries(ROLE_BINDINGS)) {
      assert.equal(evidence.assignments[name]?.role, role, `${label} ${name} role drift`);
      assert.match(
        evidence.assignments[name]?.assignee || '',
        /\S/,
        `${label} ${name} assignee missing`
      );
      assert.match(
        evidence.assignments[name]?.contact || '',
        /\S/,
        `${label} ${name} contact missing`
      );
    }
  } else if (code === 'merge-and-production-approvals-recorded') {
    const approvalTimes = [];
    for (const [name, role] of [
      ['merge', 'release-manager'],
      ['production', 'production-owner']
    ]) {
      assert.equal(evidence.approvals?.[name]?.role, role, `${label} ${name} role drift`);
      assert.equal(evidence.approvals?.[name]?.status, 'approved', `${label} ${name} status drift`);
      assert.match(
        evidence.approvals?.[name]?.approver || '',
        /\S/,
        `${label} ${name} approver missing`
      );
      assertTimestamp(evidence.approvals?.[name]?.approvedAt, `${label} ${name} approvedAt`);
      approvalTimes.push(Date.parse(evidence.approvals[name].approvedAt));
    }
    assert(approvalTimes[0] <= approvalTimes[1], `${label} approval order drift`);
    for (const [index, name] of ['merge', 'production'].entries()) {
      assertBetween(
        evidence.approvals[name].approvedAt,
        Date.parse(context.window.startsAt),
        Date.parse(context.window.startsAt) + 15 * 60_000,
        `${label} ${name} approvedAt`
      );
      assert.equal(approvalTimes[index], Date.parse(evidence.approvals[name].approvedAt));
    }
  } else if (code === 'maintenance-window-approved') {
    assert.equal(evidence.timezone, context.window.timezone, `${label} timezone drift`);
    assert.equal(evidence.startsAt, context.window.startsAt, `${label} start drift`);
    assert.equal(evidence.endsAt, context.window.endsAt, `${label} end drift`);
    assert.equal(evidence.durationMinutes, 120, `${label} duration drift`);
    assert.deepEqual(evidence.productionTargets, ['cn', 'io'], `${label} target drift`);
    assert.match(evidence.approvedBy || '', /\S/, `${label} approver missing`);
    assertAtOrBefore(
      evidence.approvedAt,
      Date.parse(context.window.startsAt),
      `${label} approvedAt`
    );
  } else if (code === 'on-call-handoff-recorded') {
    assert.equal(evidence.fromRole, 'release-engineer', `${label} sender drift`);
    assert.deepEqual(evidence.toRoles, HANDOFF_RECIPIENTS, `${label} recipient drift`);
    assert.deepEqual(evidence.acceptedInputs, HANDOFF_INPUTS, `${label} input drift`);
    assertBetween(
      evidence.completedAt,
      Date.parse(context.window.startsAt),
      Date.parse(context.window.startsAt) + 15 * 60_000,
      `${label} completedAt`
    );
  } else if (code === 'production-observation-evidence-recorded') {
    assert.equal(evidence.source, 'live-http', `${label} source drift`);
    assert.equal(evidence.candidateCanonicalCount, 2585, `${label} canonical count drift`);
    assert.equal(
      evidence.identitySetSha256,
      context.identitySetSha256,
      `${label} identity digest drift`
    );
    assert.deepEqual(evidence.ownerCounts, { cn: 2095, io: 490 }, `${label} owner count drift`);
    assertWindow(evidence.startedAt, evidence.endedAt, 72, `${label} window`);
    assert(
      Date.parse(evidence.recordedAt) >= Date.parse(evidence.endedAt),
      `${label} was recorded before its observation window ended`
    );
    assert(
      Date.parse(evidence.startedAt) >= Date.parse(context.window.startsAt) + 20 * 60_000,
      `${label} starts before the coordinated pointer swap completes`
    );
    assert.deepEqual(evidence.statusCounts, { 200: 2585 }, `${label} HTTP status drift`);
    for (const [field, expected] of [
      ['redirects', 0],
      ['canonicalChecked', 2585],
      ['canonicalMismatches', 0],
      ['sitemapMembership', 2585],
      ['sitemapMissing', 0],
      ['ownerIsolationChecked', 2585],
      ['ownerIsolationFailures', 0],
      ['contentHygieneFindings', 0]
    ]) {
      assert.equal(evidence[field], expected, `${label} ${field} drift`);
    }
  } else if (code === 'search-observation-evidence-recorded') {
    assert.equal(evidence.source, 'google-search-console', `${label} source drift`);
    assert.equal(evidence.observedCanonicalCount, 2585, `${label} canonical count drift`);
    assert.equal(
      evidence.identitySetSha256,
      context.identitySetSha256,
      `${label} identity digest drift`
    );
    assert.deepEqual(evidence.ownerCounts, { cn: 2095, io: 490 }, `${label} owner count drift`);
    assertWindow(evidence.startedAt, evidence.endedAt, 14 * 24, `${label} window`);
    assert(
      Date.parse(evidence.recordedAt) >= Date.parse(evidence.endedAt),
      `${label} was recorded before its observation window ended`
    );
    assert(
      Date.parse(evidence.startedAt) >= Date.parse(context.window.startsAt) + 20 * 60_000,
      `${label} starts before the coordinated pointer swap completes`
    );
    for (const field of [
      'canonicalSelectionMismatches',
      'duplicatePages',
      'excludedPages',
      'crawlAnomalies'
    ]) {
      assert.equal(evidence[field], 0, `${label} ${field} drift`);
    }
  }

  return {
    sourceRevision: evidence.candidateSourceRevision,
    bundleSha256: evidence.candidateBundleSha256
  };
}

function evaluateMajorIncident(contract, metrics) {
  const triggeredMetrics = [];
  for (const threshold of contract.majorIncident.thresholds) {
    const observed = metrics?.[threshold.metric];
    assert(
      Number.isFinite(observed) && observed >= 0,
      `incident metric ${threshold.metric} must be a non-negative number`
    );
    if (observed >= threshold.value) triggeredMetrics.push(threshold.metric);
  }
  return {
    majorIncident: triggeredMetrics.length > 0,
    triggeredMetrics,
    authorizationRole: contract.majorIncident.authorizationRole,
    command: triggeredMetrics.length ? contract.baselineRestore.command : null
  };
}

function verifyTechnicalFullReleaseProductionSwitch({
  rootDir = ROOT,
  contractPath = path.join(rootDir, CONTRACT_RELATIVE_PATH),
  requireReady = false,
  expectedSourceRevision,
  expectedBundleSha256
} = {}) {
  const contract = readJson(contractPath, 'Technical full-release production switch contract');
  assert.equal(contract.schemaVersion, 1, 'production switch schema version drift');
  assert.equal(contract.issue, 277, 'production switch issue binding drift');
  assert.equal(contract.status, 'closed', 'production switch contract must be closed');
  assert.equal(
    contract.scope,
    'production-switch-window-and-roles',
    'production switch scope drift'
  );
  assert(
    ['blocked', 'ready'].includes(contract.releaseState),
    'production switch release state is invalid'
  );
  assert(['blocked', 'ready'].includes(contract.switchState), 'production switch state is invalid');
  assert(
    ['blocked', 'ready'].includes(contract.observationState),
    'production observation state is invalid'
  );

  const closure = verifyArtifact(rootDir, contract.lineage?.identityClosure, 'identity closure');
  assert.equal(contract.lineage.identityClosure.issue, 274, 'identity closure issue binding drift');
  assert.equal(closure.issue?.number, 274, 'identity closure source issue drift');
  assert.deepEqual(closure.counts, { baseline: 1422, pending: 2585, target: 4007 });
  assert.equal(closure.records?.length, 2585, 'identity closure candidate count drift');
  assert.equal(new Set(closure.records.map(({ identityKey }) => identityKey)).size, 2585);
  assert.equal(
    contract.lineage.identityClosure.recordsSha256,
    closure.recordsSha256,
    'identity closure records digest drift'
  );
  assert.deepEqual(
    {
      baseline: contract.lineage.identityClosure.baselinePages,
      pending: contract.lineage.identityClosure.candidatePages,
      target: contract.lineage.identityClosure.targetPages
    },
    closure.counts,
    'identity closure count binding drift'
  );

  const buildDecision = verifyArtifact(rootDir, contract.lineage?.buildDecision, 'build decision');
  assert.equal(contract.lineage.buildDecision.issue, 276, 'build decision issue binding drift');
  assert.equal(buildDecision.issue, 276, 'build decision source issue drift');
  assert.equal(
    contract.lineage.buildDecision.sourceRevision,
    buildDecision.sourceRevision,
    'build decision source revision drift'
  );
  assert.equal(
    contract.lineage.buildDecision.targetPages,
    buildDecision.evidence?.capacityReport?.pages,
    'build decision target page count drift'
  );
  assert.equal(
    contract.lineage.buildDecision.decision,
    buildDecision.decision?.path,
    'build decision path drift'
  );
  assert.equal(buildDecision.decision?.path, 'increase-build-resources');
  const capacityReport = verifyArtifact(
    rootDir,
    buildDecision.evidence?.capacityReport,
    'build decision capacity report'
  );
  const staleCapacityMeasurement =
    capacityReport.measurementBinding?.status === 'stale-after-source-normalization';

  assert.deepEqual(Object.keys(contract.roles || {}), Object.keys(ROLE_BINDINGS), 'role set drift');
  for (const [name, accountableRole] of Object.entries(ROLE_BINDINGS)) {
    assert.equal(
      contract.roles[name]?.accountableRole,
      accountableRole,
      `${name} role binding drift`
    );
    assert.match(
      contract.roles[name]?.responsibility || '',
      /\S/,
      `${name} responsibility missing`
    );
  }
  assert.deepEqual(contract.approvalOrder, APPROVAL_ORDER, 'approval order drift');

  const window = contract.maintenanceWindow || {};
  assert.equal(window.strategy, 'single-coordinated-cn-io-window');
  assert.equal(window.timezone, 'Asia/Shanghai', 'maintenance window timezone drift');
  assert.equal(window.durationMinutes, 120, 'maintenance window duration drift');
  assert.deepEqual(
    window.productionTargets,
    ['cn', 'io'],
    'maintenance window production targets drift'
  );
  assert.deepEqual(window.verificationOnlyVariants, ['preview']);
  assert.equal(window.switchCount, 1, 'maintenance window switch count drift');
  assert.deepEqual(window.phases, PHASES, 'maintenance window phase drift');
  assert(
    ['pending-approval', 'approved'].includes(window.scheduleState),
    'maintenance window schedule state drift'
  );
  const startsAt = Date.parse(window.startsAt);
  const endsAt = Date.parse(window.endsAt);
  assert(
    Number.isFinite(startsAt) && endsAt - startsAt === window.durationMinutes * 60_000,
    'candidate maintenance window timestamps are invalid'
  );

  assert.equal(contract.handoff?.fromRole, 'release-engineer', 'handoff sender drift');
  assert.deepEqual(contract.handoff?.toRoles, HANDOFF_RECIPIENTS, 'handoff recipient drift');
  assert.equal(contract.handoff?.mustCompleteBefore, 'coordinated-pointer-swap');
  assert.deepEqual(contract.handoff?.requiredInputs, HANDOFF_INPUTS, 'handoff input drift');

  const localeCounts = closure.records.reduce(
    (counts, { locale }) => ({ ...counts, [locale]: (counts[locale] || 0) + 1 }),
    { zh: 0, en: 0 }
  );
  const observation = contract.observation || {};
  assert.equal(observation.accountableRole, 'seo-owner', 'observation role drift');
  assert.equal(
    observation.candidateCanonicalCount,
    closure.counts.pending,
    'candidate canonical count drift'
  );
  assert.deepEqual(
    observation.ownerCounts,
    { cn: localeCounts.zh, io: localeCounts.en },
    'observation owner count drift'
  );
  assert.equal(
    observation.identitySetSha256,
    sha256(stableJson(closure.records.map(({ identityKey }) => identityKey))),
    'observation identity digest drift'
  );
  assert.equal(observation.productionWindowHours, 72, 'production observation window drift');
  assert.equal(observation.searchWindowHours, 14 * 24, 'search observation window drift');
  assert.deepEqual(observation.checkpointsMinutesAfterSwitch, [15, 120, 1440, 4320, 20160]);
  assert.deepEqual(observation.requiredChecks, REQUIRED_CHECKS, 'observation check set drift');

  assert.equal(contract.majorIncident?.triggerMode, 'any-threshold');
  assert.equal(contract.majorIncident?.authorizationRole, 'incident-commander');
  assert.equal(contract.majorIncident?.executionRole, 'release-engineer');
  assert.equal(
    contract.majorIncident?.evaluationCommand,
    'npm run verify:technical-full-release-production-switch -- --evaluate-incident "$INCIDENT_METRICS_JSON"'
  );
  assert.deepEqual(
    contract.majorIncident?.thresholds,
    INCIDENT_THRESHOLDS,
    'major incident threshold drift'
  );

  assert.equal(contract.activation?.gate, 'switchState', 'activation gate drift');
  assert.equal(
    contract.activation?.command,
    `npm run verify:technical-full-release-production-switch -- --require-ready "$RELEASE_SOURCE_COMMIT" "$RELEASE_BUNDLE_SHA256" && ${buildDecision.decision.commands.activate}`,
    'activation command drift'
  );

  const restore = contract.baselineRestore || {};
  assert.equal(restore.pageCount, closure.counts.baseline, 'baseline restore page count drift');
  assert.equal(restore.strategy, 'previous-complete-artifact');
  assert.equal(
    restore.command,
    buildDecision.decision.rollback.command,
    'baseline restore command drift'
  );
  assert.equal(restore.authorizationRole, 'incident-commander');
  assert.equal(restore.executionRole, 'release-engineer');
  assert.equal(restore.verificationRole, 'seo-owner');
  assert.equal(restore.switchCount, 1);
  assert.equal(
    restore.rebuild,
    false,
    'baseline restore must reuse the previous complete artifact'
  );

  assert.deepEqual(
    contract.releasePrerequisites?.map(({ code }) => code),
    PREREQUISITES,
    'release prerequisite set drift'
  );
  assert.deepEqual(
    contract.releasePrerequisites?.map(({ phase }) => phase),
    PREREQUISITES.map((code) =>
      PRE_SWITCH_PREREQUISITES.includes(code) ? 'pre-switch' : 'post-switch'
    ),
    'release prerequisite phase drift'
  );
  const candidateSourceRevisions = [];
  const candidateBundleDigests = [];
  const evidenceByCode = new Map();
  for (const prerequisite of contract.releasePrerequisites) {
    assert(
      ['blocked', 'passed'].includes(prerequisite.status),
      `${prerequisite.code} prerequisite status drift`
    );
    if (prerequisite.status === 'passed') {
      const evidence = verifyArtifact(
        rootDir,
        prerequisite.evidence,
        `${prerequisite.code} evidence`
      );
      evidenceByCode.set(prerequisite.code, evidence);
      const binding = verifyPrerequisiteEvidence(
        prerequisite.code,
        prerequisite.evidence,
        evidence,
        {
          identitySetSha256: observation.identitySetSha256,
          window
        }
      );
      candidateSourceRevisions.push(binding.sourceRevision);
      candidateBundleDigests.push(binding.bundleSha256);
    } else {
      assert.equal(prerequisite.evidence, null, `${prerequisite.code} blocked evidence drift`);
    }
  }
  assert(
    new Set(candidateSourceRevisions).size <= 1,
    'prerequisite evidence candidate source revision drift'
  );
  assert(
    new Set(candidateBundleDigests).size <= 1,
    'prerequisite evidence candidate bundle digest drift'
  );
  const prerequisiteByCode = new Map(
    contract.releasePrerequisites.map((prerequisite) => [prerequisite.code, prerequisite])
  );
  if (staleCapacityMeasurement) {
    assert.equal(
      prerequisiteByCode.get(STALE_CAPACITY_RERUN_BLOCKER)?.status,
      'blocked',
      'stale capacity measurement must keep the rerun prerequisite blocked'
    );
    assert(
      contract.switchBlockers.includes(STALE_CAPACITY_RERUN_BLOCKER),
      'stale capacity measurement must block the production switch'
    );
  }
  for (const [field, code] of [
    ['productionEvidence', 'production-observation-evidence-recorded'],
    ['searchEvidence', 'search-observation-evidence-recorded']
  ]) {
    const prerequisite = prerequisiteByCode.get(code);
    if (prerequisite.status === 'passed') {
      assert.deepEqual(observation[field], prerequisite.evidence, `${field} binding drift`);
    } else {
      assert.equal(
        observation[field],
        null,
        `${
          field === 'productionEvidence' ? 'production' : 'search'
        } evidence must be null until an auditable artifact is recorded`
      );
    }
  }
  const blockers = contract.releasePrerequisites
    .filter(({ status }) => status !== 'passed')
    .map(({ code }) => code);
  const switchBlockers = blockers.filter((code) => PRE_SWITCH_PREREQUISITES.includes(code));
  const observationBlockers = blockers.filter((code) => POST_SWITCH_PREREQUISITES.includes(code));
  assert.equal(contract.activationGate, 'switchState', 'release activation gate drift');
  assert.deepEqual(contract.switchBlockers, switchBlockers, 'switch blocker set drift');
  assert.deepEqual(
    contract.observationBlockers,
    observationBlockers,
    'observation blocker set drift'
  );
  assert.deepEqual(contract.releaseBlockers, blockers, 'release blocker set drift');
  assert.equal(
    contract.switchState,
    switchBlockers.length === 0 ? 'ready' : 'blocked',
    'switch state does not match pre-switch evidence'
  );
  assert.equal(
    contract.observationState,
    observationBlockers.length === 0 ? 'ready' : 'blocked',
    'observation state does not match post-switch evidence'
  );
  assert.equal(
    contract.releaseState,
    blockers.length === 0 ? 'ready' : 'blocked',
    'release state does not match prerequisite evidence'
  );
  if (prerequisiteByCode.get('maintenance-window-approved').status === 'passed') {
    assert.equal(
      window.scheduleState,
      'approved',
      'passed maintenance window evidence requires a schedule'
    );
  }
  if (requireReady && contract.switchState !== 'ready') {
    throw new Error(`production switch is blocked: ${switchBlockers.join(', ')}`);
  }
  if (requireReady) {
    verifyActivationCandidate(
      evidenceByCode.get('single-candidate-and-baseline-bundles-recorded'),
      expectedSourceRevision,
      expectedBundleSha256,
      window
    );
  }

  return {
    issue: contract.issue,
    switchState: contract.switchState,
    observationState: contract.observationState,
    releaseState: contract.releaseState,
    targetPages: closure.counts.target,
    candidateCanonicals: closure.counts.pending,
    maintenanceWindowMinutes: window.durationMinutes,
    blockers: blockers.length,
    switchBlockers: switchBlockers.length,
    observationBlockers: observationBlockers.length
  };
}

if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    const requireReady = args.length === 3 && args[0] === '--require-ready';
    const incidentMetricsPath =
      args.length === 2 && args[0] === '--evaluate-incident' ? args[1] : undefined;
    if (args.length && !requireReady && !incidentMetricsPath) {
      throw new Error(`Unknown option: ${args[0]}`);
    }
    const result = verifyTechnicalFullReleaseProductionSwitch({
      requireReady,
      expectedSourceRevision: requireReady ? args[1] : undefined,
      expectedBundleSha256: requireReady ? args[2] : undefined
    });
    if (incidentMetricsPath) {
      const contract = readJson(
        path.join(ROOT, CONTRACT_RELATIVE_PATH),
        'Technical full-release production switch contract'
      );
      const metrics = readJson(path.resolve(incidentMetricsPath), 'Incident metrics');
      const incident = evaluateMajorIncident(contract, metrics);
      console.log(`TECHNICAL_FULL_RELEASE_INCIDENT_RESULT=${JSON.stringify(incident)}`);
      if (incident.majorIncident) {
        throw new Error(`major incident threshold reached; restore command: ${incident.command}`);
      }
    }
    console.log(
      `[verify-technical-full-release-production-switch] contract passed: state=${result.releaseState} target=${result.targetPages} canonicals=${result.candidateCanonicals} blockers=${result.blockers}`
    );
  } catch (error) {
    console.error(`[verify-technical-full-release-production-switch] ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  CONTRACT_RELATIVE_PATH,
  evaluateMajorIncident,
  verifyActivationCandidate,
  verifyPrerequisiteEvidence,
  verifyTechnicalFullReleaseProductionSwitch
};
