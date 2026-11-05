/** Offline synthetic issuer protocol only; these files/rows are NOT real review,
 * actual PostgreSQL catalog, permission installation or business acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createSyntheticV8Fixture} from './support/live-ledger-api-v8-fixtures.ts';
import {createSyntheticV7Fixture} from './support/live-ledger-api-v7-fixtures.ts';
import {
 createNativeRuntime26Issuer, NATIVE_RUNTIME26_COMPLETE_WRITE_ACL_V8_METADATA_PROBE as V8,
 NATIVE_RUNTIME26_LIVE_LEDGER_PAIRS_V7_METADATA_PROBE as V7,
 NATIVE_RUNTIME26_COMPLETE_WRITE_XMIN_TABLES, NATIVE_RUNTIME26_CATEGORY_CMIN_TABLES,
 NATIVE_RUNTIME26_NORMAL_DELETE_TABLES,
} from '../adapters/postgres/src/native-import-accounting-capability.ts';
const requiredObservation='RECORDED_LIVE_LEDGER_PAIRS_COMPLETE_WRITE_V8' as const;
function fixture(mutate?: (r:Record<string,unknown>)=>void) {
 const f=createSyntheticV8Fixture({database:'SYNTHETIC_NOT_CREATED',user:'synthetic_runtime'});
 const calls:string[]=[];let connects=0;
 const pool={async connect(){connects++;return {async query(sql:string){calls.push(sql);if(sql==='ROLLBACK')return {rows:[],rowCount:0};const r=f.query(sql);assert.ok(r,'Unknown protocol SQL must never default to success');
  const rows=r.rows.map(x=>({...x}));if(sql===V8)mutate?.(rows[0]!);return {...r,rows};},release(){}};}};
 return {...f,pool,calls,connects:()=>connects};
}
test('V8 is source-only137 with original V7 bodies and balance proof; old V7 remains23 xmin',()=>{
 assert.match(V8,/jsonb_array_length\(manifest->'routines'\)=137/);
 const pins=(s:string)=>[...s.matchAll(/\('([a-z_][a-z0-9_]*)','([a-f0-9]{64})'\)/g)].map(m=>m[0]);
 assert.deepEqual(pins(V8),pins(V7));assert.equal(pins(V8).length,137);
 assert.ok(V8.includes('AS recorded_live_balance_contract_match'));assert.ok(!V8.includes('AS complete_write_xmin_acl_match'));
 assert.ok(V7.includes("jsonb_array_length(manifest->'system_column_acls')=23"));assert.ok(V7.includes("a.attnum=-2 AND a.attname='xmin'"));
 assert.doesNotMatch(V8,/^\s*(?:GRANT|REVOKE|ALTER|CREATE|UPDATE|INSERT|DELETE|TRUNCATE)\b/im);
});
test('V8 exports exact25 system cells including cid cmin and observes unexpected effective INSERT/UPDATE/REFERENCES',()=>{
 assert.equal(NATIVE_RUNTIME26_COMPLETE_WRITE_XMIN_TABLES.length,23);
 assert.deepEqual(NATIVE_RUNTIME26_CATEGORY_CMIN_TABLES,['audit_change','product_category']);
 assert.ok(V8.includes('a.attnum<0 AND NOT a.attisdropped'));
 for(const p of ['SELECT','INSERT','UPDATE','REFERENCES'])assert.ok(V8.includes(`pg_catalog.has_column_privilege(current_user,r.oid,a.attnum,'${p}')`));
 for(const fragment of ["jsonb_array_length(manifest->'system_column_acls')=25","'audit_change.cmin'","'product_category.cmin'","item->>'type'='cid'","item->>'number'='-3'","x->>'grantor'=item->>'owner'","x->'grantable'='false'::jsonb","x->>'grantee'='PUBLIC'","AS complete_write_system_acl_match_v8"])
  assert.ok(V8.includes(fragment),fragment);
});
test('V8 permits only three original DELETE tables with exact owner runtime non-grantable rights',()=>{
 assert.deepEqual(NATIVE_RUNTIME26_NORMAL_DELETE_TABLES,['payment_account_hall','product_image','sales_settlement']);
 for(const fragment of ["p.privilege='DELETE' AND r.relname IN('payment_account_hall','product_image','sales_settlement')","r.relkind IN('r','p','v','m','f')","x.grantor=r.relowner AND x.privilege_type='DELETE' AND NOT x.is_grantable","x.grantee=0","x.privilege_type<>'DELETE'","AS normal_delete_acl_match_v8"])
  assert.ok(V8.includes(fragment),fragment);
});
test('genuine issuer protocol selects V8 exact proof envelope and managed baseline identity path',async()=>{
 const f=fixture();try{
  const issuer=await createNativeRuntime26Issuer(f.pool,{...f.review,requiredObservation,verificationProfile:'DEPLOYMENT_BASELINE_REQUEST_IDENTITY_V1'});
  assert.deepEqual(f.calls,[V8]);const c=await issuer.pool.connect();await issuer.runtime26.assertReady(c,'INVENTORY_ADMISSION');c.release();
  assert.equal(f.calls.filter(q=>q===V8).length,1);assert.ok(f.calls.length>1);
 }finally{f.cleanup();}
});
test('V8 rejects missing/false/nonboolean system/delete/balance proof, old proof alias, extra fields and drift',async()=>{
 const changes:Array<(r:Record<string,unknown>)=>void>=[];
 for(const key of ['complete_write_system_acl_match_v8','normal_delete_acl_match_v8','recorded_live_balance_contract_match'])
  for(const value of [undefined,false,'true'])changes.push(r=>{if(value===undefined)delete r[key];else r[key]=value;});
 changes.push(r=>{r.complete_write_xmin_acl_match=true;},r=>{r.source_routines_match=false;},r=>{r.catalog_sha256='0'.repeat(64);});
 for(const change of changes){const f=fixture(change);try{await assert.rejects(createNativeRuntime26Issuer(f.pool,{...f.review,requiredObservation}),{code:'NATIVE_RUNTIME26_NOT_READY'});}finally{f.cleanup();}}
});
test('old genuine V7 remains usable by legacy issuer, but cannot satisfy new V8 consumer before acquisition',async()=>{
 const f=createSyntheticV7Fixture({database:'SYNTHETIC_NOT_CREATED',user:'synthetic_runtime'});let connects=0;
 const pool={async connect(){connects++;return {async query(sql:string){const r=f.query(sql);assert.ok(r);return r;},release(){}};}};
 try{
  await assert.rejects(createNativeRuntime26Issuer(pool,{...f.review,requiredObservation}),{code:'NATIVE_RUNTIME26_NOT_READY'});assert.equal(connects,0);
  const old=await createNativeRuntime26Issuer(pool,f.review);const c=await old.pool.connect();await old.runtime26.assertReady(c,'INVENTORY_ADMISSION');c.release();assert.ok(connects>0);
 }finally{f.cleanup();}
});
test('later V8 permission-proof drift revokes before COMMIT and permits only rollback/discard',async()=>{
 let changed=false;const f=fixture(r=>{if(changed)r.normal_delete_acl_match_v8=false;});
 try{const issuer=await createNativeRuntime26Issuer(f.pool,{...f.review,requiredObservation}),c=await issuer.pool.connect();changed=true;
  await assert.rejects(issuer.runtime26.assertReady(c,'INVENTORY_ADMISSION'),{code:'NATIVE_RUNTIME26_NOT_READY'});
  const n=f.calls.length;await assert.rejects(c.query('COMMIT'));assert.equal(f.calls.length,n);await c.query('ROLLBACK');assert.equal(f.calls.at(-1),'ROLLBACK');c.release();
  assert.ok(!f.calls.includes('COMMIT'));
 }finally{f.cleanup();}
});
