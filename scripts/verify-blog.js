#!/usr/bin/env node

/** Verify Blog registry sources or one finalized static export. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { resolveSiteVariant } = require('./lib/site-variant');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'out');
const registryPath = path.join(root, 'src/content/blog/registry.json');
const contentDir = path.join(root, 'src/content/blog/zh');
const categories = ['product-updates', 'technical-insights'];
const categoryLabels = ['产品上新', '技术干货'];
const entryKeys = [
  'category',
  'dateModified',
  'datePublished',
  'metaDescription',
  'metaTitle',
  'minutes',
  'slug',
  'sourceName',
  'status',
  'summary',
  'title'
];

function resolveHtml(route) {
  const relative = route.replace(/^\/+|\/+$/g, '');
  return [
    path.join(outDir, `${relative}.html`),
    path.join(outDir, relative, 'index.html')
  ].find((candidate) => fs.existsSync(candidate));
}

function readHtml(route) {
  const filePath = resolveHtml(route);
  assert(filePath, `Missing Blog HTML for ${route}`);
  return fs.readFileSync(filePath, 'utf8');
}

function getAttribute(tag, name) {
  return tag.match(new RegExp(`\\s${name}=["']([^"']*)["']`, 'i'))?.[1] || '';
}

function getCanonical(html, route) {
  const tag = (html.match(/<link\b[^>]*rel=["']canonical["'][^>]*>/i) || [])[0];
  assert(tag, `Missing canonical for ${route}`);
  return getAttribute(tag, 'href');
}

function getRobots(html, route) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  const tag = tags.find((candidate) => getAttribute(candidate, 'name') === 'robots');
  assert(tag, `Missing robots metadata for ${route}`);
  return getAttribute(tag, 'content');
}

function getSitemapUrls() {
  const filePath = path.join(outDir, 'sitemap.xml');
  if (!fs.existsSync(filePath)) return null;
  return [...fs.readFileSync(filePath, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map(
    (match) => match[1]
  );
}

function readRegistry() {
  return JSON.parse(fs.readFileSync(registryPath, 'utf8')).entries;
}

function productionReady(entries) {
  const published = entries.filter((entry) => entry.status === 'published');
  return categories.every((category) => published.some((entry) => entry.category === category));
}

function verifySource() {
  const entries = readRegistry();
  assert(Array.isArray(entries) && entries.length >= categories.length, 'Blog registry is empty');
  const slugs = new Set();
  const categoryCoverage = new Set();

  for (const entry of entries) {
    assert.deepEqual(Object.keys(entry).sort(), entryKeys, `${entry.slug}: unexpected registry shape`);
    assert.match(entry.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `${entry.slug}: invalid slug`);
    assert(!slugs.has(entry.slug), `${entry.slug}: duplicate slug`);
    slugs.add(entry.slug);
    assert(categories.includes(entry.category), `${entry.slug}: invalid category`);
    categoryCoverage.add(entry.category);
    assert(['draft', 'published'].includes(entry.status), `${entry.slug}: invalid status`);
    assert.equal(entry.sourceName, `${entry.slug}.md`, `${entry.slug}: invalid source name`);
    assert.match(entry.datePublished, /^\d{4}-\d{2}-\d{2}$/, `${entry.slug}: invalid date`);
    assert.match(entry.dateModified, /^\d{4}-\d{2}-\d{2}$/, `${entry.slug}: invalid date`);
    assert(entry.dateModified >= entry.datePublished, `${entry.slug}: invalid date order`);
    assert(Number.isInteger(entry.minutes) && entry.minutes > 0, `${entry.slug}: invalid minutes`);

    const source = fs.readFileSync(path.join(contentDir, entry.sourceName), 'utf8');
    assert.equal(source.match(/^# (.+)$/m)?.[1], entry.title, `${entry.slug}: H1 drift`);
    assert.match(source, /https:\/\//, `${entry.slug}: public source link required`);
  }

  assert.deepEqual([...categoryCoverage].sort(), [...categories].sort(), 'Blog category coverage drift');
  assert(
    fs.readFileSync(path.join(root, 'src/app/blog/[slug]/page.tsx'), 'utf8').includes(
      'export const dynamicParams = false'
    ),
    'Blog detail route must reject unknown slugs'
  );
  const layoutSwitcher = fs.readFileSync(
    path.join(root, 'src/components/home/HomeLayoutSwitcher.tsx'),
    'utf8'
  );
  const selfContainedRule = layoutSwitcher.match(/const isSelfContained =([\s\S]*?);/)?.[1] || '';
  assert(selfContainedRule.includes('blog'), 'Blog must bypass the legacy constrained layout');
  console.log(
    `Blog source verification passed: ${entries.length} entries; productionReady=${productionReady(
      entries
    )}`
  );
}

function verifyPage(route, canonical, labels) {
  const html = readHtml(route);
  assert.equal(getCanonical(html, route), canonical, `${route}: canonical drift`);
  for (const label of labels) assert(html.includes(label), `${route}: missing ${label}`);
  return html;
}

function verifyExport() {
  const entries = readRegistry();
  const variant = resolveSiteVariant();
  const ready = productionReady(entries);
  const sitemapUrls = getSitemapUrls();

  if (variant === 'preview') {
    const hub = verifyPage('/zh/blog', 'https://fastgpt.cn/blog', categoryLabels);
    assert(readHtml('/zh').includes('href="/zh/blog"'), 'Preview navigation is missing Blog');
    assert.match(getRobots(hub, '/zh/blog'), /noindex/i, 'Preview Blog must be noindex');
    assert.equal(sitemapUrls, null, 'Preview Blog export contains a sitemap');
    assert.equal(resolveHtml('/blog'), undefined, 'Preview export contains the owner route');

    for (const entry of entries) {
      const route = `/zh/blog/${entry.slug}`;
      const html = verifyPage(route, `https://fastgpt.cn/blog/${entry.slug}`, [entry.title]);
      assert.match(getRobots(html, route), /noindex/i, `${route}: preview robots drift`);
      assert(html.includes('提交商务咨询'), `${route}: missing consultation CTA`);
      assert(
        html.includes('data-rybbit-prop-source="blog_article_sidebar_consult"'),
        `${route}: missing consultation attribution`
      );
    }
  } else if (variant === 'cn' && ready) {
    verifyPage('/blog', 'https://fastgpt.cn/blog', categoryLabels);
    const urls = new Set(sitemapUrls || []);
    assert(urls.has('https://fastgpt.cn/blog'), 'CN sitemap is missing the Blog hub');
    for (const entry of entries.filter((candidate) => candidate.status === 'published')) {
      const canonical = `https://fastgpt.cn/blog/${entry.slug}`;
      verifyPage(`/blog/${entry.slug}`, canonical, [entry.title, '提交商务咨询']);
      assert(urls.has(canonical), `CN sitemap is missing ${canonical}`);
    }
  } else {
    assert.equal(resolveHtml('/blog'), undefined, `${variant} export contains the Blog hub`);
    assert(!readHtml('/').includes('href="/blog"'), `${variant} navigation exposes Blog`);
    assert(
      !(sitemapUrls || []).some((url) => url.startsWith('https://fastgpt.cn/blog')),
      `${variant} sitemap contains Blog URLs`
    );
  }

  console.log(`Blog export verification passed: variant=${variant}; productionReady=${ready}`);
}

const mode = process.argv[2] || '--source';
if (mode === '--source') verifySource();
else if (mode === '--export') verifyExport();
else throw new Error('Usage: node scripts/verify-blog.js [--source|--export]');
