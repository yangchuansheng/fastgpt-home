const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  buildWeek06Wave1Package,
  loadWeek06Wave1Contract,
  loadWeek06Wave1Selection,
  verifyWeek06Wave1ExportFixtures,
  verifyWeek06Wave1Live,
  verifyWeek06Wave1RollbackOnError,
  verifyWeek06Wave1Source,
  verifyWeek06Wave1Selection,
  writeWeek06Wave1ExportFixture
} = require('./lib/week06-technical-wave1');
const { parseArgs } = require('./verify-week06-wave1');
const { parseArgs: parseGenerateArgs } = require('./generate-week06-wave1');

const ROOT = path.resolve(__dirname, '..');

test('Week06 Wave 1 approves exactly 25 Chinese and 25 English identities', () => {
  const contract = loadWeek06Wave1Contract(ROOT);
  const selection = loadWeek06Wave1Selection(ROOT);

  assert.deepEqual(contract.expected.locales, { zh: 25, en: 25 });
  assert.equal(contract.expected.publicationCount, 50);
  assert.equal(selection.candidateIds.length, 50);
  assert.deepEqual(selection.expectedCounts, {
    total: 50,
    locales: { zh: 25, en: 25 },
    cohorts: { official: 30, errorCode: 5, model: 10, glossary: 5 }
  });
  assert.equal(new Set(selection.candidateIds).size, 50);
});

test('Week06 Wave 1 selection passes authority, source, security, risk, and collision gates', () => {
  const result = verifyWeek06Wave1Selection(ROOT);

  assert.deepEqual(result.localeCounts, { zh: 25, en: 25 });
  assert.deepEqual(result.cohortCounts, {
    official: 30,
    errorCode: 5,
    model: 10,
    glossary: 5
  });
  assert.equal(result.selectedCount, 50);
  assert.equal(result.identityCollisions, 0);
  assert.equal(result.readerPathCollisions, 0);
  assert.equal(result.ownerLeaks, 0);
  assert.match(result.authoritySha256, /^[a-f0-9]{64}$/);
  assert.match(result.selectionSha256, /^[a-f0-9]{64}$/);
  assert.match(result.sourceSetSha256, /^[a-f0-9]{64}$/);
});

test('Week06 Wave 1 builds bilingual reader content and one 50-identity projection', () => {
  const wavePackage = buildWeek06Wave1Package(ROOT);

  assert.equal(wavePackage.entries.length, 1422);
  assert.equal(wavePackage.search.zh.length, 1397);
  assert.equal(wavePackage.search.en.length, 25);
  assert.equal(wavePackage.content.readerCount, 50);
  assert.equal(wavePackage.projection.identities.length, 50);
  assert.equal(wavePackage.projection.resultingPageCount, 1422);
  assert.equal(wavePackage.rollback.priorCompleteState.length, 58);
  assert(
    wavePackage.rollback.priorCompleteState.some(
      (surface) =>
        surface.path === 'src/content/tech-center/authority/week06-wave1-rollback.json' &&
        surface.exists === false
    )
  );
  const multiSource = wavePackage.readerDocuments.get(
    'src/content/tech-center/zh/glossary/agent-sandbox-config-migration.md'
  );
  assert.match(
    multiSource,
    /\[FastGPT 官方来源\]\(https:\/\/doc\.fastgpt\.cn\/zh-CN\/self-host\/config\/sandbox\/opensandbox\)/
  );
  assert.match(
    multiSource,
    /\[FastGPT 官方来源\]\(https:\/\/doc\.fastgpt\.cn\/zh-CN\/self-host\/upgrading\/4-16\/4160\)/
  );
  assert.doesNotMatch(multiSource, /opensandbox、https:/);
  assert.deepEqual(wavePackage.projection.localeCounts, { zh: 25, en: 25 });

  const english = wavePackage.readerDocuments.get(
    'src/content/tech-center/en/api/fastgpt-chat-api-reference.md'
  );
  const chinese = wavePackage.readerDocuments.get(
    'src/content/tech-center/zh/glossary/agent-sandbox-config-migration.md'
  );
  assert.match(english, /## Applicability and version scope/);
  assert.match(english, /## Authentication Methods/);
  assert.match(english, /v1 and v2/);
  assert.match(english, /4\.9\.4/);
  assert.match(english, /\| `appId` \|/);
  assert.match(english, /\[FastGPT official source\]\(https:\/\//);
  assert.doesNotMatch(english, /[\u3400-\u9fff]/);
  assert.match(chinese, /## 适用性与版本范围/);
  assert.match(chinese, /## 安全护栏/);
  assert.match(chinese, /## 回滚指引/);
  assert.match(chinese, /\[FastGPT 官方来源\]\(https:\/\//);
  assert(
    wavePackage.content.sources.every(
      (source) =>
        source.sourceBinding === 'recorded-approved-source-digests' &&
        /^[a-f0-9]{64}$/.test(source.importedBodySha256)
    )
  );
});

test('Week06 Wave 1 committed source package preserves one exact identity set', () => {
  const result = verifyWeek06Wave1Source(ROOT);

  assert.deepEqual(result.localeCounts, { zh: 25, en: 25 });
  assert.equal(result.selectedCount, 50);
  assert.equal(result.publicationCount, 50);
  assert.equal(result.resultingPageCount, 1422);
  assert.equal(result.projectionDrift, 0);
  assert.equal(result.hygieneFindings, 0);
  assert.equal(result.repositoryConsistent, true);
  assert.equal(result.sourceVerified, false);
  assert.equal(result.sourceDigestVerifiedCount, 0);
  assert.equal(result.fixtureVerified, true);
  assert.equal(result.exportVerified, false);
  assert.equal(result.releaseEligible, false);
  assert.equal(result.productionObserved, false);
});

test('Week06 Wave 1 partial write restores every real surface byte and digest', () => {
  const result = verifyWeek06Wave1RollbackOnError(ROOT);

  assert.equal(result.restored, true);
  assert.equal(result.surfaceCount, 58);
  assert.equal(result.existingSurfaceCount, 3);
  assert.equal(result.absentSurfaceCount, 55);
  assert.equal(result.byteDrift, 0);
  assert.equal(result.digestDrift, 0);
});

test('Week06 Wave 1 staged CN, IO, and Preview exports preserve owner isolation', () => {
  const result = verifyWeek06Wave1ExportFixtures(ROOT);

  assert.deepEqual(result.ownerPages, { cn: 25, io: 25, preview: 50 });
  assert.deepEqual(result.hubs, { cn: ['zh'], io: ['en'], preview: ['zh', 'en'] });
  assert.equal(result.productionObserved, 0);
  assert.equal(result.stagedPagesVerified, 100);
  assert.equal(result.fixtureVerified, true);
  assert.equal(result.exportVerified, false);
  assert.equal(result.ownerLeaks, 0);
  assert.equal(result.localeDrift, 0);
  assert.equal(result.sitemapDrift, 0);
  assert.equal(result.searchDrift, 0);
  assert.equal(result.brokenInternalLinks, 0);
});

test('Week06 Wave 1 live verifier requires 50 owner HTTP pages and exact sitemaps', async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'week06-wave1-live-'));
  try {
    for (const variant of ['cn', 'io']) {
      writeWeek06Wave1ExportFixture(ROOT, path.join(temporaryRoot, variant), variant);
    }
    const fixtureFetch = async (url) => {
      const parsed = new URL(url);
      const variant = parsed.hostname === 'fastgpt.cn' ? 'cn' : 'io';
      const outDir = path.join(temporaryRoot, variant);
      const relative = parsed.pathname.replace(/^\/+|\/+$/g, '');
      const candidates =
        relative === 'sitemap.xml'
          ? [path.join(outDir, 'sitemap.xml')]
          : [path.join(outDir, `${relative}.html`), path.join(outDir, relative, 'index.html')];
      const filePath = candidates.find((candidate) => fs.existsSync(candidate));
      return {
        status: filePath ? 200 : 404,
        headers: {
          get: () => (relative === 'sitemap.xml' ? 'application/xml' : 'text/html; charset=utf-8')
        },
        text: async () => (filePath ? fs.readFileSync(filePath, 'utf8') : '')
      };
    };
    const result = await verifyWeek06Wave1Live(ROOT, { fetchImpl: fixtureFetch });
    assert.equal(result.liveHttpVerified, true);
    assert.equal(result.productionObserved, 50);
    assert.equal(result.http200, 50);
    assert.equal(result.canonicalVerified, 50);
    assert.equal(result.languageVerified, 50);
    assert.equal(result.sitemapVerified, 50);
    assert.equal(result.nonOwnerChecked, 50);
    assert.equal(result.nonOwnerIndexable, 0);

    let mutated = false;
    const driftFetch = async (url, options) => {
      const response = await fixtureFetch(url, options);
      if (!mutated && !url.endsWith('/sitemap.xml')) {
        mutated = true;
        const body = await response.text();
        return { ...response, text: async () => body.replace('rel="canonical"', 'rel="prev"') };
      }
      return response;
    };
    await assert.rejects(
      () => verifyWeek06Wave1Live(ROOT, { fetchImpl: driftFetch }),
      /canonical drift/
    );

    const leakFetch = async (url, options) => {
      if (url === 'https://fastgpt.cn/api/fastgpt-chat-api-reference') {
        return fixtureFetch('https://fastgpt.io/api/fastgpt-chat-api-reference', options);
      }
      return fixtureFetch(url, options);
    };
    await assert.rejects(
      () => verifyWeek06Wave1Live(ROOT, { fetchImpl: leakFetch }),
      /non-owner indexable copy/
    );
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('Week06 Wave 1 rejects selection mutations and invalid CLI input', () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'week06-wave1-mutation-'));
  try {
    for (const relativePath of [
      'scripts/fixtures/technical-authority/week06-wave1-contract.json',
      'src/content/tech-center/authority/week06-wave1-selection.json',
      'src/content/tech-center/authority/week06-candidate-manifest.json',
      'src/components/tech-center/entries.json'
    ]) {
      const target = path.join(temporaryRoot, relativePath);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(ROOT, relativePath), target);
    }
    const selectionPath = path.join(
      temporaryRoot,
      'src/content/tech-center/authority/week06-wave1-selection.json'
    );
    const authorityPath = path.join(
      temporaryRoot,
      'src/content/tech-center/authority/week06-candidate-manifest.json'
    );
    const authority = JSON.parse(fs.readFileSync(authorityPath, 'utf8'));
    const selectedCandidate = authority.candidates.find(
      (candidate) => candidate.id === 'week06-0006'
    );
    assert(selectedCandidate);
    selectedCandidate.sourceClassification.code = 'third-party-summary';
    fs.writeFileSync(authorityPath, JSON.stringify(authority));
    assert.throws(() => verifyWeek06Wave1Selection(temporaryRoot), /approved source cohort/);
    fs.copyFileSync(
      path.join(ROOT, 'src/content/tech-center/authority/week06-candidate-manifest.json'),
      authorityPath
    );
    const riskAuthority = JSON.parse(fs.readFileSync(authorityPath, 'utf8'));
    riskAuthority.candidates.find(
      (candidate) => candidate.id === 'week06-0006'
    ).operationRisk.findings = [{ disposition: 'denied' }];
    fs.writeFileSync(authorityPath, JSON.stringify(riskAuthority));
    assert.throws(() => verifyWeek06Wave1Selection(temporaryRoot), /unresolved publication gate/);
    fs.copyFileSync(
      path.join(ROOT, 'src/content/tech-center/authority/week06-candidate-manifest.json'),
      authorityPath
    );
    const traversalAuthority = JSON.parse(fs.readFileSync(authorityPath, 'utf8'));
    const traversalCandidate = traversalAuthority.candidates.find(
      (candidate) => candidate.id === 'week06-0006'
    );
    traversalCandidate.identity.canonicalPath = '/api/../../../../tmp/wave1-escape';
    traversalCandidate.identity.sourcePath = '/en/api/../../../../tmp/wave1-escape';
    fs.writeFileSync(authorityPath, JSON.stringify(traversalAuthority));
    assert.throws(() => verifyWeek06Wave1Selection(temporaryRoot), /traversal-free/);
    fs.copyFileSync(
      path.join(ROOT, 'src/content/tech-center/authority/week06-candidate-manifest.json'),
      authorityPath
    );
    const selection = JSON.parse(fs.readFileSync(selectionPath, 'utf8'));
    selection.identitySet.pop();
    fs.writeFileSync(selectionPath, JSON.stringify(selection));
    assert.throws(
      () => verifyWeek06Wave1Selection(temporaryRoot),
      /must contain exactly 50 identities/
    );
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }

  assert.deepEqual(parseArgs([]), {
    mode: 'source',
    outDir: null,
    variant: null,
    sourceRoot: null
  });
  assert.throws(() => parseArgs(['--export']), /requires --variant and --out-dir/);
  assert.throws(() => parseArgs(['--variant', 'other']), /cn, io, or preview/);
  assert.throws(() => parseArgs(['--unknown']), /Unknown option/);
  assert.deepEqual(parseArgs(['--live']), {
    mode: 'live',
    outDir: null,
    variant: null,
    sourceRoot: null
  });
  assert.deepEqual(parseArgs(['--rollback-on-error']), {
    mode: 'rollback',
    outDir: null,
    variant: null,
    sourceRoot: null
  });
  assert.deepEqual(parseArgs(['--atomic-rollback']), {
    mode: 'rollback',
    outDir: null,
    variant: null,
    sourceRoot: null
  });
  assert.throws(
    () => parseGenerateArgs(['--write']),
    /requires --source-root for all 50 approved source files/
  );
  assert.equal(parseGenerateArgs(['--write', '--source-root', '.']).sourceRoot, ROOT);
  assert.equal(parseGenerateArgs(['--check', '--source-root', '.']).sourceRoot, ROOT);
});
