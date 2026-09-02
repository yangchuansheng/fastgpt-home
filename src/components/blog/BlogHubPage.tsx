'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, X } from 'lucide-react';

import guideStyles from '@/components/guide/GuideHubPage.module.css';
import type { BlogCategory, BlogEntry } from '@/content/blog/registry';
import { getBlogReviewPath } from '@/lib/blogSeo';
import { getReviewLocalePath } from '@/lib/siteRouting';

type CategoryFilter = 'all' | BlogCategory;

const categoryLabels: Record<BlogCategory, string> = {
  'product-updates': '产品上新',
  'technical-insights': '技术干货'
};

const categoryFilters: { key: CategoryFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'product-updates', label: categoryLabels['product-updates'] },
  { key: 'technical-insights', label: categoryLabels['technical-insights'] }
];

export const BLOG_HUB_COPY = {
  breadcrumbHome: '首页',
  breadcrumbBlog: 'Blog',
  heading: 'FastGPT Blog',
  description: '追踪产品上新，获取 RAG、知识库、工作流与 Agent 的可执行技术实践。',
  featured: '精选内容',
  latest: '全部文章'
} as const;

function isCategory(value: string | null): value is BlogCategory {
  return value === 'product-updates' || value === 'technical-insights';
}

function formatDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return `${year}年${month}月${day}日`;
}

function EntryMeta({ entry }: { entry: BlogEntry }) {
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[var(--guide-muted)]">
      <span className="font-semibold text-[var(--guide-blue)]">
        {categoryLabels[entry.category]}
      </span>
      <time dateTime={entry.datePublished}>{formatDate(entry.datePublished)}</time>
      <span>{entry.minutes} 分钟阅读</span>
      {entry.status === 'draft' && <span>草稿预览</span>}
    </span>
  );
}

export default function BlogHubPage({ entries }: { entries: BlogEntry[] }) {
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [query, setQuery] = useState('');
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const params = new URLSearchParams(window.location.search);
      const requestedCategory = params.get('category');
      setCategory(isCategory(requestedCategory) ? requestedCategory : 'all');
      setQuery(params.get('q') || '');
      setInitialized(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!initialized) return;
    const params = new URLSearchParams(window.location.search);
    if (category === 'all') params.delete('category');
    else params.set('category', category);
    if (query.trim()) params.set('q', query.trim());
    else params.delete('q');
    const search = params.toString();
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${search ? `?${search}` : ''}`
    );
  }, [category, initialized, query]);

  const filteredEntries = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('zh-CN');
    return entries.filter(
      (entry) =>
        (category === 'all' || entry.category === category) &&
        (!term || `${entry.title} ${entry.summary}`.toLocaleLowerCase('zh-CN').includes(term))
    );
  }, [category, entries, query]);

  const featuredEntries = filteredEntries.slice(0, 4);

  return (
    <main className={guideStyles.page}>
      <div className={guideStyles.container}>
        <nav aria-label="面包屑" className={guideStyles.breadcrumb}>
          <ol>
            <li>
              <Link href={getReviewLocalePath('zh')}>{BLOG_HUB_COPY.breadcrumbHome}</Link>
            </li>
            <li aria-current="page">{BLOG_HUB_COPY.breadcrumbBlog}</li>
          </ol>
        </nav>

        <header className={guideStyles.hero}>
          <p className="!m-0 mb-5 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--guide-blue)]">
            Product / Engineering / AI
          </p>
          <h1>{BLOG_HUB_COPY.heading}</h1>
          <p>{BLOG_HUB_COPY.description}</p>
        </header>

        <section className="border-t border-[var(--guide-line)] pt-7" aria-label="文章筛选">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-2" role="group" aria-label="按分类筛选">
              {categoryFilters.map((filter) => {
                const active = filter.key === category;
                return (
                  <button
                    key={filter.key}
                    type="button"
                    aria-pressed={active}
                    className={`min-h-10 rounded-full border px-5 text-[13px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2459d6] ${
                      active
                        ? 'border-[#162033] bg-[#162033] text-white'
                        : 'border-[var(--guide-line)] bg-white text-[var(--guide-muted)] hover:border-[#2459d6] hover:text-[#2459d6]'
                    }`}
                    onClick={() => setCategory(filter.key)}
                  >
                    {filter.label}
                  </button>
                );
              })}
            </div>

            <label className="flex min-h-11 w-full items-center gap-2 border-b border-[var(--guide-line)] bg-white px-3 md:max-w-[340px]">
              <Search className="h-4 w-4 text-[var(--guide-muted)]" aria-hidden="true" />
              <span className="sr-only">搜索 Blog 文章</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索产品、RAG、知识库或 Agent"
                className="min-w-0 flex-1 bg-transparent py-2 text-[13px] text-[var(--guide-ink)] outline-none placeholder:text-[#8b95a5]"
              />
              {query && (
                <button
                  type="button"
                  className="rounded p-1 text-[var(--guide-muted)] hover:text-[var(--guide-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2459d6]"
                  onClick={() => setQuery('')}
                  aria-label="清除搜索"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </label>
          </div>
        </section>

        {featuredEntries.length > 0 && (
          <section className="mt-16" aria-labelledby="blog-featured-title">
            <div className="mb-6 flex items-baseline justify-between gap-4">
              <h2
                id="blog-featured-title"
                className="m-0 text-[clamp(1.7rem,3vw,2.55rem)] font-semibold tracking-[-0.045em] text-[var(--guide-ink)]"
              >
                {BLOG_HUB_COPY.featured}
              </h2>
              <span className="font-mono text-[11px] font-bold tracking-[0.08em] text-[var(--guide-muted)]">
                {filteredEntries.length} 篇
              </span>
            </div>
            <ul className={guideStyles.cardGrid}>
              {featuredEntries.map((entry, index) => (
                <li
                  className={
                    index === 0 ||
                    (featuredEntries.length % 2 === 0 && index === featuredEntries.length - 1)
                      ? guideStyles.featuredCardItem
                      : undefined
                  }
                  key={entry.slug}
                >
                  <Link
                    className={`${guideStyles.card}${
                      index === 0 ? ` ${guideStyles.featuredCard}` : ''
                    }`}
                    href={getBlogReviewPath(entry.slug)}
                  >
                    <EntryMeta entry={entry} />
                    <div>
                      <h3>{entry.title}</h3>
                      <p>{entry.summary}</p>
                    </div>
                    <span className={guideStyles.cardAction}>
                      阅读文章
                      <span aria-hidden="true">↗</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section
          className="mt-20 border-t border-[var(--guide-line)] pt-10"
          aria-labelledby="blog-list-title"
        >
          <div className="mb-6 flex items-baseline justify-between gap-4">
            <h2
              id="blog-list-title"
              className="m-0 text-[clamp(1.7rem,3vw,2.55rem)] font-semibold tracking-[-0.045em] text-[var(--guide-ink)]"
            >
              {BLOG_HUB_COPY.latest}
            </h2>
            <p className="m-0 text-[12px] text-[var(--guide-muted)]" aria-live="polite">
              共 {filteredEntries.length} 篇
            </p>
          </div>

          {filteredEntries.length > 0 ? (
            <ul className="m-0 list-none divide-y divide-[var(--guide-line)] border-y border-[var(--guide-line)] p-0">
              {filteredEntries.map((entry, index) => (
                <li key={entry.slug}>
                  <Link
                    href={getBlogReviewPath(entry.slug)}
                    className="group grid gap-4 bg-white px-4 py-7 text-[var(--guide-ink)] no-underline transition-colors hover:bg-[#f7f9ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2459d6] md:grid-cols-[54px_minmax(0,1fr)_auto] md:items-center md:px-6"
                  >
                    <span className="font-mono text-[11px] font-bold tracking-[0.1em] text-[#8b95a5]">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span>
                      <EntryMeta entry={entry} />
                      <strong className="mt-2 block text-[clamp(1.15rem,2vw,1.5rem)] font-semibold leading-tight tracking-[-0.025em]">
                        {entry.title}
                      </strong>
                    </span>
                    <span
                      className="text-xl text-[var(--guide-blue)] transition-transform group-hover:translate-x-1"
                      aria-hidden="true"
                    >
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="border border-[var(--guide-line)] bg-white px-6 py-14 text-center">
              <h3 className="m-0 text-xl font-semibold text-[var(--guide-ink)]">
                换个关键词继续搜索
              </h3>
              <p className="mt-3 text-sm text-[var(--guide-muted)]">
                试试“RAG”“知识库”“工作流”或选择其他分类。
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
