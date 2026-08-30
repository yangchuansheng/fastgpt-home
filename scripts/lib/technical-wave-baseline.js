const fs = require('node:fs');
const path = require('node:path');
const { identityKey } = require('./technical-authority');

const WAVE2_SELECTION_RELATIVE_PATH =
  'src/content/tech-center/authority/week05-wave2-selection.json';
const WEEK06_WAVE1_SELECTION_RELATIVE_PATH =
  'src/content/tech-center/authority/week06-wave1-selection.json';

function readWeek06Wave1IdentityKeys(repoRoot) {
  const selectionPath = path.join(repoRoot, WEEK06_WAVE1_SELECTION_RELATIVE_PATH);
  if (!fs.existsSync(selectionPath)) return new Set();

  const selection = JSON.parse(fs.readFileSync(selectionPath, 'utf8'));
  if (
    selection.schemaVersion !== 1 ||
    selection.batch !== 'week06' ||
    selection.wave !== 'wave-1' ||
    selection.status !== 'approved' ||
    !Array.isArray(selection.identitySet) ||
    selection.identitySet.length !== 50 ||
    new Set(selection.identitySet).size !== selection.identitySet.length
  ) {
    throw new Error('Week06 Wave 1 selection cannot define the historical baseline');
  }
  return new Set(selection.identitySet);
}

function filterWeek06Wave1Projection(repoRoot, entries, search, parseEntryIdentity) {
  const week06Wave1IdentityKeys = readWeek06Wave1IdentityKeys(repoRoot);
  return {
    entries: entries.filter(
      (entry) => !week06Wave1IdentityKeys.has(identityKey(parseEntryIdentity(entry)))
    ),
    search: search.filter((entry) => !week06Wave1IdentityKeys.has(entry.identity)),
    week06Wave1IdentityKeys
  };
}

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
  const current = filterWeek06Wave1Projection(repoRoot, entries, search, parseEntryIdentity);
  const wave2IdentityKeys = readWave2IdentityKeys(repoRoot, authority);
  return {
    entries: current.entries.filter(
      (entry) => !wave2IdentityKeys.has(identityKey(parseEntryIdentity(entry)))
    ),
    search: current.search.filter((entry) => !wave2IdentityKeys.has(entry.identity)),
    wave2IdentityKeys,
    week06Wave1IdentityKeys: current.week06Wave1IdentityKeys
  };
}

module.exports = {
  WEEK06_WAVE1_SELECTION_RELATIVE_PATH,
  WAVE2_SELECTION_RELATIVE_PATH,
  filterWeek06Wave1Projection,
  filterWave2Projection,
  readWeek06Wave1IdentityKeys,
  readWave2IdentityKeys
};
