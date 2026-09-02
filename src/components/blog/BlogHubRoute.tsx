import { BreadcrumbJsonLd, JsonLdScript } from '@/components/JsonLd';
import BlogHubPage, { BLOG_HUB_COPY } from '@/components/blog/BlogHubPage';
import Footer from '@/components/home/Footer';
import HomeThemeFix from '@/components/home/HomeThemeFix';
import Navbar from '@/components/home/Navbar';
import { blogEntries, publishedBlogEntries } from '@/content/blog/registry';
import { getBlogCanonicalUrl } from '@/lib/blogSeo';
import { getDictionary } from '@/lib/i18n';
import { getOwnedLocaleUrl, isPreviewSite } from '@/lib/siteRouting';

const blogLocales = ['zh'] as const;

export async function BlogHubRoute({ includeDrafts }: { includeDrafts: boolean }) {
  const entries = includeDrafts ? blogEntries : publishedBlogEntries;
  const dict = await getDictionary('zh');
  const canonical = getBlogCanonicalUrl();

  return (
    <div className="home overflow-x-hidden blog-hub-page-shell">
      <BreadcrumbJsonLd
        items={[
          { name: BLOG_HUB_COPY.breadcrumbHome, url: getOwnedLocaleUrl('zh') },
          { name: BLOG_HUB_COPY.breadcrumbBlog, url: canonical }
        ]}
      />
      <JsonLdScript
        data={{
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'CollectionPage',
              '@id': `${canonical}#webpage`,
              url: canonical,
              name: BLOG_HUB_COPY.heading,
              description: BLOG_HUB_COPY.description,
              inLanguage: 'zh-CN',
              isPartOf: {
                '@type': 'WebSite',
                name: dict.JsonLd.siteName,
                url: new URL(canonical).origin
              },
              mainEntity: { '@id': `${canonical}#item-list` }
            },
            {
              '@type': 'ItemList',
              '@id': `${canonical}#item-list`,
              itemListElement: entries.map((entry, index) => ({
                '@type': 'ListItem',
                position: index + 1,
                name: entry.title,
                url: getBlogCanonicalUrl(entry.slug)
              }))
            }
          ]
        }}
      />
      <HomeThemeFix />
      <Navbar
        links={dict.links}
        t={dict.Home.navCta}
        locale="zh"
        publishedLocales={blogLocales}
        reviewLocalePaths={isPreviewSite}
      />
      <BlogHubPage entries={entries} />
      <Footer t={dict.Home.footer} locale="zh" />
    </div>
  );
}
