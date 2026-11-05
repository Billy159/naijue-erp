# Standard import whole-package SQL v2

Status: source implementation, not installed, not PostgreSQL parsed/compiled or
engine-tested, and not enabled in the CLI. Eighteen source checks are not database
acceptance. The fourteen real-client PostgreSQL cases have not been executed.

## Concrete interface

The sole external transaction owner begins READ COMMITTED on one exclusive
physical client. It must already be authorized to SET the protected INITIALIZER
and IMPORTER roles. This code does not create login roles, grant memberships,
create an authentication session, or turn a supplied actor ID into authority.

1. INITIALIZER: `standard_whole_package_inspect_v2(init_request, encoded_scrypt)`.
   It acquires the existing cutoff lock and the exact actor/request-key lock.
   Returns ABSENT, or COMMITTED with packageSha256, planSha256 and summary only
   for the original exact INIT request and initialization fingerprint and a
   completed, continuous, published two-batch package. A root in this current
   transaction is not reported as committed. A conflicting key is rejected.
2. INITIALIZER: `standard_whole_package_prepare_v2(init_request, encoded_scrypt)`.
   Uses retained SQL49 NEW_EMPTY initialization, storing a server-created audit
   marker with original INIT operation, full xid, backend, controller and ordinal0.
3. IMPORTER: `standard_whole_package_step_v2(init_operation, ordinal, phase, request)`.
   Ordinals start at1. Requests are the full original StandardImportRequest, not
   a loose array of rows. MASTER, KEYS, DOCUMENTS and PUBLISH retain original
   SQL49 validation and mutations. KEYS includes baseline ledger effects.
   Order is MASTER chunks, KEYS chunks, baseline PUBLISH, DOCUMENTS STAGE,
   DOCUMENTS CHUNKs, final document PUBLISH. Root is INIT operation, not the
   unrelated logical operation ID of the earlier offline root compiler.
4. IMPORTER: `standard_whole_package_finish_v2(init_operation)` checks complete
   receipt/checkpoint chains and forces retained deferred constraints. It returns
   PENDING_TRANSACTION and summary. Only the caller's acknowledged COMMIT means
   success. Ordinary errors roll back the whole transaction; unknown COMMIT requires
   a fresh same-key inspection, never a replacement key or blind replay.

The secret is a private SQL parameter to inspect and prepare, never part of
public audit JSON or SQL text. Retry must retain the same encoded scrypt value;
re-salting the same password changes the original initialization fingerprint.

## Existing constraints and identity

Old standard_import_command and old API wrappers are unchanged and still reject
multiple mutations per xid. The new private command function copies the SQL49
DML/record/number/publication logic and replaces only transaction-scoped authority,
ordered membership, and per-chunk constraint forcing. It is not a loop over the
old API. Original child operation IDs, request keys, source identity and hashes
are retained. Native data is not cleaned or inferred at this layer.

The mandatory root receipt/batch deferred assertion checks the complete package
chain. Each child receipt/batch assertion validates its own original checkpoint
and typed rows/effects; it does not repeatedly scan the full package chain.
Source-row deferred checks retain exact record proof and root authority, with
full child checks provided by those mandatory receipt/batch triggers. Installation
checks their exact function bodies, mounts and predicates before granting access.
Old unmarked operations take the original path.

Eight publication/party successors retain the reviewed legacy dispatch and its
STRICT selection. Only for a current new root do they select the unique exact
native identity or batch/version child audit. They do not take an arbitrary
first audit, trust a caller boolean, disable triggers or bypass constraints.

## Staff nullable date

Only this new prepare accepts optional payload.schema_declarations_sha256.
Known declaration profiles are original V1, numeric-fit and staff-departure.
The staff-departure profile is explicitly pinned to
9e035b8da32e92d40a55696dfaf256f0a1865350656a011ae7a4abda0548ce5a.
Its staff rows must contain departure_date, with a real YYYY-MM-DD date or null,
and the database must have the nullable date column. Under the older profile,
only that new nullable column may be absent; original row fields/hashes are not
rewritten and no departure date is invented. All other columns remain exact.
This does not make the old per-chunk V1 SQL entry compatible with the new column.
The explicit compileStandardWholePackageProfile entry now binds the declaration
profile and document chunk policy into a new plan digest before deriving operation
IDs/request keys. It preserves old V1/V2 default programs and never appends a field
to already-compiled requests. Null and exact source dates are retained; missing
staff role/date and invalid calendar dates remain errors.

## Validation still required before use

- Independent SQL semantic review and actual PostgreSQL function compilation.
- A reviewed installation must preserve existing owner/ACL/trigger metadata,
  verify catalog/role/RLS prerequisites and explicitly assign only the appropriate
  wrapper EXECUTE access. All five whole-package source patches are transactional; new routines
  revoke default PUBLIC access. No memberships are provided.
- Fresh target with required predecessor SQL49/alias bodies and reviewed guard
  bodies. The patches reject other predecessor bodies. Existing runtime catalog
  fingerprints/routine counts are not silently accepted after installation.
- Run `registerWholePackageSqlAtomicity` from
  tests/integration/whole-package-sql-atomicity.mjs using two actual pg clients
  and a synthetic program. Provide a real all-normal-tables/audit/counter snapshot
  and real constraint-failure input. The runner has no connections, credentials,
  installer, owner fallback or auto-run. It tests success and exact replay,
  conflicting plan, prepare-only failure, middle failure, publication failure,
  constraint failure, sealed-document append rejection and observer invisibility before commit.
  Two additional cases retain all legitimate rows but adjust the declared document
  count in both INIT and STAGE: one requires final publication to reject the
  insufficient total; the other requires the excess count to fail closed. These
  are cardinality tests, not proof of arbitrary missing-source-row detection.
- Exercise numeric/date/Unicode/source identities, 10k rows, foreign actor/role,
  reordered/duplicate children, changed initialization secret, savepoints/subxids
  and connection failures on the target engine. Subtransaction compatibility is
  not claimed: retained xmin checks compare the top transaction.
- The new whole-package path splits one document across bounded requests of up to
  500 rows. Intermediate chunks carry documents=[]; only its last chunk creates
  the migration snapshot/receipt. Later append to a sealed document is explicitly
  rejected. The old per-chunk API keeps its old aggregate bound. A 501-line fixture
  compiles without dropping lines; its PostgreSQL behavior remains untested.

No real source attachments, credentials, live SQL or database changes were used.

Evidence: initial missing-kernel source RED was followed by implemented source
checks. A later explicit canonical table-token test also failed on inherited
locale-sensitive lower(kind); the new kernel pins COLLATE "C" and now passes.
The corresponding guard precheck already passed and changed no guard bytes.

## Current concrete integration and limits

Install source order after the required predecessor baseline: nullable staff date
migration when selected; whole_package_v2; whole_package_guards_v2;
whole_package_intent_v2; whole_package_source_commit_v2; finally
whole_package_access_v2. The last file pins the source cohort, checks owner/role/
ACL metadata and mandatory deferred trigger definitions, then grants only
INITIALIZER inspect/prepare and IMPORTER step/finish. It grants no membership,
login, table access, or helper EXECUTE. None of these statements was executed here.

The row-intent successor uses the existing (import_batch_id,target_type,target_id)
source index predicates for ID-bearing new-profile rows and checks their single
prepared audit, retaining the exact legacy/composite fallback. This is a query
shape improvement, not a PostgreSQL EXPLAIN or performance result. The source
successor removes per-source-row repeated whole-chunk/whole-package scans, not the
mandatory final validation itself. Native DML is still a retained SQL-side loop;
there is one network call per bounded chunk and one transaction, not per-row
network round trips or commits. Large migrated documents still require a full
final document audit snapshot in PostgreSQL. Actual 427458-row timings/memory and
400–700MB-or-larger file handling must be measured on an isolated/local target.

The new in-memory profile compiler is a fixture/small-input API, with an owned
snapshot resource budget of256MiB. It is NOT the large-package streaming CLI.
The independently authored bounded reader/request generator must be connected
before claiming the formal entry handles the requested full dataset; 400–700MB
is an estimate, not a new package limit.

Verification recorded here:147/147 combined profile, original package/execution
and V2 compiler tests passed, including10k masters,501-line single document and
old request compatibility. Full tsc at the latest run reported an unrelated
in-progress tests/native-sales-preparation.test.ts:272 unbranded Quantity; do not
report that whole-project run as green. No SQL parser or PostgreSQL execution.

For new-marker VALIDATING prefixes only, the seven publication guards retain
scope/type/monotonic validation but defer full-history source cardinality scans
until final IMPORTED publication. Old unmarked calls retain their existing
checks. This timing change requires independent review and engine validation.

One DOCUMENTS CHUNK already accepts multiple complete document descriptors within
the total 500-row request budget and independently seals each document. The
streaming producer should pack small documents together, not issue one SQL call
per document; a large document still uses intermediate unsealed chunks. There is
no PostgreSQL throughput measurement for either path.

## Review findings and current safety status

The first independent review found a privileged-controller replication-role
bypass and insufficient transitive catalogue admission. The new wrappers now
reject origin changes and the capability to regain parameter-setting privileges
through any SET-able role. Protected-role effective table/column/sequence access,
ownership and schema CREATE are rejected both before installation and before
wrapper grants. These are source-tested changes, not engine-tested clearance.

Full transitive helper/guard/trigger/RLS catalogue admission remains unresolved;
the access patch alone is not a safe production-host admission. Do not install or
enable the protocol based only on its current source checks. A separate reviewed
new-empty installation and runtime catalogue binding is required.

The repository now contains a real pg.Client setup/caller and offline full SQL
bundle renderer. See tests/integration/WHOLE-PACKAGE-PG.md for exact commands,
explicit local connection configuration, prerequisites and unexecuted cases.
No bespoke private fixture module or historical physical OID file is required.
The renderer retains original body/lineage checks and uses new versioned portable
metadata checks; its PostgreSQL execution and security review are still pending.
