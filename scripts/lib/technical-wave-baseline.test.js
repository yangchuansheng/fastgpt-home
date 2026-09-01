const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  BASELINE_RELATIVE_PATH,
  BASELINE_ROLLBACK_RELATIVE_PATH,
  loadTechnicalWaveState
} = require('./technical-wave-baseline');

const ROOT = path.resolve(__dirname, '../..');
const HISTORY_FILES = [
  BASELINE_RELATIVE_PATH,
  BASELINE_ROLLBACK_RELATIVE_PATH,
  'src/content/tech-center/authority/week05-wave1-projection.json',
  'src/content/tech-center/authority/week05-wave1-release-manifest.json',
  'src/content/tech-center/authority/week05-wave2-projection.json',
  'src/content/tech-center/authority/week05-wave2-release-manifest.json'
];

test('historical Technical wave states rebuild without current registries or future selections', () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'technical-wave-baseline-'));
  try {
    for (const relativePath of HISTORY_FILES) {
      const destination = path.join(temporaryRoot, relativePath);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(path.join(ROOT, relativePath), destination);
    }
    assert.equal(loadTechnicalWaveState(temporaryRoot, 'week05-wave0').entries.length, 1122);
    assert.equal(loadTechnicalWaveState(temporaryRoot, 'week05-wave1').entries.length, 1172);
    assert.equal(loadTechnicalWaveState(temporaryRoot, 'week05-wave2').entries.length, 1372);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
