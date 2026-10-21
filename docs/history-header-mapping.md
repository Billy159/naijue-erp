# V3 historical header mapper — source-only slice

`prepareV3HistoryHeader` in `packages/application/src/import-v3-history-header.ts` maps exact effective SALES_HEADER / TRANSFER_HEADER rows to the existing schema-11 typed header contracts. `history-temporal-mapping.ts` supplies exact calendar/decimal decoding. Neither module opens SQL, creates native catalogue records, publishes a batch, changes originals, or claims an actual import.

## Binding and preserved facts

Selection uses the shared reader's `baseManifestSha256`, `selectionSha256`, `approvalSha256`, exact entity/path and CSV SHA256. The downstream store must lock the same batch and require `import_batch.source_hash == selectionSha256`, mapping version `V2_HISTORY_NULLABLE_1`, and open staging status. The shared authorized reader owns authentication, raw-row/source hash verification and independent native binding resolution. A matching caller-supplied hash is not authorization.

The mapper returns `source` unchanged for digest authorization, a typed `header`, and **separate** `fieldProvenance` for the eventual evidence INSERT. Native FK bindings must explicitly pair the original source key and UUID; source IDs are never treated as native UUIDs. Known-but-unresolved salesperson/hall references are not silently cleared. Missing mandatory native sales hall/customer/warehouse or contradictory transfer warehouses rejects that row, not every header.

Original Chinese enum domain is explicit: 未审核→DRAFT, 已审核→APPROVED, 已作废→VOID; 销售→SALE, 退货→RETURN, 换货→EXCHANGE. Unknown enum values are rejected, not guessed. Historical original role text is retained independently of current auth roles. Original document numbers, including leading zeroes, are retained.

Unknown creator/approver/time/note/salesperson fields map to NULL where the schema allows. APPROVED does not invent actor/time. Creator-hall overlay must exactly match original file/sheet/row/source ID/number/person and original uploaded hall, normalized candidate/provenance/reason, and carry its evidence reference. It is context, not visibility authorization. The trusted shared reader must authenticate and rederive the overlay; this pure mapper does not substitute for that verifier.

Money uses exact BigInt cents and preserves header imbalances. A raw/normalized monetary difference is accepted only through `v2ApprovedCents` against the independently matched 32-cell approval set, with full identity/raw/exact-cent matching. No global rounding permission is added.

## Temporal rules

- Valid ISO date text maps to a calendar date. If it occurs in a DATETIME field, it is `DATE_ONLY`: parsed date remains in provenance while local/instant timestamps remain NULL. No midnight is invented.
- ISO local date/time remains local, never UTC. An explicit valid source offset may supply an instant. Invalid dates/offsets and ambiguous encodings remain unresolved.
- Numeric Excel text requires **per-cell evidence**: exact workbook SHA256, sheet, row, field, raw value, cell reference/type, style index, format, workbook 1900/1904 date system and evidence reference. The mapper validates location/value agreement; the trusted reader must extract/authenticate that evidence from original XLSX. Workbook-wide style lists alone do not prove which cell used a style.
- Supported current number formats are `yyyy-mm-dd`, `yyyy-mm-dd hh:mm:ss` and `yyyy-mm-dd h:mm:ss`; others get an explicit policy issue. Date-only formatting never invents a time. Excel 1900 serial 60 is rejected; 1904 serial 0 is 1904-01-01.
- DATE serials with nonzero time fractions are unresolved rather than truncated. DATETIME serial arithmetic is BigInt exact. A value not exactly representable at PostgreSQL microseconds stays NULL with `SUBMICROSECOND_PRECISION_REQUIRES_DECISION`, retaining raw decimal precision. No float rounding.
- Missing/unparseable business date remains NULL with `businessDateResolved=false`; publication still rejects unresolved business dates under schema 11. Optional temporal uncertainty is represented per field, not a blanket failure of other header facts. Returned `importReady` and `published` are always false.

## Read-only inspection findings on approved v2 (unchanged headers in effective v3)

A literal CSV/Decimal aggregate inspection, not an import or original-workbook cell validation, found:

| Fact | Count |
|---|---:|
| Sales business dates, all integer serial strings | 28,282 |
| Transfer business dates, all integer serial strings | 14,279 |
| Sales creation serials exactly representable at microseconds | 1,100 |
| Sales creation serials with sub-microsecond precision | 27,182 |
| Sales approval values that are date-only text | 28,280 |
| Transfer approval values that are date-only text | 14,243 |

All supplied workbook metadata entries report `date1904='0'`, but the snapshot contains workbook styles/sheets, **not per-cell style assignments**. Consequently real numeric-date write readiness still needs original-cell extraction. Missing sales modification times and all transfer creation/modification times remain unknown.

For the 27,182 sub-microsecond sales creation values, the currently implemented safe behavior is NULL typed timestamp plus exact raw/provenance. A future alternative would require an explicitly approved precision-loss policy (for example rounding to nearest microsecond with recorded original/loss); that alternative is **not enabled**. Date-only approval values need no invented time policy: their known calendar day can already be retained in provenance.

## Verification boundary

Synthetic tests cover exact/invalid leap dates, 1900 leap bug/1904 epoch, local/offset distinction, date-only precision, exact/nonexact serial fractions, missing cell evidence and misbound cells, nullable approved headers, explicit enums, stable original IDs, required reference failures, creator overlay identity, exact money allowlist and historical imbalance preservation. These tests are not PostgreSQL or full-file authorization evidence. Shared-reader header inclusion, native staging-store insertion, actual XLSX cell extraction, engine constraints and full import/restore/read-back remain separate work.
