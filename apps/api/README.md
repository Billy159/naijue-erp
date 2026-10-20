# Provisional sales HTTP boundary

This is a small Fastify 5.12.5 plugin, not a running server or production composition. `createSalesHttpPlugin` registers two provisional routes around the existing application service. It never calls `listen`, selects a port, constructs a database client, or creates credentials. Tests use `app.inject` and the clearly labelled synthetic transaction/reference/economics providers in `tests/support`, not PostgreSQL.

## Required trusted composition

Call `createSalesHttpPlugin({ authenticate, dependencies })` and register its return value with a Fastify instance. A normal Fastify registration prefix can namespace both routes. `dependencies` is the existing `SalesDependencies` interface: atomic unit of work, authorization, business rules, clock and ID provider. All providers are mandatory and are checked when creating the plugin. Missing providers fail closed; there is no built-in password, token, demo-account, actor header, permissive policy or default actor.

The asynchronous authenticator receives only `{ headers, ip }`, before body parsing, and returns a server-verified `ActorContext` or null. Null returns 401 before any storage call. Malformed server identity or unexpected authentication failures return a generic 500. Its result is copied into a fresh, frozen actor context; request bodies cannot set identity, hall snapshots, audit identity or approval metadata.

Authorization/reference existence and scope remain the trusted server provider's responsibility, for every relevant hall, warehouse, customer, staff, SKU and payment account. `SalesAuthorization` runs on the source document and, when saving changes, the proposed document. Economics/sign/discount/reference-price snapshot checks remain `SalesBusinessRules`, at the existing application lifecycle stages. This HTTP layer validates reference syntax but does not invent a full ERP permission model, silently accept references, or turn a syntactically valid UUID into proof of existence/access. A provider should reject denied or non-disclosable references with `DomainError("FORBIDDEN", ...)`. Unexpected or unknown provider errors are not exposed as public diagnostics.

A production composition must independently supply and verify real authentication, all reference and economics checks, PostgreSQL transaction behavior, credential/session handling, CSRF protection where applicable, rate limits and appropriate proxy/logging configuration. The plugin does not provide login, cookies, CORS, session creation or production auth infrastructure. There is no default production composition to accidentally start.

## Wire rules

- POST requires `application/json`, with an optional normal charset parameter. Its body limit is 65,536 bytes, a transport bound, not a business monetary cap.
- Every documented object must contain exactly its listed fields. Unknown fields and missing fields are rejected at every nested level; no stripping, coercion, defaults or string trimming occurs. Optional business values must be explicitly null. Both routes reject all query parameters.
- `requestKey` is the original operation key, 1–200 characters from ASCII letters, digits, `.`, `_`, `:`, `-`. It is preserved exactly. A retry must reuse the exact key and original complete command, including original expected version. A new user operation requires a new key. There is no automatic key generation/replacement.
- `expectedVersion` is a positive safe JSON integer for existing documents. Only a creating SAVE may specify null. Missing, string, zero, negative, fractional or unsafe versions are rejected. The application enforces the actual current version and create/update distinction.
- All IDs use the existing lowercase canonical UUID-shaped internal ID contract. They are references, not display names or newly created records.
- Every quantity is a canonical signed integer string in the existing signed-64-bit range. Every money value is a canonical signed minor-unit integer string, without decimals, exponent notation, plus sign, leading zeros or negative zero. JSON numbers are rejected for these fields. The boundary does not select a currency scale, monetary cap, rounding, pricing, return/exchange sign convention or discount algorithm. Transport parsing preserves exact bigint values.
- Line numbers are positive safe JSON integers. Booleans must be JSON booleans. Business dates are actual `YYYY-MM-DD` calendar dates.
- Response bigint values, if any, are encoded as decimal strings, never converted to JSON numbers. Current command/receipt results contain only IDs, status, safe integer version and ID lists.
- Responses on both routes, including handled errors, use `Cache-Control: no-store`.

## POST /sales/commands

SAVE body has exactly `action`, `requestKey`, `expectedVersion`, `draft`. `action` is `SAVE`.

`draft` has exactly `header`, `lines`, `settlements`:

- `header`: `id`, `number`, `businessType`, `businessDate`, `hallId`, `customerId`, `salespersonId`, `warehouseId`, `grossAmount`, `orderDiscount`, `netDue`, `note`.
  - `businessType` is `SALE`, `RETURN` or `EXCHANGE`.
  - `salespersonId` is a staff UUID or null; `note` is a string or null.
  - `number` is an existing supplied document number, not allocated by this boundary. Its cross-document uniqueness is a storage/production policy concern.
- Each line: `id`, `salesId`, `lineNo`, `skuId`, `quantity`, `referencePrice`, `dealPrice`, `pricingRule`, `discountTenths`, `zeroConfirmed`, `lineAmount`, `allocatedDiscount`, `isGift`, `snapshot`, `isCurrent`.
  - `referencePrice` is a money string or null. Other monetary fields are money strings.
  - `pricingRule` is `UNIT_PRICE` or `DISCOUNT`; `discountTenths` is an integer 0–100 (0.0–10.0 折) or explicitly null for direct unit price. `zeroConfirmed` is a required boolean, never inferred from amount zero. The concrete policy checks rule/discount consistency.
  - `lineAmount` is signed gross quantity × actual unit price; net line amount is gross minus `allocatedDiscount`.
  - Incoming `isCurrent` must be true. Retaining former rows is handled by the service, not by sending inactive lines from the client.
  - `snapshot`: exactly `productCode`, `productName`, `colorName`, `fitName`, `sizeName`, `barcode`. All are strings except `barcode`, which is a string or null. No inferred dictionaries, barcode generation or product pricing logic is supplied.
- Each settlement: `id`, `salesId`, `lineNo`, `paymentAccountId`, `direction`, `amount`.
  - `direction` is `RECEIVE` or `REFUND`; `amount` is a nonnegative money string. The application permits at most three rows, verifies document ownership and unique row IDs/positions, and checks exact settlement equality on approval.

The three transition body shapes have exactly `action`, `requestKey`, `expectedVersion`, `salesId`; action is `APPROVE`, `UNAPPROVE` or `VOID`. No client stock delta, actor, created/approved identity, status, version override, debt/balance, import modifier or original-sale/original-line link is accepted.

Successful commands return 200 with exactly the existing `SalesResult`: `operationId`, `salesId`, `version`, `status`, `ledgerEntryIds`. The original result is returned for an exact replay, after rechecking current access. The same key with changed content returns 409.

The application remains authoritative: SAVE changes no stock; only drafts can be edited/voided; approval requires exact receive-minus-refund equality with net due and posts effects without truncating negative stock. Approved edits require unapprove, edit, reapprove. RETURN/EXCHANGE use the shared sales-document model and do not require original-sale links. Historical cutoff edits/transitions remain explicitly rejected with `HISTORICAL_POSTING_NOT_IMPLEMENTED`; the boundary does not claim that baseline-aware historical modification is implemented or permanently unnecessary.

## GET /sales/receipts/:requestKey

The key follows the same exact syntax. Retrieval is scoped to the authenticated account using `SalesTransaction.getReceipt`, inside its unit of work. A missing receipt returns 404. Before disclosure, the current target document is loaded and authorization is checked for the recorded action, just as command replay checks current access. A receipt is a committed-operation result, not a document read permission or account-wide operation feed.

A successful 200 body has exactly `requestKey`, `action`, `status` (`COMMITTED`), `completedAt`, `result` (`SalesResult`). It does not expose internal request hashes, actor identities, documents, audit rows or settlement details. Another account cannot retrieve the original account's receipt simply by knowing its key.

## Errors and intentionally missing endpoints

Handled errors use `{ "error": { "code": "...", "message": "..." } }`. Messages are deliberately generic. Known input syntax failures return 400, missing authentication 401, denied access 403, unavailable document/receipt 404, unsupported media type 415, oversized body 413, known state/version/idempotency/historical conflicts 409, and known domain quantity/settlement validations 422. Unknown policy, storage, authentication or server errors return 500 `INTERNAL_ERROR`, without SQL/provider text. Registration errors are not HTTP responses. The error mapping is an explicit allowlist, not trust in an arbitrary provider-supplied HTTP status.

No document list/detail, inventory read, approved-settlement statistics, account balance/debt, historical import/edit, transfer, login or frontend endpoint is added. The existing pure statistics function remains approved-only; no read-specific permission contract is invented to expose it over HTTP.

## Verification

Focused checks, with the already installed pinned dependencies and no installation/network listener:

- `node --test apps/api/src/sales-http.test.ts`
- `npm run typecheck`
- `npm run build`

The synthetic HTTP tests cover authenticated identity isolation, revoked access and actor-scoped receipt recovery; exact replay/version guards; SALE/RETURN/EXCHANGE save/approve/unapprove/edit/reapprove; negative stock; settlement equality; void and historical rejection; exact bigint handling; nested unknown fields, references, dates, integers and booleans; malformed/oversized JSON and unsupported media; and transaction failure rollback/retry. These tests do not establish real database, production auth, browser UI, deployment or full ERP acceptance.


## Candidate-source pricing adapter

`packages/application/src/sales-business-rules.ts` provides an optional concrete, mandatory-facts adapter based on directly inspected candidate `server/domain/sales/money.ts:27–39` and `validation.ts:43–74,149–170`, not proof of frozen-Demo runtime equivalence. No default provider is installed by HTTP. Product reference/minimum facts and enabled SKU→product identity must be supplied by trusted server catalogue reads; missing facts fail closed, never default to zero. Other document references and enabled payment-account/method identity remain an explicit required trusted callback, not implemented production reference policy.

Both new RETURN and EXCHANGE enum values deliberately map to the candidate's same independent combined return/exchange economics. Either may contain any nonzero signed rows. SALE requires positive quantities; all stock effects are `-quantity`. UI negative defaults or direction toggles do not narrow backend acceptance. Whole discounts apply only to SALE, with largest-remainder ties by original calculated row index. Current array order must be ascending persisted `lineNo` to preserve that index across database readback. Same-SKU rows are not merged.

Discounted unit price is nonnegative half-up `(referenceMinor × discountTenths + 50) / 100`, before multiplication by integer signed quantity. Gift prices are zero, skip minimum-price and discount-price equality checks, and still move stock. Ordinary zero requires confirmation and remains subject to product minimum. Existing reference snapshots are not replaced with today's catalogue price; negotiated deal prices may differ across lines.

Drafts may be unbalanced; approval requires exact signed RECEIVE-minus-REFUND sum, including mixed directions. A zero-net document needs no rows. Explicit absolute-zero RECEIVE/REFUND both map to signed zero and still need valid references. No virtual empty-account row is persisted.
