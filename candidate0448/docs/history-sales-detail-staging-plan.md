# Historical sales detail staging — implementation plan, NOT implementation

Status: **DESIGN / SOURCE-CONTRACT REVIEW ONLY**. No detail mapper/SQL creator, payment binding directory, publication capability or PostgreSQL acceptance is delivered by this document. Frozen history metadata/store files and migrations 0011–0014 are untouched. Private source rows and private structural statistics stay outside Git.

## Existing storage and exact source contracts

Frozen 0011 already has all detail columns, same-batch source/header FKs, immutable source/detail rows and `(header_id,line_no)` uniqueness. No detail-column migration is needed.

| Source | Typed destination | Exact input columns |
|---|---|---|
| `SALES_LINE`, `business/14历史销货明细.csv` | `history_sales_line` | 来源编号, 单据来源编号, 原行号, SKU来源编号, 原数量, 原参考价, 原成交单价, 原行金额, 原分摊优惠, 原赠品标记, 原定价方式, 原折扣十分位, 原普通零价确认, 原款号, 原品名, 原颜色名称, 原版型名称, 原完整尺码, 原使用条码 |
| `SETTLEMENT`, `business/15历史收退记录.csv` | `history_sales_settlement` | 来源编号, 单据来源编号, 原收退行号, 账户来源编号, 方向, 金额, 原账户显示名, 原方式显示名, 原收款方式来源编号 |

`IMPORT_V2_TABLES` is the normalized eighteen-entity contract. Existing `HistorySalesLine` / `HistorySalesSettlement` DTOs already describe the typed storage. Existing source-only readers do **not** authorize these entities: `authorized-reader` supports PRODUCT/TRANSFER_LINE; `authorized-header-reader` supports two header types and optional HALL/CUSTOMER/STAFF reference rows. Reusing their aggregate report as sales-detail authorization is forbidden.

### Exact field decisions

- Source IDs remain literal strings; newly allocated stable native historical detail IDs are separate identities. Preserve original row numbers/order. No merge/reindex of sales detail rows even when their old SKUs share one canonical SKU.
- `quantity` is explicit signed bigint source quantity, not a sign inferred from SALE/RETURN/EXCHANGE. Zero sales quantity is a source-contract failure; no silent sign flip.
- `reference_price` and `allocated_discount`: exact empty input maps to historical NULL, not zero/current price. Required deal price and line amount use exact cents. Preserve their **independent** source amounts; do not recompute `quantity*price`, allocate absent discounts, rebalance headers or hide real reconciliation differences.
- Optional 是/否 values map explicitly to true/false; empty maps to NULL. Optional pricing method remains exact `UNIT_PRICE`/`DISCOUNT` or NULL, not an invented live default. Optional discount integer remains explicit 0–100 or NULL. Do not infer ordinary-zero confirmation from zero price or gift status.
- Six line text snapshots copy the original source strings; exact empty maps to NULL. Never fill absent historical text/barcode from current product/SKU tables.
- Settlement direction is explicit 收款→RECEIVE / 退款→REFUND; amount is an independent nonnegative exact-cent absolute value. Do not infer direction by negating an amount.
- **Account identity and original method snapshot are independent.** Bind `payment_account_id` from 账户来源编号. Bind nullable `payment_method_id_snapshot` separately from 原收款方式来源编号; absent optional original method means NULL, not the account's current method. Preserve 原账户显示名 / 原方式显示名 literally, even if names or account-to-method assignments differ from current catalogue configuration. Do not enforce a live-current account/method equality rule on historical snapshots. These are historical association/name changes, not automatic anomalies or requests for the user to repair original data. Online new-document current account/method checks remain unchanged.
- These detail rows contain no person/time fields. Existing header mapper preserves historical missing person/time as NULL; do not add fake actors/timestamps here and do not loosen online required fields.

## Proposed independent file ownership (requires coordinator allocation)

### A. Sales detail pure mapper + executable staging, no new DDL

1. `packages/application/src/import-v3-history-sales-detail.ts` — discriminated SALES_LINE/SETTLEMENT inputs, pure field conversion, bounded chunk preparation and SQL-boundary recomputation. Retain original inputs in prepared rows, not only a typed projection. Export explicit default-DRY_RUN staging wrapper; STAGE requires independent exact authorization before connection. Report `published:false,importReady:false`.
2. `adapters/postgres/src/import-v3-history-sales-detail-staging-store.ts` — actual existing-table INSERT transactions; initially SALES_LINE can execute using existing header/source/alias/import_record evidence. SETTLEMENT must stay closed unless a reviewed typed payment-binding capability is present. No target adoption/upsert, native catalogue writes, stock/ledger/balance writes, import_record count repair, fake live receipt or publication.
3. `scripts/import-v2/authorized-sales-detail-reader.mjs`, `.d.mts`, `.test.mjs` — independent source authorization for selected sales-detail files; do not broaden old reader via a flag that weakens its entity-specific checks.
4. `tests/import-v3-history-sales-detail.test.ts`, `tests/history-sales-detail-staging-postgres-protocol.test.ts` and source-contract tests — synthetic only; future explicit Mac acceptance remains separate.

Existing metadata four files, existing header mapper/reader, old stock/SKU adapters, frozen migrations and shared reviewed-schema registry are **not owned** by this work. Updating publication readback or enabling SALES_HEADER/LINE/SETTLEMENT is a later separately reviewed integration, not removal of a boolean guard.

### B. Payment native-source binding prerequisite (separate root-approved scope)

Normalized payment contracts already contain original method source ID/name/state and account source ID/display name/current method source ID/state. They are not missing source data. What is missing is an explicit reviewed source→native directory and resolver/creator for PAYMENT_METHOD/PAYMENT_ACCOUNT. Schema12's header directory and schema13's party directory deliberately exclude these kinds; do not relabel them as HALL/CUSTOMER/SUPPLIER or trust untyped metadata as production binding proof.

Propose a **new root-numbered, independently reviewed** migration plus independent app/store files for a typed immutable same-batch payment reference/creation directory: source_row FK and unique source identity; typed native payment-method/account FKs; exact source/native snapshot/version and authorization fingerprint; account-current-method binding as an explicit separate source relation; closed-batch immutability. No migration number is reserved here. Native creation and binding pre-existing configuration need distinct authorization semantics; never adopt/name-match an existing target implicitly. No blanket new `enabled=true`, manufactured login/actor or fake runtime receipt.

A historical settlement's original method snapshot may differ from the account's current method and must keep its own explicit method binding. Account-hall source rows represent historical recommendation facts only, not permission/visibility rules. Their compound identity needs its own explicit contract if imported; detail staging must not create a hall restriction as a side effect.

## Source authorization closure

The reader must independently pin the external v3 approval and the exact approved-money-overlay SHA, then run complete `preflightV2` against hash/size/path-verified manifest payloads and effective selection. Bind base manifest, selection, approval, exact entity/path/CSV hashes and fixed namespace/batch. Source spool must be private, bounded, outside repo/input directories, mode 0700/0600, symlink-safe and rehashed when iterated; strict UTF-8, duplicate/omitted original occurrences or source coordinates fail closed.

For every row retain literal original snapshot JSONL row bytes/digest (excluding LF, retaining CR under the existing algorithm), original file SHA/file/sheet/row/source ID and all raw cells plus exact normalized fields/provenance. Exact keys/types come from the entity contract, not a guessed projection. A second independent index must match every effective row to exactly one original occurrence. Only two transformations are allowed:

1. Old SALES_LINE SKU source → approved canonical SKU through the fully verified alias map; retain the original old SKU source in raw/provenance.
2. A changed MONEY field only if the independently pinned **whole 32-cell** approval set contains its exact original file SHA/sheet/row/source ID/field/raw value/candidate-cent tuple. Use `v2ApprovedCents`; do not use a caller boolean/tolerance or a substring/approximate match. The global verifier must consume the whole approved set, not only a selected chunk. Never extend the set to repair genuine historical arithmetic differences.

All other nonmoney/unchanged money fields remain literal. Native bindings are resolved independently of caller DTOs after source authentication and are rechecked after awaited resolver calls; authorizer compares the complete recomputed prepared rows including source, decisions and fingerprints. No current native identity is guessed from a source ID, code/name or a synthetic fixture. As with the existing non-temporal exact reader, explicitly distinguish authenticated snapshot/artifact linkage from re-parsing original XLSX; do not claim the latter unless a fixed audited extractor actually runs.

## Store transaction and replay contract

- Validate/recompute the cloned prepared chunk before connecting. Use only an exact reviewed schema prefix; no `version>=11` shortcut.
- Lock cutoff → same batch (mapping/source namespace/selection hash/open status) → all stable header/native SKU/payment identities in deterministic key order → source evidence. Lock native identities before checking their bindings; cross-batch source keys use the shared source namespace lock discipline.
- Sales header binding must prove actual same-batch SALES_HEADER source key, source-row identity/hash and retained mapper/staging evidence, not just a caller header UUID. Native SKU binding must prove same-batch old alias→canonical source→actual imported native SKU, with original raw old ID and effective canonical ID agreeing. Preserve historical text snapshots independently of current SKU attributes.
- Settlement additionally needs the reviewed typed account binding and (when present) separately typed original method binding; no untyped resolver-only SQL acceptance.
- Classify **all** rows before INSERT: complete exact source+typed-row+binding creation evidence is replay; source-only/row-only/orphan, alternate IDs, duplicate occurrence or changed immutable fields reject. Stable native identities may be maintained later; an exact original replay must not overwrite their current values or re-run current-snapshot checks as a new grant. New rows require current binding validity.
- First-time source evidence and its typed detail INSERT commit in the same transaction; typed exact-cent strings/bigints are validated before numeric/bigint binding so PG rounding cannot alter them. Whole bounded chunk rolls back on any row failure; do not partially commit a document prefix and call it ready. No automatic transaction retry.
- Before COMMIT attempt failures may ROLLBACK. Once COMMIT is attempted, preserve the original uncertain error, discard, **do not ROLLBACK/retry**. A separate operator/original-idempotency readback resolves outcome.

## Controlled synthetic acceptance plan

Contract skeleton tests assert existing schema/column shapes and exact-cents primitives only; TODO cases explicitly mark unimplemented mapper/store/reader/payment/engine behavior. Future real tests must include:

- empty versus zero/false and nullable historical fields; leading-zero identifiers/barcodes; positive/negative sales quantities; nonzero preserved arithmetic discrepancies; no stock effects;
- exactly authorized money-cell change succeeds, same value on another source/field/location/hash fails, unrelated greater-scale input fails;
- old aliases of one canonical SKU keep separate original sales rows and line numbers; missing alias/wrong header/batch/source/target fails;
- snapshot account/method names and original method identity differ from current account but remain intact; negative settlement amount/unknown direction/missing typed payment directory fails;
- exact replay, changed/partial/orphan proof, maintenance-after-replay, multirow rollback, source/native lock order, unknown COMMIT both actual outcomes; no native writes, publication or progress-counter mutation;
- later independent publication readback for every typed field/lineage, document completeness and preserved true mismatches **before** any removal of the current nonzero sales capability block.

Real PostgreSQL execution, native payment creation/reference approval, once-only accounting and full publication remain **NOT_RUN / NOT_IMPLEMENTED** as applicable. This plan cannot be used as an import-ready grant.
