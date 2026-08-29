const fs = require('node:fs');
const path = require('node:path');
const { identityKey } = require('./technical-authority');

const WAVE2_SELECTION_RELATIVE_PATH =
  'src/content/tech-center/authority/week05-wave2-selection.json';

function readWave2IdentityKeys(repoRoot, authority) {
  const selectionPath = path.join(repoRoot, WAVE2_SELECTION_RELATIVE_PATH);
  if (!fs.existsSync(selectionPath)) return new Set();

  const selection = JSON.parse(fs.readFileSync(selectionPath, 'utf8'));
  if (
    selection.schemaVersion !== 1 ||
    selection.batch !== 'week05' ||
    selection.wave !== 'wave-2' ||
    selection.status !== 'approved' ||
    !Array.isArray(selection.candidateIds)
  ) {
    throw new Error('Wave 2 selection cannot define the historical baseline');
  }

  const candidatesById = new Map(
    authority.candidates.map((candidate) => [candidate.id, candidate])
  );
  return new Set(
    selection.candidateIds.map((candidateId) => {
      const candidate = candidatesById.get(candidateId);
      if (!candidate) throw new Error(`Wave 2 baseline candidate is unknown: ${candidateId}`);
      return identityKey(candidate.identity);
    })
  );
}

function filterWave2Projection(repoRoot, authority, entries, search, parseEntryIdentity) {
  const wave2IdentityKeys = readWave2IdentityKeys(repoRoot, authority);
  return {
    entries: entries.filter(
      (entry) => !wave2IdentityKeys.has(identityKey(parseEntryIdentity(entry)))
    ),
    search: search.filter((entry) => !wave2IdentityKeys.has(entry.identity)),
    wave2IdentityKeys
  };
}

module.exports = {
  WAVE2_SELECTION_RELATIVE_PATH,
  filterWave2Projection,
  readWave2IdentityKeys
};
