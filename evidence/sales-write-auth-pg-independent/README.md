# Independent review: genuine-PG sales action acceptance preparation

Reviewed base: `60457e0`. Owner slice: exactly the new `sales-write-authorization-acceptance.ts` plus backend source guard, plan, manifest and entry-point append-only wiring. No blocking finding remains.

## Results

- Independent connection-free source/safety/migration/proof suite: **24 passed, 0 failed** (`source-tests.tap`).
- Five reviewed source hashes remained unchanged across checks (`source-before.sha256`, `source-hash-check.txt`).
- New TypeScript file syntax check and `git diff --check`: passed. No independent typechecker was started; the owner separately reported its integration typecheck pass.
- Backend plan: 24 scenario labels; existing parent/setup make **26 intended real tests**, not 26 executed tests. Sparse plan remains seven labels.
- Database/fresh/exclusive/source-hash/loopback/owner checks, operator runner, and old backend/HTTP/native acceptance bodies match `60457e0` byte-for-byte (`preservation-check.txt`). Original 22-test evidence is not relabeled or replaced.

## Source review conclusions

1. The action cases use actual `PostgresSalesUnitOfWork` and the new transaction-bound action authorization, with a separate finite synthetic reference/economics provider. No production composition is created. ADMIN and WAREHOUSE each exercise cross-hall SAVE/APPROVE/UNAPPROVE/VOID through valid versions; the missing privileged action chains noted in early review were added before the final checks.
2. SALESPERSON edits/voids a same-hall document created by another actual account but cannot approve it, even when the business salesperson field identifies that salesperson. Its own approval and forbidden unapproval, cross-hall denials, approved-state and stale-version denials remain distinct.
3. Original SAVE replay and GET receipt after later APPROVED state compare the original operation/version without adding business rows. Current login disable rejects both. GET receipt uses explicitly labeled fixture authentication with genuine native PG action policy, not actual write-session authentication.
4. Account, staff and hall UPDATEs are started while the command is checkpointed after its actual native hall-lock statement. The updater PID must be observed waiting on that exact command PID using `pg_blocking_pids`; the command then completes and metadata UPDATE proceeds. No global lock count or elapsed sleep is accepted as proof.
5. Inverse ordering cases hold an uncommitted account disable or ADMIN-to-SALESPERSON change, observe the exact waiting command/backend pair, then commit and require FORBIDDEN with identical business snapshots. The role-change case deliberately targets another creator's document, so stale ADMIN privilege would cause an observable failure.
6. The hall-freshness case first locks staff, starts and demonstrably blocks the command's identity SELECT, then disables the hall in the holding transaction. After COMMIT, FORBIDDEN with no business mutation requires the independent current-hall statement, rather than an old joined snapshot.
7. Observation windows and command/drain waits are finite; existing server lock/statement/idle limits remain in force. Finally paths release checkpoints, drain captured promises, roll back unfinished maintenance, release/discard clients and restore the narrowly selected fixture metadata. There is no automatic retry of mutations, commands, failed queries or uncertain COMMIT.

## Unexecuted boundary

**PostgreSQL remains stopped and unconnected in this review.** No real lock contention, READ COMMITTED engine recheck, migration execution or new engine test pass is claimed. The checks establish source preparation and preserved guards only. The exact guarded suite still needs separately authorized execution on a fresh disposable target. No listener, browser, account, secret, session, new Pool, production plugin, migration or deployment was created by the review.

Reviewer writes are confined to this evidence directory. The owner's five implementation/guard files were read only.
