import entries from './entries.json';
import policy from '@/lib/technical-content-policy.json';
import { CATEGORY_DEFINITIONS } from './constants';
import type { CategoryMeta, TechEntry } from './types';

export type {
  CategoryMeta,
  TechCategory,
  TechCategoryKey,
  TechEntry,
  TechSearchEntry,
  TechSource,
  TechnicalPageIdentity
} from './types';
export { COMMON_TOPICS, PAGE_SIZE } from './constants';

export const TECH_ENTRIES = entries as TechEntry[];

export { getTechEntryPath, getTechnicalPageIdentity } from './types';

export const FEATURED_ENTRY =
  TECH_ENTRIES.find((entry) => entry.slug === '/zh/api/fastgpt-chat-api-guide') || TECH_ENTRIES[0]!;

export const CATEGORY_META: CategoryMeta[] = CATEGORY_DEFINITIONS.map(({ key, icon }) => ({
  key,
  label: policy.categories[key],
  icon,
  count: TECH_ENTRIES.filter((entry) => entry.category === key).length
}));
