#!/usr/bin/env node

/** Verify the bounded Week05 Technical Content Wave 2 source and export projections. */

const path = require('node:path');
const { verifyWave2Export, verifyWave2Source } = require('./lib/technical-wave2');

const REPOSITORY_ROOT = path.resolve(__dirname, '..');

function parseArgs(argv = process.argv.slice(2)) {
  const options = { export: false, outDir: null, variant: 'cn' };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--export') options.export = true;
    else if (token === '--out-dir') {
      options.outDir = argv[++index];
      if (!options.outDir) throw new Error('--out-dir requires a path');
    } else if (token === '--variant') {
      options.variant = argv[++index];
      if (!['cn', 'io', 'preview'].includes(options.variant)) {
        throw new Error('--variant must be cn, io, or preview');
      }
    } else throw new Error(`Unknown option: ${token}`);
  }
  if (options.outDir && !options.export) throw new Error('--out-dir requires --export');
  return options;
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (!options.export) {
    const result = verifyWave2Source(REPOSITORY_ROOT);
    console.log(`[verify-technical-wave2] source-verified: ${JSON.stringify(result)}`);
    console.log(`WAVE2_RESULT=${JSON.stringify(result)}`);
    return result;
  }
  const result = verifyWave2Export(REPOSITORY_ROOT, {
    outDir: options.outDir ? path.resolve(options.outDir) : path.join(REPOSITORY_ROOT, 'out'),
    variant: options.variant
  });
  console.log(`[verify-technical-wave2] export-verified (${options.variant})`);
  console.log(`WAVE2_RESULT=${JSON.stringify(result)}`);
  return result;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[verify-technical-wave2] ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { main, parseArgs };
