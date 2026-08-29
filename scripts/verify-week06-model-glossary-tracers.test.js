const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const typescript = require('typescript');
const {
  loadAuthorityCandidates,
  loadTracerContract,
  parseArgs,
  verifyCategoryContract,
  verifyModelGlossaryExportFixture,
  verifyProductionRegistry,
  verifyWeek06ModelGlossaryTracers,
  writeTracerExportFixture
} = require('./verify-week06-model-glossary-tracers');

const ROOT = path.resolve(__dirname, '..');

function withFixture(run) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'week06-model-glossary-test-'));
  try {
    writeTracerExportFixture({ rootDir: ROOT, fixtureRoot });
    return run(fixtureRoot, loadTracerContract(ROOT));
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

function loadTypeScriptModule(filePath, modules) {
  const output = typescript.transpileModule(fs.readFileSync(filePath, 'utf8'), {
    compilerOptions: {
      esModuleInterop: true,
      jsx: typescript.JsxEmit.ReactJSX,
      module: typescript.ModuleKind.CommonJS,
      target: typescript.ScriptTarget.ES2022
    }
  }).outputText;
  const module = { exports: {} };
  const localRequire = (specifier) => {
    if (Object.prototype.hasOwnProperty.call(modules, specifier)) return modules[specifier];
    throw new Error(`Unexpected test module dependency: ${specifier}`);
  };
  new Function('module', 'exports', 'require', output)(module, module.exports, localRequire);
  return module.exports;
}

test('the actual JSON-LD component renders localized model and glossary category labels', () => {
  const categoryData = loadTypeScriptModule(
    path.join(ROOT, 'src/components/tech-center/data.ts'),
    {
      './entries.json': [],
      '@/lib/technical-content-policy.json': readJsonFile(
        path.join(ROOT, 'src/lib/technical-content-policy.json')
      ),
      './constants': {
        CATEGORY_DEFINITIONS: [
          { key: 'model', icon: 'model' },
          { key: 'glossary', icon: 'glossary' }
        ]
      },
      './types': {
        getTechnicalPageIdentity() {
          throw new Error('identity lookup is outside this runtime regression');
        }
      }
    }
  );
  assert.equal(categoryData.getTechCategoryLabelForLocale('model', 'en'), 'Model guides');
  assert.equal(categoryData.getTechCategoryLabelForLocale('glossary', 'en'), 'Glossary');
  assert.equal(categoryData.getTechCategoryLabelForLocale('model', 'zh'), '模型指南');
  assert.equal(categoryData.getTechCategoryLabelForLocale('glossary', 'zh'), '术语表');

  const jsonLd = loadTypeScriptModule(
    path.join(ROOT, 'src/components/tech-center/TechCenterJsonLd.tsx'),
    {
      'react/jsx-runtime': require('react/jsx-runtime'),
      '@/components/JsonLd': { JsonLdScript() {} },
      '@/components/tech-center/data': categoryData,
      '@/lib/siteRouting': {
        getOwnedLocaleUrl(locale, publicPath = '/') {
          return `${locale === 'zh' ? 'https://fastgpt.cn' : 'https://fastgpt.io'}${publicPath}`;
        }
      },
      '@/lib/technicalRouting': {
        getTechnicalCanonicalUrl(article) {
          return `https://fastgpt.io${article.slug.slice('/en'.length)}`;
        }
      }
    }
  );
  const element = jsonLd.TechArticleJsonLd({
    schema: {
      authorName: 'FastGPT',
      breadcrumbHome: 'Home',
      organizationName: 'FastGPT',
      siteName: 'FastGPT'
    },
    article: {
      category: 'model',
      categoryLabel: '模型指南',
      contentType: 'TechArticle',
      keywords: [],
      markdown: 'Model guide',
      metaTitle: 'Model guide',
      minutes: 1,
      pageType: '模型指南',
      seoDescription: 'Model guide',
      slug: '/en/model/runtime-category-label',
      sourceType: '官方文档',
      summary: 'Model guide',
      title: 'Model guide'
    }
  });
  assert.equal(element.props.data['@graph'][0].articleSection, 'Model guides');
});

test('the category and authority contracts accept model/glossary and preserve all three tracers', () => {
  const contract = loadTracerContract(ROOT);
  const projections = verifyCategoryContract(contract);
  const candidates = loadAuthorityCandidates(ROOT, contract);
  assert.deepEqual(contract.candidateCounts, {
    'zh|glossary': 280,
    'zh|model': 14,
    'en|model': 47
  });
  assert.deepEqual(
    projections.map((entry) => entry.category).sort(),
    ['glossary', 'model', 'model']
  );
  assert.deepEqual(
    candidates.map((candidate) => candidate.id),
    ['week06-0688', 'week06-0974', 'week06-0296']
  );
});

test('the full model/glossary tracer verifier preserves the Week06 dry-run baseline', () => {
  const result = verifyWeek06ModelGlossaryTracers({ rootDir: ROOT });
  assert.deepEqual(result, {
    tracers: [
      'zh|/glossary/agent-sandbox-config-migration',
      'zh|/model/fastgpt-aiproxy-channelid-setup',
      'en|/model/add-model-existing-fastgpt-provider'
    ],
    candidateCounts: {
      'zh|glossary': 280,
      'zh|model': 14,
      'en|model': 47
    },
    variants: { cn: 2, io: 1, preview: 3 },
    ownerLeaks: 0,
    searchFallback: 'bounded-initial-listing',
    registryDelta: 0
  });
});

test('the export verifier catches route, owner, metadata, sitemap, search, and fallback mutations', () => {
  const mutations = [
    {
      name: 'missing tracer',
      mutate(root) {
        fs.rmSync(path.join(root, 'cn/glossary/agent-sandbox-config-migration'), {
          recursive: true,
          force: true
        });
      },
      pattern: /missing HTTP-equivalent 200 route/
    },
    {
      name: 'CN owner leak',
      mutate(root) {
        const source = path.join(root, 'io/model/add-model-existing-fastgpt-provider/index.html');
        const target = path.join(root, 'cn/model/add-model-existing-fastgpt-provider/index.html');
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(source, target);
      },
      pattern: /CN owner leak/
    },
    {
      name: 'IO owner leak',
      mutate(root) {
        const source = path.join(root, 'cn/model/fastgpt-aiproxy-channelid-setup/index.html');
        const target = path.join(root, 'io/model/fastgpt-aiproxy-channelid-setup/index.html');
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(source, target);
      },
      pattern: /IO owner leak/
    },
    {
      name: 'canonical drift',
      mutate(root) {
        const file = path.join(root, 'cn/glossary/agent-sandbox-config-migration/index.html');
        fs.writeFileSync(
          file,
          fs.readFileSync(file, 'utf8').replace(
            'https://fastgpt.cn/glossary/agent-sandbox-config-migration',
            'https://fastgpt.io/glossary/agent-sandbox-config-migration'
          )
        );
      },
      pattern: /canonical drift/
    },
    {
      name: 'Preview robots drift',
      mutate(root) {
        const file = path.join(
          root,
          'preview/en/model/add-model-existing-fastgpt-provider/index.html'
        );
        fs.writeFileSync(
          file,
          fs.readFileSync(file, 'utf8').replace('noindex, nofollow', 'index, follow')
        );
      },
      pattern: /robots drift/
    },
    {
      name: 'sitemap omission',
      mutate(root) {
        const file = path.join(root, 'io/sitemap.xml');
        fs.writeFileSync(file, '<urlset></urlset>');
      },
      pattern: /sitemap owner contract drift/
    },
    {
      name: 'cross-locale search projection',
      mutate(root) {
        const file = path.join(root, 'cn/tech-center/search-index.json');
        const search = JSON.parse(fs.readFileSync(file));
        search[0].locale = 'en';
        search[0].identity = `en|${search[0].publicPath}`;
        fs.writeFileSync(file, JSON.stringify(search));
      },
      pattern: /search projection crosses locale/
    },
    {
      name: 'cross-locale related content',
      mutate(root, contract) {
        const file = path.join(root, 'cn/model/fastgpt-aiproxy-channelid-setup/index.html');
        const tracer = contract.tracers.find((entry) => entry.candidateId === 'week06-0974');
        const foreignIdentity = 'en|/model/add-model-existing-fastgpt-provider';
        fs.writeFileSync(
          file,
          fs
            .readFileSync(file, 'utf8')
            .replace(
              `data-related-identities="${tracer.relatedIdentity}"`,
              `data-related-identities="${foreignIdentity}"`
            )
        );
        tracer.relatedIdentity = foreignIdentity;
      },
      pattern: /related content crosses locale or category/
    },
    {
      name: 'initial JavaScript search leak',
      mutate(root) {
        const file = path.join(root, 'io/_next/static/chunks/technical-center.js');
        fs.appendFileSync(file, ' en|/model/add-model-existing-fastgpt-provider');
      },
      pattern: /embedded in initial JavaScript/
    },
    {
      name: 'missing bounded fallback',
      mutate(root) {
        const file = path.join(root, 'cn/tech-center.html');
        fs.writeFileSync(
          file,
          fs
            .readFileSync(file, 'utf8')
            .replaceAll('<article>', '<div>')
            .replaceAll('</article>', '</div>')
        );
      },
      pattern: /no server-rendered entries/
    }
  ];
  for (const mutation of mutations) {
    withFixture((fixtureRoot, contract) => {
      mutation.mutate(fixtureRoot, contract);
      assert.throws(
        () => verifyModelGlossaryExportFixture({ fixtureRoot, contract }),
        mutation.pattern,
        mutation.name
      );
    });
  }
});

test('the verifier rejects unsupported categories and production registry deltas', () => {
  const contract = loadTracerContract(ROOT);
  const unsupported = structuredClone(contract);
  unsupported.tracers[0].category = 'unsupported';
  unsupported.tracers[0].identity.canonicalPath = '/unsupported/category-contract';
  unsupported.tracers[0].identity.sourcePath = '/zh/unsupported/category-contract';
  assert.throws(() => verifyCategoryContract(unsupported), /unsupported category unsupported/);

  const registryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'week06-registry-delta-'));
  try {
    const registryPath = path.join(registryRoot, 'entries.json');
    const registry = readRegistry();
    registry.push({ ...registry[0], slug: contract.tracers[0].identity.sourcePath });
    fs.writeFileSync(registryPath, JSON.stringify(registry));
    assert.throws(
      () => verifyProductionRegistry(ROOT, contract, registryPath),
      /registry delta|registry digest/i
    );
  } finally {
    fs.rmSync(registryRoot, { recursive: true, force: true });
  }
});

test('the CLI rejects missing option values at its trust boundary', () => {
  for (const option of ['--fixture-root', '--registry', '--contract']) {
    assert.throws(() => parseArgs([option]), new RegExp(`${option} requires`));
    assert.throws(() => parseArgs([option, '--registry']), new RegExp(`${option} requires`));
  }
});

function readRegistry() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'src/components/tech-center/entries.json')));
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}
