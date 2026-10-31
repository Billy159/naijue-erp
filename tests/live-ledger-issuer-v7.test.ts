/** INACTIVE synthetic issuer protocol/source only. No real catalog, authority, PG, DDL, ACL, API or release proof. */
import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createHash} from "node:crypto";
import * as capability from "../adapters/postgres/src/native-import-accounting-capability.ts";
const level="26_hv2_live_ledger_pairs_complete_write_xmin_from_v22",format="EXACT26_RUNTIME_CATALOG_EXPORT_V7",digest="a".repeat(64);
const v6level="26_hv2_history_set_guards_complete_write_xmin_from_v22";
const sha=(s:string)=>createHash("sha256").update(s).digest("hex");
function featureProbe():string {
  const value=(capability as unknown as Record<string,unknown>).NATIVE_RUNTIME26_LIVE_LEDGER_PAIRS_V7_METADATA_PROBE;
  assert.equal(typeof value,"string","Missing exact137 recorded-pair issuer successor; immutable V6 is not ready for new schema");return value as string;
}
function fixture(settings:{catalogHash?:unknown;profile?:string;catalogFormat?:string;mutate?:(row:Record<string,unknown>)=>void;purposes?:string[]}={}) {
  const directory=mkdtempSync(join(tmpdir(),"naijue-live-issuer-v7-SYNTHETIC-")),independent=join(directory,"independent.json"),reviewFile=join(directory,"review.json");
  const receipt=JSON.stringify({result:"PASS",notice:"SYNTHETIC_UNIT_TEST_NOT_ACTUAL_APPROVAL_OR_PG_CATALOG"});writeFileSync(independent,receipt,{mode:0o600});
  const target={database:"SYNTHETIC_CLONE_NOT_CREATED",databaseOid:"123",actingRole:"synthetic_nonowner",sessionUser:"synthetic_nonowner",serverAddress:null,serverPort:null,postmasterStart:"2026-10-30 00:00:00+00"};
  const review={version:"C_NATIVE_RUNTIME26_REVIEW_V1",decision:"ACCEPT_EXACT_RUNTIME26_TARGET_METADATA",target,
    catalog:{format:settings.catalogFormat??format,sha256:Object.hasOwn(settings,"catalogHash")?settings.catalogHash:digest,patchLevel:settings.profile??level},
    purposes:settings.purposes??["INVENTORY_ADMISSION"],scope:"EXACT_TARGET_METADATA_ONLY",independentReview:{path:independent,sha256:sha(receipt),result:"PASS"},realImportExecutionAuthorized:false};
  const bytes=JSON.stringify(review);writeFileSync(reviewFile,bytes,{mode:0o600});const calls:string[]=[];let connects=0;
  const identity={database:target.database,database_oid:target.databaseOid,database_owner:"synthetic_owner",current_user:target.actingRole,session_user:target.sessionUser,
    server_version_num:"170011",server_addr:null,server_port:null,postmaster_start:target.postmasterStart,replication_role:"origin"};
  const pool={async connect(){connects++;return{async query(sql:string){calls.push(sql);
    if(sql===capability.NATIVE_RUNTIME26_IDENTITY_PROBE)return{rows:[{identity}],rowCount:1};
    const next=sql.includes(format),row:Record<string,unknown>={identity,migration_versions:Array.from({length:26},(_,i)=>i+1),catalog_sha256:digest,
      source_routines_match:next,complete_write_xmin_acl_match:true,...(next?{recorded_live_balance_contract_match:true}:{})};
    settings.mutate?.(row);return{rows:[row],rowCount:1};},release(){}};}};
  return{pool,calls,connects:()=>connects,options:{reviewFile,trustedReviewSha256:sha(bytes)},cleanup:()=>rmSync(directory,{recursive:true,force:true})};
}
test("LIVE layer5 RED issuer source: exact137 V7 derives from immutable135 V6 and pins both reviewed new bodies",()=>{
  const next=featureProbe(),old=capability.NATIVE_RUNTIME26_HV2_HISTORY_SET_COMPLETE_WRITE_XMIN_FROM_V22_METADATA_PROBE;
  assert.match(old,/jsonb_array_length\(manifest->'routines'\)=135/);assert.ok(old.includes("'format','EXACT26_RUNTIME_CATALOG_EXPORT_V6'"));assert.ok(!old.includes("guard_recorded_live_balance_pair"));
  assert.match(next,/jsonb_array_length\(manifest->'routines'\)=137/);assert.ok(next.includes("'format','"+format+"'"));
  const pins=(s:string)=>new Map([...s.matchAll(/\('([a-z_][a-z0-9_]*)','([a-f0-9]{64})'\)/g)].map(m=>[m[1]!,m[2]!]));const before=pins(old),after=pins(next);
  assert.equal(before.size,135);assert.equal(after.size,137);for(const[name,hash]of before)assert.equal(after.get(name),hash);
  const sql=readFileSync(new URL("../adapters/postgres/patches/0026-live-ledger-balance-pairs.sql",import.meta.url),"utf8");
  const bodies=[...sql.matchAll(/CREATE FUNCTION naijue_erp\.(\w+)\(\).*?AS (\$[a-z_]+\$)(.*?)\2;/gs)];assert.equal(bodies.length,2);
  for(const m of bodies)assert.equal(after.get(m[1]!),sha(m[3]!));
  assert.ok(next.includes("AS complete_write_xmin_acl_match"));assert.ok(next.includes("AS recorded_live_balance_contract_match"));
  for(const fragment of ["ledger_recorded_balance_pair","zz_live_ledger_balance_snapshot","recorded_live_balance_final_consistency","privilege.privilege_type NOT IN ('SELECT','INSERT')","NOT a.attnotnull","pg_catalog.pg_attrdef"])
    assert.ok(next.includes(fragment),fragment);
  assert.doesNotMatch(next,/^\s*(?:GRANT|REVOKE|ALTER|CREATE|UPDATE|INSERT|DELETE|TRUNCATE)\b/im);
});
test("LIVE layer5 RED issuer: distinct V7 reviewed protocol selects exact new proof, without legacy fallback or extra purpose",async()=>{
  const f=fixture();try{const issuer=await capability.createNativeRuntime26Issuer(f.pool,f.options),client=await issuer.pool.connect();
    await issuer.runtime26.assertReady(client,"INVENTORY_ADMISSION");assert.ok(f.calls.length>=3);assert.ok(f.calls.every(sql=>sql===featureProbe()));
    const n=f.calls.length;await assert.rejects(issuer.runtime26.assertReady(client,"HISTORY_REVISION"),{code:"NATIVE_RUNTIME26_NOT_READY"});assert.equal(f.calls.length,n);client.release();
  }finally{f.cleanup();}
});
test("LIVE layer5 hold: unresolved actual catalog slot is rejected before pool acquisition, never defaulted to a synthetic or old digest",async()=>{
  for(const catalogHash of [null,undefined,"","PENDING_ACTUAL_PG_CANONICAL_EXPORT"]){const f=fixture({catalogHash});try{
    await assert.rejects(capability.createNativeRuntime26Issuer(f.pool,f.options),{code:"NATIVE_RUNTIME26_NOT_READY"});assert.equal(f.connects(),0);assert.deepEqual(f.calls,[]);
  }finally{f.cleanup();}}
});
test("LIVE layer5 fail closed: missing/nonboolean pair or inherited xmin proof, catalog/source/target/versions drift rejects",async()=>{
  const changes:((row:Record<string,unknown>)=>void)[]=[r=>{delete r.recorded_live_balance_contract_match;},r=>{r.recorded_live_balance_contract_match=false;},r=>{r.recorded_live_balance_contract_match="true";},
    r=>{delete r.complete_write_xmin_acl_match;},r=>{r.complete_write_xmin_acl_match=false;},r=>{r.source_routines_match=false;},r=>{r.catalog_sha256="b".repeat(64);},
    r=>{r.migration_versions=Array.from({length:27},(_,i)=>i+1);},r=>{r.identity={...(r.identity as object),database_oid:"124"};},r=>{r.unreviewedExtra=true;}];
  for(const mutate of changes){const f=fixture({mutate});try{await assert.rejects(capability.createNativeRuntime26Issuer(f.pool,f.options),{code:"NATIVE_RUNTIME26_NOT_READY"});}finally{f.cleanup();}}
});
test("LIVE layer5 fail closed: old V6 rejects synthetic137 source-proof failure, and V7 with old format never queries",async()=>{
  const old=fixture({profile:v6level,catalogFormat:"EXACT26_RUNTIME_CATALOG_EXPORT_V6"});try{await assert.rejects(capability.createNativeRuntime26Issuer(old.pool,old.options),{code:"NATIVE_RUNTIME26_NOT_READY"});
    assert.ok(old.calls.every(sql=>sql===capability.NATIVE_RUNTIME26_HV2_HISTORY_SET_COMPLETE_WRITE_XMIN_FROM_V22_METADATA_PROBE));
  }finally{old.cleanup();}
  const mixed=fixture({catalogFormat:"EXACT26_RUNTIME_CATALOG_EXPORT_V6"});try{await assert.rejects(capability.createNativeRuntime26Issuer(mixed.pool,mixed.options),{code:"NATIVE_RUNTIME26_NOT_READY"});assert.equal(mixed.connects(),0);}finally{mixed.cleanup();}
});

test("LIVE layer5 RED issuer source: V7 retains the exact23 xmin and complete canonical ACL/trigger/constraint/role envelope",()=>{
  const next=featureProbe(),tables=capability.NATIVE_RUNTIME26_COMPLETE_WRITE_XMIN_TABLES;
  assert.equal(tables.length,23);assert.deepEqual([...tables].sort(),tables);assert.ok(tables.includes('history_revision'));
  assert.ok(next.includes("jsonb_array_length(manifest->'system_column_acls')=23"));
  assert.ok(next.includes(`ARRAY[${tables.map(t=>`'${t}'`).join(',')}]::text[]`));
  for(const unchanged of ["item->>'number'='-2'","item->>'name'='xmin'","item->>'type'='xid'","item->'runtime_select'='true'::jsonb",
    "item->'table_select'='false'::jsonb","privilege->>'grantee'=current_user::text)=1","privilege->>'grantor'=item->>'owner'",
    "privilege->'grantable'='false'::jsonb","privilege->>'grantee'='PUBLIC'","c.relkind IN ('r','p','v','m','S')",
    "'roles'","'memberships'","'columns'","'constraints'","pg_catalog.pg_get_constraintdef(c.oid,true)",
    "'triggers'","pg_catalog.pg_get_triggerdef(t.oid,true)","'definition_sha256'","(manifest-'identity')::text"])
    assert.ok(next.includes(unchanged),unchanged);
  assert.ok(!next.includes('AS complete_maintenance_xmin_acl_match'));
});
test("LIVE layer5 RED issuer source: exact pair ACL is two non-grantable owner-granted SELECT+INSERT cells, never UPDATE or table grants",()=>{
  const next=featureProbe();
  for(const required of ["a.atttypid='pg_catalog.int8'::regtype","NOT a.attnotnull","a.attidentity=''","a.attgenerated=''",
    "pg_catalog.pg_attrdef","has_column_privilege(current_user,r.oid,a.attnum,'SELECT')","has_column_privilege(current_user,r.oid,a.attnum,'INSERT')",
    "NOT pg_catalog.has_column_privilege(current_user,r.oid,a.attnum,'UPDATE')","NOT pg_catalog.has_column_privilege(current_user,r.oid,a.attnum,'REFERENCES')",
    "(SELECT count(*) FROM pg_catalog.aclexplode(a.attacl))=2","privilege.grantee IS DISTINCT FROM",
    "privilege.grantor<>r.relowner","privilege.privilege_type NOT IN ('SELECT','INSERT')","privilege.is_grantable",
    ...['SELECT','INSERT','UPDATE','DELETE','TRUNCATE'].map(p=>`NOT pg_catalog.has_table_privilege(current_user,r.oid,'${p}')`)])
    assert.ok(next.includes(required),required);
  assert.doesNotMatch(next,/^\s*(?:GRANT|REVOKE|ALTER|CREATE|UPDATE|INSERT|DELETE|TRUNCATE)\b/im);
});
test("LIVE layer5 RED issuer source: exact new private invoker-trigger shape is required independently of new routine-body pins",()=>{
  const next=featureProbe();
  for(const required of ["'guard_recorded_live_balance_pair',7,false,false","'validate_recorded_live_balance_commit',21,true,true",
    "t.tgenabled='O'","NOT t.tgisinternal","t.tgnargs=0","t.tgqual IS NULL","t.tgattr=''::pg_catalog.int2vector",
    "t.tgoldtable IS NULL","t.tgnewtable IS NULL","t.tgconstrrelid=0","required.is_deferrable OR t.tgconstraint=0",
    "p.prokind='f'","p.prorettype='pg_catalog.trigger'::regtype","NOT p.proretset","p.pronargs=0","NOT p.prosecdef",
    "NOT p.proleakproof","NOT p.proisstrict","p.provolatile='v'","p.proparallel='u'","cardinality(p.proconfig)=1",
    "'search_path=pg_catalog,naijue_erp'","privilege.grantee<>p.proowner"])
    assert.ok(next.includes(required),required);
});
test("LIVE layer5 RED issuer: all V1-V6 format/profile cross-borrowing and unknown successor spellings reject before pool acquisition",async()=>{
  const legacy=[
    ['EXACT26_RUNTIME_CATALOG_EXPORT_V1','26_hv2_history_set_guards_from_v22'],
    ['EXACT26_RUNTIME_CATALOG_EXPORT_V2','26_hv2_history_set_guards_source_xmin_from_v22'],
    ['EXACT26_RUNTIME_CATALOG_EXPORT_V3','26_hv2_history_set_guards_maintenance_xmin_from_v22'],
    ['EXACT26_RUNTIME_CATALOG_EXPORT_V4','26_hv2_history_set_guards_preparation_xmin_from_v22'],
    ['EXACT26_RUNTIME_CATALOG_EXPORT_V5','26_hv2_history_set_guards_complete_maintenance_xmin_from_v22'],
    ['EXACT26_RUNTIME_CATALOG_EXPORT_V6',v6level],
  ];
  for(const [oldFormat,oldProfile]of legacy)for(const options of [{catalogFormat:oldFormat!,profile:level},{catalogFormat:format,profile:oldProfile!}]){
    const f=fixture(options);try{await assert.rejects(capability.createNativeRuntime26Issuer(f.pool,f.options),{code:'NATIVE_RUNTIME26_NOT_READY'});assert.equal(f.connects(),0);assert.deepEqual(f.calls,[]);}finally{f.cleanup();}
  }
  for(const options of [{catalogFormat:'EXACT26_RUNTIME_CATALOG_EXPORT_V8'},{profile:level+'_future'},{profile:level.toUpperCase()}]){
    const f=fixture(options);try{await assert.rejects(capability.createNativeRuntime26Issuer(f.pool,f.options),{code:'NATIVE_RUNTIME26_NOT_READY'});assert.equal(f.connects(),0);}finally{f.cleanup();}
  }
});
test("LIVE layer5 RED issuer: later pair-proof drift poisons original lease and denies COMMIT; only rollback/discard remains",async()=>{
  let changed=false;const f=fixture({mutate:r=>{if(changed)r.recorded_live_balance_contract_match=false;}});
  try{const issuer=await capability.createNativeRuntime26Issuer(f.pool,f.options),client=await issuer.pool.connect();
    changed=true;await assert.rejects(issuer.runtime26.assertReady(client,'INVENTORY_ADMISSION'),{code:'NATIVE_RUNTIME26_NOT_READY'});
    const n=f.calls.length;await assert.rejects(client.query('COMMIT'),{code:'NATIVE_RUNTIME26_NOT_READY'});assert.equal(f.calls.length,n);
    await client.query('ROLLBACK');assert.equal(f.calls.at(-1),'ROLLBACK');client.release();
    await assert.rejects(issuer.pool.connect(),{code:'NATIVE_RUNTIME26_NOT_READY'});
  }finally{f.cleanup();}
});
test("LIVE layer5 RED issuer: API managed baseline performs full V7 proof before exposure then existing identity-only lease checks",async()=>{
  const f=fixture();try{
    const issuer=await capability.createNativeRuntime26Issuer(f.pool,{...f.options,verificationProfile:'DEPLOYMENT_BASELINE_REQUEST_IDENTITY_V1'});
    assert.deepEqual(f.calls,[featureProbe()]);const client=await issuer.pool.connect();await issuer.runtime26.assertReady(client,'INVENTORY_ADMISSION');client.release();
    assert.deepEqual(f.calls,[featureProbe(),capability.NATIVE_RUNTIME26_IDENTITY_PROBE,capability.NATIVE_RUNTIME26_IDENTITY_PROBE]);
    // Unchanged managed-baseline contract: no claim of detecting uncoordinated DDL/ACL while an old application remains alive.
  }finally{f.cleanup();}
});

test("LIVE layer5 hold no new purpose or blanket command authority is inferred from V7",async()=>{
  for(const purposes of [['INVENTORY_ADMISSION','LIVE_LEDGER_PAIR_WRITE'],['INVENTORY_ADMISSION','INVENTORY_ADMISSION'],[]]){
    const f=fixture({purposes});try{await assert.rejects(capability.createNativeRuntime26Issuer(f.pool,f.options),{code:'NATIVE_RUNTIME26_NOT_READY'});assert.equal(f.connects(),0);assert.deepEqual(f.calls,[]);}finally{f.cleanup();}
  }
});
