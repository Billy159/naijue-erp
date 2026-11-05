# Native inventory ledger read boundary

This separate, opt-in plugin is not registered by an application root. It creates no listener, pool, credentials, schema, or UI. It requires the same explicitly supplied inventory warehouse/hall authorization provider and trusted session/Origin authenticator as inventory matrix reads. No runtime fallback or client-selected scope exists.

## Fixed wire DTO

POST `/inventory/ledger/query`, JSON body with exactly:

- `warehouseId`: one canonical native UUID.
- `skuId`: one canonical native UUID.
- `pageSize`: integer 1–200, a technical response bound.
- `after`: null initially, otherwise exactly `{ postedAt, entryId }`. Timestamp is an actual UTC timestamp formatted `YYYY-MM-DDTHH:mm:ss.ffffffZ`; ID is the last displayed native ledger entry ID. No cursor field grants access or changes the exact target.

The response is exactly `{ pageSize, labelBasis, warehouse, sku, entries, nextCursor }`:

- `labelBasis` is `CURRENT_REFERENCE`, not a historical document snapshot.
- `warehouse`: `{ id, hallId, label }` from trusted current native warehouse/hall facts.
- `sku`: `{ id, code, product: { id, code, name }, color: { id, label }, fit: { id, code, label }, sizeGroup: { id, label }, size: { id, code, label } }`. Size code can be null or empty exactly as stored; size identity and full name are retained, not derived from code. Canonical product size-group membership is verified.
- Each entry: `{ id, operationId, eventKind, quantityDelta, source, sourceDocumentVersion, reversesEntryId, businessDate, postedAt }`. Delta is a nonzero signed-bigint decimal string. Timestamp retains all PostgreSQL microseconds. Reversal is present only for UNAPPROVE. Document version is a positive PostgreSQL integer for native document effects and null only for cutoff baseline.
- Source is exactly one of `{ kind: "SALES", salesId, salesLineId, endpoint: "SALES_WAREHOUSE" }`, `{ kind: "TRANSFER", transferId, transferLineId, endpoint: "FROM" | "TO" }`, or `{ kind: "CUTOFF_BASELINE", importBatchId, endpoint: "IMPORT_BASELINE" }`.
- `nextCursor` is null at the end, or exactly the last returned entry's `{ postedAt, entryId }` when one additional row exists. There is no total count, running balance, reconstructed legacy contribution, or source document detail permission.

Headers expose `X-Inventory-Read-Reference`, `X-Inventory-Readiness: ready`, `Cache-Control: no-store`, and `Pragma: no-cache`. Authentication precedes parsing. Unknown fields, query strings, invalid JSON, non-JSON media, malformed IDs/cursors and oversized bodies fail closed. Unknown trusted provider/SQL details are never returned.

## Snapshot and pagination

One acquired client runs `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`. Exact native warehouse/hall and SKU existence/identity are verified, followed by constant-size published-cutoff/final-approval, exact published warehouse/SKU membership, and the same exact table/trigger/constraint/index capability evidence used by the inventory matrix reader. The shared guard SQL is unchanged; it is capability evidence, not protection against a privileged owner temporarily disabling and corrupting guards. A staged/unpublished baseline is not displayed. No published cutoff or missing exact-key publication fails with INVENTORY_NOT_READY; contradictory/malformed publication or missing guard capability fails closed as an integrity error. Ready empty ledger history remains an actual empty page. Native historical line IDs are joined only for their owning document ID; current editable line SKU/labels are not used to overwrite immutable ledger facts. Private import source payloads, file references, manifests, hashes and credentials are not selected for display.

The ledger SQL is limited to the exact authorized warehouse+SKU and uses `(posted_at, id) < (after.postedAt, after.entryId)`, ordered by `posted_at DESC, id DESC`, with `LIMIT pageSize+1`. At most that bounded set enters application memory. New rows above the cursor do not shift subsequent pages; separate HTTP pages do not share one long-lived snapshot, and later backdated rows below the cursor can still become visible. Reusing a cursor with a different target only constrains that separately reauthorized target. Only the existing warehouse/SKU key index is available; ordered pagination may still sort, and no new ordering index/schema change or database performance proof is claimed.

Scripted protocol/API tests establish source and control-flow contracts only, not execution of PostgreSQL, production session/CSRF composition, browser behavior or deployment.
