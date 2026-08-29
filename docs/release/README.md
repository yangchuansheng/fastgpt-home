# Week05 release-readiness evidence

`npm run verify:release -- --keep-artifacts` writes the auditable record to
`.release-artifacts/release-verification.json`. The record includes source provenance,
static-export inventories, checksums, timestamps, evidence-tier states, and the bounded
rollback inventory.

Solutions preview HTTP evidence is a cross-project input. The owner repository can run the
stdlib HTTP runner against an approved target with a contract containing `requests` named
`root`, `routes`, `robots`, `sitemap`, `canonical`, `internal-links`, and `projections`:

- `root` uses `/`; `robots` uses `/robots.txt`; `sitemap` uses `/sitemap.xml`.
- Every required request has a body assertion, and `canonical` has an exact canonical URL assertion.
- Required request paths are distinct except for an optional canonical probe.
- `projections` declares `X-Robots-Tag: noindex, nofollow` and `Content-Type: text/plain`.
- Each response records its expected HTTP status and one unique body artifact.

```bash
npm run verify:solutions-preview -- \
  --target https://approved-preview.example \
  --approved-target https://approved-preview.example \
  --contract path/to/solutions-preview-contract.json \
  --output path/to/solutions-preview-http.json
```

The contract includes the owner repository, a 7-64 character commit SHA, and
`approvedTarget: true`. The separate `--approved-target` value is the trusted target input
for the release gate. The runner identifies itself with its producer/version marker,
persists response bodies under the output sibling directory, and records response headers,
byte counts, per-response artifacts, and SHA-256 values. Attach the resulting JSON and its
`<output-basename>-responses` directory to the coordinator with:

```bash
npm run verify:release -- --keep-artifacts \
  --solutions-approved-target https://approved-preview.example \
  --solutions-evidence path/to/solutions-preview-http.json
```

The coordinator records `not-provided` and a release blocker when this input is absent. It
keeps `source-verified`, `export-verified`, `preview-http`, `release-eligible`,
`production-observed`, and `search-observed` as separate evidence tiers. The persistent
record embeds the [issue #247](https://github.com/labring/fastgpt-home/issues/247) URL and
lives at `.release-artifacts/release-verification.json`.

Pull-request CI adds `--allow-missing-solutions-evidence` so source and export verification
can complete with a release-ineligible record. Manual release runs remain strict and require
approved Solutions evidence.

## Documentation host owner-routing evidence

`npm run verify:documentation-host -- --cn-target <https-url> --io-target <https-url> \
  --contract scripts/fixtures/documentation-host-contract.json --output <json>` runs the
external docs black-box contract with production targets supplied by the release operator. The
contract checks owner HTTP 200/self-canonical pages, direct cross-host 301s with query
preservation, reciprocal `zh-CN`/`en` hreflang, owner robots/sitemap signals, and the 203-path
English audit sample. Responses are captured under `<output-basename>-responses/`.

Pass `--rollback-input <json>` to provide the tested host-scoped rollback unit when it is kept in
a separate release artifact. The contract fixture records the previous revision and restore paths;
the runner never assumes an external docs production target.

## Week06 English Technical Page tracer evidence

`npm run verify:week06-english-tracer` validates the accepted `week06-0006` English Technical Page
tracer against the closed authority. The fixture covers source and decision provenance, the IO
owner-relative route with HTTP-equivalent 200 and a self-canonical, CN owner isolation, the
locale-prefixed Preview review route with the IO production canonical and `noindex, nofollow`,
English hub/category/featured/search identities, deferred locale search data with the bounded
initial-listing fallback, sitemap membership, and content hygiene.

Run the focused regression suite with:

```bash
npm run verify:week06-english-tracer-regression
```

Week06 Wave 0 remains a dry run with publication count and public-page delta at zero. The
production Technical Page registry remains at 1,372 entries and the tracer verifier records a
registry delta of zero. The evidence fixture and verifier are tracked with [issue #261](https://github.com/labring/fastgpt-home/issues/261).

## Week06 model and glossary tracer evidence

`npm run verify:week06-model-glossary-tracers` validates one Simplified Chinese glossary tracer,
one Simplified Chinese model tracer, and one English model tracer against the closed Week06
authority. The dry-run fixtures prove localized category labels, CN/IO owner-relative routes,
locale-prefixed Preview review routes, canonical/robots/structured-data signals, locale-scoped
hub counts, search and fallback listings, sitemap ownership, content hygiene, and zero owner leaks.

Run the mutation regression suite with:

```bash
npm run verify:week06-model-glossary-tracers-regression
```

The verifier retains the issue #261 English tracer baseline and keeps the 1,372-entry production
registry byte-stable while Week06 Wave 0 remains a zero-publication dry run. This evidence is
tracked with [issue #264](https://github.com/labring/fastgpt-home/issues/264).

## Week06 bilingual Technical Wave 0 readiness

`npm run verify:week06-wave0-readiness` closes the issue #265 dry-run record by composing the
closed Week06 authority with the real issue #261 and #264 tracer verifiers. It freezes the
authority release digest, requires zero unresolved identity, duplicate, evidence, credential,
privacy, operation-risk, comparison-routing, and hygiene findings, and verifies CN, IO, and
Preview owner routing, canonical, robots, sitemap, structured data, isolation, localized hubs,
search projections, and bounded fallbacks.

The contract records the 1,372-page pre-Wave 1 registry, the approved initial-JavaScript baseline,
both locale search projection sizes, and the deterministic completed-tracer export file count,
bytes, digest, and reference build duration. The duration points to a frozen five-sample measurement
with its command, environment, measurement ID, median, and export digest. Registry, search, sitemap,
static-export, internal-link, and release-record deltas stay at zero through byte-stable repository
artifacts and reproducible completed-tracer sitemap and HTML outputs. Its release and rollback
manifests share one baseline digest and the staged write regression proves that a partial write
restores the real bytes for every mapped artifact.

Run the mutation coverage with:

```bash
npm run verify:week06-wave0-readiness-regression
```

The top-level release coordinator runs both commands and records `source-verified`,
`export-verified`, `governance-complete`, and publication count zero. Wave 0 keeps publication
count at zero and preserves the production registry byte-for-byte.

## Week06 comparison candidate gate

`npm run verify:week06-compare-disposition` validates the three Week06 comparison candidates
against the existing Dify, RAGFlow, MaxKB, and self-build identities. It records one merge into
the existing bilingual MaxKB comparison and two denials, while keeping generic Technical Page,
search, sitemap, and static-export deltas at zero. Official evidence is HTTPS-only and the
release/rollback manifests retain the exact merged identities.

Run the focused regression suite with:

```bash
npm run verify:week06-compare-disposition-regression
```

## Week05 Wave 2 observation gate

`npm run verify:technical-wave-observation` validates the retained production, search,
capacity, rollback, and next-slice evidence for issue #263. The authority record freezes the
1,372-page candidate baseline and the exact 200-identity rollback surface. It currently exits
nonzero because the full-wave production probe observed 200 HTTP 404 responses, zero sitemap
memberships, an incomplete 72-hour window, absent 14-day search evidence, and incomplete
capacity measurements.

The next 200 accepted official-source candidates remain recorded as a candidate-only slice.
Issue creation stays gated until the observation verifier passes; the retained slice contract
requires the new issue to carry `ready-for-agent` and the native block edge
`{ issue: 263, nativeEdge: "blocks" }`.

Run the mutation coverage with:

```bash
npm run verify:technical-wave-observation-regression
```

## Customer migration release evidence

`npm run verify:customer-migration-release -- --contract <json> --output <json>` runs the
manifest-derived 231-source contract against both the approved preview and production origins.
The release contract records the repository revision, approved origin pair for each environment,
the tested previous ingress revision and migration digest, and a 72-hour observation containing
404, 5xx, redirect, canonical, and crawl-file metrics. The runner retains response headers and
metadata in the JSON output and response bodies in `<output-basename>-responses/<environment>/`.

Use `scripts/fixtures/customer-migration-release-contract.json` as the reproducible contract
shape. Replace its environment targets and observation values with the release-approved inputs,
then retain the JSON output and response directories as the production evidence bundle.
