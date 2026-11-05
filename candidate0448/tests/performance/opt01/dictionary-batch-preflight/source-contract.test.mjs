/** Small actual-session/authorization seam checks. No server, browser, DB or large body. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {TransferProposalSession,transferProposalLineIdentity} from '../../../../apps/web/src/current-form/transfer-proposal.ts';
import {ReadScope} from '../../../../apps/web/src/loading/read-scope.ts';
import {createDictionaryReadService} from '../../../../packages/application/src/dictionary-read-service.ts';
import {checkedDictionaryIntent,validateDictionarySizeGroup} from '../../../../packages/application/src/dictionary-read-validation.ts';
import {DomainError} from '../../../../packages/domain/src/errors.ts';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const sku=n=>({id:id(1000+n),skuCode:'SKU'+n,productId:id(2000+n),productCode:'P'+n,productName:'Product'+n,colorId:id(3000),colorName:'Color',fitId:id(4000),fitName:'Fit',sizeId:id(5000+n),sizeName:'Size'+n,sizeGroupId:id(6000+n),barcodeAvailability:'UNAVAILABLE'});
const product=n=>({id:sku(n).productId,code:sku(n).productCode,name:sku(n).productName,sizeGroupId:sku(n).sizeGroupId,retailPrice:null,minimumPriceAvailability:'UNAVAILABLE'});
const scope=()=>new ReadScope({accountId:id(1),sessionRevision:'preflight',permissionRevision:'preflight'},'dictionary-preflight',null,()=>{});
const page=items=>({page:1,pageSize:20,exactTotal:BigInt(items.length),items});
function session(){const owner=scope(),reader={readTransferWarehouses:async()=>page([]),readProducts:async()=>page([product(200)]),readProductSkus:async()=>page([sku(200)])},session=new TransferProposalSession(owner,reader);return {owner,session};}
test('actual saved200-line session can select a201st pending group before commit; a universal wanted-ID contract is not simply max200',async()=>{
 const renderer=await readFile(new URL('../../../../apps/web/demo-replica/frontend/runtime/documents/transfer-proposal-form.tsx',import.meta.url),'utf8');
 assert.ok(renderer.includes('...identities.map(row=>row.sizeGroupId),...(pending.product?.sizeGroupId?[pending.product.sizeGroupId]:[])'),'Pin the exact canonical wanted-set expression; this is a source projection, NOT a rendered DOM test');
 const {owner,session:s}=session();
 try{const lines=Array.from({length:200},(_,n)=>({sku:sku(n),product:product(n),quantity:'1',existingLineId:id(7000+n),sourceSnapshot:{productCode:'Saved'+n,productName:'Saved name'+n,colorName:'Saved color',fitName:'Saved fit',sizeName:'Saved size',barcode:null}}));assert.equal(s.initializeFromSaved({businessDate:'2026-10-31',note:'',from:{id:id(8000),name:'From'},to:{id:id(8001),name:'To'},lines}),true);
  await s.openPicker('PRODUCT','');assert.equal(await s.selectPendingProduct(product(200).id),true);const state=s.getSnapshot();assert.equal(state.draft.lines.length,200);assert.equal(state.pending.product.id,product(200).id);
  const identities=state.draft.lines.map(transferProposalLineIdentity),wanted=[...new Set([...identities.map(row=>row.sizeGroupId),...(state.pending.product?.sizeGroupId?[state.pending.product.sizeGroupId]:[])])];assert.equal(wanted.length,201);
 }finally{s.dispose();owner.dispose();}
});
test('complete dictionary axis without a native SKU retains explicit zero, blank and missing as distinct local inputs',()=>{
 const {owner,session:s}=session(),group={id:sku(0).sizeGroupId,name:'Full group',sizes:[{id:sku(0).sizeId,name:'Saved size',displayOrder:0},{id:id(5999),name:'No SKU axis',displayOrder:1}]};
 try{assert.equal(s.initializeFromSaved({businessDate:'2026-10-31',note:'',from:{id:id(8000),name:'From'},to:{id:id(8001),name:'To'},lines:[{sku:sku(0),product:product(0),quantity:'1',existingLineId:id(7000),sourceSnapshot:{productCode:'Saved',productName:'Saved name',colorName:'Saved color',fitName:'Saved fit',sizeName:'Saved size',barcode:null}}]}),true);
  const row=JSON.stringify([sku(0).productId,sku(0).colorId,sku(0).fitId,sku(0).sizeGroupId]),key=JSON.stringify([row,id(5999)]);assert.equal(Object.hasOwn(s.getSnapshot().matrixQuantities,key),false);assert.equal(s.setMatrixSizeQuantity(row,group,id(5999),'0'),true);assert.equal(s.getSnapshot().matrixQuantities[key].quantity,'0');assert.equal(s.setMatrixSizeQuantity(row,group,id(5999),''),true);assert.equal(Object.hasOwn(s.getSnapshot().matrixQuantities,key),false);
 }finally{s.dispose();owner.dispose();}
});
test('independent original dictionary denial prevents physical reader invocation; new target intent is currently unsupported/fail-closed',async()=>{
 let calls=0;const service=createDictionaryReadService({authorization:{async authorize(){throw new DomainError('FORBIDDEN','Independent dictionary denial');}},reader:{readSizeGroups:async()=>{calls++;throw Error('must not read');},readSeasons:async()=>{throw Error();},readBarcodeSchemes:async()=>{throw Error();},readBarcodeScheme:async()=>{throw Error();}}});
 await assert.rejects(service.readSizeGroups({accountId:id(1),hallId:null},{search:'',page:1,pageSize:100},new AbortController().signal),{code:'FORBIDDEN'});assert.equal(calls,0);
 assert.throws(()=>checkedDictionaryIntent({kind:'size-groups',operation:'batch',parameters:{sizeGroupIds:[id(6000)]}}),{code:'INVALID_DICTIONARY_QUERY'});
 assert.deepEqual(validateDictionarySizeGroup({id:id(6000),name:'Empty original group',sizes:[]}).sizes,[],'Original empty group is not newly classified as malformed');
 assert.throws(()=>validateDictionarySizeGroup({id:id(6000),name:'Over original member limit',sizes:Array.from({length:1001},(_,n)=>({id:id(10000+n),name:'S',displayOrder:n}))}),{code:'INVALID_DICTIONARY_RESPONSE'});
});
test('protocol-domain counting inequality for three dispersed target groups; not an ordinary-runtime impossibility verdict',()=>{
 const limit=8n*1024n*1024n,variableNames=3n*999n,charactersPerName=7500n,alphabetBits=6n;
 const domainBits=variableNames*charactersPerName*alphabetBits,maxTwoBodyBits=2n*limit*8n+2n;
 // Names over64 printable ASCII symbols are nonempty/no-NUL, below the native
 // 65536 per-value bound. Current dictionary names impose no smaller bound.
 // Two arbitrary byte strings of lengths0..limit have <2^(16*limit+2) choices.
 assert.equal(domainBits,134865000n);assert.equal(maxTwoBodyBits,134217730n);assert.ok(domainBits>maxTwoBodyBits);
 const oldPageConservativeUpper=1000n*(charactersPerName+120n)+100n*512n;assert.equal(oldPageConservativeUpper,7671200n);assert.ok(oldPageConservativeUpper<limit);
 // 201 groups can put one large target on each of pages1,2,3. This is a
 // protocol/DDL/value-domain proof, NOT a claim that every such source row was
 // admitted by current issuer/ACL/ordinary runtime. Out-of-band channels,
 // shared caches or changing the byte guard are outside this statement.
});
