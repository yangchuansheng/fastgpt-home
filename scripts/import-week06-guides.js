#!/usr/bin/env node
/** Import the approved Week06 Guide pair into the repository registry. */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const registryPath = path.join(root, 'src/content/guides/registry.json');
const guideRoot = path.join(root, 'src/content/guides');

const specs = [
  {
    slug: 'migrate-saas-to-selfhost',
    group: 'implementation',
    zh: '09-从SaaS智能体平台迁移至自建分四块拆解与单场景-V1.0-星触达-20260824.md',
    en: '09-EN-Migrating-Enterprise-AI-Agent-Platforms-V1.0-XstraStar-20260824.md',
    zhTitle: '从SaaS智能体平台迁移至自建的落地指南',
    zhDescription:
      '拆解SaaS智能体平台迁移至自建的四大核心工作量，介绍单场景试点适配性验证方法，助力企业科学规划并推进迁移相关工作，规避迁移风险，覆盖迁移全流程核心环节。',
    enTitle: 'SaaS-to-Self-Hosted Enterprise AI Agent Migration Guide',
    enDescription:
      'Plan enterprise SaaS-to-self-hosted AI agent migration across knowledge assets, workflows, integrations, security, validation, and phased rollout.',
    keywords: '平台迁移, 知识资产 / 工作流重建 / 效果回归',
    zhH1: '从SaaS智能体平台迁移至自建：分四块拆解与单场景试点策略',
    enH1: 'Migrating Enterprise AI Agent Platforms from SaaS to Self-Hosted Deployment',
    zhLinks: ['迁移指南', 'API 文档', '私有化页'],
    enLinks: ['Migration guide', 'API documentation', 'Self-hosted deployment'],
    schema: 'HowTo + Article + BreadcrumbList',
    references: [
      ['FastGPT self-hosted deployment documentation', 'https://doc.fastgpt.io/en/self-host/'],
      ['FastGPT API documentation', 'https://doc.fastgpt.io/en/api/'],
      ['FastGPT product guide', 'https://fastgpt.io/guide']
    ]
  },
  {
    slug: 'embed-ai-into-product',
    group: 'implementation',
    zh: '14-将AI能力嵌入自有产品接入方式与落地核心关注点-V1.0-星触达-20260824.md',
    en: '14-EN-Enterprise-AI-Integration-into-Native-Pr-V1.0-XstraStar-20260824.md',
    zhTitle: '将AI能力嵌入自有产品：接入方式与落地指南',
    zhDescription:
      '针对企业AI嵌入相关需求，详解主流AI嵌入方式、核心落地维度、落地验证方法、边界限制与常见误区，助力平稳完成AI集成落地，提升产品用户体验与业务价值。',
    enTitle: 'Enterprise AI Embedding Integration Guide for Teams',
    enDescription:
      'Embed AI into native products with guidance on APIs, SDKs, authentication, sessions, errors, quotas, validation, monitoring, and rollout planning.',
    keywords: '嵌入自有产品, API / OpenAI SDK 兼容 / MCP',
    zhH1: '将AI能力嵌入自有产品：接入方式与落地核心关注点',
    enH1: 'Enterprise AI Integration into Native Products: Deployment Best Practices and Decision Framework',
    zhLinks: ['API 文档', '快速开始', '集成文档'],
    enLinks: ['API documentation', 'Getting started', 'Integration documentation'],
    schema: 'HowTo + Article + BreadcrumbList',
    references: [
      ['FastGPT API documentation', 'https://doc.fastgpt.io/en/api/'],
      ['FastGPT integration documentation', 'https://doc.fastgpt.io/en/integration/'],
      ['FastGPT getting started guide', 'https://doc.fastgpt.io/en/guide/getting-started']
    ]
  },
  {
    slug: 'soe-policy-qa-deployment',
    group: 'industry',
    zh: '17-国央企大模型制度问答落地部署、审查与排期规划指南-V1.0-星触达-20260824.md',
    en: '17-EN-State-Owned-Enterprise-Large-Model-Polic-V1.0-XstraStar-20260824.md',
    zhTitle: '国央企大模型制度问答落地部署、审查与排期规划指南',
    zhDescription:
      '围绕国央企制度问答场景，梳理部署架构、合规审查、权限隔离、知识更新与项目排期方法，帮助团队建立可验证、可审计、可持续运营的落地计划。',
    enTitle: 'State-Owned Enterprise AI Policy Q&A Deployment Guide',
    enDescription:
      'Plan compliant state-owned enterprise AI policy Q&A deployment with architecture, reviews, permissions, updates, validation, scheduling, and controls.',
    keywords: '制度问答与员工服务, 知识库 / 权限隔离 / 渠道接入',
    zhH1: '国央企大模型制度问答落地部署、审查与排期规划指南',
    enH1: 'State-Owned Enterprise Large Model Policy Q&A Implementation: Deployment, Compliance Review, and Scheduling Guide',
    zhLinks: ['政务国企方案页', '私有化页', '案例页'],
    enLinks: ['Government and enterprise solutions', 'Self-hosted deployment', 'Customer cases'],
    schema: 'Article + BreadcrumbList',
    references: [
      ['FastGPT self-hosted deployment documentation', 'https://doc.fastgpt.io/en/self-host/'],
      ['FastGPT documentation', 'https://doc.fastgpt.io/'],
      ['FastGPT Chinese documentation', 'https://doc.fastgpt.cn/zh-CN/']
    ]
  }
];

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function readSource(sourceRoot, file) {
  return fs.readFileSync(path.join(sourceRoot, file), 'utf8').replace(/\r\n?/g, '\n');
}

function cleanBody(source) {
  const withoutComment = source.replace(/^<!--[\s\S]*?-->\n*/, '');
  const beforeMetadata = withoutComment.split('\n---\n', 1)[0];
  const lines = beforeMetadata.split('\n');
  const kept = [];
  let skipQuoteMetadata = false;
  for (const line of lines) {
    if (/^>\s*(?:\*{0,2})?(?:Fact Source|Source of facts|事实来源|Verification Date|Verified on|Version(?: and| &) Package|Editions|Revision|Update Record|Update Log|核验日期|版本与套餐|更新记录)/i.test(line)) {
      skipQuoteMetadata = true;
      continue;
    }
    if (skipQuoteMetadata && /^>/.test(line)) continue;
    skipQuoteMetadata = false;
    if (/^(?:文中产品能力与版本边界来自客户官方公开资料|Product capabilities and version boundaries in this article come from the vendor's published material)/i.test(line.trim())) continue;
    kept.push(line);
  }
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function renderDocument(spec, locale, source) {
  const h1 = locale === 'zh' ? spec.zhH1 : spec.enH1;
  const cleaned = cleanBody(source).replace(/^# [^\n]+\n*/, '').trimStart();
  const canonical = `https://fastgpt.${locale === 'zh' ? 'cn' : 'io'}/guide/${spec.slug}`;
  const hreflang =
    locale === 'zh'
      ? `zh-CN | zh-CN → https://fastgpt.cn/guide/${spec.slug} | en → https://fastgpt.io/guide/${spec.slug} | x-default → https://fastgpt.io/guide/${spec.slug}`
      : `en | zh-CN → https://fastgpt.cn/guide/${spec.slug} | en → https://fastgpt.io/guide/${spec.slug} | x-default → https://fastgpt.io/guide/${spec.slug}`;
  const links = locale === 'zh' ? spec.zhLinks : spec.enLinks;
  const title = locale === 'zh' ? spec.zhTitle : spec.enTitle;
  const description = locale === 'zh' ? spec.zhDescription : spec.enDescription;
  if (locale === 'en' && (title.length < 50 || title.length > 60 || description.length < 140 || description.length > 160)) {
    throw new Error(`${spec.slug}: English metadata length is outside the guide contract`);
  }
  const references = spec.references.map(([label, url]) => `- [${label}](${url})`).join('\n');
  const finalBody = `# ${h1}\n\n${cleaned}\n\n## References\n\n${references}\n`;
  const comment = [
    'Delivery metadata (not published with the body)',
    `slug: ${spec.slug}`,
    `locale: ${locale}`,
    `canonical: ${canonical}`,
    `hreflang: ${hreflang}`,
    `Meta title: ${title}`,
    `Meta description: ${description}`,
    `keywords: ${spec.keywords}`,
    `结构化数据: ${spec.schema}`,
    `内链: ${links.join(' / ')}`,
    '配图需求: Text and accessible tables; no image is required for this release.',
    '发布批次: Week06'
  ].join('\n');
  const document = `<!--\n${comment}\n-->\n\n${finalBody}`;
  const normalized = document.replace(/\r\n?/g, '\n');
  const bodyWithHeading = normalized.slice(normalized.indexOf('\n\n#'));
  const snapshot = {
    sourceName: `${spec.slug}.${locale}.md`,
    sourceSha256: sha256(normalized),
    bodySha256: sha256(bodyWithHeading),
    h1,
    metaTitle: title,
    metaDescription: description,
    keywords: spec.keywords,
    canonical,
    hreflang,
    schemaTokens: spec.schema.split(' + '),
    sourceSchema: spec.schema,
    sourceImageDirective: 'Text and accessible tables; no image is required for this release.',
    sourceInternalLinkLabels: links,
    assetPolicy: { status: 'source-exception' },
    configuredInternalLinks: [],
    datePublished: '2026-08-27',
    dateModified: '2026-08-27'
  };
  return { document: normalized, snapshot };
}

function main() {
  const sourceRoot = process.argv[2];
  if (!sourceRoot) throw new Error('Usage: node scripts/import-week06-guides.js <Week06 guide root>');
  const zhRoot = path.join(sourceRoot, '深度内容-第4批3篇');
  const enRoot = path.join(sourceRoot, '深度内容-英文版3篇');
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const existing = new Set(registry.entries.map((entry) => entry.slug));
  const newEntries = [];
  for (const spec of specs) {
    if (existing.has(spec.slug)) throw new Error(`Guide ${spec.slug} already exists`);
    const zh = renderDocument(spec, 'zh', readSource(zhRoot, spec.zh));
    const en = renderDocument(spec, 'en', readSource(enRoot, spec.en));
    fs.writeFileSync(path.join(guideRoot, 'zh', `${spec.slug}.zh.md`), zh.document);
    fs.writeFileSync(path.join(guideRoot, 'en', `${spec.slug}.en.md`), en.document);
    newEntries.push({ slug: spec.slug, group: spec.group, zh: zh.snapshot, en: en.snapshot });
  }
  const insertAt = registryPath && fs.readFileSync(registryPath, 'utf8').lastIndexOf('\n  ]\n}');
  if (insertAt < 0) throw new Error('Guide registry shape changed; refusing to rewrite it');
  const sourceText = fs.readFileSync(registryPath, 'utf8');
  const insertion = `${sourceText.slice(0, insertAt)},\n${newEntries
    .map((entry) => JSON.stringify(entry, null, 2).replace(/^/gm, '  '))
    .join(',\n')}${sourceText.slice(insertAt)}`;
  fs.writeFileSync(registryPath, insertion.replace('"entryCount": 13', '"entryCount": 16'));
  console.log(`Imported ${newEntries.length} Week06 Guide pairs`);
}

main();
