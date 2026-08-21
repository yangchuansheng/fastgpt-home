const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const {
  buildImportPlan,
  foldIdentity,
  validateIdentitySet
} = require('./import-technical-content');

const root = path.resolve(__dirname, '..');
const fixture = path.join(root, 'scripts/fixtures/technical-page-delivery');

test('representative delivery normalizes the canonical path and body', () => {
  const plan = buildImportPlan({ repoRoot: root, sourcePath: fixture });
  const openSandbox = plan.pages.find(
    (page) => page.source.file === 'reference/fastgpt-opensandbox-env-config.md'
  );
  const secretPage = plan.pages.find(
    (page) => page.identity.canonicalPath === '/reference/fastgpt-chatglm2-m3e-api-test'
  );

  assert.equal(plan.pages.length, 3);
  assert.deepEqual(
    plan.pages.map((page) => page.operation),
    ['add', 'add', 'add']
  );
  assert.equal(openSandbox.identity.canonicalPath, '/reference/fastgpt-opensandbox-env-config');
  assert.equal(
    plan.pages.filter((page) =>
      page.identity.canonicalPath.endsWith('fastgpt-opensandbox-env-config')
    ).length,
    2
  );
  assert.match(secretPage.normalizedDocument, /YOUR_API_KEY/);
  assert.doesNotMatch(secretPage.normalizedDocument, /sk-aaabbb/);
  assert.equal(plan.ledger.denials.length, 1);
  assert.ok(
    plan.ledger.corrections.some(
      (correction) =>
        correction.field === 'canonicalPath' &&
        correction.to === '/reference/fastgpt-opensandbox-env-config'
    )
  );
  assert.ok(
    plan.ledger.corrections.some(
      (correction) => correction.field === 'body' && correction.to === 'YOUR_API_KEY'
    )
  );
  assert.ok(
    plan.ledger.corrections.some(
      (correction) => correction.field === 'pageType' && correction.to === '技术速查'
    )
  );
});

test('identity folding rejects full-identity collisions and permits repeated final slugs', () => {
  assert.equal(
    foldIdentity({ locale: 'ZH', canonicalPath: '/Reference/Example' }),
    'zh|/reference/example'
  );
  assert.notEqual(
    foldIdentity({ locale: 'zh', canonicalPath: '/deploy/example' }),
    foldIdentity({ locale: 'zh', canonicalPath: '/reference/example' })
  );
  assert.equal(
    foldIdentity({ locale: 'de', canonicalPath: '/straße/example' }),
    foldIdentity({ locale: 'DE', canonicalPath: '/STRASSE/example' })
  );
  assert.doesNotThrow(() =>
    validateIdentitySet([
      { locale: 'zh', canonicalPath: '/deploy/example' },
      { locale: 'zh', canonicalPath: '/reference/example' }
    ])
  );
  assert.throws(
    () =>
      validateIdentitySet([
        { locale: 'zh', canonicalPath: '/reference/example' },
        { locale: 'zh', canonicalPath: '/Ｒｅｆｅｒｅｎｃｅ/example' }
      ]),
    /identity collision/i
  );
});

test('schema drift fails with an actionable error', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'technical-content-'));
  fs.cpSync(fixture, tempRoot, { recursive: true });
  const manifestPath = path.join(tempRoot, 'delivery.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.accepted[0].unexpected = true;
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  assert.throws(() => buildImportPlan({ repoRoot: root, sourcePath: tempRoot }), /schema drift/i);

  delete manifest.accepted[0].unexpected;
  manifest.accepted[0].wordCount = '0';
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  assert.throws(() => buildImportPlan({ repoRoot: root, sourcePath: tempRoot }), /wordCount/i);
});

test('check mode leaves committed projections byte-for-byte unchanged', () => {
  const outputs = [
    'src/components/tech-center/entries.json',
    'src/content/tech-center/authority/import-manifest.json',
    'src/content/tech-center/authority/decision-ledger.json',
    'public/tech-center/search-index.json',
    'src/content/tech-center/deploy/fastgpt-opensandbox-env-config.md',
    'src/content/tech-center/reference/fastgpt-opensandbox-env-config.md',
    'src/content/tech-center/reference/fastgpt-chatglm2-m3e-api-test.md'
  ];
  const before = outputs.map((relativePath) => fs.readFileSync(path.join(root, relativePath)));
  const result = spawnSync(
    process.execPath,
    ['scripts/import-technical-content.js', '--check', '--source', fixture],
    { cwd: root, encoding: 'utf8' }
  );

  assert.equal(result.status, 0, result.stderr);
  outputs.forEach((relativePath, index) => {
    assert.deepEqual(fs.readFileSync(path.join(root, relativePath)), before[index], relativePath);
  });
});
