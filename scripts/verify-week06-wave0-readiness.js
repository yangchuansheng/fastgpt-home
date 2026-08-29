#!/usr/bin/env node

/** Verify the bilingual Week06 Wave 0 release-readiness record. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { applyRollbackProjection } = require('./lib/technical-projection');
const {
  digestJson,
  directoryInventory,
  fileProvenance,
  sha256
} = require('./lib/release-readiness');
const {
  verifyWeek06EnglishTracer,
  writeTracerExportFixture: writeEnglishTracerExportFixture
} = require('./verify-week06-english-tracer');
const {
  verifyWeek06ModelGlossaryTracers,
  writeTracerExportFixture: writeModelGlossaryExportFixture
} = require('./verify-week06-model-glossary-tracers');
const { verifyWeek06TechnicalAuthority } = require('./verify-week06-technical-authority');

const ROOT = path.resolve(__dirname, '..');
const CONTRACT_PATH = path.join(
  ROOT,
  'scripts/fixtures/technical-authority/week06-wave0-readiness.json'
);
const PUBLIC_SURFACES = [
  'registry',
  'search',
  'sitemap',
  'staticExport',
  'internalLinks',
  'releaseRecord'
];

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Unable to read ${label}: ${error.message}`);
  }
}

function resolveArtifact(rootDir, relativePath) {
  const root = path.resolve(rootDir);
  const resolved = path.resolve(root, relativePath);
  assert(
    resolved.startsWith(`${root}${path.sep}`),
    `Readiness artifact escapes repository root: ${relativePath}`
  );
  return resolved;
}

function assertDigest(value, label) {
  assert.match(value, /^[a-f0-9]{64}$/, `${label} must be a SHA-256 digest`);
}

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

function loadReadinessContract(rootDir = ROOT, contractPath = CONTRACT_PATH) {
  const contract = readJson(contractPath, 'Week06 Wave 0 readiness contract');
  assert.equal(contract.schemaVersion, 1, 'readiness schema drift');
  assert.equal(contract.kind, 'week06-bilingual-technical-wave0-readiness');
  assert.equal(contract.issue, 265, 'readiness issue drift');
  assert.equal(contract.batch, 'week06', 'readiness batch drift');
  assert.equal(contract.wave, 'wave-0', 'readiness wave drift');
  assert.equal(contract.mode, 'dry-run', 'readiness mode drift');
  assert.deepEqual(
    contract.authority.unresolved,
    {
      identity: 0,
      duplicate: 0,
      evidence: 0,
      credential: 0,
      privacy: 0,
      operationRisk: 0,
      comparisonRouting: 0,
      hygiene: 0
    },
    'authority unresolved state drift'
  );
  assert.equal(
    contract.tracers.englishExistingCategory.command,
    'node scripts/verify-week06-english-tracer.js',
    'English tracer command drift'
  );
  assert.equal(
    contract.tracers.modelGlossary.command,
    'node scripts/verify-week06-model-glossary-tracers.js',
    'model/glossary tracer command drift'
  );
  for (const tracer of Object.values(contract.tracers)) {
    assert.equal(tracer.sourceVerified, true, 'tracer source verification drift');
    assert.equal(tracer.exportVerified, true, 'tracer export verification drift');
  }
  assert.equal(contract.capacityBaseline.status, 'recorded');
  assert.equal(contract.releaseManifest.status, 'source-verified');
  assert.equal(contract.releaseManifest.exportStatus, 'export-verified');
  assert.equal(contract.releaseManifest.governanceStatus, 'governance-complete');
  assert.equal(contract.releaseManifest.publicationCount, 0);
  assert.deepEqual(contract.releaseManifest.surfaces, PUBLIC_SURFACES);
  assert.deepEqual(Object.keys(contract.releaseManifest.surfaceEvidence), PUBLIC_SURFACES);
  const artifactPaths = contract.releaseManifest.artifacts.map((artifact) => artifact.path);
  const repositorySurfacePaths = Object.values(contract.releaseManifest.surfaceEvidence)
    .filter((evidence) => evidence.source === 'repository')
    .flatMap((evidence) => evidence.artifacts);
  assert.deepEqual(
    [...new Set(repositorySurfacePaths)].sort(),
    [...artifactPaths].sort(),
    'release repository surface mapping drift'
  );
  for (const surface of ['sitemap', 'staticExport', 'internalLinks']) {
    assert.deepEqual(contract.releaseManifest.surfaceEvidence[surface], {
      source: 'completed-tracer-export',
      baselineSurface: surface
    });
  }
  assert.deepEqual(contract.rollbackManifest.restoreSurfaces, PUBLIC_SURFACES);
  assert.equal(contract.rollbackManifest.status, 'ready');
  assert.deepEqual(
    contract.rollbackManifest.artifactPaths,
    artifactPaths,
    'rollback artifact mapping drift'
  );
  assert.equal(
    contract.rollbackManifest.exportSurfaceBaselineSha256,
    contract.releaseManifest.exportSurfaceBaseline.sha256,
    'rollback export surface baseline drift'
  );
  assert.deepEqual(contract.rollbackManifest.affectedIdentities, []);
  assert.equal(contract.rollbackManifest.strategy, contract.releaseManifest.writeStrategy);
  assert.equal(contract.rollbackManifest.baselineSha256, contract.releaseManifest.baselineSha256);
  assert(
    Object.values(contract.releaseManifest.publicPageDelta).every((value) => value === 0),
    'Wave 0 public-page delta must be zero'
  );
  return contract;
}

function verifyAuthorityClosure(rootDir, contract) {
  const authority = verifyWeek06TechnicalAuthority(rootDir);
  assert.deepEqual(authority.unresolved, contract.authority.unresolved, 'authority closure drift');
  assert.equal(
    authority.privacyScanSha256,
    contract.authority.privacyScan.sha256,
    'privacy scan digest drift'
  );
  assert.equal(
    sha256(fs.readFileSync(resolveArtifact(rootDir, contract.authority.privacyScan.path))),
    contract.authority.privacyScan.sha256,
    'privacy scan artifact drift'
  );

  const release = contract.authority.releaseManifest;
  assertDigest(release.sha256, 'authority release manifest digest');
  assert.equal(
    sha256(fs.readFileSync(resolveArtifact(rootDir, release.path))),
    release.sha256,
    'authority release manifest digest drift'
  );
}

function artifactEvidence(rootDir, artifacts) {
  return artifacts.map((expected) => {
    const observed = fileProvenance(resolveArtifact(rootDir, expected.path), { root: rootDir });
    const stable = { path: observed.path, bytes: observed.bytes, sha256: observed.sha256 };
    assert.deepEqual(stable, expected, `public baseline artifact drift: ${expected.path}`);
    return stable;
  });
}

function summarizeArtifacts(artifacts) {
  return {
    artifactCount: artifacts.length,
    bytes: artifacts.reduce((total, artifact) => total + artifact.bytes, 0),
    sha256: digestJson(artifacts)
  };
}

function loadExportSurfaceBaseline(rootDir, contract) {
  const reference = contract.releaseManifest.exportSurfaceBaseline;
  assertDigest(reference.sha256, 'export surface baseline digest');
  const baselinePath = resolveArtifact(rootDir, reference.path);
  assert.equal(
    sha256(fs.readFileSync(baselinePath)),
    reference.sha256,
    'export surface baseline artifact drift'
  );
  const baseline = readJson(baselinePath, 'completed tracer export surface baseline');
  assert.equal(baseline.schemaVersion, 1);
  assert.equal(baseline.kind, 'week06-wave0-completed-tracer-export-surfaces');
  assert.deepEqual(baseline.sourceCommands, [
    contract.tracers.englishExistingCategory.command,
    contract.tracers.modelGlossary.command
  ]);
  assert.equal(
    baseline.completedExportSha256,
    contract.capacityBaseline.completedTracerExport.sha256
  );
  assert.deepEqual(Object.keys(baseline.surfaces), ['sitemap', 'staticExport', 'internalLinks']);
  const paths = [];
  Object.values(baseline.surfaces).forEach((surface) => {
    assert.deepEqual(summarizeArtifacts(surface.artifacts), {
      artifactCount: surface.artifactCount,
      bytes: surface.bytes,
      sha256: surface.sha256
    });
    surface.artifacts.forEach((artifact) => {
      assertDigest(artifact.sha256, `${artifact.path} export digest`);
      assert(!path.isAbsolute(artifact.path) && !artifact.path.split('/').includes('..'));
      paths.push(artifact.path);
    });
  });
  assert.equal(new Set(paths).size, paths.length, 'export surface paths must be unique');
  return baseline;
}

function writeCompletedTracerExport(rootDir, fixtureRoot) {
  writeEnglishTracerExportFixture({
    rootDir,
    fixtureRoot: path.join(fixtureRoot, 'english')
  });
  writeModelGlossaryExportFixture({
    rootDir,
    fixtureRoot: path.join(fixtureRoot, 'model-glossary')
  });
  return directoryInventory(fixtureRoot, { root: fixtureRoot });
}

function verifyExportSurfaceEvidence(inventory, baseline) {
  const inventoryByPath = new Map(
    inventory.files.map((artifact) => [
      artifact.path,
      { path: artifact.path, bytes: artifact.bytes, sha256: artifact.sha256 }
    ])
  );
  const summaries = {};
  const artifacts = [];
  for (const [surfaceName, surface] of Object.entries(baseline.surfaces)) {
    const observed = surface.artifacts.map((expected) => inventoryByPath.get(expected.path));
    assert(observed.every(Boolean), `missing ${surfaceName} export surface artifact`);
    assert.deepEqual(observed, surface.artifacts, `${surfaceName} export surface drift`);
    summaries[surfaceName] = summarizeArtifacts(observed);
    artifacts.push(...observed);
  }
  return { summaries, artifacts };
}

function verifyCapacityBaseline(rootDir, contract) {
  const capacity = contract.capacityBaseline;
  const budget = capacity.initialJavaScript;
  assertDigest(budget.sha256, 'initial JavaScript authority digest');
  const budgetPath = resolveArtifact(rootDir, budget.path);
  assert.equal(
    sha256(fs.readFileSync(budgetPath)),
    budget.sha256,
    'initial JavaScript authority drift'
  );
  assert.equal(readJson(budgetPath, 'technical center budget').baselineGzipBytes, budget.gzipBytes);

  const artifactByPath = new Map(
    contract.releaseManifest.artifacts.map((artifact) => [artifact.path, artifact])
  );
  assert.equal(
    capacity.searchProjectionBytes,
    artifactByPath.get('public/tech-center/search-index.json').bytes +
      artifactByPath.get('public/tech-center/search-index.en.json').bytes
  );
  const registry = readJson(
    resolveArtifact(rootDir, 'src/components/tech-center/entries.json'),
    'production Technical Page registry'
  );
  assert.equal(registry.length, capacity.productionPageCount, 'capacity page baseline drift');

  const exportSurfaceBaseline = loadExportSurfaceBaseline(rootDir, contract);
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'week06-wave0-capacity-'));
  try {
    const inventory = writeCompletedTracerExport(rootDir, fixtureRoot);
    const initialJavaScriptGzipBytes = inventory.files
      .filter((file) => file.path.endsWith('technical-center.js'))
      .reduce(
        (total, file) =>
          total + zlib.gzipSync(fs.readFileSync(path.join(fixtureRoot, file.path))).length,
        0
      );
    const searchProjectionBytes = inventory.files
      .filter((file) => file.path.includes('search-index'))
      .reduce((total, file) => total + file.bytes, 0);
    const observed = {
      staticFileCount: inventory.files.length,
      completeExportBytes: inventory.bytes,
      sha256: inventory.sha256,
      initialJavaScriptGzipBytes,
      searchProjectionBytes
    };
    const expected = { ...capacity.completedTracerExport };
    delete expected.referenceBuildDurationMilliseconds;
    assert.deepEqual(observed, expected, 'completed tracer export capacity drift');

    const reference = capacity.referenceBuildMeasurement;
    assertDigest(reference.sha256, 'reference build measurement digest');
    const referencePath = resolveArtifact(rootDir, reference.path);
    assert.equal(
      sha256(fs.readFileSync(referencePath)),
      reference.sha256,
      'reference build measurement drift'
    );
    const measurement = readJson(referencePath, 'reference build measurement');
    assert.equal(measurement.schemaVersion, 1);
    assert.equal(measurement.kind, 'week06-wave0-capacity-measurement');
    assert.equal(measurement.measurementId, reference.measurementId);
    assert.equal(measurement.command, 'node scripts/verify-week06-wave0-readiness.js');
    assert.equal(measurement.scope, 'completed-tracer-export-generation');
    assert.equal(measurement.statistic, 'median');
    assert.equal(measurement.sampleCount, measurement.durationSamplesMilliseconds.length);
    assert(
      measurement.durationSamplesMilliseconds.every(
        (duration) => Number.isInteger(duration) && duration > 0
      ),
      'reference build duration samples must be positive integers'
    );
    assert.equal(measurement.durationMilliseconds, median(measurement.durationSamplesMilliseconds));
    assert.equal(
      measurement.durationMilliseconds,
      capacity.completedTracerExport.referenceBuildDurationMilliseconds
    );
    assert.equal(measurement.artifactSha256, observed.sha256);
    return verifyExportSurfaceEvidence(inventory, exportSurfaceBaseline);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

function verifyAtomicRollback({ rootDir = ROOT, contract }) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'week06-wave0-rollback-'));
  const sourceRoot = path.join(temporaryRoot, 'source');
  const restoreRoot = path.join(temporaryRoot, 'restore');
  const repositoryArtifacts = artifactEvidence(rootDir, contract.releaseManifest.artifacts);
  const exportBaseline = loadExportSurfaceBaseline(rootDir, contract);
  const inventory = writeCompletedTracerExport(rootDir, sourceRoot);
  const exportEvidence = verifyExportSurfaceEvidence(inventory, exportBaseline);
  const artifacts = [...repositoryArtifacts, ...exportEvidence.artifacts];
  const before = artifacts.map((artifact, index) =>
    fs.readFileSync(
      resolveArtifact(index < repositoryArtifacts.length ? rootDir : sourceRoot, artifact.path)
    )
  );
  const files = artifacts.map((artifact, index) => {
    const filePath = resolveArtifact(restoreRoot, artifact.path);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, before[index]);
    return filePath;
  });
  try {
    assert.throws(
      () =>
        applyRollbackProjection({
          files,
          contents: before.map((content) => Buffer.concat([content, Buffer.from('\nwave-1\n')])),
          failAt: 4
        }),
      /Projection failure at surface 4/
    );
    files.forEach((filePath, index) =>
      assert.deepEqual(
        fs.readFileSync(filePath),
        before[index],
        `rollback drift at surface ${index}`
      )
    );
    const restored = artifacts.map((expected) => {
      const observed = fileProvenance(resolveArtifact(restoreRoot, expected.path), {
        root: restoreRoot
      });
      return { path: observed.path, bytes: observed.bytes, sha256: observed.sha256 };
    });
    assert.deepEqual(restored, artifacts, 'rollback artifact bytes drift');
    const restoredRepositoryArtifacts = restored.slice(0, repositoryArtifacts.length);
    const restoredExportArtifacts = restored.slice(repositoryArtifacts.length);
    const restoredExportByPath = new Map(
      restoredExportArtifacts.map((artifact) => [artifact.path, artifact])
    );
    const restoredExportSurfaceBaselines = Object.fromEntries(
      Object.entries(exportBaseline.surfaces).map(([surfaceName, surface]) => [
        surfaceName,
        summarizeArtifacts(
          surface.artifacts.map((artifact) => restoredExportByPath.get(artifact.path))
        )
      ])
    );
    assert.equal(
      digestJson({
        artifacts: restoredRepositoryArtifacts,
        exportSurfaceBaselines: restoredExportSurfaceBaselines
      }),
      contract.rollbackManifest.baselineSha256,
      'rollback baseline digest drift'
    );
    return 'atomic';
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

function verifyWeek06Wave0Readiness({
  rootDir = ROOT,
  contractPath = CONTRACT_PATH,
  registryPath
} = {}) {
  const contract = loadReadinessContract(rootDir, contractPath);
  verifyAuthorityClosure(rootDir, contract);
  const english = verifyWeek06EnglishTracer({ rootDir, registryPath });
  const modelGlossary = verifyWeek06ModelGlossaryTracers({ rootDir, registryPath });
  assert.equal(english.identity, contract.tracers.englishExistingCategory.identity);
  assert.deepEqual(modelGlossary.tracers, contract.tracers.modelGlossary.identities);
  assert.deepEqual(english.variants, { io: 'indexable', cn: 'excluded', preview: 'review' });
  assert.deepEqual(modelGlossary.variants, { cn: 2, io: 1, preview: 3 });
  assert.equal(english.registryDelta, 0);
  assert.equal(modelGlossary.registryDelta, 0);
  assert.equal(modelGlossary.ownerLeaks, 0);

  const artifacts = artifactEvidence(rootDir, contract.releaseManifest.artifacts);
  const exportEvidence = verifyCapacityBaseline(rootDir, contract);
  assert.equal(
    digestJson({
      artifacts,
      exportSurfaceBaselines: exportEvidence.summaries
    }),
    contract.releaseManifest.baselineSha256,
    'release baseline digest drift'
  );
  const rollback = verifyAtomicRollback({ rootDir, contract });
  assert.deepEqual(contract.coordinator, {
    sourceVerified: true,
    exportVerified: true,
    governanceStatus: 'governance-complete',
    publicationCount: 0
  });

  return {
    issue: contract.issue,
    wave: contract.wave,
    sourceVerified: contract.coordinator.sourceVerified,
    exportVerified: contract.coordinator.exportVerified,
    governanceStatus: contract.coordinator.governanceStatus,
    publicationCount: contract.coordinator.publicationCount,
    publicPageDelta: 0,
    tracerCount: 1 + modelGlossary.tracers.length,
    variants: { cn: 'verified', io: 'verified', preview: 'verified' },
    ownerLeaks: modelGlossary.ownerLeaks,
    capacityBaseline: contract.capacityBaseline.status,
    rollback
  };
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--contract' || token === '--registry') {
      const value = argv[++index];
      if (!value || value.startsWith('--')) throw new Error(`${token} requires a path`);
      options[token === '--contract' ? 'contractPath' : 'registryPath'] = path.resolve(value);
    } else {
      throw new Error(`Unknown option: ${token}`);
    }
  }
  return options;
}

function main(argv = process.argv.slice(2)) {
  const result = verifyWeek06Wave0Readiness(parseArgs(argv));
  console.log(
    `[verify-week06-wave0-readiness] passed: tracers=${result.tracerCount} ownerLeaks=${result.ownerLeaks} publication-count=${result.publicationCount}`
  );
  console.log(`WEEK06_WAVE0_READINESS_RESULT=${JSON.stringify(result)}`);
  return result;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[verify-week06-wave0-readiness] ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  CONTRACT_PATH,
  loadReadinessContract,
  main,
  parseArgs,
  verifyAtomicRollback,
  verifyWeek06Wave0Readiness
};
