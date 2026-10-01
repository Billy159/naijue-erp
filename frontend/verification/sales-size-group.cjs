const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const config = require('../business-config.js');
const summary = require('../sales-summary.js');

const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const between = (source, first, next) => {
  const start = source.indexOf(first), end = source.indexOf(next, start);
  assert(start >= 0 && end > start, 'production boundary exists');
  return source.slice(start, end);
};
const group = {id:'UPPER',name:'男装上衣尺码',sizes:[
  {id:'xs',name:'160/XS',code:'201'}, {id:'m',name:'170/M',code:'203'},
  {id:'xl',name:'180/XL',code:'205'}, {id:'disabled',name:'不再使用',disabled:true}
]};
const oldSize = crypto.randomUUID(), oldSku = crypto.randomUUID();
const red = crypto.randomUUID(), blue = crypto.randomUUID();
const product = {id:'026MS5133001',uuid:crypto.randomUUID(),name:'针织衫',groupId:'UPPER',fitId:'A',
  sizeIds:[oldSize],sizes:['170/M'],colorIds:[red,blue],selectedColorIds:[red,blue],
  legacySizeRecords:[{id:oldSize,name:'170/M',standardGroup:group.name,sourceName:'170/88A'}],
  skuByCell:{[red+'|'+oldSize]:oldSku},skuByFitCell:{[red+'|A|'+oldSize]:oldSku},
  barcodes:{[red+'|'+oldSize]:{current:'original-excel-barcode',history:['retired-code'],skuId:oldSku}},
  stock:{warehouse:[[-3],[4]]},historicalUnmappedSkus:[{skuId:'historical',quantity:-2}],categoryId:'knit'};
const preserved = structuredClone(product);
const catalog = {group:id=>id==='UPPER'?group:null,businessProduct:id=>id===product.id?product:null};
const state = {editing:false,doc:{status:'未审核'}};
const ctx = vm.createContext({window:{REAL_DATA_MODE:true},U:state,C:catalog,D:{products:[product]},
  copy:structuredClone,crypto,sourceCode:p=>p.id,by:()=>null,bridge:{skus:new Map()}});
vm.runInContext(between(read('sales-current.js'),'function saleSizeGroup','const isSale'),ctx);
ctx.saleSizeGroup(product);
assert.deepEqual(product,preserved,'readonly details never expand or rewrite dimensions');
state.editing=true;
ctx.saleSizeGroup(product);
assert.equal(product.sizes.length,3,'all active sizes become selectable, disabled sizes stay excluded');
assert.equal(product.sizeIds[0],oldSize,'original UUID and positional stock identity survive');
assert.deepEqual(product.legacySizeRecords[0],preserved.legacySizeRecords[0]);
assert.deepEqual(product.barcodes[red+'|'+oldSize],preserved.barcodes[red+'|'+oldSize]);
assert.deepEqual(product.stock.warehouse.map(c=>c[0]),[-3,4],'negative and positive source stock survive');
assert.deepEqual(product.historicalUnmappedSkus,preserved.historicalUnmappedSkus);
const expanded = structuredClone(product);
ctx.saleSizeGroup(product);
assert.deepEqual(JSON.parse(JSON.stringify(product)),expanded,'reopening the chooser does not append duplicate dimensions');

const pendingSize = product.sizeIds[product.sizes.indexOf('160/XS')], persistedSize = crypto.randomUUID();
const calls=[];
ctx.api=async (endpoint,body)=>{
  assert.equal(endpoint,'/runtime/specs/ensure');
  calls.push(structuredClone(body));
  return {skuId:crypto.randomUUID(),sizeId:persistedSize};
};
const bridgeSource=read('real-data-bridge.mjs');
vm.runInContext(between(bridgeSource,'async function ensureTransferSpecs','async function write')+
  between(bridgeSource,'function bodyFrom','const pending='),ctx);
const line=(id,colorId,sizeId,quantity)=>({id,productId:product.id,colorId,sizeId,fitId:'A',
  color:colorId===red?'大红色':'蓝色',size:sizeId===oldSize?'170/M':'160/XS',quantity,
  priceCents:89800,referenceCents:89800,pricingRule:'unit-price',discountTenths:100,note:'保留明细备注'});
const doc={id:'unsaved-size-test',status:'未审核',date:'2026-10-01',warehouseId:'warehouse',
  lines:[line('original',red,oldSize,1),line('red-xs',red,pendingSize,2),line('blue-xs',blue,pendingSize,-1)],
  fundsRecords:[{id:'p1',methodId:'wechat',accountId:'a',amountCents:10000}],
  _runtime:{body:{header:{},lines:[{source_id:'original',source_quantity:'1',unit_price:'898',amount:'898',unit:'件',source_lineage:{original:true}}],fundsRecords:[]}}};
const facts=doc.lines.map(l=>({...l,sizeId:undefined}));
(async()=>{
  await ctx.ensureSaleSpecs(doc);
  assert.equal(calls.length,2,'only the two missing color combinations are created');
  assert.equal(calls[0].sizeId,null,'a missing size is persisted through the overlay');
  assert.equal(calls[0].groupName,group.name);
  assert.equal(calls[0].sizeCode,'201');
  assert.equal(calls[0].fitId,'A');
  assert.equal(ctx.bridge.skus.get(product.skuByCell[red+'|'+persistedSize]).fitId,'A','stock reload can match the persisted SKU to its fit');
  assert.equal(calls[1].sizeId,persistedSize,'second color reuses the same persisted size identity');
  assert.equal(doc.lines[0].sizeId,oldSize);
  assert(doc.lines.slice(1).every(l=>l.sizeId===persistedSize));
  assert.deepEqual(doc.lines.map(l=>({...l,sizeId:undefined})),facts,'prices, discount, quantities and notes survive persistence');
  await ctx.ensureSaleSpecs(doc);
  assert.equal(calls.length,2,'repeat save preparation does not create duplicate SKUs');
  const body=ctx.bodyFrom(doc,'SALE');
  assert.equal(body.lines[0].sku_id,oldSku);
  assert.equal(body.lines[0].unit,'件');
  assert.equal(body.lines[0].source_lineage.original,true);
  assert.equal(body.lines[1].product_id,product.uuid);
  assert.equal(body.lines[1].size_id,persistedSize);
  assert.equal(body.lines[1].source_quantity,'2');
  assert.equal(body.lines[1].unit_price,'898');
  assert.equal(body.lines[1].amount,'1796');
  assert.equal(body.lines[2].source_quantity,'-1','returns retain their sign');
  assert.equal(body.fundsRecords[0].amount,'100');
  assert.deepEqual(product.barcodes[red+'|'+oldSize],preserved.barcodes[red+'|'+oldSize]);

  const staffCatalog={staff:[{id:'me',enabled:true,role:'管理员',storeId:'other'},
    {id:'elsewhere',enabled:true,storeId:'elsewhere'}, {id:'left',employmentStatus:'离职'}],
    stores:[{id:'normal',enabled:true},{id:'multicube',enabled:true}],accounts:{},categories:[{id:'knit',name:'毛衫'}]};
  const session={accountId:'me',storeIds:['normal','multicube'],operationWarehouses:[]};
  global.window={MASTER_DATA:{active:true}};
  global.MASTER_DATA={context:()=>session};
  for(const hall of ['normal','multicube']){
    const fresh={};config.defaults(fresh,staffCatalog,session,hall);
    assert.equal(fresh.salespersonId,'me','both halls recommend only the current active user');
    config.assign(fresh,'salespersonId','elsewhere',staffCatalog);
    config.assign(fresh,'storeId',hall==='normal'?'multicube':'normal',staffCatalog);
    assert.equal(fresh.salespersonId,'elsewhere','hall changes retain a manually selected employee');
  }
  delete global.window;delete global.MASTER_DATA;
  assert.equal(summary.project(doc,[],[product],staffCatalog).categories[0].name,'毛衫');
  assert.equal(summary.project({...doc,id:'SA-saved',revision:1},[],[product],staffCatalog).categories[0].id,'__unrecorded','missing historical categories are not inferred');
  console.log('Sales full size group, save boundary, source identities, current-user recommendation and category snapshots: PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
