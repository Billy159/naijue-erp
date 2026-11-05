import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {validateUnifiedPackage,registryTargetId,sha256} from '../packages/application/src/unified-import-contract.ts';
import {createSyntheticPackage,repinSyntheticPackage} from './fixtures/unified-import/synthetic-package.ts';
import {streamPreflight} from '../tools/unified-import/stream-preflight.mjs';
function fixture({discount='0.00',allocation=null,receive='700.00',missing=false}={}){
 const p=createSyntheticPackage(), h=p.records.sales_header[0].fields, base=p.records.sales_line[0];
 Object.assign(h,{gross_amount:'700.00',order_discount:discount,net_due:discount==='0.00'?'700.00':'690.00'});
 Object.assign(base.fields,{quantity:'10',deal_price:'100.00',line_amount:'1000.00',allocated_discount:allocation});
 const negative=structuredClone(base), key='sales_line:returned';
 negative.source_key=key; negative.fields.id=registryTargetId(p.manifest.source_namespace,'SALES_LINE',key);
 Object.assign(negative.fields,{line_no:2,quantity:'-3',line_amount:'-300.00',allocated_discount:allocation===null?null:'0.00'});
 p.records.sales_line.push(negative);p.registry.push({...structuredClone(p.registry.find(r=>r.entity_type==='SALES_LINE')),canonical_source_key:key,target_id:negative.fields.id});
 p.records.sales_settlement=missing?[]:[p.records.sales_settlement[0]];
 p.registry=p.registry.filter(r=>r.entity_type!=='SALES_SETTLEMENT'||p.records.sales_settlement.some(s=>s.fields.id===r.target_id));
 if(!missing)Object.assign(p.records.sales_settlement[0].fields,{amount:receive,direction:'RECEIVE'});
 p.reports['reconciliation.json'].tables.sales_line={source_rows:2,retained_rows:2,rejected_rows:0};
 p.reports['reconciliation.json'].tables.sales_settlement={source_rows:missing?0:1,retained_rows:missing?0:1,rejected_rows:0};
 return repinSyntheticPackage(p);
}
async function both(p,expected,code,inspect){
 repinSyntheticPackage(p);const original=JSON.stringify(p),regular=validateUnifiedPackage(p,{allowSynthetic:true});
 const root=await mkdtemp(join(tmpdir(),'signed-intake-')),source=join(root,'source'),report=join(root,'report');
 try{await mkdir(source);for(const [path,bytes]of Object.entries(p.artifacts)){await mkdir(dirname(join(source,path)),{recursive:true});await writeFile(join(source,path),bytes);}const manifest=JSON.stringify(p.manifest);await writeFile(join(source,'manifest.json'),manifest);
 const streaming=await streamPreflight(source,report,{expectedManifestSha256:sha256(manifest),allowSynthetic:true});const issues=(await readFile(join(report,'issues.jsonl'),'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
 assert.equal(regular.valid,expected,JSON.stringify(regular.issues));assert.equal(streaming.checks_passed,expected,JSON.stringify(issues));if(code){assert(regular.issues.some(i=>i.code===code));assert(issues.some(i=>i.code===code));}assert.equal(JSON.stringify(p),original,'preflight must never mutate retained facts');if(inspect)await inspect({source,report,streaming,manifest});
 }finally{await rm(root,{recursive:true,force:true});}
}
test('history mixed SALE retains both same-SKU rows and only actual net receipt',async()=>{const p=fixture();await both(p,true);assert.equal(p.records.sales_line.length,2);assert.equal(p.records.sales_settlement.length,1);assert.equal(p.records.sales_header[0].fields.business_type,'SALE');});
test('history mixed SALE retains source discount and unknown allocations without guessing',async()=>both(fixture({discount:'10.00',receive:'690.00'}),true));
test('history mixed SALE retains exact known allocations, no invented proportional split',async()=>both(fixture({discount:'10.00',allocation:'10.00',receive:'690.00'}),true));
test('history known allocation contradiction remains rejected',async()=>both(fixture({discount:'10.00',allocation:'9.00',receive:'690.00'}),false,'DISCOUNT_ALLOCATION_MISMATCH'));
test('history missing settlement evidence remains absent rather than zero',async()=>both(fixture({missing:true}),true));
test('history explicitly contradictory receipt is still rejected',async()=>both(fixture({receive:'699.00'}),false,'SETTLEMENT_MISMATCH'));
test('new SALE cannot claim signed historical rule',async()=>{const p=fixture();p.records.sales_header[0].fields.stock_basis='RUNTIME_LEDGER';await both(p,false,'INVALID_SALES_QUANTITY');});
test('new mixed EXCHANGE cannot carry historical header discount',async()=>{const p=fixture({discount:'10.00',receive:'690.00'});Object.assign(p.records.sales_header[0].fields,{stock_basis:'RUNTIME_LEDGER',business_type:'EXCHANGE'});await both(p,false,'INDEPENDENT_RETURN_DISCOUNT');});
test('historical net refund keeps one real refund and unknown pricing',async()=>{const p=fixture();const [sell,returned]=p.records.sales_line;Object.assign(sell.fields,{quantity:'3',line_amount:'300.00'});Object.assign(returned.fields,{quantity:'-10',line_amount:'-1000.00'});Object.assign(p.records.sales_header[0].fields,{gross_amount:'-700.00',net_due:'-700.00'});Object.assign(p.records.sales_settlement[0].fields,{direction:'REFUND',amount:'700.00'});await both(p,true);assert.equal(sell.fields.pricing_rule,null);assert.equal(returned.fields.zero_confirmed,null);});
test('same SKU opposite quantity net-zero preserves both distinct original row identities',async()=>{const p=fixture();Object.assign(p.records.sales_line[1].fields,{quantity:'-10',line_amount:'-1000.00'});Object.assign(p.records.sales_header[0].fields,{gross_amount:'0.00',net_due:'0.00'});p.records.sales_settlement[0].fields.amount='0.00';await both(p,true);assert.notEqual(p.records.sales_line[0].fields.id,p.records.sales_line[1].fields.id);});
test('historical nonzero discount cannot bypass missing source evidence',async()=>{const p=fixture({discount:'10.00',receive:'690.00'});p.records.sales_header[0].source_refs=[];await both(p,false,'SOURCE_REFS_REQUIRED');});
test('CLEANED without generated history provenance fails signed SALE closed in both paths',async()=>{const p=fixture({discount:'10.00',receive:'690.00'});p.manifest.stage='CLEANED';const {TABLE_SCHEMAS}=await import('../packages/application/src/unified-import-contract.ts');for(const [entity,rows]of Object.entries(p.records))for(const row of rows)for(const [key,rule]of Object.entries(TABLE_SCHEMAS[entity]))if(rule.generated)delete row.fields[key];await both(p,false,'INVALID_SALES_QUANTITY');});
test('new EXCHANGE signed net receipt preserves actual direction',async()=>{const p=fixture();Object.assign(p.records.sales_header[0].fields,{stock_basis:'RUNTIME_LEDGER',business_type:'EXCHANGE'});await both(p,true);assert.deepEqual(p.records.sales_settlement.map(r=>[r.fields.direction,r.fields.amount]),[['RECEIVE','700.00']]);});
test('unsettled new EXCHANGE draft may save facts but known approved mismatch blocks',async()=>{const p=fixture({receive:'699.00'});Object.assign(p.records.sales_header[0].fields,{stock_basis:'RUNTIME_LEDGER',business_type:'EXCHANGE',status:'DRAFT',approved_at:null,approved_by_account_id:null});await both(p,true);});

async function cleanedHistoryProfile({basis='CUTOFF_HISTORY',missing=false}={}) {
 const p=fixture({discount:'10.00',receive:'690.00',missing});
 const c=await import('../packages/application/src/unified-import-contract.ts');
 const {requestHash}=await import('../packages/application/src/request-hash.ts');
 const {generated,...sourceBasis}=c.STAFF_DEPARTURE_TABLE_SCHEMAS.sales_header.stock_basis;
 const schema={...c.STAFF_DEPARTURE_TABLE_SCHEMAS,sales_header:{...c.STAFF_DEPARTURE_TABLE_SCHEMAS.sales_header,stock_basis:sourceBasis}};
 p.manifest.schema_contract.source_declarations_sha256=requestHash({format_version:c.UNIFIED_PACKAGE_VERSION,work_packages:c.WORK_PACKAGES,fields:schema});
 p.manifest.stage='CLEANED';
 for(const row of p.records.staff)row.fields.departure_date=null;
 for(const [entity,rows]of Object.entries(p.records))for(const row of rows)for(const [key,rule]of Object.entries(schema[entity]))if(rule.generated)delete row.fields[key];
 p.records.sales_header[0].fields.stock_basis=basis;
 return p;
}
test('explicit versioned CLEANED historical basis preserves signed facts and original discount',async()=>both(await cleanedHistoryProfile(),true));
test('explicit CLEANED historical basis preserves absent settlements as unknown',async()=>both(await cleanedHistoryProfile({missing:true}),true));
test('CLEANED runtime basis cannot borrow historical discount exception',async()=>both(await cleanedHistoryProfile({basis:'RUNTIME_LEDGER'}),false,'INVALID_SALES_QUANTITY'));
test('CLEANED historical source classification still requires pinned original references',async()=>{const p=await cleanedHistoryProfile();p.records.sales_header[0].source_refs=[];await both(p,false,'SOURCE_REFS_REQUIRED');});
test('old CLEANED profile still forbids source stock basis despite a pinned source locator',async()=>{const p=await cleanedHistoryProfile();const c=await import('../packages/application/src/unified-import-contract.ts');p.manifest.schema_contract.source_declarations_sha256=c.STAFF_DEPARTURE_SCHEMA_DECLARATIONS_SHA256;await both(p,false,'FIELD_UNKNOWN');});
test('new CLEANED profile requires explicit classification and never accepts generated batch',async()=>{const p=await cleanedHistoryProfile();delete p.records.sales_header[0].fields.stock_basis;await both(p,false,'FIELD_MISSING');const q=await cleanedHistoryProfile();q.records.sales_header[0].fields.import_batch_id='00000000-0000-4000-8000-000000000001';await both(q,false,'FIELD_UNKNOWN');});
test('successor declarations leave original profiles immutable and READY fields unchanged',async()=>{const c=await import('../packages/application/src/unified-import-contract.ts');assert.equal(c.TABLE_SCHEMAS.sales_header.stock_basis.generated,true);assert.equal(c.STAFF_DEPARTURE_TABLE_SCHEMAS.sales_header.stock_basis.generated,true);assert.equal(c.HISTORICAL_SALES_SOURCE_TABLE_SCHEMAS.sales_header.stock_basis.generated,undefined);assert.deepEqual(Object.keys(c.HISTORICAL_SALES_SOURCE_TABLE_SCHEMAS.sales_header),Object.keys(c.STAFF_DEPARTURE_TABLE_SCHEMAS.sales_header));const p=fixture({discount:'10.00',receive:'690.00'});for(const row of p.records.staff)row.fields.departure_date=null;p.manifest.schema_contract.source_declarations_sha256=c.HISTORICAL_SALES_SOURCE_SCHEMA_DECLARATIONS_SHA256;await both(p,true);});
test('READY existing profile compiler and streaming requests preserve signed historical rows exactly',async()=>{
 const c=await import('../packages/application/src/unified-import-contract.ts');
 const {compileStandardWholePackageProfile}=await import('../packages/application/src/unified-import-whole-package-profile.ts');
 const {stableImportId}=await import('../packages/application/src/inventory-cutoff-import.ts');
 const {streamDocumentRequests}=await import('../tools/unified-import/stream-document-requests.mjs');
 const p=fixture({discount:'10.00',receive:'690.00'});for(const row of p.records.staff)row.fields.departure_date=null;p.manifest.schema_contract.source_declarations_sha256=c.STAFF_DEPARTURE_SCHEMA_DECLARATIONS_SHA256;
 await both(p,true,undefined,async({report,streaming,manifest})=>{
  const manifestBytes=Buffer.from(manifest),expectedManifestSha256=sha256(manifestBytes);
  const program=compileStandardWholePackageProfile({pkg:p,manifestBytes,expectedManifestSha256,allowSynthetic:true,target:{protocol:'STANDARD_IMPORT_SQL_V1',system_identifier:'123456789',database_oid:'42',database_name:'synthetic_signed_source',catalog_sha256:'a'.repeat(64)},initialization_identity:{staff_id:stableImportId('SIGNED_SOURCE','staff'),account_id:stableImportId('SIGNED_SOURCE','account'),login_name:'synthetic-signed-source',staff_name:'SYNTHETIC'}});
  assert.equal(program.initialize.payload.schema_declarations_sha256,c.STAFF_DEPARTURE_SCHEMA_DECLARATIONS_SHA256);
  const stage=program.steps.find(x=>x.method==='documentChunk'&&x.request.payload.mode==='STAGE'),binding={baselineBatchId:program.initialize.batch_id,documentBatchId:stage.request.batch_id,planSha256:program.plan_sha256,manifestSha256:expectedManifestSha256,namespace:p.manifest.source_namespace,cutoffAt:p.manifest.inventory_source.cutoff_at,expectedDocuments:stage.request.payload.expected};
  const actual=[];for await(const step of streamDocumentRequests(join(report,'index.sqlite'),streaming,binding))actual.push(step);
  assert.deepEqual(actual,program.steps.filter(x=>x.method==='documentChunk'&&x.request.payload.mode==='CHUNK'));
  const rows=actual.flatMap(x=>x.request.payload.rows);
  for(const entity of ['sales_header','sales_line','sales_settlement'])assert.deepEqual(rows.filter(x=>x.entity_type===entity.toUpperCase()).map(x=>({fields:x.fields,source_refs:x.source_refs})),p.records[entity].map(x=>({fields:x.fields,source_refs:x.source_refs})));
 });
});
test('source-only profile cannot produce a SQL program before versioned engine support',async()=>{
 const c=await import('../packages/application/src/unified-import-contract.ts');const {compileStandardWholePackageProfile}=await import('../packages/application/src/unified-import-whole-package-profile.ts');const {prepareStreamPlan}=await import('../tools/unified-import/stream-plan.mjs');
 const p=fixture({discount:'10.00',receive:'690.00'});for(const row of p.records.staff)row.fields.departure_date=null;p.manifest.schema_contract.source_declarations_sha256=c.HISTORICAL_SALES_SOURCE_SCHEMA_DECLARATIONS_SHA256;
 await both(p,true,undefined,async({report,streaming,manifest})=>{
  const manifestBytes=Buffer.from(manifest),options={target:{protocol:'STANDARD_IMPORT_SQL_V1',system_identifier:'123456789',database_oid:'42',database_name:'synthetic_signed_source',catalog_sha256:'a'.repeat(64)},initialization_identity:{staff_id:'00000000-0000-4000-8000-000000000001',account_id:'00000000-0000-4000-8000-000000000002',login_name:'synthetic',staff_name:'SYNTHETIC'},allowSynthetic:true};
  assert.throws(()=>compileStandardWholePackageProfile({pkg:p,manifestBytes,expectedManifestSha256:sha256(manifestBytes),...options}),/WHOLE_PACKAGE_PROFILE_SOURCE_ONLY/);
  const {buildUnifiedImportPlan}=await import('../packages/application/src/unified-import-execution.ts');assert.throws(()=>buildUnifiedImportPlan({pkg:p,manifestBytes,expectedManifestSha256:sha256(manifestBytes),...options}),/SOURCE_PROFILE_OFFLINE_ONLY/);
  await assert.rejects(prepareStreamPlan(join(report,'index.sqlite'),streaming,manifestBytes,options),/STREAM_SOURCE_PROFILE_OFFLINE_ONLY/);
 });
});
