#!/usr/bin/env node

/** Build and measure the frozen 4,007-page Technical Center projection in a disposable copy. */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const {
  VARIANTS,
  patchCapacityPageCount,
  projectTechnicalContent,
  summarizeExport,
  validateCapacityReport
} = require('./lib/technical-full-release-capacity');
const { extractSourceRootArgs } = require('./lib/technical-full-release');
const { sha256, stableJson } = require('./lib/technical-authority');
const { variantEnvironment } = require('./lib/release-artifacts');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_REPORT = 'scripts/fixtures/technical-authority/full-release-capacity.json';

function parseArgs(argv = process.argv.slice(2)) {
  if (argv.includes('--check-report')) {
    let report = path.join(ROOT, DEFAULT_REPORT);
    for (let index = 0; index < argv.length; index += 1) {
      const token = argv[index];
      if (token === '--check-report') continue;
      if (token === '--report') {
        const value = argv[++index];
        if (!value || value.startsWith('--')) throw new Error('--report requires a path');
        report = path.resolve(ROOT, value);
      } else {
        throw new Error(`Unknown option: ${token}`);
      }
    }
    return { mode: 'check', report };
  }
  const { options, remaining } = extractSourceRootArgs(argv);
  options.mode = 'run';
  options.report = path.join(ROOT, DEFAULT_REPORT);
  for (let index = 0; index < remaining.length; index += 1) {
    const token = remaining[index];
    if (token === '--report' || token === '--work-root') {
      const value = remaining[++index];
      if (!value || value.startsWith('--')) throw new Error(`${token} requires a path`);
      options[token === '--report' ? 'report' : 'workRoot'] = path.resolve(ROOT, value);
    } else {
      throw new Error(`Unknown option: ${token}`);
    }
  }
  if (!options.w5SourceRoot || !options.w6SourceRoot) {
    throw new Error('W5 and W6 source roots are required');
  }
  return options;
}

function copyRepository(target) {
  fs.cpSync(ROOT, target, {
    recursive: true,
    preserveTimestamps: true,
    filter(source) {
      return !['.git', '.next', 'out', 'node_modules'].includes(path.basename(source));
    }
  });
  const dependencies = spawnSync(
    'cp',
    ['-a', '-l', path.join(ROOT, 'node_modules'), path.join(target, 'node_modules')],
    { encoding: 'utf8' }
  );
  if (dependencies.status !== 0) {
    throw new Error(`Unable to hard-link dependencies: ${dependencies.stderr}`);
  }
}

function descendantsRssKilobytes(rootPid) {
  const ps = spawnSync('ps', ['-axo', 'pid=,ppid=,rss='], { encoding: 'utf8' });
  if (ps.status !== 0) return 0;
  const rows = ps.stdout
    .trim()
    .split('\n')
    .map((line) => line.trim().split(/\s+/).map(Number));
  const descendants = new Set([rootPid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [pid, parentPid] of rows) {
      if (descendants.has(parentPid) && !descendants.has(pid)) {
        descendants.add(pid);
        changed = true;
      }
    }
  }
  return rows.reduce((rss, [pid, , value]) => rss + (descendants.has(pid) ? value : 0), 0);
}

function runMeasured(command, args, { cwd, env, logPath }) {
  return new Promise((resolve, reject) => {
    const log = fs.openSync(logPath, 'w');
    const startedAt = Date.now();
    const child = spawn(command, args, { cwd, env, stdio: ['ignore', log, log] });
    let peakRssKilobytes = 0;
    const sampler = setInterval(() => {
      peakRssKilobytes = Math.max(peakRssKilobytes, descendantsRssKilobytes(child.pid));
    }, 250);
    child.on('error', reject);
    child.on('close', (status, signal) => {
      clearInterval(sampler);
      peakRssKilobytes = Math.max(peakRssKilobytes, descendantsRssKilobytes(child.pid));
      fs.closeSync(log);
      resolve({
        status,
        signal,
        durationMilliseconds: Date.now() - startedAt,
        peakRssBytes: peakRssKilobytes * 1024
      });
    });
  });
}

function runChecked(command, args, options) {
  const result = spawnSync(command, args, { ...options, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed:\n${result.stdout || ''}${result.stderr || ''}`
    );
  }
  return result;
}

function runPostBuildCheck(command, args, options) {
  const result = spawnSync(command, args, { ...options, encoding: 'utf8' });
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  return {
    command: [command, ...args].join(' '),
    status: result.status,
    outputBytes: Buffer.byteLength(output),
    outputSha256: sha256(output),
    firstFailure: result.status === 0 ? null : output.split('\n').find(Boolean) || 'no output'
  };
}

function cleanBuild(repoRoot) {
  fs.rmSync(path.join(repoRoot, '.next'), { recursive: true, force: true });
  fs.rmSync(path.join(repoRoot, 'out'), { recursive: true, force: true });
}

function directorySummary(root) {
  if (!fs.existsSync(root)) return { fileCount: 0, bytes: 0 };
  const files = fs.readdirSync(root, { recursive: true, withFileTypes: true });
  return files.reduce(
    (summary, entry) => {
      if (!entry.isFile()) return summary;
      const filePath = path.join(entry.parentPath || entry.path, entry.name);
      summary.fileCount += 1;
      summary.bytes += fs.statSync(filePath).size;
      return summary;
    },
    { fileCount: 0, bytes: 0 }
  );
}

function sanitizeFailure(output, repoRoot) {
  const roots = [repoRoot];
  try {
    roots.push(fs.realpathSync(repoRoot));
  } catch {}
  return roots.reduce(
    (sanitized, root) => sanitized.replaceAll(root, '<disposable-root>'),
    output
  );
}

function buildEnvironment(variant) {
  return { ...variantEnvironment(variant), NEXT_TELEMETRY_DISABLED: '1' };
}

async function measureVariant(repoRoot, variant, logRoot) {
  cleanBuild(repoRoot);
  try {
    const env = buildEnvironment(variant);
    runChecked(process.execPath, ['scripts/generate-robots.js'], { cwd: repoRoot, env });
    runChecked(process.execPath, ['scripts/generate-llms.js'], { cwd: repoRoot, env });
    const build = await runMeasured(
      process.execPath,
      ['node_modules/next/dist/bin/next', 'build'],
      { cwd: repoRoot, env, logPath: path.join(logRoot, `${variant}.log`) }
    );
    if (build.status !== 0) {
      const output = sanitizeFailure(
        fs.readFileSync(path.join(logRoot, `${variant}.log`), 'utf8'),
        repoRoot
      );
      return {
        variant,
        ...build,
        buildSucceeded: false,
        failure: output.split('\n').filter(Boolean).slice(-8).join('\n'),
        partialNextBuild: directorySummary(path.join(repoRoot, '.next')),
        staticFileCount: null,
        exportBytes: null,
        initialJavaScriptGzipBytes: null,
        initialJavaScriptMaxGzipBytes: null,
        initialJavaScriptWithinBudget: null,
        postBuildVerified: false,
        postBuildChecks: []
      };
    }
    const postBuild = [
      ['scripts/clean-locale-output.js'],
      ['scripts/clean-faq-rsc.js'],
      ['scripts/verify-technical-center.js'],
      ['scripts/verify-customers-export.js'],
      ['scripts/fix-html-lang.js'],
      ['--test', 'scripts/verify-content-sidebar-cta.test.js'],
      ['scripts/verify-technical-export.js'],
      ['scripts/verify-content-hygiene.js', '--mode', 'html', '--root', 'out']
    ];
    const postBuildChecks = postBuild.map((args) =>
      runPostBuildCheck(process.execPath, args, { cwd: repoRoot, env })
    );
    return {
      variant,
      ...build,
      buildSucceeded: true,
      ...summarizeExport(repoRoot, variant),
      postBuildVerified: postBuildChecks.every((check) => check.status === 0),
      postBuildChecks
    };
  } finally {
    cleanBuild(repoRoot);
  }
}

async function captureVariant(variant, measure) {
  try {
    return await measure();
  } catch (error) {
    return {
      variant,
      buildSucceeded: false,
      status: null,
      signal: null,
      durationMilliseconds: null,
      peakRssBytes: null,
      failure: error.message,
      partialNextBuild: null,
      staticFileCount: null,
      exportBytes: null,
      initialJavaScriptGzipBytes: null,
      initialJavaScriptMaxGzipBytes: null,
      initialJavaScriptWithinBudget: null,
      postBuildVerified: false,
      postBuildChecks: []
    };
  }
}

function currentPathBlockers(repoRoot) {
  const packageJson = require(path.join(repoRoot, 'package.json'));
  const dockerfile = fs.readFileSync(path.join(repoRoot, 'Dockerfile'), 'utf8');
  const blockers = [];
  if (packageJson.scripts.prebuild.includes('verify-technical-full-release.js')) {
    blockers.push('prebuild-rejects-a-registry-that-has-consumed-the-frozen-pending-closure');
  }
  if (dockerfile.includes('Docker publication supports only NEXT_PUBLIC_SITE_VARIANT=cn')) {
    blockers.push('docker-publication-is-cn-only');
  }
  return blockers;
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.mode === 'check') {
    const report = validateCapacityReport(JSON.parse(fs.readFileSync(options.report)), ROOT);
    console.log(
      `[verify-technical-full-release-capacity] evidence passed: variants=${report.variants.length} safe=${report.decision.safeOneShotFullRelease}`
    );
    return report;
  }
  const disposableRoot = options.workRoot || fs.mkdtempSync(path.join(os.tmpdir(), 'full-release-'));
  const cleanup = !options.workRoot;
  const repoRoot = path.join(disposableRoot, 'repo');
  const logRoot = path.join(disposableRoot, 'logs');
  try {
    fs.mkdirSync(logRoot, { recursive: true });
    copyRepository(repoRoot);
    const projection = projectTechnicalContent({ repoRoot, ...options });
    patchCapacityPageCount(repoRoot, projection.pages);
    const report = {
      schemaVersion: 1,
      issue: 275,
      sourceRevision: require('node:child_process')
        .execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' })
        .trim(),
      measuredAt: new Date().toISOString(),
      command:
        'npm run verify:technical-full-release-capacity -- --w5-source-root <W5_ROOT> --w6-source-root <W6_ROOT>',
      scope: 'disposable-4007-page-production-static-export',
      environment: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        logicalCpuCount: os.cpus().length,
        physicalMemoryBytes: os.totalmem()
      },
      projection,
      variants: [],
      decision: null
    };
    const writeReport = () => {
      fs.mkdirSync(path.dirname(options.report), { recursive: true });
      const temporaryPath = `${options.report}.tmp-${process.pid}`;
      fs.writeFileSync(temporaryPath, stableJson(report));
      fs.renameSync(temporaryPath, options.report);
    };
    writeReport();
    for (const variant of VARIANTS) {
      console.log(`[verify-technical-full-release-capacity] building ${variant}`);
      report.variants.push(
        await captureVariant(variant, () => measureVariant(repoRoot, variant, logRoot))
      );
      writeReport();
    }
    const blockers = currentPathBlockers(ROOT);
    if (report.variants.some((variant) => variant.buildSucceeded === false)) {
      blockers.push('one-or-more-static-exports-failed');
    }
    if (report.variants.some((variant) => variant.initialJavaScriptWithinBudget === false)) {
      blockers.push('technical-center-initial-javascript-budget-exceeded');
    }
    for (const variant of report.variants) {
      if (!variant.postBuildVerified) blockers.push(`${variant.variant}-post-build-gate-failed`);
    }
    report.decision = {
      safeOneShotFullRelease: blockers.length === 0,
      blockers
    };
    writeReport();
    console.log(`TECHNICAL_FULL_RELEASE_CAPACITY_RESULT=${JSON.stringify(report)}`);
    return report;
  } finally {
    if (cleanup) fs.rmSync(disposableRoot, { recursive: true, force: true });
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[verify-technical-full-release-capacity] ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { captureVariant, descendantsRssKilobytes, main, parseArgs, sanitizeFailure };
