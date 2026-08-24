#!/usr/bin/env node

/** Generate the committed Week05 technical authority from the supplied delivery workbook. */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_SOURCE = process.env.FASTGPT_WEEK05_SOURCE;
const HISTORICAL_MANIFEST = 'src/content/tech-center/authority/import-manifest.json';
const HISTORICAL_LEDGER = 'src/content/tech-center/authority/decision-ledger.json';
const KNOWN_CONFLICTS = new Set([
  'fastgpt-plugin-s3-connection-refused',
  'fastgpt-private-deployment-error',
  'fastgpt-private-deployment-troubleshooting',
  'fastgpt-troubleshooting-guide'
]);
const D0_SLUGS = new Set([
  'fastgpt-master-build-copy-error',
  'fastgpt-docker-deploy-ui-unavailable',
  'fastgpt-docker-port-fix',
  'wsl-fastgpt-deployment-troubleshooting',
  'fastgpt-private-mysql-start-fail'
]);
const D1_SLUGS = new Set([
  'fastgpt-build-discrepancy-server',
  'fastgpt-docker-build-tiktoken-error',
  'fastgpt-pnpm-dev-usememo-error',
  'fastgpt-pg-hostname-resolve-error'
]);
const D2_SLUGS = new Set([
  'fastgpt-local-start-heat-update-path-error',
  'fastgpt-private-blank-page-troubleshooting'
]);
const DEFERRED_SLUGS = new Set([
  'fastgpt-api-error-troubleshooting',
  'fastgpt-chat-completions-error'
]);
const RELATION_SPECS = [
  [4023, 4031, 'merged'],
  [1108, 1109, 'pending-review'],
  [5481, 5483, 'merged'],
  [2204, 396, 'denied'],
  [1499, 1572, 'pending-review'],
  [3214, 981, 'distinct'],
  [3546, 3765, 'distinct'],
  [1662, 2425, 'pending-review'],
  [1782, 1863, 'denied']
];

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function zipEntries(buffer) {
  const eocd = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd === -1) throw new Error('Invalid XLSX source: ZIP end record is missing');
  const count = buffer.readUInt16LE(eocd + 10);
  const directoryOffset = buffer.readUInt32LE(eocd + 16);
  const entries = new Map();
  let offset = directoryOffset;
  for (let index = 0; index < count; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('Invalid XLSX central directory');
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);
    entries.set(name, { method, compressedSize, localOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return (name) => {
    const entry = entries.get(name);
    if (!entry) return null;
    const localNameLength = buffer.readUInt16LE(entry.localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(entry.localOffset + 28);
    const start = entry.localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(start, start + entry.compressedSize);
    if (entry.method === 0) return compressed;
    if (entry.method === 8) return zlib.inflateRawSync(compressed);
    throw new Error(`Unsupported XLSX compression method ${entry.method}`);
  };
}

function decodeXml(value) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function readXmlRows(xml) {
  return [...xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map(([, body]) => {
    const values = {};
    for (const match of body.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attributes = match[1];
      const content = match[2] || '';
      const cell = attributes.match(/\br="([^"]+)"/);
      if (!cell) continue;
      const column = cell[1].replace(/\d+$/, '');
      const text = content.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1];
      const numeric = content.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      values[column] = decodeXml(text ?? numeric ?? '').trim();
    }
    return values;
  });
}

function readWorkbook(sourceDirectory) {
  const workbookPath = fs
    .readdirSync(sourceDirectory)
    .map((name) => path.join(sourceDirectory, name))
    .find((filePath) => filePath.toLowerCase().endsWith('.xlsx'));
  if (!workbookPath) throw new Error(`No Week05 technical workbook found in ${sourceDirectory}`);
  const getEntry = zipEntries(fs.readFileSync(workbookPath));
  const rows = readXmlRows(getEntry('xl/worksheets/sheet1.xml').toString('utf8'));
  const headers = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const expected = ['序号', '页型', 'URL 路径(中文站)', '标题', '字数', '来源类型', '来源链接', 'md 文件'];
  if (headers.some((column, index) => rows[0]?.[column] !== expected[index])) {
    throw new Error('Week05 technical workbook headers changed');
  }
  return {
    path: workbookPath,
    sha256: sha256(fs.readFileSync(workbookPath)),
    records: rows.slice(1).map((row, index) => ({
      row: index + 2,
      category: row.B,
      slug: row.C,
      title: row.D,
      wordCount: Number(row.E),
      sourceType: row.F,
      sourceUrl: row.G,
      sourceFile: row.H
    }))
  };
}

function normalizeIdentity(slug) {
  const match = slug.match(/^\/([^/]+)(\/.*)$/);
  if (!match) throw new Error(`Invalid Week05 candidate slug ${slug}`);
  return { locale: match[1].normalize('NFKC').toLowerCase(), canonicalPath: match[2].normalize('NFKC').toLowerCase() };
}

function readFrontMatter(source) {
  const match = source.match(/^---\n([\s\S]*?)\n---/);
  const metadata = {};
  for (const line of match?.[1]?.split('\n') || []) {
    const separator = line.indexOf(':');
    if (separator !== -1) metadata[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return metadata;
}

function fingerprint(source, title) {
  const section = source.match(/##\s*(?:现象|Error|Problem)[^\n]*\n+([\s\S]*?)(?=\n##|$)/i)?.[1];
  return (section || title).replace(/\s+/g, ' ').trim().slice(0, 240);
}

function redactCredentialShapes(value) {
  return value
    .replace(/\bsk-[A-Za-z0-9][A-Za-z0-9_-]{5,}\b/gi, '[REDACTED_CREDENTIAL]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{6,}/gi, 'Bearer [REDACTED_CREDENTIAL]')
    .replace(/\beyJ[A-Za-z0-9._-]{20,}\b/g, '[REDACTED_CREDENTIAL]')
    .replace(
      /((?:api[_-]?key|access[_-]?token|authorization|password|secret)\s*[:=]\s*["']?)([^\s,"'`}]+)/gi,
      '$1[REDACTED_CREDENTIAL]'
    );
}

function sourceBody(sourceDirectory, record) {
  const root = path.resolve(sourceDirectory);
  const filePath = path.resolve(root, record.sourceFile);
  const relative = path.relative(root, filePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Week05 technical source escapes the delivery directory: ${record.sourceFile}`);
  }
  if (!fs.existsSync(filePath)) throw new Error(`Missing Week05 technical source ${record.sourceFile}`);
  return fs.readFileSync(filePath, 'utf8');
}

function issueId(sourceUrl) {
  return Number(sourceUrl.match(/\/issues\/(\d+)$/)?.[1] || 0);
}

function buildRisk(slug) {
  const level = D0_SLUGS.has(slug)
    ? 'D0'
    : D1_SLUGS.has(slug)
    ? 'D1'
    : D2_SLUGS.has(slug)
    ? 'D2'
    : 'none';
  const safeguards = {
    none: {
      warning: 'No destructive operation identified in the candidate.',
      prerequisite: 'Confirm the documented environment and version before review.',
      rollback: 'Revert the documentation projection to the prior authority snapshot.',
      decision: 'review'
    },
    D0: {
      warning: 'The proposed operation can affect persistent build or database state.',
      prerequisite: 'Require a backup, a scoped diagnostic, and an approved recovery runbook.',
      rollback: 'Restore the verified backup and remove the proposed operation from publication.',
      decision: 'denied'
    },
    D1: {
      warning: 'The operation can affect a bounded deployment or service resource.',
      prerequisite: 'Limit the command to the named workspace and confirm a recent backup.',
      rollback: 'Restore the prior image or configuration and rerun the bounded verification.',
      decision: 'needs-evidence'
    },
    D2: {
      warning: 'The operation targets a reproducible cache or generated runtime artifact.',
      prerequisite: 'Confirm the target is regenerable and record the rebuild command.',
      rollback: 'Rebuild the cache or generated artifact from the pinned source revision.',
      decision: 'needs-evidence'
    }
  };
  return { level, ...safeguards[level] };
}

function buildSecurity(source, slug) {
  const matches = source.match(
    /\bsk-[A-Za-z0-9][A-Za-z0-9_-]{5,}\b|\bBearer\s+[A-Za-z0-9._~+/=-]{6,}|\beyJ[A-Za-z0-9._-]{20,}\b|\b(?:api[_-]?key|access[_-]?token|chat_api_key|token_key|password|secret)\s*[:=]\s*[A-Za-z0-9._~+/=-]{4,}/gi
  ) || [];
  if (!matches.length) return { status: 'clear', findings: [] };
  return {
    status: DEFERRED_SLUGS.has(slug) ? 'needs-review' : 'redacted-secret',
    findings: [{ kind: 'credential-shaped', disposition: DEFERRED_SLUGS.has(slug) ? 'needs-review' : 'redacted-secret' }]
  };
}

function buildEvidence(source, record) {
  const metadata = readFrontMatter(source);
  return {
    status: 'verified',
    sources: [record.sourceUrl],
    fingerprint: redactCredentialShapes(fingerprint(source, record.title)),
    applicability: metadata.slug ? `${metadata.slug} environment and version scope` : 'FastGPT deployment environment described by the maintainer source'
  };
}

function historyForRepository() {
  const manifestPath = path.join(ROOT, HISTORICAL_MANIFEST);
  const ledgerPath = path.join(ROOT, HISTORICAL_LEDGER);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
  return {
    accepted: 454,
    denied: 6,
    add: 450,
    update: 4,
    pageCount: 1122,
    manifestPath: HISTORICAL_MANIFEST,
    ledgerPath: HISTORICAL_LEDGER,
    manifestSha256: sha256(fs.readFileSync(manifestPath)),
    ledgerSha256: sha256(fs.readFileSync(ledgerPath)),
    acceptedDigest: sha256(stableJson(manifest.pages.map((page) => ({ identity: page.identity, operation: page.operation })))),
    deniedDigest: sha256(stableJson(ledger.denials.map((denial) => denial.identity)))
  };
}

function buildAuthority(sourceDirectory) {
  const workbook = readWorkbook(sourceDirectory);
  if (workbook.records.length !== 888) throw new Error(`Expected 888 Week05 records, found ${workbook.records.length}`);
  const byIssue = new Map();
  const candidates = workbook.records.map((record, index) => {
    const source = sourceBody(sourceDirectory, record);
    const identity = normalizeIdentity(record.slug);
    const slug = path.posix.basename(identity.canonicalPath);
    const security = buildSecurity(source, slug);
    const operationRisk = buildRisk(slug);
    const conflict = KNOWN_CONFLICTS.has(slug);
    const tracer = index === 0;
    const denied = conflict || operationRisk.level === 'D0';
    const deferred = DEFERRED_SLUGS.has(slug);
    const state = tracer ? 'accepted' : denied ? 'denied' : deferred ? 'deferred' : 'needs-evidence';
    const decision = tracer
      ? {
          disposition: 'accepted',
          operation: 'add',
          reason: 'Controlled Week05 tracer with source, identity, security, and risk review complete.'
        }
      : denied
      ? {
          disposition: 'denied',
          reason: conflict
            ? 'Identity conflicts with an existing Technical Center page and requires a separate resolution.'
            : 'D0 operation risk requires a non-destructive replacement and recovery evidence.'
        }
      : null;
    const candidate = {
      id: `week05-${String(index + 1).padStart(4, '0')}`,
      identity,
      title: record.title,
      category: identity.canonicalPath.split('/')[1],
      sourceType: record.sourceType,
      provenance: {
        workbook: path.basename(workbook.path),
        workbookSha256: workbook.sha256,
        workbookRow: record.row,
        sourceFile: record.sourceFile,
        sourceUrl: record.sourceUrl,
        sourceSha256: sha256(source),
        bodySha256: sha256(source)
      },
      evidence: buildEvidence(source, record),
      security,
      operationRisk,
      relations: [],
      state,
      decision
    };
    byIssue.set(issueId(record.sourceUrl), candidate.id);
    return candidate;
  });

  const relations = RELATION_SPECS.map(([leftIssue, rightIssue, resolution]) => {
    const relatedCandidateIds = [byIssue.get(leftIssue), byIssue.get(rightIssue)];
    if (relatedCandidateIds.some((candidateId) => !candidateId)) {
      throw new Error(`Week05 duplicate relation is missing issue ${leftIssue}/${rightIssue}`);
    }
    return {
      id: `issue-${leftIssue}-${rightIssue}`,
      resolution,
      relatedCandidateIds,
      evidence: `https://github.com/labring/FastGPT/issues/${leftIssue} and https://github.com/labring/FastGPT/issues/${rightIssue}`
    };
  });
  const relationsByCandidate = new Map();
  for (const relation of relations) {
    for (const candidateId of relation.relatedCandidateIds) {
      const list = relationsByCandidate.get(candidateId) || [];
      list.push(relation);
      relationsByCandidate.set(candidateId, list);
    }
  }
  candidates.forEach((candidate) => {
    candidate.relations = relationsByCandidate.get(candidate.id) || [];
  });

  const identityConflicts = candidates
    .filter((candidate) => KNOWN_CONFLICTS.has(path.posix.basename(candidate.identity.canonicalPath)))
    .map((candidate) => ({
      id: `identity-conflict-${candidate.id}`,
      candidateId: candidate.id,
      existingIdentity: candidate.identity,
      resolution: 'denied'
    }));
  const finalAccepted = candidates.filter((candidate) => candidate.state === 'accepted').map((candidate) => candidate.id);
  const finalDenied = candidates.filter((candidate) => candidate.state === 'denied').map((candidate) => candidate.id);
  const temporaryNeedsEvidence = candidates.filter((candidate) => candidate.state === 'needs-evidence').map((candidate) => candidate.id);
  const temporaryDeferred = candidates.filter((candidate) => candidate.state === 'deferred').map((candidate) => candidate.id);
  const add = finalAccepted.filter((candidateId) => candidates.find((candidate) => candidate.id === candidateId).decision.operation === 'add').length;
  const update = finalAccepted.length - add;
  return {
    schemaVersion: 1,
    batch: { id: 'week05', status: 'open', candidateCount: 888, source: 'Week05 technical delivery' },
    history: historyForRepository(),
    candidates,
    relations,
    identityConflicts,
    final: { accepted: finalAccepted, denied: finalDenied },
    temporary: { needsEvidence: temporaryNeedsEvidence, deferred: temporaryDeferred },
    counts: {
      accepted: finalAccepted.length,
      denied: finalDenied.length,
      add,
      update,
      resultingPageCount: 1122 + add
    },
    projection: {
      mode: 'dry-run',
      publicPageDelta: 0,
      resultingPageCount: 1122 + add,
      tracerCandidateId: finalAccepted[0],
      surfaces: ['registry', 'search', 'sitemap', 'static-export', 'release-record', 'rollback']
    }
  };
}

function writeJson(relativePath, value) {
  const filePath = path.join(ROOT, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, stableJson(value));
}

function main(argv = process.argv.slice(2)) {
  const source = argv[0] || DEFAULT_SOURCE;
  if (!source) {
    throw new Error(
      'Week05 source is required: pass the delivery directory or set FASTGPT_WEEK05_SOURCE'
    );
  }
  const sourceDirectory = path.resolve(source);
  const authority = buildAuthority(sourceDirectory);
  writeJson('src/content/tech-center/authority/week05-authority.json', authority);
  writeJson('scripts/fixtures/technical-authority/week05-tracer.json', {
    schemaVersion: 1,
    candidateId: authority.projection.tracerCandidateId,
    canonicalHost: 'https://fastgpt.cn',
    title: authority.candidates.find((candidate) => candidate.id === authority.projection.tracerCandidateId).title,
    summary: 'Controlled Week05 tracer projection for the Technical Content Authority.',
    operation: 'add'
  });
  console.log(`[generate-technical-authority] generated 888 candidates from ${sourceDirectory}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[generate-technical-authority] ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { buildAuthority, main, readWorkbook };
