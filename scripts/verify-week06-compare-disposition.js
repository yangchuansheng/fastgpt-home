#!/usr/bin/env node
/** Verify the final Week06 comparison dispositions and their zero-route release contract. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const CONTRACT_RELATIVE_PATH =
  'scripts/fixtures/technical-authority/week06-comparison-candidate-contract.json';
const FIXTURE_RELATIVE_PATH =
  'scripts/fixtures/technical-authority/week06-compare-surfaces.json';
const EXPECTED_CANDIDATES = ['week06-0521', 'week06-0522', 'week06-0523'];
const EXPECTED_COMPARISONS = [
  'dify-vs-fastgpt',
  'ragflow-vs-fastgpt',
  'maxkb-vs-fastgpt',
  'self-build-vs-platform'
];
const ZERO_PUBLIC_DELTAS = [
  'genericTechnicalPages',
  'comparisonRegistry',
  'publicRoutes',
  'canonicalUrls',
  'sitemapEntries',
  'staticExportRoutes'
];

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`${label} is unreadable: ${error.message}`);
  }
}

function sorted(values) {
  return [...values].sort();
}

function assertHttps(candidate) {
  assert(candidate.officialSources.length > 0, `${candidate.candidateId} official source is required`);
  candidate.officialSources.forEach((source) => {
    const url = new URL(source);
    assert.equal(url.protocol, 'https:', `${candidate.candidateId} official source must use HTTPS`);
    assert(url.hostname, `${candidate.candidateId} official source hostname is required`);
  });
}

function assertNoCandidateLeak(surface, candidates, message) {
  const serialized = JSON.stringify(surface);
  for (const candidate of candidates) {
    const proposedSlug = candidate.proposedIdentity.canonicalPath.split('/').pop();
    if (
      serialized.includes(candidate.candidateId) ||
      serialized.includes(candidate.proposedIdentity.canonicalPath) ||
      serialized.includes(proposedSlug)
    ) {
      assert.fail(message(candidate));
    }
  }
}

function verifySourceAuthority(rootDir, contract) {
  const authority = readJson(path.join(rootDir, contract.sourceAuthorityPath), 'source authority');
  const delegated = new Map(authority.candidates.map((candidate) => [candidate.id, candidate]));
  for (const candidate of contract.candidates) {
    const source = delegated.get(candidate.candidateId);
    assert(source, `source authority is missing ${candidate.candidateId}`);
    assert.deepEqual(
      candidate.proposedIdentity,
      source.identity,
      `${candidate.candidateId} identity differs from source authority`
    );
  }
}

function verifyExistingComparisons(rootDir, contract, fixture) {
  const registry = fs.readFileSync(path.join(rootDir, contract.comparisonRegistryPath), 'utf8');
  const registered = [...registry.matchAll(/^\s{2}'([^']+)':/gm)].map((match) => match[1]);
  assert.deepEqual(sorted(registered), sorted(EXPECTED_COMPARISONS), 'comparison registry drift');
  assert.deepEqual(
    sorted(contract.checkedComparisonIdentities),
    sorted(registered),
    'checked comparison identities differ from registry'
  );

  const competitorSources = fs
    .readdirSync(path.join(rootDir, 'src/content/competitor'))
    .filter((name) => name.endsWith('.ts'))
    .map((name) => fs.readFileSync(path.join(rootDir, 'src/content/competitor', name), 'utf8'))
    .join('\n');
  const competitorBodies = [
    ...fs.readdirSync(path.join(rootDir, 'content/competitors')).filter((name) => name.endsWith('.md')),
    ...fs
      .readdirSync(path.join(rootDir, 'content/competitors/en'))
      .filter((name) => name.endsWith('.md'))
      .map((name) => `en/${name}`)
  ]
    .map((name) => fs.readFileSync(path.join(rootDir, 'content/competitors', name), 'utf8'))
    .join('\n');

  for (const candidate of contract.candidates.filter((entry) => entry.disposition === 'deny')) {
    const proposedSlug = candidate.proposedIdentity.canonicalPath.split('/').pop();
    assert(
      !registry.includes(proposedSlug) && !competitorSources.includes(proposedSlug) && !competitorBodies.includes(proposedSlug),
      `denied candidate ${candidate.candidateId} leaks into repository comparison content`
    );
    assertNoCandidateLeak(
      fixture.comparison,
      [candidate],
      () => `denied candidate ${candidate.candidateId} leaks into comparison registry`
    );
  }
  assert.deepEqual(sorted(fixture.comparison.registry), sorted(registered), 'fixture registry drift');
}

function verifyMergedSeo(rootDir, contract, fixture) {
  const merged = contract.candidates.filter((candidate) => candidate.disposition === 'merge');
  for (const candidate of merged) {
    const slug = candidate.targetComparisonIdentity;
    assert(EXPECTED_COMPARISONS.includes(slug), `${candidate.candidateId} merge target is unknown`);
    assert.deepEqual(candidate.seoEvidence.locales, ['zh', 'en']);
    assert.deepEqual(candidate.seoEvidence.canonicals, [
      `https://fastgpt.cn/compare/${slug}`,
      `https://fastgpt.io/compare/${slug}`
    ]);
    for (const gate of [
      'reciprocalHreflang',
      'sitemapMembership',
      'internalLinks',
      'structuredContent',
      'staticExport'
    ]) {
      assert.equal(candidate.seoEvidence[gate], true, `${candidate.candidateId} ${gate} evidence is missing`);
    }
    assert(fixture.comparison.internalLinks.includes(slug), `${slug} internal-link evidence is missing`);
    assert(fixture.comparison.sitemap.includes(candidate.seoEvidence.canonicals[0]));
    assert(fixture.comparison.sitemap.includes(candidate.seoEvidence.canonicals[1]));
    assert(fixture.comparison.staticExport.includes(`/compare/${slug}`));
    assert(fixture.comparison.staticExport.includes(`/zh/compare/${slug}`));
  }

  const seoSource = fs.readFileSync(path.join(rootDir, 'src/lib/seo.ts'), 'utf8');
  const sitemapSource = fs.readFileSync(path.join(rootDir, 'src/app/sitemap.ts'), 'utf8');
  const routeSource = fs.readFileSync(
    path.join(rootDir, 'src/components/compare/ComparisonRoute.tsx'),
    'utf8'
  );
  const hubSource = fs.readFileSync(
    path.join(rootDir, 'src/components/compare/ComparisonHubPage.tsx'),
    'utf8'
  );
  assert(seoSource.includes("'zh-CN': chineseUrl") && seoSource.includes('en: englishUrl'));
  assert(sitemapSource.includes('getComparisonPagesForLocale(compareLocale)'));
  assert(routeSource.includes('<ArticleJsonLd') && routeSource.includes('getCompareAlternates'));
  assert(hubSource.includes('getHubPageHref(locale, page.slug)'));
}

function verifyRelease(contract) {
  assert(contract.releaseManifest, 'release manifest is required');
  assert(contract.rollbackManifest, 'rollback manifest is required');
  const merged = contract.candidates.filter((candidate) => candidate.disposition === 'merge');
  const expectedIdentities = merged.flatMap((candidate) => [
    `zh|/compare/${candidate.targetComparisonIdentity}`,
    `en|/compare/${candidate.targetComparisonIdentity}`
  ]);
  assert.deepEqual(
    contract.releaseManifest.changedComparisonIdentities,
    expectedIdentities,
    'release identities differ from merged identities'
  );
  assert.deepEqual(
    contract.rollbackManifest.restoreComparisonIdentities,
    expectedIdentities,
    'rollback identities differ from merged identities'
  );
  assert.deepEqual(contract.rollbackManifest.removeComparisonIdentities, []);
  assert.equal(contract.releaseManifest.deltas.decisionRecords, contract.candidates.length);
  assert.equal(contract.rollbackManifest.deltas.decisionRecords, -contract.candidates.length);
  for (const field of ZERO_PUBLIC_DELTAS) {
    assert.equal(contract.releaseManifest.deltas[field], 0, `release ${field} delta must be zero`);
    assert.equal(contract.rollbackManifest.deltas[field], 0, `rollback ${field} delta must be zero`);
  }
  const expectedDispositions = contract.candidates.map((candidate) =>
    [candidate.candidateId, candidate.disposition, candidate.targetComparisonIdentity]
      .filter(Boolean)
      .join(':')
  );
  assert.deepEqual(contract.releaseManifest.candidateDispositions, expectedDispositions);
}

function verifyWeek06CompareDisposition({
  rootDir = ROOT,
  contractPath = path.join(rootDir, CONTRACT_RELATIVE_PATH),
  fixturePath = path.join(rootDir, FIXTURE_RELATIVE_PATH)
} = {}) {
  const contract = readJson(contractPath, 'Week06 comparison contract');
  const fixture = readJson(fixturePath, 'Week06 comparison surface fixture');

  assert.equal(contract.schemaVersion, 2);
  assert.equal(contract.batch, 'week06');
  assert.equal(contract.status, 'closed');
  assert.deepEqual(contract.candidates.map((candidate) => candidate.candidateId), EXPECTED_CANDIDATES);
  assert.deepEqual(sorted(contract.candidates.map((candidate) => candidate.disposition)), [
    'deny',
    'deny',
    'merge'
  ]);
  verifySourceAuthority(rootDir, contract);

  for (const candidate of contract.candidates) {
    assertHttps(candidate);
    assert(candidate.rationale, `${candidate.candidateId} rationale is required`);
    assert.deepEqual(
      Object.values(candidate.review).filter((value) => value !== 'excluded' && value !== 'existing-bilingual-publication'),
      ['passed', 'passed', 'passed', 'passed', 'passed', 'passed'],
      `${candidate.candidateId} review gates are incomplete`
    );
    assert.deepEqual(sorted(candidate.overlap), sorted([...new Set(candidate.overlap)]));
    candidate.overlap.forEach((identity) =>
      assert(EXPECTED_COMPARISONS.includes(identity), `${candidate.candidateId} overlap identity is unknown`)
    );
  }

  assertNoCandidateLeak(
    fixture.genericTechnical,
    contract.candidates,
    (candidate) => `generic Technical Page projection leaks ${candidate.candidateId}`
  );
  const genericFiles = [
    'src/components/tech-center/entries.json',
    'src/content/tech-center/authority/week06-wave0-content.json',
    'src/content/tech-center/authority/week06-wave0-projection.json',
    'src/content/tech-center/authority/week06-wave0-selection.json'
  ].map((file) => fs.readFileSync(path.join(rootDir, file), 'utf8'));
  assertNoCandidateLeak(
    genericFiles,
    contract.candidates,
    (candidate) => `generic Technical Page source leaks ${candidate.candidateId}`
  );

  verifyExistingComparisons(rootDir, contract, fixture);
  verifyMergedSeo(rootDir, contract, fixture);
  verifyRelease(contract);

  const merged = contract.candidates.filter((candidate) => candidate.disposition === 'merge');
  return {
    candidates: contract.candidates.length,
    merged: merged.length,
    published: contract.candidates.filter((candidate) => candidate.disposition === 'publish').length,
    denied: contract.candidates.filter((candidate) => candidate.disposition === 'deny').length,
    changedIdentities: merged.map((candidate) => candidate.targetComparisonIdentity),
    publicRouteDelta: contract.releaseManifest.deltas.publicRoutes
  };
}

function parseArgs(argv) {
  const options = { rootDir: ROOT };
  for (let index = 0; index < argv.length; index += 2) {
    const value = argv[index + 1];
    if (!value) throw new Error(`missing value for ${argv[index]}`);
    if (argv[index] === '--root') options.rootDir = path.resolve(value);
    else if (argv[index] === '--contract') options.contractPath = path.resolve(value);
    else if (argv[index] === '--fixture') options.fixturePath = path.resolve(value);
    else throw new Error(`unknown option ${argv[index]}`);
  }
  return options;
}

if (require.main === module) {
  try {
    const result = verifyWeek06CompareDisposition(parseArgs(process.argv.slice(2)));
    console.log(
      `[verify-week06-compare-disposition] passed: candidates=${result.candidates} merged=${result.merged} published=${result.published} denied=${result.denied} identities=${result.changedIdentities.join(',')} publicRoutes=${result.publicRouteDelta}`
    );
  } catch (error) {
    console.error(`[verify-week06-compare-disposition] ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  CONTRACT_RELATIVE_PATH,
  FIXTURE_RELATIVE_PATH,
  verifyWeek06CompareDisposition
};
