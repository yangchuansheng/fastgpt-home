import { notFound } from 'next/navigation';

import { ArticleJsonLd, BreadcrumbJsonLd } from '@/components/JsonLd';
import BlogArticlePage from '@/components/blog/BlogArticlePage';
import Footer from '@/components/home/Footer';
import HomeThemeFix from '@/components/home/HomeThemeFix';
import Navbar from '@/components/home/Navbar';
import { getBlogEntry } from '@/content/blog/registry';
import { readBlogDocument } from '@/lib/blogContent';
import { getBlogCanonicalUrl } from '@/lib/blogSeo';
import { getDictionary } from '@/lib/i18n';
import { getOwnedLocaleUrl, isPreviewSite } from '@/lib/siteRouting';

const blogLocales = ['zh'] as const;

export async function BlogArticleRoute({
  slug,
  includeDrafts
}: {
  slug: string;
  includeDrafts: boolean;
}) {
  const entry = getBlogEntry(slug, includeDrafts);
  if (!entry) notFound();

  const document = readBlogDocument(slug, includeDrafts);
  const dict = await getDictionary('zh');
  const canonical = getBlogCanonicalUrl(slug);

  return (
    <div className="home blog-article-page">
      <BreadcrumbJsonLd
        items={[
          { name: '首页', url: getOwnedLocaleUrl('zh') },
          { name: 'Blog', url: getBlogCanonicalUrl() },
          { name: entry.title, url: canonical }
        ]}
      />
      <ArticleJsonLd
        headline={entry.title}
        description={entry.metaDescription}
        url={canonical}
        inLanguage="zh-CN"
        datePublished={entry.datePublished}
        dateModified={entry.dateModified}
      />
      <HomeThemeFix />
      <Navbar
        links={dict.links}
        t={dict.Home.navCta}
        locale="zh"
        publishedLocales={blogLocales}
        reviewLocalePaths={isPreviewSite}
      />
      <BlogArticlePage
        document={document}
        cta={{
          eyebrow: dict.FAQ.sidebarEyebrow,
          title: dict.FAQ.sidebarTitle,
          description: dict.FAQ.sidebarDescription,
          consultLabel: '提交商务咨询',
          trialLabel: dict.FAQ.sidebarCta
        }}
      />
      <Footer t={dict.Home.footer} locale="zh" />
    </div>
  );
}
