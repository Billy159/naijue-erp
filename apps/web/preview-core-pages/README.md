# Three core readonly pages: TEST ONLY portable derivative

This preview mounts the actual shared `DemoFrame`, actual inventory page,
actual sales host/detail and actual transfer host/detail. Its new providers
contain only deterministic synthetic native DTOs. It does not import prior
private fixtures, production data, HTTP readers, authentication or write ports.
The test notice and read counters are outside the business components.

The portable HTML is an offline/downloadable **test file**, not a deployment.
All route/action modules and CSS are bundled into one file, but the actual
scoped route/action/tab lifecycles still control module initialization and
provider reads. This does not establish production code splitting, lazy CSS
network timing or performance. The separate production application build uses
explicit route/action assets; this preview deliberately inlines sales detail CSS
and supplies an explicitly resolved test-only readiness callback. That is not
proof of production lazy CSS. Missing actions stay disabled. Customer/supplier navigation is not
enabled in this three-page derivative. No login is simulated.

Fixtures cover:

- Known negative stock, explicit known zero and non-applicable size cells.
- Two distinct FIT identities and the full supplied source-order size labels.
- A generated sale and return with exact signed quantities/minor-unit amounts.
- One native transfer, sparse persisted nonzero lines, current canonical
  catalog metadata and explicitly separate saved snapshots.
- Target-only product basics/specifications and a truthful empty image state.

From repository root, after application/transfer review and the committed
coherent UI checkpoint:

```sh
node_modules/.bin/tsc -p apps/web/preview-core-pages/tsconfig.json
node apps/web/preview-core-pages/build.mjs <exact-reviewed-runtime-commit>
node apps/web/preview-core-pages/smoke.mjs <exact-reviewed-runtime-commit>
```

Open `artifacts/<commit-prefix>/three-core-pages-synthetic-test-only-<commit>.html` directly in a browser.
Click the left menu. Inventory/sales require their actual Query button;
transfers load their actual first list page on route activation. Click a
document number/View for details. Inventory/transfer product actions open the
actual read-only product drawer. Sales detail is a full-page read-only document
with visible Back, not a modal; its retained list returns without refetch.
Nothing reads a real service or writes data.

Each checkpoint gets a separate artifact directory, preserving earlier delivered
HTML and verification files as historical evidence rather than rewriting them.
Its `verification.json` names the exact coherent source commit and lists exact
source input/leaf hashes, with preview-only derivative hashes kept separate.
The builder refuses any actual UI/native runtime input that differs from the
named commit, and fails if frozen sources change while building.
`smoke.mjs` executes the built HTML
in an isolated JSDOM document, denies every unexpected resource request,
and verifies all three actual routes, bounded reads and dismissal cleanup.
It is DOM smoke only, not browser, pixel, performance or Space verification.

The 262,144-byte embed cap is measured, never worked around by deleting
features. Larger output remains a downloadable file below the 10 MiB
reference-upload limit. No Site or local network listener is created.
