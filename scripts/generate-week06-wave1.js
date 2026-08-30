#!/usr/bin/env node

/** Materialize the Week06 bilingual Technical Content Wave 1 source projection. */

const path = require('node:path');
const {
  buildWeek06Wave1Package,
  verifyWeek06Wave1Source,
  writeWeek06Wave1Package
} = require('./lib/week06-technical-wave1');

const ROOT = path.resolve(__dirname, '..');

function parseArgs(argv = process.argv.slice(2)) {
  const options = { mode: null, failAt: undefined, sourceRoot: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--write' || token === '--check') {
      if (options.mode) throw new Error('Choose one of --write or --check');
      options.mode = token.slice(2);
    } else if (token === '--fail-at') {
      const value = Number(argv[++index]);
      if (!Number.isInteger(value) || value < 1) {
        throw new Error('--fail-at requires a positive integer');
      }
      options.failAt = value;
    } else if (token === '--source-root') {
      const value = argv[++index];
      if (!value || value.startsWith('--')) {
        throw new Error('--source-root requires a directory');
      }
      options.sourceRoot = path.resolve(value);
    } else {
      throw new Error(`Unknown option: ${token}`);
    }
  }
  if (!options.mode) throw new Error('Choose --write or --check');
  if (options.mode === 'check' && options.failAt !== undefined) {
    throw new Error('--fail-at can only be used with --write');
  }
  if (options.mode === 'write' && !options.sourceRoot) {
    throw new Error('--write requires --source-root for all 50 approved source files');
  }
  if (options.mode === 'check' && options.sourceRoot) {
    throw new Error('--source-root can only be used with --write');
  }
  return options;
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.mode === 'check') return verifyWeek06Wave1Source(ROOT);
  const wavePackage = buildWeek06Wave1Package(ROOT, { sourceRoot: options.sourceRoot });
  if (wavePackage.sourceDigestVerifiedCount !== 50) {
    throw new Error('Approved source digest verification must cover all 50 pages');
  }
  writeWeek06Wave1Package(wavePackage, options.failAt);
  const result = verifyWeek06Wave1Source(ROOT);
  console.log(
    `[generate-week06-wave1] written: zh=${result.localeCounts.zh} en=${result.localeCounts.en} total=${result.publicationCount}`
  );
  return result;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[generate-week06-wave1] ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { main, parseArgs };
