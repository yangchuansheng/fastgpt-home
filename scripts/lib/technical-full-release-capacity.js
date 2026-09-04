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
  const requiredFiles = {
    dockerfile: 'Dockerfile',
    workflow: '.github/workflows/technical-full-release-images.yml',
    bootstrapWorkflow: '.github/workflows/technical-full-release-image-bootstrap.yml',
    productionWorkflow: '.github/workflows/technical-full-release-production.yml',
    generator: 'scripts/generate-technical-full-release-image-manifest.js'
  };
  let dockerfile;
  let workflow;
  let bootstrapWorkflow;
  let productionWorkflow;
  let generator;
  try {
    dockerfile = fs.readFileSync(path.join(repoRoot, requiredFiles.dockerfile), 'utf8');
    workflow = fs.readFileSync(path.join(repoRoot, requiredFiles.workflow), 'utf8');
    bootstrapWorkflow = fs.readFileSync(
      path.join(repoRoot, requiredFiles.bootstrapWorkflow),
      'utf8'
    );
    productionWorkflow = fs.readFileSync(
      path.join(repoRoot, requiredFiles.productionWorkflow),
      'utf8'
    );
    generator = fs.readFileSync(path.join(repoRoot, requiredFiles.generator), 'utf8');
  } catch {
    return ['docker-publication-is-cn-only'];
  }
  const readWorkflowStep = (source, name) => {
    const marker = `      - name: ${name}`;
    const start = source.indexOf(marker);
    if (start < 0) return '';
    const end = source.indexOf('\n      - name:', start + marker.length);
    return source.slice(start, end < 0 ? undefined : end);
  };
  const workflowDispatchOnly = (source) => {
    const block = source.match(/^on:\s*\n([\s\S]*?)(?=^[^\s#])/mu)?.[1] || '';
    const events = [...block.matchAll(/^\s{2}([a-z_]+):/gmu)].map((match) => match[1]);
    return JSON.stringify(events) === JSON.stringify(['workflow_dispatch']);
  };
  const readFunctionBlock = (source, name, nextName) => {
    const start = source.indexOf(`function ${name}(`);
    if (start < 0) return '';
    const end = source.indexOf(`function ${nextName}(`, start + 1);
    return source.slice(start, end < 0 ? undefined : end);
  };
  const releaseStageStart = dockerfile.search(/\bAS\s+release-runtime\b/u);
  const nextStage =
    releaseStageStart < 0 ? -1 : dockerfile.indexOf('\nFROM ', releaseStageStart + 1);
  const releaseStage =
    releaseStageStart < 0
      ? ''
      : dockerfile.slice(releaseStageStart, nextStage < 0 ? undefined : nextStage);
  const verifyStep = readWorkflowStep(workflow, 'Verify the retained full-release bundle');
  const candidateDownloadStep = readWorkflowStep(
    workflow,
    'Download candidate retained release bundle'
  );
  const previousManifestDownloadStep = readWorkflowStep(
    workflow,
    'Download previous signed release image manifest'
  );
  const prepareStep = readWorkflowStep(workflow, 'Prepare isolated CN and IO runtime contexts');
  const cnBuildStep = readWorkflowStep(workflow, 'Build and push immutable CN runtime');
  const ioBuildStep = readWorkflowStep(workflow, 'Build and push immutable IO runtime');
  const manifestStep = readWorkflowStep(workflow, 'Generate signed release image manifest');
  const uploadStep = readWorkflowStep(workflow, 'Upload signed release image manifest');
  const bootstrapVerifyStep = readWorkflowStep(
    bootstrapWorkflow,
    'Verify retained baseline release bundle'
  );
  const bootstrapDownloadStep = readWorkflowStep(
    bootstrapWorkflow,
    'Download retained baseline release bundle'
  );
  const bootstrapPrepareStep = readWorkflowStep(
    bootstrapWorkflow,
    'Prepare isolated bootstrap runtime contexts'
  );
  const bootstrapCnBuildStep = readWorkflowStep(
    bootstrapWorkflow,
    'Build and push immutable bootstrap CN runtime'
  );
  const bootstrapIoBuildStep = readWorkflowStep(
    bootstrapWorkflow,
    'Build and push immutable bootstrap IO runtime'
  );
  const bootstrapManifestStep = readWorkflowStep(
    bootstrapWorkflow,
    'Generate bootstrap signed release image manifest'
  );
  const bootstrapUploadStep = readWorkflowStep(
    bootstrapWorkflow,
    'Upload bootstrap signed release image manifest'
  );
  const productionDownloadStep = readWorkflowStep(
    productionWorkflow,
    'Download signed release image manifest'
  );
  const productionControllerStep = readWorkflowStep(
    productionWorkflow,
    'Run production release controller'
  );
  const bootstrapGenerator = readFunctionBlock(
    generator,
    'buildBootstrapSignedImageManifest',
    'writeSignedImageManifest'
  );
  const packagingChecks = [
    /COPY\s+release-out\/\s+\/usr\/share\/nginx\/html\//u.test(releaseStage),
    /COPY\s+release-out\/__release\/nginx-redirects\.conf\s+\/etc\/nginx\/generated-redirects\.conf/u.test(
      releaseStage
    ),
    /test\s+-s\s+\/etc\/nginx\/generated-redirects\.conf/u.test(releaseStage),
    workflowDispatchOnly(workflow),
    /jobs:\s*\n\s{2}package:\s*\n\s{4}if:\s+github\.repository == 'labring\/fastgpt-home' && github\.ref == 'refs\/heads\/main'/u.test(
      workflow
    ),
    /test\s+"\$GITHUB_SHA"\s+=\s+"\$RELEASE_SOURCE_COMMIT"/u.test(workflow),
    /--verify-bundle\s+"\$RELEASE_BUNDLE"\s+"\$RELEASE_SOURCE_COMMIT"\s+"\$RELEASE_BUNDLE_SHA256"/u.test(
      verifyStep
    ),
    /RELEASE_BUNDLE:\s+\$\{\{ runner\.temp \}\}\/candidate-release/u.test(verifyStep),
    /RELEASE_SOURCE_COMMIT:\s+\$\{\{ inputs\.source_revision \}\}/u.test(verifyStep),
    /RELEASE_BUNDLE_SHA256:\s+\$\{\{ inputs\.bundle_sha256 \}\}/u.test(verifyStep),
    /actions\/download-artifact@v4/u.test(candidateDownloadStep),
    /run-id:\s+\$\{\{ inputs\.candidate_artifact_run_id \}\}/u.test(candidateDownloadStep),
    /name:\s+\$\{\{ inputs\.candidate_artifact_name \}\}/u.test(candidateDownloadStep),
    /path:\s+\$\{\{ runner\.temp \}\}\/candidate-release/u.test(candidateDownloadStep),
    /actions\/download-artifact@v4/u.test(previousManifestDownloadStep),
    /run-id:\s+\$\{\{ inputs\.previous_image_manifest_run_id \}\}/u.test(
      previousManifestDownloadStep
    ),
    /name:\s+\$\{\{ inputs\.previous_image_manifest_artifact_name \}\}/u.test(
      previousManifestDownloadStep
    ),
    /path:\s+\$\{\{ runner\.temp \}\}\/previous-image-manifest/u.test(previousManifestDownloadStep),
    /for\s+site\s+in\s+cn\s+io/u.test(prepareStep),
    /context="\$RUNNER_TEMP\/technical-release-\$site"/u.test(prepareStep),
    /cp\s+Dockerfile\s+nginx\.conf\s+nginx-security-headers\.conf\s+nginx-embeddable-security-headers\.conf\s+"\$context\/"/u.test(
      prepareStep
    ),
    /cp\s+-R\s+"\$RELEASE_BUNDLE\/\$site\/out"\s+"\$context\/release-out"/u.test(prepareStep),
    /id:\s+build-cn/u.test(cnBuildStep),
    /docker\/build-push-action@v6/u.test(cnBuildStep),
    /context:\s+\$\{\{ runner\.temp \}\}\/technical-release-cn/u.test(cnBuildStep),
    /target:\s+release-runtime/u.test(cnBuildStep),
    /push:\s+true/u.test(cnBuildStep),
    /tags:.*-cn/u.test(cnBuildStep),
    /id:\s+build-io/u.test(ioBuildStep),
    /docker\/build-push-action@v6/u.test(ioBuildStep),
    /context:\s+\$\{\{ runner\.temp \}\}\/technical-release-io/u.test(ioBuildStep),
    /target:\s+release-runtime/u.test(ioBuildStep),
    /push:\s+true/u.test(ioBuildStep),
    /tags:.*-io/u.test(ioBuildStep),
    /RELEASE_CN_IMAGE:\s+\$\{\{ inputs\.cn_image_repository \}\}@\$\{\{ steps\.build-cn\.outputs\.digest \}\}/u.test(
      manifestStep
    ),
    /RELEASE_IO_IMAGE:\s+\$\{\{ inputs\.io_image_repository \}\}@\$\{\{ steps\.build-io\.outputs\.digest \}\}/u.test(
      manifestStep
    ),
    /PREVIOUS_RELEASE_IMAGE_MANIFEST_PATH:.*previous-image-manifest\/manifest\.json/u.test(
      manifestStep
    ),
    /PREVIOUS_RELEASE_IMAGE_MANIFEST_SIGNATURE_PATH:.*previous-image-manifest\/manifest\.sig/u.test(
      manifestStep
    ),
    /export\s+PREVIOUS_RELEASE_IMAGE_MANIFEST="\$\(cat\s+"\$PREVIOUS_RELEASE_IMAGE_MANIFEST_PATH"\)"/u.test(
      manifestStep
    ),
    /export\s+PREVIOUS_RELEASE_IMAGE_MANIFEST_SIGNATURE="\$\(cat\s+"\$PREVIOUS_RELEASE_IMAGE_MANIFEST_SIGNATURE_PATH"\)"/u.test(
      manifestStep
    ),
    /TECHNICAL_RELEASE_IMAGE_MANIFEST_KEY/u.test(manifestStep),
    /npm run generate:technical-full-release-image-manifest/u.test(manifestStep),
    /actions\/upload-artifact@v4/u.test(uploadStep),
    /path:.*image-manifest/u.test(uploadStep),
    /verifyReleaseBundle\s*\(/u.test(generator),
    /createHmac\(['"]sha256['"]/u.test(generator),
    /timingSafeEqual/u.test(generator),
    /RELEASE_CN_IMAGE/u.test(generator),
    /RELEASE_IO_IMAGE/u.test(generator),
    /PREVIOUS_RELEASE_IMAGE_MANIFEST/u.test(generator),
    /PREVIOUS_RELEASE_IMAGE_MANIFEST_SIGNATURE/u.test(generator),
    /RELEASE_IMAGE_MANIFEST_BOOTSTRAP\s+===\s+'1'/u.test(generator),
    /verifyReleaseBundle\s*\(/u.test(bootstrapGenerator),
    workflowDispatchOnly(bootstrapWorkflow),
    /jobs:\s*\n\s{2}bootstrap:\s*\n\s{4}if:\s+github\.repository == 'labring\/fastgpt-home' && github\.ref == 'refs\/heads\/main'/u.test(
      bootstrapWorkflow
    ),
    /test\s+"\$\(git rev-parse HEAD\)"\s+=\s+"\$GITHUB_SHA"/u.test(bootstrapWorkflow),
    /actions\/download-artifact@v4/u.test(bootstrapDownloadStep),
    /run-id:\s+\$\{\{ inputs\.artifact_run_id \}\}/u.test(bootstrapDownloadStep),
    /name:\s+\$\{\{ inputs\.artifact_name \}\}/u.test(bootstrapDownloadStep),
    /path:\s+\$\{\{ runner\.temp \}\}\/bootstrap-release/u.test(bootstrapDownloadStep),
    /--verify-bundle\s+"\$RELEASE_BUNDLE"\s+"\$RELEASE_SOURCE_COMMIT"\s+"\$RELEASE_BUNDLE_SHA256"/u.test(
      bootstrapVerifyStep
    ),
    /RELEASE_BUNDLE:\s+\$\{\{ runner\.temp \}\}\/bootstrap-release/u.test(bootstrapVerifyStep),
    /RELEASE_SOURCE_COMMIT:\s+\$\{\{ inputs\.source_revision \}\}/u.test(bootstrapVerifyStep),
    /RELEASE_BUNDLE_SHA256:\s+\$\{\{ inputs\.bundle_sha256 \}\}/u.test(bootstrapVerifyStep),
    /for\s+site\s+in\s+cn\s+io/u.test(bootstrapPrepareStep),
    /context="\$RUNNER_TEMP\/technical-release-bootstrap-\$site"/u.test(bootstrapPrepareStep),
    /cp\s+Dockerfile\s+nginx\.conf\s+nginx-security-headers\.conf\s+nginx-embeddable-security-headers\.conf\s+"\$context\/"/u.test(
      bootstrapPrepareStep
    ),
    /cp\s+-R\s+"\$RELEASE_BUNDLE\/\$site\/out"\s+"\$context\/release-out"/u.test(
      bootstrapPrepareStep
    ),
    /id:\s+build-bootstrap-cn/u.test(bootstrapCnBuildStep),
    /docker\/build-push-action@v6/u.test(bootstrapCnBuildStep),
    /context:\s+\$\{\{ runner\.temp \}\}\/technical-release-bootstrap-cn/u.test(
      bootstrapCnBuildStep
    ),
    /target:\s+release-runtime/u.test(bootstrapCnBuildStep),
    /push:\s+true/u.test(bootstrapCnBuildStep),
    /tags:.*-bootstrap-cn/u.test(bootstrapCnBuildStep),
    /id:\s+build-bootstrap-io/u.test(bootstrapIoBuildStep),
    /docker\/build-push-action@v6/u.test(bootstrapIoBuildStep),
    /context:\s+\$\{\{ runner\.temp \}\}\/technical-release-bootstrap-io/u.test(
      bootstrapIoBuildStep
    ),
    /target:\s+release-runtime/u.test(bootstrapIoBuildStep),
    /push:\s+true/u.test(bootstrapIoBuildStep),
    /tags:.*-bootstrap-io/u.test(bootstrapIoBuildStep),
    /RELEASE_IMAGE_MANIFEST_BOOTSTRAP:\s+'1'/u.test(bootstrapManifestStep),
    /RELEASE_CN_IMAGE:\s+\$\{\{ inputs\.cn_image_repository \}\}@\$\{\{ steps\.build-bootstrap-cn\.outputs\.digest \}\}/u.test(
      bootstrapManifestStep
    ),
    /RELEASE_IO_IMAGE:\s+\$\{\{ inputs\.io_image_repository \}\}@\$\{\{ steps\.build-bootstrap-io\.outputs\.digest \}\}/u.test(
      bootstrapManifestStep
    ),
    /TECHNICAL_RELEASE_IMAGE_MANIFEST_KEY/u.test(bootstrapManifestStep),
    /npm run generate:technical-full-release-image-manifest/u.test(bootstrapManifestStep),
    /actions\/upload-artifact@v4/u.test(bootstrapUploadStep),
    /path:.*image-manifest/u.test(bootstrapUploadStep),
    workflowDispatchOnly(productionWorkflow),
    /jobs:\s*\n\s{2}controller:\s*\n\s{4}if:\s+github\.repository == 'labring\/fastgpt-home' && github\.ref == 'refs\/heads\/main'/u.test(
      productionWorkflow
    ),
    /actions\/download-artifact@v4/u.test(productionDownloadStep),
    /path:\s+\$\{\{ runner\.temp \}\}\/image-manifest/u.test(productionDownloadStep),
    /image-manifest\/manifest\.json/u.test(productionControllerStep),
    /image-manifest\/manifest\.sig/u.test(productionControllerStep),
    /export\s+RELEASE_IMAGE_MANIFEST="\$\(cat\s+"\$RELEASE_IMAGE_MANIFEST_PATH"\)"/u.test(
      productionControllerStep
    ),
    /export\s+RELEASE_IMAGE_MANIFEST_SIGNATURE="\$\(cat\s+"\$RELEASE_IMAGE_MANIFEST_SIGNATURE_PATH"\)"/u.test(
      productionControllerStep
    ),
    /TECHNICAL_RELEASE_IMAGE_MANIFEST_KEY/u.test(productionControllerStep),
    /npm run release:technical-full -- \$\{\{ inputs\.action \}\}/u.test(productionControllerStep)
  ];
  return packagingChecks.every(Boolean) ? [] : ['docker-publication-is-cn-only'];
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
