import {
  getTechnicalPageIdentity,
  type TechnicalPageIdentity,
  type TechEntry
} from '@/components/tech-center/types';
import { normalizeLocale } from '@/lib/locales';
import {
  currentSiteVariant,
  getLocaleOwner,
  getOwnedLocalePath,
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

/** Keep locale-prefixed review routes in Preview and owner-relative routes in production. */
export function getTechnicalReviewPath(locale: string, path: string) {
  const normalizedLocale = normalizeLocale(locale);
  const ownedPath = getOwnedLocalePath(normalizedLocale, path);
  return currentSiteVariant === 'preview'
    ? `/${normalizedLocale}${ownedPath === '/' ? '' : ownedPath}`
    : ownedPath;
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
