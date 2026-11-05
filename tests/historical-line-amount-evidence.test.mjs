import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,cp} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createSyntheticPackage,repinSyntheticPackage} from './fixtures/unified-import/synthetic-package.ts';
import {validateUnifiedPackage,registryTargetId,sha256} from '../packages/application/src/unified-import-contract.ts';
import {readHistoricalLineAmountEvidence,historicalLineAmountDifference} from '../packages/application/src/unified-historical-line-amount-evidence.ts';
import {streamPreflight} from '../tools/unified-import/stream-preflight.mjs';
import {streamDocumentRequests} from '../tools/unified-import/stream-document-requests.mjs';
import {prepareStreamPlan} from '../tools/unified-import/stream-plan.mjs';
import {buildUnifiedImportPlan} from '../packages/application/src/unified-import-execution.ts';
import {decodeSealedSalesMigration} from '../adapters/postgres/src/sales-migration-origin-codec.ts';
import {createCandidateSalesBusinessRules} from '../packages/application/src/sales-business-rules.ts';
const cents=s=>BigInt(s.replace('.',''));
const decimal=n=>`${n<0n?'-':''}${(n<0n?-n:n)/100n}.${((n<0n?-n:n)%100n).toString().padStart(2,'0')}`;
function fixture(){
 const p=createSyntheticPackage(),h=p.records.sales_header[0],base=p.records.sales_line[0];
 const values=[['3','1.01','3.04'],['-3','1.01','-3.02'],['1','90071992547409.91','90071992547409.92'],['16','1.00','15.99'],['1','0.00','0.01'],['-1','5.00','-4.99']];
 p.registry=p.registry.filter(r=>r.entity_type!=='SALES_LINE'&&r.entity_type!=='SALES_SETTLEMENT');
 p.records.sales_line=values.map(([quantity,deal_price,line_amount],i)=>{
  const row=structuredClone(base),key=`SYNTHETIC-DIFFERENCE-${i+1}`,id=registryTargetId(p.manifest.source_namespace,'SALES_LINE',key);
  Object.assign(row,{source_key:key,source_refs:[{...base.source_refs[0],row:100+i}]});Object.assign(row.fields,{id,line_no:i+1,quantity,deal_price,line_amount});
  p.registry.push({entity_type:'SALES_LINE',source_namespace:p.manifest.source_namespace,canonical_source_key:key,target_id:id,aliases:[],identity_basis:'STABLE_IMPORT_ID_V1',source_refs:structuredClone(row.source_refs)});return row;
 });
 const gross=decimal(p.records.sales_line.reduce((n,l)=>n+cents(l.fields.line_amount),0n));Object.assign(h.fields,{gross_amount:gross,net_due:gross});
 p.records.sales_settlement=[p.records.sales_settlement[0]];p.records.sales_settlement[0].fields.amount=gross;
 const s=p.records.sales_settlement[0];p.registry.push({entity_type:'SALES_SETTLEMENT',source_namespace:p.manifest.source_namespace,canonical_source_key:s.source_key,target_id:s.fields.id,aliases:[],identity_basis:'STABLE_IMPORT_ID_V1',source_refs:structuredClone(s.source_refs)});
 for(const table of ['sales_line','sales_settlement'])p.reports['reconciliation.json'].tables[table]={source_rows:p.records[table].length,retained_rows:p.records[table].length,rejected_rows:0};
 repinSyntheticPackage(p);
 const raw={format_version:'HISTORICAL_LINE_AMOUNT_EVIDENCE_V1',source_namespace:p.manifest.source_namespace,evidence_sha256:p.manifest.source_files[1].sha256,lines:p.records.sales_line.map(l=>({sales_source_key:h.source_key,sales_id:h.fields.id,sales_source_refs:structuredClone(h.source_refs),line_source_key:l.source_key,line_id:l.fields.id,source_refs:structuredClone(l.source_refs),quantity:l.fields.quantity,deal_price:l.fields.deal_price,line_amount:l.fields.line_amount}))};
 const evidence=read(raw,p);return {p,raw,evidence};
}
function read(raw,p,changes={}){const bytes=Buffer.from(JSON.stringify(raw));return readHistoricalLineAmountEvidence({bytes,trustedSha256:sha256(bytes),sourceNamespace:p.manifest.source_namespace,sourceHashes:new Set(p.manifest.source_files.map(f=>f.sha256)),...changes});}
async function both(p,evidence,expected,code,inspect,hallApproval){
 repinSyntheticPackage(p);const original=JSON.stringify(p),regular=validateUnifiedPackage(p,{allowSynthetic:true,historicalLineAmountEvidence:evidence,...(hallApproval?{historicalSalesHallApproval:hallApproval}:{})});
 const root=await mkdtemp(join(tmpdir(),'historical-amount-')),source=join(root,'source'),report=join(root,'report');
 try{
  await mkdir(source);for(const [path,bytes]of Object.entries(p.artifacts)){await mkdir(dirname(join(source,path)),{recursive:true});await writeFile(join(source,path),bytes);}const manifest=JSON.stringify(p.manifest);await writeFile(join(source,'manifest.json'),manifest);
  const streaming=await streamPreflight(source,report,{expectedManifestSha256:sha256(manifest),allowSynthetic:true,historicalLineAmountEvidence:evidence,...(hallApproval?{historicalSalesHallApproval:hallApproval}:{})});
  const issues=(await readFile(join(report,'issues.jsonl'),'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
  assert.equal(regular.valid,expected,JSON.stringify(regular.issues));assert.equal(streaming.checks_passed,expected,JSON.stringify(issues));
  if(code){assert(regular.issues.some(i=>i.code===code),JSON.stringify(regular.issues));assert(issues.some(i=>i.code===code),JSON.stringify(issues));}
  assert.equal(JSON.stringify(p),original,'No source facts may be rewritten');
  if(inspect)await inspect({regular,streaming,report,manifest,source});
 }finally{await rm(root,{recursive:true,force:true});}
}
test('six synthetic original discrepancies are retained and read back exactly in ordinary and streaming intake',async()=>{
 const {p,evidence,raw}=fixture();await both(p,evidence,true,undefined,async({regular,streaming,report})=>{
  const rows=(await readFile(join(report,'historical-line-amount-differences.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
  assert.deepEqual(rows,regular.historical_line_amount_differences);assert.equal(rows.length,6);assert.equal(streaming.historical_line_amount_differences,6);assert.equal(streaming.import_eligible,false);
  const archiveBytes=await readFile(join(report,streaming.historical_line_amount_report.relative_path));assert.equal(sha256(archiveBytes),streaming.historical_line_amount_report.sha256);
  const proofBytes=await readFile(join(report,streaming.historical_line_amount_evidence.relative_path));assert.equal(sha256(proofBytes),streaming.historical_line_amount_evidence.sha256);
  assert.deepEqual(readHistoricalLineAmountEvidence({bytes:proofBytes,trustedSha256:streaming.historical_line_amount_evidence.sha256,sourceNamespace:p.manifest.source_namespace,sourceHashes:new Set(p.manifest.source_files.map(f=>f.sha256))}),evidence);
  for(const [i,row]of rows.entries()){assert.equal(row.quantity,raw.lines[i].quantity);assert.equal(row.deal_price,raw.lines[i].deal_price);assert.equal(row.line_amount,raw.lines[i].line_amount);assert.equal(row.execution_boundary,'OFFLINE_ARCHIVE_ONLY');}
  assert.equal(rows[2].line_amount,'90071992547409.92');assert.equal(rows[2].difference,'0.01');
  if(process.env.HISTORICAL_AMOUNT_EVIDENCE_DIR){await cp(report,join(process.env.HISTORICAL_AMOUNT_EVIDENCE_DIR,'synthetic-readback'),{recursive:true,errorOnExist:true,force:false});await writeFile(join(process.env.HISTORICAL_AMOUNT_EVIDENCE_DIR,'synthetic-attestation.json'),JSON.stringify(raw,null,2)+'\n',{flag:'wx'});}
 });
});
test('a source flag or valid-looking copied evidence never grants the discrepancy exception',async()=>{
 for(const copy of [undefined,'copied']){const {p,evidence}=fixture();await both(p,copy?structuredClone(evidence):undefined,false,'ECONOMIC_DIFFERENCE');}
});
test('new runtime documents cannot borrow reviewed historical differences',async()=>{const {p,evidence}=fixture();p.records.sales_header[0].fields.stock_basis='RUNTIME_LEDGER';await both(p,evidence,false,'ECONOMIC_DIFFERENCE');});
test('changed original amount, price, quantity or exact source occurrence fails closed',async()=>{
 for(const key of ['line_amount','deal_price','quantity','source_refs','sales_source_refs']){const {p,evidence}=fixture();const l=p.records.sales_line[0];if(key==='source_refs')l.source_refs[0].row++;else if(key==='sales_source_refs')p.records.sales_header[0].source_refs[0].row++;else l.fields[key]=key==='quantity'?'4':'3.05';await both(p,evidence,false,'ECONOMIC_DIFFERENCE');}
});
test('foreign namespace, source inventory, parent identity and missing header provenance cannot reuse evidence',async()=>{
 for(const kind of ['namespace','source','parent','header-ref']){const {p,evidence}=fixture();if(kind==='namespace')p.manifest.source_namespace+='-foreign';else if(kind==='source')p.manifest.source_files[1].sha256='f'.repeat(64);else if(kind==='parent')p.records.sales_header[0].source_key+='-other';else p.records.sales_header[0].source_refs=[];await both(p,evidence,false);}
});
test('known header and receipt contradictions remain blocking despite line evidence',async()=>{
 for(const field of ['gross_amount','settlement']){const {p,evidence}=fixture();if(field==='settlement')p.records.sales_settlement[0].fields.amount='1.00';else p.records.sales_header[0].fields.gross_amount='1.00';await both(p,evidence,false,field==='settlement'?'SETTLEMENT_MISMATCH':'ECONOMIC_DIFFERENCE');}
});
test('every reviewed discrepancy must remain present and exact, not a partial allow-list',async()=>{
 const {p,evidence}=fixture();p.records.sales_line[0].fields.line_amount='3.03';p.records.sales_header[0].fields.gross_amount=decimal(cents(p.records.sales_header[0].fields.gross_amount)-1n);p.records.sales_header[0].fields.net_due=p.records.sales_header[0].fields.gross_amount;p.records.sales_settlement[0].fields.amount=p.records.sales_header[0].fields.gross_amount;await both(p,evidence,false,'HISTORICAL_LINE_AMOUNT_EVIDENCE_SET_INCOMPLETE');
});
test('evidence rejects wrong digest, duplicate identities/occurrences, malformed money and unknown fields',()=>{
 const {p,raw}=fixture();assert.throws(()=>read(raw,p,{trustedSha256:'0'.repeat(64)}),/EVIDENCE_HASH/);
 for(const mutate of [r=>r.lines.push(structuredClone(r.lines[0])),r=>r.lines[1].source_refs=structuredClone(r.lines[0].source_refs),r=>r.lines[0].deal_price='1.001',r=>r.lines[0].line_amount='3.03',r=>r.lines[0].quantity='0',r=>r.lines[0].bypass=true,r=>r.source_namespace='foreign']){const x=structuredClone(raw);mutate(x);assert.throws(()=>read(x,p),/HISTORICAL_LINE_AMOUNT_EVIDENCE_/);}
});
test('immutable capability does not accept a JSON clone or leak mutable source aliases',()=>{
 const {p,evidence}=fixture();assert(Object.isFrozen(evidence.lines[0].source_refs[0]));assert.throws(()=>{evidence.lines[0].quantity='4';},TypeError);
 const input={namespace:p.manifest.source_namespace,header:p.records.sales_header[0],headerId:p.records.sales_header[0].fields.id,line:p.records.sales_line[0],lineId:p.records.sales_line[0].fields.id};
 assert.equal(historicalLineAmountDifference(structuredClone(evidence),input),undefined);const projected=historicalLineAmountDifference(evidence,input);projected.source_refs[0].row=999;assert.notEqual(historicalLineAmountDifference(evidence,input).source_refs[0].row,999);
});
test('existing sealed database codec retains all six price/quantity/amount facts without recomputation (synthetic protocol only)',()=>{
 const {p,raw}=fixture(),header=p.records.sales_header[0].fields;
 const document=decodeSealedSalesMigration({header,lines:p.records.sales_line.map(l=>l.fields),settlements:p.records.sales_settlement.map(s=>s.fields)},header.id);
 for(const [i,line]of document.lines.entries()){assert.equal(line.quantity,BigInt(raw.lines[i].quantity));assert.equal(line.dealPrice,cents(raw.lines[i].deal_price));assert.equal(line.lineAmount,cents(raw.lines[i].line_amount));assert.notEqual(line.lineAmount,line.quantity*line.dealPrice);}
 const fields=document.lines.map(l=>({...l,pricingRule:'UNIT_PRICE',discountTenths:null,zeroConfirmed:true,isGift:false,allocatedDiscount:0n}));
 const known={...document,lines:fields},rules=createCandidateSalesBusinessRules({sku:id=>({id,productId:'SYNTHETIC-product',enabled:true}),productPricing:id=>({id,enabled:true,referencePrice:null,minimumPrice:null}),assertDocumentReferences(){}});
 assert.throws(()=>rules.assertDraftChange(undefined,known),{code:'LINE_AMOUNT_MISMATCH'});
 assert.throws(()=>rules.assertReferencesAndEconomics(known),{code:'LINE_AMOUNT_MISMATCH'});
});
test('offline source reception cannot create an executable import plan, even with a scrubbed summary',async()=>{
 const {p,evidence}=fixture();await both(p,evidence,true,undefined,async({streaming,report,manifest})=>{
  const manifestBytes=Buffer.from(manifest),options={allowSynthetic:true,target:{protocol:'STANDARD_IMPORT_SQL_V1',system_identifier:'123456789',database_oid:'42',database_name:'synthetic_discrepancy',catalog_sha256:'a'.repeat(64)},initialization_identity:{staff_id:'00000000-0000-4000-8000-000000000001',account_id:'00000000-0000-4000-8000-000000000002',login_name:'synthetic',staff_name:'SYNTHETIC'}};
  assert.throws(()=>buildUnifiedImportPlan({pkg:p,manifestBytes,expectedManifestSha256:sha256(manifestBytes),...options}),/PREFLIGHT_REJECTED/);
  const scrubbed={...streaming};delete scrubbed.historical_line_amount_differences;delete scrubbed.historical_line_amount_execution_boundary;
  await assert.rejects(prepareStreamPlan(join(report,'index.sqlite'),scrubbed,manifestBytes,options),/HISTORICAL_LINE_AMOUNT_EXECUTION_UNBOUND/);
  const expectedDocuments={SALES_HEADER:1,SALES_LINE:6,SALES_SETTLEMENT:1,TRANSFER_HEADER:1,TRANSFER_LINE:1,IMPORT_BATCH:1};
  await assert.rejects(async()=>{for await(const _ of streamDocumentRequests(join(report,'index.sqlite'),scrubbed,{baselineBatchId:'00000000-0000-4000-8000-000000000003',documentBatchId:p.records.sales_header[0].fields.import_batch_id,planSha256:'a'.repeat(64),manifestSha256:sha256(manifestBytes),namespace:p.manifest.source_namespace,cutoffAt:p.manifest.inventory_source.cutoff_at,expectedDocuments})){}},/HISTORICAL_LINE_AMOUNT_EXECUTION_UNBOUND/);
 });
});
test('actual offline CLI accepts only separately pinned evidence and preserves the archive-only boundary',async()=>{
 const {p,evidence,raw}=fixture();await both(p,evidence,true,undefined,async({report,manifest,source})=>{
  const root=dirname(report),proof=join(root,'independent-evidence.json'),bytes=JSON.stringify(raw);await writeFile(proof,bytes);
  const base=['tools/unified-import/cli.mjs','stream-preflight','--package',source,'--manifest-sha256',sha256(manifest),'--allow-synthetic'];
  const run=async suffix=>{try{const r=await promisify(execFile)(process.execPath,[...base,...suffix],{maxBuffer:1024*1024});return {...r,code:0};}catch(e){return {stdout:e.stdout,stderr:e.stderr,code:e.code};}};
  const accepted=await run(['--report',join(root,'cli-report'),'--historical-line-amount-evidence',proof,'--historical-line-amount-evidence-sha256',sha256(bytes)]);
  assert.equal(accepted.code,0,JSON.stringify(accepted));const summary=JSON.parse(accepted.stdout);assert.equal(summary.checks_passed,true);assert.equal(summary.historical_line_amount_differences,6);assert.equal(summary.historical_line_amount_execution_boundary,'OFFLINE_ARCHIVE_ONLY');assert.equal(summary.import_eligible,false);
  const wrong=await run(['--report',join(root,'wrong-pin'),'--historical-line-amount-evidence',proof,'--historical-line-amount-evidence-sha256','0'.repeat(64)]);assert.equal(wrong.code,1);
  const missing=await run(['--report',join(root,'missing-pin'),'--historical-line-amount-evidence',proof]);assert.equal(missing.code,1);
  const unreviewed=await run(['--report',join(root,'no-evidence')]);assert.equal(unreviewed.code,1);assert.equal(JSON.parse(unreviewed.stdout).checks_passed,false);
  if(process.env.HISTORICAL_AMOUNT_EVIDENCE_DIR)await writeFile(join(process.env.HISTORICAL_AMOUNT_EVIDENCE_DIR,'cli-raw-results.json'),JSON.stringify({accepted,wrong,missing,unreviewed},null,2)+'\n',{flag:'wx'});
 });
});
test('execution matching is exact and excludes forged, changed and runtime documents',async()=>{
 const {assertHistoricalLineAmountExecution}=await import('../packages/application/src/unified-historical-line-amount-evidence.ts');
 const {p,evidence}=fixture();const h=p.records.sales_header[0],l=p.records.sales_line[0];
 const input={namespace:p.manifest.source_namespace,header:h,headerId:h.fields.id,line:l,lineId:l.fields.id};
 assertHistoricalLineAmountExecution(evidence,input);
 assert.throws(()=>assertHistoricalLineAmountExecution(structuredClone(evidence),input),/HISTORICAL_LINE_AMOUNT_EXECUTION_UNBOUND/);
 assert.throws(()=>assertHistoricalLineAmountExecution(evidence,{...input,line:{...l,fields:{...l.fields,line_amount:'3.05'}}}),/HISTORICAL_LINE_AMOUNT_EXECUTION_UNBOUND/);
 assert.throws(()=>assertHistoricalLineAmountExecution(evidence,{...input,header:{...h,fields:{...h.fields,stock_basis:'RUNTIME_LEDGER'}}}),/HISTORICAL_LINE_AMOUNT_EXECUTION_UNBOUND/);
});
test('verified original differences survive request generation with exact original strings',async()=>{
 const {p,evidence,raw}=fixture();await both(p,evidence,true,undefined,async({streaming,report})=>{
  const expectedDocuments={SALES_HEADER:1,SALES_LINE:6,SALES_SETTLEMENT:1,TRANSFER_HEADER:1,TRANSFER_LINE:1,IMPORT_BATCH:1};
  const requests=[];for await(const x of streamDocumentRequests(join(report,'index.sqlite'),streaming,{historicalLineAmountEvidence:evidence,baselineBatchId:'00000000-0000-4000-8000-000000000003',documentBatchId:p.records.sales_header[0].fields.import_batch_id,planSha256:'a'.repeat(64),manifestSha256:streaming.manifest_sha256,namespace:p.manifest.source_namespace,cutoffAt:p.manifest.inventory_source.cutoff_at,expectedDocuments}))requests.push(x);
  const wire=JSON.stringify(requests);for(const row of raw.lines)assert(wire.includes(row.line_amount));assert(requests.length>0);
 });
});
test('execution planner rejects an evidence-bearing package outside the SQL successor profile',async()=>{
 const {p,evidence}=fixture();await both(p,evidence,true,undefined,async({streaming,report,manifest})=>{
  const options={historicalLineAmountEvidence:evidence,allowSynthetic:true,target:{protocol:'STANDARD_IMPORT_SQL_V1',system_identifier:'123456789',database_oid:'42',database_name:'synthetic_discrepancy',catalog_sha256:'a'.repeat(64)},initialization_identity:{staff_id:'00000000-0000-4000-8000-000000000001',account_id:'00000000-0000-4000-8000-000000000002',login_name:'synthetic',staff_name:'SYNTHETIC'}};
  await assert.rejects(prepareStreamPlan(join(report,'index.sqlite'),streaming,Buffer.from(manifest),options),/HISTORICAL_LINE_AMOUNT_PROFILE_REQUIRED/);
 });
});
test('derived or pending hall plus exact amount evidence cannot replace a physical host admission',async()=>{for(const pending of [false,true]){
 const {HISTORICAL_SALES_HALL_SOURCE_SCHEMA_DECLARATIONS_SHA256}=await import('../packages/application/src/unified-import-contract.ts');
 const {buildHistoricalSalesHallEvidence,readHistoricalSalesHallApproval}=await import('../packages/application/src/unified-historical-sales-hall-evidence.ts');
 const {p,evidence}=fixture(),h=p.records.sales_header[0],w=p.records.warehouse[0];
 p.manifest.schema_contract.source_declarations_sha256=HISTORICAL_SALES_HALL_SOURCE_SCHEMA_DECLARATIONS_SHA256;for(const s of p.records.staff)s.fields.departure_date=null;
 h.historical_hall_evidence=buildHistoricalSalesHallEvidence({originalHallId:null,warehouseId:w.fields.id,warehouseHallId:pending?null:w.fields.hall_id,warehouseVersion:pending?null:w.fields.version,capturedAt:pending?null:'2026-11-05T03:00:00Z'});
 h.fields.hall_id=h.historical_hall_evidence.selected_hall_id;
 const bytes=Buffer.from(JSON.stringify({format_version:'HISTORICAL_SALES_HALL_APPROVAL_V1',source_namespace:p.manifest.source_namespace,evidence_sha256:p.manifest.source_files[1].sha256,records:[{source_key:h.source_key,target_id:h.fields.id,source_refs:h.source_refs,evidence:h.historical_hall_evidence}]}));
 const approval=readHistoricalSalesHallApproval({bytes,trustedSha256:sha256(bytes),sourceNamespace:p.manifest.source_namespace,sourceHashes:new Set(p.manifest.source_files.map(f=>f.sha256))});
 await both(p,evidence,true,undefined,async({streaming,report,manifest})=>{
  const admin={staff_id:'00000000-0000-4000-8000-000000000001',account_id:'00000000-0000-4000-8000-000000000002',login_name:'synthetic',staff_name:'SYNTHETIC'};
  const options={historicalSalesHallApproval:approval,historicalLineAmountEvidence:evidence,allowSynthetic:true,target:{protocol:'STANDARD_IMPORT_SQL_V1',system_identifier:'123456789',database_oid:'42',database_name:'synthetic_discrepancy',catalog_sha256:'a'.repeat(64)},initialization_identity:admin};
  await assert.rejects(prepareStreamPlan(join(report,'index.sqlite'),streaming,Buffer.from(manifest),{...options,historicalSalesHallApproval:undefined}),/HISTORICAL_HALL_APPROVAL_BINDING_INVALID/);
  await assert.rejects(prepareStreamPlan(join(report,'index.sqlite'),streaming,Buffer.from(manifest),{...options,historicalSalesHallApproval:structuredClone(approval)}),/HISTORICAL_HALL_APPROVAL_UNVERIFIED/);
  await assert.rejects(prepareStreamPlan(join(report,'index.sqlite'),streaming,Buffer.from(manifest),options),/WHOLE_SALES_ADMISSION_REQUIRED/);
  await assert.rejects(prepareStreamPlan(join(report,'index.sqlite'),streaming,Buffer.from(manifest),{...options,historicalSalesAdmission:{profile:'FRESH35_EXECUTION_ADMISSION_V1'}}),/WHOLE_SALES_ADMISSION_REQUIRED/);
 },approval);
}});
