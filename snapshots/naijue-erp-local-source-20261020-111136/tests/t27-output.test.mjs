import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {registerOutputRoutes} from '../dist/server/domain/outputs/http.js';
import {operations} from '../dist/server/security/policies.js';

const productId='00000000-0000-4000-8000-000000000201';
const secondProductId='00000000-0000-4000-8000-000000000202';
const skuId='00000000-0000-4000-8000-000000000301';
const secondSkuId='00000000-0000-4000-8000-000000000302';

function routeFixture({duplicate=false,disabled=false,products=null}={}) {
  const state={sql:[],calls:[],products:products||[
    {id:productId,code:'000120',name:'合成测试商品',enabled:true,unit:'件',fit_name:'常规版',attributes:{},created_at:'2026-10-02'},
    {id:secondProductId,code:'000121',name:'第二测试商品',enabled:true,unit:'件',fit_name:'常规版',attributes:{},created_at:'2026-10-02'},
  ],skus:[
    {id:skuId,product_id:productId,enabled:!disabled,version:1,fit_id:'FIT-A',options:{COLOR:{id:'color-a',code:'BK',name:'黑色'},SIZE:{id:'size-a',code:'00',name:'原尺码00',sourceName:'原尺码00'}}},
    ...(duplicate?[{id:secondSkuId,product_id:secondProductId,enabled:true,version:1,fit_id:'FIT-A',options:{COLOR:{id:'color-b',code:'WH',name:'白色'},SIZE:{id:'size-b',code:'01',name:'原尺码01',sourceName:'原尺码01'}}}]:[]),
  ],barcodes:[
    {product_id:productId,sku_id:skuId,barcode:'0000123456',sku_binding_known:true},
    ...(duplicate?[{product_id:secondProductId,sku_id:secondSkuId,barcode:'0000123456',sku_binding_known:true}]:[]),
  ],aliases:[]};
  const context={repo:{source:'t27_source',runtime:'t27_runtime'},documents:[],session:{query:async(sql,params=[])=>{
    const statement=String(sql).replace(/\s+/g,' ').trim();state.sql.push(statement);
    if(statement.startsWith('SELECT p.id,p.code'))return {rows:state.products};
    if(statement.startsWith('SELECT product_id FROM t27_source.tplus_product_barcode')){const code=params[0];return {rows:[...new Set([...state.barcodes,...state.aliases].filter(row=>row.barcode===code).map(row=>row.product_id).concat(state.products.filter(row=>row.code===code).map(row=>row.id)))].map(product_id=>({product_id}))};}
    if(statement.startsWith('SELECT jsonb_build_object('))return {rows:[{state:{sourceBarcodes:state.barcodes,generated:[],aliases:state.aliases,policy:null,managed:[],authorities:[],supplements:[]}}]};
    if(statement.startsWith('SELECT product_id,jsonb_build_object'))return {rows:[]};
    if(statement.startsWith('SELECT coalesce')&&statement.includes('variant_overlay')&&statement.includes('system_setting'))return {rows:[{overlays:[],pack:null}]};
    if(statement.startsWith('SELECT product_id,body,version FROM t27_runtime.product_profile_overlay'))return {rows:[]};
    if(statement.startsWith('SELECT v.id,v.product_id,v.enabled,v.version'))return {rows:state.skus};
    if(statement.startsWith('SELECT id,fit_id,group_name FROM t27_runtime.variant_overlay'))return {rows:[]};
    if(statement.startsWith('SELECT value FROM t27_source.system_setting'))return {rows:[{value:{}}]};
    if(statement.startsWith('SELECT product_id,sku_id,barcode,sku_binding_known'))return {rows:state.barcodes};
    if(statement.startsWith('SELECT product_id,sku_id,barcode,true generated'))return {rows:[]};
    if(statement.startsWith('SELECT product_id,sku_id,barcode,historical_note'))return {rows:state.aliases};
    if(statement.startsWith('SELECT revision,source_sha256 FROM t27_runtime.barcode_authority_policy'))return {rows:[]};
    if(statement.startsWith('SELECT id,product_id,role,name,color_name,sort_order'))return {rows:[]};
    throw new Error('Unexpected synthetic query: '+statement.slice(0,120));
  }}};
  const app=Fastify({logger:false});
  app.decorateRequest('identityToken',null);
  app.addHook('onRequest',async request=>{request.identityToken='synthetic-session'});
  app.setErrorHandler((error,_request,reply)=>reply.code(error.statusCode||500).send({ok:false,error:{code:error.code||'INTERNAL',message:error.message}}));
  app.decorate('identity',{execute:async(token,id,selection,work)=>{
    state.calls.push({token,id,selection});
    return work(context);
  }});
  registerOutputRoutes(app);
  return {app,state};
}

test('T27 output routes bind read-only output policies and keep exact unique barcode text',async t=>{
  assert.deepEqual(operations['outputs.barcodeLabels'],{mode:'query',policy:'authorized_output'});
  assert.deepEqual(operations['outputs.export'],{mode:'query',policy:'authorized_output'});
  assert.deepEqual(operations['outputs.print'],{mode:'query',policy:'authorized_output'});
  const {app,state}=routeFixture();t.after(()=>app.close());
  const response=await app.inject({method:'GET',url:`/api/outputs/barcode-labels/${productId}?code=0000123456&skuId=${skuId}`});
  assert.equal(response.statusCode,200,JSON.stringify({error:response.json(),sql:state.sql,calls:state.calls}));
  assert.equal(response.json().data.code,'0000123456');
  assert.equal(response.json().data.skuId,skuId);
  assert.deepEqual(state.calls.map(row=>row.id),['outputs.barcodeLabels']);
  assert.deepEqual(state.calls[0].selection,{kind:'product',id:productId});
  assert(state.sql.every(sql=>sql.startsWith('SELECT')),'output catalogue reads must stay read-only');
});

test('T27 refuses ambiguous, disabled, and non-ASCII Code 128 labels',async t=>{
  const ambiguous=routeFixture({duplicate:true});t.after(()=>ambiguous.app.close());
  const duplicate=await ambiguous.app.inject({method:'GET',url:`/api/outputs/barcode-labels/${productId}?code=0000123456&skuId=${skuId}`});
  assert.equal(duplicate.statusCode,409,JSON.stringify({error:duplicate.json(),sql:ambiguous.state.sql}));assert.equal(duplicate.json().error.code,'AMBIGUOUS_CODE');

  const disabled=routeFixture({disabled:true});t.after(()=>disabled.app.close());
  const stopped=await disabled.app.inject({method:'GET',url:`/api/outputs/barcode-labels/${productId}?code=0000123456&skuId=${skuId}`});
  assert.equal(stopped.statusCode,409);assert.equal(stopped.json().error.code,'BARCODE_DISABLED');

  const invalid=routeFixture();t.after(()=>invalid.app.close());
  const nonAscii=await invalid.app.inject({method:'GET',url:`/api/outputs/barcode-labels/${productId}?code=%E6%9D%A1%E7%A0%81&skuId=${skuId}`});
  assert.equal(nonAscii.statusCode,400);assert.equal(nonAscii.json().error.code,'VALIDATION');
  assert.equal(invalid.state.calls.length,0,'invalid print data must fail before business reads');
});

