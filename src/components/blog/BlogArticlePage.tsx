import Link from 'next/link';

import ContentSidebarCta, { type ContentSidebarCtaCopy } from '@/components/ContentSidebarCta';
import guideStyles from '@/components/guide/GuideArticlePage.module.css';
import MarkdownContent, { getMarkdownHeadings } from '@/components/tech-center/MarkdownContent';
import techStyles from '@/components/tech-center/TechArticlePage.module.css';
import { BLOG_CATEGORY_LABELS } from '@/content/blog/registry';
import type { BlogDocument } from '@/lib/blogContent';
import { getBlogReviewPath } from '@/lib/blogSeo';
import { parseMarkdown } from '@/lib/markdownParser';
import { getReviewLocalePath } from '@/lib/siteRouting';

function formatDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return `${year}年${month}月${day}日`;
}

export default function BlogArticlePage({
  document,
  cta
}: {
  document: BlogDocument;
  cta: ContentSidebarCtaCopy;
}) {
  const { entry, body } = document;
  const blocks = parseMarkdown(body, entry.title);
  const headings = getMarkdownHeadings(blocks, 'blog-section');

  return (
    <main className={`${techStyles.page} ${guideStyles.page}`}>
      <div className={`${techStyles.container} ${guideStyles.container}`}>
        <nav className={`${techStyles.breadcrumbs} ${guideStyles.breadcrumbs}`} aria-label="面包屑">
          <Link href={getReviewLocalePath('zh')}>首页</Link>
          <span aria-hidden="true">/</span>
          <Link href={getBlogReviewPath()}>Blog</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{entry.title}</span>
        </nav>

        <header className={`${techStyles.header} ${guideStyles.header}`}>
          <div className={techStyles.meta}>
            <span className={techStyles.badge}>{BLOG_CATEGORY_LABELS[entry.category]}</span>
            <time dateTime={entry.datePublished}>发布于 {formatDate(entry.datePublished)}</time>
            <span>{entry.minutes} 分钟阅读</span>
            {entry.status === 'draft' && <span>草稿预览</span>}
          </div>
          <h1>{entry.title}</h1>
          <p className={`${techStyles.summary} ${guideStyles.summary}`}>{entry.summary}</p>
          <time
            className={`${techStyles.updated} ${guideStyles.updated}`}
            dateTime={entry.dateModified}
          >
            更新于 {formatDate(entry.dateModified)}
          </time>
        </header>

        <div className={`${techStyles.layout} ${guideStyles.layout}`}>
          <article className={`${techStyles.article} ${guideStyles.article}`}>
            <MarkdownContent
              blocks={blocks}
              markdown={body}
              title={entry.title}
              headingIdPrefix="blog-section"
            />
            <nav aria-label="返回 Blog">
              <p className={techStyles.returnLink}>
                <Link href={getBlogReviewPath()}>返回 Blog</Link>
              </p>
            </nav>
          </article>

          <aside className={guideStyles.sidebar} aria-label={cta.title}>
            <ContentSidebarCta
              locale="zh"
              copy={cta}
              consultSource="blog_article_sidebar_consult"
              trialSource="blog_article_sidebar_trial"
              category={entry.category}
              slug={entry.slug}
            />
            {headings.length > 0 && (
              <nav className={guideStyles.toc} aria-label="本页内容">
                <p className={guideStyles.tocTitle}>本页内容</p>
                <ol>
                  {headings.map((heading) => (
                    <li
                      className={heading.level > 2 ? guideStyles.tocNested : undefined}
                      key={heading.id}
                    >
                      <a href={`#${heading.id}`}>{heading.text}</a>
                    </li>
                  ))}
                </ol>
              </nav>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}
