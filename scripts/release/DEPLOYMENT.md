# Controlled candidate deployment

> SOURCE624 Full 后继新增显式分支；源码准备不代表已构建、PUBLISH、部署、恢复或业务验收。原 schema19/R1 规则只用于各自选择器，不能拿旧 C38/121/空库回执启用 Full。准确差异见末尾“exact26-full”。

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


## Explicit exact26 R1 successor (source only; not deployment evidence)

The default plan remains schema19. Select `runtimeSelector: "exact26-r1"` explicitly with the dense schemaVersions 1..26. Unknown selectors or runtime26 inputs without this selector are rejected. Keep documentCommands DISABLED and profile source-confirmed-native-exact26-r1-v1 in the closed ten-field private runtime configuration. No SQL, migration, import or grant is executed by this deployment selector.

The runtime26 object has exactly six distinct permanent ROOT references, each closed to path and sha256: upgradeReceipt, review, independentReview, buildReceipt, sourceManifest, buildManifest. Bind the original C05 prefix19 and actual committed C38 versions20..26 by their source migration hashes; require the exact same fixed-source real build/pack and native backend source/output graph. Prior metadata or health does not satisfy dataReady.

Mount only the explicit metadata files readonly at /run/naijue-rewrite/runtime26/C-RUNTIME-REVIEW.json and /run/naijue-rewrite/runtime26/INDEPENDENT-REVIEW.json, alongside the existing readonly private runtime configuration. Start the same backend production-main.js using --exact26-r1. C must create a NEW permanent-path metadata review and SHA; the temporary JOB42 e48df427 review is not a permanent-host pin. Keep credentials server-only and out of logs, Git and receipts.

The stage receipt, actual accepted candidate and activation bind runtime26BindingSha256 over these public references plus the existing private runtime file identity. They cannot change selector, metadata bytes, version or private config between staging and activation. All existing backup, original-container CAS, exact candidate, QF/QB, actual dataReady, write-boundary and rollback gates remain. Ship rollback-candidate.py from the same fixed source because it imports this module.

Boot persistence is separate: boot-entry.py still limits schema19. This source successor does not establish exact26 boot or public business readiness. No permanent config/package, actual stage, entry switch or import is represented as complete by this addition.


## exact26-full

本分支只由原 C/T45 登记窗口执行；不改变当前 CORE17、原独立任务或正式根。应用已存在 `--exact26-full`，复用 `source-confirmed-native-exact26-r3-v1` 的闭合配置及原 `SOURCE_CONFIRMED_HISTORY_REVISION_V16`，无新应用 DTO。未选维护能力不擅加 true，`existingPreparation.sales/transfers` 明确逐项布尔；Full 本身包含原 native 单据、HISTORY 及媒体能力，不能用只读 review 假装启用。

部署 PLAN 选 `runtimeSelector: "exact26-full"`、`schemaVersions: [1..26]`，不得同时带旧 `runtime26`。增加闭合 `runtime26Full`：

```json
{
  "references": {
    "metadata": {"path": "/srv/naijue-erp/rapid-launch-20261022/full/metadata.json", "sha256": "REQUIRED"},
    "review": {"path": "/srv/naijue-erp/rapid-launch-20261022/full/runtime-review.json", "sha256": "REQUIRED"},
    "independentReview": {"path": "/srv/naijue-erp/rapid-launch-20261022/full/QB-review.json", "sha256": "REQUIRED"},
    "buildReceipt": {"path": "/srv/naijue-erp/rapid-launch-20261022/full/build-receipt.json", "sha256": "REQUIRED"},
    "sourceManifest": {"path": "/srv/naijue-erp/rapid-launch-20261022/full/source-manifest.json", "sha256": "REQUIRED"},
    "buildManifest": {"path": "/srv/naijue-erp/rapid-launch-20261022/full/build-manifest.json", "sha256": "REQUIRED"},
    "publication": {"path": "/srv/naijue-erp/rapid-launch-20261022/full/publication-readback.json", "sha256": "REQUIRED"},
    "backupCoverage": {"path": "/srv/naijue-erp/rapid-launch-20261022/full/backup-delta.json", "sha256": "REQUIRED"}
  },
  "media": {
    "hostRoot": "/srv/naijue-erp/rapid-launch-20261022/media/full",
    "containerRoot": "/run/naijue-rewrite/media/products",
    "rootKey": "REQUIRED",
    "writable": true
  }
}
```

示例 SHA 故意无效，不是实际回执。`newDatabaseReceipt` 精确等于 `references.metadata`。当前 Full 支持 `26_hv2_history_set_guards_from_v22`（135 函数），应用 profile 仍为 `source-confirmed-native-exact26-r3-v1`。metadata 使用现有对应 issuer probe 的四键 `{identity,migration_versions,catalog_sha256,source_routines_match}` 实际结果；review 仍为原 `C_NATIVE_RUNTIME26_REVIEW_V1`，绑定实际目标、身份、postmaster、1..26、该 patchLevel、当前函数与 ACL canonical。不能沿用旧 V20 或隔离 P04 的目录/权限证明。保持 PostgreSQL 原 canonical 摘要，不以格式化 JSON 的摘要替代。原用途授权保持，未授实际用途就拒绝。

`config/release-contract.json.runtimeSqlPatches` 是 JS/Python 共用的 11 项有序包成员来源，不是自动 SQL 执行器。v8/v10 已被完整 v14/v11 覆盖，退出本支持清单，历史原件保留。包内 v22 原件提供受控函数体与父版本来源，仍绑定原 R1 目标，不能用于其他目标；实际 230 的 P04 载体也只适用 OID16400。其他目标准确安装载体由原 SQL/服务器 owner 绑定并获得对应环境授权。已有库只执行实际父版本所需增量，不重放整链；228→230→231 仅证明原已发布 schema19 合成 P04 目标接续，不证明任意空库安装或正式升级。

选择人员维护时，`runtime26Full.credentialRequestKey` 必须提供 `{hostFile,containerFile:"/run/naijue-rewrite/credential-request.key"}`，与私有 runtime 的 `staffCredentialRequestKeyFile` 一致；部署器单文件只读挂载。未选择时两处均省略。路径与文件元数据进入既有绑定，密钥内容不读取、摘要或记录；真实密钥供给及保护由原服务器 owner 负责，此示例不生成或授权真实密钥。

新 review / QB 文件分别 readonly 挂到原 `/run/naijue-rewrite/runtime26/C-RUNTIME-REVIEW.json` 和 `INDEPENDENT-REVIEW.json`，private config 内引用相应 review SHA。源码、静态资源、runtime config 及元数据只读挂载；R3 媒体目录独立可写、归 app UID、不在 release/public web 中，精确等于 private config 的 `productMedia:{root,rootKey}`。若明确选择现有库存输出，`runtime26Full.inventorySpool` 另给 `{hostRoot,containerRoot:"/private/inventory-exports"}`；hostRoot 须与媒体隔离并归 app UID，config 仍用原批准 `directory/maxBytes=536870912/maxConcurrent=1/maxDurationMs=120000`。不选择则两处均省略，不默开路由或给 `/app` 写权限。

原 source/build/pack/依赖/同版后端图验证复用，Full 图额外含原 history-revision store。publication 只接真实原表投影 `{batch,receipt}`：batch 含 `id,status,checkpoint,history_validation_passed,history_payload_hash`；receipt 含原 `id/action/target_type/target_id/status/result_data`。必须实际 IMPORTED、非零 ledger 完整 counts=expected，原 IMPORT_PUBLISH COMMITTED/result 与该 batch/seq/cursor 一致。暂存、单独来源检查或 health 不代替此证明。原 candidateAcceptance 仍需同版 QF/QB 和 dataReady；部署器不创造业务通过。

`backupCoverage` 是 T45 本次实际保护/隔离恢复的增量读回，给 `database/target/buildId/sourceCommit/schemaVersions/catalogSha256/backupReceiptSha256/runtimeIdentity/media/r1Protected`，目标等当前 review，runtimeIdentity 等 private config stat，media 等本 PLAN。`isolatedRestore.currentAppLoginRepresentativeRead` 必须实际 PASS。可复用已有备份方法及旧 DB/媒体有效恢复，只补当前 R1/schema/新配置/媒体和新 APP 登录代表读，不能把旧83仅覆盖旧库的事实改称当前 Full 已恢复。

Full writeBoundary 仍用原 format，但实际同目标读回须含 `target/outcome:"KNOWN"/newBusinessWrites` 整数及显式 `firstBusinessWriteAtUtc`，并保留 build/source、CLOSED 或 CONTROLLED_PRIVATE、checkedBy/checkedAt。候选内真实保存/编辑/审核也算新业务。导入及会话与真实业务动作分开；LIVE、HISTORY、维护中的真实新增/编辑/审核都算，不能只查 LIVE 或把全部回执混成一个数量。分类不清或提交未知保留 UNKNOWN。已知有新账可以切换到兼容 Full，失败保留新账；结果未知则停止，不开新键重放。

恢复旧入口另需 `writeFence` 的真实引用，不能只用五分钟内的零写 JSON：原 T45 先关闭所有写入口、停对应 app/worker、排空原事务，再同一一致快照记录零新业务写。fence 明确 `database/target/buildId/sourceCommit/allWriteEntrypointsClosed/inFlightTransactions:0/closedAtUtc/drainedAtUtc/snapshotAtUtc`、`snapshot:{newBusinessWrites:0,firstBusinessWriteAtUtc:null,outcome:"KNOWN"}`、`writers:[{id,startedAt,finishedAt}]` 以及 `oldEntry:{compatible:true,appId,dbId,appImageId,catalogSha256}`。全部目标和旧入口 IDs/image/catalog 精确绑定；工具实际 inspect 每个 writer 仍 stopped/Pid0/restart=no/相同起止时间，并包含 stage app。snapshot 必须晚于 drain；新写、未知、复起、缺旧兼容证据一律拒恢复旧入口。没有该真实 fence 时 Full 失败不自动假恢复旧站。`stop-entry` 同时停本次准确 app 和 public entry，保 DB/媒体/回执，事务结论另按原键读回；不做旧 DB 覆盖或 schema inverse。已有写只能用当前 schema/data 兼容 APP，或保持维护后修当前版本。

实际回执分 install/start、data-ready+业务、fence/arm、root HTTPS 四组。当前仅离线源码和有限纯计划检查；实际 Full/PUBLISH/新权限/备份恢复/部署/公网及重启均 NOT_RUN，不能凭新增选择器安装或重启服务。

### Capacity CLI941 release increment (source only; actual launch blocked)

All selectors keep the single private `/run/naijue-rewrite/runtime.json` path.
`capacityLaunch` is a private host field: deployment validates its complete closed
shape, explicit target/window/process/budgets and owner artifacts before removing
it for the unchanged business configuration guards. Missing inputs, unknown keys,
expired approval, altered owner profile or a different target reject. No default
window or budget and no new CLI flag is introduced. No private runtime bytes or
hash belong in a public plan, receipt or application archive.

`capacityHost` is a closed deployment-plan object with `collector`, `profile`,
`interpreter` and `reviewSha256`. Collector/profile references each contain
`hostFile`, `containerFile`, `sha256`, within the existing protected release root.
The two fixed container paths are
`/run/naijue-rewrite/capacity/capacity-live-statfs.mjs` and
`/run/naijue-rewrite/capacity/owner-profile.json`; both bind read-only.
The dedicated collector has the absolute `#!/usr/local/bin/node` shebang and uses
only Node core modules. `interpreter` has `containerFile=/usr/local/bin/node`, its
actual binary `sha256`, and the exact cached Node `imageId`. These pins require
actual owner verification in the chosen image; merely supplying a digest is not
proof that the interpreter was checked. No interpreter or package is installed
by this increment.

The collector receives `--profile=<64 lowercase hex profile SHA256>` and a bounded
`CAPACITY_LIVE_REQUEST_V1` stdin message. Its separate owner-mounted profile has
exact fields `schemaVersion=1`, `profile=OWNER_FIXED_STATFS_V1`, `reviewSha256`,
`target`, `binding`, `windowToken`, `startsAt`, `expiresAt`, `maxAgeMillis`,
`namespace`, `volumes`. The target/binding/window must equal the private launch
approval. Every logical volume has `path`, `physicalVolume`, `namespace`,
`device`, `filesystemType`; the latter two are actual observed decimal
`stat.dev` and `statfs.type` values. Linux namespace is the actual collector's own
`linux:` plus `/proc/self/ns/mnt` link identity. This is only its own namespace;
no other process's filesystem or PG `/proc` path is accessed. Node statfs has no
fsid, and the collector does not claim one. Darwin local tests use
`darwin:local`, which a Linux collector cannot accept.

The owner fixes the profile and its physical labels independently of the request.
Each collection checks the actual namespace/device/type, protected canonical
profile and five canonical directories, closes opened descriptors, observes
`bavail*bsize` only after the live request, and returns the exact LIVE result.
Aliases of the same observed device/type in one namespace must use the same
physical label, and distinct observed identities cannot be collapsed to one.
Missing/invisible paths, aliases, wrong mapping/profile, stale/expired time or
file replacement produce bounded failure with no receipt substitution. There
is no pool, remote command, credential, Docker socket, privilege escalation,
recursive scan or child process. A 30-second incomplete-input deadline and the
stricter original941 producer timeout bound the subprocess; actual native kernel
cancellation and descendant cleanup still require platform verification. A
nonce or digest binds bytes/responses, never proves truthful collection.

Current QA897 has no authorized namespace where UID10001 can see all five true
volumes. PG/WAL remain the separate PG container's tmpfs; host backup's protected
parent is not accessible to that UID. Do not substitute `/app`, `/tmp`, host free
space or old receipts for them. No mounts, connectivity, permissions or owner
profile values are created by this source delivery. Normal90/preparation189 and
actual writer topology/window/budgets remain prerequisites.

F02 uses the reviewed fixed `/bin/sh -c` builtin read/exec body, explicit `$0`
placeholder, one synchronization nonce as `$1`, then the absolute Node/backend
and original selector/runtime argv. `capacityGate` contains the new candidate
FIFO's `hostFifo`, exact `identity`, `nonce`, absolute `deadlineAt`, and pinned
`shell={containerFile:/bin/sh,sha256,imageId}`. The FIFO is0600 owned by the actual
application UID/GID, under a private candidate parent and bound read-only at
`/run/naijue-rewrite/capacity-gate`. Creating a new FIFO never changes an existing
file/parent. There is no `--init`, background process or second shell. Before
release, an in-container bounded metadata check verifies namespace PID1,
start ticks/boot ID and actual shell/Node binary hashes. This check runs no
business code. After release, the same tuple and PID1's actual Node executable
are confirmed; health still comes from the original941 listener/preflight path.

The original controller stays in one bounded job. A joined in-job deadline thread also stops only its candidate if another bounded validation is still running at the absolute deadline; it is not a separate supervisor process or service. `capacityFinalInput` has only
`path` and `authority={path,sha256}`. Its path is inside that exact job's existing
`inputs-private` directory, not a new registry or polling service. An independently
provided, hash-pinned `OWNER_CAPACITY_FINAL_INPUT_AUTHORITY_V1` record has exactly
`format`, `jobId`, `operationId`, `buildId`, `sourceCommit`, `archiveSha256`,
`target`, `deadlineAt`, `controlOwnerUid=0`, and
`action=ONE_FINAL_CAPACITY_PLAN_ONLY`. No such real authority record is generated
by this source change. A file merely appearing or a nonce never grants approval.
The root-owned private delivery must be
`OWNER_CAPACITY_FINAL_PLAN_DELIVERY_V1` with exact `authority`, `containerId`,
`process`, `provisionalRuntimeIdentity`, `provisionalProfileIdentity`,
`fifoIdentity`, `helperSha256`, `finalRuntimeCtimeNs`, `finalProfileCtimeNs`, and
`finalPlan={path,sha256}`. The final plan stays within that same private directory.
Its scope/source/CAS/producer/interpreter/window authority must equal the original
plan: only the private runtime identity and profile's owner-approved final hash
may change. Profile and runtime keep the original device/inode/UID/GID/mode.
The profile must be private0600 owned by the application UID, so its namespace
and actual observed mapping can be finalized in the same bound inode after the
container exists. Its operational digest is permitted; private runtime content
and digest are never exported.

The original control owner alone supplies approved final bytes via the existing
private channel. `same_inode_runtime_write` supports bounded write/truncate,
fsync and exact readback without rename; it does not manufacture approval or
write passwords to a receipt. Before release all original closed runtime,
backup/source/target/CAS/image guards rerun against the actual final plan, then
runtime/profile metadata including ctime and final-plan reference are rechecked.
The FIFO writer is nonblocking with a monotonic deadline and original absolute
wall deadline; ENXIO cannot hang indefinitely. The nonce is one short atomic
line, and the descriptor is closed. Any rejection, EOF/exit or deadline stops
only the exact owned candidate, reads back its stopped state and preserves all
artifacts. There is no detached provisional return or automatic approval renewal.
The provisional owner profile may be filled in its original inode after the container mount namespace exists; only its explicitly approved final SHA may change between plans. The stage receipt explicitly names the final plan reference and identity; boot
must consume that final plan, never the provisional file identity. Boot refuses
a stopped candidate instead of replaying a process-bound approval on restart.

The existing transport currently uploads bundle/request files before job start;
actual ongoing delivery to a running job's root-private `inputs-private` location
has NOT been proved. No transport, privilege or server change is made here. The
controller strictly refuses missing authority/input and times out safely if the
original owner cannot deliver it. That platform gap, five-volume visibility,
actual fixed image shell/FIFO/RO-bind semantics, permissions, network and budgets
must be established before any real startup claim. No ready state or usable
owner approval is synthesized by source tests.

Increment checks: `python3 -m unittest scripts/release/test_capacity_launch_wiring.py`
and Node24 `--test tests/capacity-live-statfs.test.mjs`. These cover new guards,
readonly mount construction, actual local synthetic statfs subprocesses,
same-inode writes, local FIFO/shell PID preservation, bad nonce/EOF, deadline,
final-guard failure and owned-candidate cleanup. They do not verify actual QA
PG/WAL, Linux CLI ready, low-water admission, approval expiry or target cleanup.
Retain original source/protocol results and rerun only this affected increment.
