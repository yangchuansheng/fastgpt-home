const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { createHash, createHmac } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { finalizeSuccessArtifactBundle } = require('./lib/release-artifacts');
const { loadReleaseConfig, runTargetCommands } = require('./technical-full-release-controller');

const ROOT = path.resolve(__dirname, '..');
const IMAGE_MANIFEST_KEY = 'release-image-test-key';

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

function buildValidEnvironment() {
  const imageManifest = JSON.stringify({
    schemaVersion: 1,
    candidate: {
      sourceRevision: 'a'.repeat(40),
      bundleSha256: 'b'.repeat(64),
      images: {
        cn: 'ghcr.io/labring/fastgpt-home-cn@sha256:' + '1'.repeat(64),
        io: 'ghcr.io/labring/fastgpt-home-io@sha256:' + '3'.repeat(64)
      }
    },
    baseline: {
      sourceRevision: 'c'.repeat(40),
      bundleSha256: 'd'.repeat(64),
      images: {
        cn: 'ghcr.io/labring/fastgpt-home-cn@sha256:' + '2'.repeat(64),
        io: 'ghcr.io/labring/fastgpt-home-io@sha256:' + '4'.repeat(64)
      }
    }
  });
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
    RELEASE_IO_CONTEXT: 'fastgpt-io',
    RELEASE_IO_NAMESPACE: 'website',
    RELEASE_IO_TARGET: 'deployment/fastgpt-home',
    RELEASE_IO_CONTAINER: 'fastgpt-home',
    RELEASE_IMAGE_MANIFEST: imageManifest,
    RELEASE_IMAGE_MANIFEST_SIGNATURE: createHmac('sha256', IMAGE_MANIFEST_KEY)
      .update(imageManifest)
      .digest('hex'),
    RELEASE_IMAGE_MANIFEST_KEY: IMAGE_MANIFEST_KEY,
    RELEASE_MAINTENANCE_WINDOW_START: '2026-09-08T14:00:00.000Z',
    RELEASE_MAINTENANCE_WINDOW_END: '2026-09-08T16:00:00.000Z',
    RELEASE_APPROVAL_TOKEN: 'approved-release-273',
    RELEASE_APPROVAL_TOKEN_SHA256: createHash('sha256').update('approved-release-273').digest('hex')
  };
}

function resignImageManifest(environment, mutate) {
  const manifest = JSON.parse(environment.RELEASE_IMAGE_MANIFEST);
  mutate(manifest);
  environment.RELEASE_IMAGE_MANIFEST = JSON.stringify(manifest);
  environment.RELEASE_IMAGE_MANIFEST_SIGNATURE = createHmac('sha256', IMAGE_MANIFEST_KEY)
    .update(environment.RELEASE_IMAGE_MANIFEST)
    .digest('hex');
  return environment;
}

function bindBundles(environment, candidate, baseline, candidateSha256) {
  environment.RELEASE_BUNDLE = candidate.bundlePath;
  environment.RELEASE_BUNDLE_SHA256 = candidateSha256 || candidate.manifest.bundleSha256;
  environment.PREVIOUS_RELEASE_BUNDLE = baseline.bundlePath;
  environment.PREVIOUS_RELEASE_BUNDLE_SHA256 = baseline.manifest.bundleSha256;
  return resignImageManifest(environment, (manifest) => {
    manifest.candidate.bundleSha256 = environment.RELEASE_BUNDLE_SHA256;
    manifest.baseline.bundleSha256 = environment.PREVIOUS_RELEASE_BUNDLE_SHA256;
  });
}

test('configuration requires both production targets and explicit activation controls', () => {
  const environment = buildValidEnvironment();
  delete environment.RELEASE_IO_TARGET;
  assert.throws(() => loadReleaseConfig(environment, 'activate'), /RELEASE_IO_TARGET is required/);

  assert.throws(
    () => loadReleaseConfig({ ...buildValidEnvironment(), RELEASE_APPROVAL_TOKEN: '' }, 'activate'),
    /RELEASE_APPROVAL_TOKEN is required/
  );
  assert.throws(
    () =>
      loadReleaseConfig(
        { ...buildValidEnvironment(), RELEASE_APPROVAL_TOKEN: 'unapproved-release' },
        'activate'
      ),
    /RELEASE_APPROVAL_TOKEN is invalid/
  );
  assert.throws(
    () =>
      loadReleaseConfig(
        { ...buildValidEnvironment(), RELEASE_MAINTENANCE_WINDOW_END: 'invalid' },
        'activate'
      ),
    /maintenance window is invalid/
  );
  const rollbackEnvironment = buildValidEnvironment();
  delete rollbackEnvironment.RELEASE_BUNDLE;
  delete rollbackEnvironment.RELEASE_SOURCE_COMMIT;
  delete rollbackEnvironment.RELEASE_BUNDLE_SHA256;
  delete rollbackEnvironment.RELEASE_APPROVAL_TOKEN;
  delete rollbackEnvironment.RELEASE_APPROVAL_TOKEN_SHA256;
  delete rollbackEnvironment.RELEASE_MAINTENANCE_WINDOW_START;
  delete rollbackEnvironment.RELEASE_MAINTENANCE_WINDOW_END;
  assert.doesNotThrow(() => loadReleaseConfig(rollbackEnvironment, 'rollback'));
});

test('target and signed image configuration reject unsafe inputs', () => {
  assert.throws(
    () =>
      loadReleaseConfig(
        { ...buildValidEnvironment(), RELEASE_IO_CONTEXT: '--context=attacker' },
        'activate'
      ),
    /RELEASE_IO_CONTEXT is invalid/
  );
  const mutableImageEnvironment = resignImageManifest(
    buildValidEnvironment(),
    (manifest) => (manifest.candidate.images.cn = 'image:latest')
  );
  assert.throws(
    () => loadReleaseConfig(mutableImageEnvironment, 'activate'),
    /release image manifest candidate.cn must use an image digest/
  );
  assert.throws(
    () =>
      loadReleaseConfig(
        { ...buildValidEnvironment(), RELEASE_IMAGE_MANIFEST_SIGNATURE: '0'.repeat(64) },
        'activate'
      ),
    /release image manifest signature is invalid/
  );
  assert.throws(
    () =>
      loadReleaseConfig(
        { ...buildValidEnvironment(), RELEASE_BUNDLE_SHA256: 'e'.repeat(64) },
        'activate'
      ),
    /candidate bundle differs from the signed image manifest/
  );
});

test('activate updates both targets before waiting for either rollout', () => {
  const config = loadReleaseConfig(buildValidEnvironment(), 'activate');
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
  const config = loadReleaseConfig(buildValidEnvironment(), 'rollback');
  const calls = [];
  runTargetCommands(config, 'rollback', (command, args) => {
    calls.push([command, args]);
    return { status: 0 };
  });

  assert.equal(calls.length, 4);
  assert.match(calls[0][1].at(-1), new RegExp(`sha256:${'2'.repeat(64)}$`));
  assert.match(calls[1][1].at(-1), new RegExp(`sha256:${'4'.repeat(64)}$`));
});

test('activate failure compensates every attempted target write', () => {
  const config = loadReleaseConfig(buildValidEnvironment(), 'activate');
  const calls = [];
  assert.throws(
    () =>
      runTargetCommands(config, 'activate', (command, args) => {
        calls.push([command, args]);
        return { status: calls.length === 2 ? 1 : 0 };
      }),
    /kubectl failed for io set-image/
  );
  assert.equal(calls.length, 6);
  assert.match(calls[0][1].at(-1), new RegExp(`sha256:${'1'.repeat(64)}$`));
  assert.match(calls[1][1].at(-1), new RegExp(`sha256:${'3'.repeat(64)}$`));
  assert.match(calls[2][1].at(-1), new RegExp(`sha256:${'4'.repeat(64)}$`));
  assert.match(calls[3][1].at(-1), new RegExp(`sha256:${'2'.repeat(64)}$`));
  assert.deepEqual(calls[4][1].slice(-4), [
    'rollout',
    'status',
    'deployment/fastgpt-home',
    '--timeout=10m'
  ]);
});

test('an uncertain first-target write is compensated without touching the second target', () => {
  const config = loadReleaseConfig(buildValidEnvironment(), 'activate');
  const calls = [];
  assert.throws(
    () =>
      runTargetCommands(config, 'activate', (command, args) => {
        calls.push([command, args]);
        return calls.length === 1
          ? { status: null, error: new Error('kubectl request timed out') }
          : { status: 0 };
      }),
    /kubectl failed for cn set-image: kubectl request timed out/
  );
  assert.equal(calls.length, 3);
  assert(calls.every(([, args]) => args.includes('fastgpt-cn')));
  assert(calls.every(([, args]) => !args.includes('fastgpt-io')));
});

test('an IO rollout failure restores both updated targets', () => {
  const config = loadReleaseConfig(buildValidEnvironment(), 'activate');
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

test('a partial rollback is compensated back to the candidate release', () => {
  const config = loadReleaseConfig(buildValidEnvironment(), 'rollback');
  const calls = [];
  assert.throws(
    () =>
      runTargetCommands(config, 'rollback', (command, args) => {
        calls.push([command, args]);
        return { status: calls.length === 2 ? 1 : 0 };
      }),
    /kubectl failed for io set-image/
  );
  assert.equal(calls.length, 6);
  assert.match(calls[2][1].at(-1), new RegExp(`sha256:${'3'.repeat(64)}$`));
  assert.match(calls[3][1].at(-1), new RegExp(`sha256:${'1'.repeat(64)}$`));
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
          ...bindBundles(buildValidEnvironment(), candidate, baseline, '0'.repeat(64))
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
          ...bindBundles(buildValidEnvironment(), candidate, baseline)
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

test('rollback CLI needs only the signed baseline and runtime target configuration', () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'full-release-controller-'));
  try {
    const baseline = makeBundle(temporaryRoot, 'baseline', 'c'.repeat(40));
    const environment = resignImageManifest(buildValidEnvironment(), (manifest) => {
      manifest.baseline.bundleSha256 = baseline.manifest.bundleSha256;
    });
    environment.PREVIOUS_RELEASE_BUNDLE = baseline.bundlePath;
    environment.PREVIOUS_RELEASE_BUNDLE_SHA256 = baseline.manifest.bundleSha256;
    for (const name of [
      'RELEASE_BUNDLE',
      'RELEASE_SOURCE_COMMIT',
      'RELEASE_BUNDLE_SHA256',
      'RELEASE_MAINTENANCE_WINDOW_START',
      'RELEASE_MAINTENANCE_WINDOW_END',
      'RELEASE_APPROVAL_TOKEN',
      'RELEASE_APPROVAL_TOKEN_SHA256'
    ]) {
      delete environment[name];
    }
    const result = spawnSync(
      process.execPath,
      ['scripts/technical-full-release-controller.js', 'rollback'],
      { cwd: ROOT, encoding: 'utf8', env: { ...process.env, ...environment } }
    );

    assert.equal(result.status, 1);
    assert.match(result.stdout, /Previous baseline bundle verified/);
    assert.match(result.stderr, /approved baseline evidence is missing/);
    assert.doesNotMatch(result.stderr, /RELEASE_BUNDLE is required/);
    assert.doesNotMatch(result.stdout, /Running rollback/);
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
