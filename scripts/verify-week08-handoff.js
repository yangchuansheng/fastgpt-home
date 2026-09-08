#!/usr/bin/env node

// Verify the pre-import handoff boundary without changing published content.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const key = (locale, canonicalPath) => `${locale}|${canonicalPath}`;
const owner = (locale) => `https://fastgpt.${locale === 'zh' ? 'cn' : 'io'}`;
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

function readContained(base, file) {
  assert.equal(typeof file, 'string', 'Missing source file');
  assert(!path.isAbsolute(file) && !file.split(/[\\/]/).includes('..'), `Unsafe path: ${file}`);
  const resolved = fs.realpathSync(path.resolve(base, file));
  assert(resolved.startsWith(`${fs.realpathSync(base)}${path.sep}`), `Escaping path: ${file}`);
  return fs.readFileSync(resolved);
}

function verifyInventory(inventory, { deliveryRoot } = {}) {
  assert.equal(inventory.schemaVersion, 1);
  assert.equal(inventory.scope, 'implementation-handoff');
  assert.equal(inventory.baseline, '66be9bbabf1cae1c3b8bc08ad75a3030e9738bbb');
  assert.equal(inventory.pages.length, 38, 'Expected 38 new pages');
  assert.equal(inventory.backlinks.length, 797, 'Expected 797 backlinks');
  const entries = JSON.parse(fs.readFileSync(path.join(root, 'src/components/tech-center/entries.json')));
  const guides = JSON.parse(fs.readFileSync(path.join(root, 'src/content/guides/registry.json'))).entries;
  assert.equal(entries.length, 4995, 'Technical baseline changed');
  assert.equal(guides.length, 23, 'Guide baseline changed');
  const existing = new Set(entries.map((entry) => entry.slug));
  const pages = new Map();
  const deliveryLinks = new Map();
  for (const page of inventory.pages) {
    assert(['zh', 'en'].includes(page.locale), `Invalid locale: ${page.locale}`);
    assert(/^\/(guide|reference)\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(page.canonicalPath));
    const identity = key(page.locale, page.canonicalPath);
    assert(!pages.has(identity), `Duplicate page: ${identity}`);
    assert.equal(page.url, owner(page.locale) + page.canonicalPath, `Wrong owner: ${identity}`);
    assert(!existing.has(`/${page.locale}${page.canonicalPath}`), `Already imported: ${identity}`);
    const slug = page.canonicalPath.split('/').pop();
    assert(!guides.some((entry) => entry.slug === slug && entry[page.locale]), `Existing Guide: ${identity}`);
    const reference = page.kind === 'reference';
    assert.equal(page.canonicalPath.split('/')[1], reference ? 'reference' : 'guide',
      `Wrong namespace: ${identity}`);
    assert.equal(page.contentOwner, reference ? 'technical-center' : 'guide');
    assert.equal(page.destination, reference
      ? `src/content/tech-center/${page.locale}${page.canonicalPath}.md`
      : `src/content/guides/${page.locale}/${slug}.${page.locale}.md`);
    assert.equal(page.group, reference ? 'reference'
      : page.kind === 'decision-matrix' || slug === 'version-upgrade-decision'
        ? 'decision' : 'implementation');
    assert.equal(page.releaseUnit, ['landscape', 'issue-list'].includes(page.kind) ? 'U1' : 'U2');
    assert.match(page.sourceSha256, /^[a-f0-9]{64}$/);
    assert(page.sourceFile.startsWith('Week08/') && !page.sourceFile.includes('..'));
    pages.set(identity, page);
    if (deliveryRoot) {
      const source = readContained(deliveryRoot, page.sourceFile);
      assert.equal(sha256(source), page.sourceSha256, `Delivery changed: ${page.sourceFile}`);
      const links = [...source.toString('utf8').matchAll(/\]\(([^\s)]+)\)/g)]
        .map((match) => new URL(match[1], owner(page.locale)))
        .filter((url) => url.origin === owner(page.locale))
        .map((url) => decodeURI(url.pathname).replace(/^\/(zh|en)(?=\/)/, ''));
      deliveryLinks.set(identity, new Set(links));
    }
  }
  for (const page of pages.values()) {
    const locales = inventory.pages.filter((item) => item.canonicalPath === page.canonicalPath)
      .map((item) => item.locale).sort();
    assert.deepEqual(page.publishedLocales, locales, `Invented locale: ${page.canonicalPath}`);
  }
  const seen = new Set();
  const groups = {};
  for (const backlink of inventory.backlinks) {
    const { locale, canonicalPath, targetPath, sourceFile, sourceSha256 } = backlink;
    const identity = key(locale, canonicalPath);
    const target = key(locale, targetPath);
    assert(!seen.has(identity), `Duplicate backlink: ${identity}`);
    seen.add(identity);
    assert(existing.has(`/${locale}${canonicalPath}`), `Missing source identity: ${identity}`);
    assert.equal(pages.get(target)?.kind, 'issue-list', `Invalid target: ${target}`);
    const localized = `src/content/tech-center/${locale}${canonicalPath}.md`;
    const expected = fs.existsSync(path.join(root, localized)) || locale !== 'zh'
      ? localized : `src/content/tech-center${canonicalPath}.md`;
    assert.equal(sourceFile, expected, `Wrong source file: ${identity}`);
    const source = readContained(root, sourceFile);
    assert.equal(sha256(source), sourceSha256, `Source changed: ${sourceFile}`);
    assert(source.toString('utf8').includes(`slug: /${locale}${canonicalPath}`));
    groups[target] = (groups[target] || 0) + 1;
    if (deliveryRoot) {
      assert(deliveryLinks.get(target).has(canonicalPath), `Missing forward link: ${identity} from ${target}`);
    }
  }
  assert.deepEqual(groups, {
    'zh|/guide/container-orchestration-issues': 146,
    'zh|/guide/database-storage-issues': 73,
    'zh|/guide/model-serving-issues': 68,
    'zh|/guide/version-upgrade-issues': 100,
    'zh|/guide/image-architecture-issues': 60,
    'en|/guide/api-authentication-issues': 33,
    'en|/guide/environment-configuration-issues': 125,
    'en|/guide/model-serving-issues': 41,
    'en|/guide/upgrade-migration-issues': 114,
    'en|/guide/workflow-node-issues': 37
  });
  for (const locale of ['zh', 'en']) {
    assert.equal(inventory.pages.filter((page) => page.locale === locale).length, 19);
  }
  for (const [kind, count] of Object.entries({ landscape: 2, 'issue-list': 10,
    'decision-matrix': 12, reference: 6, 'deep-dive': 8 })) {
    assert.equal(inventory.pages.filter((page) => page.kind === kind).length, count);
  }
  return { pages: pages.size, backlinks: seen.size };
}

if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    assert(args.length === 0 || (args.length === 2 && args[0] === '--delivery-root' && args[1]),
      'Usage: node scripts/verify-week08-handoff.js [--delivery-root <delivery-repository>]');
    const inventory = require('../docs/plans/week08/inventory.json');
    const result = verifyInventory(inventory, { deliveryRoot: args[1] });
    console.log(`[verify-week08-handoff] ${result.pages} planned pages; ${result.backlinks} unchanged source pages verified${args[1] ? '; delivery hashes and forward links verified' : ''}`);
  } catch (error) {
    console.error(`[verify-week08-handoff] ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { verifyInventory };
