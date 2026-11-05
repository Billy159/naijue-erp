# Signed sales UI continuation, 2026-11-04

Base HEAD: 051bbe14a4cba4e1849b8547665f13df85dd8fe0. This is an uncommitted combined workspace, not a pushed or deployed release. Existing WIP and earlier field-overflow work are retained.

## Current implemented scope

- Saved historical signed SALE opens the ordinary existing proposal editor when actual saved-SKU reader and native preparation capabilities exist. Unknown old pricing/gift/zero-confirmation and payment-method facts no longer force this capable editor into memo-only mode.
- Retained row IDs, signed quantities, original snapshots, old untouched amounts and nullable facts are carried into the native SAVE proposal. Same-SKU rows remain separate.
- Original historical whole discount is retained exactly. Changed line totals minus that discount determine the displayed net; no allocation is invented. Attempts to change the retained historical discount are rejected.
- Changed historical rows with explicit nonnegative price but incomplete intent may submit a draft proposal with the null flags intact. Approval is a server decision with row-specific missing-fact checks; this UI does not certify approval.
- Missing historical settlements display unknown, never settled zero. SAVE carries only actual payment rows. No synthetic refund or receipt is created.
- Existing two business-type choices are retained; historical signed SALE cannot be switched by the UI. New mixed documents still use the existing return/exchange mapping and zero whole discount.
- If required saved-SKU/capability reads are unavailable, the existing preserving memo fallback or readback error remains. No missing reference is fabricated to unlock editing.

## Execution sequence and evidence

Prior worker's RED compiler and proposal logs are preserved under evidence/ui. Resume baseline found an inconsistent fallback DOM fixture that forcibly advertised canUseExistingProposal=true without providing its required reader/preparation. Only that test override was removed; all original row, settlement and memo-preservation assertions remain. This fixture is the unavailable-capability fallback, not proof of economic editing.

New incomplete-row regression first failed: expected exact net 600 but UI projection returned unknown, preventing SAVE. After model change it passed with original nullable intent flags intact. See signed-sale-ui-incomplete-red.log and -green.log.

The real SalesEditorSession → SalesExistingDocumentSession → native ordinary submitProposal chain is exercised with synthetic read/command transports, preserving CAS, SALE, discount, original sibling row and actual single receipt. This is not PostgreSQL or browser acceptance.

Actual runtime: cached Node 24.21.0, invoked from ../erp-runtime-restored-20261102/tools/node-v24.21.0-linux-x64/bin/node.

Commands:

- node --test apps/web/src/sales/commands/signed-sale-economic-edit.test.ts apps/web/demo-replica/frontend/runtime/documents/ordinary-signed-preserving-edit.test.mjs : 8/8 at incomplete-row checkpoint.
- node --test apps/web/src/sales/commands/*.test.ts apps/web/src/current-form/sales-proposal.test.ts apps/web/src/current-form/sales-create.test.ts : 129/129 at 03:52 UTC. Exact output in evidence/ui/signed-sale-ui-resume-regression.log.

## Remaining verification and local acceptance

Type checking was not executed under current admission restriction. Real PostgreSQL, real browser and production are unverified. No Mac files, credentials, real records or production were accessed.

Local Codex should use the final combined source, install only in an isolated backed-up target, then verify: historical signed SALE with original discount and nullable facts opens the full editor; change quantity/price/product/SKU; confirm original row provenance and untouched sibling snapshots; save unbalanced draft; approval gives exact missing fields/difference without creating payments; record genuine payments and approve; check unapprove/reapprove stock and duplicate/rollback behavior through real API and ordinary account. Repeat after closing/reopening the page. Also verify new mixed return/exchange net-receipt, net-refund and zero-net cases, whole discount rejection, two type options, signed detail/list summaries and preserved same-SKU opposing rows.

Sales independent scanner workspace removal is a separate coordinated view-only change. Transfer scan workspace and product/barcode business capability must remain untouched.

## 2026-11-04 04:47 UTC: original mixed-sale discount across edits and reopen

An independent audit found that deriving historical mixed mode from current negative rows lost the original exception after the last negative row was removed/flipped. Ordinary discount allocation then rejected a preserved discount above the edited positive subtotal. Two new tests first failed (net projection unknown instead of -400; reopened mode false). A third RED proved the initial saved-detail draft decoder also rejected that valid historical net.

The authenticated detail read now supplies optional historicalSaleOrigin with kind SIGNED_SALE and originalOrderDiscount as exact minor units, derived by the backend from the same document's original snapshot/audit lineage. Frontend validates its exact shape, CUTOFF_HISTORY and SALE scope, and equality to the current retained header discount. It does not infer this origin from stockBasis alone or current row signs. The projection seeds presentation-only mode across sign changes and reopen; it is never emitted in a SAVE proposal. Ordinary pure-sale/new rules remain unchanged.

The preserved-discount calculation now allows edited positive subtotal 100 minus original discount 500 = net -400. Both business-type setters refuse switching a proven originally mixed SALE. Initial saved-detail decoding permits the matching authenticated origin without guessing original per-line discount allocations. The full existing editor→SAVE proposal synthetic chain also covers reopening all-positive rows and original discount above subtotal. Malformed, extra-key, changed-discount, runtime, and non-SALE origin projections are rejected; omitted projection stays omitted.

Evidence: signed-ui-origin-red.log, signed-ui-origin-read-red.log, their GREEN counterparts, and signed-ui-origin-session-green.log. Focused origin/UI cases pass. Broad source run before concurrent diagnostic tests: 167/167. Subsequent shared run: 171 total, 169 pass, two concurrent settlement-diagnostic tests failed and were reported to their owner; see signed-ui-origin-regression-final.log. That run is not a combined green result. No real PostgreSQL, browser or typecheck was performed by the UI worker.

After the diagnostic owner completed the expected RED→GREEN work, the same broader command was rerun at 04:48 UTC: **172/172 pass**, no skipped/todo. Exact evidence is signed-ui-origin-regression-reconciled.log. The earlier two-failure log remains preserved rather than overwritten. This reconciles the concurrent source-level failure only; real PostgreSQL and browser remain unverified.
