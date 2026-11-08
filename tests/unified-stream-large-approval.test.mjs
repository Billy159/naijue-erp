import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {tmpdir} from 'node:os';
import {createSyntheticPackage,repinSyntheticPackage} from './fixtures/unified-import/synthetic-package.ts';
import {sha256,HISTORICAL_SALES_HALL_SOURCE_SCHEMA_DECLARATIONS_SHA256} from '../packages/application/src/unified-import-contract.ts';
import {buildHistoricalSalesHallEvidence,readHistoricalSalesHallApproval,historicalSalesHallApprovalWire} from '../packages/application/src/unified-historical-sales-hall-evidence.ts';
import {streamPreflight} from '../tools/unified-import/stream-preflight.mjs';
import {prepareStreamPlan} from '../tools/unified-import/stream-plan.mjs';
import {streamSummaryBinding} from '../tools/unified-import/stream-binding.mjs';
import {requestHash} from '../packages/application/src/request-hash.ts';
import {buildStreamProgram as realBuildStreamProgram} from '../tools/unified-import/stream-program.mjs';
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
// Isolated request-assembly unit seam only. This is not a host/admission/native
// binding model; the real public builder must still reject this private-plan DTO.
async function requestAssemblyModel(){
 const url=new URL('../tools/unified-import/stream-program.mjs',import.meta.url);
 const planModule='export function assertActiveStreamPlan(p){if(p.modelScope!=="REQUEST_ASSEMBLY_ONLY")throw Error("MODEL_REQUIRED")}export async function* iteratePreparedMasterRows(p){yield* p.modelRows??[]}export function preparedMasterChunkTokens(){throw Error("UNUSED_MODEL")}export function preparedMasterLayout(){throw Error("UNUSED_MODEL")}';
 let source=await readFile(url,'utf8');source=source.replace("'./stream-plan.mjs'",JSON.stringify('data:text/javascript;base64,'+Buffer.from(planModule).toString('base64')));
 source=source.replace(/from(['"])(\.[^'"]+)\1/g,(_,q,path)=>'from'+q+new URL(path,url).href+q);
 source+='\n//# sourceURL=stream-program-request-assembly-model.mjs';
 return (await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).buildStreamProgram;
}
const modelBuild=await requestAssemblyModel();
function model(summary,wire,admin){return {modelScope:'REQUEST_ASSEMBLY_ONLY',initializationIdentityHash:requestHash(admin),summaryBindingHash:streamSummaryBinding(summary),planHash:'a'.repeat(64),layoutHash:'b'.repeat(64),schedule:{max_chunk_rows:500,chunk_plan_sha256:'c'.repeat(64)},sourceV2Progress:{baseline_cursor:2},common:{counts:{master_occurrences:0,explicit_keys:0,sales_headers:0,sales_lines:0,sales_settlements:0,transfer_headers:0,transfer_lines:0},source_namespace:summary.source_namespace,manifest_sha256:summary.manifest_sha256,baseline_batch_id:id(100),document_batch_id:id(101),registry_sha256:'d'.repeat(64),alignment_sha256:'e'.repeat(64),cutoff_at:'2026-11-05T03:00:00Z',historical_hall_approval:wire},masterChunkCount:0};}
async function fixture(wireSpan,work){
 const root=await mkdtemp(join(tmpdir(),'stream-large-wire-'));try{
 const p=createSyntheticPackage(),header=p.records.sales_header[0],warehouse=p.records.warehouse[0];p.manifest.schema_contract.source_declarations_sha256=HISTORICAL_SALES_HALL_SOURCE_SCHEMA_DECLARATIONS_SHA256;for(const r of p.records.staff)r.fields.departure_date=null;
 const evidence=buildHistoricalSalesHallEvidence({originalHallId:null,warehouseId:warehouse.fields.id,warehouseHallId:warehouse.fields.hall_id,warehouseVersion:warehouse.fields.version,capturedAt:'2026-11-05T03:00:00Z'});header.historical_hall_evidence=evidence;header.fields.hall_id=evidence.selected_hall_id;repinSyntheticPackage(p);
 const raw=JSON.stringify({format_version:'HISTORICAL_SALES_HALL_APPROVAL_V1',source_namespace:p.manifest.source_namespace,evidence_sha256:p.manifest.source_files[1].sha256,records:[{source_key:header.source_key,target_id:header.fields.id,source_refs:header.source_refs,evidence}]});
 const span=wire=>{const s=JSON.stringify({historical_hall_approval:wire},null,2);return Buffer.byteLength(s.slice(s.indexOf('{',1),s.lastIndexOf('}',s.length-2)+1));};
 const base={utf8:raw,sha256:sha256(raw)},text=raw+' '.repeat(wireSpan-span(base)),bytes=Buffer.from(text);assert(bytes.length<=64*1024*1024);
 const approval=readHistoricalSalesHallApproval({bytes,trustedSha256:sha256(bytes),sourceNamespace:p.manifest.source_namespace,sourceHashes:new Set(p.manifest.source_files.map(f=>f.sha256))}),wire=historicalSalesHallApprovalWire(approval);assert.equal(span(wire),wireSpan);
 const pkg=join(root,'pkg');await mkdir(pkg);for(const [path,b]of Object.entries(p.artifacts)){await mkdir(dirname(join(pkg,path)),{recursive:true});await writeFile(join(pkg,path),b);}const manifest=Buffer.from(JSON.stringify(p.manifest));await writeFile(join(pkg,'manifest.json'),manifest);
 const summary=await streamPreflight(pkg,join(root,'report'),{expectedManifestSha256:sha256(manifest),allowSynthetic:true,historicalSalesHallApproval:approval});assert.equal(summary.checks_passed,true);assert.equal(summary.complete_package_validation,true);assert.equal(summary.import_eligible,false);
 const admin={staff_id:id(1),account_id:id(2),login_name:'synthetic',staff_name:'SYNTHETIC'};
 await work({summary,wire,admin,plan:model(summary,wire,admin),approval,manifest,index:join(root,'report','index.sqlite')});
 }finally{await rm(root,{recursive:true,force:true});}
}
test('admitted 57647676B hall wire remains whole in INITIALIZE without waiving native admission',async()=>fixture(57647676,async f=>{
 await assert.rejects(realBuildStreamProgram(f.plan,f.index,f.summary,f.admin),/STREAM_PLAN_NOT_ACTIVE/);
 await assert.rejects(prepareStreamPlan(f.index,f.summary,f.manifest,{historicalSalesHallApproval:f.approval,allowSynthetic:true,target:{protocol:'STANDARD_IMPORT_SQL_V1',system_identifier:'123456789',database_oid:'42',database_name:'synthetic',catalog_sha256:'a'.repeat(64)},initialization_identity:f.admin}),/WHOLE_SALES_ADMISSION_REQUIRED/);
 const program=await modelBuild(f.plan,f.index,f.summary,f.admin);
 assert.deepEqual(program.initialize.payload.historical_hall_approval,f.wire);
 assert.equal(sha256(program.initialize.payload.historical_hall_approval.utf8),f.wire.sha256);
 assert(Buffer.byteLength(JSON.stringify(program.initialize))>8*1024*1024);
 const changed={...program.initialize,payload:{...program.initialize.payload,historical_hall_approval:{...f.wire,utf8:f.wire.utf8+' '}}};assert.notEqual(requestHash(program.initialize),requestHash(changed));
 console.log(JSON.stringify({scope:'REQUEST_ASSEMBLY_ONLY_NOT_NATIVE_PREPARED',approvalWireEncodedBytes:57647676,summaryBytes:Buffer.byteLength(JSON.stringify(f.summary,null,2)+'\n'),initializeBytes:Buffer.byteLength(JSON.stringify(program.initialize))}));
}));
test('ordinary oversized initializer data remains rejected alongside an admitted large wire',async()=>fixture(9*1024*1024,async f=>{
 const admin={...f.admin,staff_name:'x'.repeat(8*1024*1024)};f.plan.initializationIdentityHash=requestHash(admin);await assert.rejects(modelBuild(f.plan,f.index,f.summary,admin),/STREAM_REQUEST_TOO_LARGE/);
}));
test('non-initialization master requests and explicit-zero descriptors retain the original size cap',async()=>fixture(9*1024*1024,async f=>{
 f.plan.common.explicit_zero_approval={unapproved:'x'.repeat(8*1024*1024)};
 await assert.rejects(modelBuild(f.plan,f.index,f.summary,f.admin),/STREAM_REQUEST_TOO_LARGE/);
 delete f.plan.common.explicit_zero_approval;
 f.plan.common.table_files={staff:'staff.jsonl'};
 f.plan.modelRows=[[{table:'staff',record:{source_key:'synthetic-staff',source_refs:[],fields:{id:id(1),name:'x'.repeat(8*1024*1024)}},identity:{target_id:id(1),identity_basis:'SOURCE_ID'}}]];
 const program=await modelBuild(f.plan,f.index,f.summary,f.admin);
 await assert.rejects(program.steps.next(),/STREAM_REQUEST_TOO_LARGE/);
}));
test('unbound summary wire and extra data in wire do not gain the approval size allowance',async()=>fixture(9*1024*1024,async f=>{
 await assert.rejects(modelBuild(f.plan,f.index,{...f.summary,historical_hall_approval:{...f.wire,sha256:'f'.repeat(64)}},f.admin),/STREAM_PLAN_SUMMARY_MISMATCH/);
 f.plan.common.historical_hall_approval={...f.wire,unapproved:'x'.repeat(8*1024*1024)};await assert.rejects(modelBuild(f.plan,f.index,f.summary,f.admin),/STREAM_REQUEST_TOO_LARGE/);
}));
