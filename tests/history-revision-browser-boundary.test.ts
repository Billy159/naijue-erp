import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {parseHistoryRevisionCommand as browserParser} from '../packages/application/src/history-revision-validation.ts';
import {parseHistoryRevisionCommand as serviceParser} from '../packages/application/src/history-revision-service.ts';

const id=(n:number)=>`73000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const transfer={kind:'transfers',documentId:id(1),expectedVersion:1,requestKey:'browser-parser',reason:'SYNTHETIC validation',lines:[],totals:null,settlements:[]};

test('service compatibility export is the identical browser-safe parser, retaining sparse and exact-value contracts',()=>{
 assert.equal(serviceParser,browserParser);
 const valid=[
  {...transfer,header:{note:null}},
  {...transfer,header:{note:'',responsibleStaffId:null,businessDate:'2026-11-01',fromWarehouseId:id(10),toWarehouseId:id(11)}},
  {...transfer,lines:[{lineId:id(2),quantity:'-1'}]},
  {...transfer,lineSet:[{lineId:id(2),skuId:id(3),quantity:'1'},{lineId:null,skuId:id(3),quantity:'9223372036854775807'}]},
  {...transfer,kind:'sales',lines:[{lineId:id(2),dealPrice:'0.00',allocatedDiscount:null}],totals:{grossAmount:'1.00',orderDiscount:'0.00',netDue:'1.00'},settlements:[{settlementId:id(4),amount:'1.00'}]}
 ];
 for(const command of valid){assert.deepEqual(browserParser(command),command);assert.deepEqual(serviceParser(command),command);assert.notEqual(browserParser(command),command);}
 assert.throws(()=>browserParser(transfer),{code:'HISTORY_REVISION_EMPTY'});
 for(const bad of [
  {...transfer,header:{note:'x'.repeat(10001)}},{...transfer,header:{sourceStatus:'DRAFT'}},
  {...transfer,lineSet:[]},{...transfer,lineSet:[{lineId:null,skuId:id(3),quantity:'0'}]},
  {...transfer,lineSet:[{lineId:id(2),skuId:id(3),quantity:'1'},{lineId:id(2),skuId:id(3),quantity:'2'}]},
  {...transfer,kind:'sales',lineSet:[{lineId:null,skuId:id(3),quantity:'1'}]},
  {...transfer,lines:[{lineId:id(2),quantity:1}]}
 ])assert.throws(()=>browserParser(bad),{code:'HISTORY_REVISION_INVALID'});
 let gets=0;const getter=Object.defineProperty({...transfer,header:{note:'x'}},'reason',{enumerable:true,get(){gets++;return 'must not execute';}});
 assert.throws(()=>browserParser(getter),{code:'HISTORY_REVISION_INVALID'});assert.equal(gets,0);
});

for(const [filename,exports]of [['history-transfer-model.ts',['HistoryTransferModel','historicalTransferProjection']],['history-revision.ts',['HistoryRevisionOwner']]] as const)test('actual '+filename+' browser bundle excludes service hashing and all Node dependencies',async()=>{
 const entry=fileURLToPath(new URL('../apps/web/demo-replica/frontend/runtime/documents/'+filename,import.meta.url));
 const result=await build({entryPoints:[entry],bundle:true,platform:'browser',format:'esm',target:'es2022',write:false,metafile:true,logLevel:'silent'});
 const inputs=Object.keys(result.metafile!.inputs);
 assert.ok(inputs.some(path=>path.endsWith('/history-revision-validation.ts')));
 assert.ok(!inputs.some(path=>/history-revision-service|request-hash|node:/.test(path)),inputs.join('\n'));
 for(const output of Object.values(result.metafile!.outputs))assert.ok(!output.imports.some(row=>row.path.startsWith('node:')));
 const module=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles![0]!.contents).toString('base64')) as Record<string,unknown>;
 for(const name of exports)assert.equal(typeof module[name],'function');
});
