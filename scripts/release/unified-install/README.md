# Unified target source / fresh schema stage (not runtime ready)

Base: `e6a03c9fda216a45fb4f904568a28f797c9e94dd`, tree
`e62e85e4a5f7ae7e30b382543941b7635c4abcb8`. These are new additive tools;
no historical target guard, source SQL, issuer, host, policy or release contract
is rewritten. No legacy data/account mapping is an installation prerequisite.

## Immediately usable, no database

Use exact Node24.21.0 and unset NODE_PATH/NODE_OPTIONS/NODE_PG_FORCE_NATIVE:

```sh
node scripts/release/unified-install/cli.mjs \
  --source-root /ABS/independently-retained-C12-source \
  --scope SCHEMA_ONLY --source-bundle /ABS/fresh-target-definition-output
```

The source root is **code provenance**, not a restored/user database. The real
paired loader checks its immutable200 inputs and private brands. All selected40
SQL files must also match this unified tree. Output includes26 rewrite migration
IDs,14 explicitly ordered successor patches,137 final routine body pins,56 tables,
584 declared user columns, raw SQL and finite dynamic-DDL manifest. The existing
40-file source installation already ran in e007; this tool does not erase that fact.

Source declarations are not a fabricated live catalog: the old source scanner's
column strings record CREATE/ADD/RENAME and do not apply every later ALTER COLUMN
or constraint expression. Full raw mutation ledger remains present. Final PG
normalized types/null/defaults/constraints/indexes/triggers must come from an actual
schema observation. Source-only bundle explicitly labels this gap.

An actual same-source reference already exists from the stopped e007:
`pg-current-runtime-acceptance-c20261101e007/canonical-observation.json` and
`empty-source-schema-observation.json`, raw catalog digest
`721424d5136f331332e9eabd47597bef45664a45eece831bd2c4990029d4feb5`.
It can be compared after separately verifying its40 source pins against this
bundle. Its test role names/component339 ACL and physical identity/OIDs are not
a formal deployment ACL, a new target approval, or facts to copy into another DB.

V6/V7/V8 preparation renderers are predecessor-specific alternatives, **not** steps
to replay after all40 files. V7 pair DDL is already in the final40-source chain.
Original renderers remain reusable only with their genuine independently approved
V5/V6/V7 target/catalog predecessors and external before/after pins.

## Callable schema execution API (not invoked by dry-run CLI)

Actual execution is controller-only and requires a newly provisioned empty private
PG17.11 target, database and four setup roles. This tool does not start/stop PG,
create a database, restore data, manufacture credentials or approve its own inputs.

1. `loadUnifiedInstallPlan({sourceRoot,baseCommit,baseTree,requestedScope:'SCHEMA_ONLY'})`.
2. `captureFreshTarget({intent,birth,startsAt,expiresAt})`: intent is closed
   `{database,admin,owner,sentinel,prepare,runtime,host,port}` with safe **generic**
   names, distinct roles, loopback TCP; birth is
   `{systemIdentifier,databaseOid,postmasterStart,serverVersionNum:'170011'}`.
   The original20-minute window is not extended. A new cluster can legitimately
   reuse a DB OID/experiment port; the complete identity is checked. Known stopped
   cluster IDs are not replayed. Unix/shared/production targets are unsupported.
3. `compileUnifiedSchemaProgram({plan,target})` creates a private branded program.
   It preserves714 original statement spans plus the exact original V22 function
   member, all131 parent body/definition pins, transient two NOLOGIN sentinel cells,
   their revocation, zero-right checks and new exact fresh-target guards.
4. From a **complete committed export**, call
   `verifyUnifiedExecutionSource(reviewedSuccessorCommit)`. The original release
   verifier recomputes Git commit/tree/blob/modes; a WIP checkout or e007 base label
   cannot pass as the reviewed successor. Dependencies remain separately controller
   verified against the committed lock/toolchain; source verification is not npm
   provenance. Relevant execution-source bytes are rechecked during installation.
5. Controller supplies independent approval bytes plus out-of-band trustedSHA to
   `readSchemaExecutionApproval({bytes,trustedSha256,plan,target})`. Exact version
   is `UNIFIED_NEW_EMPTY_SCHEMA_EXECUTION_V1`; decision
   `AUTHORIZE_EXACT_FRESH_SCHEMA_SOURCE_ONLY`; scope
   `FRESH_ISOLATED_SCHEMA_ONLY_NOT_RUNTIME`; plan/targetSHA, successor sourceCommit,
   original starts/expires, `productionAuthorized:false`, unknown policy
   `QUARANTINE_CLOSE_READBACK_ORIGINAL_KEYS_NO_REPLAY`, resource policy
   `CLOSE_CAPTURED_CLIENT_PRESERVE_DATABASE_AND_JOURNAL` are required. The library
   never creates this approval; a hash alone does not establish its external origin.
6. Controller owns/connects a genuine same-module pg8.23.1 Client using private
   configuration, then transfers its exclusive lease to
   `captureUnifiedInstallClient({client,plan,target,program,approval,sourceProof})`.
   It rejects copied clients, substituted query methods, mismatched connection
   parameters, pipelining, active/queued commands or a preexisting transaction.
   First wire command is the exact EMPTY guard with finite native query_timeout;
   no timeout SET precedes target verification. Read timeout destroys the captured
   stream and close is bounded. All later sends retain the original synchronous
   physical quarantine fence, original bounded-query helper and fixed program SQL
   allowlist. No arbitrary query/gate callback enters the actual runner.
7. `runUnifiedSchemaInstall({program,adapter,journalDirectory})` requires a new
   absolute journal directory. It fsyncs wx checkpoints, runs the source, checks
   genuine source observer output, captures raw PostgreSQL canonical UTF8 in one
   RR READ ONLY observation, checks parity, and closes only the captured client.

The fresh guard deliberately rejects other databases/roles/schemas/clients and
requires NOLOGIN/noninheriting setup roles, zero sentinel CONNECT, exact owner,
PG17.11/origin/not-recovery/process/systemID/endpoint and no business rows. **It is
not an in-place/shared legacy database installation profile.** Adding naijue_erp
alongside existing schemas needs a separately reviewed contract, not guard removal.

## Failure / checkpoint boundary

There are40 files but **41 source transaction ACK boundaries**:40 ordinary COMMITs
plus the guarded V22 carrier. Each checkpoint has original file ordinal, statement
index and SQLSHA, so two commits in one file cannot mask an uncertain second ACK.
Pre-COMMIT failures use one original rollback; rollback failure aggregates original
cause. Unknown COMMIT quarantines every physical send, including rollback; only
captured close and filesystem diagnostics remain. Ordinary errors/cancellation and
ACK errors are not swallowed/retried. Even journal creation failure closes a captured
client; a post-ACK journal failure cannot replay/rollback the committed transaction.
Database/roles and partial evidence are preserved, never dropped as cleanup.

`inspectInstallRecovery` validates source/target/checkpoint keys and identifies
unresolved commits. It authorizes **no automatic resume**. Use the original keys
for independent read-only catalog/source checkpoint readback, then obtain a new
remaining-only plan/approval; the original from-zero program cannot be replayed.

## Evidence boundaries / next inputs

Success is `SCHEMA_INSTALLED_SOURCE_CHECKED_NOT_RUNTIME_READY`. The admin catalog
includes raw ACL observations but cannot certify an ordinary runtime role. No new
runtime LOGIN, business ACL, ERP employee, data conversion or production readiness
is claimed. COMPONENT339 and FULL_APPLICATION requests are refused before any SQL;
generic target-specific reviewed ACL/negative matrix, final ordinary-role guard,
secret reference, exact target metadata/purpose review and full application admission
remain separate inputs. Current user priority is a schema comparison, not expansion
of those stages.

Phase A is reported restored/stopped with503a…5180; this tool has not read that raw
receipt and neither repeats the restore nor claims it never happened. DB LOGIN is
not ERP employee login. No source-only/synthetic dispatch test is actual PG proof.
