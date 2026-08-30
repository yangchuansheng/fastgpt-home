#!/usr/bin/env node

/** Verify Week06 model and glossary tracers without changing the production registry. */

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { buildNormalizedTechnicalPage } = require('./import-technical-content');
const { stableJson } = require('./lib/technical-authority');
const { readWeek06Wave1IdentityKeys } = require('./lib/technical-wave-baseline');
const { verifyProjectionConsistency } = require('./lib/technical-projection');
const { verifyTechnicalCenter } = require('./verify-technical-center');
const { verifyWeek06EnglishTracer } = require('./verify-week06-english-tracer');

const ROOT = path.resolve(__dirname, '..');
const CONTRACT_PATH = path.join(
  ROOT,
  'scripts/fixtures/technical-authority/week06-model-glossary-tracers.json'
);
const CONTENT_HYGIENE_SCRIPT = path.join(__dirname, 'verify-content-hygiene.js');
const TECH_CENTER_ROUTE_SOURCE = path.join(ROOT, 'src/app/[lang]/tech-center/page.tsx');
const TECH_CENTER_CLIENT_SOURCE = path.join(ROOT, 'src/components/tech-center/TechCenterPage.tsx');
const TECHNICAL_ROUTE_SOURCE = path.join(ROOT, 'src/app/[lang]/[section]/[slug]/page.tsx');
const TECHNICAL_JSON_LD_SOURCE = path.join(ROOT, 'src/components/tech-center/TechCenterJsonLd.tsx');
const TECHNICAL_CONTENT_SOURCE = path.join(ROOT, 'src/lib/tech-center-content.ts');
const TECHNICAL_ROUTING_SOURCE = path.join(ROOT, 'src/lib/technicalRouting.ts');
const OWNER_ORIGINS = { cn: 'https://fastgpt.cn', io: 'https://fastgpt.io' };

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function resolveRelative(rootDir, relativePath) {
  const root = path.resolve(rootDir);
  const resolved = path.resolve(root, relativePath);
  assert(
    resolved === root || resolved.startsWith(`${root}${path.sep}`),
    `Path escapes repository root: ${relativePath}`
  );
  return resolved;
}

function writeFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value);
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function identityKey(tracer) {
  return `${tracer.identity.locale}|${tracer.identity.canonicalPath}`;
}

function canonicalUrl(tracer) {
  return `${OWNER_ORIGINS[tracer.identity.owner]}${tracer.identity.canonicalPath}`;
}

function loadTracerContract(rootDir = ROOT, contractPath = CONTRACT_PATH) {
  const contract = readJson(contractPath);
  assert.equal(contract.schemaVersion, 1, 'model/glossary tracer schema drift');
  assert.equal(contract.batch, 'week06', 'model/glossary tracer batch drift');
  assert.equal(contract.issue, 264, 'model/glossary tracer issue drift');
  assert.deepEqual(contract.candidateCounts, {
    'zh|glossary': 280,
    'zh|model': 14,
    'en|model': 47
  });
  assert.deepEqual(contract.categoryContract, {
    model: '模型指南',
    glossary: '术语表',
    localizedLabels: {
      zh: { model: '模型指南', glossary: '术语表' },
      en: { model: 'Model guides', glossary: 'Glossary' }
    }
  });
  assert.equal(contract.tracers.length, 3, 'missing model/glossary tracer');
  assert.deepEqual(
    contract.tracers.map((tracer) => `${tracer.identity.locale}|${tracer.category}`).sort(),
    ['en|model', 'zh|glossary', 'zh|model']
  );
  for (const tracer of contract.tracers) {
    assert.equal(
      tracer.identity.sourcePath,
      `/${tracer.identity.locale}${tracer.identity.canonicalPath}`,
      `${tracer.candidateId} source path drift`
    );
    assert.equal(
      tracer.identity.owner,
      tracer.identity.locale === 'zh' ? 'cn' : 'io',
      `${tracer.candidateId} owner drift`
    );
    assert.equal(
      tracer.identity.canonicalPath.split('/')[1],
      tracer.category,
      `${tracer.candidateId} category identity drift`
    );
    assert.equal(
      contract.categoryContract[tracer.category],
      tracer.categoryLabel,
      `${tracer.candidateId} category label drift`
    );
    assert.match(tracer.sourceUrl, /^https:\/\/[^\s/]+(?:\/|$)/);
    assert(tracer.body.includes(tracer.sourceUrl), `${tracer.candidateId} body citation drift`);
    assert.match(
      tracer.relatedIdentity,
      new RegExp(`^${tracer.identity.locale}\\|/${tracer.category}/`),
      `${tracer.candidateId} related identity crosses locale or category`
    );
  }
  assert.equal(contract.productionRegistry.delta, 0);
  assert.equal(contract.wave0.mode, 'dry-run');
  assert.equal(contract.wave0.publicationCount, 0);
  assert.equal(contract.wave0.publicPageDelta, 0);
  return contract;
}

function normalizeTracer(tracer) {
  const normalized = buildNormalizedTechnicalPage({
    metadata: {
      title: tracer.title,
      slug: tracer.identity.sourcePath,
      page_type: tracer.categoryLabel,
      source: tracer.sourceUrl,
      source_type: tracer.sourceType
    },
    identity: {
      locale: tracer.identity.locale,
      canonicalPath: tracer.identity.canonicalPath
    },
    body: tracer.body,
    wordCount: 1,
    sourceCount: 1,
    label: tracer.candidateId
  });
  assert.equal(normalized.projection.category, tracer.category);
  assert.equal(normalized.projection.categoryLabel, tracer.categoryLabel);
  return normalized;
}

function verifyCategoryContract(contract) {
  const projections = contract.tracers.map((tracer) => normalizeTracer(tracer).projection);
  assert(projections.some((entry) => entry.category === 'model'));
  assert(projections.some((entry) => entry.category === 'glossary'));
  const source = contract.tracers[0];
  assert.throws(
    () =>
      buildNormalizedTechnicalPage({
        metadata: {
          title: source.title,
          slug: '/zh/unsupported/category-contract',
          page_type: 'Unsupported',
          source: source.sourceUrl,
          source_type: source.sourceType
        },
        identity: { locale: 'zh', canonicalPath: '/unsupported/category-contract' },
        body: source.body,
        wordCount: 1,
        sourceCount: 1,
        label: 'unsupported-category-contract'
      }),
    /unsupported category unsupported/
  );
  return projections;
}

function loadAuthorityCandidates(rootDir, contract) {
  const manifest = readJson(resolveRelative(rootDir, contract.authorityPath));
  assert.equal(manifest.status, 'closed', 'Week06 authority is open');
  const counts = {};
  for (const candidate of manifest.candidates) {
    const key = `${candidate.identity.locale}|${candidate.category}`;
    if (Object.prototype.hasOwnProperty.call(contract.candidateCounts, key)) {
      counts[key] = (counts[key] || 0) + 1;
    }
  }
  assert.deepEqual(counts, contract.candidateCounts, 'model/glossary authority counts drift');
  const candidateById = new Map(manifest.candidates.map((candidate) => [candidate.id, candidate]));
  for (const tracer of contract.tracers) {
    const candidate = candidateById.get(tracer.candidateId);
    assert(candidate, `Week06 authority is missing ${tracer.candidateId}`);
    assert.deepEqual(candidate.identity, tracer.identity);
    assert.equal(candidate.title, tracer.title);
    assert.equal(candidate.category, tracer.category);
    assert.equal(candidate.categoryLabel, tracer.categoryLabel);
    assert.equal(candidate.sourceType, tracer.sourceType);
    assert.equal(candidate.sourceClassification.sourceUrl, tracer.sourceUrl);
    assert.equal(candidate.sourceClassification.sourceReference, tracer.sourceUrl);
    assert.equal(candidate.provenance.sourceUrl, tracer.sourceUrl);
    assert.equal(candidate.provenance.sourceReference, tracer.sourceUrl);
    for (const digest of [
      candidate.provenance.sourceSha256,
      candidate.provenance.sourceBodySha256,
      candidate.provenance.bodySha256,
      candidate.provenance.workbookSha256
    ]) {
      assert.match(digest, /^[a-f0-9]{64}$/);
    }
    assert.equal(candidate.evidence.status, 'verified');
    assert.deepEqual(candidate.evidence.sources, [tracer.sourceUrl]);
    assert.equal(candidate.security.status, 'clear');
    assert.deepEqual(candidate.security.findings, []);
    assert.equal(candidate.operationRisk.level, 'none');
    assert.equal(candidate.operationRisk.decision, 'cleared');
    assert.deepEqual(candidate.operationRisk.findings, []);
    assert.deepEqual(candidate.gates, {
      identity: 'passed',
      source: 'passed',
      security: 'passed',
      operationRisk: 'passed',
      duplicateRetrieval: 'passed',
      readerBodyHygiene: 'passed'
    });
    assert.equal(candidate.state, 'accepted');
    assert.equal(candidate.finalDisposition, 'accepted');
    assert.equal(candidate.action, 'add');
    assert.equal(candidate.decision.disposition, 'accepted');
    assert.equal(candidate.decision.operation, 'add');
    assert.deepEqual(candidate.decision.evidence, [tracer.sourceUrl]);
    const related = candidateById.get(tracer.relatedCandidateId);
    assert(related, `Week06 authority is missing related candidate ${tracer.relatedCandidateId}`);
    assert.equal(
      `${related.identity.locale}|${related.identity.canonicalPath}`,
      tracer.relatedIdentity
    );
    assert.equal(related.identity.locale, tracer.identity.locale);
    assert.equal(related.category, tracer.category);
    assert.equal(related.finalDisposition, 'accepted');
  }
  return contract.tracers.map((tracer) => candidateById.get(tracer.candidateId));
}

function verifyWave0(rootDir, contract) {
  const projection = readJson(resolveRelative(rootDir, contract.wave0.projectionPath));
  assert.equal(projection.mode, contract.wave0.mode);
  assert.equal(projection.status, 'empty');
  assert.equal(projection.governanceStatus, 'governance-complete');
  assert.equal(projection.publicationCount, contract.wave0.publicationCount);
  assert.equal(projection.publicPageDelta, contract.wave0.publicPageDelta);
  assert.deepEqual(projection.identities, []);
  assert.equal(projection.registry.delta, contract.wave0.registryDelta);
  assert.equal(projection.search.delta, contract.wave0.searchDelta);
  assert.equal(projection.sitemap.delta, contract.wave0.sitemapDelta);
}

function verifyProductionRegistry(rootDir, contract, registryPath) {
  const filePath = registryPath || resolveRelative(rootDir, contract.productionRegistry.path);
  const deployedRegistry = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const week06Wave1IdentityKeys = registryPath ? new Set() : readWeek06Wave1IdentityKeys(rootDir);
  const registry = registryPath
    ? deployedRegistry
    : deployedRegistry.filter((entry) => {
        const match = entry.slug?.match(/^\/([^/]+)(\/.*)$/);
        assert(match, `Invalid Technical Page slug: ${entry.slug}`);
        return !week06Wave1IdentityKeys.has(`${match[1]}|${match[2]}`);
      });
  const raw = Buffer.from(registryPath ? fs.readFileSync(filePath) : stableJson(registry));
  assert.equal(
    registry.length,
    contract.productionRegistry.count,
    'production registry delta changed the Technical Page count'
  );
  assert.equal(
    sha256(raw),
    contract.productionRegistry.sha256,
    'production registry digest drift; expected Wave0 delta=0'
  );
  for (const tracer of contract.tracers) {
    assert(
      !registry.some((entry) => entry.slug === tracer.identity.sourcePath),
      `production registry contains tracer ${tracer.candidateId}`
    );
  }
  return registry.length;
}

function searchProjection(tracer, projection) {
  return {
    identity: identityKey(tracer),
    title: projection.title,
    description: projection.summary,
    category: projection.category,
    locale: tracer.identity.locale,
    publicPath: tracer.identity.canonicalPath,
    sourceType: projection.sourceType,
    minutes: projection.minutes
  };
}

function htmlDocument({ locale, title, canonical, robots, body, structuredData, script = false }) {
  return `<!doctype html><html lang="${locale}"><head><title>${escapeHtml(
    title
  )}</title><link rel="canonical" href="${canonical}"><meta name="robots" content="${robots}"></head><body>${body}${
    structuredData
      ? `<script type="application/ld+json">${JSON.stringify(structuredData)}</script>`
      : ''
  }${
    script ? '<script src="/_next/static/chunks/technical-center.js"></script>' : ''
  }</body></html>`;
}

function renderArticle(tracer, variant, projection) {
  const review = variant === 'preview';
  const canonical = canonicalUrl(tracer);
  const citationLabel =
    tracer.identity.locale === 'zh' ? 'FastGPT 官方文档' : 'FastGPT documentation';
  const readerSummary = tracer.body
    .split(/\n>\s*(?:来源|Source)\s*[:：]/i)[0]
    .replace(/^#{1,6}\s+.*$/m, '')
    .replace(/\s+/g, ' ')
    .trim();
  return htmlDocument({
    locale: tracer.identity.locale,
    title: tracer.title,
    canonical,
    robots: review ? 'noindex, nofollow' : 'index, follow',
    body: `<main><article data-identity="${identityKey(tracer)}" data-category="${
      tracer.category
    }"><h1>${escapeHtml(tracer.title)}</h1><p>${escapeHtml(
      readerSummary || projection.summary
    )}</p><p>${tracer.identity.locale === 'zh' ? '来源' : 'Source'}: <a href="${
      tracer.sourceUrl
    }">${citationLabel}</a></p><aside data-related-identities="${
      tracer.relatedIdentity
    }"></aside></article></main>`,
    structuredData: {
      '@context': 'https://schema.org',
      '@type': 'TechArticle',
      url: canonical,
      headline: tracer.title,
      inLanguage: tracer.structuredLanguage,
      articleSection: tracer.localizedCategoryLabel,
      citation: tracer.sourceUrl
    }
  });
}

function renderHub(locale, variant, tracers, categoryLabels) {
  const owner = locale === 'zh' ? 'cn' : 'io';
  const categoryCounts = Object.fromEntries(
    ['model', 'glossary'].map((category) => [
      category,
      tracers.filter((tracer) => tracer.category === category).length
    ])
  );
  const localePrefix = variant === 'preview' ? `/${locale}` : '';
  const articles = tracers
    .map(
      (tracer) =>
        `<article><a href="${localePrefix}${tracer.identity.canonicalPath}">${escapeHtml(
          tracer.title
        )}</a></article>`
    )
    .join('');
  const categories = ['model', 'glossary']
    .map((category) => {
      return `<button type="button" data-category-key="${category}" data-count="${
        categoryCounts[category]
      }">${escapeHtml(categoryLabels[locale][category])}</button>`;
    })
    .join('');
  return htmlDocument({
    locale,
    title: locale === 'zh' ? 'FastGPT 技术中心' : 'FastGPT Technical Center',
    canonical: `${OWNER_ORIGINS[owner]}/tech-center`,
    robots: variant === 'preview' ? 'noindex, nofollow' : 'index, follow',
    body: `<main data-locale="${locale}" data-total-entries="${
      tracers.length
    }" data-category-model-count="${categoryCounts.model}" data-category-glossary-count="${
      categoryCounts.glossary
    }" data-featured-identity="${identityKey(tracers[0])}"><h1>${
      locale === 'zh' ? '技术中心' : 'Technical Center'
    }</h1>${categories}${articles}</main>`,
    structuredData: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      url: `${OWNER_ORIGINS[owner]}/tech-center`,
      inLanguage: locale === 'zh' ? 'zh-CN' : 'en'
    },
    script: true
  });
}

function routeFile(root, route) {
  return path.join(root, route.replace(/^\//, ''), 'index.html');
}

function writeVariantFixture(fixtureRoot, variant, contract, normalizedById) {
  const variantRoot = path.join(fixtureRoot, variant);
  const locales = variant === 'preview' ? ['zh', 'en'] : [variant === 'cn' ? 'zh' : 'en'];
  writeFile(
    path.join(variantRoot, '_next/static/chunks/technical-center.js'),
    'window.__TECHNICAL_CENTER__ = { projection: "deferred", fallback: "bounded-initial-listing" };'
  );
  for (const locale of locales) {
    const tracers = contract.tracers.filter((tracer) => tracer.identity.locale === locale);
    const projections = tracers.map((tracer) => normalizedById.get(tracer.candidateId).projection);
    const search = tracers.map((tracer, index) => searchProjection(tracer, projections[index]));
    const registryName = variant === 'preview' ? `entries.${locale}.json` : 'entries.json';
    writeFile(path.join(variantRoot, registryName), JSON.stringify(projections));
    writeFile(
      path.join(
        variantRoot,
        'tech-center',
        locale === 'zh' ? 'search-index.json' : 'search-index.en.json'
      ),
      JSON.stringify(search)
    );
    const hubRoute = variant === 'preview' ? `/${locale}/tech-center` : '/tech-center';
    writeFile(
      `${path.join(variantRoot, hubRoute.replace(/^\//, ''))}.html`,
      renderHub(locale, variant, tracers, contract.categoryContract.localizedLabels)
    );
    for (const tracer of tracers) {
      const route =
        variant === 'preview' ? tracer.identity.sourcePath : tracer.identity.canonicalPath;
      writeFile(
        routeFile(variantRoot, route),
        renderArticle(tracer, variant, normalizedById.get(tracer.candidateId).projection)
      );
    }
  }
  if (variant !== 'preview') {
    const ownedTracers = contract.tracers.filter((tracer) => tracer.identity.owner === variant);
    writeFile(
      path.join(variantRoot, 'sitemap.xml'),
      `<urlset>${ownedTracers
        .map((tracer) => `<url><loc>${canonicalUrl(tracer)}</loc></url>`)
        .join('')}</urlset>`
    );
  }
}

function writeTracerExportFixture({
  rootDir = ROOT,
  fixtureRoot,
  contractPath = CONTRACT_PATH
} = {}) {
  assert(fixtureRoot, 'fixtureRoot is required');
  const contract = loadTracerContract(rootDir, contractPath);
  const normalizedById = new Map(
    contract.tracers.map((tracer) => [tracer.candidateId, normalizeTracer(tracer)])
  );
  for (const variant of ['cn', 'io', 'preview']) {
    writeVariantFixture(fixtureRoot, variant, contract, normalizedById);
  }
  return fixtureRoot;
}

function staticRouteCandidates(root, route) {
  const relative = route.replace(/^\/+|\/+$/g, '');
  return [path.join(root, `${relative}.html`), path.join(root, relative, 'index.html')];
}

function readHtml(root, route, label) {
  const filePath = staticRouteCandidates(root, route).find((candidate) => fs.existsSync(candidate));
  assert(filePath, `${label} is missing HTTP-equivalent 200 route ${route}`);
  return fs.readFileSync(filePath, 'utf8');
}

function metadataValue(html, pattern, label) {
  const match = html.match(pattern);
  assert(match, `${label} metadata is missing`);
  return match[1];
}

function verifyArticle(variantRoot, variant, tracer) {
  const route = variant === 'preview' ? tracer.identity.sourcePath : tracer.identity.canonicalPath;
  const html = readHtml(variantRoot, route, `${variant} ${tracer.candidateId}`);
  const canonical = canonicalUrl(tracer);
  assert.equal(
    metadataValue(html, /<link\b[^>]*rel="canonical"[^>]*href="([^"]+)"/i, 'canonical'),
    canonical,
    `${tracer.candidateId} canonical drift`
  );
  assert.equal(
    metadataValue(html, /<meta\b[^>]*name="robots"[^>]*content="([^"]+)"/i, 'robots'),
    variant === 'preview' ? 'noindex, nofollow' : 'index, follow',
    `${tracer.candidateId} robots drift`
  );
  assert.match(html, new RegExp(`<html lang="${tracer.identity.locale}"`));
  assert(html.includes(`data-category="${tracer.category}"`));
  assert(html.includes(tracer.sourceUrl));
  assert(html.includes(`"url":"${canonical}"`), `${tracer.candidateId} JSON-LD URL drift`);
  assert(
    html.includes(`"inLanguage":"${tracer.structuredLanguage}"`),
    `${tracer.candidateId} JSON-LD locale drift`
  );
  assert(
    html.includes(`"articleSection":"${tracer.localizedCategoryLabel}"`),
    `${tracer.candidateId} JSON-LD category drift`
  );
  const related = metadataValue(html, /data-related-identities="([^"]*)"/, 'related identities');
  assert.equal(related, tracer.relatedIdentity, `${tracer.candidateId} related identity drift`);
  for (const relatedIdentity of related.split(',').filter(Boolean)) {
    assert(
      relatedIdentity.startsWith(`${tracer.identity.locale}|/${tracer.category}/`),
      `${tracer.candidateId} related content crosses locale or category`
    );
  }
}

function verifyHub(variantRoot, variant, locale, tracers, categoryLabels) {
  const route = variant === 'preview' ? `/${locale}/tech-center` : '/tech-center';
  const html = readHtml(variantRoot, route, `${variant} ${locale} hub`);
  const owner = locale === 'zh' ? 'cn' : 'io';
  assert.equal(
    metadataValue(html, /<link\b[^>]*rel="canonical"[^>]*href="([^"]+)"/i, 'hub canonical'),
    `${OWNER_ORIGINS[owner]}/tech-center`
  );
  assert.equal(
    metadataValue(html, /<meta\b[^>]*name="robots"[^>]*content="([^"]+)"/i, 'hub robots'),
    variant === 'preview' ? 'noindex, nofollow' : 'index, follow'
  );
  assert(html.includes(`"inLanguage":"${locale === 'zh' ? 'zh-CN' : 'en'}"`));
  const categoryCounts = {
    model: tracers.filter((tracer) => tracer.category === 'model').length,
    glossary: tracers.filter((tracer) => tracer.category === 'glossary').length
  };
  assert.equal(metadataValue(html, /data-locale="([^"]+)"/, 'hub locale'), locale);
  assert.equal(
    Number(metadataValue(html, /data-total-entries="([^"]+)"/, 'hub count')),
    tracers.length
  );
  for (const [category, count] of Object.entries(categoryCounts)) {
    assert.equal(
      Number(
        metadataValue(
          html,
          new RegExp(`data-category-${category}-count="([^"]+)"`),
          `${category} count`
        )
      ),
      count
    );
    assert.match(
      html,
      new RegExp(
        `<button[^>]*data-category-key="${category}"[^>]*data-count="${count}"[^>]*>${categoryLabels[locale][category]}</button>`
      )
    );
  }
  assert.equal(
    metadataValue(html, /data-featured-identity="([^"]+)"/, 'featured identity'),
    identityKey(tracers[0])
  );
  for (const tracer of tracers) {
    const href = `${variant === 'preview' ? `/${locale}` : ''}${tracer.identity.canonicalPath}`;
    assert(html.includes(`href="${href}"`), `${tracer.candidateId} hub link drift`);
    assert(html.includes(tracer.localizedCategoryLabel));
  }
  const registryPath = path.join(
    variantRoot,
    variant === 'preview' ? `entries.${locale}.json` : 'entries.json'
  );
  const searchIndexPath = path.join(
    variantRoot,
    'tech-center',
    locale === 'zh' ? 'search-index.json' : 'search-index.en.json'
  );
  const registry = readJson(registryPath);
  const search = readJson(searchIndexPath);
  assert.equal(registry.length, tracers.length);
  assert.equal(search.length, tracers.length);
  assert(registry.every((entry) => entry.slug.startsWith(`/${locale}/`)));
  assert(
    search.every((entry) => entry.locale === locale && entry.identity.startsWith(`${locale}|`)),
    `${locale} search projection crosses locale`
  );
  assert.deepEqual(search.map((entry) => entry.identity).sort(), tracers.map(identityKey).sort());
  const initialJavaScript = fs.readFileSync(
    path.join(variantRoot, '_next/static/chunks/technical-center.js'),
    'utf8'
  );
  assert(initialJavaScript.includes('projection: "deferred"'));
  assert(initialJavaScript.includes('fallback: "bounded-initial-listing"'));
  assert(
    !tracers.some((tracer) =>
      [
        identityKey(tracer),
        tracer.identity.sourcePath,
        tracer.identity.canonicalPath,
        tracer.title
      ].some((token) => initialJavaScript.includes(token))
    ),
    `${locale} search projection is embedded in initial JavaScript`
  );
  const result = verifyTechnicalCenter({
    outDir: variantRoot,
    route,
    maxInitialEntries: 12,
    registryPath,
    searchIndexPath
  });
  assert(
    result.initialEntries > 0 && result.initialEntries <= 12,
    'bounded fallback listing drift'
  );
  return result;
}

function scanFiles(rootDir) {
  if (!fs.existsSync(rootDir)) return [];
  return fs.readdirSync(rootDir, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(rootDir, entry.name);
    return entry.isDirectory()
      ? scanFiles(filePath)
      : /\.(?:html|json|js|xml)$/.test(entry.name)
      ? [filePath]
      : [];
  });
}

function verifyOwnerIsolation(fixtureRoot, contract) {
  for (const variant of ['cn', 'io']) {
    const root = path.join(fixtureRoot, variant);
    const foreign = contract.tracers.filter((tracer) => tracer.identity.owner !== variant);
    for (const tracer of foreign) {
      for (const route of [tracer.identity.canonicalPath, tracer.identity.sourcePath]) {
        assert(
          !staticRouteCandidates(root, route).some((candidate) => fs.existsSync(candidate)),
          `${variant.toUpperCase()} owner leak at ${route}`
        );
      }
      const tokens = [
        identityKey(tracer),
        tracer.identity.sourcePath,
        canonicalUrl(tracer),
        tracer.title
      ];
      const leaked = scanFiles(root).find((filePath) => {
        const source = fs.readFileSync(filePath, 'utf8');
        return tokens.some((token) => source.includes(token));
      });
      assert(!leaked, `${variant.toUpperCase()} owner leak in ${leaked}`);
    }
  }
  const previewRoot = path.join(fixtureRoot, 'preview');
  for (const tracer of contract.tracers) {
    assert(
      !staticRouteCandidates(previewRoot, tracer.identity.canonicalPath).some((candidate) =>
        fs.existsSync(candidate)
      ),
      `Preview owner-relative leak at ${tracer.identity.canonicalPath}`
    );
  }
}

function verifySitemaps(fixtureRoot, contract) {
  for (const variant of ['cn', 'io']) {
    const sitemap = fs.readFileSync(path.join(fixtureRoot, variant, 'sitemap.xml'), 'utf8');
    for (const tracer of contract.tracers) {
      assert.equal(
        sitemap.includes(`<loc>${canonicalUrl(tracer)}</loc>`),
        tracer.identity.owner === variant,
        `${variant} sitemap owner contract drift for ${tracer.candidateId}`
      );
    }
  }
  assert(!fs.existsSync(path.join(fixtureRoot, 'preview', 'sitemap.xml')), 'Preview has a sitemap');
}

function verifyIdentityProjection(contract) {
  const identities = contract.tracers.map((tracer) => ({
    identity: {
      locale: tracer.identity.locale,
      canonicalPath: tracer.identity.canonicalPath
    }
  }));
  verifyProjectionConsistency({
    consistency: 'identity-set-verified',
    identities,
    registry: identities,
    search: identities,
    sitemap: identities,
    staticExport: identities,
    releaseRecord: identities,
    rollback: identities
  });
}

function verifyModelGlossaryExportFixture({ fixtureRoot, contract }) {
  assert(fixtureRoot, 'fixtureRoot is required');
  for (const variant of ['cn', 'io', 'preview']) {
    const variantRoot = path.join(fixtureRoot, variant);
    for (const tracer of contract.tracers.filter(
      (entry) => variant === 'preview' || entry.identity.owner === variant
    )) {
      verifyArticle(variantRoot, variant, tracer);
    }
  }
  verifyHub(
    path.join(fixtureRoot, 'cn'),
    'cn',
    'zh',
    contract.tracers.filter((tracer) => tracer.identity.locale === 'zh'),
    contract.categoryContract.localizedLabels
  );
  verifyHub(
    path.join(fixtureRoot, 'io'),
    'io',
    'en',
    contract.tracers.filter((tracer) => tracer.identity.locale === 'en'),
    contract.categoryContract.localizedLabels
  );
  for (const locale of ['zh', 'en']) {
    verifyHub(
      path.join(fixtureRoot, 'preview'),
      'preview',
      locale,
      contract.tracers.filter((tracer) => tracer.identity.locale === locale),
      contract.categoryContract.localizedLabels
    );
  }
  verifyOwnerIsolation(fixtureRoot, contract);
  verifySitemaps(fixtureRoot, contract);
  verifyIdentityProjection(contract);
  return { ownerLeaks: 0, fallback: 'bounded-initial-listing' };
}

function verifySourceContracts() {
  const route = fs.readFileSync(TECH_CENTER_ROUTE_SOURCE, 'utf8');
  const client = fs.readFileSync(TECH_CENTER_CLIENT_SOURCE, 'utf8');
  const detail = fs.readFileSync(TECHNICAL_ROUTE_SOURCE, 'utf8');
  const jsonLd = fs.readFileSync(TECHNICAL_JSON_LD_SOURCE, 'utf8');
  const content = fs.readFileSync(TECHNICAL_CONTENT_SOURCE, 'utf8');
  const routing = fs.readFileSync(TECHNICAL_ROUTING_SOURCE, 'utf8');
  assert.match(route, /localeEntries\.slice\(0, PAGE_SIZE\)\.map\(toTechSearchEntry\)/);
  assert.match(route, /search-index\.\$\{locale\}\.json/);
  assert.match(client, /useState<TechSearchEntry\[\]>\(initialEntries\)/);
  assert.match(client, /server-rendered entries remain the accessible fallback/);
  assert.match(client, /fetch\(searchIndexPath\)/);
  assert.doesNotMatch(client, /entries\.json|TECH_ENTRIES/);
  assert.match(detail, /export const dynamicParams = false/);
  assert.match(detail, /getRelatedTechArticles\(article\)/);
  assert.match(jsonLd, /getTechCategoryLabelForLocale\(article\.category, locale\)/);
  assert.match(content, /getTechEntriesForLocale\(article\.slug\.split\('\/'\)\[1\]\)\.filter/);
  assert.match(content, /entry\.category === article\.category/);
  assert.match(routing, /getOwnedLocaleUrl/);
  assert.match(routing, /variant !== 'preview' && getLocaleOwner\(identity\.locale\) === variant/);
}

function runHygiene(mode, rootDir, variant) {
  const args = [CONTENT_HYGIENE_SCRIPT, '--mode', mode, '--root', rootDir];
  if (variant) args.push('--variant', variant);
  const result = spawnSync(process.execPath, args, { encoding: 'utf8' });
  assert.equal(
    result.status,
    0,
    `${mode} content hygiene failed${variant ? ` for ${variant}` : ''}: ${
      result.stderr || result.stdout
    }`
  );
}

function verifyContentHygiene(fixtureRoot, contract) {
  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'week06-model-glossary-source-'));
  try {
    for (const tracer of contract.tracers) {
      const normalized = normalizeTracer(tracer);
      const [, category, slug] = tracer.identity.canonicalPath.split('/');
      writeFile(
        path.join(
          sourceRoot,
          'src/content/tech-center',
          tracer.identity.locale,
          category,
          `${slug}.md`
        ),
        normalized.document
      );
    }
    runHygiene('source', sourceRoot);
  } finally {
    fs.rmSync(sourceRoot, { recursive: true, force: true });
  }
  for (const variant of ['cn', 'io', 'preview']) {
    runHygiene('html', path.join(fixtureRoot, variant), variant);
  }
}

function verifyWeek06ModelGlossaryTracers({
  rootDir = ROOT,
  fixtureRoot,
  registryPath,
  contractPath = CONTRACT_PATH
} = {}) {
  const contract = loadTracerContract(rootDir, contractPath);
  verifyWeek06EnglishTracer({ rootDir });
  loadAuthorityCandidates(rootDir, contract);
  verifyCategoryContract(contract);
  verifyWave0(rootDir, contract);
  verifyProductionRegistry(rootDir, contract, registryPath);
  verifySourceContracts();
  const temporaryRoot = fixtureRoot
    ? undefined
    : fs.mkdtempSync(path.join(os.tmpdir(), 'week06-model-glossary-export-'));
  const outputRoot = fixtureRoot || temporaryRoot;
  try {
    if (!fixtureRoot) writeTracerExportFixture({ rootDir, fixtureRoot: outputRoot, contractPath });
    const exportResult = verifyModelGlossaryExportFixture({ fixtureRoot: outputRoot, contract });
    verifyContentHygiene(outputRoot, contract);
    return {
      tracers: contract.tracers.map((tracer) => identityKey(tracer)),
      candidateCounts: contract.candidateCounts,
      variants: { cn: 2, io: 1, preview: 3 },
      ownerLeaks: exportResult.ownerLeaks,
      searchFallback: exportResult.fallback,
      registryDelta: contract.productionRegistry.delta
    };
  } finally {
    if (temporaryRoot) fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--fixture-root') {
      const value = argv[++index];
      if (!value || value.startsWith('--')) throw new Error('--fixture-root requires a directory');
      options.fixtureRoot = path.resolve(value);
    } else if (token === '--registry') {
      const value = argv[++index];
      if (!value || value.startsWith('--')) throw new Error('--registry requires a file');
      options.registryPath = path.resolve(value);
    } else if (token === '--contract') {
      const value = argv[++index];
      if (!value || value.startsWith('--')) throw new Error('--contract requires a file');
      options.contractPath = path.resolve(value);
    } else {
      throw new Error(`Unknown option: ${token}`);
    }
  }
  return options;
}

function main(argv = process.argv.slice(2)) {
  const result = verifyWeek06ModelGlossaryTracers(parseArgs(argv));
  console.log(
    `[verify-week06-model-glossary-tracers] passed: tracers=${result.tracers.length} cn=${result.variants.cn} io=${result.variants.io} preview=${result.variants.preview} ownerLeaks=${result.ownerLeaks} registryDelta=${result.registryDelta}`
  );
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[verify-week06-model-glossary-tracers] ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  CONTRACT_PATH,
  loadAuthorityCandidates,
  loadTracerContract,
  parseArgs,
  verifyCategoryContract,
  verifyModelGlossaryExportFixture,
  verifyProductionRegistry,
  verifyWeek06ModelGlossaryTracers,
  writeTracerExportFixture
};
