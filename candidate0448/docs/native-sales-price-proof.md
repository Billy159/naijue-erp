# Native SALES preparation and persisted nine-price proof

## Implemented, opt-in only

- `validateCompleteCataloguePrices`: all nine own keys; explicit null differs from absent, undefined, blank or zero. Exact nonnegative decimal text, existing SQL `decimal(18,2)` boundary, no rounding.
- `createCatalogueSourcePriceProof`: explicit native product binding, current version, canonical nine prices, actual original Chinese source keys. `EXPLICIT_NULL_ONLY` accepts literal raw null. The separately reviewed `V03_EXACT_PRICE_COLUMN_BLANK_IS_UNSET` policy also accepts an **existing** raw key containing exactly `""`; omitted keys, whitespace, unknown cells and formulas never become unset.
- `insertValidatedCatalogueSourceProof`: caller-owned import transaction locks a reviewed open batch and real product, recomputes proof from source values, checks equality against native prices, inserts immutable `import_source_row`. It does not create a batch, create products, publish, commit, or supply an HTTP import endpoint. Preserve original source hashes and normalized row, not a replacement hash over derived data.
- `PostgresImportedCatalogueCompletenessVerifier`: original SALES transaction reads published validated source evidence, explicit native binding, raw inputs, proof version and all nine current prices under locks. No schema-only success, constant toggle or global cache. Absent/staged/ambiguous/stale evidence fails closed. A source key is never treated as a native UUID.
- `createNativeSalesPreparation`: manual SALE-only proposal prepares a complete existing `SalesDraft`, server-generated IDs/number, native enabled MAIN snapshots and current product reference prices. Exact discounts and minimum-price rules apply. Authorization precedes sensitive facts; preparation makes no document, receipt, audit, or stock writes.
- `createNativeManualSalesBusinessRules`: new/replaced snapshots require current MAIN/reference facts. Unchanged stored observations remain historical. SAVE and APPROVE still revalidate native catalogue proof/current access in their own transactions.
- `nativeManualSalesPreparation: true` on authenticated composition installs BOTH prepare and native write revalidation. Default has no `/sales/prepare-create` route. No read-only host is automatically enabled.

## Wire and bounded transport

`POST /sales/prepare-create` accepts `NativeSalesCreateProposal` only, not browser labels, reference/minimum authority, totals, IDs or numbers. Currency proposal fields are exact **yuan strings**; response uses existing exact minor-unit strings. UNIT_PRICE has `discountTenths:null`; DISCOUNT has `dealPrice:null`. At most 200 lines / 3 settlements. Frontend required fields are unchanged.

Shared `sales-payload-budget.ts`: preparation 128 KiB, SAVE 512 KiB, prepared response reserves 1 KiB for envelope. Actual UTF-8 serialized bytes are checked; long labels are rejected explicitly, never truncated. New catalogue/snapshot failures return explicit 409, oversize 413. Preparation does not reserve an ID or authorize a later SAVE; caller sends stable SAVE request key and `expectedVersion:null`, using existing receipt recovery.

## Verification and outstanding activation work

Unit/protocol tests are synthetic, not PostgreSQL execution. `tests/integration/catalogue-completeness-acceptance.ts` is a non-auto-running real engine helper restricted to the existing disposable test database/role and exact schema 1–11; it needs a genuinely published synthetic source fixture. Its source existence is NOT a passed engine test.

The approved migration 0011 owns source storage/publication checks. No SQL was executed by this implementation. No real import, production connection, deployment, push or commit. The complete importer must call the proof writer for eligible source rows and publish only after the ordinary batch checks; an aggregate preflight result is not per-product proof. Live product CREATE evidence is not provided by the import-origin verifier and must not be faked via a historical batch. Host activation and frontend integration are explicit separate work.

## Explicit host wiring (not executed)

Use `new PostgresSalesUnitOfWork(pool, { catalogueCompleteness: new PostgresImportedCatalogueCompletenessVerifier() })` only on the reviewed imported-catalogue profile. Pass that unit of work plus the existing current authorization, clock, IDs and economics providers into authenticated document commands with `nativeManualSalesPreparation:true`. This installs the manual profile in addition to existing policy. Do not swap in a constant verifier or use this constructor as proof that the database is populated/published. Current read-only hosts remain unchanged.
