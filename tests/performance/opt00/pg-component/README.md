# OPT01 finite real-PG read component (new independent target only)

Status: **CONTRACT / OFFLINE IMPLEMENTATION — NO ENGINE EXECUTION YET**.
This directory does not change the frozen source-schema carrier or production code.

## Two deliberately separate layers

1. First target: source-permitted **pre-cutoff synthetic reference setup** with all
   original triggers enabled, then original `PostgresCurrentFormReader` and
   `PostgresDictionaryReadReader` through a restricted direct PostgreSQL LOGIN.
   This is NOT ProductMaintenance CREATE, source publication, authentication/session,
   capacity, stock, ordinary-write ACL, normal-list/HISTORY or V8 acceptance.
2. A subsequent NEW target may add original Transfer preparation/SAVE DRAFT and
   its real allocation/audit/receipt. Not implemented here. Sales remains pending
   real catalogue completeness; no substitute `assertComplete`. Product CREATE
   similarly requires real pending-capacity admission; no fake callback.

## Exact finite synthetic setup

`contract.mjs` is the literal source of fixture, INSERT columns and reader SELECT
columns. Expected values are frozen before any database work, not copied from actual
catalogue/data. Exactly: hall1, staff1 (ADMIN, hallNULL, 在职), account1 (enabled,
real original scrypt encoding of a RAM-only random unused password), category1,
color1, fit1, sizes23, groups22, members44, products2 (one disabled), SKU2.
The target is group22 (`ZTARGET`), deliberately outside the first 20-group page;
all23 members must return, while only first/last members have actual SKUs.
Nine source prices are explicit (`purchase=0.75`, `retail=1.25`, seven NULL),
validated by original `validateCompleteCataloguePrices`; NULL is never zero.

Setup is performed as the **NOLOGIN source owner**, `SET LOCAL ROLE` from the
owned admin in ONE transaction, and consists ONLY of the exact parameterized
INSERTs named in `SETUP_COLUMNS`, in FK order. This owner has ownership rights;
it is NOT advertised as a least-privilege ordinary runtime writer. There are no
UPDATE/DELETE, import/source/batch/publication inserts, generated fake receipts,
trigger disabling, replication-role changes or fabricated creation operations.
All audit/receipt/inventory/import/source/sales/transfer tables remain empty.
No account credentials/hash or pg_authid are selected into evidence.

Source authority for this **pre-cutoff lane only**:
- migrations/0021_native_maintenance_receipts.sql:389–392
  `guard_maintenance_before_root` allows a missing audit only without a published
  IMPORTED CUTOFF_STOCK_BASELINE.
- patches/0026-category-reorder-undo.sql:404–408 final root validator preserves
  missing-audit bootstrap lane under the same no-cutoff predicate.
- migrations/0026_exact_historical_customer_supplement.sql:850–853 final child
  guard preserves the same lane (no DELETE used here).
- patches/0026-v11-document-specification-save.sql:46–54 only permits NULL SKU
  creation operation before cutoff; identity/coordinate/FK constraints stay live.
These branches are verified byte-pinned by the original source plan; the new seed
adds explicit zero-import checks before and after setup. No claim that this lane
would work after cutoff publication.

## Read authority / effective ACL (finite, not complete ordinary ACL)

Direct role `dot_opt01_read_<new13hex>`: LOGIN, NOINHERIT, NOSUPERUSER,
NOCREATEDB/NOCREATEROLE/NOREPLICATION/NOBYPASSRLS; connection limit2; no membership;
CONNECT only the exact new database, schema USAGE and **only listed column SELECT**.
No table-level SELECT, column/system writes, lock-only UPDATE, sequences, schema
CREATE, database TEMP or role ownership. Password stays RAM-only; exact DB/role/
127.0.0.1 SCRAM HBA, TCP-only, reject all other clients.
`READ_COLUMNS` lists every finite positive-attnum SELECT grant. Metadata verifies
both granted cells and ABSENCE of every other effective positive-attnum right,
table mutation/sequence rights/memberships. Original PUBLIC function EXECUTE is
retained and inventoried honestly, including the approved migration13 SECURITY
DEFINER helper. No blanket PUBLIC revokes on source routines; compare all137
routine source bodies/attributes to source before admitting reader.

CurrentForm uses original source-confirmed current-form authorization; its own
RR READ ONLY snapshot checks current enabled account/in-employment native staff.
Dictionary service uses original
`createSourceConfirmedApplicationReadAuthorization(restrictedPool).dictionary`,
which rechecks actual current account/staff/hall on the restricted role. No custom
allow provider, runtime capability, fake normalLists or HTTP/session claim.

## Measurements / negatives

Original public reads, not rewritten production SQL: product search (enabled1,
disabled absent, category+exact price+targetGroup), SKU page/batch (2 actual IDs,
missing tuple remains missing), dictionary groups pages1+2 (total22, target absent
page1/present page2), complete target members23 in original order, unknown actor
FORBIDDEN. Read session must be actual session_user=current_user=reader LOGIN.
Separately test SQLSTATE42501 for password_hash SELECT, product UPDATE/INSERT,
FOR SHARE, sequence nextval, CREATE TABLE and SET ROLE owner, rolling back each
negative. No real performance/EXPLAIN claim in this first component.

## One-shot lifecycle / target

Proposed first target `c20261031f002`, TCP127.0.0.1:55444, new cluster/data path
`development-results-20261031/pg-opt01-component-c20261031f002/data`; database
`naijue_erp_test_c20261031f002`. No start until peer code review + controller GO.
Reuse frozen Phase2 lifecycle/pipe/source-plan/v22/observer APIs unchanged. A thin
new host owns foreground postgres ChildProcess, verified signed PG17.11 binaries,
physical dev/inode/uid0700 birth receipt, absolute20-minute budget, explicit clients,
RAM-only SCRAM, source/file pins and exclusive clients. Original four-role source
DDL/empty-object observer runs unchanged, then the one additional reader role is
introduced with a NEW finite component identity guard (not weakened old guard).
First unexpected failure quarantines this target: no replay, grant chase, repair,
restart or reuse. Close all owned clients, stop only the captured owned child,
await real close, prove PID/process absent, ECONNREFUSED and shut-down control.
PASS is written only after cleanup. Data/logs retained; never package PGdata,
passwords, hashes/pg_authid, dependencies or binary installations.

### Preserved first attempt (never reuse)

`c20261031f001`/55443 completed source DDL and acknowledged all99 reference
INSERTs, but stopped BEFORE reader LOGIN because this test initially assumed only
one SECURITY DEFINER. Source independently defines three (migration26 two private
historical-customer routines plus migration13 PUBLIC helper). The successor guard
compares all137 routine identities/SECURITY DEFINER flags to the original branded
source plan; it does not copy actual catalogue into expected values or add grants.
First failure and clean stop retained; next attempt is only freshf002/55444.
Staged/imported PRODUCT source exclusion is NOT covered: no source batch is forged.
