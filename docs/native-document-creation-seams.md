# Native document creation: bounded integration seams

`sourceConfirmedCreateDocumentNumber(kind, documentId, sourceNumber?)` in
`packages/application/src/source-confirmed-document-number.ts` follows the frozen
`server/domain/transactions/command.ts` CREATE branch (lines 227–245). It preserves
a supplied nonblank number unless its untrimmed value starts with `unsaved-` or
`草稿-`; otherwise it returns `V2-XS-<UUID8>` or `V2-DB-<UUID8>`. This intentionally
does **not** implement XH/DB daily sequencing, allocate/reserve numbers, or promise
global uniqueness of the eight-character prefix. It prepares only a number.
An existing document keeps its persisted number; do not call this helper to
renumber SAVE. Keep document identity, number, request key and payload stable on
retry. Existing storage uniqueness and command idempotency remain authoritative.

`createAuthenticatedDocumentCommandsPlugin` in
`apps/api/src/authenticated-document-commands.ts` is an explicit host composition
for the existing `/sales/commands`, `/sales/receipts/:requestKey`,
`/transfers/commands` and `/transfers/receipts/:requestKey` routes. The host must
supply a trusted authentication service, exact HTTPS origin and complete sales
and transfer dependencies. It reuses session resolution/CSRF checks, transaction
services, current access checks, version comparison, receipts and inventory rules.
It neither opens a listener nor changes `createPostgresReadApi` or installs write
routes in the read-only host. Do not pass read grants as command authorization.

## Remaining explicit gates

- A CURRENT-form proposal is **not** a complete command draft. Snapshot and
  barcode facts must come from a trusted preparation path; barcode availability
  `UNAVAILABLE` is not a known `null` barcode.
- Native sales rules require a real catalogue-completeness verifier and complete
  reference/economics facts. This composition supplies no permissive default.
- The existing transfer reference policy checks warehouses and formal SKU use;
  it does not itself establish newly supplied snapshot-label/barcode authority.
- These seams do not assert that creation is enabled in the default application. No migration, data import,
  production connection, automatic host activation or deployment occurs.

Verification uses synthetic in-memory command stores and Fastify injection, not
real business data or a live PostgreSQL acceptance run.


## Native manual-SKU transfer preparation

Opt into `nativeManualTransferPreparation: true` on the authenticated command
composition to install `POST /transfers/prepare-create` and add native snapshot
revalidation to the original transfer reference policy. No opt-in means no route.
The exact request is `{businessDate, note, fromWarehouseId, toWarehouseId,
lines:[{skuId, quantity}]}` (quantity is canonical integer text; note is string or
null). No number, actor, ID, snapshot or barcode is accepted from the browser.
The response is the complete `TransferDraft` JSON, with bigint quantities encoded
as strings, for the existing SAVE command (`expectedVersion:null`). Keep that
prepared draft and the original SAVE request key unchanged across a retry.

The preparer uses the original transaction to lock current SKU/product/color/fit/
size/group-membership and actual enabled MAIN barcode records. It requires schema
0009 and at least one eligible MAIN for every selected SKU. Missing MAIN, disabled
references or missing size-group membership fail closed. Raw barcodes are not
trimmed or regenerated. It creates no document, receipt or inventory effect.
The native SAVE reference profile reloads changed/new snapshots transactionally;
stale labels/barcodes fail rather than silently replacing the user's prepared
command. Exact retained snapshots remain historical facts. This profile covers
manual current SKU selection, not scanner creation from CONFIRMED_OLD aliases.

The optional method `TransferTransaction.getCurrentTransferSnapshots` is supplied
by the PostgreSQL unit of work. Non-native adapters without that method fail
closed. The composition still requires the original full transfer dependencies
and preserves their reference checks; read authorizations are not substituted.

Sales remains separate: current nullable price columns cannot prove whether all
nine original price keys were supplied (explicit null) versus omitted (unknown).
No existing persistent product-input/publication evidence structure is available
to implement `NativeCatalogueCompletenessVerifier` truthfully from schema version
alone. This work does not create one or pass an always-true verifier.

### Shared bounded wire budgets

`transfer-payload-budget.ts` is shared with browser clients. Preparation accepts
at most 200 rows, a 10,000-UTF-16-unit note and 128 KiB JSON request bytes. SAVE
accepts at most 512 KiB. Before returning a prepared draft, the server checks its
actual serialized UTF-8 length (including escaped text and bigint-as-string), a
511 KiB response ceiling and the worst supported SAVE envelope (200-character
ASCII request key and maximum safe integer version). Oversized native snapshots
fail preparation with `413 TRANSFER_PAYLOAD_TOO_LARGE`, never a success that is
known to exceed SAVE's wire limit. Labels/notes/barcodes are not truncated. These
are bounded technical admission limits, not new business numbering/stock rules.
