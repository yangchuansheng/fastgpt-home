const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  CONTRACT_PATH,
  loadReadinessContract,
  parseArgs,
  verifyWeek06Wave0Readiness
} = require('./verify-week06-wave0-readiness');

const ROOT = path.resolve(__dirname, '..');

test('the bilingual Week06 Wave 0 record is ready for a zero-publication release', () => {
  const result = verifyWeek06Wave0Readiness({ rootDir: ROOT });

  assert.deepEqual(result, {
    issue: 265,
    wave: 'wave-0',
    sourceVerified: true,
    fixtureVerified: true,
    exportVerified: false,
    governanceStatus: 'governance-complete',
    publicationCount: 0,
    publicPageDelta: 0,
    tracerCount: 4,
    variants: { cn: 'verified', io: 'verified', preview: 'verified' },
    ownerLeaks: 0,
    capacityBaseline: 'recorded',
    rollback: 'rollback-on-error'
  });
});

test('the readiness contract binds the real upstream tracer commands', () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'week06-readiness-contract-'));
  try {
    const contract = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));
    contract.tracers.englishExistingCategory.command = 'node scripts/fake-tracer.js';
    const contractPath = path.join(temporaryRoot, 'contract.json');
    fs.writeFileSync(contractPath, JSON.stringify(contract));

    assert.throws(() => loadReadinessContract(ROOT, contractPath), /English tracer command drift/);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('the verifier blocks unresolved governance and public projection mutations', () => {
  const mutations = [
    {
      name: 'unresolved identity',
      pattern: /unresolved/,
      mutate(contract) {
        contract.authority.unresolved.identity = 1;
      }
    },
    {
      name: 'registry digest drift',
      pattern: /public baseline artifact drift/,
      mutate(contract) {
        contract.releaseManifest.artifacts[0].sha256 = 'a'.repeat(64);
      }
    },
    {
      name: 'sitemap delta',
      pattern: /public-page delta/,
      mutate(contract) {
        contract.releaseManifest.publicPageDelta.sitemap = 1;
      }
    },
    {
      name: 'completed sitemap export digest drift',
      pattern: /export surface baseline artifact drift/,
      mutate(contract) {
        contract.releaseManifest.exportSurfaceBaseline.sha256 = 'b'.repeat(64);
        contract.rollbackManifest.exportSurfaceBaselineSha256 = 'b'.repeat(64);
      }
    },
    {
      name: 'rollback artifact mapping drift',
      pattern: /rollback artifact mapping drift/,
      mutate(contract) {
        contract.rollbackManifest.artifactPaths.pop();
      }
    },
    {
      name: 'privacy scan digest drift',
      pattern: /privacy scan digest drift/,
      mutate(contract) {
        contract.authority.privacyScan.sha256 = 'd'.repeat(64);
      }
    },
    {
      name: 'capacity measurement digest drift',
      pattern: /reference build measurement drift/,
      mutate(contract) {
        contract.capacityBaseline.referenceBuildMeasurement.sha256 = 'c'.repeat(64);
      }
    }
  ];

  for (const mutation of mutations) {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'week06-readiness-mutation-'));
    try {
      const contract = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));
      mutation.mutate(contract);
      const contractPath = path.join(temporaryRoot, 'contract.json');
      fs.writeFileSync(contractPath, JSON.stringify(contract));
      assert.throws(
        () => verifyWeek06Wave0Readiness({ rootDir: ROOT, contractPath }),
        mutation.pattern,
        mutation.name
      );
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true, force: true });
    }
  }
});

test('the CLI rejects missing values and unknown options at its trust boundary', () => {
  for (const option of ['--contract', '--registry']) {
    assert.throws(() => parseArgs([option]), new RegExp(`${option} requires a path`));
    assert.throws(() => parseArgs([option, '--contract']), new RegExp(`${option} requires a path`));
  }
  assert.throws(() => parseArgs(['--publish']), /Unknown option: --publish/);
});
