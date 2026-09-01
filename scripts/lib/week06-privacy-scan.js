const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const SCAN_PATH = path.join(ROOT, 'scripts/fixtures/technical-authority/week06-privacy-scan.json');
const RULES = [
  { kind: 'email-address', pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
  { kind: 'cn-mobile', pattern: /(?<!\d)(?:\+?86[- ]?)?1[3-9]\d{9}(?!\d)/g },
  { kind: 'cn-citizen-id', pattern: /(?<!\d)\d{17}[\dXx](?!\d)/g }
];
const RESOLVED_DISPOSITIONS = new Set([
  'public-organizational-contact',
  'false-positive-version-token'
]);

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Unable to read ${label}: ${error.message}`);
  }
}

function resolveRepositoryPath(rootDir, relativePath) {
  const root = path.resolve(rootDir);
  assert.equal(typeof relativePath, 'string', 'privacy scan input path must be a string');
  const resolved = path.resolve(root, relativePath);
  assert(
    resolved.startsWith(`${root}${path.sep}`),
    `privacy scan input escapes repository root: ${relativePath}`
  );
  return resolved;
}

function scanWeek06Privacy(manifest) {
  return manifest.candidates
    .flatMap((candidate) => {
      const text = [
        candidate.title,
        candidate.evidence?.fingerprint,
        JSON.stringify(candidate.input?.frontMatter || {})
      ].join('\n');
      return RULES.flatMap(({ kind, pattern }) => {
        const matches = [...new Set(text.match(pattern) || [])];
        return matches.map((match) => ({
          candidateId: candidate.id,
          kind,
          fingerprint: sha256(match.toLowerCase())
        }));
      });
    })
    .sort((left, right) =>
      `${left.candidateId}|${left.kind}|${left.fingerprint}`.localeCompare(
        `${right.candidateId}|${right.kind}|${right.fingerprint}`
      )
    );
}

function verifyWeek06PrivacyScan(rootDir = ROOT, scanPath = SCAN_PATH) {
  const scanBytes = fs.readFileSync(scanPath);
  const scan = readJson(scanPath, 'Week06 privacy scan');
  assert.equal(scan.schemaVersion, 1);
  assert.equal(scan.kind, 'week06-privacy-scan');
  assert.equal(scan.status, 'closed');
  assert.deepEqual(scan.scanner, {
    id: 'week06-privacy-token-scan',
    version: 1,
    fields: ['title', 'evidence.fingerprint', 'input.frontMatter'],
    rules: RULES.map(({ kind }) => kind)
  });
  const manifestPath = resolveRepositoryPath(rootDir, scan.input.path);
  const manifestBytes = fs.readFileSync(manifestPath);
  assert.equal(sha256(manifestBytes), scan.input.sha256, 'privacy scan input digest drift');
  const observed = scanWeek06Privacy(JSON.parse(manifestBytes));
  const recorded = scan.findings.map(({ candidateId, kind, fingerprint }) => ({
    candidateId,
    kind,
    fingerprint
  }));
  assert.deepEqual(observed, recorded, 'privacy scan finding drift');
  assert.equal(scan.findingCount, scan.findings.length);
  assert.equal(scan.findingCount, observed.length);
  scan.findings.forEach((finding) => {
    assert(RESOLVED_DISPOSITIONS.has(finding.disposition), 'unresolved privacy disposition');
    assert.match(finding.evidence, /^https:\/\//, 'privacy evidence must use HTTPS');
  });
  assert.equal(
    scan.unresolvedCount,
    scan.findings.filter((finding) => !RESOLVED_DISPOSITIONS.has(finding.disposition)).length
  );
  return {
    findingCount: scan.findingCount,
    unresolvedCount: scan.unresolvedCount,
    sha256: sha256(scanBytes)
  };
}

module.exports = { SCAN_PATH, scanWeek06Privacy, verifyWeek06PrivacyScan };
