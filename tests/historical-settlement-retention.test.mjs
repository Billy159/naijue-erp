import '../tools/unified-import/stream-plan.mjs';
import {readPinnedPackageForExecution} from '../tools/unified-import/execution-plan.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {createSyntheticPackage,repinSyntheticPackage} from './fixtures/unified-import/synthetic-package.ts';
import {registryTargetId,validateUnifiedPackage,sha256} from '../packages/application/src/unified-import-contract.ts';
import {readHistoricalSettlementRetentionApproval,historicalSettlementRetentionWire} from '../packages/application/src/unified-historical-settlement-retention.ts';
import {streamPreflight} from '../tools/unified-import/stream-preflight.mjs';
import {prepareStreamPlan} from '../tools/unified-import/stream-plan.mjs';
import {buildStreamProgram} from '../tools/unified-import/stream-program.mjs';
import {executeWholePackage} from '../tools/unified-import/whole-package-client.ts';
import {compileStandardWholePackageProfile} from '../packages/application/src/unified-import-whole-package-profile.ts';
export function fixture(){
 const p=createSyntheticPackage(),namespace=p.manifest.source_namespace;
 const templates=Object.fromEntries(['sales_header','sales_line','sales_settlement'].map(t=>[t,structuredClone(p.records[t][0])]));
 p.registry=p.registry.filter(r=>!['SALES_HEADER','SALES_LINE','SALES_SETTLEMENT'].includes(r.entity_type));
 for(const t of Object.keys(templates))p.records[t]=[];
 const add=(table,key,fields,row)=>{const id=registryTargetId(namespace,table.toUpperCase(),key),r={source_key:key,fields:{...structuredClone(templates[table].fields),...fields,id},source_refs:[{...templates[table].source_refs[0],row}]};p.records[table].push(r);p.registry.push({entity_type:table.toUpperCase(),source_namespace:namespace,canonical_source_key:key,target_id:id,aliases:[],identity_basis:'STABLE_IMPORT_ID_V1',source_refs:structuredClone(r.source_refs)});return r;};
 for(let i=0;i<25;i++){const returned=i>=22,h=add('sales_header','retained-header:'+i,{business_type:returned?'RETURN':'SALE',gross_amount:returned?'-16.00':'16.00',net_due:returned?'-16.00':'16.00'},i+1);add('sales_line','retained-line:'+i,{sales_id:h.fields.id,quantity:returned?'-16':'16',line_amount:returned?'-16.00':'16.00'},i+1);for(let j=0;j<(i<2?2:1);j++)add('sales_settlement','retained-settlement:'+i+':'+j,{sales_id:h.fields.id,line_no:j+1,amount:'1.00',direction:returned?'REFUND':'RECEIVE'},i*2+j+1);}
 for(const t of Object.keys(templates))p.reports['reconciliation.json'].tables[t]={source_rows:p.records[t].length,retained_rows:p.records[t].length,rejected_rows:0};repinSyntheticPackage(p);
 const value={format_version:'HISTORICAL_SETTLEMENT_RETENTION_V1',source_namespace:namespace,evidence_sha256:p.records.sales_header[0].source_refs[0].file_sha256,documents:p.records.sales_header.map(h=>({sales_source_key:h.source_key,sales_id:h.fields.id,source_refs:h.source_refs,...Object.fromEntries(['business_type','status','gross_amount','order_discount','net_due'].map(k=>[k,h.fields[k]])),settlements:p.records.sales_settlement.filter(s=>s.fields.sales_id===h.fields.id)}))};
 const bytes=Buffer.from(JSON.stringify(value)),input={bytes,trustedSha256:sha256(bytes),sourceNamespace:namespace,sourceHashes:new Set(p.manifest.source_files.map(f=>f.sha256))};return {p,value,input,approval:readHistoricalSettlementRetentionApproval(input)};
}
async function both(p,approval,expected){
 repinSyntheticPackage(p);const before=JSON.stringify(p),regular=validateUnifiedPackage(p,{allowSynthetic:true,...(approval?{historicalSettlementRetentionApproval:approval}:{})});const root=await mkdtemp(join(tmpdir(),'retained-settlement-')),source=join(root,'source'),report=join(root,'report');await mkdir(source);
 for(const [path,bytes]of Object.entries(p.artifacts)){await mkdir(dirname(join(source,path)),{recursive:true});await writeFile(join(source,path),bytes);}const manifest=Buffer.from(JSON.stringify(p.manifest));await writeFile(join(source,'manifest.json'),manifest);
 const summary=await streamPreflight(source,report,{expectedManifestSha256:sha256(manifest),allowSynthetic:true,...(approval?{historicalSettlementRetentionApproval:approval}:{})});const issues=(await readFile(join(report,'issues.jsonl'),'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
 assert.equal(regular.valid,expected,JSON.stringify(regular.issues));assert.equal(summary.checks_passed,expected,JSON.stringify(issues));assert.equal(JSON.stringify(p),before);return {summary,report,manifest,source};
}
test('only externally pinned25 headers and27 complete actual settlements retain original approved differences in both preflights',async()=>{const {p,approval}=fixture();await both(p,undefined,false);await both(p,approval,true);assert.equal(p.records.sales_header.length,25);assert.equal(p.records.sales_settlement.length,27);});
test('changed money, direction, original account snapshot, source or type cannot consume the approved set',async()=>{
 for(const mutate of [p=>p.records.sales_settlement[0].fields.amount='1.01',p=>p.records.sales_settlement[0].fields.direction='REFUND',p=>p.records.sales_settlement[0].fields.account_name_snapshot='CHANGED',p=>p.records.sales_header[0].source_refs[0].row++,p=>p.records.sales_header[0].fields.business_type='EXCHANGE',p=>p.records.sales_header[0].fields.stock_basis='RUNTIME_LEDGER']){const {p,approval}=fixture();mutate(p);await both(p,approval,false);}
});
test('proof is a private frozen capability; incorrect external SHA, duplicate, missing or extra facts and proof self-source reject',()=>{
 const {input,approval,value}=fixture();assert.throws(()=>readHistoricalSettlementRetentionApproval({...input,trustedSha256:'0'.repeat(64)}),/HASH/);assert.throws(()=>historicalSettlementRetentionWire(structuredClone(approval)),/UNVERIFIED/);assert(Object.isFrozen(approval.documents[0].settlements[0].fields));
 for(const mutate of [v=>v.documents.pop(),v=>v.documents.push(v.documents[0]),v=>v.documents[1].sales_id=v.documents[0].sales_id,v=>v.documents[0].settlements.pop(),v=>v.evidence_sha256=input.trustedSha256]){const v=structuredClone(value);mutate(v);const bytes=Buffer.from(JSON.stringify(v));assert.throws(()=>readHistoricalSettlementRetentionApproval({...input,bytes,trustedSha256:sha256(bytes)}));}
});
test('ordinary and streaming programs bind the same approved bytes into initialization without changing original document rows or source metadata',async()=>{
 const {p,approval}=fixture(),{summary,report,manifest,source}=await both(p,approval,true),sourcePins=JSON.stringify(p.manifest.source_files);
 const target={protocol:'STANDARD_IMPORT_SQL_V1',system_identifier:'123456789',database_oid:'42',database_name:'synthetic_retained_settlement',catalog_sha256:'a'.repeat(64)},admin={staff_id:registryTargetId(p.manifest.source_namespace,'STAFF','synthetic-initializer'),account_id:registryTargetId(p.manifest.source_namespace,'USER_ACCOUNT','synthetic-admin'),login_name:'SYNTHETIC',staff_name:'SYNTHETIC'};
 const input={pkg:p,manifestBytes:manifest,expectedManifestSha256:sha256(manifest),allowSynthetic:true,target,initialization_identity:admin,historicalSettlementRetentionApproval:approval};
 const program=compileStandardWholePackageProfile(input),loaded=await readPinnedPackageForExecution(source,input);assert.equal(loaded.historicalSettlementRetentionApproval,approval);assert.deepEqual(compileStandardWholePackageProfile({...loaded,initialization_identity:admin}),program);const plan=await prepareStreamPlan(join(report,'index.sqlite'),summary,manifest,input);
 try{const streamed=await buildStreamProgram(plan,join(report,'index.sqlite'),summary,admin);assert.equal(plan.planHash,program.plan_sha256);assert.deepEqual(streamed.initialize,program.initialize);assert.throws(()=>compileStandardWholePackageProfile({...input,historicalSettlementRetentionApproval:structuredClone(approval)}),/PREFLIGHT_REJECTED/);assert.deepEqual(program.initialize.payload.historical_settlement_retention_approval,historicalSettlementRetentionWire(approval));assert.deepEqual(streamed.initialize.payload.historical_settlement_retention_approval,program.initialize.payload.historical_settlement_retention_approval);assert.equal(JSON.stringify(p.manifest.source_files),sourcePins);await assert.rejects(()=>prepareStreamPlan(join(report,'index.sqlite'),summary,manifest,{...input,historicalSettlementRetentionApproval:undefined}),/BINDING/);}finally{await plan.dispose();}
});

test('approved25 initialization survives the original same-client coordinator; rejected migration rolls back, exact replay does not reapply (controlled-client model, no PG)',async()=>{
 const {p,approval}=fixture(),manifest=Buffer.from(JSON.stringify(p.manifest)),admin={staff_id:registryTargetId(p.manifest.source_namespace,'STAFF','synthetic-initializer'),account_id:registryTargetId(p.manifest.source_namespace,'USER_ACCOUNT','synthetic-admin'),login_name:'SYNTHETIC',staff_name:'SYNTHETIC'},target={protocol:'STANDARD_IMPORT_SQL_V1',system_identifier:'123456789',database_oid:'42',database_name:'synthetic_retained_settlement',catalog_sha256:'a'.repeat(64)};
 const program=compileStandardWholePackageProfile({pkg:p,manifestBytes:manifest,expectedManifestSha256:sha256(manifest),allowSynthetic:true,target,initialization_identity:admin,historicalSettlementRetentionApproval:approval});
 const id={batchId:program.initialize.batch_id,documentBatchId:program.initialize.payload.document_batch_id,packageSha256:program.initialize.package_manifest_sha256,planSha256:program.initialize.plan_sha256,namespace:program.initialize.namespace,cutoffAt:program.initialize.cutoff_at};
 for(const mode of ['normal','migration-rejected','replay','conflicting-replay']){
  const calls=[],client={async query(sql){calls.push(sql);return {command:sql.startsWith('BEGIN')?'BEGIN':sql.startsWith('SET')?'SET':sql};},discard(){throw Error('UNEXPECTED_DISCARD');}};let writes=0;
  const kernel={async lockAndInspect(c,identity,initial){assert.equal(c,client);assert.deepEqual(initial.payload.historical_settlement_retention_approval,historicalSettlementRetentionWire(approval));return mode.includes('replay')?{state:'COMMITTED',packageSha256:id.packageSha256,planSha256:mode==='conflicting-replay'?'0'.repeat(64):id.planSha256,summary:{}}:{state:'ABSENT'};},async initialize(c){assert.equal(c,client);writes++;},async applyStep(c,step){assert.equal(c,client);writes++;if(mode==='migration-rejected'&&step.request.payload.mode==='CHUNK')throw Error('HISTORICAL_SETTLEMENT_MIGRATION_SOURCE_DIFFERS');},async summarize(){return {};}};
  async function* steps(){yield* program.steps;}
  const result=await executeWholePackage(client,id,program.initialize,steps(),kernel);
  assert.equal(result.state,mode==='replay'?'ALREADY_COMMITTED':mode==='normal'?'COMMITTED':'ROLLED_BACK');
  assert.equal(calls.filter(x=>x==='ROLLBACK').length,mode==='migration-rejected'||mode==='conflicting-replay'?1:0);assert.equal(calls.filter(x=>x==='COMMIT').length,mode==='normal'||mode==='replay'?1:0);if(mode.includes('replay'))assert.equal(writes,0);
 }
});

test('24/26 accepts only the fixed prior economic identity set; locators alone may change (explicit synthetic identity-anchor model)',async()=>{
 const {value,input}=fixture(),v=structuredClone(value);v.documents.pop();
 const {canonicalRequestValue}=await import('../packages/application/src/canonical-request-value.ts');
 const economic=x=>({source_namespace:x.source_namespace,documents:x.documents.map(({source_refs,settlements,...d})=>({...d,settlements:settlements.map(({source_refs,...r})=>r).sort((a,b)=>a.fields.id.localeCompare(b.fields.id))})).sort((a,b)=>a.sales_id.localeCompare(b.sales_id))});
 const anchor=sha256(canonicalRequestValue(economic(v))),url=new URL('../packages/application/src/unified-historical-settlement-retention.ts',import.meta.url),{stripTypeScriptTypes}=await import('node:module');
 let source=await readFile(url,'utf8');source=source.replace(/const CURRENT_APPROVED_SUBSET_FACTS_SHA256='[a-f0-9]+';/,`const CURRENT_APPROVED_SUBSET_FACTS_SHA256='${anchor}';`);source=stripTypeScriptTypes(source,{mode:'transform'}).replace(/(['"])(\.\.?\/[^'"\n]+)\1/g,(_,q,path)=>JSON.stringify(new URL(path,url).href));
 const api=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const read=x=>{const bytes=Buffer.from(JSON.stringify(x));return api.readHistoricalSettlementRetentionApproval({...input,bytes,trustedSha256:sha256(bytes)});};
 assert.throws(()=>readHistoricalSettlementRetentionApproval({...input,bytes:Buffer.from(JSON.stringify(v)),trustedSha256:sha256(JSON.stringify(v))}),/EXACT_SET/,'a different 24-fact set cannot self-authorize by recomputing its raw hash');
 const a=read(v);assert.equal(a.documents.length,24);assert.equal(a.documents.reduce((n,d)=>n+d.settlements.length,0),26);
 const relocated=structuredClone(v);relocated.documents[0].source_refs[0].row++;assert.equal(read(relocated).documents.length,24);
 for(const mutate of [x=>x.documents[0].sales_id='11000000-0000-0000-0000-000000000001',x=>x.documents[0].net_due='17.00',x=>x.documents[0].settlements[0].fields.amount='1.01',x=>x.documents[0].settlements[0].fields.id='12000000-0000-0000-0000-000000000001']){const bad=structuredClone(v);mutate(bad);assert.throws(()=>read(bad));}
});
