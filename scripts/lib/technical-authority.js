#!/usr/bin/env node

/**
 * Validate cumulative technical-content decisions and keep a small projection seam for waves.
 * Governance records stay outside reader-facing Markdown and public registry data.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const AUTHORITY_RELATIVE_PATH = 'src/content/tech-center/authority/week05-authority.json';
const TRACER_RELATIVE_PATH = 'scripts/fixtures/technical-authority/week05-tracer.json';
const HISTORICAL_MANIFEST = 'src/content/tech-center/authority/import-manifest.json';
const HISTORICAL_LEDGER = 'src/content/tech-center/authority/decision-ledger.json';
const PUBLIC_TECHNICAL_PAGE_COUNT = 1122;
const CANDIDATE_STATES = new Set(['accepted', 'denied', 'needs-evidence', 'deferred']);
const FINAL_STATES = new Set(['accepted', 'denied']);
const SECURITY_STATES = new Set([
  'clear',
  'redacted-secret',
  'approved-synthetic-placeholder',
  'needs-review'
]);
const RISK_LEVELS = new Set(['none', 'D0', 'D1', 'D2']);

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function fileSha256(filePath) {
  return sha256(fs.readFileSync(filePath));
}

function fold(value) {
  return String(value).normalize('NFKC').toUpperCase().toLowerCase();
}

function identityKey(identity) {
  return `${fold(identity.locale)}|${fold(identity.canonicalPath)}`;
}

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function assertArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
}

function assertText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be non-empty text`);
}

function assertDigest(value, label) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`${label} must be a SHA-256 digest`);
  }
}

function assertCount(value, label) {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer`);
}

function assertHttps(value, label) {
  assertText(value, label);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be an absolute HTTPS URL`);
  }
  if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) {
    throw new Error(`${label} must be a public HTTPS URL`);
  }
}

function validateIdentity(identity, label) {
  assertObject(identity, label);
  if (Object.keys(identity).sort().join(',') !== 'canonicalPath,locale') {
    throw new Error(`${label} must contain locale and canonicalPath`);
  }
  assertText(identity.locale, `${label}.locale`);
  assertText(identity.canonicalPath, `${label}.canonicalPath`);
  if (
    identity.locale !== fold(identity.locale) ||
    identity.canonicalPath !== identity.canonicalPath.normalize('NFKC') ||
    identity.canonicalPath !== identity.canonicalPath.toLowerCase() ||
    !identity.canonicalPath.startsWith('/') ||
    identity.canonicalPath.includes('?') ||
    identity.canonicalPath.includes('#') ||
    identity.canonicalPath.includes('..')
  ) {
    throw new Error(`${label} must use a normalized lowercase route identity`);
  }
}

function validateEvidence(evidence, label) {
  assertObject(evidence, label);
  assertText(evidence.status, `${label}.status`);
  if (!['verified', 'needs-evidence'].includes(evidence.status)) {
    throw new Error(`${label}.status is unsupported`);
  }
  assertArray(evidence.sources, `${label}.sources`);
  if (evidence.status === 'verified' && evidence.sources.length < 1) {
    throw new Error(`${label} verified records require a source`);
  }
  evidence.sources.forEach((source, index) => assertHttps(source, `${label}.sources[${index}]`));
  assertText(evidence.fingerprint, `${label}.fingerprint`);
  if (
    /\bsk-[A-Za-z0-9][A-Za-z0-9_-]{5,}\b/i.test(evidence.fingerprint) ||
    /\bBearer\s+(?!\[REDACTED_CREDENTIAL\])[A-Za-z0-9._~+/=-]{6,}/i.test(evidence.fingerprint) ||
    /\beyJ[A-Za-z0-9._-]{20,}\b/.test(evidence.fingerprint)
  ) {
    throw new Error(`${label}.fingerprint contains a credential-shaped value`);
  }
  assertText(evidence.applicability, `${label}.applicability`);
}

function validateSecurity(security, label) {
  assertObject(security, label);
  if (!SECURITY_STATES.has(security.status)) throw new Error(`${label}.status is unsupported`);
  assertArray(security.findings, `${label}.findings`);
  security.findings.forEach((finding, index) => {
    assertObject(finding, `${label}.findings[${index}]`);
    assertText(finding.kind, `${label}.findings[${index}].kind`);
    assertText(finding.disposition, `${label}.findings[${index}].disposition`);
    if (Object.prototype.hasOwnProperty.call(finding, 'value')) {
      throw new Error(`${label}.findings[${index}] must not retain credential-shaped values`);
    }
  });
  if (security.status === 'needs-review' && security.findings.length === 0) {
    throw new Error(`${label} needs-review records require a finding`);
  }
}

function validateOperationRisk(risk, label) {
  assertObject(risk, label);
  if (!RISK_LEVELS.has(risk.level)) throw new Error(`${label}.level is unsupported`);
  for (const field of ['warning', 'prerequisite', 'rollback', 'decision']) {
    assertText(risk[field], `${label}.${field}`);
  }
  if (risk.level === 'D0' && risk.decision !== 'denied') {
    throw new Error(`${label} D0 records require a denial decision`);
  }
  if (risk.level === 'D1' || risk.level === 'D2') {
    if (risk.warning.length < 8 || risk.prerequisite.length < 8 || risk.rollback.length < 8) {
      throw new Error(`${label} ${risk.level} records require actionable safeguards`);
    }
  }
}

function validateProvenance(provenance, label) {
  assertObject(provenance, label);
  assertText(provenance.workbook, `${label}.workbook`);
  assertDigest(provenance.workbookSha256, `${label}.workbookSha256`);
  assertCount(provenance.workbookRow, `${label}.workbookRow`);
  assertText(provenance.sourceFile, `${label}.sourceFile`);
  assertHttps(provenance.sourceUrl, `${label}.sourceUrl`);
  assertDigest(provenance.sourceSha256, `${label}.sourceSha256`);
  assertDigest(provenance.bodySha256, `${label}.bodySha256`);
}

function validateDecision(decision, state, label) {
  if (FINAL_STATES.has(state)) {
    assertObject(decision, label);
    if (decision.disposition !== state) throw new Error(`${label}.disposition must match ${state}`);
    assertText(decision.reason, `${label}.reason`);
    if (state === 'accepted') {
      if (!['add', 'update'].includes(decision.operation)) {
        throw new Error(`${label}.operation must be add or update`);
      }
    }
  } else if (decision !== null) {
    throw new Error(`${label} must remain null for temporary states`);
  }
}

function validateRelations(relations, label) {
  assertArray(relations, label);
  const relationKeys = new Set();
  relations.forEach((relation, index) => {
    assertObject(relation, `${label}[${index}]`);
    assertText(relation.id, `${label}[${index}].id`);
    assertText(relation.resolution, `${label}[${index}].resolution`);
    assertArray(relation.relatedCandidateIds, `${label}[${index}].relatedCandidateIds`);
    if (relation.relatedCandidateIds.length < 2) {
      throw new Error(`${label}[${index}] must relate at least two candidates`);
    }
    const relationKey = [...new Set(relation.relatedCandidateIds)].sort().join('|');
    if (relationKey.split('|').length !== relation.relatedCandidateIds.length) {
      throw new Error(`${label}[${index}] contains a duplicate candidate relation`);
    }
    if (relationKeys.has(relationKey)) throw new Error(`${label}[${index}] duplicates a relation group`);
    relationKeys.add(relationKey);
    assertText(relation.evidence, `${label}[${index}].evidence`);
    if (!/https:\/\/[^\s]+/i.test(relation.evidence)) {
      throw new Error(`${label}[${index}].evidence must cite a public HTTPS source`);
    }
  });
}

function validateCandidate(candidate, index) {
  const label = `candidate[${index}]`;
  assertObject(candidate, label);
  for (const field of [
    'id',
    'identity',
    'provenance',
    'evidence',
    'security',
    'operationRisk',
    'relations',
    'state',
    'decision'
  ]) {
    if (!Object.prototype.hasOwnProperty.call(candidate, field)) {
      throw new Error(`${label} is missing ${field}`);
    }
  }
  assertText(candidate.id, `${label}.id`);
  validateIdentity(candidate.identity, `${label}.identity`);
  validateProvenance(candidate.provenance, `${label}.provenance`);
  validateEvidence(candidate.evidence, `${label}.evidence`);
  validateSecurity(candidate.security, `${label}.security`);
  validateOperationRisk(candidate.operationRisk, `${label}.operationRisk`);
  validateRelations(candidate.relations, `${label}.relations`);
  if (!CANDIDATE_STATES.has(candidate.state)) throw new Error(`${label}.state is unsupported`);
  validateDecision(candidate.decision, candidate.state, `${label}.decision`);
}

function buildCountInvariant({ baselinePageCount = PUBLIC_TECHNICAL_PAGE_COUNT, accepted, denied }) {
  assertCount(baselinePageCount, 'baselinePageCount');
  assertArray(accepted, 'accepted');
  assertArray(denied, 'denied');
  const operations = accepted.reduce(
    (counts, candidate, index) => {
      if (candidate.state !== 'accepted' || candidate.decision?.disposition !== 'accepted') {
        throw new Error(`accepted[${index}] is not a final accepted decision`);
      }
      const operation = candidate.decision.operation;
      if (!['add', 'update'].includes(operation)) throw new Error(`accepted[${index}] has no operation`);
      counts[operation] += 1;
      return counts;
    },
    { add: 0, update: 0 }
  );
  denied.forEach((candidate, index) => {
    if (candidate.state !== 'denied' || candidate.decision?.disposition !== 'denied') {
      throw new Error(`denied[${index}] is not a final denied decision`);
    }
  });
  if (accepted.length + denied.length < 1) throw new Error('Final decision set is empty');
  return {
    accepted: accepted.length,
    denied: denied.length,
    add: operations.add,
    update: operations.update,
    resultingPageCount: baselinePageCount + operations.add
  };
}

function getTemporaryCandidates(authority) {
  return authority.candidates.filter((candidate) =>
    ['needs-evidence', 'deferred'].includes(candidate.state)
  );
}

function validateHistory(authority, repoRoot) {
  const history = authority.history;
  assertObject(history, 'history');
  for (const field of ['accepted', 'denied', 'add', 'update', 'pageCount']) {
    assertCount(history[field], `history.${field}`);
  }
  if (history.accepted !== 454 || history.denied !== 6 || history.add !== 450 || history.update !== 4) {
    throw new Error('Historical technical authority count drift');
  }
  if (history.pageCount !== PUBLIC_TECHNICAL_PAGE_COUNT) {
    throw new Error(`Historical technical page count drift: expected ${PUBLIC_TECHNICAL_PAGE_COUNT}`);
  }
  assertText(history.manifestPath, 'history.manifestPath');
  assertText(history.ledgerPath, 'history.ledgerPath');
  assertDigest(history.manifestSha256, 'history.manifestSha256');
  assertDigest(history.ledgerSha256, 'history.ledgerSha256');
  assertDigest(history.acceptedDigest, 'history.acceptedDigest');
  assertDigest(history.deniedDigest, 'history.deniedDigest');
  if (!repoRoot) return history;
  const manifestPath = path.join(repoRoot, history.manifestPath);
  const ledgerPath = path.join(repoRoot, history.ledgerPath);
  if (!fs.existsSync(manifestPath) || !fs.existsSync(ledgerPath)) {
    throw new Error('Historical technical authority source files are missing');
  }
  if (fileSha256(manifestPath) !== history.manifestSha256) {
    throw new Error('Historical import manifest changed after Week05 authority capture');
  }
  if (fileSha256(ledgerPath) !== history.ledgerSha256) {
    throw new Error('Historical decision ledger changed after Week05 authority capture');
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
  if (manifest.source?.acceptedCount !== 454 || manifest.source?.deniedCount !== 6) {
    throw new Error('Historical import manifest decision counts changed');
  }
  const operationCounts = manifest.pages.reduce(
    (counts, page) => ({ ...counts, [page.operation]: counts[page.operation] + 1 }),
    { add: 0, update: 0 }
  );
  if (operationCounts.add !== 450 || operationCounts.update !== 4 || ledger.denials?.length !== 6) {
    throw new Error('Historical technical authority decisions changed');
  }
  const acceptedDigest = sha256(
    stableJson(
      manifest.pages.map((page) => ({ identity: page.identity, operation: page.operation }))
    )
  );
  const deniedDigest = sha256(stableJson(ledger.denials.map((denial) => denial.identity)));
  if (acceptedDigest !== history.acceptedDigest || deniedDigest !== history.deniedDigest) {
    throw new Error('Historical technical authority identity set changed');
  }
  return history;
}

function validateTechnicalAuthority(authority, { repoRoot, verifyHistory = false } = {}) {
  assertObject(authority, 'technical authority');
  if (authority.schemaVersion !== 1) throw new Error('Unsupported technical authority schema version');
  assertObject(authority.batch, 'batch');
  if (authority.batch.id !== 'week05') throw new Error('Technical authority batch must be week05');
  if (!['open', 'closed'].includes(authority.batch.status)) {
    throw new Error('Technical authority batch status is unsupported');
  }
  assertCount(authority.batch.candidateCount, 'batch.candidateCount');
  if (authority.batch.candidateCount !== 888) throw new Error('Week05 candidate count must equal 888');
  assertArray(authority.candidates, 'candidates');
  if (authority.candidates.length !== authority.batch.candidateCount) {
    throw new Error('Technical authority candidate count drift');
  }
  const candidateIds = new Set();
  const identities = new Set();
  const candidatesById = new Map();
  authority.candidates.forEach((candidate, index) => {
    validateCandidate(candidate, index);
    if (candidateIds.has(candidate.id)) throw new Error(`Duplicate candidate id ${candidate.id}`);
    candidateIds.add(candidate.id);
    const key = identityKey(candidate.identity);
    if (identities.has(key)) throw new Error(`Technical identity collision for ${key}`);
    identities.add(key);
    candidatesById.set(candidate.id, candidate);
  });

  assertArray(authority.relations, 'relations');
  validateRelations(authority.relations, 'relations');
  authority.relations.forEach((relation) => {
    relation.relatedCandidateIds.forEach((candidateId) => {
      if (!candidateIds.has(candidateId)) throw new Error(`Unknown relation candidate ${candidateId}`);
      const candidate = candidatesById.get(candidateId);
      if (!candidate.relations.some((entry) => entry.id === relation.id)) {
        throw new Error(`Candidate relation ${relation.id} is missing from ${candidateId}`);
      }
    });
  });
  const relationIds = new Set(authority.relations.map((relation) => relation.id));
  authority.candidates.forEach((candidate) =>
    candidate.relations.forEach((relation) => {
      if (!relationIds.has(relation.id)) throw new Error(`Unknown candidate relation ${relation.id}`);
      if (!relation.relatedCandidateIds.includes(candidate.id)) {
        throw new Error(`Candidate relation ${relation.id} omits ${candidate.id}`);
      }
    })
  );

  assertArray(authority.identityConflicts, 'identityConflicts');
  authority.identityConflicts.forEach((conflict, index) => {
    const label = `identityConflicts[${index}]`;
    assertObject(conflict, label);
    assertText(conflict.id, `${label}.id`);
    assertText(conflict.candidateId, `${label}.candidateId`);
    if (!candidateIds.has(conflict.candidateId)) {
      throw new Error(`${label}.candidateId references an unknown candidate`);
    }
    validateIdentity(conflict.existingIdentity, `${label}.existingIdentity`);
    if (identityKey(conflict.existingIdentity) !== identityKey(candidatesById.get(conflict.candidateId).identity)) {
      throw new Error(`${label}.existingIdentity does not match the candidate identity`);
    }
    if (conflict.resolution !== 'denied') {
      throw new Error(`${label}.resolution must be denied for an identity collision`);
    }
    const candidate = candidatesById.get(conflict.candidateId);
    if (candidate.state !== 'denied' || candidate.decision?.disposition !== 'denied') {
      throw new Error(`${label}.candidateId must have a final denied decision`);
    }
  });

  assertObject(authority.final, 'final');
  assertArray(authority.final.accepted, 'final.accepted');
  assertArray(authority.final.denied, 'final.denied');
  assertObject(authority.temporary, 'temporary');
  assertArray(authority.temporary.needsEvidence, 'temporary.needsEvidence');
  assertArray(authority.temporary.deferred, 'temporary.deferred');
  const stateLists = [
    ['accepted', authority.final.accepted],
    ['denied', authority.final.denied],
    ['needs-evidence', authority.temporary.needsEvidence],
    ['deferred', authority.temporary.deferred]
  ];
  const listed = new Set();
  for (const [state, ids] of stateLists) {
    ids.forEach((candidateId) => {
      if (!candidateIds.has(candidateId)) throw new Error(`Unknown ${state} candidate ${candidateId}`);
      if (listed.has(candidateId)) throw new Error(`Candidate appears in multiple state lists: ${candidateId}`);
      listed.add(candidateId);
      const candidate = candidatesById.get(candidateId);
      if (candidate.state !== state) throw new Error(`Candidate state list drift for ${candidateId}`);
    });
  }
  if (listed.size !== authority.candidates.length) throw new Error('Authority state lists are incomplete');
  if (authority.batch.status === 'closed' && getTemporaryCandidates(authority).length) {
    throw new Error('Technical authority cannot close while temporary states remain');
  }
  if (authority.batch.status === 'closed' && listed.size !== authority.batch.candidateCount) {
    throw new Error('Closed technical authority has an incomplete final decision set');
  }
  const count = buildCountInvariant({
    baselinePageCount: PUBLIC_TECHNICAL_PAGE_COUNT,
    accepted: authority.final.accepted.map((id) => candidatesById.get(id)),
    denied: authority.final.denied.map((id) => candidatesById.get(id))
  });
  if (
    authority.counts.accepted !== count.accepted ||
    authority.counts.denied !== count.denied ||
    authority.counts.add !== count.add ||
    authority.counts.update !== count.update ||
    authority.counts.resultingPageCount !== count.resultingPageCount
  ) {
    throw new Error('Technical authority count invariant drift');
  }
  assertObject(authority.projection, 'projection');
  if (authority.projection.mode !== 'dry-run') throw new Error('Week05 projection must remain a dry run');
  if (authority.projection.publicPageDelta !== 0) throw new Error('Week05 dry run must publish zero pages');
  if (authority.projection.resultingPageCount !== count.resultingPageCount) {
    throw new Error('Technical authority projection count drift');
  }
  if (verifyHistory) validateHistory(authority, repoRoot);
  return {
    candidates: authority.candidates.length,
    accepted: count.accepted,
    denied: count.denied,
    needsEvidence: authority.temporary.needsEvidence.length,
    deferred: authority.temporary.deferred.length,
    temporary: getTemporaryCandidates(authority).length,
    history: authority.history,
    count
  };
}

function closeAuthority(authority, options = {}) {
  const result = validateTechnicalAuthority(authority, options);
  const temporary = getTemporaryCandidates(authority);
  if (temporary.length) {
    throw new Error(`Technical authority cannot close with ${temporary.length} temporary candidates`);
  }
  if (authority.batch.status !== 'closed') throw new Error('Technical authority closure requires closed batch status');
  return result.count;
}

function candidateForTracer(authority, tracer) {
  assertObject(tracer, 'tracer');
  assertText(tracer.candidateId, 'tracer.candidateId');
  const candidate = authority.candidates.find((entry) => entry.id === tracer.candidateId);
  if (!candidate) throw new Error(`Tracer candidate is unknown: ${tracer.candidateId}`);
  if (candidate.state !== 'accepted' || candidate.decision?.disposition !== 'accepted') {
    throw new Error('Tracer candidate must be final accepted');
  }
  return candidate;
}

function projectTracer(authority, tracer) {
  validateTechnicalAuthority(authority);
  const candidate = candidateForTracer(authority, tracer);
  const key = identityKey(candidate.identity);
  const publicPath = candidate.identity.canonicalPath;
  const slug = `/${candidate.identity.locale}${publicPath}`;
  const title = tracer.title || candidate.identity.canonicalPath.split('/').pop();
  const canonical = `${tracer.canonicalHost || 'https://fastgpt.cn'}${publicPath}`;
  const identity = {
    key,
    candidateId: candidate.id,
    locale: candidate.identity.locale,
    canonicalPath: publicPath,
    slug,
    canonical
  };
  const registryEntry = {
    identity: key,
    title,
    slug,
    category: publicPath.split('/')[1],
    sourceType: 'GitHub issue',
    summary: tracer.summary || title,
    minutes: 1
  };
  const searchEntry = {
    identity: key,
    title,
    description: registryEntry.summary,
    category: registryEntry.category,
    locale: candidate.identity.locale,
    publicPath,
    sourceType: registryEntry.sourceType,
    minutes: 1
  };
  const projection = {
    schemaVersion: 1,
    atomic: true,
    mode: 'dry-run',
    identities: [identity],
    registry: [registryEntry],
    search: [searchEntry],
    sitemap: [{ identity: key, url: canonical }],
    staticExport: [{ identity: key, path: publicPath, canonical, status: 200 }],
    releaseRecord: [{ candidateId: candidate.id, identity: key, status: 'source-verified' }],
    rollback: [{ candidateId: candidate.id, identity: key, baselinePageCount: PUBLIC_TECHNICAL_PAGE_COUNT }]
  };
  verifyAtomicProjection(projection);
  return projection;
}

function surfaceIdentitySet(surface, surfaceName) {
  assertArray(surface, surfaceName);
  return surface.map((entry, index) => {
    if (typeof entry === 'string') {
      const match = entry.match(/^https?:\/\/[^/]+(\/.*)$/);
      if (!match) throw new Error(`${surfaceName}[${index}] has no route identity`);
      return fold(match[1]);
    }
    assertObject(entry, `${surfaceName}[${index}]`);
    if (entry.identity) {
      if (typeof entry.identity === 'object') return identityKey(entry.identity);
      return fold(entry.identity);
    }
    if (entry.key) return fold(entry.key);
    if (entry.path) return fold(entry.path);
    throw new Error(`${surfaceName}[${index}] has no route identity`);
  });
}

function verifyAtomicProjection(projection) {
  assertObject(projection, 'projection');
  if (projection.atomic !== true) throw new Error('Projection must be marked atomic');
  const surfaces = [
    ['registry', surfaceIdentitySet(projection.registry, 'registry')],
    ['search', surfaceIdentitySet(projection.search, 'search')],
    ['sitemap', surfaceIdentitySet(projection.sitemap, 'sitemap')],
    ['staticExport', surfaceIdentitySet(projection.staticExport, 'staticExport')],
    ['releaseRecord', surfaceIdentitySet(projection.releaseRecord, 'releaseRecord')],
    ['rollback', surfaceIdentitySet(projection.rollback, 'rollback')]
  ];
  const expected = JSON.stringify([...new Set(surfaceIdentitySet(projection.identities, 'identities'))].sort());
  for (const [name, identities] of surfaces) {
    if (JSON.stringify([...new Set(identities)].sort()) !== expected) {
      throw new Error(`Atomic projection identity drift in ${name}`);
    }
  }
  return true;
}

function applyAtomicProjection({ files, contents, failAt } = {}) {
  assertArray(files, 'files');
  assertArray(contents, 'contents');
  if (files.length !== contents.length || !files.length) {
    throw new Error('Projection files and contents must have the same non-empty length');
  }
  const before = files.map((filePath) => (fs.existsSync(filePath) ? fs.readFileSync(filePath) : null));
  try {
    files.forEach((filePath, index) => {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, contents[index]);
      if (failAt === index + 1) throw new Error(`Projection failure at surface ${index + 1}`);
    });
  } catch (error) {
    files.forEach((filePath, index) => {
      if (before[index] === null) fs.rmSync(filePath, { force: true });
      else fs.writeFileSync(filePath, before[index]);
    });
    throw error;
  }
}

function loadTechnicalAuthority(repoRoot = path.resolve(__dirname, '../..')) {
  const filePath = path.join(repoRoot, AUTHORITY_RELATIVE_PATH);
  if (!fs.existsSync(filePath)) throw new Error(`Technical authority is missing: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadTracer(repoRoot = path.resolve(__dirname, '../..')) {
  const filePath = path.join(repoRoot, TRACER_RELATIVE_PATH);
  if (!fs.existsSync(filePath)) throw new Error(`Technical tracer is missing: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

module.exports = {
  AUTHORITY_RELATIVE_PATH,
  HISTORICAL_LEDGER,
  HISTORICAL_MANIFEST,
  PUBLIC_TECHNICAL_PAGE_COUNT,
  applyAtomicProjection,
  buildCountInvariant,
  closeAuthority,
  fileSha256,
  getTemporaryCandidates,
  identityKey,
  loadTechnicalAuthority,
  loadTracer,
  projectTracer,
  sha256,
  stableJson,
  validateTechnicalAuthority,
  verifyAtomicProjection
};
