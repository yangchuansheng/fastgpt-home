#!/usr/bin/env node

/** Generate the signed image mapping consumed by the Technical Center release controller. */

const { createHmac } = require('node:crypto');
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
  if (!pattern.test(value)) throw new Error(`${name} must use ${label}`);
  return value;
}

function buildSignedImageManifest(environment = process.env) {
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
  const baseline = {
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
    ),
    images: {
      cn: readMatching(
        environment,
        'PREVIOUS_RELEASE_CN_IMAGE',
        IMAGE_PATTERN,
        'an immutable image digest'
      ),
      io: readMatching(
        environment,
        'PREVIOUS_RELEASE_IO_IMAGE',
        IMAGE_PATTERN,
        'an immutable image digest'
      )
    }
  };
  const signingKey = readRequired(environment, 'RELEASE_IMAGE_MANIFEST_KEY');

  verifyReleaseBundle(path.resolve(bundlePath), candidate.sourceRevision, candidate.bundleSha256);

  const manifest = JSON.stringify({ schemaVersion: 1, candidate, baseline });
  const signature = createHmac('sha256', signingKey).update(manifest).digest('hex');
  return { manifest, signature };
}

function writeSignedImageManifest(environment = process.env) {
  const manifestOutput = path.resolve(readRequired(environment, 'RELEASE_IMAGE_MANIFEST_OUTPUT'));
  const signatureOutput = path.resolve(
    readRequired(environment, 'RELEASE_IMAGE_MANIFEST_SIGNATURE_OUTPUT')
  );
  if (manifestOutput === signatureOutput) {
    throw new Error('release image manifest output paths must differ');
  }
  const result = buildSignedImageManifest(environment);
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

module.exports = { buildSignedImageManifest, writeSignedImageManifest };
