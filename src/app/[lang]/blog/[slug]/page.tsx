import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { BlogArticleRoute } from '@/components/blog/BlogArticleRoute';
import { blogEntries, getBlogEntry } from '@/content/blog/registry';
import { getBlogArticleMetadata } from '@/lib/blogSeo';
import { isPreviewSite } from '@/lib/siteRouting';

export default async function LocalizedBlogArticlePage({
  params
}: {
  params: Promise<{ lang: string; slug: string }>;
}) {
  const { lang, slug } = await params;
  if (!isPreviewSite || lang !== 'zh' || !getBlogEntry(slug, true)) notFound();
  return <BlogArticleRoute slug={slug} includeDrafts />;
}

export function generateStaticParams() {
  return isPreviewSite
    ? blogEntries.map(({ slug }) => ({ lang: 'zh', slug }))
    : [{ lang: 'zh', slug: 'blog-unavailable' }];
}

export const dynamicParams = false;

export async function generateMetadata({
  params
}: {
  params: Promise<{ lang: string; slug: string }>;
}): Promise<Metadata> {
  const { lang, slug } = await params;
  const entry = lang === 'zh' && isPreviewSite ? getBlogEntry(slug, true) : undefined;
  return entry
    ? getBlogArticleMetadata(entry, false)
    : { title: 'Blog article not found', robots: { index: false, follow: false } };
}
