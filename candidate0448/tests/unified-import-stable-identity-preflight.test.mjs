import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm}from'node:fs/promises';import{join,dirname}from'node:path';import{tmpdir}from'node:os';
import{createSyntheticPackage,repinSyntheticPackage}from'./fixtures/unified-import/synthetic-package.ts';
import{validateUnifiedPackage,registryTargetId,sha256}from'../packages/application/src/unified-import-contract.ts';
import{createSkuImportIdentity,createLineImportIdentity,STABLE_SOURCE_KEY_PREFIX}from'../packages/application/src/unified-import-stable-identity.ts';
import{streamPreflight}from'../tools/unified-import/stream-preflight.mjs';
function fixture(bad=false){const p=createSyntheticPackage(),old=p.registry.find(r=>r.entity_type==='SKU'),dimensions=Object.fromEntries(['PRODUCT','COLOR','FIT','SIZE'].map(e=>[e.toLowerCase(),p.registry.find(r=>r.entity_type===e)]));const generated=createSkuImportIdentity({source_namespace:p.manifest.source_namespace,dimensions,enabled:true,source_refs:old.source_refs});if(bad){const a=JSON.parse(generated.identity.canonical_source_key.slice(STABLE_SOURCE_KEY_PREFIX.length));a[4]='missing-original-size';generated.identity.canonical_source_key=STABLE_SOURCE_KEY_PREFIX+JSON.stringify(a);generated.identity.target_id=registryTargetId(p.manifest.source_namespace,'SKU',generated.identity.canonical_source_key);generated.fields.id=generated.identity.target_id;}
 const id=old.target_id;p.registry[p.registry.indexOf(old)]=generated.identity;for(const rows of Object.values(p.records))for(const r of rows)for(const[k,v]of Object.entries(r.fields))if(v===id)r.fields[k]=generated.identity.target_id;const row=p.records.sku[0];row.source_key=generated.identity.canonical_source_key;row.fields={...generated.fields};return repinSyntheticPackage(p);}
async function stream(p,inspect){const dir=await mkdtemp(join(tmpdir(),'stable-identity-'));try{const root=join(dir,'input');await mkdir(root);for(const[path,bytes]of Object.entries(p.artifacts)){await mkdir(dirname(join(root,path)),{recursive:true});await writeFile(join(root,path),bytes);}const bytes=Buffer.from(JSON.stringify(p.manifest)+'\n');await writeFile(join(root,'manifest.json'),bytes);const summary=await streamPreflight(root,join(dir,'report'),{expectedManifestSha256:sha256(bytes),allowSynthetic:true});if(inspect)await inspect(join(dir,'report'),summary,bytes);return{summary,issues:(await readFile(join(dir,'report','issues.jsonl'),'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse)};}finally{await rm(dir,{recursive:true,force:true});}}
test('ordinary intake rejects a derived key whose dimension cannot resolve',()=>{const r=validateUnifiedPackage(fixture(true),{allowSynthetic:true});assert.equal(r.valid,false);assert.ok(r.issues.some(i=>i.code==='STABLE_IDENTITY_REFERENCE_MISSING'));});
test('stream intake rejects the same derived-key reference mismatch',async()=>{const r=await stream(fixture(true));assert.equal(r.summary.checks_passed,false);assert.ok(r.issues.some(i=>i.code==='STABLE_IDENTITY_REFERENCE_MISSING'));});
test('ordinary and stream accept generated existing-field records and legacy keys',async()=>{for(const p of [fixture(),createSyntheticPackage()]){assert.equal(validateUnifiedPackage(p,{allowSynthetic:true}).valid,true);const r=await stream(p);assert.equal(r.summary.checks_passed,true,JSON.stringify(r.issues));}});

test('both intake paths retain equal business details under separate permanent occurrence IDs after reorder',async()=>{
 const p=createSyntheticPackage(),header=p.registry.find(r=>r.entity_type==='SALES_HEADER'),old=p.registry.find(r=>r.entity_type==='SALES_LINE'),template=p.records.sales_line[0];
 p.registry=p.registry.filter(r=>r!==old);
 p.records.sales_line=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'].map((id,i)=>{
  const identity=createLineImportIdentity({source_namespace:p.manifest.source_namespace,entity_type:'SALES_LINE',header,basis:'PERSISTED_LEDGER_ID',original_id:id,source_refs:template.source_refs});p.registry.push(identity);
  return{source_key:identity.canonical_source_key,source_refs:structuredClone(template.source_refs),fields:{...template.fields,id:identity.target_id,line_no:i+1,quantity:'8',line_amount:'8.00'}};
 });
 p.reports['reconciliation.json'].tables.sales_line={source_rows:2,retained_rows:2,rejected_rows:0};
 for(let n=0;n<2;n++){if(n)p.records.sales_line.reverse();repinSyntheticPackage(p);const full=validateUnifiedPackage(p,{allowSynthetic:true});assert.equal(full.valid,true,JSON.stringify(full.issues));const result=await stream(p);assert.equal(result.summary.checks_passed,true,JSON.stringify(result.issues));assert.equal(result.summary.counts.sales_line,2);}
});

async function assertBoth(p,valid,code){repinSyntheticPackage(p);const ordinary=validateUnifiedPackage(p,{allowSynthetic:true});assert.equal(ordinary.valid,valid,JSON.stringify(ordinary.issues));const streaming=await stream(p);assert.equal(streaming.summary.checks_passed,valid,JSON.stringify(streaming.issues));if(code){assert.ok(ordinary.issues.some(i=>i.code===code),JSON.stringify(ordinary.issues));assert.ok(streaming.issues.some(i=>i.code===code),JSON.stringify(streaming.issues));}}
function derivedLine(p,table){const entity=table==='sales_line'?'SALES_LINE':'TRANSFER_LINE',headerEntity=table==='sales_line'?'SALES_HEADER':'TRANSFER_HEADER';const header=p.registry.find(r=>r.entity_type===headerEntity),old=p.registry.find(r=>r.entity_type===entity),row=p.records[table][0];const identity=createLineImportIdentity({source_namespace:p.manifest.source_namespace,entity_type:entity,header,basis:'ORIGINAL_ID',original_id:'原明细"|:😀\\01',source_refs:row.source_refs});p.registry[p.registry.indexOf(old)]=identity;row.source_key=identity.canonical_source_key;row.fields.id=identity.target_id;return row;}
test('both intake paths reject a valid-shaped but wrong dimension UUID',async()=>{const p=fixture();p.records.sku[0].fields.size_id=p.registry.find(r=>r.entity_type==='COLOR').target_id;await assertBoth(p,false,'STABLE_IDENTITY_REFERENCE_MISMATCH');});
for(const [table,field]of [['sales_line','sales_id'],['transfer_line','transfer_id']]){
 test(`both intake paths accept ${table} permanent quoted Unicode identities`,async()=>{const p=createSyntheticPackage();derivedLine(p,table);await assertBoth(p,true);});
 test(`both intake paths reject ${table} wrong parent UUID`,async()=>{const p=createSyntheticPackage();const row=derivedLine(p,table);row.fields[field]=p.registry.find(r=>r.entity_type==='SKU').target_id;await assertBoth(p,false,'STABLE_IDENTITY_REFERENCE_MISMATCH');});
}
test('both intake paths resolve quoted delimiter and Unicode dimension keys exactly',async()=>{
 const p=fixture(),size=p.registry.find(r=>r.entity_type==='SIZE'),oldSizeId=size.target_id;
 size.canonical_source_key='裤组"|:[]😀\\é/e\u0301:910';size.target_id=registryTargetId(p.manifest.source_namespace,'SIZE',size.canonical_source_key);
 p.records.size[0].source_key=size.canonical_source_key;
 for(const rows of Object.values(p.records))for(const row of rows)for(const[k,v]of Object.entries(row.fields))if(v===oldSizeId)row.fields[k]=size.target_id;
 const old=p.registry.find(r=>r.entity_type==='SKU');const generated=createSkuImportIdentity({source_namespace:p.manifest.source_namespace,dimensions:Object.fromEntries(['PRODUCT','COLOR','FIT','SIZE'].map(e=>[e.toLowerCase(),p.registry.find(r=>r.entity_type===e)])),enabled:true,source_refs:old.source_refs});
 p.registry[p.registry.indexOf(old)]=generated.identity;
 for(const rows of Object.values(p.records))for(const row of rows)for(const[k,v]of Object.entries(row.fields))if(v===old.target_id)row.fields[k]=generated.identity.target_id;
 p.records.sku[0].source_key=generated.identity.canonical_source_key;p.records.sku[0].fields=generated.fields;
 await assertBoth(p,true);
});

function derivedSettlements(p){
 const header=p.registry.find(r=>r.entity_type==='SALES_HEADER');
 p.registry=p.registry.filter(r=>r.entity_type!=='SALES_SETTLEMENT');
 p.records.sales_settlement.forEach((row,i)=>{
  // Persisted occurrence UUIDs are source facts, independent of row order/business content.
  const original_id=`11111111-1111-4111-8111-${String(i+1).padStart(12,'0')}`;
  const identity=createLineImportIdentity({source_namespace:p.manifest.source_namespace,entity_type:'SALES_SETTLEMENT',header,basis:'PERSISTED_LEDGER_ID',original_id,source_refs:row.source_refs});
  p.registry.push(identity);row.source_key=identity.canonical_source_key;row.fields.id=identity.target_id;
 });return p.records.sales_settlement;
}
test('both intake paths preserve duplicate settlement business occurrences through reorder and provenance changes',async()=>{
 const p=createSyntheticPackage(),rows=derivedSettlements(p),before=new Map(rows.map(r=>[r.source_key,r.fields.id]));
 await assertBoth(p,true);
 rows.reverse();rows.forEach((row,i)=>{row.fields.line_no=i+1;row.source_refs[0].row=100+i;});
 await assertBoth(p,true);assert.equal(before.size,16);
 rows.forEach(row=>assert.equal(row.fields.id,before.get(row.source_key)));
});
test('both intake paths reject settlement wrong parent and missing parent key',async()=>{
 const p=createSyntheticPackage();derivedSettlements(p)[0].fields.sales_id=p.registry.find(r=>r.entity_type==='TRANSFER_HEADER').target_id;
 await assertBoth(p,false,'STABLE_IDENTITY_REFERENCE_MISMATCH');
 const q=createSyntheticPackage(),row=derivedSettlements(q)[0],entry=q.registry.find(r=>r.target_id===row.fields.id),parts=JSON.parse(entry.canonical_source_key.slice(STABLE_SOURCE_KEY_PREFIX.length));
 parts[1]='missing-parent';entry.canonical_source_key=STABLE_SOURCE_KEY_PREFIX+JSON.stringify(parts);entry.target_id=registryTargetId(q.manifest.source_namespace,'SALES_SETTLEMENT',entry.canonical_source_key);row.source_key=entry.canonical_source_key;row.fields.id=entry.target_id;
 await assertBoth(q,false,'STABLE_IDENTITY_REFERENCE_MISSING');
});
test('both intake paths reject duplicate settlement permanent occurrence identity',async()=>{
 const p=createSyntheticPackage(),rows=derivedSettlements(p);rows[1].source_key=rows[0].source_key;rows[1].fields.id=rows[0].fields.id;
 await assertBoth(p,false);
});

test('ordinary and stream import programs/readback preserve settlement IDs, source keys and replay record IDs',async()=>{
 const {compileStandardWholePackageProfile}=await import('../packages/application/src/unified-import-whole-package-profile.ts');
 const {stableImportId}=await import('../packages/application/src/inventory-cutoff-import.ts');
 const {prepareStreamPlan}=await import('../tools/unified-import/stream-plan.mjs');
 const {buildStreamProgram}=await import('../tools/unified-import/stream-program.mjs');
 const {DatabaseSync}=await import('node:sqlite');
 const p=createSyntheticPackage(),rows=derivedSettlements(p);
 // Existing verified target IDs must not be recalculated/migrated by either compiler.
 const persisted=rows[0],entry=p.registry.find(r=>r.target_id===persisted.fields.id);
 entry.identity_basis='EXISTING_VERIFIED';entry.target_id='99999999-9999-4999-8999-999999999999';persisted.fields.id=entry.target_id;
 repinSyntheticPackage(p);
 const admin={staff_id:stableImportId('SYNTHETIC_V2_COMPAT','staff'),account_id:stableImportId('SYNTHETIC_V2_COMPAT','account'),login_name:'synthetic-v1-compat',staff_name:'SYNTHETIC V1 compatibility ADMIN'};
 const target={protocol:'STANDARD_IMPORT_SQL_V1',system_identifier:'123456789',database_oid:'42',database_name:'synthetic_offline_v2',catalog_sha256:'a'.repeat(64)};
 const expected=new Map(rows.map(row=>[row.source_key,row.fields.id]));let first;
 for(let attempt=0;attempt<2;attempt++){
  if(attempt){rows.reverse();rows.forEach((r,i)=>{r.fields.line_no=i+1;});repinSyntheticPackage(p);}
  await stream(p,async(report,summary,bytes)=>{
   assert.equal(summary.checks_passed,true);
   const ordinary=compileStandardWholePackageProfile({pkg:p,manifestBytes:bytes,expectedManifestSha256:sha256(bytes),allowSynthetic:true,target,initialization_identity:admin});
   const plan=await prepareStreamPlan(join(report,'index.sqlite'),summary,bytes,{target,initialization_identity:admin,allowSynthetic:true});
   try{
    const program=await buildStreamProgram(plan,join(report,'index.sqlite'),summary,admin),actual=[];
    for await(const step of program.steps)actual.push(step);
    assert.deepEqual(actual,ordinary.steps);
    const settlements=actual.flatMap(step=>step.request.payload.rows??[]).filter(row=>row.entity_type==='SALES_SETTLEMENT');
    assert.equal(settlements.length,16);assert.equal(new Set(settlements.map(r=>r.record_id)).size,16);
    for(const row of settlements){assert.equal(row.target_id,expected.get(row.source_key));assert.equal(row.fields.id,row.target_id);assert.equal(row.record_id,stableImportId('standard-import-record-v1',p.manifest.source_namespace,'SALES_SETTLEMENT',row.source_key));}
    const identities=settlements.map(r=>[r.source_key,r.target_id,r.record_id]).sort((a,b)=>a[0].localeCompare(b[0]));
    if(first)assert.deepEqual(identities,first);else first=identities;
    const db=new DatabaseSync(join(report,'index.sqlite'),{readOnly:true});try{
     const readback=db.prepare("SELECT source_key,fields FROM facts WHERE entity='sales_settlement'").all();assert.equal(readback.length,16);
     for(const row of readback)assert.equal(JSON.parse(row.fields).id,expected.get(row.source_key));
    }finally{db.close();}
   }finally{await plan.dispose();}
  });
 }
});
