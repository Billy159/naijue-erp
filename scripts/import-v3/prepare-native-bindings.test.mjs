import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeIdentityRegistry, reviewedPartyBinding, sourceEvidence, prepareFullPayloadData26, prepareFullSourceBindings26, writeFullSourceBindings26 } from './prepare-native-bindings.mjs';
import {historyClosureProjectionRow26,HISTORY_CLOSURE_SOURCE_ENTITIES} from '../../packages/application/src/history-typed-closure.ts';
import {HISTORY_CLOSURE_SOURCE_GROUPS} from '../import-v2/authorized-history-closure-reader.mjs';
import {HISTORY_COUNT_KEYS} from '../../packages/application/src/history-storage-contract.ts';
import {stableImportId} from '../../packages/application/src/inventory-cutoff-import.ts';
import {requestHash} from '../../packages/application/src/request-hash.ts';
import {mkdtemp,readFile,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import { prepareNativePartyImportChunk } from '../../packages/application/src/native-party-import.ts';
import { IMPORT_V2_TABLES } from '../../packages/application/src/import-v2-contract.ts';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const pin = 'a'.repeat(64), binding = { batchId: id(1), fixedSourceNamespace: 'synthetic:isolated' };
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
