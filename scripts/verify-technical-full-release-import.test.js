const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { validateImportedProjection } = require('./verify-technical-full-release-import');
const { buildSearchProjection } = require('./import-technical-content');
const { sha256, stableJson } = require('./lib/technical-authority');
const { FULL_RELEASE_RELATIVE_PATH } = require('./lib/technical-full-release');
const {
  MANIFEST_PATH,
  REGISTRY_PATH,
  ZH_SEARCH_PATH,
  EN_SEARCH_PATH
} = require('./import-technical-full-release');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));

test('import verification allows registry reordering and preserves exact identity and body coverage', async (t) => {
  for (const mutation of [
    'none',
    'reorder',
    'duplicate-manifest',
    'duplicate-registry',
    'missing-body',
    'changed-body',
    'bad-search'
  ]) {
    await t.test(mutation, () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'import-coverage-'));
      const write = (relativePath, bytes) => {
        const target = path.join(root, relativePath);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, bytes);
      };
      try {
        const closure = read(FULL_RELEASE_RELATIVE_PATH);
        const manifest = read(MANIFEST_PATH);
        const allEntries = read(REGISTRY_PATH);
        const entries = [
          allEntries[0],
          ...allEntries.slice(closure.counts.baseline, closure.counts.baseline + 2)
        ];
        closure.records = closure.records.slice(0, 2);
        closure.counts = { baseline: 1, pending: 2, target: 3 };
        closure.baseline.registrySha256 = sha256(stableJson(entries.slice(0, 1)));
        const closureBytes = stableJson(closure);
        write(FULL_RELEASE_RELATIVE_PATH, closureBytes);
        manifest.closure.sha256 = sha256(closureBytes);
        manifest.pages = manifest.pages.slice(0, 2);
        manifest.counts = { baseline: 1, imported: 2, total: 3, zh: 3, en: 0 };
        for (const page of manifest.pages) {
          write(page.readerPath, fs.readFileSync(path.join(ROOT, page.readerPath)));
        }
        if (mutation === 'reorder') [entries[1], entries[2]] = [entries[2], entries[1]];
        if (mutation === 'duplicate-manifest') manifest.pages[1] = manifest.pages[0];
        if (mutation === 'missing-body')
          fs.unlinkSync(path.join(root, manifest.pages[1].readerPath));
        if (mutation === 'changed-body')
          fs.appendFileSync(path.join(root, manifest.pages[1].readerPath), '\nChanged content.\n');
        write(MANIFEST_PATH, stableJson(manifest));
        const search = buildSearchProjection(entries);
        write(
          ZH_SEARCH_PATH,
          stableJson(
            mutation === 'bad-search' ? [] : search.filter((entry) => entry.locale === 'zh')
          )
        );
        write(EN_SEARCH_PATH, stableJson(search.filter((entry) => entry.locale === 'en')));
        if (mutation === 'duplicate-registry') entries[2] = entries[1];
        if (mutation === 'none' || mutation === 'reorder') {
          assert.equal(validateImportedProjection(root, closure, entries), true);
        } else {
          assert.throws(() => validateImportedProjection(root, closure, entries));
        }
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
  }
});
