import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {EventEmitter} from 'node:events';
import '../tools/unified-import/stream-plan.mjs';
import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {createSyntheticPackage,repinSyntheticPackage} from './fixtures/unified-import/synthetic-package.ts';
import {createSyntheticBaselineScopeApproval} from './fixtures/unified-import/baseline-scope-synthetic.ts';
import {closeExplicitZeroApproval,explicitZeroApprovalCount} from '../packages/application/src/unified-explicit-zero-approval.ts';
import {compileStandardWholePackageProfile} from '../packages/application/src/unified-import-whole-package-profile.ts';
import {stableImportId} from '../packages/application/src/inventory-cutoff-import.ts';
import {sha256} from '../packages/application/src/unified-import-contract.ts';
import {NODE_SCRYPT_DUMMY_HASH} from '../packages/authentication/src/passwords.ts';
import {withReviewedWholeSession} from '../tools/unified-import/whole-host-session.mjs';
const url=new URL('../tools/unified-import/whole-host-session.mjs',import.meta.url),text=await readFile(url,'utf8');
const source=text.replace(/(['"])(\.\.?\/[^'"\n]+)\1/g,(_,q,path)=>JSON.stringify(new URL(path,url).href))+"\nexport function compactWireModel(client,reviewed,target,work,verify,options){return runWholeSession(client,{},reviewed,target,work,verify,'FRESH35_COMPACT_ZERO_V2',true,options);}";
// The real private state machine is evaluated; only native wire/catalog input
// is synthetic. This data-URL module is never a production physical factory.
const modeledSource=source+"\nexport function baselineWireModel(client,reviewed,target,work,verify,options,profile='FRESH35_COMPACT_ZERO_V2'){return runWholeSession(client,{},reviewed,target,work,verify,profile,true,options);}";
const api=await import('data:text/javascript;base64,'+Buffer.from(modeledSource).toString('base64'));
const target={protocol:'STANDARD_IMPORT_SQL_V1',system_identifier:'123',database_oid:'42',database_name:'SYNTHETIC_ONLY',catalog_sha256:'a'.repeat(64)};
function client(){let status='I';const c=new EventEmitter();Object.assign(c,{calls:[],closes:0,connection:new EventEmitter(),readyForQuery:true,_queryable:true,_ending:false,pipeline:false,_activeQuery:null,_queryQueue:[],_sentQueryQueue:[],getTransactionStatus:()=>status,async query(sql){c.calls.push(sql);if(sql.startsWith('BEGIN')){status='T';return{command:'BEGIN'}}if(sql==='COMMIT'||sql==='ROLLBACK'){status='I';return{command:sql}}return{command:'SELECT',rows:[]}},async end(){c.closes++}});return c;}
test('actual compact wire branch reaches work, retains original import SQL and closes its only synthetic client',async()=>{
 const c=client(),authorized=[];let gated=false,worked=false;const inspect='SELECT naijue_erp.standard_whole_package_inspect_v2($1::jsonb,$2::text)::text AS result_json';
 const result=await api.compactWireModel(c,target,target,async controlled=>{worked=true;assert.ok(gated);await controlled.query('BEGIN ISOLATION LEVEL READ COMMITTED');await controlled.query(inspect,[JSON.stringify({payload:{}}),'SYNTHETIC_PRIVATE']);await controlled.query('COMMIT');return{state:'SYNTHETIC_ONLY'}},async()=>{gated=true;return{}},{fresh35ExpiresAt:Date.now()+60000,authorizedQuery:async sql=>authorized.push(sql)});
 assert.ok(worked);assert.equal(result.result.state,'SYNTHETIC_ONLY');assert.equal(result.cleanup,'CLOSED');assert.equal(c.closes,1);assert.deepEqual(authorized,['BEGIN ISOLATION LEVEL READ COMMITTED',inspect,'COMMIT']);assert.equal(c.calls.filter(x=>x===inspect).length,1);
});
test('compact profile does not widen SQL, grant setup access or admit an untrusted generic factory',async()=>{
 for(const forbidden of ['SELECT 1','SELECT naijue_erp.standard_admin_provision_only_v1($1::jsonb,$2::text)::text AS result_json']){const c=client();await api.compactWireModel(c,target,target,async controlled=>{await controlled.query('BEGIN ISOLATION LEVEL READ COMMITTED');await assert.rejects(controlled.query(forbidden),/WHOLE_SQL_NOT_ALLOWED/);await controlled.query('ROLLBACK')},async()=>({}),{fresh35ExpiresAt:Date.now()+60000,authorizedQuery:async()=>{}});assert.equal(c.calls.includes(forbidden),false);assert.equal(c.closes,1);}
 const c=client();await assert.rejects(withReviewedWholeSession(c,{},target,target,async()=>{},async()=>({}),'FRESH35_COMPACT_ZERO_V2',{authorizedQuery:async()=>{},fresh35ExpiresAt:Date.now()+60000}),/FIXED_PHYSICAL_AUTHORIZED_HOST_REQUIRED/);assert.deepEqual(c.calls,[]);const unknown=client();await assert.rejects(withReviewedWholeSession(unknown,{},target,target,async()=>{},async()=>({}),'FRESH35_UNKNOWN'),/WHOLE_HOST_PROFILE_INVALID/);assert.deepEqual(unknown.calls,[]);assert.equal(unknown.closes,1);
});

test('QB F01: actual private wire keeps the real zero-row baseline descriptor in compiled inspect/prepare/verify requests',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'baseline-wire-')),pkg=createSyntheticPackage();let scope;
 try{pkg.records.inventory_baseline=pkg.records.inventory_baseline.filter(r=>r.fields.quantity!=='0');pkg.reports['reconciliation.json'].tables.inventory_baseline={source_rows:1,retained_rows:1,rejected_rows:0};repinSyntheticPackage(pkg);
  scope=await createSyntheticBaselineScopeApproval(pkg,dir);assert.equal(explicitZeroApprovalCount(scope),0);
  const manifestBytes=Buffer.from(JSON.stringify(pkg.manifest,null,2)+'\n'),program=compileStandardWholePackageProfile({pkg,manifestBytes,expectedManifestSha256:sha256(manifestBytes),allowSynthetic:true,target,explicitZeroApproval:scope,initialization_identity:{staff_id:stableImportId('SYNTHETIC_BASELINE_WIRE','staff'),account_id:stableImportId('SYNTHETIC_BASELINE_WIRE','account'),login_name:'synthetic',staff_name:'SYNTHETIC baseline'}});
  assert.equal(program.initialize.payload.explicit_zero_approval.format_version,'INVENTORY_BASELINE_SCOPE_V1');
  const sqls=['inspect','prepare','verify'].map(name=>`SELECT naijue_erp.standard_whole_package_${name}_v2($1::jsonb,$2::text)::text AS result_json`);
  for(const bad of [false,true]){const c=client(),authorized=[];
   const request=structuredClone(program.initialize);if(bad)delete request.payload.explicit_zero_approval;
   const run=()=>api.baselineWireModel(c,target,target,async controlled=>{await controlled.query('BEGIN ISOLATION LEVEL READ COMMITTED');
    try{for(const sql of sqls)await controlled.query(sql,[JSON.stringify(request),NODE_SCRYPT_DUMMY_HASH]);}finally{await controlled.query('ROLLBACK');}
    return {state:'SOURCE_WIRE_MODEL_ONLY'};
   },async()=>({}),{explicitZeroApproval:scope,fresh35ExpiresAt:Date.now()+60000,authorizedQuery:async sql=>authorized.push(sql)});
   if(bad){await assert.rejects(run(),/EXPLICIT_ZERO_APPROVAL_BINDING_INVALID/);assert.ok(sqls.every(sql=>!c.calls.includes(sql)));}
   else{const r=await run();assert.equal(r.cleanup,'CLOSED');for(const sql of sqls){assert.ok(c.calls.includes(sql));assert.ok(authorized.includes(sql));}}
   assert.equal(c.closes,1);
  }
  for(const profile of ['FRESH35_A53_ADMIN154_V1','FRESH35_RETIRED152_V1','WHOLE_SALES_V1']){const c=client();await assert.rejects(api.baselineWireModel(c,target,target,async()=>{assert.fail('wrong profile entered work');},async()=>({}),{explicitZeroApproval:scope,fresh35ExpiresAt:Date.now()+60000,authorizedQuery:async()=>{}},profile),/COMPACT_ZERO_EXPLICIT_HOST_PROFILE_REQUIRED/);assert.equal(c.closes,1);assert.deepEqual(c.calls,[]);}
 }finally{closeExplicitZeroApproval(scope);await rm(dir,{recursive:true,force:true});}
});
