# Controlled candidate deployment

`deploy-candidate.py` and `rollback-candidate.py` run **only through C's existing bounded T45 dispatcher on `naijue-server`**. Their imports are inert. Default invocation validates input files and prints `PLAN_ONLY_NOT_EXECUTED`; host mutations require `--execute`. C remains the only server operator. These scripts do not create technical/business acceptance, and a successful activation still requires the existing public HTTPS identity/accepted-scope readback before C records a release.

The fixed scope is the existing Oray HTTPS origin `https://1n5635n614.goho.co` and loopback `127.0.0.1:18080`. The old app and PG containers are never stopped/recreated, and their source/config/media/volumes are never modified. The only old-container action is a stop/start of the **exact old Web container ID** after a fresh before-CAS check. There are no SQL, migrations, imports, backup restores, image builds/pulls, Docker prune, new networks, firewall changes or domain/mapping changes.

## Required facts C must supply

No image tag, network, runtime identity or private credential is guessed. Before execution C pins these actual inputs:

- local Linux/amd64 immutable Node and Web image IDs; Node **24.21.0** and the exact npm 11.x version;
- IDs and names of existing `naijue-prod-front`, `naijue-prod-data` (both internal bridge) and `naijue-prod-ingress` (installer only); no default/host network;
- explicit finite app/Web/installer resources, app UID:GID, Web `101:101`;
- the fully formed D1 production runtime configuration at a **server private file reference**, mode 0600 owned by the app UID; its stat identity is pinned, its content/hash is never emitted;
- the candidate-specific Nginx configuration at a public config file reference, equal byte-for-byte to `nginx_configuration(appName)` in the deploy script. This standalone proxy listens on 8080, enforces the exact public Host, clears forwarded headers, proxies the complete unchanged URI to this candidate's app, and exposes no static/source filesystem. It has no credential, include or TLS-key discovery;
- current exact old app/Web/DB CIDs, image IDs, start times, restart counts and the current non-secret Compose/Nginx configuration file hashes;
- hash-bound package/manifest/pack receipt, latest complete preservation receipt and schema19 new-database receipt;
- for activation: a fixed staged-candidate receipt, exact candidate QF/QB acceptance references and a fresh zero-new-business-write boundary receipt.

`runtime-database.json` from database provisioning is only a credential/target fragment, **not** D1's complete runtime JSON. C must prepare the private full D1 file with build identity, finite pool settings, native profile/auth policy, `documentCommands: "DISABLED"`, `http: {host:"0.0.0.0",port:3000,acceptedHosts:["1n5635n614.goho.co"]}`, `assets: {root:"/app/web",entry:"index.html"}`, and database `erp_rewrite_20261022_r1` / role `erp_rewrite_runtime_20261022` / host `naijue-prod-db-1` / 5432. The deployer reads this privately for target/binding checks, never prints or writes its body, never synthesizes an admin or changes credentials.

## Plan v1

Put the non-secret plan in the new dispatcher job bundle as `PLAN.json`. Use a fresh operation/job ID per phase; an existing operation receipt is never overwritten/replayed. Reference objects are `{ "path": "/ABS/server/file.json", "sha256": "64_lowercase_hex" }`. All references and ancestors must be canonical, regular, non-symlink, non-hardlink and not group/other writable. Runtime JSON additionally requires private 0600 permissions and matching owner/stat identity.

```json
{
  "format": "naijue-candidate-deployment-v1",
  "operationId": "c02-stage-UNIQUE",
  "buildId": "EXACT_PACKAGE_BUILD_ID",
  "sourceCommit": "EXACT_40_HEX_SOURCE_COMMIT",
  "publicOrigin": "https://1n5635n614.goho.co",
  "archive": { "path": "/ABS/server/release.tar.gz", "bytes": 1, "sha256": "REQUIRED" },
  "manifest": { "path": "/ABS/server/release-manifest.json", "sha256": "REQUIRED" },
  "packReceipt": { "path": "/ABS/server/pack-receipt.json", "sha256": "REQUIRED" },
  "backupReceipt": { "path": "/ABS/server/current-preservation.json", "sha256": "REQUIRED" },
  "backupMaxAgeSeconds": 86400,
  "newDatabaseReceipt": { "path": "/ABS/server/new-database-provisioning.json", "sha256": "REQUIRED" },
  "schemaVersions": [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19],
  "releaseDirectory": "/srv/naijue-erp/rapid-launch-20261022/releases/EXACT_PACKAGE_BUILD_ID",
  "images": {
    "node": { "id": "sha256:REQUIRED", "platform": "linux/amd64", "nodeVersion": "24.21.0", "npmVersion": "REQUIRED_11.x.y" },
    "web": { "id": "sha256:REQUIRED", "platform": "linux/amd64" }
  },
  "networks": {
    "front": { "id": "REQUIRED", "name": "naijue-prod-front" },
    "data": { "id": "REQUIRED", "name": "naijue-prod-data" },
    "install": { "id": "REQUIRED", "name": "naijue-prod-ingress" }
  },
  "names": {
    "app": "naijue-rewrite-UNIQUE-app",
    "stageWeb": "naijue-rewrite-UNIQUE-stage-web",
    "publicWeb": "naijue-rewrite-UNIQUE-web",
    "installer": "naijue-rewrite-UNIQUE-installer"
  },
  "limits": {
    "app": { "user": "REQUIRED_NONROOT_UID:GID", "memoryMiB": 512, "cpus": 1 },
    "web": { "user": "101:101", "memoryMiB": 128, "cpus": 0.25 },
    "install": { "memoryMiB": 1024, "cpus": 1 }
  },
  "runtimeConfiguration": {
    "path": "/srv/naijue-erp/rapid-launch-20261022/PRIVATE_FULL_RUNTIME_JSON_REFERENCE",
    "identity": { "device": 0, "inode": 0, "bytes": 0, "mtimeNs": 0, "uid": 1000, "gid": 1000, "mode": 384 }
  },
  "nginxConfiguration": { "path": "/srv/naijue-erp/rapid-launch-20261022/config/CANDIDATE.conf", "sha256": "REQUIRED" },
  "beforeCAS": {
    "services": {
      "naijue-prod-app-1": { "id": "REQUIRED", "imageId": "sha256:REQUIRED", "startedAt": "REQUIRED", "restartCount": 0 },
      "naijue-prod-web-1": { "id": "REQUIRED", "imageId": "sha256:REQUIRED", "startedAt": "REQUIRED", "restartCount": 0 },
      "naijue-prod-db-1": { "id": "REQUIRED", "imageId": "sha256:REQUIRED", "startedAt": "REQUIRED", "restartCount": 0 }
    },
    "files": [ { "path": "/srv/naijue-erp/prod/EXACT_CURRENT_NON_SECRET_CONFIG.json", "sha256": "REQUIRED" } ]
  }
}
```

The sample is intentionally non-executable. Replace every required field with C's actual observation and finite limits; candidate container name stems are lowercase. Archive/schema/build identity and the migration1–19 hashes must match the actual provisioning receipt, not merely its maximum version. The backup must be `PASS_FRESH_CURRENT_APP_DB_WAL_MEDIA_CONFIG_PRESERVED`, have actual DB/WAL verification and stable media/config capture, match the current old services, and be within C's declared max age (maximum one day). The tool reuses these results and never repeats the restore rehearsal.

## Stage

```sh
python3 deploy-candidate.py --phase stage --plan /ABS/job/bundle/PLAN.json
python3 deploy-candidate.py --phase stage --plan /ABS/job/bundle/PLAN.json --execute
```

Execution verifies the original package/manifest hashes, every archive member and the embedded manifest. It rejects traversal, links, duplicates, extra files/directories, wrong sizes/hashes, excessive expansion, missing runtime entries and wrong build/schema. It then manually writes only the verified regular bytes to the **new** release directory; it does not call unsafe extractall or overlay a prior version.

Linux runtime dependencies are installed once in a bounded installer container using the exact local Node image and the package/lock from the archive: `npm ci --omit=dev --ignore-scripts --bin-links=false --no-audit --no-fund`. The installer has no private runtime/credential mount, no port, read-only root, limited tmpfs and no capabilities. Only this installer may use the existing ingress network. No Mac node_modules, registry credentials, arbitrary package scripts or globally installed packages are inherited. The original package bytes are checked again; installed regular dependency files are hashed as the staged payload identity. Installer containers are retained, not removed/reused.

The app is created on the existing private front/data networks, with no host ports, read-only payload/runtime mounts and no restart policy. The private stage Web has no published ports. Only `/healthz` is requested, first directly in the app and then through the stage proxy; returned build/source identity must match, `databaseChecked` must remain false. This is a host/identity check, not login, data readiness or business validation. Stage failure stops only new containers marked as created by this operation; all outputs and failure evidence remain. There is no automatic replay.

Successful stage stores `releaseDirectory/stage-receipt.json` plus the typed dispatcher export `candidate-stage.json`. Supply this exact SHA-bound stage receipt to activation.

## Activate

Activation adds these references to the plan:

```json
{
  "stageReceipt": { "path": "/ABS/release/stage-receipt.json", "sha256": "REQUIRED" },
  "candidateAcceptance": { "path": "/ABS/exact-candidate-acceptance.json", "sha256": "REQUIRED" },
  "writeBoundary": { "path": "/ABS/current-write-boundary.json", "sha256": "REQUIRED" }
}
```

`candidateAcceptance` is C's evidence summary with format `naijue-candidate-acceptance-v1`, `result:PASS`, exact buildId/sourceCommit/archiveSha256/schemaVersions, checkedAtUtc within one day, `dataReady:true`, and `evidence.QF` / `evidence.QB` pointing by SHA to the original PASS receipts with exact candidateCommit and scope. This tool does not create those receipts or infer them from code/build/health. Missing candidate/data acceptance blocks **activation only**; stage preparation remains independent. Public HTTPS readback follows activation on the existing address and is still required before declaring a release; it is not a circular precondition for first binding that address.

`writeBoundary` is the real designated owner's current result: format `naijue-rewrite-write-boundary-v1`, database `erp_rewrite_20261022_r1`, exact buildId/sourceCommit, `writeAdmission:CLOSED`, `newBusinessWrites:0`, `firstBusinessWriteAtUtc:null`, checkedAtUtc within five minutes and checkedBy. Authentication session changes are not a substitute for this accounting/business-write result. The tool does not query the DB or invent a zero result. Freshness is checked again before switching or restoring an old entry.

```sh
python3 deploy-candidate.py --phase activate --plan /ABS/new-job/bundle/PLAN.json
python3 deploy-candidate.py --phase activate --plan /ABS/new-job/bundle/PLAN.json --execute
```

The staged file/dependency identities, private runtime stat identity, image/network IDs, candidate container spec, old service CAS, latest backup, accepted candidate and write boundary are checked. The operation journal is durable before stopping the old Web. Only the captured old Web CID is stopped; the new public Web then binds **the same** `127.0.0.1:18080`. An internal proxy health check and independent loopback bound-port identity check must agree. The old app/DB stay running and unchanged. No old Compose file is rewritten.

If activation fails, the tool attempts to stop only its exact new public Web and start the original old Web CID, verifying its old image/config and healthy state. This is permitted only while the original app/DB CAS and the closed zero-new-business-write boundary still hold. If recovery cannot be confirmed or writes may have occurred, it records `requiresOperator` and leaves evidence; it never guesses a new target, restores an old DB, or hides an unknown Docker outcome through resubmission.

The activation result is **`ENTRY_ACTIVATED_INTERNAL_HEALTH_ONLY_PENDING_PUBLIC_READBACK`**. C must still read the existing public HTTPS build identity and the affected accepted operation, then record actual release facts and not-tested items. Default scripts do not claim that Oray TLS or external origin was verified by local HTTP.

## Rollback

Use a fresh operation/job ID and add a SHA-bound `activationReceipt` to the original exact target plan. Always transmit **both** Python scripts from the same fixed source version; rollback imports the adjacent deployment implementation.

```sh
python3 rollback-candidate.py --plan /ABS/new-job/bundle/PLAN.json --mode restore-old-entry
python3 rollback-candidate.py --plan /ABS/new-job/bundle/PLAN.json --mode restore-old-entry --execute
```

Before any new business write, this stops only the exact new public Web CID and restores only the captured original old Web CID after CAS/closed-write verification. It retains the rewrite app, new database, sessions, imports, business receipts, candidate files and all failed/stopped containers. No physical database snapshot is applied and no old data is copied into the rewrite DB.

After a new business write, or when the zero-write fact is unavailable, `restore-old-entry` is refused. For an explicit emergency stop while preserving data:

```sh
python3 rollback-candidate.py --plan /ABS/new-job/bundle/PLAN.json --mode stop-entry --execute
```

`stop-entry` stops only the exact new public Web and keeps the old Web stopped. It truthfully reports `NEW_ENTRY_STOPPED_NO_HTTP_MAINTENANCE_RESPONSE`: it does **not** pretend that a working 503 maintenance page exists. C must then arrange the specific approved maintenance/compatible code recovery with new-accounting preservation and reconciliation. The scripts never automatically downgrade schema, roll back data, dual-write, reverse-migrate or replay receipts.

## Execution and remaining boundaries

Mutating actions require root, hostname `naijue-server`, `ERP_SHARED_TASK_ID=T45`, and the matching `ERP_SHARED_JOB_DIR` under the existing grant's `/root/.../jobs/<operationId>`. Operations use the existing `/run/naijue-erp-hdd-test.lock` and a new root-owned operation journal. Reusing a job/operation/release/installer name is refused or fails closed; failed attempts are collected by original ID and not replayed.

Only typed, bounded JSON receipts are exported through `ssh-control.py`; no runtime configuration, password, SQL, raw Docker inspect, container output, installation log or credential hash is emitted. Local receipt file references/hashes and non-secret runtime IDs remain reviewable. Unexpected failures report safe error codes and preserve data.

**Not implemented/proven by this slice:** systemd/boot entry ownership, actual nodebase/network facts, real Docker startup, Linux installation/network access, private runtime readiness, real auth/data/HTTPS acceptance, external cutover/readback and actual rollback. Candidate containers deliberately have `restart=no`; C must explicitly bind a compatible boot/startup arrangement before claiming persistent production operation, because the existing `naijue-prod.service` may restart its old Web after reboot. These tools do not silently change that old unit. No actual deployment has been executed as part of this tool delivery.
