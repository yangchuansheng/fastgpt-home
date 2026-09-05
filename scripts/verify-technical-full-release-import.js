#!/usr/bin/env node

/** Verify the 4,007-page technical full-release repository projection. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSearchProjection } = require('./import-technical-content');
const { sha256, stableJson } = require('./lib/technical-authority');
const {
  FULL_RELEASE_RELATIVE_PATH,
  validateClosureArtifact,
  verifySourceRecords
} = require('./lib/technical-full-release');
const { looseFrontMatter } = require('./lib/week06-technical-candidate');
const {
  EN_SEARCH_PATH,
  EXPECTED_COUNTS,
  MANIFEST_PATH,
  REGISTRY_PATH,
  ROOT,
  ZH_SEARCH_PATH
} = require('./import-technical-full-release');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--w5-source-root' || token === '--w6-source-root') {
      const value = argv[++index];
      if (!value || value.startsWith('--')) throw new Error(`${token} requires a directory`);
      options[token === '--w5-source-root' ? 'w5SourceRoot' : 'w6SourceRoot'] = path.resolve(value);
    } else {
      throw new Error(`Unknown option: ${token}`);
    }
  }
  return options;
}

function validateImportedProjection(repoRoot, closure, entries) {
  const manifestPath = path.join(repoRoot, MANIFEST_PATH);
  if (!fs.existsSync(manifestPath)) return false;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.status !== 'repository-consistent') return false;

  const closurePath = path.join(repoRoot, FULL_RELEASE_RELATIVE_PATH);
  const expectedCounts = {
    baseline: closure.counts.baseline,
    imported: closure.counts.pending,
    total: closure.counts.target
  };
  if (
    manifest.schemaVersion !== 1 ||
    manifest.closure?.path !== FULL_RELEASE_RELATIVE_PATH ||
    manifest.closure?.sha256 !== sha256(fs.readFileSync(closurePath)) ||
    manifest.closure?.recordsSha256 !== closure.recordsSha256 ||
    manifest.pages?.length !== closure.records.length ||
    Object.entries(expectedCounts).some(([key, value]) => manifest.counts?.[key] !== value) ||
    entries.length !== closure.counts.target ||
    sha256(stableJson(entries.slice(0, closure.counts.baseline))) !==
      closure.baseline.registrySha256
  ) {
    throw new Error('Repository-consistent full-release import evidence drift');
  }

  const entriesBySlug = new Map(entries.map((entry) => [entry.slug, entry]));
  if (entriesBySlug.size !== entries.length) {
    throw new Error('Repository-consistent full-release registry contains duplicate identities');
  }
  const pagesByIdentity = new Map(manifest.pages.map((page) => [page.identity, page]));
  if (pagesByIdentity.size !== closure.records.length) {
    throw new Error('Full-release manifest must cover each approved identity exactly once');
  }
  closure.records.forEach((record) => {
    const page = pagesByIdentity.get(record.identityKey);
    const expectedSlug = `/${record.locale}${record.canonicalPath}`;
    const entry = entriesBySlug.get(expectedSlug);
    const expectedReaderPath = `src/content/tech-center/${
      record.locale === 'en' ? 'en/' : ''
    }${record.canonicalPath.slice(1)}.md`;
    if (
      !page ||
      page.batch !== record.batch ||
      page.authorityId !== record.authorityId ||
      page.identity !== record.identityKey ||
      page.sourceFile !== record.sourceFile ||
      page.sourceUrl !== record.sourceUrl ||
      page.sourceSha256 !== record.sourceSha256 ||
      page.approvedBodySha256 !== record.bodySha256 ||
      page.readerPath !== expectedReaderPath ||
      entry?.slug !== expectedSlug ||
      entry.category !== record.category ||
      page.registryEntrySha256 !== sha256(stableJson(entry))
    ) {
      throw new Error(`Repository-consistent imported projection drift: ${record.authorityId}`);
    }
    const readerPath = path.resolve(repoRoot, page.readerPath);
    const resolvedRoot = path.resolve(repoRoot);
    if (
      !readerPath.startsWith(`${resolvedRoot}${path.sep}`) ||
      !fs.existsSync(readerPath) ||
      !fs.statSync(readerPath).isFile()
    ) {
      throw new Error(`Repository-consistent reader path is invalid: ${record.authorityId}`);
    }
    const document = fs.readFileSync(readerPath, 'utf8');
    const parsed = looseFrontMatter(document.replace(/\r\n?/g, '\n'));
    if (
      page.readerSha256 !== sha256(document) ||
      page.importedBodySha256 !== sha256(parsed.body.trim()) ||
      parsed.values.slug !== expectedSlug ||
      parsed.values.source !== record.sourceUrl
    ) {
      throw new Error(`Repository-consistent reader content drift: ${record.authorityId}`);
    }
  });

  const counts = entries.reduce(
    (result, entry) => {
      const locale = entry.slug.split('/')[1];
      if (!Object.hasOwn(result, locale)) throw new Error(`Unsupported imported locale: ${locale}`);
      result[locale] += 1;
      return result;
    },
    { zh: 0, en: 0 }
  );
  if (
    counts.zh !== manifest.counts.zh ||
    counts.en !== manifest.counts.en ||
    counts.zh + counts.en !== entries.length
  ) {
    throw new Error('Repository-consistent full-release locale count drift');
  }
  const expectedSearch = buildSearchProjection(entries);
  for (const [locale, relativePath] of [
    ['zh', ZH_SEARCH_PATH],
    ['en', EN_SEARCH_PATH]
  ]) {
    const observed = JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
    const expected = expectedSearch.filter((entry) => entry.locale === locale);
    if (stableJson(observed) !== stableJson(expected)) {
      throw new Error(`Repository-consistent ${locale} search projection drift`);
    }
  }
  return true;
}

function verifyImport(argv = process.argv.slice(2)) {
  const closure = validateClosureArtifact(
    readJson('src/content/tech-center/authority/full-release-identity-closure.json')
  );
  const manifest = readJson(MANIFEST_PATH);
  const entries = readJson(REGISTRY_PATH);
  const options = parseArgs(argv);
  assert(
    validateImportedProjection(ROOT, closure, entries),
    'Full-release import manifest is missing'
  );

  const sourceVerification = verifySourceRecords(closure.records, options);
  if (sourceVerification.mode === 'external-source-root') {
    assert.equal(sourceVerification.verified, EXPECTED_COUNTS.imported);
  }
  assert.deepEqual(sourceVerification.missing, []);
  assert.deepEqual(sourceVerification.drift, []);

  console.log(
    `[verify-technical-full-release-import] passed: sources=${sourceVerification.mode} bodies=${manifest.pages.length} total=${entries.length} zh=${EXPECTED_COUNTS.zh} en=${EXPECTED_COUNTS.en}`
  );
  return manifest.counts;
}

if (require.main === module) {
  try {
    verifyImport();
  } catch (error) {
    console.error(`[verify-technical-full-release-import] ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { parseArgs, validateImportedProjection, verifyImport };
