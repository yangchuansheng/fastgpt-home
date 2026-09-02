import registry from './registry.json';

export const BLOG_CATEGORIES = ['product-updates', 'technical-insights'] as const;
export type BlogCategory = (typeof BLOG_CATEGORIES)[number];
export type BlogStatus = 'draft' | 'published';

export type BlogEntry = {
  slug: string;
  sourceName: string;
  status: BlogStatus;
  category: BlogCategory;
  title: string;
  summary: string;
  metaTitle: string;
  metaDescription: string;
  datePublished: string;
  dateModified: string;
  minutes: number;
};

export const BLOG_CATEGORY_LABELS: Record<BlogCategory, string> = {
  'product-updates': '产品上新',
  'technical-insights': '技术干货'
};

function fail(message: string): never {
  throw new Error(`Blog registry: ${message}`);
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function validateRegistry(value: unknown): asserts value is { entries: BlogEntry[] } {
  if (
    !value ||
    typeof value !== 'object' ||
    !Array.isArray((value as { entries?: unknown }).entries)
  ) {
    fail('missing entries');
  }

  const slugs = new Set<string>();
  for (const entry of (value as { entries: unknown[] }).entries) {
    if (!entry || typeof entry !== 'object') fail('invalid entry');
    const record = entry as Record<string, unknown>;
    const slug = record.slug;
    if (typeof slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      fail('slug must be lower-case kebab-case');
    }
    if (slugs.has(slug)) fail(`${slug}: duplicate slug`);
    slugs.add(slug);
    if (record.sourceName !== `${slug}.md`) fail(`${slug}: invalid sourceName`);
    if (!['draft', 'published'].includes(String(record.status))) fail(`${slug}: invalid status`);
    if (!BLOG_CATEGORIES.includes(record.category as BlogCategory))
      fail(`${slug}: invalid category`);
    for (const field of ['title', 'summary', 'metaTitle', 'metaDescription']) {
      if (typeof record[field] !== 'string' || !record[field].trim())
        fail(`${slug}: invalid ${field}`);
    }
    if (!isIsoDate(record.datePublished) || !isIsoDate(record.dateModified)) {
      fail(`${slug}: invalid publication date`);
    }
    if (record.dateModified < record.datePublished)
      fail(`${slug}: dateModified precedes datePublished`);
    if (!Number.isInteger(record.minutes) || Number(record.minutes) < 1) {
      fail(`${slug}: minutes must be a positive integer`);
    }
  }
}

validateRegistry(registry);

export const blogEntries = [...registry.entries].sort(
  (first, second) =>
    second.datePublished.localeCompare(first.datePublished) || first.slug.localeCompare(second.slug)
);
export const publishedBlogEntries = blogEntries.filter((entry) => entry.status === 'published');
export const isBlogProductionReady = BLOG_CATEGORIES.every((category) =>
  publishedBlogEntries.some((entry) => entry.category === category)
);

export function getBlogEntry(slug: string, includeDrafts = false) {
  return blogEntries.find(
    (entry) => entry.slug === slug && (includeDrafts || entry.status === 'published')
  );
}
