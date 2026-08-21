import type { TechCategory } from './types';

export const CATEGORY_DEFINITIONS: ReadonlyArray<{
  key: TechCategory;
  icon: string;
}> = [
  { key: 'tutorial', icon: '◎' },
  { key: 'deploy', icon: '▰' },
  { key: 'troubleshoot', icon: '◇' },
  { key: 'dataset', icon: '◉' },
  { key: 'node', icon: '⌘' },
  { key: 'integration', icon: '↗' },
  { key: 'api', icon: '{ }' },
  { key: 'reference', icon: '⌁' }
];

export const COMMON_TOPICS = [
  'Docker',
  '版本升级',
  '私有部署',
  '工作流',
  '知识库',
  'RAG',
  'API',
  'MCP',
  '插件',
  '模型配置'
];

export const PAGE_SIZE = 12;
