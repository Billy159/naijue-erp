import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,readdir,rm,open,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {paymentSourceFixture,materializedHistoryFixture,id} from './payment-source-fixture.test-support.mjs';
import {IMPORT_V2_TABLES} from '../../packages/application/src/import-v2-contract.ts';
import {prepareHistorySettlementChunk} from '../../packages/application/src/import-v3-history-settlement.ts';
import {openAuthorizedSettlementReader,resolveSettlementSourceBinding} from './authorized-settlement-reader.mjs';
const binding=q=>({header:{sourceKey:'sale-header',nativeId:id(100),sourceRowId:id(101),sourceFileSha256:'d'.repeat(64),rowSha256:'e'.repeat(64),version:1},
 account:{entity:'PAYMENT_ACCOUNT',sourceKey:'account',nativeId:id(20),sourceRowId:id(102),sourceFileSha256:'d'.repeat(64),rowSha256:'e'.repeat(64),fingerprint:'f'.repeat(64),nativeSnapshot:{id:id(20),name:'original account',payment_method_id:id(10),enabled:true,version:1}},
 method:q.rawFields.原收款方式来源编号?{entity:'PAYMENT_METHOD',sourceKey:'method-B',nativeId:id(11),sourceRowId:id(103),sourceFileSha256:'d'.repeat(64),rowSha256:'e'.repeat(64),fingerprint:'f'.repeat(64),nativeSnapshot:{id:id(11),name:'original methodB',enabled:true,version:1}}:null});
const input=(o,r)=>({batchId:o.batchId,fixedSourceNamespace:o.fixedSourceNamespace,selection:r.selection,moneyApprovals:r.moneyApprovals,rows:[{source:r.source,...binding({rawFields:r.source.rawFields})}]});
test('settlement finite cache: complete initial seal and EOF reads remain constant across per-row authorization and changed cache is refused',async t=>{
 const options=await materializedHistoryFixture(t,'SETTLEMENT'),probe=await open(options.v3Approval),prototype=Object.getPrototypeOf(probe),originalRead=prototype.read;await probe.close();let cacheStarts=0;
 const mock=t.mock.method(prototype,'read',async function(buffer,offset,length,position){const result=await originalRead.call(this,buffer,offset,length,position);if(position===0&&result.bytesRead>0&&buffer.subarray(offset,offset+result.bytesRead).toString('utf8').startsWith('{"source":'))cacheStarts++;return result;});
 const reader=await openAuthorizedSettlementReader({...options,resolveNativeBinding:binding});t.after(()=>reader.close());assert.equal(cacheStarts,1,'The complete cache content is sealed before the reader is returned');
 const records=[];for await(const r of reader.rows())records.push(r);assert.equal(cacheStarts,2,'One complete rows iteration retains its EOF content seal');
 const chunk=prepareHistorySettlementChunk({...input(options,records[0]),rows:records.map(r=>({source:r.source,...binding({rawFields:r.source.rawFields})}))});
 for(let i=0;i<3;i++)await reader.authorize(chunk);assert.equal(cacheStarts,2,'Authorization must not reread the complete cache per row');mock.mock.restore();
 const directory=(await readdir(options.spoolParent))[0],path=join(options.spoolParent,directory,'selected.jsonl'),bytes=await readFile(path);bytes[20]=bytes[20]===88?89:88;await writeFile(path,bytes);
 await assert.rejects(reader.authorize(chunk),/SPOOL_CHANGED/);await reader.close();assert.deepEqual(await readdir(options.spoolParent),[]);
});
test('settlement finite offset source: original CR, methodB and absent NULL retain whole32 through existing authorization',async t=>{
 const options=await materializedHistoryFixture(t,'SETTLEMENT'),original=(await readFile(join(options.base,'snapshots/all-business-source-rows.jsonl'),'utf8')).split('\n').find(l=>l.includes('"sourceId":"settlement-1"'));
 await rm(join(options.base,IMPORT_V2_TABLES.find(t=>t.entity==='BARCODE').file));
 const reader=await openAuthorizedSettlementReader({...options,resolveNativeBinding:binding});t.after(()=>reader.close());
 assert.equal(reader.report.preflight,null);assert.equal(reader.report.materializedSource.noFullSnapshotScan,true);assert.equal(reader.report.rawRowsScanned,2);assert.equal(reader.report.selectedRows,2);
 let count=0;for await(const record of reader.rows()){
  assert.equal(record.moneyApprovals.size,32);const chunk=prepareHistorySettlementChunk(input(options,record));await reader.authorize(chunk);
  if(record.source.sourceKey==='settlement-1'){assert.equal(record.source.rowSha256,createHash('sha256').update(original).digest('hex'));assert.equal(chunk.rows[0].settlement.payment_method_id_snapshot,id(11));assert.equal(chunk.rows[0].account.nativeSnapshot.payment_method_id,id(10));assert.equal(chunk.rows[0].settlement.amount,'7.03');}
  else{assert.equal(Object.hasOwn(record.source.rawFields,'原收款方式来源编号'),false);assert.equal(Object.hasOwn(record.source.normalizedFields,'原收款方式来源编号'),false);assert.equal(chunk.rows[0].settlement.payment_method_id_snapshot,null);assert.equal(chunk.rows[0].settlement.amount,'0.00');}count++;
 }
 assert.equal(count,2);await reader.close();assert.deepEqual(await readdir(options.spoolParent),[]);
 const wrong=await materializedHistoryFixture(t,'SETTLEMENT');await assert.rejects(openAuthorizedSettlementReader({...wrong,approvedMoneyOverlaySha256:'f'.repeat(64)}),/SELECTION/);assert.deepEqual(await readdir(wrong.spoolParent),[]);
 const changed=await materializedHistoryFixture(t,'SETTLEMENT',({sourceRows})=>{sourceRows.find(r=>r.sourceId==='settlement-1').data.原账户显示名='changed';});
 await assert.rejects(openAuthorizedSettlementReader(changed),/NONMONEY_REWRITE/);assert.deepEqual(await readdir(changed.spoolParent),[]);
 const money=await materializedHistoryFixture(t,'SETTLEMENT',({sourceRows})=>{sourceRows.find(r=>r.sourceId==='settlement-1').data.金额='8.03';});
 await assert.rejects(openAuthorizedSettlementReader(money),/MONEY_CELL_NOT_APPROVED/);assert.deepEqual(await readdir(money.spoolParent),[]);
});
test('settlement adopted source bindings: original methodB or absent NULL feeds existing reader authorization independently of account methodA',async t=>{
 const options=await paymentSourceFixture(t),headers=new Map(),accounts=new Map(),methods=new Map(),reader=await openAuthorizedSettlementReader({...options,resolveNativeBinding:q=>resolveSettlementSourceBinding(q,headers,accounts,methods)});t.after(()=>reader.close());let count=0;
 for await(const record of reader.rows()){const q={rawFields:record.source.rawFields,normalizedFields:record.source.normalizedFields},b=binding(q);headers.set(b.header.sourceKey,b.header);accounts.set(b.account.sourceKey,b.account);if(b.method)methods.set(b.method.sourceKey,b.method);const resolved=resolveSettlementSourceBinding(q,headers,accounts,methods),chunk=prepareHistorySettlementChunk({...input(options,record),rows:[{source:record.source,...resolved}]});await reader.authorize(chunk);assert.equal(Object.hasOwn(resolved.header,'hallId'),false);assert.equal(chunk.rows[0].settlement.payment_method_id_snapshot,b.method?.nativeId??null);assert.equal(resolved.account.nativeSnapshot.payment_method_id,id(10));if(b.method){assert.equal(resolved.method.nativeId,id(11));assert.throws(()=>resolveSettlementSourceBinding(q,headers,accounts,new Map()),/BINDING_MISMATCH/);}else assert.equal(resolved.method,null);resolved.header.nativeId=id(99);assert.equal(headers.get(b.header.sourceKey).nativeId,id(100));count++;}assert.equal(count,2);
});
test('sealed settlement source authenticates original JSONL bytes including CR, whole32, independent methodB and absent optional method NULL',async t=>{
 const options=await paymentSourceFixture(t),reader=await openAuthorizedSettlementReader({...options,resolveNativeBinding:async q=>binding(q)});t.after(()=>reader.close());
 assert.equal(reader.report.selectedRows,2);assert.equal(reader.report.preflight.originalSourceMoneyVerification.approvedCellsMatched,32);
 const original=(await readFile(join(options.base,'snapshots/all-business-source-rows.jsonl'),'utf8')).split('\n').find(l=>l.includes('"sourceId":"settlement-1"'));
 let count=0;
 for await(const record of reader.rows()){
  const chunk=prepareHistorySettlementChunk(input(options,record));await reader.authorize(chunk);count++;
  if(record.source.sourceKey==='settlement-1'){assert.equal(record.source.rowSha256,createHash('sha256').update(original).digest('hex'));assert.equal(chunk.rows[0].settlement.payment_method_id_snapshot,id(11));assert.equal(chunk.rows[0].account.nativeSnapshot.payment_method_id,id(10));assert.equal(chunk.rows[0].settlement.amount,'7.03');}
  else {assert.equal(Object.hasOwn(record.source.rawFields,'原收款方式来源编号'),false);assert.equal(Object.hasOwn(record.source.normalizedFields,'原收款方式来源编号'),false);assert.equal(chunk.rows[0].settlement.payment_method_id_snapshot,null);}
 }
 assert.equal(count,2);await reader.close();assert.deepEqual(await readdir(options.spoolParent),[]);
});
test('settlement authorization refuses reconstructed source/whole32 or native bindings and detects close while resolver awaits',async t=>{
 const options=await paymentSourceFixture(t);let closeDuringResolve=false,reader;
 reader=await openAuthorizedSettlementReader({...options,resolveNativeBinding:async q=>{if(closeDuringResolve)await reader.close();return binding(q);}});t.after(()=>reader.close());
 let record;for await(const r of reader.rows()){record=r;break;}const original=input(options,record),chunk=prepareHistorySettlementChunk(original);
 const forged=structuredClone(original);forged.rows[0].account.nativeId=id(99);forged.rows[0].account.nativeSnapshot.id=id(99);await assert.rejects(reader.authorize(prepareHistorySettlementChunk(forged)),/BINDING_MISMATCH/);
 const altered=structuredClone(original);altered.rows[0].source.rawFields.原账户显示名='rewrite';altered.rows[0].source.normalizedFields.原账户显示名='rewrite';altered.rows[0].source.fieldProvenance.fields.原账户显示名.raw='rewrite';await assert.rejects(reader.authorize(prepareHistorySettlementChunk(altered)),/SOURCE_NOT_AUTHORIZED/);
 const missing=structuredClone(original);missing.moneyApprovals.delete(missing.moneyApprovals.keys().next().value);await assert.rejects(async()=>reader.authorize(prepareHistorySettlementChunk(missing)));
 let getterCalls=0;await assert.rejects(reader.authorize(Object.defineProperty({},'input',{enumerable:true,get(){getterCalls++;return original;}})));assert.equal(getterCalls,0);
 closeDuringResolve=true;await assert.rejects(reader.authorize(chunk),/CLOSED/);
});
test('sealed settlement reader refuses self-rehashed original text rewrite and unsupported entity without yielding',async t=>{
 const changed=await paymentSourceFixture(t,({sourceRows})=>{sourceRows.find(r=>r.sourceId==='settlement-1').data.原账户显示名='changed text';});
 await assert.rejects(openAuthorizedSettlementReader(changed),/NONMONEY_REWRITE/);assert.deepEqual(await readdir(changed.spoolParent),[]);
 const options=await paymentSourceFixture(t),reader=await openAuthorizedSettlementReader(options);t.after(()=>reader.close());
 await assert.rejects(async()=>{for await(const _ of reader.rows('SALES_LINE')){}},/ENTITY_NOT_SUPPORTED/);
 let record;for await(const r of reader.rows()){record=r;break;}await assert.rejects(reader.authorize(prepareHistorySettlementChunk(input(options,record))),/RESOLVER_REQUIRED/);
});
test('settlement reader lower spool cap remains bounded and authenticates complete package before permitted rows',async t=>{
 const options=await paymentSourceFixture(t);let callbacks=0;
 await assert.rejects(openAuthorizedSettlementReader({...options,maxSpoolBytes:1,resolveNativeBinding:async q=>{callbacks++;return binding(q);}}),/SPOOL_LIMIT/);assert.equal(callbacks,0);assert.deepEqual(await readdir(options.spoolParent),[]);
 const reader=await openAuthorizedSettlementReader({...options,maxSpoolBytes:128*1024*1024,resolveNativeBinding:async q=>binding(q)});t.after(()=>reader.close());
 assert.equal(reader.report.preflight.originalSourceMoneyVerification.approvedCellsMatched,32);assert.ok(reader.report.spoolBytes<=128*1024*1024);
 let count=0;for await(const record of reader.rows()){await reader.authorize(prepareHistorySettlementChunk(input(options,record)));count++;}assert.equal(count,2);
});
