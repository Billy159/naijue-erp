# Sales successor installation record v1

This is a successor installer, not a catalog-capture or record-registration command. It requires the genuine fixed original177 installation record and a matching live predecessor catalog. It never accepts a caller-supplied record, catalog packet, SQL path, or fingerprint override.

## Trusted launch

Two native fixed deployments are supported in source:

- Linux: source/dependencies `/opt/naijue-erp/whole-sales-v1`, Node `/usr/bin/node`, psql `/usr/lib/postgresql/17/bin/psql`, records/config under `/etc/naijue-erp`.
- macOS: source/dependencies `/Library/Application Support/NaijueERP/whole-sales-v1`, Node `/usr/local/bin/node`, psql `/Library/PostgreSQL/17/bin/psql`, records/config under `/private/etc/naijue-erp`.

All trusted paths and ancestors must be root-owned, non-group/world-writable and symlink-free. On macOS they must also have **no extended ACL entries**; the fixed system `/bin/ls -lde` is checked before Node and again in Node checks. Any ACL entry, unreadable or malformed result fails closed. Safe mode bits do not override an ACL. The launcher never removes ACLs or changes ownership. Homebrew symlinks are not silently accepted as the fixed Node or psql binary.

System Python and its standard library are part of the OS trust base. A usable `/usr/bin/python3` with `-I -S` is required. Check existing OS/developer-tool availability first; do not automatically install tools in response to an OS prompt. Run in an authorized privileged installation session:

Linux:
`/usr/bin/python3 -I -S /opt/naijue-erp/whole-sales-v1/scripts/release/unified-install/launch-whole-sales-install-v1.py --install-reviewed-sales-v1`

macOS:
`/usr/bin/python3 -I -S "/Library/Application Support/NaijueERP/whole-sales-v1/scripts/release/unified-install/launch-whole-sales-install-v1.py" --install-reviewed-sales-v1`

The launcher checks the tree before any Node/project import and starts Node with a clean environment. Its inherited FIFO is read by descriptor directly, without Linux procfs. It is bounded, requires the exact marker and EOF, and is closed only after it has been identified as the handoff FIFO. This is a launch handoff, not an authorization token or protection against an already hostile root account. Real and effective UID must both be zero. Linux process tests and mocked Mac layout/ACL tests are not Mac hardware acceptance.

The installer does not create users, grant memberships, install dependencies, change filesystem ownership, or provision privileged execution. Do not run a scratch-workspace copy as root. The existing disabled batch finalizer remains disabled.

## New isolated target: official original177 first

The same trusted launcher has one additional fixed mode, `--install-reviewed-original-local-v1`. It launches the official `record-whole-installation.mjs --install-reviewed-local-config` with the fixed private config `<platform etc>/whole-original-install-config-v1.json`. It never accepts a caller-supplied entry path or target-config path. It does not require an original record before this first phase.

The original installer does not validate the sales fd3 marker. Its supported security boundary is invocation through this fixed pre-Node launcher, not a claim that a marker can authorize arbitrary root execution.

The original config has exact keys `controller`, `database`, `expectedDatabaseOid`, `expectedSystemIdentifier`, `host`, `owner`, `port`, `psql`, `roleAdmin`, `runtimeLogin`. Each of controller/owner/roleAdmin contains only `user` and `password`. The four account names, including runtimeLogin, must be distinct. psql must equal the platform fixed path. Physical IDs must come from the intended new isolated target, not a fixture. The official original installer enforces an ordinary owner, PG17, the bound database OID/system identifier and an absent application schema before any installation. The database/authorized accounts and required restrictive database privileges must already be prepared under their own authorization. Before the first write, an ordinary-owner repeatable-read read-only probe must retrieve the actual cluster/database identity. If it cannot execute pg_control_system(), installation stops with INSTALL_OWNER_PHYSICAL_ID_UNAVAILABLE; the installer does not add privileges or skip the identity check. Each 00/02 stage has a physical-ID and session-actor guard inside its transaction. Stage01 keeps its existing multiple transactions, with the guard first on the same psql connection and no connection/include/shell escape permitted.

For Mac, phase 1 is:
`/usr/bin/python3 -I -S "/Library/Application Support/NaijueERP/whole-sales-v1/scripts/release/unified-install/launch-whole-sales-install-v1.py" --install-reviewed-original-local-v1`

Only after that command succeeds and its genuine original record exists, run `--install-reviewed-sales-v1`. Original177 stages 00→01→02 are separate operations; failure of a later stage or publication does not roll back earlier committed stages. The launcher states this explicitly. Stop and inspect any unsuccessful phase; it never automatically proceeds to sales or retries installation. The successor phase itself remains a single SQL transaction followed by separate filesystem publication.

## Fixed inputs

- Original record: platform record directory + `/whole-installation.json`.
- New record: platform record directory + `/whole-sales-installation-v1.json`, must not exist.
- Private root config: platform record directory + `/whole-sales-install-config-v1.json`, root-owned regular single-link file, mode 0600 or stricter. Exact keys: `host`, `port`, `database`, `owner`, `controller`, `noConcurrentDdlAclAdminChanges`. Each account has only `user` and `password`; users/database must match the original record. Host is loopback; port is 1025–65535. The exclusive-window acknowledgment must be true and operationally enforced. Do not put credentials in command-line arguments or logs.

## Order and outcomes

1. Validate the fixed deployment, source spec, original record, private config and absent destination record before any connection.
2. Ordinary controller runs the unchanged original177 catalog query in a repeatable-read read-only transaction, comparing the full packet hash and every physical/role binding to the existing trusted record. A rollback ACK is mandatory.
3. Owner runs the exact current historical-reception renderer as a single transaction, with a source-owned physical cluster/database/owner check inserted immediately after its BEGIN. The renderer orders the batch/profile/missing/restoration predecessors, the explicitly reviewed ACL companion before restoration, zero archive, staff successor and final access verifier. The installer does not independently rebuild or reorder those patches.
4. A nonce/server sentinel after COMMIT must confirm psql completed. Failure or loss of this confirmation is an unknown SQL outcome, never a claim of rollback or permission to rerun.
5. Ordinary controller runs the sales178 catalog query, including exact pins and ACL checks, in a new repeatable-read read-only transaction. It must match the original physical target, owner, controller and runtime login.
6. Recheck source and input bytes, then use the existing exclusive hard-link publication and fsync implementation. Never overwrite or delete a record.

SQL installation and filesystem publication are not one atomic transaction. If the SQL committed but observation/publication fails, no automatic retry, recapture or rollback is performed. The target must be inspected within the authorized installation workflow. An existing record or changed predecessor catalog blocks rerunning. Business-data import and reconciliation acceptance remain separate from successful installation.

Offline tests exercise observer identity failures, control ACK failures, strict config, physical SQL guard and pre-Node refusal. They are not evidence of a live installation or trusted record publication.

The trusted Node version must support synchronous `module.registerHooks` (the tested runtime is Node 24). Before any project entry is imported, the fixed preload installs a resolution boundary for ESM and CommonJS. Every non-builtin resolved module and its real path must stay inside the reviewed deployment tree. Missing local packages cannot fall back to ancestor/global packages; Node global search paths are also disabled. This is enforced for transitive dependencies, not just the first `pg` import.

Failure reports distinguish `INSTALL_OUTCOME_UNKNOWN`, `COMMITTED_UNPUBLISHED`, and `PUBLISHED_DURABILITY_UNKNOWN`. None authorizes automatic rerun. Launcher contract tests mock OS privilege/filesystem to verify ordering and exec arguments; separate actual Node tests prove ancestor dependency code does not execute. Neither test is a privileged end-to-end installation.

## Release identity after native-launch hardening

The physical-target guards added to the original installer change the original source-spec identity even though the original SQL routine set and sales combined SQL are unchanged. A record issued against an earlier source release is not silently rewritten or reaccepted. The supported new-isolated-target sequence issues a genuine original record under the current source, then a genuine sales record. If upgrading an already recorded installation fails the source identity check, stop and report the specific version mismatch; do not edit either record or substitute a captured packet. Frozen SQL-engine acceptance evidence remains bound to its own source snapshot, not automatically to this launcher release.

## Current formal closure and machine receipt (2026-11-04 follow-up)

The supported chain is the fixed Python launcher → `install-whole-sales-record-v1.mjs` → `renderWholeExplicitZeroCandidate` → the full live sales catalog observer → `publishInstallationRecord` at the fixed sales record path. The renderer already composes the reviewed batch/profile/restoration/zero/staff closure; do not execute candidate SQL separately. The old `finalize-whole-batch-closure-v1.mjs` is NOT a prerequisite, alternative registration step, or recovery tool for this chain. It remains unconditionally disabled. Its checks inside Node cannot protect static-import/startup execution; never invoke it, a scratch checkout, or a user-selected entry as root. The launcher admits only its two exact original/sales modes.

After the sales SQL COMMIT is confirmed, a fresh controller observation matches the physical target, source/input bytes are rechecked, and no-overwrite durable record publication succeeds, stdout emits one JSON object:

- `format=WHOLE_SALES_INSTALLATION_RECEIPT_V1`, `state=INSTALLED_AND_RECORD_PUBLISHED`.
- `recordPath`, exact `recordSha256` of the published JSON plus newline, `installedAt`.
- `sourceSpecSha256`, `combinedSqlSha256`, actual `catalogSha256` and physical `target` (system identifier, database OID/name).
- `businessImportVerified=false`: installation is not business-import acceptance.

Keep stdout, stderr and the process exit code separately. A receipt is diagnostic evidence, never an authorization token or a substitute for the fixed record loader. No private configuration, password, session token or connection string is included. Do not synthesize a receipt or record if an output is missing. A failure after SQL/publishing may be uncertain even when no receipt reached the terminal; inspect the target and existing record rather than rerun.

Current actual validation covers pure receipt/ordering tests, fixed-launcher negative contracts with mocked privileges/filesystems, real Node dependency-boundary tests, and source/admission tests. No Mac hardware, privileged formal installer, genuine record publication or full public CLI/host import was executed. Prior frozen SQL-only engine results do not validate this updated issuer source identity. Every later SQL/issuer/host edit requires a fresh source-spec/combined hash and rerun of the corresponding tests before freezing a new handoff.

## Explicit-zero successor cohort and large-package route

The issuer now calls `renderWholeExplicitZeroCandidate` from `whole-explicit-zero-integration-candidate.mjs`, which extends the historical-reception composition in the same reviewed transaction. The sales source-spec loader must pin that exact renderer/SQL cohort; do not pair a previous record or combined digest with the new host. Existing historical-reception references above describe its predecessor component, not a second manual installation step. Revalidate the new spec/renderer equality after all workers stop writing.

Large proof-bearing packages use explicit `stream-import` and `stream-verify` with the same independent `--explicit-zero-approval FILE --explicit-zero-approval-sha256 SHA` inputs. `whole-import` retains the 64MiB-per-artifact / 256MiB-total materialization limits and refuses oversize input with an explicit stream command suggestion, not automatic execution. The full Mac/operator command is in WHOLE_SALES_LOCAL_OPERATOR_HANDOFF.md. Streaming remains a single whole-package transaction; its source/preflight/request tests do not establish live installation or host acceptance.
