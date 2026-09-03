#!/usr/bin/env node

/** Generate the deterministic Week05/Week06 full-release identity closure. */

const path = require('node:path');
const {
  addSourceEvidence,
  buildClosure,
  extractSourceRootArgs,
  verifySourceRecords,
  writeClosureArtifact
} = require('./lib/technical-full-release');

const ROOT = path.resolve(__dirname, '..');

function parseArgs(argv = process.argv.slice(2)) {
  const { options, remaining } = extractSourceRootArgs(argv);
  options.mode = null;
  for (const token of remaining) {
    if (token === '--write' || token === '--check') {
      if (options.mode) throw new Error('Choose one of --write or --check');
      options.mode = token.slice(2);
    } else {
      throw new Error(`Unknown option: ${token}`);
    }
  }
  if (!options.mode) throw new Error('Choose --write or --check');
  return options;
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const closure = buildClosure(ROOT);
  const sourceVerification = verifySourceRecords(closure.records, options);
  addSourceEvidence(closure, sourceVerification);
  if (options.mode === 'check') {
    if (closure.status === 'blocked') {
      throw new Error(`closure blocked: ${JSON.stringify(closure.evidence)}`);
    }
    console.log(
      `[generate-technical-full-release] deterministic closure checked: baseline=${closure.counts.baseline} pending=${closure.counts.pending} target=${closure.counts.target} sourceMode=${sourceVerification.mode}`
    );
    return { closure, sourceVerification };
  }
  const filePath = writeClosureArtifact(ROOT, closure);
  if (closure.status === 'blocked') {
    throw new Error(
      `blocked evidence written to ${path.relative(ROOT, filePath)}: ${JSON.stringify(
        closure.evidence
      )}`
    );
  }
  console.log(
    `[generate-technical-full-release] written: ${path.relative(ROOT, filePath)} records=${
      closure.records.length
    } sourceVerified=${sourceVerification.verified}`
  );
  return { closure, sourceVerification, filePath };
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[generate-technical-full-release] ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { main, parseArgs };
