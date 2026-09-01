const fs = require('node:fs');
const path = require('node:path');
const { sha256 } = require('./technical-authority');
const { sanitizeReaderText } = require('./technical-wave');
const { buildNormalizedTechnicalPage } = require('../import-technical-content');

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

module.exports = {
  assertReaderHygiene,
  buildReaderPage,
  normalizeRelativePath,
  parseSourceBody,
  readerPath,
  resolveRepositoryPath,
  sanitizePublicText,
  validateSelectedIdentity
};
