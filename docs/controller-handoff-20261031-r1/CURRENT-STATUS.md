# r1 preparation branch — current handoff

## Fixed source and Git

Worktree: work/erp-db-upgrade-r1-preparation-20261031. Branch: codex/db-v7-r1-preparation-20261031. Latest source checkpoint: fc7c03bf (fresh provider successor and exact ledger receipt-ID fix); remote verification is recorded per push. Every one of the 2,129 declared r1 source files was adopted at 56bc305a; 6a85 is comparison provenance only. Original worktree WIP, frozen Demo and historical evidence remain protected.

No deployment workflow or webhook was present when checked. CI is NOT_CONFIGURED, not PASS. No production deployment has been performed.

## Accepted source evidence

- r1 dependency verification (219 entries), root TypeScript/build passed on the existing identical lockfile dependency tree, Node24.21.0. Standard suite: 3,417 total / 3,414 pass / 1 fail / 1 skipped / 1 todo. Capacity CLI file rerun passed17/17 without weakening assertions; the original parallel-run failure remains unresolved. npm available11.19.0 differs from package11.9.0; no install or lock change.
- Retired inventory/pagination.tsx was removed only from this preparation branch under human call_60c2936d10684229a2f00ac301907319/0. Runtime type check passed. Shared replacement is runtime/common/ui/pagination.tsx; original workspace/history remain.
- QB accepted original offline V7 tools at e2286116, exact V8 release delta at cc70d8ff, and exact16 issuer/API/tools leaves at19d6e5b9. Existing directed checks are reused (243 for the latter); this is source/offline acceptance only.
- V8 preserves V7 ledger NULL/unknown semantics and adds only the approved two cmin SELECT and three specified child-table DELETE observations/rights in the source contract. Human call_4b2e8a96c83740ef9163778f9ef8c196/0 authorized source/contract work only. Actual grants are not authorized by that approval.
- Business integration entry at65f17b8b received QB single-leaf source PASS. It requires real ordinary-login commits, fresh-connection reads, reversal/reopen, rollback and original-key recovery; actual PG execution has not occurred.
- T45 installer successor02 fixes QB F01 via fixed connection-level lock3s/statement60s. QB narrow successor PASS adopted; old01 NEED_FIX retained. Four affected offline checks/syntax passed. Source transactions, CREATE DATABASE autocommit and UNKNOWN/no-replay behavior remain. Actual server timeout or cleanup is not verified.
- D1 new-target scenario preparation exact5 leaves fixed atf421edfb.24 directed checks and strict types passed; QB found one duplicate-receipt-ID mapping issue; the exact two-leaf fix is frozen atfc7c03bf for affected-only review alongside the two-leaf provider successor. Old QA897 identity and money approval are not reused. Actual database identity, independent money review, balances, versions and ledger samples remain absent.

## Current owners and next work

C alone owns Git and TASKS/PROGRESS/HANDOFF. D1 is writing only the test-only provider and corresponding unit test successor for fresh target/capture/money/source-input envelopes; the three delivered fixture leaves and integration entry are frozen. QB reviews fixed commits and incremental findings only. T45 alone prepares installer, backup/restore/readback and future server/database execution through the existing channel.

T45 has identified that existing backup tools bind production or old QA, and is preparing this target's executable recovery carrier. Restore must compare actual captured synthetic facts, not invented expected balances. Old application compatibility with V8 is unproven. After new writes or unknown commit, no old dump overwrite or destructive schema downgrade is allowed.

## Open gates

The current r1 target is not complete V6: four missing routines, three body mismatches and exact ACL/constraint/trigger predecessors must be repaired against independently established source expectations. Migrations1–26 do not prove completeness. Do not overwrite expected hashes with actual values or sequentially replay old patches on the live target.

Human call_7f5633370b664b06823b617c5848411b/0 has now approved the finite QA Unix preparer source extension only. T45 owns V7 and its directly affected tests; D1 owns V8 and its tests. Implementation is in progress; no environment execution is authorized. QA275 observed no TCP listener and /qa-socket:5432; no service configuration was changed. New database/role OIDs, target catalogs and private execution inputs must come from actual observations and independent review.

No new database, actual grant, seed/import, ordinary-login business run, restore or service deployment has been performed. The next concrete execution request must bind the reviewed carrier, source, exact target, least privileges, time window and cleanup; production coordinated cutover requires its own confirmation after isolated acceptance and backup/restore evidence. The full goal remains active.
