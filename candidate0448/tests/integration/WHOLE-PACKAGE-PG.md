# Whole-package PostgreSQL acceptance (NOT RUN)

This entry is self-contained: it imports the repository synthetic package,
compiler, driver, observer, failure cases and nullable-date/501-line variants.
It does not require a private fixture module. None of these tests or generated
installation SQL has been executed on PostgreSQL by this implementation task.

## Offline installation source

Use the repository-pinned Node and dependencies. Generate into a new directory:

```
node scripts/release/unified-install/render-whole-package-local.mjs --output /ABS/new-install-source
```

This writes three psql files and a SHA manifest. It does not connect. The baseline
contains the exact 48-file source graph. Four successors replace historical
physical-OID comparisons with explicit function metadata/ACL checks and exact
same-transaction nonbody preservation. V22 preserves the original function and
all 131 parent body/definition checks in a new-empty carrier. Original files
are never edited. Numeric-fit, nullable staff date and whole-package patches
follow. These renderers need independent review and engine compilation.

**Do not install this yet as an approved production migration.** The complete
transitive routine/trigger/RLS catalogue admission is still a known open review
item. The generated role gate and source hashes do not independently close it.
The production host must not accept this output as catalogue clearance.

## Explicit local synthetic preparation

After review and specific authorization, use fresh disposable databases on a
literal loopback endpoint, named `synthetic_whole_<case>`. No existing data or
schema is accepted. An existing ordinary schema owner must have database CREATE
privilege and must not have SUPERUSER, CREATEROLE, REPLICATION or BYPASSRLS.
A separate existing ordinary controller must not own ERP objects or have the
ability to set `session_replication_role`, directly or via another role.

1. An explicitly authorized role administrator executes
   `psql ... -v ON_ERROR_STOP=1 -f 00-protected-roles.sql` once. This creates only
   the three specified NOLOGIN capability roles when absent; no login or password.
   On PostgreSQL 17, ordinary CREATEROLE automatically receives ADMIN membership
   in newly created roles. This installer deliberately rejects that membership.
   Initial creation therefore requires an authorized superuser role administrator,
   or all three roles pre-created with the exact safe attributes and no memberships;
   ordinary CREATEROLE alone is not a supported first-install path. The schema owner,
   import controller and runtime login remain non-superusers.
2. The ordinary schema owner executes `01-schema-and-whole.sql` on each fresh
   database. Stop on the first error; do not resume/reuse a partially installed
   target. The script uses real SQL and contains no private-file dependencies.
3. An authorized role administrator executes `02-controller-membership.psql`
   with `-v controller=EXISTING_ORDINARY_CONTROLLER` and
   `-v runtime_login=EXISTING_SEPARATE_RUNTIME_LOGIN`. This explicitly grants
   the controller two import SET capabilities and the application login only the
   runtime SET capability, all with INHERIT FALSE. Existing effective ERP table,
   column or sequence privileges on either login (including PUBLIC privileges)
   are rejected, rather than silently revoked. The recorded runtime login is
   rechecked by the runtime catalog gate. It is a permission change, not
   something the test runner performs implicitly.
4. Provide a separate observer account explicitly capable of reading all ERP
   tables/sequences and `pg_control_system()`. The runner does not silently use
   an owner/admin, grant access, discover credentials or bypass RLS.

Database/account provisioning is operator-owned; no database is created or
removed by the runner. No password belongs in a command line or committed file.
The name/loopback checks prevent common mistakes but are not authorization.

## Configuration and command

Create a private local JSON configuration (mode 0600) with `confirmedSynthetic`
true and `cases`. Each mode below needs its own fresh installed database. Each
case has exactly these relevant connection fields:

```
{"confirmedSynthetic":true,"cases":{
  "success-and-exact-replay":{
    "host":"127.0.0.1","port":55432,"database":"synthetic_whole_success",
    "writer":{"user":"your_controller","password":"local-only-secret"},
    "observer":{"user":"your_observer","password":"local-only-secret"}
  }
}}
```

Include every name from `WHOLE_PG_MODES` exported by
`tests/integration/whole-package-pg-setup.mjs`; missing or duplicate targets fail
before connection. Currently fourteen modes cover success/replay, prepare-only,
middle/publication/constraint/sealed-append failure, under/over declared counts,
501-line document, multiple complete documents in one request, null/exact staff
departure dates, and parameter-change rejection after prepare and after finish.

```
node tests/integration/run-whole-package-pg.mjs --confirmed-synthetic-config /ABS/private-cases.json
```

The config stays local and is not logged. Only actual `pg.Client` connections
are used. Each target is checked empty and every case uses a separate observer.
Setup failures have a redacted error, never a fallback. The system identifier,
database OID and a source binding are read from the actual target; that source
binding is explicitly not a full catalogue security admission.

Before publication another connection must see no prefix. Failures must roll
back all table/audit/receipt/counter effects. Successful cases intentionally
commit synthetic data and verify exact replay. Afterwards the operator disposes
of the databases under their normal authorized process; the runner never drops
anything. These small-case tests are not the 427458-row performance acceptance.

## Result reconciliation

The success cases now call
`naijue_erp.standard_whole_package_verify_v2(init_request, encoded_scrypt)`
in a fresh READ COMMITTED transaction under the INITIALIZER role after the
actual COMMIT. The controller must also hold IMPORTER SET capability. The exact
original initialization request and original private scrypt value are parameters,
not SQL text or logs. This is not the old zero-incompatible standard verifier.

It verifies source-record proof, native rows, document audit/version chains and
ledger/balance binding before returning source_counts, source_totals,
current_totals, document_summary and inventory_summary. No all-document or
all-key result arrays are accumulated or returned. Per-document proof snapshots
still scale with that individual document; PG memory/performance requires the
actual large-document tests. Fresh synthetic imports compare all numeric
totals, including sales quantity/line amount/net due/settlements, transfer
quantity and explicit inventory quantities. A verified later business edit may
legitimately change current totals. Inventory coverage explicitly excludes
unknown combinations and does not claim complete all-SKU/all-warehouse stock;
a post-cutoff key has no invented historical baseline quantity.

The generated final installation includes the separate explicit-zero balance
guard, verifier and a 176-function source-pinned search_path hardening step.
That step places pg_temp last while preserving function bodies, ACL and all
non-configuration fields. Old runtime profiles expecting a 168-function cohort
or the old search_path do not admit this new installed profile.

## Single local installation workflow and installation record

The renderer now includes the document barcode successor before the 176-function
path hardening, followed by its fixed-runtime permission companion. These are
source changes only. Do not run the old 168-function runtime admission against
this profile. Runtime document writer permissions and actual engine behavior
must pass their separate tests.

Render once into a new absolute directory:

```
node scripts/release/unified-install/render-whole-package-local.mjs --output /ABS/new-install
```

Review the generated SQL and manifest, then run the single installer below in
an exclusive DDL/permission-change window. It renders its own fixed bundle,
executes role preparation, fresh schema/whole/permission installation, and
controller/runtime-login membership in that order using psql with ON_ERROR_STOP. Each process
must exit successfully before the next begins. A failed step never reaches
catalogue registration. There is no standalone register-current-catalogue mode.

```
sudo /usr/bin/env -i PATH=/usr/bin:/bin /ABS/TRUSTED_ROOT_NODE /ABS/ROOT_OWNED_INSTALL_TREE/scripts/release/unified-install/record-whole-installation.mjs --install-reviewed-synthetic-config /ABS/root-private-install.json
```

The root-owned mode0600 JSON and all its ancestor directories must also be
root-owned, nonwritable by other users and not symlinks (not /tmp). It has exactly `host`, `port`, `database`, `psql`,
`roleAdmin`, `owner`, `controller`, `runtimeLogin`. The first three account
objects have exactly `user` and `password`. `runtimeLogin` is only the existing
API login name, never its password; all four names must differ. The schema owner and controller must be
ordinary nonprivileged accounts. `psql` is the absolute real executable path,
root-owned and not group/world writable, not a symlink. Only literal loopback
and `synthetic_whole_*` targets are accepted. Passwords are passed only to the
local psql child environment or pg connection, never arguments/output/record.
The installer does not create a database, passwords or login accounts. The role
administrator must be authorized for protected-role creation/membership and the
specific pg_control_system EXECUTE grant. No pg_monitor role is granted.

The installer then reads the actual catalogue through the ordinary controller
in a read-only repeatable-read transaction. It checks fixed routine bodies and
paths, role restrictions, migration lineage, table/trigger/policy counts, enabled
triggers, validated constraints and RLS before requiring acknowledged rollback.
Only this successful invocation can write the initial record. The explicit
command approves the fixed installation source in its controlled window; it is
not a claim of independent automated review. A failed partial install requires
local operator recovery on the isolated target, not automatic retry or dropping.
There is no new signing system or per-package installation step.

The record is created exclusively (never silently replaced) at
`/etc/naijue-erp/whole-installation.json`, or
`/private/etc/naijue-erp/whole-installation.json` on macOS. It holds only physical
target/source/catalogue bindings. The application must run non-root and load it
through `loadWholeInstallationRecord(sourceSpec)`; no API/caller-supplied record
or path is accepted. The directory and file must remain root-owned and not
group/world writable. Symlinks and multiply-linked records are rejected. A
changed installation needs a separately authorized configuration replacement,
not an automatic baseline refresh. Protect application source and this record
from the runtime account. This trust boundary does not defend against a
compromised root/operator who can replace application code itself.

This catalogue record is only a same-instance drift reference after trusted
installation. It does not itself freeze concurrent DDL. Keep privileged writers
and DDL/permission changes excluded for the entire import; do not infer that
from a caller flag. Source tests use synthetic clients only. No installation,
record creation, real PostgreSQL tests or large-package performance run has been
executed during this implementation.

The final installed profile contains 177 routines: the fixed 176-function
hardening cohort plus the separate reference-lock-only trigger function, which
retains its narrower pg_catalog-only search_path. The six reference tables get
only UPDATE(id) for locking, paired with a runtime trigger rejecting actual id
updates. That permission migration rejects preexisting UPDATE(id) and is not
an idempotent reinstallation script. Final catalogue capture occurs after all
these permission changes, never before them.

The current same-instance fingerprint deliberately includes all database
dependencies and cluster roles. During installation/import, exclude other
sessions creating or dropping temporary objects, unrelated schema DDL and
cluster-role changes as well. Such changes cause conservative rejection; this
profile does not claim transparent use on a busy shared database. Installer
psql steps have a 120-second process deadline and bounded SQL/lock timeouts; a
timeout produces no installation record and requires inspection of the partial
synthetic installation, never automatic retry.

### Trusted installation code, not sudo from a writable workspace

Do **not** run the privileged installer directly from a developer workspace.
The authorized local operator must first review the source/dependencies and use
trusted system copy/ownership tools to stage a dedicated installation tree whose
entire ancestry and contents are root-owned, not group/world writable and contain
no symlinks. Protect the Node executable and its ancestors in the same way.
The application runtime account must not be able to modify that tree. The
installer checks these conditions again, but JavaScript cannot retroactively
prove the trust of code imported before its own checks: the trusted external
operator/setup step is required before Node starts. This is one-time installation
preparation, not a new per-package review or key infrastructure.

The only accepted psql executable is the PostgreSQL17 vendor installation path:
`/usr/lib/postgresql/17/bin/psql` on Linux or
`/Library/PostgreSQL/17/bin/psql` on macOS. Its file and every ancestor must meet
the same root/nonwritable/no-symlink requirement. `/usr/bin/true`, arbitrary
executable paths, shell wrappers and unprotected Homebrew directories are not
accepted. The actual source stages additionally end with a fresh server SQL
sentinel binding the expected database and account; exit0 or early `\\quit`
alone cannot report installation success. This entry therefore requires a
trusted local PostgreSQL17 client installation rather than silently selecting
whatever appears first on PATH.

The protected record is fully written and fsynced in a private sibling temporary
file, then published using a no-overwrite hard link and directory fsync. Failed
pre-publication writes remove only that invocation's temporary file. A failure
after publication is an uncertain durability outcome, not permission to rerun
installation or delete/recreate the record. Inspect the complete existing record
and target using the local operator's recovery procedure.

The current synthetic installer uses a locally trusted loopback PostgreSQL
service. Password authentication occurs **before** the catalogue/physical-ID
query. That query is not pre-authentication server identity verification. Use
only the isolated service created/controlled by the local operator; do not send
real credentials or treat an arbitrary process bound to that port as trusted.
Remote or untrusted endpoints require a separately configured authenticated TLS
or appropriate peer-authentication connection and are not accepted by this
synthetic installer. The `source_spec_sha256` binds the fixed routine cohort, catalogue query,
48 baseline sources, explicit successors/permission companions, installation
renderers/loader and package lockfiles. Source hashes are checked again after
stage execution and must match the pre-execution snapshot. This is still not an
independent signature or authorization: the trusted operator protects/reviews
that tree before starting, and only the actual successful fixed installation
can create the initial record. No caller-provided hash can substitute for it.

## Explicit trusted-local new-empty installation (not synthetic naming only)

The default `--install-reviewed-synthetic-config` mode keeps the synthetic name
restriction. To prepare a real **new-empty** local ERP target selected and
verified by the authorized local operator, use the same protected tree/clean
environment with the explicit mode:

```
sudo /usr/bin/env -i PATH=/usr/bin:/bin /ABS/TRUSTED_ROOT_NODE /ABS/ROOT_OWNED_INSTALL_TREE/scripts/release/unified-install/record-whole-installation.mjs --install-reviewed-local-config /ABS/root-private-local-install.json
```

Its config has the same fields plus `expectedSystemIdentifier` and
`expectedDatabaseOid`, both decimal strings established independently through
the trusted local PostgreSQL service before installation. The database name
must be explicit, lower-case letters/digits/underscores (not postgres/template
DBs); it need not start with synthetic_whole_. The installer does not invent or
silently adopt these expected identities. It first performs a read-only target
query as the configured role administrator, verifies the expected physical IDs,
exact database/account/ordinary database owner and absence of naijue_erp, then
runs the fixed stages. The schema SQL also binds exact database name and OID.
After installation the controller catalogue identity must still equal that
initial target before a record is written. Source files must likewise remain
unchanged throughout execution.

The loopback/locally trusted service, PostgreSQL17, safe accounts, protected
source tree, permission guards and exclusive installation window remain
mandatory in this mode. Physical-ID comparison happens after authentication;
use a service whose endpoint is already trusted, not an arbitrary local listener.
Remote/untrusted endpoints and TLS configuration are not silently inferred.
The cloud implementation has collected/transmitted no real credentials or data;
local credentials are entered only into the operator's protected local config.

This is **not an in-place upgrade** of an existing ERP schema, does not overwrite
or drop existing tables, and does not migrate/retire legacy/history tables.
Those remain a later explicit migration task. After successful local engine
acceptance and installation, the local operator can use the standard-package
streaming importer with the real package. Cloud tests remain synthetic; this
mode and real package/large-scale performance have not been executed here.

The final membership stage also grants only the fixed runtime role to the
explicit existing runtimeLogin with SET TRUE / INHERIT FALSE. It rejects
superuser/DDL/parameter privileges, other inherited role memberships and
unexpected existing recipients. It does not create a login, set a password, or
grant the application the initializer/importer capabilities. Configure the local
API connection to use this existing application login and the WHOLE_V2 runtime
profile. Keep import-controller credentials separate from the application.

## Whole-only entrypoint policy

The opt-in whole installation revokes direct EXECUTE on the eight distinct legacy initialization/import/status/inspect/verify functions from PUBLIC and the three protected roles. The original V1 installation file and wire contract are unchanged. The owner-executed whole prepare/step/finish/inspect/verify functions remain the entrypoints; their internal owner calls are not revoked. The installed catalog gate rejects any effective old-entry privilege on the controller, application login or protected roles. No second per-chunk import path remains active for those roles in this profile. These ACL and internal-call expectations are source-tested; real PostgreSQL denial/owner-call tests still require local execution.
