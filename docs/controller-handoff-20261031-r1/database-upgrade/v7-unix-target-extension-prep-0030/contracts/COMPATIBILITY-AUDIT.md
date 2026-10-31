# Operational compatibility audit — source + historical receipt only

All app source refs are under immutable `recovery/staff-admission-worktree-2334` (HEAD6a85f14b1b3b18f0c72f40d36d9bbece448f9140). No current DB/config/credential inspection occurred.

## 1. Existing contracts support authenticated Unix ordinary-login

| Layer | Source evidence | Result |
|---|---|---|
|Canonical metadata|adapters/postgres/src/native-import-accounting-capability.ts:218–222,267|Records inet address/port as actual JSON null; canonical catalog SHA excludes identity but still includes role closure.|
|Issuer review|same:831–836|Closed target schema accepts serverAddress=null,serverPort=null. Not an implicit TCP selector.|
|V7 proof|same:649–707,895–913|V7 adds exact137/19cols/pair ACL+guards; no TCP condition. Runtime identity equals separately reviewed null target exactly.|
|Driver/config|adapters/postgres/src/bounded-pool.ts:97–116,143;apps/api/src/production-provider-composition.ts:70–76|Explicit nonempty host,numericport,ssl:false accepted; passes host/port unchanged. Nonempty password field is STILL required even for peer. No parser relaxation or secret read/generation follows.|
|Pinned pg driver|node_modules/pg/lib/connection-parameters.js:116–117;client.js:178–181|Host beginning '/' is Unix-domain socket; connects to host+'/.s.PGSQL.'+port. Numeric config port is socket filename selector, not observed inet port.|
|Capacity|apps/api/src/capacity-runtime-probe.ts:73–76,112–114,155–156;production-capacity-launch.ts:139–149|Exact host/port/database/role/DBOID/postmaster checks, no TCP-only assumption. Must bind same explicit socket host/configuredport; no capacity bypass.|
|Frozen0018 prep|recovery/v7-preparation-successor-prep-0018/02-implementation/scripts/release/prepare-runtime26-v7.mjs:38–40|Hardcoded127.0.0.1/32 plus numeric inet port. Rejects Unix null identity. Keep frozen; do not null-out guard.|

Issuer review schema remains unchanged: `target.serverAddress/serverPort=null` for an actual Unix connection. Do not insert socket path/configuredport/transport/expiry into its closed keys. Those extra operational bindings live in this separately reviewed preparation target and original owner controller receipt. Prep admin SET ROLE hashes still cannot substitute genuine fresh ordinary-login V7 hash.

## 2. R6 gives historical ordinary Unix evidence, not live authority

Historical base directory:
`recovery/pg-access-resume-prep/next-real-pg-resume-ten-v6g-1139/frozen-20261030T153238022000Z/`.

- `runtime-metadata-observation-current-minimum712.UNREVIEWED/ORIGINAL-PROBE-OBSERVATION.json`: actual identity database=naijue_erp_test_dot26_empty_20261030,OID19147,current_user=session_user=dot26_runtime_20261029,server_addr=null,server_port=null,origin,server_version_num170011,postmaster_start2026-10-30 15:25:02.100677+09. source_routines_match=true and complete_write_xmin_acl_match=true; V6 canonical digest0ec5678e8837dbf42c73bebb6c38a3ba29bffc31bbd440304edebbd8062c3e58.
- `independent-current-v6-runtime-review/RUNTIME26-712-V6-CURRENT-FIVE-PURPOSE.EXACT-SCHEMA.REVIEW.json`: existing closed issuer target uses both inet fields null and same ordinary role. It is V6, not admissible V7 for new API.
- `collect-current-v6-runtime-metadata.CANDIDATE.mjs:13`: source fixes socket host `/workspace/scratch/f6bee04e937b/pg-test-env/runtime/socket`,configuredport55439 and ordinaryrole. `run-security-setup...sh:13` / cleanup:12 use same fixed Unix psql target, no TCP.
- `DERIVED-SETUP-CLEANUP.INDEPENDENT-TECHNICAL-REVIEW-1533.json`: accepted source mechanics only, explicitly no user consent; fixed owner Unix socket and finite deadline, grant before peer apply, fail/unknown classification/no automatic retry.
- `R6-TERMINAL-CLEANUP.ACTUAL-INDEPENDENT-ACCEPTANCE-1545.json`: historical result PASS_SCOPED_CHAIN_AND_TERMINAL_CLEANUP; access ZERO_AND_OWNER_ONLY_BASE_AUTH_RESTORED; currentConfigurationWindowClosed=true,noNewRuntimePhaseAuthorizedByThisReview=true; databaseDaemon=PRESERVED_RUNNING. Its checklist identifies **PID71425**, not port71425.
- `readonly-refresh-20261030T1529/TEN-SESSION-ZERO.NATIVE.json`: historical owner identity same null inet, datadir.../runtime/data,systemIdentifier7702072410986206828. These values are historical observations, never fresh current pins.
- Historical source identity guard in `grant-ten-minimum712.CANDIDATE.sql:3` also fixed listenAddresses empty and single socketDirectories path, fsync/synchronousCommit on. This is guard source, not a new observation. This audit did not inspect current pg_hba/pg_ident/postgresql.conf or process state.

Do not replay R6 databaseOID19147, roles, grants712, old peer bytes, deadlines or approval references. Do not mutate retained19147/16466/p2, stop/restart old daemon, or infer V7 from old receipt.

## 3. Important production release-carrier exception

`deploy-candidate.py:808–813` forces runtime target.host='naijue-prod-db-1',port5432 and an owned private config with nonempty password. `provision-database.py:6–8,13–24` targets production Docker host/container and fixed database/roles; its code creates password material. It is NOT a suitable Unix synthetic provisioner and MUST NOT be run for this audit/test target. No provisioner password path was evaluated.

Therefore original app composition plus source-only synthetic host fixture can support Unix, but this does not make the current production deploy/provision carrier portable. Preserve helpers and reviewed hash. Changing/repinning production carrier requires separate exact scope; not needed to validate original app/service/UI on an approved isolated synthetic Unix target.

## 4. Recommendation and isolation alternatives

**Preferred bounded next design following root direction:** retain old daemon Unix-only, create a genuinely blank new synthetic DB under separately approved logical isolation and exact role/access plan, then strict Unix preparation/ordinary-login admission. No TCP is technically required. Root must expressly define and evidence this as a new isolated *database/environment on shared infrastructure*, not a new cluster. Roles/HBA/ident, postmaster, owner authority and resource failure domain remain shared; protect every existing DB/role/config baseline. New role creation vs reuse and no-cross-DB access are explicit unresolved approval choices, not inferred.

If user acceptance requires a genuinely new *cluster* rather than new blank DB, create a separately owned new cluster/datadir/socket/process. **It can also be Unix-only.** Neither V7 issuer nor app requires loopbackTCP. This fixed existing-socket proposal does NOT authorize arbitrary new path: review a new exact profile for that cluster. Avoid enabling TCP/restarting/rebinding71425 merely to make0018 fit.

LoopbackTCP is only an optional separately approved design (new fixed cluster/listener/authentication+teardown), not a compatibility necessity. Do not silently broaden HBA to host/all/trust or generate credentials. No path here is authorized or executed.
