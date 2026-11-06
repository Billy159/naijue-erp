import test from 'node:test';import assert from 'node:assert/strict';
const target={protocol:'STANDARD_IMPORT_SQL_V1',system_identifier:'123456789',database_oid:'42',database_name:'synthetic_offline_v2',catalog_sha256:'a'.repeat(64)};const secret='naijue:scrypt:1:32768:8:1:'+'c'.repeat(32)+':'+'d'.repeat(128);

test('Fresh35 V2 source fixture is deterministic synthetic business input with exact six amounts and no fabricated physical target',async()=>{
 const {createSyntheticFresh35WholePackageInput}=await import('./whole-package-synthetic.ts');const {validateUnifiedPackage,sha256,HISTORICAL_SALES_HALL_V2_SOURCE_SCHEMA_DECLARATIONS_SHA256}=await import('../../../packages/application/src/unified-import-contract.ts');
 const when='2026-11-05T03:00:00Z',a=createSyntheticFresh35WholePackageInput(when),b=createSyntheticFresh35WholePackageInput(when);
 assert.equal(a.expectedManifestSha256,b.expectedManifestSha256);assert.equal(a.pkg.manifest.package_kind,'SYNTHETIC');assert.equal(a.pkg.manifest.schema_contract.source_declarations_sha256,HISTORICAL_SALES_HALL_V2_SOURCE_SCHEMA_DECLARATIONS_SHA256);
 const check=validateUnifiedPackage(a.pkg,{allowSynthetic:true,historicalSalesHallApproval:a.historicalSalesHallApproval,historicalLineAmountEvidence:a.historicalLineAmountEvidence});assert.equal(check.valid,true,JSON.stringify(check.issues));
 const e=a.historicalSalesHallApproval.records[0].evidence;assert.equal(e.format_version,'HISTORICAL_SALES_HALL_EVIDENCE_V2');if(e.format_version!=='HISTORICAL_SALES_HALL_EVIDENCE_V2')throw Error('V2 fixture required');
 assert.equal(e.source_capture.effective_version,0);assert.equal(e.source_capture.source_native_version,0);assert.equal(e.target_snapshot.version,1);assert.notEqual(e.source_capture.runtime_warehouse_id,e.warehouse_id);assert.equal(e.source_capture.runtime_hall_ids.length,2);assert.equal(e.has_difference,true);assert.equal(e.review_required,false);assert.equal(e.target_snapshot.captured_at,when);
 assert.equal(a.pkg.records.sales_line.length,6);assert.deepEqual(a.pkg.records.sales_line.map(r=>r.fields.line_amount),['3.04','-3.02','90071992547409.92','15.99','0.01','-4.99']);assert.equal(a.pkg.records.sales_settlement.length,1);assert.equal(a.pkg.records.sales_settlement[0].fields.amount,a.pkg.records.sales_header[0].fields.net_due);
 const archive=a.pkg.records.sales_header[0].zero_amount_archive;assert.equal(archive.records.length,22);
 for(const [path,text]of Object.entries(a.syntheticSourceFiles)){const p=a.pkg.manifest.source_files.find(p=>p.relative_path===path);assert.equal(sha256(text),p.sha256);assert.match(text,/SYNTHETIC|synthetic_only/);}
 const json=JSON.stringify(a);assert(!json.includes('system_identifier'));assert(!json.includes('database_oid'));assert(!json.includes(secret));assert.throws(()=>createSyntheticFresh35WholePackageInput('not-an-instant'),/TARGET_SNAPSHOT/);
});

test('Fresh35 actual preflight and request readers preserve observed or null V2 targets, six amounts and zero archives',async()=>{
 const {createSyntheticFresh35WholePackageInput}=await import('./whole-package-synthetic.ts');const {mkdtemp,mkdir,writeFile,rm,readFile}=await import('node:fs/promises');const {join,dirname}=await import('node:path');const {tmpdir}=await import('node:os');const {streamPreflight}=await import('../../../tools/unified-import/stream-preflight.mjs');const {streamDocumentRequests}=await import('../../../tools/unified-import/stream-document-requests.mjs');const {requestHash}=await import('../../../packages/application/src/request-hash.ts');
 for(const targetCapturedAt of ['2026-11-05T03:00:00Z',null]){
 const input=createSyntheticFresh35WholePackageInput(targetCapturedAt),dir=await mkdtemp(join(tmpdir(),'fresh35-fixture-test-'));
 try{
  const pkg=join(dir,'package'),report=join(dir,'report');await mkdir(pkg);for(const [path,bytes]of Object.entries(input.pkg.artifacts)){await mkdir(dirname(join(pkg,path)),{recursive:true});await writeFile(join(pkg,path),bytes);}const evidence=join(dir,'synthetic-evidence');await mkdir(evidence);for(const [path,text]of Object.entries(input.syntheticSourceFiles))await writeFile(join(evidence,path),text);await writeFile(join(pkg,'manifest.json'),input.manifestBytes);
  const summary=await streamPreflight(pkg,report,{allowSynthetic:true,expectedManifestSha256:input.expectedManifestSha256,historicalSalesHallApproval:input.historicalSalesHallApproval,historicalLineAmountEvidence:input.historicalLineAmountEvidence});assert.equal(summary.checks_passed,true,await readFile(join(report,'issues.jsonl'),'utf8'));assert.equal(summary.complete_package_validation,true);assert.equal(summary.historical_line_amount_differences,6);
  const binding={historicalSalesHallApproval:input.historicalSalesHallApproval,historicalLineAmountEvidence:input.historicalLineAmountEvidence,baselineBatchId:'00000000-0000-4000-8000-000000000001',documentBatchId:input.pkg.records.sales_header[0].fields.import_batch_id,planSha256:'b'.repeat(64),manifestSha256:input.expectedManifestSha256,namespace:input.pkg.manifest.source_namespace,cutoffAt:input.pkg.manifest.inventory_source.cutoff_at,expectedDocuments:{SALES_HEADER:1,SALES_LINE:6,SALES_SETTLEMENT:1,TRANSFER_HEADER:1,TRANSFER_LINE:1,IMPORT_BATCH:1}};
  const first=[];for await(const step of streamDocumentRequests(join(report,'index.sqlite'),summary,binding))first.push(step);const second=[];for await(const step of streamDocumentRequests(join(report,'index.sqlite'),summary,binding))second.push(step);assert.deepEqual(first,second,'same original keys and contents on repeated request iteration');
  const rows=first.flatMap(s=>s.request.payload.rows);assert.equal(rows.filter(r=>r.entity_type==='SALES_LINE').length,6);const h=rows.find(r=>r.entity_type==='SALES_HEADER');assert.equal(h.historical_hall_evidence.target_snapshot.captured_at,targetCapturedAt);if(targetCapturedAt===null){assert.equal(input.historicalSalesHallApproval.records[0].target_initialization.warehouse_source_key,input.pkg.records.warehouse[0].source_key);const {parseHistoricalSalesHallEvidence}=await import('../../../packages/application/src/historical-sales-hall-evidence.ts');assert.throws(()=>parseHistoricalSalesHallEvidence(h.historical_hall_evidence),/TARGET_SNAPSHOT_INVALID/);}assert.equal(requestHash(h.historical_hall_evidence),requestHash(input.pkg.records.sales_header[0].historical_hall_evidence));assert.equal(requestHash(h.zero_amount_archive),requestHash(input.pkg.records.sales_header[0].zero_amount_archive));assert.deepEqual(rows.filter(r=>r.entity_type==='SALES_LINE').map(r=>r.fields.line_amount),input.pkg.records.sales_line.map(r=>r.fields.line_amount));
 }finally{await rm(dir,{recursive:true,force:true})}
 }
});

test('Fresh35 fixture cannot mint host capability or touch a workspace using caller JSON admission',async()=>{
 const {buildSyntheticFresh35WholePackageFixture}=await import('./whole-package-synthetic.ts');const {mkdtemp,rm,readdir}=await import('node:fs/promises');const {join}=await import('node:path');const {tmpdir}=await import('node:os');const dir=await mkdtemp(join(tmpdir(),'fresh35-no-admission-'));
 try{await assert.rejects(buildSyntheticFresh35WholePackageFixture(target,secret,{historicalSalesAdmission:{profile:'FRESH35_EXECUTION_ADMISSION_V1'},workspaceDirectory:dir,targetCapturedAt:'2026-11-05T03:00:00Z'}),/WHOLE_SALES_ADMISSION_REQUIRED/);assert.deepEqual(await readdir(dir),[]);}finally{await rm(dir,{recursive:true,force:true})}
});

test('retention25 variant keeps default manifest bytes and adds only synthetic25 heads/27 actual-shape payments with source-side approval',async()=>{
 const {createSyntheticFresh35WholePackageInput}=await import('./whole-package-synthetic.ts');
 const {validateUnifiedPackage}=await import('../../../packages/application/src/unified-import-contract.ts');
 const {historicalSettlementRetentionWire}=await import('../../../packages/application/src/unified-historical-settlement-retention.ts');
 for(const [time,hash]of [[null,'bb9c3e49580b6ef103b6978a5b5d1f8515b459da73bf406d98adb68607f7a41d'],['2026-11-05T03:00:00Z','a25d1adf046dc3d0f54f98b4954cbe15c4c48118466bf661762f826703af7e3c']])assert.equal(createSyntheticFresh35WholePackageInput(time).expectedManifestSha256,hash,'default manifest bytes unchanged');
 const a=createSyntheticFresh35WholePackageInput(null,'settlement-retention25'),b=createSyntheticFresh35WholePackageInput(null,'settlement-retention25');
 assert.equal(a.expectedManifestSha256,b.expectedManifestSha256);assert.equal(a.retainedSalesIds.length,25);assert.equal(a.pkg.records.sales_header.length,26);assert.equal(a.pkg.records.sales_line.length,31);assert.equal(a.pkg.records.sales_settlement.length,28);assert.equal(a.historicalSalesHallApproval.records.length,26);assert.equal(a.historicalLineAmountEvidence.lines.length,6);assert.equal(a.pkg.records.sales_header[0].zero_amount_archive.records.length,22);
 const approval=a.historicalSettlementRetentionApproval,wire=historicalSettlementRetentionWire(approval);assert.deepEqual(wire,historicalSettlementRetentionWire(b.historicalSettlementRetentionApproval));assert.equal(approval.documents.length,25);assert.equal(approval.documents.flatMap(d=>d.settlements).length,27);assert.equal(approval.documents.filter(d=>d.business_type==='RETURN').length,3);assert(approval.documents.some(d=>d.net_due==='0.00'));assert(a.pkg.manifest.source_files.every(p=>p.sha256!==wire.sha256));
 const options={allowSynthetic:true,historicalSalesHallApproval:a.historicalSalesHallApproval,historicalLineAmountEvidence:a.historicalLineAmountEvidence,historicalSettlementRetentionApproval:approval};
 assert.equal(validateUnifiedPackage(a.pkg,options).valid,true);assert.equal(validateUnifiedPackage(a.pkg,{...options,historicalSettlementRetentionApproval:undefined}).valid,false);assert.equal(validateUnifiedPackage(a.pkg,{...options,historicalSettlementRetentionApproval:structuredClone(approval)}).valid,false);assert.throws(()=>createSyntheticFresh35WholePackageInput(null,'production'),/VARIANT/);
 const cents=s=>BigInt(s.replace('.',''));let under=0,over=0,refund=0;
 for(const d of approval.documents){const signed=d.settlements.reduce((n,r)=>n+(r.fields.direction==='REFUND'?-1n:1n)*cents(r.fields.amount),0n);assert.notEqual(signed,cents(d.net_due));if(d.business_type==='RETURN')refund++;else if(signed<cents(d.net_due))under++;else over++;}
 assert.deepEqual([under,over,refund],[11,11,3]);
});

test('retention25 variant runs real streaming preflight and immutable keyed request iteration; missing original row cannot consume its approval',async()=>{
 const {createSyntheticFresh35WholePackageInput}=await import('./whole-package-synthetic.ts');const {repinSyntheticPackage}=await import('./synthetic-package.ts');
 const {mkdtemp,mkdir,writeFile,readFile,rm}=await import('node:fs/promises');const {join,dirname}=await import('node:path');const {tmpdir}=await import('node:os');
 const {streamPreflight}=await import('../../../tools/unified-import/stream-preflight.mjs');const {streamDocumentRequests}=await import('../../../tools/unified-import/stream-document-requests.mjs');const {sha256}=await import('../../../packages/application/src/unified-import-contract.ts');
 for(const missing of [false,true]){
  const input=createSyntheticFresh35WholePackageInput(null,'settlement-retention25'),p=input.pkg,dir=await mkdtemp(join(tmpdir(),'fresh35-retention25-fixture-'));
  try{
   if(missing){const index=p.records.sales_settlement.findIndex(r=>r.fields.sales_id===input.retainedSalesIds[0]),[removed]=p.records.sales_settlement.splice(index,1);p.registry=p.registry.filter(r=>r.target_id!==removed.fields.id);p.reports['reconciliation.json'].tables.sales_settlement={source_rows:27,retained_rows:27,rejected_rows:0};repinSyntheticPackage(p);}
   const pkg=join(dir,'package'),report=join(dir,'report');await mkdir(pkg);for(const [path,bytes]of Object.entries(p.artifacts)){await mkdir(dirname(join(pkg,path)),{recursive:true});await writeFile(join(pkg,path),bytes);}const manifest=Buffer.from(JSON.stringify(p.manifest));await writeFile(join(pkg,'manifest.json'),manifest);
   const options={allowSynthetic:true,expectedManifestSha256:sha256(manifest),historicalSalesHallApproval:input.historicalSalesHallApproval,historicalLineAmountEvidence:input.historicalLineAmountEvidence,historicalSettlementRetentionApproval:input.historicalSettlementRetentionApproval};
   const summary=await streamPreflight(pkg,report,options);assert.equal(summary.checks_passed,!missing,await readFile(join(report,'issues.jsonl'),'utf8'));
   if(missing){assert.match(await readFile(join(report,'issues.jsonl'),'utf8'),/HISTORICAL_SETTLEMENT_EXACT_SET_REQUIRED/);continue;}
   assert.equal(summary.historical_line_amount_differences,6);assert.equal(summary.counts.sales_header,26);assert.equal(summary.counts.sales_settlement,28);
   const binding={historicalSalesHallApproval:input.historicalSalesHallApproval,historicalLineAmountEvidence:input.historicalLineAmountEvidence,baselineBatchId:'00000000-0000-4000-8000-000000000001',documentBatchId:p.records.sales_header[0].fields.import_batch_id,planSha256:'b'.repeat(64),manifestSha256:sha256(manifest),namespace:p.manifest.source_namespace,cutoffAt:p.manifest.inventory_source.cutoff_at,expectedDocuments:{SALES_HEADER:26,SALES_LINE:31,SALES_SETTLEMENT:28,TRANSFER_HEADER:1,TRANSFER_LINE:1,IMPORT_BATCH:1}};
   const first=[],second=[];for await(const step of streamDocumentRequests(join(report,'index.sqlite'),summary,binding))first.push(step);for await(const step of streamDocumentRequests(join(report,'index.sqlite'),summary,binding))second.push(step);assert.deepEqual(first,second);
   const rows=first.flatMap(s=>s.request.payload.rows),retained=rows.filter(r=>r.entity_type==='SALES_SETTLEMENT'&&input.retainedSalesIds.includes(r.fields.sales_id));assert.equal(retained.length,27);assert.deepEqual(retained.map(r=>({fields:r.fields,source_refs:r.source_refs})),p.records.sales_settlement.filter(r=>input.retainedSalesIds.includes(r.fields.sales_id)).map(r=>({fields:r.fields,source_refs:r.source_refs})));
  }finally{await rm(dir,{recursive:true,force:true})}
 }
});

test('retention25 ordinary fixture binds warehouse02 to hall02 only and preserves default and all other master and stock facts',async()=>{
 const {createSyntheticFresh35WholePackageInput}=await import('./whole-package-synthetic.ts');
 const ordinary=createSyntheticFresh35WholePackageInput(null,'settlement-retention25'),unchanged=createSyntheticFresh35WholePackageInput(null);
 const find=(p,table,key)=>p.pkg.records[table].find(r=>r.source_key===key),hall=find(ordinary,'hall','hall:01'),secondHall=find(ordinary,'hall','hall:02');
 const first=find(ordinary,'warehouse','warehouse:01'),second=find(ordinary,'warehouse','warehouse:02');
 assert(hall&&secondHall&&first&&second);assert.notEqual(hall.fields.id,secondHall.fields.id);
 assert.equal(first.fields.hall_id,hall.fields.id);assert.equal(second.fields.hall_id,secondHall.fields.id,'the explicitly selected second synthetic warehouse belongs to the second synthetic hall');
 for(const h of [hall,secondHall])assert.equal(ordinary.pkg.records.warehouse.filter(w=>w.fields.hall_id===h.fields.id).length,1,'the real ordinary guard requires exactly one fixture warehouse per selected hall');
 assert.deepEqual(first,find(unchanged,'warehouse','warehouse:01'));
 const originalSecond=find(unchanged,'warehouse','warehouse:02');assert.equal(originalSecond.fields.hall_id,hall.fields.id,'default keeps its original two warehouses in hall01');
 assert.deepEqual(second,{...originalSecond,fields:{...originalSecond.fields,hall_id:secondHall.fields.id}},'only the one explicitly named warehouse hall value changes');
 assert.deepEqual(ordinary.syntheticWarehouseRows,unchanged.syntheticWarehouseRows.map(w=>w.id===second.fields.id?{...w,hallId:secondHall.fields.id}:w));
 for(const table of ['hall','staff','customer','product','sku','sku_barcode','inventory_baseline','transfer_header','transfer_line'])assert.deepEqual(ordinary.pkg.records[table],unchanged.pkg.records[table],table+' original identities, relations, quantities and amounts remain exact');
 assert(ordinary.pkg.records.staff.every(s=>s.fields.hall_id===hall.fields.id&&s.fields.role==='SALESPERSON'));
 assert.equal(hall.fields.default_customer_id,find(unchanged,'hall','hall:01').fields.default_customer_id);assert.equal(hall.fields.default_sales_warehouse_id,first.fields.id);
 assert.deepEqual(ordinary.syntheticSourceFiles,unchanged.syntheticSourceFiles,'historical capture, bridge and resolution source bytes remain original');
 assert.deepEqual(ordinary.historicalSalesHallApproval.records[0],unchanged.historicalSalesHallApproval.records[0]);
});
