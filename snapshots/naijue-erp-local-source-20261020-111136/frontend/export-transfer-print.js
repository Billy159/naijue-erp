/* T27 snapshot projection of transfer-print-template.js (8877-final-baseline).
 * Keeps its paper, typography and matrix layout without reading current catalog facts. */
export const transferPaper = Object.freeze({widthMm:552, heightMm:241});
const text = value => value == null ? '' : String(value);
const html = value => text(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const field = (row,...keys) => { for(const key of keys) if(row?.[key]!=null && text(row[key]).trim()) return text(row[key]); return ''; };
function quantity(value,index) {
  const raw=text(value).trim(),match=/^(\d+)(?:\.(\d{1,4}))?$/.exec(raw);
  if(!match)throw new Error(`调拨第 ${index+1} 行原数量缺失或精度无法核对，未生成打印稿`);
  return {raw,scaled:BigInt(match[1])*10000n+BigInt((match[2]||'').padEnd(4,'0'))};
}
function decimal(value) {
  const fraction=String(value%10000n).padStart(4,'0').replace(/0+$/,'');
  return `${value/10000n}${fraction?'.'+fraction:''}`;
}
const sum=rows=>rows.reduce((total,row)=>total+row.scaled,0n);
const sizeLabel=name=>text(name).split('/').map(part=>`<span>${html(part)}</span>`).join('');

function project(lines) {
  const groups=new Map(),units=new Map(),styles=new Set();let unknownUnitLines=0;
  lines.forEach((line,index)=>{
    const sku=field(line,'sku_id','skuId'),productId=field(line,'product_id','productId'),code=field(line,'product_code','source_product_code','productCode');
    const name=field(line,'product_name','source_product_name','name')||'商品名称未知',fit=field(line,'fit_name','fit')||'版型未知',unit=field(line,'unit','quantity_unit');
    const size=field(line,'source_size','source_size_name','sourceSize','size')||'原尺码未知',color=field(line,'color_name','source_color_name','color')||'颜色未知';
    const sizeId=field(line,'source_size_id','size_id')||(size==='原尺码未知'?`unknown:${sku||index}`:JSON.stringify([field(line,'source_size_code'),size]));
    const colorId=field(line,'color_id','source_color_id')||color,product=productId||code||`unknown:${sku||index}`;
    const key=JSON.stringify([product,code,name,fit,unit]);
    if(!groups.has(key))groups.set(key,{key,name,code:code||productId||'款号未知',fit,unit:unit||'单位未知',unitKnown:!!unit,sizes:[],rows:[]});
    const group=groups.get(key);
    if(!group.sizes.some(column=>column.id===sizeId))group.sizes.push({id:sizeId,name:size});
    // One original line per cell. Duplicate labels or source positions never overwrite a SKU.
    let row=unit&&group.rows.find(candidate=>candidate.colorId===colorId&&!candidate.cells.has(sizeId));
    if(!row){row={color,colorId,cells:new Map()};group.rows.push(row);}
    const value=quantity(field(line,'source_quantity','quantity'),index);
    row.cells.set(sizeId,{...value,sku,line:field(line,'source_id','id')||String(index+1),index:index+1});
    styles.add(product);if(unit)units.set(unit,(units.get(unit)||0n)+value.scaled);else unknownUnitLines++;
  });
  return {groups:[...groups.values()],units,styles:styles.size,unknownUnitLines};
}
function table(group) {
  const rows=group.rows.map(row=>{
    const cells=group.sizes.map(size=>{
      const entry=row.cells.get(size.id);
      return entry?`<td class="qty" data-print-sku-id="${html(entry.sku)}" data-print-line="${html(entry.line)}" data-print-line-index="${entry.index}" data-source-quantity="${html(entry.raw)}">${html(entry.raw)}</td>`:'<td class="qty"></td>';
    }).join('');
    return `<tr data-print-row><td>${html(group.name)}</td><td class="style">${html(group.code)}</td><td class="center">${html(row.color)}</td><td class="center">${html(group.fit)}</td><td class="center">${html(group.unit)}</td>${cells}<td class="qty subtotal" data-print-subtotal>${decimal(sum([...row.cells.values()]))}</td></tr>`;
  }).join('');
  const totals=group.sizes.map(size=>`<td class="qty">${group.unitKnown?decimal(sum(group.rows.flatMap(row=>row.cells.has(size.id)?[row.cells.get(size.id)]:[]))):'—'}</td>`).join('');
  return `<table aria-label="调拨明细" data-size-system="${html(group.key)}"><colgroup><col class="name"><col class="style"><col class="color"><col class="fit"><col class="unit">${group.sizes.map(()=>'<col class="size">').join('')}<col class="subtotal"></colgroup><thead><tr><th>商品名称</th><th>款号</th><th>颜色</th><th>版型</th><th>单位</th>${group.sizes.map(size=>`<th class="size-label" data-size-id="${html(size.id)}">${sizeLabel(size.name)}</th>`).join('')}<th>小计</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><th colspan="5">合计</th>${totals}<td class="qty subtotal">${group.unitKnown?decimal(sum(group.rows.flatMap(row=>[...row.cells.values()]))):'—'}</td></tr></tfoot></table>`;
}

export function renderTransferPrint(detail,snapshot,{versionLabel,statusLabel}) {
  const body=snapshot.body||{},header=body.header||{},source=header.source_payload||{};
  if(Array.isArray(body.fundsRecords)&&body.fundsRecords.length)throw new Error('调拨快照含结算行，不符合调拨打印合同，未生成打印稿');
  const projection=project(Array.isArray(body.lines)?body.lines:[]),number=detail.number||detail.id;
  const date=field(header,'business_date')||(snapshot.current?field(detail,'business_day','businessDay'):'')||'未知';
  const from=field(header,'source_from_warehouse_name','from_warehouse_name')||field(source,'fromName')||field(header,'source_from_warehouse_id')||'未知';
  const to=field(header,'source_to_warehouse_name','to_warehouse_name')||field(source,'toName')||field(header,'source_to_warehouse_id')||'未知';
  const creator=field(header,'creator_name')||field(source.creatorActor,'name')||field(source,'creator')||'未知';
  const auditor=field(header,'auditor_name')||field(source.auditorActor,'name')||field(source,'auditor')||'未知',note=field(header,'note');
  const totals=[...projection.units].map(([unit,value])=>`${decimal(value)}${unit}`);
  if(projection.unknownUnitLines)totals.push(`单位未知：${projection.unknownUnitLines} 行（原数量逐行保留）`);
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${html(number)} · 杰威亚服饰发货单（调拨单）</title><style>
@page{size:552mm 241mm;margin:0}
*{box-sizing:border-box}html,body{margin:0;padding:0}body{font-family:"Songti SC","SimSun",serif;font-size:11pt;line-height:1.2;color:#000;background:#edf0f3}
.paper{width:552mm;min-height:241mm;margin:5mm auto;padding:8.9mm 5.5mm 9.4mm;background:#fff;box-shadow:0 3px 16px #2634491a;zoom:var(--preview-scale,1)}
.title{text-align:center;font-size:20pt;font-weight:700;margin:0 0 2mm}.version{text-align:center;font-size:10pt;margin:0 0 2mm}.history{font-weight:700}
.meta{display:grid;grid-template-columns:95mm 140mm 1fr;gap:1mm 4mm;margin-bottom:2mm}.meta div{display:flex;min-width:0;align-items:baseline;gap:1mm;min-height:4.5mm}.meta span{white-space:nowrap;font-weight:700}.meta strong{font-weight:400;overflow-wrap:anywhere}.meta .from{grid-column:1;grid-row:2}.meta .to{grid-column:2;grid-row:2}.meta .note{grid-column:3;grid-row:1 / span 2;white-space:pre-wrap}
table{border-collapse:collapse;width:100%;table-layout:fixed;margin:0 0 3mm}col.name{width:44mm}col.style{width:47mm}col.color{width:22mm}col.fit{width:30mm}col.unit{width:11mm}col.subtotal{width:18mm}
th,td{border:.2mm solid #000;padding:.8mm 1mm;vertical-align:middle;overflow-wrap:anywhere;font-size:11pt}th{font-weight:700;text-align:center}.center,.qty{text-align:center}.qty{font-variant-numeric:tabular-nums}.style{white-space:normal}.subtotal,tfoot{font-weight:700}.size-label span{display:block}.people{display:flex;gap:30mm;margin-top:3mm;break-inside:avoid}.totals{display:flex;align-items:center;flex-wrap:wrap;gap:3mm;font-weight:400;break-inside:avoid}.totals>span{white-space:nowrap}thead{display:table-header-group}tfoot{display:table-row-group}tr{break-inside:avoid;page-break-inside:avoid}
@media print{body{background:#fff}.paper{zoom:1!important;min-height:0;margin:0;box-shadow:none}thead{display:table-header-group}}
</style></head><body><main class="paper" data-print-revision="${html(snapshot.revision)}"><div class="title">杰威亚服饰发货单（调拨单）</div><div class="version${snapshot.current?'':' history'}">${html(versionLabel)} · ${html(statusLabel)}</div>${snapshot.current?'':'<div class="version history">历史版本（只读），仅用于核对</div>'}<div class="meta"><div><span>单据日期：</span><strong>${html(date.slice(0,10))}</strong></div><div><span>单据编号：</span><strong>${html(number)}</strong></div><div class="from"><span>调出仓库：</span><strong>${html(from)}</strong></div><div class="to"><span>调入仓库：</span><strong>${html(to)}</strong></div>${note?`<div class="note"><span>备注：</span><strong>${html(note)}</strong></div>`:''}</div>${projection.groups.map(table).join('')||'<table aria-label="调拨明细"><tbody><tr><td class="center">暂无调拨明细</td></tr></tbody></table>'}<div class="totals" aria-label="商品汇总"><span data-print-styles>${projection.styles}款</span><span data-print-units>${html(totals.join(' + ')||'无明细')}</span></div><div class="people"><div>制单人：${html(creator)}</div><div>审核人：${html(auditor)}</div></div></main><script>(()=>{const paper=document.querySelector('.paper');function fit(){paper.style.setProperty('--preview-scale',Math.min(1,Math.max(.1,(document.documentElement.clientWidth-32)/(552*96/25.4))))}fit();new ResizeObserver(fit).observe(document.documentElement)})();</script></body></html>`;
}
