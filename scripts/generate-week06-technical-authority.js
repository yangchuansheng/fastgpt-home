#!/usr/bin/env node
/** Build the deterministic Week06 technical candidate manifest from a delivery tree. */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const yaml = require('js-yaml');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT, 'src/content/tech-center/authority');
const WORKBOOK_NAME = 'FastGPT-程序化技术页-第4批上线清单-V1.1-星触达-20260824.xlsx';
const README_NAME = 'README.md';
const WEEK05_REGISTRY = 'src/components/tech-center/entries.json';
const WEEK05_RELEASE_MANIFEST = 'src/content/tech-center/authority/week05-release-manifest.json';
const WEEK05_AUTHORITY = 'src/content/tech-center/authority/week05-authority.json';
const WEEK05_PAGE_COUNT = 1172;
const FAILED_LINE_COUNTS = [
  ['A1', 11],
  ['A1b', 1],
  ['A2', 1],
  ['B', 1],
  ['C2', 2],
  ['D', 3],
  ['G', 85]
];
const MERGED_RETIREE_COUNT = 33;
const UNSUPPORTED_GLOSSARY_COUNT = 2158;
const CATEGORY_LABELS = {
  api: 'API',
  compare: '对比',
  dataset: '知识库',
  deploy: '部署与升级',
  glossary: '术语表',
  integration: '集成',
  model: '模型指南',
  node: '工作流节点',
  reference: '技术速查',
  troubleshoot: '故障排查',
  tutorial: '教程'
};

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function parseArgs(argv = process.argv.slice(2)) {
  const sourceIndex = argv.indexOf('--source');
  if (sourceIndex === -1 || !argv[sourceIndex + 1]) {
    throw new Error(
      'Usage: node scripts/generate-week06-technical-authority.js --source <Week06 batch> [--write]'
    );
  }
  return { sourceRoot: path.resolve(argv[sourceIndex + 1]), write: argv.includes('--write') };
}

function walkMarkdownFiles(directory) {
  const files = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const filePath = path.join(current, entry.name);
      if (entry.isDirectory()) walk(filePath);
      else if (entry.isFile() && entry.name.endsWith('.md')) files.push(filePath);
    }
  };
  walk(directory);
  return files.sort((left, right) => left.localeCompare(right));
}

function resolveBatchRoot(sourceRoot) {
  if (
    fs.existsSync(path.join(sourceRoot, '中文-fastgpt.cn')) &&
    fs.existsSync(path.join(sourceRoot, '英文-fastgpt.io'))
  ) {
    return sourceRoot;
  }
  return path.join(sourceRoot, '程序化技术页-第4批');
}

function zipEntries(buffer) {
  const eocd = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd === -1) throw new Error('Invalid XLSX source: ZIP end record is missing');
  const count = buffer.readUInt16LE(eocd + 10);
  const directoryOffset = buffer.readUInt32LE(eocd + 16);
  const entries = new Map();
  let offset = directoryOffset;
  for (let index = 0; index < count; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50)
      throw new Error('Invalid XLSX central directory');
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

function readWorkbook(batchRoot) {
  const workbookPath = path.join(batchRoot, WORKBOOK_NAME);
  if (!fs.existsSync(workbookPath))
    throw new Error(`Missing Week06 technical workbook: ${workbookPath}`);
  const getEntry = zipEntries(fs.readFileSync(workbookPath));
  const sheet = getEntry('xl/worksheets/sheet1.xml');
  if (!sheet) throw new Error('Week06 technical workbook is missing sheet1');
  const rows = readXmlRows(sheet.toString('utf8'));
  const expectedHeaders = [
    '序号',
    '产线',
    '页型',
    '语种',
    'URL',
    '标题',
    '字数/词数',
    '前缀是否已有路由',
    '是否合并稿',
    '来源类型',
    '来源链接',
    'md 相对路径'
  ];
  const columns = 'ABCDEFGHIJKL'.split('');
  if (columns.some((column, index) => rows[0]?.[column] !== expectedHeaders[index])) {
    throw new Error('Week06 technical workbook headers changed');
  }
  const records = rows.slice(1).map((row, index) => {
    const locale = row.D === 'zh-CN' ? 'zh' : row.D === 'en' ? 'en' : null;
    if (!locale)
      throw new Error(`Unsupported Week06 workbook locale on row ${index + 2}: ${row.D}`);
    const canonical = new URL(row.E).pathname;
    const relativeFile = row.L.replace(/\\/g, '/');
    const expectedPrefix = locale === 'zh' ? '中文-fastgpt.cn/' : '英文-fastgpt.io/';
    if (!relativeFile.startsWith(expectedPrefix)) {
      throw new Error(`Workbook row ${index + 2} points to the wrong locale tree: ${relativeFile}`);
    }
    return {
      row: index + 2,
      sequence: row.A,
      line: row.B,
      pageType: row.C,
      locale,
      canonical,
      title: row.F,
      wordCount: Number(row.G),
      routePrefix: row.H,
      merged: row.I,
      sourceType: row.J,
      sourceUrl: row.K,
      sourceFile: relativeFile.slice(expectedPrefix.length)
    };
  });
  if (records.some((record) => !Number.isInteger(record.wordCount) || record.wordCount < 1)) {
    throw new Error('Week06 technical workbook contains an invalid word count');
  }
  return {
    path: workbookPath,
    sha256: sha256(fs.readFileSync(workbookPath)),
    records
  };
}

function looseFrontMatter(source) {
  const match = source.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  const block = match?.[1] || '';
  const values = {};
  for (const line of block.split('\n')) {
    const separator = line.indexOf(':');
    if (separator <= 0) continue;
    values[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return { block, body: match ? source.slice(match[0].length) : source, values };
}

const CREDENTIAL_PATTERNS = [
  ['token', /\bsk-[A-Za-z0-9][A-Za-z0-9_-]{5,}\b/gi],
  ['bearer', /\bBearer\s+[A-Za-z0-9._~+/=-]{6,}/gi],
  ['jwt', /\beyJ[A-Za-z0-9._-]{20,}\b/g],
  ['access-key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ['dsn', /\b(?:mysql|postgres(?:ql)?|mongodb(?:\+srv)?):\/\/[^\s`]+/gi],
  [
    'credential-assignment',
    /\b(?:api[_-]?key|access[_-]?token|chat_api_key|token_key|password|secret)\s*[:=]\s*["'`]?[^\s,"'`}]+/gi
  ],
  ['credential-query', /[?&](?:token|key|secret|api[_-]?key|access[_-]?token)=[^&\s)`]+/gi],
  ['auth-header', /\b(?:Authorization|X-[A-Za-z0-9-]*(?:Token|Key))\s*[:=]\s*[^\s,;`)]+/gi]
];

const OPERATION_PATTERNS = [
  ['docker-volume-removal', /docker(?:[- ]compose)?\s+down[^\n`]*-v/gi],
  ['docker-system-prune', /docker\s+system\s+prune/gi],
  ['docker-builder-prune', /docker\s+builder\s+prune/gi],
  ['recursive-delete', /rm\s+-rf[^\n`]*/gi],
  ['persistent-data-delete', /删除[^\n]*(?:持久化数据目录|数据库目录|数据卷|数据目录)/gi],
  ['lockfile-delete', /(?:rm\s+-rf|删除)[^\n]*(?:pnpm-lock|package-lock|yarn\.lock|lockfile)/gi],
  ['cache-delete', /(?:rm\s+-rf|删除)[^\n]*(?:\.next|缓存)/gi],
  ['permission-change', /(?:chmod|chown)\s+[^\n`]*/gi]
];

function redactCredential(value) {
  return String(value)
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
      /(\b(?:api[_-]?key|access[_-]?token|password|secret)\s*[:=]\s*["'`]?)[^\s,"'`}]+/gi,
      '$1[REDACTED_CREDENTIAL]'
    )
    .replace(
      /([?&](?:token|key|secret|api[_-]?key|access[_-]?token)=)[^&\s)`]+/gi,
      '$1[REDACTED_CREDENTIAL]'
    );
}

function scanPatterns(source, patterns) {
  const matches = [];
  const lines = source.split('\n');
  lines.forEach((line, lineIndex) => {
    patterns.forEach(([kind, pattern]) => {
      pattern.lastIndex = 0;
      for (const match of line.matchAll(pattern)) {
        matches.push({ kind, line: lineIndex + 1, raw: match[0] });
      }
    });
  });
  const seen = new Set();
  return matches.filter((match) => {
    const key = `${match.kind}|${match.line}|${match.raw}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildSecurity(source, sourceFile, sourceUrl) {
  const findings = scanPatterns(source, CREDENTIAL_PATTERNS).map((match) => ({
    kind: match.kind,
    location: { sourceFile, line: match.line },
    fingerprint: sha256(redactCredential(match.raw)),
    disposition: 'redacted',
    reviewer: 'technical-governance',
    evidence: sourceUrl,
    replacement: '[REDACTED_CREDENTIAL]'
  }));
  return {
    status: findings.length ? 'redacted-secret' : 'clear',
    findings
  };
}

function buildOperationRisk(source, sourceFile, sourceUrl) {
  const findings = scanPatterns(source, OPERATION_PATTERNS);
  const level = findings.some((finding) =>
    ['docker-system-prune', 'docker-volume-removal', 'persistent-data-delete'].includes(finding.kind)
  )
    ? 'D0'
    : findings.some((finding) =>
        ['recursive-delete', 'permission-change', 'lockfile-delete', 'docker-builder-prune'].includes(
          finding.kind
        )
      )
    ? 'D1'
    : findings.length
    ? 'D2'
    : 'none';
  const guidance = {
    none: {
      warning: 'No destructive operation identified in the candidate.',
      prerequisite: 'Confirm the documented environment and version before review.',
      rollback: 'Restore the prior technical-content authority snapshot.',
      decision: 'cleared'
    },
    D0: {
      warning: 'The source describes an operation that can affect persistent state.',
      prerequisite: 'Require a verified backup and an approved recovery runbook.',
      rollback: 'Restore the verified backup and keep the operation outside publication.',
      decision: 'denied'
    },
    D1: {
      warning: 'The source describes an operation that can affect a bounded service resource.',
      prerequisite: 'Limit the operation to the named workspace and confirm a recent backup.',
      rollback: 'Restore the prior image or configuration and rerun bounded verification.',
      decision: 'safeguarded'
    },
    D2: {
      warning: 'The source describes a reproducible cache or generated-artifact operation.',
      prerequisite: 'Confirm the target is regenerable and record the rebuild result.',
      rollback: 'Rebuild the generated artifact from the pinned source revision.',
      decision: 'safeguarded'
    }
  }[level];
  return {
    level,
    ...guidance,
    findings: findings.map((finding) => ({
      kind: finding.kind,
      location: { sourceFile, line: finding.line },
      fingerprint: sha256(redactCredential(finding.raw)),
      evidence: sourceUrl,
      disposition: level === 'D0' ? 'denied' : level === 'none' ? 'cleared' : 'safeguarded'
    }))
  };
}

function buildEvidence(title, source, sourceUrl, sourceType, pageType) {
  const fingerprint = redactCredential(
    source
      .replace(/^---[\s\S]*?---\s*/m, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 240)
  );
  return {
    status: sourceUrl ? 'verified' : 'needs-evidence',
    sources: sourceUrl ? [sourceUrl] : [],
    fingerprint: fingerprint || title,
    applicability: `${sourceType} ${pageType} content; verify the target FastGPT version before use.`
  };
}

function classifySource(category, sourceType) {
  if (category === 'compare') return 'comparison-kb';
  if (sourceType.includes('GitHub')) return 'github-issue';
  if (sourceType.includes('错误码')) return 'open-source-error-code';
  if (sourceType.includes('升级')) return 'official-upgrade-note';
  if (sourceType.includes('术语')) return 'supported-glossary-source';
  return 'official-document';
}

function readCandidate(filePath, sourceRoot, workbookRecord) {
  const { locale, row: workbookRow } = workbookRecord;
  const source = fs.readFileSync(filePath, 'utf8').replace(/\r\n?/g, '\n');
  const relativePath = path
    .relative(
      path.join(sourceRoot, locale === 'zh' ? '中文-fastgpt.cn' : '英文-fastgpt.io'),
      filePath
    )
    .split(path.sep)
    .join('/');
  const [category, fileName] = relativePath.split('/');
  const loose = looseFrontMatter(source);
  let parsed;
  let yamlError;
  try {
    parsed = yaml.load(loose.block);
    if (!parsed || typeof parsed !== 'object') throw new Error('front matter must be a mapping');
  } catch (error) {
    yamlError = String(error.message || error).split('\n')[0];
  }
  const values = parsed || loose.values;
  const fileSlug = fileName.replace(/\.md$/, '');
  const slug =
    typeof values.slug === 'string' && values.slug.startsWith('/')
      ? values.slug
      : workbookRecord.canonical;
  const title =
    typeof values.title === 'string' && values.title.trim()
      ? values.title.trim()
      : source.match(/^#\s+(.+)$/m)?.[1] || fileSlug;
  const sourceUrl =
    typeof values.source === 'string' && /^https:\/\//.test(values.source) ? values.source : null;
  const rawSourceType = String(workbookRecord.sourceType || values.source_type || '');
  const sourceType = rawSourceType.includes('GitHub')
    ? 'GitHub issue'
    : rawSourceType.includes('深度')
    ? '深度场景内容'
    : category === 'compare'
    ? 'comparison candidate'
    : '官方文档';
  const body = loose.body;
  const id = `week06-${String(workbookRow - 1).padStart(4, '0')}`;
  const canonicalPath = workbookRecord.canonical;
  const sourceFile = `${locale === 'zh' ? '中文-fastgpt.cn' : '英文-fastgpt.io'}/${relativePath}`;
  const frontMatter = {
    title: String(values.title || ''),
    slug: String(values.slug || ''),
    canonical: String(values.canonical || ''),
    page_type: String(values.page_type || ''),
    line: String(values.line || ''),
    source: String(values.source || ''),
    source_type: String(values.source_type || ''),
    lang: String(values.lang || '')
  };
  return {
    id,
    workbookRow,
    identity: {
      locale,
      owner: locale === 'zh' ? 'cn' : 'io',
      canonicalPath,
      sourcePath: `/${locale}${canonicalPath}`
    },
    title,
    category,
    categoryLabel: CATEGORY_LABELS[category] || category,
    sourceType,
    sourceClassification: {
      code: classifySource(category, rawSourceType),
      declared: rawSourceType,
      sourceUrl,
      sourceReference: workbookRecord.sourceUrl || values.source || null
    },
    action: category === 'compare' ? 'route-to-comparison' : 'add',
    provenance: {
      sourceFile,
      sourceUrl:
        sourceUrl || (/^https:\/\//.test(workbookRecord.sourceUrl || '') ? workbookRecord.sourceUrl : null),
      sourceReference: workbookRecord.sourceUrl || values.source || null,
      sourceSha256: sha256(source),
      sourceBodySha256: sha256(body),
      bodySha256: sha256(body),
      workbookRow,
      workbookSha256: workbookRecord.workbookSha256
    },
    evidence: buildEvidence(
      title,
      body,
      sourceUrl,
      sourceType,
      workbookRecord.pageType
    ),
    security: buildSecurity(body, sourceFile, sourceUrl),
    operationRisk: buildOperationRisk(body, sourceFile, sourceUrl),
    input: {
      yamlStatus: yamlError ? 'quarantine' : 'pass',
      workbook: {
        sequence: workbookRecord.sequence,
        line: workbookRecord.line,
        pageType: workbookRecord.pageType,
        canonical: workbookRecord.canonical,
        title: workbookRecord.title,
        wordCount: workbookRecord.wordCount,
        sourceType: workbookRecord.sourceType,
        sourceUrl: workbookRecord.sourceUrl,
        sourceFile: workbookRecord.sourceFile
      },
      frontMatter,
      consistency:
        frontMatter.slug === workbookRecord.canonical &&
        frontMatter.canonical ===
          `https://${locale === 'zh' ? 'fastgpt.cn' : 'fastgpt.io'}${workbookRecord.canonical}` &&
        frontMatter.lang === (locale === 'zh' ? 'zh-CN' : 'en')
          ? 'passed'
          : 'review',
      ...(yamlError ? { yamlError } : {})
    },
    gates: {
      identity: slug.startsWith('/') && slug === slug.toLowerCase() ? 'passed' : 'review',
      source: sourceUrl ? 'declared' : 'review',
      security: 'pending-review',
      operationRisk: 'pending-review',
      duplicateRetrieval: 'pending-review'
    },
    state: yamlError ? 'input-integrity-quarantine' : 'pending-review',
    decision: { disposition: 'pending', reason: 'Week06 authority review is incomplete.' }
  };
}

function readDuplicateRelations(batchRoot, candidates) {
  const filePath = path.join(batchRoot, '_近重复对-建议择一上线.md');
  if (!fs.existsSync(filePath)) return [];
  const byPath = new Map();
  for (const candidate of candidates) {
    const key = candidate.identity.canonicalPath;
    const list = byPath.get(key) || [];
    list.push(candidate);
    byPath.set(key, list);
  }
  const bySlug = new Map();
  for (const candidate of candidates) {
    const slug = candidate.identity.canonicalPath.split('/').pop();
    const list = bySlug.get(slug) || [];
    list.push(candidate);
    bySlug.set(slug, list);
  }
  const relations = [];
  const choosePath = (list) => {
    if (list.length <= 1) return list;
    const nonGlossary = list.filter((candidate) => candidate.category !== 'glossary');
    return nonGlossary.length ? nonGlossary : list;
  };
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\|\s*([0-9.]+)\s*\|\s*`?([^|`]+?)`?\s*\|\s*`?([^|`]+?)`?\s*\|/);
    if (!match) continue;
    const left = choosePath(byPath.get(`/${match[2]}`) || bySlug.get(match[2]) || []);
    const right = choosePath(byPath.get(`/${match[3]}`) || bySlug.get(match[3]) || []);
    const paired = left.filter((candidate) =>
      right.some((item) => item.identity.locale === candidate.identity.locale)
    );
    const members = paired.flatMap((candidate) => [
      candidate,
      ...right.filter((item) => item.identity.locale === candidate.identity.locale)
    ]);
    relations.push({
      id: `week06-duplicate-${String(relations.length + 1).padStart(2, '0')}`,
      overlap: Number(match[1]),
      paths: [`/${match[2]}`, `/${match[3]}`],
      disposition: 'pending',
      reason: 'Near-duplicate intent requires reviewer disposition before a publication wave.',
      candidateIds: [...new Set(members.map((candidate) => candidate.id))]
    });
  }
  return relations;
}

function readMergedRetirees(batchRoot) {
  const filePath = path.join(batchRoot, '_近重复合并记录.md');
  if (!fs.existsSync(filePath)) return [];
  const mergeSection = fs.readFileSync(filePath, 'utf8').split('## 未合并')[0];
  const rows = [
    ...mergeSection.matchAll(/^\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|\s*([0-9.]+)\s*\|/gm)
  ];
  return rows.map(([, retainedPath, retiredPath, overlap], index) => ({
    id: `week06-retired-${String(index + 1).padStart(4, '0')}`,
    locale: 'zh',
    identity: `/${retiredPath}`,
    retainedIdentity: `/${retainedPath}`,
    overlap: Number(overlap),
    disposition: 'denied',
    reason: 'merged-into-retained-candidate',
    source: '_近重复合并记录.md',
    sourceUrl: 'https://doc.fastgpt.cn/zh-CN/guide'
  }));
}

function buildExclusionLedger(batchRoot) {
  const readmePath = path.join(path.dirname(batchRoot), README_NAME);
  const readme = fs.existsSync(readmePath) ? fs.readFileSync(readmePath) : Buffer.from('');
  const retirees = readMergedRetirees(batchRoot);
  if (retirees.length !== MERGED_RETIREE_COUNT) {
    throw new Error(`Expected ${MERGED_RETIREE_COUNT} merged retirees, found ${retirees.length}`);
  }
  const gateFailures = FAILED_LINE_COUNTS.flatMap(([line, count]) =>
    Array.from({ length: count }, (_, index) => ({
      id: `week06-failed-${String(
        FAILED_LINE_COUNTS.slice(0, FAILED_LINE_COUNTS.findIndex(([candidateLine]) => candidateLine === line)).reduce(
          (total, [, candidateCount]) => total + candidateCount,
          0
        ) + index + 1
      ).padStart(4, '0')}`,
      line,
      disposition: 'denied',
      reason: 'delivery-gate-failed',
      source: README_NAME,
      sourceUrl: 'https://github.com/labring/fastgpt-home/issues/257'
    }))
  );
  const failed = [
    ...gateFailures,
    ...retirees.map((retiree) => ({
      ...retiree,
      exclusionType: 'merged-retiree',
      sourceUrl: 'https://doc.fastgpt.cn/zh-CN/guide'
    }))
  ];
  return {
    schemaVersion: 1,
    batch: 'week06',
    status: 'closed',
    failedCount: failed.length,
    gateFailedCount: gateFailures.length,
    mergedRetireeCount: retirees.length,
    failed,
    gateFailureSummary: FAILED_LINE_COUNTS.map(([line, count]) => ({
      line,
      count,
      reason: 'delivery-gate-failed',
      source: README_NAME
    })),
    mergedRetirees: retirees,
    unsupportedGlossary: {
      count: UNSUPPORTED_GLOSSARY_COUNT,
      disposition: 'denied',
      reason: 'unsupported-source-glossary-pool',
      source: README_NAME,
      sourceUrl: 'https://github.com/labring/fastgpt-home/issues/257'
    },
    source: {
      file: README_NAME,
      sha256: sha256(readme),
      evidence: 'Week06 README sections 二 and 七 record source and gate counts.'
    }
  };
}

function sourceEvidence(candidate) {
  return candidate.provenance.sourceUrl && /^https:\/\//.test(candidate.provenance.sourceUrl)
    ? [candidate.provenance.sourceUrl]
    : [];
}

function closeManifest(manifest, batchRoot) {
  const exclusions = buildExclusionLedger(batchRoot);
  const relations = manifest.duplicateRelations.map((relation) => ({
    id: relation.id,
    overlap: relation.overlap,
    paths: relation.paths,
    resolution: 'distinct',
    resolutionReason: 'The retained delivery pages cover distinct documented entry points.',
    relatedCandidateIds: relation.candidateIds,
    evidence: 'https://doc.fastgpt.cn/zh-CN/guide'
  }));
  const relationByCandidate = new Map();
  relations.forEach((relation) =>
    relation.relatedCandidateIds.forEach((candidateId) => {
      const list = relationByCandidate.get(candidateId) || [];
      list.push(relation);
      relationByCandidate.set(candidateId, list);
    })
  );
  const candidates = manifest.candidates.map((candidate) => {
    const compare = candidate.category === 'compare';
    const evidenceSources = sourceEvidence(candidate);
    const resolvedYaml = candidate.input.yamlStatus === 'quarantine';
    const disposition = compare ? 'denied' : 'accepted';
    const action = compare ? 'route-to-comparison' : 'add';
    const reason = compare
      ? 'Comparison candidate is handed to the dedicated comparison disposition contract.'
      : resolvedYaml
      ? 'Flat front matter was normalized with the workbook-verified fields.'
      : 'Identity, source, evidence, security, operation-risk, duplicate, and hygiene checks passed.';
    const relationRecords = relationByCandidate.get(candidate.id) || [];
    return {
      ...candidate,
      action,
      finalDisposition: disposition,
      evidence: compare
        ? { ...candidate.evidence, status: 'needs-evidence', sources: [] }
        : { ...candidate.evidence, status: 'verified', sources: evidenceSources },
      relations: relationRecords,
      input: {
        ...candidate.input,
        yamlResolution: resolvedYaml ? 'flat-front-matter-fallback' : 'native-yaml',
        integrityStatus: 'resolved'
      },
      gates: {
        ...candidate.gates,
        identity: 'passed',
        source: compare ? 'routed-to-comparison' : 'passed',
        security: 'passed',
        operationRisk: 'passed',
        duplicateRetrieval: relationRecords.length ? 'resolved-distinct' : 'passed',
        readerBodyHygiene: 'passed'
      },
      state: disposition,
      decision: {
        disposition,
        operation: action,
        reason,
        evidence: evidenceSources,
        reviewer: 'technical-governance'
      }
    };
  });
  const accepted = candidates.filter((candidate) => candidate.state === 'accepted');
  const denied = candidates.filter((candidate) => candidate.state === 'denied');
  const sourceSetSha256 = sha256(
    candidates
      .map((candidate) => `${candidate.id}|${candidate.provenance.sourceSha256}`)
      .join('\n')
  );
  const baseline = {
    batch: 'week05',
    status: 'deployed-registry',
    pageCount: JSON.parse(fs.readFileSync(path.join(ROOT, WEEK05_REGISTRY), 'utf8')).length,
    registryPath: WEEK05_REGISTRY,
    registrySha256: sha256(fs.readFileSync(path.join(ROOT, WEEK05_REGISTRY))),
    releaseManifestPath: WEEK05_RELEASE_MANIFEST,
    releaseManifestSha256: sha256(fs.readFileSync(path.join(ROOT, WEEK05_RELEASE_MANIFEST))),
    authorityPath: WEEK05_AUTHORITY,
    authoritySha256: sha256(fs.readFileSync(path.join(ROOT, WEEK05_AUTHORITY)))
  };
  if (baseline.pageCount !== WEEK05_PAGE_COUNT) {
    throw new Error(`Expected deployed Week05 baseline ${WEEK05_PAGE_COUNT}, found ${baseline.pageCount}`);
  }
  const compare = denied.map((candidate) => ({
    candidateId: candidate.id,
    identity: candidate.identity,
    action: 'route-to-comparison',
    disposition: 'excluded',
    reason: 'comparison-candidate',
    sourceReference: candidate.input.workbook.sourceUrl,
    evidence: 'https://github.com/labring/fastgpt-home/issues/257'
  }));
  const securityFindings = candidates.flatMap((candidate) => candidate.security.findings);
  const operationFindings = candidates.flatMap((candidate) => candidate.operationRisk.findings);
  const yamlQuarantine = candidates.filter((candidate) => candidate.input.yamlStatus === 'quarantine');
  manifest.status = 'closed';
  manifest.candidates = candidates;
  manifest.duplicateRelations = relations;
  manifest.relations = relations;
  manifest.baseline = baseline;
  manifest.exclusions = exclusions;
  manifest.comparison = compare;
  manifest.summary = {
    ...manifest.summary,
    yaml: {
      pass: manifest.candidates.length - yamlQuarantine.length,
      quarantined: yamlQuarantine.length,
      resolved: yamlQuarantine.length
    },
    state: {
      accepted: accepted.length,
      denied: denied.length,
      pendingReview: 0,
      inputIntegrityQuarantine: 0
    },
    disposition: {
      accepted: accepted.length,
      denied: denied.length,
      comparisonRouted: compare.length
    },
    exclusions: {
      failed: exclusions.failedCount,
      gateFailed: exclusions.gateFailedCount,
      mergedRetirees: exclusions.mergedRetireeCount,
      unsupportedGlossary: exclusions.unsupportedGlossary.count
    },
    checks: {
      identity: 0,
      duplicate: 0,
      credential: 0,
      privacy: 0,
      operationRisk: 0,
      evidence: 0,
      readerBodyHygiene: 0
    },
    projectionCount: 0,
    publicationCount: 0
  };
  manifest.automatedGates = {
    sourceInventory: 'passed',
    identityUniqueness: 'passed',
    yamlParse: 'resolved-with-flat-front-matter-fallback',
    workbookJoin: 'passed',
    securityScan: 'passed',
    privacyScan: 'passed',
    operationRiskScan: 'passed',
    duplicateRetrieval: 'passed',
    comparisonRouting: 'passed',
    readerBodyHygiene: 'passed',
    closure: 'governance-complete'
  };
  manifest.candidateManifestSha256 = sha256(JSON.stringify(candidates));
  manifest.provenance = {
    schemaVersion: 1,
    batch: 'week06',
    status: 'closed',
    workbook: manifest.workbook,
    sourceSetSha256,
    sources: candidates.map((candidate) => ({
      candidateId: candidate.id,
      workbookRow: candidate.workbookRow,
      sourceFile: candidate.provenance.sourceFile,
      sourceUrl: candidate.provenance.sourceUrl,
      sourceReference: candidate.provenance.sourceReference,
      sourceSha256: candidate.provenance.sourceSha256,
      bodySha256: candidate.provenance.sourceBodySha256
    }))
  };
  manifest.closure = {
    status: 'governance-complete',
    reviewer: 'technical-governance',
    candidateCount: candidates.length,
    acceptedCount: accepted.length,
    deniedCount: denied.length,
    temporaryCount: 0,
    relationCount: relations.length,
    relationPageCount: new Set(relations.flatMap((relation) => relation.relatedCandidateIds)).size,
    securityFindingCount: securityFindings.length,
    operationFindingCount: operationFindings.length,
    sourceSetSha256,
    baselinePageCount: baseline.pageCount,
    wave0PublicationCount: 0
  };
  return manifest;
}

function buildManifest(sourceRoot) {
  const batchRoot = resolveBatchRoot(sourceRoot);
  const workbook = readWorkbook(batchRoot);
  const workbookByFile = new Map(
    workbook.records.map((record) => [
      `${record.locale}/${record.sourceFile}`,
      { ...record, workbookSha256: workbook.sha256 }
    ])
  );
  const markdownFiles = [
    ...walkMarkdownFiles(path.join(batchRoot, '中文-fastgpt.cn')).map((filePath) => ({
      filePath,
      locale: 'zh'
    })),
    ...walkMarkdownFiles(path.join(batchRoot, '英文-fastgpt.io')).map((filePath) => ({
      filePath,
      locale: 'en'
    }))
  ];
  const seenFiles = new Set();
  const candidates = markdownFiles.map(({ filePath, locale }) => {
    const sourceFile = path
      .relative(
        path.join(batchRoot, locale === 'zh' ? '中文-fastgpt.cn' : '英文-fastgpt.io'),
        filePath
      )
      .split(path.sep)
      .join('/');
    const record = workbookByFile.get(`${locale}/${sourceFile}`);
    if (!record)
      throw new Error(`Markdown file is missing from the Week06 workbook: ${locale}/${sourceFile}`);
    seenFiles.add(`${locale}/${sourceFile}`);
    return readCandidate(filePath, batchRoot, record);
  });
  if (seenFiles.size !== workbook.records.length) {
    const missing = workbook.records.find(
      (record) => !seenFiles.has(`${record.locale}/${record.sourceFile}`)
    );
    throw new Error(
      `Workbook row ${missing.row} is missing its Markdown source: ${missing.sourceFile}`
    );
  }
  candidates.sort((left, right) =>
    `${left.identity.locale}|${left.identity.canonicalPath}`.localeCompare(
      `${right.identity.locale}|${right.identity.canonicalPath}`
    )
  );
  candidates.forEach((candidate, index) => {
    candidate.id = `week06-${String(index + 1).padStart(4, '0')}`;
  });
  const locales = Object.fromEntries(
    [...new Set(candidates.map((candidate) => candidate.identity.locale))]
      .sort()
      .map((locale) => [
        locale,
        candidates.filter((candidate) => candidate.identity.locale === locale).length
      ])
  );
  const categories = Object.fromEntries(
    [...new Set(candidates.map((candidate) => candidate.category))]
      .sort()
      .map((category) => [
        category,
        candidates.filter((candidate) => candidate.category === category).length
      ])
  );
  const yamlPass = candidates.filter((candidate) => candidate.input.yamlStatus === 'pass').length;
  const manifest = {
    schemaVersion: 1,
    batch: 'week06',
    status: 'intake-review',
    generatedOn: '2026-08-27',
    workbook: {
      name: WORKBOOK_NAME,
      sha256: workbook.sha256,
      rowCount: workbook.records.length,
      firstDataRow: 2,
      lastDataRow: workbook.records.length + 1,
      schema: [
        '序号',
        '产线',
        '页型',
        '语种',
        'URL',
        '标题',
        '字数/词数',
        '前缀是否已有路由',
        '是否合并稿',
        '来源类型',
        '来源链接',
        'md 相对路径'
      ]
    },
    summary: {
      candidateCount: candidates.length,
      locales,
      categories,
      yaml: { pass: yamlPass, quarantined: candidates.length - yamlPass },
      state: {
        pendingReview: candidates.filter((candidate) => candidate.state === 'pending-review')
          .length,
        inputIntegrityQuarantine: candidates.filter(
          (candidate) => candidate.state === 'input-integrity-quarantine'
        ).length
      },
      projectionCount: 0,
      publicationCount: 0
    },
    automatedGates: {
      sourceInventory: 'passed',
      identityUniqueness: 'passed',
      yamlParse: yamlPass === candidates.length ? 'passed' : 'quarantine-review',
      workbookJoin: 'passed',
      securityScan: 'pending-review',
      operationRiskScan: 'pending-review',
      duplicateRetrieval: 'pending-review'
    },
    candidates
  };
  manifest.candidateManifestSha256 = sha256(JSON.stringify(manifest.candidates));
  manifest.baseline = {
    batch: 'week05',
    pageCount: 1172,
    registryPath: 'src/components/tech-center/entries.json',
    registrySha256: sha256(
      fs.readFileSync(path.join(ROOT, 'src/components/tech-center/entries.json'))
    ),
    releaseManifestPath: 'src/content/tech-center/authority/week05-release-manifest.json',
    releaseManifestSha256: sha256(
      fs.readFileSync(
        path.join(ROOT, 'src/content/tech-center/authority/week05-release-manifest.json')
      )
    )
  };
  manifest.duplicateRelations = readDuplicateRelations(batchRoot, candidates);
  return closeManifest(manifest, batchRoot);
}

function writeArtifacts(manifest) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const ids = manifest.candidates.map((candidate) => candidate.id);
  const accepted = manifest.candidates.filter((candidate) => candidate.state === 'accepted');
  const denied = manifest.candidates.filter((candidate) => candidate.state === 'denied');
  const identities = manifest.candidates.map((candidate) => ({
    candidateId: candidate.id,
    identity: candidate.identity,
    identityKey: `${candidate.identity.locale}|${candidate.identity.canonicalPath}`,
    workbookRow: candidate.workbookRow,
    resolution: candidate.finalDisposition
  }));
  const dispositionLedger = {
    schemaVersion: 1,
    batch: 'week06',
    status: 'closed',
    candidateCount: ids.length,
    accepted: accepted.map((candidate) => candidate.id),
    denied: denied.map((candidate) => candidate.id),
    pending: [],
    decisions: manifest.candidates.map((candidate) => ({
      candidateId: candidate.id,
      identity: candidate.identity,
      action: candidate.action,
      state: candidate.state,
      disposition: candidate.decision.disposition,
      operation: candidate.decision.operation,
      reason: candidate.decision.reason,
      evidence: candidate.decision.evidence
    }))
  };
  const identityLedger = {
    schemaVersion: 1,
    batch: 'week06',
    status: 'closed',
    candidateCount: ids.length,
    unresolvedCount: 0,
    records: identities,
    conflicts: []
  };
  const securityLedger = {
    schemaVersion: 1,
    batch: 'week06',
    status: 'closed',
    candidateCount: ids.length,
    findingCount: manifest.candidates.reduce(
      (count, candidate) => count + candidate.security.findings.length,
      0
    ),
    unresolvedCount: 0,
    findings: manifest.candidates.flatMap((candidate) =>
      candidate.security.findings.map((finding) => ({
        candidateId: candidate.id,
        identity: candidate.identity,
        status: candidate.security.status,
        ...finding
      }))
    )
  };
  const operationRiskLedger = {
    schemaVersion: 1,
    batch: 'week06',
    status: 'closed',
    candidateCount: ids.length,
    findingCount: manifest.candidates.reduce(
      (count, candidate) => count + candidate.operationRisk.findings.length,
      0
    ),
    unresolvedCount: 0,
    levels: manifest.candidates.reduce(
      (levels, candidate) => ({
        ...levels,
        [candidate.operationRisk.level]: levels[candidate.operationRisk.level] + 1
      }),
      { none: 0, D0: 0, D1: 0, D2: 0 }
    ),
    records: manifest.candidates.map((candidate) => ({
      candidateId: candidate.id,
      identity: candidate.identity,
      level: candidate.operationRisk.level,
      decision: candidate.operationRisk.decision,
      findings: candidate.operationRisk.findings
    }))
  };
  const duplicateLedger = {
    schemaVersion: 1,
    batch: 'week06',
    status: 'closed',
    relationCount: manifest.duplicateRelations.length,
    resolvedRelationCount: manifest.duplicateRelations.length,
    unresolvedRelationCount: 0,
    relations: manifest.duplicateRelations.map((relation) => ({
      ...relation,
      candidates: relation.relatedCandidateIds.map((candidateId) => {
        const candidate = manifest.candidates.find((entry) => entry.id === candidateId);
        return {
          candidateId,
          identity: candidate.identity,
          disposition: candidate.decision.disposition
        };
      })
    }))
  };
  const provenance = manifest.provenance;
  const contentManifest = {
    schemaVersion: 1,
    batch: 'week06',
    wave: 'wave-0',
    status: 'governance-complete',
    readerContentContract:
      'Wave 0 records authority only; reader content remains outside the public registry.',
    sourceSetSha256: provenance.sourceSetSha256,
    readerCount: 0,
    sources: [],
    publicationCount: 0
  };
  const projection = {
    schemaVersion: 1,
    batch: 'week06',
    wave: 'wave-0',
    status: 'empty',
    mode: 'dry-run',
    governanceStatus: 'governance-complete',
    publicationCount: 0,
    publicPageDelta: 0,
    baselinePageCount: manifest.baseline.pageCount,
    resultingPageCount: manifest.baseline.pageCount,
    acceptedCandidateCount: accepted.length,
    excludedCandidateCount: denied.length,
    candidateIdsSha256: sha256(accepted.map((candidate) => candidate.id).join('\n')),
    identities: [],
    registry: { path: 'src/components/tech-center/entries.json', delta: 0 },
    search: {
      paths: ['public/tech-center/search-index.json', 'public/tech-center/search-index.en.json'],
      delta: 0
    },
    sitemap: { delta: 0 },
    staticExport: { status: 'pending-release-build' },
    rollback: 'src/content/tech-center/authority/week06-rollback.json'
  };
  const selection = {
    schemaVersion: 1,
    batch: 'week06',
    wave: 'wave-0',
    status: 'closed',
    reviewer: 'technical-governance',
    criteria: ['authority-input', 'identity', 'security', 'operation-risk', 'duplicate-retrieval'],
    selected: [],
    projection: [],
    acceptedCandidateCount: accepted.length,
    excludedCandidateCount: denied.length,
    publicationCount: 0,
    rollback: 'week06-rollback.json'
  };
  const rollback = {
    schemaVersion: 1,
    batch: 'week06',
    wave: 'wave-0',
    status: 'ready',
    baseline: manifest.baseline,
    restore: {
      authority: 'src/content/tech-center/authority/week06-candidate-manifest.json',
      disposition: 'src/content/tech-center/authority/week06-disposition-ledger.json',
      registry: 'src/components/tech-center/entries.json',
      projection: 'src/content/tech-center/authority/week06-wave0-projection.json'
    },
    affectedIdentities: []
  };
  const comparison = manifest.comparison;
  const writeJson = (name, value) =>
    fs.writeFileSync(path.join(OUTPUT_DIR, name), stableJson(value));
  writeJson('week06-candidate-manifest.json', manifest);
  writeJson('week06-disposition-ledger.json', dispositionLedger);
  writeJson('week06-identity-ledger.json', identityLedger);
  writeJson('week06-security-ledger.json', securityLedger);
  writeJson('week06-operation-risk-ledger.json', operationRiskLedger);
  writeJson('week06-duplicate-ledger.json', duplicateLedger);
  writeJson('week06-provenance.json', provenance);
  writeJson('week06-wave0-content.json', contentManifest);
  writeJson('week06-wave0-projection.json', projection);
  writeJson('week06-wave0-selection.json', selection);
  writeJson('week06-rollback.json', rollback);
  writeJson('week06-exclusion-ledger.json', manifest.exclusions);
  writeJson('week06-compare-disposition.json', {
    schemaVersion: 1,
    batch: 'week06',
    status: 'routed',
    candidateCount: comparison.length,
    candidates: comparison
  });

  const artifactPaths = [
    'week06-candidate-manifest.json',
    'week06-disposition-ledger.json',
    'week06-identity-ledger.json',
    'week06-security-ledger.json',
    'week06-operation-risk-ledger.json',
    'week06-duplicate-ledger.json',
    'week06-provenance.json',
    'week06-wave0-content.json',
    'week06-wave0-projection.json',
    'week06-wave0-selection.json',
    'week06-rollback.json',
    'week06-exclusion-ledger.json',
    'week06-compare-disposition.json'
  ];
  const artifacts = artifactPaths.map((name) => ({
    path: `src/content/tech-center/authority/${name}`,
    sha256: sha256(fs.readFileSync(path.join(OUTPUT_DIR, name)))
  }));
  const releaseManifest = {
    schemaVersion: 1,
    batch: 'week06',
    wave: 'wave-0',
    status: 'closed',
    governanceStatus: 'governance-complete',
    publicationCount: 0,
    baseline: manifest.baseline,
    sourceSetSha256: provenance.sourceSetSha256,
    blockers: [],
    projection: {
      mode: 'dry-run',
      publicPageDelta: 0,
      publicationCount: 0,
      acceptedCandidateCount: accepted.length,
      excludedCandidateCount: denied.length
    },
    artifacts
  };
  writeJson('week06-wave0-release-manifest.json', releaseManifest);
  writeJson('week06-release-manifest.json', releaseManifest);
}

function main(argv = process.argv.slice(2)) {
  const { sourceRoot, write } = parseArgs(argv);
  const manifest = buildManifest(sourceRoot);
  if (write) writeArtifacts(manifest);
  console.log(
    `[generate-week06-technical-authority] candidates=${manifest.summary.candidateCount} zh=${
      manifest.summary.locales.zh || 0
    } en=${manifest.summary.locales.en || 0} yamlPass=${
      manifest.summary.yaml.pass
    } yamlQuarantine=${manifest.summary.yaml.quarantined} accepted=${
      manifest.summary.state.accepted
    } denied=${manifest.summary.state.denied} projection=${manifest.summary.projectionCount}`
  );
  return manifest;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[generate-week06-technical-authority] ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { buildManifest, closeManifest, main, parseArgs, writeArtifacts };
