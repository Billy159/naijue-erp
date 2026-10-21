# Native CURRENT form proposal reads

Parent source: `2d0f5d2ef79a1d48f63a85cb0242661d2e54efde`.
This slice adds new ports, strict parsers and a PostgreSQL reader only. It does not
register HTTP routes, change the deliberate read-only API composition, enable
production forms, allocate document numbers, change schema or authorize commands.

## Explicit composition

Construct `PostgresCurrentFormReader(pool, authorization)` with an existing trusted
pool and a mandatory `CurrentFormAuthorization`. There is no native-policy default,
permissive grant or fallback provider. Construction never connects. The host must
first authenticate the real session and supply its immutable account/current-hall
actor; callers cannot put actor/role/grants in the form query.

Every call captures strict input, then starts one `REPEATABLE READ READ ONLY`
snapshot. In that snapshot the reader checks the current native account, staff and
hall: enabled login, exact `在职`, one of the existing three roles, and exact actor
hall equality. A non-null hall must exist and be enabled. A salesperson needs a
hall. It then calls the explicit trusted form authorizer with copied, frozen,
non-secret identity and intent, and validates its explicit `all` or bounded unique
`halls` grant. Passwords, session tokens and credentials are never selected.

These are proposal snapshots, not locking command facts. A new call rechecks
identity and authorization. A form response cannot authorize a later save/approve
or prevent changes between read and submit. No cross-request facts cache exists.

## Current public TypeScript contract

`packages/application/src/current-form-ports.ts` defines:

- `readSalesReferences(actor, { kind, hallId, search, page, pageSize: 20 }, signal)`.
  Kinds are hall, customer, salesperson, warehouse and paymentAccount. Only the
  hall picker uses null hallId. All other queries explicitly name their proposed
  sales hall; it must exist, be enabled, be in the host grant, and match the current
  salesperson's hall. Admin/warehouse action scope is not narrowed to their own hall.
- `readTransferWarehouses(actor, { direction: FROM | TO, search, page, pageSize: 20 }, signal)`.
- `readProducts(actor, { context, search, page, pageSize: 20 }, signal)`.
- `readProductSkus(actor, { context, productId, page, pageSize: 20 }, signal)`.
- `readSkuBatch(actor, { context, skuIds }, signal)`, for 1–200 unique target IDs.
  All requested IDs must still be eligible. Failure does not identify a missing or
  disabled target. The successful response preserves requested order.

Context is exactly `{ kind: SALES, hallId }` or `{ kind: TRANSFER }`. Each page has
page, literal pageSize 20, exactTotal bigint, and items. A future HTTP boundary must
serialize bigint as an exact decimal string, not Number. No HTTP contract is added.

Candidate search is a bounded 0–200-character, already-trimmed, control-free string.
`strpos(lower(native text), lower(parameter))` is a literal case-insensitive
substring: percent, underscore, backslash and quotes are not wildcard/code. Existing
PostgreSQL locale rules apply; browser Unicode-locale parity is not claimed.

Counts and stable name/code + native-ID-ordered pages use two set queries in the
same snapshot. Pagination is exactly 20 and real out-of-range pages stay empty.
The batch uses one bounded target query, never per-SKU calls. No document-history
scan, historical-observed master filter, eager full catalogue or fake all-entity ID
is used. Native labels and IDs remain intact.

## Eligibility and evidence

- Sales halls/customers are enabled native rows. Sales warehouse candidates are
  enabled, have an enabled hall, and belong to the proposed sales hall, as required
  by the existing sales rule reference contract.
- Staff candidates use native exact `employment_status = '在职'`, with no invented
  role, staff-hall, login-account or account-enabled restriction. Current staff is
  only recommended first. Frozen b8bcfe3 sales-current.js:58 includes all enabled,
  non-left staff and recommends the current user, not only same-hall salespeople.
  Native staff has no separate `enabled` column. This slice does not invent that
  missing legacy flag or claim full legacy enabled-flag equivalence.
- Payment account and its one native method must both be enabled. Hall affiliations
  are recommendation ordering only, never an ACL or count restriction. Frozen
  sales-funds-ui.js:17,22 and candidate sales/validation.ts settlement handling
  explicitly support this distinction. No balances, debt or invented fund rows.
- Transfer FROM is enabled OR has nonzero native inventory; TO is enabled. The
  existing transfer-policy does not reject a warehouse merely for hallEnabled=false,
  so this reader returns that fact and does not invent a new hall-enabled rule.
  Explicit host hall grants are applied before count/page. No prior-transfer
  visibility predicate is used as create eligibility.
- Products must be enabled. SKU reads require enabled SKU/product/color/fit and an
  actual size-group membership. They return actual four-dimensional native IDs,
  original SKU/product codes and full labels, never a generated cross-product.
  Shared product/customer/staff/account records acquire no invented hall ownership.

## Honest storage and launch boundaries

Current migrations 0001–0008 store only product.retail_price. Product responses
preserve its exact nullable decimal(18,2) yuan text and state
`minimumPriceAvailability: UNAVAILABLE`. They do not expose a fabricated minimum
price, nine-price set or no-minimum policy. Missing is not null/zero business facts.

Current migrations have no native barcode authority relation. Only historical line
barcode_snapshot columns exist. SKU responses therefore state
`barcodeAvailability: UNAVAILABLE`, do not include a fake null barcode, and never
borrow a historical observation to manufacture a CURRENT binding.

The nine whole-product price fields and barcode scheme/binding design have already
been approved. Their implementation gap is not a request to repeat that decision.
See native-catalogue-authority-next-step.md for the separate minimal implementation
plan. This read slice cannot be passed straight to SalesRuleFactResolver or treated
as a complete Sales/TransferDraft preparation provider. Document numbering, trusted
transaction reference/pricing assembly and real write-host startup still remain.

## Verification and rollback

`node --test tests/current-form-reader.test.ts` passes 25 synthetic/parser/scripted
pg tests. These check strict bounds and immutable capture, fresh identity/revocation,
explicit grants/scope, source-specific eligibility, stable native facts, exact prices
and counts, bounded target sets, aborts and cleanup. They inspect requested SQL but
do not run a PostgreSQL parser/engine, locks, isolation, optimizer, production host,
real authentication/browser workflow or performance acceptance. No install, actual
DB/operations, compiler/build, commit, push or deployment ran in this slice.

All implementation changes are new files. To revert only this slice, remove the
three current-form TypeScript modules, current-form-reader.test.ts, this document,
native-catalogue-authority-next-step.md and the current-form evidence files listed
in evidence/current-form-reader-manifest.json. Do not reset other workers' files.
