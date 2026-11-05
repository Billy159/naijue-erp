import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,dirname} from 'node:path';
import {createSyntheticPackage,repinSyntheticPackage} from './fixtures/unified-import/synthetic-package.ts';
import {validateUnifiedPackage,sha256,HISTORICAL_SALES_HALL_SOURCE_SCHEMA_DECLARATIONS_SHA256,SCHEMA_DECLARATIONS_SHA256} from '../packages/application/src/unified-import-contract.ts';
import {buildHistoricalSalesHallEvidence,readHistoricalSalesHallApproval} from '../packages/application/src/unified-historical-sales-hall-evidence.ts';
import {streamPreflight} from '../tools/unified-import/stream-preflight.mjs';
import {buildUnifiedImportPlan} from '../packages/application/src/unified-import-execution.ts';
import {prepareStreamPlan} from '../tools/unified-import/stream-plan.mjs';
import {streamDocumentRequests} from '../tools/unified-import/stream-document-requests.mjs';
function fixture({pending=false,strict=true}={}){
 const p=createSyntheticPackage(),h=p.records.sales_header[0],w=p.records.warehouse[0];
 if(strict){p.manifest.schema_contract.source_declarations_sha256=HISTORICAL_SALES_HALL_SOURCE_SCHEMA_DECLARATIONS_SHA256;for(const r of p.records.staff)r.fields.departure_date=null;}
 const evidence=buildHistoricalSalesHallEvidence({originalHallId:null,warehouseId:w.fields.id,warehouseHallId:pending?null:w.fields.hall_id,warehouseVersion:pending?null:w.fields.version,capturedAt:pending?null:'2026-11-05T03:00:00Z'});
 h.historical_hall_evidence=evidence;h.fields.hall_id=evidence.selected_hall_id;repinSyntheticPackage(p);
 const raw={format_version:'HISTORICAL_SALES_HALL_APPROVAL_V1',source_namespace:p.manifest.source_namespace,evidence_sha256:p.manifest.source_files[1].sha256,records:[{source_key:h.source_key,target_id:h.fields.id,source_refs:h.source_refs,evidence}]},bytes=Buffer.from(JSON.stringify(raw));
 const approval=readHistoricalSalesHallApproval({bytes,trustedSha256:sha256(bytes),sourceNamespace:p.manifest.source_namespace,sourceHashes:new Set(p.manifest.source_files.map(f=>f.sha256))});return {p,approval};
}
async function both(p,approval,expected,code,inspect){
 repinSyntheticPackage(p);const original=JSON.stringify(p),r=validateUnifiedPackage(p,{allowSynthetic:true,historicalSalesHallApproval:approval});
 const root=await mkdtemp(join(tmpdir(),'historical-hall-profile-')),source=join(root,'source'),report=join(root,'report');
 try{await mkdir(source);for(const [path,bytes]of Object.entries(p.artifacts)){await mkdir(dirname(join(source,path)),{recursive:true});await writeFile(join(source,path),bytes);}const manifest=Buffer.from(JSON.stringify(p.manifest));await writeFile(join(source,'manifest.json'),manifest);
  const s=await streamPreflight(source,report,{expectedManifestSha256:sha256(manifest),allowSynthetic:true,historicalSalesHallApproval:approval}),issues=(await readFile(join(report,'issues.jsonl'),'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
  assert.equal(r.valid,expected,JSON.stringify(r.issues));assert.equal(s.checks_passed,expected,JSON.stringify(issues));if(code){assert(r.issues.some(i=>i.code===code),JSON.stringify(r.issues));assert(issues.some(i=>i.code===code),JSON.stringify(issues));}assert.equal(JSON.stringify(p),original);if(inspect)await inspect({summary:s,manifest,report,source});
 }finally{await rm(root,{recursive:true,force:true});}
}
test('strict new batch profile accepts reviewed derived or pending hall evidence without rewriting source facts',async()=>{for(const pending of [false,true]){const {p,approval}=fixture({pending});await both(p,approval,true);assert.equal(p.records.sales_header[0].historical_hall_evidence.basis,pending?'PENDING_REVIEW':'MIGRATION_DERIVED');}});
test('strict new profile cannot downgrade by dropping the bundle or its row evidence',async()=>{
 {const {p}=fixture();await both(p,undefined,false,'HISTORICAL_HALL_APPROVAL_REQUIRED');}
 {const {p}=fixture();delete p.records.sales_header[0].historical_hall_evidence;await both(p,undefined,false,'HISTORICAL_HALL_EVIDENCE_REQUIRED');}
 {const {p,approval}=fixture();delete p.records.sales_header[0].historical_hall_evidence;await both(p,approval,false,'HISTORICAL_HALL_EVIDENCE_REQUIRED');}
});
test('even compatible old profiles require every historical header when a bundle is selected',async()=>{const {p,approval}=fixture({strict:false});delete p.records.sales_header[0].historical_hall_evidence;await both(p,approval,false,'HISTORICAL_HALL_EVIDENCE_REQUIRED');});
test('new evidence cannot be moved into a legacy profile to borrow its SQL admission',async()=>{const {p,approval}=fixture({strict:false});await both(p,approval,false,'HISTORICAL_HALL_PROFILE_REQUIRED');});
test('changed captured warehouse version or source locator fails closed in both paths',async()=>{
 for(const change of ['version','locator']){const {p,approval}=fixture();if(change==='version')p.records.warehouse[0].fields.version++;else p.records.sales_header[0].source_refs[0].row++;await both(p,approval,false,change==='version'?'HISTORICAL_HALL_CAPTURE_STALE':'HISTORICAL_HALL_APPROVAL_REQUIRED');}
});
test('new hall profile is not a grant to an already installed old SQL engine',async()=>{const {p,approval}=fixture();await both(p,approval,true,undefined,async({summary,manifest,report})=>{
 const options={allowSynthetic:true,historicalSalesHallApproval:approval,target:{protocol:'STANDARD_IMPORT_SQL_V1',system_identifier:'123456789',database_oid:'42',database_name:'synthetic_hall',catalog_sha256:'a'.repeat(64)},initialization_identity:{staff_id:'00000000-0000-4000-8000-000000000001',account_id:'00000000-0000-4000-8000-000000000002',login_name:'synthetic',staff_name:'SYNTHETIC'}};
 assert.throws(()=>buildUnifiedImportPlan({pkg:p,manifestBytes:manifest,expectedManifestSha256:sha256(manifest),...options}),/HISTORICAL_HALL_PROFILE_OFFLINE_ONLY/);await assert.rejects(prepareStreamPlan(join(report,'index.sqlite'),summary,manifest,options),/HISTORICAL_HALL_PROFILE_OFFLINE_ONLY/);
 const scrubbed={...summary,schema_declarations_sha256:SCHEMA_DECLARATIONS_SHA256};delete scrubbed.historical_hall_approval;
 await assert.rejects(async()=>{for await(const _ of streamDocumentRequests(join(report,'index.sqlite'),scrubbed,{baselineBatchId:'00000000-0000-4000-8000-000000000003',documentBatchId:p.records.sales_header[0].fields.import_batch_id,planSha256:'a'.repeat(64),manifestSha256:sha256(manifest),namespace:p.manifest.source_namespace,cutoffAt:p.manifest.inventory_source.cutoff_at,expectedDocuments:{SALES_HEADER:1,SALES_LINE:1,SALES_SETTLEMENT:16,TRANSFER_HEADER:1,TRANSFER_LINE:1,IMPORT_BATCH:1}})){}},/HISTORICAL_HALL_PROFILE_OFFLINE_ONLY/);
});});
test('changing strict profile to old behavior changes the independently pinned manifest and is rejected at intake',async()=>{
 const {p}=fixture(),root=await mkdtemp(join(tmpdir(),'hall-profile-downgrade-'));try{
  const source=join(root,'source');await mkdir(source);const trusted=sha256(JSON.stringify(p.manifest));delete p.records.sales_header[0].historical_hall_evidence;p.manifest.schema_contract.source_declarations_sha256=SCHEMA_DECLARATIONS_SHA256;for(const r of p.records.staff)delete r.fields.departure_date;repinSyntheticPackage(p);
  for(const [path,bytes]of Object.entries(p.artifacts)){await mkdir(dirname(join(source,path)),{recursive:true});await writeFile(join(source,path),bytes);}await writeFile(join(source,'manifest.json'),JSON.stringify(p.manifest));
  await assert.rejects(streamPreflight(source,join(root,'report'),{expectedManifestSha256:trusted,allowSynthetic:true}),/MANIFEST_PIN_MISMATCH/);
 }finally{await rm(root,{recursive:true,force:true});}
});
