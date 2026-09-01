const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { locales: siteLocales } = require('../../src/config/site-routing.json');
const { resolveStaticHtml } = require('./technical-export');

const OWNER_ORIGINS = { zh: 'https://fastgpt.cn', en: 'https://fastgpt.io' };
const PROJECTION_RELATIVE_PATH = 'src/content/tech-center/authority/week06-wave1-projection.json';
const ZH_SEARCH_RELATIVE_PATH = 'public/tech-center/search-index.json';
const EN_SEARCH_RELATIVE_PATH = 'public/tech-center/search-index.en.json';

function readJson(repoRoot, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

function getHtmlAttribute(tag, name) {
  return tag.match(new RegExp(`\\s${name}=["']([^"']+)["']`, 'i'))?.[1];
}

function verifyArticleHtml(html, identity, variant, expectedTitle) {
  const expectedLanguage = siteLocales[identity.locale];
  const sourceLabel = identity.locale === 'zh' ? 'FastGPT 官方来源' : 'FastGPT official source';
  const htmlTag = html.match(/<html\b[^>]*>/i)?.[0] || '';
  if (getHtmlAttribute(htmlTag, 'lang') !== expectedLanguage.htmlLang) {
    throw new Error(`Week06 Wave 1 ${variant} locale drift: ${identity.key}`);
  }
  const canonicalTag = html.match(/<link\b[^>]*rel=["']canonical["'][^>]*>/i)?.[0] || '';
  if (getHtmlAttribute(canonicalTag, 'href') !== identity.canonical) {
    throw new Error(`Week06 Wave 1 ${variant} canonical drift: ${identity.key}`);
  }
  const hreflangTag = html.match(/<link\b[^>]*hreflang=["'][^"']+["'][^>]*>/i)?.[0] || '';
  if (
    getHtmlAttribute(hreflangTag, 'hreflang') !== expectedLanguage.hreflang ||
    getHtmlAttribute(hreflangTag, 'href') !== identity.canonical
  ) {
    throw new Error(`Week06 Wave 1 ${variant} hreflang drift: ${identity.key}`);
  }
  const robotsTag = html.match(/<meta\b[^>]*name=["']robots["'][^>]*>/i)?.[0] || '';
  const robots = getHtmlAttribute(robotsTag, 'content');
  const expectedRobots = variant === 'preview' ? 'noindex, nofollow' : 'index, follow';
  if (robots !== expectedRobots) {
    throw new Error(`Week06 Wave 1 ${variant} robots drift: ${identity.key}`);
  }
  const title = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '';
  if (
    title !== escapeHtml(expectedTitle) ||
    (identity.locale === 'en' && /[\u3400-\u9fff]/.test(title))
  ) {
    throw new Error(`Week06 Wave 1 ${variant} title drift: ${identity.key}`);
  }
  if (
    !html.includes(`"url":"${identity.canonical}"`) ||
    !html.includes(`"inLanguage":"${expectedLanguage.hreflang}"`) ||
    !html.includes(sourceLabel)
  ) {
    throw new Error(`Week06 Wave 1 ${variant} structured content drift: ${identity.key}`);
  }
}

function getExpectedArticleTitle(repoRoot, identity, entry) {
  const [, section, slug] = identity.canonicalPath.split('/');
  const source = fs.readFileSync(
    path.join(repoRoot, 'src/content/tech-center', identity.locale, section, `${slug}.md`),
    'utf8'
  );
  const explicit = source.match(/^meta_title:\s*(.+)$/m)?.[1]?.trim();
  return (
    explicit ||
    `${entry.title}${
      identity.locale === 'en' ? ' | FastGPT Technical Center' : '｜FastGPT 技术中心'
    }`
  );
}

function verifyHub(outDir, locale, variant, searchPath) {
  const route = variant === 'preview' ? `/${locale}/tech-center` : '/tech-center';
  const htmlPath = resolveStaticHtml(outDir, route);
  if (!htmlPath) throw new Error(`Week06 Wave 1 ${variant} hub missing: ${locale}`);
  const html = fs.readFileSync(htmlPath, 'utf8');
  const expectedLanguage = siteLocales[locale];
  const canonical = `${OWNER_ORIGINS[locale]}/tech-center`;
  const htmlTag = html.match(/<html\b[^>]*>/i)?.[0] || '';
  if (
    getHtmlAttribute(htmlTag, 'lang') !== expectedLanguage.htmlLang ||
    !html.includes(searchPath)
  ) {
    throw new Error(`Week06 Wave 1 ${variant} hub locale or search drift: ${locale}`);
  }
  const canonicalTag = html.match(/<link\b[^>]*rel=["']canonical["'][^>]*>/i)?.[0] || '';
  const robotsTag = html.match(/<meta\b[^>]*name=["']robots["'][^>]*>/i)?.[0] || '';
  const expectedRobots = variant === 'preview' ? 'noindex, nofollow' : 'index, follow';
  if (
    getHtmlAttribute(canonicalTag, 'href') !== canonical ||
    getHtmlAttribute(robotsTag, 'content') !== expectedRobots ||
    !html.includes(`"url":"${canonical}"`) ||
    !html.includes(`"inLanguage":"${expectedLanguage.hreflang}"`)
  ) {
    throw new Error(`Week06 Wave 1 ${variant} hub metadata drift: ${locale}`);
  }
  const alternates = new Map(
    [...html.matchAll(/<link\b[^>]*rel=["']alternate["'][^>]*>/gi)].map((match) => [
      getHtmlAttribute(match[0], 'hreflang'),
      getHtmlAttribute(match[0], 'href')
    ])
  );
  if (
    alternates.get('zh-CN') !== `${OWNER_ORIGINS.zh}/tech-center` ||
    alternates.get('en') !== `${OWNER_ORIGINS.en}/tech-center`
  ) {
    throw new Error(`Week06 Wave 1 ${variant} hub hreflang drift: ${locale}`);
  }
  const links = [...html.matchAll(/<article\b[^>]*>[\s\S]*?<\/article>/gi)]
    .map((article) => article[0].match(/<a\b[^>]*href=["'](\/[^"'#?]+)["']/i)?.[1])
    .filter(Boolean);
  if (!links.length || links.length > 12) {
    throw new Error(`Week06 Wave 1 ${variant} fallback listing drift: ${locale}`);
  }
  for (const link of links) {
    if (!resolveStaticHtml(outDir, link)) {
      throw new Error(`Week06 Wave 1 broken internal link: ${link}`);
    }
  }
  return links.length;
}

function verifyWeek06Wave1Export(
  repoRoot = path.resolve(__dirname, '../..'),
  { outDir, variant, fixture = false } = {},
  verifySource
) {
  if (!outDir) throw new Error('Week06 Wave 1 export verification requires --out-dir');
  if (!['cn', 'io', 'preview'].includes(variant)) {
    throw new Error('Week06 Wave 1 export variant must be cn, io, or preview');
  }
  const source = verifySource(repoRoot, { verifyExportFixtures: false });
  const projection = readJson(repoRoot, PROJECTION_RELATIVE_PATH);
  const registryByIdentity = new Map(
    projection.registry.map((entry) => [entry.identity, entry])
  );
  const sitemapPath = path.join(outDir, 'sitemap.xml');
  const sitemapUrls = fs.existsSync(sitemapPath)
    ? [...fs.readFileSync(sitemapPath, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map(
        (match) => match[1]
      )
    : [];
  if (variant === 'preview' && sitemapUrls.length) {
    throw new Error('Week06 Wave 1 Preview export contains sitemap entries');
  }
  let ownerPages = 0;
  for (const identity of projection.identities) {
    const owned = variant === 'preview' || identity.owner === variant;
    const route = variant === 'preview' ? identity.reviewPath : identity.canonicalPath;
    const htmlPath = resolveStaticHtml(outDir, route);
    if (owned) {
      if (!htmlPath) throw new Error(`Week06 Wave 1 ${variant} owner route missing: ${route}`);
      verifyArticleHtml(
        fs.readFileSync(htmlPath, 'utf8'),
        identity,
        variant,
        getExpectedArticleTitle(repoRoot, identity, registryByIdentity.get(identity.key))
      );
      ownerPages += 1;
    } else if (htmlPath || resolveStaticHtml(outDir, identity.reviewPath)) {
      throw new Error(`Week06 Wave 1 ${variant} owner leak: ${identity.key}`);
    }
    const membership = sitemapUrls.filter((url) => url === identity.canonical).length;
    if (membership !== (variant !== 'preview' && identity.owner === variant ? 1 : 0)) {
      throw new Error(`Week06 Wave 1 ${variant} sitemap drift: ${identity.key}`);
    }
  }
  const expectedLocales = variant === 'preview' ? ['zh', 'en'] : [variant === 'cn' ? 'zh' : 'en'];
  for (const locale of expectedLocales) {
    verifyHub(
      outDir,
      locale,
      variant,
      locale === 'zh' ? '/tech-center/search-index.json' : '/tech-center/search-index.en.json'
    );
  }
  for (const [locale, relativePath] of [
    ['zh', ZH_SEARCH_RELATIVE_PATH],
    ['en', EN_SEARCH_RELATIVE_PATH]
  ]) {
    const exportedPath = path.join(outDir, 'tech-center', path.basename(relativePath));
    if (!fs.existsSync(exportedPath)) {
      throw new Error(`Week06 Wave 1 ${variant} ${locale} search projection missing`);
    }
    if (
      fs.readFileSync(exportedPath, 'utf8') !==
      fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')
    ) {
      throw new Error(`Week06 Wave 1 ${variant} ${locale} search projection drift`);
    }
  }
  return {
    ...source,
    fixtureVerified: fixture,
    exportVerified: !fixture,
    releaseEligible: !fixture,
    variant,
    ownerPages,
    hubs: expectedLocales,
    productionObserved: 0,
    stagedPagesVerified: ownerPages,
    ownerLeaks: 0,
    localeDrift: 0,
    sitemapDrift: 0,
    searchDrift: 0,
    brokenInternalLinks: 0
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function writeStaticHtml(outDir, route, html) {
  const relative = route.replace(/^\/+|\/+$/g, '');
  const filePath = path.join(outDir, `${relative}.html`);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, html);
}

function writeWeek06Wave1ExportFixture(repoRoot, outDir, variant) {
  const projection = readJson(repoRoot, PROJECTION_RELATIVE_PATH);
  const registryByIdentity = new Map(
    projection.registry.map((entry) => [entry.identity, entry])
  );
  for (const identity of projection.identities) {
    if (variant !== 'preview' && identity.owner !== variant) continue;
    const route = variant === 'preview' ? identity.reviewPath : identity.canonicalPath;
    const language = siteLocales[identity.locale];
    const robots = variant === 'preview' ? 'noindex, nofollow' : 'index, follow';
    const source = projection.registry.find((entry) => entry.identity === identity.key)?.source;
    const sourceLabel = identity.locale === 'zh' ? 'FastGPT 官方来源' : 'FastGPT official source';
    writeStaticHtml(
      outDir,
      route,
      `<!doctype html><html lang="${language.htmlLang}"><head><title>${escapeHtml(
        getExpectedArticleTitle(repoRoot, identity, registryByIdentity.get(identity.key))
      )}</title><link rel="canonical" href="${identity.canonical}"><link rel="alternate" hreflang="${language.hreflang}" href="${
        identity.canonical
      }"><meta name="robots" content="${robots}"></head><body><main><a href="${
        variant === 'preview' ? `/${identity.locale}/tech-center` : '/tech-center'
      }">Technical Center</a><a href="${escapeHtml(
        source
      )}">${sourceLabel}</a></main><script type="application/ld+json">{"url":"${
        identity.canonical
      }","inLanguage":"${language.hreflang}"}</script></body></html>`
    );
  }
  const locales = variant === 'preview' ? ['zh', 'en'] : [variant === 'cn' ? 'zh' : 'en'];
  for (const locale of locales) {
    const identities = projection.identities.filter((identity) => identity.locale === locale);
    const searchPath =
      locale === 'zh' ? '/tech-center/search-index.json' : '/tech-center/search-index.en.json';
    const links = identities
      .slice(0, 12)
      .map((identity) => {
        const route = variant === 'preview' ? identity.reviewPath : identity.canonicalPath;
        return `<article class="technical-card"><a class="technical-card-link" href="${route}"><span>${identity.key}</span></a></article>`;
      })
      .join('');
    const language = siteLocales[locale];
    const canonical = `${OWNER_ORIGINS[locale]}/tech-center`;
    const robots = variant === 'preview' ? 'noindex, nofollow' : 'index, follow';
    writeStaticHtml(
      outDir,
      variant === 'preview' ? `/${locale}/tech-center` : '/tech-center',
      `<!doctype html><html lang="${language.htmlLang}" dir="${language.dir}"><head><link rel="canonical" href="${canonical}"><link rel="alternate" hreflang="zh-CN" href="${OWNER_ORIGINS.zh}/tech-center"><link rel="alternate" hreflang="en" href="${OWNER_ORIGINS.en}/tech-center"><meta name="robots" content="${robots}"></head><body data-search-index="${searchPath}">${links}<script type="application/ld+json">{"url":"${canonical}","inLanguage":"${language.hreflang}"}</script></body></html>`
    );
  }
  fs.mkdirSync(path.join(outDir, 'tech-center'), { recursive: true });
  fs.copyFileSync(
    path.join(repoRoot, ZH_SEARCH_RELATIVE_PATH),
    path.join(outDir, 'tech-center/search-index.json')
  );
  fs.copyFileSync(
    path.join(repoRoot, EN_SEARCH_RELATIVE_PATH),
    path.join(outDir, 'tech-center/search-index.en.json')
  );
  if (variant !== 'preview') {
    const urls = projection.identities
      .filter((identity) => identity.owner === variant)
      .map((identity) => `<url><loc>${identity.canonical}</loc></url>`)
      .join('');
    fs.writeFileSync(path.join(outDir, 'sitemap.xml'), `<urlset>${urls}</urlset>`);
  }
}

function verifyWeek06Wave1ExportFixtures(
  repoRoot = path.resolve(__dirname, '../..'),
  verifySource
) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'week06-wave1-export-'));
  try {
    const results = {};
    for (const variant of ['cn', 'io', 'preview']) {
      const outDir = path.join(temporaryRoot, variant);
      writeWeek06Wave1ExportFixture(repoRoot, outDir, variant);
      results[variant] = verifyWeek06Wave1Export(
        repoRoot,
        { outDir, variant, fixture: true },
        verifySource
      );
    }
    return {
      ownerPages: Object.fromEntries(
        Object.entries(results).map(([variant, result]) => [variant, result.ownerPages])
      ),
      hubs: Object.fromEntries(
        Object.entries(results).map(([variant, result]) => [variant, result.hubs])
      ),
      productionObserved: 0,
      fixtureVerified: true,
      exportVerified: false,
      stagedPagesVerified:
        results.cn.stagedPagesVerified +
        results.io.stagedPagesVerified +
        results.preview.stagedPagesVerified,
      ownerLeaks: 0,
      localeDrift: 0,
      sitemapDrift: 0,
      searchDrift: 0,
      brokenInternalLinks: 0
    };
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

async function readLiveResponse(fetchImpl, url, expectedContentType) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  timeout.unref?.();
  try {
    const response = await fetchImpl(url, { redirect: 'manual', signal: controller.signal });
    if (!response || response.status !== 200) {
      throw new Error(`Week06 Wave 1 live HTTP status drift: ${url}`);
    }
    const contentType = response.headers?.get?.('content-type') || '';
    if (!contentType.toLowerCase().includes(expectedContentType)) {
      throw new Error(`Week06 Wave 1 live content type drift: ${url}`);
    }
    return response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function verifyNonOwnerResponse(fetchImpl, url, identity) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  timeout.unref?.();
  try {
    const response = await fetchImpl(url, { redirect: 'manual', signal: controller.signal });
    if (!response) throw new Error(`Week06 Wave 1 non-owner response missing: ${url}`);
    if ([404, 410].includes(response.status)) return;
    if ([301, 302, 307, 308].includes(response.status)) {
      const location = response.headers?.get?.('location');
      if (location && new URL(location, url).href === identity.canonical) return;
      throw new Error(`Week06 Wave 1 non-owner redirect drift: ${identity.key}`);
    }
    if (response.status === 200) {
      const html = await response.text();
      const canonicalTag = html.match(/<link\b[^>]*rel=["']canonical["'][^>]*>/i)?.[0] || '';
      const robotsTag = html.match(/<meta\b[^>]*name=["']robots["'][^>]*>/i)?.[0] || '';
      const robots = getHtmlAttribute(robotsTag, 'content') || '';
      if (
        getHtmlAttribute(canonicalTag, 'href') === identity.canonical &&
        /(?:^|[,\s])noindex(?:$|[,\s])/i.test(robots)
      ) {
        return;
      }
    }
    throw new Error(`Week06 Wave 1 non-owner indexable copy: ${identity.key}`);
  } finally {
    clearTimeout(timeout);
  }
}

async function mapWithConcurrency(values, concurrency, operation) {
  let nextIndex = 0;
  const results = new Array(values.length);
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (nextIndex < values.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await operation(values[index], index);
      }
    })
  );
  return results;
}

async function verifyWeek06Wave1Live(
  repoRoot = path.resolve(__dirname, '../..'),
  { fetchImpl = globalThis.fetch } = {},
  verifySource
) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('Week06 Wave 1 live verification requires fetch');
  }
  const source = verifySource(repoRoot, { verifyExportFixtures: false });
  const projection = readJson(repoRoot, PROJECTION_RELATIVE_PATH);
  const registryByIdentity = new Map(
    projection.registry.map((entry) => [entry.identity, entry])
  );
  await mapWithConcurrency(projection.identities, 5, async (identity) => {
    const html = await readLiveResponse(fetchImpl, identity.canonical, 'text/html');
    verifyArticleHtml(
      html,
      identity,
      identity.owner,
      getExpectedArticleTitle(repoRoot, identity, registryByIdentity.get(identity.key))
    );
  });
  await mapWithConcurrency(projection.identities, 5, async (identity) => {
    const oppositeLocale = identity.owner === 'cn' ? 'en' : 'zh';
    const nonOwnerUrl = `${OWNER_ORIGINS[oppositeLocale]}${identity.canonicalPath}`;
    await verifyNonOwnerResponse(fetchImpl, nonOwnerUrl, identity);
  });
  const sitemapByOwner = new Map();
  for (const [owner, locale] of [
    ['cn', 'zh'],
    ['io', 'en']
  ]) {
    const sitemapUrl = `${OWNER_ORIGINS[locale]}/sitemap.xml`;
    const xml = await readLiveResponse(fetchImpl, sitemapUrl, 'xml');
    sitemapByOwner.set(
      owner,
      [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1])
    );
  }
  let sitemapVerified = 0;
  for (const identity of projection.identities) {
    for (const owner of ['cn', 'io']) {
      const membership = sitemapByOwner
        .get(owner)
        .filter((url) => url === identity.canonical).length;
      const expectedMembership = identity.owner === owner ? 1 : 0;
      if (membership !== expectedMembership) {
        throw new Error(`Week06 Wave 1 live sitemap drift: ${identity.key}`);
      }
    }
    sitemapVerified += 1;
  }
  return {
    ...source,
    liveHttpVerified: true,
    productionObserved: projection.identities.length,
    http200: projection.identities.length,
    canonicalVerified: projection.identities.length,
    languageVerified: projection.identities.length,
    sitemapVerified,
    nonOwnerChecked: projection.identities.length,
    nonOwnerIndexable: 0,
    ownerLeaks: 0
  };
}

module.exports = {
  verifyWeek06Wave1Export,
  verifyWeek06Wave1ExportFixtures,
  verifyWeek06Wave1Live,
  writeWeek06Wave1ExportFixture
};
