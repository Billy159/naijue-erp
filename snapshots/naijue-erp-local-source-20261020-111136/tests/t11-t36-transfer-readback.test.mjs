import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import vm from 'node:vm';

// Replays only sanitized T36 responses. No HTTP, database, storage or commands.
const repo=fileURLToPath(new URL('..',import.meta.url));
const sourceRoot=resolve(process.env.T11_SOURCE_ROOT||repo);
const Adapter=await import(pathToFileURL(join(sourceRoot,'frontend/legacy-adapter.mjs')));
const {fitView,fitViewId}=await import(pathToFileURL(join(sourceRoot,'frontend/business-product-view.mjs')));
const Inventory=await import(pathToFileURL(join(sourceRoot,'frontend/inventory-unit-view.mjs')));
const capture=JSON.parse(readFileSync(join(repo,'outputs/T11/revisions/20261005-t36-transfer-readback-f01/captured-transfer-failure.json'),'utf8'));
const source=readFileSync(join(sourceRoot,'frontend/real-data-bridge.mjs'),'utf8');
const prefix=source.split('async function bootstrap()')[0].replace(/^import .*;\n/gm,'');
const viewStart=source.indexOf(' const fitViews=new Map();');
const viewEnd=source.indexOf(' PRODUCT_IDENTITY.install(',viewStart);
assert.ok(viewStart>=0&&viewEnd>viewStart);
const viewInstall=source.slice(viewStart,viewEnd);
const bootEnd=source.indexOf('\n ',source.indexOf(' bridge.inventoryReady=true;'))+1;
const bootClose=source.indexOf('\n}',bootEnd);
assert.ok(bootEnd>=0&&bootClose>bootEnd);
const readiness=source.slice(bootEnd,bootClose);
const catchLine=source.split('\n').find(line=>line.startsWith('bootstrap().catch('));
assert.ok(catchLine);
const projection=catalog=>catalog.products.map(p=>Adapter.product(p,catalog.skus.filter(s=>s.product_id===p.id),catalog.barcodes.filter(b=>b.product_id===p.id),[]));
const stockSentinel=Object.freeze({originalQuantity:'-4.0000',unit:'双'});

function harness({products=projection(capture.catalogResponse.data),items=capture.queryResponse.data.items}={}){
  let rows=structuredClone(items),readinessResult,renderCount=0;
  const calls=[],page={innerHTML:''},list={textContent:'',attributes:{},setAttribute(k,v){this.attributes[k]=v;}},pager={hidden:false};
  const actor={id:'t36-admin',name:'Synthetic',role:'管理员'};
  const ctx={Adapter,fitView,fitViewId,...Inventory,structuredClone,URLSearchParams,location:{hash:'#transfer'},history:{replaceState(){}},
    document:{querySelector:selector=>selector==='#page'?page:selector==='.tc-list-scroll'?list:selector==='.tc-list-pagination'?pager:null},
    ERP_DEMO:{products,warehouses:[]},PRODUCT_CATALOG:{fit:id=>Adapter.FITS.find(f=>f.id===id)},PRODUCT_UI:{openReadOnly(){}},
    MASTER_DATA:{data:{stores:[],warehouses:[],staff:[actor]},roles:['管理员','仓库','营业员'],current:()=>actor,routeAllowed:()=>true,transferWarehouses:()=>[]},
    SALES_SERVICE:{docs:[]},TRANSFER_SERVICE:{total:2},TRANSFER_UI:{state:{appliedFilter:{q:'kept-filter'},listPaging:{page:1,size:20},listLoading:false}},
    GOLD:{documents:[{id:'DEMO-DB-0001'},{id:'DEMO-DB-0002'}],initial:stockSentinel},
    resolveRealData:r=>{readinessResult=r;},console:{error(){}},
    render(){renderCount++;page.innerHTML='transfer list';list.textContent=ctx.GOLD.documents.map(d=>d.id).join(',');list.attributes={};pager.hidden=false;},
    ERP_API:{async request(path,body){assert.equal(body,undefined,'readback must not issue a command');calls.push(path);if(path.startsWith('/runtime/documents?'))return {items:structuredClone(rows),total:rows.length};if(path.startsWith('/sales/documents?'))return {items:[],total:0};throw Error('Unexpected read: '+path);}},
    addEventListener(){},dispatchEvent(){}
  };
  ctx.window=ctx;vm.createContext(ctx);
  const request=ctx.ERP_API.request;
  vm.runInContext(readFileSync(join(sourceRoot,'frontend/service-client.js'),'utf8'),ctx);
  ctx.ERP_API.request=request;
  vm.runInContext(prefix+'\nrefs.halls=[];refs.warehouses=[];refs.employees=[];refs.customers=[];\n'+viewInstall+'\nwindow.probe={doc,syncTransfers,initialize:async()=>{'+readiness+'}};',ctx);
  return {ctx,page,list,pager,calls,setRows:next=>{rows=structuredClone(next);},result:()=>readinessResult,renders:()=>renderCount,
    initialize:()=>vm.runInContext(catchLine.replace('bootstrap()','probe.initialize()'),ctx)};
}

// Independent complete synthetic projection: these new dimensions are test facts,
// not inferred meanings or a rewrite of the captured T36 fixture.
function completeFixture(){
  const catalog=structuredClone(capture.catalogResponse.data);
  const fixtureId=n=>'44000000-0000-4000-8000-'+String(n).padStart(12,'0');
  for(const [i,sku] of catalog.skus.entries()){
    delete sku.historicalUnmappedReason;
    sku.options={COLOR:{id:fixtureId(i+1),name:'Synthetic color '+i,code:String(i)},SIZE:{id:fixtureId(i+4),name:String(44+i*2),code:String(44+i*2)}};
    sku.fit_id=i===2?'B':'A';
  }
  const row=structuredClone(capture.queryResponse.data.items[0]);
  row.id=fixtureId(7);row.number='TEST-COMPLETE';row.status='UNAUDITED';row.current_effect_active=false;
  row.body.lines=catalog.skus.map((sku,i)=>({source_id:'test-line-'+i,sku_id:sku.id,product_id:sku.product_id,color_id:sku.options.COLOR.id,size_id:sku.options.SIZE.id,
    source_product_code:'T33',source_product_name:'Synthetic product',source_color_name:sku.options.COLOR.name,source_size_name:sku.options.SIZE.name,
    source_quantity:'1.0000',unit:'件',from_warehouse_id:row.body.header.source_from_warehouse_id,to_warehouse_id:row.body.header.source_to_warehouse_id}));
  return {products:projection(catalog),items:[row]};
}

test('captured exact candidate rejects missing SKU dimensions and missing line identities',()=>{
  const products=projection(capture.catalogResponse.data);
  assert.equal(products[0].uuid,'33000000-0000-4000-8000-000000000007');
  assert.equal(products[0].sourceSkuIds.length,3);
  assert.equal(Object.keys(products[0].skuByFitCell).length,0);
  assert.ok(products[0].historicalUnmappedSkus.every(s=>s.reason==='MISSING_SIZE_MAPPING'));
  const h=harness({products});
  for(const row of [...capture.queryResponse.data.items,...capture.detailResponses.map(r=>r.data)])assert.throws(()=>h.ctx.probe.doc(row),/PRODUCT_NOT_LOADED/);
  const complete=completeFixture();
  const withSpecs=harness(complete);
  assert.throws(()=>withSpecs.ctx.probe.doc(capture.queryResponse.data.items[0]),/PRODUCT_NOT_LOADED/,'catalog completion alone must not guess absent line identities');
});

test('service bridge removes demo rows before any real response is read',()=>{
  const h=harness();assert.equal(h.ctx.GOLD.documents.length,0);assert.equal(h.calls.length,0);assert.equal(h.ctx.TRANSFER_SERVICE.total,0);
});

test('captured mapping failure leaves no demo rows or successful empty-result claim',async()=>{
  const h=harness();
  // Also defend against a later legacy initializer inserting demo rows.
  h.ctx.GOLD.documents.push({id:'DEMO-DB-0001'},{id:'DEMO-DB-0002'});
  const r=await h.ctx.probe.syncTransfers();
  assert.equal(r.ok,false);assert.equal(r.error,'PRODUCT_NOT_LOADED');
  assert.equal(h.ctx.GOLD.documents.length,0);assert.equal(h.ctx.TRANSFER_SERVICE.total,0);
  assert.equal(h.ctx.TRANSFER_SERVICE.error,'PRODUCT_NOT_LOADED');
  h.ctx.LEGACY_REAL.loaded=true;h.ctx.render();
  assert.match(h.list.textContent,/调拨单读取失败：PRODUCT_NOT_LOADED/);
  assert.equal(h.list.attributes.role,'alert');assert.equal(h.pager.hidden,true);
  assert.ok(!h.list.textContent.includes('DEMO-DB-'));
  assert.equal(h.ctx.TRANSFER_UI.state.appliedFilter.q,'kept-filter');
  assert.equal(h.ctx.GOLD.initial,stockSentinel);
});

test('initial list mapping failure resolves readiness as a failure',async()=>{
  const h=harness();await h.initialize();
  assert.equal(h.result()?.ok,false);assert.equal(h.result()?.error,'PRODUCT_NOT_LOADED');
  assert.equal(h.ctx.LEGACY_REAL.loaded,false);assert.equal(h.ctx.LEGACY_REAL.error,'PRODUCT_NOT_LOADED');
  assert.match(h.page.innerHTML,/真实数据读取失败：PRODUCT_NOT_LOADED/);
  assert.equal(h.ctx.GOLD.documents.length,0);assert.equal(h.ctx.GOLD.initial,stockSentinel);
});

test('complete independent fixture reads exact fit/SKU quantities and clears a prior query error',async()=>{
  const complete=completeFixture(),h=harness(complete);
  const bad=structuredClone(complete.items[0]);delete bad.body.lines[0].product_id;
  h.setRows([bad]);assert.equal((await h.ctx.probe.syncTransfers()).ok,false);
  h.setRows(complete.items);const r=await h.ctx.probe.syncTransfers();assert.equal(r.ok,true);
  assert.equal(h.ctx.TRANSFER_SERVICE.error,'');assert.equal(h.ctx.TRANSFER_UI.state.listError,'');
  assert.equal(h.ctx.GOLD.documents.length,1);assert.equal(h.ctx.TRANSFER_SERVICE.total,1);
  assert.equal(r.docs[0].status,'未审核');assert.equal(r.docs[0].items.length,2);
  assert.equal(r.docs[0].q['T33|0|0'],1);assert.equal(r.docs[0].q['T33::fit:B|2|2'],1);
  assert.deepEqual(r.docs[0].lines.map(l=>l.skuId),complete.items[0].body.lines.map(l=>l.sku_id));
  assert.deepEqual(r.docs[0]._runtime.body.lines,complete.items[0].body.lines);
  h.ctx.LEGACY_REAL.loaded=true;h.ctx.render();assert.equal(h.pager.hidden,false);assert.equal(h.list.textContent,'TEST-COMPLETE');
  assert.equal(h.ctx.GOLD.initial,stockSentinel);assert.ok(h.calls.every(path=>path.startsWith('/runtime/documents?')));
});

test('valid empty query and valid startup remain successful without demo fallback',async()=>{
  const h=harness(completeFixture());await h.initialize();assert.equal(h.result().ok,true);assert.equal(h.ctx.LEGACY_REAL.loaded,true);
  h.setRows([]);const r=await h.ctx.probe.syncTransfers();assert.equal(r.ok,true);assert.equal(h.ctx.TRANSFER_SERVICE.error,'');
  assert.equal(h.ctx.GOLD.documents.length,0);assert.equal(h.ctx.TRANSFER_SERVICE.total,0);
});

test('wrong product, SKU or dimensions still reject after the state fix',async()=>{
  const complete=completeFixture();
  for(const [field,value,error] of [['product_id','another-product','PRODUCT_NOT_LOADED'],['sku_id','another-sku','PRODUCT_NOT_LOADED'],['color_id','another-color','SKU_NOT_LOADED'],['size_id','another-size','SKU_NOT_LOADED']]){
    const h=harness(complete),row=structuredClone(complete.items[0]);row.body.lines[0][field]=value;h.setRows([row]);
    const r=await h.ctx.probe.syncTransfers();assert.equal(r.ok,false);assert.equal(r.error,error);assert.equal(h.ctx.GOLD.documents.length,0);
  }
});
