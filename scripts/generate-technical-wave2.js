#!/usr/bin/env node

/** Materialize the bounded Week05 Technical Content Wave 2 source projection. */

const path = require('node:path');
const { buildWavePackage, verifyWave2Source, writeWavePackage } = require('./lib/technical-wave2');

const REPOSITORY_ROOT = path.resolve(__dirname, '..');

function parseArgs(argv = process.argv.slice(2)) {
  const options = { mode: null, failAt: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--write' || token === '--check') {
      if (options.mode) throw new Error('Choose one of --write or --check');
      options.mode = token.slice(2);
    } else if (token === '--fail-at') {
      const value = Number(argv[++index]);
      if (!Number.isInteger(value) || value < 1)
        throw new Error('--fail-at requires a positive integer');
      options.failAt = value;
    } else {
      throw new Error(`Unknown option: ${token}`);
    }
  }
  if (!options.mode) throw new Error('Choose --write or --check');
  if (options.mode === 'check' && options.failAt !== undefined) {
    throw new Error('--fail-at can only be used with --write');
  }
  return options;
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.mode === 'check') {
    const result = verifyWave2Source(REPOSITORY_ROOT);
    console.log(`[generate-technical-wave2] source verification passed: ${JSON.stringify(result)}`);
    return result;
  }
  const wavePackage = buildWavePackage(REPOSITORY_ROOT);
  writeWavePackage(wavePackage, options.failAt);
  const result = verifyWave2Source(REPOSITORY_ROOT);
  console.log(
    `[generate-technical-wave2] post-write verification passed: ${JSON.stringify(result)}`
  );
  return result;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[generate-technical-wave2] ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { main, parseArgs };
