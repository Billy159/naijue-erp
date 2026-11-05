import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,cp} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {createSyntheticPackage,repinSyntheticPackage} from './fixtures/unified-import/synthetic-package.ts';
import {sha256,registryTargetId,HISTORICAL_SALES_HALL_SOURCE_SCHEMA_DECLARATIONS_SHA256,SCHEMA_DECLARATIONS_SHA256} from '../packages/application/src/unified-import-contract.ts';
import {buildHistoricalSalesHallEvidence} from '../packages/application/src/unified-historical-sales-hall-evidence.ts';

// All source records and review bytes in this test are generated synthetic facts.
// Computing pins here makes a deterministic test fixture, not independent source attestation.
const values=[['3','1.01','3.04'],['-3','1.01','-3.02'],['1','90071992547409.91','90071992547409.92'],['16','1.00','15.99'],['1','0.00','0.01'],['-1','5.00','-4.99']];
const cents=s=>BigInt(s.replace('.',''));
const decimal=n=>`${n<0n?'-':''}${(n<0n?-n:n)/100n}.${((n<0n?-n:n)%100n).toString().padStart(2,'0')}`;
function fixture({unknownTime=false,pendingHall=false}={}){
 const p=createSyntheticPackage(),h=p.records.sales_header[0],w=p.records.warehouse[0],base=p.records.sales_line[0];
 p.manifest.schema_contract.source_declarations_sha256=HISTORICAL_SALES_HALL_SOURCE_SCHEMA_DECLARATIONS_SHA256;
 for(const r of p.records.staff)r.fields.departure_date=null;
 h.historical_hall_evidence=buildHistoricalSalesHallEvidence({originalHallId:null,warehouseId:w.fields.id,warehouseHallId:pendingHall?null:w.fields.hall_id,warehouseVersion:pendingHall?null:w.fields.version,capturedAt:pendingHall?null:'2026-11-05T03:00:00Z'});
 h.fields.hall_id=h.historical_hall_evidence.selected_hall_id;
 p.registry=p.registry.filter(r=>r.entity_type!=='SALES_LINE'&&r.entity_type!=='SALES_SETTLEMENT');
 p.records.sales_line=values.map(([quantity,deal_price,line_amount],i)=>{
  const row=structuredClone(base),key=`SYNTHETIC-UNIFIED-DIFFERENCE-${i+1}`,id=registryTargetId(p.manifest.source_namespace,'SALES_LINE',key);
  Object.assign(row,{source_key:key,source_refs:[{...base.source_refs[0],row:100+i}]});Object.assign(row.fields,{id,line_no:i+1,quantity,deal_price,line_amount});
  p.registry.push({entity_type:'SALES_LINE',source_namespace:p.manifest.source_namespace,canonical_source_key:key,target_id:id,aliases:[],identity_basis:'STABLE_IMPORT_ID_V1',source_refs:structuredClone(row.source_refs)});return row;
 });
 const gross=decimal(p.records.sales_line.reduce((n,l)=>n+cents(l.fields.line_amount),0n));Object.assign(h.fields,{gross_amount:gross,net_due:gross});
 p.records.sales_settlement=[p.records.sales_settlement[0]];const s=p.records.sales_settlement[0];s.fields.amount=gross;
 p.registry.push({entity_type:'SALES_SETTLEMENT',source_namespace:p.manifest.source_namespace,canonical_source_key:s.source_key,target_id:s.fields.id,aliases:[],identity_basis:'STABLE_IMPORT_ID_V1',source_refs:structuredClone(s.source_refs)});
 for(const table of ['sales_line','sales_settlement'])p.reports['reconciliation.json'].tables[table]={source_rows:p.records[table].length,retained_rows:p.records[table].length,rejected_rows:0};
 repinSyntheticPackage(p);
 const hall={format_version:'HISTORICAL_SALES_HALL_APPROVAL_V1',source_namespace:p.manifest.source_namespace,evidence_sha256:p.manifest.source_files[1].sha256,records:[{source_key:h.source_key,target_id:h.fields.id,source_refs:structuredClone(h.source_refs),evidence:structuredClone(h.historical_hall_evidence)}]};
 const amount={format_version:'HISTORICAL_LINE_AMOUNT_EVIDENCE_V1',source_namespace:p.manifest.source_namespace,evidence_sha256:p.manifest.source_files[1].sha256,lines:p.records.sales_line.map(l=>({sales_source_key:h.source_key,sales_id:h.fields.id,sales_source_refs:structuredClone(h.source_refs),line_source_key:l.source_key,line_id:l.fields.id,source_refs:structuredClone(l.source_refs),quantity:l.fields.quantity,deal_price:l.fields.deal_price,line_amount:l.fields.line_amount}))};
 const proofs={hall:Buffer.from(JSON.stringify(hall)+'\n'),amount:Buffer.from(JSON.stringify(amount)+'\n')};
 if(unknownTime){
  p.manifest.inventory_source.exported_at=null;
  const alignment={format_version:'CURRENT_EFFECTIVE_ALIGNMENT_V1',scope:'CURRENT_EFFECTIVE',source_namespace:p.manifest.source_namespace,inventory_file_sha256:p.manifest.inventory_source.source_file_sha256,inventory_exported_at:null,cutoff_at:p.manifest.inventory_source.cutoff_at,registry_sha256:p.manifest.identity_registry.sha256,document_files:['sales_header','sales_line','sales_settlement','transfer_header','transfer_line'].map(table=>{const{relative_path,bytes,sha256,row_count}=p.manifest.files.find(f=>f.table===table);return{table,relative_path,bytes,sha256,row_count};}),reviewed_by:'SYNTHETIC independent reviewer',review_reference:'SYNTHETIC combined review',alignment_basis:'SYNTHETIC documents match the reviewed inventory cutoff; original export time remains unknown.',decision:'CURRENT_EFFECTIVE_DOCUMENTS_MATCH_INVENTORY_CUTOFF'};
  proofs.alignment=Buffer.from(JSON.stringify(alignment)+'\n');const pin=sha256(proofs.alignment);p.manifest.source_files.push({relative_path:'SYNTHETIC-alignment-review.json',bytes:proofs.alignment.length,sha256:pin});p.manifest.document_cutoff_alignment.evidence_sha256=pin;
 }
 return{p,proofs};
}
const flags={hall:'historical-hall-approval',amount:'historical-line-amount-evidence',alignment:'current-effective-alignment'};
async function scenario(name,options,inspect){
 const f=fixture(options),root=await mkdtemp(join(tmpdir(),'synthetic-unified-history-')),source=join(root,'package'),raw=[];
 try{
  if(options?.mutate)options.mutate(f.p);
  if(options?.mutate)repinSyntheticPackage(f.p);
  await mkdir(source);for(const[path,bytes]of Object.entries(f.p.artifacts)){await mkdir(dirname(join(source,path)),{recursive:true});await writeFile(join(source,path),bytes);}
  const manifest=Buffer.from(JSON.stringify(f.p.manifest)+'\n');await writeFile(join(source,'manifest.json'),manifest);
  const paths={};for(const[k,b]of Object.entries(f.proofs)){paths[k]=join(root,k+'-review.json');await writeFile(paths[k],b);}
  const before=Object.fromEntries(await Promise.all(['manifest.json',...Object.keys(f.p.artifacts)].map(async p=>[p,sha256(await readFile(join(source,p)))])));
  const run=async(mode,label,changes={})=>{
   const report=join(root,mode+'-'+label),args=['tools/unified-import/cli.mjs',mode==='ordinary'?'validate':'stream-preflight','--package',source,'--report',report,'--allow-synthetic'];
   if(mode==='ordinary'&&!changes.noOffline)args.push('--offline');
   if(!changes.noManifest)args.push('--manifest-sha256',changes.manifestPin??sha256(manifest));
   for(const[k,b]of Object.entries(f.proofs))if(!changes.omit?.includes(k)){
    args.push('--'+flags[k],changes.path?.[k]??paths[k]);if(!changes.noPin?.includes(k))args.push('--'+flags[k]+'-sha256',changes.pins?.[k]??sha256(b));
   }
   args.push(...changes.extra??[]);
   const r=spawnSync(process.execPath,args,{encoding:'utf8',maxBuffer:4*1024*1024});
   const result={mode,label,command:[process.execPath,...args],exit_code:r.status,signal:r.signal,stdout:r.stdout,stderr:r.stderr};raw.push(result);
   assert.equal(r.signal,null,JSON.stringify(result));assert.notEqual(r.status,null,JSON.stringify(result));
   const output=JSON.parse(r.stdout);return{...result,output,report};
  };
  await inspect({...f,root,source,paths,run,manifest});
  for(const[path,hash]of Object.entries(before))assert.equal(sha256(await readFile(join(source,path))),hash,'Source file changed: '+path);
 }finally{
  if(process.env.UNIFIED_HISTORY_EVIDENCE_DIR){const saved=join(process.env.UNIFIED_HISTORY_EVIDENCE_DIR,name);await mkdir(saved,{recursive:true});await writeFile(join(saved,'cli-raw-results.json'),JSON.stringify(raw,null,2)+'\n',{flag:'wx'});if(name==='combined-known-positive'||name==='combined-unknown-positive')await cp(root,join(saved,'synthetic-files'),{recursive:true,errorOnExist:true,force:false});}
  await rm(root,{recursive:true,force:true});
 }
}
const passed=r=>{assert.equal(r.exit_code,0,JSON.stringify(r));assert.equal(r.mode==='ordinary'?r.output.valid:r.output.checks_passed,true,JSON.stringify(r.output));assert.equal(r.output.import_eligible,false);};
async function rejectedBoth(run,label,changes={},code){for(const mode of ['ordinary','stream']){const r=await run(mode,label,changes);assert.notEqual(r.exit_code,0,JSON.stringify(r));if(code){const issues=mode==='ordinary'?r.output.issues:JSON.parse('['+(await readFile(join(r.report,'issues.jsonl'),'utf8')).trim().split('\n').filter(Boolean).join(',')+']');assert(issues?.some(i=>i.code===code),JSON.stringify(r));}}}

test('one synthetic new-profile package passes actual ordinary and stream CLI with both reviewed bundles and exact readback',async()=>{
 await scenario('combined-known-positive',{},async({p,run})=>{
  const ordinary=await run('ordinary','accepted'),stream=await run('stream','accepted');passed(ordinary);passed(stream);
  assert.deepEqual(JSON.parse(await readFile(join(ordinary.report,'validation-report.json'),'utf8')),ordinary.output);
  const rows=(await readFile(join(stream.report,'historical-line-amount-differences.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
  assert.deepEqual(rows,ordinary.output.historical_line_amount_differences);assert.equal(rows.length,6);assert.equal(stream.output.historical_line_amount_execution_boundary,'OFFLINE_ARCHIVE_ONLY');
  assert.equal(stream.output.historical_hall_approval.record_count,1);assert.equal(stream.output.historical_hall_approval.utf8,undefined);
  const db=new DatabaseSync(join(stream.report,'index.sqlite'),{readOnly:true});try{
   const head=db.prepare("SELECT fields,historical_hall_evidence FROM facts WHERE entity='sales_header'").get();assert.deepEqual(JSON.parse(head.historical_hall_evidence),p.records.sales_header[0].historical_hall_evidence);assert.equal(JSON.parse(head.fields).hall_id,p.records.sales_header[0].fields.hall_id);
   const lines=db.prepare("SELECT fields FROM facts WHERE entity='sales_line' ORDER BY rowid").all().map(r=>JSON.parse(r.fields));assert.deepEqual(lines.map(l=>[l.quantity,l.deal_price,l.line_amount]),values);
  }finally{db.close();}
 });
});
test('same combined package also preserves unknown export time with separate exact alignment review',async()=>{
 await scenario('combined-unknown-positive',{unknownTime:true,pendingHall:true},async({p,run})=>{
  for(const mode of ['ordinary','stream'])passed(await run(mode,'accepted'));
  assert.equal(p.manifest.inventory_source.exported_at,null);assert.equal(p.records.sales_header[0].fields.hall_id,null);assert.equal(p.records.sales_header[0].historical_hall_evidence.basis,'PENDING_REVIEW');
  await rejectedBoth(run,'no-alignment',{omit:['alignment']},'BASELINE_DOCUMENT_ALIGNMENT_UNPROVEN');
  await rejectedBoth(run,'wrong-alignment-pin',{pins:{alignment:'0'.repeat(64)}});
 });
});
test('combined intake cannot drop either separately reviewed bundle',async()=>{await scenario('missing-bundles',{},async({run})=>{
 await rejectedBoth(run,'missing-hall',{omit:['hall']},'HISTORICAL_HALL_APPROVAL_REQUIRED');await rejectedBoth(run,'missing-amount',{omit:['amount']},'ECONOMIC_DIFFERENCE');
});});
test('wrong pins, missing pins and in-package evidence fail in both actual CLIs',async()=>{await scenario('bad-review-inputs',{},async({run,source,proofs})=>{
 for(const key of ['hall','amount']){await rejectedBoth(run,'wrong-'+key,{pins:{[key]:'0'.repeat(64)}});await rejectedBoth(run,'missing-pin-'+key,{noPin:[key]});const inside=join(source,'inside-'+key+'.json');await writeFile(inside,proofs[key]);await rejectedBoth(run,'inside-'+key,{path:{[key]:inside}});await rm(inside);}
});});
test('changing amounts while keeping old reviewed bytes cannot borrow the hall approval',async()=>{await scenario('changed-amount',{mutate:p=>{p.records.sales_line[0].fields.deal_price='1.02';}},async({run})=>{await rejectedBoth(run,'changed',{},'ECONOMIC_DIFFERENCE');});});
test('changing hall capture or stripping its row proof cannot borrow the amount approval',async()=>{
 await scenario('changed-capture',{mutate:p=>{p.records.warehouse[0].fields.version++;}},async({run})=>{await rejectedBoth(run,'changed',{},'HISTORICAL_HALL_CAPTURE_STALE');});
 await scenario('stripped-hall-row',{mutate:p=>{delete p.records.sales_header[0].historical_hall_evidence;}},async({run})=>{await rejectedBoth(run,'changed',{},'HISTORICAL_HALL_EVIDENCE_REQUIRED');});
});
test('same combined evidence cannot be attached to a legacy schema or a different manifest pin',async()=>{
 await scenario('legacy-downgrade',{mutate:p=>{p.manifest.schema_contract.source_declarations_sha256=SCHEMA_DECLARATIONS_SHA256;for(const r of p.records.staff)delete r.fields.departure_date;}},async({run})=>{await rejectedBoth(run,'changed',{},'HISTORICAL_HALL_PROFILE_REQUIRED');});
 await scenario('manifest-mismatch',{},async({run})=>{await rejectedBoth(run,'wrong-pin',{manifestPin:'0'.repeat(64)});});
});
test('ordinary evidence flags require explicit offline mode and manifest pin and do not accept duplicate or DB options',async()=>{await scenario('ordinary-flag-boundary',{},async({run,paths})=>{
 for(const[label,changes]of [['no-offline',{noOffline:true}],['no-manifest',{noManifest:true}],['duplicate',{extra:['--historical-hall-approval',paths.hall]}],['db-option',{extra:['--connection-file','SYNTHETIC-never-read.json']}]]){const r=await run('ordinary',label,changes);assert.equal(r.exit_code,2,JSON.stringify(r));assert.equal(r.output.code,'INVALID_ARGUMENTS');}
});});
