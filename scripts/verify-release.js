#!/usr/bin/env node

/**
 * Run the complete source and static-export release gate without third-party dependencies.
 *
 * Source mode stays runnable on development volumes. Full mode requires a case-sensitive
 * filesystem because mixed-case FAQ slugs are part of the published URL contract.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { URL_ALIAS_CONTRACT } = require('./lib/url-alias-authority');
const {
  verifyUrlAliasArtifactBundle,
  writeUrlAliasArtifactBundle
} = require('./lib/url-alias-artifacts');
const { siteVariants } = require('./lib/site-variant');
const {
  GENERATED_PUBLIC_PATHS,
  addRollbackFile,
  commandLabel,
  createFailure,
  loadSolutionsEvidence
} = require('./lib/release-cross-project');
const {
  assertCaseSensitiveFilesystem,
  clearBuildArtifacts,
  clearRetainedSuccessArtifacts,
  finalizeSuccessArtifactBundle,
  recordVariantArtifactInventory,
  recordVariantExportRollbackInventory,
  recordVariantRollbackInventory,
  restoreGeneratedPublicFiles,
  retainFailureArtifacts,
  retainSuccessArtifacts,
  snapshotGeneratedPublicFiles,
  variantEnvironment,
  verifyExportCardinality
} = require('./lib/release-artifacts');
const {
  createReleaseRecord,
  finalizeReleaseRecord,
  formatTechnicalAuthoritySuccess,
  recordStep,
  recordVariantOutcome,
  writeReleaseRecord
} = require('./lib/release-record');
const {
  extractP1SuccessMeasurement,
  getSourceNodeSteps,
  getSourceNpmSteps,
  getVariantSteps
} = require('./lib/release-steps');

const ROOT = path.resolve(__dirname, '..');
const RETAIN_DIR = path.join(ROOT, '.release-artifacts');
const P1_BASELINE_KIB = 266.9;
const P1_BUDGET_KIB = 260;

function readSourceRevision(
  runGit = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' })
) {
  return runGit(['rev-parse', 'HEAD']).trim();
}

function resolveCleanSourceRevision(
  runGit = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' })
) {
  const sourceRevision = readSourceRevision(runGit);
  if (runGit(['status', '--porcelain', '--untracked-files=all']).trim()) {
    throw new Error('Release artifact source commit requires a clean working tree');
  }
  return sourceRevision;
}

function verifySourceRevision(expectedRevision, runGit) {
  if (resolveCleanSourceRevision(runGit) !== expectedRevision) {
    throw new Error('Release artifact source commit changed during the build');
  }
}

function runTechnicalFullReleasePreflight(run = spawnSync) {
  const result = run(
    process.execPath,
    ['scripts/verify-technical-full-release-build-decision.js', '--preflight-resources'],
    { cwd: ROOT, encoding: 'utf8' }
  );
  if (result.error || result.status !== 0) {
    throw new Error(
      `Technical full-release resource preflight failed: ${
        result.error?.message || `${result.stdout || ''}${result.stderr || ''}`.trim()
      }`
    );
  }
}

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
    else if (token === '--allow-missing-solutions-evidence') {
      options.allowMissingSolutionsEvidence = true;
    } else if (token === '--live') options.live = true;
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
    } else if (token === '--solutions-evidence' || token === '--solutions-preview-evidence') {
      const evidencePath = argv[++index];
      if (!evidencePath || evidencePath.startsWith('--')) {
        throw new Error(`${token} requires a JSON file path`);
      }
      options.solutionsEvidence = evidencePath;
    } else if (token === '--solutions-http-target') {
      const target = argv[++index];
      if (!target || target.startsWith('--')) throw new Error(`${token} requires an HTTPS URL`);
      options.solutionsHttpTarget = target;
    } else if (token === '--solutions-http-contract') {
      const contractPath = argv[++index];
      if (!contractPath || contractPath.startsWith('--')) {
        throw new Error(`${token} requires a JSON file path`);
      }
      options.solutionsHttpContract = contractPath;
    } else if (token === '--solutions-approved-target') {
      const target = argv[++index];
      if (!target || target.startsWith('--')) throw new Error(`${token} requires an HTTPS URL`);
      options.solutionsApprovedTarget = target;
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }
  if (options.solutionsEvidence && (options.solutionsHttpTarget || options.solutionsHttpContract)) {
    throw new Error(
      '--solutions-evidence cannot be combined with --solutions-http-target or --solutions-http-contract'
    );
  }
  if (options.solutionsHttpTarget !== undefined && options.solutionsHttpContract === undefined) {
    throw new Error('--solutions-http-target requires --solutions-http-contract');
  }
  if (options.solutionsHttpContract !== undefined && options.solutionsHttpTarget === undefined) {
    throw new Error('--solutions-http-contract requires --solutions-http-target');
  }
  if (options.variant && options.retainSuccessArtifacts) {
    throw new Error('--retain-success-artifacts requires the full cn, io, preview build');
  }
  return options;
}

function runStep(failures, stepId, label, command, args, env, variant, formatSuccess, record) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    env,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  if (result.error || result.status !== 0) {
    const failureOutput = result.error ? `${output}\n${result.error.message}` : output;
    recordStep(
      record,
      stepId,
      label,
      commandLabel(command, args),
      variant,
      'failed',
      failureOutput
    );
    failures.push(createFailure(stepId, label, command, args, failureOutput, variant));
    console.error(`[verify-release] ${label} failed`);
    return false;
  }
  const successEvidence = formatSuccess ? formatSuccess(output) : undefined;
  recordStep(
    record,
    stepId,
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

function nodeStep(failures, stepId, label, script, args, env, variant, record, formatSuccess) {
  return runStep(
    failures,
    stepId,
    label,
    process.execPath,
    [script, ...args],
    env,
    variant,
    formatSuccess,
    record
  );
}

function npmStep(failures, stepId, label, args, env, variant, formatSuccess, record) {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  return runStep(
    failures,
    stepId,
    label,
    npm,
    ['run', ...args],
    env,
    variant,
    formatSuccess,
    record
  );
}

function getSourceExecutionOrder() {
  return [
    ...getSourceNodeSteps().map(([stepId]) => stepId),
    ...getSourceNpmSteps().map(([stepId]) => stepId),
    'lint.source',
    'typescript.source',
    'guide-content.source'
  ];
}

function runSourceChecks(failures, env, record) {
  for (const [stepId, label, script, args] of getSourceNodeSteps()) {
    const formatSuccess =
      stepId === 'technical-authority.source' ? formatTechnicalAuthoritySuccess : undefined;
    nodeStep(failures, stepId, label, script, args, env, undefined, record, formatSuccess);
  }

  for (const [stepId, label, args] of getSourceNpmSteps()) {
    const formatSuccess =
      stepId === 'technical-authority.regression' ? formatTechnicalAuthoritySuccess : undefined;
    npmStep(failures, stepId, label, args, env, undefined, formatSuccess, record);
  }
  npmStep(
    failures,
    'lint.source',
    'Lint source verification',
    ['lint'],
    env,
    undefined,
    undefined,
    record
  );
  runStep(
    failures,
    'typescript.source',
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
  const week06Wave0 = record?.evidence.week06Wave0Readiness?.observed;
  if (
    week06Wave0?.sourceVerified === true &&
    week06Wave0.fixtureVerified === true &&
    week06Wave0.exportVerified === false &&
    week06Wave0.governanceStatus === 'governance-complete' &&
    week06Wave0.publicationCount === 0
  ) {
    console.log(
      '[verify-release] Week06 bilingual Wave 0 source-verified; fixture-verified; governance-complete; publication-count=0'
    );
  }
}

function runGuideSourceChecks(failures, env, variant, record) {
  const suffix = variant ? ` (${variant})` : '';
  nodeStep(
    failures,
    'guide-content.source',
    `Guide content source verification${suffix}`,
    'scripts/verify-guide-content.js',
    [],
    env,
    variant,
    record
  );
}

function getVariantExecutionOrder(variant) {
  return [
    'variant.build',
    ...getVariantSteps(variant).map((step) => step.id),
    'faq.export-cardinality',
    'guide.export'
  ];
}

function runVariantChecks(failures, variant, env, record) {
  const commandStart = record?.commands.length || 0;
  const buildPassed = npmStep(
    failures,
    'variant.build',
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

  for (const step of getVariantSteps(variant)) {
    if (step.runner === 'node') {
      nodeStep(
        failures,
        step.id,
        step.label,
        step.command,
        step.args,
        env,
        variant,
        record,
        step.formatSuccess
      );
      continue;
    }
    npmStep(failures, step.id, step.label, step.args, env, variant, step.formatSuccess, record);
  }

  try {
    verifyExportCardinality(variant);
    recordStep(
      record,
      'faq.export-cardinality',
      `export cardinality (${variant})`,
      'in-process static export cardinality check',
      variant,
      'passed',
      'FAQ HTML and sitemap cardinality matched the release contract'
    );
    console.log(`[verify-release] export cardinality (${variant}) passed`);
  } catch (error) {
    failures.push({
      id: 'faq.export-cardinality',
      label: `export cardinality (${variant})`,
      variant,
      command: 'in-process static export cardinality check',
      output: error.message
    });
    recordStep(
      record,
      'faq.export-cardinality',
      `export cardinality (${variant})`,
      'in-process static export cardinality check',
      variant,
      'failed',
      error.message
    );
    console.error(`[verify-release] export cardinality (${variant}) failed`);
  }

  if (variant === 'preview') {
    nodeStep(
      failures,
      'guide.export',
      `Guide export artifact verification (${variant})`,
      'scripts/verify-guide-preview.js',
      ['--out-dir', 'out'],
      env,
      variant,
      record
    );
  } else {
    nodeStep(
      failures,
      'guide.export',
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
        return match ? `tracer=${match[3]} pages=${match[1]} sitemapUrls=${match[2]}` : undefined;
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
    if (failure.id !== 'p1.export' || !budgetMatch) continue;
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
    'release.regression',
    'release coordinator regression',
    ['verify:release-regression'],
    env,
    undefined,
    undefined,
    record
  );
}

function isReleaseGateBlocked(failures, solutionsEvidence, options = {}) {
  if (failures.length) return true;
  if (solutionsEvidence.claim === true) return false;
  return !(
    options.allowMissingSolutionsEvidence === true && solutionsEvidence.status === 'not-provided'
  );
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const sourceRevision = options.retainSuccessArtifacts ? resolveCleanSourceRevision() : undefined;
  if (options.retainSuccessArtifacts) {
    runTechnicalFullReleasePreflight();
  }
  const failures = [];
  const advisories = [];
  const retainedPaths = [];
  const record = createReleaseRecord(options);
  // Source-only checks run inside release regressions; preserve any full release record they inspect.
  if (!options.keepArtifacts && !options.sourceOnly) {
    fs.rmSync(RETAIN_DIR, { recursive: true, force: true });
  }
  loadSolutionsEvidence(record, options);
  addRollbackFile(
    record,
    'src/content/tech-center/authority/week05-wave1-release-manifest.json',
    'technical-wave-release-manifest',
    record.startedAt
  );
  addRollbackFile(
    record,
    'src/content/tech-center/authority/week05-wave1-rollback.json',
    'technical-wave-rollback',
    record.startedAt
  );
  addRollbackFile(
    record,
    'src/content/tech-center/authority/week05-wave2-release-manifest.json',
    'technical-wave2-release-manifest',
    record.startedAt
  );
  addRollbackFile(
    record,
    'src/content/tech-center/authority/week05-wave2-rollback.json',
    'technical-wave2-rollback',
    record.startedAt
  );
  addRollbackFile(
    record,
    'scripts/fixtures/technical-authority/week06-wave0-readiness.json',
    'week06-wave0-release-rollback-contract',
    record.startedAt
  );
  for (const [relativePath, role] of [
    ['src/faq/generated-en-route-registry.json', 'faq-route-registry'],
    ['src/faq/generated-en-metadata.json', 'faq-metadata-projection'],
    ['src/faq/generated-en-metadata-authority.json', 'faq-metadata-authority'],
    ['src/content/guides/registry.json', 'guide-registry'],
    ['src/content/guides/policy.json', 'guide-release-policy'],
    ['src/content/guides/g1-release-manifest.json', 'guide-g1-release-manifest'],
    ['src/content/guides/g1-rollback.json', 'guide-g1-rollback'],
    ['src/content/guides/g2-release-manifest.json', 'guide-g2-release-manifest'],
    ['src/content/guides/g2-rollback.json', 'guide-g2-rollback']
  ]) {
    addRollbackFile(record, relativePath, role, record.startedAt);
  }
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
        'filesystem.case-sensitive',
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
        'filesystem.case-sensitive',
        'case-sensitive filesystem policy',
        'in-process case-sensitive filesystem probe',
        undefined,
        'failed',
        error.message
      );
      failures.push({
        id: 'filesystem.case-sensitive',
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
    if (options.retainSuccessArtifacts) {
      clearRetainedSuccessArtifacts(options.retainSuccessArtifacts, variants);
    }
    for (const variant of variants) {
      clearBuildArtifacts();
      const env = variantEnvironment(variant);
      const beforeFailures = failures.length;
      runGuideSourceChecks(failures, env, variant, record);
      runVariantChecks(failures, variant, env, record);
      recordVariantArtifactInventory(record, variant);
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
          recordVariantRollbackInventory(record, variant);
          console.log(`[verify-release] URL Alias ${variant} release/rollback artifacts passed`);
        } catch (error) {
          failures.push({
            id: 'url-alias.artifacts',
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
      if (!variantFailed) recordVariantExportRollbackInventory(record, variant);
      if (variantFailed && options.keepArtifacts) {
        try {
          retainedPaths.push(retainFailureArtifacts(variant));
        } catch (error) {
          failures.push({
            id: 'artifacts.retain-failure',
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
              fs.readFileSync(
                path.join(retainedPath, 'url-alias', variant, 'release', 'manifest.json'),
                'utf8'
              )
            ).authority.digest
          };
          console.log(`[verify-release] retained verified ${variant} output: ${retainedPath}`);
        } catch (error) {
          failures.push({
            id: 'artifacts.retain-success',
            label: `success artifact retention (${variant})`,
            variant,
            command: 'in-process verified output copy',
            output: error.message
          });
        }
      }
      clearBuildArtifacts();
    }

    if (options.retainSuccessArtifacts) {
      if (failures.length) {
        clearRetainedSuccessArtifacts(options.retainSuccessArtifacts, variants);
      } else {
        try {
          verifySourceRevision(sourceRevision);
          const bundle = finalizeSuccessArtifactBundle(
            options.retainSuccessArtifacts,
            sourceRevision,
            variants
          );
          record.evidence.technicalFullReleaseBundle = bundle;
          console.log(`[verify-release] sealed one release artifact: ${bundle.bundleSha256}`);
        } catch (error) {
          clearRetainedSuccessArtifacts(options.retainSuccessArtifacts, variants);
          failures.push({
            id: 'artifacts.seal-success',
            label: 'single release artifact sealing',
            command: 'in-process release artifact manifest generation',
            output: error.message
          });
        }
      }
    }

    reportFailures(failures, advisories, retainedPaths);
    const solutionsEvidence = record.crossProjectInputs.solutionsPreviewHttp;
    const solutionsBlocked = solutionsEvidence.claim !== true;
    const missingSolutionsAllowed =
      options.allowMissingSolutionsEvidence === true && solutionsEvidence.status === 'not-provided';
    if (!failures.length && !solutionsBlocked) {
      console.log(
        `[verify-release] release gate passed for source, redirects, ${siteVariants.join(
          ', '
        )}, HTML, and sitemap evidence`
      );
    } else if (!failures.length && missingSolutionsAllowed) {
      console.log(
        '[verify-release] pull-request source and export gates passed; production release eligibility awaits Solutions preview HTTP evidence'
      );
    } else if (!failures.length && solutionsBlocked) {
      console.error('[verify-release] release gate blocked by Solutions preview HTTP evidence');
    }
    process.exitCode = isReleaseGateBlocked(failures, solutionsEvidence, options) ? 1 : 0;
  } finally {
    finalizeReleaseRecord(record, failures, options);
    if (!options.sourceOnly) {
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

module.exports = {
  appendP1HistoricalBaselineAdvisories,
  createReleaseRecord,
  extractP1SuccessMeasurement,
  finalizeReleaseRecord,
  getSourceNodeSteps,
  getSourceNpmSteps,
  getSourceExecutionOrder,
  getVariantExecutionOrder,
  getVariantSteps,
  isReleaseGateBlocked,
  loadSolutionsEvidence,
  parseArgs,
  readSourceRevision,
  resolveCleanSourceRevision,
  runTechnicalFullReleasePreflight,
  verifySourceRevision
};
