const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  CUSTOMER_HTTP_KIND,
  CUSTOMER_HTTP_SCHEMA_VERSION,
  runCustomerMigrationHttpContract
} = require('./customer-migration-http');
const { readCustomerMigrationAuthority } = require('./customer-migration');

const ROOT = path.resolve(__dirname, '../..');

test('customer HTTP contract checks every source class and terminal route', async () => {
  const authority = readCustomerMigrationAuthority(ROOT);
  const contract = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, 'scripts/fixtures/customer-migration-http-contract.json'),
      'utf8'
    )
  );
  const sitemap = authority.routeAuthority.paths
    .map((routePath) => `<url><loc>https://terminal.example.com${routePath}</loc></url>`)
    .join('');
  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (input) => {
    const url = new URL(input);
    calls.push(url.href);
    if (url.pathname === '/sitemap.xml') return new Response(`<urlset>${sitemap}</urlset>`);
    if (url.hostname === 'legacy.example.com') {
      const source = authority.records.find((record) => record.sourcePath === url.pathname);
      assert(source, `unexpected source request: ${url.pathname}`);
      return new Response('', {
        status: 301,
        headers: { location: `https://terminal.example.com${source.targetPath}${url.search}` }
      });
    }
    assert.equal(url.hostname, 'terminal.example.com');
    return new Response(
      `<link rel="canonical" href="https://terminal.example.com${url.pathname}">`,
      { status: 200 }
    );
  };
  contract.kind = CUSTOMER_HTTP_KIND;
  contract.schemaVersion = CUSTOMER_HTTP_SCHEMA_VERSION;
  contract.legacyOrigin = 'https://legacy.example.com';
  contract.terminalOrigin = 'https://terminal.example.com';
  try {
    const result = await runCustomerMigrationHttpContract({
      legacyTarget: 'https://legacy.example.com',
      terminalTarget: 'https://terminal.example.com',
      approvedLegacyTarget: 'https://legacy.example.com',
      approvedTerminalTarget: 'https://terminal.example.com',
      contract,
      rootDir: ROOT,
      concurrency: 4
    });
    assert.equal(result.status, 'passed');
    assert.equal(result.checks.length, 232);
    assert.equal(result.responses.length, 339);
    assert.deepEqual(
      Object.fromEntries(
        Object.entries(result.sourceClasses).map(([name, summary]) => [name, summary.sources])
      ),
      authority.sourceClassCounts
    );
    assert.equal(calls.length, 339);
  } finally {
    global.fetch = originalFetch;
  }
});
