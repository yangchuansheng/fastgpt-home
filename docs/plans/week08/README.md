# Week08 implementation handoff

Scope: [#289](https://github.com/labring/fastgpt-home/issues/289), including decisions
[#290](https://github.com/labring/fastgpt-home/issues/290) through
[#295](https://github.com/labring/fastgpt-home/issues/295).
Repository baseline: `66be9bbabf1cae1c3b8bc08ad75a3030e9738bbb`.
Decision date: 2026-09-08. The current request delegates interaction choices to the implementer;
the decisions below use that delegation. Human visual approval and production authorization
remain separate evidence states. GitHub issue state is maintained independently of this local handoff.

The deliverable is an implementation and acceptance plan. Product import and deployment belong
to the execution tasks in [implementation.md](implementation.md). This follows the explicit
destination and scope of #289. All six decision topics have a concrete disposition below.

## Inventory and reproducible boundary

[inventory.json](inventory.json) contains all 38 new page identities, exact delivery-relative
source names, raw-byte SHA-256 fingerprints, proposed destination files, content owners,
publication groups, complete Published Locale Sets, missing metadata fields and release units.
It also contains all 797 unique source-page identities, repository-relative body paths, original
body fingerprints and target issue-list paths. It is a pre-import handoff attachment; production
continues to consume the existing Markdown and indexes under [ADR 0008](../../adr/0008-commit-normalized-technical-content-import-authority.md).

```bash
node scripts/verify-week08-handoff.js
node --test scripts/verify-week08-handoff.test.js
node scripts/verify-week08-handoff.js --delivery-root /path/to/fastgpt-data
```

The default check validates the repository baseline and mapping boundary without external
delivery dependencies. The explicit delivery check additionally verifies all 38 raw source
hashes and every mapped article's forward link in the delivered issue lists. A changed body or
delivery fails with its file or identity. Run this preflight on the recorded baseline before
import; the later source/export gates validate the imported revision. Expected baseline:
23 Guide groups / 46 localized Guide articles, 4,995 technical identities, 38 absent new identities.

| New content | Simplified Chinese | English | Total |
| --- | ---: | ---: | ---: |
| Issue landscape | 1 | 1 | 2 |
| Issue lists | 5 | 5 | 10 |
| Decision matrices | 6 | 6 | 12 |
| Reference tables | 3 | 3 | 6 |
| Deep-dive articles | 4 | 4 | 8 |
| Total | 19 | 19 | 38 |

## Decision 290: content ownership and routes

Keep all supplied owner-relative `/guide/{slug}` and `/reference/{slug}` paths.
The 32 Guide identities belong to `src/content/guides/`; the six Reference identities belong
to `src/content/tech-center/{locale}/reference/`. Reference uses category `reference`
(Technical reference / 技术速查) and source type `官方文档`. Guide uses `decision` for the
12 matrices and the two `version-upgrade-decision` articles; its remaining 18 identities
use `implementation`. Each page's exact assignment is in the inventory.

The dedicated Guide routes own the Guide namespace. Keep the technical registry limited to
technical-owned identities. Use a cross-link between the Guide hub and Technical Center to
expose both catalogs. Reference pages enter the existing locale search indexes; Guide discovery
continues through the Guide hub, groups, related resources and ordinary browser Find. The
current Guide hub has no search control, so a new search implementation has no requirement here.

The complete new Guide set has 20 slugs: 12 bilingual slugs and eight single-locale slugs.
The four Simplified-Chinese-only slugs are `container-orchestration-issues`,
`database-storage-issues`, `image-architecture-issues`, `version-upgrade-issues`.
The four English-only slugs are `api-authentication-issues`, `environment-configuration-issues`,
`upgrade-migration-issues`, `workflow-node-issues`. All other new paths are bilingual.
After the complete import, Guide has 43 groups / 78 articles (39 per locale), while the
technical registry has 5,001 identities. Preserve the existing 46 Guide articles and all
existing technical identities.

Guide currently hard-codes an exact `zh/en` pair in `registry.ts`, `policy.json`, `guideSeo.ts`,
both article routes, both hub components and `sitemap.ts`. Adopt optional `zh`/`en` snapshots
with at least one valid snapshot per entry and one shared resolver for the actual locales.
Keep the existing snapshot shape, byte-zero metadata comment and hash validation. Validate each
present snapshot; reject unsupported keys, empty sets, duplicate slugs and malformed snapshots.
Update the count policy to the actual accepted groups in each release unit.

Static params, hub cards/ItemList, article language navigation, metadata/hreflang and sitemap
must all consume the same per-entry locale resolver. Validate `(locale, slug)` before loading
the document. Unpublished pairs follow the localized 404 contract, with links to published
variants; static-export host behavior must be tested too. `zh` belongs to `fastgpt.cn`, `en`
to `fastgpt.io`; both are root-path canonicals. Preview uses `/zh/...` and `/en/...` review
paths with production canonicals and `noindex,nofollow`. Preserve `clean-locale-output.js`
ownership cleanup and the Preview root seed behavior required by static export. A seed must
select a source available in the chosen locale.

Hreflang is reciprocal for the actual locale set. English is `x-default` only when published;
a Chinese-only page follows [ADR 0005](../../adr/0005-publish-locales-per-page.md).
Reference currently emits technical metadata from its existing route and schema paths:
verify its actual bilingual pairs through `technicalRouting.ts`, the route metadata,
`TechCenterJsonLd.tsx`, and page-level language navigation before release.

Regression scope includes both Guide article routes and hub, shared Navbar locale behavior,
all 46 old Guide snapshots and G1/G2 release contracts, sitemap dates, canonical/hreflang,
owner cleanup/redirects, technical search pagination and byte budget, FAQ identities and aliases.
Separate Guide and generic route sets must have an empty intersection.

## Decision 291: editing, evidence and dates

| Change class | Decision and evidence |
| --- | --- |
| Mechanical normalization | Convert CRLF to LF; normalize owned links; move internal process notes to a single hidden metadata block; fill metadata candidates; preserve a Git diff and original source hash. |
| Technical correction | Verify commands, defaults, enablement, variable/node/code membership, compatibility and version claims against immutable public source before accepting the corrected text. Record affected page/row, old/new claim, source URL and rationale in the content-review attachment to the import commit. |
| Content-owner decision | Changed positioning, deleted substantive caveats, new metrics or customer claims require a named content owner. Preserve supported original scope while isolating an unresolved page from the accepted release unit. |

Preserve customer names, outcomes, substantive context and caveats. Keep evidence workflow,
verification dates, release schedules and phrases such as “not grouped in this round” in hidden
metadata. Present readers with durable scope explanations. Apply this to summaries as well as
body text: the English Reference descriptions currently include `Verified 2026-09-07`.
Use descriptive public HTTPS citations in reader-facing Sources/References. A raw URL in
front matter alone supplies provenance, while the article also needs readable citations.

All 38 pages need actual publication/modification dates; 32 need `meta_title`, 15 need
`meta_description`. Use existing title and description derivation as candidate generation,
then review completeness and technical meaning. Guide's importer adapts these fields to the
existing `Meta title` / `Meta description` snapshot format. Technical pages use snake-case
front matter. Finalize dates at the first approved publication revision; the planned date and
delivery date live in internal evidence. Record actual successful rollout time separately and
correct a postponed publication date before releasing. `dateModified >= datePublished`;
subsequent substantive content/link changes update `dateModified` in the publication revision.
Guide renders its localized registry-derived modified date; rebuild time has its own release log.

The 137 environment variables, 123 error codes across 14 modules and 32 workflow nodes are
delivery-snapshot counts. They are verification inputs, with row-level source reconciliation
required before any assertion that they describe a released version. Freeze one upstream
commit for the three table families, record its commit timestamp, and link each section or row
to `https://github.com/labring/FastGPT/blob/<40-character-sha>/<file>#Lx-Ly`.
Group citations are sufficient when every row maps unambiguously to the cited range; split
citations for rows from other files. English and Chinese use the same technical evidence.

Candidate cutoff commit returned by the GitHub API for the end of 2026-09-07 UTC:
`5957d06807ff7f984c70c6425c8d0fc40eb1714d` (2026-09-07 12:09:57 UTC).
This is a candidate audit revision, not proof of the supplier's exact source revision.
The available local FastGPT checkout is older (`e0adc7cfc24b142ffa27621d1d94e945769fe7d8`).
The content task must compare the delivered rows to the selected immutable revision and resolve
differences explicitly. Pin the actual files for `projects/app/.env.template`,
`packages/global/common/error/errorCode.ts` and its imported enum definitions, and
`packages/global/core/workflow/template/system/` plus its active export registry.

Required evidence: environment key/default/active-or-commented status/source lines; error module,
identifier, numeric/string value and source lines; workflow exported node identity, tool support,
declared/required input count, outputs, documentation path and definition lines. Account for
duplicate exports, spread properties and runtime visibility. Version-introduced fields and
active source definitions alone do not establish release availability. Preserve explicit
unknowns and provide a tested release/tag mapping before labeling a node as released.
Changed row counts propagate to both locale titles, summaries, headings and metadata together.

Concrete correction queue includes the Reference source citations, snapshot verification prose,
the node claim “stable across versions”, and the backup article's live PG-directory backup and
credential-parity instructions. Verify a database-consistent backup/recovery procedure and
functional credentials against the selected deployment version; retain the data-loss caveats.
These are bounded content-audit tasks, with page acceptance gated on evidence.

`CONTEXT.md` now defines deep scenario content independent of language and points to the
per-page Published Locale Set. The existing W3 tutorial classification remains batch-specific.

## Decision 292: presentation and discovery

Reuse `GuideArticlePage`, `TechArticlePage`, the shared `MarkdownContent` renderer, heading
parser and CSS table wrapper. Keep semantic HTML in the completed export. Keep all table rows
and issue links server-rendered; use native horizontal scrolling and browser Find for 137-row
tables. The scale requires no table virtualization or new client search bundle.

| Representative | Layout decision | Acceptance |
| --- | --- | --- |
| `zh/guide/deployment-issue-landscape` | Intro, decision/group table, links to the five Chinese lists, related resources | All five targets plus return flow work; group headings appear in the TOC. |
| `zh/guide/container-orchestration-issues` | Symptoms, grouped issue tables, return to landscape | All 146 links remain present; grouped sections stay readable at 375 px. |
| `zh/guide/deployment-form-selection` | Criteria matrix followed by boundary/cost prose | Long cells wrap; horizontal scrolling stays inside the table container. |
| `zh/reference/env-variables-reference` | Column legend and 15 purpose groups | 137 settings remain readable and keyboard-accessible; section citations stay with their groups. |
| `en/guide/workflow-node-issues` | Localized issue groups, 37 article links and landscape return | English-only locale navigation; English labels and sensible heading wrapping. |

Also inspect an existing article from each of the ten backlink groups, including the longest
Chinese list and an English node article, after backlink insertion. Representative evidence
must state whether it is a delivery preview, shared-renderer preview, completed export or live
page; a structure preview establishes layout decisions, and the completed-export browser gate
establishes the real shell/CTA/link behavior. User review is delegated to the implementer by the
current request; record agent review honestly without inventing a human approval.

The existing CSS already gives `.tech-article-table` `overflow-x:auto`; the table wrapper
currently has no keyboard focus target. The existing inline renderer accepts HTTP, mail and
root links but omits `#fragment` anchors. Exercise delivered content against these seams;
implement safe fragment anchors and an accessible named/focusable scroll container when needed.
At 375 and 1440 px: verify no viewport overflow, usable keyboard table scrolling, valid TOC
anchors, stable headings and the existing content consultation entry. Use semantic table
headers; apply minimum changes to the shared renderer only after a failing representative check.

The shared-renderer review reproduced a concrete parser defect: escaped pipes create extra
cells in `MILVUS_LANGUAGE_IDENTIFIER`, `STORAGE_DOWNLOAD_URL_MODE`, `LOG_ENABLE_CONSOLE` and
`AGENT_ENGINE`. `markdownParser.ts` currently splits rows on every pipe. E3 must preserve
escaped pipes and code spans as cell content, with a four-column Reference regression case.
Record the browser observations and verification limitations in [validation.md](validation.md).

Guide hub cards appear in the assigned decision/implementation groups and link through the
site routing helpers. Add a concise Technical Center link to the Guide hub and a Guide link
to Technical Center discovery. Keep Reference cards/search within the existing technical
category and locale search projection. Guide related resources connect matrices, Reference,
landscape and relevant deep guides; issue lists return to landscape, leaves return to lists.
Keep the existing sidebar/mobile `ContentSidebarCta`, consult destination and attribution.

## Decision 293: backlink authority and rollback

Choose a static Markdown paragraph immediately after each source article's main heading and
before its introductory prose. Its wording is `返回问题清单：<target title>` in Simplified
Chinese and `Back to issue list: <target title>` in English, using one descriptive clickable
absolute HTTPS owner URL. This remains valid on both Preview and production. Normalize the
new lists' forward links and landscape links to the same owner URL convention at authoring.
Preserve original heading/body text, section order, case-sensitive slug, metadata and source
citations. Existing modified dates may change only according to Decision 291's date rule.

The maintained authority is the committed Markdown. The handoff inventory bounds the initial
edit and supports review; it stays outside runtime imports. Future regrouping edits the leaf
paragraph and both affected lists together. Keep one primary issue list per `(locale, path)`;
secondary themes use ordinary related links. Similar titles or shared final slugs never imply
shared identity. A grouping change records its reason and old/new target in the Git change.

The one-shot import must preflight all 797 identities, original hashes, source front matter,
target membership and forward edges before any write. Preview its full diff first. On replay,
an exact intended paragraph is a no-op; an unexpected existing paragraph/changed source fails
for review. Hash comparison on replay permits only the original bytes or the exact derived
result. Keep each file's original line endings and every byte outside the inserted paragraph
and approved modified-date field. Stage writes only after complete preflight; use the existing
transactional file helper if multi-file writes are automated. Follow any interrupted operation
with full mapping/content checks before committing.

Use a dedicated backlink commit. Revert that commit to restore the exact source bodies; compare
the inventory's raw SHA-256 hashes after rollback. For a later deployment with intervening
content edits, revert only the added paragraph through a reviewed patch and preserve subsequent
changes. Keep the target pages deployed while backlinks remain active. Remove/revert backlinks
before rolling back their targets, or restore the previous complete site image as one unit.

| Locale | Target issue list | Unique leaf articles |
| --- | --- | ---: |
| zh | container-orchestration-issues | 146 |
| zh | database-storage-issues | 73 |
| zh | model-serving-issues | 68 |
| zh | version-upgrade-issues | 100 |
| zh | image-architecture-issues | 60 |
| en | api-authentication-issues | 33 |
| en | environment-configuration-issues | 125 |
| en | model-serving-issues | 41 |
| en | upgrade-migration-issues | 114 |
| en | workflow-node-issues | 37 |

Require set equality of expected/actual leaf identities and edges, exactly one intended return
link per leaf, both endpoints resolving in the owned export, and unchanged substantive bodies.
This is 447 Chinese plus 350 English edges. Count equality alone misses exchanged or wrong edges.

## Decision 294: release units and acceptance

| Unit | Contents | CN / IO new URLs | Dependencies | Rollback |
| --- | --- | --- | --- | --- |
| U0 | Per-page Guide locale support and regression updates | 0 / 0 | Current baseline | Revert U0 code with its dependent content units. |
| U1 | Two landscapes, ten lists, hub discovery and internal links | 6 / 6 | U0, content evidence, representative acceptance | Remove leaf backlinks first; revert U1 content, registry/index/hub changes as one revision. |
| U2 | Twelve matrices, eight deep guides, six references and related links | 13 / 13 | U0, page-specific evidence; U1 when linked | Revert affected content and its discovery references together. |
| U3 | 797 leaf return links | 0 / 0; 447 / 350 changed URLs | U1 target pages and their forward links reachable on the corresponding owner | Revert backlink commit or restore prior image. |

Default sequence: U0 → U1 → U2 → U3; U2 content review can proceed while U1 is implemented.
U1 and U2 may be split by locale only when each resulting release's internal links resolve and
its hreflang exactly reflects the actually deployed counterpart. Ship the bilingual target
groups in a coordinated owner pair; verify both owner origins before enabling U3. When one site
fails rollout, stop the dependent backlink release and restore the previous owner-pair state
or explicitly remove the unshipped counterpart from the advertised set.

For every changed unit, run the relevant source checks and regression tests from
[implementation.md](implementation.md), then `npm run verify:release -- --keep-artifacts` on a
case-sensitive filesystem with lockfile-matched Node dependencies and sufficient build storage.
The existing Linux verification workflow builds CN, IO and Preview; retain
`.release-artifacts/release-verification.json`, logs and export inventories. Use the existing
image workflow and release procedures in [docs/release](../../release/README.md).

Allow zero failed source, route, metadata, link-set, hygiene or export assertions in the
affected units. Existing unrelated test failures require a separate baseline reproduction and
an explicit release-owner waiver; a local skipped build supplies no release evidence.

| Evidence state | Required artifact / responsible role |
| --- | --- |
| Handoff boundary verified | This inventory and checker output; implementation owner. |
| Source accepted | Normalized bodies, evidence citations, content diff and source checks; content owner + implementer. |
| Export verified | CN/IO/Preview outputs, inventories and successful check logs bound to commit; release engineer. |
| Preview reachable | Explicit approved preview origin, recorded URLs/status/canonical/robots and browser screenshots; QA owner. |
| Production reachable | Explicit production authorization, deployed commit/image digest, rollout completion and bounded live checks; release operator. |
| Search indexed | Later Search Console/manual indexing evidence bound to exact URLs and observation date; SEO owner. |

The release operator records the previous image digest and exercises rollback before deploying.
Production authorization is a separate, concrete gate after the reviewable artifacts exist.
For U1, request its 12 manifest URLs (six per owner). For U2, request the cumulative 38 URLs
(19 per owner). A deliberately split release probes its explicitly accepted cumulative identity
set; future-unit paths stay outside its success count. Inspect owner HTTP 200, self-canonical, hreflang,
robots and sitemap inclusion; check unavailable locale combinations and Preview noindex.
For U3, scan all 797 known leaf URLs once with bounded concurrency and retain extracted return
targets; manually exercise one page per group. Existing release hygiene live mode remains
bounded to explicit targets. A successful Git commit/build/HTTP response has its own evidence
state; search indexing is a later observation.

## Decision 295: implementation handoff

[implementation.md](implementation.md) assigns inputs, file ownership, outputs, dependencies,
acceptance commands and responsible roles for every execution task. Start with E0. Shared
Guide/routing files merge before content; registry/search updates have one integration owner.
The tasks are a separate execution plan, as required by #295. Content differences and visual
findings are bounded to their owning tasks with explicit acceptance gates. Production execution,
channel distribution, other weeks, undelivered pages and healthy FAQ URL migration remain in
their respective scopes.
