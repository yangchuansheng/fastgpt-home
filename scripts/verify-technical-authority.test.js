const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  applyAtomicProjection,
  buildCountInvariant,
  closeAuthority,
  getTemporaryCandidates,
  loadTechnicalAuthority,
  projectTracer,
  validateTechnicalAuthority,
  verifyAtomicProjection
} = require('./lib/technical-authority');

const ROOT = path.resolve(__dirname, '..');
const AUTHORITY_PATH = path.join(
  ROOT,
  'src/content/tech-center/authority/week05-authority.json'
);
const TRACER_PATH = path.join(
  ROOT,
  'scripts/fixtures/technical-authority/week05-tracer.json'
);

test('Week05 authority preserves the historical 454 accepted and 6 denied baseline', () => {
  const authority = loadTechnicalAuthority(ROOT);
  const result = validateTechnicalAuthority(authority, { verifyHistory: true });

  assert.equal(result.history.accepted, 454);
  assert.equal(result.history.denied, 6);
  assert.equal(result.candidates, 888);
  assert.equal(result.temporary, result.needsEvidence + result.deferred);
  assert(result.temporary > 0);
});

test('temporary candidate states stay separate and block authority closure', () => {
  const authority = loadTechnicalAuthority(ROOT);
  const temporary = getTemporaryCandidates(authority);

  assert(temporary.some((candidate) => candidate.state === 'needs-evidence'));
  assert(temporary.some((candidate) => candidate.state === 'deferred'));
  assert.throws(() => closeAuthority(authority), /temporary/i);
});

test('closed authority enforces final disposition and add/update count invariants', () => {
  const authority = loadTechnicalAuthority(ROOT);
  const closed = structuredClone(authority);
  closed.batch.status = 'closed';
  closed.candidates = closed.candidates.map((candidate) => ({
    ...candidate,
    state: 'denied',
    decision: { disposition: 'denied', reason: 'Fixture closure' }
  }));
  closed.candidates[0] = {
    ...closed.candidates[0],
    state: 'accepted',
    decision: { disposition: 'accepted', operation: 'add', reason: 'Fixture closure' }
  };
  closed.final = {
    accepted: [closed.candidates[0].id],
    denied: closed.candidates.slice(1).map((candidate) => candidate.id)
  };
  closed.temporary = { needsEvidence: [], deferred: [] };
  closed.counts = {
    accepted: 1,
    denied: 887,
    add: 1,
    update: 0,
    resultingPageCount: 1123
  };
  closed.projection.resultingPageCount = 1123;
  const result = closeAuthority(closed);

  assert.equal(result.accepted, 1);
  assert.equal(result.denied, 887);
  assert.equal(result.add, 1);
  assert.equal(result.update, 0);
  assert.equal(result.accepted, result.add + result.update);
  assert.equal(result.resultingPageCount, 1123);
});

test('count invariant excludes accepted updates from page growth', () => {
  const result = buildCountInvariant({
    baselinePageCount: 1122,
    accepted: [
      { state: 'accepted', decision: { disposition: 'accepted', operation: 'add' } },
      { state: 'accepted', decision: { disposition: 'accepted', operation: 'update' } }
    ],
    denied: []
  });

  assert.deepEqual(result, {
    accepted: 2,
    denied: 0,
    add: 1,
    update: 1,
    resultingPageCount: 1123
  });
});

test('authority rejects identity, relation, evidence, credential, and risk drift', () => {
  const authority = loadTechnicalAuthority(ROOT);

  const identityCollision = structuredClone(authority);
  identityCollision.candidates[1].identity = identityCollision.candidates[0].identity;
  assert.throws(() => validateTechnicalAuthority(identityCollision), /identity collision/i);

  const duplicateRelation = structuredClone(authority);
  duplicateRelation.relations.push(structuredClone(duplicateRelation.relations[0]));
  assert.throws(() => validateTechnicalAuthority(duplicateRelation), /duplicates a relation group/i);

  const invalidEvidence = structuredClone(authority);
  invalidEvidence.candidates[1].evidence = {
    ...invalidEvidence.candidates[1].evidence,
    status: 'verified',
    sources: []
  };
  assert.throws(() => validateTechnicalAuthority(invalidEvidence), /require a source/i);

  const credentialFinding = structuredClone(authority);
  const credentialCandidate = credentialFinding.candidates.find((candidate) => candidate.security.findings.length);
  credentialCandidate.security.findings[0].value = 'secret-shaped-value';
  assert.throws(() => validateTechnicalAuthority(credentialFinding), /credential-shaped values/i);

  const invalidRisk = structuredClone(authority);
  const d0Candidate = invalidRisk.candidates.find((candidate) => candidate.operationRisk.level === 'D0');
  d0Candidate.operationRisk.decision = 'review';
  assert.throws(() => validateTechnicalAuthority(invalidRisk), /D0 records require a denial/i);
});

test('tracer projection shares one identity set across all public surfaces', () => {
  const authority = loadTechnicalAuthority(ROOT);
  const tracer = JSON.parse(fs.readFileSync(TRACER_PATH, 'utf8'));
  const projection = projectTracer(authority, tracer);

  assert.equal(projection.identities.length, 1);
  assert.equal(projection.registry.length, 1);
  assert.equal(projection.search.length, 1);
  assert.equal(projection.sitemap.length, 1);
  assert.equal(projection.staticExport.length, 1);
  assert.equal(projection.releaseRecord.length, 1);
  assert.equal(projection.rollback.length, 1);
  assert.doesNotThrow(() => verifyAtomicProjection(projection));
});

test('atomic tracer projection rolls every surface back after a failed write', () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'technical-projection-'));
  const surfaces = ['registry', 'search', 'sitemap', 'static-export', 'release-record', 'rollback'].map(
    (name) => path.join(temporaryRoot, `${name}.json`)
  );
  surfaces.forEach((filePath) => fs.writeFileSync(filePath, '{"version":"baseline"}\n'));
  const before = surfaces.map((filePath) => fs.readFileSync(filePath));

  try {
    assert.throws(
      () =>
        applyAtomicProjection({
          files: surfaces,
          contents: surfaces.map(() => '{"version":"tracer"}\n'),
          failAt: 3
        }),
      /projection failure/i
    );
    surfaces.forEach((filePath, index) => assert.deepEqual(fs.readFileSync(filePath), before[index]));
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('committed authority and tracer fixtures remain schema-valid', () => {
  assert(fs.existsSync(AUTHORITY_PATH));
  assert(fs.existsSync(TRACER_PATH));
  assert.doesNotThrow(() => validateTechnicalAuthority(loadTechnicalAuthority(ROOT)));
});
