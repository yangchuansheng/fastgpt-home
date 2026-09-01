#!/usr/bin/env node

/** Verify the Week06 bilingual Technical Content Wave 1 source and export contracts. */

const path = require('node:path');
const {
  verifyWeek06Wave1Export,
  verifyWeek06Wave1ExportFixtures,
  verifyWeek06Wave1Live,
  verifyWeek06Wave1RollbackOnError,
  verifyWeek06Wave1Source
} = require('./lib/week06-technical-wave1');

const ROOT = path.resolve(__dirname, '..');

function parseArgs(argv = process.argv.slice(2)) {
  const options = { mode: 'source', outDir: null, variant: null, sourceRoot: null };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--export') {
      if (options.mode !== 'source') throw new Error('Choose one verification mode');
      options.mode = 'export';
    } else if (token === '--live') {
      if (options.mode !== 'source') throw new Error('Choose one verification mode');
      options.mode = 'live';
    } else if (
      token === '--fixtures' ||
      token === '--rollback-on-error' ||
      token === '--atomic-rollback'
    ) {
      if (options.mode !== 'source') throw new Error('Choose one verification mode');
      options.mode = token === '--fixtures' ? 'fixtures' : 'rollback';
    } else if (token === '--out-dir') {
      options.outDir = argv[++index];
      if (!options.outDir || options.outDir.startsWith('--')) {
        throw new Error('--out-dir requires a path');
      }
    } else if (token === '--variant') {
      options.variant = argv[++index];
      if (!['cn', 'io', 'preview'].includes(options.variant)) {
        throw new Error('--variant must be cn, io, or preview');
      }
    } else if (token === '--source-root') {
      options.sourceRoot = argv[++index];
      if (!options.sourceRoot || options.sourceRoot.startsWith('--')) {
        throw new Error('--source-root requires a path');
      }
    } else {
      throw new Error(`Unknown option: ${token}`);
    }
  }
  if (options.mode === 'export' && (!options.variant || !options.outDir)) {
    throw new Error('--export requires --variant and --out-dir');
  }
  if (options.mode !== 'export' && (options.variant || options.outDir)) {
    throw new Error('--variant and --out-dir require --export');
  }
  if (options.mode !== 'source' && options.sourceRoot) {
    throw new Error('--source-root requires source verification mode');
  }
  return options;
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  let result;
  if (options.mode === 'live') {
    result = await verifyWeek06Wave1Live(ROOT);
  } else if (options.mode === 'export') {
    result = verifyWeek06Wave1Export(ROOT, {
      outDir: path.resolve(ROOT, options.outDir),
      variant: options.variant
    });
  } else if (options.mode === 'fixtures') {
    result = verifyWeek06Wave1ExportFixtures(ROOT);
  } else if (options.mode === 'rollback') {
    result = verifyWeek06Wave1RollbackOnError(ROOT);
  } else {
    result = verifyWeek06Wave1Source(ROOT, {
      sourceRoot: options.sourceRoot ? path.resolve(ROOT, options.sourceRoot) : undefined
    });
  }
  if (options.mode === 'source') {
    console.log(
      `[verify-week06-wave1] passed: zh=${result.localeCounts.zh} en=${result.localeCounts.en} total=${result.publicationCount}`
    );
  } else {
    console.log(`[verify-week06-wave1] ${options.mode} passed`);
  }
  console.log(`WEEK06_WAVE1_RESULT=${JSON.stringify(result)}`);
  return result;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[verify-week06-wave1] ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { main, parseArgs };
