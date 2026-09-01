const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  loadTracerContract,
  verifyWeek06EnglishTracer,
  writeTracerExportFixture
} = require('./verify-week06-english-tracer');

const ROOT = path.resolve(__dirname, '..');

function withFixture(run) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'week06-english-tracer-'));
  try {
    writeTracerExportFixture({ rootDir: ROOT, fixtureRoot });
    return run(fixtureRoot);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

test('the accepted Week06 English tracer keeps source and decision provenance', () => {
  const contract = loadTracerContract(ROOT);
  assert.equal(contract.schemaVersion, 1);
  assert.equal(contract.batch, 'week06');
  assert.equal(contract.candidateId, 'week06-0006');
  assert.deepEqual(contract.identity, {
    locale: 'en',
    owner: 'io',
    canonicalPath: '/api/fastgpt-chat-api-reference',
    sourcePath: '/en/api/fastgpt-chat-api-reference'
  });
  assert.equal(contract.source.sourceUrl, 'https://doc.fastgpt.cn/en/openapi/chat');
  assert.equal(contract.source.sourceReference, contract.source.sourceUrl);
  assert.match(contract.source.sourceSha256, /^[a-f0-9]{64}$/);
  assert.match(contract.source.sourceBodySha256, /^[a-f0-9]{64}$/);
  assert.equal(contract.source.workbookRow, 1526);
  assert.match(contract.source.workbookSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(contract.decision, {
    disposition: 'accepted',
    operation: 'add',
    reason: 'Identity, source, evidence, security, operation-risk, duplicate, and hygiene checks passed.',
    evidence: [contract.source.sourceUrl],
    reviewer: 'technical-governance'
  });
});

test('the IO, CN, and Preview tracer fixtures satisfy the route contract', () => {
  withFixture((fixtureRoot) => {
    const result = verifyWeek06EnglishTracer({ rootDir: ROOT, fixtureRoot });
    assert.deepEqual(result.identity, 'en|/api/fastgpt-chat-api-reference');
    assert.deepEqual(result.variants, { io: 'indexable', cn: 'excluded', preview: 'review' });
    assert.deepEqual(result.hub, {
      locale: 'en',
      totalEntries: 1,
      initialEntries: 1,
      categoryCount: 1,
      featuredIdentity: 'en|/api/fastgpt-chat-api-reference',
      searchIdentity: 'en|/api/fastgpt-chat-api-reference'
    });
    assert.equal(result.initialJavaScriptProjection, 'deferred');
    assert.equal(result.searchFallback, 'bounded-initial-listing');
    assert.equal(result.registryDelta, 0);
  });
});

test('the verifier catches route, sitemap, preview, CN leakage, and initial-JS drift', () => {
  const mutations = [
    {
      name: 'IO canonical drift',
      mutate(fixtureRoot, contract) {
        const file = path.join(fixtureRoot, 'io', 'api', 'fastgpt-chat-api-reference', 'index.html');
        fs.writeFileSync(
          file,
          fs.readFileSync(file, 'utf8').replace(contract.expected.io.canonical, 'https://fastgpt.cn/api/fastgpt-chat-api-reference')
        );
      },
      pattern: /canonical/
    },
    {
      name: 'IO sitemap omission',
      mutate(fixtureRoot, contract) {
        const file = path.join(fixtureRoot, 'io', 'sitemap.xml');
        fs.writeFileSync(
          file,
          fs.readFileSync(file, 'utf8').replace(`<loc>${contract.expected.io.canonical}</loc>`, '')
        );
      },
      pattern: /sitemap/
    },
    {
      name: 'Preview robots drift',
      mutate(fixtureRoot) {
        const file = path.join(fixtureRoot, 'preview', 'en', 'api', 'fastgpt-chat-api-reference', 'index.html');
        fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('noindex, nofollow', 'index, follow'));
      },
      pattern: /Preview.*robots|robots.*Preview/i
    },
    {
      name: 'CN indexable copy',
      mutate(fixtureRoot) {
        const source = path.join(fixtureRoot, 'io', 'api', 'fastgpt-chat-api-reference', 'index.html');
        const target = path.join(fixtureRoot, 'cn', 'api', 'fastgpt-chat-api-reference', 'index.html');
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(source, target);
      },
      pattern: /CN.*copy|owner isolation|CN.*tracer/i
    },
    {
      name: 'initial JavaScript registry leak',
      mutate(fixtureRoot, contract) {
        const file = path.join(fixtureRoot, 'io', '_next', 'static', 'chunks', 'technical-center.js');
        fs.writeFileSync(file, `${fs.readFileSync(file, 'utf8')} ${contract.identity.canonicalPath}`);
      },
      pattern: /initial JavaScript/i
    }
  ];

  for (const mutation of mutations) {
    withFixture((fixtureRoot) => {
      const contract = loadTracerContract(ROOT);
      mutation.mutate(fixtureRoot, contract);
      assert.throws(
        () => verifyWeek06EnglishTracer({ rootDir: ROOT, fixtureRoot }),
        mutation.pattern,
        mutation.name
      );
    });
  }
});

test('the verifier catches an English registry delta while preserving the production baseline', () => {
  withFixture((fixtureRoot) => {
    const registryPath = path.join(fixtureRoot, 'production-entries.json');
    const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/components/tech-center/entries.json')));
    registry.push({
      title: 'Set up and use FastGPT Chat API',
      slug: '/en/api/fastgpt-chat-api-reference',
      category: 'api',
      categoryLabel: 'API',
      source: 'https://doc.fastgpt.cn/en/openapi/chat',
      sourceType: '官方文档',
      summary: 'English tracer',
      minutes: 1
    });
    fs.writeFileSync(registryPath, JSON.stringify(registry));
    assert.throws(
      () => verifyWeek06EnglishTracer({ rootDir: ROOT, fixtureRoot, registryPath }),
      /registry delta|registry digest/i
    );
  });
});
