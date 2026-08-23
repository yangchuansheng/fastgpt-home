import {
  getTechnicalPageIdentity,
  type TechnicalPageIdentity,
  type TechEntry
} from '@/components/tech-center/types';
import {
  currentSiteVariant,
  getLocaleOwner,
  getOwnedLocaleUrl,
  type SiteVariant
} from '@/lib/siteRouting';

export type { TechnicalPageIdentity } from '@/components/tech-center/types';
export { getTechnicalPageIdentity } from '@/components/tech-center/types';

/** Return the production URL owned by the page's locale. */
export function getTechnicalCanonicalUrl(entry: Pick<TechEntry, 'slug'>) {
  const identity = getTechnicalPageIdentity(entry);
  return getOwnedLocaleUrl(identity.locale, identity.canonicalPath);
}

/** Return the sitemap URL only when the current Site Variant owns the page. */
export function getTechnicalSitemapUrl(
  entry: Pick<TechEntry, 'slug'>,
  variant: SiteVariant = currentSiteVariant
) {
  const identity = getTechnicalPageIdentity(entry);
  return variant !== 'preview' && getLocaleOwner(identity.locale) === variant
    ? getTechnicalCanonicalUrl(entry)
    : null;
}
