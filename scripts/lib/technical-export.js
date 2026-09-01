const fs = require('node:fs');
const path = require('node:path');

function resolveStaticHtml(outDir, route) {
  const relative = route.replace(/^\/+|\/+$/g, '');
  return [path.join(outDir, `${relative}.html`), path.join(outDir, relative, 'index.html')].find(
    (filePath) => fs.existsSync(filePath)
  );
}

function readSitemapUrls(outDir) {
  const sitemapPath = path.join(outDir, 'sitemap.xml');
  if (!fs.existsSync(sitemapPath)) return [];
  return [...fs.readFileSync(sitemapPath, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map(
    (match) => match[1]
  );
}

module.exports = { readSitemapUrls, resolveStaticHtml };
