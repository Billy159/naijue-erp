import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,symlink,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {JSDOM} from 'jsdom';
import {build as buildSyntheticNodeGraph} from 'esbuild';
import {inspectEditReady} from './readiness.mjs';
import {checkedLoopback,safeAsset,verifiedFile,sha256,redactRequestBody,pinnedRuntimeImport,frozenServerRelative} from './host-core.mjs';
import {localizeCanonicalAssets} from './html-assets.mjs';
import {resolveObservedAction,isObservedTargetRoute,createObservationGate,summarizeReadPhases} from './action-boundary.mjs';
const lines=[{id:'line1',skuId:'sku1',quantity:'2',rowKey:'row1',sizeId:'size1'},{id:'line2',skuId:'sku2',quantity:'3',rowKey:'row2',sizeId:'size2'}];
function doc(kind,inputs){return new JSDOM(`<main id="page"><section class="${kind==='sales'?'sale-workbench sale-editor':'transfer-editor'}"><h1>${kind==='sales'?'编辑销货单':'编辑调拨单'}</h1>${inputs}</section></main>`).window.document;}
const saleRow=(id,value,disabled=false)=>`<tr data-entry-row="${id}"><td><input aria-label="本行数量" value="${value}" ${disabled?'disabled':''}></td></tr>`;
const saleRows=rows=>`<table><tbody>${rows.join('')}</tbody></table>`;
test('A4 Node source resolution pins production imports to selected runtime, keeps frozen helpers separate, rejects outside roots',()=>{
  const active='/synthetic/active',candidate='/synthetic/clean-pinned',host=active+'/tests/performance/opt00/browser-host/serve.mjs';
  assert.equal(pinnedRuntimeImport(active,candidate,host,'../../../../apps/api/src/current-form-http.ts'),candidate+'/apps/api/src/current-form-http.ts');
  assert.equal(pinnedRuntimeImport(active,candidate,host,'../http-profile.mjs'),null);assert.equal(pinnedRuntimeImport(active,candidate,host,'node:fs'),null);assert.equal(pinnedRuntimeImport(active,candidate,candidate+'/apps/api/src/current-form-http.ts','./sales-http.ts'),null);
  assert.equal(frozenServerRelative(active,candidate,candidate+'/apps/api/src/current-form-http.ts'),'apps/api/src/current-form-http.ts');assert.equal(frozenServerRelative(active,candidate,host),'tests/performance/opt00/browser-host/serve.mjs');
  assert.throws(()=>frozenServerRelative(active,candidate,active+'/apps/api/src/current-form-http.ts'));assert.throws(()=>frozenServerRelative(active,candidate,'/unowned/source.ts'));
});
test('A4 synthetic Node graph uses selected BEFORE source and does not load absent AFTER encoder in BEFORE',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'opt00-node-pin-'));
  try{
    const active=path.join(root,'active'),candidate=path.join(root,'candidate'),entry=path.join(active,'tests/performance/opt00/browser-host/probe.mjs'),api='apps/api/src/current-form-http.ts';
    await mkdir(path.dirname(entry),{recursive:true});await mkdir(path.join(active,'apps/api/src'),{recursive:true});await mkdir(path.join(candidate,'apps/api/src'),{recursive:true});
    await writeFile(path.join(active,api),"export const encodeCurrentFormSavedEditSkuBatchWireV2=()=>{throw Error('ACTIVE_WIP_MUST_NOT_RUN')};");
    await writeFile(path.join(candidate,api),"throw Error('BEFORE_API_NOT_LOADED'); export const oldOnly=true;");
    await writeFile(entry,"export async function load(phase){if(phase==='BEFORE_OPT00')return null;const api=await import('../../../../apps/api/src/current-form-http.ts');return api.encodeCurrentFormSavedEditSkuBatchWireV2;}\n");
    const graph=await buildSyntheticNodeGraph({absWorkingDir:active,entryPoints:[entry],bundle:true,platform:'node',format:'esm',write:false,metafile:true,logLevel:'silent',plugins:[{name:'pin-runtime-unit',setup(b){b.onResolve({filter:/./},args=>{if(!args.importer)return;const target=pinnedRuntimeImport(active,candidate,args.importer,args.path);if(target)return {path:target};});}}]});
    const inputs=Object.keys(graph.metafile.inputs).map(x=>path.resolve(active,x));assert.ok(inputs.includes(path.join(candidate,api)));assert.ok(!inputs.includes(path.join(active,api)));
    const source=graph.outputFiles[0].text;assert.ok(!source.includes('ACTIVE_WIP_MUST_NOT_RUN'));
    const loaded=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));assert.equal(await loaded.load('BEFORE_OPT00'),null);await assert.rejects(loaded.load('AFTER_OPT01_A_R2'),/BEFORE_API_NOT_LOADED/);
  }finally{await rm(root,{recursive:true,force:true});}
});
test('sales shell, partial lines, wrong quantities, disabled/duplicate identities never pass readiness',()=>{
  for(const rows of [[],[saleRow('line1','2')],[saleRow('line1','2'),saleRow('line2','4')],[saleRow('line1','2'),saleRow('line2','3',true)],[saleRow('line1','2'),saleRow('line1','3')]])assert.equal(inspectEditReady({document:doc('sales',saleRows(rows)),kind:'sales',lines}).ready,false);
  const document=doc('sales',saleRows([saleRow('line1','2'),saleRow('line2','3'),saleRow('pending','',true)]));const ready=inspectEditReady({document,kind:'sales',lines});assert.equal(ready.ready,true);assert.deepEqual(ready.matchedInputs.map(input=>input.value),['2','3']);
});
test('transfer requires all saved SKU quantities plus actual dictionary coverage/axes, extra empty cells allowed',()=>{
  const section=(group,sizes,content)=>`<section class="mx-section" data-size-system="${group}"><table><thead><tr>${sizes.map(size=>`<th data-size-id="${size}"></th>`).join('')}</tr></thead><tbody><tr><td>${content}</td></tr></tbody></table></section>`;
  const document=doc('transfer',section('group1',['size1','size3'],'<input data-transfer-quantity data-transfer-row="row1" data-transfer-size="size1" value="2"><input data-transfer-quantity data-transfer-row="row1" data-transfer-size="size3" value="">')+section('group2',['size2'],'<input data-transfer-quantity data-transfer-row="row2" data-transfer-size="size2" value="3">'));
  const input={document,kind:'transfer',lines,wantedGroupIds:['group1','group2'],wantedSizeIds:['size1','size2','size3'],wantedGroups:[{id:'group1',sizeIds:['size1','size3']},{id:'group2',sizeIds:['size2']}]};
  assert.equal(inspectEditReady({...input,dictionaryGroupIds:['group1']}).ready,false);
  assert.equal(inspectEditReady({...input,dictionaryGroupIds:['group1','group2'],wantedSizeIds:['missing']}).ready,false);
  assert.equal(inspectEditReady({...input,dictionaryGroupIds:['group1','group2']}).ready,true);
  document.querySelector('[data-size-system="group2"] th').setAttribute('data-size-id','size1');assert.equal(inspectEditReady({...input,dictionaryGroupIds:['group1','group2']}).ready,false,'Global size union cannot hide a wrong group axis');
  document.querySelector('#page>section').setAttribute('hidden','');assert.equal(inspectEditReady({...input,dictionaryGroupIds:['group1','group2']}).ready,false);
});
test('strict host/origin/metadata boundary cannot expose fixture on foreign origin or host',()=>{
  assert.equal(checkedLoopback({host:'127.0.0.1:58601'},58601),true);
  assert.equal(checkedLoopback({host:'127.0.0.1:58601',origin:'http://127.0.0.1:58601','sec-fetch-site':'same-origin'},58601),true);
  for(const headers of [{host:'localhost:58601'},{host:'127.0.0.1:58601',origin:'https://foreign.invalid'},{host:'127.0.0.1:58601','sec-fetch-site':'cross-site'}])assert.equal(checkedLoopback(headers,58601),false);
});
test('only explicit safe asset names can reach manifest-backed build root',()=>{
  assert.equal(safeAsset('/tmp/synthetic-assets','/assets/chunks/chunk-A.js'),'/tmp/synthetic-assets/chunks/chunk-A.js');
  for(const input of ['/assets/../secret','/assets//x','/assets/%2e%2e/x','/secret','/assets/a?b'])assert.throws(()=>safeAsset('/tmp/synthetic-assets',input));
});
test('unknown nested credential fields never survive request-body logging',()=>{
  const raw={password:'PRIVATE',nested:{accessToken:'PRIVATE',cookie:'PRIVATE',note:'SYNTHETIC'},rows:[{credential:'PRIVATE'}]};assert.equal(JSON.stringify(redactRequestBody(raw)).includes('PRIVATE'),false);assert.equal(redactRequestBody(raw).nested.note,'SYNTHETIC');assert.equal(raw.password,'PRIVATE');
});
test('loopback asset adapter changes only actual expected-origin HTML attributes, never script/JSON text',()=>{
  const script='<script type="application/json">{"origin":"https://synthetic-opt00.invalid","example":"href=\\"https://synthetic-opt00.invalid/assets/not-an-attribute.js\\""}</script><script>const sample=\'src="https://synthetic-opt00.invalid/assets/example.js"\';</script>';
  const html='<!doctype html><link rel="stylesheet" href="https://synthetic-opt00.invalid/assets/source-styles/arco.css"><a href="#sales">sales</a>'+script+'<script src="https://synthetic-opt00.invalid/assets/application.js"></script>';
  const result=localizeCanonicalAssets(html,'https://synthetic-opt00.invalid');assert.ok(result.includes('href="/assets/source-styles/arco.css"'));assert.ok(result.includes('src="/assets/application.js"'));assert.ok(result.includes(script));assert.ok(result.includes('href="#sales"'));
});
test('loopback adapter rejects foreign origin, nonasset and traversal URLs instead of rewriting arbitrary destinations',()=>{
  for(const value of ['https://foreign.invalid/assets/a.js','https://synthetic-opt00.invalid/not-assets/a.js','https://synthetic-opt00.invalid/assets/../secret.js','https://synthetic-opt00.invalid/assets/%2e%2e/secret.js','/assets/../secret.js','https://synthetic-opt00.invalid/assets/a.js?token=secret'])assert.throws(()=>localizeCanonicalAssets(`<script src="${value}"></script>`,'https://synthetic-opt00.invalid'));
});
for(const kind of ['sales','transfer'])test(`A3 ${kind}: original target list number/view only; other row/header/action cannot start first-open`,()=>{
  const document=new JSDOM(`<main id="page"><section class="tc-list"><h1>${kind==='sales'?'销货单列表':'调拨单列表'}</h1><button id="header">查看</button><table><tbody><tr id="wanted"><td>date</td><td><button id="number">OPT00-TARGET</button></td><td class="ui-action-cell"><button id="view">查看</button><button id="wrong">删除</button></td></tr><tr><td>date</td><td><button>OTHER</button></td><td class="ui-action-cell"><button id="foreign">查看</button></td></tr></tbody></table></section></main>`).window.document;
  const base={root:document.getElementById('page'),kind,documentId:'SYNTHETIC-DOCUMENT',documentNumber:'OPT00-TARGET',hash:'#'+kind,mode:'FIRST_LIST_OPEN'};
  assert.equal(resolveObservedAction({...base,button:document.getElementById('number')}).action,'DOCUMENT_NUMBER');assert.equal(resolveObservedAction({...base,button:document.getElementById('view')}).action,'VIEW');
  for(const id of ['header','foreign','wrong'])assert.equal(resolveObservedAction({...base,button:document.getElementById(id)}),null);
  assert.equal(resolveObservedAction({...base,hash:'#wrong',button:document.getElementById('view')}),null);
});
test('A3 warm Modify is a separate exact readonly document route, never mislabeled first-list-open',()=>{
  const document=new JSDOM('<main id="page"><h1>查看销货单</h1><strong>OPT00-TARGET</strong><button>修改</button></main>').window.document;
  const base={root:document.getElementById('page'),button:document.querySelector('button'),kind:'sales',documentId:'SYNTHETIC-DOCUMENT',documentNumber:'OPT00-TARGET',hash:'#sales/view/SYNTHETIC-DOCUMENT',mode:'WARM_MODIFY'};
  assert.equal(resolveObservedAction(base).action,'MODIFY');assert.equal(resolveObservedAction({...base,mode:'FIRST_LIST_OPEN'}),null);assert.equal(resolveObservedAction({...base,documentId:'FOREIGN'}),null);
});
test('A3 different document/navigation cannot reuse same SKU quantities as target-ready evidence',()=>{
  assert.equal(isObservedTargetRoute('transfer','TARGET','#transfer/view/TARGET'),true);assert.equal(isObservedTargetRoute('sales','TARGET','#sales/edit/TARGET'),true);assert.equal(isObservedTargetRoute('transfer','TARGET','#transfer/view/OTHER'),false);assert.equal(isObservedTargetRoute('sales','TARGET','#sales'),false);assert.equal(isObservedTargetRoute('sales','TARGET','#transfer/view/TARGET'),false);
});
test('A3 gate rejects repeated arms/actions, cancels pending ARM without starting, and drops stale confirmation',()=>{
  const gate=createObservationGate(),ticket=gate.begin('FIRST_LIST_OPEN');assert.ok(ticket);assert.equal(gate.begin('FIRST_LIST_OPEN'),null);gate.cancel();assert.equal(gate.confirm(ticket,{requestCursor:1}),false);assert.equal(gate.consume({mode:'FIRST_LIST_OPEN'}),null);gate.complete(ticket);
  const next=gate.begin('FIRST_LIST_OPEN');assert.ok(next);assert.equal(gate.confirm(ticket,{}),false);assert.equal(gate.confirm(next,{}),true);assert.equal(gate.consume(null),null);assert.equal(gate.consume({mode:'WARM_MODIFY'}),null);assert.equal(gate.consume({mode:'FIRST_LIST_OPEN'}),next);assert.equal(gate.consume({mode:'FIRST_LIST_OPEN'}),null);assert.equal(gate.begin('WARM_MODIFY'),null);gate.cancel();assert.equal(gate.consume({mode:'FIRST_LIST_OPEN'}),null);gate.complete(next);assert.ok(gate.begin('WARM_MODIFY'));
});
test('A3 timing keeps both detail reads and exact after-detail request IDs; incomplete/failed calls never become timing',()=>{
  const calls=[{endpoint:'/transfers/detail/query',started:1,completed:3,serverRequestId:'1'},{endpoint:'/transfers/detail/query',started:4,completed:6,serverRequestId:'2'},{endpoint:'/current-form/sku-batch/query',started:7,completed:8,serverRequestId:'3'},{endpoint:'/current-form/products/query',started:9,completed:10,serverRequestId:'4'},{endpoint:'/dictionary-read/size-groups/query',started:11,completed:12,serverRequestId:'5'}].map(call=>({...call,phase:'completed',status:200}));
  const result=summarizeReadPhases(calls,0,15,'transfer');assert.equal(result.totalClickToReadyMs,15);assert.equal(result.detailRequestCount,2);assert.equal(result.afterLastDetailBodyToReadyMs,9);assert.equal(result.allRequiredApiRequestCount,5);assert.deepEqual(result.afterDetailServerRequestIds,['3','4','5']);
  assert.throws(()=>summarizeReadPhases([{...calls[0],phase:'pending'}],0,15,'transfer'));assert.throws(()=>summarizeReadPhases([{...calls[0],status:403}],0,15,'transfer'));
});
test('frozen source verification rejects missing, changed, traversal and symlink bytes',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'opt00-host-contract-'));try{await mkdir(path.join(root,'good'));await writeFile(path.join(root,'good/a'),'known');const entry={path:'good/a',sha256:sha256('known'),bytes:5};assert.equal(String(await verifiedFile(root,entry)),'known');
    await assert.rejects(verifiedFile(root,{...entry,sha256:sha256('changed')}));await assert.rejects(verifiedFile(root,{...entry,path:'missing'}));await assert.rejects(verifiedFile(root,{...entry,path:'../outside'}));await symlink(path.join(root,'good'),path.join(root,'link'));await assert.rejects(verifiedFile(root,{...entry,path:'link/a'}));
  }finally{await rm(root,{recursive:true,force:true});}
});
