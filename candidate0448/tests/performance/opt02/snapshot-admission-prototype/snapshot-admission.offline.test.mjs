/** Pure SQL-text/control-flow/relational MODELS. No SQL executed, no PG or
 * snapshot/issuer/stock/performance authority. Actual differential plans pending. */
import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {createPrototypeSources,prototypeStatements,runPrototypeSnapshot,assertExactUnchangedPage,SOURCE_PINS} from './snapshot-admission.mjs';
import {COMPLETE_SCOPE_DECISION} from '../../../../packages/application/src/inventory-cutoff-import.ts';
import {checkedInventoryKeyAdmission} from '../../../../packages/application/src/inventory-key-admission.ts';
const reader=await readFile(new URL('../../../../adapters/postgres/src/product-management-query-reader.ts',import.meta.url),'utf8');
const admission=await readFile(new URL('../../../../adapters/postgres/migrations/0023_inventory_key_admission.sql',import.meta.url),'utf8');
const sources=createPrototypeSources({readerSourceText:reader,admissionSourceText:admission});
const flags={retainedDelete:true,seasonArray:true},sql=prototypeStatements(sources,flags);
const id=n=>'00000000-0000-4000-a000-'+String(n).padStart(12,'0'),batch=id(1),warehouse=id(2),sku=id(3),operation=id(4);
const parameters=()=>({page:1,pageSize:100,filter:{productIds:[],categoryIds:[],years:[],seasonIds:[],supplierIds:[],fitIds:[],thicknesses:[],shapeCodes:[]}});
function fixture(change=()=>{}){
 const state={publications:[{id:batch,completed:true,final_approval:true,checkpoint:{sequence:3,cursor:10,counts:{WAREHOUSE:2,SKU:3,INVENTORY_LEDGER:4,IMPORT_BATCH:1},expected:{WAREHOUSE:2,SKU:3,INVENTORY_LEDGER:4,IMPORT_BATCH:1}}}],guards:true,
  coverage:{uncovered_warehouse:true,uncovered_sku:true,invalid_size:false,missing_sizes:false,invalid_balance:false},cutoffWitness:[{id:sku}],nativeWitness:[{id:sku,created_operation_id:operation}],warehouseWitness:[{id:warehouse}],warehouseProof:[{identity_count:'2',first_issue:null}],skuProof:[{identity_count:'101',first_issue:null}]};change(state);
 const calls=[],controller=new AbortController();const query=async(text,values=[])=>{calls.push({text,values:structuredClone(values)});
  if(text===sql.publication)return{rows:state.publications};if(text===sql.guards)return{rows:[{integrity_guards_present:state.guards}]};if(text===sql.coverage)return{rows:[state.coverage]};
  if(text===sql.skuWitness)return{rows:state.cutoffWitness};if(text===sql.nativeSkuWitness)return{rows:state.nativeWitness};if(text===sql.warehouseWitness)return{rows:state.warehouseWitness};if(text===sql.warehouses)return{rows:state.warehouseProof};if(text===sql.skus)return{rows:state.skuProof};assert.fail('UNENUMERATED_PROTOTYPE_SQL');};
 return{state,calls,controller,input:{sources,query,signal:controller.signal,grant:{kind:'all',totalStock:'all-warehouses'},parameters:parameters(),...flags,runtime26Present:true}};
}
test('source-only bundle pins exact oldreader/admission and cannot accept drift/copy/arbitrarySQL',()=>{
 assert.match(SOURCE_PINS.reader,/^[a-f0-9]{64}$/);assert.throws(()=>createPrototypeSources({readerSourceText:reader+' ',admissionSourceText:admission}));
 assert.throws(()=>createPrototypeSources({readerSourceText:reader,admissionSourceText:admission+' '}));assert.throws(()=>prototypeStatements({...sources},flags));assert.throws(()=>prototypeStatements(sources,{...flags,seasonArray:1}));
});
test('matchedscope is source-derived entire filter/grant scope, never page IDs/LIMIT or lowerpagecap',()=>{
 for(const retainedDelete of [false,true])for(const seasonArray of [false,true]){const q=prototypeStatements(sources,{retainedDelete,seasonArray});
  assert.equal(q.coverage.includes('p.deleted_at IS NULL'),retainedDelete);assert.equal(q.skus.includes('p.season_ids && $6::uuid[]'),seasonArray);
  assert.match(q.skus,/sku s JOIN matched_products p ON p.id=s.product_id/);assert.doesNotMatch(q.skus.slice(0,q.skus.indexOf('), warehouse_witness AS MATERIALIZED')),/\bLIMIT\b|\bOFFSET\b/); // Original first-issue LIMIT1 below remains mandatory.assert.doesNotMatch(q.skus,/\$\{/);
 }
});
test('set SQL retains every source dimension/relation and original firstissue aggregator; no repeated publication/keyfunction',()=>{
 for(const q of [sql.warehouses,sql.skus]){
  assert.match(q,/admission_decisions AS MATERIALIZED/);assert.match(q,/native_creation_operation_valid/);assert.match(q,/size_group_member/);
  for(const table of ['warehouse','hall','sku','product','color','fit','size','import_record'])assert.ok(q.includes('naijue_erp.'+table),table);
  assert.doesNotMatch(q,/naijue_erp\.inventory_key_admission\s*\(|naijue_erp\.import_batch|checkpoint|FINAL_COMPLETE_SCOPE/);
  assert.match(q,/ORDER BY legacy_batch,shape_priority,ordinal LIMIT 1/);assert.match(q,/\(u.ordinal-1\)\/1000/);
  assert.doesNotMatch(q,/\b(?:w|h|s|c|f|z)\.enabled\b/); // Do not invent stricter admission than original function.
 }
 for(const q of [sql.warehouses,sql.skus]){assert.match(q,/LEFT JOIN admission_decisions a ON a.key_id=u.id GROUP BY u.ordinal/);assert.match(q,/count\(a.key_id\) AS decision_count/);assert.doesNotMatch(q,/CROSS JOIN LATERAL|WHERE a.key_id=u.id/);}
 assert.equal(sources.originalWarehouse.slice(sources.originalWarehouse.indexOf('), issues AS (')),sql.warehouses.slice(sql.warehouses.indexOf('), issues AS (')));
 assert.equal(sources.originalSku.slice(sources.originalSku.indexOf('), issues AS (')),sql.skus.slice(sql.skus.indexOf('), issues AS (')));
});
test('both dimension proof branches share one originalpublication/checkpoint/guard in one flow, no zero value or authority',async()=>{
 const f=fixture(),result=await runPrototypeSnapshot(f.input);assert.equal(f.calls.filter(c=>c.text===sql.publication).length,1);assert.equal(f.calls.filter(c=>c.text===sql.guards).length,1);
 assert.deepEqual(f.calls[0].values,[COMPLETE_SCOPE_DECISION]);assert.equal(result.stockValue,null);assert.equal(result.actualSnapshotProved,false);assert.equal(result.authority,'NONE');
 assert.equal(f.calls.find(c=>c.text===sql.warehouses).values[0],batch);assert.equal(f.calls.find(c=>c.text===sql.skus).values[10],batch);
});
test('separate flows never reuse prior publication result, and witnessbasis/operation/parameterorder stays exact',async()=>{
 const f=fixture(s=>s.cutoffWitness=[]);await runPrototypeSnapshot(f.input);
 assert.deepEqual(f.calls.find(c=>c.text===sql.warehouses).values,[batch,sku,'POST_CUTOFF_CREATED',operation]);
 f.state.publications=[];await assert.rejects(runPrototypeSnapshot(f.input),{code:'PRODUCT_MANAGEMENT_STOCK_NOT_READY'});assert.equal(f.calls.filter(c=>c.text===sql.publication).length,2);
 const g=fixture(),ids=[id(11),id(12)];g.input.grant={kind:'products',productIds:ids,totalStock:'all-warehouses'};g.input.parameters.filter.years=['2026'];await runPrototypeSnapshot(g.input);
 assert.deepEqual(g.calls.find(c=>c.text===sql.coverage).values,[false,ids,[],[],['2026'],[],[],[],[],[],batch]);
});
test('unpublished/duplicate/incomplete/finalapproval and checkpoint failures refuse in original category, not stock0',async()=>{
 for(const [change,code]of [
  [s=>s.publications=[],'PRODUCT_MANAGEMENT_STOCK_NOT_READY'],[s=>s.publications.push(structuredClone(s.publications[0])),'PRODUCT_MANAGEMENT_INTEGRITY_FAILED'],
  [s=>s.publications[0].completed=false,'PRODUCT_MANAGEMENT_INTEGRITY_FAILED'],[s=>s.publications[0].final_approval=false,'PRODUCT_MANAGEMENT_INTEGRITY_FAILED'],
  [s=>s.publications[0].checkpoint.counts.SKU=2,'PRODUCT_MANAGEMENT_INTEGRITY_FAILED'],[s=>s.publications[0].checkpoint.cursor=9,'PRODUCT_MANAGEMENT_INTEGRITY_FAILED'],
  [s=>s.publications[0].checkpoint.expected.IMPORT_BATCH=2,'INVALID_IMPORT_COUNTS'],[s=>s.publications[0].checkpoint.extra=true,'INVALID_DATABASE_VALUE']]){
  const f=fixture(change);await assert.rejects(runPrototypeSnapshot(f.input),{code});assert.equal(f.calls.length,1);
 }
});
test('missingguards and metadata absence keep old rejection order ahead of qualifyingqueries',async()=>{
 const f=fixture(s=>s.guards=false);await assert.rejects(runPrototypeSnapshot(f.input),{code:'PRODUCT_MANAGEMENT_INTEGRITY_FAILED'});assert.equal(f.calls.length,2);
 const g=fixture();g.input.runtime26Present=false;await assert.rejects(runPrototypeSnapshot(g.input),{code:'PRODUCT_MANAGEMENT_STOCK_NOT_READY'});assert.equal(g.calls.length,3);
});
test('bad relationships/missinggroups/badbalance still refuse; qualification firstissue preserves original category/priority',async()=>{
 for(const field of ['invalid_size','missing_sizes','invalid_balance']){const f=fixture(s=>s.coverage[field]=true);await assert.rejects(runPrototypeSnapshot(f.input),{code:'PRODUCT_MANAGEMENT_INTEGRITY_FAILED'});}
 for(const [issue,code]of [['NOT_READY','PRODUCT_MANAGEMENT_STOCK_NOT_READY'],['INTEGRITY','PRODUCT_MANAGEMENT_INTEGRITY_FAILED'],['unknown','PRODUCT_MANAGEMENT_INTEGRITY_FAILED']]){
  const f=fixture(s=>{s.warehouseProof[0].first_issue=issue;s.coverage.invalid_size=true;});await assert.rejects(runPrototypeSnapshot(f.input),{code});assert.equal(f.calls.some(c=>c.text===sql.skus),false);
 }
});
test('empty/duplicate/malformed aggregate or witness never count as admission/zero',async()=>{
 for(const change of [s=>s.warehouseProof=[],s=>s.warehouseProof.push({...s.warehouseProof[0]}),s=>s.warehouseProof[0].identity_count='0',s=>s.skuProof[0].identity_count=101,
  s=>{s.cutoffWitness=[];s.nativeWitness=[];},s=>s.warehouseWitness=[]])await assert.rejects(runPrototypeSnapshot(fixture(change).input));
});
test('query errors propagate identical and stop followup; no fake zero/error fallback/retry',async()=>{
 const f=fixture(),original=Object.assign(new Error('actual query failed'),{code:'42501'}),q=f.input.query;
 f.input.query=async(text,values)=>{if(text===sql.coverage)throw original;return q(text,values);};await assert.rejects(runPrototypeSnapshot(f.input),e=>e===original);assert.equal(f.calls.length,2);
});
test('precancel0SQL and pending cancellation block late results and subsequent work without changing driver deadline',async()=>{
 const f=fixture();f.controller.abort();await assert.rejects(runPrototypeSnapshot(f.input),{code:'PRODUCT_MANAGEMENT_READ_ABORTED'});assert.equal(f.calls.length,0);
 const g=fixture();let release;const pending=new Promise(r=>release=r);g.input.query=(text,values)=>{g.calls.push({text,values});return pending;};
 const attempt=runPrototypeSnapshot(g.input);await Promise.resolve();await Promise.resolve();g.controller.abort();await assert.rejects(attempt,{code:'PRODUCT_MANAGEMENT_READ_ABORTED'});
 release({rows:g.state.publications});await Promise.resolve();assert.equal(g.calls.length,1);
});
function page(){return{page:1,pageSize:100,exactTotal:3,items:[['a','16','1.25'],['b','5','2.50'],['c','0','19.99']].map(([code,totalStock,retailPrice],i)=>({id:id(30+i),code,name:code,categoryLabel:null,year:null,seasonLabel:null,supplierLabel:null,fits:[],thickness:null,retailPrice,totalStock}))};}
test('original fullpage comparator preserves ordering/all exact quantities/money/counts and unknown !=zero',()=>{
 const before=page();assert.doesNotThrow(()=>assertExactUnchangedPage(before,structuredClone(before)));
 for(const change of [p=>p.items.reverse(),p=>p.items[0].totalStock='17',p=>p.items[2].retailPrice='20.00',p=>p.exactTotal=4,p=>p.items.pop(),p=>p.items[2].totalStock=null]){const after=structuredClone(before);change(after);assert.throws(()=>assertExactUnchangedPage(before,after));}
 const unknown=page();unknown.items[2].totalStock=null;assert.doesNotThrow(()=>assertExactUnchangedPage(unknown,structuredClone(unknown)));const invented=structuredClone(unknown);invented.items[2].totalStock='0';assert.throws(()=>assertExactUnchangedPage(unknown,invented));
});
// Independent finite relational models only. They make separability testable;
// they DO NOT execute or prove the emitted SQL or native helper's actual result.
const whs=[{id:id(101),exists:true,hall:true,cutoff:true,op:null,native:false},{id:id(102),exists:true,hall:true,cutoff:false,op:id(201),native:true},{id:id(103),exists:true,hall:false,cutoff:false,op:id(202),native:true}];
const skus=[{id:id(301),exists:true,relations:true,size:true,cutoff:true,op:null,native:false},{id:id(302),exists:true,relations:true,size:true,cutoff:false,op:id(401),native:true},{id:id(303),exists:true,relations:true,size:false,cutoff:false,op:id(402),native:true},{id:id(304),exists:true,relations:true,size:true,cutoff:false,op:id(403),native:false},{id:id(305),exists:true,relations:false,size:true,cutoff:true,op:null,native:false}];
function originalKeyModel(w,s){const r={admitted:false,published_batch_id:batch,warehouse_basis:null,sku_basis:null,warehouse_created_operation_id:null,sku_created_operation_id:null};
 if(!w?.exists||!w.hall)return r;r.warehouse_created_operation_id=w.op;if(!s?.exists||!s.relations)return r;r.sku_created_operation_id=s.op;if(!s.size)return r;
 if(w.cutoff)r.warehouse_basis='CUTOFF_MEMBER';else if(w.native)r.warehouse_basis='POST_CUTOFF_CREATED';
 if(s.cutoff)r.sku_basis='CUTOFF_MEMBER';else if(s.native)r.sku_basis='POST_CUTOFF_CREATED';r.admitted=r.warehouse_basis!==null&&r.sku_basis!==null;return r;}
function setModel(ws,ss){const warehouses=ws.map(w=>({raw:w,valid:!!w?.exists&&w.hall,basis:w?.cutoff?'CUTOFF_MEMBER':w?.native?'POST_CUTOFF_CREATED':null}));
 const specs=ss.map(s=>({raw:s,exists:!!s?.exists&&s.relations,valid:!!s?.exists&&s.relations&&s.size,basis:s?.cutoff?'CUTOFF_MEMBER':s?.native?'POST_CUTOFF_CREATED':null}));
 return warehouses.flatMap(w=>specs.map(s=>{const valid=w.valid&&s.valid,wb=valid?w.basis:null,sb=valid?s.basis:null;return{admitted:wb!==null&&sb!==null,published_batch_id:batch,warehouse_basis:wb,sku_basis:sb,warehouse_created_operation_id:w.valid?w.raw.op:null,sku_created_operation_id:w.valid&&s.exists?s.raw.op:null};}));}
test('all WHxSKU relations admit identically to original-source model including badhall/group/source/unknown; no diagonal/page-only shortcut',()=>{
 const ws=[...whs,null],ss=[...skus,null],actual=setModel(ws,ss),expected=ws.flatMap(w=>ss.map(s=>originalKeyModel(w,s)));
 assert.equal(actual.length,24);assert.deepEqual(actual,expected);assert.equal(actual.filter(r=>r.admitted).length,4);
 for(let i=0;i<actual.length;i++)assert.doesNotThrow(()=>checkedInventoryKeyAdmission(actual[i],ws[Math.floor(i/ss.length)]?.id??id(999),ss[i%ss.length]?.id??id(998)));
});

// Actual original paired compiler + active339 constructor, not a hand-crafted
// expected allow-list. This validates source policy only, NOT actual grants.
const {loadPairedSourcePlan}=await import('../current-native-stock/reference-compiler-cohort-v2/source-cohort.mjs');
const {compileFinitePolicy,cellKey}=await import('../current-native-stock/reference-compiler-cohort-v2/universe.mjs');
const {compileAliasFourReadPolicy}=await import('../current-native-stock/reference-compiler-alias4-v1/alias4-policy.mjs');
assert.equal(typeof process.env.NAIJUE_SOURCE_COHORT_ROOT,'string','Explicit pinned installation cohort required');
const {plan}=await loadPairedSourcePlan({sourceRoot:process.env.NAIJUE_SOURCE_COHORT_ROOT});
const material=new URL('../../../../../development-results-20261031/current-runtime-feasibility-independent-review/',import.meta.url);
const text=name=>readFile(new URL(name,material),'utf8');
const basePolicy=await compileFinitePolicy(plan,{materialText:await text('PLANNED-CURRENT-ISSUER-CREATE-STOCK-ACL-v1.json'),addendumText:await text('SOURCE-CLOSURE-AND-LOCK-SELECTION-ADDENDUM-v1.json'),closureText:await text('SOURCE-DECLARED-SELECTED-TRIGGERS-AND-EXECUTE-v1.json'),universeText:await text('SOURCE-DECLARED-SYNTHETIC-ACL-UNIVERSE-v1.json')});
const policy=compileAliasFourReadPolicy(basePolicy,{addendumText:await readFile(new URL('../current-native-stock/reference-compiler-alias4-v1/ALIAS4-SOURCE-ADDENDUM.json',import.meta.url),'utf8'),maintenanceSourceText:await readFile(new URL('../../../../adapters/postgres/src/product-maintenance-store.ts',import.meta.url),'utf8'),schemaSourceText:await readFile(new URL('../../../../adapters/postgres/migrations/0011_history_storage.sql',import.meta.url),'utf8')});
const requiredSelects={product:['*'],product_category:['id','parent_id'],warehouse:['id','hall_id','created_operation_id'],hall:['id'],sku:['id','product_id','color_id','fit_id','size_id','created_operation_id'],color:['id'],fit:['id'],size:['id'],size_group_member:['size_group_id','size_id'],import_record:['import_batch_id','status','target_type','target_id','source_entity_type','source_key','decision_reason','source_record_hash','source_file_ref']};
function fullSelectKeys(){const keys=[];for(const [relation,selected]of Object.entries(requiredSelects))for(const column of selected.includes('*')?policy.sourceTables.find(t=>t.name===relation).columns:selected)keys.push({schema:'naijue_erp',relation,objectKind:'COLUMN',column,privilege:'SELECT'});
 // Original native_creation_operation_valid is INVOKER and reads whole rows.
 for(const relation of ['operation_receipt','audit_change','sku'])for(const column of policy.sourceTables.find(t=>t.name===relation).columns)keys.push({schema:'naijue_erp',relation,objectKind:'COLUMN',column,privilege:'SELECT'});return [...new Map(keys.map(c=>[cellKey(c),c])).values()];}
test('candidate directSELECT plus original native-helper rowtype closure fits complete actual-compiled339 vector without newGRANT',t=>{
 const expected=new Map(policy.runtimeCells.map(c=>[cellKey(c),c.allowed])),required=fullSelectKeys();assert.equal(policy.runtimeCells.length,4140);assert.equal(policy.directGrantCells.length,339);
 t.diagnostic('New-statement plus unchanged native-helper source SELECT closure cells='+required.length+'; runtime vector4140/allow339; source only, not actual ACL.');assert.ok(required.length>80);for(const cell of required)assert.equal(expected.get(cellKey(cell)),true,'Missing source privilege:'+cellKey(cell));
 assert.equal(expected.get(cellKey({schema:'naijue_erp',relation:'warehouse',objectKind:'COLUMN',column:'name',privilege:'SELECT'})),false,'No accidental whole warehouse row read');
});
test('admission and reusedcreation helper retain source INVOKER/publicEXEC; prototype does not introduce definer or newexecute',()=>{
 for(const name of ['inventory_key_admission','native_creation_operation_valid']){
  const f=policy.functionExecute.find(f=>f.signature.includes(name+'('));assert.ok(f);assert.equal(f.securityDefiner,false);assert.equal(f.runtimeExecutePrivilege,true);assert.equal(f.directRuntimeGrant,false);
 }
 assert.match(admission,/CREATE FUNCTION naijue_erp.inventory_key_admission[\s\S]*?LANGUAGE plpgsql STABLE SET search_path/);
 for(const q of [sql.warehouses,sql.skus])assert.doesNotMatch(q,/SECURITY DEFINER|CREATE FUNCTION|GRANT |SET ROLE|\bINSERT\b|\bDELETE\b|\bUPDATE\b/);
});

test('empty/allcutoff scope still validates publication/guards/allwarehouses and never demands a fake positive uncoveredcount',async()=>{
 const f=fixture(s=>{s.coverage.uncovered_warehouse=false;s.coverage.uncovered_sku=false;});f.input.runtime26Present=false;f.input.parameters.filter.productIds=[id(888)];
 const r=await runPrototypeSnapshot(f.input);assert.equal(f.calls.length,3);assert.equal(r.stockValue,null);
 const g=fixture(s=>{s.coverage.uncovered_sku=false;});g.input.parameters.filter.productIds=[id(888)];await runPrototypeSnapshot(g.input);
 assert.equal(g.calls.some(c=>c.text===sql.warehouses),true);assert.equal(g.calls.some(c=>c.text===sql.skus),false);
 assert.doesNotMatch(sql.warehouses.slice(0,sql.warehouses.indexOf('witness_sku AS')),/matched_products|productIds|LIMIT/);
});
test('original count/category guard stays upstream and page/fits/stock downstream of original readiness',()=>{
 const body=reader.slice(reader.indexOf('async readList('));
 const markers=['/* product-management:count */','integrity(!booleanValue(status.invalid_category_tree)','await stockReadiness(query','/* product-management:page */','/* product-management:fits */','/* product-management:stock */'];
 const positions=markers.map(x=>{const i=body.indexOf(x);assert.ok(i>=0,x);return i;});assert.deepEqual(positions,[...positions].sort((a,b)=>a-b));
});

// Independent peer regression: replacement-string $1/$11 capture substitution
// corrupted whole SQL even though earlier structural/model tests passed.
test('all eight fixed SQL binding token multisets remain literal data slots',()=>{
 const hist=q=>Object.fromEntries([...q.matchAll(/\$([1-9][0-9]*)\b/g)].reduce((m,x)=>m.set(x[1],(m.get(x[1])??0)+1),new Map()));
 const filter={1:1,2:1,3:2,4:3,5:2,6:2,7:2,8:2,9:2,10:2};
 const expected={publication:{1:1},guards:{},coverage:{...filter,11:2},skuWitness:{1:1},nativeSkuWitness:{},warehouseWitness:{},warehouses:{1:4,2:1,3:2,4:1},skus:{...filter,11:4,12:1}};
 for(const retainedDelete of [true,false])for(const seasonArray of [true,false])for(const [name,q]of Object.entries(prototypeStatements(sources,{retainedDelete,seasonArray})))assert.deepEqual(hist(q),expected[name],name);
});
test('complete aggregate expressions equal original source literally, including $1/$11 scope and all shape checks',()=>{
 for(const [original,q]of [[sources.originalWarehouse,sql.warehouses],[sources.originalSku,sql.skus]]){
  const start=original.indexOf('SELECT count(*) AS decision_count'),end=original.indexOf('FROM naijue_erp.inventory_key_admission',start);assert.ok(start>0&&end>start);
  const expressions=original.slice(start,end).trim().replace('SELECT count(*)','count(a.key_id)');
  const expected='SELECT u.ordinal,(u.ordinal-1)/1000 AS legacy_batch, '+expressions+'\n FROM uncovered u LEFT JOIN admission_decisions a ON a.key_id=u.id GROUP BY u.ordinal';
  const actual=q.slice(q.indexOf('SELECT u.ordinal'),q.indexOf('\n    ), issues AS (')).trim();assert.equal(actual,expected);
  assert.doesNotMatch(actual,/a\.published_batch_id=\s*SELECT|AS scope_ok[\s\S]*AS scope_ok/);
 }
});
