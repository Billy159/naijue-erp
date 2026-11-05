# Finite reference policy — source only, no PostgreSQL host

These four new files do not change the immutable parent four-leaf v2 checkpoint,
legacy18 host, application, root scripts or historical SQL. No target/port/data
directory/system identifier is assigned. Shared logical role/database names use
the original source-plan hex constraints; they create no actual roles.

## Independent inputs / scope

Use the original branded M06 `loadPlan()` source40/718, its source56 tables /584
positive columns, the immutable73125 original material+a709 selection addendum,
and 5dbecde8 source-declared trigger/EXECUTE closure. Cross-check the independently
source-declared finite universe b8fc5133 (all4140 cells +137 function EXECUTE cells:
4277 total,442 effective allows/3835 denies). These are source inputs, not
b001/e003/f003 actual-catalog expectations or approval files.

The runtime matrix closes **4140** cells:584×4 positive-column rights,56×6×4
system-column rights,56×8 table rights (including PG17 MAINTAIN),4×3 sequence
rights. Exactly335 are allowed by the selected design; every other cell is
denied. Source VIEW set is empty (0024 effective objects are TABLES); unexpected
views/relations are rejected, not learned from actual. Sequence rights are object
rights, not invented data-column GRANTs.

Full137 signature/body/attribute function policy keeps original PUBLIC107/private30
and3 SECURITY DEFINER routines. No extra EXECUTE, blanket PUBLIC revoke, new
default ACL, or source body change is emitted. NOLOGIN sentinel/preparation still
have inherited PUBLIC EXECUTE privilege on107 functions, but no ERP-schema USAGE
or database CONNECT: do not call this zero EXECUTE. Object owner/admin implicit
authority is disclosed, never used as the ordinary measured runtime.

Runtime is direct LOGIN/nonowner/NOINHERIT/non-superuser with no memberships,
CONNECT without CREATE/TEMP, ERP USAGE without CREATE. Preserve the fresh PG17
`public` schema default PUBLIC USAGE and `pg_database_owner` ownership, not CREATE
or non-source objects. No grant/revoke of public-schema ACL is rendered. The
future real compiler must verify this exact default and empty `pg_default_acl`,
role flags/ownership and absence of extra parameter delegations; a claim here
does not prove actual catalog state. Built-in pg_catalog/information_schema
permissions are not falsely treated as an empty global PostgreSQL privilege set.

The renderer emits only335 predesigned source cells plus DB CONNECT /ERP USAGE,
intended grantor=sourceOwner. It has no driver, password, BEGIN/COMMIT, role
creation, adaptive REVOKE/GRANT repair or metadata-review writer. A later owned
host must apply the fixed list atomically to a brand-new role after legal cutoff,
validate exact effective positives/negatives, and stop on the first mismatch.

The observation comparator checks strict rows against source, never derives
expected cells from observation. Its mock tests do not prove database execution,
session identity, canonical equality, a genuine issuer, source independence or
unknown-COMMIT runtime behavior.
The separate boundary tuple also closes database/schema privileges and owners,
four nonsuper role-flag records, no actual membership/default/parameter delegation
or runtime role-setting rows, all source-object owners and137 function/body /
definer /PUBLIC /grant-option /unexpected-grantee observations. A matching mock
tuple remains observation-only, never an execution or review-authority token.
It separately requires337 exact direct runtime ACL cells (335 ERP+CONNECT+USAGE),
each source-owner grantor/no grant option, no source PUBLIC data/table/sequence
ACL or sentinel/preparation direct grants. Function ACL grantors remain the source
owner. These tuple projections do not replace or normalize away any field of the
original full PostgreSQL canonical text.

```sh
source ../toolchain/use-exact-node.sh
node --test tests/performance/opt02/current-native-stock/reference-compiler/offline.test.mjs
```

This explicit source/material suite requires the four frozen external JSON
inputs under `development-results-20261031/current-runtime-feasibility-independent-review/`.
It is not default CI registered. Complete finite source-cell design does **not**
mean complete ordinary ERP baseline, actual ACL approval or engine GO.

## Later two physical stages (not implemented here)

Both independent clusters must use a newly authored closed logical source fixture
and original actual STAGE/CHUNK/PUBLISH with verified receipts/balances, **before**
final runtime LOGIN. Do not call the old hardcoded b001 host or borrow its source
authorization/hash. Same logical role/grantor/database/DDL order, distinct fresh
physical directories/ports/birth/system IDs; no field normalization is permitted.

Reference: direct LOGIN original probe + unchanged observation projection;
independent source/matrix review and frozen canonical expected, then owned stop.
Only afterwards acceptance: byte-compare to frozen expected, genuinely reviewed
actual target identity /independent receipt, original issuer and its own pool,
original current-identity helper, Supplier CREATE, Product CREATE/capacity and new
transaction proof/stockAdditions. Runtime role is a disclosed writer even when
the original reader runs RR READ ONLY.

Target metadata review cannot be host self-signing/self-hashing. Plan a bounded
controlled peer handoff before business, with externally supplied trusted review
SHA and real independent receipt. All later raw/issuer pools must retain the v3
synchronous captured-Client.query fence; uncertain COMMIT closes/stops without
SQL/RB/replay. No in-flight cancellation guarantee is claimed.
