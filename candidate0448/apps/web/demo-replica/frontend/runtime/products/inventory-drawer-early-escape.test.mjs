// Install as runtime/products/inventory-drawer-early-escape.test.mjs. Tests only.
// Ordinary scalar component test: NO spawn/detach/custom timeout supervisor.
// Root supplies external GNU timeout20s and Node max-old-space-size512. Forced
// termination may bypass JS finally and is INCONCLUSIVE, never semantic PASS/RED.
import assert,{AssertionError} from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {writeSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import path from 'node:path';
const file=fileURLToPath(import.meta.url),here=path.dirname(file),repo=path.resolve(here,'../../../../../..');
const PREFIX='EARLY_DRAWER_FIRST_OPENING_RESULT=';

async function runFirstOpening(){
 const report={status:'RUNNING',completed:false,scope:'FIRST_OPENING_SYNTHETIC_COMPONENT_ONLY',lastStage:'START',lastCheck:null,keyEventsDispatched:0,cleanup:{},notClaimed:['No native browser/focus-trap/layout/HTTP/PG/business PASS','No semantic failure from timeout/resource/harness/incomplete cleanup']};
 const stage=(name,extra={})=>{report.lastStage=name;writeSync(1,JSON.stringify({stage:name,uptimeMs:Math.round(process.uptime()*1000),...extra})+'\n');};
 const check=(condition,label)=>{report.lastCheck=label;assert.equal(condition===true,true,label);};
 const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
 let temp,dom,act,dispose,context,esbuildModule,primaryFailure=false,cleanupFailure=false;
 try{
  temp=await mkdtemp(path.join(here,'.test-early-escape-'));report.tempPath=temp;stage('TEMP_CREATED',{tempPath:temp});
  stage('BEFORE_SOURCE_IMPORTS');
  report.drawerSourceSha256=sha(await readFile(path.join(here,'inventory-drawer.tsx')));report.helperSourceSha256=sha(await readFile(path.join(here,'drawer-mount-focus.ts')));
  esbuildModule=await import('esbuild');const {JSDOM}=await import('jsdom');
  dom=new JSDOM('<!doctype html><body><main id="source"><button id="opener">查看</button><div id="viewport"></div><button id="other">其他</button></main></body>',{url:'https://synthetic-early-drawer.invalid/',pretendToBeVisual:true});
  for(const key of ['window','document','HTMLElement','HTMLInputElement','HTMLDialogElement','HTMLTextAreaElement','HTMLSelectElement','HTMLButtonElement','HTMLIFrameElement','Node','Event','MouseEvent','KeyboardEvent','Element','SVGElement','MutationObserver','ShadowRoot','getComputedStyle','requestAnimationFrame','cancelAnimationFrame','localStorage'])Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:dom.window.navigator});
  globalThis.pageXOffset=0;globalThis.pageYOffset=0;globalThis.innerWidth=1200;globalThis.innerHeight=760;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  window.scrollTo=()=>{};window.matchMedia=q=>({matches:false,media:q,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
  class ResizeObserver{observe(){}unobserve(){}disconnect(){}}globalThis.ResizeObserver=window.ResizeObserver=ResizeObserver;
  window.HTMLCanvasElement.prototype.getContext=()=>({measureText:text=>({width:String(text).length*7})});
  const output=path.join(temp,'entry.mjs');stage('BEFORE_BUNDLE');
  await esbuildModule.build({absWorkingDir:repo,stdin:{contents:"export {act} from 'react';export {openInventoryProductDrawer} from './inventory-drawer.tsx';export {ReadContext} from '../../../../src/loading/read-scope.ts';",resolveDir:here,sourcefile:'early-escape-entry.tsx',loader:'tsx'},outfile:output,bundle:true,platform:'browser',format:'esm',external:['react','react-dom','react-dom/*'],banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"},jsx:'automatic',plugins:[{name:'synthetic-disabled-focus-lock',setup(b){b.onResolve({filter:/^react-focus-lock$/},()=>({path:'focus-lock',namespace:'synthetic-disabled-focus-lock'}));b.onLoad({filter:/.*/,namespace:'synthetic-disabled-focus-lock'},()=>({contents:"import React from 'react';export default function SyntheticFocusLock(p){return React.createElement('span',{'data-synthetic-focus-lock-disabled':String(p.disabled)},p.children)}",loader:'js',resolveDir:here}));}},{name:'source-css-test-only',setup(b){b.onResolve({filter:/\.css(?:\?inline)?$/},args=>({path:args.path,namespace:'test-css'}));b.onLoad({filter:/.*/,namespace:'test-css'},()=>({contents:'export default "";',loader:'js'}));}}],logLevel:'warning'});
  stage('AFTER_BUNDLE');const entry=await import(pathToFileURL(output));act=entry.act;
  const uid=n=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0');context=new entry.ReadContext({accountId:uid(1),sessionRevision:'1',permissionRevision:'1'});
  const parent=context.createScope('early-first-opening'),anchor=document.getElementById('opener'),viewport=document.getElementById('viewport');
  const reads=[],pending=kind=>read=>new Promise(resolve=>reads.push({kind,read,resolve}));
  const reader={readProductBasics:pending('base'),readProductSpecifications:pending('specs'),readProductImages:pending('images'),readProductImage:pending('original')};let closed=0;
  const snapshot=()=>{const drawer=document.querySelector('.pc-product-drawer'),wrapper=drawer?.closest('.arco-drawer-wrapper'),workbench=drawer?.querySelector('.pc-detail-workbench');return{drawerExists:drawer!==null,drawerClass:drawer?.className??null,documentHasFocus:document.hasFocus(),activeId:document.activeElement?.id??'',activeIsWorkbench:!!workbench&&document.activeElement===workbench,activeInsideWrapper:!!wrapper?.contains(document.activeElement),nativeWorkbenchTabIndex:workbench?.tabIndex??null,focusLockDisabled:drawer?.querySelector('[data-synthetic-focus-lock-disabled]')?.getAttribute('data-synthetic-focus-lock-disabled')??null};};
  // Original opener setup only; never force drawer/workbench focus in this test.
  anchor.focus();viewport.scrollTop=500;viewport.scrollLeft=122;
  stage('BEFORE_FIRST_OPEN_ACT');await act(async()=>{dispose=entry.openInventoryProductDrawer({parent,product:{id:uid(2),label:'TEST001'},reader,onAccessFailure(){},anchor,viewport,onClosed(){closed++;}});});stage('AFTER_FIRST_OPEN_ACT');
  report.beforeKey=snapshot();check(report.beforeKey.drawerExists,'DRAWER_CREATED');check(report.beforeKey.focusLockDisabled==='true','EARLY_DISABLED_WINDOW_OBSERVED');check(report.beforeKey.documentHasFocus,'NATIVE_JSDOM_DOCUMENT_FOCUSED');check(report.beforeKey.activeIsWorkbench&&report.beforeKey.activeInsideWrapper&&report.beforeKey.nativeWorkbenchTabIndex===-1,'SUPPORTED_NATIVE_WORKBENCH_OWNS_EARLY_FOCUS');
  stage('BEFORE_SINGLE_ESCAPE_ACT');await act(async()=>{document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',keyCode:27,which:27,bubbles:true,cancelable:true}));report.keyEventsDispatched++;});stage('AFTER_SINGLE_ESCAPE_ACT');
  report.immediateAfterKey=snapshot();await act(async()=>{await new Promise(resolve=>setTimeout(resolve,380));});report.afterClose=snapshot();stage('AFTER_ORIGINAL_380MS_SETTLE');
  check(document.querySelector('.pc-product-drawer')===null,'EARLY_ESCAPE_CLOSES');check(document.querySelector('[data-inventory-product-drawer]')===null,'HOST_RELEASED');check(report.keyEventsDispatched===1,'EXACTLY_ONE_ESCAPE');check(closed===1,'CLOSED_ONCE');check(parent.active,'PARENT_ACTIVE');check(document.activeElement===anchor,'ORIGINAL_OPENER_RESTORED');check(viewport.scrollTop===500&&viewport.scrollLeft===122,'VIEWPORT_RESTORED');check(window.location.hash==='','NO_HASH_NAVIGATION');check(reads.length===1&&reads[0].kind==='base','ONLY_BASE_READ');check(reads[0].read.signal.aborted,'PENDING_BASE_ABORTED');
  report.semanticPass=true;
 }catch(error){primaryFailure=true;report.assertionFailure=error instanceof AssertionError;report.semanticFailure=error instanceof AssertionError&&['SUPPORTED_NATIVE_WORKBENCH_OWNS_EARLY_FOCUS','EARLY_ESCAPE_CLOSES','HOST_RELEASED','EXACTLY_ONE_ESCAPE','CLOSED_ONCE','PARENT_ACTIVE','ORIGINAL_OPENER_RESTORED','VIEWPORT_RESTORED','NO_HASH_NAVIGATION','ONLY_BASE_READ','PENDING_BASE_ABORTED'].includes(report.lastCheck);stage('FAILURE_CLEANUP_PENDING');}
 finally{
  const clean=async(name,operation)=>{stage('BEFORE_CLEANUP_'+name);try{await operation();report.cleanup[name]='PASS';}catch{cleanupFailure=true;report.cleanup[name]='FAIL_UNSERIALIZED_ERROR';}stage('AFTER_CLEANUP_'+name);};
  if(dispose&&act)await clean('LEAF',async()=>{await act(async()=>dispose());});
  if(context&&act)await clean('CONTEXT',async()=>{await act(async()=>context.clear());});
  if(dom)await clean('DOM',async()=>{dom.window.close();});
  if(esbuildModule)await clean('ESBUILD_SERVICE',async()=>{esbuildModule.stop();});
  if(temp)await clean('TEMP',async()=>{await rm(temp,{recursive:true,force:true});});
  report.completed=true;report.status=cleanupFailure?'HARNESS_INCONCLUSIVE':!primaryFailure&&report.semanticPass?'PASS_FIRST_OPENING_COMPONENT_ONLY':report.semanticFailure?'FAIL_FIRST_OPENING_COMPONENT_ONLY':'HARNESS_INCONCLUSIVE';stage('TERMINAL');
  writeSync(1,PREFIX+JSON.stringify(report)+'\n');process.exitCode=report.status==='PASS_FIRST_OPENING_COMPONENT_ONLY'?0:report.status==='FAIL_FIRST_OPENING_COMPONENT_ONLY'?1:2;
 }
}
await runFirstOpening();
