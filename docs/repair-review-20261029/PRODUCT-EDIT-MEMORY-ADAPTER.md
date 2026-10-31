# Limited product EDIT service adapter (not browser-ready yet)

Test-only `product-edit-fixture.mjs` uses actual product maintenance service and registers original HTTP plugin. Serial-tail copy-on-write rows/receipts/audit, transaction lifetime guard, current declared synthetic account/staff role/hall check; only EDIT/DETAIL/CANDIDATES/RECEIPT allowed. Existing product name/prices only; all other root fields and complete SKU/barcode aggregates must remain equal. Full known size-group members are supplied for service skuSelection handling, not a fabricated empty subset. No media stage, creation, delete, enable/disable or new SKU IDs. Null seasons/prices retained.

Native test-first missing-module RED then final `product-edit-green.log`8/8: 4 new service cases (edit/replay, concurrent CAS, prepare/complete rollback, scope/identity denial) plus4 existing read-adapter tests. Registered HTTP routes have not yet been exercised here. This checkpoint does NOT provide browser bridge/projections or claim actual UI save, PG or full product maintenance acceptance.

Next required: original HTTP response/receipt tests; current detail/prices/basics/list projections from committed store, not static QA facts; headed original UI save→readback→reopen. Keep adapter out of live user preview until those boundaries tested. Parentheses: receipt-key owner currently only PRODUCT; do not combine catalogue family without shared key-conflict tests.

## HTTP/finite current projections checkpoint
Original HTTP v2 SAVE + GET receipt exercised; current basic/name, nine prices and product-management list read committed rows. No document/history rewrite. Exact isolated product bridge refuses combination with sales/transfer/staff/edit-read stores. Its browser configuration disables inventory/document routes; this is not a general shared live ERP backend. Unhandled writes remain denied.

Independent review prompted binding receipt lookup to previously verified transaction actor instead of invented null hall, retaining actual candidate reader, and rechecking authority before complete. Native14/14 (`product-edit-http-matrix.log`) covers lifecycle actions/FK/season/SKU/barcode/media scope refusals, legal warehouse, concurrent same-key replay, failure recovery, original money errors/no-change, HTTP candidates/unknown/external targets, 100-item capacity and old-key replay. All failures preserve rows/receipt/audit. First HTTP read bridge attempt omitted required same-origin credential mode and failed; correction used the existing read contract, not relaxed authentication.

Current browser build/save still pending at this checkpoint. Direct service tests and original HTTP/inmemory passes are NOT headed UI or PG evidence.

## Actual headed result
Fixed9beb6066 separate config: product-edit-first exit0. Existing product name/zero purchase/123.45 retail→real command v2→readonly prices (remaining null staysdash)→list updated→actual list Edit→same committed values. Exactly one write response200/version2; screenshots recorded and list pixels inspected. Initial build configuration failed strict child dependency (salesProductFullPage true while sales false); corrected both child flags tofalse, not weakened parser, independent build2 exit0. No user live window replaced.
