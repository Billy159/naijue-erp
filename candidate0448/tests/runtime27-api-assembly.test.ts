import test from 'node:test';import assert from 'node:assert/strict';
import * as api from '../apps/api/src/postgres-read-api.ts';
test('formal runtime27 document composition is an explicit available entry and rejects incomplete setup',async()=>{
 assert.equal(typeof (api as Record<string,unknown>).createPostgresRuntime27DocumentApplicationApi,'function');
 await assert.rejects((api as any).createPostgresRuntime27DocumentApplicationApi({},{sales:false,transfers:false}));
});
import { EventEmitter } from 'node:events';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';import path from 'node:path';
import { runProductionCli } from '../apps/api/src/production-main.ts';
import { createProductionRuntime27ApplicationApi } from '../apps/api/src/production-provider-composition.ts';
import { productionApplicationOptions, PRODUCTION_PUBLIC_ORIGIN } from '../apps/api/src/production-provider-composition.ts';
test('runtime27 composes actual application with an owned bounded pool and both document routes',async()=>{
 const config={schemaVersion:1,profile:'source-confirmed-native-v1',documentCommands:'NATIVE_RUNTIME',publicOrigin:PRODUCTION_PUBLIC_ORIGIN,
  http:{host:'0.0.0.0',port:3000,acceptedHosts:['1n5635n614.goho.co']},assets:{root:'/unopened',entry:'index.html'},build:{sourceCommit:'f'.repeat(40),buildId:'SYNTHETIC'},
  authentication:{sessionTtlSeconds:900,policy:'source-confirmed-v1',passwordWork:{maxConcurrent:1,maxAnonymous:1,retryAfterSeconds:1},loginAdmission:{global:{burst:10,tokens:10,intervalMillis:1000},source:{burst:10,tokens:10,intervalMillis:1000},sourceAccount:{burst:10,tokens:10,intervalMillis:1000},entryTtlMillis:1000,maxEntries:100,maxRetryAfterSeconds:1}},
  postgres:{target:{host:'synthetic.invalid',port:5432,database:'synthetic_test',user:'runtime',password:'not-a-secret',ssl:false},max:2,maxPendingAcquisitions:2,connectionTimeoutMillis:1000,acquisitionTimeoutMillis:1000,queryTimeoutMillis:1100,statementTimeoutMillis:900,lockTimeoutMillis:800,idleInTransactionTimeoutMillis:1000,idlePoolTimeoutMillis:1000,disposeGraceMillis:0,disposeTimeoutMillis:1000}};
 const capacity={async acquire(){return {assertValid(){},release(){}}},close(){}};
 const original=productionApplicationOptions(config,capacity); const {catalogueCompleteness:_,...commands}=original.documentCommands!;
 const calls:string[]=[];let releases=0,ends=0;
 class Client extends EventEmitter {readyForQuery=true;private status='I';private readonlyTx=false;getTransactionStatus(){return this.status;} async query(sql:string,values:unknown[]=[]){calls.push(sql);if(sql.startsWith('BEGIN')){this.status='T';this.readonlyTx=sql.includes('READ ONLY');}if(sql==='ROLLBACK'||sql==='COMMIT')this.status='I';if(sql.startsWith('SET search_path')||sql.startsWith('SET ROLE')||sql.startsWith('SET LOCAL ROLE'))return {rows:[],rowCount:0,command:'SET'};
  if(sql.includes('runtime27-command:identity'))return {rows:[{database:'synthetic_test',role:'erp_unified27_runtime_2393dbc6db9581c2',session_user:'runtime',server_port:5432,row_security:'on',search_path:'pg_catalog',replication_role:'origin',superuser:false,bypass:false,session_superuser:false,session_bypass:false,runtime_inherit:false,runtime_membership:false,can_create:false,version_ok:true,gate_ok:true,policies_ok:true,read_only:this.readonlyTx?'on':'off',isolation:this.readonlyTx?'repeatable read':'read committed'}],rowCount:1,command:'SELECT'};
  if(sql.startsWith('BEGIN'))return{rows:[],rowCount:0,command:'BEGIN'};if(sql==='ROLLBACK'||sql==='COMMIT')return{rows:[],rowCount:0,command:sql};
  const account='00000000-0000-4000-8000-000000000101',staff='00000000-0000-4000-8000-000000000102';
  if(sql.includes('FROM naijue_erp.auth_session'))return{rows:[{token_hash:values[0],account_id:account,auth_version:1,created_at:'2020-01-01T00:00:00.000Z',expires_at:'2099-01-01T00:00:00.000Z',revoked_at:null}],rowCount:1,command:'SELECT'};
  if(sql.includes('current-form:identity'))return{rows:[{account_id:account,staff_id:staff,login_enabled:true,role:'ADMIN',employment_status:'在职',hall_id:null,native_hall_id:null,hall_enabled:null}],rowCount:1,command:'SELECT'};
  if(sql.includes('import_source_row'))throw Error('SYNTHETIC: ordinary role has no source access');
  const productId='00000000-0000-4000-8000-000000000103',skuId='00000000-0000-4000-8000-000000000104',groupId='00000000-0000-4000-8000-000000000105',sizeId='00000000-0000-4000-8000-000000000106';
  const product={id:productId,product_code:'SYNTHETIC',name:'Synthetic product',retail_price:null,enabled:true,size_group_id:groupId,category_id:'00000000-0000-4000-8000-000000000107',category_name:null};
  if(sql.includes('current-form:barcode-schema'))return{rows:[{versions:Array.from({length:27},(_,i)=>i+1)}],rowCount:1,command:'SELECT'};
  if(sql.includes('current-form:barcode-warehouses'))return{rows:(values[0] as string[]).map(id=>({id,hall_id:'00000000-0000-4000-8000-000000000110',native_hall_id:'00000000-0000-4000-8000-000000000110',enabled:true,has_nonzero_inventory:false})),rowCount:2,command:'SELECT'};
  if(sql.includes('current-form:barcode */')){const rows=values[0]==='SYNTHETIC-001'?[{binding_id:'00000000-0000-4000-8000-000000000111',barcode:'SYNTHETIC-001',barcode_kind:'MAIN',binding_enabled:true,id:skuId,sku_code:'SYNTHETIC-SKU',product_id:productId,product_code:product.product_code,product_name:product.name,color_id:'00000000-0000-4000-8000-000000000108',color_name:'Synthetic color',fit_id:'00000000-0000-4000-8000-000000000109',fit_name:'Synthetic fit',size_id:sizeId,size_name:'Synthetic size',size_group_id:groupId,member_size_id:sizeId,sku_enabled:true,product_enabled:true,color_enabled:true,fit_enabled:true,references_retained:true}]:[];return{rows,rowCount:rows.length,command:'SELECT'};}
  if(sql.includes('current-form:count'))return{rows:[{total:'1'}],rowCount:1,command:'SELECT'};
  if(sql.includes('current-form:page')||sql.includes('current-form:saved-edit-products'))return{rows:[product],rowCount:1,command:'SELECT'};
  if(sql.includes('current-form:sku-batch'))return{rows:[{id:skuId,sku_code:'SYNTHETIC-SKU',product_id:productId,product_code:product.product_code,product_name:product.name,color_id:'00000000-0000-4000-8000-000000000108',color_name:'Synthetic color',fit_id:'00000000-0000-4000-8000-000000000109',fit_name:'Synthetic fit',size_id:sizeId,size_name:'Synthetic size',size_group_id:groupId,member_size_id:sizeId,sku_enabled:true,product_enabled:true,color_enabled:true,fit_enabled:true}],rowCount:1,command:'SELECT'};
  if(sql.includes('FROM naijue_erp.user_account a JOIN naijue_erp.staff')&&!sql.includes('application-read:identity'))return{rows:[{account_id:account,staff_id:staff,login_name:'synthetic',password_hash:'synthetic',login_enabled:true,auth_version:1,role:'ADMIN',employment_status:'在职',hall_id:null,hall_enabled:null,staff_name:'synthetic'}],rowCount:1,command:'SELECT'};
  if(sql.includes('auth:query-session-snapshot'))return{rows:[{account_id:account,staff_id:staff,login_name:'synthetic',login_enabled:true,auth_version:1,role:'ADMIN',employment_status:'在职',hall_id:null,hall_enabled:null,staff_name:'synthetic',token_hash:values[0],session_account_id:account,session_auth_version:1,created_at:'2020-01-01T00:00:00.000Z',expires_at:'2099-01-01T00:00:00.000Z',revoked_at:null}],rowCount:1,command:'SELECT'};
  if(sql.includes('application-read:identity'))return{rows:[{account_id:account,staff_id:staff,login_enabled:true,role:'ADMIN',employment_status:'在职',hall_id:null,native_hall_id:null,hall_enabled:null}],rowCount:1,command:'SELECT'};
  if(sql.includes('product-management:count'))return{rows:[{exact_total:'0',invalid_category_tree:false}],rowCount:1,command:'SELECT'};
  if(sql.includes('product-management:ordinary-stock-coverage'))return{rows:[{invalid_size:false,missing_sizes:false,invalid_balance:false}],rowCount:1,command:'SELECT'};
  if(sql.includes('product-management:page'))return{rows:[],rowCount:0,command:'SELECT'};throw Error('Unexpected '+sql);}
  release(error?:unknown){assert.equal(error,true);releases++;}}
 class Driver extends EventEmitter {async connect(){return new Client()}async end(){ends++}}
 const ready=await api.createPostgresRuntime27DocumentApplicationApi({...original,productMaintenance:true,documentCommands:commands},{sales:true,transfers:true},()=>new Driver());
 try {const routes=ready.app.printRoutes();assert.match(routes,/sales/);assert.match(routes,/transfers/);assert.notEqual((await ready.app.inject({method:'POST',url:'/products/v2/commands',payload:{}})).statusCode,404);assert.notEqual((await ready.app.inject({method:'POST',url:'/product-management/query',payload:{}})).statusCode,404);
 const headers={origin:PRODUCTION_PUBLIC_ORIGIN,cookie:'__Host-naijue_session='+('A'.repeat(43))};
 const productResponse=await ready.app.inject({method:'POST',url:'/current-form/products/query',headers,payload:{context:{kind:'TRANSFER'},search:'SYNTHETIC',page:1,pageSize:20}});
 assert.equal(productResponse.statusCode,200,productResponse.body+' CALLS '+JSON.stringify(calls));assert.equal(productResponse.json().items[0].retailPrice,null);
 const batchResponse=await ready.app.inject({method:'POST',url:'/current-form/saved-edit-sku-batch-v2/query',headers,payload:{context:{kind:'TRANSFER'},skuIds:['00000000-0000-4000-8000-000000000104']}});
 assert.equal(batchResponse.statusCode,200,batchResponse.body+' CALLS '+JSON.stringify(calls));assert.ok(calls.some(sql=>sql.includes('current-form:saved-edit-products')));
 const currentSql=calls.filter(sql=>sql.includes('current-form:count')||sql.includes('current-form:page')||sql.includes('current-form:saved-edit-products'));assert.ok(currentSql.length>=3);assert.ok(currentSql.every(sql=>!sql.includes('import_source_row')));
 for(const sql of currentSql){assert.match(sql,/p\.deleted_at IS NULL/);assert.match(sql,/pc_retained\.deleted_at IS NOT NULL/);}
 const skuSql=calls.find(sql=>sql.includes('current-form:sku-batch'))!;assert.match(skuSql,/p\.deleted_at IS NULL/);assert.match(skuSql,/pc_retained\.deleted_at IS NOT NULL/);assert.match(skuSql,/c\.deleted_at IS NULL/);assert.match(skuSql,/f\.deleted_at IS NULL/);
 const scanResponse=await ready.app.inject({method:'POST',url:'/current-form/barcode/query',headers,payload:{context:{kind:'TRANSFER',fromWarehouseId:'00000000-0000-4000-8000-000000000112',toWarehouseId:'00000000-0000-4000-8000-000000000113'},barcode:'SYNTHETIC-001'}});
 assert.equal(scanResponse.statusCode,200,scanResponse.body);assert.equal(scanResponse.json().state,'FOUND');assert.equal(scanResponse.json().sku.id,'00000000-0000-4000-8000-000000000104');assert.ok(calls.filter(sql=>sql.includes('current-form:barcode */')).every(sql=>!sql.includes('import_source_row')));
 const scanContext={kind:'TRANSFER',fromWarehouseId:'00000000-0000-4000-8000-000000000112',toWarehouseId:'00000000-0000-4000-8000-000000000113'};
 const missing=await ready.app.inject({method:'POST',url:'/current-form/barcode/query',headers,payload:{context:scanContext,barcode:'NOT-FOUND'}});assert.equal(missing.statusCode,200,missing.body);assert.equal(missing.json().state,'NOT_FOUND');assert.equal(missing.json().sku,null);
 const empty=await ready.app.inject({method:'POST',url:'/current-form/barcode/query',headers,payload:{context:scanContext,barcode:''}});assert.equal(empty.statusCode,400);
 const response=await ready.app.inject({method:'POST',url:'/product-management/query',headers:{origin:PRODUCTION_PUBLIC_ORIGIN,cookie:'__Host-naijue_session='+('A'.repeat(43))},payload:{filter:{productIds:[],categoryIds:[],years:[],seasonIds:[],supplierIds:[],fitIds:[],thicknesses:[],shapeCodes:[]},page:1,pageSize:100}});assert.equal(response.statusCode,200,response.body+" CALLS "+JSON.stringify(calls));assert.ok(calls.some(sql=>sql.includes('product-management:ordinary-stock-coverage')));assert.ok(!calls.some(sql=>sql.includes('product-management:publication')));assert.equal(await ready.readiness!(),true);assert.ok(calls.includes('BEGIN ISOLATION LEVEL READ COMMITTED'));assert.ok(calls.includes('ROLLBACK'));}finally{await ready.close()}
 assert.ok(releases>=2);assert.equal(ends,1);
 const dir=await mkdtemp(path.join(tmpdir(),'runtime27-cli-')),file=path.join(dir,'config.json'),started:string[]=[];
 await writeFile(file,JSON.stringify({...config,profile:'source-confirmed-native-exact27-v1'}),{mode:0o600});
 let cliApi:Awaited<ReturnType<typeof createProductionRuntime27ApplicationApi>>|undefined;
 const beforeTerm=new Set(process.listeners('SIGTERM')),beforeInt=new Set(process.listeners('SIGINT'));
 try {await runProductionCli(['--exact27',file],{createCapacity:async()=>({...capacity,async preflight(){}}) as never,
  async createApi(mode,c,cap){assert.equal(mode,'r27');cliApi=await createProductionRuntime27ApplicationApi(c,()=>new Driver(),cap);return cliApi;},
  async startHost(mode){assert.equal(mode,'r27');return {publicOrigin:PRODUCTION_PUBLIC_ORIGIN,async close(){await cliApi?.close()}} as never;},
  writeStarted(line){started.push(line)}});
  assert.equal(JSON.parse(started[0]!).event,'PRODUCTION_EXACT27_HOST_STARTED');
  const productionResponse=await cliApi!.app.inject({method:'POST',url:'/current-form/products/query',headers:{origin:PRODUCTION_PUBLIC_ORIGIN,cookie:'__Host-naijue_session='+('A'.repeat(43))},payload:{context:{kind:'TRANSFER'},search:'SYNTHETIC',page:1,pageSize:20}});
  assert.equal(productionResponse.statusCode,200,productionResponse.body);
 }finally{for(const listener of process.listeners('SIGTERM'))if(!beforeTerm.has(listener))process.off('SIGTERM',listener as (...args:any[])=>void);for(const listener of process.listeners('SIGINT'))if(!beforeInt.has(listener))process.off('SIGINT',listener as (...args:any[])=>void);await cliApi?.close();await rm(dir,{recursive:true,force:true});}

});
import { parseProductionRuntime27Configuration } from '../apps/api/src/production-provider-composition.ts';
test('production runtime27 config explicitly selects the ordinary command host',()=>{
 assert.equal(typeof parseProductionRuntime27Configuration,'function');assert.throws(()=>parseProductionRuntime27Configuration({profile:'source-confirmed-native-exact27-v1'}));
});
test('ordinary27 product-management route binds the same read capability',async()=>{
 const {readFile}=await import('node:fs/promises');const source=await readFile(new URL('../apps/api/src/postgres-read-api.ts',import.meta.url),'utf8');
 assert.match(source,/if \(extensions\) \{[\s\S]*?authorization: extensions\.productManagement, reader: issuer27 \? new PostgresProductManagementQueryReader\(pool, null, null, undefined, issuer27\.ordinaryRead\)/);
});
test('ordinary27 product basic and detail readers bind original read capability',async()=>{
 const {readFile}=await import('node:fs/promises');const source=await readFile(new URL('../apps/api/src/postgres-read-api.ts',import.meta.url),'utf8');
 assert.match(source,/new PostgresProductQueryReader\(pool, null, null, issuer27\.ordinaryRead\)/);assert.match(source,/new PostgresProductDetailsQueryReader\(pool, null, undefined, issuer27\.ordinaryRead\)/);
});
test('ordinary27 product warehouse stock binds published-business reader',async()=>{
 const {readFile}=await import('node:fs/promises');const source=await readFile(new URL('../apps/api/src/postgres-read-api.ts',import.meta.url),'utf8');
 assert.match(source,/new Ordinary27ProductWarehouseStockReader\(pool, policies\.inventory, issuer27\.ordinaryRead\)/);
});
