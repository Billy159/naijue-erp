# Native sales command boundary, headless and not activated

This additive slice implements a bounded native command client and a session-owned
single-document controller. It does not enable an editor or alter existing sales
presentation, contracts, routing, API, schema, package scripts or application root.
No new endpoint, price configuration, original-sale reference, credit/account
balance feature, optimistic success or production fixture fallback is introduced.

## Existing endpoints and exact DTOs

- POST `/sales/commands`, `Content-Type: application/json`:
  - CREATE is `{ action: 'SAVE', requestKey, expectedVersion: null, draft }`.
  - EDIT is the same with the read document's positive safe-integer version.
  - State commands are exactly `{ action, requestKey, expectedVersion, salesId }`,
    where action is APPROVE, UNAPPROVE or VOID.
  - Draft header, actual current lines and up to three settlements use the existing
    domain field names. All money and quantity fields remain canonical exact
    integer strings. Server-managed header fields and display names are excluded.
  - Actor, role, scope, query parameters and arbitrary extra fields are forbidden.
- POST responds exactly with `{ operationId, salesId, version, status,
  ledgerEntryIds }`. It does not return a refreshed document.
- GET `/sales/receipts/:requestKey` responds exactly with `{ requestKey, action,
  status: 'COMMITTED', completedAt, result }`. It is always validated against the
  full original command's key, action, target and next CAS version. Receipt times
  preserve the native timezone-bearing contract, including numeric offsets.
- Existing POST `/sales/detail/query` remains the readback source through an
  explicitly injected existing `SalesReader.readDetail`; no alternate read route.

The transport is inert until called, same-origin/session-only, cache-disabled,
redirect-rejecting, and has no retry. UTF-8 requests are limited to the existing
65,536-byte HTTP bound. Its default response limit is 512 KiB (configurable up to
2 MiB), with a 30-second monotonic fetch-plus-body deadline (up to 120 seconds).
Technical decoding limits are not new business price/amount policies. The command
validator shares the existing sales read boundary's 2,000-line and 100-digit exact
integer limits; quantity storage is additionally signed int64.

## State and recovery ownership

Construct one `SalesCommandWorkspace` in a trusted session owner, with a dedicated
session-owned scope, a command client, existing detail reader, unique-key source
and access-failure callback. Construction reads and writes nothing. Do not attach
this scope's lifetime to a route component: retain the workspace across route
unmount and call `suspend()` to stop waiting. Before navigation consult `canLeave()`.
Call scope disposal before identity, session or permission replacement. All old
facts are cleared before notifying the host of 401/403. Observed 401/403 headers
fail immediately without awaiting any body; their body is cancelled and a
dispatched command stays uncertain. Late results cannot
restore them. The workspace never persists drafts or keys in browser storage.

A caller may explicitly provide a complete prepared draft to `openCreate`, or
`openExisting` may read an actual target. `replaceDraft` only accepts complete
native drafts on unsaved/new or existing runtime DRAFT documents. Old unknown
pricing metadata is not inferred from a ratio or zero amount. No change is sent by
editing, opening, closing or reading. SAVE never posts inventory. APPROVE requires
saved, unchanged DRAFT facts with exact receive-minus-refund equal to netDue.
UNAPPROVE requires APPROVED, and only confirmed unapproval plus a current readback
can reopen editing. VOID requires saved DRAFT. Document stockBasis is pinned on first read (new documents are runtime-pinned);
a later response cannot change provenance. Every historical CUTOFF_HISTORY
write remains unavailable. Independent RETURN/EXCHANGE uses native nonzero signed
rows, no original sale or return quota, and no whole-document discount. Negative
inventory is neither clamped nor used as a local rejection condition.

Each submission captures one deeply isolated/frozen key, target, CAS and complete
payload before any async boundary. Repeated clicks cannot create another operation
while pending or uncertain. Explicit `checkReceipt` and `replayOriginal` are the
only recovery calls; nothing schedules them. A receipt 404 is still uncertain. POST rejects only command-route error codes; a
receipt-only error code cannot prove a command rejection.
A replay rejection cannot disprove the original commit. Network, malformed data,
redirect, timeout, cancellation after possible invocation and 5xx remain uncertain.
Only a recognized original definitive rejection or known pre-invocation failure
allows a new operation. Local cancellation before client invocation is not-sent;
after invocation it conservatively retains the original command as uncertain.
The HTTP client separately distinguishes exact pre-fetch versus post-dispatch
cancellation. Neither cancellation nor route suspension claims server rollback.

A confirmed result marks existing display facts stale, not updated. Explicit
`readCurrent()` stores readback separately and rejects versions older than either
the last detail/current read or confirmed operation. Equal-version readback must
have the same status, and observed VOID is terminal: it cannot become editable or
advance to another version. A genuinely later APPROVED-to-DRAFT read remains valid
because another authorized operation may have unapproved it. It never overwrites the
original command, result, receipt, draft or CAS. `adoptCurrent()` is an explicit
replacement of local draft with current server facts and clears resolved operation
state. It does not force-save or auto-rebase local edits. `discardEditor()` is an
explicit discard only, never available for unresolved operations. UI consumers
must obtain the user's discard decision before calling it for dirty work.

The workspace retains at most one editor, current readback and original operation.
Dot-only keys `.` and `..`, though admitted by the native parser's general regex,
are refused before any new dispatch because browser URL normalization cannot
address their receipt path. Keys are never rewritten and no alternate endpoint is
attempted. A bounded 1,024-key session tombstone set refuses accidental operation-key reuse
and stops allocating operations if its technical capacity is reached; original
receipt/replay recovery remains available. It is not a document/business limit.

## Missing trusted native form providers: activation is false

`salesCommandUiActivation.available` is explicitly false. No UI has been wired and
none should be enabled by this slice. `SalesFormPreparationProvider` is an inert
future host contract for preparing complete new/edit drafts, not an implemented
provider, catalogue store, authority resolver, permission framework or endpoint.
A caller-supplied draft remains a proposal subject to all server checks.

Real native form composition still needs current authorized product/SKU selection,
product-level reference/minimum price facts, hall/customer/staff/same-hall warehouse
selection, payment-account/enabled-method selection, and trusted document/line/
settlement IDs and number preparation. No route for these is invented here.
`/sales/references/query` is historical-filter-only and must never supply create/edit
eligibility. Current product pricing, reference existence/enabled status and
authorization remain server-authoritative. Historical saved labels are not a
substitute for current eligibility, and stored reference prices are not forcibly
replaced with today's catalogue prices.

## Frozen source evidence and intentional boundary

Read as source only, never imported/executed:
`frozen-demo-ui/extracted/8877-ui-evidence-b8bcfe3/frontend/sales-current.js`:

- Lines 17–21, 47–49: dirty/busy leave protection and draft editing state.
- Lines 98–125: product/color/FIT/full-size line identity, explicit pricing intent,
  signed return/exchange rows, stable row order and separate business sections.
- Lines 195–207: explicit pick, saved-DRAFT void, save/approval validation, original
  request preservation, unapproval inventory reversal and negative-stock notice.

This slice uses only approved native application/domain/API contracts. It does not
copy the Demo service/runtime/catalogue, browser storage, automatic save-then-audit
chaining, inferred pricing defaults, source row merging or legacy write payloads.
A source-faithful visual editor is a later reviewed integration, not this result.

## Verification without external state

From repository root:

- `node --test apps/web/src/sales/commands/*.test.ts`
- `./node_modules/.bin/tsc --noEmit -p apps/web/src/sales/tsconfig.json`

The root test script does not recursively discover this new subdirectory; this
slice deliberately does not change package scripts. Tests mock HTTP/readers and
use only explicitly synthetic fixtures. No actual HTTP, browser, server, database,
installation, commit, push, deployment or Demo runtime/parity claim is involved.
