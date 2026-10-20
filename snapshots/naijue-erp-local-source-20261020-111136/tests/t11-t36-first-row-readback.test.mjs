import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import vm from 'node:vm';

// F02 only: actual list -> cache -> getDoc -> history, with saved sanitized data.
const repo=fileURLToPath(new URL('..',import.meta.url));
const sourceRoot=resolve(process.env.T11_SOURCE_ROOT||repo);
const Adapter=await import(pathToFileURL(join(sourceRoot,'frontend/legacy-adapter.mjs')));
const {fitView,fitViewId}=await import(pathToFileURL(join(sourceRoot,'frontend/business-product-view.mjs')));
const {resolveSaleDocumentId}=await import(pathToFileURL(join(sourceRoot,'frontend/sales-transport.mjs')));
const Inventory=await import(pathToFileURL(join(sourceRoot,'frontend/inventory-unit-view.mjs')));
const capture=JSON.parse(readFileSync(join(repo,'outputs/T11/revisions/20261005-t36-first-row-readback-f02/captured-ui-transfer.json'),'utf8'));
const source=readFileSync(join(sourceRoot,'frontend/real-data-bridge.mjs'),'utf8');
const prefix=source.split('async function bootstrap()')[0].replace(/^import .*;\n/gm,'');
const viewStart=source.indexOf(' const fitViews=new Map();'),viewEnd=source.indexOf(' PRODUCT_IDENTITY.install(',viewStart);
assert.ok(viewStart>=0&&viewEnd>viewStart);
const viewInstall=source.slice(viewStart,viewEnd);
const first=capture.queryResponse.data.items[0];
assert.equal(first.id,capture.documentId);assert.equal(first.number,capture.documentNumber);

function saleFixture(){
  // Independent adjacent-caller fixture; it is not captured T36 sale evidence.
  const row=structuredClone(capture.detailResponses[0].data);
  row.document_type='SALE';row.number='TEST-SALE-FIRST';
  row.body.header={...row.body.header,business_type:'SALE',source_warehouse_id:row.body.header.source_from_warehouse_id};
  row.body.lines=row.body.lines.map(l=>({...l,warehouse_id:l.from_warehouse_id,unit_price:'10.00',amount:'10.00'}));
  row.history=[];return row;
}
function harness({sales=false}={}){
  const catalog=structuredClone(capture.catalogResponse.data);
  const products=catalog.products.map(p=>Adapter.product(p,catalog.skus.filter(s=>s.product_id===p.id),catalog.barcodes.filter(b=>b.product_id===p.id),[]));
  const detail=sales?saleFixture():capture.detailResponses[0].data;
  const rows=sales?[{...detail,history:undefined}]:capture.queryResponse.data.items;
  const calls=[],actor={id:'t36-admin',name:'Synthetic',role:'管理员'};
  const ctx={Adapter,fitView,fitViewId,resolveSaleDocumentId,...Inventory,structuredClone,URLSearchParams,
    location:{hash:sales?'#sales':'#transfer'},history:{replaceState(){}},document:{querySelector:()=>({innerHTML:''})},
    ERP_DEMO:{products,warehouses:[]},PRODUCT_CATALOG:{fit:id=>Adapter.FITS.find(f=>f.id===id)},PRODUCT_UI:{openReadOnly(){}},
    MASTER_DATA:{data:{stores:[],warehouses:[],staff:[actor]},roles:['管理员','仓库','营业员'],current:()=>actor,routeAllowed:()=>true,transferWarehouses:()=>[]},
    SALES_SUMMARY:{categorySnapshot:p=>({id:p?.categoryId||'',name:p?.category||''})},
    SALES_SERVICE:{work:[],docs:[]},TRANSFER_SERVICE:{},GOLD:{documents:[]},addEventListener(){},dispatchEvent(){},render(){},
    ERP_API:{async request(path,body){
      calls.push({path,body});
      if(path.startsWith(sales?'/sales/documents?':'/runtime/documents?'))return {items:structuredClone(rows),total:rows.length};
      if(path.startsWith(sales?'/sales/document/':'/runtime/document/')){
        const id=decodeURIComponent(path.slice(path.lastIndexOf('/')+1));
        if(id!==detail.id)throw Object.assign(new Error('Expected UUID; received display number '+id),{code:'VALIDATION',status:400});
        return structuredClone(detail);
      }
      if(path===(sales?'/sales/work':'/transfers/work')){assert.equal(body.type,'logs');assert.equal(body.docId,detail.id);return {items:[]};}
      if(path.startsWith('/runtime/product-stock?')){assert.equal(body,undefined);return [];}
      throw Error('Unexpected operation '+path);
    }}
  };
  ctx.window=ctx;vm.createContext(ctx);
  const request=ctx.ERP_API.request;
  vm.runInContext(readFileSync(join(sourceRoot,'frontend/service-client.js'),'utf8'),ctx);ctx.ERP_API.request=request;
  vm.runInContext(prefix+'\nrefs.halls=[];refs.warehouses=[];refs.employees=[];refs.customers=[];\n'+viewInstall+
    '\nbridge.skus=new Map();bridge.rawSkuById=new Map();window.probe={doc,getDoc,syncSales,syncTransfers};',ctx);
  return {ctx,calls,detail,rows,sync:()=>sales?ctx.probe.syncSales():ctx.probe.syncTransfers()};
}

test('actual transfer list caches row index zero under its display number',async()=>{
  const h=harness(),r=await h.sync();assert.equal(r.ok,true);
  const cached=h.ctx.LEGACY_REAL.docs.get(first.number);
  assert.ok(cached,'first list row must be cached before the click');assert.equal(cached.uuid,first.id);
  assert.equal(cached,r.docs[0]);assert.equal(h.ctx.LEGACY_REAL.docs.size,h.rows.length);
});

test('first transfer click uses exact UUID and keeps current detail above historical snapshots',async()=>{
  const h=harness();assert.equal((await h.sync()).ok,true);
  const d=await h.ctx.probe.getDoc(first.number);
  assert.equal(h.calls.find(c=>c.path.startsWith('/runtime/document/')).path,'/runtime/document/'+first.id);
  assert.equal(d.uuid,first.id);assert.equal(d._detail,true);assert.equal(d.version,h.detail.version);
  assert.deepEqual(d._runtime.body,h.detail.body);
  assert.equal(d.history.length,2);assert.equal(d.history[0].after.status,'未审核');assert.equal(d.history[0].after.version,1);
  assert.equal(d.history[1].after.status,'已审核');assert.equal(d.history[1].after.version,2);
  assert.equal(h.ctx.LEGACY_REAL.docs.get(first.number),d,'cache=false recursive snapshots must not replace current detail');
  const live=h.ctx.LEGACY_REAL.docs.get(first.number);
  h.ctx.probe.doc({...h.detail,version:1,history:[]},false);
  assert.equal(h.ctx.LEGACY_REAL.docs.get(first.number),live,'explicit false must still disable caching');
  assert.ok(h.calls.every(c=>c.body===undefined||c.body?.type==='logs'),'only document/stock reads and work-log queries');
});

test('refreshing the first list row retains an already loaded detail of the same version',async()=>{
  const h=harness();await h.sync();const detail=await h.ctx.probe.getDoc(first.number);
  const r=await h.sync();assert.equal(r.ok,true);assert.equal(r.docs[0],detail);
  assert.equal(h.ctx.LEGACY_REAL.docs.get(first.number),detail);assert.equal(r.docs[0].history.length,2);
});

test('the adjacent sales list also caches its first row and opens the UUID directly',async()=>{
  const h=harness({sales:true}),r=await h.sync();assert.equal(r.ok,true);
  assert.ok(h.ctx.LEGACY_REAL.docs.get(h.detail.number),'sales index zero must be cached');
  const d=await h.ctx.probe.getDoc(h.detail.number,'SALE');assert.equal(d.uuid,h.detail.id);
  assert.equal(h.calls.find(c=>c.path.startsWith('/sales/document/')).path,'/sales/document/'+h.detail.id);
  assert.equal(h.calls.filter(c=>c.path.startsWith('/sales/documents?')).length,1,'cached row must not need a number-to-UUID lookup');
});
