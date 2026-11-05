import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,writeFile,symlink,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {paymentSourceFixture,id} from './payment-source-fixture.test-support.mjs';
import {prepareNativePaymentImportChunk} from '../../packages/application/src/native-payment-import.ts';
import {openAuthorizedNativePaymentReader} from './authorized-native-payment-reader.mjs';
import {IMPORT_V2_TABLES} from '../../packages/application/src/import-v2-contract.ts';

export const paymentDecision=q=>{
 const kind=q.entity;
 if(kind==='PAYMENT_METHOD')return {nativeId:id(q.sourceKey==='method-A'?10:11),enabledMapping:{raw:q.rawFields.状态,native:true,evidenceRef:'synthetic-reviewed-state'},references:{}};
 const ref=(entity,sourceKey,nativeId,nativeSnapshot)=>({entity,sourceKey,nativeId,nativeSnapshot});
 const method={id:id(10),name:'原方式A',enabled:true,version:1},account={id:id(20),name:'原账户名',payment_method_id:id(10),enabled:true,version:1};
 if(kind==='PAYMENT_ACCOUNT')return {nativeId:id(20),enabledMapping:{raw:q.rawFields.状态,native:true,evidenceRef:'synthetic-reviewed-state'},references:{收款方式来源编号:ref('PAYMENT_METHOD','method-A',id(10),method)}};
 return {nativeId:null,enabledMapping:null,references:{账户来源编号:ref('PAYMENT_ACCOUNT','account',id(20),account),厅来源编号:ref('HALL','hall',id(30),{id:id(30),name:'synthetic hall',default_customer_id:null,default_sales_warehouse_id:null,enabled:true,version:1})}};
};
const input=(o,r)=>({batchId:o.batchId,fixedSourceNamespace:o.fixedSourceNamespace,selection:r.selection,rows:[{source:r.source,...paymentDecision({entity:r.source.entityType,sourceKey:r.source.sourceKey,rawFields:r.source.rawFields})}]});

test('sealed native payment reader authenticates all selected original occurrences before exact independent method/account/recommendation decisions',async t=>{
 const options=await paymentSourceFixture(t),reader=await openAuthorizedNativePaymentReader({...options,resolveNativeBinding:async q=>paymentDecision(q)});t.after(()=>reader.close());
 assert.equal(reader.report.selectedRows,4);assert.equal(reader.report.preflight.originalSourceMoneyVerification.approvedCellsMatched,32);assert.equal(reader.report.importReady,false);
 let count=0;
 for await(const record of reader.rows()){
  const prepared=prepareNativePaymentImportChunk(input(options,record));await reader.authorize(prepared);count++;
  if(record.source.entityType==='PAYMENT_ACCOUNT_HALL'){assert.equal(record.source.sourceKey,JSON.stringify(['account','hall']));assert.equal(Object.hasOwn(record.source.rawFields,'来源编号'),false);assert.deepEqual(Object.keys(record.source.fieldProvenance.fields),['账户来源编号','厅来源编号']);}
 }
 assert.equal(count,4);assert.equal((await readdir(options.spoolParent)).length,1);
 await reader.close();assert.deepEqual(await readdir(options.spoolParent),[]);
});
test('native payment source authorization refuses changed sources/decisions, getters/symbols, missing resolver and authority mutation',async t=>{
 const options=await paymentSourceFixture(t);let calls=0;
 const reader=await openAuthorizedNativePaymentReader({...options,resolveNativeBinding:async q=>{calls++;return paymentDecision(q);}});t.after(()=>reader.close());
 let record;for await(const r of reader.rows('PAYMENT_METHOD')){record=r;break;}
 const chunk=prepareNativePaymentImportChunk(input(options,record));
 const changed=structuredClone(chunk.input);changed.rows[0].nativeId=id(99);await assert.rejects(reader.authorize(prepareNativePaymentImportChunk(changed)),/BINDING_MISMATCH/);
 const before=calls;let getterCalls=0;const accessor=Object.defineProperty({},'input',{enumerable:true,get(){getterCalls++;return chunk.input;}});
 await assert.rejects(reader.authorize(accessor));await assert.rejects(reader.authorize({...chunk,[Symbol('extra')]:true}));assert.equal(getterCalls,0);assert.equal(calls,before);
 const noResolver=await openAuthorizedNativePaymentReader(options);t.after(()=>noResolver.close());await assert.rejects(noResolver.authorize(chunk),/RESOLVER_REQUIRED/);
 await writeFile(options.v3Approval,'changed authority');await assert.rejects(reader.authorize(chunk),/APPROVAL_PIN/);
});
test('native payment reader validates external pins, safe non-Git/link ancestors and complete spool before yielding',async t=>{
 const options=await paymentSourceFixture(t);
 await assert.rejects(openAuthorizedNativePaymentReader({...options,trustedApprovalSha256:undefined}),/PINS_REQUIRED/);
 await assert.rejects(openAuthorizedNativePaymentReader({...options,v3Approval:join(options.v3Amendment,'approval.json')}),/EXTERNAL_APPROVAL/);
 const linked=join(options.spoolParent,'linked');await symlink(options.base,linked);await assert.rejects(openAuthorizedNativePaymentReader({...options,base:linked}),/SYMLINK/);
 const git=join(options.spoolParent,'git-parent');await mkdir(git,{mode:0o700});await mkdir(join(git,'.git'));await assert.rejects(openAuthorizedNativePaymentReader({...options,spoolParent:git}),/GIT/);
 const reader=await openAuthorizedNativePaymentReader(options);t.after(()=>reader.close());const directory=(await readdir(options.spoolParent)).find(n=>n.startsWith('payment-source-'));const spool=join(options.spoolParent,directory,'selected.jsonl');
 const bytes=await readFile(spool);bytes[bytes.length-2]^=1;await writeFile(spool,bytes);let yielded=0;
 await assert.rejects(async()=>{for await(const _ of reader.rows())yielded++;},/SPOOL_CHANGED/);assert.equal(yielded,0);
});
test('sealed native payment reader preserves empty recommendation page and rejects duplicate/rewritten original payment rows',async t=>{
 const options=await paymentSourceFixture(t,({files,sourceRows})=>{const table=IMPORT_V2_TABLES.find(x=>x.entity==='PAYMENT_ACCOUNT_HALL');files.set(table.file,table.columns.map(x=>x.name).join(',')+'\n');const at=sourceRows.findIndex(r=>r.entity==='PAYMENT_ACCOUNT_HALL');sourceRows.splice(at,1);});
 const reader=await openAuthorizedNativePaymentReader(options);t.after(()=>reader.close());assert.equal(reader.report.counts.PAYMENT_ACCOUNT_HALL,0);let count=0;for await(const _ of reader.rows('PAYMENT_ACCOUNT_HALL'))count++;assert.equal(count,0);
 const duplicate=await paymentSourceFixture(t,({sourceRows})=>sourceRows.push(structuredClone(sourceRows.find(r=>r.entity==='PAYMENT_METHOD'))));
 await assert.rejects(openAuthorizedNativePaymentReader(duplicate),/MISSING_DUPLICATE_SOURCE/);assert.deepEqual(await readdir(duplicate.spoolParent),[]);
 const rewrite=await paymentSourceFixture(t,({sourceRows})=>{sourceRows.find(r=>r.entity==='PAYMENT_ACCOUNT').data.账户显示名称='rewrite';});
 await assert.rejects(openAuthorizedNativePaymentReader(rewrite),/NONMONEY_REWRITE/);assert.deepEqual(await readdir(rewrite.spoolParent),[]);
});
test('native payment reader rejects accessors returned by asynchronous resolver without executing them',async t=>{
 const options=await paymentSourceFixture(t);let getters=0;
 const reader=await openAuthorizedNativePaymentReader({...options,resolveNativeBinding:async q=>Object.defineProperty(paymentDecision(q),'nativeId',{enumerable:true,get(){getters++;return id(10);}})});t.after(()=>reader.close());
 let record;for await(const r of reader.rows('PAYMENT_METHOD')){record=r;break;}
 await assert.rejects(reader.authorize(prepareNativePaymentImportChunk(input(options,record))));assert.equal(getters,0);
});
test('native payment reader lower spool cap rejects over-limit input before yield or binding and retains default compatibility',async t=>{
 const options=await paymentSourceFixture(t);let callbacks=0;
 await assert.rejects(openAuthorizedNativePaymentReader({...options,maxSpoolBytes:1,resolveNativeBinding:async q=>{callbacks++;return paymentDecision(q);}}),/SPOOL_LIMIT/);
 assert.equal(callbacks,0);assert.deepEqual(await readdir(options.spoolParent),[]);
 for(const value of [0,-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER,512*1024*1024+1,'128'])await assert.rejects(openAuthorizedNativePaymentReader({...options,maxSpoolBytes:value}),/SPOOL_BOUND/);
 let getters=0;await assert.rejects(openAuthorizedNativePaymentReader(Object.defineProperty({...options},'maxSpoolBytes',{enumerable:true,get(){getters++;return 128;}})),/OPTIONS/);assert.equal(getters,0);
 const reader=await openAuthorizedNativePaymentReader(options);t.after(()=>reader.close());assert.equal(reader.report.selectedRows,4);
});
test('original recommendation envelope may have an empty sourceId placeholder while identity remains only its exact original pair',async t=>{
 const options=await paymentSourceFixture(t,({sourceRows})=>{sourceRows.find(r=>r.entity==='PAYMENT_ACCOUNT_HALL').sourceId='';});
 const reader=await openAuthorizedNativePaymentReader({...options,resolveNativeBinding:async q=>paymentDecision(q)});t.after(()=>reader.close());
 let count=0;for await(const record of reader.rows('PAYMENT_ACCOUNT_HALL')){count++;assert.equal(record.source.sourceKey,JSON.stringify(['account','hall']));assert.equal(Object.hasOwn(record.source.rawFields,'来源编号'),false);await reader.authorize(prepareNativePaymentImportChunk(input(options,record)));}assert.equal(count,1);
 for(const value of ['FORGED-OPAQUE-ID',' ',null,JSON.stringify(['other-account','hall'])]){
  const mismatch=await paymentSourceFixture(t,({sourceRows})=>{sourceRows.find(r=>r.entity==='PAYMENT_ACCOUNT_HALL').sourceId=value;});
  let callbacks=0;
  await assert.rejects(openAuthorizedNativePaymentReader({...mismatch,resolveNativeBinding:async q=>{callbacks++;return paymentDecision(q);}}),/SOURCE_PROVENANCE/);
  assert.equal(callbacks,0);assert.deepEqual(await readdir(mismatch.spoolParent),[]);
 }
});
