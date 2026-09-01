#!/usr/bin/env node

/** Build and verify the bounded Week05 Technical Content Wave 2 publication unit. */

const fs = require('node:fs');
const path = require('node:path');
const {
  applyRollbackProjection,
  fileSha256,
  identityKey,
  loadTechnicalAuthority,
  sha256,
  stableJson,
  validateTechnicalAuthority,
  verifyPersistedArtifacts
} = require('./technical-authority');
const { verifyProjectionConsistency } = require('./technical-projection');
const { verifyTechnicalWave2Export } = require('./technical-wave2-export');
const {
  buildNormalizedTechnicalPage,
  buildSearchProjection
} = require('../import-technical-content');
const { filterWeek06Wave1Projection } = require('./technical-wave-baseline');

const WAVE_ID = 'wave-2';
const WAVE_MIN_CANDIDATES = 1;
const WAVE_MAX_CANDIDATES = 200;
const BASELINE_WAVE = 'wave-1';
const REGISTRY_RELATIVE_PATH = 'src/components/tech-center/entries.json';
const SEARCH_RELATIVE_PATH = 'public/tech-center/search-index.json';
const EN_SEARCH_RELATIVE_PATH = 'public/tech-center/search-index.en.json';
const AUTHORITY_DIR = 'src/content/tech-center/authority';
const WAVE_SELECTION_RELATIVE_PATH = `${AUTHORITY_DIR}/week05-wave2-selection.json`;
const WAVE_CONTENT_RELATIVE_PATH = `${AUTHORITY_DIR}/week05-wave2-content.json`;
const WAVE_MANIFEST_RELATIVE_PATH = `${AUTHORITY_DIR}/week05-wave2-manifest.json`;
const WAVE_PROJECTION_RELATIVE_PATH = `${AUTHORITY_DIR}/week05-wave2-projection.json`;
const WAVE_ROLLBACK_RELATIVE_PATH = `${AUTHORITY_DIR}/week05-wave2-rollback.json`;
const WAVE_RELEASE_MANIFEST_RELATIVE_PATH = `${AUTHORITY_DIR}/week05-wave2-release-manifest.json`;
const WAVE1_SELECTION_RELATIVE_PATH = `${AUTHORITY_DIR}/week05-wave1-selection.json`;
const WAVE1_PROJECTION_RELATIVE_PATH = `${AUTHORITY_DIR}/week05-wave1-projection.json`;
const WAVE1_RELEASE_MANIFEST_RELATIVE_PATH = `${AUTHORITY_DIR}/week05-wave1-release-manifest.json`;
const WAVE1_ROLLBACK_RELATIVE_PATH = `${AUTHORITY_DIR}/week05-wave1-rollback.json`;
const PUBLIC_CANONICAL_HOST = 'https://fastgpt.cn';
const WAVE_SURFACES = [
  'registry',
  'search',
  'sitemap',
  'staticExport',
  'releaseRecord',
  'rollback'
];
const READER_CONTENT_CONTRACT = [
  'reader-content',
  'public-citation',
  'environment-version-scope',
  'error-fingerprint',
  'safeguards',
  'rollback-guidance'
];
const CREDENTIAL_PATTERNS = [
  /\bsk-[A-Za-z0-9][A-Za-z0-9_-]{5,}\b/gi,
  /\bBearer\s+(?!\[REDACTED_CREDENTIAL\])[A-Za-z0-9._~+/=-]{6,}/gi,
  /\beyJ[A-Za-z0-9._-]{20,}\b/g,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  /\b(?:mysql|postgres(?:ql)?|mongodb(?:\+srv)?):\/\/[^\s`:@]+:[^\s`@]+@/gi,
  /\b(?:api[_-]?key|access[_-]?token|password|secret)\s*[:=]\s*(?!\[REDACTED_CREDENTIAL\]|YOUR_API_KEY|<[^>]+>)[^\s,`)}]+/gi
];

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function assertArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
}

function assertText(value, label) {
  if (typeof value !== 'string' || !value.trim())
    throw new Error(`${label} must be non-empty text`);
}

function assertDigest(value, label) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`${label} must be a SHA-256 digest`);
  }
}

function parseEntryIdentity(entry) {
  const match = entry.slug?.match(/^\/([^/]+)(\/.*)$/);
  if (!match) throw new Error(`Invalid technical entry slug: ${entry.slug}`);
  return { locale: match[1], canonicalPath: match[2] };
}

function readJson(repoRoot, relativePath) {
  const filePath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(filePath)) throw new Error(`Missing Wave 2 artifact: ${relativePath}`);
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Unable to parse Wave 2 artifact ${relativePath}: ${error.message}`);
  }
}

function containsCredentialShape(value) {
  return CREDENTIAL_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(String(value));
  });
}

function loadWave2Selection(repoRoot) {
  const selection = readJson(repoRoot, WAVE_SELECTION_RELATIVE_PATH);
  assertObject(selection, 'Wave 2 selection');
  assertArray(selection.criteria, 'Wave 2 selection.criteria');
  assertArray(selection.candidateIds, 'Wave 2 selection.candidateIds');
  if (
    selection.schemaVersion !== 1 ||
    selection.batch !== 'week05' ||
    selection.wave !== WAVE_ID ||
    selection.status !== 'approved'
  ) {
    throw new Error('Wave 2 selection metadata drift');
  }
  assertText(selection.reviewer, 'Wave 2 selection.reviewer');
  if (
    selection.candidateIds.length < WAVE_MIN_CANDIDATES ||
    selection.candidateIds.length > WAVE_MAX_CANDIDATES
  ) {
    throw new Error(
      `Wave 2 selection must contain ${WAVE_MIN_CANDIDATES}-${WAVE_MAX_CANDIDATES} candidates`
    );
  }
  if (new Set(selection.candidateIds).size !== selection.candidateIds.length) {
    throw new Error('Wave 2 selection contains duplicate candidate IDs');
  }
  selection.candidateIds.forEach((id, index) => assertText(id, `Wave 2 candidateIds[${index}]`));
  return {
    ...selection,
    provenance: {
      path: WAVE_SELECTION_RELATIVE_PATH,
      sha256: fileSha256(path.join(repoRoot, WAVE_SELECTION_RELATIVE_PATH))
    }
  };
}

function getWave1CandidateIds(repoRoot) {
  const selection = readJson(repoRoot, WAVE1_SELECTION_RELATIVE_PATH);
  assertArray(selection.candidateIds, 'Wave 1 candidate IDs');
  return new Set(selection.candidateIds);
}

function getSelectionIdentityKeys(authority, selection) {
  const candidatesById = new Map(
    authority.candidates.map((candidate) => [candidate.id, candidate])
  );
  return new Set(
    selection.candidateIds.map((candidateId) => {
      const candidate = candidatesById.get(candidateId);
      if (!candidate) throw new Error(`Wave 2 approved candidate is unknown: ${candidateId}`);
      return identityKey(candidate.identity);
    })
  );
}

function normalizeSearchProjection(entries, search) {
  const expected = buildSearchProjection(entries);
  const observedByIdentity = new Map(search.map((entry) => [entry.identity, entry]));
  if (observedByIdentity.size !== search.length || observedByIdentity.size !== expected.length) {
    throw new Error('Wave 2 search projection identity set drift');
  }
  for (const entry of expected) {
    if (JSON.stringify(observedByIdentity.get(entry.identity)) !== JSON.stringify(entry)) {
      throw new Error(`Wave 2 search projection drift: ${entry.identity}`);
    }
  }
  return expected;
}

function removeWave2Projection(repoRoot, authority, selection) {
  const deployed = filterWeek06Wave1Projection(repoRoot);
  const selectedKeys = getSelectionIdentityKeys(authority, selection);
  const baselineEntries = deployed.entries.filter(
    (entry) => !selectedKeys.has(identityKey(parseEntryIdentity(entry)))
  );
  const baselineSearch = deployed.search.filter((entry) => !selectedKeys.has(entry.identity));
  return {
    baselineEntries,
    baselineSearch,
    deployedEntries: deployed.entries,
    deployedSearch: deployed.search,
    selectedKeys
  };
}

function candidateFailures(candidate, existingKeys, wave1Ids, selectedIds) {
  const failures = [];
  const key = identityKey(candidate.identity);
  if (candidate.state !== 'accepted' || candidate.decision?.disposition !== 'accepted') {
    failures.push('final-accepted-state-required');
  }
  if (candidate.decision?.operation !== 'add') failures.push('accepted-add-required');
  if (candidate.evidence.status !== 'verified' || !candidate.evidence.sources.length) {
    failures.push('verified-public-evidence-required');
  }
  if (candidate.evidence.fingerprint.length < 24)
    failures.push('recognizable-fingerprint-required');
  if (!candidate.evidence.applicability.trim()) failures.push('explicit-applicability-required');
  if (candidate.security.status === 'needs-review') failures.push('credential-review-unresolved');
  if (candidate.security.findings.some((finding) => finding.disposition === 'denied')) {
    failures.push('denied-security-finding');
  }
  if (candidate.operationRisk.level === 'D0') failures.push('D0-operation-risk-denied');
  if (['D1', 'D2'].includes(candidate.operationRisk.level)) {
    for (const field of ['warning', 'prerequisite', 'rollback']) {
      if (candidate.operationRisk[field].length < 8) {
        failures.push(`${candidate.operationRisk.level}-${field}-required`);
      }
    }
  }
  if (candidate.evidence.sources.some((source) => !/^https:\/\/[^/]+/.test(source))) {
    failures.push('public-https-source-required');
  }
  if (containsCredentialShape(candidate.evidence.fingerprint))
    failures.push('credential-shaped-evidence');
  if (wave1Ids.has(candidate.id)) failures.push('wave-1-identity-reused');
  if (existingKeys.has(key) && !selectedIds.has(candidate.id))
    failures.push('existing-identity-collision');
  return failures;
}

function chooseWave2Candidates(authority, entries, approvedSelection, repoRoot) {
  validateTechnicalAuthority(authority, { repoRoot, verifyHistory: true, verifyArtifacts: true });
  assertArray(entries, 'entries');
  assertObject(approvedSelection, 'approvedSelection');
  const selectedIds = new Set(approvedSelection.candidateIds);
  const wave1Ids = getWave1CandidateIds(repoRoot);
  const existingKeys = new Set(entries.map(parseEntryIdentity).map(identityKey));
  const accepted = authority.candidates.filter((candidate) =>
    authority.final.accepted.includes(candidate.id)
  );
  const eligible = accepted.filter(
    (candidate) => candidateFailures(candidate, existingKeys, wave1Ids, selectedIds).length === 0
  );
  const eligibleById = new Map(eligible.map((candidate) => [candidate.id, candidate]));
  const candidates = approvedSelection.candidateIds.map((candidateId) => {
    const candidate = eligibleById.get(candidateId);
    if (!candidate) {
      const known = authority.candidates.some((entry) => entry.id === candidateId);
      throw new Error(
        known
          ? `Wave 2 approved candidate is ineligible: ${candidateId}`
          : `Wave 2 approved candidate is unknown: ${candidateId}`
      );
    }
    return candidate;
  });
  return {
    criteria: approvedSelection.criteria,
    candidates,
    eligibleCount: eligible.length,
    baselinePageCount: entries.length,
    approval: {
      reviewer: approvedSelection.reviewer,
      ...approvedSelection.provenance
    }
  };
}

function buildReaderBody(candidate) {
  const title = String(candidate.title).replace(/\s+/g, ' ').trim();
  const fingerprint = String(candidate.evidence.fingerprint).replace(/\s+/g, ' ').trim();
  const applicability = String(candidate.evidence.applicability).replace(/\s+/g, ' ').trim();
  const versions = [
    ...fingerprint.matchAll(/(?<!\d)(?:v(?:ersion)?\s*)?\d+\.\d+(?:\.\d+)?(?:-[A-Za-z0-9.]+)?/gi)
  ]
    .map((match) => match[0].trim())
    .filter((value, index, values) => values.indexOf(value) === index)
    .slice(0, 8);
  const versionScope = versions.length
    ? `维护者记录涉及 ${versions.join('、')}；应用前请在目标环境确认实际 FastGPT 与相关组件版本。`
    : '维护者记录未给出完整版本号；应用前请在目标环境确认实际 FastGPT 与相关组件版本。';
  const risk = candidate.operationRisk;
  const riskGuidance =
    risk.level === 'none'
      ? '权威审查未识别破坏性操作。仍应先在可恢复环境验证，并保留变更前配置与日志。'
      : `风险等级为 ${risk.level}。${risk.warning} ${risk.prerequisite}`;
  const rollback =
    risk.level === 'none'
      ? '保留变更前的镜像、配置和数据备份；验证失败时恢复上一份完整技术内容投影，并重新执行受影响场景。'
      : risk.rollback;
  return `# ${title}

## 适用环境与版本范围

- **环境：** ${applicability}
- **版本范围：** ${versionScope}
- **适用边界：** 这篇说明只覆盖公开维护者来源中记录的现象。先核对部署方式、相关组件和请求入口，再执行处理步骤。

## 问题指纹

> ${fingerprint}

使用问题指纹定位同一故障：记录完整错误文本、发生时间、FastGPT 版本、相关组件版本和复现入口。请求 ID、应用 ID、账号标识与任何凭证都应替换为 [REDACTED_CREDENTIAL] 或其他不可用占位符。

## 排查步骤

1. 在目标环境确认上面的版本范围和部署边界，并保存当前配置、容器状态与相关日志。
2. 将日志中的错误文本与问题指纹逐项比对，区分启动、请求、索引、工作流和前端运行时阶段。
3. 先使用公开来源中记录的最小可逆调整，单次只改变一个变量，并记录调整前后的配置差异。
4. 重新执行触发故障的最小场景，确认成功响应、索引状态、工作流结果或页面行为恢复。
5. 将验证结果与原始维护者来源对照；环境或版本超出范围时暂停扩大变更并重新确认适用性。

## 安全护栏

- ${riskGuidance}
- 任何示例凭证、访问令牌、私钥、连接串密码和真实业务标识都不进入日志、截图或读者输出。
- 变更前完成可恢复备份，限制操作范围，并保留验证命令的结果摘要。

## 回滚指引

- ${rollback}
- 回滚后再次执行问题指纹对应的最小复现，并确认服务健康、数据完整和公开入口可用。

## 维护者证据

> 来源：[FastGPT maintainer source](${candidate.provenance.sourceUrl})
`;
}

function buildReaderPage(candidate) {
  const body = buildReaderBody(candidate);
  return buildNormalizedTechnicalPage({
    metadata: {
      title: candidate.title,
      slug: `/${candidate.identity.locale}${candidate.identity.canonicalPath}`,
      page_type: '故障排查',
      source: candidate.provenance.sourceUrl,
      source_type: candidate.sourceType
    },
    identity: candidate.identity,
    body,
    wordCount: body.length,
    sourceCount: 1,
    label: `Wave 2 ${candidate.id}`
  });
}

function buildBaseline(repoRoot, entries, search) {
  const wave1Projection = readJson(repoRoot, WAVE1_PROJECTION_RELATIVE_PATH);
  const wave1Release = readJson(repoRoot, WAVE1_RELEASE_MANIFEST_RELATIVE_PATH);
  const wave1Rollback = readJson(repoRoot, WAVE1_ROLLBACK_RELATIVE_PATH);
  if (wave1Projection.resultingPageCount !== entries.length) {
    throw new Error(
      `Wave 2 baseline registry count drift: expected ${wave1Projection.resultingPageCount}, found ${entries.length}`
    );
  }
  if (wave1Release.resultingPageCount !== entries.length) {
    throw new Error(
      `Wave 2 deployed baseline count drift: expected ${wave1Release.resultingPageCount}, found ${entries.length}`
    );
  }
  if (wave1Rollback.resultingPageCount !== entries.length) {
    throw new Error(
      `Wave 2 rollback baseline count drift: expected ${wave1Rollback.resultingPageCount}, found ${entries.length}`
    );
  }
  if (search.length !== entries.length) throw new Error('Wave 2 baseline search count drift');
  const wave1Artifacts = new Map(
    (Array.isArray(wave1Release.artifacts) ? wave1Release.artifacts : []).map((artifact) => [
      artifact.path,
      artifact.sha256
    ])
  );
  const deployedRegistrySha256 = wave1Artifacts.get(REGISTRY_RELATIVE_PATH);
  const deployedSearchSha256 = wave1Artifacts.get(SEARCH_RELATIVE_PATH);
  assertDigest(deployedRegistrySha256, 'Wave 1 deployed registry digest');
  assertDigest(deployedSearchSha256, 'Wave 1 deployed search digest');
  const registrySha256 = sha256(stableJson(entries));
  const searchSha256 = sha256(stableJson(search));
  if (registrySha256 !== deployedRegistrySha256) {
    throw new Error('Wave 2 actual baseline registry does not match the deployed Wave 1 artifact');
  }
  if (searchSha256 !== deployedSearchSha256) {
    throw new Error('Wave 2 actual baseline search does not match the deployed Wave 1 artifact');
  }
  return {
    wave: BASELINE_WAVE,
    pageCount: entries.length,
    publicationCount: wave1Projection.publicationCount,
    registrySha256,
    searchSha256,
    projectionSha256: fileSha256(path.join(repoRoot, WAVE1_PROJECTION_RELATIVE_PATH)),
    releaseManifestSha256: fileSha256(path.join(repoRoot, WAVE1_RELEASE_MANIFEST_RELATIVE_PATH)),
    rollbackSha256: fileSha256(path.join(repoRoot, WAVE1_ROLLBACK_RELATIVE_PATH)),
    releaseResultingPageCount: wave1Release.resultingPageCount,
    rollbackResultingPageCount: wave1Rollback.resultingPageCount
  };
}

function buildWaveProjection({ authority, entries, selection, baseline }) {
  const selectedKeys = new Set(
    selection.candidates.map((candidate) => identityKey(candidate.identity))
  );
  const selected = selection.candidates;
  const identities = selected.map((candidate) => ({
    key: identityKey(candidate.identity),
    candidateId: candidate.id,
    locale: candidate.identity.locale,
    canonicalPath: candidate.identity.canonicalPath,
    slug: `/${candidate.identity.locale}${candidate.identity.canonicalPath}`,
    canonical: `${PUBLIC_CANONICAL_HOST}${candidate.identity.canonicalPath}`
  }));
  const registry = entries
    .filter((entry) => selectedKeys.has(identityKey(parseEntryIdentity(entry))))
    .map((entry) => ({ identity: identityKey(parseEntryIdentity(entry)), ...entry }));
  const search = buildSearchProjection(entries).filter((entry) => selectedKeys.has(entry.identity));
  const sitemap = identities.map((identity) => ({
    identity: identity.key,
    url: identity.canonical
  }));
  const staticExport = identities.map((identity) => ({
    identity: identity.key,
    path: identity.canonicalPath,
    reviewPath: identity.slug,
    canonical: identity.canonical,
    status: 200
  }));
  const releaseRecord = identities.map((identity) => ({
    candidateId: identity.candidateId,
    identity: identity.key,
    status: 'source-verified',
    sourceVerified: true,
    exportVerified: false,
    releaseEligible: false,
    publicationCount: 1
  }));
  const rollback = identities.map((identity) => ({
    candidateId: identity.candidateId,
    identity: identity.key,
    baselinePageCount: baseline.pageCount,
    action: 'remove-wave-2-projection',
    restore: [
      REGISTRY_RELATIVE_PATH,
      SEARCH_RELATIVE_PATH,
      WAVE1_PROJECTION_RELATIVE_PATH,
      WAVE1_RELEASE_MANIFEST_RELATIVE_PATH,
      WAVE1_ROLLBACK_RELATIVE_PATH
    ]
  }));
  const projection = {
    schemaVersion: 1,
    batch: 'week05',
    consistency: 'identity-set-verified',
    mode: 'publish',
    wave: WAVE_ID,
    governanceStatus: 'governance-complete',
    sourceVerified: true,
    exportVerified: false,
    releaseEligible: false,
    baselinePageCount: baseline.pageCount,
    acceptedCandidateCount: selected.length,
    acceptedAdd: selected.length,
    acceptedUpdate: 0,
    publicPageDelta: selected.length,
    publicationCount: selected.length,
    resultingPageCount: baseline.pageCount + selected.length,
    identitySet: identities.map((identity) => identity.key),
    surfaces: WAVE_SURFACES,
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

function buildWaveContentManifest({ selection, entries, readerDocuments }) {
  const entriesByIdentity = new Map(
    entries.map((entry) => [identityKey(parseEntryIdentity(entry)), entry])
  );
  const sources = selection.candidates.map((candidate) => {
    const key = identityKey(candidate.identity);
    const readerPath = `src/content/tech-center${candidate.identity.canonicalPath}.md`;
    const readerDocument = readerDocuments.get(readerPath);
    const entry = entriesByIdentity.get(key);
    if (!readerDocument || !entry)
      throw new Error(`Wave 2 identity projection is incomplete: ${key}`);
    return {
      candidateId: candidate.id,
      identity: candidate.identity,
      operation: candidate.decision.operation,
      sourceUrl: candidate.provenance.sourceUrl,
      sourceSha256: candidate.provenance.sourceSha256,
      sourceBodySha256: candidate.provenance.bodySha256,
      evidence: {
        status: candidate.evidence.status,
        fingerprint: candidate.evidence.fingerprint.replace(/\s+/g, ' ').trim(),
        applicability: candidate.evidence.applicability.replace(/\s+/g, ' ').trim()
      },
      securityStatus: candidate.security.status,
      operationRisk: candidate.operationRisk.level,
      readerPath,
      readerSha256: sha256(readerDocument),
      registryEntrySha256: sha256(stableJson(entry))
    };
  });
  const sourceSetSha256 = sha256(
    stableJson(
      sources.map((source) => ({
        candidateId: source.candidateId,
        identity: source.identity,
        sourceSha256: source.sourceSha256,
        sourceBodySha256: source.sourceBodySha256,
        readerSha256: source.readerSha256
      }))
    )
  );
  return {
    schemaVersion: 1,
    batch: 'week05',
    wave: WAVE_ID,
    status: 'source-verified',
    readerContentContract: READER_CONTENT_CONTRACT,
    sourceSetSha256,
    readerCount: sources.length,
    identitySet: sources.map((source) => identityKey(source.identity)),
    sources
  };
}

function buildWaveRollback({ entries, search, projection, baseline }) {
  const selectedKeys = new Set(projection.identities.map((identity) => identity.key));
  const baselineEntries = entries.filter(
    (entry) => !selectedKeys.has(identityKey(parseEntryIdentity(entry)))
  );
  const baselineSearch = search.filter((entry) => !selectedKeys.has(entry.identity));
  const surfaceIdentitySets = Object.fromEntries(
    WAVE_SURFACES.map((surface) => [
      surface,
      projection[surface].map((entry) =>
        typeof entry === 'string' ? entry : entry.identity || entry.key || identityKey(entry)
      )
    ])
  );
  return {
    schemaVersion: 1,
    batch: 'week05',
    wave: WAVE_ID,
    status: 'ready',
    baseline,
    resultingPageCount: projection.resultingPageCount,
    identitySet: projection.identities.map((identity) => identity.key),
    waveIdentitySet: projection.identities.map((identity) => identity.key),
    publicSurfaces: [
      REGISTRY_RELATIVE_PATH,
      SEARCH_RELATIVE_PATH,
      'sitemap.xml',
      'static-export/technical-pages',
      'release-record/technical-wave',
      WAVE_PROJECTION_RELATIVE_PATH
    ],
    surfaceIdentitySets,
    priorCompleteState: {
      registrySha256: sha256(stableJson(baselineEntries)),
      searchSha256: sha256(stableJson(baselineSearch)),
      projectionSha256: baseline.projectionSha256,
      releaseManifestSha256: baseline.releaseManifestSha256,
      rollbackSha256: baseline.rollbackSha256
    },
    rollbackAction: 'Restore every listed prior state together before serving the next export.',
    rollbackStrategy: 'stage-all-then-rename-and-restore-on-error',
    identities: projection.rollback
  };
}

function buildWavePackage(repoRoot) {
  const authority = loadTechnicalAuthority(repoRoot);
  const entries = readJson(repoRoot, REGISTRY_RELATIVE_PATH);
  const existingSearch = normalizeSearchProjection(entries, [
    ...readJson(repoRoot, SEARCH_RELATIVE_PATH),
    ...readJson(repoRoot, EN_SEARCH_RELATIVE_PATH)
  ]);
  if (!Array.isArray(entries) || !Array.isArray(existingSearch))
    throw new Error('Wave 2 registry and search must be arrays');
  const approvedSelection = loadWave2Selection(repoRoot);
  const { baselineEntries, baselineSearch } = removeWave2Projection(
    repoRoot,
    authority,
    approvedSelection
  );
  const baseline = buildBaseline(repoRoot, baselineEntries, baselineSearch);
  const selection = chooseWave2Candidates(authority, baselineEntries, approvedSelection, repoRoot);
  const readerDocuments = new Map();
  const readerPages = new Map();
  const readerPaths = [];
  for (const candidate of selection.candidates) {
    const readerPath = `src/content/tech-center${candidate.identity.canonicalPath}.md`;
    const readerPage = buildReaderPage(candidate);
    readerDocuments.set(readerPath, readerPage.document);
    readerPages.set(candidate.id, readerPage);
    readerPaths.push(readerPath);
  }
  const projectedEntries = [
    ...baselineEntries,
    ...selection.candidates.map((candidate) => readerPages.get(candidate.id).projection)
  ];
  const projectedSearch = buildSearchProjection(projectedEntries);
  const content = buildWaveContentManifest({
    selection,
    entries: projectedEntries,
    readerDocuments
  });
  const projection = buildWaveProjection({
    authority,
    entries: projectedEntries,
    selection,
    baseline
  });
  const rollback = buildWaveRollback({
    entries: projectedEntries,
    search: projectedSearch,
    projection,
    baseline
  });
  const manifest = {
    schemaVersion: 1,
    batch: 'week05',
    wave: WAVE_ID,
    status: 'source-verified',
    identitySet: projection.identities.map((identity) => identity.key),
    baseline,
    selection: {
      criteria: selection.criteria,
      selectedCount: selection.candidates.length,
      eligibleCount: selection.eligibleCount,
      candidateIds: selection.candidates.map((candidate) => candidate.id),
      identitySet: projection.identities.map((identity) => identity.key),
      approval: selection.approval
    },
    counts: {
      baselinePageCount: baseline.pageCount,
      acceptedCandidateCount: selection.candidates.length,
      acceptedAdd: projection.acceptedAdd,
      acceptedUpdate: projection.acceptedUpdate,
      publicPageDelta: projection.publicPageDelta,
      resultingPageCount: projection.resultingPageCount
    },
    content: {
      path: WAVE_CONTENT_RELATIVE_PATH,
      sha256: sha256(stableJson(content)),
      readerCount: content.readerCount,
      identitySet: content.identitySet
    },
    projection: {
      path: WAVE_PROJECTION_RELATIVE_PATH,
      sha256: sha256(stableJson(projection)),
      identityCount: projection.identities.length,
      identitySet: projection.identitySet
    },
    rollback: {
      path: WAVE_ROLLBACK_RELATIVE_PATH,
      sha256: sha256(stableJson(rollback)),
      identityCount: rollback.waveIdentitySet.length,
      identitySet: rollback.identitySet
    },
    provenance: {
      authorityArtifact: 'src/content/tech-center/authority/week05-authority.json',
      authorityArtifactSha256: fileSha256(
        path.join(repoRoot, 'src/content/tech-center/authority/week05-authority.json')
      ),
      sourceSetSha256: content.sourceSetSha256,
      sourcePolicy: 'Week05 final accepted authority with public HTTPS maintainer evidence',
      wave1ExclusionPath: WAVE1_SELECTION_RELATIVE_PATH,
      wave1ExclusionSha256: fileSha256(path.join(repoRoot, WAVE1_SELECTION_RELATIVE_PATH))
    },
    verification: { sourceVerified: true, exportVerified: false, releaseEligible: false }
  };
  const artifactBytes = new Map([
    [REGISTRY_RELATIVE_PATH, stableJson(projectedEntries)],
    [SEARCH_RELATIVE_PATH, stableJson(projectedSearch)],
    [WAVE_CONTENT_RELATIVE_PATH, stableJson(content)],
    [WAVE_MANIFEST_RELATIVE_PATH, stableJson(manifest)],
    [WAVE_PROJECTION_RELATIVE_PATH, stableJson(projection)],
    [WAVE_ROLLBACK_RELATIVE_PATH, stableJson(rollback)]
  ]);
  const releaseManifest = {
    schemaVersion: 1,
    batch: 'week05',
    wave: WAVE_ID,
    status: 'source-verified',
    sourceSetSha256: content.sourceSetSha256,
    baseline,
    resultingPageCount: projection.resultingPageCount,
    identitySet: projection.identities.map((identity) => identity.key),
    writeStrategy: 'rollback-on-error',
    postWriteVerification: 'required',
    artifacts: [...artifactBytes.entries()].map(([relativePath, bytes]) => ({
      path: relativePath,
      sha256: sha256(bytes)
    }))
  };
  artifactBytes.set(WAVE_RELEASE_MANIFEST_RELATIVE_PATH, stableJson(releaseManifest));
  return {
    authority,
    baseline,
    selection,
    entries: projectedEntries,
    search: projectedSearch,
    content,
    projection,
    rollback,
    manifest,
    releaseManifest,
    files: [...readerPaths, ...artifactBytes.keys()].map((relativePath) =>
      path.join(repoRoot, relativePath)
    ),
    contents: [
      ...readerPaths.map((relativePath) => readerDocuments.get(relativePath)),
      ...artifactBytes.values()
    ]
  };
}

function writeWavePackage(wavePackage, failAt) {
  applyRollbackProjection({ files: wavePackage.files, contents: wavePackage.contents, failAt });
  console.log(
    `[generate-technical-wave2] source projection written: wave=${WAVE_ID} selected=${wavePackage.selection.candidates.length} pages=${wavePackage.projection.resultingPageCount}`
  );
}

function verifyReaderDocument(repoRoot, source) {
  const filePath = path.join(repoRoot, source.readerPath);
  if (!fs.existsSync(filePath))
    throw new Error(`Wave 2 reader content is missing: ${source.readerPath}`);
  const document = fs.readFileSync(filePath, 'utf8');
  const expectedSlug = `/${source.identity.locale}${source.identity.canonicalPath}`;
  if (!document.includes(`slug: ${expectedSlug}`))
    throw new Error(`Wave 2 reader slug drift: ${expectedSlug}`);
  if (!document.includes(`source: ${source.sourceUrl}`))
    throw new Error(`Wave 2 reader source drift: ${expectedSlug}`);
  for (const heading of [
    '## 适用环境与版本范围',
    '## 问题指纹',
    '## 安全护栏',
    '## 回滚指引',
    '## 维护者证据'
  ]) {
    if (!document.includes(heading))
      throw new Error(`Wave 2 reader section missing: ${expectedSlug} ${heading}`);
  }
  if (!document.includes(`[FastGPT maintainer source](${source.sourceUrl})`))
    throw new Error(`Wave 2 public citation missing: ${expectedSlug}`);
  if (containsCredentialShape(document))
    throw new Error(`Wave 2 reader contains credential-shaped output: ${expectedSlug}`);
  if (sha256(document) !== source.readerSha256)
    throw new Error(`Wave 2 reader SHA-256 drift: ${expectedSlug}`);
}

function verifyWave2Source(repoRoot = path.resolve(__dirname, '../..')) {
  const authority = loadTechnicalAuthority(repoRoot);
  const entries = readJson(repoRoot, REGISTRY_RELATIVE_PATH);
  const search = normalizeSearchProjection(entries, [
    ...readJson(repoRoot, SEARCH_RELATIVE_PATH),
    ...readJson(repoRoot, EN_SEARCH_RELATIVE_PATH)
  ]);
  const manifest = readJson(repoRoot, WAVE_MANIFEST_RELATIVE_PATH);
  const content = readJson(repoRoot, WAVE_CONTENT_RELATIVE_PATH);
  const projection = readJson(repoRoot, WAVE_PROJECTION_RELATIVE_PATH);
  const rollback = readJson(repoRoot, WAVE_ROLLBACK_RELATIVE_PATH);
  const releaseManifest = readJson(repoRoot, WAVE_RELEASE_MANIFEST_RELATIVE_PATH);
  validateTechnicalAuthority(authority, { repoRoot, verifyHistory: true, verifyArtifacts: true });
  verifyPersistedArtifacts(authority, repoRoot);
  const approvedSelection = loadWave2Selection(repoRoot);
  const { baselineEntries, baselineSearch, deployedEntries, deployedSearch } =
    removeWave2Projection(repoRoot, authority, approvedSelection);
  const baseline = buildBaseline(repoRoot, baselineEntries, baselineSearch);
  if (JSON.stringify(manifest.baseline) !== JSON.stringify(baseline)) {
    throw new Error('Wave 2 actual deployed baseline drift');
  }
  assertObject(baseline, 'Wave 2 baseline');
  assertDigest(baseline.registrySha256, 'Wave 2 baseline.registrySha256');
  assertDigest(baseline.searchSha256, 'Wave 2 baseline.searchSha256');
  if (baselineEntries.length !== baseline.pageCount)
    throw new Error('Wave 2 actual baseline page count drift');
  if (sha256(stableJson(baselineEntries)) !== baseline.registrySha256)
    throw new Error('Wave 2 baseline registry digest drift');
  if (sha256(stableJson(baselineSearch)) !== baseline.searchSha256)
    throw new Error('Wave 2 baseline search digest drift');
  const selection = chooseWave2Candidates(authority, baselineEntries, approvedSelection, repoRoot);
  if (manifest.status !== 'source-verified' || manifest.wave !== WAVE_ID) {
    throw new Error('Wave 2 manifest metadata drift');
  }
  if (manifest.selection?.selectedCount !== selection.candidates.length) {
    throw new Error('Wave 2 selection count drift');
  }
  if (
    manifest.selection.eligibleCount !== selection.eligibleCount ||
    JSON.stringify(manifest.selection.criteria) !== JSON.stringify(selection.criteria) ||
    JSON.stringify(manifest.selection.approval) !== JSON.stringify(selection.approval)
  ) {
    throw new Error('Wave 2 selection provenance drift');
  }
  if (
    JSON.stringify(selection.candidates.map((candidate) => candidate.id)) !==
    JSON.stringify(manifest.selection.candidateIds)
  )
    throw new Error('Wave 2 selection drift');
  const projectedEntries = [
    ...baselineEntries,
    ...selection.candidates.map((candidate) => buildReaderPage(candidate).projection)
  ];
  const projectedSearch = buildSearchProjection(projectedEntries);
  const expectedContent = buildWaveContentManifest({
    selection,
    entries: projectedEntries,
    readerDocuments: new Map(
      selection.candidates.map((candidate) => [
        `src/content/tech-center${candidate.identity.canonicalPath}.md`,
        fs.readFileSync(
          path.join(repoRoot, `src/content/tech-center${candidate.identity.canonicalPath}.md`),
          'utf8'
        )
      ])
    )
  });
  const expectedProjection = buildWaveProjection({
    authority,
    entries: projectedEntries,
    selection,
    baseline
  });
  const expectedRollback = buildWaveRollback({
    entries: projectedEntries,
    search: projectedSearch,
    projection: expectedProjection,
    baseline
  });
  if (JSON.stringify(content) !== JSON.stringify(expectedContent))
    throw new Error('Wave 2 content manifest drift');
  if (JSON.stringify(projection) !== JSON.stringify(expectedProjection))
    throw new Error('Wave 2 projection drift');
  if (JSON.stringify(rollback) !== JSON.stringify(expectedRollback))
    throw new Error('Wave 2 rollback artifact drift');
  if (
    JSON.stringify(content.sources.map((source) => source.candidateId)) !==
    JSON.stringify(selection.candidates.map((candidate) => candidate.id))
  ) {
    throw new Error('Wave 2 content identity set drift');
  }
  const expectedIdentitySet = selection.candidates.map((candidate) =>
    identityKey(candidate.identity)
  );
  for (const [label, identitySet] of [
    ['content', content.identitySet],
    ['projection', projection.identitySet],
    ['rollback', rollback.identitySet],
    ['rollback wave', rollback.waveIdentitySet],
    ['manifest', manifest.identitySet],
    ['manifest selection', manifest.selection?.identitySet],
    ['release manifest', releaseManifest.identitySet]
  ]) {
    if (JSON.stringify(identitySet) !== JSON.stringify(expectedIdentitySet)) {
      throw new Error(`Wave 2 ${label} identity set drift`);
    }
  }
  if (
    manifest.counts.baselinePageCount !== baseline.pageCount ||
    manifest.counts.acceptedCandidateCount !== projection.acceptedCandidateCount ||
    manifest.counts.acceptedAdd !== projection.acceptedAdd ||
    manifest.counts.acceptedUpdate !== projection.acceptedUpdate ||
    manifest.counts.publicPageDelta !== projection.publicPageDelta ||
    manifest.counts.resultingPageCount !== projection.resultingPageCount
  ) {
    throw new Error('Wave 2 count invariant drift');
  }
  verifyProjectionConsistency(projection);
  for (const source of content.sources) verifyReaderDocument(repoRoot, source);
  if (manifest.content.sha256 !== sha256(stableJson(content)))
    throw new Error('Wave 2 content digest drift');
  if (manifest.projection.sha256 !== sha256(stableJson(projection)))
    throw new Error('Wave 2 projection digest drift');
  if (manifest.rollback.sha256 !== sha256(stableJson(rollback)))
    throw new Error('Wave 2 rollback digest drift');
  if (JSON.stringify(deployedEntries) !== JSON.stringify(projectedEntries))
    throw new Error('Wave 2 registry projection drift');
  if (JSON.stringify(deployedSearch) !== JSON.stringify(projectedSearch))
    throw new Error('Wave 2 deployed search projection drift');
  if (
    releaseManifest.wave !== WAVE_ID ||
    releaseManifest.status !== 'source-verified' ||
    releaseManifest.writeStrategy !== 'rollback-on-error' ||
    releaseManifest.postWriteVerification !== 'required'
  )
    throw new Error('Wave 2 release manifest metadata drift');
  if (
    releaseManifest.sourceSetSha256 !== content.sourceSetSha256 ||
    releaseManifest.resultingPageCount !== projection.resultingPageCount ||
    JSON.stringify(releaseManifest.baseline) !== JSON.stringify(baseline)
  )
    throw new Error('Wave 2 release manifest metadata drift');
  const expectedArtifacts = [
    REGISTRY_RELATIVE_PATH,
    SEARCH_RELATIVE_PATH,
    WAVE_CONTENT_RELATIVE_PATH,
    WAVE_MANIFEST_RELATIVE_PATH,
    WAVE_PROJECTION_RELATIVE_PATH,
    WAVE_ROLLBACK_RELATIVE_PATH
  ].sort();
  if (
    JSON.stringify(releaseManifest.artifacts.map((artifact) => artifact.path).sort()) !==
    JSON.stringify(expectedArtifacts)
  )
    throw new Error('Wave 2 release artifact set drift');
  releaseManifest.artifacts.forEach((artifact) => {
    assertDigest(artifact.sha256, `Wave 2 release artifact ${artifact.path}`);
    const artifactDigest =
      artifact.path === REGISTRY_RELATIVE_PATH
        ? sha256(stableJson(projectedEntries))
        : artifact.path === SEARCH_RELATIVE_PATH
        ? sha256(stableJson(projectedSearch))
        : fileSha256(path.join(repoRoot, artifact.path));
    if (artifactDigest !== artifact.sha256)
      throw new Error(`Wave 2 release artifact digest drift: ${artifact.path}`);
  });
  return {
    wave: WAVE_ID,
    baselineWave: BASELINE_WAVE,
    selectedCount: selection.candidates.length,
    acceptedAdd: projection.acceptedAdd,
    acceptedUpdate: projection.acceptedUpdate,
    baselinePageCount: baseline.pageCount,
    resultingPageCount: projection.resultingPageCount,
    baselineRegistrySha256: baseline.registrySha256,
    baselineSearchSha256: baseline.searchSha256,
    sourceSetSha256: content.sourceSetSha256,
    sourceVerified: true,
    exportVerified: false,
    releaseEligible: false
  };
}

function verifyWave2Export(repoRoot, options) {
  return verifyTechnicalWave2Export(repoRoot, options, verifyWave2Source);
}

module.exports = {
  BASELINE_WAVE,
  PUBLIC_CANONICAL_HOST,
  REGISTRY_RELATIVE_PATH,
  SEARCH_RELATIVE_PATH,
  WAVE_CONTENT_RELATIVE_PATH,
  WAVE_ID,
  WAVE_MANIFEST_RELATIVE_PATH,
  WAVE_MAX_CANDIDATES,
  WAVE_MIN_CANDIDATES,
  WAVE_PROJECTION_RELATIVE_PATH,
  WAVE_RELEASE_MANIFEST_RELATIVE_PATH,
  WAVE_ROLLBACK_RELATIVE_PATH,
  buildReaderPage,
  buildWaveContentManifest,
  buildWavePackage,
  buildWaveProjection,
  buildWaveRollback,
  chooseWave2Candidates,
  loadWave2Selection,
  verifyWave2Export,
  verifyWave2Source,
  writeWavePackage
};
