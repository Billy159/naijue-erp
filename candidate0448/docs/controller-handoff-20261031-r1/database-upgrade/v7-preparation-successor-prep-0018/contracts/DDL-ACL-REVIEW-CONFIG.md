# Exact source contract / no execution authority

All source refs are relative to immutable `recovery/staff-admission-worktree-2334`.

## DDL: exact bytes, not a rewritten approximation

`adapters/postgres/patches/0026-live-ledger-balance-pairs.sql`
SHA256 `41c491cca5f04cc19d15f0c05113cfb3c81fa39a648a5dc349874ba52ef588c9`.
- 5–25: transaction; migration versions exactly1..26, routines135, original ledger17 columns and original body pins. No V6 exact135 check may be moved after DDL137.
- 27–39: nullable bigint `quantity_before`, `quantity_after`, validated `ledger_recorded_balance_pair` CHECK. Pair both NULL for old/historical rows remains unknown, never zero/backfill; live pair difference equals quantity_delta using numeric arithmetic.
- 41–70: private SECURITY INVOKER `guard_recorded_live_balance_pair()`; BEFORE INSERT `zz_live_ledger_balance_snapshot` on inventory_ledger.
- 74–109: private SECURITY INVOKER `validate_recorded_live_balance_commit()`; AFTER INSERT OR UPDATE `recorded_live_balance_final_consistency` on inventory_balance, DEFERRABLE INITIALLY DEFERRED. COMMIT is required to establish final closure.
- 110–111: exact REVOKE ALL of the two new functions FROM PUBLIC. These reducing revokes are part of patch, not optional.
- No GRANT, UPDATE, default, backfill, original routine replacement, or schema_migration27.

Renderer accepts only exact pinned patch bytes; removes only its outer BEGIN/COMMIT to put unchanged body inside one guarded transaction. Existing V6 renderer and old probes remain unmodified.

## Delta ACL: four cells, not716 and not STAFF

| Table | Column | Privilege |
|---|---|---|
|inventory_ledger|quantity_before|SELECT|
|inventory_ledger|quantity_after|SELECT|
|inventory_ledger|quantity_before|INSERT|
|inventory_ledger|quantity_after|INSERT|

Exactly two column GRANTs by fixed NOLOGIN owner, to distinct ordinary LOGIN NOINHERIT runtime. No WITH GRANT OPTION, table grants, new private EXECUTE, schema CREATE, roles, credentials, HBA, CONNECT, sequence permissions, business writes, or staff/account creation. Preserve exact23 xmin and all independently reviewed predecessor ACLs. V7 probe requires each pair column exactly two direct ACL entries, only this runtime as grantee, owner as grantor, SELECT/INSERT non-grantable; UPDATE/REFERENCES/table rights prohibited. Owner/schema/routine ownership and target/window checked pre/post. Actual before/after catalog hashes also bind all non-delta objects and ACLs; no hidden union.

## V7 proof / ordinary login

`adapters/postgres/src/native-import-accounting-capability.ts:649–707` derives exact137 V7 from unchanged135 V6; retains23 xmin proof. Source pins for new bodies are `58700e3775442434c910b94fa66110d0880189c530bf7fdd839131f1ca8ad63e` and `b32828510d3b85ae04c9d3849bcc494abe3cf337f0908996d72142fc171fb523`.

Exact metadata keys: identity,migration_versions,catalog_sha256,source_routines_match,complete_write_xmin_acl_match,recorded_live_balance_contract_match. Require versions1..26, all three proof booleans true, hash equal independent review, exact identity target. No omitted/null/extra fields, old profile fallback, or unresolved digest.

Fresh-runtime review existing closed schema (`:828–868`):
- version=`C_NATIVE_RUNTIME26_REVIEW_V1`; decision=`ACCEPT_EXACT_RUNTIME26_TARGET_METADATA`; scope=`EXACT_TARGET_METADATA_ONLY`; realImportExecutionAuthorized=false.
- target exact keys database,databaseOid,actingRole,sessionUser,serverAddress,serverPort,postmasterStart. Both actingRole/sessionUser must name actual ordinary login for this workflow.
- catalog exact keys format=`EXACT26_RUNTIME_CATALOG_EXPORT_V7`, patchLevel=`26_hv2_live_ledger_pairs_complete_write_xmin_from_v22`,sha256=actual canonical PG digest.
- purposes finite exact selected graph requirements, existing allowed purpose names only. No new LIVE_LEDGER_PAIR_WRITE purpose or blanket command authority.
- independentReview exact keys path(absolute),sha256(external bytes),result=PASS.
- top-level exact keys version,decision,target,catalog,purposes,scope,independentReview,realImportExecutionAuthorized. NO expiresAt. Private no-follow bounded file pins and later identity/byte checks stay unchanged.

The preparation renderer requires external approval bytes/hash and independently checked sourceCommit argument. Its own startsAt/expiresAt do NOT modify issuer review. Flags explicitly retain ordinaryRuntimeReviewStillRequired/runtimeWindowStillRequired.

## Config/release closure

`apps/api/src/postgres-read-api.ts:592–605`: every non-CORE graph compiles `requiredObservation: RECORDED_LIVE_LEDGER_PAIRS_V7`; do not bypass through CORE/legacy selection. Managed baseline does full V7 check at startup then existing per-request identity checks; no claim of detecting arbitrary DDL during an old running pool. Stop/dispose old graph before baseline DDL/ACL change; create a fresh issuer afterward.

`generate-release-contract.mjs:29–40,60–65`, config/release-contract.json: retain original V1/V6 names; select finite `recorded-live-ledger-v7` descriptor with format/patchLevel above, aclProofField=complete_write_xmin_acl_match, observationProofField=recorded_live_balance_contract_match,requiredObservation=RECORDED_LIVE_LEDGER_PAIRS_V7,runtimeSqlPatch=adapters/postgres/patches/0026-live-ledger-balance-pairs.sql. V7 patch packaged last after original11; packaging NEVER executes it.

Private runtime configuration must bind fresh runtime26Review.reviewFile/trustedReviewSha256, exact database/runtime connection and final source/build/dependency/driver graph, selected module options and original capacity admission. No credentials or real connection strings in this packet. `deploy-candidate.py:403–419,612–665` binds V7 distinct profile and exact metadata/target. The reviewed deployment helper pin must remain `4620ca2f1672e18991644a2da5398633eae19d75cb60057245590ebe2e3f8b25`; changed helper requires independent reapproval, never hash rewriting to pass. This prep makes no release helper change and no deployment request.

## STAFF selection is a separate prerequisite, not a V7 grant bundle

`apps/api/src/staff-create-read-permission-admission.ts:7–510`: floor91 existing cells,100 with linked account; NOT91 extra grants. Both historical716/713 lack staff INSERT(id,name,role,hall_id,contact,employment_status,version), SELECT(staff.contact,staff.version,user_account.version,user_account.created_at,user_account.updated_at), plus optional user_account INSERT(id,staff_id,login_name,login_enabled,auth_version,version,created_at,updated_at,password_hash). Both also lack hall INSERT6 and warehouse INSERT6 from organization-maintenance-store.ts:69–76. All are source inventory only, not complete route recipes or authority.

Minimal existing-SKU LIVE workflow can omit staffMaintenance AND staffCredentialRequestKeyFile/credential capability. Setting staffMaintenance=false is invalid; presence must be true (`production-provider-composition.ts:154–159,183–192,267–269`). Label explicitly **STAFF off / no STAFF CREATE / no linked-account creation / not all buttons / not full-app acceptance / no basic-create completeness**. Selecting STAFF requires separate exact final-graph ACL/no-excess independent review,91/100 read-only admission and ADMIN policy; keep read-first check before route exposure. No silent716/713/basic-create union. Historical713 and716 are different limited service/UI scopes, not universal ERP ACLs.

## Explicit graph/config choices, never an automatic downgrade

For separately approved **minimal existing-SKU SALES/TRANSFER** validation, use the original R2 factory/config contract `createProductionRuntime26R2ApplicationApi` / profile=`source-confirmed-native-exact26-r2-v1`, documentCommands=`NATIVE_RUNTIME`. Supply original independently proven `existingPreparation.sales/transfers` booleans; these selectors do not themselves prove preparation. Base admission needs exactly the chosen existing purposes `PRODUCT_SEASONS_READ`, `CURRENT_CUSTOMER_READ_WRITE`, `CURRENT_FORM_READ`, `HISTORY_READ`, `INVENTORY_ADMISSION`; selecting maintenance/history adds its existing purpose requirements, never invented names. The proposed minimal STAFF-off graph omits all unapproved optional maintenance selectors; presence=false is not a substitute. R2 has no staffCredentialRequestKeyFile/media field. This remains a labelled limited workflow, not a production/full-app release.

For explicitly selected full graph, retain original R3 configuration and original full factory/history provider, exact independently reviewed module selection, media and optional private credential bindings plus all required purposes (full release helper requires the base5 plus PRODUCT_MAINTENANCE,HISTORY_REVISION). STAFF selection cannot be silently dropped to make716 fit. Neither its name 'full' nor V7 descriptor means missing basic-create rights exist. Release helper and root authority decide exact selected flow; this packet supplies requirements, not a valid runtime JSON or enabled graph.
