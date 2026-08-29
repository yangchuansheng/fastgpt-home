#!/usr/bin/env node

/** Verify the accepted Week06 English Technical Page tracer across site variants. */

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { buildNormalizedTechnicalPage } = require('./import-technical-content');
const { verifyProjectionConsistency } = require('./lib/technical-projection');
const { verifyTechnicalCenter } = require('./verify-technical-center');
const { verifyWeek06TechnicalAuthority } = require('./verify-week06-technical-authority');

const ROOT = path.resolve(__dirname, '..');
const CONTRACT_RELATIVE_PATH = 'scripts/fixtures/technical-authority/week06-english-tracer.json';
const DEFAULT_BODY_RELATIVE_PATH = 'scripts/fixtures/technical-authority/week06-english-tracer.md';
const CONTENT_HYGIENE_SCRIPT = path.join(__dirname, 'verify-content-hygiene.js');
const TECH_CENTER_ROUTE_SOURCE = path.join(ROOT, 'src/app/[lang]/tech-center/page.tsx');
const TECH_CENTER_CLIENT_SOURCE = path.join(
  ROOT,
  'src/components/tech-center/TechCenterPage.tsx'
);
const TECHNICAL_ROUTE_SOURCE = path.join(ROOT, 'src/app/[lang]/[section]/[slug]/page.tsx');
const TECHNICAL_ROUTING_SOURCE = path.join(ROOT, 'src/lib/technicalRouting.ts');

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function resolveRelative(rootDir, relativePath) {
  const resolvedRoot = path.resolve(rootDir);
  const resolvedPath = path.resolve(resolvedRoot, relativePath);
  assert(
    resolvedPath === resolvedRoot || resolvedPath.startsWith(`${resolvedRoot}${path.sep}`),
    `Path escapes root: ${relativePath}`
  );
  return resolvedPath;
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function parseFrontMatter(source, label) {
  const normalized = source.replace(/\r\n?/g, '\n');
  assert(normalized.startsWith('---\n'), `${label} is missing front matter`);
  const end = normalized.indexOf('\n---', 4);
  assert(end >= 0, `${label} has unterminated front matter`);
  const metadata = {};
  for (const line of normalized.slice(4, end).split('\n')) {
    const separator = line.indexOf(':');
    assert(separator > 0, `${label} has an invalid front matter line`);
    metadata[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return { metadata, body: normalized.slice(end + 4).replace(/^\n/, '').trim() };
}

function loadTracerContract(rootDir = ROOT) {
  const contractPath = resolveRelative(rootDir, CONTRACT_RELATIVE_PATH);
  const contract = readJson(contractPath);
  assert.equal(contract.schemaVersion, 1, 'Week06 tracer schema drift');
  assert.equal(contract.batch, 'week06', 'Week06 tracer batch drift');
  assert.equal(contract.candidateId, 'week06-0006', 'Week06 tracer candidate drift');
  assert.deepEqual(contract.identity, {
    locale: 'en',
    owner: 'io',
    canonicalPath: '/api/fastgpt-chat-api-reference',
    sourcePath: '/en/api/fastgpt-chat-api-reference'
  });
  assert.equal(contract.source.authorityPath, 'src/content/tech-center/authority/week06-candidate-manifest.json');
  assert.equal(contract.source.fixturePath, DEFAULT_BODY_RELATIVE_PATH);
  assert.equal(contract.source.sourceReference, contract.source.sourceUrl);
  assert.match(contract.source.sourceUrl, /^https:\/\/[^\s/]+(?:\/|$)/);
  assert.match(contract.source.sourceSha256, /^[a-f0-9]{64}$/);
  assert.match(contract.source.sourceBodySha256, /^[a-f0-9]{64}$/);
  assert.match(contract.source.bodySha256, /^[a-f0-9]{64}$/);
  assert.equal(contract.source.bodySha256, contract.source.sourceBodySha256);
  assert.match(contract.source.workbookSha256, /^[a-f0-9]{64}$/);
  assert(Number.isInteger(contract.source.workbookRow) && contract.source.workbookRow > 0);
  assert.deepEqual(contract.decision, {
    disposition: 'accepted',
    operation: 'add',
    reason: 'Identity, source, evidence, security, operation-risk, duplicate, and hygiene checks passed.',
    evidence: [contract.source.sourceUrl],
    reviewer: 'technical-governance'
  });
  assert.equal(contract.content.locale, 'en');
  assert.equal(contract.content.category, 'api');
  assert.equal(contract.content.categoryLabel, 'API');
  assert.equal(contract.expected.io.siteVariant, 'io');
  assert.equal(contract.expected.cn.siteVariant, 'cn');
  assert.equal(contract.expected.preview.siteVariant, 'preview');
  assert.equal(contract.expected.io.owner, 'io');
  assert.equal(contract.expected.cn.owner, 'io');
  assert.equal(contract.expected.preview.owner, 'io');
  assert.equal(contract.expected.io.status, 200);
  assert.equal(contract.expected.preview.status, 200);
  assert.equal(contract.expected.io.sitemap, true);
  assert.equal(contract.expected.cn.sitemap, false);
  assert.equal(contract.expected.preview.sitemap, false);
  assert.equal(contract.expected.hub.maxInitialEntries, 12);
  assert.equal(contract.expected.productionRegistry.delta, 0);
  assert.equal(contract.expected.wave0.publicationCount, 0);
  assert.equal(contract.expected.wave0.publicPageDelta, 0);
  return contract;
}

function loadAuthorityCandidate(rootDir, contract) {
  const manifest = readJson(resolveRelative(rootDir, contract.source.authorityPath));
  assert.equal(manifest.status, 'closed', 'Week06 authority is open');
  const candidate = manifest.candidates.find((entry) => entry.id === contract.candidateId);
  assert(candidate, `Week06 authority is missing ${contract.candidateId}`);
  assert.deepEqual(candidate.identity, contract.identity);
  assert.equal(candidate.title, contract.content.title);
  assert.equal(candidate.category, contract.content.category);
  assert.equal(candidate.categoryLabel, contract.content.categoryLabel);
  assert.equal(candidate.state, 'accepted');
  assert.equal(candidate.finalDisposition, 'accepted');
  assert.equal(candidate.action, 'add');
  assert.equal(candidate.sourceClassification.sourceUrl, contract.source.sourceUrl);
  assert.equal(candidate.sourceClassification.sourceReference, contract.source.sourceReference);
  for (const key of [
    'sourceFile',
    'sourceUrl',
    'sourceReference',
    'sourceSha256',
    'sourceBodySha256',
    'bodySha256',
    'workbookRow',
    'workbookSha256'
  ]) {
    assert.equal(candidate.provenance[key], contract.source[key], `Source provenance drift: ${key}`);
  }
  assert.deepEqual(candidate.decision, contract.decision, 'Decision provenance drift');
  assert.equal(candidate.evidence.status, 'verified');
  assert.deepEqual(candidate.evidence.sources, contract.decision.evidence);
  assert.equal(candidate.security.status, 'clear');
  assert.equal(candidate.operationRisk.level, 'none');
  return candidate;
}

function verifyWave0(rootDir, contract) {
  const projection = readJson(resolveRelative(rootDir, contract.expected.wave0.projectionPath));
  assert.equal(projection.batch, 'week06');
  assert.equal(projection.wave, 'wave-0');
  assert.equal(projection.status, 'empty');
  assert.equal(projection.mode, 'dry-run');
  assert.equal(projection.governanceStatus, 'governance-complete');
  assert.equal(projection.publicationCount, contract.expected.wave0.publicationCount);
  assert.equal(projection.publicPageDelta, contract.expected.wave0.publicPageDelta);
  assert.deepEqual(projection.identities, []);
  assert.equal(projection.registry.path, contract.expected.productionRegistry.path);
  assert.equal(projection.registry.delta, contract.expected.wave0.registryDelta);
  assert.equal(projection.search.delta, contract.expected.wave0.searchDelta);
  assert.equal(projection.sitemap.delta, contract.expected.wave0.sitemapDelta);
  return projection;
}

function verifyProductionRegistry(rootDir, contract, registryPath) {
  const filePath = registryPath || resolveRelative(rootDir, contract.expected.productionRegistry.path);
  const raw = fs.readFileSync(filePath);
  const entries = JSON.parse(raw);
  assert(Array.isArray(entries), 'Production Technical Page registry must be an array');
  assert.equal(
    entries.length,
    contract.expected.productionRegistry.count,
    'Production Technical Page registry delta changed the expected count'
  );
  assert.equal(
    sha256(raw),
    contract.expected.productionRegistry.sha256,
    'Production Technical Page registry digest drift; expected Wave0 delta=0'
  );
  assert(
    !entries.some((entry) => entry.slug === `/${contract.identity.locale}${contract.identity.canonicalPath}`),
    'Production Technical Page registry contains the Week06 tracer'
  );
  return entries.length;
}

function loadFixtureSource(rootDir, contract) {
  const sourcePath = resolveRelative(rootDir, contract.source.fixturePath);
  const raw = fs.readFileSync(sourcePath, 'utf8');
  assert.equal(sha256(raw), contract.source.fixtureSha256, 'English tracer fixture source drift');
  const parsed = parseFrontMatter(raw, contract.source.fixturePath);
  assert.equal(parsed.metadata.title, contract.content.title);
  assert.equal(parsed.metadata.slug, contract.identity.sourcePath);
  assert.equal(parsed.metadata.source, contract.source.sourceUrl);
  assert.equal(parsed.metadata.source_type, contract.content.sourceType);
  assert(/[A-Za-z]{3}/.test(parsed.body), 'English tracer body has no English prose');
  assert(!/[\u3400-\u9fff]/.test(parsed.body), 'English tracer body contains CJK prose');
  const normalized = buildNormalizedTechnicalPage({
    metadata: parsed.metadata,
    identity: {
      locale: contract.identity.locale,
      canonicalPath: contract.identity.canonicalPath
    },
    body: parsed.body,
    wordCount: parsed.body.split(/\s+/).filter(Boolean).length,
    sourceCount: 1,
    label: contract.source.fixturePath
  });
  assert.equal(normalized.projection.slug, contract.identity.sourcePath);
  assert.equal(normalized.projection.category, contract.content.category);
  assert.equal(normalized.projection.categoryLabel, contract.content.categoryLabel);
  assert.equal(normalized.projection.sourceType, contract.content.sourceType);
  return { parsed, normalized, raw };
}

function htmlDocument({ locale, title, canonical, robots, body, includeInitialScript }) {
  const script = includeInitialScript
    ? '<script src="/_next/static/chunks/technical-center.js"></script>'
    : '';
  return `<!doctype html><html lang="${locale}"><head><title>${title}</title><link rel="canonical" href="${canonical}"><meta name="robots" content="${robots}"></head><body>${body}${script}${
    canonical
      ? `<script type="application/ld+json">{"@type":"TechArticle","url":"${canonical}","inLanguage":"en-US"}</script>`
      : ''
  }</body></html>`;
}

function renderArticle(contract, variant, normalized) {
  const expected = contract.expected[variant];
  const review = variant === 'preview';
  const projection = normalized.normalized?.projection || normalized.projection;
  const readerBody = normalized.parsed?.body
    ?.replace(/^>\s*Source:.*$/gim, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
  const body = `<main><article data-identity="${contract.candidateId}"><h1>${projection.title}</h1><p>${
    review
      ? 'Review representation for the English Technical Page tracer.'
      : readerBody || 'FastGPT Chat API reference.'
  }</p><p>Source: <a href="${contract.source.sourceUrl}">FastGPT Chat API documentation</a></p></article></main>`;
  return htmlDocument({
    locale: 'en',
    title: projection.title,
    canonical: expected.canonical,
    robots: expected.robots,
    body,
    includeInitialScript: false
  });
}

function renderHub(contract, variant, projection) {
  const expected = contract.expected[variant];
  const preview = variant === 'preview';
  const link = preview ? expected.route : contract.identity.canonicalPath;
  const body = `<main data-locale="en" data-total-entries="1" data-category-api-count="1" data-featured-identity="${contract.expected.hub.featuredIdentity}"><h1>FastGPT Technical Center</h1><section><h2>API</h2><article><a href="${link}">${projection.title}</a></article></section></main>`;
  return htmlDocument({
    locale: 'en',
    title: 'FastGPT Technical Center',
    canonical: preview ? 'https://fastgpt.io/en/tech-center' : 'https://fastgpt.io/tech-center',
    robots: preview ? 'noindex, nofollow' : 'index, follow',
    body,
    includeInitialScript: true
  });
}

function searchProjection(projection) {
  return [
    {
      identity: `en|${projection.slug.slice('/en'.length)}`,
      title: projection.title,
      description: projection.summary,
      category: projection.category,
      locale: 'en',
      publicPath: projection.slug.slice('/en'.length),
      sourceType: projection.sourceType,
      minutes: projection.minutes
    }
  ];
}

function writeVariantFixture(fixtureRoot, variant, contract, source) {
  const variantRoot = path.join(fixtureRoot, variant);
  const expected = contract.expected[variant];
  const articleRoute = expected.route || contract.identity.canonicalPath;
  const articlePath = path.join(variantRoot, articleRoute.replace(/^\//, ''), 'index.html');
  if (variant !== 'cn') writeFile(articlePath, renderArticle(contract, variant, source));
  if (variant === 'cn') {
    writeFile(
      path.join(variantRoot, 'tech-center.html'),
      '<!doctype html><html lang="zh"><head><title>技术中心</title><meta name="robots" content="index, follow"></head><body><main><h1>技术中心</h1></main></body></html>'
    );
    writeFile(path.join(variantRoot, 'entries.json'), '[]');
    writeFile(path.join(variantRoot, 'tech-center', 'search-index.json'), '[]');
    writeFile(path.join(variantRoot, 'sitemap.xml'), '<urlset></urlset>');
    return;
  }

  const search = searchProjection(source.normalized.projection);
  writeFile(path.join(variantRoot, 'entries.json'), JSON.stringify([source.normalized.projection]));
  writeFile(
    path.join(variantRoot, 'tech-center', 'search-index.en.json'),
    JSON.stringify(search)
  );
  writeFile(
    path.join(variantRoot, '_next', 'static', 'chunks', 'technical-center.js'),
    'window.__TECHNICAL_CENTER__ = "bounded-initial-listing";'
  );
  const hubRoute = variant === 'preview' ? '/en/tech-center' : '/tech-center';
  writeFile(
    path.join(variantRoot, hubRoute.replace(/^\//, '') + '.html'),
    renderHub(contract, variant, source.normalized.projection)
  );
  if (variant === 'io') {
    writeFile(
      path.join(variantRoot, 'sitemap.xml'),
      `<urlset><url><loc>${contract.expected.io.canonical}</loc></url></urlset>`
    );
  }
}

function writeTracerExportFixture({ rootDir = ROOT, fixtureRoot } = {}) {
  assert(fixtureRoot, 'fixtureRoot is required');
  const contract = loadTracerContract(rootDir);
  const source = loadFixtureSource(rootDir, contract);
  writeVariantFixture(fixtureRoot, 'io', contract, source);
  writeVariantFixture(fixtureRoot, 'cn', contract, source);
  writeVariantFixture(fixtureRoot, 'preview', contract, source);
  return fixtureRoot;
}

function staticRouteCandidates(outDir, route) {
  const relativeRoute = route.replace(/^\/+|\/+$/g, '');
  return relativeRoute
    ? [path.join(outDir, `${relativeRoute}.html`), path.join(outDir, relativeRoute, 'index.html')]
    : [path.join(outDir, 'index.html')];
}

function readHtml(outDir, route, label) {
  const htmlPath = staticRouteCandidates(outDir, route).find((candidate) => fs.existsSync(candidate));
  assert(htmlPath, `${label} is missing HTTP-equivalent 200 route ${route}`);
  return { htmlPath, html: fs.readFileSync(htmlPath, 'utf8') };
}

function getMeta(html, selector, label) {
  const match = html.match(selector);
  assert(match, `${label} metadata is missing`);
  return match[1];
}

function verifyArticle(outDir, variant, contract) {
  const expected = contract.expected[variant];
  const { htmlPath, html } = readHtml(outDir, expected.route, `${variant} tracer`);
  assert.equal(
    getMeta(html, /<link\b[^>]*rel="canonical"[^>]*href="([^"]+)"/i, `${variant} canonical`),
    expected.canonical,
    `${variant} canonical drift`
  );
  assert.equal(
    getMeta(html, /<meta\b[^>]*name="robots"[^>]*content="([^"]+)"/i, `${variant} robots`),
    expected.robots,
    `${variant} robots drift`
  );
  assert.match(html, /<html\s+lang="en"/i, `${variant} route must render English HTML`);
  assert.match(html, /Set up and use FastGPT Chat API/);
  assert.match(html, /FastGPT Chat API documentation/);
  assert(html.includes(`"url":"${expected.canonical}"`), `${variant} JSON-LD canonical drift`);
  assert(html.includes('"inLanguage":"en-US"'), `${variant} JSON-LD locale drift`);
  return htmlPath;
}

function verifyPreviewIsolation(fixtureRoot, contract) {
  const previewRoot = path.join(fixtureRoot, 'preview');
  assert(
    !staticRouteCandidates(previewRoot, contract.identity.canonicalPath).some((candidate) =>
      fs.existsSync(candidate)
    ),
    'Preview contains an owner-relative tracer route'
  );
}

function scanFiles(rootDir, matcher) {
  if (!fs.existsSync(rootDir)) return [];
  return fs.readdirSync(rootDir, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(rootDir, entry.name);
    return entry.isDirectory() ? scanFiles(filePath, matcher) : matcher(filePath) ? [filePath] : [];
  });
}

function verifyCnIsolation(fixtureRoot, contract) {
  const cnRoot = path.join(fixtureRoot, 'cn');
  for (const route of [contract.identity.canonicalPath, contract.identity.sourcePath]) {
    assert(
      !staticRouteCandidates(cnRoot, route).some((candidate) => fs.existsSync(candidate)),
      `CN tracer copy exists at ${route}`
    );
  }
  const tracerToken = [
    contract.identity.canonicalPath,
    contract.identity.sourcePath,
    contract.expected.io.canonical,
    contract.content.title
  ];
  const leaked = scanFiles(cnRoot, (filePath) => /\.(?:html|json|js|xml)$/.test(filePath)).find(
    (filePath) => tracerToken.some((token) => fs.readFileSync(filePath, 'utf8').includes(token))
  );
  assert(!leaked, `CN fixture contains an indexable tracer copy: ${leaked}`);
  const sitemap = fs.readFileSync(path.join(cnRoot, 'sitemap.xml'), 'utf8');
  assert(!sitemap.includes(contract.expected.io.canonical), 'CN sitemap contains the IO tracer');
}

function verifySitemaps(fixtureRoot, contract) {
  const ioSitemap = fs.readFileSync(path.join(fixtureRoot, 'io', 'sitemap.xml'), 'utf8');
  assert(ioSitemap.includes(`<loc>${contract.expected.io.canonical}</loc>`), 'IO sitemap omits the tracer');
  const cnSitemap = fs.readFileSync(path.join(fixtureRoot, 'cn', 'sitemap.xml'), 'utf8');
  assert(!cnSitemap.includes(contract.expected.io.canonical), 'CN sitemap contains the tracer');
  assert(!fs.existsSync(path.join(fixtureRoot, 'preview', 'sitemap.xml')), 'Preview has a sitemap');
}

function verifyIdentityProjection(contract) {
  const identity = {
    locale: contract.identity.locale,
    canonicalPath: contract.identity.canonicalPath
  };
  const identityEntry = { identity };
  verifyProjectionConsistency({
    consistency: 'identity-set-verified',
    identities: [identityEntry],
    registry: [identityEntry],
    search: [identityEntry],
    sitemap: [identityEntry],
    staticExport: [identityEntry],
    releaseRecord: [identityEntry],
    rollback: [identityEntry]
  });
}

function verifyEnglishHub(fixtureRoot, contract) {
  const ioRoot = path.join(fixtureRoot, 'io');
  const hub = readHtml(ioRoot, '/tech-center', 'IO Technical Center').html;
  assert.equal(getMeta(hub, /data-locale="([^"]+)"/, 'hub locale'), 'en');
  assert.equal(getMeta(hub, /data-total-entries="([^"]+)"/, 'hub total count'), '1');
  assert.equal(getMeta(hub, /data-category-api-count="([^"]+)"/, 'hub API count'), '1');
  assert.equal(
    getMeta(hub, /data-featured-identity="([^"]+)"/, 'hub featured identity'),
    contract.expected.hub.featuredIdentity
  );
  assert.equal((hub.match(/<article(?:\s|>)/g) || []).length, contract.expected.hub.initialEntries);
  assert.match(hub, /<h2>API<\/h2>/);
  assert.match(hub, new RegExp(`href="${contract.identity.canonicalPath}"`));

  const registry = readJson(path.join(ioRoot, 'entries.json'));
  assert.equal(registry.length, contract.expected.hub.totalEntries);
  assert(registry.every((entry) => entry.slug.startsWith('/en/')));
  assert.equal(registry[0].slug, contract.identity.sourcePath);
  const search = readJson(path.join(ioRoot, 'tech-center/search-index.en.json'));
  assert.equal(search.length, contract.expected.hub.totalEntries);
  assert(search.every((entry) => entry.locale === 'en' && entry.identity.startsWith('en|')));
  assert.equal(search[0].identity, contract.expected.hub.searchIdentity);
  assert.equal(search[0].publicPath, contract.identity.canonicalPath);
  const initialJavaScript = fs.readFileSync(
    path.join(ioRoot, '_next/static/chunks/technical-center.js'),
    'utf8'
  );
  assert(
    ![
      contract.identity.canonicalPath,
      contract.identity.sourcePath,
      contract.content.title
    ].some((token) => initialJavaScript.includes(token)),
    'English Technical registry identity is embedded in initial JavaScript'
  );

  const centerResult = verifyTechnicalCenter({
    outDir: ioRoot,
    route: '/tech-center',
    maxInitialEntries: contract.expected.hub.maxInitialEntries,
    registryPath: path.join(ioRoot, 'entries.json'),
    searchIndexPath: path.join(ioRoot, 'tech-center/search-index.en.json')
  });
  assert.equal(centerResult.initialEntries, contract.expected.hub.initialEntries);
  return centerResult;
}

function verifyProjectionFallbackContract() {
  const routeSource = fs.readFileSync(TECH_CENTER_ROUTE_SOURCE, 'utf8');
  const clientSource = fs.readFileSync(TECH_CENTER_CLIENT_SOURCE, 'utf8');
  const detailSource = fs.readFileSync(TECHNICAL_ROUTE_SOURCE, 'utf8');
  const routingSource = fs.readFileSync(TECHNICAL_ROUTING_SOURCE, 'utf8');
  assert.match(routeSource, /localeEntries\.slice\(0, PAGE_SIZE\)\.map\(toTechSearchEntry\)/);
  assert.match(routeSource, /search-index\.\$\{locale\}\.json/);
  assert.match(clientSource, /useState<TechSearchEntry\[\]>\(initialEntries\)/);
  assert.match(clientSource, /fetch\(searchIndexPath\)/);
  assert.match(clientSource, /\.catch\(\(\) =>/);
  assert.match(clientSource, /server-rendered entries remain the accessible fallback/);
  assert.match(detailSource, /export const dynamicParams = false/);
  assert.match(detailSource, /getTechnicalCanonicalUrl/);
  assert.match(routingSource, /getOwnedLocaleUrl/);
  return { initialJavaScriptProjection: 'deferred', searchFallback: 'bounded-initial-listing' };
}

function runHygiene(mode, rootDir, variant) {
  const args = [CONTENT_HYGIENE_SCRIPT, '--mode', mode, '--root', rootDir];
  if (variant) args.push('--variant', variant);
  const result = spawnSync(process.execPath, args, { encoding: 'utf8' });
  assert.equal(
    result.status,
    0,
    `${mode} content hygiene failed${variant ? ` for ${variant}` : ''}: ${result.stderr || result.stdout}`
  );
}

function verifyContentHygiene(rootDir, fixtureRoot, contract) {
  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'week06-tracer-source-'));
  try {
    const source = fs.readFileSync(resolveRelative(rootDir, contract.source.fixturePath));
    writeFile(
      path.join(sourceRoot, 'src/content/tech-center/en/api/fastgpt-chat-api-reference.md'),
      source
    );
    runHygiene('source', sourceRoot);
  } finally {
    fs.rmSync(sourceRoot, { recursive: true, force: true });
  }
  for (const variant of ['io', 'cn', 'preview']) runHygiene('html', path.join(fixtureRoot, variant), variant);
}

function verifyWeek06EnglishTracer({
  rootDir = ROOT,
  fixtureRoot,
  outDir,
  registryPath
} = {}) {
  const contract = loadTracerContract(rootDir);
  verifyWeek06TechnicalAuthority(rootDir);
  const candidate = loadAuthorityCandidate(rootDir, contract);
  loadFixtureSource(rootDir, contract);
  verifyWave0(rootDir, contract);
  verifyProductionRegistry(rootDir, contract, registryPath);
  const requestedFixtureRoot = fixtureRoot || outDir;
  const temporaryFixtureRoot = requestedFixtureRoot
    ? undefined
    : fs.mkdtempSync(path.join(os.tmpdir(), 'week06-english-tracer-export-'));
  const outputRoot = requestedFixtureRoot || temporaryFixtureRoot;
  try {
    if (!requestedFixtureRoot) writeTracerExportFixture({ rootDir, fixtureRoot: outputRoot });
    verifyArticle(path.join(outputRoot, 'io'), 'io', contract);
    verifyArticle(path.join(outputRoot, 'preview'), 'preview', contract);
    verifyCnIsolation(outputRoot, contract);
    verifyPreviewIsolation(outputRoot, contract);
    verifySitemaps(outputRoot, contract);
    verifyIdentityProjection(contract);
    const hubResult = verifyEnglishHub(outputRoot, contract);
    const codeResult = verifyProjectionFallbackContract();
    verifyContentHygiene(rootDir, outputRoot, contract);
    return {
      candidate: candidate.id,
      identity: `${contract.identity.locale}|${contract.identity.canonicalPath}`,
      variants: { io: 'indexable', cn: 'excluded', preview: 'review' },
      hub: {
        locale: contract.expected.hub.locale,
        totalEntries: contract.expected.hub.totalEntries,
        initialEntries: hubResult.initialEntries,
        categoryCount: contract.expected.hub.categoryCount,
        featuredIdentity: contract.expected.hub.featuredIdentity,
        searchIdentity: contract.expected.hub.searchIdentity
      },
      initialJavaScriptProjection: codeResult.initialJavaScriptProjection,
      searchFallback: codeResult.searchFallback,
      registryDelta: contract.expected.productionRegistry.delta
    };
  } finally {
    if (temporaryFixtureRoot) fs.rmSync(temporaryFixtureRoot, { recursive: true, force: true });
  }
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--fixture-root' || token === '--out-dir') {
      const value = argv[++index];
      if (!value || value.startsWith('--')) throw new Error(`${token} requires a directory`);
      options.fixtureRoot = path.resolve(value);
    } else if (token === '--registry') {
      const value = argv[++index];
      if (!value || value.startsWith('--')) throw new Error('--registry requires a file');
      options.registryPath = path.resolve(value);
    } else {
      throw new Error(`Unknown option: ${token}`);
    }
  }
  return options;
}

function main(argv = process.argv.slice(2)) {
  const result = verifyWeek06EnglishTracer(parseArgs(argv));
  console.log(
    `[verify-week06-english-tracer] passed: ${result.identity} io=${result.variants.io} cn=${result.variants.cn} preview=${result.variants.preview} registryDelta=${result.registryDelta}`
  );
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[verify-week06-english-tracer] ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  loadTracerContract,
  main,
  parseArgs,
  verifyWeek06EnglishTracer,
  writeTracerExportFixture
};
