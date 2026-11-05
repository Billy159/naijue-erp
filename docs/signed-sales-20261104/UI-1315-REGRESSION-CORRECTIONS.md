# Corrections for the exact 13:15 frontend findings

At 2026-11-04 05:25 UTC the two failures from the frozen 13:15 source were reproduced in the current working tree with Node 24.21.0. No changes were made to the frozen 13:15 validation tree.

## Actual renderer defect

sales-read-body.tsx computed signedFlow for every document with a negative row. That made the existing EXCHANGE positive direction display 卖出 instead of its existing 换出 label. The signedFlow-specific display is now limited to SALE. Historical signed SALE still shows separate 卖出/退回/净 quantities; EXCHANGE remains 退回/换出. Stored business types, quantities, amounts and rows are never changed.

The original SALE/RETURN/EXCHANGE × DRAFT/APPROVED/VOID assertions remain. The same actual renderer test additionally covers historical signed SALE in all three states, including positive/negative labels and net quantity.

## Invalid fallback test fixture

ordinary-preserving-edit.test.mjs supplied no saved-edit reader or preparation provider, but overrode the production canUseExistingProposal getter to true. Once capable historical forms stopped being blanket memo-only, that contradictory fixture necessarily attempted unavailable reference reads. The test now uses the real getter and asserts false both before and after opening. All existing 16 settlement rows, exact large amounts, null pricing/payment facts, single memo input, command count and exact saved payload assertions remain. It still tests the genuine unavailable-capability preserving fallback, not full economic editing. Full signed economic editing is covered separately by the actual editor/session model tests.

## Evidence

- Two-file reproduction: 10 tests, 8 pass, 2 fail. evidence/ui/signed-ui-two-regressions-red.log.
- Same two files after correction: 10/10. evidence/ui/signed-ui-two-regressions-green.log.
- Related six-file validation: 30/30, no skips/todos. evidence/ui/signed-ui-two-regressions-related.log.

Exact command uses ../erp-runtime-restored-20261102/tools/node-v24.21.0-linux-x64/bin/node --test followed by:

apps/web/demo-replica/frontend/runtime/documents/ordinary-preserving-edit.test.mjs
apps/web/demo-replica/frontend/runtime/documents/ordinary-signed-preserving-edit.test.mjs
apps/web/demo-replica/frontend/runtime/documents/sales-display-regression.test.mjs
apps/web/demo-replica/frontend/runtime/documents/sales-read-spec-overflow.test.mjs
apps/web/demo-replica/frontend/runtime/documents/sales-detail-summary.test.mjs
apps/web/src/sales/commands/signed-sale-economic-edit.test.ts

This is source/JSDOM validation only. No typecheck, live PostgreSQL, real browser, Mac access, production write or deployment was performed.
