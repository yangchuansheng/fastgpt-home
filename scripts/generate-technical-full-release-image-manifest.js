#!/usr/bin/env node

/** Generate the signed image mapping consumed by the Technical Center release controller. */

const { createHmac, timingSafeEqual } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { verifyReleaseBundle } = require('./verify-technical-full-release-build-decision');

const REVISION_PATTERN = /^[a-f0-9]{40}$/u;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/u;
const IMAGE_PATTERN = /^[a-z0-9][a-z0-9._:/-]*@sha256:[a-f0-9]{64}$/u;

function readRequired(environment, name) {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function readMatching(environment, name, pattern, label) {
  const value = readRequired(environment, name);
  return validateMatching(value, name, pattern, label);
}

function validateMatching(value, name, pattern, label) {
  if (!pattern.test(value)) throw new Error(`${name} must use ${label}`);
  return value;
}

function readCandidate(environment) {
  const bundlePath = readRequired(environment, 'RELEASE_BUNDLE');
  const candidate = {
    sourceRevision: readMatching(
      environment,
      'RELEASE_SOURCE_COMMIT',
      REVISION_PATTERN,
      'a 40-character commit SHA'
    ),
    bundleSha256: readMatching(
      environment,
      'RELEASE_BUNDLE_SHA256',
      DIGEST_PATTERN,
      'a SHA-256 digest'
    ),
    images: {
      cn: readMatching(environment, 'RELEASE_CN_IMAGE', IMAGE_PATTERN, 'an immutable image digest'),
      io: readMatching(environment, 'RELEASE_IO_IMAGE', IMAGE_PATTERN, 'an immutable image digest')
    }
  };
  return { bundlePath, candidate };
}

function readPreviousRelease(environment, signingKey) {
  const rawManifest = readRequired(environment, 'PREVIOUS_RELEASE_IMAGE_MANIFEST');
  const signature = readMatching(
    environment,
    'PREVIOUS_RELEASE_IMAGE_MANIFEST_SIGNATURE',
    DIGEST_PATTERN,
    'a SHA-256 digest'
  );
  const expected = createHmac('sha256', signingKey).update(rawManifest).digest();
  if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) {
    throw new Error('previous release image manifest signature is invalid');
  }
  let manifest;
  try {
    manifest = JSON.parse(rawManifest);
  } catch (error) {
    throw new Error(`previous release image manifest is unreadable: ${error.message}`);
  }
  if (manifest?.schemaVersion !== 1) {
    throw new Error('previous release image manifest schema version drift');
  }
  const candidate = manifest.candidate || {};
  return {
    sourceRevision: validateMatching(
      candidate.sourceRevision || '',
      'previous release candidate source revision',
      REVISION_PATTERN,
      'a 40-character commit SHA'
    ),
    bundleSha256: validateMatching(
      candidate.bundleSha256 || '',
      'previous release candidate bundle digest',
      DIGEST_PATTERN,
      'a SHA-256 digest'
    ),
    images: {
      cn: validateMatching(
        candidate.images?.cn || '',
        'previous release candidate CN image',
        IMAGE_PATTERN,
        'an immutable image digest'
      ),
      io: validateMatching(
        candidate.images?.io || '',
        'previous release candidate IO image',
        IMAGE_PATTERN,
        'an immutable image digest'
      )
    }
  };
}

function signManifest(candidate, baseline, signingKey) {
  const manifest = JSON.stringify({ schemaVersion: 1, candidate, baseline });
  const signature = createHmac('sha256', signingKey).update(manifest).digest('hex');
  return { manifest, signature };
}

function buildSignedImageManifest(environment = process.env) {
  const { bundlePath, candidate } = readCandidate(environment);
  const signingKey = readRequired(environment, 'RELEASE_IMAGE_MANIFEST_KEY');
  const expectedBaseline = {
    sourceRevision: readMatching(
      environment,
      'PREVIOUS_RELEASE_SOURCE_COMMIT',
      REVISION_PATTERN,
      'a 40-character commit SHA'
    ),
    bundleSha256: readMatching(
      environment,
      'PREVIOUS_RELEASE_BUNDLE_SHA256',
      DIGEST_PATTERN,
      'a SHA-256 digest'
    )
  };
  const baseline = readPreviousRelease(environment, signingKey);
  if (
    baseline.sourceRevision !== expectedBaseline.sourceRevision ||
    baseline.bundleSha256 !== expectedBaseline.bundleSha256
  ) {
    throw new Error('previous release bundle differs from its signed image manifest');
  }

  verifyReleaseBundle(path.resolve(bundlePath), candidate.sourceRevision, candidate.bundleSha256);
  return signManifest(candidate, baseline, signingKey);
}

function buildBootstrapSignedImageManifest(environment = process.env) {
  const { bundlePath, candidate } = readCandidate(environment);
  const signingKey = readRequired(environment, 'RELEASE_IMAGE_MANIFEST_KEY');
  verifyReleaseBundle(path.resolve(bundlePath), candidate.sourceRevision, candidate.bundleSha256);
  return signManifest(candidate, candidate, signingKey);
}

function writeSignedImageManifest(environment = process.env) {
  const manifestOutput = path.resolve(readRequired(environment, 'RELEASE_IMAGE_MANIFEST_OUTPUT'));
  const signatureOutput = path.resolve(
    readRequired(environment, 'RELEASE_IMAGE_MANIFEST_SIGNATURE_OUTPUT')
  );
  if (manifestOutput === signatureOutput) {
    throw new Error('release image manifest output paths must differ');
  }
  const result =
    environment.RELEASE_IMAGE_MANIFEST_BOOTSTRAP === '1'
      ? buildBootstrapSignedImageManifest(environment)
      : buildSignedImageManifest(environment);
  fs.mkdirSync(path.dirname(manifestOutput), { recursive: true });
  fs.mkdirSync(path.dirname(signatureOutput), { recursive: true });
  fs.writeFileSync(manifestOutput, result.manifest);
  fs.writeFileSync(signatureOutput, result.signature);
  return { ...result, manifestOutput, signatureOutput };
}

if (require.main === module) {
  try {
    if (process.argv.length > 2) throw new Error(`Unknown option: ${process.argv[2]}`);
    const result = writeSignedImageManifest();
    const outputs = `${result.manifestOutput} and ${result.signatureOutput}`;
    console.log(`[generate-technical-full-release-image-manifest] Generated ${outputs}`);
  } catch (error) {
    console.error(`[generate-technical-full-release-image-manifest] ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  buildBootstrapSignedImageManifest,
  buildSignedImageManifest,
  writeSignedImageManifest
};
