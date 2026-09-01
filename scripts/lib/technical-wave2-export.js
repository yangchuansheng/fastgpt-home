const fs = require('node:fs');
const path = require('node:path');
const { readSitemapUrls, resolveStaticHtml } = require('./technical-export');
const { getProductionBaseUrls } = require('./site-variant');

const PROJECTION_RELATIVE_PATH = 'src/content/tech-center/authority/week05-wave2-projection.json';

function verifyTechnicalWave2Export(repoRoot, { outDir, variant = 'cn' } = {}, verifySource) {
  if (!outDir) throw new Error('Wave 2 export verification requires --out-dir');
  if (!['cn', 'io', 'preview'].includes(variant)) {
    throw new Error(`Unsupported Wave 2 export variant: ${variant}`);
  }
  const source = verifySource(repoRoot);
  const projection = JSON.parse(
    fs.readFileSync(path.join(repoRoot, PROJECTION_RELATIVE_PATH), 'utf8')
  );
  const baseUrls = getProductionBaseUrls();
  const canonicalHost = baseUrls.cn;
  const sitemapUrls = readSitemapUrls(outDir);
  for (const identity of projection.identities) {
    const canonical = `${canonicalHost}${identity.canonicalPath}`;
    const reviewRoute = identity.slug;
    if (variant === 'io') {
      if (
        resolveStaticHtml(outDir, identity.canonicalPath) ||
        resolveStaticHtml(outDir, reviewRoute)
      ) {
        throw new Error(`IO export contains Wave 2 route: ${identity.canonicalPath}`);
      }
      if (sitemapUrls.includes(canonical) || sitemapUrls.includes(`${baseUrls.io}${reviewRoute}`)) {
        throw new Error(`IO sitemap contains Wave 2 route: ${identity.canonicalPath}`);
      }
      continue;
    }
    const route = variant === 'preview' ? reviewRoute : identity.canonicalPath;
    const htmlPath = resolveStaticHtml(outDir, route);
    if (!htmlPath) throw new Error(`Missing Wave 2 ${variant} HTML: ${route}`);
    const html = fs.readFileSync(htmlPath, 'utf8');
    const canonicalTags = html.match(/<link\b[^>]*\brel=["']canonical["'][^>]*>/gi) || [];
    if (canonicalTags.length !== 1 || !canonicalTags[0].includes(`href="${canonical}"`)) {
      throw new Error(`Wave 2 ${variant} canonical drift: ${route}`);
    }
    const robotsTag = html.match(/<meta\b[^>]*\bname=["']robots["'][^>]*>/i)?.[0] || '';
    const expectedRobots = variant === 'preview' ? 'noindex, nofollow' : 'index, follow';
    if (!robotsTag.includes(`content="${expectedRobots}"`)) {
      throw new Error(`Wave 2 ${variant} robots drift: ${route}`);
    }
    if (!html.includes(`"url":"${canonical}"`)) {
      throw new Error(`Wave 2 ${variant} structured data drift: ${route}`);
    }
    if (!html.includes('FastGPT maintainer source')) {
      throw new Error(`Wave 2 citation missing in export: ${route}`);
    }
    if (variant === 'cn') {
      if (sitemapUrls.filter((url) => url === canonical).length !== 1) {
        throw new Error(`Wave 2 sitemap membership drift: ${identity.canonicalPath}`);
      }
      if (resolveStaticHtml(outDir, reviewRoute)) {
        throw new Error(`CN export contains Wave 2 review route: ${reviewRoute}`);
      }
    }
  }
  if (variant === 'preview' && sitemapUrls.length) {
    throw new Error('Preview export contains a production sitemap');
  }
  return { ...source, exportVerified: true, releaseEligible: true, variant };
}

module.exports = { verifyTechnicalWave2Export };
