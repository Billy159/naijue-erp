import {projectProductStock,inventoryCellReport,inventoryCellsTable,inventoryQuantity,unitTotals} from './inventory-unit-view.mjs';

const unique=values=>[...new Set(values)];
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const list=value=>Array.isArray(value)?value:value?[value]:[];
const copy=value=>structuredClone(value);
const escaped=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function inventoryPageRequest(query,page=1,size=100){
  const identities=unique(query.products||[]),categories=unique(list(query.categories??query.category??'all')),more=query.more||{};
  if(!list(query.warehouses).length)throw Error('请至少选择一个仓库');
  if(!Number.isSafeInteger(page)||page<1||![20,50,100,200,500].includes(size))throw Error('库存分页参数无效');
  if(Object.keys(more).some(key=>!['supplierId','fitId','season'].includes(key)))throw Error('库存筛选条件不受支持，请重新选择');
  return {page,size,view:query.view==='standard'?'standard':'original',filters:{
    warehouses:unique(query.warehouses),products:identities.filter(id=>id.startsWith('product:')).map(id=>id.slice(8)),codes:identities.filter(id=>!id.startsWith('product:')),
    categories:categories.includes('all')?[]:categories,supplierId:list(more.supplierId),fitId:list(more.fitId),seasons:list(more.season),
    q:identities.length?'':String(query.keyword||'').trim(),...(query.unit?{unit:query.unit}:{}),nonzero:query.nonzero===true
  }};
}
const original=cell=>({
  ...cell,warehouse_id:cell.warehouseId,variant_id:cell.skuId,product_id:cell.productId,product_code:cell.productCode,
  product_name:cell.productName,warehouse_name:cell.warehouseName,warehouse_code:cell.warehouseCode
});
/** Current inventory never depends on the completeness of the product detail cache. */
export function createInventoryPageReader({request,productReader,warehouses,scope}){
  if(typeof request!=='function'||typeof productReader?.ensureDetails!=='function'||typeof warehouses!=='function'||typeof scope!=='function')throw new TypeError('Inventory page reader dependencies are required');
  const assertOwner=owner=>{if(owner!==String(scope()))throw Object.assign(Error('登录身份已变化，请重新查询库存'),{stale:true,code:'AUTH'});};
  async function read(query,page=1,size=100,{signal}={}){
    if(signal?.aborted)throw Object.assign(Error('库存读取已取消'),{stale:true});
    const input=inventoryPageRequest(query,page,size),owner=String(scope());
    const data=await request('/inventory/page?query='+encodeURIComponent(JSON.stringify(input)),undefined,{mode:'query',signal});
    if(signal?.aborted)throw Object.assign(Error('库存读取已取消'),{stale:true});
    assertOwner(owner);
    if(data?.contractVersion!=='INVENTORY_PAGE_V1'||data.view!==input.view||data.page!==page||data.size!==size
      ||!Number.isSafeInteger(data.total)||data.total<0||!Number.isSafeInteger(data.originalCellCount)||data.originalCellCount<0
      ||!Array.isArray(data.items)||!Array.isArray(data.productIds)||!Array.isArray(data.skuIds)||!Array.isArray(data.unitTotals)
      ||typeof data.readVersion!=='string'||!data.source?.runId)throw Error('库存分页结果尚未核实，请重试');
    const cells=data.view==='standard'?data.items.flatMap(group=>{
      if(!Array.isArray(group.members)||!group.members.length)throw Error('标准展示缺少原库存成员');
      if(group.members.some(cell=>cell.warehouseId!==group.warehouseId||cell.unit!==group.unit||cell.productId!==group.productId))throw Error('标准展示原身份不一致');
      const totals=unitTotals(group.members.map(cell=>({...cell,variant_id:cell.skuId})));
      if(totals.length!==1||inventoryQuantity(totals[0].quantity)!==inventoryQuantity(group.quantity))throw Error('标准展示数量与原成员不一致');
      return group.members;
    }):data.items;
    const pageProductIds=unique(cells.map(cell=>cell.productId).filter(Boolean)).sort(),pageSkuIds=unique(cells.map(cell=>cell.skuId)).sort();
    if(JSON.stringify(pageProductIds)!==JSON.stringify([...data.productIds].sort())||JSON.stringify(pageSkuIds)!==JSON.stringify([...data.skuIds].sort()))throw Error('库存页引用身份不一致，请重试');
    for(const cell of cells){if(!uuid.test(cell.warehouseId)||!uuid.test(cell.skuId)||cell.quantity===null||cell.quantity===undefined)throw Error('原库存身份或数量尚未核实');inventoryQuantity(cell.quantity);}
    for(const total of data.unitTotals)inventoryQuantity(total.quantity);
    const details=pageProductIds.length||pageSkuIds.length?await productReader.ensureDetails({productIds:pageProductIds,skuIds:pageSkuIds}):{products:[],unresolved:[]};
    assertOwner(owner);
    const originalCells=cells.map(original),allWarehouses=warehouses(),selectedWarehouses=allWarehouses.filter(w=>query.warehouses.includes(w.id));
    const products=[...new Map((details.products||[]).filter(p=>pageProductIds.includes(p.uuid)).map(p=>[JSON.stringify([p.uuid,p.id,p.fitId]),copy(p)])).values()];
    const sourceProducts=products.map(p=>projectProductStock(copy(p),originalCells.filter(cell=>cell.product_id===p.uuid),selectedWarehouses));
    return {remote:true,serverPaged:true,query:copy({...query,view:input.view}),view:input.view,products,sourceProducts,
      productCount:data.total,page,size,productIds:pageProductIds,skuIds:pageSkuIds,warehouses:selectedWarehouses,
      originalCells,standardItems:input.view==='standard'?copy(data.items):null,
      sourceSkus:copy((details.catalog?.skus||[]).filter(row=>pageSkuIds.includes(row.id))),
      rows:originalCells.map((cell,index)=>({key:JSON.stringify([cell.warehouse_id,cell.variant_id,cell.unit]),p:cell.product_id||cell.variant_id,w:cell.warehouse_id,unit:cell.unit,index})),
      rowCount:data.originalCellCount,groups:new Map(),unitTotals:copy(data.unitTotals),summaryScope:'ALL_MATCHES',total:null,
      negative:data.negativeCellCount,unknown:data.unknownCellCount,source:copy({...data.source,quantityMethod:data.source.quantityMethod??data.quantityMethod,
        dataClass:data.source.dataClass??data.dataClass,historicalTimelineCompletenessClaimed:data.source.historicalTimelineCompletenessClaimed??data.historicalTimelineCompletenessClaimed}),
      readVersion:data.readVersion,catalogVersion:details.catalogVersion||productReader.catalogVersion||'',
      unresolved:copy(details.unresolved||[]),created:new Date().toISOString()};
  }
  async function all(query,size=100,{signal,guard=()=>true}={}){
    const owner=String(scope()),check=()=>{assertOwner(owner);if(signal?.aborted||!guard())throw Object.assign(Error('查询范围已变化或输出已取消'),{stale:true});};
    check();const first=await read(query,1,size,{signal}),pages=[first];check();
    // Full traversal is only called by an explicit export/print operation.
    for(let page=2;page<=Math.ceil(first.productCount/size);page++){
      check();const next=await read(query,page,size,{signal});check();
      if(next.productCount!==first.productCount||next.readVersion!==first.readVersion||next.catalogVersion!==first.catalogVersion
        ||JSON.stringify(next.source)!==JSON.stringify(first.source)||JSON.stringify(next.unitTotals)!==JSON.stringify(first.unitTotals))throw Error('库存在导出期间更新，请重试');
      pages.push(next);
    }
    const cells=pages.flatMap(snap=>snap.originalCells),keys=cells.map(cell=>JSON.stringify([cell.warehouse_id,cell.variant_id,cell.unit]));
    if(new Set(keys).size!==keys.length||cells.length!==first.rowCount)throw Error('全量库存结果在读取期间变化，请重试');
    return {...first,allPages:true,products:pages.flatMap(s=>s.products),sourceProducts:pages.flatMap(s=>s.sourceProducts),
      productIds:unique(pages.flatMap(s=>s.productIds)),skuIds:unique(pages.flatMap(s=>s.skuIds)),originalCells:cells,
      sourceSkus:[...new Map(pages.flatMap(s=>s.sourceSkus||[]).map(row=>[row.id,row])).values()],
      standardItems:first.standardItems?pages.flatMap(s=>s.standardItems):null,unresolved:pages.flatMap(s=>s.unresolved),rows:pages.flatMap(s=>s.rows)};
  }
  return {read,all};
}

export function inventoryPageReport(snapshot,context){
  if(!snapshot.standardItems)return inventoryCellReport(snapshot.originalCells,context);
  const headers=['款号','商品名称','仓库','原 SKU','原颜色','原版型','原尺码','计量单位','账面数量','标准尺码组','标准版型','标准尺码','标准码','映射状态'];
  return [headers,...snapshot.standardItems.flatMap(group=>group.members.map(cell=>{
    const row=inventoryCellReport([original(cell)],context)[1];
    return [...row,group.standard?.group||'未映射',group.standard?.fit||'未映射',group.standard?.size||'未映射',group.standard?.code||'未映射',cell.standard?.mappingStatus||'UNMAPPED'];
  }))];
}
export function inventoryPageTable(snapshot,context,{interactive=false}={}){
  if(!snapshot.standardItems)return inventoryCellsTable(snapshot.originalCells,context,{interactive});
  return snapshot.standardItems.map(group=>{
    const identity=group.standard?.group?[group.standard.group,group.standard.fit,group.standard.size,group.standard.code].join(' / '):'原尺码独立展示（'+group.unmappedSkuId+'）';
    return `<section class="mx-section"><h3>${escaped(identity)} · ${escaped(inventoryQuantity(group.quantity))} ${escaped(group.unit||'单位待核实')}</h3>${inventoryCellsTable(group.members.map(original),context,{interactive})}</section>`;
  }).join('')||'<div class="empty">当前范围没有已核实的库存单元，数量未知。</div>';
}

/** Export every admitted original SKU/unit, including unmapped identities; no detail-cache enumeration. */
export function inventoryYintaiReport(snapshot,context,catalog){
  const groups=new Map();
  for(const cell of snapshot.originalCells){const key=JSON.stringify([cell.product_id,cell.variant_id,cell.unit]),rows=groups.get(key)||[];rows.push(cell);groups.set(key,rows);}
  return [['默认条形码','款号','商品名称','系统货号','存货分类','零售价(主)','颜色','尺码','现存量(主)','主计量','原 SKU'],...[...groups.values()].map(cells=>{
    const cell=cells[0],p=snapshot.products.find(p=>p.uuid===cell.product_id&&Object.values(p.skuByCell||{}).includes(cell.variant_id)),pair=p&&Object.entries(p.skuByCell||{}).find(([,sku])=>sku===cell.variant_id),binding=pair&&p.barcodes?.[pair[0]],row=inventoryCellReport([cell],context)[1];
    return [binding?.current||'',p?.styleNumber||cell.product_code,row[1],p?catalog.systemItemCode(p):'',p?catalog.categoryLabel(p):'',
      p?.price==null||p?.price===''||p?.source?.referencePriceProvided===false?'':Number(p.price),row[4],row[6],inventoryQuantity(unitTotals(cells)[0].quantity),cell.unit||'单位待核实',cell.variant_id];
  })];
}
