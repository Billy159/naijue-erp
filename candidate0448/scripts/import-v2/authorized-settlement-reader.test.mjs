import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,readdir,rm,open,writeFile,mkdtemp,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
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
async function capturedSettlementFixture(t){
 const {settlementChunk}=await import('../../tests/support/history-settlement-fixtures.ts'),{v2MoneyApprovalSet}=await import('../../packages/application/src/import-v2.ts'),{stableImportId}=await import('../../packages/application/src/inventory-cutoff-import.ts'),{historyClosureProjectionRow26}=await import('../../packages/application/src/history-typed-closure.ts'),{HISTORY_SETTLEMENT_VERSION}=await import('../../packages/application/src/import-v3-history-settlement.ts');
 const input=settlementChunk(),without=settlementChunk(false).rows[0];without.source.sourceKey='SETTLEMENT-0002';without.source.rowNo='3';without.source.rawFields.来源编号=without.source.sourceKey;without.source.normalizedFields.来源编号=without.source.sourceKey;for(const row of [without.source.rawFields,without.source.normalizedFields])Object.assign(row,{原收退行号:'10',方向:'收款',金额:'0.00',原账户显示名:'',原方式显示名:''});input.rows.push(without);
 const first=input.rows[0].source;first.rawFields.金额='7.030000000000001';const values=[...input.moneyApprovals.values()];values[0]={fileSha256:first.sourceFileSha256,sheet:first.sheet,row:first.rowNo,sourceId:first.sourceKey,field:'金额',rawValue:first.rawFields.金额,exactCentValue:first.normalizedFields.金额};input.moneyApprovals=v2MoneyApprovalSet(values,values);
 for(const r of input.rows){const s=r.source;s.id=stableImportId('source-row',input.fixedSourceNamespace,'SETTLEMENT',s.sourceKey);s.fieldProvenance={schema_version:1,fields:Object.fromEntries(Object.entries(s.rawFields).map(([k,v])=>[k,{origin:'ORIGINAL',reason:'EXACT_ORIGINAL_SNAPSHOT_CELL',raw:v}]))};}
 const prepared=prepareHistorySettlementChunk(input),sourceRows=prepared.rows.map(r=>{const s=r.source;return historyClosureProjectionRow26('import_source_row',{id:s.id,batch_id:s.batchId,entity_type:s.entityType,source_key:s.sourceKey,file_ref:s.fileRef,sheet:s.sheet,row_no:s.rowNo,source_file_sha256:s.sourceFileSha256,row_sha256:s.rowSha256,raw_fields:s.rawFields,normalized_fields:s.normalizedFields,field_provenance:{...r.fieldProvenance,history_settlement_staging:{validator_version:HISTORY_SETTLEMENT_VERSION,fingerprint:r.fingerprint,selection:input.selection,header:r.header,account:r.account,method:r.method}}});}).sort((a,b)=>Buffer.compare(Buffer.from(a.key),Buffer.from(b.key))),typedRows=new Map(prepared.rows.map(r=>{const p=historyClosureProjectionRow26('history_sales_settlement',r.settlement);return [p.key,p];}));
 const directory=await mkdtemp(join(await realpath(tmpdir()),'synthetic-captured-settlement-'));t.after(()=>rm(directory,{recursive:true,force:true}));const descriptor=(name,columns)=>({path:join(directory,name),bytes:200,rows:2,sha256:'c'.repeat(64),mode:'0600',entity:'SETTLEMENT',actualColumns:columns}),source=descriptor('SETTLEMENT-source12.jsonl',12),typed=descriptor('SETTLEMENT-typed12.jsonl',11),manifest={status:'ACTUAL_SOURCE_TYPED_PROJECTIONS_COMPLETED_REFERENCE_ONLY',referenceOnly:true,nativeBindingsVerified:false,PG:false,MAIN:false,PUBLISH:false,all11:false,actualPayloadHash:null,sourceRows:2,typedRows:2,artifacts:[source,typed]},manifestFile=join(directory,'MANIFEST.json'),bytes=Buffer.from(JSON.stringify(manifest));await writeFile(manifestFile,bytes);
 const state={sources:0,typed:0,closed:0,onResolve:null,dropLast:false},options={batchId:input.batchId,fixedSourceNamespace:input.fixedSourceNamespace,trustedApprovalSha256:input.selection.approvalSha256,approvedMoneyOverlaySha256:input.selection.moneyApprovalSha256,base:'/missing-original-source-must-not-open',capturedSource:{manifestFile,trustedManifestSha256:createHash('sha256').update(bytes).digest('hex'),selection:input.selection,moneyApprovals:input.moneyApprovals,read:{async *sourceRows(d){assert.deepEqual(d,source);state.sources++;for(const r of state.dropLast?sourceRows.slice(0,-1):sourceRows)yield structuredClone(r);},async typedRow(d,key){assert.deepEqual(d,typed);state.typed++;return structuredClone(typedRows.get(key));}},async verify(c){assert.equal(c.source.rows,2);assert.equal(c.typed.actualColumns,11);assert.equal(c.manifest.sha256,options.capturedSource.trustedManifestSha256);},async close(){state.closed++;}},async resolveNativeBinding(q){assert.equal(q.entity,'SETTLEMENT');const original=input.rows.find(r=>r.source.sourceKey===q.sourceKey);if(state.onResolve)return state.onResolve(q,original);return {header:structuredClone(original.header),account:structuredClone(original.account),method:structuredClone(original.method)};}};
 return {input,prepared,sourceRows,typedRows,options,state};
}
test('captured C144 settlement: original mapper and independent current binding preserve refund, absolute amount, methodB versus accountA and missing NULL',async t=>{
 const f=await capturedSettlementFixture(t),reader=await openAuthorizedSettlementReader(f.options);t.after(()=>reader.close());assert.equal(reader.report.preflight,null);assert.equal(reader.report.kind,'HISTORY_SETTLEMENT_SOURCE_READER');assert.equal(reader.report.nativeBindingsVerified,false);assert.equal(reader.report.importReady,false);assert.equal(reader.report.capturedSource.typed.actualColumns,11);let count=0;
 for await(const record of reader.rows()){const row=f.input.rows.find(r=>r.source.sourceKey===record.source.sourceKey);assert.deepEqual(record.source,row.source);const prepared=prepareHistorySettlementChunk({...f.input,rows:[{...row,source:record.source}]});await reader.authorize(prepared);await reader.authorize(prepared);const typed=prepared.rows[0].settlement;assert.equal(prepared.rows[0].fingerprint,f.prepared.rows.find(r=>r.source.id===row.source.id).fingerprint);if(row.method){assert.equal(typed.direction,'REFUND');assert.equal(typed.amount,'7.03');assert.equal(typed.payment_method_id_snapshot,row.method.nativeId);assert.notEqual(typed.payment_method_id_snapshot,row.account.nativeSnapshot.payment_method_id);}else{assert.equal(typed.direction,'RECEIVE');assert.equal(typed.amount,'0.00');assert.equal(typed.payment_method_id_snapshot,null);assert.equal(typed.account_name_snapshot,null);assert.equal(typed.method_name_snapshot,null);assert.equal(Object.hasOwn(record.source.rawFields,'原收款方式来源编号'),false);}count++;}
 assert.equal(count,2);assert.equal(f.state.sources,1);assert.equal(f.state.typed,2);await reader.close();assert.equal(f.state.closed,1);
});
test('captured C144 settlement: changed original amount, typed method, incomplete32 or missing native account/header/method authority reject',async t=>{
 for(const change of [f=>{f.sourceRows.find(r=>r.projection.source_key==='SETTLEMENT-0001').projection.raw_fields.金额='8.03';},f=>{[...f.typedRows.values()].find(r=>r.projection.payment_method_id_snapshot===null).projection.payment_method_id_snapshot=id(10);}]){const f=await capturedSettlementFixture(t);change(f);const r=await openAuthorizedSettlementReader(f.options);t.after(()=>r.close());await assert.rejects(async()=>{for await(const _ of r.rows()){}},/MONEY_CELL_NOT_APPROVED|TYPED_MISMATCH/);}
 const f=await capturedSettlementFixture(t),r=await openAuthorizedSettlementReader(f.options);t.after(()=>r.close());for await(const _ of r.rows()){}
 for(const field of ['header','account','method']){f.state.onResolve=(_q,row)=>({header:row.header,account:row.account,method:row.method,[field]:null});const only=f.input.rows.find(row=>row.method!==null);await assert.rejects(r.authorize(prepareHistorySettlementChunk({...f.input,rows:[only]})),/NATIVE_BINDING_MISMATCH/);}
 const incomplete=await capturedSettlementFixture(t);incomplete.options.capturedSource.moneyApprovals.delete(incomplete.options.capturedSource.moneyApprovals.keys().next().value);await assert.rejects(openAuthorizedSettlementReader(incomplete.options),/SELECTION_MONEY/);assert.equal(incomplete.state.sources,0);assert.equal(incomplete.state.closed,1);
});
test('captured C144 settlement: raw source coverage and post-await close are enforced without entering shared PAYMENT collector',async t=>{
 const f=await capturedSettlementFixture(t);f.state.dropLast=true;const r=await openAuthorizedSettlementReader(f.options);t.after(()=>r.close());await assert.rejects(async()=>{for await(const _ of r.rows()){}},/SOURCE_COUNT/);
 const g=await capturedSettlementFixture(t),q=await openAuthorizedSettlementReader(g.options);for await(const _ of q.rows()){}g.state.onResolve=async(_query,row)=>{await q.close();return {header:row.header,account:row.account,method:row.method};};await assert.rejects(q.authorize(g.prepared),/CLOSED/);assert.equal(g.state.closed,1);
 const h=await capturedSettlementFixture(t);delete h.options.resolveNativeBinding;const sourceOnly=await openAuthorizedSettlementReader(h.options);t.after(()=>sourceOnly.close());for await(const _ of sourceOnly.rows()){}await assert.rejects(sourceOnly.authorize(h.prepared),/NATIVE_RESOLVER_REQUIRED/);
});
