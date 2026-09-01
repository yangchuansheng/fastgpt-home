const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  CONTRACT_RELATIVE_PATH,
  FIXTURE_RELATIVE_PATH,
  verifyWeek06CompareDisposition
} = require('./verify-week06-compare-disposition');

const ROOT = path.resolve(__dirname, '..');

function copyJson(relativePath, temporaryRoot) {
  const targetPath = path.join(temporaryRoot, relativePath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(path.join(ROOT, relativePath), targetPath);
  return targetPath;
}

function mutateJson(relativePath, mutate) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'week06-compare-'));
  const targetPath = copyJson(relativePath, temporaryRoot);
  const value = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
  mutate(value);
  fs.writeFileSync(targetPath, `${JSON.stringify(value, null, 2)}\n`);
  return { temporaryRoot, targetPath };
}

test('the Week06 comparison contract closes one merge and two denials', () => {
  const result = verifyWeek06CompareDisposition({ rootDir: ROOT });

  assert.deepEqual(result, {
    candidates: 3,
    merged: 1,
    published: 0,
    denied: 2,
    changedIdentities: ['maxkb-vs-fastgpt'],
    publicRouteDelta: 0
  });
});

test('generic projection leakage is rejected', () => {
  const { targetPath } = mutateJson(FIXTURE_RELATIVE_PATH, (fixture) => {
    fixture.genericTechnical.registry.push('/compare/fastgpt-competitor-migration-checklist');
  });

  assert.throws(
    () => verifyWeek06CompareDisposition({ rootDir: ROOT, fixturePath: targetPath }),
    /generic Technical Page projection leaks week06-0521/
  );
});

test('denied comparison leakage is rejected', () => {
  const { targetPath } = mutateJson(FIXTURE_RELATIVE_PATH, (fixture) => {
    fixture.comparison.registry.push('migrate-fastgpt-neutral-competitor-guide');
  });

  assert.throws(
    () => verifyWeek06CompareDisposition({ rootDir: ROOT, fixturePath: targetPath }),
    /denied candidate week06-0523 leaks into comparison registry/
  );
});

test('official evidence must use HTTPS', () => {
  const { targetPath } = mutateJson(CONTRACT_RELATIVE_PATH, (contract) => {
    contract.candidates[1].officialSources[0] = 'http://maxkb.cn/docs/';
  });

  assert.throws(
    () => verifyWeek06CompareDisposition({ rootDir: ROOT, contractPath: targetPath }),
    /week06-0522 official source must use HTTPS/
  );
});

test('release and rollback preserve the merged identity', () => {
  const missingRollback = mutateJson(CONTRACT_RELATIVE_PATH, (contract) => {
    delete contract.rollbackManifest;
  });
  assert.throws(
    () => verifyWeek06CompareDisposition({ rootDir: ROOT, contractPath: missingRollback.targetPath }),
    /rollback manifest is required/
  );

  const missingIdentity = mutateJson(CONTRACT_RELATIVE_PATH, (contract) => {
    contract.releaseManifest.changedComparisonIdentities = [];
  });
  assert.throws(
    () => verifyWeek06CompareDisposition({ rootDir: ROOT, contractPath: missingIdentity.targetPath }),
    /release identities differ from merged identities/
  );
});
