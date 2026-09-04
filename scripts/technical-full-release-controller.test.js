const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { finalizeSuccessArtifactBundle } = require('./lib/release-artifacts');
const { loadReleaseConfig, runTargetCommands } = require('./technical-full-release-controller');

const ROOT = path.resolve(__dirname, '..');

function makeBundle(root, name, sourceRevision) {
  const bundlePath = path.join(root, name);
  for (const variant of ['cn', 'io', 'preview']) {
    fs.mkdirSync(path.join(bundlePath, variant), { recursive: true });
    fs.writeFileSync(path.join(bundlePath, variant, 'index.html'), `${name}-${variant}`);
  }
  const manifest = finalizeSuccessArtifactBundle(bundlePath, sourceRevision, [
    'cn',
    'io',
    'preview'
  ]);
  return { bundlePath, manifest };
}

function validEnvironment() {
  return {
    RELEASE_BUNDLE: '/release/candidate',
    RELEASE_SOURCE_COMMIT: 'a'.repeat(40),
    RELEASE_BUNDLE_SHA256: 'b'.repeat(64),
    PREVIOUS_RELEASE_BUNDLE: '/release/baseline',
    PREVIOUS_RELEASE_SOURCE_COMMIT: 'c'.repeat(40),
    PREVIOUS_RELEASE_BUNDLE_SHA256: 'd'.repeat(64),
    RELEASE_CN_CONTEXT: 'fastgpt-cn',
    RELEASE_CN_NAMESPACE: 'website',
    RELEASE_CN_TARGET: 'deployment/fastgpt-home',
    RELEASE_CN_CONTAINER: 'fastgpt-home',
    RELEASE_CN_IMAGE: 'ghcr.io/labring/fastgpt-home-cn@sha256:' + '1'.repeat(64),
    RELEASE_CN_PREVIOUS_IMAGE: 'ghcr.io/labring/fastgpt-home-cn@sha256:' + '2'.repeat(64),
    RELEASE_IO_CONTEXT: 'fastgpt-io',
    RELEASE_IO_NAMESPACE: 'website',
    RELEASE_IO_TARGET: 'deployment/fastgpt-home',
    RELEASE_IO_CONTAINER: 'fastgpt-home',
    RELEASE_IO_IMAGE: 'ghcr.io/labring/fastgpt-home-io@sha256:' + '3'.repeat(64),
    RELEASE_IO_PREVIOUS_IMAGE: 'ghcr.io/labring/fastgpt-home-io@sha256:' + '4'.repeat(64),
    RELEASE_MAINTENANCE_WINDOW_START: '2026-09-08T14:00:00.000Z',
    RELEASE_MAINTENANCE_WINDOW_END: '2026-09-08T16:00:00.000Z',
    RELEASE_APPROVAL_TOKEN: 'approved-release-273',
    RELEASE_APPROVAL_TOKEN_SHA256: createHash('sha256').update('approved-release-273').digest('hex')
  };
}

test('configuration requires both production targets and explicit activation controls', () => {
  const environment = validEnvironment();
  delete environment.RELEASE_IO_TARGET;
  assert.throws(() => loadReleaseConfig(environment, 'activate'), /RELEASE_IO_TARGET is required/);

  assert.throws(
    () => loadReleaseConfig({ ...validEnvironment(), RELEASE_APPROVAL_TOKEN: '' }, 'activate'),
    /RELEASE_APPROVAL_TOKEN is required/
  );
  assert.throws(
    () =>
      loadReleaseConfig(
        { ...validEnvironment(), RELEASE_APPROVAL_TOKEN: 'unapproved-release' },
        'activate'
      ),
    /RELEASE_APPROVAL_TOKEN is invalid/
  );
  assert.throws(
    () =>
      loadReleaseConfig(
        { ...validEnvironment(), RELEASE_MAINTENANCE_WINDOW_END: 'invalid' },
        'activate'
      ),
    /maintenance window is invalid/
  );
});

test('target configuration rejects kubectl option injection', () => {
  assert.throws(
    () =>
      loadReleaseConfig(
        { ...validEnvironment(), RELEASE_IO_CONTEXT: '--context=attacker' },
        'activate'
      ),
    /RELEASE_IO_CONTEXT is invalid/
  );
  assert.throws(
    () =>
      loadReleaseConfig({ ...validEnvironment(), RELEASE_CN_IMAGE: 'image:latest' }, 'activate'),
    /RELEASE_CN_IMAGE must use an image digest/
  );
});

test('activate updates both targets before waiting for either rollout', () => {
  const config = loadReleaseConfig(validEnvironment(), 'activate');
  const calls = [];
  runTargetCommands(config, 'activate', (command, args) => {
    calls.push([command, args]);
    return { status: 0 };
  });

  assert.deepEqual(calls, [
    [
      'kubectl',
      [
        '--context',
        'fastgpt-cn',
        '--namespace',
        'website',
        'set',
        'image',
        'deployment/fastgpt-home',
        `fastgpt-home=ghcr.io/labring/fastgpt-home-cn@sha256:${'1'.repeat(64)}`
      ]
    ],
    [
      'kubectl',
      [
        '--context',
        'fastgpt-io',
        '--namespace',
        'website',
        'set',
        'image',
        'deployment/fastgpt-home',
        `fastgpt-home=ghcr.io/labring/fastgpt-home-io@sha256:${'3'.repeat(64)}`
      ]
    ],
    [
      'kubectl',
      [
        '--context',
        'fastgpt-cn',
        '--namespace',
        'website',
        'rollout',
        'status',
        'deployment/fastgpt-home',
        '--timeout=10m'
      ]
    ],
    [
      'kubectl',
      [
        '--context',
        'fastgpt-io',
        '--namespace',
        'website',
        'rollout',
        'status',
        'deployment/fastgpt-home',
        '--timeout=10m'
      ]
    ]
  ]);
});

test('rollback deploys the verified previous images to both targets', () => {
  const config = loadReleaseConfig(validEnvironment(), 'rollback');
  const calls = [];
  runTargetCommands(config, 'rollback', (command, args) => {
    calls.push([command, args]);
    return { status: 0 };
  });

  assert.equal(calls.length, 4);
  assert.match(calls[0][1].at(-1), new RegExp(`sha256:${'2'.repeat(64)}$`));
  assert.match(calls[1][1].at(-1), new RegExp(`sha256:${'4'.repeat(64)}$`));
});

test('activate failure stops forward commands and restores every changed target', () => {
  const config = loadReleaseConfig(validEnvironment(), 'activate');
  const calls = [];
  assert.throws(
    () =>
      runTargetCommands(config, 'activate', (command, args) => {
        calls.push([command, args]);
        return { status: calls.length === 2 ? 1 : 0 };
      }),
    /kubectl failed for io set-image/
  );
  assert.equal(calls.length, 4);
  assert.match(calls[0][1].at(-1), new RegExp(`sha256:${'1'.repeat(64)}$`));
  assert.match(calls[1][1].at(-1), new RegExp(`sha256:${'3'.repeat(64)}$`));
  assert.match(calls[2][1].at(-1), new RegExp(`sha256:${'2'.repeat(64)}$`));
  assert.deepEqual(calls[3][1].slice(-4), [
    'rollout',
    'status',
    'deployment/fastgpt-home',
    '--timeout=10m'
  ]);
});

test('a first-target failure leaves the second target untouched', () => {
  const config = loadReleaseConfig(validEnvironment(), 'activate');
  const calls = [];
  assert.throws(
    () =>
      runTargetCommands(config, 'activate', (command, args) => {
        calls.push([command, args]);
        return { status: 1 };
      }),
    /kubectl failed for cn set-image/
  );
  assert.equal(calls.length, 1);
});

test('an IO rollout failure restores both updated targets', () => {
  const config = loadReleaseConfig(validEnvironment(), 'activate');
  const calls = [];
  assert.throws(
    () =>
      runTargetCommands(config, 'activate', (command, args) => {
        calls.push([command, args]);
        return { status: calls.length === 4 ? 1 : 0 };
      }),
    /kubectl failed for io rollout-status/
  );
  assert.equal(calls.length, 8);
  assert.match(calls[4][1].at(-1), new RegExp(`sha256:${'4'.repeat(64)}$`));
  assert.match(calls[5][1].at(-1), new RegExp(`sha256:${'2'.repeat(64)}$`));
});

test('CLI rejects a mismatched candidate bundle before release contract gates', () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'full-release-controller-'));
  try {
    const candidate = makeBundle(temporaryRoot, 'candidate', 'a'.repeat(40));
    const baseline = makeBundle(temporaryRoot, 'baseline', 'c'.repeat(40));
    const result = spawnSync(
      process.execPath,
      ['scripts/technical-full-release-controller.js', 'preflight'],
      {
        cwd: ROOT,
        encoding: 'utf8',
        env: {
          ...process.env,
          ...validEnvironment(),
          RELEASE_BUNDLE: candidate.bundlePath,
          RELEASE_BUNDLE_SHA256: '0'.repeat(64),
          PREVIOUS_RELEASE_BUNDLE: baseline.bundlePath,
          PREVIOUS_RELEASE_BUNDLE_SHA256: baseline.manifest.bundleSha256
        }
      }
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /release bundle digest drift/);
    assert.doesNotMatch(result.stdout, /production target update/);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('CLI preserves the evidence-driven production block after bundle verification', () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'full-release-controller-'));
  try {
    const candidate = makeBundle(temporaryRoot, 'candidate', 'a'.repeat(40));
    const baseline = makeBundle(temporaryRoot, 'baseline', 'c'.repeat(40));
    const result = spawnSync(
      process.execPath,
      ['scripts/technical-full-release-controller.js', 'preflight'],
      {
        cwd: ROOT,
        encoding: 'utf8',
        env: {
          ...process.env,
          ...validEnvironment(),
          RELEASE_BUNDLE: candidate.bundlePath,
          RELEASE_BUNDLE_SHA256: candidate.manifest.bundleSha256,
          PREVIOUS_RELEASE_BUNDLE: baseline.bundlePath,
          PREVIOUS_RELEASE_BUNDLE_SHA256: baseline.manifest.bundleSha256
        }
      }
    );

    assert.equal(result.status, 1);
    assert.match(result.stdout, /Candidate bundle verified/);
    assert.match(result.stdout, /Previous baseline bundle verified/);
    assert.match(result.stderr, /full release approval is blocked/);
    assert.doesNotMatch(result.stdout, /Running activate/);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('production workflow exposes only a manual controller entry point', () => {
  const workflow = fs.readFileSync(
    path.join(ROOT, '.github/workflows/technical-full-release-production.yml'),
    'utf8'
  );
  assert.match(workflow, /^on:\n  workflow_dispatch:/mu);
  assert.doesNotMatch(workflow, /\n\s+pull_request:/u);
  assert.doesNotMatch(workflow, /\n\s+push:/u);
  assert.match(workflow, /npm run release:technical-full -- \$\{\{ inputs\.action \}\}/u);
});
