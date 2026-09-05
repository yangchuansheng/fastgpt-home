#!/usr/bin/env node

/** Bind an approved candidate to the trusted controller checkout without a self-referential SHA. */

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');

function verifyReleaseSource(sourceRevision, controllerRevision, cwd = process.cwd()) {
  for (const revision of [sourceRevision, controllerRevision]) {
    assert.match(revision || '', /^[a-f0-9]{40}$/, 'Release revisions must be full commit SHAs');
  }
  const git = (args) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  assert.equal(git(['rev-parse', 'HEAD']), controllerRevision, 'Trusted controller checkout drift');
  assert.equal(git(['rev-parse', `${sourceRevision}^{commit}`]), sourceRevision);
  git(['merge-base', '--is-ancestor', sourceRevision, controllerRevision]);
}

if (require.main === module) {
  try {
    const [sourceRevision, controllerRevision, ...extra] = process.argv.slice(2);
    assert.equal(extra.length, 0, 'Unexpected release source argument');
    verifyReleaseSource(sourceRevision, controllerRevision);
    console.log('[verify-release-source] Candidate belongs to the trusted controller history');
  } catch (error) {
    console.error(`[verify-release-source] ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { verifyReleaseSource };
