/* Frozen UI data/service boundary. No historical source mutations or Seed fallback. */
import * as Adapter from './legacy-adapter.mjs?v=t11-20261002a';
import {transferLines} from './transfer-contract.mjs';
import {buildSaleBody,centsText,resolveSaleDocumentId} from './sales-transport.mjs?v=t22-20261002a';
import {currentSizeGroups} from './product-size-groups.mjs';
import {hydrateProductCatalog,productProfileDraft} from './product-service.mjs';
import {fitView,sourceCode} from './business-product-view.mjs';
import {currentSpecView} from './product-spec-view.mjs?v=ui-fixes-20261001a';
import {projectProductStock,stockSummary,cellStockSummary,inventoryCellReport,inventoryQuantity} from './inventory-unit-view.mjs?v=t23-trace-20261003-r02';
import {createInventoryPageReader,inventoryPageTable,inventoryPageReport,inventoryYintaiReport} from './inventory-page.mjs';
import {queryCellLedger,readLedgerSource} from './inventory-ledger-service.mjs?v=t23-trace-20261003-r02';
import {createReferenceQueue} from './reference-load-queue.mjs';
import {createProductReader} from './product-read.mjs';
import {isBoundReadonlyTransfer,historicalTransfer,isHistoricalTransfer,historicalListCells,historicalTransferHtml} from './transfer-historical-read.mjs';
const D=ERP_DEMO,C=PRODUCT_CATALOG,M=MASTER_DATA,S=SALES_SERVICE,T=TRANSFER_SERVICE,G=GOLD;
const copy=structuredClone;
const sortSkus=(a,b)=>String(a.options?.SIZE?.name||'').localeCompare(String(b.options?.SIZE?.name||''),'zh-CN',{numeric:true})||String(a.options?.COLOR?.name||'').localeCompare(String(b.options?.COLOR?.name||''),'zh-CN');
let sessionGeneration=0,sessionPromise=null,runtimeObserversInstalled=false,observerCleanup=null;
const baseBindings={sync:M.sync,save:M.save,setStatus:M.setStatus,count:G.count,business:SALES_CORE.business,totals:SALES_CORE.totals,fresh:SALES_MODEL.fresh};
const api=async(path,body,options)=>{const generation=sessionGeneration;const value=await ERP_API.request(path,body,options);if(generation!==sessionGeneration)throw new ERP_API.ServiceError('登录身份已变化，请重新加载',{code:'AUTH',stale:true});return value};
const bridge=window.LEGACY_REAL={api,loaded:false,inventoryReady:false,totalsReady:false,totalsPromise:null,error:'',docs:new Map(),stockLoaded:new Set()};
bridge.readonlyTransfers=new Map();bridge.transferPage=[];
bridge.historical={is:isHistoricalTransfer,cells:historicalListCells,render:historicalTransferHtml};
bridge.readonlyTransfer=id=>{const value=bridge.readonlyTransfers.get(id);return value?.scope===sessionScope()?value.doc:null;};
function readHistoricalTransfer(row){
 const d=historicalTransfer(row,{rawSkus:bridge.rawSkuById,products:D.products,warehouseName:id=>by('warehouses',id)?.name??null});
 const old=bridge.readonlyTransfer(d.uuid),sameVersion=old?.version===d.version&&old?.currentRevision===d.currentRevision,
  sameProof=old&&JSON.stringify(old.readProjection)===JSON.stringify(d.readProjection);
 if(sameVersion&&sameProof&&old._detail&&!d._detail)return old;
 if(!d._detail){const key=pageKey('transfer/doc/'+encodeURIComponent(d.uuid));bridge.pageReady.delete(key);bridge.pageErrors.delete(key);}
 bridge.readonlyTransfers.set(d.uuid,{scope:sessionScope(),doc:d});return d;
}
// The service boundary must never present seeded demo documents as server data.
G.documents?.splice(0);T.total=0;D.products.splice(0);D.warehouses.splice(0);C.categories.splice(0);C.colors.splice(0);C.suppliers.splice(0);C.units=[];S.docs=[];S.total=0;
bridge.stockSummary=stockSummary;bridge.stockCellSummary=cellStockSummary;
const inventoryCellContext=snapshot=>({products:snapshot.products,warehouses:D.warehouses,skus:bridge.rawSkuById||new Map()});
bridge.inventoryTable=(snapshot,options)=>inventoryPageTable(snapshot,inventoryCellContext(snapshot),options);
bridge.inventoryReport=snapshot=>inventoryPageReport(snapshot,inventoryCellContext(snapshot));
bridge.inventoryYintaiReport=snapshot=>inventoryYintaiReport(snapshot,inventoryCellContext(snapshot),C);
bridge.ledgerCellLabel=cell=>inventoryCellReport([cell],inventoryCellContext({products:D.products}))[1];
bridge.inventoryQuantity=inventoryQuantity;
bridge.ledgerSource=entry=>readLedgerSource(api,entry);
const recommendationCache=new Map(),recommendationPending=new Map();
bridge.recommendationForHall=id=>recommendationCache.get(id)||null;
bridge.invalidateRecommendations=id=>{recommendationCache.delete(id);recommendationPending.delete(id)};
bridge.ensureRecommendations=async id=>{if(!id)return null;if(recommendationCache.has(id))return recommendationCache.get(id);if(recommendationPending.has(id))return recommendationPending.get(id);const pending=api('/runtime/recommendations?hallId='+encodeURIComponent(id)).then(value=>{if(recommendationPending.get(id)!==pending)return bridge.ensureRecommendations(id);recommendationCache.set(id,value);if(window.SALES_UI?.state.doc?.storeId===id){window.SALES_FUNDS_UI?.syncField?.(window.SALES_UI.state.doc,window.SALES_UI.state.editing&&!window.SALES_UI.state.busy&&!window.SALES_UI.state.unresolvedRequest);/* Keep the active document controls mounted while recommendations arrive. */}return value}).finally(()=>{if(recommendationPending.get(id)===pending)recommendationPending.delete(id)});recommendationPending.set(id,pending);return pending};
function adaptedCatalogProduct(catalog,code,productId){
 const rows=catalog.products.filter(p=>productId?p.id===productId:p.code===code);
 if(rows.length!==1)throw Error(rows.length?'商品款号存在多个身份，请选择具体商品':'商品详情尚未读取');const row=rows[0];
 const source=Adapter.product(row,catalog.skus.filter(s=>s.product_id===row.id).sort(sortSkus),catalog.barcodes.filter(b=>b.product_id===row.id),[]);
 const overlay=(catalog.profiles||[]).find(x=>x.product_id===row.id),body=overlay?.body||{},seen=new Set();
 const images=(body.images||source.images).map(image=>{if(image.role!=='颜色配图')return image;const colorId=image.colorId||source.colorIds.find((id,i)=>source.colors[i]===image.colorName);if(!colorId||seen.has(colorId))return {...image,role:'辅助图片',colorId:''};seen.add(colorId);return {...image,colorId}});
 const product=currentSpecView({...source,...body,fitIds:body.fitIds||[source.fitId],images,profileVersion:overlay?.version||0,readonly:false},catalog.skus.filter(s=>s.product_id===row.id),C);
 for(const alias of catalog.aliases||[]){if(alias.product_id!==row.id)continue;const binding=Object.values(product.barcodes||{}).find(b=>b.skuId===alias.sku_id);if(binding){binding.compatible??=[];binding.compatible.push({code:alias.barcode,note:alias.historical_note,source:alias.origin==='MANUAL'?'MANUAL':'MIGRATED'})}}
 return product;
}
function normalizeTransferListSearch(route){
 if(route!=='transfer'||!window.REAL_DATA_MODE)return;
 const input=document.querySelector('#tc-list-filter input[name="q"]');if(!input)return;
 input.setAttribute('aria-label','调拨单号或备注');input.setAttribute('placeholder','输入单号或备注搜索');
 const caption=input.closest('label')?.querySelector(':scope > span');if(caption)caption.textContent='调拨单号或备注';
}
function renderTransferReadFailure(route){
 if(route!=='transfer'||!T.error||window.TRANSFER_UI?.state.listLoading)return;
 const box=document.querySelector('.tc-list-scroll');
 if(box){box.textContent='调拨单读取失败：'+T.error;box.setAttribute('role','alert');}
 const pager=document.querySelector('.tc-list-pagination');if(pager)pager.hidden=true;
}
const oldRender=window.render;
window.render=function(){
 let requested=location.hash.slice(1);
 if(requested==='sales-returns'){requested='sales';history.replaceState(null,'','#sales');}
 if(!M.current()){window.ERP_PAGE_COMPONENTS.useLegacyRoute();return oldRender();}
 if(requested&&!M.routeAllowed(requested)){window.ERP_PAGE_COMPONENTS.useLegacyRoute();history.replaceState(null,'','#'+M.landing());return oldRender();}
 const route=location.hash.slice(1)||M.landing();
 updatePageNavigation(route);
 if(bridge.loaded&&window.ERP_PAGE_COMPONENTS.isModernRoute(route)){window.ERP_PAGE_COMPONENTS.renderRoute(route);return;}
 window.ERP_PAGE_COMPONENTS.useLegacyRoute();
 if(!bridge.loaded){showLoadState(bridge.error);return;}
 if(!bridge.pageReady.has(pageKey(route))||!window.ERP_PAGE_COMPONENTS.ready(route)){queuePage(route);return;}
 if(route==='products'&&bridge.productSignature!==productPageSignature()){
  if(bridge.productErrorSignature!==productPageSignature())bridge.productError='';
  showLoadState(bridge.productError,()=>{bridge.productError='';window.render();});
  if(!bridge.productError)loadProductPage().then(()=>{if(location.hash.slice(1)==='products')window.render();})
   .catch(error=>{if(!error?.stale&&location.hash.slice(1)==='products')showLoadState(error.message,()=>{bridge.productError='';window.render();});});
  return;
 }
 const rendered=oldRender();window.TRANSFER_UI?.renderHistoricalList?.();normalizeTransferListSearch(route);renderTransferReadFailure(route);return rendered;
};
function productPageSignature(){const u=PRODUCT_UI.state;return JSON.stringify([productScope(),u.filter,u.page,u.size]);}
async function loadProductPage(){
 const u=PRODUCT_UI.state,signature=productPageSignature(),filters=copy(u.filter);
 if(bridge.productSignature===signature)return bridge.productPage;
 if(bridge.loadingProducts?.signature===signature)return bridge.loadingProducts.task;
 if(filters.categories?.length)filters.categories=C.categories.filter(c=>filters.categories.some(id=>C.inCategory({categoryId:c.id},id))).map(c=>c.id);
 const task=bridge.productReader.list({filters,page:u.page,size:u.size,purpose:'products'}).then(data=>{
  if(signature!==productPageSignature())throw new ERP_API.ServiceError('商品查询条件已变化，请重新查询',{code:'STALE_DATA',stale:true});
  bridge.productPage=data;bridge.productSignature=signature;bridge.productError='';return data;
 }).catch(error=>{if(signature===productPageSignature()&&!error?.stale){bridge.productError=error.message;bridge.productErrorSignature=signature;}throw error;})
 .finally(()=>{if(bridge.loadingProducts?.task===task)bridge.loadingProducts=null;});
 bridge.loadingProducts={signature,task};return task;
}
const refs={},referenceLoaded=new Set();let hallConfig={aliases:{},stores:[]},referenceRevision=0;const canonicalHall=id=>hallConfig.aliases[id]||id;
const sessionScope=()=>JSON.stringify([location.origin,ERP_API.stateScope,M.current()?.id,M.current()?.role,M.current()?.authVersion,sessionGeneration,referenceRevision]);
const productScope=()=>JSON.stringify([location.origin,ERP_API.stateScope,M.current()?.id,M.current()?.role,M.current()?.authVersion,M.current()?.storeId,sessionGeneration]);
bridge.productReader=createProductReader({request:api,scope:productScope,consume:(...args)=>bridge.consumeProductDetails(...args)});
const uuidText=value=>typeof value==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
const requestedProduct=value=>{const reference=String(value).split('::fit:')[0];return uuidText(reference)?{productIds:[reference]}:{codes:[reference]};};
async function ensureDocumentProducts(rows){
 const productIds=new Set(),skuIds=new Set();
 const bodies=[];for(const row of rows){if(row?.body)bodies.push(row.body);for(const h of row?.history||[])for(const body of [h.body,h.previous_body])if(body)bodies.push(body);}
 for(const body of bodies)for(const line of body.lines||[]){if(uuidText(line.product_id))productIds.add(line.product_id);if(uuidText(line.sku_id))skuIds.add(line.sku_id);}
 if(productIds.size||skuIds.size){const result=await bridge.productReader.ensureDetails({productIds:[...productIds],skuIds:[...skuIds]});if(result.unresolved.length)throw Error('单据引用的部分商品身份未能读取，原明细已保留，请重试');}
}
async function ensureDraftProducts(route){
 const type=route.startsWith('sales/')?'sales':route.startsWith('transfer/')?'transfer':null;
 if(!type)return;
 const saved=window.ERP_USER_STATE?.readDraft(type+'-work');
 if(!saved?.doc||saved.accountId&&saved.accountId!==M.current()?.id)return;
 if(saved.route&&saved.route!==route)return;
 if(type==='sales'&&route!=='sales/new'&&route!=='sales/doc/'+encodeURIComponent(saved.doc.id||''))return;
 const draft=saved.doc,productIds=new Set(),skuIds=new Set(),codes=new Set();
 for(const line of draft._runtime?.body?.lines||[]){if(uuidText(line.product_id))productIds.add(line.product_id);if(uuidText(line.sku_id))skuIds.add(line.sku_id);}
 for(const line of draft.lines||[]){const id=String(line.productUuid||line.productId||'').split('::fit:')[0];if(uuidText(id))productIds.add(id);else if(id)codes.add(id);if(uuidText(line.skuId))skuIds.add(line.skuId);}
 for(const key of Object.keys(draft.q||{})){const value=key.split('|')[0].split('::fit:')[0];if(uuidText(value))productIds.add(value);else if(value)codes.add(value);}
 if(productIds.size||skuIds.size||codes.size){
  const result=await bridge.productReader.ensureDetails({productIds:[...productIds],skuIds:[...skuIds],codes:[...codes]});
  if(result.unresolved.length)throw Error('历史草稿的部分商品身份未能读取，输入仍保留，请重试');
 }
}
bridge.ensureDocumentProducts=ensureDocumentProducts;
bridge.ensureDraftProducts=ensureDraftProducts;
async function readReferencePages(kind){if(kind==='employees'&&M.current()?.role==='管理员')return M.serverAuth.employees();const rows=[],ids=new Set();let page=1,total;do{
 const r=await api('/reference/'+kind+'?size=200&page='+page++);
 if(!Array.isArray(r.items)||!Number.isSafeInteger(r.total)||r.total<0||!r.items.length&&rows.length<r.total||page>10001)throw new ERP_API.ServiceError('基础资料分页不完整，请重试',{code:'PROTOCOL'});
 for(const row of r.items){if(ids.has(row.id))throw new ERP_API.ServiceError('基础资料分页重复，请重试',{code:'PROTOCOL'});ids.add(row.id);rows.push(row);}total=r.total;
 }while(rows.length<total);if(rows.length!==total)throw new ERP_API.ServiceError('基础资料数量不一致，请重试',{code:'PROTOCOL'});return rows;}
const referenceQueue=createReferenceQueue({read:readReferencePages,scope:sessionScope,limit:4});
const allReference=kind=>referenceQueue.load(kind);
async function loadReferences(kinds){const owner=sessionScope();const results=await Promise.all(kinds.map(kind=>allReference(kind).then(rows=>[kind,rows])));if(owner!==sessionScope())throw new ERP_API.ServiceError('登录身份已变化',{code:'AUTH',stale:true});for(const [kind,rows] of results){refs[kind]=rows;referenceLoaded.add(kind);}}
bridge.pageReady=new Set();bridge.pagePending=new Map();bridge.pageErrors=new Map();bridge.warehouseSummaryReady=false;
const pageGroup=route=>route;
const pageKey=route=>JSON.stringify([sessionScope(),pageGroup(route)]);
bridge.isPageReady=route=>bridge.loaded&&bridge.pageReady.has(pageKey(route))&&window.ERP_PAGE_COMPONENTS.ready(route);
function updatePageNavigation(route){
 const key=route.startsWith('sales/')?route==='sales/new'?route:'sales':route.startsWith('transfer/')?route==='transfer/new'?route:'transfer':route.startsWith('product/')||route.startsWith('product-view/')?'products':route;
 let current;
 for(const link of document.querySelectorAll('[data-route]')){const selected=link.dataset.route===key;link.classList.toggle('selected',selected);if(selected){link.setAttribute('aria-current','page');current=link;}else link.removeAttribute('aria-current');}
 if(!current)return;
 const group=current.closest('details');if(group)group.open=true;
 const section=key.startsWith('sales')?'销售管理':key.startsWith('settings/')?'基础设置':['inventory','transfer','transfer/new'].includes(key)?'库存管理':key==='future-preview'?'未来模块':'商品管理';
 const breadcrumb=document.querySelector('#breadcrumb');if(breadcrumb)breadcrumb.textContent=section+' / '+current.textContent.trim();
}
function showLoadState(error='',retry=()=>bridge.startSession()){
 const page=document.querySelector('#page');if(!page)return;
 const box=document.createElement('div');box.className='empty';box.setAttribute('role',error?'alert':'status');
 const message=document.createElement('p');message.textContent=error?'资料加载未完成：'+error:'正在准备页面及必要资料…';box.append(message);
 if(error){const button=document.createElement('button');button.type='button';button.className='btn';button.textContent='重试加载';button.onclick=()=>{button.disabled=true;Promise.resolve(retry()).finally(()=>{button.disabled=false;});};box.append(button);}
 page.replaceChildren(box);
}
bridge.ensurePage=route=>{
 const key=pageKey(route),owner=sessionScope();
 if(bridge.pageReady.has(key))return window.ERP_PAGE_COMPONENTS.ensure(route);
 if(bridge.pagePending.has(key))return bridge.pagePending.get(key);
 const task=(async()=>{
  const components=window.ERP_PAGE_COMPONENTS.ensure(route);
  // The same rejection is reported below; attach a handler while data is loading.
  components.catch(()=>{});
  if(window.ERP_PAGE_COMPONENTS.isModernRoute(route)){
   await components;
   if(owner!==sessionScope())throw new ERP_API.ServiceError('登录身份已变化',{code:'AUTH',stale:true});
   bridge.pageReady.add(key);bridge.pageErrors.delete(key);return;
  }
  if(route.startsWith('sales')){
   await loadReferences(['customers','payment-methods','fund-accounts'].filter(kind=>!referenceLoaded.has(kind)));
   const prepared=masterBase();M.attachRuntime(prepared);bridge.masterSignature=JSON.stringify(prepared);refreshRuntimeRefs();
   if(route==='sales'){const result=await syncSales();if(!result.ok)throw Object.assign(Error(result.error),{code:result.code,stale:result.stale});}
   else if(route.startsWith('sales/doc/'))await getDoc(decodeURIComponent(route.slice('sales/doc/'.length)),'SALE');
  }else if(route.startsWith('transfer')){
   if(route==='transfer/new'&&!bridge.warehouseSummaryReady){await M.refreshWarehouseStocks();bridge.warehouseSummaryReady=true;}
   if(route==='transfer'){const result=await syncTransfers();if(!result.ok)throw Object.assign(Error(result.error),{code:result.code,stale:result.stale});}
   else if(route.startsWith('transfer/doc/')){const d=await getDoc(decodeURIComponent(route.slice('transfer/doc/'.length)),'TRANSFER');if(!isHistoricalTransfer(d)&&!bridge.warehouseSummaryReady){await M.refreshWarehouseStocks();bridge.warehouseSummaryReady=true;}}
  }else if(route==='products'){
   await components;await loadProductPage();
  }else if((route.startsWith('product/')||route.startsWith('product-view/'))&&route!=='product/new'){
   const reference=decodeURIComponent(route.slice(route.indexOf('/')+1)),result=await bridge.productReader.ensureDetails(requestedProduct(reference));
   if(result.products.length!==1||result.unresolved.length)throw Error('商品身份未能唯一读取，请返回列表选择具体商品');
   await stock([result.products[0].uuid]);
  }else if(route.startsWith('settings/')){
   const catalog=await api('/runtime/masters');
   if(route==='settings/staff')refs.employees=await M.serverAuth.employees();
   const prepared=masterBase(catalog,refs.employees);M.attachRuntime(prepared);bridge.masterSignature=JSON.stringify(prepared);
   for(const kind of ['customers','suppliers','payment-methods','fund-accounts'])referenceLoaded.add(kind);
   refreshRuntimeRefs();
  }
  await components;
  await ensureDraftProducts(route);
  if(owner!==sessionScope())throw new ERP_API.ServiceError('登录身份已变化',{code:'AUTH',stale:true});
  bridge.pageErrors.delete(key);bridge.pageReady.add(key);
 })();
 bridge.pagePending.set(key,task);task.then(()=>bridge.pagePending.delete(key),error=>{bridge.pagePending.delete(key);if(!error?.stale&&owner===sessionScope())bridge.pageErrors.set(key,error.message);});
 return task;
};
function queuePage(route){
 const key=pageKey(route),owner=sessionScope(),error=bridge.pageErrors.get(key);showLoadState(error,()=>{bridge.pageErrors.delete(key);window.render();});
 if(error)return;
 bridge.ensurePage(route).then(()=>{if((location.hash.slice(1)||M.landing())===route)window.render();})
 .catch(error=>{if(owner!==sessionScope()||(location.hash.slice(1)||M.landing())!==route)return;if(error?.stale){window.render();return;}showLoadState(error.message,()=>{bridge.pageErrors.delete(key);window.render();});});
}
const by=(kind,id)=>refs[kind]?.find(x=>x.id===id);

function context(){const d=M.data,actor=M.current();if(!actor)return null;const own=actor.role==='营业员',activeHall=id=>(d.stores||[]).some(x=>x.id===id&&x.enabled!==false),allStaff=(d.staff||[]).filter(x=>x.employmentStatus!=='离职'&&x.enabled!==false&&M.roles.includes(x.role)&&(x.role!=='营业员'||activeHall(x.storeId))).map(x=>({id:x.id,name:x.name}));return {accountId:actor.id,name:actor.name,role:actor.role,creatorCandidates:actor.role!=='营业员'?[...(actor.id==='local-admin'?[{id:'local-admin',name:'管理员'}]:[]),...allStaff]:[{id:actor.id,name:actor.name}],salesScope:own?'ownStore':'all',staffId:own?actor.id:null,storeIds:own?[actor.storeId].filter(activeHall):(d.stores||[]).filter(x=>x.enabled!==false).map(x=>x.id),warehouses:(d.warehouses||[]).map(x=>x.id),operationWarehouses:M.transferWarehouses('to').map(x=>x.id),outgoingWarehouses:M.transferWarehouses('from').map(x=>x.id),permissions:['view','save','audit','reverse'],expires:Date.now()+3600000};}
const sourceActive=x=>x.enabled!==false&&x.source_payload?.source?.['停用']!==1;
const partyInRole=(row,role)=>Array.isArray(row.usage)&&row.usage.length===1&&row.usage[0]===role;
function masterBase(catalog=null,employeeRows=refs.employees){
 const fundsFromService=(payments,accounts)=>{if(!window.SALES_FUNDS_RUNTIME?.fromService){const error=new Error('资金账户读取程序未加载，请刷新后重试');error.code='FUND_ACCOUNT_DATA_UNAVAILABLE';throw error}return window.SALES_FUNDS_RUNTIME.fromService(payments,accounts)};
 if(catalog){
  const byKind=kind=>catalog.records.filter(row=>row.kind===kind).map(row=>({id:row.id,...row.body,version:row.version,sourceFacts:row.sourceFacts||row.body.sourceFacts||{},_bodySourceFactsPresent:Object.hasOwn(row.body,'sourceFacts')}));
  const stores=byKind('halls'),warehouses=byKind('warehouses').map(row=>{const hallRelations=row.hallRelations||[];return {...row,hallRelations,storeId:hallRelations.length===1?hallRelations[0]:'',ownershipPending:row.sourceOwnershipUnknown===true||hallRelations.length===0}});
  const parties=byKind('parties'),{payments,fundAccounts}=fundsFromService(byKind('payments'),byKind('fundAccounts'));
  const staff=(employeeRows||[]).map(row=>{const hallId=row.hallId||row.storeId||'';return {...row,code:row.code||row.source_code||'',hallId,storeId:hallId,sourceFacts:row.sourceFacts||{},loginName:row.loginName||'',loginEnabled:!!row.loginEnabled,version:Number(row.version)||0}});
  hallConfig={aliases:{},stores:stores.map(row=>({...row,warehouseIds:warehouses.filter(warehouse=>warehouse.hallRelations.includes(row.id)).map(warehouse=>warehouse.id)}))};
  refs.halls=stores.map(row=>({id:row.id,source_code:row.code,name:row.name,enabled:row.enabled,default_customer_id:row.defaultCustomerId,default_warehouse_id:row.defaultWarehouseId}));
  refs.warehouses=warehouses;refs.customers=parties.filter(row=>partyInRole(row,'customer')).map(row=>({...row,source_code:row.code}));refs.suppliers=parties.filter(row=>partyInRole(row,'supplier')).map(row=>({...row,source_code:row.code}));
  refs.employees=staff.map(row=>({...row,source_code:row.code,hall_id:row.hallId,login_enabled:row.loginEnabled}));
  refs['payment-methods']=payments.map(row=>({...row,source_code:row.code}));refs['fund-accounts']=fundAccounts.map(row=>({...row,source_code:row.code,primary_payment_method_id:row.primaryPaymentMethodId}));
  return {revision:catalog.revision||0,stores,warehouses,parties,staff,payments,fundAccounts,categories:[],audit:[]};
 }
 const parties=new Map();for(const [kind,usage] of [['customers','customer'],['suppliers','supplier']])for(const x of refs[kind]||[]){const old=parties.get(x.id);parties.set(x.id,{id:x.id,code:x.code||x.source_code||old?.code||'',name:x.name,enabled:old?.enabled===false?false:sourceActive(x),usage:[...new Set([...(old?.usage||[]),usage])],tags:[...new Set([...(old?.tags||[]),usage])]})}
 const funds=referenceLoaded.has('fund-accounts')?fundsFromService((refs['payment-methods']||[]).map(x=>({id:x.id,code:x.source_code||x.code||'',name:x.name,enabled:sourceActive(x)})),(refs['fund-accounts']||[]).map(x=>({id:x.id,code:x.source_code||x.code||'',name:x.name,enabled:sourceActive(x),type:x.type||x.account_type||'',bank:x.bank||'',accountNumber:x.accountNumber||x.account_number||'',department:x.department||'',primaryPaymentMethodId:x.primaryPaymentMethodId||x.primary_payment_method_id||'',sourceFacts:x.sourceFacts||{}}))):{payments:[],fundAccounts:[]};
 return {revision:0,stores:hallConfig.stores.map(s=>{const x=refs.halls.find(h=>h.id===s.id)||{};return {id:s.id,code:x.code||x.source_code||s.code||'',name:s.name||x.name,enabled:sourceActive(x),defaultCustomerId:s.defaultCustomerId||x.default_customer_id||'',defaultWarehouseId:s.defaultWarehouseId||''}}),warehouses:refs.warehouses.map(x=>{const hallRelations=x.hallRelations||x.storeIds||[];return {id:x.id,code:x.code||'',name:x.name,enabled:sourceActive(x),type:x.type||'',hallRelations,storeId:hallRelations.length===1?hallRelations[0]:'',sourceOwnershipUnknown:hallRelations.length===0,ownershipPending:hallRelations.length===0}}),parties:[...parties.values()],staff:refs.employees.map(x=>({id:x.id,code:x.source_code||x.code||'',name:x.name,role:M.roles.includes(x.role)?x.role:x.source_salesperson?'营业员':'',storeId:canonicalHall(x.hall_id||x.hallId)||'',phone:x.phone||x.source_payload?.source?.['手机']||'',employmentStatus:x.employmentStatus|| (x.source_payload?.source?.['离职日期']?'离职':'在职'),enabled:x.enabled!==false,loginEnabled:!!(x.loginEnabled??x.login_enabled),loginName:x.loginName||'',sourceFacts:x.sourceFacts||{},version:x.version||0,salesEligible:!!x.source_salesperson})),...funds,categories:[],audit:[]};
}
function refreshRuntimeRefs(){const d=M.data,merge=(kind,list)=>{const existing=new Map((refs[kind]||[]).map(x=>[x.id,x]));refs[kind]=list.map(x=>({...existing.get(x.id),...x}))};merge('halls',d.stores);merge('warehouses',d.warehouses);merge('employees',d.staff);merge('customers',d.parties.filter(x=>partyInRole(x,'customer')));merge('suppliers',d.parties.filter(x=>partyInRole(x,'supplier')));merge('payment-methods',d.payments);merge('fund-accounts',d.fundAccounts.map(x=>({...x,primary_payment_method_id:x.primaryPaymentMethodId||x.methodIds?.[0]||''})));const existing=new Map(hallConfig.stores.map(x=>[x.id,x]));hallConfig.stores=d.stores.map(x=>({...existing.get(x.id),...x,warehouseIds:d.warehouses.filter(w=>(w.hallRelations||[]).includes(x.id)).map(w=>w.id)}));S.catalog.accounts=Object.fromEntries([['local-admin',{storeIds:d.stores.map(x=>x.id)}],...d.staff.map(x=>[x.id,{storeIds:x.role==='营业员'?[x.storeId].filter(Boolean):d.stores.map(s=>s.id),staffId:x.role==='营业员'?x.id:null}])]);S.session=context();}
async function stock(references){
 const selected=[...new Map(references.map(reference=>{const p=C.businessProduct?.(reference);return p?[p.uuid,C.by(p.uuid)]:[reference,null];}).filter(([,p])=>p)).values()];
 const codes=[...new Set(selected.map(p=>sourceCode(p)))];
 for(let i=0;i<codes.length;i+=100){
  const batch=codes.slice(i,i+100),rows=await api('/runtime/product-stock?products='+encodeURIComponent(JSON.stringify(batch)));
  bridge.stockRowsByCode??=new Map();for(const code of batch)bridge.stockRowsByCode.set(code,rows.filter(row=>row.product_code===code));
  const products=new Map(selected.filter(p=>batch.includes(sourceCode(p))).map(p=>[p.uuid,p]));
  for(const p of products.values()){
   projectProductStock(p,rows.filter(row=>row.product_id===p.uuid),D.warehouses);
   p.historicalUnmappedSkus=(bridge.unmappedCatalogByCode?.get(p.uuid)||[]).map(item=>({...item,warehouses:[]}));
   p.historicalSourceSkus=[...(bridge.rawSkuById?.values()||[])].filter(s=>s.product_id===p.uuid).map(s=>historicalSku(s,p,s.id));
  }
  for(const row of rows){
   const loc=bridge.skus.get(row.variant_id),raw=bridge.rawSkuById?.get(row.variant_id),p=products.get(row.product_id||raw?.product_id);
   if(!p)continue;
   const quantity=row.quantity,unit=row.unit,sourceHistorical=p.historicalSourceSkus.find(item=>item.skuId===row.variant_id);
   if(sourceHistorical)sourceHistorical.warehouses.push({warehouseId:row.warehouse_id,unit,quantity});
   if(loc&&loc.p===p&&loc.c>=0&&loc.s>=0)continue;
   let historical=p.historicalUnmappedSkus.find(item=>item.skuId===row.variant_id);
   if(!historical){historical=historicalSku(raw,p,row.variant_id);p.historicalUnmappedSkus.push(historical)}
   historical.warehouses.push({warehouseId:row.warehouse_id,unit,quantity});
  }
  for(const p of products.values()){bridge.stockLoaded.add(p.uuid);bridge.stockLoaded.add(p.id);}
 }
}

function historicalSku(raw,p,skuId){
 const barcodes=(bridge.rawBarcodeBySku?.get(skuId)||[]).map(b=>b.barcode);
 return {skuId,color:raw?.options?.COLOR?.sourceName||raw?.options?.COLOR?.name||'',size:raw?.options?.SIZE?.sourceName||raw?.options?.SIZE?.name||'',fit:raw?.fit_id||p.sourceFit?.name||'',barcodes,warehouses:[]};
}
bridge.ensureProductImages=async p=>{const scope=productScope(),partial={products:[{id:p.uuid,code:sourceCode(p),attributes:{images:p.images||[]}}],profiles:[]};await hydrateProductCatalog(partial,{request:api},[sourceCode(p)]);if(scope!==productScope())throw new ERP_API.ServiceError('登录身份已变化，请重新读取图片',{code:'AUTH',stale:true});p.images=partial.products[0].attributes.images;return p.images};
bridge.stock=stock;bridge.transferStock=stock;const openProduct=PRODUCT_UI.openReadOnly,openProductDrawer=PRODUCT_UI.openDrawer;
PRODUCT_UI.openReadOnly=async(...args)=>{const generation=sessionGeneration;
 const known=C.businessProduct?.(args[0]),result=await bridge.productReader.ensureDetails(requestedProduct(known?.uuid||args[0]));
 if(result.products.length!==1)throw Error('请选择具有明确身份的商品');args[0]=result.products[0].uuid;
 await window.ERP_PAGE_COMPONENTS.load('product');if(generation!==sessionGeneration||!M.current())return;await stock([result.products[0].uuid]);if(generation===sessionGeneration&&M.current())return openProduct(...args);};
PRODUCT_UI.openDrawer=async(...args)=>{const generation=sessionGeneration;
 const supplied=args[0],result=await bridge.productReader.ensureDetails(requestedProduct(supplied?.uuid||supplied?.id||supplied));
 if(result.products.length!==1)throw Error('请选择具有明确身份的商品');args[0]=result.products[0];
 await window.ERP_PAGE_COMPONENTS.load('product');if(generation===sessionGeneration&&M.current())return openProductDrawer(...args);};
const historyActor=row=>({id:row.actor_id||'',name:row.actor_name||M.data.staff.find(employee=>employee.id===row.actor_id)?.name||(row.actor_id==='local-admin'?'管理员':row.actor_id||'未知')});
function doc(row,cache=true){if(row.document_type==='TRANSFER'&&isBoundReadonlyTransfer(row))return readHistoricalTransfer(row);const h=row.body.header,a=h.source_payload||{},runtime={_detail:Array.isArray(row.history),readonly:row.legacy_readonly===true,associationProtected:row.association_protected===true,source:'REAL_TPLUS_RUNTIME',uuid:row.id,revision:row.version,version:row.version,currentRevision:row.current_revision,status:row.status==='DELETED'?'已作废':row.status==='APPROVED'?'已审核':'未审核',auditWorkflow:row.legacy_readonly!==true&&row.read_projection?.auditAllowed!==false,readProjection:copy(row.read_projection||null),baselineWasIncluded:row.baseline_was_included,currentEffectActive:row.current_effect_active,_runtime:copy(row),created:row.baseline_was_included||row.document_type==='SALE'&&row.source_imported?h.created_at||null:row.created_at,updated:row.document_type==='TRANSFER'&&row.baseline_was_included&&row.version===1?h.updated_at||null:row.updated_at,history:(row.history||[]).map(x=>({action:({import:'历史导入',create:'新建',save:'保存',approve:'审核',unapprove:'弃审',delete:'作废'})[x.operation],version:x.version,revision:x.revision,time:x.created_at,user:historyActor(x).name,detail:'V2修订 '+x.revision})),creator:row.creator||null};
 const hall=canonicalHall(h.hall_id||refs.halls.find(x=>x.department_id===h.source_department_id)?.id);
 const header={...h,business_date:row.document_type==='TRANSFER'?String(h.business_date||row.business_day||'').slice(0,10):h.business_date,line_count:row.body.lines.length,party_name:by('customers',h.source_party_id)?.name,warehouse_name:by('warehouses',h.source_warehouse_id)?.name,from_warehouse_name:by('warehouses',h.source_from_warehouse_id)?.name,to_warehouse_name:by('warehouses',h.source_to_warehouse_id)?.name,employee_name:by('employees',h.source_employee_id)?.name,hall_id:hall,hall_name:by('halls',hall)?.name,source_number:row.number,target_document_id:row.id,source_payload:a};
 const lines=row.body.lines.map(l=>({...l,target_document_id:row.id}));
 let d;if(row.document_type==='SALE'){
  d=Adapter.sale(header,lines,row.body.fundsRecords.map(f=>({...f,target_document_id:row.id})));Object.assign(d,runtime,{businessType:h.business_type==='RETURN_EXCHANGE'||!h.business_type&&lines.some(l=>Number(l.source_quantity)<0)?'退货/换货':'销售',date:h.business_date||a.date,returnLines:[],returnWarehouseId:h.return_warehouse_id||lines.find(l=>Number(l.source_quantity)<0)?.warehouse_id||h.source_warehouse_id,returnWarehouseName:by('warehouses',h.return_warehouse_id||lines.find(l=>Number(l.source_quantity)<0)?.warehouse_id)?.name||'',defaults:{},settlementCustomerId:h.source_party_id,adjustmentCents:Math.round(Number(h.adjustment??a.rounding??0)*100),note:h.note??a.note??''});
  d.lines=d.lines.map((l,i)=>{const loc=bridge.skus.get(l.skuId),skuProductId=bridge.rawSkuById?.get(l.skuId)?.product_id,source=loc?.p||(skuProductId?D.products.find(p=>p.uuid===skuProductId):null)||(l.productUuid?D.products.find(p=>p.uuid===l.productUuid):null),product=source&&C.businessProduct(source.uuid+((loc?.fitId||source.fitId)===(source.baseFitId||source.fitId)?'':'::fit:'+(loc?.fitId||source.fitId))),facts=lines[i].source_payload||{};return {...l,warehouseId:lines[i].warehouse_id,originalLineId:lines[i].original_line_id||lines[i].linked_line_id||lines[i].originalLineId||lines[i].source_lineage?.originalLine||null,productId:product?.id||source?.id||l.productId,sourceSize:l.size,size:product?.legacySizeRecords.find(s=>s.id===l.sizeId)?.name||l.size,fitId:product?.fitId||'',fit:product?.fit||'',unit:'',priceCents:l.priceCents??Number(lines[i].unit_price)*100,referenceCents:Number.isSafeInteger(facts.v2_reference_price_cents)?facts.v2_reference_price_cents:null,pricingRule:facts.v2_pricing_rule||'unit-price',discountTenths:facts.v2_discount_tenths??null,previousPrice:facts.v2_previous_price_cents??null,note:facts.v2_line_note||'',gift:!!lines[i].gift,zeroConfirmed:true,netCents:l.amountCents,categorySnapshot:SALES_SUMMARY.categorySnapshot(product,C)}});
 }else{d=Adapter.transfer(header,lines,D.products.flatMap(p=>C.businessVariants?.(p)||[p]));Object.assign(d,runtime,{saved:true,creator:runtime.creator?.name||'',creatorId:runtime.creator?.id||null,auditor:null,scans:[],hiddenColors:[]});}
 d.history=(row.history||[]).map(x=>({action:({import:'历史导入',create:'新建',save:'保存',approve:'审核',unapprove:'弃审',delete:'作废'})[x.operation],version:x.version,revisionBefore:x.version-1,revisionAfter:x.version,time:x.created_at,actor:historyActor(x),user:historyActor(x).name,reason:'V2修订 '+x.revision,result:'已提交',detail:'V2修订 '+x.revision,changes:x.previous_body&&x.body?['header','lines','fundsRecords'].filter(k=>JSON.stringify(x.previous_body[k])!==JSON.stringify(x.body[k])).map(k=>({field:k,label:({header:'单据资料',lines:'商品明细',fundsRecords:'支付明细'})[k],before:JSON.stringify(x.previous_body[k]),after:JSON.stringify(x.body[k])})):[],after:x.body?doc({...row,body:x.body,business_day:row.document_type==='TRANSFER'?x.body.header?.business_date??null:row.business_day,history:[],version:x.version,current_revision:x.revision,status:x.operation==='delete'?'DELETED':x.operation==='approve'?'APPROVED':'UNAUDITED'},false):null}));if(cache){const old=bridge.docs.get(d.id);if(!d._detail&&old?._detail&&old.version===d.version)return old;bridge.docs.set(d.id,d);}return d;
}
async function getDoc(id,type){const owner=sessionScope(),target=bridge.docs.get(id),isSale=type==='SALE'||target?._runtime?.document_type==='SALE'||!type&&!target&&location.hash.startsWith('#sales');const documentId=isSale?await resolveSaleDocumentId(target?.uuid||id,api):target?.uuid||id;const row=await api((isSale?'/sales/document/':'/runtime/document/')+encodeURIComponent(documentId));if(owner!==sessionScope())throw Object.assign(Error('单据读取范围已变化，请重试'),{stale:true});if(!isSale&&isBoundReadonlyTransfer(row))return readHistoricalTransfer(row);await ensureDocumentProducts([row]);if(owner!==sessionScope())throw Object.assign(Error('单据读取范围已变化，请重试'),{stale:true});const d=doc(row);const logs=(await api(d._runtime.document_type==='TRANSFER'?'/transfers/work':'/sales/work',{type:'logs',docId:d.uuid||d.id})).items.map(x=>isSale?{...x,docId:d.id}:x);S.work=S.work.filter(x=>x.docId!==d.id).concat(logs);bridge.work??=new Map();bridge.work.set(d.id,logs);d.scans=logs;await stock([...new Set(d.lines.map(x=>x.productId))]);return d;}
S.getDoc=T.getDoc=getDoc;
function runtimeFilters(filters){const result=copy(filters||{});if(result.status){const statuses=Array.isArray(result.status)?result.status:[result.status];result.status=statuses.map(value=>value==='已作废'?'DELETED':value)}return result;}
const listReads={sales:0,transfers:0};
const salesListQuery=()=>{const u=window.SALES_UI?.state||{};return {page:u.page||1,size:u.pageSize||20,filters:runtimeFilters(u.applied)};};
const transferListQuery=()=>{const u=window.TRANSFER_UI?.state||{};return {page:u.listPaging?.page||1,size:u.listPaging?.size||20,filters:runtimeFilters(u.appliedFilter)};};
function beginListRead(kind,readQuery){
 const generation=++listReads[kind],owner=sessionScope(),query=readQuery(),signature=JSON.stringify(query);
 return {query,current:()=>generation===listReads[kind]&&owner===sessionScope()&&signature===JSON.stringify(readQuery())};
}
const staleListResult=()=>({ok:false,stale:true,code:'STALE_QUERY',error:'查询条件已更新，本次旧结果已忽略'});
async function syncSales(){
 const request=beginListRead('sales',salesListQuery),q=request.query;
 try{
  const data=await api('/sales/documents?type=SALE&page='+q.page+'&size='+q.size+'&filters='+encodeURIComponent(JSON.stringify(q.filters)));
  if(!request.current())return staleListResult();
  await ensureDocumentProducts(data.items);if(!request.current())return staleListResult();
  S.docs=data.items.map(row=>doc(row));S.total=data.total;S.error='';return {ok:true,docs:S.docs,session:context()};
 }catch(e){if(e?.stale||!request.current())return staleListResult();S.error=e.message;return serviceFailure(e);}
}
async function syncTransfers(){
 const request=beginListRead('transfers',transferListQuery),q=request.query;
 try{
  const data=await api('/runtime/documents?type=TRANSFER&page='+q.page+'&size='+q.size+'&filters='+encodeURIComponent(JSON.stringify(q.filters)));
  if(!request.current())return staleListResult();
  const editable=data.items.filter(row=>!isBoundReadonlyTransfer(row));
  await ensureDocumentProducts(editable);if(!request.current())return staleListResult();
  const page=data.items.map(row=>doc(row));bridge.transferPage=page;
  G.documents.splice(0,G.documents.length,...page.filter(d=>!isHistoricalTransfer(d)));T.total=data.total;T.error='';if(window.TRANSFER_UI?.state)window.TRANSFER_UI.state.listError='';
  return {ok:true,docs:page,session:context()};
 }catch(e){
  if(e?.stale||!request.current())return staleListResult();
  const failure=serviceFailure(e);G.documents.splice(0);bridge.transferPage=[];T.total=0;T.error=failure.error;if(window.TRANSFER_UI?.state)window.TRANSFER_UI.state.listError=failure.error;
  return failure;
 }
}
function bodyFrom(d,type){if(isHistoricalTransfer(d))throw Error('历史只读资料不能提交业务修改');if(type==='SALE')return buildSaleBody(d,id=>C.businessProduct?.(id)||D.products.find(x=>x.id===id),sourceCode);const source=copy(d._runtime?.body||{header:{},lines:[],fundsRecords:[]}),selectedCreator=type==='TRANSFER'?d.creatorId?{id:d.creatorId,name:d.creator}:null:d.creator,header={...source.header,source_payload:{...(source.header.source_payload||{}),...(selectedCreator?{v2_creator:selectedCreator}:{}),...(type==='TRANSFER'&&/^草稿-[a-f0-9]{8}$/.test(d.id)?{v2_draft_key:d.id}:{})},business_date:d.date,source_number:d.id,source_warehouse_id:d.warehouseId,source_from_warehouse_id:d.from,source_to_warehouse_id:d.to,source_party_id:d.customerId,source_employee_id:d.salespersonId,hall_id:d.storeId,note:d.note,adjustment:centsText(d.adjustmentCents??0)};
 let lines;
 if(type==='SALE')lines=d.lines.map(l=>{const p=C.businessProduct?.(l.productId)||D.products.find(x=>x.id===l.productId),old=source.lines.find(x=>x.source_id===l.id),unchanged=old&&Number(old.source_quantity)===l.quantity&&Number(old.unit_price)*100===l.priceCents;if(!p||(p.fitId||'')!==(l.fitId||'')||!p.skuByCell[l.colorId+'|'+l.sizeId])throw Error('商品、颜色、版型和尺码未对应有效 SKU');return {...old,source_id:l.id,gift:!!l.gift,sku_id:p.skuByCell[l.colorId+'|'+l.sizeId],product_id:p.uuid,color_id:l.colorId,size_id:l.sizeId,source_product_code:sourceCode(p),source_product_name:p.name,source_color_name:l.color,source_size_name:l.size,source_quantity:String(l.quantity),unit_price:String(l.priceCents/100),amount:unchanged?old.amount:String(l.quantity*l.priceCents/100),warehouse_id:d.warehouseId,unit:old?.unit||'',source_payload:{...(old?.source_payload||{}),v2_reference_price_cents:Number.isSafeInteger(l.referenceCents)?l.referenceCents:null,v2_pricing_rule:l.pricingRule||'unit-price',v2_discount_tenths:l.discountTenths??null,v2_previous_price_cents:l.previousPrice??null,v2_line_note:l.note||''},source_lineage:old?.source_lineage||{kind:'V2_RUNTIME'}};});
 else lines=transferLines(d,code=>C.businessProduct?.(code)||D.products.find(x=>x.id===code));
 const fundsRecords=type==='SALE'?(d.fundsRecords||[]).map(f=>{const previous=(source.fundsRecords||[]).find(x=>x.source_id===f.id),sameMethod=previous?.payment_method_id===f.methodId,sameAccount=previous?.fund_account_id===f.accountId;return {source_id:f.id||crypto.randomUUID(),settlement_id:f.settlementId||f.id||null,payment_method_id:f.methodId,fund_account_id:f.accountId,source_payment_method_name:sameMethod?(previous.source_payment_method_name||f.methodName):by('payment-methods',f.methodId)?.name||f.methodName,source_fund_account_name:sameAccount?(previous.source_fund_account_name||f.accountName):by('fund-accounts',f.accountId)?.name||f.accountName,amount:String(f.amountCents/100),direction:f.amountCents>0?'receipt':f.amountCents<0?'refund':'zero',source_payload:f.sourceFacts||{},reference:f.reference||null}}):[];
 return {header,lines,fundsRecords};}
// Pending command bodies are isolated by origin and actor; never reuse the old shared key.
const actorPending=new Map(),pendingKey=()=>window.ERP_USER_STATE?.key('document-pending')||'';
function pendingCommands(){const owner=pendingKey();if(!actorPending.has(owner)){const rows=window.ERP_USER_STATE?.readDraft('document-pending')||[];actorPending.set(owner,new Map(Array.isArray(rows)?rows:[]))}return actorPending.get(owner)}
function persistPending(){window.ERP_USER_STATE?.saveDraft('document-pending',[...pendingCommands()]);}
window.addEventListener('erp-user-cleared',()=>actorPending.clear());
const serviceFailure=e=>ERP_API.errorResult(e);
async function ensureTransferSpecs(d){
 const missing=new Map();
 for(const [key,quantity] of Object.entries(d.q||{})){
  if(Number(quantity)<=0)continue;
  const [code,c,s]=key.split('|'),p=C.businessProduct?.(code)||D.products.find(x=>x.id===code),colorId=p?.colorIds[Number(c)],sizeId=p?.sizeIds[Number(s)];
  if(!p||!colorId||!sizeId)throw Error('明细规格已失效，请重新选择商品');
  if(p.skuByCell[colorId+'|'+sizeId])continue;
  missing.set(code+'|'+c+'|'+s,{p,c:Number(c),s:Number(s),colorId,sizeId});
 }
 for(const {p,c,s,colorId,sizeId} of missing.values()){
  const record=p.legacySizeRecords[s]||{},result=await api('/runtime/specs/ensure',{
   productId:p.uuid,colorId,sizeId:/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(sizeId)?sizeId:null,
   sizeName:p.sizes[s],sizeCode:record.code||'',fitId:p.fitId||'',groupName:record.standardGroup||p.legacyGroupName||'历史／独立尺码',
  });
  p.sizeIds[s]=result.sizeId;if(p.legacySizeRecords[s])p.legacySizeRecords[s].id=result.sizeId;
  const cell=colorId+'|'+result.sizeId;p.skuByCell[cell]=result.skuId;p.skuByFitCell??={};p.skuByFitCell[colorId+'|'+(p.fitId||'')+'|'+result.sizeId]=result.skuId;
  p.barcodes[cell]={current:'',history:[],skuId:result.skuId,readonly:true};
  for(const warehouse of Object.values(p.stock||{}))if(warehouse[c])warehouse[c][s]??=null;
  bridge.skus.set(result.skuId,{p,c,s,fitId:result.fitId||p.fitId});
 }
}
async function ensureSaleSpecs(d){for(const l of d.lines||[]){const p=C.businessProduct?.(l.productId)||D.products.find(x=>x.id===l.productId),c=p?.colorIds.indexOf(l.colorId),s=p?.sizeIds.indexOf(l.sizeId);if(!p||c<0||s<0)throw Error('明细规格已失效，请重新选择商品');const oldSizeId=l.sizeId;await ensureTransferSpecs({q:{[p.id+'|'+c+'|'+s]:Math.abs(l.quantity)}});for(const row of d.lines)if(row.productId===p.id&&row.sizeId===oldSizeId)row.sizeId=p.sizeIds[s];}}
async function write(c,type){
 if(type==='SALE'&&c.type==='return')return {ok:false,code:'HISTORICAL_ONLY',error:'历史原单退换入口只读；请新增独立销货单'};
 let entry,key=c.requestId||crypto.randomUUID();
 try{
  const d=c.draft||bridge.docs.get(c.docId);if(!d)throw Error('单据尚未加载');if(isHistoricalTransfer(d))throw Error('历史只读资料不能提交业务修改');
  const operation=({memo:'save',save:'save',audit:'approve',unaudit:'unapprove',reverse:'unapprove',delete:'delete'})[c.kind];if(!operation)throw Error('当前操作尚未接通');
  entry=pendingCommands().get(key);
  if(entry)return {ok:false,code:'PENDING_VERIFICATION',error:'原请求结果待核实，请查询原请求，勿重复提交',requestId:entry.activeRequestId||key};
  if(c.kind!=='memo'&&(operation==='save'||!d.revision||operation==='approve'&&type==='TRANSFER')){
   const creator=type==='TRANSFER'?{id:d.creatorId,name:d.creator}:d.creator;if(!creator?.id)throw Error('请选择创建者');
   const allowed=context().creatorCandidates.some(x=>x.id===creator.id)||d._runtime?.body?.header?.source_payload?.v2_creator?.id===creator.id;if(!allowed)throw Error('创建者不在可选人员中');
  }
  if(type==='TRANSFER'&&(operation==='save'||!d.revision||operation==='approve'))await ensureTransferSpecs(d);
  if(type==='SALE'&&c.kind!=='memo'&&(operation==='save'||!d.revision))await ensureSaleSpecs(d);
  const req={documentId:d.uuid||crypto.randomUUID(),documentType:type,operation:d.revision?operation:'create',expectedVersion:c.baseRevision||0,requestKey:key,...((operation==='save'||!d.revision||operation==='approve'&&type==='TRANSFER')?{body:c.kind==='memo'?{...copy(d._runtime.body),header:{...copy(d._runtime.body.header),note:d.note}}:bodyFrom(d,type)}:{})};
  entry={req,type,uiDocId:d.id,activeRequestId:key};pendingCommands().set(key,entry);persistPending();
  const result=await api('/runtime/command',req,{readback:true});
  if(operation==='approve'&&req.operation==='create'){
   entry.created=true;ERP_API.complete(key);entry.activeRequestId=key+':approve';persistPending();
   await api('/runtime/command',{documentId:req.documentId,documentType:type,operation:'approve',expectedVersion:result.document.version,requestKey:entry.activeRequestId},{readback:true});
  }
  const next=await getDoc(req.documentId,type);bridge.totalsReady=false;
  if(type==='SALE'){bridge.invalidateRecommendations(d.storeId);if(next.storeId!==d.storeId)bridge.invalidateRecommendations(next.storeId)}
  await M.refreshWarehouseStocks?.();
  ERP_API.complete(entry.activeRequestId);pendingCommands().delete(key);persistPending();
  const lease=type==='TRANSFER'?await api('/transfers/work',{type:'acquire',docId:next.uuid,newToken:c.token||crypto.randomUUID()}):{lease:{token:c.token||crypto.randomUUID(),expires:Date.now()+3600000}};
  return {ok:true,doc:next,lease:lease.lease};
 }catch(e){
  if(entry){
   let unresolved=ERP_API.pending().some(row=>row.requestId===entry.activeRequestId);
   if(!unresolved&&entry.created){entry.activeRequestId=key;ERP_API.track({requestId:key,operationId:(type==='TRANSFER'?'transfers.':'sales.')+'create',actorId:M.current()?.id||'',objectId:entry.req.documentId,documentId:entry.req.documentId,phase:'READBACK_PENDING'});persistPending();unresolved=true}
   if(unresolved)return {...serviceFailure(e),code:'PENDING_VERIFICATION',error:'提交结果待核实，输入已保留；请查询原请求',requestId:entry.activeRequestId};
   pendingCommands().delete(key);persistPending();
  }
  return serviceFailure(e);
 }
}
bridge.recoverRequest=async requestId=>{
 const pair=[...pendingCommands()].find(([,entry])=>entry.activeRequestId===requestId);
 const metadata=ERP_API.pending().find(row=>row.requestId===requestId);const resolution=await ERP_API.result(requestId);
 if(resolution.resolution==='ROLLED_BACK'){
  if(pair){pendingCommands().delete(pair[0]);persistPending()}
  return {ok:false,code:'ROLLED_BACK',error:'原请求已明确回滚，输入已保留，可核对后重新提交',requestId,rootRequestId:pair?.[0]};
 }
 if(resolution.resolution!=='COMMITTED')return {ok:false,code:'PENDING_VERIFICATION',error:'原请求仍待核实，请稍后查询；请勿重复录入',requestId};
 const documentId=resolution.documentId||pair?.[1].req.documentId;
 const next=documentId?await getDoc(documentId,pair?.[1].type||(metadata?.operationId?.startsWith('sales.')?'SALE':undefined)):null;if(next)bridge.totalsReady=false;
 if(!pair&&metadata?.operationId==='masters.save'&&resolution.originalResponse?.id){
  await M.refreshMasters?.();const saved=resolution.originalResponse,type=({halls:'stores',warehouses:'warehouses',parties:'parties',payments:'payments',fundAccounts:'fundAccounts'})[saved.kind],record=type&&M.data[type].find(x=>x.id===saved.id);
  if(!record||record.version!==saved.version)throw new ERP_API.ServiceError('基础资料结果已提交，但回读版本不一致；请刷新后复核',{code:'PENDING_VERIFICATION',requestId,operationId:'masters.save'});
  ERP_API.complete(requestId);return {ok:true,record,requestId};
 }
 if(!pair&&metadata?.operationId==='products.save'){bridge.productReader.invalidate('product-save-readback');const result=await bridge.productReader.ensureDetails(requestedProduct(resolution.originalResponse?.productId||metadata.objectId));if(result.products.length!==1||result.unresolved.length)throw new ERP_API.ServiceError('商品已提交但指定身份未能回读，请重试',{code:'PENDING_VERIFICATION',requestId});bridge.productSignature=null;}
 if(!pair&&metadata?.operationId==='employees.save')await M.serverAuth.employees();
 if(next?.storeId)bridge.invalidateRecommendations(next.storeId);
 if(next)await M.refreshWarehouseStocks?.();
 ERP_API.complete(requestId);
 if(pair){pendingCommands().delete(pair[0]);persistPending()}
 return {ok:true,doc:next,requestId,rootRequestId:pair?.[0],uiDocId:pair?.[1].uiDocId};
};
async function bootstrap(generation){C.groups=currentSizeGroups();for(const [id,parts] of [['2020',[['goods',7],['color',3],['size',3]]],['2021fit',[['goods',7],['fit',1],['color',3],['size',2]]]]){const scheme=C.schemes.find(x=>x.id===id);scheme.parts=parts.map(([key,length])=>({key,length}));}await M.ready;if(generation!==sessionGeneration||!M.current())throw new ERP_API.ServiceError('登录身份已变化',{code:'AUTH',stale:true});
 await loadReferences(['units','categories','warehouses','halls','employees','suppliers','colors']);
 const employeeRows=refs.employees;
 const masterCatalog=null;hallConfig=await api('/runtime/hall-config');
 const masterOverlays=await api('/runtime/product-masters');
 const catalog={products:[],skus:[],barcodes:[],sourceBarcodes:[],aliases:[],profiles:[]},products=[],identities={version:1,products:[],skus:[],productCodes:[]};
 if(generation!==sessionGeneration||!M.current())throw new ERP_API.ServiceError('登录身份已变化',{code:'AUTH',stale:true});
 const skusBy=new Map(),productByUuid=new Map();
 D.products.splice(0);D.warehouses.splice(0,D.warehouses.length,...refs.warehouses);C.categories.splice(0,C.categories.length,{id:'all',name:'全部分类',parent:null},...refs.categories.map(Adapter.category));C.standardCategory=p=>C.categories.find(c=>c.standard&&c.id===p?.categoryId);C.salesCategory=p=>{const c=C.standardCategory(p);return c?{id:c.id,name:c.name,fullName:C.path(c.id)}:{id:'__pending',name:'待确认分类'};};C.units=refs.units||[];C.colors.splice(0,C.colors.length,...refs.colors);C.suppliers.splice(0,C.suppliers.length,...refs.suppliers);C.fits2026=Adapter.FITS.map(x=>({...x}));C.fits.splice(0,C.fits.length,...C.fits2026);C.fit=id=>C.fits.find(x=>x.id===id);
 bridge.masterVersions=new Map();
 function applyMaster(row){bridge.masterVersions.set(row.kind+'|'+row.id,row.version);const collection=row.kind==='categories'?C.categories:row.kind==='colors'?C.colors:row.kind==='groups'?C.groups:row.kind==='fits'?C.fits2026:C.seasons;let item=collection.find(x=>x.id===row.id);if(row.deleted){if(item)collection.splice(collection.indexOf(item),1);if(row.kind==='fits'){const fit=C.fits.find(x=>x.id===row.id);if(fit)C.fits.splice(C.fits.indexOf(fit),1)}return}if(item)Object.assign(item,row.body);else{item={id:row.id,...row.body};collection.push(item)}if(row.kind==='fits'&&!C.fits.includes(item)){const other=C.fits.find(x=>x.id===row.id);if(other)Object.assign(other,item);else C.fits.push(item)}if(row.kind==='colors')for(const p of D.products)p.colors=p.colorIds.map((id,i)=>C.color(id)?.name||p.colors[i]||id)}
 for(const overlay of masterOverlays)applyMaster(overlay);
 for(const product of products)currentSpecView(product,skusBy.get(product.uuid)||[],C);
 bridge.changeProductMaster=async(kind,id,action,body)=>{const key=kind+'|'+id,result=await api('/runtime/product-master',{kind,id,action,body,expectedVersion:bridge.masterVersions.get(key)||0,...(action==='order'?{versions:Object.fromEntries((body.ids||[]).map(id=>[id,bridge.masterVersions.get(kind+'|'+id)||0]))}:{})},{mode:action==='check-delete'?'query':undefined});for(const row of result.items||[result])applyMaster(row);bridge.productReader.invalidate('product-master-change');bridge.productSignature=null;return result};
 bridge.checkProductMaster=(kind,id)=>api('/runtime/product-master',{kind,id,action:'check-delete',expectedVersion:bridge.masterVersions.get(kind+'|'+id)||0},{mode:'query'});
 D.matrix=(p,ids)=>p.colorIds.map((_,c)=>p.sizeIds.map((_,s)=>{const xs=ids.map(w=>p.stock[w]?.[c]?.[s]);return xs.every(Number.isFinite)?xs.reduce((a,b)=>a+b,0):null}));D.total=(p,ids)=>{if(!ids)return p.stockTotal;if(p.stockByWarehouse&&ids.every(id=>Number.isFinite(p.stockByWarehouse[id])))return ids.reduce((n,id)=>n+p.stockByWarehouse[id],0);const xs=D.matrix(p,ids).flat();return xs.every(Number.isFinite)?xs.reduce((a,b)=>a+b,0):null;};D.negativeCells=(p,ids)=>ids.reduce((n,w)=>n+(p.stock[w]||[]).flat().filter(v=>v<0).length,0);
 bridge.rawSkuById=new Map(catalog.skus.map(s=>[s.id,s]));
 bridge.rawBarcodeBySku=new Map();
 for(const barcode of catalog.barcodes||[])if(barcode.sku_id){const list=bridge.rawBarcodeBySku.get(barcode.sku_id)||[];list.push(barcode);bridge.rawBarcodeBySku.set(barcode.sku_id,list)}
 bridge.skus=new Map();const indexProductSkus=p=>{for(const [key,id] of Object.entries(p.skuByFitCell||{})){const [c,fitId,s]=key.split('|');bridge.skus.set(id,{p,c:p.colorIds.indexOf(c),s:p.sizeIds.indexOf(s),fitId})}};for(const p of products)indexProductSkus(p);
 const fitViews=new Map();
 const sourceProduct=id=>{const exact=D.products.find(p=>p.uuid===id);if(exact)return exact;const matching=D.products.filter(p=>p.id===id);return matching.length===1?matching[0]:null;};
 const businessView=(p,fit)=>{
  if(!p)return null;
  const key=p.uuid+'|'+fit,cached=fitViews.get(key);
  if(cached&&cached.bindings===p.barcodes&&cached.stock===p.stock)return cached.view;
  const adapted=fitView(p,fit,C,(bridge.stockRowsByCode?.get(p.id)||[]).filter(row=>row.product_id===p.uuid),D.warehouses);
  if(!adapted)return null;
  const suffix=fit===(p.baseFitId||p.fitId)?'':'::fit:'+fit;
  const view={...adapted,id:p.uuid+suffix,sourceProductId:p.id,displayId:p.displayId||p.id,styleNumber:p.styleNumber||p.id,explicitStyleNumber:p.sourceFacts?.attributes?.colorSplit?.baseCode||p.sourceFacts?.attributes?.styleNumber||null};
  fitViews.set(key,{bindings:p.barcodes,stock:p.stock,view});return view;
 };
 C.by=sourceProduct;
 C.businessProduct=id=>{const direct=sourceProduct(id);if(direct)return businessView(direct,direct.baseFitId||direct.fitId);const at=String(id).lastIndexOf('::fit:');return at<0?null:businessView(sourceProduct(id.slice(0,at)),id.slice(at+6));};
 bridge.productReference=p=>p.uuid+(p.fitId&&p.fitId!==(p.baseFitId||p.fitId)?'::fit:'+p.fitId:'');
 C.businessVariants=p=>{const source=sourceProduct(p.uuid||p.sourceProductId||p.id);if(!source)return [];const fits=[...new Set(Object.keys(source.skuByFitCell||{}).map(key=>key.split('|')[1]))];return fits.map(fit=>businessView(source,fit)).filter(Boolean);};

 const identityLookup=(code,fit,id)=>businessView(sourceProduct(id||code),fit);
 PRODUCT_IDENTITY.install(identities,identityLookup);
 bridge.consumeProductDetails=async(raw,identity,guard)=>{
  // Detail metadata never fetches image bodies during document or picker reads.
  const data=copy(raw);
  if(!guard.isCurrent())throw new ERP_API.ServiceError('登录身份或商品资料已变化',{code:'AUTH',stale:true});
  const ids=new Set(data.products.map(p=>p.id)),next=[];
  for(const [id,sku] of bridge.rawSkuById)if(ids.has(sku.product_id)){bridge.rawSkuById.delete(id);bridge.rawBarcodeBySku.delete(id);bridge.skus.delete(id);}
  for(const sku of data.skus)bridge.rawSkuById.set(sku.id,sku);
  for(const barcode of data.barcodes)if(barcode.sku_id){const rows=bridge.rawBarcodeBySku.get(barcode.sku_id)||[];rows.push(barcode);bridge.rawBarcodeBySku.set(barcode.sku_id,rows);}
  for(const row of data.products){
   const p=adaptedCatalogProduct(data,row.code,row.id);
   p._detailsLoaded=true;p.stockTotal=null;p.stockByWarehouse=Object.fromEntries(D.warehouses.map(w=>[w.id,null]));
   p.stock=Object.fromEntries(D.warehouses.map(w=>[w.id,p.colorIds.map(()=>p.sizeIds.map(()=>null))]));
   const prior=D.products.find(x=>x.uuid===p.uuid),saved=prior?Object.assign(prior,p):p;if(!prior)D.products.push(saved);
   indexProductSkus(saved);bridge.stockLoaded.delete(saved.id);bridge.stockLoaded.delete(saved.uuid);next.push(saved);
   const unmapped=data.skus.filter(s=>s.product_id===row.id&&!bridge.skus.has(s.id)).map(s=>historicalSku(s,saved,s.id));bridge.unmappedCatalogByCode.set(saved.uuid,unmapped);
  }
  PRODUCT_IDENTITY.merge(identity,identityLookup);bridge.catalogVersion=bridge.productReader.catalogVersion;
  return next;
 };
 C.resolve=raw=>PRODUCT_IDENTITY.resolve(raw);
 bridge.resolveIdentity=raw=>PRODUCT_IDENTITY.resolveFresh(raw);
 bridge.unmappedCatalogByCode=new Map();
 for(const raw of catalog.skus)if(!bridge.skus.has(raw.id)){const p=productByUuid.get(raw.product_id);if(!p)continue;const list=bridge.unmappedCatalogByCode.get(p.uuid)||[];list.push(historicalSku(raw,p,raw.id));bridge.unmappedCatalogByCode.set(p.uuid,list)}
 // Inventory summaries belong to their page, never to the login prerequisite.
 const kindFor={stores:'halls',warehouses:'warehouses',parties:'parties',payments:'payments',fundAccounts:'fundAccounts'};
 const fieldsFor={halls:['code','name','enabled','defaultCustomerId','defaultWarehouseId'],warehouses:['code','name','enabled','hallRelations','sourceOwnershipUnknown','type','sourceFacts'],parties:['code','name','enabled','usage','tags','sourceFacts'],payments:['code','name','enabled'],fundAccounts:['code','name','enabled','primaryPaymentMethodId','type','bank','accountNumber','department','sourceFacts']};
 const bodyFor=(type,record)=>Object.fromEntries(fieldsFor[kindFor[type]].filter(key=>Object.hasOwn(record,key)&&(key!=='sourceFacts'||record._bodySourceFactsPresent!==false)).map(key=>[key,copy(record[key])]));
 const recordFor=(row,type)=>{const body=row.body||{},record={...body,id:row.id,version:row.version,sourceFacts:row.sourceFacts||body.sourceFacts||{},_bodySourceFactsPresent:Object.hasOwn(body,'sourceFacts')};if(type==='warehouses'){record.hallRelations=body.hallRelations||[];record.storeId=record.hallRelations.length===1?record.hallRelations[0]:'';record.ownershipPending=body.sourceOwnershipUnknown===true||record.hallRelations.length===0}if(type==='fundAccounts')record.methodIds=body.primaryPaymentMethodId?[body.primaryPaymentMethodId]:[];return record};
 const signalMasterChange=()=>{try{window.__erpMasterBus?.postMessage({type:'changed',at:Date.now()})}catch{}};
 M.runtimeCommit=async(type,record,{password=''}={})=>{if(!M.canManage(type))return {ok:false,error:'无权维护此资料'};if(type==='staff'){try{const saved=await M.serverAuth.save(record,password);signalMasterChange();return {ok:true,record:saved}}catch(e){return serviceFailure(e)}}if(!kindFor[type])return {ok:false,error:'不支持此资料'};try{const saved=await api('/runtime/masters',{kind:kindFor[type],id:record.id,expectedVersion:Number(record.version)||0,body:bodyFor(type,record)},{objectId:record.id});signalMasterChange();return {ok:true,record:recordFor(saved,type)}}catch(e){return serviceFailure(e)}};
 const baseMaster=masterBase(masterCatalog,employeeRows);
 bridge.masterSignature=JSON.stringify(baseMaster);
 const runtimeMaster=M.attachRuntime(baseMaster);
 M.warehouseStockSummary={};
 M.refreshWarehouseStocks=async()=>{
  const result=await api('/inventory/warehouse-occupancy');
  if(result?.contractVersion!=='WAREHOUSE_OCCUPANCY_V1'||!result.byWarehouse||!Array.isArray(result.items)||result.items.some(row=>!Number.isSafeInteger(row.occupiedCellCount)||row.occupiedCellCount<0||result.byWarehouse[row.warehouseId]!==row.occupiedCellCount))throw new ERP_API.ServiceError('仓库库存汇总不完整，请重试',{code:'PROTOCOL'});
  M.warehouseStockSummary=result.byWarehouse;return M.warehouseStockSummary;
 };
 M.warehouseStock=async id=>(await M.refreshWarehouseStocks())[id]||0;
 M.refreshMasters=async()=>{
  const owner=sessionScope(),route=location.hash.slice(1),catalog=route.startsWith('settings/')&&M.canManage('warehouses')?await api('/runtime/masters'):null;
  if(!catalog){await loadReferences([...referenceLoaded]);hallConfig=await api('/runtime/hall-config');}
  const staffRows=refs.employees;const latest=masterBase(catalog,staffRows);
  if(owner!==sessionScope())throw new ERP_API.ServiceError('登录身份已变化',{code:'AUTH',stale:true});
  const signature=JSON.stringify(latest);if(signature===bridge.masterSignature)return M.data;
  M.attachRuntime(latest);bridge.masterSignature=signature;refreshRuntimeRefs();referenceRevision++;bridge.readonlyTransfers.clear();bridge.transferPage=[];bridge.pageReady.clear();bridge.pageErrors.clear();
  window.dispatchEvent(new CustomEvent('erp-master-data-refreshed'));return M.data;
 };
 M.refreshMasterHistory=async()=>{if(!M.canManage('warehouses'))return [];const rows=await api('/runtime/masters/history');M.data.audit=rows;return rows};
 if(!runtimeObserversInstalled){runtimeObserversInstalled=true;
 const bus=typeof BroadcastChannel==='function'?new BroadcastChannel('erp-master-data-v1'):null;window.__erpMasterBus=bus;
 let refreshing=null,lastRefreshAt=Date.now();const refresh=(force=false)=>{const now=Date.now();if(!M.current()||!bridge.loaded||refreshing||!force&&now-lastRefreshAt<30000)return;lastRefreshAt=now;refreshing=Promise.resolve(M.refreshMasters?.()).catch(()=>{}).finally(()=>{refreshing=null;})},focus=()=>refresh(),visible=()=>{if(!document.hidden)refresh()};
 bus?.addEventListener('message',event=>{if(event.data?.type==='changed')refresh(true)});
 window.addEventListener('focus',focus);document.addEventListener('visibilitychange',visible);const timer=setInterval(()=>{if(!document.hidden)refresh();},30000);
 observerCleanup=()=>{window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',visible);clearInterval(timer);bus?.close();window.__erpMasterBus=null;runtimeObserversInstalled=false;observerCleanup=null};
 }
 M.sync=()=>{baseBindings.sync();refreshRuntimeRefs()};for(const operation of ['save','setStatus']){const original=baseBindings[operation];M[operation]=async(...args)=>{const result=await original(...args);if(result.ok){try{await M.refreshMasters?.()}catch{}refreshRuntimeRefs()}return result}}refreshRuntimeRefs();
 bridge.saveProductProfile=async draft=>{if(!M.canManage('products'))throw Error('无权维护商品资料');const original=C.by(draft.uuid||draft.id),creating=!original;if(original&&!original.uuid)throw Error('商品资料缺少系统标识');const candidate=copy(draft),validationCandidate=creating?{...candidate,colorIds:candidate.selectedColorIds??candidate.colorIds,sizeIds:candidate.selectedSizeIds??candidate.sizeIds,fitIds:candidate.selectedFitIds??candidate.fitIds}:candidate,issue=C.validate(validationCandidate,original);if(issue)throw Error(issue);if(original&&candidate.id!==original.id)throw Error('已有商品款号不能重编');
  const changedSpecs=creating||['selectedColorIds','selectedSizeIds','selectedFitIds','groupId'].some(key=>JSON.stringify(candidate[key])!==JSON.stringify(original[key]));
  const selectedColors=candidate.selectedColorIds??(candidate.sizeSystem==='legacy'?[]:candidate.colorIds),selectedFits=candidate.selectedFitIds??(candidate.sizeSystem==='legacy'?[]:(candidate.fitIds||[candidate.fitId]));
  const selectedSizes=(C.group(candidate.groupId)?.sizes||[]).filter(size=>!size.disabled&&size.enabled!==false);candidate.selectedSizeIds=selectedSizes.map(size=>size.id);
  const missingMain=selectedColors.some(color=>selectedFits.some(fit=>selectedSizes.some(size=>{const skuId=candidate.currentSkuByUiCell?.[color+'|'+fit+'|'+size.id];return !Object.values(candidate.barcodes||{}).some(binding=>binding.skuId===skuId&&binding.current)})));
  if(changedSpecs&&(!selectedColors.length||!selectedFits.length||!selectedSizes.length))throw Error('请先在规格页设置当前颜色、尺码和版型');
  const groupName=C.group(candidate.groupId)?.name||candidate.legacyGroupName||'当前尺码';
  const specs=(changedSpecs||(!candidate.excelBarcodeAuthority?.active&&missingMain&&selectedColors.length&&selectedFits.length&&selectedSizes.length))?{colors:selectedColors,fits:selectedFits,sizes:selectedSizes.map(s=>({id:s.id,name:s.name,code:s.code||'',groupName:s.groupName||s.standardGroup||groupName}))}:undefined;
  const aliases=[];for(const binding of Object.values(candidate.barcodes||{}))for(const a of binding.compatible||[]){if(a.source!=='MANUAL')continue;if(!binding.skuId)throw Error('补录条码必须绑定已存在的 SKU');aliases.push({skuId:binding.skuId,code:a.code,note:a.note||''})}
  const profile=productProfileDraft(candidate);
  const requestKey=crypto.randomUUID(),productId=original?.uuid||crypto.randomUUID();await api('/runtime/product-profile',{requestKey,productId,newCode:creating?candidate.id:undefined,expectedVersion:original?.profileVersion||0,profile,aliases,removedAliases:candidate.removedCompatibleBarcodes||[],specs},{readback:true,objectId:candidate.id});
  try{bridge.productReader.invalidate('product-save');const result=await bridge.productReader.ensureDetails({productIds:[productId]});if(result.products.length!==1||result.unresolved.length)throw Error('指定商品身份回读不完整');const saved=result.products[0];delete saved.removedCompatibleBarcodes;bridge.productSignature=null;ERP_API.complete(requestKey);return saved;}catch(e){throw new ERP_API.ServiceError('商品保存结果待核实，输入已保留；请查询原请求',{code:'PENDING_VERIFICATION',requestId:requestKey,operationId:'products.save'})}
 };
 bridge.deleteProduct=async code=>{const product=C.by(code);if(!product?.uuid)throw Error('商品不存在');await api('/runtime/product-delete',{productId:product.uuid,expectedVersion:product.profileVersion||0});D.products.splice(D.products.indexOf(product),1);bridge.productReader.invalidate('product-delete');bridge.productSignature=null;bridge.totalsReady=false;bridge.stockLoaded.delete(code);return true};
 bridge.checkProductDelete=async code=>{const product=C.by(code);if(!product?.uuid)throw Error('商品不存在');return api('/runtime/product-delete',{productId:product.uuid,expectedVersion:product.profileVersion||0,checkOnly:true},{mode:'query'})};
 C.persist=()=>{};C.specWriteIssue=()=>'';for(const name of ['persistCategories','persistSpecCodes'])C[name]=()=>({ok:true});for(const name of ['initialize','reloadMasterMetadata','applyMasterMetadata','syncDemo2026'])C[name]=()=>{};
 M.context=context;M.actor=context();
 S.catalog={...S.catalog,stores:runtimeMaster.stores,customers:refs.customers,staff:runtimeMaster.staff,payments:runtimeMaster.payments,accounts:S.catalog.accounts};S.session=context();const currentActor=M.current();S.actor=T.actor={id:currentActor.id,name:currentActor.name};S.work=[];S.returns=[];T.key='erp-runtime-v1';G.events.splice(0);G.initial.clear();const count=baseBindings.count;G.count=d=>({...count(d),products:new Set(G.entries(d).map(row=>C.businessProduct?.(row.p)?.uuid||row.p)).size});G.ledger=()=>GOLD_UI.state.remoteLedger?.items||[];for(const name of ['save','audit','reverse'])G[name]=()=>({ok:false,error:'请使用当前单据操作入口'});
 S.sync=syncSales;T.sync=syncTransfers;const work=async c=>{try{return await api('/sales/work',{...c,docId:bridge.docs.get(c.docId)?.uuid||c.docId})}catch(e){return serviceFailure(e)}};S.call=c=>c.type==='snapshot'?syncSales():c.type==='work'?work(c):write(c,'SALE');const transferWork=async c=>{try{const docId=bridge.docs.get(c.docId)?.uuid||c.docId;const r=await api('/transfers/work',{...c,docId});if(r.ok&&c.type==='acquire'&&!String(docId).startsWith('草稿-'))r.doc=await getDoc(docId);return r}catch(e){return serviceFailure(e)}};T.call=c=>c.type==='write'?write(c,'TRANSFER'):c.type==='snapshot'?syncTransfers():transferWork(c);T.recordWork=(docId,token,record)=>transferWork({type:'work',docId,token,record});T.workLogs=docId=>bridge.work?.get(docId)||[];
 const business=baseBindings.business;SALES_CORE.business=d=>({...business(d),fundsRecords:d.fundsRecords||[]});SALES_CORE.unitText=u=>String(Object.values(u).reduce((n,x)=>n+Number(x),0));
 const totals=baseBindings.totals;SALES_CORE.totals=d=>{const r=totals(d);r.styles=new Set(d.lines.map(l=>C.businessProduct?.(l.productId)?.uuid||l.productId)).size;if(d._runtime){r.gross=d.lines.reduce((n,l)=>{const old=d._runtime.body.lines.find(x=>x.source_id===l.id);return n+(old&&Number(old.source_quantity)===l.quantity&&Number(old.unit_price)*100===l.priceCents?Number(old.amount)*100:l.priceCents*l.quantity)},0);r.total=r.gross-(d.adjustmentCents||0);}return r;};
 SALES_AUDIT.payment=d=>({direction:SALES_AUDIT.amounts(d).direction,amountCents:(d.fundsRecords||[]).reduce((n,f)=>n+f.amountCents,0)});
 const fresh=baseBindings.fresh;SALES_MODEL.fresh=()=>{const d=fresh();delete d.funds;d.fundsRecords=[];return d;};
 GOLD_UI.state.draft={products:[],category:'all',categories:['all'],warehouses:INVENTORY_UI.accessibleWarehouses('normal').map(w=>w.id),more:{},keyword:'',dataset:'normal'};GOLD_UI.state.applied=null;INVENTORY_UI.state.snapshot=null;INVENTORY_UI.state.status='idle';
 bridge.inventoryReady=true;
 let openingRoute;do{openingRoute=location.hash.slice(1)||M.landing();await bridge.ensurePage(openingRoute);}while(openingRoute!==(location.hash.slice(1)||M.landing()));
 if(generation!==sessionGeneration||!M.current())throw new ERP_API.ServiceError('登录身份已变化',{code:'AUTH',stale:true});
 bridge.loaded=true;if(window.SALES_UI?.state)window.SALES_UI.state.ready=true;if(window.TRANSFER_UI?.state)window.TRANSFER_UI.state.ready=true;window.resolveRealData({ok:true,session:context()});window.render();return {ok:true,session:context()};
}
bridge.resetSession=()=>{
 sessionGeneration++;referenceRevision++;referenceLoaded.clear();observerCleanup?.();sessionPromise=null;bridge.sessionOwner='';bridge.loaded=false;bridge.inventoryReady=false;bridge.error='';bridge.pageReady.clear();bridge.pagePending.clear();bridge.pageErrors.clear();bridge.warehouseSummaryReady=false;bridge.catalogVersion='';bridge.masterSignature='';
 bridge.docs.clear();bridge.readonlyTransfers.clear();bridge.transferPage=[];bridge.stockLoaded.clear();recommendationCache.clear();recommendationPending.clear();actorPending.clear();
 for(const key of ['rawSkuById','rawBarcodeBySku','skus','masterVersions','stockRowsByCode','unmappedCatalogByCode','work'])bridge[key]=new Map();
 bridge.productReader.invalidate('session');bridge.productError='';
 for(const key of ['productPage','productSignature','loadingProducts','loadingDoc','loadingStock','totalsPromise'])bridge[key]=null;bridge.totalsReady=false;
 for(const key of Object.keys(refs))delete refs[key];hallConfig={aliases:{},stores:[]};
 D.products.splice(0);D.warehouses.splice(0);C.categories.splice(0);C.colors.splice(0);C.suppliers.splice(0);C.units=[];
 S.docs=[];S.work=[];S.returns=[];S.total=0;S.error='';S.actor=null;S.session=null;T.actor=null;T.total=0;T.error='';G.documents.splice(0);G.events.splice(0);G.initial.clear();
 M.warehouseStockSummary={};M.setServerEmployees([]);M.attachRuntime({revision:0,stores:[],warehouses:[],parties:[],staff:[],payments:[],fundAccounts:[],categories:[],audit:[]});
 PRODUCT_IDENTITY.install({version:1,products:[],skus:[],productCodes:[]});
};
bridge.startSession=()=>{
 const employee=M.current();if(!employee)return Promise.reject(new ERP_API.ServiceError('请先登录',{code:'AUTH'}));
 const owner=JSON.stringify([ERP_API.stateScope,employee.id,employee.role,employee.authVersion]);
 if(sessionPromise&&bridge.sessionOwner===owner)return sessionPromise;
 if(bridge.sessionOwner&&bridge.sessionOwner!==owner)bridge.resetSession();
 const generation=sessionGeneration;bridge.sessionOwner=owner;bridge.error='';showLoadState();
 const task=bootstrap(generation).catch(e=>{
  if(generation!==sessionGeneration||e?.stale)return {ok:false,code:'AUTH',stale:true};
  const failure=serviceFailure(e);bridge.loaded=false;bridge.inventoryReady=false;bridge.error=failure.error;
  window.resolveRealData(failure);window.render();return failure;
 });
 sessionPromise=task;
 task.then(result=>{if(sessionPromise===task&&result?.ok!==true)sessionPromise=null;});
 S.ready=T.ready=task;return task;
};
window.addEventListener('erp-user-cleared',()=>bridge.resetSession());
M.ready.then(()=>bridge.startSession()).catch(()=>{});
// Render payment records in the document header so the settlement stays visible while editing.
const h=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function fundsSum(d){return (d.fundsRecords||[]).reduce((n,f)=>n+(f.amountCents||0),0);}
const fundMethods=()=>refs['payment-methods']||[],fundAccounts=()=>refs['fund-accounts']||[];
const dueAmount=d=>SALES_AUDIT.amounts(d).difference;
// Adding a row is independent of settlement; keep entered amounts unchanged.
function canAddPayment(d){const rows=d.fundsRecords||[];return rows.length>0&&rows.length<3&&rows.every(f=>Number.isSafeInteger(f.amountCents))}
const recommendedFor=(account,storeId,methodId)=>bridge.recommendationForHall?.(storeId)?.accounts?.some(x=>x.methodId===methodId&&x.accountId===account.id)||false;
function availableAccounts(d,methodId){if(d.storeId&&!bridge.recommendationForHall?.(d.storeId))bridge.ensureRecommendations?.(d.storeId)?.catch(()=>{});return fundAccounts().filter(a=>a.enabled!==false&&(a.primary_payment_method_id||a.methodIds?.[0])===methodId).sort((a,b)=>Number(recommendedFor(b,d.storeId,methodId))-Number(recommendedFor(a,d.storeId,methodId)))}
function paymentStatus(d){const due=dueAmount(d),total=fundsSum(d),refund=due<0,expected=Math.abs(due),received=refund?-total:total,gap=expected-received,prefix=refund?'已退':'已收';if(!due&&!total&&!(d.lines?.length||d.returnLines?.length))return {kind:'',text:''};if(!due&&total)return {kind:'is-over',text:`${total<0?'已退':'已收'} ¥${SALES_CORE.money(Math.abs(total))} · ${total<0?'多退':'超收'} ¥${SALES_CORE.money(Math.abs(total))}`};return gap>0?{kind:'is-under',text:`${prefix} ¥${SALES_CORE.money(Math.abs(total))} · ${refund?'待退':'待收'} ¥${SALES_CORE.money(gap)}`} : gap<0?{kind:'is-over',text:`${prefix} ¥${SALES_CORE.money(Math.abs(total))} · ${refund?'多退':'超收'} ¥${SALES_CORE.money(-gap)}`}:{kind:'is-settled',text:`${prefix} ¥${SALES_CORE.money(Math.abs(total))} · 已结清`}}
function accountOptions(d,f){const accounts=availableAccounts(d,f.methodId);
 const option=a=>`<option value="${h(a.id)}" ${a.id===f.accountId?'selected':''}>${h(a.code&&!String(a.name).trimStart().startsWith(String(a.code))?`${a.code} ${a.name}`:a.name)}</option>`;
 const recommended=accounts.filter(a=>recommendedFor(a,d.storeId,f.methodId)),others=accounts.filter(a=>!recommendedFor(a,d.storeId,f.methodId));
 return recommended.length?`<optgroup label="推荐">${recommended.map(option).join('')}</optgroup>${others.length?`<optgroup label="全部账户">${others.map(option).join('')}</optgroup>`:''}`:accounts.map(option).join('');
}
function paymentRow(d,f,i,editable,virtual){
 if(!editable)return `<div class="sale-payment-read"><span>${h(f.methodName||fundMethods().find(m=>m.id===f.methodId)?.name||'—')}</span><span>${h(f.accountName||fundAccounts().find(a=>a.id===f.accountId)?.name||'—')}</span><strong>¥${SALES_CORE.money(f.amountCents)}</strong></div>`;
 const accounts=availableAccounts(d,f.methodId);
 const methodOptions=fundMethods().filter(m=>m.enabled!==false&&availableAccounts(d,m.id).length).map(m=>`<option value="${h(m.id)}" ${m.id===f.methodId?'selected':''}>${h(m.name)}</option>`).join('');
 const options=accountOptions(d,f);
 const amount=virtual?dueAmount(d):f.amountCents;
 const records=d.fundsRecords||[],canAdd=records.length<3&&(virtual||i===records.length-1),addDisabled=!canAddPayment(d);
 return `<div class="sale-payment-row" data-funds-row="${i}"><select class="ui-flat-select-source" data-rf="methodId" aria-label="第${i+1}笔支付方式"><option value="" disabled hidden ${f.methodId?'':'selected'}>支付方式</option>${methodOptions}</select><select class="ui-flat-select-source" data-rf="accountId" aria-label="第${i+1}笔资金账户" ${accounts.length?'':'disabled'}><option value="" disabled hidden ${f.accountId?'':'selected'}>资金账户</option>${options}</select><input data-rf="amount" aria-label="第${i+1}笔收款金额" inputmode="decimal" value="${h(f.amountRaw??(amount==null?'':SALES_CORE.money(amount)))}"><span class="sale-payment-actions">${canAdd?`<button type="button" class="btn sale-link" data-rf-add ${addDisabled?'disabled title="请先填写有效收款金额"':''}>添加</button>`:''}${records.length>1?`<button type="button" class="btn sale-link" data-rf-remove="${i}">删除</button>`:''}</span></div>`;
}
function fundsField(d,editable){const items=d.fundsRecords||[],rows=items.length?items:editable?[{methodId:'',accountId:'',amountCents:dueAmount(d)}]:[],status=paymentStatus(d);return `<div class="tc-gold-field sale-payment-field" data-funds-field><span class="sale-field-label">收款</span><div class="sale-payment-rows">${rows.length?rows.map((f,i)=>paymentRow(d,f,i,editable,!items.length)).join(''):'<span class="sale-read-value">—</span>'}</div><small class="sale-payment-balance ${status.kind}" data-funds-balance>${status.text}</small></div>`}
function rerenderFunds(focus,index=-1){const d=SALES_UI.state.doc,el=document.querySelector('[data-funds-field]');if(!d||!el)return;el.outerHTML=fundsField(d,SALES_UI.state.editing&&d.status==='未审核');UNIFIED_SINGLE_SELECT?.mountAll?.();if(focus){const rows=document.querySelectorAll('.sale-payment-row'),target=rows[index]||rows[rows.length-1];target?.querySelector(`[data-rf="${focus}"]`)?.focus()}}
SALES_FUNDS_UI.field=fundsField;
SALES_FUNDS_UI.reconcile=()=>{};
SALES_FUNDS_UI.syncField=(d,editable)=>{const el=document.querySelector('[data-funds-field]');if(!el)return;if(el.contains(document.activeElement)){for(const select of el.querySelectorAll('select[data-rf=accountId]')){const i=Number(select.closest('[data-funds-row]').dataset.fundsRow),f=d.fundsRecords?.[i]||{methodId:'',accountId:''},next=document.createElement('select');next.innerHTML=`<option value="" disabled hidden ${f.accountId?'':'selected'}>资金账户</option>${accountOptions(d,f)}`;if(select.innerHTML!==next.innerHTML){select.innerHTML=next.innerHTML;select.value=f.accountId||'';UNIFIED_SINGLE_SELECT?.mountAll?.()}}const balance=el.querySelector('[data-funds-balance]'),status=paymentStatus(d);if(balance){balance.textContent=status.text;balance.className='sale-payment-balance '+status.kind}const virtual=el.querySelector('[data-funds-row="0"] [data-rf="amount"]');if(virtual&&!(d.fundsRecords||[]).length&&virtual!==document.activeElement)virtual.value=SALES_CORE.money(dueAmount(d));const add=el.querySelector('[data-rf-add]');if(add){add.disabled=!canAddPayment(d);add.title=add.disabled?'请先填写有效收款金额':''}return}el.outerHTML=fundsField(d,editable);UNIFIED_SINGLE_SELECT?.mountAll?.()};
SALES_FUNDS_UI.remember=()=>{};
SALES_FUNDS_UI.validate=(d,{audit=false}={})=>{const rows=d.fundsRecords||[];for(const f of rows){const m=fundMethods().find(x=>x.id===f.methodId),a=availableAccounts(d,f.methodId).find(x=>x.id===f.accountId);if(!m||m.enabled===false||!a)return '请选择正常收款方式及可用的资金账户';if(!Number.isSafeInteger(f.amountCents))return '请填写有效收款金额'}if(audit&&fundsSum(d)!==dueAmount(d))return '收款合计与应结金额不一致，请核对后再审核';return ''};
document.addEventListener('change',e=>{const row=e.target.closest('[data-funds-row]');if(!row||!e.target.dataset.rf||(!SALES_UI.state.editing||SALES_UI.state.busy||SALES_UI.state.unresolvedRequest))return;const d=SALES_UI.state.doc,i=Number(row.dataset.fundsRow),f=d.fundsRecords[i]||{id:crypto.randomUUID(),methodId:'',accountId:'',amountCents:dueAmount(d)-fundsSum(d)};if(!d.fundsRecords[i])d.fundsRecords.push(f);if(e.target.dataset.rf==='methodId'){f.methodId=e.target.value;const choices=availableAccounts(d,f.methodId);f.accountId=choices.length===1?choices[0].id:''}else if(e.target.dataset.rf==='accountId')f.accountId=e.target.value;else return;SALES_UI.update();rerenderFunds(e.target.dataset.rf==='methodId'?'accountId':'amount',i)});
document.addEventListener('input',e=>{const row=e.target.closest('[data-funds-row]');if(!row||e.target.dataset.rf!=='amount'||(!SALES_UI.state.editing||SALES_UI.state.busy||SALES_UI.state.unresolvedRequest))return;const d=SALES_UI.state.doc,i=Number(row.dataset.fundsRow),f=d.fundsRecords[i]||{id:crypto.randomUUID(),methodId:'',accountId:'',amountCents:0};if(!d.fundsRecords[i])d.fundsRecords.push(f);const raw=e.target.value.trim(),negative=raw.startsWith('-'),value=SALES_CORE.cents(negative?raw.slice(1):raw);f.amountRaw=e.target.value;f.amountCents=value==null?null:value*(negative?-1:1);SALES_UI.update()});
document.addEventListener('focusout',e=>{if(e.target.dataset.rf!=='amount')return;const d=SALES_UI.state.doc,f=d?.fundsRecords?.[Number(e.target.closest('[data-funds-row]')?.dataset.fundsRow)];if(f&&Number.isSafeInteger(f.amountCents)){delete f.amountRaw;e.target.value=SALES_CORE.money(f.amountCents)}});
document.addEventListener('click',e=>{const el=e.target.closest('[data-rf-add],[data-rf-remove]');if(!el||(!SALES_UI.state.editing||SALES_UI.state.busy||SALES_UI.state.unresolvedRequest))return;const d=SALES_UI.state.doc;if(el.hasAttribute('data-rf-add')){if(!canAddPayment(d))return;const due=dueAmount(d),remaining=due-fundsSum(d),amount=due<0?Math.min(0,remaining):Math.max(0,remaining);d.fundsRecords.push({id:crypto.randomUUID(),methodId:'',accountId:'',amountCents:remaining===0?null:amount,direction:due<0?'refund':'receipt'});SALES_UI.update();rerenderFunds('methodId')}else{d.fundsRecords.splice(Number(el.dataset.rfRemove),1);SALES_UI.update();rerenderFunds('methodId')}});
const inventoryReader=createInventoryPageReader({request:api,productReader:bridge.productReader,warehouses:()=>D.warehouses,scope:productScope});
bridge.inventory=inventoryReader.read;
// R2 consumes the same permission-checked reader. No inventory request or full
// catalogue traversal is introduced merely by registering the modern page.
bridge.inventoryReader=inventoryReader;
bridge.pageScope=()=>JSON.stringify([sessionScope(),M.current()?.storeId??null]);
bridge.getInventoryReferences=()=>copy({warehouses:D.warehouses,categories:C.categories,suppliers:C.suppliers,colors:C.colors,units:C.units,
 fits:C.fits2026||C.fits||[],seasons:C.seasons||[]});
bridge.readInventoryProduct=async identity=>{
 const owner=bridge.pageScope(),input=identity.productId?{productIds:[identity.productId]}:{skuIds:[identity.skuId]},result=await bridge.productReader.ensureDetails(input);
 if(owner!==bridge.pageScope())throw Object.assign(Error('商品读取范围已变化'),{stale:true});
 const product=result.products.find(p=>p.uuid===identity.productId&&(!identity.skuId||Object.values(p.skuByCell||{}).includes(identity.skuId)))||result.products.find(p=>p.uuid===identity.productId)||null;
 if(product)await bridge.ensureProductImages(product);
 if(owner!==bridge.pageScope())throw Object.assign(Error('商品读取范围已变化'),{stale:true});
 return copy({product,identities:result.identities,catalog:result.catalog,catalogVersion:result.catalogVersion,unresolved:result.unresolved});
};
bridge.openInventoryCorrection=async(cell,options={})=>{
 const owner=bridge.pageScope();await window.ERP_PAGE_COMPONENTS.load('correction');
 if(owner!==bridge.pageScope())throw Object.assign(Error('校正入口的登录范围已变化'),{stale:true});
 return window.INVENTORY_CORRECTION.openForCell(cell,{productReader:bridge.productReader,warehouses:bridge.getInventoryReferences().warehouses,returnFocusTarget:options.returnFocusTarget});
};
window.ERP_PAGE_COMPONENTS.setContext({scope:bridge.pageScope,request:api,landing:()=>M.landing(),
 productReader:bridge.productReader,inventoryReader,getReferences:bridge.getInventoryReferences,
 actor:()=>M.current(),canCorrect:()=>['管理员','仓库人员','ADMIN','WAREHOUSE'].includes(M.current()?.role),
 productDetail:bridge.readInventoryProduct,openCorrection:bridge.openInventoryCorrection,
 inventoryYintaiReport:(...args)=>bridge.inventoryYintaiReport(...args),
 ledger:(...args)=>bridge.ledger(...args),ledgerSource:(...args)=>bridge.ledgerSource(...args)});
const resultPage=INVENTORY_RESULT.page;INVENTORY_RESULT.page=(snap,page,size)=>snap.remote?snap.rows:resultPage(snap,page,size);
bridge.allInventory=async()=>{const W=INVENTORY_UI.state,previous=W.snapshot,owner=productScope();if(!previous?.remote)return ()=>{};const full=await inventoryReader.all(previous.query,100);if(owner!==productScope()||W.snapshot!==previous)throw Object.assign(Error('查询条件已变化，请重新导出'),{stale:true});W.snapshot=full;let restored=false;return ()=>{if(restored)return;restored=true;if(owner===productScope()&&W.snapshot===full)W.snapshot=previous;};};

bridge.ledger=(k,page,filters)=>queryCellLedger(api,{warehouseId:k.w,skuId:k.skuId,unit:k.unit},page,filters);

window.addEventListener('inventory-correction-confirmed',async event=>{bridge.totalsReady=false;bridge.stockLoaded.clear();try{const product=D.products.find(p=>p.uuid===event.detail?.productId);if(product)await stock([product.id]);bridge.productReader.invalidate('inventory-correction');bridge.productSignature=null;window.render();}catch(error){bridge.error=error.message;}});
