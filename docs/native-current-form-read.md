# Native CURRENT form proposal reads

Original parent source: `2d0f5d2ef79a1d48f63a85cb0242661d2e54efde`.
Current account parity amendment: see `native-account-production-parity.md` and
`evidence/account-production-parity/manifest.json`; original25-test evidence remains historical.
The initial slice added ports, strict parsers and a PostgreSQL reader. A later
standalone `createCurrentFormHttpPlugin` adds five bounded authenticated POST read
routes under `/current-form/`: `sales-references/query`, `transfer-warehouses/query`,
`products/query`, `product-skus/query` and `sku-batch/query`. It requires explicit
trusted authentication and an authorization-enforcing reader, validates before
provider calls, serializes bigint counts as decimal strings, rejects stale SKU
batches with sanitized HTTP409, and forwards/rechecks cancellation. No permissive
grant, pool, listener or automatic host registration exists. Existing read-only
API composition originally remained unchanged. A later separate explicit
`currentForms: { authorization }` opt-in is documented in
`native-current-form-host-composition.md`; without it even the native profile
still installs none of these routes. Production forms, numbering and commands are
not enabled. HTTP tests use Fastify.inject, not a real browser/socket deployment.

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
  Kinds are hall, customer, salesperson, warehouse, paymentMethod and paymentAccount. Only the
  hall picker uses null hallId. All other queries explicitly name their proposed
  sales hall. The paymentAccount kind additionally requires canonical paymentMethodId;
  other kinds reject that property. The hall must exist, be enabled, be in the host grant, and match the current
  salesperson's hall. Admin/warehouse action scope is not narrowed to their own hall.
  The paymentMethod kind returns its canonical native method in item id/name;
  code, hallId/hallName and account-only paymentMethodId/paymentMethodName are null.
- `readTransferWarehouses(actor, { direction: FROM | TO, search, page, pageSize: 20 }, signal)`.
- `readProducts(actor, { context, search, page, pageSize: 20 }, signal)`.
- `readProductSkus(actor, { context, productId, page, pageSize: 20 }, signal)`.
- `readSkuBatch(actor, { context, skuIds }, signal)`, for 1–200 unique target IDs.
  All requested IDs must still be eligible. Failure does not identify a missing or
  disabled target. The standalone HTTP adapter maps this whole-batch conflict to409. The successful response preserves requested order.

Context is exactly `{ kind: SALES, hallId }` or `{ kind: TRANSFER }`. Each page has
page, literal pageSize 20, exactTotal bigint, and items. The standalone HTTP boundary
serializes bigint as an exact decimal string, not Number. It does not register itself in the native host.

Candidate search is a bounded 0–200-character, already-trimmed, control-free string.
`strpos(lower(native text), lower(parameter))` is a literal case-insensitive
substring: percent, underscore, backslash and quotes are not wildcard/code. Existing
PostgreSQL locale rules apply; browser Unicode-locale parity is not claimed.

Non-account counts and stable name/code + native-ID-ordered pages (method-ID order
for payment methods) use two set
queries in the same snapshot. Account counts remain pure current eligibility; optional
recommendation reads use a short-budget savepoint and stable account-ID bucket order. Pagination is exactly 20 and real out-of-range pages stay empty.
The batch uses one bounded target query, never per-SKU calls. No historical-observed
master filter, eager full catalogue or fake all-entity ID is used. Optional recent-use
recommendation has a bounded runtime-document proof, never a candidate eligibility filter. Native labels and IDs remain intact.

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
- Payment account and its one selected native method must both be enabled and the
  account actual method must equal the required paymentMethodId. Hall affiliations
  and the one bounded proven recent account are unioned recommendation ordering
  only, never an ACL or count restriction. Optional failure leaves all eligible
  accounts selectable in stable native-ID order. Frozen
  sales-funds-ui.js:17,22 and candidate sales/validation.ts settlement handling
  explicitly support this distinction. No balances, debt or invented fund rows.
- Payment method candidates come from enabled native payment_method rows with an
  EXISTS check for at least one enabled payment_account whose actual method is
  that row's ID. This preserves the inspected online selector eligibility, not
  a broader all-enabled catalogue or a guessed list reconstructed from accounts.
  Native method ID/name are returned unchanged, with no account payload, account
  recommendation or account-hall ownership filter. Count/page use the same
  eligibility/search predicate and stable native method-ID order. See
  `native-current-payment-method-selector.md` for exact source references and
  this amendment's synthetic-only verification.
- Transfer FROM is enabled OR has nonzero native inventory; TO is enabled. The
  existing transfer-policy does not reject a warehouse merely for hallEnabled=false,
  so this reader returns that fact and does not invent a new hall-enabled rule.
  Explicit host hall grants are applied before count/page. No prior-transfer
  visibility predicate is used as create eligibility.
- Products must be enabled. SKU reads require enabled SKU/product/color/fit and an
  actual size-group membership. They return actual four-dimensional native IDs,
  original SKU/product codes and full labels, never a generated cross-product.
  Shared product/customer/staff/method/account records acquire no invented hall ownership.

## Honest storage and launch boundaries

The original0001–0008 prefix stored only product.retail_price. Source0009 now defines
the approved nine prices, but this deliberately incomplete proposal projection still
exposes only retail and does not manufacture catalogue-completeness authority. Product responses
preserve its exact nullable decimal(18,2) yuan text and state
`minimumPriceAvailability: UNAVAILABLE`. They do not expose a fabricated minimum
price, nine-price set or no-minimum policy. Missing is not null/zero business facts.

Source0009 now defines the approved native barcode relations. This proposal reader
does not yet expose a trusted current barcode picker or claim the schema is installed. SKU responses therefore state
`barcodeAvailability: UNAVAILABLE`, do not include a fake null barcode, and never
borrow a historical observation to manufacture a CURRENT binding.

The nine whole-product price fields and barcode scheme/binding design have already
been approved. Their implementation gap is not a request to repeat that decision.
See native-catalogue-authority-next-step.md for the separate minimal implementation
plan. This read slice cannot be passed straight to SalesRuleFactResolver or treated
as a complete Sales/TransferDraft preparation provider. Document numbering, trusted
transaction reference/pricing assembly and real write-host startup still remain.

## Verification and rollback

`node --test tests/current-form-reader.test.ts` had32 synthetic/parser/scripted
pg tests in the historical account amendment; the original25-test log is a historical artifact. Later payment-method amendment results
are recorded separately in `evidence/current-payment-method-selector/`. Earlier focused results
and exact source hashes are in evidence/account-production-parity/. These check strict bounds and immutable capture, fresh identity/revocation,
explicit grants/scope, source-specific eligibility, stable native facts, exact prices
and counts, bounded target sets, aborts and cleanup. They inspect requested SQL but
do not run a PostgreSQL parser/engine, locks, isolation, optimizer, production host,
real authentication/browser workflow or performance acceptance. No install, actual
DB/operations, full build, commit, push or deployment ran in this slice. Current
focused TypeScript is recorded in the amendment evidence.

The original slice added new files. Its removal recipe is historical, not a safe
recipe for the later account/method contract amendment. Revert current amendment
using its scoped manifest, not by deleting shared domain files. Original scope: the
three current-form TypeScript modules, current-form-reader.test.ts, this document,
native-catalogue-authority-next-step.md and the current-form evidence files listed
in evidence/current-form-reader-manifest.json. Do not reset other workers' files.
