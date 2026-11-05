# Thin-host v3 successor — 2026-11-01, NOT ENGINE GO

This additive status supersedes the earlier seven-leaf README's **offline-only /
no CLI yet** implementation status. Its source-contract limitations remain valid.
The original seven v1 files and three synthetic source artifacts are unchanged.

## Current candidate

- `run.mjs --run-opt02-legacy-cutoff-smoke` is a manual, exactly-one-new-target
  entry, never a default test. Proposed c20261101b001/TCP127.0.0.1:55446 only;
  target has NOT been started. No old cluster is reused.
- `engine-component.mjs` uses the original cutoff service/store and real original
  product-management service/source-current authorization/reader. Source setup103,
 2 warehouses/3 SKU/4 signed nonzero balances/2 confirmed sparse-zero holes is
  only a **legality smoke**, not representative wide-filter performance scale.
- `protocol.mjs` enumerates original writer/read SQL bytes before engine using
  explicitly SCRIPTED rows. Those are not DB receipts/publication/source approvals.
  Physical original-store invocation later must use the actual source files,
  actual native closure, unchanged guards and acknowledged receipt/audit checks.
- Source native/source row comparison covers all warehouse/SKU tuples and44 group
  members; published balances compare four source-known signed keys, version1 and
  actual original operation IDs. No target actual rows create expected values.
- Reader policy:86 explicit SELECT cells/16 tables; no credential/audit/receipt/
  DML/sequence/DDL/member rights. `p.*` uses all25 source columns, the cutoff-only
  admission function's SELECT* batch uses15 source columns. Actual effective ACL
  is still PENDING. Original PUBLIC EXECUTE is retained and inventoried; effective
  EXECUTE must equal PUBLIC rights, never claim zero private/default EXECUTE.

## Source and lifecycle

Original runtime comes from immutable C08-r2 anchor
`a3e9fb9969d116a60856da0d2ac4d4d1ca0e8e23`, tree
`b6815a5cd15e8bd63dd3368413423983eb2f96db`.
Expected SOURCE hashes inherit the exact reviewed M08 pin file SHA
`433a06d8edddb700bae04b7ddad01aba9ce81e80aea6f180f692bca4a37b403c`.
New closure is540 files(258 immutable after+282 active runtime/helper). This
component does not load C03, so its256 before pins are not part of this NEW
contract; old M08 guard is not changed. Active package registration `scripts.test`
is not invoked by this entry; all **other** package fields must strictly equal the
fully pinned immutable anchor's values, and both lockfiles remain pinned. This
narrow package projection is explicit and REQUIRES independent review, not an
excuse for changing dependency/type/import/engine/runtime fields.

The host reuses the immutable M06 lifecycle/source plan/observer/atomic v22 carrier
and the proved M08 global wire gate. Foreground process handle; TCP-only/SCRAM;
passwords/application scrypt RAM only;0700 dev/inode/UID/control ID birth; strict
captured backend PID+role exclusivity; absolute20min budget. No routine/schema/old
guard/pin editing. Source/body137 + trigger temporal nondrift + column/role matrix
checks are not full canonical/ordinary runtime acceptance.

All original store/read catch paths pass the shared physical query gate. Unknown
COMMIT sends no subsequent SQL, including ROLLBACK/observation/reset; captured
clients close, owned child stops, target quarantines without replay. Normal failed
pre-COMMIT work may roll back, preserving original+rollback errors. PASS is delayed
until all confirmed closes,0 other clients, nonforced definitive foreground close,
PIDfile absence/TCP ECONNREFUSED/control sameID shut. Private PGDATA/raw postgres
log must never enter delivery; errors/logs are redacted before controlled export.

## Four v2 review blockers addressed in NEW host leaves only

1. Every original command still proves native tuples; index3 additionally observes
   all4 nonzero source balances/version/operation and2 true absent keys BEFORE the
   original PUBLISH callback/five attestations. It retains the post-PUBLISH check.
2. Pin inputs/source/package/manifest/own files require regular/nonsymlink/exact
   realpath before read; O_NOFOLLOW descriptor dev/inode and post-read path identity
   bind the bytes. Package scripts.test-only projection never skips canonical checks.
3. New physicalClientFence captures the actual query data method and synchronously
   checks the global quarantine immediately before EVERY actual Client.query call.
   Admin budgeted SET/SQL, component setup/probe/timeout/original sends all use it;
   no await exists between this final check and the captured method invocation.
4. Stopped control must be code0, not timed out, uniquely identify actual birth/
   target systemID and say shut down. Wrong/unknown/duplicate IDs cannot PASS.

## Actual SOURCE validation so far (NO PG)

- all16 current .mjs syntax checks PASS (filenames/count in raw log);
- portable offline15 + anchor-dependent continuation9 + explicit VM review4 =
  28/28 source/fault PASS, exit0; help exit0 without engine;
-540 canonical inherited pins/runtime package projection PASS;
- original frozen7 pre/post hash mismatches0;
- exact immutable v2 source in the4 review regressions is intentionally4 FAIL,
  exit1: real same-byte directory symlink passed old SHA-only code; old original
  engine ordering callback published before its balance observer; deferred SET
  and guard each sent SQL while quarantined; wrong-ID shut-down text passed old
  control predicate. New v3 rejects all4. VM dependency mocks isolate ordering
  only and never produce DB/source approvals, receipts, capability or SQL evidence.

Raw external receipts: `performance-opt02-preflight/v3-fault-gates/`.
Old v2 metadata's “15 syntax” was an overcount of its README: its actual for-loop
checked all14 then-current .mjs. Its22 source tests remain historical, not v3 proof.
Old ZIP/warnings were not rewritten; new4-blocker recovery r2 warning is retained.

Reproduce only under exact Node24.21, without engine:

```
OPT02_REVIEW_SNAPSHOT=v2 node --experimental-vm-modules --test tests/performance/opt02/legacy-cutoff/review-regressions.test.mjs
# expected exit1, exactly4 real regression failures
OPT02_REVIEW_SNAPSHOT=v3 node --experimental-vm-modules --test tests/performance/opt02/legacy-cutoff/offline.test.mjs tests/performance/opt02/legacy-cutoff/continuation.test.mjs tests/performance/opt02/legacy-cutoff/review-regressions.test.mjs
# expected exit0,28 PASS
```

These are **not** PG, privilege, publication, query-plan or timing results.
`continuation.test.mjs` requires the immutable anchor; VM review tests require the
exact immutable v2 external source freeze and experimental Node VM flag. Neither
is a default suite. No new physical cluster/DB/role has been created or connected.

No production code, root entry, historical migrations or frozen M06/M07/M08 source
was changed. Optional original warehouse CREATE remains disabled; V2/history/
normalLists/native Product completeness/ordinary writes/performance are unproved.

Independent full code/contract review + exact controller physical-target GO must
precede any real attempt. First actual failure is retained/stopped; no adaptive
GRANT, guard change, source remapping, retry or old-target restart is permitted.
