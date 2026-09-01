#!/usr/bin/env node

/** Report the retained Week06 Wave 1 production, search, and expansion gate. */

const path = require('node:path');
const {
  evaluateWeek06Wave1Observation,
  readWeek06Wave1Observation
} = require('./lib/week06-wave1-observation');

const ROOT = path.resolve(__dirname, '..');

function main() {
  const result = evaluateWeek06Wave1Observation(readWeek06Wave1Observation(ROOT), ROOT);
  console.log(`WEEK06_WAVE1_OBSERVATION_RESULT=${JSON.stringify(result)}`);
  if (result.blockers.length) {
    throw new Error(result.blockers.map(({ code }) => code).join(', '));
  }
  console.log('[verify-week06-wave1-observation] passed');
  return result;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[verify-week06-wave1-observation] blocked: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { main };
