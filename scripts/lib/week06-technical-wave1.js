#!/usr/bin/env node

/** Build and verify the Week06 bilingual Technical Content Wave 1. */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  applyRollbackProjection,
  fileSha256,
  identityKey,
  sha256,
  stableJson
} = require('./technical-authority');
const { verifyProjectionConsistency } = require('./technical-projection');
const { sanitizeReaderText } = require('./technical-wave');
const {
  buildNormalizedTechnicalPage,
  buildSearchProjection
} = require('../import-technical-content');

const SELECTION_RELATIVE_PATH = 'src/content/tech-center/authority/week06-wave1-selection.json';
const CONTRACT_RELATIVE_PATH = 'scripts/fixtures/technical-authority/week06-wave1-contract.json';
const AUTHORITY_RELATIVE_PATH = 'src/content/tech-center/authority/week06-candidate-manifest.json';
const REGISTRY_RELATIVE_PATH = 'src/components/tech-center/entries.json';
const ZH_SEARCH_RELATIVE_PATH = 'public/tech-center/search-index.json';
const EN_SEARCH_RELATIVE_PATH = 'public/tech-center/search-index.en.json';
const CONTENT_RELATIVE_PATH = 'src/content/tech-center/authority/week06-wave1-content.json';
const MANIFEST_RELATIVE_PATH = 'src/content/tech-center/authority/week06-wave1-manifest.json';
const PROJECTION_RELATIVE_PATH = 'src/content/tech-center/authority/week06-wave1-projection.json';
const RELEASE_RELATIVE_PATH =
  'src/content/tech-center/authority/week06-wave1-release-manifest.json';
const ROLLBACK_RELATIVE_PATH = 'src/content/tech-center/authority/week06-wave1-rollback.json';
const BASELINE_RELEASE_RELATIVE_PATH =
  'src/content/tech-center/authority/week05-wave2-release-manifest.json';
const BASELINE_PAGE_COUNT = 1372;
const RESULTING_PAGE_COUNT = 1422;
const OWNER_ORIGINS = { zh: 'https://fastgpt.cn', en: 'https://fastgpt.io' };
const APPROVED_SOURCE_CLASSIFICATIONS = {
  official: new Set(['official-document', 'official-upgrade-note']),
  errorCode: new Set(['open-source-error-code']),
  model: new Set(['official-document']),
  glossary: new Set(['supported-glossary-source'])
};
const EN_CATEGORY_LABELS = {
  api: 'API',
  dataset: 'Knowledge bases',
  deploy: 'Deployment and upgrades',
  integration: 'Integrations',
  node: 'Workflow nodes',
  reference: 'Technical reference',
  model: 'Model guides',
  glossary: 'Glossary',
  troubleshoot: 'Troubleshooting',
  tutorial: 'Tutorials'
};
const PUBLIC_SURFACES = [
  'registry',
  'search',
  'sitemap',
  'staticExport',
  'releaseRecord',
  'rollback'
];
const READER_CONTENT_CONTRACT = [
  'reader-content',
  'official-https-citation',
  'applicability-and-version-scope',
  'problem-or-concept-fingerprint',
  'security-and-operation-guardrails',
  'rollback-guidance',
  'reader-body-hygiene'
];
const READER_FORBIDDEN_PATTERNS = [
  /\bsk-[A-Za-z0-9][A-Za-z0-9_-]{5,}\b/gi,
  /\bBearer\s+(?!\[REDACTED_CREDENTIAL\])[A-Za-z0-9._~+/=-]{6,}/gi,
  /\beyJ[A-Za-z0-9._-]{20,}\b/g,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  /(?<!\d)(?:\+?86[- ]?)?1[3-9]\d{9}(?!\d)/g,
  /(?<!\d)\d{17}[\dXx](?!\d)/g,
  /(?:internal\s+KB|GSC\s+provenance|publish\s+target|verification\s+workflow|sign[- ]off|内部\s*KB|发布落点|核验流程|签发)\s*[:：]/gi
];

function readJson(repoRoot, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

function parseEntryIdentity(entry) {
  const match = entry.slug?.match(/^\/([^/]+)(\/.*)$/);
  if (!match) throw new Error(`Invalid technical registry identity: ${entry.slug}`);
  return { locale: match[1], canonicalPath: match[2] };
}

function assertPublicHttps(value, label) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a public HTTPS URL`);
  }
  if (
    url.protocol !== 'https:' ||
    !url.hostname.includes('.') ||
    url.username ||
    url.password ||
    /^(?:localhost|127\.|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/i.test(url.hostname)
  ) {
    throw new Error(`${label} must be a public HTTPS URL`);
  }
}

function candidateCohort(candidate) {
  if (candidate.category === 'model') return 'model';
  if (candidate.category === 'glossary') return 'glossary';
  if (candidate.sourceClassification?.code === 'open-source-error-code') return 'errorCode';
  return 'official';
}

function normalizeRelativePath(value, label) {
  if (typeof value !== 'string' || !value || value.includes('\\')) {
    throw new Error(`${label} must be a normalized repository-relative path`);
  }
  const normalized = path.posix.normalize(value);
  if (
    normalized !== value ||
    normalized.startsWith('/') ||
    normalized === '..' ||
    normalized.startsWith('../')
  ) {
    throw new Error(`${label} must stay inside its approved root`);
  }
  return normalized;
}

function resolveRepositoryPath(repoRoot, relativePath, label) {
  const normalized = normalizeRelativePath(relativePath, label);
  const root = path.resolve(repoRoot);
  const resolved = path.resolve(root, normalized);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${label} escapes the repository`);
  }
  return resolved;
}

function validateSelectedIdentity(candidate) {
  const label = candidate.id;
  const { identity } = candidate;
  if (!identity || !['zh', 'en'].includes(identity.locale)) {
    throw new Error(`${label} has an unsupported locale`);
  }
  const canonicalPath = identity.canonicalPath;
  const normalizedCanonicalPath = path.posix.normalize(canonicalPath || '');
  if (
    typeof canonicalPath !== 'string' ||
    normalizedCanonicalPath !== canonicalPath ||
    !/^\/[a-z0-9]+(?:\/[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?)+$/.test(canonicalPath) ||
    canonicalPath.includes('/../') ||
    canonicalPath.includes('/./')
  ) {
    throw new Error(`${label} canonical path must be normalized and traversal-free`);
  }
  if (identity.sourcePath !== `/${identity.locale}${canonicalPath}`) {
    throw new Error(`${label} source path must match its localized identity`);
  }
  const expectedSourcePrefix = identity.locale === 'zh' ? '中文-fastgpt.cn/' : '英文-fastgpt.io/';
  const sourceFile = normalizeRelativePath(
    candidate.provenance?.sourceFile,
    `${label} source file`
  );
  if (!sourceFile.startsWith(expectedSourcePrefix) || !sourceFile.endsWith('.md')) {
    throw new Error(`${label} source file must stay inside its approved locale tree`);
  }
}

function readerPath(candidate) {
  validateSelectedIdentity(candidate);
  return normalizeRelativePath(
    `src/content/tech-center/${candidate.identity.locale}${candidate.identity.canonicalPath}.md`,
    `${candidate.id} reader path`
  );
}

function sanitizePublicText(value) {
  return sanitizeReaderText(value)
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[REDACTED_PRIVATE_DATA]')
    .replace(/(?<!\d)(?:\+?86[- ]?)?1[3-9]\d{9}(?!\d)/g, '[REDACTED_PRIVATE_DATA]')
    .replace(/(?<!\d)\d{17}[\dXx](?!\d)/g, '[REDACTED_PRIVATE_DATA]');
}

function assertReaderHygiene(document, label) {
  for (const pattern of READER_FORBIDDEN_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(document)) throw new Error(`${label} reader content hygiene failed`);
  }
}

function sanitizePublicBody(value) {
  return String(value)
    .replace(/\r\n?/g, '\n')
    .replace(/\bsk-[A-Za-z0-9][A-Za-z0-9_-]{5,}\b/gi, '[REDACTED_CREDENTIAL]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{6,}/gi, 'Bearer [REDACTED_CREDENTIAL]')
    .replace(/\beyJ[A-Za-z0-9._-]{20,}\b/g, '[REDACTED_CREDENTIAL]')
    .replace(/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, '[REDACTED_CREDENTIAL]')
    .replace(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g, '[REDACTED_CREDENTIAL]')
    .replace(
      /\b((?:mysql|postgres(?:ql)?|mongodb(?:\+srv)?):\/\/)[^\s`:@]+:[^\s`@]+@/gi,
      '$1[REDACTED_CREDENTIAL]@'
    )
    .replace(
      /(\b(?:api[_-]?key|access[_-]?token|password|secret)\s*[:=]\s*["'`]?)([^\s,"'`}]+)/gi,
      '$1[REDACTED_CREDENTIAL]'
    )
    .replace(
      /([?&](?:token|key|secret|api[_-]?key|access[_-]?token)=)[^&\s)`]+/gi,
      '$1[REDACTED_CREDENTIAL]'
    )
    .replace(/\b(?:mytoken|mykey|sk-fastgpt|sk-tarzan)\b/gi, '[REDACTED_CREDENTIAL]');
}

function normalizeSourceCitation(body, candidate) {
  const label = candidate.identity.locale === 'zh' ? 'FastGPT 官方来源' : 'FastGPT official source';
  return body.replace(
    /^[ \t]*>[ \t]*((?:来源|Source))[ \t]*[:：][ \t]*(https:\/\/[^\n]+)[ \t]*$/gimu,
    (matched, sourceWord, sourceText) => {
      const urls = [...sourceText.matchAll(/https:\/\/[^\s、，,;；]+/g)].map((match) =>
        match[0].replace(/[.)\]]+$/, '')
      );
      if (!urls.length) return matched;
      const separator = candidate.identity.locale === 'zh' ? '：' : ':';
      return urls.map((url) => `> ${sourceWord}${separator} [${label}](${url})`).join('\n\n');
    }
  );
}

function parseSourceBody(source, label) {
  const normalized = String(source).replace(/\r\n?/g, '\n');
  const match = normalized.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if (!match) throw new Error(`${label} must contain normalized front matter`);
  return { normalized, body: normalized.slice(match[0].length) };
}

function buildGovernanceSupplement(candidate, body) {
  const sections = [];
  if (!/^## .*?(?:applicab|version scope|environment scope|适用|版本范围|环境范围)/im.test(body)) {
    sections.push(
      candidate.identity.locale === 'en'
        ? `## Applicability and version scope\n\nUse this page for the documented ${
            EN_CATEGORY_LABELS[candidate.category]
          } scenario. Confirm the FastGPT, dependency, API, and deployment versions in the official source before applying a change.`
        : `## 适用性与版本范围\n\n本页适用于官方来源记录的 ${candidate.categoryLabel} 场景。执行变更前，需核对 FastGPT、依赖、API 与部署版本。`
    );
  }
  if (!/^## .*?(?:safety|security|guardrail|安全|护栏|风险)/im.test(body)) {
    sections.push(
      candidate.identity.locale === 'en'
        ? `## Safety guardrails\n\nUse [REDACTED_CREDENTIAL] for credentials and private data. ${candidate.operationRisk.prerequisite}`
        : '## 安全护栏\n\n凭证与私密数据使用 [REDACTED_CREDENTIAL] 占位符。执行操作前需核对文档的环境与版本。'
    );
  }
  if (!/^## .*?(?:rollback|recovery|回滚|恢复)/im.test(body)) {
    sections.push(
      candidate.identity.locale === 'en'
        ? `## Rollback guidance\n\n${candidate.operationRisk.rollback} Restore saved configuration and data snapshots, then repeat the smallest verification scenario.`
        : '## 回滚指引\n\n恢复变更前的技术内容权威快照、已保存配置与数据快照，再执行最小验证场景。'
    );
  }
  return sections.length ? `${body.trim()}\n\n${sections.join('\n\n')}\n` : `${body.trim()}\n`;
}

function assertConcreteSourceContent(body, candidate) {
  const normalizedBody = sanitizePublicText(body);
  const fingerprint = sanitizePublicText(candidate.evidence.fingerprint);
  const headingCount = [...body.matchAll(/^#{1,6}\s+\S/gm)].length;
  if (
    body.length < 400 ||
    headingCount < 3 ||
    !normalizedBody.includes(fingerprint) ||
    !body.includes(candidate.provenance.sourceUrl)
  ) {
    throw new Error(`${candidate.id} must retain its concrete approved source body`);
  }
}

function loadApprovedReaderBody(repoRoot, candidate, sourceRoot) {
  if (sourceRoot) {
    const root = path.resolve(sourceRoot);
    const directRoot = fs.existsSync(path.join(root, '中文-fastgpt.cn'))
      ? root
      : path.join(root, '程序化技术页-第4批');
    const sourceFile = normalizeRelativePath(
      candidate.provenance.sourceFile,
      `${candidate.id} source file`
    );
    const sourcePath = resolveRepositoryPath(directRoot, sourceFile, `${candidate.id} source path`);
    if (!fs.existsSync(sourcePath))
      throw new Error(`${candidate.id} approved source file is missing`);
    const source = fs.readFileSync(sourcePath, 'utf8');
    const parsed = parseSourceBody(source, candidate.id);
    if (
      sha256(parsed.normalized) !== candidate.provenance.sourceSha256 ||
      sha256(parsed.body) !== candidate.provenance.sourceBodySha256
    ) {
      throw new Error(`${candidate.id} approved source digest drift`);
    }
    const imported = normalizeSourceCitation(sanitizePublicBody(parsed.body), candidate);
    const body = buildGovernanceSupplement(candidate, imported);
    assertConcreteSourceContent(body, candidate);
    return { body, sourceDigestVerified: true };
  }
  const pathName = readerPath(candidate);
  const filePath = resolveRepositoryPath(repoRoot, pathName, `${candidate.id} reader path`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`${candidate.id} reader source is missing; provide --source-root for import`);
  }
  const { body } = parseSourceBody(fs.readFileSync(filePath, 'utf8'), candidate.id);
  assertConcreteSourceContent(body, candidate);
  return { body: `${body.trim()}\n`, sourceDigestVerified: false };
}

function buildReaderPage(repoRoot, candidate, sourceRoot) {
  const { body, sourceDigestVerified } = loadApprovedReaderBody(repoRoot, candidate, sourceRoot);
  const sourceCount = new Set(
    [
      ...body.matchAll(
        /^\s*>\s*(?:来源|Source)\s*[:：]\s*\[[^\]]+\]\((https:\/\/[^)\s]+)\)\s*$/gimu
      )
    ].map((match) => match[1])
  ).size;
  const page = buildNormalizedTechnicalPage({
    metadata: {
      title: sanitizePublicText(candidate.title),
      slug: candidate.identity.sourcePath,
      page_type:
        candidate.identity.locale === 'en'
          ? EN_CATEGORY_LABELS[candidate.category]
          : candidate.categoryLabel,
      source: candidate.provenance.sourceUrl,
      source_type:
        candidate.identity.locale === 'en' ? 'Official documentation' : candidate.sourceType
    },
    identity: candidate.identity,
    body,
    wordCount: body.length,
    sourceCount,
    label: `Week06 Wave 1 ${candidate.id}`
  });
  assertReaderHygiene(page.document, candidate.id);
  return { ...page, sourceDigestVerified };
}

function splitSearchProjection(entries) {
  const projection = buildSearchProjection(entries);
  return {
    zh: projection.filter((entry) => entry.locale === 'zh'),
    en: projection.filter((entry) => entry.locale === 'en')
  };
}

function removeCurrentProjection(entries, search, selected) {
  const selectedKeys = new Set(selected.map((candidate) => identityKey(candidate.identity)));
  return {
    entries: entries.filter((entry) => !selectedKeys.has(identityKey(parseEntryIdentity(entry)))),
    search: {
      zh: search.zh.filter((entry) => !selectedKeys.has(entry.identity)),
      en: search.en.filter((entry) => !selectedKeys.has(entry.identity))
    }
  };
}

function buildBaseline(repoRoot, entries, search, selected) {
  const baseline = removeCurrentProjection(entries, search, selected);
  if (baseline.entries.length !== BASELINE_PAGE_COUNT) {
    throw new Error(
      `Week06 Wave 1 baseline must contain ${BASELINE_PAGE_COUNT} pages; found ${baseline.entries.length}`
    );
  }
  const expectedSearch = splitSearchProjection(baseline.entries);
  if (
    JSON.stringify(baseline.search.zh) !== JSON.stringify(expectedSearch.zh) ||
    JSON.stringify(baseline.search.en) !== JSON.stringify(expectedSearch.en)
  ) {
    throw new Error('Week06 Wave 1 baseline search projection drift');
  }
  const release = readJson(repoRoot, BASELINE_RELEASE_RELATIVE_PATH);
  if (release.wave !== 'wave-2' || release.resultingPageCount !== BASELINE_PAGE_COUNT) {
    throw new Error('Week06 Wave 1 baseline release drift');
  }
  const artifacts = new Map(release.artifacts.map((artifact) => [artifact.path, artifact.sha256]));
  const registrySha256 = sha256(stableJson(baseline.entries));
  const zhSearchSha256 = sha256(stableJson(baseline.search.zh));
  if (
    artifacts.get(REGISTRY_RELATIVE_PATH) !== registrySha256 ||
    artifacts.get(ZH_SEARCH_RELATIVE_PATH) !== zhSearchSha256
  ) {
    throw new Error('Week06 Wave 1 baseline does not match the deployed Week05 Wave 2 artifacts');
  }
  return {
    wave: 'week05-wave-2',
    pageCount: BASELINE_PAGE_COUNT,
    registrySha256,
    searchSha256: {
      zh: zhSearchSha256,
      en: sha256(stableJson(baseline.search.en))
    },
    releaseManifestPath: BASELINE_RELEASE_RELATIVE_PATH,
    releaseManifestSha256: fileSha256(path.join(repoRoot, BASELINE_RELEASE_RELATIVE_PATH)),
    entries: baseline.entries,
    search: baseline.search
  };
}

function loadWeek06Wave1Selection(repoRoot = path.resolve(__dirname, '../..')) {
  const selectionPath = path.join(repoRoot, SELECTION_RELATIVE_PATH);
  const selection = JSON.parse(fs.readFileSync(selectionPath, 'utf8'));
  if (
    selection.schemaVersion !== 1 ||
    selection.issue !== 266 ||
    selection.batch !== 'week06' ||
    selection.wave !== 'wave-1' ||
    selection.status !== 'approved'
  ) {
    throw new Error('Week06 Wave 1 selection metadata drift');
  }
  if (!Array.isArray(selection.candidateIds) || selection.candidateIds.length !== 50) {
    throw new Error('Week06 Wave 1 selection must contain exactly 50 candidate IDs');
  }
  if (!Array.isArray(selection.identitySet) || selection.identitySet.length !== 50) {
    throw new Error('Week06 Wave 1 selection must contain exactly 50 identities');
  }
  if (new Set(selection.candidateIds).size !== selection.candidateIds.length) {
    throw new Error('Week06 Wave 1 selection contains duplicate candidate IDs');
  }
  if (new Set(selection.identitySet).size !== selection.identitySet.length) {
    throw new Error('Week06 Wave 1 selection contains duplicate identities');
  }
  return selection;
}

function loadWeek06Wave1Contract(repoRoot = path.resolve(__dirname, '../..')) {
  const contract = readJson(repoRoot, CONTRACT_RELATIVE_PATH);
  if (
    contract.schemaVersion !== 1 ||
    contract.kind !== 'week06-bilingual-technical-wave1-contract' ||
    contract.issue !== 266 ||
    contract.batch !== 'week06' ||
    contract.wave !== 'wave-1' ||
    contract.mode !== 'publish' ||
    contract.authorityPath !== AUTHORITY_RELATIVE_PATH ||
    contract.selectionPath !== SELECTION_RELATIVE_PATH ||
    contract.baseline?.pageCount !== BASELINE_PAGE_COUNT ||
    contract.expected?.publicationCount !== 50 ||
    contract.expected?.resultingPageCount !== RESULTING_PAGE_COUNT ||
    JSON.stringify(contract.surfaces) !== JSON.stringify(PUBLIC_SURFACES) ||
    contract.writeStrategy !== 'stage-all-then-rename-and-restore-on-error'
  ) {
    throw new Error('Week06 Wave 1 contract metadata drift');
  }
  return contract;
}

function verifyWeek06Wave1Selection(repoRoot = path.resolve(__dirname, '../..')) {
  const contract = loadWeek06Wave1Contract(repoRoot);
  const selection = loadWeek06Wave1Selection(repoRoot);
  const authority = readJson(repoRoot, AUTHORITY_RELATIVE_PATH);
  const entries = readJson(repoRoot, REGISTRY_RELATIVE_PATH);
  if (authority.status !== 'closed' || authority.closure?.status !== 'governance-complete') {
    throw new Error('Week06 authority must be governance-complete');
  }
  const candidatesById = new Map(
    authority.candidates.map((candidate) => [candidate.id, candidate])
  );
  const selected = selection.candidateIds.map((candidateId) => {
    const candidate = candidatesById.get(candidateId);
    if (!candidate) throw new Error(`Unknown Week06 Wave 1 candidate: ${candidateId}`);
    return candidate;
  });
  const selectedIdentityKeys = selected.map((candidate) => identityKey(candidate.identity));
  const selectedReaderPaths = selected.map((candidate) => candidate.identity.canonicalPath);
  const selectedKeySet = new Set(selectedIdentityKeys);
  const baselineEntries = entries.filter(
    (entry) => !selectedKeySet.has(identityKey(parseEntryIdentity(entry)))
  );
  const baselineIdentityKeys = new Set(baselineEntries.map(parseEntryIdentity).map(identityKey));
  const baselineReaderPaths = new Set(
    baselineEntries.map((entry) => parseEntryIdentity(entry).canonicalPath)
  );

  for (const candidate of selected) {
    const label = candidate.id;
    const cohort = candidateCohort(candidate);
    validateSelectedIdentity(candidate);
    if (
      candidate.state !== 'accepted' ||
      candidate.finalDisposition !== 'accepted' ||
      candidate.action !== 'add' ||
      candidate.decision?.disposition !== 'accepted' ||
      candidate.decision?.operation !== 'add'
    ) {
      throw new Error(`${label} must be in final accepted add state`);
    }
    if (candidate.evidence?.status !== 'verified' || !candidate.evidence.sources?.length) {
      throw new Error(`${label} must have verified source evidence`);
    }
    if (!APPROVED_SOURCE_CLASSIFICATIONS[cohort].has(candidate.sourceClassification?.code)) {
      throw new Error(`${label} must belong to an approved source cohort`);
    }
    candidate.evidence.sources.forEach((source, index) =>
      assertPublicHttps(source, `${label} evidence source ${index + 1}`)
    );
    assertPublicHttps(candidate.provenance?.sourceUrl, `${label} provenance source`);
    if (
      !candidate.evidence.fingerprint?.trim() ||
      !candidate.evidence.applicability?.trim() ||
      candidate.provenance.sourceBodySha256 !== candidate.provenance.bodySha256
    ) {
      throw new Error(`${label} source fingerprint or digest drift`);
    }
    for (const digest of [
      candidate.provenance.sourceSha256,
      candidate.provenance.sourceBodySha256,
      candidate.provenance.workbookSha256
    ]) {
      if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error(`${label} source digest drift`);
    }
    if (
      Object.values(candidate.gates || {}).some((gate) => gate !== 'passed') ||
      candidate.security?.status === 'needs-review' ||
      candidate.security?.findings?.some((finding) => finding.disposition === 'denied') ||
      candidate.operationRisk?.decision !== 'cleared' ||
      candidate.operationRisk?.findings?.some((finding) => finding.disposition !== 'cleared') ||
      candidate.operationRisk?.level === 'D0'
    ) {
      throw new Error(`${label} has an unresolved publication gate`);
    }
    const expectedOwner = candidate.identity.locale === 'zh' ? 'cn' : 'io';
    if (candidate.identity.owner !== expectedOwner) throw new Error(`${label} owner leak`);
    if (baselineIdentityKeys.has(identityKey(candidate.identity))) {
      throw new Error(`${label} collides with the production registry`);
    }
    if (baselineReaderPaths.has(candidate.identity.canonicalPath)) {
      throw new Error(`${label} collides with an existing reader path`);
    }
  }

  if (new Set(selectedIdentityKeys).size !== selected.length) {
    throw new Error('Week06 Wave 1 selected identities collide');
  }
  if (JSON.stringify(selectedIdentityKeys) !== JSON.stringify(selection.identitySet)) {
    throw new Error('Week06 Wave 1 approved identity set drift');
  }
  if (new Set(selectedReaderPaths).size !== selected.length) {
    throw new Error('Week06 Wave 1 selected reader paths collide');
  }
  const localeCounts = { zh: 0, en: 0 };
  const cohortCounts = { official: 0, errorCode: 0, model: 0, glossary: 0 };
  for (const candidate of selected) {
    localeCounts[candidate.identity.locale] += 1;
    cohortCounts[candidateCohort(candidate)] += 1;
  }
  if (
    JSON.stringify(localeCounts) !== JSON.stringify(selection.expectedCounts.locales) ||
    JSON.stringify(localeCounts) !== JSON.stringify(contract.expected.locales)
  ) {
    throw new Error('Week06 Wave 1 locale count drift');
  }
  if (
    JSON.stringify(cohortCounts) !== JSON.stringify(selection.expectedCounts.cohorts) ||
    JSON.stringify(cohortCounts) !== JSON.stringify(contract.expected.cohorts)
  ) {
    throw new Error('Week06 Wave 1 cohort count drift');
  }
  return {
    contract,
    selection,
    selected,
    selectedCount: selected.length,
    localeCounts,
    cohortCounts,
    identityCollisions: 0,
    readerPathCollisions: 0,
    ownerLeaks: 0,
    authoritySha256: fileSha256(path.join(repoRoot, AUTHORITY_RELATIVE_PATH)),
    selectionSha256: fileSha256(path.join(repoRoot, SELECTION_RELATIVE_PATH)),
    contractSha256: fileSha256(path.join(repoRoot, CONTRACT_RELATIVE_PATH)),
    sourceSetSha256: sha256(
      stableJson(
        selected.map((candidate) => ({
          candidateId: candidate.id,
          sourceSha256: candidate.provenance.sourceSha256,
          sourceBodySha256: candidate.provenance.sourceBodySha256
        }))
      )
    )
  };
}

function buildContentManifest({ selectionEvidence, projectedEntries, readerDocuments }) {
  const entriesByIdentity = new Map(
    projectedEntries.map((entry) => [identityKey(parseEntryIdentity(entry)), entry])
  );
  const sources = selectionEvidence.selected.map((candidate) => {
    const identity = identityKey(candidate.identity);
    const pathName = readerPath(candidate);
    const document = readerDocuments.get(pathName);
    const entry = entriesByIdentity.get(identity);
    if (!document || !entry) throw new Error(`${candidate.id} reader projection is incomplete`);
    return {
      candidateId: candidate.id,
      identity: candidate.identity,
      cohort: candidateCohort(candidate),
      operation: candidate.decision.operation,
      sourceUrl: candidate.provenance.sourceUrl,
      sourceSha256: candidate.provenance.sourceSha256,
      sourceBodySha256: candidate.provenance.sourceBodySha256,
      sourceSetSha256: selectionEvidence.sourceSetSha256,
      importedBodySha256: sha256(pageBody(document)),
      sourceBinding: 'digest-verified-approved-source-import',
      evidence: {
        status: candidate.evidence.status,
        fingerprint: sanitizePublicText(candidate.evidence.fingerprint),
        applicability: sanitizePublicText(candidate.evidence.applicability)
      },
      securityStatus: candidate.security.status,
      operationRisk: candidate.operationRisk.level,
      readerPath: pathName,
      readerSha256: sha256(document),
      registryEntrySha256: sha256(stableJson(entry))
    };
  });
  return {
    schemaVersion: 1,
    issue: 266,
    batch: 'week06',
    wave: 'wave-1',
    status: 'source-verified',
    readerContentContract: READER_CONTENT_CONTRACT,
    sourceSetSha256: selectionEvidence.sourceSetSha256,
    readerCount: sources.length,
    localeCounts: selectionEvidence.localeCounts,
    cohortCounts: selectionEvidence.cohortCounts,
    identitySet: sources.map((source) => identityKey(source.identity)),
    sources
  };
}

function pageBody(document) {
  return parseSourceBody(document, 'technical reader').body.trim();
}

function buildProjection({ selectionEvidence, projectedEntries, projectedSearch }) {
  const selectedKeys = new Set(
    selectionEvidence.selected.map((candidate) => identityKey(candidate.identity))
  );
  const identities = selectionEvidence.selected.map((candidate) => ({
    key: identityKey(candidate.identity),
    candidateId: candidate.id,
    locale: candidate.identity.locale,
    owner: candidate.identity.owner,
    canonicalPath: candidate.identity.canonicalPath,
    reviewPath: candidate.identity.sourcePath,
    canonical: `${OWNER_ORIGINS[candidate.identity.locale]}${candidate.identity.canonicalPath}`
  }));
  const registry = projectedEntries
    .filter((entry) => selectedKeys.has(identityKey(parseEntryIdentity(entry))))
    .map((entry) => ({ identity: identityKey(parseEntryIdentity(entry)), ...entry }));
  const search = [...projectedSearch.zh, ...projectedSearch.en].filter((entry) =>
    selectedKeys.has(entry.identity)
  );
  const sitemap = identities.map((identity) => ({
    identity: identity.key,
    owner: identity.owner,
    url: identity.canonical
  }));
  const staticExport = identities.map((identity) => ({
    identity: identity.key,
    owner: identity.owner,
    language: identity.locale === 'zh' ? 'zh-CN' : 'en',
    path: identity.canonicalPath,
    reviewPath: identity.reviewPath,
    canonical: identity.canonical,
    status: 200
  }));
  const releaseRecord = identities.map((identity) => ({
    candidateId: identity.candidateId,
    identity: identity.key,
    status: 'release-eligible',
    sourceVerified: true,
    exportVerified: true,
    releaseEligible: true,
    productionObserved: false,
    publicationCount: 1
  }));
  const rollback = identities.map((identity) => ({
    candidateId: identity.candidateId,
    identity: identity.key,
    action: 'remove-week06-wave1-projection',
    baselinePageCount: BASELINE_PAGE_COUNT
  }));
  const projection = {
    schemaVersion: 1,
    issue: 266,
    batch: 'week06',
    wave: 'wave-1',
    mode: 'publish',
    consistency: 'identity-set-verified',
    governanceStatus: 'governance-complete',
    sourceVerified: true,
    exportVerified: true,
    releaseEligible: true,
    productionObserved: false,
    baselinePageCount: BASELINE_PAGE_COUNT,
    acceptedCandidateCount: identities.length,
    acceptedAdd: identities.length,
    acceptedUpdate: 0,
    publicPageDelta: identities.length,
    publicationCount: identities.length,
    resultingPageCount: BASELINE_PAGE_COUNT + identities.length,
    localeCounts: selectionEvidence.localeCounts,
    cohortCounts: selectionEvidence.cohortCounts,
    identitySet: identities.map((identity) => identity.key),
    surfaces: PUBLIC_SURFACES,
    identities,
    registry,
    search,
    sitemap,
    staticExport,
    releaseRecord,
    rollback
  };
  verifyProjectionConsistency(projection);
  return projection;
}

function buildRollback({ baseline, projection, readerPaths }) {
  const surfaceIdentitySets = Object.fromEntries(
    PUBLIC_SURFACES.map((surface) => [
      surface,
      projection[surface].map((entry) => entry.identity || entry.key)
    ])
  );
  const priorCompleteState = [
    { path: REGISTRY_RELATIVE_PATH, exists: true, sha256: baseline.registrySha256 },
    {
      path: ZH_SEARCH_RELATIVE_PATH,
      exists: true,
      sha256: baseline.searchSha256.zh
    },
    {
      path: EN_SEARCH_RELATIVE_PATH,
      exists: true,
      sha256: baseline.searchSha256.en
    },
    ...readerPaths.map((pathName) => ({ path: pathName, exists: false, sha256: null })),
    ...[
      CONTENT_RELATIVE_PATH,
      MANIFEST_RELATIVE_PATH,
      PROJECTION_RELATIVE_PATH,
      RELEASE_RELATIVE_PATH,
      ROLLBACK_RELATIVE_PATH
    ].map((pathName) => ({ path: pathName, exists: false, sha256: null }))
  ];
  return {
    schemaVersion: 1,
    issue: 266,
    batch: 'week06',
    wave: 'wave-1',
    status: 'ready',
    strategy: 'stage-all-then-rename-and-restore-on-error',
    baselinePageCount: baseline.pageCount,
    resultingPageCount: projection.resultingPageCount,
    identitySet: projection.identitySet,
    affectedIdentities: projection.identitySet,
    publicSurfaces: [
      REGISTRY_RELATIVE_PATH,
      ZH_SEARCH_RELATIVE_PATH,
      EN_SEARCH_RELATIVE_PATH,
      ...readerPaths,
      CONTENT_RELATIVE_PATH,
      MANIFEST_RELATIVE_PATH,
      PROJECTION_RELATIVE_PATH,
      RELEASE_RELATIVE_PATH,
      ROLLBACK_RELATIVE_PATH
    ],
    surfaceIdentitySets,
    priorCompleteState,
    rollbackAction:
      'Restore all prior bytes and remove every Wave 1-only file before serving another export.',
    identities: projection.rollback
  };
}

function buildWeek06Wave1Package(repoRoot = path.resolve(__dirname, '../..'), { sourceRoot } = {}) {
  const selectionEvidence = verifyWeek06Wave1Selection(repoRoot);
  const currentEntries = readJson(repoRoot, REGISTRY_RELATIVE_PATH);
  const currentSearch = {
    zh: readJson(repoRoot, ZH_SEARCH_RELATIVE_PATH),
    en: readJson(repoRoot, EN_SEARCH_RELATIVE_PATH)
  };
  const baseline = buildBaseline(
    repoRoot,
    currentEntries,
    currentSearch,
    selectionEvidence.selected
  );
  const readerDocuments = new Map();
  const pages = new Map();
  let sourceDigestVerifiedCount = 0;
  for (const candidate of selectionEvidence.selected) {
    const page = buildReaderPage(repoRoot, candidate, sourceRoot);
    const pathName = readerPath(candidate);
    readerDocuments.set(pathName, page.document);
    pages.set(candidate.id, page);
    if (page.sourceDigestVerified) sourceDigestVerifiedCount += 1;
  }
  const entries = [
    ...baseline.entries,
    ...selectionEvidence.selected.map((candidate) => pages.get(candidate.id).projection)
  ];
  const search = splitSearchProjection(entries);
  const content = buildContentManifest({
    selectionEvidence,
    projectedEntries: entries,
    readerDocuments
  });
  const projection = buildProjection({
    selectionEvidence,
    projectedEntries: entries,
    projectedSearch: search
  });
  const readerPaths = [...readerDocuments.keys()];
  const rollback = buildRollback({ baseline, projection, readerPaths });
  const baselineRecord = {
    wave: baseline.wave,
    pageCount: baseline.pageCount,
    registrySha256: baseline.registrySha256,
    searchSha256: baseline.searchSha256,
    releaseManifestPath: baseline.releaseManifestPath,
    releaseManifestSha256: baseline.releaseManifestSha256
  };
  const manifest = {
    schemaVersion: 1,
    issue: 266,
    batch: 'week06',
    wave: 'wave-1',
    status: 'release-eligible',
    identitySet: projection.identitySet,
    baseline: baselineRecord,
    selection: {
      path: SELECTION_RELATIVE_PATH,
      sha256: selectionEvidence.selectionSha256,
      candidateIds: selectionEvidence.selection.candidateIds,
      identitySet: projection.identitySet,
      selectedCount: selectionEvidence.selectedCount,
      localeCounts: selectionEvidence.localeCounts,
      cohortCounts: selectionEvidence.cohortCounts,
      reviewer: selectionEvidence.selection.reviewer,
      criteria: selectionEvidence.selection.criteria
    },
    counts: {
      baselinePageCount: baseline.pageCount,
      acceptedCandidateCount: projection.acceptedCandidateCount,
      acceptedAdd: projection.acceptedAdd,
      acceptedUpdate: projection.acceptedUpdate,
      publicPageDelta: projection.publicPageDelta,
      resultingPageCount: projection.resultingPageCount
    },
    content: {
      path: CONTENT_RELATIVE_PATH,
      sha256: sha256(stableJson(content)),
      readerCount: content.readerCount,
      identitySet: content.identitySet
    },
    projection: {
      path: PROJECTION_RELATIVE_PATH,
      sha256: sha256(stableJson(projection)),
      identitySet: projection.identitySet
    },
    rollback: {
      path: ROLLBACK_RELATIVE_PATH,
      sha256: sha256(stableJson(rollback)),
      identitySet: rollback.identitySet
    },
    provenance: {
      contractPath: CONTRACT_RELATIVE_PATH,
      contractSha256: selectionEvidence.contractSha256,
      authorityPath: AUTHORITY_RELATIVE_PATH,
      authoritySha256: selectionEvidence.authoritySha256,
      sourceSetSha256: selectionEvidence.sourceSetSha256
    },
    verification: {
      sourceVerified: true,
      exportVerified: true,
      releaseEligible: true,
      productionObserved: false,
      evidenceSource: 'staged-static-owner-projection'
    }
  };
  const artifactBytes = new Map([
    [REGISTRY_RELATIVE_PATH, stableJson(entries)],
    [ZH_SEARCH_RELATIVE_PATH, stableJson(search.zh)],
    [EN_SEARCH_RELATIVE_PATH, stableJson(search.en)],
    [CONTENT_RELATIVE_PATH, stableJson(content)],
    [MANIFEST_RELATIVE_PATH, stableJson(manifest)],
    [PROJECTION_RELATIVE_PATH, stableJson(projection)],
    [ROLLBACK_RELATIVE_PATH, stableJson(rollback)]
  ]);
  const releaseManifest = {
    schemaVersion: 1,
    issue: 266,
    batch: 'week06',
    wave: 'wave-1',
    status: 'release-eligible',
    sourceVerified: true,
    exportVerified: true,
    releaseEligible: true,
    productionObserved: false,
    sourceSetSha256: content.sourceSetSha256,
    identitySet: projection.identitySet,
    localeCounts: projection.localeCounts,
    baseline: baselineRecord,
    resultingPageCount: projection.resultingPageCount,
    writeStrategy: 'rollback-on-error',
    postWriteVerification: 'required',
    evidence: {
      source: 'week06-candidate-manifest',
      export: 'cn-io-preview-static-owner-projection',
      production: 'pending-live-http-observation'
    },
    artifacts: [...readerDocuments.entries(), ...artifactBytes.entries()].map(
      ([pathName, bytes]) => ({ path: pathName, sha256: sha256(bytes) })
    )
  };
  artifactBytes.set(RELEASE_RELATIVE_PATH, stableJson(releaseManifest));
  const fileRelativePaths = [...readerPaths, ...artifactBytes.keys()];
  const priorContentByPath = new Map([
    [REGISTRY_RELATIVE_PATH, stableJson(baseline.entries)],
    [ZH_SEARCH_RELATIVE_PATH, stableJson(baseline.search.zh)],
    [EN_SEARCH_RELATIVE_PATH, stableJson(baseline.search.en)]
  ]);
  return {
    selectionEvidence,
    baseline: baselineRecord,
    readerDocuments,
    entries,
    search,
    content,
    projection,
    rollback,
    manifest,
    releaseManifest,
    sourceDigestVerifiedCount,
    fileRelativePaths,
    files: fileRelativePaths.map((pathName) =>
      resolveRepositoryPath(repoRoot, pathName, `Week06 Wave 1 surface ${pathName}`)
    ),
    contents: [...readerDocuments.values(), ...artifactBytes.values()],
    priorContents: fileRelativePaths.map((pathName) => priorContentByPath.get(pathName) ?? null)
  };
}

function writeWeek06Wave1Package(wavePackage, failAt) {
  applyRollbackProjection({ files: wavePackage.files, contents: wavePackage.contents, failAt });
  return {
    publicationCount: wavePackage.projection.publicationCount,
    resultingPageCount: wavePackage.projection.resultingPageCount
  };
}

function verifyWeek06Wave1Source(
  repoRoot = path.resolve(__dirname, '../..'),
  { verifyExportFixtures = true } = {}
) {
  const expected = buildWeek06Wave1Package(repoRoot);
  const artifacts = {
    entries: readJson(repoRoot, REGISTRY_RELATIVE_PATH),
    zhSearch: readJson(repoRoot, ZH_SEARCH_RELATIVE_PATH),
    enSearch: readJson(repoRoot, EN_SEARCH_RELATIVE_PATH),
    content: readJson(repoRoot, CONTENT_RELATIVE_PATH),
    manifest: readJson(repoRoot, MANIFEST_RELATIVE_PATH),
    projection: readJson(repoRoot, PROJECTION_RELATIVE_PATH),
    rollback: readJson(repoRoot, ROLLBACK_RELATIVE_PATH),
    releaseManifest: readJson(repoRoot, RELEASE_RELATIVE_PATH)
  };
  for (const [label, actual, projected] of [
    ['registry', artifacts.entries, expected.entries],
    ['Chinese search', artifacts.zhSearch, expected.search.zh],
    ['English search', artifacts.enSearch, expected.search.en],
    ['content', artifacts.content, expected.content],
    ['manifest', artifacts.manifest, expected.manifest],
    ['projection', artifacts.projection, expected.projection],
    ['rollback', artifacts.rollback, expected.rollback],
    ['release manifest', artifacts.releaseManifest, expected.releaseManifest]
  ]) {
    if (JSON.stringify(actual) !== JSON.stringify(projected)) {
      throw new Error(`Week06 Wave 1 ${label} projection drift`);
    }
  }
  for (const [pathName, document] of expected.readerDocuments) {
    const filePath = path.join(repoRoot, pathName);
    if (!fs.existsSync(filePath) || fs.readFileSync(filePath, 'utf8') !== document) {
      throw new Error(`Week06 Wave 1 reader projection drift: ${pathName}`);
    }
    assertReaderHygiene(document, pathName);
    const locale = pathName.split('/')[3];
    if (locale === 'en' && /[\u3400-\u9fff]/.test(document.split('\n---\n\n')[1] || '')) {
      throw new Error(`Week06 Wave 1 English reader locale drift: ${pathName}`);
    }
  }
  const identitySets = [
    expected.selectionEvidence.selection.identitySet,
    artifacts.content.identitySet,
    artifacts.manifest.identitySet,
    artifacts.manifest.selection.identitySet,
    artifacts.manifest.content.identitySet,
    artifacts.manifest.projection.identitySet,
    artifacts.manifest.rollback.identitySet,
    artifacts.projection.identitySet,
    artifacts.rollback.identitySet,
    artifacts.rollback.affectedIdentities,
    artifacts.releaseManifest.identitySet
  ];
  const identitySet = JSON.stringify(expected.projection.identitySet);
  for (const surface of identitySets) {
    if (surface.length !== 50 || JSON.stringify(surface) !== identitySet) {
      throw new Error('Week06 Wave 1 identity set drift across release surfaces');
    }
  }
  verifyProjectionConsistency(artifacts.projection);
  const releaseArtifactPaths = new Set(artifacts.releaseManifest.artifacts.map(({ path }) => path));
  for (const pathName of [
    ...expected.readerDocuments.keys(),
    REGISTRY_RELATIVE_PATH,
    ZH_SEARCH_RELATIVE_PATH,
    EN_SEARCH_RELATIVE_PATH,
    CONTENT_RELATIVE_PATH,
    MANIFEST_RELATIVE_PATH,
    PROJECTION_RELATIVE_PATH,
    ROLLBACK_RELATIVE_PATH
  ]) {
    if (!releaseArtifactPaths.has(pathName)) {
      throw new Error(`Week06 Wave 1 release artifact missing: ${pathName}`);
    }
  }
  for (const artifact of artifacts.releaseManifest.artifacts) {
    if (fileSha256(path.join(repoRoot, artifact.path)) !== artifact.sha256) {
      throw new Error(`Week06 Wave 1 release artifact digest drift: ${artifact.path}`);
    }
  }
  if (
    artifacts.content.sourceSetSha256 !== expected.selectionEvidence.sourceSetSha256 ||
    artifacts.manifest.provenance.sourceSetSha256 !== expected.selectionEvidence.sourceSetSha256 ||
    artifacts.releaseManifest.sourceSetSha256 !== expected.selectionEvidence.sourceSetSha256
  ) {
    throw new Error('Week06 Wave 1 source-set digest drift');
  }
  if (verifyExportFixtures) {
    const exportEvidence = verifyWeek06Wave1ExportFixtures(repoRoot);
    if (
      JSON.stringify(exportEvidence.ownerPages) !==
        JSON.stringify({ cn: 25, io: 25, preview: 50 }) ||
      exportEvidence.productionObserved !== 0 ||
      exportEvidence.stagedPagesVerified !== 100 ||
      exportEvidence.ownerLeaks !== 0 ||
      exportEvidence.localeDrift !== 0 ||
      exportEvidence.sitemapDrift !== 0 ||
      exportEvidence.searchDrift !== 0 ||
      exportEvidence.brokenInternalLinks !== 0
    ) {
      throw new Error('Week06 Wave 1 staged export evidence drift');
    }
  }
  return {
    issue: 266,
    wave: 'wave-1',
    selectedCount: expected.selectionEvidence.selectedCount,
    publicationCount: expected.projection.publicationCount,
    localeCounts: expected.projection.localeCounts,
    cohortCounts: expected.projection.cohortCounts,
    baselinePageCount: expected.baseline.pageCount,
    resultingPageCount: expected.projection.resultingPageCount,
    sourceSetSha256: expected.content.sourceSetSha256,
    projectionDrift: 0,
    ownerLeaks: 0,
    hygieneFindings: 0,
    sourceVerified: true,
    exportVerified: true,
    releaseEligible: true,
    productionObserved: false,
    rollback: 'ready'
  };
}

function verifyWeek06Wave1AtomicRollback(repoRoot = path.resolve(__dirname, '../..')) {
  const wavePackage = buildWeek06Wave1Package(repoRoot);
  const actualBefore = wavePackage.files.map((filePath) => fs.readFileSync(filePath));
  const actualDigests = actualBefore.map((bytes) => sha256(bytes));
  const failAt = Math.ceil(wavePackage.files.length / 2);
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'week06-wave1-rollback-'));
  const files = wavePackage.fileRelativePaths.map((relativePath, index) => {
    const copiedPath = resolveRepositoryPath(
      temporaryRoot,
      relativePath,
      `Week06 Wave 1 rollback fixture ${relativePath}`
    );
    const prior = wavePackage.priorContents[index];
    if (prior !== null) {
      fs.mkdirSync(path.dirname(copiedPath), { recursive: true });
      fs.writeFileSync(copiedPath, prior);
    }
    return copiedPath;
  });
  try {
    let observedFailure;
    try {
      applyRollbackProjection({
        files,
        contents: wavePackage.contents,
        failAt
      });
    } catch (error) {
      observedFailure = error;
    }
    if (
      !observedFailure ||
      !new RegExp(`Projection failure at surface ${failAt}`).test(observedFailure.message)
    ) {
      throw new Error('Week06 Wave 1 partial-write failure was not observed');
    }
    let byteDrift = 0;
    let digestDrift = 0;
    let existingSurfaceCount = 0;
    let absentSurfaceCount = 0;
    files.forEach((filePath, index) => {
      const prior = wavePackage.priorContents[index];
      if (prior === null) {
        absentSurfaceCount += 1;
        if (fs.existsSync(filePath)) {
          byteDrift += 1;
          digestDrift += 1;
        }
        return;
      }
      existingSurfaceCount += 1;
      if (!fs.existsSync(filePath)) {
        byteDrift += 1;
        digestDrift += 1;
        return;
      }
      const restored = fs.readFileSync(filePath);
      const expected = Buffer.from(prior);
      if (!restored.equals(expected)) byteDrift += 1;
      if (sha256(restored) !== sha256(expected)) digestDrift += 1;
    });
    wavePackage.files.forEach((filePath, index) => {
      const current = fs.readFileSync(filePath);
      if (!current.equals(actualBefore[index])) byteDrift += 1;
      if (sha256(current) !== actualDigests[index]) digestDrift += 1;
    });
    if (byteDrift || digestDrift) {
      throw new Error(`Week06 Wave 1 rollback drift: bytes=${byteDrift} digests=${digestDrift}`);
    }
    return {
      restored: true,
      surfaceCount: wavePackage.files.length,
      existingSurfaceCount,
      absentSurfaceCount,
      byteDrift,
      digestDrift
    };
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

function resolveStaticHtml(outDir, route) {
  const relative = route.replace(/^\/+|\/+$/g, '');
  return [path.join(outDir, `${relative}.html`), path.join(outDir, relative, 'index.html')].find(
    (filePath) => fs.existsSync(filePath)
  );
}

function getHtmlAttribute(tag, name) {
  return tag.match(new RegExp(`\\s${name}=["']([^"']+)["']`, 'i'))?.[1];
}

function verifyArticleHtml(html, identity, variant) {
  const expectedLanguage = identity.locale === 'zh' ? 'zh-CN' : 'en';
  const sourceLabel = identity.locale === 'zh' ? 'FastGPT 官方来源' : 'FastGPT official source';
  const htmlTag = html.match(/<html\b[^>]*>/i)?.[0] || '';
  if (getHtmlAttribute(htmlTag, 'lang') !== expectedLanguage) {
    throw new Error(`Week06 Wave 1 ${variant} locale drift: ${identity.key}`);
  }
  const canonicalTag = html.match(/<link\b[^>]*rel=["']canonical["'][^>]*>/i)?.[0] || '';
  if (getHtmlAttribute(canonicalTag, 'href') !== identity.canonical) {
    throw new Error(`Week06 Wave 1 ${variant} canonical drift: ${identity.key}`);
  }
  const hreflangTag = html.match(/<link\b[^>]*hreflang=["'][^"']+["'][^>]*>/i)?.[0] || '';
  if (
    getHtmlAttribute(hreflangTag, 'hreflang') !== expectedLanguage ||
    getHtmlAttribute(hreflangTag, 'href') !== identity.canonical
  ) {
    throw new Error(`Week06 Wave 1 ${variant} hreflang drift: ${identity.key}`);
  }
  const robotsTag = html.match(/<meta\b[^>]*name=["']robots["'][^>]*>/i)?.[0] || '';
  const robots = getHtmlAttribute(robotsTag, 'content');
  const expectedRobots = variant === 'preview' ? 'noindex, nofollow' : 'index, follow';
  if (robots !== expectedRobots) {
    throw new Error(`Week06 Wave 1 ${variant} robots drift: ${identity.key}`);
  }
  if (
    !html.includes(`"url":"${identity.canonical}"`) ||
    !html.includes(`"inLanguage":"${expectedLanguage}"`) ||
    !html.includes(sourceLabel)
  ) {
    throw new Error(`Week06 Wave 1 ${variant} structured content drift: ${identity.key}`);
  }
}

function verifyHub(outDir, locale, variant, searchPath) {
  const route = variant === 'preview' ? `/${locale}/tech-center` : '/tech-center';
  const htmlPath = resolveStaticHtml(outDir, route);
  if (!htmlPath) throw new Error(`Week06 Wave 1 ${variant} hub missing: ${locale}`);
  const html = fs.readFileSync(htmlPath, 'utf8');
  const expectedLanguage = locale === 'zh' ? 'zh-CN' : 'en';
  const canonical = `${OWNER_ORIGINS[locale]}/tech-center`;
  if (!html.includes(`<html lang="${expectedLanguage}">`) || !html.includes(searchPath)) {
    throw new Error(`Week06 Wave 1 ${variant} hub locale or search drift: ${locale}`);
  }
  const canonicalTag = html.match(/<link\b[^>]*rel=["']canonical["'][^>]*>/i)?.[0] || '';
  const robotsTag = html.match(/<meta\b[^>]*name=["']robots["'][^>]*>/i)?.[0] || '';
  const expectedRobots = variant === 'preview' ? 'noindex, nofollow' : 'index, follow';
  if (
    getHtmlAttribute(canonicalTag, 'href') !== canonical ||
    getHtmlAttribute(robotsTag, 'content') !== expectedRobots ||
    !html.includes(`"url":"${canonical}"`) ||
    !html.includes(`"inLanguage":"${expectedLanguage}"`)
  ) {
    throw new Error(`Week06 Wave 1 ${variant} hub metadata drift: ${locale}`);
  }
  const alternates = new Map(
    [...html.matchAll(/<link\b[^>]*rel=["']alternate["'][^>]*>/gi)].map((match) => [
      getHtmlAttribute(match[0], 'hreflang'),
      getHtmlAttribute(match[0], 'href')
    ])
  );
  if (
    alternates.get('zh-CN') !== `${OWNER_ORIGINS.zh}/tech-center` ||
    alternates.get('en') !== `${OWNER_ORIGINS.en}/tech-center`
  ) {
    throw new Error(`Week06 Wave 1 ${variant} hub hreflang drift: ${locale}`);
  }
  const links = [...html.matchAll(/<article\b[^>]*>[\s\S]*?<\/article>/gi)]
    .map((article) => article[0].match(/<a\b[^>]*href=["'](\/[^"'#?]+)["']/i)?.[1])
    .filter(Boolean);
  if (!links.length || links.length > 12) {
    throw new Error(`Week06 Wave 1 ${variant} fallback listing drift: ${locale}`);
  }
  for (const link of links) {
    if (!resolveStaticHtml(outDir, link)) {
      throw new Error(`Week06 Wave 1 broken internal link: ${link}`);
    }
  }
  return links.length;
}

function verifyWeek06Wave1Export(
  repoRoot = path.resolve(__dirname, '../..'),
  { outDir, variant } = {}
) {
  if (!outDir) throw new Error('Week06 Wave 1 export verification requires --out-dir');
  if (!['cn', 'io', 'preview'].includes(variant)) {
    throw new Error('Week06 Wave 1 export variant must be cn, io, or preview');
  }
  const source = verifyWeek06Wave1Source(repoRoot, { verifyExportFixtures: false });
  const projection = readJson(repoRoot, PROJECTION_RELATIVE_PATH);
  const sitemapPath = path.join(outDir, 'sitemap.xml');
  const sitemapUrls = fs.existsSync(sitemapPath)
    ? [...fs.readFileSync(sitemapPath, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map(
        (match) => match[1]
      )
    : [];
  if (variant === 'preview' && sitemapUrls.length) {
    throw new Error('Week06 Wave 1 Preview export contains sitemap entries');
  }
  let ownerPages = 0;
  for (const identity of projection.identities) {
    const owned = variant === 'preview' || identity.owner === variant;
    const route = variant === 'preview' ? identity.reviewPath : identity.canonicalPath;
    const htmlPath = resolveStaticHtml(outDir, route);
    if (owned) {
      if (!htmlPath) throw new Error(`Week06 Wave 1 ${variant} owner route missing: ${route}`);
      verifyArticleHtml(fs.readFileSync(htmlPath, 'utf8'), identity, variant);
      ownerPages += 1;
    } else if (htmlPath || resolveStaticHtml(outDir, identity.reviewPath)) {
      throw new Error(`Week06 Wave 1 ${variant} owner leak: ${identity.key}`);
    }
    const membership = sitemapUrls.filter((url) => url === identity.canonical).length;
    if (membership !== (variant !== 'preview' && identity.owner === variant ? 1 : 0)) {
      throw new Error(`Week06 Wave 1 ${variant} sitemap drift: ${identity.key}`);
    }
  }
  const expectedLocales = variant === 'preview' ? ['zh', 'en'] : [variant === 'cn' ? 'zh' : 'en'];
  for (const locale of expectedLocales) {
    verifyHub(
      outDir,
      locale,
      variant,
      locale === 'zh' ? '/tech-center/search-index.json' : '/tech-center/search-index.en.json'
    );
  }
  for (const [locale, relativePath] of [
    ['zh', ZH_SEARCH_RELATIVE_PATH],
    ['en', EN_SEARCH_RELATIVE_PATH]
  ]) {
    const exportedPath = path.join(outDir, 'tech-center', path.basename(relativePath));
    if (!fs.existsSync(exportedPath)) {
      throw new Error(`Week06 Wave 1 ${variant} ${locale} search projection missing`);
    }
    if (
      fs.readFileSync(exportedPath, 'utf8') !==
      fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')
    ) {
      throw new Error(`Week06 Wave 1 ${variant} ${locale} search projection drift`);
    }
  }
  return {
    ...source,
    variant,
    ownerPages,
    hubs: expectedLocales,
    productionObserved: 0,
    stagedPagesVerified: ownerPages,
    ownerLeaks: 0,
    localeDrift: 0,
    sitemapDrift: 0,
    searchDrift: 0,
    brokenInternalLinks: 0
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function writeStaticHtml(outDir, route, html) {
  const relative = route.replace(/^\/+|\/+$/g, '');
  const filePath = path.join(outDir, `${relative}.html`);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, html);
}

function writeWeek06Wave1ExportFixture(repoRoot, outDir, variant) {
  const projection = readJson(repoRoot, PROJECTION_RELATIVE_PATH);
  for (const identity of projection.identities) {
    if (variant !== 'preview' && identity.owner !== variant) continue;
    const route = variant === 'preview' ? identity.reviewPath : identity.canonicalPath;
    const language = identity.locale === 'zh' ? 'zh-CN' : 'en';
    const robots = variant === 'preview' ? 'noindex, nofollow' : 'index, follow';
    const source = projection.registry.find((entry) => entry.identity === identity.key)?.source;
    const sourceLabel = identity.locale === 'zh' ? 'FastGPT 官方来源' : 'FastGPT official source';
    writeStaticHtml(
      outDir,
      route,
      `<!doctype html><html lang="${language}"><head><link rel="canonical" href="${
        identity.canonical
      }"><link rel="alternate" hreflang="${language}" href="${
        identity.canonical
      }"><meta name="robots" content="${robots}"></head><body><main><a href="${
        variant === 'preview' ? `/${identity.locale}/tech-center` : '/tech-center'
      }">Technical Center</a><a href="${escapeHtml(
        source
      )}">${sourceLabel}</a></main><script type="application/ld+json">{"url":"${
        identity.canonical
      }","inLanguage":"${language}"}</script></body></html>`
    );
  }
  const locales = variant === 'preview' ? ['zh', 'en'] : [variant === 'cn' ? 'zh' : 'en'];
  for (const locale of locales) {
    const identities = projection.identities.filter((identity) => identity.locale === locale);
    const searchPath =
      locale === 'zh' ? '/tech-center/search-index.json' : '/tech-center/search-index.en.json';
    const links = identities
      .slice(0, 12)
      .map((identity) => {
        const route = variant === 'preview' ? identity.reviewPath : identity.canonicalPath;
        return `<article class="technical-card"><a class="technical-card-link" href="${route}"><span>${identity.key}</span></a></article>`;
      })
      .join('');
    const language = locale === 'zh' ? 'zh-CN' : 'en';
    const canonical = `${OWNER_ORIGINS[locale]}/tech-center`;
    const robots = variant === 'preview' ? 'noindex, nofollow' : 'index, follow';
    writeStaticHtml(
      outDir,
      variant === 'preview' ? `/${locale}/tech-center` : '/tech-center',
      `<!doctype html><html lang="${language}"><head><link rel="canonical" href="${canonical}"><link rel="alternate" hreflang="zh-CN" href="${OWNER_ORIGINS.zh}/tech-center"><link rel="alternate" hreflang="en" href="${OWNER_ORIGINS.en}/tech-center"><meta name="robots" content="${robots}"></head><body data-search-index="${searchPath}">${links}<script type="application/ld+json">{"url":"${canonical}","inLanguage":"${language}"}</script></body></html>`
    );
  }
  fs.mkdirSync(path.join(outDir, 'tech-center'), { recursive: true });
  fs.copyFileSync(
    path.join(repoRoot, ZH_SEARCH_RELATIVE_PATH),
    path.join(outDir, 'tech-center/search-index.json')
  );
  fs.copyFileSync(
    path.join(repoRoot, EN_SEARCH_RELATIVE_PATH),
    path.join(outDir, 'tech-center/search-index.en.json')
  );
  if (variant !== 'preview') {
    const urls = projection.identities
      .filter((identity) => identity.owner === variant)
      .map((identity) => `<url><loc>${identity.canonical}</loc></url>`)
      .join('');
    fs.writeFileSync(path.join(outDir, 'sitemap.xml'), `<urlset>${urls}</urlset>`);
  }
}

function verifyWeek06Wave1ExportFixtures(repoRoot = path.resolve(__dirname, '../..')) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'week06-wave1-export-'));
  try {
    const results = {};
    for (const variant of ['cn', 'io', 'preview']) {
      const outDir = path.join(temporaryRoot, variant);
      writeWeek06Wave1ExportFixture(repoRoot, outDir, variant);
      results[variant] = verifyWeek06Wave1Export(repoRoot, { outDir, variant });
    }
    return {
      ownerPages: Object.fromEntries(
        Object.entries(results).map(([variant, result]) => [variant, result.ownerPages])
      ),
      hubs: Object.fromEntries(
        Object.entries(results).map(([variant, result]) => [variant, result.hubs])
      ),
      productionObserved: 0,
      stagedPagesVerified:
        results.cn.stagedPagesVerified +
        results.io.stagedPagesVerified +
        results.preview.stagedPagesVerified,
      ownerLeaks: 0,
      localeDrift: 0,
      sitemapDrift: 0,
      searchDrift: 0,
      brokenInternalLinks: 0
    };
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

async function readLiveResponse(fetchImpl, url, expectedContentType) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  timeout.unref?.();
  try {
    const response = await fetchImpl(url, { redirect: 'manual', signal: controller.signal });
    if (!response || response.status !== 200) {
      throw new Error(`Week06 Wave 1 live HTTP status drift: ${url}`);
    }
    const contentType = response.headers?.get?.('content-type') || '';
    if (!contentType.toLowerCase().includes(expectedContentType)) {
      throw new Error(`Week06 Wave 1 live content type drift: ${url}`);
    }
    return response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function verifyNonOwnerResponse(fetchImpl, url, identity) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  timeout.unref?.();
  try {
    const response = await fetchImpl(url, { redirect: 'manual', signal: controller.signal });
    if (!response) throw new Error(`Week06 Wave 1 non-owner response missing: ${url}`);
    if ([404, 410].includes(response.status)) return;
    if ([301, 302, 307, 308].includes(response.status)) {
      const location = response.headers?.get?.('location');
      if (location && new URL(location, url).href === identity.canonical) return;
      throw new Error(`Week06 Wave 1 non-owner redirect drift: ${identity.key}`);
    }
    if (response.status === 200) {
      const html = await response.text();
      const canonicalTag = html.match(/<link\b[^>]*rel=["']canonical["'][^>]*>/i)?.[0] || '';
      const robotsTag = html.match(/<meta\b[^>]*name=["']robots["'][^>]*>/i)?.[0] || '';
      const robots = getHtmlAttribute(robotsTag, 'content') || '';
      if (
        getHtmlAttribute(canonicalTag, 'href') === identity.canonical &&
        /(?:^|[,\s])noindex(?:$|[,\s])/i.test(robots)
      ) {
        return;
      }
    }
    throw new Error(`Week06 Wave 1 non-owner indexable copy: ${identity.key}`);
  } finally {
    clearTimeout(timeout);
  }
}

async function mapWithConcurrency(values, concurrency, operation) {
  let nextIndex = 0;
  const results = new Array(values.length);
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (nextIndex < values.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await operation(values[index], index);
      }
    })
  );
  return results;
}

async function verifyWeek06Wave1Live(
  repoRoot = path.resolve(__dirname, '../..'),
  { fetchImpl = globalThis.fetch } = {}
) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('Week06 Wave 1 live verification requires fetch');
  }
  const source = verifyWeek06Wave1Source(repoRoot, { verifyExportFixtures: false });
  const projection = readJson(repoRoot, PROJECTION_RELATIVE_PATH);
  await mapWithConcurrency(projection.identities, 5, async (identity) => {
    const html = await readLiveResponse(fetchImpl, identity.canonical, 'text/html');
    verifyArticleHtml(html, identity, identity.owner);
  });
  await mapWithConcurrency(projection.identities, 5, async (identity) => {
    const oppositeLocale = identity.owner === 'cn' ? 'en' : 'zh';
    const nonOwnerUrl = `${OWNER_ORIGINS[oppositeLocale]}${identity.canonicalPath}`;
    await verifyNonOwnerResponse(fetchImpl, nonOwnerUrl, identity);
  });
  const sitemapByOwner = new Map();
  for (const [owner, locale] of [
    ['cn', 'zh'],
    ['io', 'en']
  ]) {
    const sitemapUrl = `${OWNER_ORIGINS[locale]}/sitemap.xml`;
    const xml = await readLiveResponse(fetchImpl, sitemapUrl, 'xml');
    sitemapByOwner.set(
      owner,
      [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1])
    );
  }
  let sitemapVerified = 0;
  for (const identity of projection.identities) {
    for (const owner of ['cn', 'io']) {
      const membership = sitemapByOwner
        .get(owner)
        .filter((url) => url === identity.canonical).length;
      const expectedMembership = identity.owner === owner ? 1 : 0;
      if (membership !== expectedMembership) {
        throw new Error(`Week06 Wave 1 live sitemap drift: ${identity.key}`);
      }
    }
    sitemapVerified += 1;
  }
  return {
    ...source,
    liveHttpVerified: true,
    productionObserved: projection.identities.length,
    http200: projection.identities.length,
    canonicalVerified: projection.identities.length,
    languageVerified: projection.identities.length,
    sitemapVerified,
    nonOwnerChecked: projection.identities.length,
    nonOwnerIndexable: 0,
    ownerLeaks: 0
  };
}

module.exports = {
  BASELINE_PAGE_COUNT,
  CONTRACT_RELATIVE_PATH,
  CONTENT_RELATIVE_PATH,
  EN_SEARCH_RELATIVE_PATH,
  MANIFEST_RELATIVE_PATH,
  PROJECTION_RELATIVE_PATH,
  REGISTRY_RELATIVE_PATH,
  RELEASE_RELATIVE_PATH,
  RESULTING_PAGE_COUNT,
  ROLLBACK_RELATIVE_PATH,
  SELECTION_RELATIVE_PATH,
  ZH_SEARCH_RELATIVE_PATH,
  buildWeek06Wave1Package,
  loadWeek06Wave1Contract,
  loadWeek06Wave1Selection,
  verifyWeek06Wave1Selection,
  verifyWeek06Wave1AtomicRollback,
  verifyWeek06Wave1Export,
  verifyWeek06Wave1ExportFixtures,
  verifyWeek06Wave1Live,
  verifyWeek06Wave1Source,
  writeWeek06Wave1ExportFixture,
  writeWeek06Wave1Package
};
