import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveDraftReferences,validateDraftInput,draftQuantityCommand,draftMoneyCommand} from './draft-normal-history-v16.mjs';
const id=n=>`00000000-0562-4000-8000-${String(n).padStart(12,'0')}`;
const ref=(kind,n)=>({kind,documentId:id(n),lineId:id(n+1),capturedVersion:1,capturedSourceStatus:'DRAFT',capturedQuantity:kind==='sales'?'2':'-3',proposedQuantity:kind==='sales'?'3':'-2'});
const before=(r)=>({kind:r.kind,documentId:r.documentId,version:1,sourceStatus:'DRAFT',baselineEffect:'EXCLUDED_NOT_EFFECTIVE',lines:[{lineId:r.lineId,quantity:r.capturedQuantity,dealPrice:'0.99',allocatedDiscount:null}],totals:{netDue:'0.99'},settlements:[{direction:'RECEIVE',amount:'0.99'}]});
test('actual capture JSON integer quantities compare exactly with current helper bigint text',()=>{
 for(const [kind,n] of [['sales',1],['transfers',10]]){
  const r=ref(kind,n),current=before(r),captured={...r,capturedQuantity:Number(r.capturedQuantity)};
  const copy=structuredClone(captured);
  const command=draftQuantityCommand(current,captured,'SYNTHETIC_SAME_CAPTURE_KEY');
  assert.equal(command.lines[0].quantity,r.proposedQuantity);assert.deepEqual(captured,copy);
  assert.throws(()=>draftQuantityCommand({...current,lines:[{...current.lines[0],quantity:'8'}]},captured,'SYNTHETIC_SAME_CAPTURE_KEY'));
  for(const value of [Number.MAX_SAFE_INTEGER+1,1.5,null,true,'02','-0'])assert.throws(()=>draftQuantityCommand(current,{...r,capturedQuantity:value},'SYNTHETIC_SAME_CAPTURE_KEY'));
 }
});
test('B07 v16 finite preparation keeps original DRAFT quantities, source state, line identity and exact money-only intent',()=>{
 for(const r of [ref('sales',1),ref('transfers',10)]){
  const b=before(r),copy=structuredClone(b),command=draftQuantityCommand(b,r,'SYNTHETIC_FIXED_HISTORY_KEY');
  assert.equal(command.documentId,r.documentId);assert.deepEqual(command.lines,[{lineId:r.lineId,quantity:r.proposedQuantity}]);assert.equal(command.expectedVersion,1);assert.equal(command.totals,null);assert.deepEqual(command.settlements,[]);assert.deepEqual(b,copy);
  assert.throws(()=>draftQuantityCommand({...b,sourceStatus:'APPROVED'},r,'same'));
  assert.throws(()=>draftQuantityCommand({...b,version:2},r,'same'));
 }
 const b=before(ref('sales',1)),copy=structuredClone(b),money=draftMoneyCommand(b,'SYNTHETIC_FIXED_MONEY_KEY');
 assert.deepEqual(money.lines,[{lineId:id(2),dealPrice:'1.00'}]);assert.equal(money.totals,null);assert.deepEqual(money.settlements,[]);assert.deepEqual(b,copy);
 assert.throws(()=>draftMoneyCommand({...b,settlements:[]},'same'));
});
test('B07 v16 reference input cannot silently transplant live IDs, substitute target or invent captured fields',()=>{
 const input={contract:'B07_DRAFT_NORMAL_HISTORY_V16_1',patchLevel:'26_v16_history_responsible_from_v14',target:{database:'erp_qa_rapid26_native_20261023_01',oid:'1032586',role:'erp_qa_v14_core_runtime_20261024_01'},actor:{accountId:id(30),hallId:null},references:{batchId:id(40),publishedOperationId:id(41),cases:[ref('sales',1),ref('transfers',10)]},maxRows:100,keys:{sales:'SYN_SALES',salesCas:'SYN_SALES_CAS',transfers:'SYN_TRANSFER',transfersCas:'SYN_TRANSFER_CAS',money:'SYN_MONEY',moneyCas:'SYN_MONEY_CAS'}};
 assert.doesNotThrow(()=>validateDraftInput(input));
 assert.throws(()=>validateDraftInput({...input,target:{...input.target,database:'OTHER_TARGET'}}));
 assert.throws(()=>validateDraftInput({...input,keys:{...input.keys,liveSave:'SYN_LIVE'}}));
 const pointer=key=>({artifact:'private',jsonPointer:'/'+key});
 const plan={status:'ACTUAL_CAPTURE_REFERENCES_BOUND_DRAFT_ONLY_NOT_EXECUTABLE',batch:{id:pointer('batch'),publishReceiptId:pointer('published')},cases:input.references.cases.map((r,i)=>({kind:r.kind,documentId:pointer('doc'+i),capturedOriginalVersion:pointer('version'+i),capturedOriginalStatus:pointer('status'+i),lineChange:{lineId:pointer('line'+i),capturedQuantity:pointer('qty'+i),proposedQuantity:r.proposedQuantity}}))};
 const values={batch:id(40),published:id(41)};for(const [i,r] of input.references.cases.entries())Object.assign(values,{['doc'+i]:r.documentId,['version'+i]:1,['status'+i]:'DRAFT',['line'+i]:r.lineId,['qty'+i]:r.capturedQuantity});
 assert.deepEqual(resolveDraftReferences(plan,{private:values}),input.references);delete values.line0;assert.throws(()=>resolveDraftReferences(plan,{private:values}));
});
