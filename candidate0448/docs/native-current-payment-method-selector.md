# CURRENT payment-method selector

Source-only amendment based on integration HEAD `0b40e5a`. A genuinely new form
must obtain a canonical selected paymentMethodId before querying payment accounts;
it cannot borrow an account's current method as the user's intended method.

## Contract and authorization

The existing `readSalesReferences` query adds kind `paymentMethod`, with exactly
`{ kind, hallId, search, page, pageSize: 20 }`. hallId is a required canonical
proposed sales hall. Extra paymentMethodId/account/actor/grant properties fail
before connecting. The existing standalone authenticated POST
`/current-form/sales-references/query` accepts the kind through its strict parser;
there is no sixth route or new host registration.

Each call still uses the existing explicit authorizer and one fresh
REPEATABLE READ READ ONLY account/staff/hall snapshot. Proposed-hall checks run
before catalogue queries: the hall must be enabled, within the trusted host grant,
and equal the current salesperson's hall. These checks authorize use in the form;
they do not make shared payment methods or accounts hall-owned.

Returned item id/name are the original native payment_method ID/full name. code,
hallId, hallName, paymentMethodId and paymentMethodName are all null; the latter
pair remains account-only metadata. No enabled method is fabricated from an
account, label matching, known list or historical observation. The next account
query must explicitly supply the selected item ID as paymentMethodId, exactly as
before. There is still no all-method account lookup.

## Source-faithful eligibility and order

Inspected source is the existing handoff tree
`erp-handoff/source/naijue-erp-v0.0.1/`, not a new live-source or actual-data read:

- `frontend/real-data-bridge.mjs:1203` methodOptions requires an enabled native
  method with at least one available account; lines1185–1196 require that account
  to be enabled and its sole actual method to equal the selected enabled method.
- `frontend/sales-funds-ui.js:17–18` expresses the same enabled-method/eligible-
  account condition in the earlier funds dialog. It does not imply methods own
  the current hall.
- `server/security/master-data.ts:133–134` reads preserved source methods ordered
  by native ID. The new schema's `0001_runtime_sales.sql:73–75` has only method
  id/name/enabled/version: there is no native method code, hall or display-order
  authority to invent.

The bounded native query therefore selects enabled payment_method rows and uses
EXISTS(enabled payment_account with payment_method_id = method.id). Disabled
methods, methods with no accounts, and methods with only disabled accounts are
excluded; multiple eligible accounts do not duplicate a method or its count.
No join to payment_account_hall, hall filter, account projection, recent-use
ranking or inferred priority is added. Stable order is method ID, not name order.
This implements the verified selector rule in native storage; it does not claim
byte-for-byte legacy/source UUID sequence equivalence across different databases.

Both exact count and page use the same enabled/EXISTS/literal-search predicate in
one snapshot. The normal strict 0–200-character search uses parameterized
strpos(lower(name), lower(search)); percent, underscore, quotes and backslash stay
literal. Pages remain fixed20, genuine out-of-range pages stay empty, and
exactTotal remains bigint (decimal string at HTTP), never a Number.

## Focused verification and boundaries

The amendment's48 passing checks (38 reader/parser/scripted-pg and10
Fastify.inject groups) plus focused TypeScript exit0 are recorded with exact
commands/hashes in `evidence/current-payment-method-selector/manifest.json`. Tests exercise strict
query capture and bounds, unchanged authenticated route, fresh identity and
explicit grant/proposed-hall denial, SQL enabled/EXISTS predicates, no method-hall
ownership, literal search, ID order, exact large counts, out-of-range pages and
fail-closed malformed native facts. Scripted pg tests inspect the exclusion SQL;
they do not execute enabled/zero-account cases in a PostgreSQL engine.

This is synthetic/parser/scripted-pg/Fastify.inject and focused TypeScript evidence
only. Frozen `d26b7cc` PostgreSQL17.11 schema10 evidence predates this selector and
does NOT cover its new SQL/behavior. No new database/engine run, schema migration,
native host/listener, production operation, real authentication/browser test,
actual intake/import batch, full aggregate suite, install, push or deployment is
part of this amendment. The uploaded actual-data batch remains paused. Account
recommendation, transaction locks, command pair checks and business/schema
decisions are unchanged.
