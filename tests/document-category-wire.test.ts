import test from 'node:test';import assert from 'node:assert/strict';
import {documentListWire,transferDetailWire} from '../apps/api/src/document-list-wire.ts';
import {documentCategorySummary} from '../adapters/postgres/src/sales-query-reader.ts';
test('category extension is opt in and does not mutate or leak to old strict clients',()=>{const categorySummary={basis:'CURRENT'},row={id:'same',productSummary:{items:[]},categorySummary},page={items:[row],page:1};assert.deepEqual(documentListWire(page,'category-v1'),page);assert.deepEqual(documentListWire(page,undefined),{items:[{id:'same',productSummary:{items:[]}}],page:1});assert.equal(row.categorySummary,categorySummary);assert.deepEqual(documentListWire(page,'unexpected'),documentListWire(page,undefined));});
test('historical categories stay unknown even when current catalog facts are supplied',()=>{assert.deepEqual(documentCategorySummary({dataset:'HISTORY',category_items:[{categoryId:'fake'}]},'QUANTITY'),{basis:'UNKNOWN',metric:'QUANTITY',items:[],hasMore:false,categoryCount:null});});
test('current exact signed values and fail-closed malformed projection',()=>{const row={dataset:'LIVE',category_items:[{categoryId:null,categoryName:null,value:'-9007199254740993'}],category_has_more:false,category_count:'1'};assert.equal(documentCategorySummary(row,'QUANTITY').items[0]?.value,-9007199254740993n);assert.throws(()=>documentCategorySummary(row,'PRODUCT_COUNT'));assert.throws(()=>documentCategorySummary({...row,category_items:undefined},'QUANTITY'));assert.throws(()=>documentCategorySummary({...row,category_items:[{categoryId:null,categoryName:null,value:'0'}]},'QUANTITY'));});

test('actual Fastify list routes negotiate category-v1 while legacy responses remain exact',async()=>{
 const {default:Fastify}=await import('fastify');
 const {createSalesQueryHttpPlugin}=await import('../apps/api/src/sales-query-http.ts');
 const {createTransferQueryHttpPlugin}=await import('../apps/api/src/transfer-query-http.ts');
 const {actor}=await import('./support/synthetic-fixtures.ts');
 for(const kind of ['sales','transfers'] as const){const app=Fastify(),categorySummary={basis:'CURRENT',metric:kind==='sales'?'QUANTITY':'PRODUCT_COUNT',items:[{categoryId:null,categoryName:null,value:9007199254740993n}],hasMore:false,categoryCount:1n};
  const row={id:'synthetic',productSummary:{productCount:1n,items:[],hasMore:false},categorySummary};
  const plugin=kind==='sales'?createSalesQueryHttpPlugin:createTransferQueryHttpPlugin;
  app.register(plugin({authenticate:async()=>({...actor,role:'ADMIN'}),dependencies:{authorization:{authorize:async()=>({kind:'all'})},reader:{readReferences:async()=>{throw Error("Unused route")},readDetail:async()=>{throw Error("Unused route")},readHistory:async()=>{throw Error("Unused route")},readSettlementStatistics:async()=>{throw Error("Unused route")},readWarehouses:async()=>{throw Error("Unused route")},readList:async()=>({page:1,pageSize:20,exactTotal:1n,items:[row]})}}} as never));
  try{const filter=kind==='sales'?{startDate:null,endDate:null,statuses:[],businessTypes:[],hallIds:[],salespersonIds:[],customerIds:[],warehouseIds:[],number:null}:{startDate:null,endDate:null,statuses:[],fromWarehouseIds:[],toWarehouseIds:[],number:null};
   for(const version of [undefined,'category-v1','category-v2']){const response=await app.inject({method:'POST',url:'/'+kind+'/query',payload:{page:1,pageSize:20,filter},headers:version?{'x-naijue-document-summary':version}:{}});assert.equal(response.statusCode,200,kind+' '+version+' '+response.body);assert.deepEqual(Object.keys(response.json().items[0]),version?['id','productSummary','categorySummary']:['id','productSummary']);if(version){assert.equal(response.json().items[0].categorySummary.items[0].value,'9007199254740993');assert.equal(response.json().items[0].categorySummary.categoryCount,version==='category-v2'?'1':undefined);}}
  }finally{await app.close();}
 }
});

test('detail opt-in v2 alone exposes bounded categories; v1 and legacy exact DTO unchanged',()=>{const value={document:{header:{id:'synthetic'}},categorySummary:{basis:'CURRENT',categoryCount:4n}};assert.equal(transferDetailWire(value,'category-v2'),value);for(const version of [undefined,'category-v1','unexpected'])assert.deepEqual(transferDetailWire(value,version),{document:{header:{id:'synthetic'}}});});

test('historical transfer detail category-v2 exposes UNKNOWN/null while all legacy negotiation remains exact', () => {
  const legacy = { document: { header: { id: 'synthetic-history' }, lines: [] }, stockBasis: 'CUTOFF_HISTORY', references: {}, catalog: { skus: [], sizeGroups: [] } };
  const categorySummary = { basis: 'UNKNOWN', metric: 'PRODUCT_COUNT', categoryCount: null, items: [], hasMore: false }, value = { ...legacy, categorySummary };
  assert.equal(transferDetailWire(value, 'category-v2'), value);
  assert.deepEqual((transferDetailWire(value, 'category-v2') as typeof value).categorySummary, categorySummary);
  for (const version of [undefined, 'category-v1', 'unexpected']) assert.equal(JSON.stringify(transferDetailWire(value, version)), JSON.stringify(legacy));
  assert.equal(value.categorySummary, categorySummary);
});
