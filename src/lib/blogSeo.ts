import type { Metadata } from 'next';

import type { BlogEntry } from '@/content/blog/registry';
import { getOwnedLocaleUrl, getReviewLocalePath } from '@/lib/siteRouting';

export const BLOG_LOCALE = 'zh' as const;

export function getBlogPath(slug?: string) {
  return slug ? `/blog/${slug}` : '/blog';
}

export function getBlogReviewPath(slug?: string) {
  return getReviewLocalePath(BLOG_LOCALE, getBlogPath(slug));
}

export function getBlogCanonicalUrl(slug?: string) {
  return getOwnedLocaleUrl(BLOG_LOCALE, getBlogPath(slug));
}

function getAlternates(slug?: string): Metadata['alternates'] {
  const canonical = getBlogCanonicalUrl(slug);
  return {
    canonical,
    languages: { 'zh-CN': canonical, 'x-default': canonical }
  };
}

export function getBlogHubMetadata(indexable: boolean): Metadata {
  const title = 'FastGPT Blog｜产品上新与技术干货';
  const description =
    '获取 FastGPT 产品上新、RAG 知识库、工作流与 Agent 技术干货，面向 AI 开发者与技术负责人提供可执行的实践内容。';
  return {
    title,
    description,
    alternates: getAlternates(),
    robots: { index: indexable, follow: indexable },
    openGraph: { type: 'website', url: getBlogCanonicalUrl(), title, description }
  };
}

export function getBlogArticleMetadata(entry: BlogEntry, indexable: boolean): Metadata {
  const canonical = getBlogCanonicalUrl(entry.slug);
  return {
    title: entry.metaTitle,
    description: entry.metaDescription,
    alternates: getAlternates(entry.slug),
    robots: { index: indexable, follow: indexable },
    openGraph: {
      type: 'article',
      url: canonical,
      title: entry.metaTitle,
      description: entry.metaDescription,
      publishedTime: entry.datePublished,
      modifiedTime: entry.dateModified,
      locale: 'zh_CN'
    }
  };
}
