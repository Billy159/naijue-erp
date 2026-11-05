/** Pure finite synthetic transport tests: no listener, browser, database, credentials or real service. */
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {detail,uuid} from '../../../../src/transfers/tests/fixtures.ts';
const directory=mkdtempSync(join(tmpdir(),'transfer-history-category-test-')),bundle=join(directory,'synthetic-preview-transport.mjs');
after(()=>rmSync(directory,{recursive:true,force:true}));
await build({entryPoints:[fileURLToPath(new URL('./synthetic-preview-transport.ts',import.meta.url))],bundle:true,platform:'node',format:'esm',outfile:bundle,logLevel:'silent'});
const {createSyntheticDocumentPreviewTransport}=await import(pathToFileURL(bundle).href);
const origin='https://synthetic-management.invalid',unknown={basis:'UNKNOWN',metric:'PRODUCT_COUNT',categoryCount:null,items:[],hasMore:false};
function transport(stockBasis,{rejectProducts=false}={}){
 const legacy={...detail(),stockBasis},calls=[];
 const products=[{id:uuid(40),code:'SYNTHETIC',name:'Synthetic current product',retailPrice:null,minimumPriceAvailability:'UNAVAILABLE',category:{id:uuid(900),label:'当前分类不得伪造历史'}}];
 return {legacy,calls,read:createSyntheticDocumentPreviewTransport({syntheticOnly:true,origin,existingFetch:async(input,init)=>{
  const path=new URL(input).pathname;calls.push(path);
  if(path==='/api/auth/session')return Response.json({principal:{accountId:uuid(30),loginName:'Finite synthetic account'}});
  if(path==='/api/transfers/detail/query')return Response.json(legacy);
  if(path==='/api/current-form/products/query'){
   if(rejectProducts)return Response.json({error:{code:'CURRENT_CATEGORY_READ_FORBIDDEN'}},{status:503});
   const query=JSON.parse(init.body);return Response.json({page:query.page,pageSize:query.pageSize,exactTotal:'1',items:products});
  }
  throw new Error('Unexpected finite synthetic read '+path);
 }})};
}
async function request(setup,version){return setup.read.request(origin+'/api/transfers/detail/query',{method:'POST',headers:{'content-type':'application/json',...(version?{'x-naijue-document-summary':version}:{})},body:JSON.stringify({transferId:uuid(1)})});}

test('synthetic category-v2 historical transfer detail returns raw UNKNOWN without consulting current categories',async()=>{
 const setup=transport('CUTOFF_HISTORY',{rejectProducts:true}),response=await request(setup,'category-v2');
 assert.equal(response.status,200,'historical category read must not consult current product categories');assert.deepEqual(await response.json(),{...setup.legacy,categorySummary:unknown});
 assert.deepEqual(setup.calls,['/api/auth/session','/api/transfers/detail/query']);
});
test('synthetic category-v2 LIVE projection remains CURRENT and product-count deduplicates sizes',async()=>{
 const setup=transport('RUNTIME_LEDGER'),response=await request(setup,'category-v2');assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{...setup.legacy,categorySummary:{basis:'CURRENT',metric:'PRODUCT_COUNT',categoryCount:'1',items:[{categoryId:uuid(900),categoryName:'当前分类不得伪造历史',value:'1'}],hasMore:false}});
 assert.equal(setup.calls.filter(path=>path==='/api/current-form/products/query').length,1);
});
test('synthetic non-v2 current and historical detail responses retain exact legacy DTOs',async()=>{
 for(const basis of ['RUNTIME_LEDGER','CUTOFF_HISTORY'])for(const version of [undefined,'category-v1','unexpected']){
  const setup=transport(basis,{rejectProducts:true}),response=await request(setup,version);assert.equal(response.status,200);
  assert.equal(await response.text(),JSON.stringify(setup.legacy));assert.equal(setup.calls.length,2);
 }
});
