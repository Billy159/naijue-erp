# Local reported type-error corrections

Source inspection/corrections at 2026-11-04 04:54 UTC; base HEAD 051bbe1 plus preserved combined WIP. Local 11:56 report supplies the failing typecheck/build evidence; cloud did not rerun typecheck or build, so compilation is not certified here.

Five frontend positions were corrected:

1. apps/web/src/current-form/sales-create.ts: legacy read-only create preparation explicitly rejects null pricingRule/isGift/zeroConfirmed before constructing its nonnullable create intent. It never fills defaults. Incomplete draft support remains on the native atomic SAVE route.
2. apps/web/src/current-form/sales-existing-document.ts: verifies the original row is actually current before producing its sourceLine with literal isCurrent=true. Unknown pricing and all other facts remain unchanged.
3. apps/web/src/current-form/sales-proposal-form.tsx: input disabled is a boolean via isGift===true. A null gift marker is not rewritten to false in the document.
4. apps/web/demo-replica/frontend/runtime/documents/proposal-form.tsx: inferred local edit/display union preserves nullable historical fields instead of assigning them into the stricter fresh-entry type. No nullable cast or inferred gift value.
5. apps/web/demo-replica/frontend/runtime/documents/synthetic-preview-transport.ts: fresh synthetic create translation explicitly rejects a missing paymentMethodId, never invents one or claims historical preview support.

Runtime evidence: sales-create + signed economic edit 28/28. Expanded related models/views/preview suite 54 total, 53 pass, one existing read-display assertion failed: EXCHANGE positive row expected 换出2 but current shared signed-flow renderer displays 卖出2. That failure is preserved under evidence/ui/signed-ui-local-tsfix-targeted.log and reported to control; it is not a compiler result. No assertion deleted or skipped.

Local Codex must rerun exact typecheck/build on the final combined bundle. Real PostgreSQL, browser and production remain separate unverified tiers.
