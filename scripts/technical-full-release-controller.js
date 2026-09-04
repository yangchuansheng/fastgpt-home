#!/usr/bin/env node

/** Validate and execute the coordinated CN and IO Technical Center release switch. */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash, createHmac, timingSafeEqual } = require('node:crypto');

const { verifyReleaseBundle } = require('./verify-technical-full-release-build-decision');
const {
  CONTRACT_RELATIVE_PATH: SWITCH_CONTRACT_RELATIVE_PATH,
  verifyTechnicalFullReleaseProductionSwitch
} = require('./verify-technical-full-release-production-switch');
const { verifyTechnicalFullReleaseApproval } = require('./verify-technical-full-release-approval');

const ROOT = path.resolve(__dirname, '..');
const ACTIONS = ['preflight', 'activate', 'rollback'];

function readRequired(environment, name) {
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
  const context = validateArgument(
    readRequired(environment, `${prefix}_CONTEXT`),
    `${prefix}_CONTEXT`
  );
  const namespace = validateArgument(
    readRequired(environment, `${prefix}_NAMESPACE`),
    `${prefix}_NAMESPACE`
  );
  const target = validateArgument(
    readRequired(environment, `${prefix}_TARGET`),
    `${prefix}_TARGET`
  );
  const container = validateArgument(
    readRequired(environment, `${prefix}_CONTAINER`),
    `${prefix}_CONTAINER`
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
  return { site, context, namespace, target, container };
}

function readMaintenanceWindow(environment) {
  const startsAt = readRequired(environment, 'RELEASE_MAINTENANCE_WINDOW_START');
  const endsAt = readRequired(environment, 'RELEASE_MAINTENANCE_WINDOW_END');
  const start = Date.parse(startsAt);
  const end = Date.parse(endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
    throw new Error('release maintenance window is invalid');
  }
  return { startsAt, endsAt, start, end };
}

function verifyApprovalToken(environment) {
  const token = readRequired(environment, 'RELEASE_APPROVAL_TOKEN');
  const expectedSha256 = readRequired(environment, 'RELEASE_APPROVAL_TOKEN_SHA256');
  if (!/^[a-f0-9]{64}$/u.test(expectedSha256)) {
    throw new Error('RELEASE_APPROVAL_TOKEN_SHA256 is invalid');
  }
  const actualSha256 = createHash('sha256').update(token).digest();
  if (!timingSafeEqual(actualSha256, Buffer.from(expectedSha256, 'hex'))) {
    throw new Error('RELEASE_APPROVAL_TOKEN is invalid');
  }
}

function readSignedImageManifest(environment) {
  const rawManifest = readRequired(environment, 'RELEASE_IMAGE_MANIFEST');
  const signature = readRequired(environment, 'RELEASE_IMAGE_MANIFEST_SIGNATURE');
  const signingKey = readRequired(environment, 'RELEASE_IMAGE_MANIFEST_KEY');
  if (!/^[a-f0-9]{64}$/u.test(signature)) {
    throw new Error('RELEASE_IMAGE_MANIFEST_SIGNATURE is invalid');
  }
  const expectedSignature = createHmac('sha256', signingKey).update(rawManifest).digest();
  if (!timingSafeEqual(expectedSignature, Buffer.from(signature, 'hex'))) {
    throw new Error('release image manifest signature is invalid');
  }
  let manifest;
  try {
    manifest = JSON.parse(rawManifest);
  } catch (error) {
    throw new Error(`release image manifest is unreadable: ${error.message}`);
  }
  if (manifest?.schemaVersion !== 1) {
    throw new Error('release image manifest schema version drift');
  }
  for (const release of ['candidate', 'baseline']) {
    if (!/^[a-f0-9]{40}$/u.test(manifest[release]?.sourceRevision || '')) {
      throw new Error(`release image manifest ${release} source revision is invalid`);
    }
    if (!/^[a-f0-9]{64}$/u.test(manifest[release]?.bundleSha256 || '')) {
      throw new Error(`release image manifest ${release} bundle digest is invalid`);
    }
    for (const site of ['cn', 'io']) {
      validateImage(
        manifest[release]?.images?.[site] || '',
        `release image manifest ${release}.${site}`
      );
    }
  }
  return manifest;
}

function loadReleaseConfig(environment, action) {
  if (!ACTIONS.includes(action)) throw new Error(`Unknown action: ${action || ''}`);
  const candidate =
    action === 'rollback'
      ? undefined
      : {
          path: readRequired(environment, 'RELEASE_BUNDLE'),
          sourceRevision: readRequired(environment, 'RELEASE_SOURCE_COMMIT'),
          sha256: readRequired(environment, 'RELEASE_BUNDLE_SHA256')
        };
  const baseline = {
    path: readRequired(environment, 'PREVIOUS_RELEASE_BUNDLE'),
    sourceRevision: readRequired(environment, 'PREVIOUS_RELEASE_SOURCE_COMMIT'),
    sha256: readRequired(environment, 'PREVIOUS_RELEASE_BUNDLE_SHA256')
  };
  const imageManifest = readSignedImageManifest(environment);
  if (
    candidate &&
    (imageManifest.candidate.sourceRevision !== candidate.sourceRevision ||
      imageManifest.candidate.bundleSha256 !== candidate.sha256)
  ) {
    throw new Error('candidate bundle differs from the signed image manifest');
  }
  if (
    imageManifest.baseline.sourceRevision !== baseline.sourceRevision ||
    imageManifest.baseline.bundleSha256 !== baseline.sha256
  ) {
    throw new Error('previous bundle differs from the signed image manifest');
  }
  const config = {
    action,
    candidate,
    baseline,
    targets: ['cn', 'io'].map((site) => ({
      ...readTarget(environment, site),
      image: imageManifest.candidate.images[site],
      previousImage: imageManifest.baseline.images[site]
    }))
  };
  if (action === 'activate') {
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
  const candidateBinding =
    `source=${config.candidate.sourceRevision} ` + `sha256=${config.candidate.sha256}`;
  console.log(`[technical-full-release-controller] Candidate bundle verified: ${candidateBinding}`);
  verifyReleaseBundle(
    path.resolve(config.baseline.path),
    config.baseline.sourceRevision,
    config.baseline.sha256
  );
  const baselineBinding =
    `source=${config.baseline.sourceRevision} ` + `sha256=${config.baseline.sha256}`;
  console.log(
    `[technical-full-release-controller] Previous baseline bundle verified: ${baselineBinding}`
  );
  verifyMaintenanceWindow(config.maintenanceWindow, requireActiveWindow);
  verifyTechnicalFullReleaseApproval({
    requireApproved: true,
    expectedSourceRevision: config.candidate.sourceRevision,
    expectedBundleSha256: config.candidate.sha256,
    expectedBaselineSourceRevision: config.baseline.sourceRevision,
    expectedBaselineBundleSha256: config.baseline.sha256
  });
  verifyTechnicalFullReleaseProductionSwitch(
    requireActiveWindow
      ? {
          requireReady: true,
          expectedSourceRevision: config.candidate.sourceRevision,
          expectedBundleSha256: config.candidate.sha256
        }
      : undefined
  );
  console.log('[technical-full-release-controller] Production release gates verified');
}

function buildKubectlCommands(config, action) {
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

function compensateTargets(targets, failedAction, run) {
  const failures = [];
  const compensationAction = failedAction === 'activate' ? 'rollback' : 'activate';
  const commands = buildKubectlCommands({ targets: [...targets].reverse() }, compensationAction);
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
  for (const command of buildKubectlCommands(config, action)) {
    console.log(
      `[technical-full-release-controller] Running ${action} ${command.site} ${command.step}`
    );
    const result = run('kubectl', command.args, { stdio: 'inherit' });
    if (result.error || result.status !== 0) {
      const compensationFailures = compensateTargets(updatedTargets, action, run);
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
    if (command.step === 'set-image') {
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
    const baselineBinding =
      `source=${config.baseline.sourceRevision} ` + `sha256=${config.baseline.sha256}`;
    console.log(
      `[technical-full-release-controller] Previous baseline bundle verified: ${baselineBinding}`
    );
    verifyTechnicalFullReleaseApproval({
      expectedBaselineSourceRevision: config.baseline.sourceRevision,
      expectedBaselineBundleSha256: config.baseline.sha256
    });
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
