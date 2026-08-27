#!/usr/bin/env node
/** Verify the Week06 technical intake manifest and its empty Wave0 projection. */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const AUTHORITY_DIR = path.join(ROOT, 'src/content/tech-center/authority');
const MANIFEST_PATH = path.join(AUTHORITY_DIR, 'week06-candidate-manifest.json');
const WAVE_PATH = path.join(AUTHORITY_DIR, 'week06-wave0-selection.json');
const ROLLBACK_PATH = path.join(AUTHORITY_DIR, 'week06-rollback.json');
const DISPOSITION_PATH = path.join(AUTHORITY_DIR, 'week06-disposition-ledger.json');
const IDENTITY_PATH = path.join(AUTHORITY_DIR, 'week06-identity-ledger.json');
const DUPLICATE_PATH = path.join(AUTHORITY_DIR, 'week06-duplicate-ledger.json');
const SECURITY_PATH = path.join(AUTHORITY_DIR, 'week06-security-ledger.json');
const OPERATION_RISK_PATH = path.join(AUTHORITY_DIR, 'week06-operation-risk-ledger.json');
const CONTENT_PATH = path.join(AUTHORITY_DIR, 'week06-wave0-content.json');
const PROJECTION_PATH = path.join(AUTHORITY_DIR, 'week06-wave0-projection.json');
const RELEASE_PATH = path.join(AUTHORITY_DIR, 'week06-wave0-release-manifest.json');
const PROVENANCE_PATH = path.join(AUTHORITY_DIR, 'week06-provenance.json');
const EXPECTED = {
  candidates: 2034,
  locales: { en: 515, zh: 1519 },
  categories: {
    api: 31,
    compare: 3,
    deploy: 394,
    glossary: 280,
    integration: 45,
    model: 61,
    node: 51,
    troubleshoot: 992,
    tutorial: 177
  },
  yaml: { pass: 2028, quarantined: 6 }
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function verifyWeek06TechnicalAuthority(rootDir = ROOT) {
  const authorityDir = path.join(rootDir, 'src/content/tech-center/authority');
  const manifest = readJson(path.join(authorityDir, 'week06-candidate-manifest.json'));
  const wave = readJson(path.join(authorityDir, 'week06-wave0-selection.json'));
  const rollback = readJson(path.join(authorityDir, 'week06-rollback.json'));
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.batch, 'week06');
  assert.equal(manifest.status, 'intake-review');
  assert.equal(manifest.summary.candidateCount, EXPECTED.candidates);
  assert.deepEqual(manifest.summary.locales, EXPECTED.locales);
  assert.deepEqual(manifest.summary.categories, EXPECTED.categories);
  assert.deepEqual(manifest.summary.yaml, EXPECTED.yaml);
  assert.equal(manifest.summary.projectionCount, 0);
  assert.equal(manifest.summary.publicationCount, 0);
  assert.equal(manifest.workbook.rowCount, EXPECTED.candidates);
  assert.equal(manifest.workbook.firstDataRow, 2);
  assert.equal(manifest.workbook.lastDataRow, 2035);
  assert.equal(manifest.workbook.schema.length, 12);
  assert.equal(manifest.candidates.length, EXPECTED.candidates);

  const ids = new Set();
  const identities = new Set();
  let yamlPass = 0;
  let yamlQuarantine = 0;
  for (const candidate of manifest.candidates) {
    assert.match(candidate.id, /^week06-\d{4}$/);
    assert(!ids.has(candidate.id), `duplicate candidate id: ${candidate.id}`);
    ids.add(candidate.id);
    const identity = `${candidate.identity.locale}|${candidate.identity.canonicalPath}`;
    assert(!identities.has(identity), `duplicate identity: ${identity}`);
    identities.add(identity);
    assert.match(candidate.identity.locale, /^[a-z]{2}(?:-[a-z]{2,8})?$/);
    assert.match(candidate.identity.canonicalPath, /^\/[a-z0-9]+(?:[/-][a-z0-9]+)*$/);
    assert.match(candidate.identity.owner, /^(cn|io)$/);
    assert.equal(candidate.identity.owner, candidate.identity.locale === 'zh' ? 'cn' : 'io');
    assert.equal(
      candidate.identity.sourcePath,
      `/${candidate.identity.locale}${candidate.identity.canonicalPath}`
    );
    assert.match(candidate.provenance.sourceSha256, /^[a-f0-9]{64}$/);
    assert.match(candidate.provenance.sourceBodySha256, /^[a-f0-9]{64}$/);
    assert.match(candidate.provenance.workbookSha256, /^[a-f0-9]{64}$/);
    assert.equal(candidate.provenance.workbookRow, candidate.workbookRow);
    assert.deepEqual(Object.keys(candidate.input.frontMatter), [
      'title',
      'slug',
      'canonical',
      'page_type',
      'line',
      'source',
      'source_type',
      'lang'
    ]);
    assert.match(candidate.input.consistency, /passed|review/);
    assert.equal(candidate.decision.disposition, 'pending');
    assert.match(candidate.state, /pending-review|input-integrity-quarantine/);
    if (candidate.input.yamlStatus === 'pass') yamlPass += 1;
    else {
      assert.equal(candidate.input.yamlStatus, 'quarantine');
      assert(candidate.input.yamlError);
      yamlQuarantine += 1;
    }
  }
  assert.equal(yamlPass, EXPECTED.yaml.pass);
  assert.equal(yamlQuarantine, EXPECTED.yaml.quarantined);
  assert.equal(manifest.candidateManifestSha256, digest(JSON.stringify(manifest.candidates)));
  assert.equal(manifest.duplicateRelations.length, 6);

  const disposition = readJson(DISPOSITION_PATH);
  assert.equal(disposition.status, 'intake-review');
  assert.equal(disposition.candidateCount, EXPECTED.candidates);
  assert.equal(disposition.accepted.length, 0);
  assert.equal(disposition.denied.length, 0);
  assert.equal(disposition.pending.length, EXPECTED.candidates);
  assert.equal(disposition.decisions.length, EXPECTED.candidates);

  const identityLedger = readJson(IDENTITY_PATH);
  assert.equal(identityLedger.candidateCount, EXPECTED.candidates);
  assert.equal(identityLedger.unresolvedCount, EXPECTED.candidates);
  assert.equal(identityLedger.records.length, EXPECTED.candidates);
  assert.deepEqual(identityLedger.conflicts, []);

  for (const ledgerPath of [SECURITY_PATH, OPERATION_RISK_PATH]) {
    const ledger = readJson(ledgerPath);
    assert.equal(ledger.candidateCount, EXPECTED.candidates);
    assert.equal(ledger.unresolvedCount, EXPECTED.candidates);
    assert.equal(ledger.findings?.length || ledger.records?.length, EXPECTED.candidates);
  }

  const duplicate = readJson(DUPLICATE_PATH);
  assert.equal(duplicate.relationCount, 6);
  assert.equal(duplicate.resolvedRelationCount, 0);
  assert.equal(duplicate.unresolvedRelationCount, 6);
  assert.equal(duplicate.relations.length, 6);

  const provenance = readJson(PROVENANCE_PATH);
  assert.equal(provenance.workbook.sha256, manifest.workbook.sha256);
  assert.equal(provenance.workbook.rowCount, EXPECTED.candidates);
  assert.equal(provenance.sources.length, EXPECTED.candidates);
  assert.match(provenance.sourceSetSha256, /^[a-f0-9]{64}$/);

  const content = readJson(CONTENT_PATH);
  assert.equal(content.wave, 'wave-0');
  assert.equal(content.readerCount, 0);
  assert.deepEqual(content.sources, []);
  const projection = readJson(PROJECTION_PATH);
  assert.equal(projection.publicationCount, 0);
  assert.deepEqual(projection.identities, []);
  const release = readJson(RELEASE_PATH);
  assert.equal(release.status, 'release-blocked');
  assert.equal(release.governanceStatus, 'intake-review');
  assert.equal(release.publicationCount, 0);
  assert.equal(release.baseline.pageCount, 1172);
  assert(
    release.artifacts.some((artifact) => artifact.path.endsWith('week06-disposition-ledger.json'))
  );

  assert.equal(wave.schemaVersion, 1);
  assert.equal(wave.batch, 'week06');
  assert.equal(wave.wave, 'wave-0');
  assert.equal(wave.status, 'empty');
  assert.deepEqual(wave.selected, []);
  assert.deepEqual(wave.projection, []);
  assert.equal(wave.rollback, 'week06-rollback.json');
  assert.equal(rollback.schemaVersion, 1);
  assert.equal(rollback.batch, 'week06');
  assert.equal(rollback.wave, 'wave-0');
  assert.equal(rollback.status, 'ready');
  assert.deepEqual(rollback.affectedIdentities, []);
  assert.equal(rollback.baseline.pageCount, 1172);
  assert.equal(
    rollback.restore.authority,
    'src/content/tech-center/authority/week06-candidate-manifest.json'
  );

  const currentEntriesPath = path.join(rootDir, 'src/components/tech-center/entries.json');
  if (fs.existsSync(currentEntriesPath)) {
    const currentIdentities = new Set(
      readJson(currentEntriesPath).map(
        (entry) => `${entry.slug.split('/')[1]}|/${entry.slug.split('/').slice(2).join('/')}`
      )
    );
    assert.equal(
      [...identities].filter((identity) => currentIdentities.has(identity)).length,
      0,
      'Week06 pending identities must not enter the current public registry'
    );
  }
  return {
    candidates: manifest.summary.candidateCount,
    locales: manifest.summary.locales,
    yaml: manifest.summary.yaml,
    projection: manifest.summary.projectionCount
  };
}

if (require.main === module) {
  try {
    const result = verifyWeek06TechnicalAuthority();
    console.log(
      `[verify-week06-technical-authority] passed: candidates=${result.candidates} zh=${result.locales.zh} en=${result.locales.en} yamlPass=${result.yaml.pass} yamlQuarantine=${result.yaml.quarantined} projection=${result.projection}`
    );
  } catch (error) {
    console.error(`[verify-week06-technical-authority] ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { verifyWeek06TechnicalAuthority };
