# Independent party receipt403 recovery repair review

Status: PASS for the separately frozen fix. The defect recorded in the sealed application integration review is resolved by the source snapshot below; that original review, failed reproduction and baseline hashes remain unchanged as historical evidence. No production code was edited by this reviewer.

## Exact source snapshot

`party-receipt403-independent-source.sha256` records and verifies:

- `parties/controller.ts`: `bd0c324fe40e5e57cc18a00179f27d2719fa5e604c37f3ec0eb39237a5dfc9ab`.
- `parties/receipt-access-recovery.test.ts`: `3a8e69ae84842a444630b40fdbcd621f957704e9538b626b9c78f14a2ce3b421`.
- `parties/README.md`: `d318759d0ab641b45a1e9a210cf697dbdb979281ba701883ae4cbdaafa53d772`.
- Unchanged composed party route: `3b119f0e24eb19a6375f7a1cd85171f56f6e6f489c6e5ede4da51ea21d55c104`.
- Unchanged application controller: `a11e11d6d0fc8f8fa34461b391632b41fc746886c067f11837940f5af4a98d02`.

The owner corrected an intermediate self-referencing closure inference error before this final snapshot. All final independent checks below were rerun after the final opposite-kind direct lookup was present. No intermediate TypeScript claim is carried into this result.

## Source review

- `controller.ts:219-222` computes the actual write outcome before access cleanup. Replay rejection remains uncertain because it cannot establish the original dispatched command was uncommitted. A fresh definitively rejected command does not incorrectly suppress the old ordinary403 cleanup merely because its transient phase is `submitting`.
- `controller.ts:235-243` suppresses forbidden cleanup only when this controller's original outcome or its bounded sibling remains unresolved. It does not suppress unauthenticated cleanup, grant server permission, read new denied facts, retry writes, fabricate a receipt or infer rollback.
- `controller.ts:255-266` checks only the opposite validated customer/supplier controller in the existing two-entry session workspace. Independent kind stores are not merged, no unbounded catalog or persistent state is added, and `canLeave` remains guarded.
- Existing generation, scope and abort checks still precede handling of late receipt/write results. Trusted identity replacement disposes the entire session as before.
- The application's transfer-only403 branch and its current-request401 guard are unchanged; this repair does not expand transfer disposal to writable party state.

## Independent actual composed verification

1. Re-ran the exact immutable baseline script:

   `node evidence/application-core-integration-independent-party403-repro.mjs`

   It now exits0. The new log is `party-receipt403-independent-composed-repro-after-fix.log`. Before and after receipt403 remain ready/customers/authenticated with the original locked name and replay control, one key and one dispatched command. The script's diagnostic JSON `status` string still says `OPEN DEFECT` because it was deliberately retained byte-for-byte; that hard-coded baseline label is not the post-fix outcome. Its unchanged preservation assertion now passes.

2. Added and ran a new independent composed probe:

   `node evidence/party-receipt403-independent-composed.mjs`

   Three groups passed against the actual composed root, real Arco customer editor and native party HTTP adapter with mocked HTTP/CSS:

   - A lost dispatched atomic EDIT preserves exact whitespace/name, target ID, expectedVersion7, disabled state and request key through receipt403, receipt404 and replay403. Inputs stay locked, navigation stays blocked, no new key or automatic submission occurs. An explicit subsequent successful replay sends a byte-identical request body and accepts the validated native version8 result.
   - Abort-ignoring late receipt401 and receipt403 after trusted account/auth-version replacement do not expire the new principal, restore old editor facts or repopulate old recovery state.
   - Fresh current receipt401 and replay401 still expire global auth and clear workspace/editor/recovery surfaces. Raw server denial text does not render.

3. Independently executed the owner's targeted tests:

   `node --test apps/web/src/parties/receipt-access-recovery.test.ts`

   Final15/15 passed. The source was reviewed alongside these cases: both kinds, immutable command identity, receipt recovery, replay403→success, sibling read403 during submitting/uncertain, sibling fresh rejection, current401 for receipt/replay/sibling, stale401/403 after suspension/replacement, ordinary403 without unknown work, and uncertain fresh403.

## Evidence and limits

- All independent outputs are in `party-receipt403-independent-*.log` and this report. The original failed log, baseline script and sealed app review/evidence were not overwritten. Their evidence manifest still matches SHA256 `758ae948038f27f85feef9e63ac09a79af2031731daccd236abaa5ce591ddcb3`.
- Installed Arco emits known React19 `element.ref` warnings in local mocked DOM runs; all assertions pass.
- No remaining fix defect was found in this scope. This is source/synthetic-runtime evidence, not browser/visual/performance or production acceptance.
- No production edits, commit, aggregate compiler, network, listener/server, DB, browser or install. Scoped TypeScript, split-build and broader party regressions remain the owner's separate results and are not relabelled as independent executions.
