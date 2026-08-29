#!/usr/bin/env node
/** Verify the committed Week06 customer migration authority and projection. */
const assert = require('node:assert/strict');
const path = require('node:path');
const {
  EXPECTED_ROUTE_COUNT,
  EXPECTED_SOURCE_COUNT,
  SOURCE_CLASS_COUNTS,
  SOURCE_FILES,
  buildCustomerMigrationProjection,
  readCustomerMigrationAuthority,
  readCustomerMigrationProjection,
  stableJson
} = require('./lib/customer-migration');

function verifyCustomerMigration(root = path.resolve(__dirname, '..')) {
  const authorityResult = readCustomerMigrationAuthority(root);
  const projection = readCustomerMigrationProjection(root, authorityResult);
  const { authority, records, routeAuthority, sourceClassCounts, targetPaths } = authorityResult;

  assert.equal(records.length, EXPECTED_SOURCE_COUNT);
  assert.equal(targetPaths.length, EXPECTED_ROUTE_COUNT);
  assert.deepEqual(sourceClassCounts, SOURCE_CLASS_COUNTS);
  assert.deepEqual(
    authority.sources.map((source) => source.file).sort(),
    SOURCE_FILES.slice().sort(),
    'source manifest set drifted'
  );
  assert.equal(
    new Set(records.map((record) => `${record.sourceHost}${record.sourcePath}`)).size,
    records.length
  );
  assert.equal(
    new Set(records.map((record) => `${record.targetHost}${record.targetPath}`)).size,
    targetPaths.length
  );
  assert.deepEqual(targetPaths, routeAuthority.paths);
  assert.equal(projection.entries.length, EXPECTED_SOURCE_COUNT);
  assert.equal(projection.targetCount, EXPECTED_ROUTE_COUNT);
  assert.equal(
    stableJson(projection),
    stableJson(buildCustomerMigrationProjection(authorityResult))
  );

  return {
    digest: authority.digest,
    projectionDigest: projection.digest,
    sources: records.length,
    targets: targetPaths.length
  };
}

if (require.main === module) {
  try {
    const result = verifyCustomerMigration();
    console.log(
      `[verify-customer-migration] passed: ${result.sources} sources -> ${result.targets} terminal routes (digest=${result.digest})`
    );
  } catch (error) {
    console.error(`[verify-customer-migration] ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { verifyCustomerMigration };
