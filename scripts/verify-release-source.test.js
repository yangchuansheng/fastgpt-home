const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { verifyReleaseSource } = require('./verify-release-source');

test('approval commits can follow the candidate while unrelated or moved sources fail closed', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'release-source-'));
  const git = (...args) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const commit = (message) => {
    git(
      '-c',
      'user.name=Release test',
      '-c',
      'user.email=release@example.test',
      'commit',
      '--allow-empty',
      '-m',
      message
    );
    return git('rev-parse', 'HEAD');
  };
  try {
    git('init', '--initial-branch=main');
    const candidate = commit('Build candidate A');
    const controller = commit('Approve candidate A');
    assert.doesNotThrow(() => verifyReleaseSource(candidate, controller, cwd));
    assert.doesNotThrow(() => verifyReleaseSource(controller, controller, cwd));
    assert.throws(() => verifyReleaseSource(candidate, candidate, cwd), /checkout drift/);
    assert.throws(() => verifyReleaseSource('main', controller, cwd), /full commit SHAs/);
    git('checkout', '--orphan', 'unrelated');
    const unrelated = commit('Untrusted candidate');
    git('checkout', 'main');
    assert.throws(() => verifyReleaseSource(unrelated, controller, cwd));
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
