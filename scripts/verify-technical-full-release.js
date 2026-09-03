#!/usr/bin/env node

/** Verify the frozen Week05/Week06 technical full-release identity closure. */

const path = require('node:path');
const {
  extractSourceRootArgs,
  verifyTechnicalFullRelease
} = require('./lib/technical-full-release');

const ROOT = path.resolve(__dirname, '..');

function parseArgs(argv = process.argv.slice(2)) {
  const { options, remaining } = extractSourceRootArgs(argv);
  if (remaining.length) throw new Error(`Unknown option: ${remaining[0]}`);
  return options;
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const result = verifyTechnicalFullRelease(ROOT, options);
  console.log(
    `[verify-technical-full-release] closure passed: baseline=${result.baseline} W5=${result.W5.pending} W6=${result.W6.pending} pending=${result.pending} target=${result.target} sourceMode=${result.sourceVerification.mode} sourceRecorded=${result.sourceVerification.recorded} sourceByteVerified=${result.sourceVerification.verified}`
  );
  console.log(`TECHNICAL_FULL_RELEASE_RESULT=${JSON.stringify(result)}`);
  return result;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[verify-technical-full-release] ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { main, parseArgs };
