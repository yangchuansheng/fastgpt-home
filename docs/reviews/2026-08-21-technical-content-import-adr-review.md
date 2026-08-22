# Technical content import ADR review

## Scope and status

This review reconciles the proposed technical-content import ADRs with the current FastGPT website architecture and the second delivery batch. It records historical evidence and acceptance criteria; it does not implement the importer, normalized manifest, decision ledger, search projection, or release verifier.

The final decision set contains four durable ADRs. Batch arithmetic, duplicate decisions, security findings, rollout suggestions, and command inventories remain in this report because they are implementation evidence rather than architectural decisions.

## Review provenance

- Repository baseline: detached `HEAD` at `08722fc45fc12b2149730d75e31b0d8668a964e3`.
- Initial working state: modified `CONTEXT.md` plus untracked ADR proposals `0008` through `0019`; the review preserved unrelated worktree changes.
- ChatGPT Pro review: [Review ADR Set](https://chatgpt.com/c/6a881b3e-ff24-83e8-ae15-7ca952c5c3c5).
- Reviewed source archive: `fastgpt-home-adr-review-08722fc-170302.zip`, `3,359,775` bytes.
- Archive SHA-256 computed by Codex: `1b7413b4fa4757c9fd814b31f21eb19c91ec0e75dafd50988f8f63d687b87750`.
- ChatGPT Pro did not independently verify that archive digest.
- Correction context archive: `fastgpt-adr-correction-input-08722fc-175448.zip`, `9,137` bytes, SHA-256 `0657bedd45eab24b5e64d24352ea5f095f5f4e8e0b36c1b50f2783afea828d21`.

The source archive candidate list contained 990 text files. Packaging excluded `.git`, dependencies, build outputs, caches, databases, runtime state, browser state, binary media, and `.env`-family files. A pre-upload regex scan flagged six tracked technical pages containing the same synthetic `sk-aaab…jjjkkk` example:

- `src/content/tech-center/deploy/fastgpt-chatglm2-custom-model.md`
- `src/content/tech-center/deploy/fastgpt-connect-chatglm2-m3e.md`
- `src/content/tech-center/deploy/fastgpt-m3e-vector-model-setup.md`
- `src/content/tech-center/deploy/fastgpt-chatglm2-m3e-setup.md`
- `src/content/tech-center/deploy/fastgpt-chatglm2-integration.md`
- `src/content/tech-center/deploy/fastgpt-m3e-embedding-config.md`

Manual inspection classified the value as a synthetic example. The scan was a bounded regex check rather than a comprehensive secret-scanner product.

## ChatGPT Pro correction record

| Artifact or round | Independent result | Disposition |
|---|---|---|
| Initial ADR review | Reduced twelve proposals to four durable decisions; later corrected manifest authority, identity, search, and site-variant boundaries through one-question-at-a-time review | Accepted as design input |
| `technical-content-import-adr-review.patch`, 24,920 bytes, SHA-256 `65ef886a5ef0f81e2c01e5ea3bbd3ea189cf7d2c43a8fe39cf5e5be9e89bca2a` | `git apply --check -p1` passed; glossary, performance invariant, site-variant outcomes, package evidence, and acceptance matrix were incomplete | Rejected |
| `fastgpt-adr-correction-complete.patch`, 9,723 bytes, SHA-256 `fcd99aef69647c544383918c6d6cddf35631573e710c7a7f589027ed5edb8943` | `git apply --check -p1` failed with `corrupt patch at line 10`; the artifact contained truncated source and invalid hunk headers | Rejected |
| `fastgpt-adr-correction-complete-final.patch`, 10,459 bytes, SHA-256 `d0ca453ba775229323ca7940ef711c10dcc65aa0c71295436126b21f76642ae9` | The patch passed only against a synthetic baseline. It failed against the real worktree because it deleted placeholder `*-old.md` files and replaced a truncated `CONTEXT.md` | Rejected |
| Final local six-file documentation set | ChatGPT Pro reviewed the exact files, requested one acceptance-matrix placeholder correction, then returned `FINAL_ACCEPTED` | Accepted |

No ChatGPT Pro patch was applied directly. Codex reconstructed the agreed decisions against the real files and retained this correction record for auditability.

## Repository and delivery evidence

The current registry contains 672 technical entries. `src/components/tech-center/entries.json` is 417,139 bytes raw and 84,250 bytes under `gzip -9`; `TechCenterPage.tsx` imports the complete registry into a client component and performs filtering and sorting in the browser.

The delivery source contains one workbook and 454 Markdown files. The workbook has 454 accepted records, six denied merged records, and an instruction sheet. Static comparison produced four updates and 450 net-new identities, for an expected union of 1,122 identities.

The expected union is a repository-and-delivery comparison target. It is not a count of Published Technical Pages or Export-verified Technical Pages, and the repository currently has no normalized import manifest or decision ledger.

| Category | Baseline | Delivery | Expected union |
|---|---:|---:|---:|
| `api` | 8 | 16 | 24 |
| `dataset` | 10 | 5 | 15 |
| `deploy` | 306 | 20 | 324 |
| `integration` | 26 | 2 | 28 |
| `node` | 40 | 3 | 43 |
| `reference` | 0 | 332 | 332 |
| `troubleshoot` | 196 | 61 | 257 |
| `tutorial` | 86 | 15 | 99 |
| **Total** | **672** | **454** | **1,122** |

The expected union counts four delivery identities as updates, so category addition alone overstates the union for categories containing updates.

NFKC plus case-folded full identity comparison found zero collisions. Final-slug reuse remains valid across distinct owner-relative canonical paths: the combined data contains 31 repeated final-slug groups, including three baseline groups, 27 delivery-to-baseline groups, and one corrected OpenSandbox group.

The workbook row for OpenSandbox combines prefix `reference` with slug-column value `deploy/fastgpt-opensandbox-env-config`. The delivery file is `reference/fastgpt-opensandbox-env-config.md`, so the normalized owner-relative canonical path is `/reference/fastgpt-opensandbox-env-config`.

The six denied identities are:

- `/reference/fastgpt-aws-s3-storage-config`
- `/reference/fastgpt-chatglm2-custom-model-test`
- `/deploy/fastgpt-docker-deploy-guide`
- `/reference/fastgpt-openapi-chat-top-update`
- `/reference/fastgpt-self-host-docker-setup`
- `/reference/fastgpt-self-host-env-vars`

Three near-duplicate intent boundaries remain separate:

- Mongo replica initialization failure diagnosis and initialization repair.
- Dataset list API and single-data detail API.
- Docker Mongo manual update and Mongo failure/recovery guidance.

The delivery file `reference/fastgpt-chatglm2-m3e-api-test.md` also contains a synthetic secret-shaped example. Import must replace it with `YOUR_API_KEY` before publication.

## Final ADR set

| ADR | Durable decision | Consolidated proposal concerns |
|---|---|---|
| `0008` | Normalized manifest and decision-ledger authority | batch accounting, explicit import source, sync/verification authority |
| `0009` | `(locale, owner-relative canonical path)` identity | route identity and valid final-slug reuse |
| `0010` | Search data outside initial JavaScript | registry growth, SSR fallback, deferred public projection, performance budget |
| `0011` | Site Variant ownership | CN canonical export, IO redirects, Preview review representations |

Duplicate triage, credential sanitation, PR sequencing, and exact acceptance commands remain implementation evidence in this report.

## Authority model

```text
Import Source
  -> Normalized Manifest + Decision Ledger
  -> Publish Projections
  -> Release-eligible Technical Page
  -> Export-verified Technical Page
  -> Published Technical Page
```

For a specific ingestion run, the committed normalized manifest and decision ledger become repository authority after implementation. Generated registries, content files, and search data are publish projections that must remain reproducible from that authority. Published means deployed and reachable at the production canonical URL; repository acceptance and static export verification are earlier states.

Until those artifacts exist, this report remains historical evidence and the external delivery remains provenance input. After implementation, operational authority transfers to the committed manifest and ledger while this report remains historical evidence.

## Search boundary

The complete registry remains available to build-time and server-side consumers. The initial response supplies a bounded useful listing, and a deferred public search projection supplies only discovery fields such as identity, title, description, category, locale, and public path. Bodies, source URLs, provenance, hashes, and decision-ledger data stay outside the public search projection.

Search enhancement failure preserves the server-rendered listing. Implementation acceptance uses a reproducible `/tech-center` baseline and permits at most 30 KiB of additional initial JavaScript. The 30 KiB figure is a pending target rather than a measured result; the current P1 verifier measures the root route and requires extension for `/tech-center`.

## Site Variant outcome matrix

| Site Variant | Simplified Chinese route | Canonical and indexing | Redirect and sitemap outcome |
|---|---|---|---|
| China Site | Owner-relative root path, such as `/reference/example` | Self-canonical and indexable | Included in the China Site sitemap |
| International Site | Explicit `/zh/reference/example` request | Canonical ownership remains on the China Site | Exact query-preserving 301 to the China Site root path; Chinese technical pages stay out of the International Site export and sitemap; unpublished unprefixed paths return 404 |
| Preview Host | Locale-prefixed review path, such as `/zh/reference/example` | `noindex,nofollow` with production-owner canonical metadata when an owner exists | Review representation renders directly and stays out of the production sitemap and redirect policy |

Probe routes are bounded build implementation details and carry no architectural authority.

## Implementation acceptance matrix

| Requirement | Authoritative evidence | Runnable verification |
|---|---|---|
| Archive and package evidence | Baseline commit, candidate inventory, exclusions, size, SHA-256, bounded regex scan | `stat`, `shasum -a 256`, archive inventory review, documented regex scan |
| Manifest and ledger schema | Unique Technical Page Identities, operations, provenance, corrections, denials, approved exceptions | `<technical-content source verifier/check command>` plus schema-drift regression |
| Source content and security | Frontmatter, 454 accepted records, four updates, 450 net-new identities, six denied identities, three retained intent pairs, credential sanitation | `node --test <focused technical-content verifier regression file>` and source verifier check mode |
| Import mutation boundary | External source supplied explicitly; routine build reads committed repository authority | `<technical-content importer --check --source ...>`; write mode requires an explicit source argument |
| Search projection | Public-field schema, deferred load, fallback, complete 1,122-identity coverage | Focused technical-content regression test and built projection count check |
| Initial JavaScript budget | Reproducible `/tech-center` baseline plus 30 KiB ceiling | `<technical-content artifact budget verifier>` against the production artifact |
| China Site export | Owner-root HTML, canonical, JSON-LD, sitemap membership | Production-style China build and future technical export verifier |
| International Site export | Explicit `/zh` 301, query preservation, competing-copy absence, unpublished unprefixed 404 | Production-style International build, redirect fixture checks, future technical export verifier |
| Preview export | Locale-prefixed HTML, `noindex,nofollow`, production canonical, sitemap absence | Production-style Preview build and future technical export verifier |
| Release orchestration | Source checks, focused regression, three variant artifacts, release regression | `npm run verify:release` in its required case-sensitive environment |

Required implementation validation remains pending:

```text
npm run lint
npx tsc --noEmit
npm run verify:release-regression
npm run verify:content-hygiene
node --test <focused technical-content verifier regression file>
<technical-content source verifier/check command>
production-style cn, io, and preview builds
<technical export verifier per variant>
npm run verify:release
```

Placeholder command names must be finalized during implementation. The current repository has no dedicated E2E runner; artifact-level variant verification is the required release evidence for the static export.

## Documentation validation

The exact local documentation set received ChatGPT Pro `FINAL_ACCEPTED` after the acceptance matrix replaced an unfixed command name with `<technical-content artifact budget verifier>`.

| Check | Result | Evidence |
|---|---|---|
| Dependency restore | Passed | `npm ci`; 667 locked packages installed and no dependency or lockfile change remained |
| Diff and document shape | Passed | `git diff --check`; no trailing whitespace; ADR `0008`-`0011` are each one heading plus one 1-3 sentence decision paragraph |
| Lint | Passed | `npm run lint`; Babel reported size-only deoptimization notices for the existing large FAQ files |
| TypeScript | Passed | `npx tsc --noEmit --incremental false` |
| Node regressions | Passed | `node --test scripts/*.test.js`; 117 passed, zero failed |
| Source content contract | Passed | `npm run verify:content-hygiene`; 715 source files checked |
| Release source contract | Passed | `npm run verify:release -- --source-only`; SEO, content, route, FAQ, TypeScript, and Guide checks passed |
| China production-style build | Passed | 3,697 static pages generated; 3,694 HTML files passed hygiene; P0/P1/P2, i18n SEO, FAQ metadata, FAQ SEO graph, redirects, Guide export, and Contact checks passed |
| Preview production-style build | Passed | 3,641 static pages generated; 3,631 HTML files passed hygiene; P0/P1/P2, i18n SEO, and Contact checks passed; sampled `/zh` technical HTML had `noindex,nofollow`, China canonical metadata, and no Preview sitemap |
| International production-style build | Passed | 1,477 static pages generated; 1,460 HTML files passed hygiene; P0/P1/P2, i18n SEO, FAQ metadata, FAQ SEO graph, redirects, Guide export, and Contact checks passed |
| Initial JavaScript | Passed current root budget | P1 reported 258.9 KiB gzip for CN, Preview, and IO against the existing 260 KiB root budget; `/tech-center` still lacks the future dedicated baseline |
| IO technical ownership sample | Passed | Explicit `/zh/tutorial/private-deployment-topology` HTML absent; worker redirect targets the China Site, preserves the query string, and the IO sitemap contains no `/zh` technical URL |
| Full release coordinator | Environment-blocked after source checks | `npm run verify:release` stopped at its required case-sensitive-filesystem probe; Docker was unavailable, while the three production-style builds and their artifact checks had already passed independently |
| E2E | Unavailable | The repository has no dedicated E2E runner; validation used real static exports and artifact verifiers, with no claim of live production behavior |

`npm audit --omit=dev` reported five high-severity production dependency advisories affecting the existing `next`, `postcss`, `nanoid`, `picomatch`, and `sharp` dependency graph. This documentation change does not alter dependencies, and no audit fix was applied.

No commit, push, pull request, deployment, database operation, production configuration change, production feature activation, or real-user data operation belongs to this review.
