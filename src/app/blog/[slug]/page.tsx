import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { BlogArticleRoute } from '@/components/blog/BlogArticleRoute';
import { getBlogEntry, isBlogProductionReady, publishedBlogEntries } from '@/content/blog/registry';
import { getBlogArticleMetadata } from '@/lib/blogSeo';
import { currentSiteVariant } from '@/lib/siteRouting';

const isPublishedSurface = currentSiteVariant === 'cn' && isBlogProductionReady;

export default async function BlogArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isPublishedSurface || !getBlogEntry(slug)) notFound();
  return <BlogArticleRoute slug={slug} includeDrafts={false} />;
}

export function generateStaticParams() {
  return isPublishedSurface
    ? publishedBlogEntries.map(({ slug }) => ({ slug }))
    : [{ slug: 'blog-unavailable' }];
}

export const dynamicParams = false;

export async function generateMetadata({
  params
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const entry = isPublishedSurface ? getBlogEntry(slug) : undefined;
  return entry
    ? getBlogArticleMetadata(entry, true)
    : { title: 'Blog article not found', robots: { index: false, follow: false } };
}
