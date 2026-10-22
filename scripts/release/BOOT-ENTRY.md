# Fixed rewrite boot entry

`boot-entry.py` is a separate C-owned preparation tool. It is **not integrated** into the reviewed `deploy-candidate.py` / `rollback-candidate.py` pair. Imports and normal invocations are inert; the default prints `PLAN_ONLY_NOT_EXECUTED`. No server installation, reboot, Docker restart, production switch or persistent availability has been tested by this source delivery.

The deployment helper remains pinned by exact bytes before Python import. An omitted or explicit `schema19` selector keeps the original helper SHA256 `a03a8bd34f68b2df1589a4c057a4bb8315368205b0842fc4856bb2aa882fad5a`. Only the hash-bound base deployment plan with `runtimeSelector:"exact26-r1"` selects C90 helper SHA256 `543b1a594c1661e9eb3ffe7d03bbc98d0184a6d9a9cb5694f0c0e63d962ffa38`, conditional on C adopting its independent source review. Unknown selectors, helper versions and implicit schema26 plans are refused. This successor does not change the deployment/rollback implementations or execute their stage/activate functions.

## Why this shape

The actual C receipts `c02-bootstrap-metadata-20261022-12` and `c02-bootstrap-followup-20261022-13` establish:

- `naijue-prod.service` is enabled, active/exited, and runs Compose `up -d` for the old stack; its `ExecStop` stops that stack.
- `naijue-t48-prod-runtime.service` is enabled, inactive/dead, requires the first service, and runs the old app/Web Compose configuration.
- Old app/Web/DB containers use `unless-stopped`; the old Web owns `127.0.0.1:18080`. The new deployment tool creates candidates with `restart=no`. Docker live restore is disabled.
- `naijue-t48-entry-monitor.timer` is enabled and invokes `/srv/naijue-erp/t48/entry-monitor/monitor.py`; job 13 did **not** establish that script's complete side effects.

Follow-up job `c02-entry-boot-actors-20261022-15` supplies the complete sanitized T48 monitor control flow: HTTPS GET, certificate/response evaluation, and writes confined to its own status/event directory. Its original hash is `ddac4da585c4fec9ff69365ab821a4770de62e34b64b9c56d683018fc81d0bf1`; it does not start or repair containers/services. Its evidence can therefore close that specific semantic gap. The job remains `PARTIAL_READONLY_BOOT_ACTOR_PROJECTION` because showing a bare `naijue-t16-alert@.service` template returned 1; this does not invalidate the successfully collected individual facts.

Job 15 lists exactly five enabled ERP actors: the two legacy production units, `naijue-t15-firewall.service`, `naijue-t16-monitor.timer`, and `naijue-t48-entry-monitor.timer`. The two production units are the directly demonstrated old-entry starters. No non-enabled unit in the 37-item collection was active. Only two currently invoked helper bodies remain candidates for targeted reuse/read if C has no valid prior evidence: `/usr/local/sbin/naijue-t15-firewall` and `/srv/naijue-erp/t16/bin/monitor.py`. The bare alert template is relevant only if the live helper/dependency chain actually reaches it and could launch an entry. Do not repeat the 37-unit scan or treat all historical static/failed proof units as new work.

Disabling the two old units alone would not block another unit's dependency from starting them. Starting a new unit after the old units would briefly expose the old entry. This tool first writes a persistent condition to **both** old units, then disables their automatic activation without `--now`, and changes only the exact old Web CID's restart policy to `no`.

The condition is `ConditionPathExists=!/srv/naijue-erp/rapid-launch-20261022/boot-entry/<fenceId>/FENCED`. The marker is written and fsynced before either drop-in is installed. It blocks direct and dependency-triggered starts while preserving the original unit bytes. The currently active old service is not stopped. Original app and shared PG containers keep their policies and are never started, stopped or recreated by this tool.

## C execution sequence

Every manual execution below is carried by the existing **`ssh-control.py` bounded T45 dispatcher**, on `naijue-server`, as root, with the matching unique `ERP_SHARED_JOB_DIR` and `ERP_SHARED_TASK_ID=T45`. The plan must be inside that job's bundle. There is no SSH client, alternate channel or password handling in this tool.

Each phase uses a fresh `operationId` equal to its dispatcher job ID. Keep `fenceId` and all base references unchanged across phases; phase-specific receipts do not change the fence binding. Existing operation journals and fence directories cannot be replayed or overwritten.

1. Complete candidate staging through the existing deployment tool. Pin its actual stage receipt, app CID/spec, build/source/archive and permanent runtime files. Obtain C's boot-actor review described below.
2. Run `fence`. It saves the exact original unit bytes, enabled/active/sub states, original absence of drop-ins, all three old container snapshots and restart policies. It writes the persistent conditions, reloads definitions, disables the old units without stopping them, updates only the old Web restart policy, and reads everything back. The existing old HTTP entry remains running. Stop here on anything other than `LEGACY_BOOT_FENCED_CURRENT_ENTRY_UNCHANGED`.
3. Run the existing `deploy-candidate.py --phase activate` with the exact reviewed candidate and current write-boundary receipt. That existing owner stops the original old Web CID and creates/starts the public candidate. This boot tool does not perform activation or duplicate the old Web stop.
4. Run `arm` with the successful fence and activation receipts. It requires the old Web to be stopped with `restart=no`, protected old app/DB CAS unchanged, exact candidate images/networks/specs/payload/dependencies/runtime stat identity, and an internal candidate identity response. It installs and enables `naijue-rewrite-entry.service` **without starting it**. There is no restart or reboot as part of this phase.
5. C performs the already-required public HTTPS/build and accepted-operation readback. Record boot persistence separately as `ARMED_NOT_REBOOT_TESTED`. Do not reopen new business writes until C has consumed the completed fence/arm receipts and the applicable release gates.

Phase arguments inside a dispatcher job are:

```text
python3 boot-entry.py --phase fence --plan /ABS/THIS_JOB/bundle/PLAN.json
python3 boot-entry.py --phase fence --plan /ABS/THIS_JOB/bundle/PLAN.json --execute
python3 boot-entry.py --phase arm --plan /ABS/NEW_JOB/bundle/PLAN.json --execute
```

The first command only validates the local plan/reference structure and prints its fixed binding. It does not query Docker or systemd. `--execute` is still required for the read-only `inspect` phase because server reads must use the same T45 carrier.

## Plan fields

Use format `naijue-boot-entry-v1`. The following is a shape example; `REQUIRED` values deliberately make it non-executable.

```json
{
  "format": "naijue-boot-entry-v1",
  "operationId": "c02-boot-fence-UNIQUE",
  "fenceId": "c02-r1-boot-UNIQUE",
  "deploymentTool": {
    "path": "/ABS/THIS_JOB/bundle/deploy-candidate.py",
    "sha256": "a03a8bd34f68b2df1589a4c057a4bb8315368205b0842fc4856bb2aa882fad5a"
  },
  "deploymentPlan": {"path": "/ABS/FIXED_BASE_PLAN.json", "sha256": "REQUIRED"},
  "stageReceipt": {"path": "/srv/naijue-erp/rapid-launch-20261022/releases/BUILD/stage-receipt.json", "sha256": "REQUIRED"},
  "bootAudit": {"path": "/srv/naijue-erp/rapid-launch-20261022/boot-audits/AUDIT.json", "sha256": "REQUIRED"},
  "legacyUnits": {
    "naijue-prod.service": {
      "sha256": "128374a7399b9407db80c01c4cbddf3a553b70f426f03fc7842d81b640d42fe4",
      "unitFileState": "enabled", "activeState": "active", "subState": "exited", "dropIns": []
    },
    "naijue-t48-prod-runtime.service": {
      "sha256": "c134f4864170fe244be4d8c7a7770dd06ff4a9d71b0174bea9c95fb286fc161c",
      "unitFileState": "enabled", "activeState": "inactive", "subState": "dead", "dropIns": []
    }
  },
  "restartPolicies": {
    "naijue-prod-app-1": {"Name": "unless-stopped", "MaximumRetryCount": 0},
    "naijue-prod-web-1": {"Name": "unless-stopped", "MaximumRetryCount": 0},
    "naijue-prod-db-1": {"Name": "unless-stopped", "MaximumRetryCount": 0}
  }
}
```

IDs are lowercase letters/digits/hyphens; replace `UNIQUE` with lowercase concrete values. Unit hashes above are job 12/13 observations, not permission to ignore fresh CAS differences. A newly discovered pre-existing drop-in blocks this narrowly defined first takeover until reviewed; the tool never silently replaces it.

`deploymentPlan` is one immutable, complete base deployment plan for this build. It supplies the existing `beforeCAS`, immutable images, named networks, candidate names, release directory, archive/manifest identity and private runtime stat reference. Its operation ID may be the earlier stage operation. Keep this base file unchanged when creating the separate activation job's plan. Do not put credential values in any boot plan or receipt.

For `arm`, add SHA-bound `fenceReceipt` (the earlier typed `boot-entry.json`) and `activationReceipt`. Stage and activation receipts must be the permanent files `releaseDirectory/stage-receipt.json` and `releaseDirectory/activation-receipt.json`. `bootAudit` and all its evidence must already live under the permanent rapid-launch root, outside this new fence directory. Runtime/proxy configuration references must also remain under that root. This avoids depending on disposable dispatcher bundles after reboot.

`arm` saves copies of both Python helpers and the base plan in its own root. The original base-reference identity is retained only for fence comparison; the boot process imports the checked installed copies. The verified installed payload manifest is consumed directly from `releaseDirectory/payload/release-manifest.json`.

## Explicit exact26 R1 successor

The boot plan format and phase arguments stay unchanged. The SHA-bound `deploymentPlan` supplies the explicit technical selector; no separate auto-upgrade switch exists. Legacy plans keep exact1..19. The successor requires exact1..26, the C90 closed-six `runtime26` references (`upgradeReceipt`, `review`, `independentReview`, `buildReceipt`, `sourceManifest`, `buildManifest`) and the existing C05 `newDatabaseReceipt` as permanent canonical, single-link, non-symlink SHA references below `/srv/naijue-erp/rapid-launch-20261022`. These seven public metadata references must already exist outside the new fence directory. C05 remains the original prefix19 evidence, and C38 remains the actual20..26/final-patch evidence; neither is relabelled or replayed.

Stage and activation must carry exactly C90's `runtime26BindingSha256`, computed from the six public references and private-file path/stat identity. The source/build/archive IDs and stage receipt SHA continue to match through the original checks. The private configuration is never content-hashed or exported. C90's source implementation of stage creation selects `source-confirmed-native-exact26-r1-v1`, closed10, `documentCommands:DISABLED`, and `--exact26-r1`. Boot only starts that same exact candidate CID/spec; it never creates a substitute app or changes its command, mounts, credentials or grants.

The two permanent public files remain individually read-only mounted at `/run/naijue-rewrite/runtime26/C-RUNTIME-REVIEW.json` and `/run/naijue-rewrite/runtime26/INDEPENDENT-REVIEW.json`. C must freeze the permanent-path review bytes and new SHA. JOB42's temporary-path `e48df427...` review cannot be reused as that permanent pin. No missing review path or hash is filled with a placeholder.

Before writing an exact26 legacy fence, and at the existing arm/boot artifact gate, this successor reuses C90's `validate_runtime26` against the installed manifest and permanent public metadata. It checks the C05/C38 migration/source chain, fixed backend source/build graph, exact C41 R1 catalog/target, five metadata-only purposes and the bound closed10 private config. It also checks private file stat identity after reading. This is a bounded file/reference check; it performs no SQL, function re-audit, issuer substitution, backup replay, package reinstall or deployment. It deliberately does not call full `validate_references` at every reboot, which would incorrectly demand a fresh original deployment backup after the accepted activation. Original activation backup/dataReady/QF/QB/write-boundary gates remain with the deployment owner.

The accepted C41 target pins the PG postmaster start and server address. A real PG restart or address change can make the original issuer refuse the old review, as intended. This boot proposal cannot refresh, weaken or self-sign that target. C must record the actual new target/catalog review where required. A prepared/armed owner is still not proof of successful unattended host/PG reboot, public HTTPS or real business readiness; actual boot remains `NOT_DONE` until separately observed.

## Required boot-actor audit

The audit is a C review receipt, not a result the tool can fabricate. It must contain:

```text
format: naijue-legacy-boot-audit-v1
result: PASS
reviewedBy: C
checkedAtUtc: actual review time (within one day for fence)
monitorBehavior: OBSERVATION_ONLY
otherEntryLaunchers: NONE_OUTSIDE_FENCED_UNITS_AND_DOCKER_RESTART
legacyUnitSha256: exact mapping for the two original units
enabledActors: complete sorted enabled naijue-*.service / naijue-*.timer names
files: [{path, sha256}, ...] for reviewed live units, drop-ins and helper scripts
evidence: [{path, sha256}, ...] for the underlying safe inspection/review receipts
```

`files` must include the actual T48 `monitor.py` and the already reviewed timer/service/helper/dependency closure needed to establish these claims. Reuse job 15 and existing valid facts; only an actually active or triggered alternative needs targeted follow-up. A grep absence is insufficient to claim a script cannot launch an entry indirectly. If a helper repairs/restarts or delegates such actions, this v1 refuses installation; C must first design and review a specific treatment. Do not disable unrelated monitoring to make the gate pass.

At execution, all audit file bytes and evidence hashes are checked. The enabled ERP unit/timer inventory must agree exactly: `fence` expects the original inventory; `arm` and boot expect the two legacy units removed and only this owner optionally added. Installed boot checks use current hashes/inventory; they do not require a new one-day-old audit on every reboot.

## What the installed owner does

The unit has `Requires=docker.service`, `After=docker.service naijue-t15-firewall.service`, `PartOf=docker.service`, and is wanted by `multi-user.target` and `docker.service`. It has no dependency on either old production unit and no automatic retry (`Restart=no`). Its helper accepts `boot-start` only from the exact installed unit cgroup, systemd invocation ID, installed script/plan paths and root on `naijue-server`.

At boot/Docker-service activation it checks the legacy fences, original unit bytes, current audit files/inventory, old Web stopped/restart-disabled, old app/DB immutable IDs/images/policies, candidate IDs/names/specs, existing network/image IDs, installed file/dependency hash and private runtime stat identity. It waits up to 30 read-only observations for the existing PG container's health. It never starts or recreates PG or the old app.

It starts only the exact candidate app CID if stopped, checks its build identity, then starts only the exact public Web CID and checks the proxy identity. Candidates remain `restart=no`; an unobserved container crash does not cause an uncontrolled restart. Normal operational recovery remains C-owned. The private stage Web is not restarted by this owner.

The generated unit's `ExecStopPost` contains only `docker stop --time 15 <exact public candidate CID>`, for failure/timeout/shutdown cleanup. It never invokes an old unit's `ExecStop`, Compose, a container name guess, a DB stop or a restore. The leading `-` allows systemd shutdown to complete when Docker is already unavailable; that is not proof the stop succeeded. A killed helper or failed cleanup requires the recorded intent plus a fresh readback. Unit timeout is bounded at 420 seconds.

Neither internal `/healthz` nor a successful systemd start proves business correctness, public HTTPS correctness, or a successful host reboot test. No root filesystem, network, firewall, image build/pull, volume, database or old Compose configuration is changed.

## Failure and recovery

Every external mutation has a durable `INTENT_OUTCOME_UNKNOWN` journal entry before submission. A returned command becomes `RETURNED_SUCCESS_PENDING_READBACK`; only a completed phase with its state readback produces a success result. Timeouts and partial phases retain all files and receipts. There is no automatic rollback and no repeat of a failed Docker/systemd command under the same operation ID.

1. Through a **new** dispatcher job, run `--phase inspect --execute` with the same binding and, if activation occurred, its exact activation receipt. It exports `boot-observation.json` with all relevant file hashes, loaded/enabled states, restart policies and exact container snapshots. It also looks up the fixed public candidate name; an unbound public CID blocks recovery.
2. Pin this receipt as `observedCAS`. It must be at most five minutes old and match a fresh complete observation exactly. Choose one concrete recovery below in another fresh job. A changed or unknown observation is not permission to replay the prior action.

`stop-entry` requires the exact activation receipt and completed legacy fences. It durably writes `DISARMED`, disables the new unit without `--now`, stops only the exact new Web CID and reads it back. It works when new-business-write state is positive or unknown. Old boot stays fenced, old Web stays stopped, and all new database data, app containers, imports, receipts and source files remain. Its result is `NEW_ENTRY_STOPPED_NO_HTTP_MAINTENANCE_RESPONSE`; it does not provide an HTTP 503 page.

`restore-legacy` requires `observedCAS` **and** a fresh owner `writeBoundary` matching the deployment contract: closed write admission, exact build/source/database, numeric zero new business writes and no first write. It first disarms/stops the bound new entry, then restores only the original old Web restart policy and exact old unit enablement, removes only its own byte-matching drop-ins, and reloads definitions. It never starts the old Web or stops/starts the old services. Result: `LEGACY_BOOT_POLICY_RESTORED_NO_ENTRY_START`. C may then use the existing reviewed rollback owner to start the exact old Web while the zero-write boundary remains valid.

Original unit bytes, snapshots, all new data and every receipt remain retained. Original active/sub state is recorded but not restored with `systemctl start/stop`, because doing so could execute old Compose actions against the shared DB. New writes or unknown write state prohibit restoring the old boot policy or entry.

Partial fence/arm failures require this fresh observation. Safe stop or zero-write policy restoration is supported where its exact saved inputs exist. There is deliberately no generic “resume”, overwrite, auto-repair or blind retry switch. If a partial installation lacks required original snapshot bytes or has a foreign unit/drop-in, C must prepare a new narrow reconciliation with explicit current evidence. Do not rerun `fence`/`arm` over the partial directory.

This first takeover v1 does not replace an existing `naijue-rewrite-entry.service` or implement subsequent-release ownership migration. A later owner change needs its own reviewed exact transition.
