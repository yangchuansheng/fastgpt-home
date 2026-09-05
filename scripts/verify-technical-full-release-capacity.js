#!/usr/bin/env node

/** Measure the existing release build; verification and capacity share the same exported output. */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const {
  VARIANTS,
  deriveCapacityBlockers,
  isCapacityReportReady,
  projectTechnicalContent,
  summarizeExport,
  validateCapacityReport
} = require('./lib/technical-full-release-capacity');
const { sha256, stableJson } = require('./lib/technical-authority');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_REPORT = 'scripts/fixtures/technical-authority/full-release-capacity.json';

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    mode: argv.includes('--check-report') ? 'check' : 'run',
    report: path.join(
      ROOT,
      argv.includes('--check-report') ? DEFAULT_REPORT : '.release-artifacts/capacity-report.json'
    )
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--check-report') continue;
    if (token === '--report') {
      const value = argv[++index];
      if (!value || value.startsWith('--')) throw new Error('--report requires a path');
      options.report = path.resolve(ROOT, value);
    } else {
      throw new Error(`Unknown option: ${token}`);
    }
  }
  return options;
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

function createCapacityReport(sourceRevision) {
  const projection = projectTechnicalContent({ repoRoot: ROOT });
  return {
    schemaVersion: 1,
    issue: 275,
    sourceRevision,
    measuredAt: new Date().toISOString(),
    command: 'npm run verify:release -- --capacity-report <REPORT_PATH>',
    scope: 'repository-production-static-export',
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      logicalCpuCount: os.cpus().length,
      physicalMemoryBytes: os.totalmem()
    },
    projection,
    measurementBinding: {
      measuredRecordsSha256: projection.recordsSha256,
      currentRecordsSha256: projection.recordsSha256,
      status: 'current',
      rerunRequired: false
    },
    variants: [],
    decision: { safeOneShotFullRelease: false, blockers: ['incomplete-variant-set'] }
  };
}

function writeCapacityReport(report, reportPath) {
  const blockers = deriveCapacityBlockers(report);
  report.decision = { safeOneShotFullRelease: blockers.length === 0, blockers };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  const temporaryPath = `${reportPath}.tmp-${process.pid}`;
  fs.writeFileSync(temporaryPath, stableJson(report));
  fs.renameSync(temporaryPath, reportPath);
}

async function measureBuild(variant, reportPath) {
  if (!VARIANTS.includes(variant)) throw new Error(`Unknown variant: ${variant}`);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  const logPath = `${reportPath}.log`;
  const result = await runMeasured(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['run', 'build'],
    {
      cwd: ROOT,
      env: process.env,
      logPath
    }
  );
  const output = fs.readFileSync(logPath, 'utf8');
  process.stdout.write(output);
  const succeeded = result.status === 0 && result.signal === null;
  const measurement = {
    variant,
    ...result,
    buildSucceeded: succeeded,
    ...(succeeded
      ? summarizeExport(ROOT, variant)
      : {
          failure:
            output
              .replaceAll(ROOT, '<repository>')
              .split('\n')
              .filter(Boolean)
              .slice(-8)
              .join('\n') || `build exited with ${result.status ?? result.signal}`,
          staticFileCount: null,
          exportBytes: null,
          initialJavaScriptGzipBytes: null,
          initialJavaScriptMaxGzipBytes: null,
          initialJavaScriptWithinBudget: null
        }),
    postBuildVerified: succeeded,
    postBuildChecks: succeeded
      ? [
          {
            command: 'npm run build',
            status: 0,
            outputBytes: Buffer.byteLength(output),
            outputSha256: sha256(output),
            firstFailure: null
          }
        ]
      : []
  };
  fs.writeFileSync(reportPath, stableJson(measurement));
  return measurement;
}

function recordCapacityVariant(report, measurementPath, commands) {
  const measurement = JSON.parse(fs.readFileSync(measurementPath, 'utf8'));
  if (measurement.buildSucceeded) {
    measurement.postBuildChecks.push(
      ...commands
        .filter((step) => step.variant === measurement.variant && step.id !== 'variant.build')
        .map((step) => ({
          command: step.command,
          status: step.status === 'passed' ? 0 : 1,
          outputBytes: Buffer.byteLength(step.output),
          outputSha256: sha256(step.output),
          firstFailure: step.status === 'passed' ? null : step.output
        }))
    );
    measurement.postBuildVerified = measurement.postBuildChecks.every((step) => step.status === 0);
    Object.assign(measurement, summarizeExport(ROOT, measurement.variant));
  }
  report.variants.push(measurement);
}

function assertCapacityReportReady(report) {
  if (!isCapacityReportReady(report)) {
    throw new Error(
      `One-shot static export capacity failed: ${report.decision.blockers.join(', ')}`
    );
  }
  validateCapacityReport(report, ROOT);
}

async function main(argv = process.argv.slice(2)) {
  if (argv[0] === '--measure-build') {
    if (argv.length !== 3)
      throw new Error('--measure-build requires a variant and measurement path');
    const result = await measureBuild(argv[1], path.resolve(argv[2]));
    process.exitCode = result.status === 0 && result.signal === null ? 0 : 1;
    return result;
  }
  const options = parseArgs(argv);
  if (options.mode === 'check') {
    const report = validateCapacityReport(JSON.parse(fs.readFileSync(options.report)), ROOT);
    console.log(
      `[verify-technical-full-release-capacity] evidence passed: variants=${report.variants.length} safe=${report.decision.safeOneShotFullRelease}`
    );
    return report;
  }
  const result = spawnSync(
    process.execPath,
    ['scripts/verify-release.js', '--capacity-report', options.report],
    { cwd: ROOT, stdio: 'inherit' }
  );
  if (result.error) throw result.error;
  process.exitCode = result.status === 0 && result.signal === null ? 0 : 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[verify-technical-full-release-capacity] ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  assertCapacityReportReady,
  createCapacityReport,
  main,
  parseArgs,
  recordCapacityVariant,
  runMeasured,
  writeCapacityReport
};
