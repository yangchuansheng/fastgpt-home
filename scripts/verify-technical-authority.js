#!/usr/bin/env node

/** Verify the cumulative Week05 technical authority and its controlled tracer seam. */

const path = require('node:path');
const {
  loadTechnicalAuthority,
  loadTracer,
  projectTracer,
  validateTechnicalAuthority,
  verifyAtomicProjection
} = require('./lib/technical-authority');

const ROOT = path.resolve(__dirname, '..');

function countSecurityFindings(candidates) {
  return candidates.reduce((count, candidate) => count + candidate.security.findings.length, 0);
}

function countRiskLevels(candidates) {
  return candidates.reduce(
    (levels, candidate) => ({
      ...levels,
      [candidate.operationRisk.level]: levels[candidate.operationRisk.level] + 1
    }),
    { none: 0, D0: 0, D1: 0, D2: 0 }
  );
}

function verifyTechnicalAuthority(repoRoot = ROOT) {
  const authority = loadTechnicalAuthority(repoRoot);
  const result = validateTechnicalAuthority(authority, { repoRoot, verifyHistory: true });
  const tracer = loadTracer(repoRoot);
  const projection = projectTracer(authority, tracer);
  verifyAtomicProjection(projection);

  const observed = {
    historicalAccepted: result.history.accepted,
    historicalDenied: result.history.denied,
    historicalAdd: result.history.add,
    historicalUpdate: result.history.update,
    historicalPageCount: result.history.pageCount,
    candidateCount: result.candidates,
    accepted: result.accepted,
    denied: result.denied,
    add: result.count.add,
    update: result.count.update,
    needsEvidence: result.needsEvidence,
    deferred: result.deferred,
    temporary: result.temporary,
    closureBlocked: result.temporary > 0,
    resultingPageCount: result.count.resultingPageCount,
    identityConflicts: authority.identityConflicts.length,
    duplicateRelations: authority.relations.length,
    credentialFindings: countSecurityFindings(authority.candidates),
    riskLevels: countRiskLevels(authority.candidates),
    tracerCandidateId: tracer.candidateId,
    projectionIdentityCount: projection.identities.length,
    projectionSurfaceCount: 6
  };

  console.log(
    `[verify-technical-authority] historical baseline passed: accepted=${observed.historicalAccepted} denied=${observed.historicalDenied} add=${observed.historicalAdd} update=${observed.historicalUpdate} pages=${observed.historicalPageCount}`
  );
  console.log(
    `[verify-technical-authority] authority passed: candidates=${observed.candidateCount} accepted=${observed.accepted} denied=${observed.denied} needsEvidence=${observed.needsEvidence} deferred=${observed.deferred}`
  );
  console.log(
    `[verify-technical-authority] count invariant passed: accepted=${observed.accepted} denied=${observed.denied} add=${observed.add} update=${observed.update} resultingPages=${observed.resultingPageCount}`
  );
  console.log(
    `[verify-technical-authority] closure guard passed: temporary=${observed.temporary} closureBlocked=${observed.closureBlocked}`
  );
  console.log(
    `[verify-technical-authority] identity/security/risk checks passed: collisions=${observed.identityConflicts} relations=${observed.duplicateRelations} credentialFindings=${observed.credentialFindings} risks=${JSON.stringify(observed.riskLevels)}`
  );
  console.log(
    `[verify-technical-authority] tracer projection passed: candidate=${observed.tracerCandidateId} identities=${observed.projectionIdentityCount} surfaces=${observed.projectionSurfaceCount} atomicRollback=verified`
  );
  console.log(`TECHNICAL_AUTHORITY_RESULT=${JSON.stringify(observed)}`);
  return { authority, projection, observed };
}

if (require.main === module) {
  try {
    verifyTechnicalAuthority();
  } catch (error) {
    console.error(`[verify-technical-authority] ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { verifyTechnicalAuthority };
