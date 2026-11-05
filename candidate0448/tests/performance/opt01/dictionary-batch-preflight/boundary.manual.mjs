/** One finite manual byte experiment. Actual strict HTTP + current saved-session logic; no PG/ordinary commit/browser claim. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {epochFixture,tupleEnvelope,uid} from './fixture-generator.mjs';
import {createTransferHttpReader} from '../../../../apps/web/src/transfers/http-reader.ts';
import {createCurrentFormHttpReader} from '../../../../apps/web/src/current-form/http-reader.ts';
import {TransferExistingDocumentSession} from '../../../../apps/web/src/current-form/transfer-existing-document.ts';
import {transferProposalLineIdentity,transferProposalRowKey} from '../../../../apps/web/src/current-form/transfer-proposal.ts';
import {inputFromTransferDraft} from '../../../../apps/web/src/transfers/commands/validation.ts';
import {ReadScope} from '../../../../apps/web/src/loading/read-scope.ts';
import {createHttpJsonQuery} from '../../../../apps/web/src/transport/http-query.ts';
import {CURRENT_FORM_SAVED_EDIT_SKU_WIRE_FIELDS} from '../../../../packages/application/src/current-form-ports.ts';
const limit=8*1024*1024,signal=()=>new AbortController().signal,bytes=value=>Buffer.byteLength(JSON.stringify(value)),hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
test('manual T0 small admitted detail / T1 preexisting long target groups: original pages+session succeed, raw tuple names exceed unchanged8MiB',async t=>{
 const f=epochFixture(),detailQuery={transferId:f.original.document.header.id},detailReader=createTransferHttpReader({origin:'https://preflight.invalid',basePath:'/api',fetch:async()=>response(f.original)});
 const detail=await detailReader.readDetail({parameters:detailQuery,signal:signal()});assert.equal(detail.catalog.sizeGroups.reduce((n,g)=>n+g.members.length,0),2);assert.ok(bytes(detail)<limit);
 assert.deepEqual(f.nativeCodeOrder,[...f.nativeCodeOrder].sort(),'Declare actual native code-order placement, not a smaller page size');
 const currentById=new Map(f.currentSkus.map(row=>[row.id,row])),calls=[],pages=[];
 const reader=createCurrentFormHttpReader({origin:'https://preflight.invalid',basePath:'/api',fetch:async(url,init)=>{
  const path=new URL(url).pathname.slice(4),query=JSON.parse(String(init.body));calls.push(path);
  if(path==='/current-form/saved-edit-sku-batch-v2/query'){
   const skus=query.skuIds.map(id=>currentById.get(id));assert.ok(skus.every(Boolean));return response({version:2,skus:skus.map(row=>CURRENT_FORM_SAVED_EDIT_SKU_WIRE_FIELDS.map(key=>row[key])),products:[...new Set(skus.map(row=>row.productId))].map(id=>{const p=f.products.find(p=>p.id===id);return [id,'ELIGIBLE',p.sizeGroupId];})});
  }
  assert.equal(path,'/dictionary-read/size-groups/query');assert.equal(query.search,'');assert.equal(query.pageSize,100);const page={page:query.page,pageSize:100,total:f.dictionary.length,items:f.dictionary.slice((query.page-1)*100,query.page*100)};
  assert.ok(bytes(page)<limit);pages.push({page:query.page,bytes:bytes(page),sha256:hash(page)});return response(page);
 }});
 const input=inputFromTransferDraft(detail.document),scope=new ReadScope({accountId:uid(1),sessionRevision:'epoch-model',permissionRevision:'epoch-model'},'epoch-model',detail.document.header.id,()=>{}),owner={getSnapshot:()=>({editor:{input},write:{phase:'idle'}}),expireExistingIdentity(){throw Error('Unexpected expiry');}},session=new TransferExistingDocumentSession({owner,scope,reader,original:detail,input,dirty:false,preparation:{prepareExisting(){throw Error('No mutation/preparation in protocol evidence');}}});
 try{await session.initialize();assert.equal(session.getSnapshot().phase,'ready');const proposal=session.getSnapshot().proposal,draft=proposal.getSnapshot().draft,requested=[...new Set(draft.lines.map(row=>transferProposalLineIdentity(row).sizeGroupId))],found=new Map();
  // Exact canonical form's read-until-all-wanted logic, NOT rendered DOM/ready timing.
  for(let page=1;;page++){const result=await proposal.readSizeGroups({search:'',page,pageSize:100},signal());for(const group of result.items)if(requested.includes(group.id))found.set(group.id,group);if(requested.every(id=>found.has(id)))break;if(page*100>=result.total)throw Error('GROUP_UNAVAILABLE');}
  assert.deepEqual([...found.values()],f.targetGroups);assert.equal([...found.values()].reduce((n,g)=>n+g.sizes.length,0),2000);assert.equal(pages.length,2);assert.equal(calls.length,3);
  assert.deepEqual(draft.lines.map(row=>row.existingLineId),detail.document.lines.map(row=>row.id));assert.deepEqual(draft.lines.map(row=>row.sourceSnapshot),detail.document.lines.map(row=>row.snapshot));
  const group=found.get(requested[0]),row=transferProposalRowKey(transferProposalLineIdentity(draft.lines[0]));assert.equal(proposal.setMatrixSizeQuantity(row,group,group.sizes[1].id,'0'),true,'Complete non-SKU axis remains usable');
  const tuple=tupleEnvelope(f.targetGroups),nameTokens=f.targetGroups.reduce((n,g)=>n+g.sizes.reduce((sum,size)=>sum+Buffer.byteLength(size.name),0),0);assert.ok(nameTokens>limit);assert.ok(bytes(tuple)>limit);
  let decoded=0;const transport=createHttpJsonQuery({origin:'https://preflight.invalid',basePath:'/api',fetch:async()=>response(tuple)});await assert.rejects(transport.post('/dictionary-read/proposed-exact-groups/query',{sizeGroupIds:requested},signal(),value=>{decoded++;return value;}),{kind:'too-large',code:'RESPONSE_TOO_LARGE'});assert.equal(decoded,0);
  // Same-state T1 complete detail would exceed body bytes even though its2000
  // members are BELOW20k. Thus this is NOT a stable accepted-detail counterexample.
  const largeStable={...detail,catalog:{skus:f.currentSkus.map(({id,skuCode,sizeName,barcodeAvailability,...row})=>({skuId:id,...row})),sizeGroups:f.targetGroups.map((g,n)=>({sizeGroupId:g.id,code:'TARGET-'+n,name:g.name,members:g.sizes.map(s=>({sizeId:s.id,code:null,name:s.name,displayOrder:s.displayOrder}))}))}};
  assert.ok(bytes(largeStable)>limit);const largeReader=createTransferHttpReader({origin:'https://preflight.invalid',basePath:'/api',fetch:async()=>response(largeStable)});await assert.rejects(largeReader.readDetail({parameters:detailQuery,signal:signal()}),{kind:'too-large',code:'RESPONSE_TOO_LARGE'});
  t.diagnostic(JSON.stringify({scope:'ACTUAL_STRICT_PROTOCOL_AND_SAVED_SESSION_NOT_DOM_PG_OR_ORDINARY_COMMIT',parameters:f.parameters,T0:{detailBytes:bytes(detail),totalMembers:2,strictRead:true},T1:{oldPages:pages,targetGroups:2,totalMembers:2000,actualSavedSessionAndOriginalDictionaryComplete:true,afterDetailDataCalls:calls.length,groupNameAndMemberChanges:false},candidateTuple:{bytes:bytes(tuple),sha256:hash(tuple),nameBytesAlone:nameTokens,guard:'RESPONSE_TOO_LARGE',decoderCalls:decoded},sameStateT1FullDetail:{bytes:bytes(largeStable),totalMembers:2000,guard:'RESPONSE_TOO_LARGE'},ordinaryReachability:'Conditional EDIT source path only; real retained SKU/member/capacity/ACL/commit evidence not performed'}));
 }finally{session.dispose();scope.dispose();}
});
