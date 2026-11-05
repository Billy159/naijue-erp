# SALES_LINE Phase A — local backend WIP handoff

Checkpoint only; stop further cloud scope expansion. **Not import-ready, not published.**

## Current code

- `import-v3-history-sales-detail.ts`: actual bounded SALES_LINE mapper, default connection-free DRY_RUN; explicit STAGE authorization; exact source/alias/header bindings; signed quantity and independent source amounts preserved; historical empty/false/zero distinguished. Whole 32-cell money approval Map is explicitly encoded in durable hashes using **ordinal**, locale-independent ordering.
- `import-v3-history-sales-detail-staging-store.ts`: actual existing-0011 source + typed line INSERT transactions and full same-transaction source/typed SQL readback. Stable native locks precede source evidence. Whole chunk classified before writes. Complete original proof replays after native maintenance without overwriting; partial/orphan/conflicting identity and unproven targets reject. New rows require creator-backed same-batch header/old-SKU alias/canonical native SKU/import_record/source-digest binding. No stock/ledger/balance/progress/receipt/publication writes. Unknown COMMIT discards, preserves original error and never rolls back/retries.
- `authorized-sales-detail-reader.*`: independent external v3 approval pin, manifest/selection/CSV/alias pins, **whole 32-cell external money-artifact pin** and complete source-occurrence coverage. Private bounded spool outside repo/input roots. Only approved old→canonical SKU and exact approved money-cell transformations. It authenticates original snapshot/artifact linkage, **not a fresh original-XLSX reparse**.
- Actual mapper/protocol/sealed-source-reader tests are separate from the old design checklist and contain no TODO/skip masking.

## Explicit WIP / not covered

1. A just-added `createPostgresHistorySalesDetailBindingResolver` in the owned PG file is **WIP**: executable read-only repeatable-snapshot exact source/native resolver plus a shared binding predicate refactor. It has focused TypeScript coverage through the module, but **no dedicated resolver protocol tests or independent review of this last addition**. Do not treat it as accepted/production-ready. The independently reviewed earlier mapper/store/reader used an explicit injected native-binding callback. Local backend should first review the last refactor, add positive/negative resolver tests, then exercise it on fresh synthetic PostgreSQL.
2. **Phase A PostgreSQL execution is NOT_RUN.** Protocol fakes do not parse SQL or prove transaction isolation/durability. Need fresh authorized local synthetic acceptance for first create, exact replay, partial/orphan conflicts, new versus replayed dependency maintenance, same-batch creator bindings, field readback, rollback and both unknown-COMMIT outcomes.
3. SETTLEMENT mapper/store and typed PAYMENT_METHOD/PAYMENT_ACCOUNT native-source directory remain **not implemented / design only**. No migration number claimed; accounting proposed 0015 belongs to another owner. Historical account identity, original method snapshot and original display names are independent; do not force them to equal current account configuration or ask the user to repair historical originals. Online current account/method validation remains unchanged.
4. Frozen history metadata publication capability still rejects nonzero historical SALES_HEADER/LINE/SETTLEMENT. No publication integration/readback for this new mapper is enabled. Do not remove that block just because staging tests pass.
5. Once-only import_record accounting / per-warehouse stock conservation is a separate coordinator/backend scope. Do not repair counters with aggregate counts, drop old contributors, merge historical sales lines or create zero ledgers.
6. `history-sales-detail-plan.test.ts` is the original design checklist (5 shape/primitive assertions plus 14 explicit TODOs), **not current implementation acceptance**. Some checklist items now have separate actual tests; local backend should retire/update the checklist deliberately rather than count its TODOs as executed features.

## Verified, with boundaries

- Before the final resolver addition: actual mapper + SQL protocol **14/14 PASS**; sealed independent source-reader **2/2 PASS**, no skip/todo. Locale defect found by independent review was fixed and cross-en_US/sv_SE proof-hash regression passed. Focused TypeScript passed.
- Independent read-only reviewer found no remaining definite mapper/store/source-closure defect in that reviewed version, including all 13 binding parameters, creator JSON keys and source/typed equality. It did **not** review the final WIP resolver/refactor.
- Final checkpoint rerun command: `node --test tests/import-v3-history-sales-detail.test.ts tests/history-sales-detail-staging-postgres-protocol.test.ts scripts/import-v2/authorized-sales-detail-reader.test.mjs && npx tsc --noEmit -p tests/history-sales-detail-tsconfig.json`. Exact final status and hashes are recorded in `evidence/history-sales-detail-phase-a/handoff.json`.
- No source user rows or private statistics are committed. Private structural review stays under `/workspace/shared/history-sales-detail-staging-private-20261021` and is not required to run synthetic tests.
- Existing metadata JSON-cast correction separately passed the coordinator-verified **schema1–11 native SALE fresh Mac 9/9** suite. That is not Phase A historical sales-line acceptance, not schema12–15 validation and not real full import. Coordinator evidence: Library `libfile_c8b45ec203d48191806af65eb5291cca`, SHA256 `25a5d21e43b380b099e948e5e088633dcab43ca2f999e4627c480a0883113ece`.

No cloud PostgreSQL/server was started or connected. Hand off this WIP checkpoint; do not expand scope or publish from it.

## Local backend successor — 2026-10-22

The original checkpoint above remains historical. The Mac backend now has dedicated public-resolver protocol coverage: 11/11; the affected actual mapper/store/sealed-reader plus resolver run passed 27/27, no failures/skips/todos. Focused TypeScript passed after correcting the test double's `release(Error | boolean)` type. These are synthetic protocol checks, not PostgreSQL execution or an independent review of this successor.

A failing-before-fix case showed the resolver accepted a query `sourceKey` differing from the original/effective `来源编号` until it borrowed a connection. The resolver now requires all three identities to agree before borrowing. Coverage includes exact selected same-batch header/alias/canonical IDs, unique cardinalities, registry refusal, full creator predicate rejection, scope/query cloning and failed BEGIN/read/ROLLBACK/COMMIT cleanup without retry. The shared creator predicate SQL itself was retained.

Evidence and precise source hashes are under the local controller's `reports/backend/` and `status/backend.json`. PhaseA real PostgreSQL, SETTLEMENT/payment typed bindings, nonzero history publication and real-file import remain NOT_RUN or incomplete; the existing nonzero sales publication guard remains active.
## Local successor: actual PG17.11 / schema16 — 2026-10-22

The new independent `tests/integration/history-sales-detail.integration.ts` run passed 5/5 (one parent plus four scenarios), with zero failures/skips. It used a fresh private local cluster, a separate non-admin disposable owner/database and port55521, then stopped that exact cluster. It did not reuse the accounting run7 target, task8, any existing business database or a server.

The first schema15 historical fixture exposed the original0011 polymorphic trigger planning `NEW.old_source_sku_id` while inserting a history header. Its actual FAIL/TAP is retained. Frozen0011 and all current0012–0015 bytes remain unchanged; approved additive0016 preserves the original function OID and every predicate, placing two table-specific field checks inside their own table branch. Preflight requires exact1–15 and the original function body fingerprint. Schema16 runtime capability checks the fixed body fingerprint too. Actual malformed alias identity and malformed contributor alias target still raised the original exact23514/function/messages.

The passing run created real native dependencies, staged and replayed a real historical sales header, resolved exact selected header/old-alias→canonical-SKU identities through the actual READ ONLY resolver, then staged/replayed the typed line. A throw after actual line INSERT rolled both the new original source and typed row back. Unknown original personnel, timestamps and creator hall stayed NULL. Header10.00/1.00/8.50 and line quantity-2, deal price0.03 and original line amount-0.12 remained independent original facts. No live sales/settlement, inventory ledger/balance or accounting claim was written; only the original STAGE receipt/audit existed, and the batch stayed STAGED/cursor0.

This verifies synthetic PhaseA staging/resolution, not SETTLEMENT/payment typed closure, private-file authentication, HISTORY query integration or nonzero historical publication. All original nonzero sales/settlement release guards remain closed. Source/engine pins and raw logs are in controller `reports/backend/`; older source-only statements below describe the frozen handoff, not this successor result.

