import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,realpath,writeFile,readFile,rm,symlink} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createHash} from 'node:crypto';
import {IMPORT_V2_TABLES} from '../../packages/application/src/import-v2-contract.ts';
import {prepareNativePartyImportChunk} from '../../packages/application/src/native-party-import.ts';
import {openReviewedPartySource26} from './native-party-source26.mjs';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,H='a'.repeat(64),payload='b'.repeat(64),sha=b=>createHash('sha256').update(b).digest('hex');
function syntheticBootstrapProjection(){return {async verify(){},async enhanceStaff(original){const input=structuredClone(original);input.source.fieldProvenance.fields.bootstrap_accounts={origin:'MIGRATION_DERIVED',reason:'SYNTHETIC proof shape only, no execution authority',evidence_ref:H,raw:{
 version:'NATIVE_BOOTSTRAP_ACCOUNTS_PROOF_V1',profile:'EXACT26',binding:{batch_id:input.batchId,fixed_source_namespace:input.fixedSourceNamespace,selection_sha256:input.selection.selectionSha256,authorized_payload_sha256:payload,stage_command_sha256:H,operation_id:id(9000),actor_account_id:id(9001)},
 authority:{account_capture_sha256:H,account_decisions_sha256:H,identity_review_sha256:H,bootstrap_execution_review_sha256:H,source_identity_facts_sha256:H,approved_employee_plan_sha256:H,old_source_batch_id:'SYNTHETIC',old_source_manifest_sha256:H},expected_counts:{accounts:49,direct_original_employee_links:45,approved_current_person_links:4},staff:{source_row_id:input.source.id,source_key:input.source.sourceKey,source_row_sha256:input.source.rowSha256,native_staff_id:input.nativeSnapshot.id},accounts:[{source_account_id:'SYNTHETIC-account',source_account_version:1,source_employee_native_id:'SYNTHETIC-staff',source_employee_code:'001',identity_link_kind:'DIRECT_ORIGINAL_EMPLOYEE_V1',current_person_key:null,source_plan_row:null,native_snapshot:{id:id(9002),staff_id:input.nativeSnapshot.id,login_enabled:false,auth_version:1,version:1,created_at:'2026-10-24T00:00:00.000Z',updated_at:'2026-10-24T00:00:00.000Z'}}]}};return input;}};}
async function fixture(t){
 const directory=await mkdtemp(join(await realpath(tmpdir()),'synthetic-party-source26-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const binding={batchId:id(1),fixedSourceNamespace:'synthetic.party26',cutoffAt:'2026-10-04T12:00:00+08:00',selectionSha256:H};
 const entities=['CUSTOMER','SUPPLIER','HALL','WAREHOUSE','STAFF'],nativeIds=Object.fromEntries(entities.map((e,i)=>[e,id(100+i)])),sourceKeys=Object.fromEntries(entities.map(e=>[e,'SYNTHETIC-'+e]));
 const rows=entities.map((entity,i)=>{
  const table=IMPORT_V2_TABLES.find(t=>t.entity===entity),fields=Object.fromEntries(table.columns.map(c=>[c.name,'']));fields.来源编号=sourceKeys[entity];let nativeSnapshot,bindings={},enumMappings;
  if(['CUSTOMER','SUPPLIER'].includes(entity)){Object.assign(fields,{原编码:' 0001 ',名称:'SYNTHETIC '+entity,状态:'原停用'});nativeSnapshot={id:nativeIds[entity],code:fields.原编码,name:fields.名称,enabled:false,version:1,created_at:null,updated_at:null};enumMappings={状态:{raw:fields.状态,native:false,evidenceRef:'SYNTHETIC-state'}};}
  else if(entity==='HALL'){Object.assign(fields,{厅名称:'SYNTHETIC HALL',默认客户来源编号:sourceKeys.CUSTOMER,默认销货仓来源编号:sourceKeys.WAREHOUSE,状态:'原正常'});nativeSnapshot={id:nativeIds.HALL,name:fields.厅名称,default_customer_id:nativeIds.CUSTOMER,default_sales_warehouse_id:nativeIds.WAREHOUSE,enabled:true,version:1};bindings={默认客户来源编号:{sourceKey:sourceKeys.CUSTOMER,nativeId:nativeIds.CUSTOMER},默认销货仓来源编号:{sourceKey:sourceKeys.WAREHOUSE,nativeId:nativeIds.WAREHOUSE}};enumMappings={状态:{raw:fields.状态,native:true,evidenceRef:'SYNTHETIC-state'}};}
  else if(entity==='WAREHOUSE'){Object.assign(fields,{仓库名称:'SYNTHETIC WAREHOUSE',所属厅来源编号:sourceKeys.HALL,状态:'原正常',切换范围:'本次完整核准'});nativeSnapshot={id:nativeIds.WAREHOUSE,name:fields.仓库名称,hall_id:nativeIds.HALL,enabled:true,version:1};bindings={所属厅来源编号:{sourceKey:sourceKeys.HALL,nativeId:nativeIds.HALL}};enumMappings={状态:{raw:fields.状态,native:true,evidenceRef:'SYNTHETIC-state'}};}
  else{Object.assign(fields,{姓名:'SYNTHETIC STAFF',角色:'原营业员',任职状态:'原离职',联系方式:'001234',所属厅来源编号:sourceKeys.HALL});nativeSnapshot={id:nativeIds.STAFF,name:fields.姓名,hall_id:nativeIds.HALL,role:'SALESPERSON',contact:fields.联系方式,employment_status:'LEFT',version:1};bindings={所属厅来源编号:{sourceKey:sourceKeys.HALL,nativeId:nativeIds.HALL}};enumMappings={角色:{raw:fields.角色,native:'SALESPERSON',evidenceRef:'SYNTHETIC-role'},任职状态:{raw:fields.任职状态,native:'LEFT',evidenceRef:'SYNTHETIC-employment'}};}
  return {batchId:binding.batchId,fixedSourceNamespace:binding.fixedSourceNamespace,selection:{entity,source:'BASE_V2',path:table.file,baseManifestSha256:H,selectionSha256:H,approvalSha256:H,csvSha256:H},source:{id:id(1000+i),batchId:binding.batchId,entityType:entity,sourceKey:sourceKeys[entity],fileRef:'SYNTHETIC.xlsx',sheet:entity,rowNo:'2',sourceFileSha256:H,rowSha256:H,rawFields:{...fields},normalizedFields:fields,fieldProvenance:{schema_version:1,fields:{}}},nativeSnapshot,bindings,enumMappings,...(entity==='WAREHOUSE'?{warehouseRecord:{id:id(2000),reviewedAt:'2026-10-21T13:00:00.000Z',decisionReason:'SYNTHETIC_WH'}}:{})};
 });
 const manifestPath=join(directory,'review-candidate-manifest.json'),reviewFile=join(directory,'C-review.json'),componentPath=join(directory,'party-reference-candidates.json');
 const manifest={version:'NATIVE_BINDING_REVIEW_CANDIDATE_V1',...binding,parties:rows.length,files:[]},review={version:'C_NATIVE_BINDING_PARTIAL_REVIEW_PIN_V1',decision:'ACCEPT_EXACT_QB_REVIEWED_PARTIAL_ARTIFACT_SCOPE',binding,manifestSha256:null,manifestBytes:0,closedToUnreviewedComponents:true,realNativeCommandsOrImportAuthorizedByThisPinAlone:false,components:[]};
 async function save(){const cb=Buffer.from(JSON.stringify(rows));await writeFile(componentPath,cb);manifest.parties=rows.length;manifest.files=[{name:'party-reference-candidates.json',sha256:sha(cb),bytes:cb.length},{name:'native-identity-registry.json',sha256:H,bytes:103890023}];const mb=Buffer.from(JSON.stringify(manifest));await writeFile(manifestPath,mb);review.manifestSha256=sha(mb);review.manifestBytes=mb.length;review.components=[{component:'party-reference-candidates.json',sha256:sha(cb),scope:'SYNTHETIC ordinary mapping only'}];const rb=Buffer.from(JSON.stringify(review));await writeFile(reviewFile,rb);return {binding,authorizedPayloadHash:payload,source:{directory,trustedManifestSha256:sha(mb),reviewRecordFile:reviewFile,trustedReviewRecordSha256:sha(rb)},historical:null,chunkRows:1};}
 return {directory,rows,manifest,review,componentPath,manifestPath,reviewFile,save,options:await save()};
}
test('partySource26 ordinary reviewed rows preserve the hall/warehouse cycle, original facts and complete typed/source closure without registry reads',async t=>{
 const f=await fixture(t),original=await readFile(f.componentPath),r=await openReviewedPartySource26(f.options);t.after(()=>r.close());const chunks=[];
 for await(const chunk of r.chunks()){await r.authorize(chunk);chunks.push(chunk);}assert.equal(chunks.length,4);assert.equal(chunks.find(c=>c.rows.some(r=>r.entity==='HALL')).rows.length,2);
 assert.equal(r.report.rows,5);assert.equal(r.report.executionAuthorized,false);assert.equal(r.report.bootstrapAccountsCovered,false);assert.equal(r.report.counts.STAFF,1);
 const prepared=chunks.flatMap(c=>c.rows);assert.ok(prepared.every(r=>r.input.schemaProfile==='EXACT26'));assert.equal(prepared.find(r=>r.entity==='WAREHOUSE').nativeSnapshot.created_operation_id,null);
 assert.equal(prepared.find(r=>r.entity==='CUSTOMER').nativeSnapshot.code,' 0001 ');assert.equal(prepared.find(r=>r.entity==='CUSTOMER').nativeSnapshot.created_at,null);assert.deepEqual(await readFile(f.componentPath),original);
 const session=await r.openClosure({...f.options.binding,authorizedPayloadHash:payload},{group:'PARTIES',signal:new AbortController().signal}),source=[],typed=[];
 for await(const row of session.sourceRows())source.push(row);for await(const row of session.typedRows())typed.push(row);
 assert.equal(source.length,5);assert.equal(typed.length,13);assert.equal(new Set(typed.map(r=>r.relation+'\0'+r.key)).size,13);assert.equal(Object.keys(typed.find(r=>r.relation==='warehouse').projection).length,6);
 assert.equal(typed.filter(r=>r.relation==='native_party_import_evidence').length,5);assert.ok(typed.every(r=>!r.relation.includes('account')));await session.close();await assert.rejects(session.verify(),/CLOSED/);
});
test('partySource26 bootstrap shared projection: exact dependency closure and later PARTIES/typed source use the same enhanced STAFF',async t=>{
 const f=await fixture(t),r=await openReviewedPartySource26(f.options);t.after(()=>r.close());
 const before=await r.bootstrapPartyClosure('SYNTHETIC-STAFF');assert.equal(before.chunk.rows.length,4);await r.authorizePartyChunk(before.chunk);
 await r.bindBootstrapAccounts(syntheticBootstrapProjection());assert.equal(r.report.bootstrapAccountsCovered,true);
 const after=await r.bootstrapPartyClosure('SYNTHETIC-STAFF');await r.authorizePartyChunk(after.chunk);await assert.rejects(r.authorizePartyChunk(before.chunk),/ROW_CHANGED/);
 const chunks=[];for await(const chunk of r.chunks())chunks.push(chunk);const staff=chunks.flatMap(c=>c.rows).find(row=>row.entity==='STAFF');
 assert.deepEqual(staff.input,after.chunk.rows.find(row=>row.entity==='STAFF').input);assert.ok(staff.input.source.fieldProvenance.fields.bootstrap_accounts);
 const session=await r.openClosure({...f.options.binding,authorizedPayloadHash:payload},{group:'PARTIES',signal:new AbortController().signal}),sources=[],typed=[];
 for await(const row of session.sourceRows())sources.push(row);for await(const row of session.typedRows())typed.push(row);
 const source=sources.find(row=>row.projection.entity_type==='STAFF').projection;
 const evidence=typed.find(row=>row.relation==='native_party_import_evidence'&&row.projection.entity_type==='STAFF').projection;
 assert.deepEqual(evidence.source_snapshot,source);assert.ok(JSON.stringify(source.field_provenance).includes('NATIVE_BOOTSTRAP_ACCOUNTS_PROOF_V1'));await session.close();
});
test('partySource26 bootstrap shared projection: cannot change original STAFF identity or rebind after chunk exposure',async t=>{
 const f=await fixture(t),r=await openReviewedPartySource26(f.options);t.after(()=>r.close());const projection=syntheticBootstrapProjection(),enhance=projection.enhanceStaff;
 projection.enhanceStaff=async input=>{const changed=await enhance(input);changed.nativeSnapshot.name='SYNTHETIC substituted name';return changed;};
 await assert.rejects(r.bindBootstrapAccounts(projection),/HISTORY_HEADER_REFERENCE_NATIVE_FIELDS|PARTY_SOURCE26_BOOTSTRAP_SOURCE_CHANGED/);
 for await(const chunk of r.chunks())assert.ok(chunk.rows.length>0);
 await assert.rejects(r.bindBootstrapAccounts(syntheticBootstrapProjection()),/BOOTSTRAP_BINDING/);
});
test('partySource26 requires exact outside review and cannot substitute identity49 or self-declared bootstrap metadata',async t=>{
 const f=await fixture(t);await assert.rejects(openReviewedPartySource26({...f.options,source:{...f.options.source,trustedReviewRecordSha256:undefined}}),/OUTSIDE_PIN/);
 f.review.realNativeCommandsOrImportAuthorizedByThisPinAlone=true;await assert.rejects(openReviewedPartySource26(await f.save()),/COMPONENT_REVIEW/);f.review.realNativeCommandsOrImportAuthorizedByThisPinAlone=false;
 f.rows.find(r=>r.source.entityType==='STAFF').source.fieldProvenance.fields.bootstrap_accounts={arbitrary:'not independently authorized'};await assert.rejects(openReviewedPartySource26(await f.save()),/BOOTSTRAP_NOT_COVERED/);
 let gets=0;const options={...f.options};Object.defineProperty(options,'historical',{enumerable:true,get(){gets++;return null;}});await assert.rejects(openReviewedPartySource26(options),/OPTIONS/);assert.equal(gets,0);
});
test('partySource26 rejects cross-chunk identity/code/position collisions, omitted relationships and mutated native targets',async t=>{
 const f=await fixture(t),duplicate=structuredClone(f.rows[0]);duplicate.source.id=id(9000);duplicate.nativeSnapshot.id=id(9001);duplicate.source.sourceKey=duplicate.source.rawFields.来源编号=duplicate.source.normalizedFields.来源编号='SYNTHETIC-CUSTOMER-2';duplicate.source.rowNo='3';f.rows.push(duplicate);
 await assert.rejects(openReviewedPartySource26(await f.save()),/GLOBAL_DUPLICATE_CODE/);f.rows.pop();f.rows.splice(f.rows.findIndex(r=>r.source.entityType==='HALL'),1);await assert.rejects(openReviewedPartySource26(await f.save()),/RELATION/);
 const g=await fixture(t),r=await openReviewedPartySource26(g.options);t.after(()=>r.close());const input=structuredClone(g.rows[0]);input.schemaProfile='EXACT26';input.nativeSnapshot.id=id(9090);await assert.rejects(r.authorize(prepareNativePartyImportChunk([input])),/NOT_AUTHORIZED/);
 const mutable=(await r.chunks().next()).value,pending=r.authorize(mutable);mutable.rows[0].nativeSnapshot.name='LATE';await assert.rejects(pending,/INPUT_CHANGED/);
});
test('partySource26 null actual MAIN hash stays closed, file or symlink changes revoke, and close owns retained readers',async t=>{
 const f=await fixture(t),r=await openReviewedPartySource26({...f.options,authorizedPayloadHash:null});t.after(()=>r.close());await assert.rejects(r.openClosure({...f.options.binding,authorizedPayloadHash:payload},{group:'PARTIES',signal:new AbortController().signal}),/CLOSURE_SCOPE/);
 await writeFile(f.componentPath,'[]');await assert.rejects(r.verify(),/FILE_CHANGED/);await r.close();await assert.rejects(r.chunks().next(),/CLOSED/);
 const g=await fixture(t),link=join(g.directory,'linked-party.json');await symlink(g.componentPath,link);await rm(g.componentPath);await symlink(link,g.componentPath);await assert.rejects(openReviewedPartySource26(g.options),/REGULAR/);
});
