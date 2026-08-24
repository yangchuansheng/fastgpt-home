#!/usr/bin/env node

/**
 * Run the complete source and static-export release gate without third-party dependencies.
 *
 * Source mode stays runnable on development volumes. Full mode requires a case-sensitive
 * filesystem because mixed-case FAQ slugs are part of the published URL contract.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const TECHNICAL_CONTENT_POLICY = require('../src/lib/technical-content-policy.json');
const { URL_ALIAS_CONTRACT } = require('./lib/url-alias-authority');
const {
  verifyUrlAliasArtifactBundle,
  writeUrlAliasArtifactBundle
} = require('./lib/url-alias-artifacts');
const { siteVariants } = require('./lib/site-variant');

const ROOT = path.resolve(__dirname, '..');
const NEXT_DIR = path.join(ROOT, '.next');
const OUT_DIR = path.join(ROOT, 'out');
const RETAIN_DIR = path.join(ROOT, '.release-artifacts');
const EXPECTED_FAQ_COUNTS = { io: 1400, cn: 1490, preview: 1400 };
const EXPECTED_ALIAS_COUNTS = URL_ALIAS_CONTRACT.sourceHosts;
const EXPECTED_CASE_ONLY_COUNTS = URL_ALIAS_CONTRACT.slices['case-only'].sourceHosts;
const EXPECTED_REBUILT_SLUG_COUNTS = URL_ALIAS_CONTRACT.slices['rebuilt-slug'].sourceHosts;
const EXPECTED_TECHNICAL_PAGE_COUNT = TECHNICAL_CONTENT_POLICY.expectedPageCount;
const EXPECTED_TECHNICAL_AUTHORITY = {
  historicalAccepted: 454,
  historicalDenied: 6,
  historicalAdd: 450,
  historicalUpdate: 4,
  historicalPageCount: 1122,
  candidateCount: 888,
  temporary: 0,
  governanceStatus: 'governance-complete',
  publicationCount: 0,
  identityConflicts: 4,
  duplicateRelations: 9,
  resolvedRelations: 9,
  credentialUnresolved: 0,
  operationRiskUnresolved: 0
};
const EXPECTED_TECHNICAL_WAVE = {
  wave: 'wave-1',
  baselinePageCount: 1122,
  selectedCount: 50,
  acceptedAdd: 50,
  acceptedUpdate: 0,
  resultingPageCount: 1172
};
const GUIDE_TRACER_SLUG = 'poc-30-day-design';
const GUIDE_AUTHORIZATION_SLUGS = [
  'finance-research-retrieval',
  'finance-daily-report-automation'
];
const GUIDE_ENTRY_COUNT = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'src/content/guides/policy.json'), 'utf8')
).entryCount;
const GUIDE_RELEASE_PAIRS = [
  { slug: 'database-qa-integration-guide', locales: ['zh', 'en'] },
  { slug: 'scheduled-report-automation', locales: ['zh', 'en'] },
  { slug: 'finance-research-retrieval', locales: ['zh', 'en'] },
  { slug: 'finance-daily-report-automation', locales: ['zh', 'en'] }
];
const FAQ_METADATA_CONTRACT = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'src/faq/generated-en-metadata-authority.json'), 'utf8'),
).counts;
const EXPECTED_FAQ_METADATA_CANDIDATES = FAQ_METADATA_CONTRACT.candidates;
const EXPECTED_FAQ_METADATA_IDENTITIES = FAQ_METADATA_CONTRACT.identities;
const EXPECTED_FAQ_METADATA_BASELINE = FAQ_METADATA_CONTRACT.baseline;
const EXPECTED_FAQ_METADATA_ADDITIONS = FAQ_METADATA_CONTRACT.additions;
const EXPECTED_FAQ_METADATA_FALLBACK_BEFORE = FAQ_METADATA_CONTRACT.fallback.before;
const EXPECTED_FAQ_METADATA_FALLBACK = FAQ_METADATA_CONTRACT.fallback.after;
const P1_BASELINE_KIB = 266.9;
const P1_BUDGET_KIB = 260;
const RELEASE_RECORD_FILENAME = 'release-verification.json';
const GENERATED_PUBLIC_PATHS = [
  'public/llms.txt',
  'public/robots.txt',
  'public/ar/llms.txt',
  'public/en/llms.txt',
  'public/id/llms.txt',
  'public/ja/llms.txt',
  'public/ms/llms.txt',
  'public/th/llms.txt',
  'public/vi/llms.txt',
  'public/zh-hant/llms.txt',
  'public/zh/llms.txt'
];

function parseArgs(argv) {
  const options = {
    sourceOnly: false,
    keepArtifacts: false,
    retainSuccessArtifacts: undefined,
    variant: undefined
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--source-only') options.sourceOnly = true;
    else if (token === '--keep-artifacts') options.keepArtifacts = true;
    else if (token === '--live') options.live = true;
    else if (token === '--retain-success-artifacts') {
      const retainDir = argv[++index];
      if (!retainDir || retainDir.startsWith('--'))
        throw new Error('--retain-success-artifacts requires a directory');
      options.retainSuccessArtifacts = path.resolve(ROOT, retainDir);
    } else if (token === '--variant') {
      const variant = argv[++index];
      if (!siteVariants.includes(variant)) {
        throw new Error(`--variant requires one of: ${siteVariants.join(', ')}`);
      }
      options.variant = variant;
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }
  return options;
}

function commandLabel(command, args) {
  return [command, ...args].join(' ');
}

function createFailure(label, command, args, output, variant) {
  return {
    label,
    variant,
    command: commandLabel(command, args),
    output: output.trim().slice(-8000) || '<no command output>'
  };
}

function createReleaseRecord(options) {
  return {
    schemaVersion: 1,
    startedAt: new Date().toISOString(),
    options,
    commands: [],
    counts: {
      expectedImportedPages: TECHNICAL_CONTENT_POLICY.expectedAcceptedCount,
      expectedDeniedPages: TECHNICAL_CONTENT_POLICY.expectedDeniedCount,
      expectedTechnicalPages: EXPECTED_TECHNICAL_PAGE_COUNT,
      technicalAuthority: { ...EXPECTED_TECHNICAL_AUTHORITY },
      technicalWave: { ...EXPECTED_TECHNICAL_WAVE },
      faqMetadata: {
        candidates: EXPECTED_FAQ_METADATA_CANDIDATES,
        identities: EXPECTED_FAQ_METADATA_IDENTITIES,
        baseline: EXPECTED_FAQ_METADATA_BASELINE,
        additions: EXPECTED_FAQ_METADATA_ADDITIONS,
        fallbackBefore: EXPECTED_FAQ_METADATA_FALLBACK_BEFORE,
        fallback: EXPECTED_FAQ_METADATA_FALLBACK,
        fallbackDelta: EXPECTED_FAQ_METADATA_FALLBACK - EXPECTED_FAQ_METADATA_FALLBACK_BEFORE
      },
      variants: {}
    },
    variants: [],
    evidence: {
      releaseEligible: false,
      exportVerified: [],
      aliasContract: {
        expectedSources: URL_ALIAS_CONTRACT.sources,
        expectedSourceHosts: EXPECTED_ALIAS_COUNTS,
        expectedTargets: URL_ALIAS_CONTRACT.targets,
        expectedManyToOneTargets: URL_ALIAS_CONTRACT.manyToOneTargets,
        source: false,
        regression: false,
        rebuiltSlug: {
          expectedSources: URL_ALIAS_CONTRACT.slices['rebuilt-slug'].sources,
          expectedSourceHosts: EXPECTED_REBUILT_SLUG_COUNTS,
          source: false,
          regression: false
        },
        variants: {},
        artifacts: {}
      },
      publishedTechnicalPages: { status: 'not-verified', claim: false },
      technicalAuthority: {
        expected: { ...EXPECTED_TECHNICAL_AUTHORITY },
        source: false,
        regression: false,
        observed: undefined,
        releaseReady: false
      },
      technicalWave: {
        expected: { ...EXPECTED_TECHNICAL_WAVE },
        source: false,
        regression: false,
        observed: undefined,
        variants: {},
        releaseReady: false
      },
      faqMetadata: {
        expected: {
          candidates: EXPECTED_FAQ_METADATA_CANDIDATES,
          identities: EXPECTED_FAQ_METADATA_IDENTITIES,
          baseline: EXPECTED_FAQ_METADATA_BASELINE,
          additions: EXPECTED_FAQ_METADATA_ADDITIONS,
          fallbackBefore: EXPECTED_FAQ_METADATA_FALLBACK_BEFORE,
          fallback: EXPECTED_FAQ_METADATA_FALLBACK,
          fallbackDelta: EXPECTED_FAQ_METADATA_FALLBACK - EXPECTED_FAQ_METADATA_FALLBACK_BEFORE
        },
        source: false,
        regression: false,
        variants: {},
        releaseReady: false
      },
      caseOnly: {
        expectedSources: 743,
        expectedSourceHosts: EXPECTED_CASE_ONLY_COUNTS,
        source: false,
        regression: false,
        variants: {}
      },
      guidePairs: {
        expected: GUIDE_RELEASE_PAIRS,
        source: false,
        variants: {},
        releaseReady: false
      },
      guideAuthorization: {
        expectedSlugs: GUIDE_AUTHORIZATION_SLUGS,
        source: false,
        regression: false,
        result: undefined,
        releaseReady: false
      }
    },
    blockers: []
  };
}

function collectCountEvidence(record, output) {
  const imported = output.match(/Technical content authority verified: (\d+) imported pages/);
  if (imported) record.counts.importedPages = Number(imported[1]);
}

function collectTechnicalAuthorityEvidence(record, label, status, output) {
  if (!record || !label.toLowerCase().includes('technical authority')) return;
  const evidence = record.evidence.technicalAuthority;
  const lowerLabel = label.toLowerCase();
  if (lowerLabel.includes('source verification')) evidence.source = status === 'passed';
  if (lowerLabel.includes('regression')) evidence.regression = status === 'passed';
  const marker = output.match(/TECHNICAL_AUTHORITY_RESULT=(\{[^\n]+\})/);
  if (!marker) return;
  try {
    evidence.observed = JSON.parse(marker[1]);
    record.counts.technicalAuthorityObserved = evidence.observed;
  } catch (error) {
    evidence.observed = { status: 'invalid', error: error.message };
  }
}

function collectTechnicalWaveEvidence(record, label, variant, status, output) {
  if (!record || !label.toLowerCase().includes('technical wave')) return;
  const evidence = record.evidence.technicalWave;
  const lowerLabel = label.toLowerCase();
  if (lowerLabel.includes('source verification')) evidence.source = status === 'passed';
  if (lowerLabel.includes('regression')) evidence.regression = status === 'passed';
  const marker = output.match(/WAVE1_RESULT=(\{[^\n]+\})/);
  if (!marker) return;
  try {
    const observed = JSON.parse(marker[1]);
    evidence.observed = observed;
    record.counts.technicalWaveObserved = observed;
    if (variant) evidence.variants[variant] = observed;
  } catch (error) {
    evidence.observed = { status: 'invalid', error: error.message };
  }
}

function formatTechnicalAuthoritySuccess(output) {
  const marker = output.match(/TECHNICAL_AUTHORITY_RESULT=(\{[^\n]+\})/);
  if (!marker) return undefined;
  const result = JSON.parse(marker[1]);
  return `status=${result.governanceStatus} publication-count=${result.publicationCount} historicalAccepted=${result.historicalAccepted} historicalDenied=${result.historicalDenied} candidates=${result.candidateCount} accepted=${result.accepted} denied=${result.denied} add=${result.add} update=${result.update} resultingPages=${result.resultingPageCount}`;
}

function writeReleaseRecord(record) {
  const recordPath = path.join(RETAIN_DIR, RELEASE_RECORD_FILENAME);
  fs.mkdirSync(RETAIN_DIR, { recursive: true });
  fs.writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`);
  return recordPath;
}

function finalizeReleaseRecord(record, failures, options) {
  record.finishedAt = new Date().toISOString();
  record.failureCount = failures.length;
  record.blockers = failures.map((failure) => ({
    type: /filesystem|environment|docker|nginx/i.test(failure.label)
      ? 'environment'
      : 'verification',
    label: failure.label,
    variant: failure.variant,
    command: failure.command,
    detail: failure.output
  }));
  const caseOnly = record.evidence.caseOnly;
  caseOnly.releaseReady =
    caseOnly.source &&
    caseOnly.regression &&
    Object.entries(EXPECTED_CASE_ONLY_COUNTS).every(([host, expected]) => {
      const variant = host === 'fastgpt.cn' ? 'cn' : 'io';
      return (
        caseOnly.variants[variant]?.status === 'passed' &&
        caseOnly.variants[variant]?.aliases === expected
      );
    });
  const aliasContract = record.evidence.aliasContract;
  aliasContract.releaseReady =
    aliasContract.source &&
    aliasContract.regression &&
    aliasContract.rebuiltSlug.source &&
    aliasContract.rebuiltSlug.regression &&
    ['cn', 'io'].every((variant) => aliasContract.artifacts[variant]?.status === 'passed') &&
    ['cn', 'io'].every((variant) => {
      const evidence = aliasContract.variants[variant];
      const expected = EXPECTED_ALIAS_COUNTS[variant === 'cn' ? 'fastgpt.cn' : 'fastgpt.io'];
      return evidence?.status === 'passed' && evidence.aliases === expected;
    });
  const faqMetadata = record.evidence.faqMetadata;
  faqMetadata.releaseReady =
    faqMetadata.source &&
    faqMetadata.regression &&
    ['cn', 'io'].every((variant) => faqMetadata.variants[variant]?.status === 'passed') &&
    faqMetadata.variants.io?.staticHtml === 'passed' &&
    Object.entries(faqMetadata.expected).every(([key, expected]) => {
      if (key === 'fallbackDelta') return faqMetadata.observed?.fallbackDelta === expected;
      return faqMetadata.observed?.[key] === expected;
    });
  const guidePairs = record.evidence.guidePairs;
  const guideAuthorization = record.evidence.guideAuthorization;
  const technicalAuthority = record.evidence.technicalAuthority;
  const completeAuthorization = guideAuthorization.result?.complete;
  const missingAuthorization = guideAuthorization.result?.missing;
  guideAuthorization.releaseReady =
    guideAuthorization.source &&
    guideAuthorization.regression &&
    completeAuthorization?.status === 'publishable' &&
    completeAuthorization.projectedEntries === GUIDE_ENTRY_COUNT &&
    completeAuthorization.financeSlugs?.length === GUIDE_AUTHORIZATION_SLUGS.length &&
    missingAuthorization?.status === 'release-blocked' &&
    missingAuthorization.projectedEntries ===
      GUIDE_ENTRY_COUNT - GUIDE_AUTHORIZATION_SLUGS.length &&
    missingAuthorization.financeSlugs?.length === 0 &&
    GUIDE_AUTHORIZATION_SLUGS.every((slug) =>
      missingAuthorization.excludedSlugs?.includes(slug)
    );
  guidePairs.releaseReady =
    guidePairs.source &&
    guideAuthorization.releaseReady &&
    ['cn', 'io'].every((variant) => {
      const evidence = guidePairs.variants[variant];
      return (
        evidence?.status === 'passed' &&
        GUIDE_RELEASE_PAIRS.every((pair) => evidence.pairs[pair.slug]?.releaseEligible)
      );
    });
  technicalAuthority.releaseReady =
    technicalAuthority.source &&
    technicalAuthority.regression &&
    Object.entries(technicalAuthority.expected).every(
      ([key, expected]) => technicalAuthority.observed?.[key] === expected
    ) &&
    technicalAuthority.observed?.resultingPageCount ===
      technicalAuthority.observed?.historicalPageCount + technicalAuthority.observed?.add;
  const technicalWave = record.evidence.technicalWave;
  technicalWave.releaseReady =
    technicalWave.source &&
    technicalWave.regression &&
    Object.entries(technicalWave.expected).every(
      ([key, expected]) => technicalWave.observed?.[key] === expected
    ) &&
    ['cn', 'io', 'preview'].every((variant) => {
      const observed = technicalWave.variants[variant];
      return (
        observed?.sourceVerified === true &&
        observed?.exportVerified === true &&
        observed?.releaseEligible === true
      );
    });
  const releaseGate = !options.sourceOnly && !options.variant && failures.length === 0;
  record.evidence.releaseEligible =
    releaseGate &&
    caseOnly.releaseReady &&
    aliasContract.releaseReady &&
    faqMetadata.releaseReady &&
    technicalAuthority.releaseReady &&
    technicalWave.releaseReady &&
    guideAuthorization.releaseReady &&
    guidePairs.releaseReady;
  record.status = record.evidence.releaseEligible
    ? 'release-eligible'
    : record.blockers.some((blocker) => blocker.type === 'environment')
    ? 'environment-blocked'
    : failures.length
    ? 'failed'
    : options.sourceOnly
    ? 'source-verified'
    : 'export-verified';
  record.evidence.exportVerified = record.variants
    .filter((variant) => variant.outcome === 'export-verified')
    .map((variant) => variant.variant);
  return record;
}

function recordStep(record, label, command, variant, status, output, evidence) {
  if (!record) return;
  const step = { label, variant, command, status };
  if (evidence) step.evidence = evidence;
  step.output = output.trim().slice(status === 'failed' ? -4000 : -1200) || '<no command output>';
  record.commands.push(step);
  collectCountEvidence(record, output);
  collectTechnicalAuthorityEvidence(record, label, status, output);
  collectTechnicalWaveEvidence(record, label, variant, status, output);
  collectCaseOnlyEvidence(record, label, variant, status, output);
  collectAliasContractEvidence(record, label, variant, status, output);
  collectFaqMetadataEvidence(record, label, variant, status, output);
  collectGuideAuthorizationEvidence(record, label, status, output);
  collectGuidePairEvidence(record, label, variant, status, output);
}

function collectGuideAuthorizationEvidence(record, label, status, output) {
  if (!record || !label.toLowerCase().includes('guide authorization')) return;
  const evidence = record.evidence.guideAuthorization;
  if (label.toLowerCase().includes('source verification')) evidence.source = status === 'passed';
  if (label.toLowerCase().includes('regression')) evidence.regression = status === 'passed';
  const marker = output.match(/GUIDE_AUTHORIZATION_RESULT=(\{[\s\S]*\})/);
  if (!marker) return;
  try {
    evidence.result = JSON.parse(marker[1]);
  } catch (error) {
    evidence.result = { status: 'invalid', error: error.message };
  }
}

function collectGuidePairEvidence(record, label, variant, status, output) {
  if (!record || !label.toLowerCase().includes('guide')) return;
  const guidePairs = record.evidence.guidePairs;
  if (label.toLowerCase().includes('content source verification')) {
    const match = output.match(/Guide content verified: (\d+) slugs, (\d+) documents/);
    guidePairs.source = status === 'passed';
    guidePairs.sourceCounts = match
      ? { slugs: Number(match[1]), documents: Number(match[2]) }
      : undefined;
  }
  if (!variant || !label.toLowerCase().includes('export artifact verification')) return;
  const match = output.match(/Guide HTML verified: (\d+) pages, (\d+) sitemap URLs/);
  const artifactStatus = output.includes('skipped') ? 'skipped' : status;
  guidePairs.variants[variant] = {
    status: artifactStatus,
    pages: match ? Number(match[1]) : undefined,
    sitemapUrls: match ? Number(match[2]) : undefined,
    pairs: Object.fromEntries(
      GUIDE_RELEASE_PAIRS.map((pair) => [
        pair.slug,
        {
          locales: pair.locales,
          releaseEligible: artifactStatus === 'passed'
        }
      ])
    )
  };
}

function collectCaseOnlyEvidence(record, label, variant, status, output) {
  if (!record || !label.toLowerCase().includes('case-only')) return;
  const aliases = output.match(/aliases=(\d+)/)?.[1];
  const caseOnly = record.evidence.caseOnly;
  if (label.includes('source')) caseOnly.source = status === 'passed';
  if (label.includes('regression')) caseOnly.regression = status === 'passed';
  if (variant) {
    caseOnly.variants[variant] = {
      status,
      aliases: aliases ? Number(aliases) : undefined,
      expectedAliases:
        EXPECTED_CASE_ONLY_COUNTS[variant === 'cn' ? 'fastgpt.cn' : 'fastgpt.io']
    };
  }
}

function collectAliasContractEvidence(record, label, variant, status, output) {
  if (!record || !label.toLowerCase().includes('url alias')) return;
  const aliases = output.match(/aliases=(\d+)/)?.[1];
  const aliasContract = record.evidence.aliasContract;
  if (label.includes('source verification')) aliasContract.source = status === 'passed';
  if (label.includes('regression')) aliasContract.regression = status === 'passed';
  if (label.includes('rebuilt-slug')) {
    if (label.includes('source verification')) aliasContract.rebuiltSlug.source = status === 'passed';
    if (label.includes('regression')) aliasContract.rebuiltSlug.regression = status === 'passed';
  }
  if (variant && label.includes('black-box')) {
    aliasContract.variants[variant] = {
      status,
      aliases: aliases ? Number(aliases) : undefined,
      expectedAliases:
        EXPECTED_ALIAS_COUNTS[variant === 'cn' ? 'fastgpt.cn' : 'fastgpt.io']
    };
  }
}

function collectFaqMetadataEvidence(record, label, variant, status, output) {
  if (!record || !label.toLowerCase().includes('faq metadata normalization')) return;
  const match = output.match(
    /candidates=(\d+) identities=(\d+) baseline=(\d+) additions=(\d+) fallbackBefore=(\d+) fallback=(\d+) delta=([+-]?\d+)/
  );
  const evidence = record.evidence.faqMetadata;
  if (label.includes('source verification')) evidence.source = status === 'passed';
  if (label.includes('regression')) evidence.regression = status === 'passed';
  if (match) {
    evidence.observed = {
      candidates: Number(match[1]),
      identities: Number(match[2]),
      baseline: Number(match[3]),
      additions: Number(match[4]),
      fallbackBefore: Number(match[5]),
      fallback: Number(match[6]),
      fallbackDelta: Number(match[7])
    };
  }
  if (variant) {
    evidence.variants[variant] = {
      status,
      staticHtml: output.match(/staticHtml=([^\s]+)/)?.[1],
      ...(evidence.observed || {})
    };
  }
}

function recordVariantOutcome(record, variant, failures, commandStart) {
  if (!record) return;
  const commands = record.commands.slice(commandStart);
  const findStep = (label) => commands.find((step) => step.label === label);
  const technicalExportStep = commands.find(
    (step) => step.label === `technical export artifact verification (${variant})`
  );
  const technicalCenterStep = commands.find(
    (step) => step.label === `technical center artifact verification (${variant})`
  );
  const guideStep = findStep(`Guide export artifact verification (${variant})`);
  const p1Step = findStep(`P1 HTML verification (${variant})`);
  const faqMetadataStep = findStep(`FAQ metadata normalization HTML verification (${variant})`);
  const exportedCount = technicalExportStep?.output.match(
    /Export-verified Technical Pages: (\d+) \(/
  );
  const centerMeasurement = technicalCenterStep?.output.match(
    /(?:passed: .*?, )?(\d+) server entries, ([0-9.]+) KiB initial JavaScript gzip/
  );
  const p1Measurement = p1Step?.output.match(
    /P1 verification passed for .*?:\s*([0-9.]+ KiB initial JavaScript gzip)/
  );
  const guideMeasurement = guideStep?.output.match(
    /Guide HTML verified: (\d+) pages, (\d+) sitemap URLs \(tracer=([^)]+)\)/
  );
  const caseOnlyStep = findStep(`Case-only HTTP verification (${variant})`);
  const aliasStep = findStep(`URL Alias black-box verification (${variant})`);
  const variantCounts = {
    faqPages: EXPECTED_FAQ_COUNTS[variant],
    technicalPages: exportedCount ? Number(exportedCount[1]) : EXPECTED_TECHNICAL_PAGE_COUNT,
    ...(centerMeasurement
      ? {
          technicalCenterServerEntries: Number(centerMeasurement[1]),
          technicalCenterInitialJavaScriptGzipKiB: Number(centerMeasurement[2])
        }
      : {}),
    ...(p1Measurement ? { initialJavaScriptGzip: p1Measurement[1] } : {}),
    faqMetadata: record.evidence.faqMetadata.variants[variant] || {
      status: faqMetadataStep?.status || 'skipped'
    }
  };
  const artifactStatus = (step) => {
    if (!step) return 'skipped';
    return step.output.includes('skipped') ? 'skipped' : step.status;
  };
  record.variants.push({
    variant,
    outcome:
      !failures.some((failure) => failure.variant === variant) &&
      technicalExportStep?.status === 'passed'
        ? 'export-verified'
        : 'failed',
    technicalCenter: technicalCenterStep?.output.includes('skipped')
      ? 'skipped'
      : technicalCenterStep?.status === 'passed'
      ? 'passed'
      : 'failed',
    technicalExport: technicalExportStep?.status === 'passed',
    technicalPageCount: EXPECTED_TECHNICAL_PAGE_COUNT,
    caseOnly: {
      status: caseOnlyStep?.status || 'skipped',
      aliases: caseOnlyStep?.output.match(/aliases=(\d+)/)?.[1]
        ? Number(caseOnlyStep.output.match(/aliases=(\d+)/)[1])
        : undefined,
      expectedAliases: EXPECTED_CASE_ONLY_COUNTS[variant === 'cn' ? 'fastgpt.cn' : 'fastgpt.io']
    },
    aliasContract: {
      status: aliasStep?.status || 'skipped',
      aliases: aliasStep?.output.match(/aliases=(\d+)/)?.[1]
        ? Number(aliasStep.output.match(/aliases=(\d+)/)[1])
        : undefined,
      expectedAliases: EXPECTED_ALIAS_COUNTS[variant === 'cn' ? 'fastgpt.cn' : 'fastgpt.io']
    },
    counts: variantCounts,
    artifacts: {
      build: artifactStatus(findStep(`build ${variant}`)),
      htmlHygiene: artifactStatus(findStep(`Complete HTML hygiene (${variant})`)),
      technicalCenter: artifactStatus(technicalCenterStep),
      technicalExport: artifactStatus(technicalExportStep),
      faqMetadata: artifactStatus(faqMetadataStep),
      guide: artifactStatus(guideStep),
      guideTracer: {
        status: artifactStatus(guideStep),
        slug:
          guideMeasurement?.[3] ||
          (guideStep?.output.includes('skipped') ? 'skipped' : 'not-reported'),
        expectedSlug: GUIDE_TRACER_SLUG,
        pages: guideMeasurement ? Number(guideMeasurement[1]) : undefined,
        sitemapUrls: guideMeasurement ? Number(guideMeasurement[2]) : undefined
      },
      guidePairs: record.evidence.guidePairs.variants[variant] || {
        status: artifactStatus(guideStep),
        pairs: Object.fromEntries(
          GUIDE_RELEASE_PAIRS.map((pair) => [
            pair.slug,
            { locales: pair.locales, releaseEligible: artifactStatus(guideStep) === 'passed' }
          ])
        )
      }
    }
  });
  record.counts.variants = Object.fromEntries(
    record.variants.map((entry) => [entry.variant, entry.counts])
  );
}

function runStep(failures, label, command, args, env, variant, formatSuccess, record) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    env,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  if (result.error || result.status !== 0) {
    const failureOutput = result.error ? `${output}\n${result.error.message}` : output;
    recordStep(record, label, commandLabel(command, args), variant, 'failed', failureOutput);
    failures.push(createFailure(label, command, args, failureOutput, variant));
    console.error(`[verify-release] ${label} failed`);
    return false;
  }
  const successEvidence = formatSuccess ? formatSuccess(output) : undefined;
  recordStep(
    record,
    label,
    commandLabel(command, args),
    variant,
    'passed',
    output,
    successEvidence
  );
  console.log(`[verify-release] ${label} passed${successEvidence ? `: ${successEvidence}` : ''}`);
  return true;
}

function nodeStep(failures, label, script, args, env, variant, record, formatSuccess) {
  return runStep(
    failures,
    label,
    process.execPath,
    [script, ...args],
    env,
    variant,
    formatSuccess,
    record
  );
}

function npmStep(failures, label, args, env, variant, formatSuccess, record) {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  return runStep(failures, label, npm, ['run', ...args], env, variant, formatSuccess, record);
}

function clearBuildArtifacts() {
  fs.rmSync(NEXT_DIR, { recursive: true, force: true });
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
}

function snapshotGeneratedPublicFiles() {
  return new Map(
    GENERATED_PUBLIC_PATHS.map((relativePath) => {
      const filePath = path.join(ROOT, relativePath);
      return [relativePath, fs.existsSync(filePath) ? fs.readFileSync(filePath) : null];
    })
  );
}

function restoreGeneratedPublicFiles(snapshot) {
  for (const [relativePath, contents] of snapshot) {
    const filePath = path.join(ROOT, relativePath);
    if (contents === null) {
      fs.rmSync(filePath, { force: true });
      continue;
    }
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, contents);
  }
}

function findCaseFoldCollisionPair() {
  const registry = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'src/faq/generated-en-route-registry.json'), 'utf8')
  );
  const byFoldedSlug = new Map();
  for (const record of registry.records) {
    const folded = record.canonicalSlug.toLocaleLowerCase('en-US');
    const candidates = byFoldedSlug.get(folded) || [];
    candidates.push(record.canonicalSlug);
    byFoldedSlug.set(folded, candidates);
  }
  for (const candidates of byFoldedSlug.values()) {
    if (new Set(candidates).size > 1) return candidates.slice(0, 2);
  }
  return ['How-AI-helps-in-planning', 'How-AI-Helps-in-Planning'];
}

function assertCaseSensitiveFilesystem() {
  const probeDir = fs.mkdtempSync(path.join(ROOT, '.release-case-probe-'));
  const upperPath = path.join(probeDir, 'CaseProbe');
  const lowerPath = path.join(probeDir, 'caseprobe');
  try {
    fs.writeFileSync(upperPath, 'case-sensitive probe');
    const caseSensitive = !fs.existsSync(lowerPath);
    if (!caseSensitive) {
      const [first, second] = findCaseFoldCollisionPair();
      throw new Error(
        `case-insensitive filesystem detected for published FAQ routes ${first} and ${second}; run the Guide Release Verification workflow, docker build --file Dockerfile.verify --tag fastgpt-guide-release-verify ., or use a case-sensitive APFS workspace (source-only remains available)`
      );
    }
  } finally {
    fs.rmSync(probeDir, { recursive: true, force: true });
  }
}

function variantEnvironment(variant) {
  const baseUrl = variant === 'cn' ? 'https://fastgpt.cn' : 'https://fastgpt.io';
  return {
    ...process.env,
    CI: process.env.CI || '1',
    NODE_ENV: 'production',
    NEXT_PUBLIC_SITE_VARIANT: variant,
    NEXT_PUBLIC_HOME_URL: baseUrl,
    NEXT_PUBLIC_CN_HOME_URL: 'https://fastgpt.cn',
    NEXT_PUBLIC_IO_HOME_URL: 'https://fastgpt.io',
    NEXT_PUBLIC_LANGUAGE_REGION: variant === 'cn' ? 'zh-CN' : 'en-US'
  };
}

function walkFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(dir, entry.name);
    return entry.isDirectory() ? walkFiles(filePath) : [filePath];
  });
}

function faqRouteKey(filePath) {
  const relativePath = path.relative(OUT_DIR, filePath).replaceAll(path.sep, '/');
  if (!relativePath.startsWith('faq/')) return undefined;
  const route = relativePath.slice('faq/'.length);
  if (route.endsWith('/index.html')) return route.slice(0, -'/index.html'.length);
  if (route.endsWith('.html')) return route.slice(0, -'.html'.length);
  return undefined;
}

function verifyExportCardinality(variant) {
  const expected = EXPECTED_FAQ_COUNTS[variant];
  const routeKeys = new Set(
    walkFiles(path.join(OUT_DIR, 'faq'))
      .filter((filePath) => filePath.endsWith('.html'))
      .map(faqRouteKey)
      .filter(Boolean)
  );
  if (routeKeys.size !== expected) {
    throw new Error(
      `variant=${variant} FAQ HTML route cardinality mismatch: expected ${expected}, found ${routeKeys.size}`
    );
  }

  if (variant !== 'preview') {
    const sitemapPath = path.join(OUT_DIR, 'sitemap.xml');
    if (!fs.existsSync(sitemapPath))
      throw new Error(`variant=${variant} is missing out/sitemap.xml`);
    const sitemapUrls = [
      ...fs.readFileSync(sitemapPath, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)
    ].map((match) => match[1]);
    const faqUrls = sitemapUrls.filter((url) => {
      try {
        const parsed = new URL(url);
        return (
          parsed.pathname.startsWith('/faq/') &&
          parsed.pathname.split('/').filter(Boolean).length === 2
        );
      } catch {
        return false;
      }
    });
    if (faqUrls.length !== expected || new Set(faqUrls).size !== expected) {
      throw new Error(
        `variant=${variant} FAQ sitemap cardinality mismatch: expected ${expected}, found ${faqUrls.length}`
      );
    }
  }
}

function retainFailureArtifacts(variant) {
  const retainedPath = path.join(RETAIN_DIR, variant);
  fs.rmSync(retainedPath, { recursive: true, force: true });
  fs.mkdirSync(RETAIN_DIR, { recursive: true });
  fs.mkdirSync(retainedPath, { recursive: true });
  if (fs.existsSync(NEXT_DIR))
    fs.cpSync(NEXT_DIR, path.join(retainedPath, '.next'), { recursive: true });
  if (fs.existsSync(OUT_DIR))
    fs.cpSync(OUT_DIR, path.join(retainedPath, 'out'), { recursive: true });
  return retainedPath;
}

function retainSuccessArtifacts(variant, retainDir) {
  const retainedPath = path.join(retainDir, variant);
  fs.rmSync(retainedPath, { recursive: true, force: true });
  fs.mkdirSync(retainedPath, { recursive: true });
  const retainedOut = path.join(retainedPath, 'out');
  const redirectMap = path.join(NEXT_DIR, 'nginx-redirects.conf');
  if (!fs.existsSync(redirectMap)) {
    throw new Error(`Missing generated redirect map: ${redirectMap}`);
  }
  fs.cpSync(OUT_DIR, retainedOut, { recursive: true });
  fs.mkdirSync(path.join(retainedOut, '__release'), { recursive: true });
  fs.copyFileSync(redirectMap, path.join(retainedOut, '__release', 'nginx-redirects.conf'));
  const aliasBundle = writeUrlAliasArtifactBundle(ROOT, retainedPath, variant);
  if (aliasBundle.releaseManifest.authority.sourceCount !== URL_ALIAS_CONTRACT.sources) {
    throw new Error(`URL Alias artifact source count drift for ${variant}`);
  }
  return retainedPath;
}

function runSourceChecks(failures, env, record) {
  const checks = [
    ['SEO basics regression', 'scripts/verify-seo-basics.test.js', []],
    [
      'content hygiene source verification',
      'scripts/verify-content-hygiene.js',
      ['--mode', 'source']
    ],
    ['route registry check', 'scripts/generate-faq-route-registry.js', ['--check']],
    ['metadata snapshot check', 'scripts/generate-faq-metadata.js', ['--check']],
    ['FAQ route source verification', 'scripts/verify-faq-routes.js', []],
    ['FAQ metadata source verification', 'scripts/verify-faq-metadata.js', []],
    ['FAQ metadata normalization source verification', 'scripts/verify-faq-metadata-authority.js', []],
    ['FAQ SEO graph source verification', 'scripts/verify-faq-seo-graph.js', []],
    ['URL Alias Authority source verification', 'scripts/verify-url-alias-authority.js', []],
    ['case-only authority and projection source verification', 'scripts/verify-case-only-aliases.js', []],
    ['URL Alias rebuilt-slug authority and projection source verification', 'scripts/verify-rebuilt-slug-aliases.js', []],
    ['FAQ redirect source verification', 'scripts/verify-faq-redirects.js', ['--source']],
    ['technical authority source verification', 'scripts/verify-technical-authority.js', []],
    ['technical wave source verification', 'scripts/verify-technical-wave.js', []]
  ];
  for (const [label, script, args] of checks) {
    const formatSuccess = label === 'technical authority source verification'
      ? formatTechnicalAuthoritySuccess
      : undefined;
    nodeStep(failures, label, script, args, env, undefined, record, formatSuccess);
  }

  const technicalChecks = [
    ['technical content authority verification', ['verify:technical-content']],
    ['technical authority regression', ['verify:technical-authority-regression']],
    ['technical wave regression', ['verify:technical-wave-regression']],
    ['technical content regression', ['verify:technical-content-regression']],
    ['technical center regression', ['verify:technical-center-regression']],
    ['technical export regression', ['verify:technical-export-regression']],
    ['URL Alias Authority regression', ['verify:url-alias-regression']],
    ['case-only slice regression', ['verify:case-only-regression']],
    ['URL Alias rebuilt-slug slice regression', ['verify:rebuilt-slug-regression']],
    ['FAQ metadata normalization regression', ['verify:faq-metadata-authority-regression']]
  ];
  for (const [label, args] of technicalChecks) {
    const formatSuccess = label === 'technical authority regression'
      ? formatTechnicalAuthoritySuccess
      : undefined;
    npmStep(failures, label, args, env, undefined, formatSuccess, record);
  }
  npmStep(failures, 'Lint source verification', ['lint'], env, undefined, undefined, record);
  runStep(
    failures,
    'TypeScript source verification',
    'npx',
    ['--no-install', 'tsc', '--noEmit', '--incremental', 'false'],
    env,
    undefined,
    undefined,
    record
  );
  const technicalAuthority = record?.evidence.technicalAuthority;
  if (
    technicalAuthority?.observed?.governanceStatus === 'governance-complete' &&
    technicalAuthority.observed.publicationCount === 0
  ) {
    console.log('[verify-release] Wave 0 governance-complete; publication-count=0');
  }
}

function runGuideSourceChecks(failures, env, variant, record) {
  const suffix = variant ? ` (${variant})` : '';
  if (!variant) {
    nodeStep(
      failures,
      'Guide authorization source verification',
      'scripts/verify-guide-authorization.js',
      [],
      env,
      undefined,
      record
    );
    npmStep(
      failures,
      'Guide authorization regression',
      ['verify:guide-authorization-regression'],
      env,
      undefined,
      undefined,
      record
    );
  }
  nodeStep(
    failures,
    `Guide content source verification${suffix}`,
    'scripts/verify-guide-content.js',
    [],
    env,
    variant,
    record
  );
}

function extractP1SuccessMeasurement(output) {
  return output.match(
    /P1 verification passed for .*:\s*([0-9.]+ KiB initial JavaScript gzip)/
  )?.[1];
}

function runVariantChecks(failures, variant, env, record) {
  const commandStart = record?.commands.length || 0;
  const buildPassed = npmStep(
    failures,
    `build ${variant}`,
    ['build'],
    env,
    variant,
    undefined,
    record
  );
  if (!buildPassed) {
    recordVariantOutcome(record, variant, failures, commandStart);
    return false;
  }

  nodeStep(
    failures,
    `Complete HTML hygiene (${variant})`,
    'scripts/verify-content-hygiene.js',
    ['--mode', 'html', '--root', 'out', '--variant', variant],
    env,
    variant,
    record
  );

  npmStep(
    failures,
    `technical center artifact verification (${variant})`,
    ['verify:technical-center'],
    env,
    variant,
    undefined,
    record
  );
  npmStep(
    failures,
    `technical export artifact verification (${variant})`,
    ['verify:technical-export'],
    env,
    variant,
    undefined,
    record
  );
  npmStep(
    failures,
    `technical wave export verification (${variant})`,
    ['verify:technical-wave', '--', '--export', '--variant', variant, '--out-dir', 'out'],
    env,
    variant,
    undefined,
    record
  );

  if (variant !== 'preview') {
    nodeStep(
      failures,
      `URL Alias black-box verification (${variant})`,
      'scripts/verify-url-alias-blackbox.js',
      ['--variant', variant],
      env,
      variant,
      record
    );
    nodeStep(
      failures,
      `Case-only HTTP verification (${variant})`,
      'scripts/verify-url-alias-blackbox.js',
      ['--variant', variant, '--slice', 'case-only'],
      env,
      variant,
      record
    );
  }

  const checks = [
    ['P0 HTML verification', ['verify:p0']],
    ['P1 HTML verification', ['verify:p1'], extractP1SuccessMeasurement],
    ['P2 HTML verification', ['verify:p2']],
    ['i18n SEO HTML verification', ['verify:i18n-seo']]
  ];
  if (variant !== 'preview') {
    checks.push(
      [
        'FAQ metadata HTML verification',
        ['verify:faq-metadata', '--', '--html', '--variant', variant]
      ],
      [
        'FAQ metadata normalization HTML verification',
        ['verify:faq-metadata-authority', '--', '--html', '--variant', variant]
      ],
      [
        'FAQ SEO graph HTML verification',
        ['verify:faq-seo-graph', '--', '--html', '--out-dir', 'out', '--variant', variant]
      ],
      ['FAQ redirect artifact verification', ['verify:faq-redirects']]
    );
  }
  for (const [label, args, formatSuccess] of checks) {
    npmStep(failures, `${label} (${variant})`, args, env, variant, formatSuccess, record);
  }

  try {
    verifyExportCardinality(variant);
    recordStep(
      record,
      `export cardinality (${variant})`,
      'in-process static export cardinality check',
      variant,
      'passed',
      'FAQ HTML and sitemap cardinality matched the release contract'
    );
    console.log(`[verify-release] export cardinality (${variant}) passed`);
  } catch (error) {
    failures.push({
      label: `export cardinality (${variant})`,
      variant,
      command: 'in-process static export cardinality check',
      output: error.message
    });
    recordStep(
      record,
      `export cardinality (${variant})`,
      'in-process static export cardinality check',
      variant,
      'failed',
      error.message
    );
    console.error(`[verify-release] export cardinality (${variant}) failed`);
  }

  if (variant === 'preview') {
    recordStep(
      record,
      `Guide export artifact verification (${variant})`,
      'preview Guide export verification is covered by i18n and static artifact gates',
      variant,
      'passed',
      'skipped for preview: production Guide sitemap and locale-owner contract do not apply'
    );
    console.log(`[verify-release] Guide export artifact verification (${variant}) skipped`);
  } else {
    nodeStep(
      failures,
      `Guide export artifact verification (${variant})`,
      'scripts/verify-guide-export.js',
      ['--out-dir', 'out', '--variant', variant],
      env,
      variant,
      record,
      (output) => {
        const match = output.match(
          /Guide HTML verified: (\d+) pages, (\d+) sitemap URLs \(tracer=([^)]+)\)/
        );
        return match
          ? `tracer=${match[3]} pages=${match[1]} sitemapUrls=${match[2]}`
          : undefined;
      }
    );
  }
  recordVariantOutcome(record, variant, failures, commandStart);
  return true;
}

function appendP1HistoricalBaselineAdvisories(failures, startIndex, advisories) {
  for (const failure of failures.slice(startIndex)) {
    const budgetMatch = failure.output.match(
      /Initial JavaScript is ([0-9.]+) KiB gzip, budget is 260 KiB/
    );
    if (!failure.label.startsWith('P1 HTML verification') || !budgetMatch) continue;
    const currentKib = Number.parseFloat(budgetMatch[1]);
    const deltaKib = currentKib - P1_BASELINE_KIB;
    advisories.push({
      ...failure,
      label: 'P1 historical baseline comparison',
      output:
        `current=${currentKib.toFixed(1)} KiB gzip; c77cf48 APFS baseline=${P1_BASELINE_KIB.toFixed(
          1
        )} KiB gzip; ` +
        `delta=${deltaKib >= 0 ? '+' : ''}${deltaKib.toFixed(
          1
        )} KiB; budget=${P1_BUDGET_KIB} KiB; ` +
        `command=${failure.command}; variant=${failure.variant}`
    });
  }
}

function reportFailures(failures, advisories, retainedPaths) {
  if (!failures.length && !advisories.length) return;
  if (failures.length) console.error(`\n[verify-release] failed with ${failures.length} check(s)`);
  for (const failure of failures) {
    console.error(`\n- ${failure.label}${failure.variant ? ` [variant=${failure.variant}]` : ''}`);
    console.error(`  command: ${failure.command}`);
    console.error(`  evidence:\n${failure.output}`);
  }
  if (advisories.length) {
    console.warn(`\n[verify-release] known advisory checks (${advisories.length})`);
    for (const advisory of advisories) {
      console.warn(
        `\n- ${advisory.label}${advisory.variant ? ` [variant=${advisory.variant}]` : ''}`
      );
      console.warn(`  command: ${advisory.command}`);
      console.warn(`  evidence: ${advisory.output}`);
    }
  }
  if (failures.length) {
    if (retainedPaths.length) {
      console.error(`\n[verify-release] retained failure artifacts: ${retainedPaths.join(', ')}`);
    } else {
      console.error(
        '[verify-release] rerun with --keep-artifacts to retain failing .next/out evidence'
      );
    }
  }
}

function runReleaseRegressionChecks(failures, env, record) {
  npmStep(
    failures,
    'release coordinator regression',
    ['verify:release-regression'],
    env,
    undefined,
    undefined,
    record
  );
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const failures = [];
  const advisories = [];
  const retainedPaths = [];
  const record = createReleaseRecord(options);
  if (!options.keepArtifacts) fs.rmSync(RETAIN_DIR, { recursive: true, force: true });
  const snapshot = snapshotGeneratedPublicFiles();
  const sourceEnv = {
    ...process.env,
    CI: process.env.CI || '1',
    NEXT_PUBLIC_SITE_VARIANT: process.env.NEXT_PUBLIC_SITE_VARIANT || 'io',
    NEXT_PUBLIC_HOME_URL: process.env.NEXT_PUBLIC_HOME_URL || 'https://fastgpt.io',
    NEXT_PUBLIC_CN_HOME_URL: process.env.NEXT_PUBLIC_CN_HOME_URL || 'https://fastgpt.cn',
    NEXT_PUBLIC_IO_HOME_URL: process.env.NEXT_PUBLIC_IO_HOME_URL || 'https://fastgpt.io'
  };

  try {
    runSourceChecks(failures, sourceEnv, record);
    runGuideSourceChecks(failures, sourceEnv, undefined, record);
    if (failures.length || options.sourceOnly) {
      reportFailures(failures, advisories, retainedPaths);
      if (!failures.length) {
        console.log(
          '[verify-release] source-only checks passed; full mode requires a case-sensitive filesystem'
        );
      }
      process.exitCode = failures.length ? 1 : 0;
      return;
    }

    runReleaseRegressionChecks(failures, sourceEnv, record);
    if (failures.length) {
      reportFailures(failures, advisories, retainedPaths);
      process.exitCode = 1;
      return;
    }

    try {
      assertCaseSensitiveFilesystem();
      recordStep(
        record,
        'case-sensitive filesystem policy',
        'in-process case-sensitive filesystem probe',
        undefined,
        'passed',
        'Published route collision probe passed'
      );
      console.log('[verify-release] case-sensitive filesystem probe passed');
    } catch (error) {
      recordStep(
        record,
        'case-sensitive filesystem policy',
        'in-process case-sensitive filesystem probe',
        undefined,
        'failed',
        error.message
      );
      failures.push({
        label: 'case-sensitive filesystem policy',
        command: 'in-process case-sensitive filesystem probe',
        output: error.message
      });
      clearBuildArtifacts();
      reportFailures(failures, advisories, retainedPaths);
      process.exitCode = 1;
      return;
    }

    const variants = options.variant ? [options.variant] : siteVariants;
    for (const variant of variants) {
      clearBuildArtifacts();
      const env = variantEnvironment(variant);
      const beforeFailures = failures.length;
      runGuideSourceChecks(failures, env, variant, record);
      runVariantChecks(failures, variant, env, record);
      appendP1HistoricalBaselineAdvisories(failures, beforeFailures, advisories);
      const variantFailed = failures.length > beforeFailures;
      if (!variantFailed && ['cn', 'io'].includes(variant)) {
        try {
          const bundle = writeUrlAliasArtifactBundle(ROOT, RETAIN_DIR, variant);
          verifyUrlAliasArtifactBundle(path.join(RETAIN_DIR, 'url-alias'), [variant]);
          record.evidence.aliasContract.artifacts[variant] = {
            status: 'passed',
            path: path.relative(ROOT, bundle.root),
            authorityDigest: bundle.releaseManifest.authority.digest,
            authoritySha256: bundle.authoritySha256,
            projectionSha256: bundle.projectionSha256
          };
          console.log(`[verify-release] URL Alias ${variant} release/rollback artifacts passed`);
        } catch (error) {
          failures.push({
            label: `URL Alias release artifacts (${variant})`,
            variant,
            command: 'in-process URL Alias release artifact generation',
            output: error.message
          });
          record.evidence.aliasContract.artifacts[variant] = {
            status: 'failed',
            detail: error.message
          };
        }
      }
      if (variantFailed && options.keepArtifacts) {
        try {
          retainedPaths.push(retainFailureArtifacts(variant));
        } catch (error) {
          failures.push({
            label: `failure artifact retention (${variant})`,
            variant,
            command: 'in-process failure artifact copy',
            output: error.message
          });
        }
      }
      if (!variantFailed && options.retainSuccessArtifacts) {
        try {
          const retainedPath = retainSuccessArtifacts(variant, options.retainSuccessArtifacts);
          record.evidence.aliasContract.artifacts[variant] = {
            status: 'passed',
            path: path.relative(ROOT, path.join(retainedPath, 'url-alias', variant)),
            authorityDigest: JSON.parse(
              fs.readFileSync(path.join(retainedPath, 'url-alias', variant, 'release', 'manifest.json'), 'utf8')
            ).authority.digest
          };
          console.log(`[verify-release] retained verified ${variant} output: ${retainedPath}`);
        } catch (error) {
          failures.push({
            label: `success artifact retention (${variant})`,
            variant,
            command: 'in-process verified output copy',
            output: error.message
          });
        }
      }
      clearBuildArtifacts();
    }

    reportFailures(failures, advisories, retainedPaths);
    if (!failures.length) {
      console.log(
        `[verify-release] release gate passed for source, redirects, ${siteVariants.join(
          ', '
        )}, HTML, and sitemap evidence`
      );
    }
    process.exitCode = failures.length ? 1 : 0;
  } finally {
    finalizeReleaseRecord(record, failures, options);
    if (options.keepArtifacts || options.retainSuccessArtifacts || process.env.CI) {
      const recordPath = writeReleaseRecord(record);
      console.log(`[verify-release] verification record: ${recordPath}`);
    }
    restoreGeneratedPublicFiles(snapshot);
    if (!failures.length || !options.keepArtifacts) {
      clearBuildArtifacts();
    }
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[verify-release] ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { parseArgs, appendP1HistoricalBaselineAdvisories, extractP1SuccessMeasurement };
