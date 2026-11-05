# Explicit CURRENT proposal host composition

Parent checkpoint: `d6620a5`. Cloud source and synthetic tests only; no actual data,
PostgreSQL target, listener, migrations/imports, credentials, deployment or browser
integration was used. The paused actual-data batch remains paused.

## Trusted opt-in, unchanged default

`createPostgresReadApi` accepts optional
`currentForms: { authorization: CurrentFormAuthorization }`. A missing option,
including `authorization: { mode: "source-confirmed-native" }` alone, installs no
CURRENT routes (all five remain 404). When explicitly supplied, the host validates,
captures and binds the method before allocating its bounded pool or first await.
Malformed, inherited, undefined/null and extra-key option shapes fail closed.

The optional branch registers only the existing `createCurrentFormHttpPlugin`,
using the existing sales cookie/session authenticator and
`PostgresCurrentFormReader` with the same one factory-owned bounded pool. It adds:

- `POST /current-form/sales-references/query`
- `POST /current-form/transfer-warehouses/query`
- `POST /current-form/products/query`
- `POST /current-form/product-skus/query`
- `POST /current-form/sku-batch/query`

The base 19 explicit routes become 24 only on opt-in. No command, receipt, listener
or pool is added. Session authentication still has its existing separate snapshot;
CURRENT identity, authorization and candidate facts share ONE RR READ ONLY
snapshot/lease. The pure authorizer neither re-authenticates nor opens a second
connection. Request role/hall headers and role/grant JSON cannot select policy.
Cookie-only origin/credential checks and sanitized plugin errors remain intact.

## Explicit pure source-confirmed policy

`packages/application/src/source-confirmed-current-form-authorization.ts` exports
`createSourceConfirmedCurrentFormAuthorization()`. Hosts must deliberately select
it; neither generic provider mode nor the native profile silently chooses it.

It consumes the reader-supplied immutable `CurrentFormIdentity`, validates canonical
account/staff/hall IDs, actor/identity account-and-hall equality, the exact role
vocabulary and complete intent/query/context. Unknown or malformed identity/intent
fails `FORBIDDEN`; an already-aborted read remains `CURRENT_FORM_READ_ABORTED`.
This is trusted host code, not a way to submit roles/grants in requests.

- SALES reference intents and SALES product/SKU contexts: SALESPERSON receives
  only their current hall and cannot propose a foreign sales hall. ADMIN/WAREHOUSE
  receive all, subject to the reader's same-snapshot selected enabled hall checks.
- TRANSFER warehouse intents and TRANSFER product/SKU contexts: all validated
  canonical roles receive all eligible proposals. Do not reuse the historical
  FROM/TO/creator-hall document visibility union as new-draft endpoint eligibility.
- Shared customers, staff, products, methods and accounts gain no hall ownership.
  The grant authorizes the form context, not an invented ownership column.
- Reader identity still requires an enabled current salesperson hall. Transfer
  FROM is enabled OR nonzero inventory; TO is enabled. A candidate's
  `hallEnabled=false` remains a fact, not a newly invented exclusion.

Source rationale: `packages/application/src/transfer-policy.ts:5–18` permits a new
draft's eventual trusted creator-current-hall branch independent of endpoint halls;
`transfer-service.ts:63–81` checks the proposal and captures creator account/hall/role.
The handoff candidate corroborates this at
`erp-handoff/source/naijue-erp-v0.0.1/server/security/service.ts:164–168` (new transfer
trusted creator snapshot) and `server/security/policies.ts:32–40` (creator-current-hall
branch before endpoint checks). This is not permission to read arbitrary existing
transfers. Sales identity/context gates remain in
`adapters/postgres/src/current-form-reader.ts:77–120`; existing source authority for
current-hall sales vs ADMIN/WAREHOUSE is recorded in `native-read-authorization.md`.

## Verification

Preserved commands, exact return codes and source hashes are in
`evidence/current-form-host-composition-manifest.json`. Focused test log:
`evidence/current-form-host-composition-scripted-tests.log`; focused strict
TypeScript log: `evidence/current-form-host-composition-focused-typecheck.log`.

The focused 78-test run covers existing CURRENT HTTP/reader contracts plus the
new optional host and pure policy. It proves scripted protocol behavior, including
default 404, five-route opt-in in both host authorization modes, one lazy pool,
captured/bound provider immutability, cleanup/no listener, malformed pre-allocation
rejection, credential/origin/bearer spoof denial before proposal reads, own/foreign
sales hall handling, native identity revocation, cross-hall transfer FROM/TO with
disabled hall facts, complete pure intent validation and absent command/receipt
routes. Pool-construction/shutdown failure checks include the optional branch.

It does not prove actual SQL execution, PostgreSQL snapshot behavior, real
browser/TLS/network cancellation, production source/runtime acceptance, complete
form preparation/numbering, command authorization or deployment. No retries or
new background task are added. To roll back, remove/revert only this checkpoint's
manifest-listed owned changes, not other workers' files.
