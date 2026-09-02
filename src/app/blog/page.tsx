import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { BlogHubRoute } from '@/components/blog/BlogHubRoute';
import { isBlogProductionReady } from '@/content/blog/registry';
import { getBlogHubMetadata } from '@/lib/blogSeo';
import { currentSiteVariant } from '@/lib/siteRouting';

const isPublishedSurface = currentSiteVariant === 'cn' && isBlogProductionReady;

export default async function BlogHubPage() {
  if (!isPublishedSurface) notFound();
  return <BlogHubRoute includeDrafts={false} />;
}

export function generateMetadata(): Metadata {
  return getBlogHubMetadata(isPublishedSurface);
}
