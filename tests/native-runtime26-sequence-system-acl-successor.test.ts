/** Protocol fakes/source guards only, never PG or genuine metadata authority.
 * Actual d001 PG17.11 proved old25true→sequence S/U31false and explicit seq
 * negative-column SELECT/grant-option. This suite is RED/GREEN source coverage,
 * not an after-PG successor/full137 issuer or ordinary Supplier result. */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as native from "../adapters/postgres/src/native-import-accounting-capability.ts";
const exports = native as unknown as Record<string, unknown>;
const hash = (x: string) => createHash("sha256").update(x).digest("hex");
const prior = [{"name": "NATIVE_RUNTIME26_COMPLETE_WRITE_ACL_V8_METADATA_PROBE", "bytes": 32541, "sha256": "2c41f71e48fbf78105a22ba84120295b46b919768da83a421cfa9af92836845d"}, {"name": "NATIVE_RUNTIME26_HISTORY_DRAFT_LINESET_METADATA_PROBE", "bytes": 32563, "sha256": "49a9c8224213f2523c6aa93ba593bd0077d66e6e0ad4781ec38b4d676fd6a5bb"}, {"name": "NATIVE_RUNTIME26_HV2_CATEGORY_FROM_V22_METADATA_PROBE", "bytes": 22002, "sha256": "1075218c4aef9d635f718b44dde4e68edd43545ffbe66fda7de7435889196cda"}, {"name": "NATIVE_RUNTIME26_HV2_HISTORY_SET_COMPLETE_MAINTENANCE_XMIN_FROM_V22_METADATA_PROBE", "bytes": 25212, "sha256": "5d634e368c5c6e37695d9b54aa480547677ac66e6c2984fa8d81983fc6c4620d"}, {"name": "NATIVE_RUNTIME26_HV2_HISTORY_SET_COMPLETE_WRITE_XMIN_FROM_V22_METADATA_PROBE", "bytes": 25244, "sha256": "2623a9972e326d304dace759badfcabc7e99775d19cc805a6af3bcccbbc4bc2d"}, {"name": "NATIVE_RUNTIME26_HV2_HISTORY_SET_FROM_V22_METADATA_PROBE", "bytes": 22210, "sha256": "d8cf9b3d92217efa6addaef6f116862bb0288d6e2f4e763fa991a9737b0d9659"}, {"name": "NATIVE_RUNTIME26_HV2_HISTORY_SET_MAINTENANCE_XMIN_FROM_V22_METADATA_PROBE", "bytes": 24983, "sha256": "e2817250d92d6080fbd7590151c1aa23fda5cde0c6a0039d593ee4cd543b2fb5"}, {"name": "NATIVE_RUNTIME26_HV2_HISTORY_SET_PREPARATION13_XMIN_FROM_V22_METADATA_PROBE", "bytes": 25011, "sha256": "99ab6d0a950bedcac190626da596475f6f7569eb8dda10e1a973ff3926c4662e"}, {"name": "NATIVE_RUNTIME26_HV2_HISTORY_SET_PREPARATION_XMIN_FROM_V22_METADATA_PROBE", "bytes": 24957, "sha256": "dd659e59cc45b63a6af8828b72c4c57f50170559622988fc1e6459171e9f3674"}, {"name": "NATIVE_RUNTIME26_HV2_HISTORY_SET_SOURCE_XMIN_FROM_V22_METADATA_PROBE", "bytes": 24055, "sha256": "855c0f447ceb0165497ce41ad663596e35d2185f12da5915e064a0738ef72da0"}, {"name": "NATIVE_RUNTIME26_HV2_RESPONSIBLE_NULL_FROM_V22_METADATA_PROBE", "bytes": 21792, "sha256": "64203974056b06ba72c950deefee570ffdb566be6b9c298816519052ba4e781c"}, {"name": "NATIVE_RUNTIME26_LIVE_LEDGER_PAIRS_V7_METADATA_PROBE", "bytes": 30081, "sha256": "e0ec5a9d40f3993e9495a819c6e3ee2e78217f606511220679551d98006bc2fe"}, {"name": "NATIVE_RUNTIME26_METADATA_PROBE", "bytes": 20801, "sha256": "131d6b3c43bc0fb56a9850a15c5de3febece3ece4e165cbfcca3d38537b6cba6"}, {"name": "NATIVE_RUNTIME26_RESPONSIBLE_NULL_SOURCE_XMIN_FROM_V22_METADATA_PROBE", "bytes": 23637, "sha256": "b2f2a971c29645fbab4e0a3dff30d0d1c2b45687667804c05e71f04ef7b0ea5a"}, {"name": "NATIVE_RUNTIME26_SOURCE_XMIN_FROM_V22_METADATA_PROBE", "bytes": 23637, "sha256": "7c4bcc73ee1e3622fb144e6f747966fdf3efeb8e6cf8605db240038e0e18bbdf"}, {"name": "NATIVE_RUNTIME26_V14_METADATA_PROBE", "bytes": 20908, "sha256": "936b16ef40609179483bc5d38c8064469c5a45be4ff612c7d7551672b06fc13a"}, {"name": "NATIVE_RUNTIME26_V15_METADATA_PROBE", "bytes": 21017, "sha256": "e0522f7ce987a5e684bd533298a4d530efbd44b31c937fcff29c68edfccf94a8"}, {"name": "NATIVE_RUNTIME26_V16_FROM_V14_METADATA_PROBE", "bytes": 21566, "sha256": "a15662e2f99f2e84b767113596d54614b621a84f709eafc886ea703ab5d0a789"}, {"name": "NATIVE_RUNTIME26_V16_FROM_V15_METADATA_PROBE", "bytes": 21675, "sha256": "be5a0facdc833794afd46e13112e85557e94356664c75cdbc032f52b00f7ac13"}, {"name": "NATIVE_RUNTIME26_V19_METADATA_PROBE", "bytes": 21792, "sha256": "02f55a22fdf616a2931909391837d676d88c88c70d2b0c9daa4d5904a1f5325b"}, {"name": "NATIVE_RUNTIME26_V20_METADATA_PROBE", "bytes": 21792, "sha256": "7ed4cbd3100e8a38bdacbefff258e0af6d5395d4ce675be37ef309ace47a7905"}, {"name": "NATIVE_RUNTIME26_V21_EFFECTIVE_VALUE_FROM_V16_V14_METADATA_PROBE", "bytes": 21566, "sha256": "f1493448a55ef5f08e3b4d82723842618e5ddc614de4cc5bfc91f71562eeb487"}, {"name": "NATIVE_RUNTIME26_V22_METADATA_PROBE", "bytes": 21792, "sha256": "f62b0f4fd8d8e06e9075ebf1d2f86bdd3829fb07400c29959bd8ee1731e8b900"}];
const newFormat = "EXACT26_RUNTIME_CATALOG_EXPORT_HISTORY_DRAFT_SEQUENCE_SYSTEM_V1";
const newPatch = "26_hv2_history_draft_sequence_system_acl_from_v1";
const newObservation = "HISTORY_DRAFT_SEQUENCE_SYSTEM_ACL_V1";
const newProbe = () => { const sql = exports.NATIVE_RUNTIME26_HISTORY_DRAFT_SEQUENCE_SYSTEM_METADATA_PROBE; assert.equal(typeof sql, "string"); return sql as string; };
const oldProbe = native.NATIVE_RUNTIME26_HISTORY_DRAFT_LINESET_METADATA_PROBE;
const floor = (sql: string) => sql.slice(sql.indexOf(" (pg_catalog.jsonb_array_length(manifest->'system_column_acls')=25"), sql.indexOf(" AS complete_write_system_acl_match_v8") + " AS complete_write_system_acl_match_v8".length);

test("all23 exported old metadata probes retain exact pre-successor bytes", () => {
 for (const row of prior) { const sql = exports[row.name]; assert.equal(typeof sql, "string"); assert.equal(Buffer.byteLength(sql as string), row.bytes); assert.equal(hash(sql as string), row.sha256, row.name); }
});
test("explicit successor changes format, not original25 ordinary floor or137 source-body checks", () => {
 const sql = newProbe(); assert.equal(exports.NATIVE_RUNTIME26_HISTORY_DRAFT_SEQUENCE_SYSTEM_FORMAT, newFormat);
 assert.equal(exports.NATIVE_RUNTIME26_HISTORY_DRAFT_SEQUENCE_SYSTEM_PATCH_LEVEL, newPatch);
 assert.ok(sql.includes("'format','" + newFormat + "'")); assert.equal(floor(sql), floor(oldProbe));
 assert.ok(sql.includes("a.attnum<0 AND NOT a.attisdropped AND r.relkind<>'S'"));
 assert.ok(sql.includes("pg_catalog.sha256(pg_catalog.convert_to((manifest-'identity')::text"));
 const pins = (s: string) => [...s.matchAll(/\('[a-z_]+','[a-f0-9]{64}'\)/g)].map(x => x[0]);
 assert.deepEqual(pins(sql), pins(oldProbe)); assert.ok(sql.includes("AS normal_delete_acl_match_v8")); assert.ok(sql.includes("AS recorded_live_balance_contract_match"));
});
test("all sequence negative attributes and every raw ACL grantee/option are exported even without effective rights", () => {
 const sql = newProbe(), start = sql.indexOf(" 'sequence_system_column_acls',"), end = sql.indexOf(" 'routines',", start);
 assert.ok(start > 0 && end > start); const part = sql.slice(start, end);
 for (const token of ["r.relkind='S'", "a.attnum<0", "a.attacl::text", "aclexplode(a.attacl)", "x.grantor", "x.grantee", "x.is_grantable", "r.relname", "r.relowner", "'kind',r.relkind"]) assert.ok(part.includes(token), token);
 assert.ok(!/WHERE[^]*has_column_privilege/.test(part), "No current-role/effective-rights row filter");
 assert.ok(!part.includes("WHERE x.grantee="), "No hidden foreign or PUBLIC grantees");
 assert.ok(sql.includes("AS sequence_system_raw_acl_match"));
 const predicate = sql.slice(sql.lastIndexOf(" (pg_catalog.jsonb_typeof(manifest->'sequence_system_column_acls')"), sql.indexOf(" AS sequence_system_raw_acl_match"));
 assert.ok(predicate.includes("jsonb_array_length(item->'privileges')<>0")); assert.ok(!predicate.includes("current_user"));
});
const target = { database: "SYNTHETIC_MICRO_PROTOCOL_ONLY", databaseOid: "123", actingRole: "synthetic_runtime", sessionUser: "synthetic_runtime", serverAddress: "127.0.0.1", serverPort: 55499, postmasterStart: "2026-11-01 00:00:00+00" };
const digest = "a".repeat(64);
function row(successor = true): Record<string, unknown> { return {
 identity: { database: target.database, database_oid: target.databaseOid, database_owner: "synthetic_owner", current_user: target.actingRole, session_user: target.sessionUser, server_version_num: "170011", server_addr: target.serverAddress, server_port: target.serverPort, postmaster_start: target.postmasterStart, replication_role: "origin" },
 migration_versions: Array.from({length:26},(_,i)=>i+1), catalog_sha256: digest, source_routines_match: true, recorded_live_balance_contract_match: true, complete_write_system_acl_match_v8: true, normal_delete_acl_match_v8: true,
 ...(successor ? {sequence_system_raw_acl_match:true} : {}) }; }
function fixture(successor = true, catalogOverride: Record<string, unknown> = {}) {
 const dir=mkdtempSync(join(tmpdir(),"sequence-successor-protocol-only-")), independent=join(dir,"fake-independent.json"), reviewFile=join(dir,"fake-review.json");
 const receipt=JSON.stringify({result:"PASS",notice:"SYNTHETIC_PROTOCOL_FAKE_NOT_INDEPENDENT_APPROVAL"}); writeFileSync(independent,receipt,{mode:0o600});
 const review={ version:"C_NATIVE_RUNTIME26_REVIEW_V1", decision:"ACCEPT_EXACT_RUNTIME26_TARGET_METADATA", target,
 catalog:{format:successor?newFormat:native.NATIVE_RUNTIME26_HISTORY_DRAFT_LINESET_FORMAT,patchLevel:successor?newPatch:native.NATIVE_RUNTIME26_HISTORY_DRAFT_LINESET_PATCH_LEVEL,sha256:digest,...catalogOverride},
 purposes:["PRODUCT_SEASONS_READ","PRODUCT_MAINTENANCE","CURRENT_CUSTOMER_READ_WRITE"],scope:"EXACT_TARGET_METADATA_ONLY",independentReview:{path:independent,sha256:hash(receipt),result:"PASS"},realImportExecutionAuthorized:false };
 const bytes=JSON.stringify(review);writeFileSync(reviewFile,bytes,{mode:0o600});
 return {options:{reviewFile,trustedReviewSha256:hash(bytes)},cleanup:()=>rmSync(dir,{recursive:true,force:true})};
}
function scripted(observed: Record<string,unknown>, probe: string) {
 let connects=0;const calls:string[]=[],releases:unknown[]=[];
 const pool={async connect(){connects++;return {async query(sql:string){calls.push(sql);return {rows:sql===probe?[structuredClone(observed)]:[],rowCount:sql===probe?1:0}},release(error?:unknown){releases.push(error)}}}};
 return {pool,calls,releases,connects:()=>connects};
}
function options(f: ReturnType<typeof fixture>, observation = newObservation) {return {...f.options,requiredObservation:observation} as Parameters<typeof native.createNativeRuntime26Issuer>[1];}

test("new profile is an explicit pinned selection on the original issuer and lease, never a fallback", async()=>{
 const f=fixture();try{const p=scripted(row(),newProbe()),issuer=await native.createNativeRuntime26Issuer(p.pool,options(f));assert.deepEqual(p.calls,[newProbe()]);
 const lease=await issuer.pool.connect();await issuer.runtime26.assertReady(lease,"PRODUCT_MAINTENANCE");assert.equal(p.calls.at(-1),newProbe());lease.release();assert.equal(p.connects(),2);
 }finally{f.cleanup()}
});
test("old profile remains accepted for old callers, and new observation refuses old metadata before borrow",async()=>{
 const f=fixture(false);try{const p=scripted(row(false),oldProbe);await native.createNativeRuntime26Issuer(p.pool,options(f,"HISTORY_DRAFT_TRANSFER_LINE_SET_FROM_V8"));assert.deepEqual(p.calls,[oldProbe]);
 const q=scripted(row(false),oldProbe);await assert.rejects(native.createNativeRuntime26Issuer(q.pool,options(f)),{code:"NATIVE_RUNTIME26_NOT_READY"});assert.equal(q.connects(),0);
 }finally{f.cleanup()}
});
test("mixed format/patch and unknown observation fail before any connection",async()=>{
 for(const override of [{format:native.NATIVE_RUNTIME26_HISTORY_DRAFT_LINESET_FORMAT},{patchLevel:native.NATIVE_RUNTIME26_HISTORY_DRAFT_LINESET_PATCH_LEVEL}]){const f=fixture(true,override);try{const p=scripted(row(),newProbe());await assert.rejects(native.createNativeRuntime26Issuer(p.pool,options(f)),{code:"NATIVE_RUNTIME26_NOT_READY"});assert.equal(p.connects(),0)}finally{f.cleanup()}}
 const f=fixture();try{const p=scripted(row(),newProbe());await assert.rejects(native.createNativeRuntime26Issuer(p.pool,options(f,"UNREVIEWED")),{code:"NATIVE_RUNTIME26_NOT_READY"});assert.equal(p.connects(),0)}finally{f.cleanup()}
});
test("new issuer refuses explicit sequence raw ACL signal, missing/typedfake/extra observation fields",async()=>{
 for(const value of [false,null,"true",0,undefined]){const f=fixture();try{const x=row();if(value===undefined)delete x.sequence_system_raw_acl_match;else x.sequence_system_raw_acl_match=value;
 const p=scripted(x,newProbe());await assert.rejects(native.createNativeRuntime26Issuer(p.pool,options(f)),{code:"NATIVE_RUNTIME26_NOT_READY"});assert.equal(p.connects(),1);assert.ok(p.releases[0] instanceof Error);
 }finally{f.cleanup()}}
 const f=fixture();try{const p=scripted({...row(),unreviewed:true},newProbe());await assert.rejects(native.createNativeRuntime26Issuer(p.pool,options(f)),{code:"NATIVE_RUNTIME26_NOT_READY"})}finally{f.cleanup()}
});
test("ordinary25/threeDELETE/recordedledger/source/digest/version/identity remain all mandatory",async()=>{
 const changes=[(x:Record<string,unknown>)=>x.complete_write_system_acl_match_v8=false,(x:Record<string,unknown>)=>x.normal_delete_acl_match_v8=false,(x:Record<string,unknown>)=>x.recorded_live_balance_contract_match=false,(x:Record<string,unknown>)=>x.source_routines_match=false,(x:Record<string,unknown>)=>x.catalog_sha256="b".repeat(64),(x:Record<string,unknown>)=>x.migration_versions=[1],(x:Record<string,unknown>)=>(x.identity as Record<string,unknown>).current_user="foreign"];
 for(const change of changes){const f=fixture();try{const x=row();change(x);const p=scripted(x,newProbe());await assert.rejects(native.createNativeRuntime26Issuer(p.pool,options(f)),{code:"NATIVE_RUNTIME26_NOT_READY"})}finally{f.cleanup()}}
});

test("old HISTORY consumer accepts explicitly reviewed successor but still sends only new probe",async()=>{
 const f=fixture();try{const p=scripted(row(),newProbe());
 const issuer=await native.createNativeRuntime26Issuer(p.pool,options(f,"HISTORY_DRAFT_TRANSFER_LINE_SET_FROM_V8"));
 assert.deepEqual(p.calls,[newProbe()]);assert.ok(!p.calls.includes(oldProbe));
 const lease=await issuer.pool.connect();await issuer.runtime26.assertReady(lease,"PRODUCT_MAINTENANCE");
 assert.equal(p.calls.at(-1),newProbe());lease.release();
 assert.equal(hash(newProbe()),"91e6bb912cc409e68f91be5123aae44667c8b7f3db109ffa5910cd8a641ec4ae");
 }finally{f.cleanup()}
});
test("old HISTORY ancestor requirement never bypasses the new raw sequence ACL proof",async()=>{
 const f=fixture();try{const x=row();x.sequence_system_raw_acl_match=false;const p=scripted(x,newProbe());
 await assert.rejects(native.createNativeRuntime26Issuer(p.pool,options(f,"HISTORY_DRAFT_TRANSFER_LINE_SET_FROM_V8")),{code:"NATIVE_RUNTIME26_NOT_READY"});
 assert.equal(p.connects(),1);assert.deepEqual(p.calls,[newProbe()]);assert.ok(p.releases[0] instanceof Error);
 }finally{f.cleanup()}
});
