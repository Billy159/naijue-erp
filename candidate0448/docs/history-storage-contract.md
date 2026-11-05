# Historical storage slice (0011 SQL source)

## Status and limits

Approved separate history storage is implemented as **source only**, with source-contract and synthetic scalar validation tests. No PostgreSQL startup, migration execution, database import, backup/restore, production change, or UI integration is claimed. Local PostgreSQL startup is blocked by the reported Unix socket denial/platform bootstrap escalation failure; this work did not retry via another route.

The frontend/live SAVE required fields and native sales/transfer constraints are unchanged. Unknown historical actors, approval times, line discount/gift/pricing facts stay NULL; source values remain immutable. No `admin`, current timestamp or zero substitutions. Local timestamps are separate from evidenced instants. The adapter must validate dates/precision and exact decimals **before** SQL binding because `numeric(18,2)` can round excessive input scale.

## Storage and staging

`0011_history_storage.sql` adds immutable `import_source_row`, `import_sku_alias`, five typed `history_*` projections, `import_stock_contributor` and a future `history_revision` carrier. All FKs retain rows, not cascading deletion. Same-batch source/header relationships are composite FKs. Source occurrence identity is file SHA256 + sheet + physical row, not a unique business key. Projections separately reject duplicate canonical source identities. Native imported SKU scope remains canonical targets, aliases are many-to-one.

Mapping version is explicitly `V2_HISTORY_NULLABLE_1`; it is an internal writer/storage contract, **not** a claim that the existing v3 no-DB preflight is an enabled writer. Header insertion starts at version 1. Staging/projection insertion serializes on the existing cutoff lock and batch row. Published batches cannot receive more history. Source/alias/projection edits, deletes and truncates are denied in this initial slice. Contributor facts cannot change; only a first NULL→baseline-ledger attachment is allowed while staging. The baseline must reconcile at publication.

This initial edit guard is **not a permanent read-only history policy**. `history_revision` records actor/request identity, from/to versions, reason, before/after whole-document facts and stock-effect evidence. Its write trigger deliberately rejects use until a separate history-specific audited correction command implements the approved future edit semantics and unresolved baseline-aware effects. Native approve/unapprove is never reused or enabled by this migration.

## Evidence JSON v1

- `raw_fields`: original source cell object, retaining exact strings/nulls and own-property distinctions.
- `normalized_fields`: exact effective normalized row, not augmented business values.
- `field_provenance`: `{schema_version:1, fields:{field:{origin:'ORIGINAL'|'MIGRATION_DERIVED'|'UNKNOWN',reason,raw,evidence_ref?,...}}, ...}`. Derived fields require a nonempty evidence reference. Date encoding, parse state and precision belong to field metadata. Derived creator hall uses `fields.created_hall_id.evidence_ref`.
- Explicit native bindings are provenance siblings, never inferred from source IDs. PRODUCT uses `native_product_id`. BARCODE uses `native_sku_id` and `native_barcode` matching exact normalized `条码`, with `绑定范围='SKU'`.
- Optional PRODUCT `product_input_proof` is `{schema_version:1,validator_version:'NINE_PRICE_EXPLICIT_V1',blank_price_policy,product_version,prices:{...nine exact canonical keys}}`. Publication checks native binding/version/value agreement and original own-key input. Missing price keys cannot create proof. `EXPLICIT_NULL_ONLY` requires original literal null. The existing reviewed v0.3 exact-column blank rule is represented only by `blank_price_policy:'V03_EXACT_PRICE_COLUMN_BLANK_IS_UNSET'`, which additionally permits an own-key raw string exactly `''` as unset, never omitted or whitespace-coerced. A trusted mapper must select that versioned source policy explicitly, not derive it from an aggregate PASS report. Proof absence does not mean completeness. The SALES reader must recheck proof/current version/prices within its original transaction. No new product business columns or alternate proof table.

Entity names retain the effective input contract: `SALES_HEADER`, `SALES_LINE`, `SETTLEMENT`, `TRANSFER_HEADER`, `TRANSFER_LINE`, `SKU` (alias originals), `INVENTORY_BASELINE` (original contributors), `PRODUCT`, `BARCODE`, etc.

## Atomic publication

`import_batch` gains expected/actual closed counts, payload hash and false-by-default validation evidence. Existing stock/checkpoint/receipt/audit guards are retained. The additional BEFORE trigger requires frozen initial expected counts/hash, exact actual table counts, validation passed, resolved business dates, SKU barcode binding evidence, per-baseline contributor sums and same-batch/warehouse/SKU links. Mixed/unknown stock units fail closed pending explicit compatibility policy. Historical imbalances are not recomputed or rejected merely for imbalance.

Counts are input-specific, not hardcoded table limits: five projection counts plus source rows/aliases/contributors/barcodes. Latest effective input includes **15,018 SKU barcode rows**. The **2,958 excluded PRODUCT barcode rows must not be inserted into any database carrier, including generic evidence**; original files and exclusion manifests remain external evidence. `sku_barcode` is unchanged. Historical line barcode snapshot text is not erased. Canonical SKU/alias/contributor expected counts stay 14,999 / 15,121 / 38,314 for the approved input; source-row expected count must come from the effective row selection, not old full-v2 totals.

No separate readiness flag bypasses atomic stock/history publication. Legacy mapping batches are not retroactively required to have history metadata. A future importer must bind the exact effective manifest/hash set, preserve raw evidence, enforce approved money/creator-hall overlays, refuse changed-input retries, and only grant importer-scoped inserts after real-engine tests. PUBLIC has no grants on the new tables; actual deployment role grants remain unimplemented.

## Remaining acceptance gates

Real PostgreSQL 0001–0011 migration; denied live regressions; JSON/constraint/trigger behavior and concurrency; exact adapter payload/identity reconciliation; full real-input preflight; isolated trial import; retry/idempotency; backup/restore and read-back; access-controlled LIVE/HISTORY query integration; separately authorized historical correction commands. Static tests cannot establish these outcomes.

### Per-original stock attribution

`field_provenance.stock_contribution` embeds the approved lineage CSV occurrence fields (`oldStockSourceId`, `canonicalStockRowSourceId`, `warehouseSourceId`, `oldSkuSourceId`, `canonicalSkuSourceId`, `productSourceId`, `signedQuantity`, `sourceUnit`, `sourceFile`, `sourceSheet`, `sourceRow`, `sourceSha256`) plus `validator_version:'STOCK_CONTRIBUTOR_LINEAGE_V1'`. The insert guard compares original IDs, signed quantity, unit, source position/hash and raw original SKU/warehouse/quantity, not just aggregate totals. Publication resolves canonical SKU/warehouse/stock source keys against actual imported native scope. The trusted mapper must verify this lineage against the approved file hash and original occurrence; embedding an assertion does not independently authenticate input bytes. Pure synthetic tests cover compensating quantity errors, old-SKU/unit/warehouse/row misattribution, signed negatives and missing quantity.

Known original or normalized `绑定范围='PRODUCT'` is rejected even if a caller relabels entity type. Original XLSX need not contain a derived scope field, so the loader must additionally select only the effective v3 SKU-barcode rows against the exact exclusion manifest rather than regenerate rows from full snapshots.

The PRODUCT persistence seam is owned by `adapters/postgres/src/catalogue-completeness.ts`; its trusted per-row helper must validate original values before INSERT. Helper/source tests are not evidence that actual source rows have been written.
