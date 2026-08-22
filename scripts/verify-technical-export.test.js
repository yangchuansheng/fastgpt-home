const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  getTechIdentities,
  writeCloudflareWorker,
  writeNginxRedirectMap
} = require('./lib/redirects');
const { verifyTechnicalExport } = require('./verify-technical-export');

const root = path.resolve(__dirname, '..');
const baseUrls = { cn: 'https://fastgpt.cn', io: 'https://fastgpt.io' };

test('technical identities are unique and retain their owner-relative paths', () => {
  const identities = getTechIdentities(root);
  assert.equal(identities.length, 1122);
  assert.equal(new Set(identities.map((identity) => identity.key)).size, identities.length);
  assert.equal(identities[0].sourcePath, '/zh/tutorial/private-deployment-topology');
  assert.equal(identities[0].canonicalPath, '/tutorial/private-deployment-topology');
});

test('technical export verifier accepts a complete China projection', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'technical-export-'));
  const outDir = path.join(tempRoot, 'out');
  const nextDir = path.join(tempRoot, '.next');
  fs.mkdirSync(outDir, { recursive: true });

  try {
    const identities = getTechIdentities(root);
    const sitemap = [];
    const redirects = new Map();
    for (const identity of identities) {
      const canonical = `${baseUrls.cn}${identity.canonicalPath}`;
      const routePath = path.join(outDir, `${identity.canonicalPath.slice(1)}.html`);
      fs.mkdirSync(path.dirname(routePath), { recursive: true });
      fs.writeFileSync(
        routePath,
        `<link rel="canonical" href="${canonical}"><meta name="robots" content="index, follow"><script>{"url":"${canonical}"}</script>`
      );
      sitemap.push(`<url><loc>${canonical}</loc></url>`);
      redirects.set(identity.sourcePath, canonical);
    }

    fs.writeFileSync(path.join(outDir, 'sitemap.xml'), `<urlset>${sitemap.join('')}</urlset>`);
    writeCloudflareWorker(outDir, new Map(), false);
    writeNginxRedirectMap(nextDir, redirects);

    assert.deepEqual(
      verifyTechnicalExport({
        outDir,
        nextDir,
        variant: 'cn',
        env: {
          NEXT_PUBLIC_CN_HOME_URL: baseUrls.cn,
          NEXT_PUBLIC_IO_HOME_URL: baseUrls.io
        }
      }),
      { count: 1122, variant: 'cn' }
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
