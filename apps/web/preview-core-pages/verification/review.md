# TEST ONLY portable three-page preview: bounded verification

PASS against exact reviewed runtime commit
`38a1a9d00ce5060879af409c6e7e1febad07ab5f`.

Generated deliverable, deliberately excluded from Git:

- `artifacts/three-core-pages-synthetic-test-only-38a1a9d00ce5.html`
- 1,364,619 UTF-8 bytes.
- SHA-256: `e24befa91f2909a69c386a183be2dd252a8d90f9a5cce8a7cafb862489084374`.
- Above the 262,144-byte inline cap, below the 10 MiB reference-file limit.
  No source features, Arco controls or styles were removed to force embedding.

The file uses the actual shared DemoFrame and actual inventory, sales and
transfer readonly leaves. Its explicit generated providers are isolated in
the preview directory, with no prior private fixture import, credentials,
real data, authentication simulation or write ports. The test notice and
read diagnostics are outside business UI. Missing commands remain disabled.

Passed commands:

```sh
node_modules/.bin/tsc -p apps/web/preview-core-pages/tsconfig.json
node apps/web/preview-core-pages/build.mjs 38a1a9d00ce5060879af409c6e7e1febad07ab5f
node apps/web/preview-core-pages/smoke.mjs
```

The built-file smoke passed five groups:

1. Actual shared menu enables exactly three routes, with no initial/idle reads.
2. Inventory Query renders known negative/zero/non-applicable stock, separate
   FIT identities and full labels. Product basics/specs/images are action-only,
   target-bounded reads; closing removes the drawer facts.
3. Sales Query renders exact native sale/return DTOs. Detail actions read one
   selected document, preserve the list without refetch and cannot revive after
   close during a pending read.
4. Transfer activation/query/full-page detail uses the actual native sparse
   matrix, distinguishing legal blank cells from unsupported SKUs. Full FIT/
   size names, separate saved snapshots and shared product actions work.
   Return clears detail while preserving the successful list and focus.
5. Close/Back/route re-entry create fresh scopes, clear stale facts and reject
   late detail revival. External resources, network attempts and runtime
   errors were all zero in the isolated JSDOM execution.

One initial harness assertion incorrectly searched the entire body, including
the inline script's fixture constant, for stale product text. It was corrected
to inspect the actual React root, without changing runtime/source UI. The
complete final smoke then passed against unchanged HTML bytes.

Final provenance recheck passed: all 67 consumed UI/native runtime inputs
match the named commit, and the 12 preview-only source files plus delivered
HTML were unchanged after the final smoke. Preview-only code is separately
hashed; it is not claimed to be part of the runtime commit.

Evidence:

- `verification.json`: runtime commit, exact consumed leaf hashes, isolated
  preview hashes, byte limits and final smoke result.
- `source-inputs.sha256`: full runtime+preview input manifest;
  SHA-256 `faa4a72f7fb493aaba0c13a7d2070cc95266cfd9197c54f87640b525f7792d94`.
- `preview-source.sha256`: 12 preview-only source files;
  SHA-256 `87e6c7ac22cc15c43b7c905ea6c81f4f931f34f020bf2ffcaae1c31b4499d2da`.
- `typecheck.log`, `build.log`, `dom-smoke.log`, `final-provenance.log`.

Scope limits: this is local source/synthetic built-artifact DOM verification,
not native-browser, screenshot/pixel, real-data, production readiness,
network-waterfall/performance or Space embed acceptance. The all-in-one
derivative does not replace or prove the separate production lazy build.
This worker performed no upload, Site publication, network listener, database,
credential, installation, root-package edit, production UI edit or commit.
