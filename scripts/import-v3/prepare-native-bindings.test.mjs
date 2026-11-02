import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeIdentityRegistry, reviewedPartyBinding, sourceEvidence, readTPlusFieldMappings26, verifyTPlusStaffActualCells26, projectTPlusWarehouseHall26, projectTPlusHall26, prepareTPlusWarehouseHallCandidates26, prepareNativeBindings, prepareFullPayloadData26, prepareFullSourceBindings26, writeFullSourceBindings26 } from './prepare-native-bindings.mjs';
import {historyClosureProjectionRow26,HISTORY_CLOSURE_SOURCE_ENTITIES} from '../../packages/application/src/history-typed-closure.ts';
import {HISTORY_CLOSURE_SOURCE_GROUPS} from '../import-v2/authorized-history-closure-reader.mjs';
import {HISTORY_COUNT_KEYS} from '../../packages/application/src/history-storage-contract.ts';
import {stableImportId} from '../../packages/application/src/inventory-cutoff-import.ts';
import {requestHash} from '../../packages/application/src/request-hash.ts';
import {mkdtemp,readFile,writeFile,stat,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parseV2Csv} from '../../packages/application/src/import-v2.ts';
import {preflightImport} from '../../packages/application/src/import-preflight.ts';
import {IMPORT_PREFLIGHT_SHEETS} from '../../packages/application/src/import-preflight-contract.ts';
import {prepareProductEvidenceChunk} from '../../packages/application/src/product-evidence-staging.ts';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import { prepareNativePartyImportChunk } from '../../packages/application/src/native-party-import.ts';
import { IMPORT_V2_TABLES } from '../../packages/application/src/import-v2-contract.ts';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const pin = 'a'.repeat(64), binding = { batchId: id(1), fixedSourceNamespace: 'synthetic:isolated' };
test('T+ warehouse source uses actual cells and approved single-hall identity, and rejects changed inputs', async () => {
  const sha=b=>createHash('sha256').update(b).digest('hex'), warehouseBytes=Buffer.from('synthetic workbook'),
    decisionBytes=Buffer.from(JSON.stringify({approval:true,warehouses:[{code:'W',mappingNeedsSeparateConfirmation:false,proposedHallCodes:['H']}],halls:[{code:'H'}]})),
    bridgeBytes=Buffer.from(JSON.stringify({records:[{code:'W',hallCodes:['H'],isNew:true,targetId:null,historicalId:null}]}));
  const opts={warehouseBytes,warehouseSha256:sha(warehouseBytes),decisionBytes,decisionSha256:sha(decisionBytes),bridgeBytes,bridgeSha256:sha(bridgeBytes)};
  const events=(code='W')=>[{event:'row',sheet:'仓库',excelRow:1,cells:{0:{raw:'仓库编码'},1:{raw:'仓库名称'},8:{raw:'停用'}}},
    {event:'row',sheet:'仓库',excelRow:2,cells:{0:{kind:'text',raw:code},1:{kind:'text',raw:'source name'},8:{kind:'number',raw:'0'}}},{event:'eof',sheet:'仓库',rows:2}];
  const result=await projectTPlusWarehouseHall26({...opts,events:events()});
  assert.deepEqual(result,[{sourceCode:'W',name:'source name',disabled:'0',excelRow:2,approvedHallCode:'H',identityKind:'NEW',originalWarehouseId:null}]);
  await assert.rejects(projectTPlusWarehouseHall26({...opts,events:events('wrong')}),/TPLUS_WAREHOUSE26_HALL/);
  await assert.rejects(projectTPlusWarehouseHall26({...opts,decisionBytes:Buffer.from('{}'),events:events()}),/TPLUS_WAREHOUSE26_SOURCE_PIN/);
  const wrongHall=Buffer.from(JSON.stringify({records:[{code:'W',hallCodes:['OTHER'],isNew:true,targetId:null,historicalId:null}]}));
  await assert.rejects(projectTPlusWarehouseHall26({...opts,bridgeBytes:wrongHall,bridgeSha256:sha(wrongHall),events:events()}),/TPLUS_WAREHOUSE26_HALL/);
  const oldDecision=Buffer.from(JSON.stringify({approval:true,warehouses:[{code:'W',mappingNeedsSeparateConfirmation:false,proposedHallCodes:['H','J']}],halls:[{code:'H',name:'Approved hall'},{code:'J',name:'Other hall'}]})),
    oldBridge=Buffer.from(JSON.stringify({records:[{code:'W',hallCodes:['H','J'],isNew:false,targetId:id(4),historicalId:id(4)}]})),
    supplement=Buffer.from(JSON.stringify({'本次创建厅及销货版型补充':{creatorHall:{warehouseHallMappings:[{warehouseSourceKey:id(4),hallName:'Approved hall'}]}}}));
  const oldOpts={...opts,decisionBytes:oldDecision,decisionSha256:sha(oldDecision),bridgeBytes:oldBridge,bridgeSha256:sha(oldBridge),singleHallBytes:supplement,singleHallSha256:sha(supplement)};
  assert.equal((await projectTPlusWarehouseHall26({...oldOpts,events:events()}))[0].originalWarehouseId,id(4));
  await assert.rejects(projectTPlusWarehouseHall26({...oldOpts,singleHallBytes:undefined,events:events()}),/TPLUS_WAREHOUSE26_HALL/);
});
test('hall and warehouse candidates keep source codes separate, freeze distinct IDs and preserve unknown customer',async()=>{
 const sha=b=>createHash('sha256').update(b).digest('hex'),hallBytes=Buffer.from('hall workbook'),hallSha256=sha(hallBytes),decisionBytes=Buffer.from(JSON.stringify({approval:true,halls:[{code:'W',name:'Source hall',source:{sha256:hallSha256,sheet:'营业厅',row:2},proposedEnabled:true,defaultWarehouseRuleAuthorized:true,defaultWarehouseAssignmentResolved:true,defaultWarehouseCode:'W'}]}));
 const opts={hallBytes,hallSha256,decisionBytes,decisionSha256:sha(decisionBytes)},events=[{event:'row',sheet:'营业厅',excelRow:1,cells:{0:{raw:'编码'},1:{raw:'名称'},2:{raw:'停用'}}},{event:'row',sheet:'营业厅',excelRow:2,cells:{0:{kind:'text',raw:'W'},1:{kind:'text',raw:'Source hall'},2:{kind:'number',raw:'0'}}},{event:'eof',sheet:'营业厅',rows:2}];
 const halls=await projectTPlusHall26({...opts,events}),warehouses=[{sourceCode:'W',approvedHallCode:'W',identityKind:'NEW',originalWarehouseId:null}],r=createNativeIdentityRegistry((()=>{let i=20;return()=>id(i++);})());
 const c=prepareTPlusWarehouseHallCandidates26({halls,warehouses,registry:r});assert.equal(c.importAuthorized,false);assert.notEqual(c.halls[0].candidateNativeId,c.warehouses[0].candidateNativeId);
 assert.equal(c.warehouses[0].hallCandidateNativeId,c.halls[0].candidateNativeId);assert.equal(c.halls[0].defaultWarehouseCandidateNativeId,c.warehouses[0].candidateNativeId);
 assert.equal(c.halls[0].defaultCustomerState,'UNKNOWN_NOT_INFERRED');assert.equal(c.halls[0].defaultCustomerSourceKey,null);
 await assert.rejects(projectTPlusHall26({...opts,events:events.map(e=>e.excelRow===2?{...e,cells:{...e.cells,0:{kind:'text',raw:'WRONG'}}}:e)}),/TPLUS_HALL26_APPROVAL/);
 assert.throws(()=>prepareTPlusWarehouseHallCandidates26({halls,warehouses:[{...warehouses[0],approvedHallCode:'WRONG'}]}),/TPLUS_PARTY26_RELATION/);
});
test('native IDs are newly allocated and frozen; no source UUID reuse, collision, duplicate or implicit reference', () => {
  const r = createNativeIdentityRegistry(() => id(2), 2);
  assert.equal(r.add('HALL', 'old-hall', {}).nativeId, id(2));
  assert.throws(() => r.add('HALL', 'old-hall', {}), /DUPLICATE/);
  assert.throws(() => r.add('WAREHOUSE', 'old-w', {}), /NEW_UUID/);
  assert.throws(() => r.get('STAFF', 'missing'), /REFERENCE_MISSING/);
  const own = createNativeIdentityRegistry(() => id(9)); assert.throws(() => own.add('PRODUCT', id(9), {}), /NEW_UUID/);
});
test('actual source evidence preserves raw/normalized cells and row hash, without historical native UUID claims', () => {
  const raw = { entity: 'PRODUCT', sourceId: 'source-p', file: 'source.xlsx', sheet: 'sheet', row: 2, sourceSha256: pin, data: { '来源编号': 'source-p', '值': '' } };
  const result = sourceEvidence(raw, JSON.stringify(raw), { '来源编号': 'source-p', '值': '' }, binding);
  assert.deepEqual(result.rawFields, raw.data); assert.equal(result.fieldProvenance.fields['值'].raw, ''); assert.notEqual(result.id, raw.sourceId);
  assert.notEqual(result.rowSha256, sourceEvidence(raw, JSON.stringify(raw) + ' ', result.normalizedFields, binding).rowSha256);
});
test('new T+ source aliases carry pinned mapping evidence and never claim original column names', () => {
  const raw={entity:'PRODUCT',sourceId:'001',file:'synthetic.xlsx',sheet:'存货',row:3,sourceSha256:pin,data:{'来源编号':'001','状态':'正常'}};
  const src=(column,header,value)=>({file:raw.file,sheet:raw.sheet,row:raw.row,sha256:pin,column,header,value});
  const proof={version:'TPLUS_FIELD_MAPPING_EVIDENCE_V1',fields:{
    '来源编号':{rule:'COPY',source:src(0,'存货编码','001')},
    '状态':{rule:'DISABLED_0_1_TO_STATUS',source:src(10,'停用','0')}
  }};
  const mapping={proof,sha256:requestHash(proof)}, line=JSON.stringify(raw);
  const result=sourceEvidence(raw,line,raw.data,binding,mapping);
  assert.equal(result.fieldProvenance.fields['来源编号'].origin,'MIGRATION_DERIVED');
  assert.equal(result.fieldProvenance.fields['来源编号'].evidence_ref,mapping.sha256);
  assert.equal(result.fieldProvenance.fields['状态'].raw,'正常');
  assert.throws(()=>sourceEvidence(raw,line,raw.data,binding,{proof,sha256:'b'.repeat(64)}),/MAPPING_EVIDENCE/);
  const invalid=structuredClone(proof);invalid.fields['状态'].source.value='1';
  assert.throws(()=>sourceEvidence(raw,line,raw.data,binding,{proof:invalid,sha256:requestHash(invalid)}),/MAPPING_VALUE/);
  const moved=structuredClone(proof);moved.fields['来源编号'].source.row=4;
  assert.throws(()=>sourceEvidence(raw,line,raw.data,binding,{proof:moved,sha256:requestHash(moved)}),/MAPPING_IDENTITY/);
  assert.throws(()=>sourceEvidence(raw,JSON.stringify({...raw,row:4}),raw.data,binding,mapping),/MAPPING_LINE/);
});
test('synthetic T+ aliases flow through a real canonical CSV, preflight and existing product evidence reader',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'synthetic-tplus-canonical-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const table=IMPORT_V2_TABLES.find(x=>x.entity==='PRODUCT'), contract=IMPORT_PREFLIGHT_SHEETS.find(x=>x.entityType==='PRODUCT');
  const normalized=Object.fromEntries(table.columns.map(x=>[x.name,x.required?'SYNTHETIC':'']));
  Object.assign(normalized,{'来源编号':'001','款号':'001','商品名称':'SYNTHETIC','分类路径':'SYNTHETIC','尺码组':'SYNTHETIC','状态':'正常','零售价':'1.25'});
  const raw={entity:'PRODUCT',sourceId:'001',file:'synthetic-original.xlsx',sheet:'存货',row:3,sourceSha256:pin,data:normalized};
  const proof={version:'TPLUS_FIELD_MAPPING_EVIDENCE_V1',fields:{}};
  for(const [column,[key,value]] of Object.entries(normalized).entries()){
    const isStatus=key==='状态';proof.fields[key]={rule:isStatus?'DISABLED_0_1_TO_STATUS':'COPY',source:{file:raw.file,sheet:raw.sheet,row:raw.row,sha256:pin,column,header:key==='来源编号'?'存货编码':key,value:isStatus?'0':value}};
  }
  const mapping={proof,sha256:requestHash(proof)},line=JSON.stringify(raw),source=sourceEvidence(raw,line,normalized,binding,mapping);
  const quote=v=>'"'+v.replaceAll('"','""')+'"';const values=table.columns.map(c=>normalized[c.name]);
  const csv=table.columns.map(c=>quote(c.name)).join(',')+'\n'+values.map(quote).join(',')+'\n';
  const csvPath=join(dir,'product.csv'),proofPath=join(dir,'mapping.json');await writeFile(csvPath,csv,{mode:0o600});await writeFile(proofPath,JSON.stringify(proof),{mode:0o600});
  const csvBytes=await readFile(csvPath),csvHash=createHash('sha256').update(csvBytes).digest('hex');
  assert.equal(requestHash(JSON.parse(await readFile(proofPath,'utf8'))),mapping.sha256);
  const parsed=[];for await(const row of parseV2Csv((async function*(){yield csvBytes.toString('utf8')})()))parsed.push(row);
  assert.deepEqual(parsed[1],values);
  const cell=v=>({kind:'text',raw:v});
  const preflight=preflightImport({batchId:binding.batchId,fixedSourceNamespace:binding.fixedSourceNamespace,mode:'STAGED',files:[{fileName:'product.csv',sha256:csvHash,dateSystem:'1900',sheets:[{name:'01商品',headerRow:1,headers:contract.fields.map(f=>cell(f.header)),rows:[{excelRow:2,cells:parsed[1].map(cell)}]}]}]});
  assert.equal(preflight.records.filter(x=>x.entityType==='PRODUCT').length,1);
  const chunk=prepareProductEvidenceChunk({batchId:binding.batchId,fixedSourceNamespace:binding.fixedSourceNamespace,selection:{baseManifestSha256:pin,selectionSha256:pin,approvalSha256:pin,entity:'PRODUCT',source:'BASE_V2',path:'business/01商品.csv',csvSha256:csvHash},rows:[{source,product:{sourceKey:'001',nativeId:id(99),expectedVersion:1},blankPricePolicy:'V03_EXACT_PRICE_COLUMN_BLANK_IS_UNSET'}]});
  assert.equal(chunk.rows[0].source.fieldProvenance.fields['来源编号'].origin,'MIGRATION_DERIVED');
  assert.equal(chunk.rows[0].source.fileRef,'synthetic-original.xlsx');
});
test('manifest-pinned mapping stream rejects changed source hashes and duplicate product keys',async()=>{
  const source={file:'synthetic.xlsx',sheet:'存货',row:3,sha256:pin,column:0,header:'存货编码',value:'001'};
  const proof={version:'TPLUS_FIELD_MAPPING_EVIDENCE_V1',fields:{'来源编号':{rule:'COPY',source}}};
  const item={entity:'PRODUCT',sourceId:'001',proof,sha256:requestHash(proof)};
  const lines=(...x)=>(async function*(){yield x.map(v=>JSON.stringify(v)).join('\n')+'\n'})();
  const loaded=await readTPlusFieldMappings26(lines(item),{'synthetic.xlsx':pin});assert.equal(loaded.size,1);
  await assert.rejects(readTPlusFieldMappings26(lines(item),{'synthetic.xlsx':'b'.repeat(64)}),/INPUT_HASH/);
  await assert.rejects(readTPlusFieldMappings26(lines(item,item),{'synthetic.xlsx':pin}),/MAPPING_ROW/);
  await assert.rejects(readTPlusFieldMappings26(lines({...item,sha256:'b'.repeat(64)}),{'synthetic.xlsx':pin}),/MAPPING_ROW/);
});
test('party source mappings preserve exact identities and source status with entity-scoped keys',async()=>{
 const loc=(column,header,value)=>({file:'synthetic.xlsx',sheet:'往来单位',row:3,sha256:pin,column,header,value});
 const proof={version:'TPLUS_FIELD_MAPPING_EVIDENCE_V1',fields:{'来源编号':{rule:'COPY',source:loc(0,'往来单位编码','001')},'原编码':{rule:'COPY',source:loc(0,'往来单位编码','001')},'名称':{rule:'COPY',source:loc(1,'往来单位名称','synthetic')},'状态':{rule:'DISABLED_0_1_TO_STATUS',source:loc(19,'停用','0')}}};
 const item={entity:'CUSTOMER',sourceId:'001',proof,sha256:requestHash(proof)},supplier={...item,entity:'SUPPLIER'};
 const lines=(...x)=>(async function*(){yield x.map(v=>JSON.stringify(v)).join('\n')+'\n'})();
 const loaded=await readTPlusFieldMappings26(lines(item,supplier),{'synthetic.xlsx':pin});assert.equal(loaded.size,0);assert.equal(loaded.partyMappings.size,2);
 const data={'来源编号':'001','原编码':'001','名称':'synthetic','状态':'正常'},raw={entity:'CUSTOMER',sourceId:'001',file:'synthetic.xlsx',sheet:'往来单位',row:3,sourceSha256:pin,data};
 const source=sourceEvidence(raw,JSON.stringify(raw),data,{batchId:id(1),fixedSourceNamespace:'synthetic.party'},loaded.partyMappings.get(JSON.stringify(['CUSTOMER','001'])));
 assert.equal(source.fieldProvenance.fields['状态'].origin,'MIGRATION_DERIVED');assert.equal(source.normalizedFields['状态'],'正常');
 await assert.rejects(readTPlusFieldMappings26(lines(item,item),{'synthetic.xlsx':pin}),/MAPPING_ROW/);
 await assert.rejects(readTPlusFieldMappings26(lines(item),{'synthetic.xlsx':'b'.repeat(64)}),/INPUT_HASH/);
});
test('staff mapping binds approved identity and preserves prior contact only for a true source blank',async()=>{
 const decisionSha='a6aab187d4f531715c60bcf32f114d48dcb7cf736576ac5df43463fa43599f2e',inputs={'plan.csv':pin,'current.xlsx':pin,'identity.json':decisionSha};
 const loc=(file,sheet,row,column,header,value)=>({file,sheet,row,sha256:pin,column,header,value}),prior=(column,header,value)=>loc('plan.csv','08员工',2,column,header,value),current=(column,header,value)=>loc('current.xlsx','员工',3,column,header,value);
 const fields={'来源编号':{rule:'COPY',source:prior(0,'来源编号','staff-id')},'姓名':{rule:'COPY',source:current(1,'员工名称','new-name')},'角色':{rule:'COPY',source:prior(2,'角色','营业员')},'所属厅来源编号':{rule:'COPY',source:prior(3,'所属厅来源编号','hall-id')},'联系方式':{rule:'COPY',source:prior(4,'联系方式','prior-contact')},'任职状态':{rule:'COPY',source:prior(5,'任职状态','在职')}};
 const proof={version:'TPLUS_FIELD_MAPPING_EVIDENCE_V1',fields,identityEvidence:{decisionFile:'identity.json',decisionSha256:decisionSha,decisionIndex:0,originalCode:'001',approvedSourceId:'staff-id',currentSource:current(0,'员工编码','001')},contactSelection:'APPROVED_SUPPLEMENT_SOURCE_BLANK',currentContactSource:{...current(23,'手机',''),cell:{kind:'blank',raw:null}}};delete proof.currentContactSource.value;
 const item=p=>({entity:'STAFF',sourceId:'staff-id',proof:p,sha256:requestHash(p)}),lines=x=>(async function*(){yield JSON.stringify(x)+'\n'})();
 const mapped=await readTPlusFieldMappings26(lines(item(proof)),inputs);assert.equal(mapped.partyMappings.size,1);
 for(const change of [p=>{p.identityEvidence.approvedSourceId='other';},p=>{p.identityEvidence.originalCode='002';},p=>{p.identityEvidence.decisionSha256='b'.repeat(64);},p=>{p.currentContactSource.cell={kind:'formula',raw:null};},p=>{p.currentContactSource.cell={kind:'text',raw:'new-contact'};},p=>{p.fields['角色'].source.column=3;}]){const p=structuredClone(proof);change(p);await assert.rejects(readTPlusFieldMappings26(lines(item(p)),inputs),/STAFF_IDENTITY|STAFF_CONTACT/);}
 const fromCurrent=structuredClone(proof);fromCurrent.contactSelection='CURRENT_SOURCE_EQUAL_APPROVED';fromCurrent.currentContactSource.cell={kind:'text',raw:'new-contact'};fromCurrent.fields['联系方式'].source=current(23,'手机','new-contact');assert.equal((await readTPlusFieldMappings26(lines(item(fromCurrent)),inputs)).partyMappings.size,1);
 const aliases=structuredClone(proof);aliases.identityEvidence.originalEmployeeId='staff-id';aliases.identityEvidence.historicalAliases=[{originalCode:'001',originalEmployeeId:'staff-id',currentRow:3},{originalCode:'002',originalEmployeeId:'old-id',currentRow:4}];assert.equal((await readTPlusFieldMappings26(lines(item(aliases)),inputs)).partyMappings.size,1);aliases.identityEvidence.historicalAliases[1].originalEmployeeId='staff-id';await assert.rejects(readTPlusFieldMappings26(lines(item(aliases)),inputs),/STAFF_ALIASES/);
});
test('approved prior-only staff stays unlinked to current source and retains original fields',async()=>{
 const planSha='ed4aad36329381d07f6dfc5c2e317fb20405ce880b7e07066febee344d97b4f9',decisionSha='a6aab187d4f531715c60bcf32f114d48dcb7cf736576ac5df43463fa43599f2e',headers=['来源编号','姓名','角色','所属厅来源编号','联系方式','任职状态'],values=['staff-id','prior-name','营业员','hall-id','prior-contact','在职'];
 const fields=Object.fromEntries(headers.map((name,column)=>[name,{rule:'COPY',source:{file:'plan.csv',sheet:'08员工',row:2,sha256:planSha,column,header:name,value:values[column]}}]));
 const proof={version:'TPLUS_FIELD_MAPPING_EVIDENCE_V1',fields,identityEvidence:{kind:'APPROVED_PLAN_NO_PRIOR_HISTORY',decisionFile:'identity.json',decisionSha256:decisionSha,approvedSourceId:'staff-id',currentSourceBinding:'NOT_ESTABLISHED'}},item=p=>({entity:'STAFF',sourceId:'staff-id',proof:p,sha256:requestHash(p)}),lines=x=>(async function*(){yield JSON.stringify(x)+'\n'})(),inputs={'plan.csv':planSha,'identity.json':decisionSha};
 const m=await readTPlusFieldMappings26(lines(item(proof)),inputs);assert.equal(m.partyMappings.size,1);
 for(const mutate of [p=>{p.identityEvidence.currentSourceBinding='INVENTED';},p=>{p.identityEvidence.currentSource={};},p=>{p.fields['姓名'].source.column=2;},p=>{p.currentContactSource={};},p=>{p.identityEvidence.decisionSha256='b'.repeat(64);}]){const p=structuredClone(proof);mutate(p);await assert.rejects(readTPlusFieldMappings26(lines(item(p)),inputs),/STAFF_PRIOR_ONLY/);}
});
test('staff actual source verification rejects invented links and changed approved contacts',async()=>{
 const plan=Buffer.from('来源编号,姓名,角色,所属厅来源编号,联系方式,任职状态\nstaff-id,old-name,营业员,hall-id,123,在职\n'),identity=Buffer.from(JSON.stringify({links:[{originalCode:'001',plannedCurrentEmployeeId:'staff-id',originalEmployeeId:'staff-id'}]})),digest=b=>createHash('sha256').update(b).digest('hex'),files={approvedPlanPath:'plan.csv',identityDecisionPath:'identity.json',currentEmployeeXlsxPath:'current.xlsx'},inputHashes={'plan.csv':digest(plan),'identity.json':digest(identity)};
 const prior=(column,header,value)=>({file:'plan.csv',sheet:'08员工',row:2,sha256:inputHashes['plan.csv'],column,header,value}),current=(column,header,value)=>({file:'current.xlsx',sheet:'员工',row:3,sha256:pin,column,header,value}),fields={'来源编号':{source:prior(0,'来源编号','staff-id')},'姓名':{source:current(1,'员工名称','new-name')},'角色':{source:prior(2,'角色','营业员')},'所属厅来源编号':{source:prior(3,'所属厅来源编号','hall-id')},'联系方式':{source:current(23,'手机','123')},'任职状态':{source:prior(5,'任职状态','在职')}};
 const proof={fields,identityEvidence:{decisionFile:'identity.json',decisionIndex:0,originalCode:'001',approvedSourceId:'staff-id',currentSource:current(0,'员工编码','001')},contactSelection:'CURRENT_SOURCE_EQUAL_APPROVED',currentContactSource:{cell:{kind:'text',raw:'123'}}};
 const mappings=p=>{const m=new Map();Object.defineProperty(m,'partyMappings',{value:new Map([[JSON.stringify(['STAFF','staff-id']),{proof:p}]])});return m;};
 const events=(phone='123')=>[{event:'row',sheet:'员工',excelRow:1,cells:{}},{event:'row',sheet:'员工',excelRow:2,cells:{0:{raw:'员工编码'},1:{raw:'员工名称'},23:{raw:'手机'}}},{event:'row',sheet:'员工',excelRow:3,cells:{0:{kind:'text',raw:'001'},1:{kind:'text',raw:'new-name'},23:{kind:'text',raw:phone}}},{event:'eof',sheet:'员工',rows:3}];
 const run=(p=proof,ev=events(),planBytes=plan,hashes=inputHashes)=>verifyTPlusStaffActualCells26(mappings(p),{approvedPlanBytes:planBytes,identityDecisionBytes:identity,inputHashes:hashes,files,events:ev});assert.deepEqual(await run(),{checked:1});
 for(const mutate of [p=>{p.identityEvidence.decisionIndex=999999999;},p=>{p.identityEvidence.originalCode='invented';},p=>{p.fields['角色'].source.value='管理员';},p=>{p.currentContactSource.cell.raw='wrong';}]){const p=structuredClone(proof);mutate(p);await assert.rejects(run(p),/STAFF_SOURCE/);}
 await assert.rejects(run(proof,events('different')),/STAFF_SOURCE_IDENTITY/);const changed=Buffer.from(plan.toString().replace(',123,',',456,'));await assert.rejects(run(proof,events(),changed),/STAFF_SOURCE_PIN/);
 const alteredProof=structuredClone(proof);alteredProof.currentContactSource.cell.raw='456';alteredProof.fields['联系方式'].source.value='456';await assert.rejects(run(alteredProof,events('456')),/STAFF_SOURCE_CONTACT/);
 await assert.rejects(run(proof,[...events(),{event:'row',sheet:'员工',excelRow:4,cells:{}}]),/STAFF_SOURCE_STREAM/);await assert.rejects(run(proof,[events()[0],events()[2],{event:'eof',sheet:'员工',rows:2}]),/STAFF_SOURCE_EOF/);
 const aliasIdentity=Buffer.from(JSON.stringify({links:[{originalCode:'001',plannedCurrentEmployeeId:'staff-id',originalEmployeeId:'staff-id'},{originalCode:'002',plannedCurrentEmployeeId:'staff-id',originalEmployeeId:'old-id'}]})),aliasProof=structuredClone(proof);aliasProof.identityEvidence.historicalAliases=[{originalCode:'001',originalEmployeeId:'staff-id',currentRow:3},{originalCode:'002',originalEmployeeId:'old-id',currentRow:4}];const aliasEvents=events();aliasEvents.splice(3,0,{event:'row',sheet:'员工',excelRow:4,cells:{0:{kind:'text',raw:'002'}}});aliasEvents[4].rows=4;const aliasRun=p=>verifyTPlusStaffActualCells26(mappings(p),{approvedPlanBytes:plan,identityDecisionBytes:aliasIdentity,inputHashes:{...inputHashes,'identity.json':digest(aliasIdentity)},files,events:aliasEvents});assert.deepEqual(await aliasRun(aliasProof),{checked:1});aliasProof.identityEvidence.historicalAliases[1].originalCode='wrong';await assert.rejects(aliasRun(aliasProof),/STAFF_SOURCE_ALIASES/);
 const priorOnly=structuredClone(proof);priorOnly.identityEvidence={kind:'APPROVED_PLAN_NO_PRIOR_HISTORY',decisionFile:'identity.json'};priorOnly.fields['姓名'].source=priorOnly.fields['来源编号'].source;await assert.rejects(run(priorOnly),/STAFF_SOURCE_PLAN|STAFF_SOURCE_PRIOR_LINK/);
 priorOnly.fields['姓名'].source=prior(1,'姓名','old-name');priorOnly.fields['联系方式'].source=prior(4,'联系方式','123');const emptyIdentity=Buffer.from(JSON.stringify({links:[]}));assert.deepEqual(await verifyTPlusStaffActualCells26(mappings(priorOnly),{approvedPlanBytes:plan,identityDecisionBytes:emptyIdentity,inputHashes:{...inputHashes,'identity.json':digest(emptyIdentity)},files,events:events()}),{checked:1});await assert.rejects(run(priorOnly),/STAFF_SOURCE_PRIOR_LINK/);
});
test('new T+ cutoff requires the field mapping branch and preserves old cutoff',async()=>{
 const binding={version:'C_NATIVE_IMPORT_PREPARATION_BINDING_V1',batchId:id(1),fixedSourceNamespace:'synthetic.party',selectionSha256:pin};
 const options={binding,registrationId:'synthetic',outputParent:'not-absolute'};
 for(const cutoffAt of ['2026-11-02T04:00:00Z','2026-11-02T12:00:00+08:00']) await assert.rejects(prepareNativeBindings({...options,binding:{...binding,cutoffAt},tplusFieldMappingPath:'evidence/tplus-field-mapping.jsonl'}),/NATIVE_BINDING_OUTPUT/);
 await assert.rejects(prepareNativeBindings({...options,binding:{...binding,cutoffAt:'2026-10-04T12:00:00+08:00'}}),/NATIVE_BINDING_OUTPUT/);
 await assert.rejects(prepareNativeBindings({...options,binding:{...binding,cutoffAt:'2026-11-02T04:00:00Z'}}),/NATIVE_BINDING_CONTROLLER_BINDING/);
 await assert.rejects(prepareNativeBindings({...options,binding:{...binding,cutoffAt:'2026-11-02T04:00:01Z'},tplusFieldMappingPath:'evidence/tplus-field-mapping.jsonl'}),/NATIVE_BINDING_CONTROLLER_BINDING/);
});
test('party field decisions preserve Chinese employment status, null historical times and exact related identity; unknown enums fail', () => {
  let n = 10; const r = createNativeIdentityRegistry(() => id(n++));
  r.add('STAFF', 's', {}); r.add('HALL', 'h', {}); r.add('CUSTOMER', 'c', {});
  const staff = { '来源编号': 's', '姓名': 'synthetic', '角色': '营业员', '任职状态': '在职', '联系方式': '', '所属厅来源编号': 'h' };
  const p = reviewedPartyBinding('STAFF', staff, r, 'review:staff', '2026-10-04T12:00:00+08:00');
  assert.equal(p.nativeSnapshot.role, 'SALESPERSON'); assert.equal(p.nativeSnapshot.employment_status, '在职'); assert.equal(p.nativeSnapshot.contact, null);
  assert.equal(p.bindings['所属厅来源编号'].nativeId, r.get('HALL', 'h').nativeId);
  assert.throws(() => reviewedPartyBinding('STAFF', { ...staff, '角色': 'unknown' }, r, 'review', ''), /STAFF_ENUM/);
  const customer = reviewedPartyBinding('CUSTOMER', { '来源编号': 'c', '名称': 'synthetic-c', '原编码': '001', '状态': '正常' }, r, 'review', '');
  assert.equal(customer.nativeSnapshot.created_at, null); assert.equal(customer.nativeSnapshot.updated_at, null);
});
test('generated source/party bindings satisfy actual native party validator; warehouse keeps single hall and explicit import metadata', () => {
  let n = 20; const r = createNativeIdentityRegistry(() => id(n++)); r.add('HALL', 'h', {});
  const table = IMPORT_V2_TABLES.find(t => t.entity === 'WAREHOUSE');
  const row = Object.fromEntries(table.columns.map(c => [c.name, '']));
  Object.assign(row, { '来源编号': 'w', '仓库名称': 'synthetic warehouse', '所属厅来源编号': 'h', '状态': '正常', '切换范围': '本次完整核准' }); r.add('WAREHOUSE', 'w', row);
  const raw = { entity: 'WAREHOUSE', sourceId: 'w', file: 'source.xlsx', sheet: 'warehouses', row: 2, sourceSha256: pin, data: row };
  const input = { ...binding, selection: { source: 'BASE_V2', path: table.file, entity: 'WAREHOUSE', baseManifestSha256: pin, selectionSha256: pin, approvalSha256: pin, csvSha256: pin },
    source: sourceEvidence(raw, JSON.stringify(raw), row, binding), ...reviewedPartyBinding('WAREHOUSE', row, r, 'review:warehouse', '2026-10-04T12:00:00+08:00', () => id(99)) };
  const prepared = prepareNativePartyImportChunk([input]); assert.equal(prepared.rows[0].nativeSnapshot.hall_id, r.get('HALL', 'h').nativeId);
  assert.equal(prepared.rows[0].input.warehouseRecord.id, id(99));
});

// SYNTHETIC DATA refs and canonical rows only. No actual source/authority/DB facts.
function fullFixture(extraSkus=0){
 const b={batchId:id(1),fixedSourceNamespace:'synthetic.full',cutoffAt:'2026-10-04T04:00:00Z',selectionSha256:pin},actor=id(2),coreReceipt=id(3);
 const coreMembers=[],staffProofs=[],maintained=[],warehouses=[],sourceRows=[],typedRows=[],sourceCounts=Object.fromEntries(HISTORY_CLOSURE_SOURCE_ENTITIES.map(k=>[k,0]));let n=10;
 const source=(entity,sourceId,key)=>{sourceCounts[entity]++;sourceRows.push(historyClosureProjectionRow26('import_source_row',{id:sourceId,batch_id:b.batchId,entity_type:entity,source_key:key,file_ref:'synthetic.xlsx',sheet:'SYNTHETIC',row_no:'1',source_file_sha256:pin,row_sha256:pin,raw_fields:{},normalized_fields:{},field_provenance:{}}));};
 for(const [entity,count]of [['HALL',22],['WAREHOUSE',53],['STAFF',49],['CUSTOMER',22]])for(let i=0;i<count;i++,n++){
  const m={sourceRowId:id(n),entity,sourceKey:`SYN-${entity}-${i}`,nativeId:id(1000+n)};source(entity,m.sourceRowId,m.sourceKey);
  const snapshot=entity==='HALL'?{id:m.nativeId,name:'SYN',default_customer_id:null,default_sales_warehouse_id:null,enabled:true,version:1}:entity==='WAREHOUSE'?{id:m.nativeId,hall_id:id(1010),name:'SYN',enabled:true,version:1,created_operation_id:null}:entity==='STAFF'?{id:m.nativeId,name:'SYN',hall_id:null,role:'ADMIN',contact:null,employment_status:'在职',version:1}:{id:m.nativeId,code:m.sourceKey,name:'SYN',enabled:true,version:1,created_at:null,updated_at:null};
  typedRows.push(historyClosureProjectionRow26(entity.toLowerCase(),snapshot));
  if(entity!=='WAREHOUSE'||i<22){coreMembers.push(m);maintained.push({...m,version:1,nativeSnapshot:snapshot,operations:[]});}
  if(entity==='STAFF'){const proof={origin:'MIGRATION_DERIVED',reason:'SYNTHETIC_DATA_ONLY_NOT_REAL_BOOTSTRAP',evidence_ref:pin,raw:{synthetic:true}};
   staffProofs.push({sourceRowId:m.sourceRowId,bootstrapAccounts:proof});sourceRows.at(-1).projection.field_provenance={fields:{bootstrap_accounts:proof}};}
  if(entity==='WAREHOUSE')warehouses.push({targetType:'WAREHOUSE',targetId:m.nativeId,sourceEntityType:'WAREHOUSE',sourceKey:m.sourceKey,sourceRecordHash:pin,sourceFileRef:'synthetic.xlsx',nativeRecord:{id:id(2000+n),reviewedAt:'2026-10-04T04:00:00.000000Z',decisionReason:'SYNTHETIC_ORIGINAL_RECORD'}});
 }
 const sku=id(3000),skuSource=id(3001),skuRecord=id(3002),skuKey='SYN-SKU';source('SKU',skuSource,skuKey);
 typedRows.push(historyClosureProjectionRow26('sku',{id:sku,product_id:id(3003),color_id:id(3004),fit_id:id(3005),size_id:id(3006),sku_code:'SYN-CODE',enabled:true,version:1,created_operation_id:null}));
 const skuMemberships=[{targetType:'SKU',targetId:sku,sourceEntityType:'SKU',sourceKey:skuKey,sourceRecordHash:pin,sourceFileRef:'synthetic.xlsx',nativeRecord:{id:skuRecord,reviewedAt:'2026-10-04T04:00:00.000000Z',decisionReason:'SYNTHETIC_ORIGINAL_SKU'}}];
 for(let i=0;i<extraSkus;i++){const extraId=id(100000+i),key=`SYN-SKU-EXTRA-${i}`;source('SKU',id(200000+i),key);
  typedRows.push(historyClosureProjectionRow26('sku',{...typedRows.at(-1).projection,id:extraId,sku_code:key}));
  skuMemberships.push({...structuredClone(skuMemberships[0]),targetId:extraId,sourceKey:key,nativeRecord:{...skuMemberships[0].nativeRecord,id:id(300000+i)}});}
 const w=warehouses[0],stockKey='SYN-STOCK',ledger=stableImportId('baseline',b.fixedSourceNamespace,'INVENTORY_BASELINE',stockKey);
 const contributors=['-5','2'].map((signedQuantity,i)=>({sourceRowId:id(4000+i),sourceKey:`SYN-STOCK-${i}`,sourceFileSha256:pin,rowSha256:pin,fileRef:'synthetic-stock.xlsx',sheet:'SYN',rowNo:String(i+1),warehouseSourceKey:w.sourceKey,canonicalSkuSourceKey:skuKey,oldSkuSourceId:`SYN-OLD-SKU-${i}`,canonicalStockSourceKey:stockKey,warehouseId:w.targetId,skuId:sku,signedQuantity,sourceUnit:'件'}));
 for(const c of contributors){source('INVENTORY_BASELINE',c.sourceRowId,c.sourceKey);typedRows.push(historyClosureProjectionRow26('import_stock_contributor',{batch_id:b.batchId,source_row_id:c.sourceRowId,warehouse_id:c.warehouseId,canonical_sku_id:c.skuId,old_source_sku_id:c.oldSkuSourceId,canonical_stock_source_key:stockKey,source_unit:c.sourceUnit,signed_quantity:c.signedQuantity,baseline_ledger_id:ledger}));}
 const stock={effectiveStockCsvSha256:pin,contributorLineageCsvSha256:pin,contributors,effectiveGroups:[{canonicalStockSourceKey:stockKey,warehouseSourceKey:w.sourceKey,canonicalSkuSourceKey:skuKey,warehouseId:w.targetId,skuId:sku,signedQuantity:'-3',sourceUnit:'件',contributorCount:2,effectiveRowHash:pin}],warehouses:warehouses.map((r,i)=>({sourceKey:r.sourceKey,nativeId:r.targetId,signedQuantity:i===0?'-3':'0'})),warehouseUnits:[{warehouseSourceKey:w.sourceKey,sourceUnit:'件',signedQuantity:'-3'}]};
 const expectedCounts={...Object.fromEntries(HISTORY_COUNT_KEYS.map(k=>[k,0])),import_source_row:sourceRows.length,import_stock_contributor:2};
 const data={binding:b,core:{coreReceiptId:coreReceipt,coreSourceDigest:'b'.repeat(64),coreMembers,staffProofs,coreMaintenanceBinding:{version:'CORE_MAINTENANCE_BINDING_V1',members:maintained}},
  groups:HISTORY_CLOSURE_SOURCE_GROUPS.map(group=>({group,artifacts:['original','normalized','prepared-native','mapping-decisions'].map(logicalRole=>({logicalRole,bytes:100,sha256:pin,rows:1,memberCoverage:{rows:1,sha256:pin},path:`/synthetic/hostA/${group}/${logicalRole}`}))})),
  expectedCounts,expectedSourceEntityCounts:sourceCounts,inventoryExpectedCounts:{WAREHOUSE:53,SKU:1+extraSkus,INVENTORY_LEDGER:1,IMPORT_BATCH:1},stock};
 const coreClaims=warehouses.slice(0,22).map(r=>({batchId:b.batchId,importRecordId:r.nativeRecord.id,targetType:'WAREHOUSE',targetId:r.targetId,operationId:coreReceipt,checkpointSequence:1}));
 const current={actorAccountId:actor,fixedSourceNamespace:b.fixedSourceNamespace,selectionSha256:b.selectionSha256,status:'STAGED',fullBinding:null,coreClaims,coreWarehouses:warehouses.slice(0,22),claims:structuredClone(coreClaims),
  committedOperations:[],checkpoint:{sequence:2,cursor:22,counts:{WAREHOUSE:22,SKU:0,INVENTORY_LEDGER:0,IMPORT_BATCH:0},expected:{}}};
 const sort=(a,b)=>Buffer.compare(Buffer.from(a.relation+'\0'+a.key),Buffer.from(b.relation+'\0'+b.key));sourceRows.sort(sort);typedRows.sort(sort);
 return {data,sourceRows,typedRows,documents:[],warehouses,skuMemberships,baselineItems:[{targetType:'INVENTORY_LEDGER',sourceEntityType:'INVENTORY_BASELINE',sourceKey:stockKey,sourceRecordHash:pin,sourceFileRef:'synthetic-stock.xlsx',warehouseId:w.targetId,skuId:sku,quantity:-3n,businessDate:'2026-10-04'}],verifiedCurrent:current,actorAccountId:actor,sourceManifestRef:'synthetic:full-scope',requestKeys:{bind:'SYN-BIND',account:Array.from({length:33+extraSkus},(_,i)=>`SYN-ACCOUNT-${i}`),publish:'SYN-PUBLISH'},chunkRows:1};
}
test('full preparation DATA hash binds all11 content coverage CORE and stock while physical paths do not change it',()=>{
 const f=fullFixture(),original=structuredClone(f.data),p=prepareFullPayloadData26(f.data);assert.deepEqual(f.data,original);assert.notEqual(p.authorizedPayloadHash,pin);assert.notEqual(p.authorizedPayloadHash,f.data.core.coreSourceDigest);
 const relocated=structuredClone(f.data);for(const g of relocated.groups)for(const r of g.artifacts)r.path=r.path.replace('hostA','hostB');assert.equal(prepareFullPayloadData26(relocated).authorizedPayloadHash,p.authorizedPayloadHash);
 const changed=structuredClone(f.data);changed.groups[0].artifacts[0].sha256='c'.repeat(64);assert.notEqual(prepareFullPayloadData26(changed).authorizedPayloadHash,p.authorizedPayloadHash);
 assert.equal(JSON.stringify(p.dataManifest).includes('hostA'),false);assert.equal(p.stockConservation.warehouses.length,53);assert.equal(p.stockConservation.effectiveGroupCount,1);
});
test('full preparation refuses partial11 missing coverage secret proof and perwarehouse/unit drift before full hash',()=>{
 for(const change of [d=>d.groups.pop(),d=>{d.groups[0].artifacts[0].memberCoverage=null;},d=>{d.core.staffProofs[0].bootstrapAccounts.raw.password_hash='POISON';},
  d=>{d.stock.warehouses[0].signedQuantity='0';},d=>{d.stock.warehouseUnits[0].signedQuantity='0';},d=>{d.stock.contributors[0].signedQuantity='-4';}]){
  const f=fullFixture();change(f.data);assert.throws(()=>prepareFullPayloadData26(f.data),/FULL_PAYLOAD/);
 }
});
test('full preparation builds real expected roots first then original BIND nonzero MAIN and PUBLISH with fixed keys',async()=>{
 const f=fullFixture(),p=await prepareFullSourceBindings26(f);
 assert.equal(p.commands.BIND.expectedSequence,2);assert.equal(p.commands.BIND.expectedCursor,22);assert.equal(p.commands.ACCOUNT.length,33);
 assert.equal(p.commands.ACCOUNT[0].expectedSequence,3);assert.equal(p.commands.ACCOUNT[0].expectedCursor,22);
 assert.equal(p.commands.PUBLISH.expectedCursor,55);assert.equal(p.commands.PUBLISH.historyClosure.authorizedPayloadHash,p.authorizedPayloadHash);
 assert.equal(p.commands.ACCOUNT.at(-1).items[0].quantity,-3n);assert.equal(p.expected.plan.expectedCounts.import_stock_contributor,2);
 assert.equal(p.executionAuthorizationIssued,false);assert.equal(p.executionReady,false);assert.equal(p.remainingCommands.length,35);
 const truncated=fullFixture();truncated.sourceRows=truncated.sourceRows.slice(1);await assert.rejects(prepareFullSourceBindings26(truncated));
 const wrongProof=fullFixture();wrongProof.sourceRows.find(r=>r.projection.entity_type==='STAFF').projection.field_provenance.fields.bootstrap_accounts.raw.synthetic=false;
 // Keep DATA and source representations independent, as on the real retained reader.
 wrongProof.data.core.staffProofs[0].bootstrapAccounts=structuredClone(f.data.core.staffProofs[0].bootstrapAccounts);
 await assert.rejects(prepareFullSourceBindings26(wrongProof),/FULL_PREP_ORIGINAL_PROOF_CHANGED/);
});
test('v20 full preparation preserves original millisecond WH CORE and SKU record text without padding',async()=>{
 const f=fullFixture(),time=new Date('2026-10-04T04:00:00.123Z').toISOString();
 for(const item of [...f.warehouses,...f.skuMemberships])item.nativeRecord.reviewedAt=time;
 const original=structuredClone({warehouses:f.warehouses,skus:f.skuMemberships,core:f.verifiedCurrent.coreWarehouses,keys:f.requestKeys});
 const p=await prepareFullSourceBindings26(f);
 assert.deepEqual({warehouses:f.warehouses,skus:f.skuMemberships,core:f.verifiedCurrent.coreWarehouses,keys:f.requestKeys},original);
 const members=p.commands.ACCOUNT.flatMap(c=>c.items).filter(item=>item.targetType!=='INVENTORY_LEDGER');
 assert.equal(members.length,32);assert.ok(members.every(item=>item.nativeRecord.reviewedAt===time));
 assert.ok(f.verifiedCurrent.coreWarehouses.every(core=>f.warehouses.some(item=>requestHash(item)===requestHash(core))));
 assert.equal(p.commands.ACCOUNT.at(-1).items[0].quantity,-3n);assert.equal(p.executionAuthorizationIssued,false);assert.equal(p.executionReady,false);
});
test('full preparation resumes only frozen original command prefix with no source reread or changed committed body',async()=>{
 const f=fullFixture(),p=await prepareFullSourceBindings26(f),current=structuredClone(f.verifiedCurrent);
 let cp={...current.checkpoint,expected:f.data.inventoryExpectedCounts};
 current.committedOperations=[p.commands.BIND,p.commands.ACCOUNT[0]].map((c,i)=>{const before=structuredClone(i?cp:current.checkpoint);cp={...cp,sequence:c.expectedSequence+1,cursor:c.expectedCursor+(i?1:0),counts:{...cp.counts,WAREHOUSE:22+(i?1:0)}};
  return {operationId:stableImportId('operation',f.actorAccountId,c.requestKey),requestKey:c.requestKey,requestHash:requestHash(c),action:c.action,beforeCheckpoint:before,checkpoint:structuredClone(cp),result:{}};});
 current.checkpoint=cp;current.fullBinding=p.commands.BIND.fullBinding;
 const claimed=p.commands.ACCOUNT[0].items[0];current.claims.push({batchId:f.data.binding.batchId,importRecordId:claimed.nativeRecord.id,targetType:claimed.targetType,targetId:claimed.targetId,
  operationId:stableImportId('operation',f.actorAccountId,p.commands.ACCOUNT[0].requestKey),checkpointSequence:cp.sequence});
 const neverRead={async *[Symbol.asyncIterator](){throw Error('MUST_REUSE_EXPECTED');}};
 const resumed=await prepareFullSourceBindings26({...f,verifiedCurrent:current,originalCommands:p.commands,originalExpected:p.expected,sourceRows:neverRead,typedRows:neverRead});
 assert.equal(resumed.remainingCommands[0].requestKey,p.commands.ACCOUNT[1].requestKey);assert.deepEqual(resumed.commands,p.commands);assert.equal(resumed.remainingCommands.length,33);
 const bad=structuredClone(p.commands);bad.ACCOUNT[0].items[0].sourceRecordHash='f'.repeat(64);
 await assert.rejects(prepareFullSourceBindings26({...f,verifiedCurrent:current,originalCommands:bad,originalExpected:p.expected}),/FULL_PREP_COMMAND_ITEM_CHANGED/);
 await assert.rejects(prepareFullSourceBindings26({...f,verifiedCurrent:current}),/FULL_PREP_ORIGINAL_COMMANDS_REQUIRED/);
});
test('full preparation private writer freezes actual bytes and never issues execution authority',async t=>{
 const parent=await mkdtemp(join(tmpdir(),'synthetic-full-preparation-'));t.after(()=>rm(parent,{recursive:true,force:true}));
 const p=await prepareFullSourceBindings26(fullFixture()),out=await writeFullSourceBindings26({outputParent:parent,registrationId:'fixed-once',prepared:p});
 for(const ref of out.files){const bytes=await readFile(ref.path);assert.equal(bytes.length,ref.bytes);assert.equal((await stat(ref.path)).mode&0o777,0o600);}
 assert.equal(out.executionAuthorizationIssued,false);assert.equal(out.executionReady,false);
 await assert.rejects(writeFullSourceBindings26({outputParent:parent,registrationId:'fixed-once',prepared:p}),{code:'EEXIST'});
});

test('linear preparation preserves complete synthetic commands and closure roots at bounded scale',async t=>{
 const start=performance.now(),p=await prepareFullSourceBindings26(fullFixture(512));
 t.diagnostic(JSON.stringify({syntheticSkuCount:513,elapsedMs:performance.now()-start,digest:requestHash({commands:p.commands,expected:p.expected})}));
 assert.equal(p.commands.ACCOUNT.length,545);assert.equal(requestHash({commands:p.commands,expected:p.expected}),'0f2e628f79b538ebfa87f3123df242eb03b99c894f5be4c62fdf26c1b392c79e');
});

test('linear lookups preserve duplicate and altered baseline or command membership refusals',async()=>{
 const duplicate=fullFixture(1);duplicate.skuMemberships[1].sourceKey=duplicate.skuMemberships[0].sourceKey;
 await assert.rejects(prepareFullSourceBindings26(duplicate),/FULL_PREP_DUPLICATE_ITEM/);
 for(const change of [f=>{f.baselineItems[0].quantity=-4n;},f=>{f.baselineItems[0].sourceKey='UNKNOWN';},f=>{f.baselineItems[0].warehouseId=f.warehouses[1].targetId;}]){
  const f=fullFixture();change(f);await assert.rejects(prepareFullSourceBindings26(f),/FULL_PREP_BASELINE_CHANGED/);}
 const f=fullFixture(),prepared=await prepareFullSourceBindings26(f);
 const altered=structuredClone(prepared.commands);altered.ACCOUNT.at(-1).items[0].quantity=-4n;
 await assert.rejects(prepareFullSourceBindings26({...f,originalCommands:altered,originalExpected:prepared.expected}),/FULL_PREP_COMMAND_ITEM_CHANGED/);
 const duplicateGroup=fullFixture();duplicateGroup.data.stock.effectiveGroups.push(structuredClone(duplicateGroup.data.stock.effectiveGroups[0]));
 await assert.rejects(prepareFullSourceBindings26(duplicateGroup),/FULL_PAYLOAD_EFFECTIVE_GROUP/);
});
