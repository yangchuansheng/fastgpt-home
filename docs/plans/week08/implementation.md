# Week08 execution tasks

This is the execution plan produced by [the decision handoff](README.md).
The current #289 delivery resolves planning decisions; the implementation tasks below have
their own source, export and release acceptance gates. File names below are repository-relative.

## E0 — lock and validate the delivery

- Role: implementation owner. Depends on decisions [290](README.md#decision-290-content-ownership-and-routes),
  [291](README.md#decision-291-editing-evidence-and-dates). First executable task.
- Inputs: repository baseline and all Week08 source files referenced by `inventory.json`.
- Owns: the execution branch and an import review attachment containing source revision,
  fingerprints, accepted page set, content changes and source citations.
- Output: a reviewed, immutable input set and a clean baseline; baseline changes are reconciled
  explicitly before applying any import. This planning inventory stays out of production imports.
- Acceptance: `node scripts/verify-week08-handoff.js --delivery-root <delivery-repository>`;
  `node --test scripts/verify-week08-handoff.test.js`; save clean `git status` and the baseline SHA.
- Confirm the raw snapshots match 38 files and the 797 full forward/backlink identities. Keep
  original delivery assets available to the implementer without local absolute paths in committed data.

## E1 — publish Guide locales per entry

- Role: routing engineer. Depends on E0 and decision [290](README.md#decision-290-content-ownership-and-routes).
- Owns: `src/content/guides/registry.ts`, `policy.json`, `src/lib/guideSeo.ts`,
  `src/app/guide/[slug]/page.tsx`, `src/app/[lang]/guide/[slug]/page.tsx`,
  `src/components/guide/GuideArticleRoute.tsx`, `GuideHubRoute.tsx`, `GuideHubPage.tsx`,
  `src/app/sitemap.ts` and their Guide verifiers/tests. Review `guideContent.ts`,
  `scripts/clean-locale-output.js`, `scripts/lib/redirects.js`, `src/lib/seo.ts` and
  `src/components/home/Navbar.tsx` at the ownership seams.
- Input: the existing bilingual snapshots and inventory's actual locale sets.
- Output: one locale resolver, per-entry source validation and locale-filtered params,
  hub/navigation/schema/sitemap. Keep content imports for E4. Preserve all 46 existing articles.
- TDD seam: a Chinese-only entry, an English-only entry and a bilingual entry must produce
  exact param/hreflang/hub/sitemap sets; invalid locale and empty snapshots must fail. Cover the
  actual exported unsupported-locale behavior and Preview seed path as well as pure helpers.
- Acceptance: `npx tsc --noEmit`; `npm run verify:guide-content`;
  `npm run verify:guide-content-regression`; `npm run verify:guide-export-regression`;
  `npm run verify:guide-release-regression`; `npm run verify:guide-g2-release-regression`.
  Review literal locale-pair/count assumptions in existing verifiers without weakening G1/G2
  manifest-specific invariants.

## E2 — normalize and verify content

- Roles: bilingual technical editor and content owner. Depends on E0 and decision
  [291](README.md#decision-291-editing-evidence-and-dates); can proceed alongside E1.
- Owns: reviewed delivery staging for all 38 files and a page/row evidence attachment.
  E4 owns the final registry/index writes to avoid simultaneous shared-file edits.
- Outputs: 32 Guide snapshots in the current comment-plus-Markdown format; six technical
  Markdown records in the current front-matter format. Preserve substantive content, adapt
  owned links, add evidence-backed public citations, fill and review metadata candidates.
- Pin and reconcile the three Reference families before accepting them. The review attachment
  lists each disputed row, source definition, resolved value and affected locales. Explicitly
  resolve the backup procedure and workflow-version claims identified in the handoff.
- Reuse current import helpers where their schema fits. `import-technical-content.js` accepts
  explicit JSON/XLSX records with `file,prefix,slug,title,pageType,wordCount,sourceCount,source`;
  the supplied Week08 folder is raw Markdown and requires an adapter/staging record. Its
  `--check` compares against committed projections, so run it after import for determinism.
- Technical raw source labels such as `Open-source repository` also require mapping to the
  existing policy value `官方文档`. Preserve human descriptions in hidden provenance. Normalize
  English root slugs to the registry's `/en/...` identity while keeping owner canonicals unprefixed.
- TDD seam: guide metadata/hash parity, missing/invalid source data, actual locale membership,
  citation counts and unsafe paths. Reuse `import-week06-guides.test.js` and technical import
  checks when adapting their existing functions; preserve unrelated batch behavior.
- Acceptance after E4 integration: `npm run verify:guide-content`;
  `npm run verify:technical-content`; `npm run verify:content-hygiene`;
  `npm run verify:guide-import-regression`; `npm run verify:technical-content-regression`.

## E3 — verify representative presentation

- Role: frontend/QA engineer, acting under delegated design choices. Depends on E1 and E2
  representative drafts; decision [292](README.md#decision-292-presentation-and-discovery).
- Owns: shared `MarkdownContent.tsx`, `markdownParser.ts`, article CSS and corresponding
  regression tests only for reproduced presentation defects. Guide/Technical Center discovery
  edits are coordinated with E1/E4; consult attribution remains in the existing component.
- Input: the five representative identities in the decision and ten existing backlink samples.
- Output: screenshots and observed outcomes for 375 px mobile and 1440 px desktop, anchored
  TOC, keyboard table scrolling, all table rows/issue links, locale labels, return navigation and
  the existing content consultation entry. Distinguish isolated renderer previews from full routes.
- TDD seam: escaped pipes in the four reproduced Reference rows, a fragment link in Markdown,
  keyboard-accessible table wrapper and intact nested
  lists/tables/code. Change the shared parser only for actual failing delivery constructs.
- Acceptance: `npm run verify:guide-markdown-regression`;
  `npm run verify:content-sidebar-cta`; `npx tsc --noEmit`;
  bounded browser checks on completed export. A static HTML screenshot alone supplies visual
  evidence; keyboard, navigation and responsive scroll assertions require actual interaction.

## E4 — integrate targets and discovery

- Role: content integration engineer. Depends on E1, E2 and E3; decisions 290–292.
- Owns: `src/content/guides/{zh,en}/*.md`, `registry.json`, `policy.json`,
  `src/content/tech-center/{zh,en}/reference/*.md`,
  `src/components/tech-center/entries.json`, `public/tech-center/search-index*.json`,
  hub cross-links and related resource mappings. Stage only accepted unit content.
- Output: separate U1 and U2 commits with internally complete link graphs and exact inventories.
  Preserve guide namespaces, old snapshots, source IDs and case-sensitive paths.
- Register U1 as six localized identities per site and U2 as 13 per site. Full totals:
  43 Guide groups / 78 localized articles; 5,001 technical identities. Technical search adds
  three Reference records per locale; Guide cards add 16 per locale.
- Acceptance: `npm run verify:guide-content`; `npm run verify:technical-content`;
  `npm run verify:technical-center`; `npm run verify:content-hygiene`;
  a second import produces an empty diff. Verify all 38 target paths and the expected registry
  counts, unavailable locale set and Guide/technical namespace disjointness. Re-run typechecking
  after each registry/schema integration.

## E5 — apply 797 leaf return links

- Role: content integration engineer. Depends on E4 U1; decision
  [293](README.md#decision-293-backlink-authority-and-rollback).
- Owns: exactly the 797 `sourceFile` entries in the inventory plus a one-shot bounded transform
  and its replay/rollback check if automation is used. The inventory gives exact file ownership;
  no source discovery by fuzzy titles is necessary.
- Input: verified target pages and original fingerprints. Output: one backlink commit containing
  exactly one intended static return paragraph per leaf with preserved substantive content.
- TDD seam: apply/reapply/rollback, wrong target, changed source, duplicate mappings and
  interrupted writes. Verify expected/actual edge set equality as well as 447/350 locale counts.
- Acceptance: `npm run verify:technical-content`; `npm run verify:content-hygiene`;
  dedicated full mapping check against source and export; ten browser samples, one per list.
  Revert in a disposable checkout and compare every original source fingerprint.

## E6 — run release and live gates

- Roles: release engineer for build, QA owner for Preview, explicitly authorized release operator
  for production. Depends on E4/E5 and decision [294](README.md#decision-294-release-units-and-acceptance).
- Owns: release artifacts and existing workflow invocations; use the current deployment design.
- Inputs: accepted revision, lockfile-matched dependencies, case-sensitive build volume, approved
  Preview origins, both production origins, previous image digests and rollback evidence.
- Output: source/export/Preview/production evidence recorded independently against the commit
  and image digest. Full release command: `npm run verify:release -- --keep-artifacts`.
- Development source gate: `npm run verify:release -- --source-only`; final full test suite:
  `node --test scripts/*.test.js scripts/lib/*.test.js`. Resolve baseline failures or document
  explicit release-owner waivers before relying on a green release.
- Export commands include `npm run verify:guide-export -- --variant <cn|io> --out-dir <out>`
  (CN/IO only; Preview uses the complete release orchestrator),
  `npm run verify:technical-export`, `npm run verify:content-hygiene-html`,
  `npm run verify:i18n-seo`, and `npm run verify:faq-routes`; use the release orchestrator's
  environment per variant. Preserve G1/G2 and alias-authority regressions.
- Final acceptance: all manifest URLs/edges meet Decision 294, rollback restores the tested
  prior revision, and production authorization is recorded before deployment. Search indexing
  remains a subsequent manual/Search Console observation.

## Shared-file integration order

E0 → E1 → E4 U1 → E4 U2 → E5 → E6. E2 runs alongside E1; E3 follows representative
draft readiness. E1 owns shared Guide routing/type edits until merged; E4 then owns registry,
policy counts, search projections and discovery links. E5 merges after target integration.
All key decisions link back to #290–#295 through the handoff. Runtime modules consume the
existing content and indexes; the planning inventory and its preflight stay in documentation/tools.
