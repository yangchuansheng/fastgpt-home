import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { BlogHubRoute } from '@/components/blog/BlogHubRoute';
import { getBlogHubMetadata } from '@/lib/blogSeo';
import { isPreviewSite } from '@/lib/siteRouting';

export default async function LocalizedBlogHubPage({
  params
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isPreviewSite || lang !== 'zh') notFound();
  return <BlogHubRoute includeDrafts />;
}

export function generateStaticParams() {
  return [{ lang: 'zh' }];
}

export const dynamicParams = false;

export async function generateMetadata({
  params
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  return lang === 'zh' && isPreviewSite
    ? getBlogHubMetadata(false)
    : { title: 'Blog hub not found', robots: { index: false, follow: false } };
}
