const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const {
  evaluateGuideAuthorization,
  evaluateReleaseGate,
  loadFixture,
  projectGuideEntries,
  verifyAuthorizationFixtures
} = require('./verify-guide-authorization');

const registry = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'src/content/guides/registry.json'), 'utf8')
);

test('complete authorization fixture publishes both finance pairs', () => {
  const fixture = loadFixture('complete');
  const result = verifyAuthorizationFixtures({ fixture });

  assert.equal(result.status, 'passed');
  assert.equal(result.complete.projectedEntries, 16);
  assert.deepEqual(result.complete.financeSlugs, [
    'finance-research-retrieval',
    'finance-daily-report-automation'
  ]);
  assert(result.complete.decisions.every((decision) => decision.status === 'publishable'));
});

test('missing authorization fixture blocks and excludes both finance pairs', () => {
  const fixture = loadFixture('missing');
  const result = verifyAuthorizationFixtures({ fixture });

  assert.equal(result.status, 'passed');
  assert.equal(result.missing.projectedEntries, 14);
  assert.deepEqual(result.missing.financeSlugs, []);
  assert.equal(result.missing.decisions.length, 2);
  assert(result.missing.decisions.every((decision) => decision.status === 'release-blocked'));
  assert.match(result.missing.decisions[0].blockers.join('\n'), /case|asset/i);
  assert.match(result.missing.decisions[0].blockers.join('\n'), /evidence/i);
});

test('invalid case or asset evidence produces a release blocker at the public seam', () => {
  const fixture = loadFixture('complete');
  const record = structuredClone(fixture.records['finance-research-retrieval']);
  record.requiredCases[0].evidence.status = 'missing';
  record.requiredAssets[0].evidence.digest = 'invalid';

  const decision = evaluateGuideAuthorization('finance-research-retrieval', record);
  assert.equal(decision.status, 'release-blocked');
  assert.equal(decision.eligible, false);
  assert.match(decision.blockers.join('\n'), /chaoyang-yongxu-research-retrieval/);
  assert.match(decision.blockers.join('\n'), /finance-research-workflow/);
});

test('projection accepts an explicit authority decision map', () => {
  const fixture = loadFixture('complete');
  const decisions = new Map(
    ['finance-research-retrieval', 'finance-daily-report-automation'].map((slug) => [
      slug,
      evaluateGuideAuthorization(slug, fixture.records[slug])
    ])
  );

  const projected = projectGuideEntries(registry.entries, decisions);
  assert.equal(projected.length, 16);
  assert(projected.some((entry) => entry.slug === 'finance-research-retrieval'));
  assert(projected.some((entry) => entry.slug === 'finance-daily-report-automation'));
});

test('G2 product and legal/compliance evidence remains fail-closed until both records are valid', () => {
  const slug = 'soe-policy-qa-deployment';
  const missing = evaluateReleaseGate(slug, null);
  assert.equal(missing.eligible, false);
  assert.match(missing.blockers.join('\n'), /classification is missing/);

  const pending = evaluateReleaseGate(slug, {
    group: 'G2',
    ownerApproval: { status: 'pending', reference: null, digest: null }
  });
  assert.equal(pending.eligible, false);
  assert.match(pending.blockers.join('\n'), /release approval product.*missing/i);

  const gate = require('../src/content/guides/release-gates.json').entries[slug];
  const invalid = structuredClone(gate);
  invalid.approvals.product.digest = '0'.repeat(64);
  const invalidDecision = evaluateReleaseGate(slug, invalid);
  assert.equal(invalidDecision.eligible, false);
  assert.match(invalidDecision.blockers.join('\n'), /product.*does not match/i);

  const valid = evaluateReleaseGate(slug, gate);
  assert.equal(valid.eligible, true);
  assert.equal(valid.status, 'publishable');
});

test('G2 product and legal/compliance evidence requires scope and an unexpired digest', () => {
  const slug = 'soe-policy-qa-deployment';
  const gate = require('../src/content/guides/release-gates.json').entries[slug];
  const valid = evaluateReleaseGate(slug, structuredClone(gate), { asOf: '2026-08-29' });
  assert.equal(valid.eligible, true);

  const expired = structuredClone(gate);
  expired.approvals.product.expiresOn = '2026-08-28';
  const expiredDecision = evaluateReleaseGate(slug, expired, { asOf: '2026-08-29' });
  assert.equal(expiredDecision.eligible, false);
  assert.match(expiredDecision.blockers.join('\n'), /product.*expired/i);

  const incomplete = structuredClone(gate);
  incomplete.approvals.legalCompliance.scope = ['soe-use'];
  const incompleteDecision = evaluateReleaseGate(slug, incomplete, { asOf: '2026-08-29' });
  assert.equal(incompleteDecision.eligible, false);
  assert.match(incompleteDecision.blockers.join('\n'), /legalCompliance.*incomplete/i);
});

test('expired G2 evidence excludes both localized owner pages from the public projection', () => {
  const slug = 'soe-policy-qa-deployment';
  const expiredGate = structuredClone(
    require('../src/content/guides/release-gates.json').entries[slug]
  );
  expiredGate.approvals.legalCompliance.expiresOn = '2026-08-28';
  const decision = evaluateReleaseGate(slug, expiredGate, { asOf: '2026-08-29' });
  const projected = projectGuideEntries(registry.entries, new Map([[slug, decision]]));

  assert.equal(decision.status, 'release-blocked');
  assert.equal(
    projected.some((entry) => entry.slug === slug),
    false
  );
  const ownerPages = registry.entries.find((entry) => entry.slug === slug);
  assert(ownerPages);
  assert.equal(
    projected.some((entry) => entry.zh.canonical === ownerPages.zh.canonical),
    false
  );
  assert.equal(
    projected.some((entry) => entry.en.canonical === ownerPages.en.canonical),
    false
  );
});
