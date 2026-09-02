import 'server-only';

import fs from 'node:fs';
import path from 'node:path';

import { getBlogEntry, type BlogEntry } from '@/content/blog/registry';

const BLOG_ROOT = path.resolve(process.cwd(), 'src', 'content', 'blog', 'zh');

export type BlogDocument = {
  entry: BlogEntry;
  body: string;
};

export function readBlogDocument(slug: string, includeDrafts = false): BlogDocument {
  const entry = getBlogEntry(slug, includeDrafts);
  if (!entry) throw new Error(`Blog ${slug}: unknown slug`);

  const sourcePath = path.resolve(BLOG_ROOT, entry.sourceName);
  if (!sourcePath.startsWith(`${BLOG_ROOT}${path.sep}`)) {
    throw new Error(`Blog ${slug}: source escapes content root`);
  }

  const body = fs.readFileSync(sourcePath, 'utf8').replace(/\r\n?/g, '\n');
  const heading = body.match(/^# (.+)$/m)?.[1];
  if (heading !== entry.title) throw new Error(`Blog ${slug}: H1 differs from registry`);

  return { entry, body };
}
