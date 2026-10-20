# Authorized sales filter references and named detail

This extends the single sales read contract and existing sales query HTTP plugin.
It is source-only implementation with synthetic verification, not production host
composition, an enabled endpoint, or evidence of real PostgreSQL execution. No
migration, storage field, catalog seed, account, network request, service listener,
installation, commit, push or deployment was used for this slice.

## Sales FILTER candidates, not business-form pickers

POST `/sales/references/query` accepts exactly:

- `kind`: `hall`, `salesperson`, `customer`, or `warehouse`.
- `search`: a trimmed string of 0–200 characters without control characters. Name
  search is a case-sensitive literal substring, including `%`, `_`, and backslash;
  customer search also includes its existing native customer code.
- `page`: a positive safe integer whose product with 20 is safe.
- `pageSize`: exactly 20.

The exact response is `{ page, exactTotal, items: [{ id, label }] }`. `exactTotal`
is an exact nonnegative decimal string on HTTP, never a JavaScript Number. IDs
are canonical native UUIDs and labels are full current master names, not invented
business identifiers or shortened captions. An out-of-range page is empty with
its true exact total, not a fallback first page.

On every call the service reuses the existing trusted sales authenticator and
current sales LIST authorization with a neutral bounded list intent. The granted
SalesReadScope is applied to native sales headers before deriving candidates.
The PostgreSQL reader uses a correlated EXISTS against those authorized headers:
only the unique native references actually observed there are available. A hall,
person, customer or warehouse that exists only in unreadable sales, or that is
unused master data, is not listed. This introduces no role-to-hall inference,
new master-catalog permission, client-supplied actor, or permissive default.

Historical filtering deliberately includes disabled halls, warehouses and
customers and former or differently classified staff when an authorized sale
references them. Otherwise an old document could not be found by its reference.
This endpoint does NOT establish create/edit eligibility, enabled-only business
candidates, available sales staff, default choices or cross-hall assignment rules.
Those require their own approved business-form reference policy. Do not reuse
this historical filter provider for a save/approve form.

Candidate count and its stable name/ID-ordered 20-row page are two bounded result
queries in one READ ONLY REPEATABLE READ snapshot. Counts and page lengths are
checked exactly; malformed/duplicate IDs or blank labels fail, never become empty
successful results. Search/scope/page values are driver parameters; table and
column names come from a closed internal map. Empty grants deny before connecting.

## One richer detail contract

POST `/sales/detail/query` keeps the single detail path and now requires:

- `document` and `stockBasis`, as before.
- `referenceNames`: `hallName`, nullable `salespersonName`, `customerName`, and
  `warehouseName`. These are CURRENT master names read with the authorized header
  in this detail snapshot, not list facts or historical header snapshots.
- `settlementNames`: exactly one record per returned settlement with `settlementId`,
  `paymentAccountId`, `accountNameSnapshot`, `methodNameSnapshot`,
  `currentAccountName`, and `currentMethodName`.

The existing stored settlement account/method snapshots are the authoritative
historical payment display. A later master rename must not overwrite them. Current
account/method labels are separately named facts for explicit presentation, not a
replacement for the stored display. Null salesperson remains null; no identity or
label is fabricated. Existing schema NOT NULL/FK facts govern the other names.

Header/reference names, at most 2,000 current native line snapshots, and at most
three settlements with names are read in three set queries on the same authorized
READ ONLY REPEATABLE READ client. Disabled reference rows are joined without
active-form eligibility filters so historical facts remain displayable. Oversized
detail fails rather than truncates. No frontend per-ID requests, product hydration,
current catalog load, or N+1 queries are needed. Exact money/quantity decoding and
HTTP decimal-string serialization remain unchanged.

## Required host and verification boundary

`TrustedSalesSnapshotReader.readReferences` is required. There is no compatibility
provider, optional empty fallback or second named-detail endpoint. A real host must
explicitly compose the existing current-session authenticator (including trusted
Origin/cookie checks), a current sales read policy and injected PostgreSQL pool.
Importing/constructing the provider does not connect, create a server or migrate.
The UI must consume the enriched strict contract; backend-only checks cannot prove
host, UI lifecycle or production wiring.

Scoped checks from the repository root:

- `node --test tests/sales-query.test.ts tests/sales-reference-query.test.ts tests/sales-query-postgres-protocol.test.ts apps/api/src/sales-query-http.test.ts`
- `./node_modules/.bin/tsc --noEmit -p evidence/sales-reference-typecheck.json`

The SQL tests use scripted driver responses and inspect generated SQL text. They
verify requested query structure, scope/parameter forwarding, bounds, snapshot
sequence, decoding and failure behavior. They do not establish PostgreSQL parser,
optimizer, query performance, real snapshot visibility, locks, runtime execution,
DDL admission, browser behavior, production authorization correctness or deployment.
Original sales query review/evidence is a historical frozen-base review, not review
of this extension. Extension verification has its own source manifest and logs.
