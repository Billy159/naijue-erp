import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {TransferProposalSession,transferProposalRowKey} from '../../../../src/current-form/transfer-proposal.ts';
import {ReadContext} from '../../../../src/loading/read-scope.ts';
const here=path.dirname(fileURLToPath(import.meta.url)),temp=await mkdtemp(path.join(here,'.transfer-matrix-'));
const dom=new JSDOM('<div id="root"></div>',{url:'https://matrix.test',pretendToBeVisual:true});
for(const key of ['window','document','HTMLElement','HTMLInputElement','HTMLButtonElement','Node','Event','MouseEvent','KeyboardEvent','Element','SVGElement','MutationObserver','ShadowRoot','getComputedStyle','requestAnimationFrame','cancelAnimationFrame','innerWidth','innerHeight'])Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});
Object.defineProperty(globalThis,'navigator',{configurable:true,value:dom.window.navigator});dom.window.matchMedia=media=>({matches:false,media,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {act,createElement}=await import('react'),{createRoot}=await import('react-dom/client');let root;
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const warehouse=n=>({id:id(n),name:'QA warehouse '+n,hallId:id(90),hallName:'QA',enabled:true,hallEnabled:true,hasNonzeroInventory:false});
const sku={id:id(4),skuCode:'QA-SKU',productId:id(3),productCode:'QA',productName:'QA product',colorId:id(5),colorName:'red',fitId:id(6),fitName:'fit',sizeId:id(7),sizeName:'165/S',sizeGroupId:id(8),barcodeAvailability:'UNAVAILABLE'};
const group={id:sku.sizeGroupId,name:'QA group',sizes:[{id:sku.sizeId,name:sku.sizeName,displayOrder:1}]};
const context=new ReadContext({accountId:id(99),sessionRevision:'test',permissionRevision:'test'}),scope=context.createScope('matrix');
const page=items=>({page:1,pageSize:20,exactTotal:BigInt(items.length),items});
try{
 const output=path.join(temp,'form.mjs');await build({entryPoints:[path.join(here,'transfer-proposal-form.tsx')],outfile:output,bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react','react-dom','react-dom/*'],banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"},plugins:[{name:'nonvisual-preview-and-css',setup(b){b.onResolve({filter:/\.css(?:\?inline)?$/},a=>({path:a.path,namespace:'css'}));b.onLoad({filter:/.*/,namespace:'css'},()=>({loader:'js',contents:'export default "";'}));b.onLoad({filter:/products\/preview\.tsx$/},()=>({loader:'tsx',contents:'export const ProductCandidatePreview=()=>null;'}));}}]});
 const {TransferProposalForm}=await import(pathToFileURL(output).href),host=document.getElementById('root');
 for(const reopened of [false,true]){
  const session=new TransferProposalSession(scope,{readTransferWarehouses:async()=>page([warehouse(1),warehouse(2)]),readProducts:async()=>{throw Error('no product enumeration');},readProductSkus:async()=>{throw Error('no SKU enumeration');},readBarcode:async query=>({state:'FOUND',barcode:query.barcode,binding:{id:id(89),kind:'MAIN'},sku}),readSizeGroups:async()=>({page:1,pageSize:100,total:1,items:[group]})});
  if(reopened)assert.equal(session.initializeFromSaved({businessDate:'2026-10-28',note:'retained',from:warehouse(1),to:warehouse(2),lines:[{sku,quantity:'1',existingLineId:id(85)}]}),true);
  else{session.setHeader({businessDate:'2026-10-28',note:'retained'});await session.openPicker('FROM');await session.select(id(1));await session.openPicker('TO');await session.select(id(2));const scanner=session.createScanner();assert.equal(await scanner.scan('QA-BARCODE'),true);scanner.dispose();}
  assert.equal(session.getSnapshot().draft.lines[0].product,undefined);
  root=createRoot(host);await act(async()=>root.render(createElement(TransferProposalForm,{session,scope,productReader:{},denied:e=>{throw e;},busy:false,actions:null,notice:'parent notice'})));
  const input=host.querySelector('input[data-transfer-row][data-transfer-size]');assert.ok(input);
  const edit=async raw=>{await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,raw);input.dispatchEvent(new Event('input',{bubbles:true}));});};
  await edit('8');assert.equal(input.value,'8');let valid;await act(async()=>{valid=session.validate();});assert.equal(valid.lines[0].quantity,'8');assert.match(host.querySelector('#tc-totals').textContent,/8件/);
  if(reopened)assert.equal(valid.lines[0].existingLineId,id(85));
  for(const raw of ['', '0','01','1.5','9223372036854775808']){await edit(raw);assert.equal(input.value,raw);assert.equal(session.getSnapshot().draft.lines[0].quantity,raw);await act(async()=>assert.equal(session.validate(),null));}
  await act(async()=>{assert.equal(session.setMatrixSizeQuantity(transferProposalRowKey(sku),{...group,id:id(88)},sku.sizeId,'8'),false);});
  assert.match(host.querySelector('#tc-error').textContent,/规格资料不匹配/);assert.match(host.querySelector('#tc-error').textContent,/parent notice/);
  assert.equal(session.cancel(),false);assert.equal(session.getSnapshot().draft.note,'retained');
  await act(async()=>root.unmount());root=null;session.cancel(true);
  console.log('PASS actual TransferProposalForm '+(reopened?'reopened':'scanner')+': SKU-only input 1→8, total, invalid raw, visible reject and cancel protection');
 }
}finally{if(root)await act(async()=>root.unmount());scope.dispose();dom.window.close();await rm(temp,{recursive:true,force:true});}
