#!/usr/bin/env node

/** Validate and execute the coordinated CN and IO Technical Center release switch. */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash, timingSafeEqual } = require('node:crypto');

const { verifyReleaseBundle } = require('./verify-technical-full-release-build-decision');
const {
  CONTRACT_RELATIVE_PATH: SWITCH_CONTRACT_RELATIVE_PATH,
  verifyTechnicalFullReleaseProductionSwitch
} = require('./verify-technical-full-release-production-switch');
const { verifyTechnicalFullReleaseApproval } = require('./verify-technical-full-release-approval');

const ROOT = path.resolve(__dirname, '..');
const ACTIONS = ['preflight', 'activate', 'rollback'];

function required(environment, name) {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function validateArgument(value, name) {
  if (value.startsWith('-') || /\s/u.test(value)) throw new Error(`${name} is invalid`);
  return value;
}

function validateImage(value, name) {
  validateArgument(value, name);
  if (!/@sha256:[a-f0-9]{64}$/u.test(value)) throw new Error(`${name} must use an image digest`);
  return value;
}

function readTarget(environment, site) {
  const prefix = `RELEASE_${site.toUpperCase()}`;
  const context = validateArgument(required(environment, `${prefix}_CONTEXT`), `${prefix}_CONTEXT`);
  const namespace = validateArgument(
    required(environment, `${prefix}_NAMESPACE`),
    `${prefix}_NAMESPACE`
  );
  const target = validateArgument(required(environment, `${prefix}_TARGET`), `${prefix}_TARGET`);
  const container = validateArgument(
    required(environment, `${prefix}_CONTAINER`),
    `${prefix}_CONTAINER`
  );
  const image = validateImage(required(environment, `${prefix}_IMAGE`), `${prefix}_IMAGE`);
  const previousImage = validateImage(
    required(environment, `${prefix}_PREVIOUS_IMAGE`),
    `${prefix}_PREVIOUS_IMAGE`
  );
  if (!/^(deployment|statefulset|daemonset)\/[a-z0-9]([-a-z0-9.]*[a-z0-9])?$/u.test(target)) {
    throw new Error(`${prefix}_TARGET is invalid`);
  }
  if (!/^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$/u.test(namespace)) {
    throw new Error(`${prefix}_NAMESPACE is invalid`);
  }
  if (!/^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$/u.test(container)) {
    throw new Error(`${prefix}_CONTAINER is invalid`);
  }
  return { site, context, namespace, target, container, image, previousImage };
}

function readMaintenanceWindow(environment) {
  const startsAt = required(environment, 'RELEASE_MAINTENANCE_WINDOW_START');
  const endsAt = required(environment, 'RELEASE_MAINTENANCE_WINDOW_END');
  const start = Date.parse(startsAt);
  const end = Date.parse(endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
    throw new Error('release maintenance window is invalid');
  }
  return { startsAt, endsAt, start, end };
}

function verifyApprovalToken(environment) {
  const token = required(environment, 'RELEASE_APPROVAL_TOKEN');
  const expectedSha256 = required(environment, 'RELEASE_APPROVAL_TOKEN_SHA256');
  if (!/^[a-f0-9]{64}$/u.test(expectedSha256)) {
    throw new Error('RELEASE_APPROVAL_TOKEN_SHA256 is invalid');
  }
  const actualSha256 = createHash('sha256').update(token).digest();
  if (!timingSafeEqual(actualSha256, Buffer.from(expectedSha256, 'hex'))) {
    throw new Error('RELEASE_APPROVAL_TOKEN is invalid');
  }
}

function loadReleaseConfig(environment, action) {
  if (!ACTIONS.includes(action)) throw new Error(`Unknown action: ${action || ''}`);
  const config = {
    action,
    candidate: {
      path: required(environment, 'RELEASE_BUNDLE'),
      sourceRevision: required(environment, 'RELEASE_SOURCE_COMMIT'),
      sha256: required(environment, 'RELEASE_BUNDLE_SHA256')
    },
    baseline: {
      path: required(environment, 'PREVIOUS_RELEASE_BUNDLE'),
      sourceRevision: required(environment, 'PREVIOUS_RELEASE_SOURCE_COMMIT'),
      sha256: required(environment, 'PREVIOUS_RELEASE_BUNDLE_SHA256')
    },
    targets: [readTarget(environment, 'cn'), readTarget(environment, 'io')]
  };
  if (action === 'activate' || action === 'rollback') {
    verifyApprovalToken(environment);
  }
  if (action === 'preflight' || action === 'activate') {
    config.maintenanceWindow = readMaintenanceWindow(environment);
  }
  return config;
}

function verifyMaintenanceWindow(window, requireActive, now = Date.now()) {
  const contract = JSON.parse(
    fs.readFileSync(path.join(ROOT, SWITCH_CONTRACT_RELATIVE_PATH), 'utf8')
  );
  const approvedWindow = contract.maintenanceWindow;
  if (
    Date.parse(approvedWindow.startsAt) !== window.start ||
    Date.parse(approvedWindow.endsAt) !== window.end
  ) {
    throw new Error('release maintenance window differs from the production switch contract');
  }
  if (requireActive && (now < window.start || now >= window.end)) {
    throw new Error('activation time is outside the release maintenance window');
  }
}

function verifyPreflight(config, requireActiveWindow = false) {
  verifyReleaseBundle(
    path.resolve(config.candidate.path),
    config.candidate.sourceRevision,
    config.candidate.sha256
  );
  console.log(
    `[technical-full-release-controller] Candidate bundle verified: source=${config.candidate.sourceRevision} sha256=${config.candidate.sha256}`
  );
  verifyReleaseBundle(
    path.resolve(config.baseline.path),
    config.baseline.sourceRevision,
    config.baseline.sha256
  );
  console.log(
    `[technical-full-release-controller] Previous baseline bundle verified: source=${config.baseline.sourceRevision} sha256=${config.baseline.sha256}`
  );
  verifyMaintenanceWindow(config.maintenanceWindow, requireActiveWindow);
  verifyTechnicalFullReleaseApproval({
    requireApproved: true,
    expectedSourceRevision: config.candidate.sourceRevision,
    expectedBundleSha256: config.candidate.sha256
  });
  verifyTechnicalFullReleaseProductionSwitch({
    requireReady: true,
    expectedSourceRevision: config.candidate.sourceRevision,
    expectedBundleSha256: config.candidate.sha256
  });
  console.log('[technical-full-release-controller] Production release gates verified');
}

function kubectlCommands(config, action) {
  const imageKey = action === 'rollback' ? 'previousImage' : 'image';
  const baseArgs = ({ context, namespace }) => ['--context', context, '--namespace', namespace];
  return [
    ...config.targets.map((target) => ({
      site: target.site,
      step: 'set-image',
      args: [
        ...baseArgs(target),
        'set',
        'image',
        target.target,
        `${target.container}=${target[imageKey]}`
      ]
    })),
    ...config.targets.map((target) => ({
      site: target.site,
      step: 'rollout-status',
      args: [...baseArgs(target), 'rollout', 'status', target.target, '--timeout=10m']
    }))
  ];
}

function compensateTargets(targets, run) {
  const failures = [];
  const commands = [
    ...targets.toReversed().map((target) => ({
      site: target.site,
      step: 'restore-image',
      args: [
        '--context',
        target.context,
        '--namespace',
        target.namespace,
        'set',
        'image',
        target.target,
        `${target.container}=${target.previousImage}`
      ]
    })),
    ...targets.toReversed().map((target) => ({
      site: target.site,
      step: 'restore-status',
      args: [
        '--context',
        target.context,
        '--namespace',
        target.namespace,
        'rollout',
        'status',
        target.target,
        '--timeout=10m'
      ]
    }))
  ];
  for (const command of commands) {
    console.error(
      `[technical-full-release-controller] Running compensation ${command.site} ${command.step}`
    );
    const result = run('kubectl', command.args, { stdio: 'inherit' });
    if (result.error || result.status !== 0) failures.push(`${command.site} ${command.step}`);
  }
  return failures;
}

function runTargetCommands(config, action, run = spawnSync) {
  const updatedTargets = [];
  for (const command of kubectlCommands(config, action)) {
    console.log(
      `[technical-full-release-controller] Running ${action} ${command.site} ${command.step}`
    );
    const result = run('kubectl', command.args, { stdio: 'inherit' });
    if (result.error || result.status !== 0) {
      const compensationFailures =
        action === 'activate' ? compensateTargets(updatedTargets, run) : [];
      throw new Error(
        `kubectl failed for ${command.site} ${command.step}: ${
          result.error?.message || `exit ${result.status}`
        }${
          compensationFailures.length
            ? `; compensation failed for ${compensationFailures.join(', ')}`
            : ''
        }`
      );
    }
    if (action === 'activate' && command.step === 'set-image') {
      updatedTargets.push(config.targets.find(({ site }) => site === command.site));
    }
  }
}

function execute(action, environment = process.env) {
  const config = loadReleaseConfig(environment, action);
  if (action === 'rollback') {
    verifyReleaseBundle(
      path.resolve(config.baseline.path),
      config.baseline.sourceRevision,
      config.baseline.sha256
    );
    console.log(
      `[technical-full-release-controller] Previous baseline bundle verified: source=${config.baseline.sourceRevision} sha256=${config.baseline.sha256}`
    );
    runTargetCommands(config, action);
    return;
  }
  verifyPreflight(config, action === 'activate');
  if (action === 'activate') runTargetCommands(config, action);
}

if (require.main === module) {
  try {
    const [action, ...extra] = process.argv.slice(2);
    if (extra.length) throw new Error(`Unknown option: ${extra[0]}`);
    execute(action);
    console.log(`[technical-full-release-controller] ${action} completed`);
  } catch (error) {
    console.error(`[technical-full-release-controller] ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  execute,
  loadReleaseConfig,
  runTargetCommands,
  verifyMaintenanceWindow,
  verifyPreflight
};
