const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { createHmac } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  buildBootstrapSignedImageManifest,
  buildSignedImageManifest
} = require('./generate-technical-full-release-image-manifest');
const { finalizeSuccessArtifactBundle } = require('./lib/release-artifacts');
const { loadReleaseConfig } = require('./technical-full-release-controller');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_REVISION = 'a'.repeat(40);
const BASELINE_REVISION = 'b'.repeat(40);
const BASELINE_SHA256 = 'c'.repeat(64);
const SIGNING_KEY = 'technical-release-signing-key';
const IMAGES = {
  candidateCn: `ghcr.io/labring/fastgpt-home-cn@sha256:${'1'.repeat(64)}`,
  candidateIo: `ghcr.io/labring/fastgpt-home-io@sha256:${'2'.repeat(64)}`,
  baselineCn: `ghcr.io/labring/fastgpt-home-cn@sha256:${'3'.repeat(64)}`,
  baselineIo: `ghcr.io/labring/fastgpt-home-io@sha256:${'4'.repeat(64)}`
};

function makeBundle(root, name, sourceRevision) {
  const bundlePath = path.join(root, name);
  for (const variant of ['cn', 'io', 'preview']) {
    fs.mkdirSync(path.join(bundlePath, variant), { recursive: true });
    fs.writeFileSync(path.join(bundlePath, variant, 'index.html'), variant);
  }
  const manifest = finalizeSuccessArtifactBundle(bundlePath, sourceRevision, [
    'cn',
    'io',
    'preview'
  ]);
  return { bundlePath, manifest };
}

function previousManifestEnvironment() {
  const manifest = JSON.stringify({
    schemaVersion: 1,
    candidate: {
      sourceRevision: BASELINE_REVISION,
      bundleSha256: BASELINE_SHA256,
      images: { cn: IMAGES.baselineCn, io: IMAGES.baselineIo }
    },
    baseline: {
      sourceRevision: 'c'.repeat(40),
      bundleSha256: 'd'.repeat(64),
      images: { cn: IMAGES.baselineCn, io: IMAGES.baselineIo }
    }
  });
  return {
    PREVIOUS_RELEASE_IMAGE_MANIFEST: manifest,
    PREVIOUS_RELEASE_IMAGE_MANIFEST_SIGNATURE: createHmac('sha256', SIGNING_KEY)
      .update(manifest)
      .digest('hex')
  };
}

function buildEnvironment(candidateBundle) {
  return {
    RELEASE_BUNDLE: candidateBundle.bundlePath,
    RELEASE_SOURCE_COMMIT: SOURCE_REVISION,
    RELEASE_BUNDLE_SHA256: candidateBundle.manifest.bundleSha256,
    RELEASE_CN_IMAGE: IMAGES.candidateCn,
    RELEASE_IO_IMAGE: IMAGES.candidateIo,
    PREVIOUS_RELEASE_SOURCE_COMMIT: BASELINE_REVISION,
    PREVIOUS_RELEASE_BUNDLE_SHA256: BASELINE_SHA256,
    RELEASE_IMAGE_MANIFEST_KEY: SIGNING_KEY,
    ...previousManifestEnvironment()
  };
}

test('CLI fails fast when a required input is missing', () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'release-image-manifest-'));
  const result = spawnSync(
    process.execPath,
    ['scripts/generate-technical-full-release-image-manifest.js'],
    {
      cwd: ROOT,
      encoding: 'utf8',
      env: {
        RELEASE_IMAGE_MANIFEST_OUTPUT: path.join(temporaryRoot, 'manifest.json'),
        RELEASE_IMAGE_MANIFEST_SIGNATURE_OUTPUT: path.join(temporaryRoot, 'manifest.sha256')
      }
    }
  );
  try {
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(
      result.stderr,
      /^\[generate-technical-full-release-image-manifest\] RELEASE_BUNDLE is required$/mu
    );
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('input validation rejects mutable images and malformed bindings', () => {
  const environment = {
    RELEASE_BUNDLE: '/release/candidate',
    RELEASE_SOURCE_COMMIT: SOURCE_REVISION,
    RELEASE_BUNDLE_SHA256: 'd'.repeat(64),
    RELEASE_CN_IMAGE: IMAGES.candidateCn,
    RELEASE_IO_IMAGE: IMAGES.candidateIo,
    PREVIOUS_RELEASE_SOURCE_COMMIT: BASELINE_REVISION,
    PREVIOUS_RELEASE_BUNDLE_SHA256: 'c'.repeat(64),
    RELEASE_IMAGE_MANIFEST_KEY: SIGNING_KEY,
    ...previousManifestEnvironment()
  };
  assert.throws(
    () => buildSignedImageManifest({ ...environment, RELEASE_SOURCE_COMMIT: 'main' }),
    /RELEASE_SOURCE_COMMIT must use a 40-character commit SHA/
  );
  assert.throws(
    () => buildSignedImageManifest({ ...environment, RELEASE_IO_IMAGE: 'image:latest' }),
    /RELEASE_IO_IMAGE must use an immutable image digest/
  );
  assert.throws(
    () => buildSignedImageManifest({ ...environment, PREVIOUS_RELEASE_BUNDLE_SHA256: 'bad' }),
    /PREVIOUS_RELEASE_BUNDLE_SHA256 must use a SHA-256 digest/
  );
  assert.throws(
    () =>
      buildSignedImageManifest({
        ...environment,
        PREVIOUS_RELEASE_BUNDLE_SHA256: 'e'.repeat(64)
      }),
    /previous release bundle differs from its signed image manifest/
  );
  const mutablePrevious = JSON.parse(environment.PREVIOUS_RELEASE_IMAGE_MANIFEST);
  mutablePrevious.candidate.images.io = 'image:latest';
  const rawMutablePrevious = JSON.stringify(mutablePrevious);
  assert.throws(
    () =>
      buildSignedImageManifest({
        ...environment,
        PREVIOUS_RELEASE_IMAGE_MANIFEST: rawMutablePrevious,
        PREVIOUS_RELEASE_IMAGE_MANIFEST_SIGNATURE: createHmac('sha256', SIGNING_KEY)
          .update(rawMutablePrevious)
          .digest('hex')
      }),
    /previous release candidate IO image must use an immutable image digest/
  );
  assert.throws(
    () =>
      buildSignedImageManifest({
        ...environment,
        PREVIOUS_RELEASE_IMAGE_MANIFEST_SIGNATURE: '0'.repeat(64)
      }),
    /previous release image manifest signature is invalid/
  );
});

test('candidate bundle content must match its source and digest', () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'release-image-manifest-'));
  try {
    const candidate = makeBundle(temporaryRoot, 'candidate', SOURCE_REVISION);
    assert.throws(
      () =>
        buildSignedImageManifest({
          ...buildEnvironment(candidate),
          RELEASE_BUNDLE_SHA256: '0'.repeat(64)
        }),
      /release bundle digest drift/
    );
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('output is deterministic and consumed directly by the release controller', () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'release-image-manifest-'));
  try {
    const candidate = makeBundle(temporaryRoot, 'candidate', SOURCE_REVISION);
    const environment = buildEnvironment(candidate);
    const first = buildSignedImageManifest(environment);
    const second = buildSignedImageManifest(environment);
    assert.deepEqual(second, first);
    assert.equal(
      first.signature,
      createHmac('sha256', SIGNING_KEY).update(first.manifest).digest('hex')
    );

    const cli = spawnSync(
      process.execPath,
      ['scripts/generate-technical-full-release-image-manifest.js'],
      {
        cwd: ROOT,
        encoding: 'utf8',
        env: {
          ...process.env,
          ...environment,
          RELEASE_IMAGE_MANIFEST_OUTPUT: path.join(temporaryRoot, 'output', 'image-manifest.json'),
          RELEASE_IMAGE_MANIFEST_SIGNATURE_OUTPUT: path.join(
            temporaryRoot,
            'output',
            'image-manifest.sha256'
          )
        }
      }
    );
    assert.equal(cli.status, 0, cli.stderr);
    assert.match(cli.stdout, /^\[generate-technical-full-release-image-manifest\] Generated /u);
    assert.equal(
      fs.readFileSync(path.join(temporaryRoot, 'output/image-manifest.json'), 'utf8'),
      first.manifest
    );
    assert.equal(
      fs.readFileSync(path.join(temporaryRoot, 'output/image-manifest.sha256'), 'utf8'),
      first.signature
    );

    const config = loadReleaseConfig(
      {
        ...environment,
        PREVIOUS_RELEASE_BUNDLE: '/release/baseline',
        RELEASE_CN_CONTEXT: 'fastgpt-cn',
        RELEASE_CN_NAMESPACE: 'website',
        RELEASE_CN_TARGET: 'deployment/fastgpt-home',
        RELEASE_CN_CONTAINER: 'fastgpt-home',
        RELEASE_IO_CONTEXT: 'fastgpt-io',
        RELEASE_IO_NAMESPACE: 'website',
        RELEASE_IO_TARGET: 'deployment/fastgpt-home',
        RELEASE_IO_CONTAINER: 'fastgpt-home',
        RELEASE_IMAGE_MANIFEST: first.manifest,
        RELEASE_IMAGE_MANIFEST_SIGNATURE: first.signature,
        RELEASE_MAINTENANCE_WINDOW_START: '2026-09-08T14:00:00.000Z',
        RELEASE_MAINTENANCE_WINDOW_END: '2026-09-08T16:00:00.000Z'
      },
      'preflight'
    );
    assert.equal(config.targets[0].image, IMAGES.candidateCn);
    assert.equal(config.targets[1].previousImage, IMAGES.baselineIo);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('bootstrap signs one verified release as both candidate and baseline', () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'release-image-manifest-'));
  try {
    const release = makeBundle(temporaryRoot, 'baseline', BASELINE_REVISION);
    const environment = {
      RELEASE_BUNDLE: release.bundlePath,
      RELEASE_SOURCE_COMMIT: BASELINE_REVISION,
      RELEASE_BUNDLE_SHA256: release.manifest.bundleSha256,
      RELEASE_CN_IMAGE: IMAGES.baselineCn,
      RELEASE_IO_IMAGE: IMAGES.baselineIo,
      RELEASE_IMAGE_MANIFEST_KEY: SIGNING_KEY
    };
    assert.throws(
      () =>
        buildBootstrapSignedImageManifest({
          ...environment,
          RELEASE_BUNDLE_SHA256: '0'.repeat(64)
        }),
      /release bundle digest drift/
    );
    assert.throws(
      () =>
        buildBootstrapSignedImageManifest({
          ...environment,
          RELEASE_SOURCE_COMMIT: 'c'.repeat(40)
        }),
      /release bundle source commit drift/
    );
    const result = buildBootstrapSignedImageManifest(environment);
    const manifest = JSON.parse(result.manifest);
    assert.deepEqual(manifest.baseline, manifest.candidate);
    assert.equal(
      result.signature,
      createHmac('sha256', SIGNING_KEY).update(result.manifest).digest('hex')
    );
    const cli = spawnSync(
      process.execPath,
      ['scripts/generate-technical-full-release-image-manifest.js'],
      {
        cwd: ROOT,
        encoding: 'utf8',
        env: {
          ...process.env,
          RELEASE_IMAGE_MANIFEST_BOOTSTRAP: '1',
          RELEASE_BUNDLE: release.bundlePath,
          RELEASE_SOURCE_COMMIT: BASELINE_REVISION,
          RELEASE_BUNDLE_SHA256: release.manifest.bundleSha256,
          RELEASE_CN_IMAGE: IMAGES.baselineCn,
          RELEASE_IO_IMAGE: IMAGES.baselineIo,
          RELEASE_IMAGE_MANIFEST_KEY: SIGNING_KEY,
          RELEASE_IMAGE_MANIFEST_OUTPUT: path.join(temporaryRoot, 'bootstrap/manifest.json'),
          RELEASE_IMAGE_MANIFEST_SIGNATURE_OUTPUT: path.join(
            temporaryRoot,
            'bootstrap/manifest.sig'
          )
        }
      }
    );
    assert.equal(cli.status, 0, cli.stderr);
    const cliManifest = JSON.parse(
      fs.readFileSync(path.join(temporaryRoot, 'bootstrap/manifest.json'), 'utf8')
    );
    assert.deepEqual(cliManifest.baseline, cliManifest.candidate);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
