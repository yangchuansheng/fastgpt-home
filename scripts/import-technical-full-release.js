#!/usr/bin/env node

/** Materialize the frozen 2,585-page technical full-release bundle. */

const fs = require('node:fs');
const path = require('node:path');
const {
  buildNormalizedTechnicalPage,
  buildSearchProjection
} = require('./import-technical-content');
const { fileSha256, sha256, stableJson } = require('./lib/technical-authority');
const {
  FULL_RELEASE_RELATIVE_PATH,
  TARGET_PAGE_COUNT,
  validateClosureArtifact,
  verifySourceRecords
} = require('./lib/technical-full-release');
const { looseFrontMatter } = require('./lib/week06-technical-candidate');
const { buildReaderPage } = require('./lib/week06-wave1-content');

const ROOT = path.resolve(__dirname, '..');
const REGISTRY_PATH = 'src/components/tech-center/entries.json';
const ZH_SEARCH_PATH = 'public/tech-center/search-index.json';
const EN_SEARCH_PATH = 'public/tech-center/search-index.en.json';
const MANIFEST_PATH = 'src/content/tech-center/authority/full-release-import-manifest.json';
const EXPECTED_COUNTS = { total: 4007, zh: 3492, en: 515, imported: 2585 };

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
  if (!options.w5SourceRoot || !options.w6SourceRoot) {
    throw new Error('--w5-source-root and --w6-source-root are required');
  }
  return options;
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function readerPath(record) {
  const localeDirectory = record.locale === 'en' ? 'en/' : '';
  return `src/content/tech-center/${localeDirectory}${record.canonicalPath.slice(1)}.md`;
}

function citationCount(body) {
  return new Set(
    [
      ...body.matchAll(
        /^\s*>\s*(?:来源|Source|Sources|参考资料|References)\s*[:：]\s*(?:\[[^\]]+\]\((https:\/\/[^)\s]+)\)|(https:\/\/[^\s]+))\s*$/gimu
      )
    ].map((match) => match[1] || match[2])
  ).size;
}

function assertSourceVerification(closure, sourceRoots) {
  const result = verifySourceRecords(closure.records, sourceRoots);
  if (result.verified !== closure.records.length || result.missing.length || result.drift.length) {
    throw new Error(`Full-release source verification failed: ${JSON.stringify(result)}`);
  }
}

function buildW5Page(record, sourceRoot) {
  const sourcePath = path.join(sourceRoot, record.sourceFile);
  const source = fs.readFileSync(sourcePath, 'utf8').replace(/\r\n?/g, '\n');
  const parsed = looseFrontMatter(source);
  if (parsed.values.source !== record.sourceUrl) {
    throw new Error(`${record.authorityId} source URL differs from the closure`);
  }
  return buildNormalizedTechnicalPage({
    metadata: {
      title: parsed.values.title,
      slug: parsed.values.slug,
      page_type: parsed.values.page_type,
      source: parsed.values.source,
      source_type: parsed.values.source_type
    },
    identity: record,
    body: parsed.body,
    wordCount: parsed.body.length,
    sourceCount: citationCount(parsed.body),
    label: record.authorityId
  });
}

function buildBundle({ w5SourceRoot, w6SourceRoot }) {
  const closure = validateClosureArtifact(readJson(FULL_RELEASE_RELATIVE_PATH));
  const entries = readJson(REGISTRY_PATH);
  const baseline =
    entries.length === TARGET_PAGE_COUNT ? entries.slice(0, closure.counts.baseline) : entries;
  if (
    baseline.length !== closure.counts.baseline ||
    sha256(stableJson(baseline)) !== closure.baseline.registrySha256
  ) {
    throw new Error('Technical registry baseline differs from the frozen full-release closure');
  }
  assertSourceVerification(closure, { w5SourceRoot, w6SourceRoot });

  const week06 = readJson('src/content/tech-center/authority/week06-candidate-manifest.json');
  const week06ById = new Map(week06.candidates.map((candidate) => [candidate.id, candidate]));
  const documents = new Map();
  const pages = closure.records.map((record) => {
    const builtPage =
      record.batch === 'W5'
        ? buildW5Page(record, w5SourceRoot)
        : buildReaderPage(ROOT, week06ById.get(record.authorityId), w6SourceRoot);
    const page = {
      ...builtPage,
      body: builtPage.body.replace(/[ \t]+$/gm, ''),
      document: builtPage.document.replace(/[ \t]+$/gm, '')
    };
    const expectedSlug = `/${record.locale}${record.canonicalPath}`;
    if (page.projection.slug !== expectedSlug || page.projection.category !== record.category) {
      throw new Error(`${record.authorityId} projection differs from the frozen identity`);
    }
    const pathName = readerPath(record);
    documents.set(pathName, page.document);
    return {
      batch: record.batch,
      authorityId: record.authorityId,
      identity: record.identityKey,
      sourceFile: record.sourceFile,
      sourceUrl: record.sourceUrl,
      sourceSha256: record.sourceSha256,
      approvedBodySha256: record.bodySha256,
      readerPath: pathName,
      readerSha256: sha256(page.document),
      importedBodySha256: sha256(page.body),
      registryEntrySha256: sha256(stableJson(page.projection)),
      projection: page.projection
    };
  });
  const projectedEntries = [...baseline, ...pages.map((page) => page.projection)];
  const search = buildSearchProjection(projectedEntries);
  const localeCounts = projectedEntries.reduce(
    (counts, entry) => {
      counts[entry.slug.split('/')[1]] += 1;
      return counts;
    },
    { zh: 0, en: 0 }
  );
  if (
    projectedEntries.length !== EXPECTED_COUNTS.total ||
    pages.length !== EXPECTED_COUNTS.imported ||
    localeCounts.zh !== EXPECTED_COUNTS.zh ||
    localeCounts.en !== EXPECTED_COUNTS.en
  ) {
    throw new Error('Full-release projected counts differ from the approved contract');
  }

  const manifest = {
    schemaVersion: 1,
    publicationUnit: 'technical-full-release-import',
    status: 'repository-consistent',
    closure: {
      path: FULL_RELEASE_RELATIVE_PATH,
      sha256: fileSha256(path.join(ROOT, FULL_RELEASE_RELATIVE_PATH)),
      recordsSha256: closure.recordsSha256
    },
    sourceRoots: { W5: w5SourceRoot, W6: w6SourceRoot },
    counts: {
      baseline: baseline.length,
      imported: pages.length,
      total: projectedEntries.length,
      ...localeCounts
    },
    compatibility: {
      verifier: 'scripts/verify-technical-full-release-import.js',
      note: 'The historical technical-content policy remains frozen at 1,422 pages; this manifest and verifier own the 4,007-page full-release projection.'
    },
    pages: pages.map(({ projection, ...page }) => page)
  };
  return { documents, entries: projectedEntries, manifest, search };
}

function writeBundle(bundle) {
  for (const [relativePath, document] of bundle.documents) {
    const filePath = path.join(ROOT, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, document);
  }
  fs.writeFileSync(path.join(ROOT, REGISTRY_PATH), stableJson(bundle.entries));
  fs.writeFileSync(
    path.join(ROOT, ZH_SEARCH_PATH),
    stableJson(bundle.search.filter((entry) => entry.locale === 'zh'))
  );
  fs.writeFileSync(
    path.join(ROOT, EN_SEARCH_PATH),
    stableJson(bundle.search.filter((entry) => entry.locale === 'en'))
  );
  fs.writeFileSync(path.join(ROOT, MANIFEST_PATH), stableJson(bundle.manifest));
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const bundle = buildBundle(options);
  writeBundle(bundle);
  console.log(
    `[import-technical-full-release] written: imported=${bundle.manifest.counts.imported} total=${bundle.manifest.counts.total} zh=${bundle.manifest.counts.zh} en=${bundle.manifest.counts.en}`
  );
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[import-technical-full-release] ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  EN_SEARCH_PATH,
  EXPECTED_COUNTS,
  MANIFEST_PATH,
  REGISTRY_PATH,
  ROOT,
  ZH_SEARCH_PATH,
  citationCount,
  main,
  parseArgs,
  readerPath
};
