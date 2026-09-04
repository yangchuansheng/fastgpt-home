const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const { buildSearchProjection } = require('../import-technical-content');
const { buildReaderPage: buildW5ReaderPage } = require('./technical-wave');
const {
  buildReaderPage: buildW6ReaderPage,
  readerPath: week06ReaderPath
} = require('./week06-wave1-content');
const {
  FULL_RELEASE_RELATIVE_PATH,
  validateClosureArtifact,
  verifySourceRecords
} = require('./technical-full-release');
const { sha256, stableJson } = require('./technical-authority');
const { looseFrontMatter } = require('./week06-technical-candidate');

const VARIANTS = ['cn', 'io', 'preview'];
const CAPACITY_POLICY_RELATIVE_PATH = 'src/lib/technical-content-policy.json';
const FULL_RELEASE_IMPORT_MANIFEST_RELATIVE_PATH =
  'src/content/tech-center/authority/full-release-import-manifest.json';
const REGISTRY_RELATIVE_PATH = 'src/components/tech-center/entries.json';
const SEARCH_RELATIVE_PATHS = {
  zh: 'public/tech-center/search-index.json',
  en: 'public/tech-center/search-index.en.json'
};
const LEGACY_PREBUILD_BLOCKER =
  'prebuild-rejects-a-registry-that-has-consumed-the-frozen-pending-closure';
const STALE_MEASUREMENT_BLOCKER = 'capacity-rerun-required-after-source-normalization';

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function assertDigest(value, label) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`${label} must be a lowercase SHA-256 digest`);
  }
}

function authorityCandidates(repoRoot) {
  const w5 = readJson(
    path.join(repoRoot, 'src/content/tech-center/authority/week05-authority.json')
  );
  const w6 = readJson(
    path.join(repoRoot, 'src/content/tech-center/authority/week06-candidate-manifest.json')
  );
  return {
    W5: new Map(w5.candidates.map((candidate) => [candidate.id, candidate])),
    W6: new Map(w6.candidates.map((candidate) => [candidate.id, candidate]))
  };
}

function projectionCounts(entries) {
  return entries.reduce(
    (counts, entry) => {
      const match = entry.slug?.match(/^\/(zh|en)\//);
      if (!match) throw new Error(`Unsupported projected identity: ${entry.slug}`);
      counts[match[1]] += 1;
      return counts;
    },
    { zh: 0, en: 0 }
  );
}

function validateImportedProjection(repoRoot, closure, entries) {
  const manifestPath = path.join(repoRoot, FULL_RELEASE_IMPORT_MANIFEST_RELATIVE_PATH);
  if (!fs.existsSync(manifestPath)) return false;
  const manifest = readJson(manifestPath);
  if (manifest.status !== 'repository-consistent') return false;

  const closurePath = path.join(repoRoot, FULL_RELEASE_RELATIVE_PATH);
  const expectedCounts = {
    baseline: closure.counts.baseline,
    imported: closure.counts.pending,
    total: closure.counts.target
  };
  if (
    manifest.schemaVersion !== 1 ||
    manifest.closure?.path !== FULL_RELEASE_RELATIVE_PATH ||
    manifest.closure?.sha256 !== sha256(fs.readFileSync(closurePath)) ||
    manifest.closure?.recordsSha256 !== closure.recordsSha256 ||
    manifest.pages?.length !== closure.records.length ||
    Object.entries(expectedCounts).some(([key, value]) => manifest.counts?.[key] !== value) ||
    entries.length !== closure.counts.target ||
    sha256(stableJson(entries.slice(0, closure.counts.baseline))) !==
      closure.baseline.registrySha256
  ) {
    throw new Error('Repository-consistent full-release import evidence drift');
  }

  const identities = new Set(entries.map((entry) => entry.slug));
  if (identities.size !== entries.length) {
    throw new Error('Repository-consistent full-release registry contains duplicate identities');
  }
  closure.records.forEach((record, index) => {
    const page = manifest.pages[index];
    const entry = entries[closure.counts.baseline + index];
    const expectedSlug = `/${record.locale}${record.canonicalPath}`;
    const expectedReaderPath = `src/content/tech-center/${
      record.locale === 'en' ? 'en/' : ''
    }${record.canonicalPath.slice(1)}.md`;
    if (
      page.batch !== record.batch ||
      page.authorityId !== record.authorityId ||
      page.identity !== record.identityKey ||
      page.sourceFile !== record.sourceFile ||
      page.sourceUrl !== record.sourceUrl ||
      page.sourceSha256 !== record.sourceSha256 ||
      page.approvedBodySha256 !== record.bodySha256 ||
      page.readerPath !== expectedReaderPath ||
      entry?.slug !== expectedSlug ||
      entry.category !== record.category ||
      page.registryEntrySha256 !== sha256(stableJson(entry))
    ) {
      throw new Error(`Repository-consistent imported projection drift: ${record.authorityId}`);
    }
    const readerPath = path.resolve(repoRoot, page.readerPath);
    const resolvedRoot = path.resolve(repoRoot);
    if (
      !readerPath.startsWith(`${resolvedRoot}${path.sep}`) ||
      !fs.existsSync(readerPath) ||
      !fs.statSync(readerPath).isFile()
    ) {
      throw new Error(`Repository-consistent reader path is invalid: ${record.authorityId}`);
    }
    const document = fs.readFileSync(readerPath, 'utf8');
    const parsed = looseFrontMatter(document.replace(/\r\n?/g, '\n'));
    if (
      page.readerSha256 !== sha256(document) ||
      page.importedBodySha256 !== sha256(parsed.body.trim()) ||
      parsed.values.slug !== expectedSlug ||
      parsed.values.source !== record.sourceUrl
    ) {
      throw new Error(`Repository-consistent reader content drift: ${record.authorityId}`);
    }
  });

  const counts = projectionCounts(entries);
  if (
    counts.zh !== manifest.counts.zh ||
    counts.en !== manifest.counts.en ||
    counts.zh + counts.en !== entries.length
  ) {
    throw new Error('Repository-consistent full-release locale count drift');
  }
  const expectedSearch = buildSearchProjection(entries);
  for (const locale of ['zh', 'en']) {
    const observed = readJson(path.join(repoRoot, SEARCH_RELATIVE_PATHS[locale]));
    const expected = expectedSearch.filter((entry) => entry.locale === locale);
    if (stableJson(observed) !== stableJson(expected)) {
      throw new Error(`Repository-consistent ${locale} search projection drift`);
    }
  }
  return true;
}

function projectTechnicalContent({
  repoRoot,
  w5SourceRoot,
  w6SourceRoot,
  sourceVerifier = verifySourceRecords
}) {
  const closure = validateClosureArtifact(
    readJson(path.join(repoRoot, FULL_RELEASE_RELATIVE_PATH))
  );
  if (closure.status !== 'closed') throw new Error('Technical full-release closure is blocked');
  const registryPath = path.join(repoRoot, REGISTRY_RELATIVE_PATH);
  const entries = readJson(registryPath);
  const reuseImportedProjection = validateImportedProjection(repoRoot, closure, entries);
  const verification = sourceVerifier(closure.records, { w5SourceRoot, w6SourceRoot });
  if (!reuseImportedProjection && verification.verified !== closure.records.length) {
    throw new Error(`Technical source verification failed: ${JSON.stringify(verification)}`);
  }
  if (!reuseImportedProjection) {
    const candidates = authorityCandidates(repoRoot);
    const seen = new Set(entries.map((entry) => entry.slug));
    const roots = { W5: w5SourceRoot, W6: w6SourceRoot };
    for (const record of closure.records) {
      const candidate = candidates[record.batch].get(record.authorityId);
      if (!candidate) throw new Error(`Missing authority candidate ${record.authorityId}`);
      const slug = `/${record.locale}${record.canonicalPath}`;
      if (seen.has(slug)) throw new Error(`Projected identity already exists: ${slug}`);
      const page =
        record.batch === 'W5'
          ? buildW5ReaderPage(candidate)
          : buildW6ReaderPage(repoRoot, candidate, roots[record.batch]);
      if (page.projection.slug !== slug) {
        throw new Error(`Canonical projection slug drift: ${record.authorityId}`);
      }
      const outputPath =
        record.batch === 'W5'
          ? path.join(repoRoot, `src/content/tech-center${record.canonicalPath}.md`)
          : path.join(repoRoot, week06ReaderPath(candidate));
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, page.document);
      entries.push(page.projection);
      seen.add(slug);
    }
  }

  const search = buildSearchProjection(entries);
  const localizedSearch = {
    zh: search.filter((entry) => entry.locale === 'zh'),
    en: search.filter((entry) => entry.locale === 'en')
  };
  if (!reuseImportedProjection) {
    fs.writeFileSync(registryPath, stableJson(entries));
    for (const locale of ['zh', 'en']) {
      fs.writeFileSync(
        path.join(repoRoot, SEARCH_RELATIVE_PATHS[locale]),
        stableJson(localizedSearch[locale])
      );
    }
  }

  const counts = projectionCounts(entries);
  if (entries.length !== closure.counts.target || counts.zh + counts.en !== entries.length) {
    throw new Error(`Projected page count drift: ${entries.length}`);
  }
  return buildProjectionEvidence(repoRoot, closure, entries, verification);
}

function buildProjectionEvidence(repoRoot, closure, entries, sourceVerification) {
  const registryPath = path.join(repoRoot, REGISTRY_RELATIVE_PATH);
  return {
    baselinePages: closure.counts.baseline,
    pendingPages: closure.counts.pending,
    pages: entries.length,
    localePages: projectionCounts(entries),
    recordsSha256: closure.recordsSha256,
    sourceFilesVerified: sourceVerification.verified,
    sourceVerification: sourceVerification.mode,
    repositoryProjectionVerified: closure.records.length,
    registry: fileEvidence(registryPath),
    search: {
      zh: fileEvidence(path.join(repoRoot, SEARCH_RELATIVE_PATHS.zh)),
      en: fileEvidence(path.join(repoRoot, SEARCH_RELATIVE_PATHS.en))
    }
  };
}

function fileEvidence(filePath) {
  const content = fs.readFileSync(filePath);
  return { bytes: content.length, sha256: sha256(content) };
}

function patchCapacityPageCount(repoRoot, pageCount) {
  const filePath = path.join(repoRoot, CAPACITY_POLICY_RELATIVE_PATH);
  const capacityPolicy = readJson(filePath);
  capacityPolicy.expectedPageCount = pageCount;
  fs.writeFileSync(filePath, stableJson(capacityPolicy));
}

function walkFiles(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(root, entry.name);
    return entry.isDirectory() ? walkFiles(filePath) : [filePath];
  });
}

function staticRoutePath(outDir, route) {
  const relative = route.replace(/^\/+|\/+$/g, '');
  return [path.join(outDir, `${relative}.html`), path.join(outDir, relative, 'index.html')].find(
    fs.existsSync
  );
}

function initialJavaScriptGzipBytes(outDir, variant) {
  const route = variant === 'preview' ? '/zh/tech-center' : '/tech-center';
  const htmlPath = staticRoutePath(outDir, route);
  if (!htmlPath) throw new Error(`Missing Technical Center route ${route}`);
  const html = fs.readFileSync(htmlPath, 'utf8');
  const sources = new Set(
    [...html.matchAll(/<script[^>]+src="([^"]+)"/g)]
      .map((match) => match[1])
      .filter((source) => source.startsWith('/_next/') && source.endsWith('.js'))
  );
  if (!sources.size) throw new Error(`Technical Center route ${route} has no initial JavaScript`);
  return [...sources].reduce((bytes, source) => {
    const content = fs.readFileSync(path.join(outDir, source.slice(1)));
    return bytes + zlib.gzipSync(content, { level: 9 }).length;
  }, 0);
}

function summarizeExport(repoRoot, variant) {
  const outDir = path.join(repoRoot, 'out');
  const files = walkFiles(outDir);
  const gzipBytes = initialJavaScriptGzipBytes(outDir, variant);
  const budget = readJson(path.join(repoRoot, 'scripts/fixtures/technical-center-budget.json'));
  const maxGzipBytes = budget.baselineGzipBytes + budget.maxIncreaseBytes;
  return {
    staticFileCount: files.length,
    exportBytes: files.reduce((bytes, filePath) => bytes + fs.statSync(filePath).size, 0),
    initialJavaScriptGzipBytes: gzipBytes,
    initialJavaScriptMaxGzipBytes: maxGzipBytes,
    initialJavaScriptWithinBudget: gzipBytes <= maxGzipBytes
  };
}

function currentPathBlockers(repoRoot) {
  const dockerfile = fs.readFileSync(path.join(repoRoot, 'Dockerfile'), 'utf8');
  const blockers = [];
  if (/RUN\s+test\s+"\$NEXT_PUBLIC_SITE_VARIANT"\s*=\s*"cn"\s*\|\|/.test(dockerfile)) {
    blockers.push('docker-publication-is-cn-only');
  }
  return blockers;
}

function deriveCapacityBlockers(report, repoRoot) {
  const blockers = currentPathBlockers(repoRoot);
  const binding = report.measurementBinding;
  if (binding?.status === 'stale-after-source-normalization') {
    blockers.push(STALE_MEASUREMENT_BLOCKER);
  }
  if (
    report.variants.some(
      (variant) =>
        variant.buildSucceeded !== true || variant.status !== 0 || variant.signal !== null
    )
  ) {
    blockers.push('one-or-more-static-exports-failed');
  }
  if (report.variants.some((variant) => variant.initialJavaScriptWithinBudget === false)) {
    blockers.push('technical-center-initial-javascript-budget-exceeded');
  }
  for (const variant of report.variants) {
    if (variant.postBuildVerified !== true)
      blockers.push(`${variant.variant}-post-build-gate-failed`);
  }
  return [...new Set(blockers)];
}

function isCapacityVariantReady(measurement) {
  return (
    measurement.buildSucceeded === true &&
    measurement.status === 0 &&
    measurement.signal === null &&
    measurement.initialJavaScriptWithinBudget === true &&
    measurement.postBuildVerified === true &&
    Array.isArray(measurement.postBuildChecks) &&
    measurement.postBuildChecks.length > 0 &&
    measurement.postBuildChecks.every((check) => check.status === 0)
  );
}

function isCapacityReportReady(report) {
  return (
    report.measurementBinding?.status === 'current' &&
    report.measurementBinding?.rerunRequired === false &&
    report.decision?.safeOneShotFullRelease === true &&
    Array.isArray(report.decision?.blockers) &&
    report.decision.blockers.length === 0 &&
    report.variants.every(isCapacityVariantReady)
  );
}

function validateCapacityReport(report, repoRoot) {
  if (report?.schemaVersion !== 1 || report.issue !== 275) {
    throw new Error('Technical full-release capacity report header changed');
  }
  const closure = validateClosureArtifact(
    readJson(path.join(repoRoot, FULL_RELEASE_RELATIVE_PATH))
  );
  const registryPath = path.join(repoRoot, REGISTRY_RELATIVE_PATH);
  const entries = readJson(registryPath);
  if (!validateImportedProjection(repoRoot, closure, entries)) {
    throw new Error('Technical full-release capacity requires the repository projection');
  }
  const sourceVerification = {
    mode: report.projection?.sourceVerification,
    verified: report.projection?.sourceFilesVerified
  };
  const validSourceVerification =
    (sourceVerification.mode === 'authority-recorded' && sourceVerification.verified === 0) ||
    (sourceVerification.mode === 'external-source-root' &&
      sourceVerification.verified === closure.records.length);
  const currentProjection = buildProjectionEvidence(repoRoot, closure, entries, sourceVerification);
  if (
    currentProjection.pages !== closure.counts.target ||
    !validSourceVerification ||
    stableJson(report.projection) !== stableJson(currentProjection)
  ) {
    throw new Error('Technical full-release capacity projection drift');
  }
  if (JSON.stringify(report.variants?.map(({ variant }) => variant)) !== JSON.stringify(VARIANTS)) {
    throw new Error('Technical full-release capacity variant set changed');
  }
  for (const measurement of report.variants) {
    if (measurement.buildSucceeded === true) {
      if (measurement.status !== 0 || measurement.signal !== null) {
        throw new Error(`${measurement.variant} success status evidence is inconsistent`);
      }
      for (const field of [
        'durationMilliseconds',
        'peakRssBytes',
        'staticFileCount',
        'exportBytes',
        'initialJavaScriptGzipBytes',
        'initialJavaScriptMaxGzipBytes'
      ]) {
        if (!(measurement[field] > 0))
          throw new Error(`${measurement.variant}.${field} is missing`);
      }
      if (typeof measurement.initialJavaScriptWithinBudget !== 'boolean') {
        throw new Error(`${measurement.variant}.initialJavaScriptWithinBudget is missing`);
      }
      if (
        measurement.initialJavaScriptWithinBudget !==
        measurement.initialJavaScriptGzipBytes <= measurement.initialJavaScriptMaxGzipBytes
      ) {
        throw new Error(`${measurement.variant} JavaScript budget evidence is inconsistent`);
      }
      if (!Array.isArray(measurement.postBuildChecks) || !measurement.postBuildChecks.length) {
        throw new Error(`${measurement.variant} post-build checks are missing`);
      }
      if (
        measurement.postBuildVerified !==
        measurement.postBuildChecks.every(
          (check) => Number.isInteger(check?.status) && check.status === 0
        )
      ) {
        throw new Error(`${measurement.variant} post-build evidence is inconsistent`);
      }
    } else if (
      measurement.buildSucceeded !== false ||
      (measurement.status !== null &&
        (!Number.isInteger(measurement.status) || measurement.status === 0)) ||
      (measurement.status === null &&
        (measurement.signal !== null ||
          measurement.durationMilliseconds !== null ||
          measurement.peakRssBytes !== null)) ||
      (measurement.signal !== null && typeof measurement.signal !== 'string') ||
      typeof measurement.failure !== 'string' ||
      !measurement.failure ||
      measurement.staticFileCount !== null ||
      measurement.exportBytes !== null ||
      measurement.initialJavaScriptGzipBytes !== null ||
      measurement.initialJavaScriptMaxGzipBytes !== null ||
      measurement.initialJavaScriptWithinBudget !== null ||
      measurement.postBuildVerified !== false ||
      !Array.isArray(measurement.postBuildChecks) ||
      measurement.postBuildChecks.length
    ) {
      throw new Error(`${measurement.variant} failure evidence is incomplete`);
    }
  }
  if (
    typeof report.decision?.safeOneShotFullRelease !== 'boolean' ||
    !Array.isArray(report.decision.blockers) ||
    report.decision.blockers.some((blocker) => typeof blocker !== 'string') ||
    new Set(report.decision.blockers).size !== report.decision.blockers.length
  ) {
    throw new Error('Technical full-release capacity decision drift');
  }
  const binding = report.measurementBinding;
  if (!binding || typeof binding !== 'object' || Array.isArray(binding)) {
    throw new Error('Technical full-release capacity measurement binding is missing');
  }
  assertDigest(binding.measuredRecordsSha256, 'capacity.measurementBinding.measuredRecordsSha256');
  assertDigest(binding.currentRecordsSha256, 'capacity.measurementBinding.currentRecordsSha256');
  if (!['current', 'stale-after-source-normalization'].includes(binding.status)) {
    throw new Error('Technical full-release capacity measurement binding status changed');
  }
  if (typeof binding.rerunRequired !== 'boolean') {
    throw new Error('Technical full-release capacity measurement rerun flag is missing');
  }
  if (binding.currentRecordsSha256 !== report.projection.recordsSha256) {
    throw new Error('Technical full-release capacity measurement current digest drift');
  }
  if (binding.status === 'current') {
    if (binding.rerunRequired || binding.measuredRecordsSha256 !== binding.currentRecordsSha256) {
      throw new Error('Technical full-release capacity current measurement binding drift');
    }
  } else {
    if (
      binding.rerunBlocker !== STALE_MEASUREMENT_BLOCKER ||
      !binding.rerunRequired ||
      binding.measuredRecordsSha256 === binding.currentRecordsSha256
    ) {
      throw new Error('Technical full-release capacity stale measurement binding drift');
    }
    if (report.decision.safeOneShotFullRelease) {
      throw new Error('Technical full-release capacity stale measurement cannot be safe');
    }
    if (!report.decision.blockers.includes(STALE_MEASUREMENT_BLOCKER)) {
      throw new Error('Technical full-release capacity stale measurement rerun blocker is missing');
    }
  }
  const expectedBlockers = deriveCapacityBlockers(report, repoRoot).sort();
  // Downstream contracts digest-bind the stale report, so preserve its obsolete blocker as history.
  const observedBlockers = report.decision.blockers
    .filter(
      (blocker) =>
        blocker !== LEGACY_PREBUILD_BLOCKER || binding.status !== 'stale-after-source-normalization'
    )
    .sort();
  if (
    JSON.stringify(observedBlockers) !== JSON.stringify(expectedBlockers) ||
    report.decision.safeOneShotFullRelease !== (expectedBlockers.length === 0)
  ) {
    throw new Error('Technical full-release capacity decision blockers drift');
  }
  return report;
}

module.exports = {
  CAPACITY_POLICY_RELATIVE_PATH,
  VARIANTS,
  currentPathBlockers,
  deriveCapacityBlockers,
  initialJavaScriptGzipBytes,
  isCapacityReportReady,
  patchCapacityPageCount,
  projectTechnicalContent,
  summarizeExport,
  validateImportedProjection,
  validateCapacityReport
};
