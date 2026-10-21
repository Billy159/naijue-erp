# CURRENT form browser proposal reader

This opt-in client covers the five standalone `/current-form/.../query` routes. It
uses the shared bounded same-origin session transport, not client actor/role/grant
claims. Input parsers run before network activity. Counts decode from canonical
integer strings to bigint; page/count/ID and batch-order mismatches fail rather
than returning partial or guessed facts. Staff may retain another hall; source
warehouses may be disabled with stock while targets must be enabled. Missing
minimum-price and barcode authority remains explicitly UNAVAILABLE.

Payment method references carry their own native id/name and null account-only
metadata. Payment-account requests require the selected native method; returned
account metadata must match it. No all-method account fallback, guessed catalogue,
retry, cache, listener or command is introduced.

Ten focused synthetic Fetch/Response tests pass. This is not browser visual, real
socket/TLS, PostgreSQL, full create-form or production-host acceptance. No production host automatically consumes this client yet; the opt-in proposal
editor below is its first UI consumer. The root test script
includes `apps/web/src/current-form/*.test.ts` for subsequent full checks.

## Opt-in NEW transfer proposal editor

`TransferProposalSession(scope, createCurrentFormHttpReader(options))` and
`TransferProposalForm` now provide a local **unsaved proposal** editor: explicit
source/target warehouse lookup, paginated product then actual-SKU lookup, line
addition/removal, raw exact quantity/date validation and confirmed reset/cancel.
The session owns invalid raw input too. The host must retain the session across
transient view unmounts and call `dispose()` on actual route exit; the supplied
identity `ReadScope` automatically clears it on session/permission invalidation.
Only explicit user picker actions start reads. Searches replace in-flight reads;
close/reset/cancel/identity invalidation reject even abort-ignoring late results.
No historical filter candidates, Cartesian SKU generation, stock availability
assumptions, persistence, auto-retry, command, document number or barcode is added.

`session.validate()` returns a frozen `TransferProposal` only after local checks.
This is the deliberate future handoff seam, NOT `TransferDraftDto`: a trusted
preparation service must re-read eligibility and native snapshot facts, supply
approved numbering/IDs, and then bridge into the existing command workspace.
`barcodeAvailability: UNAVAILABLE` is preserved, not converted into a known-null
barcode. Without an injected preparation capability the form disables Save; the explicit
application opt-in described below connects native preparation and SAVE. This slice does not claim completed sales/transfer creation.

Verification (synthetic only):

```sh
node --test apps/web/src/current-form/*.test.ts
node apps/web/src/current-form/tests/run-dom-tests.mjs
npm run typecheck:web
```

The DOM test exercises the actual current-form HTTP reader with synthetic Fetch
responses; it is not real-browser visual/production/database acceptance.

## Reachable native transfer CREATE flow (explicit opt-in)

A configured application can now set
`routes.transfers.commands = { newRequestKey, manualCreate: true }`.
The actual **调拨单列表 → 新增调拨单** action lazily loads the proposal view and
existing action stylesheet. Candidate reads are still action-only. A Save click
sends IDs/quantities/date/note only to `/transfers/prepare-create`; no browser
snapshot, number, actor or barcode is accepted as native preparation input.
The preparation response must match that intent and contain native MAIN barcode
facts, then the existing `TransferCommandWorkspace` sends one SAVE with null CAS.
Its existing command form takes over: uncertain outcomes, receipt checks, same-key
replays, current-detail read/adopt and later approvals remain that workspace's
responsibility. Preparation does not itself write or mean “saved”.

The backend must explicitly enable `nativeManualTransferPreparation:true` in its
trusted authenticated command composition; default read-only hosts are unchanged.
Missing prep endpoint/MAIN barcode, malformed or mismatched preparation fail closed
without SAVE. Proposal changes/reset/cancel, identity changes and newer prep
attempts invalidate old responses. Repeated Save while preparing or after handoff
cannot create a second command. The application navigation guard includes raw
proposal input before a native workspace exists. Exit after native handoff keeps
unresolved-write guards; clean reopen starts a fresh proposal.

`TransferNewDocumentSession`, `createTransferPreparationHttpClient` and
`transferPreparationIntent` are the explicit reusable bridge. Native IDs/numbers
come only from the preparation response, not a new browser numbering policy.

## SALE proposal (local validation only)

`SalesProposalSession` / `SalesProposalForm` provide explicit hall, customer,
salesperson, warehouse, product/SKU, payment-method and method-scoped account
selection; line/settlement addition/removal; exact money/quantity validation;
domain half-up discounts, bounded order discount and signed settlement balance.
New prices start blank, not guessed from retail. Missing retail is not zero;
ordinary zero needs confirmation; gifts are explicit. Changing hall with dependent
input requires confirmed reset, so prior-hall references cannot silently persist.
Without an injected native preparation capability this standalone view remains
local and Save is unavailable. The actual opt-in application bridge below enables
SALE and independent RETURN/EXCHANGE through trusted preparation.

Additional verification:

```sh
node apps/web/src/current-form/tests/run-create-route-dom-tests.mjs
```

This exercises the real application transfer route with synthetic Fetch responses,
including NEW→prepare→SAVE, clean reopen and the disabled default read-only path.

## Reachable native SALE CREATE flow (explicit opt-in)

`routes.sales.commands = { newRequestKey, manualCreate: true }` enables the actual
销货单列表 → 新增销货单 proposal route. The default read-only route stays unchanged.
`SalesNewDocumentSession` serializes only explicit native reference IDs, quantities,
yuan price intents/discount tenths and method/account settlements to
`POST /sales/prepare-create`. Server-owned snapshots, nine-price proof, minimum
prices, numbers and generated IDs are never supplied as browser authority.
Returned header/line/settlement intent is strictly correlated. A changed discount
reference basis cannot silently change the price accepted by the user's Save
click: mismatched preparation is rejected before any SAVE.

`SalesEditorSession.openPreparedCreate` adopts a validated native draft; existing
form compilation, permissions, native SAVE/null CAS, original-request uncertain
recovery, receipt checks and later reread/adopt remain the existing editor's job.
Missing native pricing proof, barcode or current reference facts is an explicit
preparation rejection, not a zero/default price or simulated save. Invalid input
and failed preparation preserve the proposal. Current403 uses the same application
access-failure callback as commands; late/cancelled failures cannot expire a new
identity. Three settlements follows the existing native contract, not a new
mandatory-field rule. Required hall/customer/warehouse/date/actual-line input is
unchanged; salesperson remains optional.

The opt-in application bridge supports SALE and independent RETURN/EXCHANGE.
An explicit business-type selector preserves entered row signs when switched;
SALE requires positive quantities, RETURN/EXCHANGE allow nonzero signed quantities,
force zero whole-document discount and preserve signed totals (no original-sale
lookup or cap). Switching type clears the whole-document discount to zero.
The backend proof/MAIN/reference requirements remain identical. Repeated SKU rows retain independent local row keys, prices and signed quantities;
editing/deleting targets only that row and preparation preserves their order.
Rows are never merged or deduplicated by SKU.

Shared `sales-payload-budget.ts` controls 200-line request/response/SAVE budgets;
large UTF-8 and escaped-note regressions cover actual transport without relaxing
the generic read transport's default bound. Known backend transactional rejections
remain definitive; unknown409 responses remain uncertain.

```sh
node --test apps/web/src/current-form/sales-create.test.ts apps/web/src/sales/commands/*.test.ts
node apps/web/src/current-form/tests/run-sales-create-route-dom-tests.mjs
```

These are synthetic response tests, not PostgreSQL/production/browser acceptance.
