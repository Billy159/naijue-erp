# Retained REAL normal BATCHED wrapper: one-file source delta

This is source delivery only, not a new run/measurement. No server/PG/raw business reads, no preflight/cleaning/full package recompilation, no synthetic harness/tests. 08 remains canceled. Existing results/roots remain frozen.

## Change

Replace tools/unified-import/r3-service20-retained-import.mjs on the current same380 source tree after applying D1's current host delta and D3 normalized nine files. The existing function name/signature runOriginalR3Writer03 is retained. It uses the existing retained index+summary+manifest+approvals through the exact genuine host callback and original registered prepare factory (coalesce:false, original INIT binding).

The old whole-package execution body is replaced by prepareCliBatchedState + runBatchedStreamOperation with the same read-only state and borrowed same reviewed client. Full original requests/operation keys survive; no source-identity rebasing, request splitting or synthetic profile. All future program cursors used by the genuine binding/guard come from disk, not the source/compiler. Normal coordinator handles real group COMMIT ACK, known rollback and UNKNOWN/original-key inspect unchanged. No COREstop, new fault injection, permissions, DDL, or factory/brand modification.

The existing separate reconcileOriginalR3Readback20 is byte-identical. It remains caller-controlled, independently admitted final readback; BATCHED COMPLETED is not VERIFIED, PENDING is not COMMITTED, and cleanup UNKNOWN/FAILED is never changed to CLOSED.

## Required caller inputs (T45 normal private consumer)

All original config/sourceRoot/target/privateInputs/hostOptions/onPrivateInitializer stay intact. Add privateInputs.batchBinding using exactly the existing normal CLI binding shape, taken from actual approved values:

```js
privateInputs.batchBinding = {
  manifestSha256: privateInputs.summary.manifest_sha256,
  target,
  admin: privateInputs.options.initialization_identity,
  registration: privateInputs.options.registration ?? null,
  sourceOptions: Object.fromEntries(Object.entries(actualCliValues).filter(([key]) =>
    key === '--target-profile' || key.endsWith('-approval-sha256') ||
    key === '--historical-line-amount-evidence-sha256' ||
    key === '--current-effective-alignment-sha256')),
};
```

actualCliValues means T45's actual normal arguments/approved SHA values, not a new approval or guessed summary field. Required target profile remains FRESH35_COMPACT_ZERO_FIRST_IMPORT_V2. This is persisted only via context.bindingSha256 plus original manifest/identity/counts/totals; no private connection or scrypt enters the public plan context. Same normal CLI arguments/report can subsequently use --resume; do not infer missing sourceOptions hashes.

Optional privateInputs.batchPlanPath defaults to dirname(indexPath)/batched-plan.sqlite, the existing formal private report. T45 must keep that report persistent. Creation is exclusive0600 via existing planner; no pre-existing plan overwrite/delete. If it already exists the first-writer entry stops before host/preparation; the normal resume route handles it under original proof. No speculative ROOT-ABSENT recovery factory is added.

Host purpose stays FIRST_REAL_BUSINESS_IMPORT, prepareOnly=false and transactionMode=BATCHED_V1; other approved service/reference/profile/parent pins are unchanged. The original same registered prepared object is retained, not spread/cloned. The callback can privately retain the original initializer exactly as before.

State and source plan close independently in finally, both are attempted. Local cleanup failure preserves the acknowledged import result but marks local_cleanup FAILED. Physical host alone closes the real client; unknown acknowledgement remains unknown and requires original-key inspect.

## Validation and integration boundary

New wrapper Node24 --check passed. Static delta confirms old whole executor removed, original preflight never added, first-create same registered object, same read-only preparedPlan/borrowed client, original readback function unchanged. No fake live host/PG or old suite rerun. Source narrow review is required; actual retained data/PG execution belongs to T45's existing direct import authorization.

Only one runtime file changes. SOURCE-BOUNDARY.md identifies exact ownership. D1 must confirm/include this wrapper and D3 helper pins in the current source loader; final sourceSet/actual161/catalog/authority are produced by the original loader, not copied from these source pins. No new standalone server command or credentials are generated.
