const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  buildClosure,
  collectCrossBatchConflicts,
  FULL_RELEASE_RELATIVE_PATH,
  validateClosureArtifact,
  verifySourceRecords,
  verifyTechnicalFullRelease,
  writeClosureArtifact
} = require('./lib/technical-full-release');
const { sha256 } = require('./lib/technical-authority');
const { parseArgs: parseGenerateArgs } = require('./generate-technical-full-release');
const { parseArgs: parseVerifyArgs } = require('./verify-technical-full-release');

const ROOT = path.resolve(__dirname, '..');

test('full-release closure is deterministic and preserves the 2,585-page contract', () => {
  const artifact = JSON.parse(fs.readFileSync(path.join(ROOT, FULL_RELEASE_RELATIVE_PATH), 'utf8'));
  const generated = buildClosure(ROOT);
  validateClosureArtifact(artifact);
  assert.deepEqual(artifact, generated);

  const result = verifyTechnicalFullRelease(ROOT);
  assert.equal(result.baseline, 1422);
  assert.equal(result.W5.accepted, 854);
  assert.equal(result.W5.published, 250);
  assert.equal(result.W5.pending, 604);
  assert.equal(result.W6.accepted, 2031);
  assert.equal(result.W6.published, 50);
  assert.equal(result.W6.pending, 1981);
  assert.equal(result.pending, 2585);
  assert.equal(result.target, 4007);
  assert.deepEqual(result.sourceVerification, {
    mode: 'authority-recorded',
    recorded: 2585,
    requested: 0,
    verified: 0,
    missing: [],
    drift: []
  });
  assert.deepEqual(result.evidence, { missing: [], drift: [], crossBatchConflicts: [] });
});

test('source verification normalizes Week06 line endings and reports missing or drifted bodies', () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'technical-full-release-'));
  try {
    const w5Root = path.join(temporaryRoot, 'w5');
    const w6Root = path.join(temporaryRoot, 'w6');
    fs.mkdirSync(w5Root);
    fs.mkdirSync(w6Root);
    const w5Source = Buffer.from('---\ntitle: W5 fixture\n---\nW5 body\n');
    const w6RawSource = '---\r\ntitle: W6 fixture\r\n---\r\nW6 body\r\n';
    const w6Source = w6RawSource.replace(/\r\n?/g, '\n');
    fs.writeFileSync(path.join(w5Root, 'fixture-w5.md'), w5Source);
    fs.writeFileSync(path.join(w6Root, 'fixture-w6.md'), w6RawSource);
    const records = [
      {
        batch: 'W5',
        authorityId: 'week05-fixture',
        sourceFile: 'fixture-w5.md',
        sourceSha256: sha256(w5Source),
        bodySha256: sha256(w5Source)
      },
      {
        batch: 'W6',
        authorityId: 'week06-fixture',
        sourceFile: 'fixture-w6.md',
        sourceSha256: sha256(w6Source),
        bodySha256: sha256('W6 body\n')
      }
    ];
    const verified = verifySourceRecords(records, {
      w5SourceRoot: w5Root,
      w6SourceRoot: w6Root
    });
    assert.equal(verified.verified, 2);

    fs.rmSync(path.join(w5Root, 'fixture-w5.md'));
    const missing = verifySourceRecords(records, {
      w5SourceRoot: w5Root,
      w6SourceRoot: w6Root
    });
    assert.deepEqual(
      missing.missing.map(({ batch, authorityId, reason }) => ({ batch, authorityId, reason })),
      [{ batch: 'W5', authorityId: 'week05-fixture', reason: 'missing-source' }]
    );

    fs.writeFileSync(path.join(w5Root, 'fixture-w5.md'), Buffer.from('changed\n'));
    const drifted = verifySourceRecords(records, {
      w5SourceRoot: w5Root,
      w6SourceRoot: w6Root
    });
    assert.equal(drifted.drift.length, 1);
    assert.equal(drifted.drift[0].reason, 'source-digest-drift');
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('closure validation catches a record mutation through its digest', () => {
  const artifact = JSON.parse(fs.readFileSync(path.join(ROOT, FULL_RELEASE_RELATIVE_PATH), 'utf8'));
  const mutated = structuredClone(artifact);
  mutated.records[0].category = 'deploy';
  assert.throws(() => validateClosureArtifact(mutated), /records digest changed/);
});

test('blocked closure evidence is persistable and cross-batch conflicts retain authority ids', () => {
  const artifact = JSON.parse(fs.readFileSync(path.join(ROOT, FULL_RELEASE_RELATIVE_PATH), 'utf8'));
  const blocked = structuredClone(artifact);
  blocked.status = 'blocked';
  blocked.evidence.missing.push({
    kind: 'body-source',
    batch: 'W5',
    authorityId: 'week05-fixture',
    sourceFile: 'fixture.md',
    reason: 'missing-source'
  });

  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'technical-closure-evidence-'));
  try {
    const filePath = writeClosureArtifact(temporaryRoot, blocked);
    assert.deepEqual(JSON.parse(fs.readFileSync(filePath, 'utf8')), blocked);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }

  assert.deepEqual(
    collectCrossBatchConflicts(
      [{ identityKey: 'zh|/deploy/example', authorityId: 'week05-1' }],
      [{ identityKey: 'zh|/deploy/example', authorityId: 'week06-1' }]
    ),
    [
      {
        identityKey: 'zh|/deploy/example',
        W5: 'week05-1',
        W6: 'week06-1'
      }
    ]
  );
});

test('source-root arguments share one parser and require a complete pair', () => {
  const roots = ['--w5-source-root', '/tmp/week05', '--w6-source-root', '/tmp/week06'];
  assert.deepEqual(parseVerifyArgs(roots), {
    w5SourceRoot: '/tmp/week05',
    w6SourceRoot: '/tmp/week06'
  });
  assert.deepEqual(parseGenerateArgs(['--check', ...roots]), {
    mode: 'check',
    w5SourceRoot: '/tmp/week05',
    w6SourceRoot: '/tmp/week06'
  });
  assert.throws(() => parseVerifyArgs(roots.slice(0, 2)), /provided together/);
  assert.throws(() => parseVerifyArgs(['--w5-source-root', '--check']), /requires a directory/);
});
