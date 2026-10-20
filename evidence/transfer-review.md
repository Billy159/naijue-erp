# Transfer runtime independent review

Status: SOURCE-REVIEW CLEAR after the three corrections below; no remaining blocker found in the bounded new-runtime transfer write slice. This report is an independent read-only source review, not PostgreSQL engine or production acceptance. No repository source edits, server startup, database connection, migration execution, credentials, installation, local Mac use, or commit were performed by this reviewer.

## Baseline and scope

Reviewed `/workspace/shared/naijue-erp-rewrite`, HEAD observed `ce498d0350204683222f0a213feae8b6532ddc31`, with the transfer slice still in the worktree. Owner baseline manifest: `/workspace/shared/transfer-runtime-hashes-20261020.txt`. The initial manifest matched all source except the owner-disclosed subsequently added UNAPPROVE protocol test. Corrected final manifest `/workspace/shared/transfer-runtime-hashes-final-20261020.txt` was independently checked: all 14 entries match. Migration 0004 SHA256 is `a85dd812fdf561652433e6fc2da49024f95db1137e52b84170470ec5f937224d`.

Scope: transfer ports/service/policy, PostgreSQL transfer unit of work, additive migration 0004, transfer HTTP/input/tests, synthetic transfer store/tests, and the surgical sales receipt-kind guard plus protocol fixture changes. Read approved field list, core database discussion, supporting storage decisions, source-alignment addendum, and backend gap audit. Read source-confirmed security and transfer validation references, without operating the old application.

## Findings sent immediately to owner and parent, all corrected

1. High priority, architecture mismatch: every command duplicates every retained line and snapshot into its before/after audit, including memo-only draft saves. The approved field list lines 355–357 and core architecture section 7 call for sufficient key field/line differences, explicitly not copying the full document on every draft save. Original 0004 canonical native snapshot and prior-snapshot chain guards made the larger full-snapshot storage design mandatory. Targeted synthetic probe confirmed a note-only edit retained both unchanged lines in both audit sides. Fixed and re-reviewed: sparse actual changed-line deltas retain native old/new versions, atomicity, creator provenance and exact posting constraints. Note-only saves and posting-only actions have empty line-delta arrays. Adapter caches prior native lines and writes only materially changed rows; generated nullable current_line_no with deferred native uniqueness supports actual row updates and position swaps without deactivate-all rewrites. Deferred header/changed-line guards compare native OLD/NEW values to audit evidence rather than reconstructing whole drafts. Existing analogous sales behavior is a separate follow-up, not part of this transfer scope.

2. Medium priority, idempotency content boundary: hashing the complete command includes transient server-authenticated role/hall facts. An unchanged wire body with the same account and key, after the account legitimately becomes ADMIN, fails with IDEMPOTENCY_CONFLICT before current authorization. Original-key recovery should hash the stable request/account identity and independently recheck current trusted permissions. Fixed and independently re-probed: the hash includes every business command field plus stable actor.accountId, omitting only transient role/hall. Authorized role/hall changes replay the original result; current forbidden scope still rejects before exposing it. Changed action, note, quantity or expectedVersion under the original key conflicts, and a different account cannot recover the first account’s result. Execution still uses the fully isolated trusted actor snapshot.

3. Medium priority, source-policy retention gap: the reference transfer validator permits SAVE retaining or reducing disabled SKU usage within trusted prior SKU/location/source allowance, spending that allowance across proposed rows. Source: `core16-strict-check-bUsiBu/project/server/domain/transfers/validation.ts:18–24,47–50`; `server/domain/transactions/command.ts:262` passes trusted prior state for SAVE; APPROVE at line 273 does not receive that allowance. Current new policy blanket-rejects disabled SKU SAVE, and a note-only SAVE after disabling a SKU reproduces SKU_UNAVAILABLE. Native analogue should preserve bounded prior-current SKU use at unchanged endpoints, reject unknown/new/increased/moved disabled usage, and continue rejecting disabled new-runtime APPROVE. Fixed and independently re-probed: unchanged endpoints permit bounded prior-current aggregate retention/reduction across split rows. Pool overuse, endpoint movement and disabled APPROVE reject; no inventory effects occur during SAVE.

## Positive source review observations

- Shared operation receipts retain global actor/account plus original request-key uniqueness and exactly the same advisory lock namespace as sales. Both adapters reject the other kind before decoding it.
- Target/object kind expansion is a closed SALES/TRANSFER union, using generated kind-selected native FK columns. Native line source references are exclusive and FK-backed; existing sales uniqueness, reversal uniqueness, append-only evidence, and original sales function bodies remain intact.
- Migration is additive 0004. Original 0001/0002 hashes are preserved; authentication 0003 is not changed. Sales trigger dispatch is kind/source-specific. Additional exact-native reversal coherence closes nullable cross-kind source comparisons.
- Transfer effects verify native header/line, SKU, endpoint warehouse, exact signed quantity, business date, current version/status, and exact original reversal. Receipt/ledger coherence and deferred final counts require one FROM and TO per current line.
- Adapter loads/serializes a single target, uses explicit CAS, locks covered balances together in canonical warehouse/SKU order before writes, never inserts missing coverage, and handles callback/commit/rollback failures without an implicit new-key retry. Commit uncertainty discards the connection.
- Service snapshots before its first await; SAVE is stock-neutral; APPROVE/UNAPPROVE produce paired effects; removed actual line identity is retained inactive. Historical cutoff provenance is explicitly rejected rather than fabricated.
- Creation account, role and hall are server-authenticated snapshots, not HTTP fields. Source-confirmed transfer visibility is creator-hall OR either endpoint hall; it does not import sales-only own-approval or salesperson-unapprove prohibitions. Old and proposed SAVE scopes are both checked.
- HTTP has exactly command and actor-scoped original-key receipt endpoints, strict field sets, exact bigint strings, mandatory injected trusted providers, safe unknown-error mapping, no-store receipts and no listener.

## Independent targeted evidence

Log: `/workspace/shared/erp-rewrite-planning/transfer-runtime-targeted-probes.log`.

- Reproduced transient-role replay conflict.
- Reproduced complete unchanged-line audit copying on note-only edit.
- Reproduced disabled-SKU memo-only SAVE rejection.
- Passed visible transfer actions by another actor, including salesperson UNAPPROVE, with both balances restored exactly.
- Passed approve → unapprove → remove a line → reapprove → unapprove, preserving retained inactive line identity and exact paired balance reversals.

No duplicate aggregate suite was run. Owner supplied separate compiler, synthetic backend and scripted protocol evidence; this review does not relabel that evidence as an independently rerun aggregate. Corrected final log `/workspace/shared/transfer-runtime-final-check-20261020.log` reports 374/374 backend/API tests passing; owner reports preceding local strict compiler exit 0. Owner also reports 31 service + 14 scripted protocol, 51 HTTP and combined 16 transfer/9 sales SQL-text tests passing. These counts overlap, not additive acceptance layers.

## Corrected independent targeted recheck

Log: `/workspace/shared/erp-rewrite-planning/transfer-runtime-targeted-recheck.log`. Three assertion groups passed: stable account/business fingerprint with current permission checks and no writes on conflicts; sparse memo/changed/deactivated/posting audit with exact paired reversals; disabled-SKU pooled retention with overuse/movement/approval rejection. Corrected SQL was read in full; final 14-file hashes match. No source changes were made by the reviewer.

## Explicit SQL trust boundary

The deferred sparse row guards prove every material native line mutation has exact OLD/NEW audit evidence. They are supplemental integrity controls under least-privilege runtime access, not proof against a hostile actor with arbitrary SQL-writing privileges. In particular, an arbitrary DB writer could invent a changed before/after audit pair for an unchanged row when the after value matches the native row and no material row trigger fires. No service/HTTP path exposes that behavior. This is documented as a constraint trust boundary, not a reason to restore a disallowed whole-document snapshot platform.

## Remaining evidence boundaries

Real PostgreSQL syntax/DDL admission, deferred constraint semantics, actual lock ordering/concurrency, commit uncertainty, rollback and durability remain NOT EXECUTED. Synthetic tests and SQL-text regex checks cannot establish those. Runtime transfer lists/details/history, historical baseline-aware import/reversal, production composition, trusted auth/reference wiring, UI, printing/export, and deployment are outside this write slice and cannot be declared complete from it.

## Conclusion

The corrected bounded new-runtime transfer command/PG-protocol/HTTP source slice is clear for the parent’s source integration decision. This is not a declaration that the full transfer module, historical transfer behavior, real PostgreSQL constraints/concurrency, production service, or ERP is complete. The analogous existing sales full-audit-copy and transient-hall fingerprint behavior was escalated to the parent as separate follow-up; this review did not edit sales service.
