# Native sales reference/economic facts on the original transaction

This is explicit opt-in source implementation, not a production write host, real
catalogue publisher, genuine-PG lock/transaction acceptance or an enabled form.
The prior synchronous candidate rules and explicit synthetic providers remain
compatible. No domain, shared authorization policy, HTTP route or schema-execution
path is changed by this slice.

## Async original-transaction seam

`SalesBusinessRules.assertDraftChange(previous, draft, tx?)` and
`assertReferencesAndEconomics(document, tx?)` now allow void or Promise<void>.
The service awaits both methods and passes the original command transaction before
persisting a draft or producing approval effects. Rejection rolls back the same
unit of work. Existing synchronous providers need no new implementation.

`SalesTransaction.getCurrentSalesReferenceFacts(document)` is an optional native
capability for backwards-compatible explicit providers. The new
`createNativeTransactionSalesBusinessRules()` requires it and fails closed if it is
absent. No form proposal, request price, snapshot catalogue, global mutable cache,
AsyncLocalStorage or independent pool/transaction supplies authoritative facts.
Inventory delta/sign policy remains the existing candidate-source rule.

`PostgresSalesUnitOfWork(pool, { catalogueCompleteness })` captures an explicit
`NativeCatalogueCompletenessVerifier.assertComplete` when native catalogue facts
are intended. Old `PostgresSalesUnitOfWork(pool)` remains usable with the existing
explicit non-native rules and eight-migration fixtures, but cannot supply native
pricing facts. There is no default or ready=true toggle.

The verifier receives only exact target product IDs and a query function on the
original, still-active command transaction. It must read real persistent validated
product-creation/import publication evidence for those targets. Schema version,
column presence or NULL values are not completeness proof. The actual publisher is
not implemented here; the offline preflight report explicitly does not claim to be
that publisher. A complete verified v0.3 price column plus a genuine blank cell is
UNSET under the already-accepted template contract; zero is VALUE. Missing columns,
formula/read failures or omitted facts remain UNKNOWN, not a reason to re-confirm
every genuine blank. All nine keys must be known before publication.

## Native batch loading and lifetime

The PostgreSQL capability requires the original receipt actor/key and single sales
target to have been bound. It reuses the existing current account/staff/hall lookup
and its transaction-held SHARE locks. It then reads through the same original
client and requires migration version 9 before touching its price/barcode columns.
Native action and proposed-scope authorization remain separate, mandatory host
providers; reference/economic facts are not themselves a permission grant.

The native fact loader captures caller-owned document input before the first await.
It has a technical bound of 2,000 current actual lines, matching bounded current
detail reads; transport already has its independent byte bound. Distinct target IDs
are sorted and queried in at-most-200-ID batches, not one query per line/SKU:

1. Exact hall, warehouse, customer and optional staff rows.
2. Actual selected payment accounts and their native methods. Hall affiliation is
   not a payment ACL. No balance, debt, virtual account or invented fund row.
3. Target SKUs, their distinct products, colors, fits and sizes. Each product is
   selected once even when many SKUs or repeated actual lines use it.
4. Actual product-group/size coordinate pairs using paired unnest arrays, not a
   group-by-size cross product. Existing rows receive SHARE locks; missing native
   facts fail rather than become a synthetic group/member.
5. The explicit real completeness verifier on that same transaction. All nine
   nullable nonnegative prices are decoded exactly; undefined/missing fields fail.
6. Only actual raw barcode observations from the document, by exact target raw
   strings. It does not load every alias/MAIN code or replace an observation with a
   current main barcode. Original leading zeroes remain intact.

Account/staff/hall and reference/SKU/product facts are locked on the command client.
Their lock ordering and READ COMMITTED behavior are requested by this source, not
claimed as PostgreSQL-engine proof. A real 1–9 suite still needs to validate waits,
concurrent maintenance, ordering/deadlocks, snapshot visibility, constraints and
rollback. No catalogue mutation, balance, audit or receipt is emitted by fact reads.
The query capability checks transaction active state and cannot work after close.

## Validation and preserved facts

The native rules reuse the existing candidate economic implementation, including
pricing intent, explicit zero confirmation, half-up discount price, product minimum,
whole-order allocation, signed independent return/exchange economics and exact
settlement behavior. Product price authority is not a SKU override. A confirmed
unset minimum may be NULL only after completeness succeeds; missing is never zero
or a no-minimum policy.

Sales hall/customer/warehouse must be enabled and warehouse must belong to the
proposed sales hall. Optional staff requires exact native employment status 在职;
there is no invented salesperson-role or staff-hall restriction. Native staff still
has no separate enabled flag, so this is not a claim to reproduce an absent legacy
flag. Account and method must both be enabled.

A retained line's real loaded native ID, SKU and unchanged snapshot may preserve
old labels/raw observations across master renames or later barcode disablement.
New/replaced snapshot labels must match current selected SKU facts. A new non-null
barcode observation needs an exact enabled binding to that SKU; a manually selected
line may carry no barcode observation. No client-created line ID or label can grant
itself retained provenance. Current formal SKU/product/color/fit/group membership
and trusted minimum facts remain required for active save/approval.

Original actor/key hashing and receipt recovery, source plus proposed authorization,
expected-version checks, document/line ownership, version CAS, atomic audit/receipt,
stock posting, retained rows and rollback remain in their original service/adapter
paths. This slice does not enable historical posting, invent document numbers,
create credentials, execute migrations or register write plugins in the read API.

## Verification

The focused command is recorded in evidence/sales-native-facts-manifest.json.
177 tests pass across the new 13 unit/scripted-pg groups, existing sales lifecycle,
economics, action authorization, PostgreSQL protocol and Fastify inject boundaries.
New coverage includes both awaited rules, failure before effects, same-key retry,
original-client proof, missing verifier/version9, incomplete prices, bounded 201-SKU
set batches, product read-once, preserved snapshots, exact old-code observations,
commit/rollback and closed query capabilities. No genuine PostgreSQL engine or
publisher, browser, live host, operations, compiler/build or production mutation ran
from this worker. Root's aggregate typecheck is recorded separately.

Scope/revert: only the new native-facts modules/test/document/evidence and the small
tracked edits to application ports, sales service and PostgreSQL sales UoW belong
to this slice. Revert those hunks/new files only, preserving concurrent workers.
