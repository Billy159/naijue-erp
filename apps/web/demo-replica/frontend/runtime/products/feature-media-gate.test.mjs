/** Pure synthetic host composition: actual HTTP client factories, no listener/network/DB. */
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
const here=path.dirname(fileURLToPath(import.meta.url)),temp=await mkdtemp(path.join(here,'.media-gate-'));
try{
 const target=path.join(temp,'feature.mjs');await build({stdin:{contents:"export {createProductsFeature} from './feature.ts';export {ReadContext} from '../../../../src/loading/read-scope.ts';",resolveDir:here,sourcefile:'gate.ts',loader:'ts'},outfile:target,bundle:true,platform:'browser',format:'esm',jsx:'automatic',logLevel:'warning',plugins:[{name:'composition-only-leaf',setup(b){
  b.onLoad({filter:/products\/editor-entry\.tsx$/},()=>({loader:'tsx',contents:'export function mountProductEditor(host,options){host.capability=options.capability;return ()=>{};}'}));
  b.onLoad({filter:/products\/(?:index|detail-entry)\.tsx$/},()=>({loader:'tsx',contents:'export function mountProductList(){return ()=>{};}export function mountProductDetail(){return ()=>{};}'}));
  b.onLoad({filter:/common\/source-helpers\.tsx$/},()=>({loader:'tsx',contents:'export const renderOriginalPager=()=>{};export const originalCategoryControlCss="";export const mountOriginalEmpty=()=>{};'}));
 }}]});
 const {createProductsFeature,ReadContext}=await import(pathToFileURL(target).href);
 const id='00000000-0000-4000-8000-000000000001';let fetches=0;
 for(const [productMediaReady,productWrite,role,expectMedia]of [[undefined,true,'ADMIN',false],[false,true,'ADMIN',false],[true,true,'ADMIN',true],[true,true,'WAREHOUSE',true],[true,false,'ADMIN',false],[true,true,'SALESPERSON',false]]){
  const reads=new ReadContext({accountId:id,sessionRevision:'1',permissionRevision:'1'}),scope=reads.createScope('media-gate');
  const session={reads,http:{origin:'https://synthetic.invalid',basePath:'/api',fetch:async()=>{fetches++;throw Error('Composition must not issue HTTP');}},auth:{getSnapshot:()=>({phase:'authenticated',principal:{accountId:id,role}})},onAccessFailure(){}};
  const feature=createProductsFeature({session,routes:{inventory:false,sales:false,transfers:false,products:true,maintenance:{products:productWrite},...(productMediaReady===undefined?{}:{productMediaReady})},newRequestKey:()=>id,inventory:{},catalogue:{onChanged(){}}},()=>{},async()=>{}, {commands:async()=>undefined},{openProductInventory:async()=>false});
  const host={};const mounted=await feature.mount(host,'products/new',scope);
  assert.equal(typeof host.capability.mediaUpload==='function',expectMedia,'media stage must be separate from product save: '+JSON.stringify({productMediaReady,productWrite,role}));
  assert.equal(host.capability.allowedActions.includes('CREATE'),productWrite&&['ADMIN','WAREHOUSE'].includes(role));
  mounted.dispose();feature.dispose();scope.dispose();reads.clear();
 }
 assert.equal(fetches,0);console.log('PASS media opt-in composition only; no authority/route/API/DB/R3 evidence.');
}finally{await rm(temp,{recursive:true,force:true});}
