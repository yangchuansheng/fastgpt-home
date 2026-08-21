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
  title: string;
  slug: string;
  category: TechCategory;
  categoryLabel: string;
  sourceType: TechSource;
  summary: string;
  minutes: number;
};

export type TechEntry = TechSearchEntry & {
  source?: string;
};

export type CategoryMeta = {
  key: TechCategory;
  label: string;
  icon: string;
  count: number;
};

export function getTechEntryPath(entry: Pick<TechSearchEntry, 'slug'>) {
  return entry.slug.replace(/^\/zh(?=\/)/, '');
}
