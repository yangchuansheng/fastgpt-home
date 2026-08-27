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
  const sourceType = String(workbookRecord.sourceType || values.source_type || '').includes(
    'GitHub'
  )
    ? 'GitHub issue'
    : String(workbookRecord.sourceType || values.source_type || '').includes('深度')
    ? '深度场景内容'
    : '官方文档';
  const body = loose.body;
  const id = `week06-${String(workbookRow - 1).padStart(4, '0')}`;
  const canonicalPath = workbookRecord.canonical;
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
    provenance: {
      sourceFile: `${locale === 'zh' ? '中文-fastgpt.cn' : '英文-fastgpt.io'}/${relativePath}`,
      sourceUrl: sourceUrl || workbookRecord.sourceUrl || null,
      sourceSha256: sha256(source),
      sourceBodySha256: sha256(body),
      workbookRow,
      workbookSha256: workbookRecord.workbookSha256
    },
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
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\|\s*([0-9.]+)\s*\|\s*`?([^|`]+?)`?\s*\|\s*`?([^|`]+?)`?\s*\|/);
    if (!match) continue;
    const left = byPath.get(`/${match[2]}`) || bySlug.get(match[2]) || [];
    const right = byPath.get(`/${match[3]}`) || bySlug.get(match[3]) || [];
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
  return manifest;
}

function writeArtifacts(manifest) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const ids = manifest.candidates.map((candidate) => candidate.id);
  const identities = manifest.candidates.map((candidate) => ({
    candidateId: candidate.id,
    identity: candidate.identity,
    identityKey: `${candidate.identity.locale}|${candidate.identity.canonicalPath}`,
    workbookRow: candidate.workbookRow,
    resolution: 'pending'
  }));
  const dispositionLedger = {
    schemaVersion: 1,
    batch: 'week06',
    status: 'intake-review',
    candidateCount: ids.length,
    accepted: [],
    denied: [],
    pending: ids,
    decisions: manifest.candidates.map((candidate) => ({
      candidateId: candidate.id,
      identity: candidate.identity,
      disposition: 'pending',
      reason: candidate.decision.reason
    }))
  };
  const identityLedger = {
    schemaVersion: 1,
    batch: 'week06',
    status: 'intake-review',
    candidateCount: ids.length,
    unresolvedCount: ids.length,
    records: identities,
    conflicts: []
  };
  const pendingGateRecords = manifest.candidates.map((candidate) => ({
    candidateId: candidate.id,
    identity: candidate.identity,
    status: 'pending-review',
    disposition: 'pending'
  }));
  const securityLedger = {
    schemaVersion: 1,
    batch: 'week06',
    status: 'intake-review',
    candidateCount: ids.length,
    findingCount: 0,
    unresolvedCount: ids.length,
    findings: pendingGateRecords
  };
  const operationRiskLedger = {
    schemaVersion: 1,
    batch: 'week06',
    status: 'intake-review',
    candidateCount: ids.length,
    findingCount: 0,
    unresolvedCount: ids.length,
    records: pendingGateRecords
  };
  const duplicateLedger = {
    schemaVersion: 1,
    batch: 'week06',
    status: 'intake-review',
    relationCount: manifest.duplicateRelations.length,
    resolvedRelationCount: 0,
    unresolvedRelationCount: manifest.duplicateRelations.length,
    relations: manifest.duplicateRelations
  };
  const provenance = {
    schemaVersion: 1,
    batch: 'week06',
    status: 'intake-review',
    workbook: manifest.workbook,
    sourceSetSha256: sha256(
      manifest.candidates
        .map((candidate) => `${candidate.id}|${candidate.provenance.sourceSha256}`)
        .join('\n')
    ),
    sources: manifest.candidates.map((candidate) => ({
      candidateId: candidate.id,
      workbookRow: candidate.workbookRow,
      sourceFile: candidate.provenance.sourceFile,
      sourceUrl: candidate.provenance.sourceUrl,
      sourceSha256: candidate.provenance.sourceSha256,
      bodySha256: candidate.provenance.sourceBodySha256
    }))
  };
  const contentManifest = {
    schemaVersion: 1,
    batch: 'week06',
    wave: 'wave-0',
    status: 'empty',
    readerContentContract:
      'Reader content remains outside the public registry until governance closes.',
    sourceSetSha256: provenance.sourceSetSha256,
    readerCount: 0,
    sources: []
  };
  const projection = {
    schemaVersion: 1,
    batch: 'week06',
    wave: 'wave-0',
    status: 'empty',
    governanceStatus: 'intake-review',
    publicationCount: 0,
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
    status: 'empty',
    reviewer: 'technical-governance',
    criteria: ['authority-input', 'identity', 'security', 'operation-risk', 'duplicate-retrieval'],
    selected: [],
    projection: [],
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
    'week06-rollback.json'
  ];
  const artifacts = artifactPaths.map((name) => ({
    path: `src/content/tech-center/authority/${name}`,
    sha256: sha256(fs.readFileSync(path.join(OUTPUT_DIR, name)))
  }));
  const releaseManifest = {
    schemaVersion: 1,
    batch: 'week06',
    wave: 'wave-0',
    status: 'release-blocked',
    governanceStatus: 'intake-review',
    publicationCount: 0,
    baseline: manifest.baseline,
    sourceSetSha256: provenance.sourceSetSha256,
    blockers: [
      'Candidate dispositions, security review, operation-risk review, and duplicate review remain open.'
    ],
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
    } yamlQuarantine=${manifest.summary.yaml.quarantined} projection=${
      manifest.summary.projectionCount
    }`
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

module.exports = { buildManifest, main, parseArgs, writeArtifacts };
