#!/usr/bin/env node

/** Report the retained Week05 Wave 2 production and search observation gate. */

const path = require('node:path');
const {
  evaluateTechnicalWaveObservation,
  readTechnicalWaveObservation
} = require('./lib/technical-wave-observation');

const ROOT = path.resolve(__dirname, '..');

function main() {
  const result = evaluateTechnicalWaveObservation(readTechnicalWaveObservation(ROOT), ROOT);
  console.log(`TECHNICAL_WAVE_OBSERVATION_RESULT=${JSON.stringify(result)}`);
  if (result.blockers.length) {
    throw new Error(result.blockers.map(({ code }) => code).join(', '));
  }
  console.log('[verify-technical-wave-observation] passed');
  return result;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[verify-technical-wave-observation] blocked: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { main };
