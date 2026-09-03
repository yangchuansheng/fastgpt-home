const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const policy = require('../../src/lib/technical-content-policy.json');
const { buildSearchProjection } = require('../import-technical-content');
const {
  FULL_RELEASE_RELATIVE_PATH,
  validateClosureArtifact,
  verifySourceRecords
} = require('./technical-full-release');
const { sha256, stableJson } = require('./technical-authority');

const VARIANTS = ['cn', 'io', 'preview'];
const CAPACITY_POLICY_RELATIVE_PATH = 'src/lib/technical-content-policy.json';

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function assertDigest(value, label) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`${label} must be a lowercase SHA-256 digest`);
  }
}

function resolveSourcePath(sourceRoot, batch, sourceFile) {
  const folder = batch === 'W5' ? '程序化技术页-第3批' : '程序化技术页-第4批';
  for (const root of [path.resolve(sourceRoot), path.resolve(sourceRoot, folder)]) {
    const sourcePath = path.resolve(root, sourceFile);
    if (sourcePath.startsWith(`${root}${path.sep}`) && fs.existsSync(sourcePath)) {
      return sourcePath;
    }
  }
  throw new Error(`${batch} projection source is missing: ${sourceFile}`);
}

function replaceFrontMatterSlug(source, slug, label) {
  const normalized = source.replace(/\r\n?/g, '\n');
  const end = normalized.indexOf('\n---', 4);
  if (!normalized.startsWith('---\n') || end === -1) {
    throw new Error(`${label} has invalid front matter`);
  }
  const header = normalized.slice(4, end);
  if (!/^slug:\s*.+$/m.test(header)) throw new Error(`${label} has no front matter slug`);
  const body = normalized
    .slice(end)
    .replace(
      /^([ \t]*>[ \t]*(?:来源|Source|Sources|参考资料|References)[ \t]*[:：][ \t]*)(https:\/\/[^\s)]+)[ \t]*$/gimu,
      '$1[Public source]($2)'
    );
  return `---\n${header.replace(/^slug:\s*.+$/m, `slug: ${slug}`)}${body}`;
}

function deriveSummary(title, source) {
  const body = source.slice(source.indexOf('\n---', 4) + 4);
  const summary = body
    .replace(/^```[\s\S]*?```$/gm, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[>*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!summary) return title;
  return summary.length <= 155 ? summary : `${summary.slice(0, 154).trim()}…`;
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

function projectTechnicalContent({ repoRoot, w5SourceRoot, w6SourceRoot }) {
  const closure = validateClosureArtifact(
    readJson(path.join(repoRoot, FULL_RELEASE_RELATIVE_PATH))
  );
  if (closure.status !== 'closed') throw new Error('Technical full-release closure is blocked');
  const verification = verifySourceRecords(closure.records, { w5SourceRoot, w6SourceRoot });
  if (verification.verified !== closure.records.length) {
    throw new Error(`Technical source verification failed: ${JSON.stringify(verification)}`);
  }

  const candidates = authorityCandidates(repoRoot);
  const registryPath = path.join(repoRoot, 'src/components/tech-center/entries.json');
  const entries = readJson(registryPath);
  const seen = new Set(entries.map((entry) => entry.slug));
  const roots = { W5: w5SourceRoot, W6: w6SourceRoot };

  for (const record of closure.records) {
    const candidate = candidates[record.batch].get(record.authorityId);
    if (!candidate) throw new Error(`Missing authority candidate ${record.authorityId}`);
    const slug = `/${record.locale}${record.canonicalPath}`;
    if (seen.has(slug)) throw new Error(`Projected identity already exists: ${slug}`);
    const sourcePath = resolveSourcePath(roots[record.batch], record.batch, record.sourceFile);
    const document = replaceFrontMatterSlug(
      fs.readFileSync(sourcePath, 'utf8'),
      slug,
      record.sourceFile
    );
    const outputPath = path.join(
      repoRoot,
      'src/content/tech-center',
      record.locale,
      `${record.canonicalPath.slice(1)}.md`
    );
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, document);
    entries.push({
      title: candidate.title,
      slug,
      category: record.category,
      categoryLabel: candidate.categoryLabel || policy.categories[record.category],
      source: record.sourceUrl,
      sourceType: candidate.sourceType,
      summary: deriveSummary(candidate.title, document),
      minutes: Math.max(1, Math.ceil(document.length / 500))
    });
    seen.add(slug);
  }

  const search = buildSearchProjection(entries);
  const localizedSearch = {
    zh: search.filter((entry) => entry.locale === 'zh'),
    en: search.filter((entry) => entry.locale === 'en')
  };
  fs.writeFileSync(registryPath, stableJson(entries));
  for (const locale of ['zh', 'en']) {
    fs.writeFileSync(
      path.join(repoRoot, `public/tech-center/search-index${locale === 'en' ? '.en' : ''}.json`),
      stableJson(localizedSearch[locale])
    );
  }

  const counts = entries.reduce(
    (result, entry) => {
      result[entry.slug.startsWith('/zh/') ? 'zh' : 'en'] += 1;
      return result;
    },
    { zh: 0, en: 0 }
  );
  if (entries.length !== closure.counts.target || counts.zh + counts.en !== entries.length) {
    throw new Error(`Projected page count drift: ${entries.length}`);
  }
  return {
    baselinePages: closure.counts.baseline,
    pendingPages: closure.counts.pending,
    pages: entries.length,
    localePages: counts,
    recordsSha256: closure.recordsSha256,
    sourceFilesVerified: verification.verified,
    registry: fileEvidence(registryPath),
    search: {
      zh: fileEvidence(path.join(repoRoot, 'public/tech-center/search-index.json')),
      en: fileEvidence(path.join(repoRoot, 'public/tech-center/search-index.en.json'))
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

function validateCapacityReport(report, repoRoot) {
  if (report?.schemaVersion !== 1 || report.issue !== 275) {
    throw new Error('Technical full-release capacity report header changed');
  }
  const closure = validateClosureArtifact(
    readJson(path.join(repoRoot, FULL_RELEASE_RELATIVE_PATH))
  );
  if (
    report.projection?.pages !== closure.counts.target ||
    report.projection?.pendingPages !== closure.counts.pending ||
    report.projection?.sourceFilesVerified !== closure.records.length ||
    report.projection?.recordsSha256 !== closure.recordsSha256
  ) {
    throw new Error('Technical full-release capacity projection drift');
  }
  if (JSON.stringify(report.variants?.map(({ variant }) => variant)) !== JSON.stringify(VARIANTS)) {
    throw new Error('Technical full-release capacity variant set changed');
  }
  for (const measurement of report.variants) {
    if (measurement.buildSucceeded) {
      for (const field of [
        'durationMilliseconds',
        'peakRssBytes',
        'staticFileCount',
        'exportBytes',
        'initialJavaScriptGzipBytes'
      ]) {
        if (!(measurement[field] > 0))
          throw new Error(`${measurement.variant}.${field} is missing`);
      }
    } else if (
      typeof measurement.failure !== 'string' ||
      !measurement.failure ||
      measurement.staticFileCount !== null ||
      measurement.exportBytes !== null ||
      measurement.initialJavaScriptGzipBytes !== null
    ) {
      throw new Error(`${measurement.variant} failure evidence is incomplete`);
    }
  }
  if (
    typeof report.decision?.safeOneShotFullRelease !== 'boolean' ||
    !Array.isArray(report.decision.blockers) ||
    report.decision.safeOneShotFullRelease !== (report.decision.blockers.length === 0)
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
    const rerunBlocker =
      binding.rerunBlocker || 'capacity-rerun-required-after-source-normalization';
    if (!binding.rerunRequired || binding.measuredRecordsSha256 === binding.currentRecordsSha256) {
      throw new Error('Technical full-release capacity stale measurement binding drift');
    }
    if (report.decision.safeOneShotFullRelease) {
      throw new Error('Technical full-release capacity stale measurement cannot be safe');
    }
    if (!report.decision.blockers.includes(rerunBlocker)) {
      throw new Error('Technical full-release capacity stale measurement rerun blocker is missing');
    }
  }
  return report;
}

module.exports = {
  CAPACITY_POLICY_RELATIVE_PATH,
  VARIANTS,
  initialJavaScriptGzipBytes,
  patchCapacityPageCount,
  projectTechnicalContent,
  replaceFrontMatterSlug,
  summarizeExport,
  validateCapacityReport
};
