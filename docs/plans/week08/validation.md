# Week08 handoff validation

Recorded 2026-09-08 against baseline `66be9bbabf1cae1c3b8bc08ad75a3030e9738bbb`.
This record validates a planning deliverable and its source boundary. The 38 new pages and
797 return paragraphs remain execution-plan work. GitHub issue states and deployment state
are separate from the local decision dispositions.

## Automated checks

| Check | Observed result |
| --- | --- |
| `node --test scripts/verify-week08-handoff.test.js` | Passed: complete inventory; rejection of duplicate pages/edges, invented locale, wrong host, body drift, invalid target and unsafe source path. The first run failed on the absent implementation before the verifier was written. |
| `node scripts/verify-week08-handoff.js --delivery-root /path/to/fastgpt-data` | Passed: 38 source-file hashes, 38 absent target identities, 797 registered original bodies and all expected forward links. |
| `npx tsc --noEmit` | Passed after reusing a complete local dependency installation matching Next 16.3.2, React 19.2.6 and TypeScript 5.9.3. |
| `npm run verify:release -- --source-only` | Passed, including its source checks, regressions, TypeScript, Lint and Guide content check. |
| `node --test scripts/*.test.js scripts/lib/*.test.js` | 198 tests: 197 passed; one export-dependent test failed because this checkout has no `out/` directory. |
| `git diff --check` | Passed. |

The export-dependent failure is `scripts/verify-content-sidebar-cta.test.js:181`, whose first
assertion requires the complete static export. Its source and the application code remain
unchanged in this handoff. Retain it as an outstanding export gate for E6. Initial dependency
installation hit ENOSPC; the incomplete directory was removed and a complete existing local
installation was used for source validation. Full production export was not performed; it
requires the case-sensitive release environment and lockfile-matched dependency installation.
No Preview-host or production-host reachability or search-indexing evidence is asserted here.

## Representative rendering observations

An isolated local HTML preview used the repository's actual `MarkdownContent.tsx` and
`markdownParser.ts`, transpiled with the existing TypeScript dependency, and the existing
technical article CSS. Input was each manifest-pinned delivery body with front matter removed.
The preview supplied UTF-8, viewport metadata and global border-box sizing. Its simple review
frame exposes the shared renderer; full Guide/Technical Center shells remain E3/E6 acceptance.
The local artifacts are under `.scratch/week08-preview/`; they are review assets outside the
published route set. Five pages were opened with agent-browser at 375×812.

| Page | Tables | Body rows | Body links | TOC anchors missing | Viewport / document width |
| --- | ---: | ---: | ---: | ---: | --- |
| zh landscape | 2 | 13 | 11 | 0 | 375 / 375 |
| zh container issue list | 1 | 146 | 152 | 0 | 375 / 375 |
| zh deployment matrix | 1 | 3 | 4 | 0 | 375 / 375 |
| zh environment Reference | 16 | 141 | 0 | 0 | 375 / 375 |
| en workflow issue list | 1 | 37 | 44 | 0 | 375 / 375 |

The Reference's 141 body rows comprise four legend rows plus 137 variables. Its first data
table had a 257 px container and 945 px content width at mobile size; changing `scrollLeft`
to 400 succeeded. The 16 scroll containers expose `tabIndex=-1`; keyboard accessibility needs
the explicit wrapper work in E3. Native scroll support was observed independently of keyboard
acceptance. The deployment matrix was also viewed at 1440×1000.
The English workflow list was additionally viewed at 1440×1000 with all 37 rows and a
1440 px document width.

Visual review covered the Reference mobile heading/TOC and scrolled data table and the desktop
matrix. Structural measurements covered all five pages. Observed findings and disposition:

1. Four environment-table rows split into extra cells because of escaped pipe characters:
   `MILVUS_LANGUAGE_IDENTIFIER`, `STORAGE_DOWNLOAD_URL_MODE`, `LOG_ENABLE_CONSOLE`, `AGENT_ENGINE`.
   E3 must repair the shared row tokenizer and verify the delivered four-column rows.
2. The Reference renders zero body links. E2 must add the pinned, descriptive public citations.
3. Native table overflow stays inside the page, and generated TOC targets exist. E3 still
   verifies actual keyboard interaction, complete shell/CTA behavior and final normalized links.

The implementer accepts reuse of the existing page shells and table/TOC design, with these
bounded implementation gates. This is delegated design disposition and observed prototype
evidence; human review and completed-export browser acceptance have their own later records.

## Standards review

Independent review against the repository baseline found one P2 issue: the verifier allowed
Reference records to claim the Guide namespace when their URL/destination changed together.
A mutation test reproduced the acceptance error. An explicit kind-to-namespace assertion now
rejects it, and the focused tests plus complete delivery preflight pass.
The original Standards reviewer rechecked the fix: zero unresolved findings.

## Spec review

Independent review of #289 and all six children found one P2 issue: the U1 live gate asked for
all 38 URLs before U2 existed. The release plan now checks 12 URLs in U1 and the cumulative
38 in U2, with an explicit accepted cumulative set for any split release. The reviewer verified
exact set equality for all 38 URLs and 797 backlink edges against the original CSV attachments.
The original Spec reviewer rechecked the corrected gate: zero unresolved findings.
