#!/usr/bin/env node

/** Verify the 4,007-page technical full-release repository projection. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSearchProjection } = require('./import-technical-content');
const { sha256, stableJson } = require('./lib/technical-authority');
const { validateClosureArtifact, verifySourceRecords } = require('./lib/technical-full-release');
const { looseFrontMatter } = require('./lib/week06-technical-candidate');
const {
  EN_SEARCH_PATH,
  EXPECTED_COUNTS,
  MANIFEST_PATH,
  REGISTRY_PATH,
  ROOT,
  ZH_SEARCH_PATH,
  readerPath
} = require('./import-technical-full-release');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function parseArgs(argv = process.argv.slice(2), manifest) {
  const options = {
    w5SourceRoot: manifest.sourceRoots.W5,
    w6SourceRoot: manifest.sourceRoots.W6
  };
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

function verifyImport(argv = process.argv.slice(2)) {
  const closure = validateClosureArtifact(
    readJson('src/content/tech-center/authority/full-release-identity-closure.json')
  );
  const manifest = readJson(MANIFEST_PATH);
  const entries = readJson(REGISTRY_PATH);
  const zhSearch = readJson(ZH_SEARCH_PATH);
  const enSearch = readJson(EN_SEARCH_PATH);
  const options = parseArgs(argv, manifest);

  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.status, 'repository-consistent');
  assert.equal(manifest.closure.recordsSha256, closure.recordsSha256);
  assert.equal(manifest.pages.length, EXPECTED_COUNTS.imported);
  assert.equal(entries.length, EXPECTED_COUNTS.total);
  assert.deepEqual(manifest.counts, {
    baseline: 1422,
    imported: EXPECTED_COUNTS.imported,
    total: EXPECTED_COUNTS.total,
    zh: EXPECTED_COUNTS.zh,
    en: EXPECTED_COUNTS.en
  });

  const identities = entries.map((entry) => entry.slug.replace(/^\/([^/]+)/, '$1|'));
  assert.equal(
    new Set(identities).size,
    entries.length,
    'Technical registry contains duplicate identities'
  );
  assert.equal(entries.filter((entry) => entry.slug.startsWith('/zh/')).length, EXPECTED_COUNTS.zh);
  assert.equal(entries.filter((entry) => entry.slug.startsWith('/en/')).length, EXPECTED_COUNTS.en);
  assert.equal(zhSearch.length, EXPECTED_COUNTS.zh);
  assert.equal(enSearch.length, EXPECTED_COUNTS.en);
  const expectedSearch = buildSearchProjection(entries);
  assert.deepEqual(
    zhSearch,
    expectedSearch.filter((entry) => entry.locale === 'zh')
  );
  assert.deepEqual(
    enSearch,
    expectedSearch.filter((entry) => entry.locale === 'en')
  );

  const sourceVerification = verifySourceRecords(closure.records, options);
  assert.equal(sourceVerification.verified, EXPECTED_COUNTS.imported);
  assert.deepEqual(sourceVerification.missing, []);
  assert.deepEqual(sourceVerification.drift, []);

  const recordsByIdentity = new Map(closure.records.map((record) => [record.identityKey, record]));
  manifest.pages.forEach((page, index) => {
    const record = recordsByIdentity.get(page.identity);
    assert(record, `Manifest identity is absent from closure: ${page.identity}`);
    assert.equal(page.sourceFile, record.sourceFile);
    assert.equal(page.sourceSha256, record.sourceSha256);
    assert.equal(page.approvedBodySha256, record.bodySha256);
    assert.equal(page.readerPath, readerPath(record));
    const entry = entries[manifest.counts.baseline + index];
    assert.equal(entry.slug, `/${record.locale}${record.canonicalPath}`);
    assert.equal(entry.category, record.category);
    assert.equal(page.registryEntrySha256, sha256(stableJson(entry)));
    const document = fs.readFileSync(path.join(ROOT, page.readerPath), 'utf8');
    const parsed = looseFrontMatter(document.replace(/\r\n?/g, '\n'));
    assert.equal(parsed.values.slug, entry.slug);
    assert.equal(parsed.values.source, record.sourceUrl);
    assert.equal(page.readerSha256, sha256(document));
    assert.equal(page.importedBodySha256, sha256(parsed.body.trim()));
  });

  assert.equal(recordsByIdentity.size, manifest.pages.length);
  console.log(
    `[verify-technical-full-release-import] passed: sources=${sourceVerification.verified} bodies=${manifest.pages.length} total=${entries.length} zh=${EXPECTED_COUNTS.zh} en=${EXPECTED_COUNTS.en}`
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

module.exports = { parseArgs, verifyImport };
