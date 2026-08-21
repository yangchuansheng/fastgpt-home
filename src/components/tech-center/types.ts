export type TechCategoryKey =
  | 'all'
  | 'tutorial'
  | 'deploy'
  | 'troubleshoot'
  | 'dataset'
  | 'node'
  | 'integration'
  | 'api'
  | 'reference';

export type TechCategory = Exclude<TechCategoryKey, 'all'>;
export type TechSource = '官方文档' | 'GitHub issue' | '深度场景内容';

export type TechSearchEntry = {
  identity: string;
  title: string;
  description: string;
  category: TechCategory;
  locale: string;
  publicPath: string;
};

export type TechEntry = {
  title: string;
  slug: string;
  category: TechCategory;
  categoryLabel: string;
  source?: string;
  sourceType: TechSource;
  summary: string;
  minutes: number;
};

export type CategoryMeta = {
  key: TechCategory;
  label: string;
  icon: string;
  count: number;
};

function splitTechSlug(slug: string) {
  const match = slug.match(/^\/([^/]+)(\/.*)$/);
  if (!match) throw new Error(`Invalid technical page slug: ${slug}`);
  return { locale: match[1], publicPath: match[2] };
}

export function getTechEntryPath(entry: Pick<TechEntry, 'slug'>) {
  return splitTechSlug(entry.slug).publicPath;
}

export function toTechSearchEntry(
  entry: Pick<TechEntry, 'title' | 'slug' | 'category' | 'summary'>
): TechSearchEntry {
  const { locale, publicPath } = splitTechSlug(entry.slug);
  return {
    identity: `${locale}|${publicPath}`,
    title: entry.title,
    description: entry.summary,
    category: entry.category,
    locale,
    publicPath
  };
}
