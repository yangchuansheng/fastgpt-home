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
