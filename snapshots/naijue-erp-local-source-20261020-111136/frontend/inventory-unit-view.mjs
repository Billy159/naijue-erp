/** Display adapters retain each original warehouse/SKU/unit cell and never manufacture a missing zero. */
const scaled=value=>{const match=/^(-?)(\d+)(?:\.(\d{1,4}))?$/.exec(String(value));if(!match)throw Error('库存数量来源尚未核实');return (match[1]?-1n:1n)*(BigInt(match[2])*10000n+BigInt((match[3]||'').padEnd(4,'0')));};
const formatted=n=>{const absolute=n<0n?-n:n;return (n<0n?'-':'')+String(absolute/10000n)+(absolute%10000n?'.'+String(absolute%10000n).padStart(4,'0').replace(/0+$/,''):'');};
export const inventoryQuantity=value=>value===null||value===undefined?'未知':formatted(scaled(value));
const primaryUnit=p=>p.sourceUnit||p.unit||null;
export function unitTotals(cells){
  const totals=new Map();for(const cell of cells){const unit=cell.unit||null,unknownSkuId=unit===null?(cell.variant_id||cell.unknownSkuId):null,key=JSON.stringify([unit,unknownSkuId]);
    const total=totals.get(key)||{unit,unknownSkuId,quantity:0n};total.quantity+=scaled(cell.quantity);totals.set(key,total);}
  return [...totals.values()].map(row=>({...row,quantity:formatted(row.quantity)})).sort((a,b)=>String(a.unit).localeCompare(String(b.unit))||String(a.unknownSkuId).localeCompare(String(b.unknownSkuId)));
}
export function applyProductTotals(p,totals){
  p.inventoryTotals=totals.map(row=>({unit:row.unit||null,unknownSkuId:row.unknownSkuId||null,quantity:formatted(scaled(row.quantity))}));
  const own=p.inventoryTotals.filter(row=>row.unit&&row.unit===primaryUnit(p));p.stockTotal=own.length?Number(formatted(own.reduce((n,row)=>n+scaled(row.quantity),0n))):null;
}
export function projectProductStock(p,rows,warehouses){
  const seen=new Set();p.inventoryCells=rows.map(row=>{const key=JSON.stringify([row.warehouse_id,row.variant_id,row.unit||null]);if(seen.has(key))throw Error('原规格、单位库存重复，需核实');seen.add(key);scaled(row.quantity);return {...row};});
  p.stock=Object.fromEntries(warehouses.map(w=>[w.id,p.colorIds.map(()=>p.sizeIds.map(()=>null))]));
  const bySku=new Map(Object.entries(p.skuByCell||{}).map(([cell,id])=>[id,cell.split('|')])),unit=primaryUnit(p);
  for(const row of p.inventoryCells){const cell=bySku.get(row.variant_id);if(!unit||row.unit!==unit||!cell)continue;
    const c=p.colorIds.indexOf(cell[0]),s=p.sizeIds.indexOf(cell[1]);if(c<0||s<0)continue;
    p.stock[row.warehouse_id]??=p.colorIds.map(()=>p.sizeIds.map(()=>null));p.stock[row.warehouse_id][c][s]=Number(formatted(scaled(row.quantity)));
  }
  p.stockByWarehouse=Object.fromEntries(warehouses.map(w=>{const own=p.inventoryCells.filter(row=>row.warehouse_id===w.id&&unit&&row.unit===unit);return [w.id,own.length?Number(formatted(own.reduce((n,row)=>n+scaled(row.quantity),0n))):null];}));
  applyProductTotals(p,unitTotals(p.inventoryCells));return p;
}
export function stockSummary(p,warehouseIds){
  const totals=warehouseIds?unitTotals((p.inventoryCells||[]).filter(row=>warehouseIds.includes(row.warehouse_id))):p.inventoryTotals;
  if(!totals?.length)return '未知';
  return totals.map(row=>row.unit?`${formatted(scaled(row.quantity))} ${row.unit}`:`${formatted(scaled(row.quantity))} 单位待核实（${row.unknownSkuId||'原规格'}）`).join(' / ');
}
export function cellStockSummary(p,skuId,warehouseId){
  return stockSummary({inventoryTotals:unitTotals((p.inventoryCells||[]).filter(row=>row.variant_id===skuId&&row.warehouse_id===warehouseId))});
}
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function inventoryCellReport(cells,{products,warehouses,skus}){
  return [['款号','商品名称','仓库','原 SKU','原颜色','原版型','原尺码','计量单位','账面数量'],...cells.map(cell=>{
    const product=products.find(p=>p.uuid===cell.product_id),sku=skus.get(cell.variant_id),size=sku?.options?.SIZE,color=sku?.options?.COLOR;
    return [cell.product_code,cell.product_name||product?.name||'未知',cell.warehouse_name||warehouses.find(w=>w.id===cell.warehouse_id)?.name||cell.warehouse_id,cell.variant_id,
      cell.original?.color?.name||color?.sourceName||color?.name||'未知',cell.original?.fit?.name||sku?.fit_id||product?.sourceFit?.name||'未知',
      cell.original?.size?.name||size?.sourceName||size?.name||'未知',cell.unit||'单位待核实',inventoryQuantity(cell.quantity)];
  })];
}
export function inventoryCellsTable(cells,context,{interactive=false}={}){
  const [headers,...rows]=inventoryCellReport(cells,context);
  if(!rows.length)return '<div class="empty">当前范围没有已核实的库存单元，数量未知。</div>';
  return `<table class="pc-data-table mx-original-table"><thead><tr>${headers.map(label=>`<th>${escape(label)}</th>`).join('')}</tr></thead><tbody>${rows.map((row,i)=>`<tr data-inventory-cell="${escape(JSON.stringify([cells[i].warehouse_id,cells[i].variant_id,cells[i].unit]))}">${row.map((value,j)=>`<td${j===8?' class="num"':''}>${j===8&&interactive&&cells[i].unit?`<span class="iw-number" role="button" tabindex="0" data-i="ledger" data-w="${escape(cells[i].warehouse_id)}" data-sku="${escape(cells[i].variant_id)}" data-unit="${escape(cells[i].unit)}" aria-label="${escape(row[0]+' / '+row[2]+' / '+row[3]+' / '+row[7]+' 库存流水')}">${escape(value)}</span>`:escape(value)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
