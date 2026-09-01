const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { identityKey, stableJson } = require('./technical-authority');

const BASELINE_RELATIVE_PATH = 'src/content/tech-center/authority/week05-wave1-baseline.json';
const BASELINE_ROLLBACK_RELATIVE_PATH =
  'src/content/tech-center/authority/week05-wave1-rollback.json';
const WAVE_HISTORY = [
  {
    id: 'week05-wave1',
    projection: 'src/content/tech-center/authority/week05-wave1-projection.json',
    release: 'src/content/tech-center/authority/week05-wave1-release-manifest.json'
  },
  {
    id: 'week05-wave2',
    projection: 'src/content/tech-center/authority/week05-wave2-projection.json',
    release: 'src/content/tech-center/authority/week05-wave2-release-manifest.json'
  },
  {
    id: 'week06-wave1',
    projection: 'src/content/tech-center/authority/week06-wave1-projection.json',
    release: 'src/content/tech-center/authority/week06-wave1-release-manifest.json'
  }
];
const WAVE2_SELECTION_RELATIVE_PATH =
  'src/content/tech-center/authority/week05-wave2-selection.json';
const WEEK06_WAVE1_SELECTION_RELATIVE_PATH =
  'src/content/tech-center/authority/week06-wave1-selection.json';

function readJson(repoRoot, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

function digest(value) {
  return crypto.createHash('sha256').update(stableJson(value)).digest('hex');
}

function parseEntryIdentity(entry) {
  const match = entry?.slug?.match(/^\/([^/]+)(\/.*)$/);
  if (!match) throw new Error(`Invalid Technical Page slug: ${entry?.slug}`);
  return { locale: match[1], canonicalPath: match[2] };
}

function assertUniqueIdentities(entries, label, getKey) {
  const keys = entries.map(getKey);
  if (new Set(keys).size !== keys.length) {
    throw new Error(`${label} contains duplicate identities`);
  }
  return new Set(keys);
}

function loadBaselineSnapshot(repoRoot) {
  const snapshot = readJson(repoRoot, BASELINE_RELATIVE_PATH);
  if (
    snapshot.schemaVersion !== 1 ||
    snapshot.batch !== 'week05' ||
    snapshot.wave !== 'wave-1-baseline' ||
    snapshot.pageCount !== 1122 ||
    !Array.isArray(snapshot.entries) ||
    !Array.isArray(snapshot.search?.zh) ||
    !Array.isArray(snapshot.search?.en)
  ) {
    throw new Error('Technical wave baseline snapshot header changed');
  }
  const combinedSearch = [...snapshot.search.zh, ...snapshot.search.en];
  const rollback = readJson(repoRoot, BASELINE_ROLLBACK_RELATIVE_PATH);
  if (
    snapshot.entries.length !== snapshot.pageCount ||
    combinedSearch.length !== snapshot.pageCount ||
    digest(snapshot.entries) !== snapshot.registrySha256 ||
    digest(snapshot.search.zh) !== snapshot.searchSha256?.zh ||
    digest(snapshot.search.en) !== snapshot.searchSha256?.en ||
    digest(combinedSearch) !== snapshot.searchSha256?.combined ||
    rollback.baselinePageCount !== snapshot.pageCount ||
    rollback.priorCompleteState?.registrySha256 !== snapshot.registrySha256 ||
    rollback.priorCompleteState?.searchSha256 !== snapshot.searchSha256.combined
  ) {
    throw new Error('Technical wave baseline snapshot digest changed');
  }
  assertUniqueIdentities(snapshot.entries, 'Technical wave baseline registry', (entry) =>
    identityKey(parseEntryIdentity(entry))
  );
  assertUniqueIdentities(
    combinedSearch,
    'Technical wave baseline search',
    (entry) => entry.identity
  );
  return {
    entries: [...snapshot.entries],
    search: { zh: [...snapshot.search.zh], en: [...snapshot.search.en] }
  };
}

function verifyWaveArtifacts(state, wave, projection, release) {
  const artifacts = new Map((release.artifacts || []).map((artifact) => [artifact.path, artifact]));
  const checks = [
    ['src/components/tech-center/entries.json', state.entries],
    ['public/tech-center/search-index.json', state.search.zh],
    ['public/tech-center/search-index.en.json', state.search.en]
  ];
  for (const [relativePath, value] of checks) {
    const artifact = artifacts.get(relativePath);
    if (!artifact && (relativePath !== 'public/tech-center/search-index.en.json' || value.length)) {
      throw new Error(`${wave.id} ${relativePath} artifact is missing`);
    }
    if (artifact && artifact.sha256 !== digest(value)) {
      throw new Error(`${wave.id} ${relativePath} digest changed`);
    }
  }
  if (
    projection.resultingPageCount !== state.entries.length ||
    release.resultingPageCount !== state.entries.length
  ) {
    throw new Error(`${wave.id} page count changed`);
  }
}

function applyWave(state, repoRoot, wave) {
  const projection = readJson(repoRoot, wave.projection);
  const release = readJson(repoRoot, wave.release);
  if (
    projection.acceptedUpdate !== 0 ||
    projection.acceptedAdd !== projection.registry?.length ||
    projection.registry.length !== projection.search?.length ||
    projection.baselinePageCount !== state.entries.length
  ) {
    throw new Error(`${wave.id} cannot be replayed as an append-only projection`);
  }
  const existingRegistry = assertUniqueIdentities(
    state.entries,
    `${wave.id} baseline registry`,
    (entry) => identityKey(parseEntryIdentity(entry))
  );
  const existingSearch = assertUniqueIdentities(
    [...state.search.zh, ...state.search.en],
    `${wave.id} baseline search`,
    (entry) => entry.identity
  );
  for (const entry of projection.registry) {
    const key = identityKey(parseEntryIdentity(entry));
    if (entry.identity !== key || existingRegistry.has(key)) {
      throw new Error(`${wave.id} registry identity changed: ${entry.identity}`);
    }
    const { identity, ...publishedEntry } = entry;
    state.entries.push(publishedEntry);
    existingRegistry.add(identity);
  }
  for (const entry of projection.search) {
    if (!['zh', 'en'].includes(entry.locale) || existingSearch.has(entry.identity)) {
      throw new Error(`${wave.id} search identity changed: ${entry.identity}`);
    }
    state.search[entry.locale].push(entry);
    existingSearch.add(entry.identity);
  }
  verifyWaveArtifacts(state, wave, projection, release);
  return state;
}

function loadTechnicalWaveState(repoRoot, throughWave = 'week06-wave1') {
  const targetIndex = WAVE_HISTORY.findIndex(({ id }) => id === throughWave);
  if (throughWave !== 'week05-wave0' && targetIndex === -1) {
    throw new Error(`Unknown Technical wave state: ${throughWave}`);
  }
  const state = loadBaselineSnapshot(repoRoot);
  for (const wave of WAVE_HISTORY.slice(0, targetIndex + 1)) applyWave(state, repoRoot, wave);
  return {
    entries: state.entries,
    search: [...state.search.zh, ...state.search.en],
    searchByLocale: state.search
  };
}

function projectionIdentityKeys(repoRoot, waveId) {
  const wave = WAVE_HISTORY.find(({ id }) => id === waveId);
  const projection = readJson(repoRoot, wave.projection);
  return new Set(projection.identities.map((identity) => identity.key));
}

function readWeek06Wave1IdentityKeys(repoRoot) {
  return projectionIdentityKeys(repoRoot, 'week06-wave1');
}

function readWave2IdentityKeys(repoRoot) {
  return projectionIdentityKeys(repoRoot, 'week05-wave2');
}

function filterWeek06Wave1Projection(repoRoot) {
  return {
    ...loadTechnicalWaveState(repoRoot, 'week05-wave2'),
    week06Wave1IdentityKeys: readWeek06Wave1IdentityKeys(repoRoot)
  };
}

function filterWave2Projection(repoRoot) {
  return {
    ...loadTechnicalWaveState(repoRoot, 'week05-wave1'),
    wave2IdentityKeys: readWave2IdentityKeys(repoRoot),
    week06Wave1IdentityKeys: readWeek06Wave1IdentityKeys(repoRoot)
  };
}

module.exports = {
  BASELINE_RELATIVE_PATH,
  BASELINE_ROLLBACK_RELATIVE_PATH,
  WEEK06_WAVE1_SELECTION_RELATIVE_PATH,
  WAVE2_SELECTION_RELATIVE_PATH,
  filterWeek06Wave1Projection,
  filterWave2Projection,
  loadBaselineSnapshot,
  loadTechnicalWaveState,
  readWeek06Wave1IdentityKeys,
  readWave2IdentityKeys
};
