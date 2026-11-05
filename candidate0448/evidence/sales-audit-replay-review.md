# Sales sparse-audit and replay correction: independent review

Reviewed 2026-10-20, 16:53 UTC. Repository: `/workspace/shared/naijue-erp-rewrite`.

## Conclusion

No blocking defect found in the six-file frozen correction. The two sales follow-ups in `docs/OPEN-IMPLEMENTATION-ITEMS.md` are satisfied in the bounded source and synthetic/protocol scope reviewed here: audit evidence is sparse, and stable account/key/business-content replay no longer depends on the actor's transient hall. Current permission is still rechecked before any successful receipt is disclosed.

This is not a real PostgreSQL, production, browser, historical-import or full-ERP acceptance pass. The review made no repository source edits, installed nothing, and did not connect to a database, execute migrations, start servers, use the user's computer, push or deploy.

## Frozen scope and evidence integrity

All six leaves matched `/tmp/sales-audit-replay-freeze.sha256` both before inspection and after the independent probes. Final verification output is `/tmp/sales-audit-replay-review-freeze-check.log`.

| Leaf | SHA-256 |
| --- | --- |
| `packages/application/src/ports.ts` | `a2d2d7da6e701e319642c76208de2075933eb8e721626e1d9ef8ebaee1d424e2` |
| `packages/application/src/sales-service.ts` | `5c68fa95cc64e27b213ef34962d199a4f7d26c7c31b339502aa3e4288cb039ff` |
| `packages/application/src/sales-change-evidence.ts` | `ea4a297280b64832bda821498f93e1dfe6125eadf8433ddab0b834086b59bc11` |
| `adapters/postgres/src/sales-unit-of-work.ts` | `803251c65d70623351357f60efb28b1845d0b6a07169b7ed8e6cb17e34784b85` |
| `tests/sales.test.ts` | `8baeae7710f080c502b292ea08b892b7ade390ee0af85647dcfe50d322508ac0` |
| `tests/postgres-protocol.test.ts` | `e9dca6acbb8b4c25976bca1b754c7e94dc3eca0d7ebf4a1967b638d802a7edd1` |

The working tree contains other concurrent slices. They were not reviewed or edited. In particular the unrelated authentication UI files associated with the owner's old aggregate typecheck log were left alone.

## Contract checked

Read the approved field catalog `奈爵ERP_数据库表与字段清单_讨论版.txt`, especially sections 22–24, 29–30 and 11: native current header/line/settlement facts; stable retained line identity and source links; unchanged document account snapshots; account-scoped original-key receipts; append-only sparse key/changed-row before/after evidence with native old/new versions; and one transaction for business facts, stock effects, audit and successful receipt. No audit reconstruction, whole-revision platform, funds balance, original-sale relation or new pricing/stock policy was introduced.

Also read the two scoped open items in `docs/OPEN-IMPLEMENTATION-ITEMS.md`; that document was not changed by this review.

## Findings

### Stable replay with current authorization

- `sales-service.ts:47–64` still clones caller-owned input before hashing or the first asynchronous boundary. The new fingerprint substitutes only `actor: { accountId }`; action, target/draft, original request key, expected version, line order, all business fields and typed values remain in the existing deterministic request hash. Actor hall is not a business identity input. A changed business hall is still inside the draft and therefore still conflicts.
- `sales-service.ts:56–63` checks the stored fingerprint, loads the current native target, calls the current authorization provider with the current actor and requested action, and only then returns the original result. A changed current role or hall does not become an artificial body conflict, and revoked access does not disclose the receipt. Later document changes do not replace the original result.
- The receipt remains scoped to authenticated account plus original key. `sales-unit-of-work.ts:124–134` retains the explicit `target_type === 'SALES'` cross-kind guard before sales receipt decoding. The existing cross-kind protocol test at `tests/postgres-protocol.test.ts:282–287` remains intact.
- Creation account/hall/time remain native source facts. In particular `sales-service.ts:85–88` keeps an existing `createdHallId`, including null; a replay does not rewrite it from the actor's new hall.

### Sparse actual-change evidence

- `sales-change-evidence.ts:4–17` explicitly compares every current native line field, all six display/barcode snapshot leaves, and all six settlement fields without JSON/display coercion.
- `sales-change-evidence.ts:24–48` emits only changed header fields, always includes native old/new versions, and emits complete before/after values only for changed/new/removed business rows. Creation appropriately records newly introduced values. `sales-service.ts:39–41, 89` retains removed lines with `isCurrent=false`, so removal is an actual current-state change with before/after evidence, not a lost source line. Already inactive unchanged rows are omitted.
- Settlement additions, removals, amount/direction/account and position changes are represented by exact native rows on the applicable side. No unchanged sibling rows are copied.
- Workflow status, update time, approval account and approval time are in the comparison catalog; APPROVE/UNAPPROVE/VOID do not copy unchanged lines or settlements. Clearing approval metadata on unapproval is represented with native nulls.
- `ports.ts:21–30` describes the sparse shape, while `sales-unit-of-work.ts:240–243` writes native `old_version`/`new_version` and sparse JSON into the existing append-only audit relation. No business read was switched to audit JSON. Header creation facts and settlement account/method name snapshots remain their existing native source fields, not reconstructed from evidence.

### Selective persistence preserves ownership and provenance

- `sales-unit-of-work.ts:136–153` freezes independent cloned native baselines after the locked document read. A caller mutating a returned read alias cannot make a real edit look unchanged.
- `sales-unit-of-work.ts:155–190` keeps header compare-and-swap and runtime-stock-basis checks. Only changed lines are upserted; only changed previously current IDs have their current positions freed first. This permits legitimate swaps/replacement while leaving unchanged current and retained rows untouched. No sales line is deleted. The owner predicate on position release, explicit `salesId` check and guarded upsert prevent a line from moving across documents; zero-row guarded writes still reject.
- `sales-unit-of-work.ts:192–209` deletes only loaded removed settlement IDs belonging to this target, skips unchanged settlements, and upserts only changed/new rows with the existing ownership/reference and row-count guards. Same-payment-account edits preserve the original account/method display snapshots through the unchanged CASE expressions; account changes capture the new account/method names. An unchanged row no longer refreshes snapshots or depends on a redundant join.
- The partial current-line position uniqueness and deferred settlement position uniqueness in migration 0001 remain compatible with the selective ordering. No DDL was changed or executed for this correction.

### Price, stock and transaction semantics

The production diff changes only the fingerprint, audit extraction and selective persistence; the existing price validation/allocation, exact settlement equality, negative-stock arithmetic, approval effects, linked immutable unapproval effects and state transitions are unchanged. The same unit-of-work callback still contains document writes, immutable effects/balances, audit and receipt. Header/balance compare-and-swap, stable receipt/document locking, rollback and uncertain-commit handling are unchanged. Missing inventory coverage remains a fail-closed condition, never a manufactured zero balance. This is source inspection plus fake-protocol evidence, not proof of engine locks, triggers or durability.

## Independent verification

Did not rerun the owner's focused/full suites or aggregate compile/build. Inspected their existing logs: focused 85/85, combined 130/130, source tests 447/447, plus scoped compile/build/import smoke logs. Those remain owner-run evidence. The old aggregate typecheck log has unrelated authentication UI implicit-any errors; no full-project pass is claimed from that log.

Ran only new review probes:

`node --test /tmp/sales-audit-replay-independent.test.ts`

Result: **6/6 passed**, zero failures/skips. Output: `/tmp/sales-audit-replay-independent.log`.

1. Exhaustive supported mutable-header field matrix: only the changed field and native versions appear; no unchanged lines/settlements.
2. All native line comparator fields and every snapshot leaf: null/price/discount/position/inactive changes detected; evidence values remain isolated from later snapshot alias mutation.
3. All settlement comparator fields and total removal: exact applicable before/after values, no native-source mutation.
4. Original SAVE replay after a later SAVE: uses the current version/current role/hall for authorization, returns the original result, preserves creation hall, and rejects changed expected version, business hall, target, line pricing metadata or action. Revoked current role rejects without effects.
5. Protocol alias probe: mutating read-returned line snapshot and settlement amount still produces the necessary selective upserts against the adapter's frozen baseline; same-account snapshot CASE guards remain present.
6. Protocol guard probe: zero-row settlement write requests rollback, and a foreign-owner settlement payload rejects before its upsert, even where an unchanged-row optimization could otherwise skip it.

These probes use only synthetic stores and a fake `pg` client. They are not engine execution or real data evidence.

## Remaining boundary

No source correction is requested by this review. The two bounded sales correction items can be marked code-reviewed by their owning coordinator. Real PostgreSQL migration/transaction/trigger/locking validation, production wiring, browser behavior, historical cutoff work, and other full-project gaps remain separate and are not closed by this report. Any later changes to these six leaves require scoped re-verification rather than reusing this frozen conclusion.
