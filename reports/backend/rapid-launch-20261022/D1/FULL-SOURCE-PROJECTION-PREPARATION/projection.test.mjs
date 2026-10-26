import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {assembleProjection,exportProjection26} from './export-projection.mjs';
import {columns,proofShape,memberSql,maintenanceSql} from './projection-sql.mjs';
const root='/Users/billy/Desktop/Workspace/project-007-业务管理系统/work/erp-local-source-20261022';
const {historyClosureProjectionRow26:project}=await import(pathToFileURL(root+'/packages/application/src/history-typed-closure.ts').href);
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const at='2026-01-01T00:00:00.000Z',hash='a'.repeat(64);
function shapeFixture(shape){if(typeof shape==='string'){if(shape.includes('string'))return 'SYNTHETIC_FIXTURE';if(shape==='number')return 1;if(shape==='boolean')return true;return null;}if(Array.isArray(shape))return [shapeFixture(shape[0])];return Object.fromEntries(Object.entries(shape).map(([k,v])=>[k,shapeFixture(v)]));}
function fixture(){
 const f={birth:{members:[]},members:[],warehouses:[],claims:[]};let n=1,staffIndex=0;
 for(const [entity,count]of [['HALL',22],['WAREHOUSE',22],['STAFF',49],['CUSTOMER',22]])for(let j=0;j<count;j++,n++){
  const m={sourceRowId:id(n),entity,sourceKey:`SYNTHETIC-${entity}-${j}`,nativeId:id(1000+n)};
  const snapshot=Object.fromEntries(columns[entity].map(k=>[k,k==='id'?m.nativeId:k==='version'?1:k==='enabled'?true:k.endsWith('_id')||k.endsWith('_at')||k==='contact'?null:k==='role'?'ADMIN':k==='employment_status'?'ACTIVE':`SYNTHETIC-${k}`]));
  const r={source_row_id:m.sourceRowId,entity_type:entity,source_key:m.sourceKey,native_id:m.nativeId,source_equal:true,birth_snapshot:snapshot,current_snapshot:structuredClone(snapshot),chain:{depth:0,operations:[],matches_current:true}};
  if(entity==='STAFF'){
   const p=shapeFixture(proofShape),a=p.raw.accounts[0];p.raw.staff.native_staff_id=m.nativeId;
   a.source_account_id=id(4000+n);a.source_account_version=1;a.native_snapshot={id:id(3000+n),staff_id:m.nativeId,login_enabled:true,auth_version:1,version:1,created_at:at,updated_at:at};
   const linked=staffIndex++<45;a.identity_link_kind=linked?'DIRECT_ORIGINAL_EMPLOYEE_V1':'APPROVED_CURRENT_PERSON_PLAN_V1';a.source_employee_native_id=linked?id(5000+n):null;a.source_employee_code=linked?'SYNTHETIC-CODE':null;a.current_person_key=linked?null:'SYNTHETIC-CURRENT';a.source_plan_row=linked?null:staffIndex;r.bootstrap_accounts=p;r.proof_link_ok=true;
  }
  f.birth.members.push(m);f.members.push(r);
  if(entity==='WAREHOUSE'){const w={source_row_id:m.sourceRowId,source_key:m.sourceKey,native_id:m.nativeId,row_sha256:hash,file_ref:'SYNTHETIC-FILE',source_equal:true,warehouse_record:{id:id(6000+n),reviewedAt:at,decisionReason:'SYNTHETIC-DECISION'}};f.warehouses.push(w);f.claims.push({import_record_id:w.warehouse_record.id,target_id:w.native_id,claim_ok:true});}
 }
 for(let k=0;k<31;k++)f.warehouses.push({source_row_id:id(8000+k),source_key:`SYNTHETIC-REMAINING-${k}`,native_id:id(9000+k),row_sha256:hash,file_ref:'SYNTHETIC-FILE',source_equal:true,warehouse_record:{id:id(10000+k),reviewedAt:at,decisionReason:'SYNTHETIC-DECISION'}});
 return f;
}
test('disabled input rejects before client access or source loading',async()=>{
 let accessed=false;await assert.rejects(exportProjection26({input:{executionEnabled:false},client:new Proxy({},{get(){accessed=true;throw Error('client accessed');}})}),/READ_PROJECTION_DISABLED/);assert.equal(accessed,false);
});
test('synthetic115/49/53 preserves exact originals and maintained version, authority remains pending',()=>{
 const f=fixture(),r=f.members[0];r.current_snapshot.version=2;r.current_snapshot.enabled=false;r.chain={depth:1,matches_current:true,operations:[{operationId:id(20000),fromVersion:1,toVersion:2}]};
 const out=assembleProjection(f,project);assert.equal(out.dataComplete,true);assert.deepEqual(out.missing,[]);assert.equal(out.coreMembers.length,115);assert.equal(out.staffProofs.length,49);assert.equal(out.warehouses.length,53);assert.equal(out.coreMaintenanceBinding.members[0].version,2);
 assert.deepEqual(out.staffProofs[0].bootstrapAccounts,f.members.find(r=>r.entity_type==='STAFF').bootstrap_accounts);assert.equal(out.publicationAuthorized,false);assert.equal(Object.hasOwn(out,'verify'),false);assert.equal(Object.hasOwn(out,'authorizedPayloadHash'),false);
});
test('unexpected proof secret refuses whole proof without redacted success',()=>{
 const f=fixture(),r=f.members.find(r=>r.entity_type==='STAFF');r.bootstrap_accounts.raw.accounts[0].native_snapshot.password_hash='POISON_MUST_NOT_LEAVE';const out=assembleProjection(f,project);
 assert.equal(out.dataComplete,false);assert.equal(out.staffProofs.length,48);assert.equal(JSON.stringify(out).includes('POISON_MUST_NOT_LEAVE'),false);assert(out.missing.some(x=>x.code==='ORIGINAL_SAFE_BOOTSTRAP_PROOF_MISSING'));
 assert(memberSql.includes("ELSE NULL END AS bootstrap_accounts"));assert(memberSql.includes("jsonb_typeof"));assert(maintenanceSql('STAFF').includes("-ARRAY['accounts','account_credentials']"));
});
test('missing31 warehouse evidence and broken version chain remain explicit missing, without generated IDs',()=>{
 const f=fixture();f.warehouses=f.warehouses.slice(0,22);f.members[0].chain.matches_current=false;const out=assembleProjection(f,project);
 assert.equal(out.dataComplete,false);assert.equal(out.warehouses.length,22);assert.equal(out.coreMaintenanceBinding.members.length,114);assert(out.missing.some(x=>x.code==='FULL_WAREHOUSE_53_ITEMS_MISSING_OR_OVERFLOW'));assert.equal(out.publicationAuthorized,false);
});
