const assert = require('node:assert/strict');
const test = require('node:test');
const inventory = require('../docs/plans/week08/inventory.json');
const { verifyInventory } = require('./verify-week08-handoff');

test('Week08 handoff preserves the complete page and backlink boundary', () => {
  assert.deepEqual(verifyInventory(inventory), { pages: 38, backlinks: 797 });
});

test('rejects duplicate identities, invented locales, wrong owners and changed bodies', () => {
  for (const mutate of [
    (data) => { data.pages[1] = data.pages[0]; },
    (data) => { data.pages[0].publishedLocales = ['en', 'zh']; },
    (data) => { data.pages[0].url = data.pages[0].url.replace('.cn', '.io'); },
    (data) => {
      for (const page of data.pages.filter((item) => item.kind === 'reference')) {
        page.canonicalPath = page.canonicalPath.replace('/reference/', '/guide/');
        page.url = page.url.replace('/reference/', '/guide/');
        page.destination = page.destination.replace('/reference/', '/guide/');
      }
    },
    (data) => { data.backlinks[1] = data.backlinks[0]; },
    (data) => { data.backlinks[0].sourceSha256 = '0'.repeat(64); },
    (data) => { data.backlinks[0].targetPath = '/guide/missing'; },
    (data) => { data.backlinks[0].sourceFile = '../outside.md'; }
  ]) {
    const changed = structuredClone(inventory);
    mutate(changed);
    assert.throws(() => verifyInventory(changed));
  }
});
