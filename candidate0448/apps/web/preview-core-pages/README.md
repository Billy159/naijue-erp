# Three core readonly pages: TEST ONLY portable derivative

This preview mounts the actual shared `DemoFrame`, actual inventory page,
actual sales host/detail and actual transfer host/detail. Its new providers
contain only deterministic synthetic native DTOs. It does not import prior
private fixtures, production data, HTTP readers, authentication or write ports.
The test notice and read counters are outside the business components.
The preview-only chrome keeps a short prominent synthetic-data/no-login/no-DB/
no-write notice. The full safety/technical explanation and live read counters are
still available inside a native details disclosure that starts closed, avoiding
the earlier large yellow notice and expanded footer during manual comparisons.
This does not modify the real application frame or imply visual acceptance.

The portable HTML is an offline/downloadable **test file**, not a deployment.
All route/action modules and CSS are bundled into one file, but the actual
scoped route/action/tab lifecycles still control module initialization and
provider reads. This does not establish production code splitting, lazy CSS
network timing or performance. The separate production application build uses
explicit route/action assets; this preview deliberately inlines sales detail CSS
and supplies an explicitly resolved test-only readiness callback. That is not
proof of production lazy CSS. Missing actions stay disabled. Customer/supplier navigation is not
enabled in this three-page derivative. No login is simulated.

The inventory page-size action also uses the existing explicit
`data-inventory-inline` style marker: esbuild collects its component-local CSS
into this portable file, so the actual dynamic action's readiness gate need not
request a separate stylesheet. The preview does not change the production
focus/open-only module and CSS policy or install a fallback native select.

Fixtures cover:

- Known negative stock, explicit known zero and non-applicable size cells.
- Two distinct FIT identities and the full supplied source-order size labels.
- Default hidden-FIT read-only warehouse aggregates, with the real source rows
  restored by display settings without another inventory read.
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
The built-artifact smoke additionally opens the real Arco page-size action,
checks its actual 100/200/500 options and configured 150px popup, verifies default
hidden-FIT aggregation and no-read FIT toggles, and exercises the three-section
product specifications plus full-page sales/transfer return behavior. These are
synthetic DOM/configuration observations, not computed visual geometry or pixel
acceptance. Original source/fixture facts remain separately hashed.
The transfer warehouse popup uses the unchanged finite two-warehouse fixture to
check its matching/selected toolbar, all-selected checkboxes, one action-only
bounded candidate read, no manual paging footer and close cleanup. This fixture
does not claim multi-page scrolling or the 200-candidate bound was exercised by
the portable smoke; those need the dedicated transfer lifecycle tests.
It is DOM smoke only, not browser, pixel, performance or Space verification.

The 262,144-byte embed cap is measured, never worked around by deleting
features. Larger output remains a downloadable file below the 10 MiB
reference-upload limit. No Site or local network listener is created.
