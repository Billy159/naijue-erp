/* T+ transfer reference, with the user's confirmed 552 × 241 mm landscape sheet.
   Size columns are a print projection; source SKU quantities stay independent. */
(function(){'use strict';
const PAPER_WIDTH_MM=552,PAPER_HEIGHT_MM=241;
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const warehouse=id=>window.ERP_DEMO?.warehouses?.find(item=>item.id===id)?.name||'';
const fitName=product=>window.PRODUCT_CATALOG?.fit?.(product.fitId)?.name||product.fit||'';
function details(doc){
 const products=window.ERP_DEMO?.products||[];
 const order=new Map((doc.items||[]).map((id,index)=>[id,index]));
 return Object.entries(doc.q||{}).flatMap(([key,raw])=>{
  const quantity=Number(raw);if(!Number.isFinite(quantity)||quantity<=0)return [];
  const [id,colorIndex,sizeIndex]=key.split('|'),product=window.PRODUCT_CATALOG?.businessProduct?.(id)||products.find(item=>item.id===id),color=Number(colorIndex),size=Number(sizeIndex);
  return [{key,id,product,color,size,quantity}];
 }).sort((a,b)=>(order.get(a.id)??Number.MAX_SAFE_INTEGER)-(order.get(b.id)??Number.MAX_SAFE_INTEGER)||a.color-b.color||a.size-b.size);
}
function matrix(doc){
 const entries=details(doc),source=new Map(),products=new Map(),assigned=new Set(),H=window.MATRIX_SECTIONS,C=window.PRODUCT_CATALOG;
 for(const entry of entries){const key=entry.id+'|'+entry.color;if(!source.has(key))source.set(key,{p:entry.id,c:entry.color,key,product:entry.product,entries:[]});source.get(key).entries.push(entry);if(entry.product)products.set(entry.id,entry.product)}
 const groups=H?.displaySections?H.displaySections([...source.values()].filter(row=>row.product),[...products.values()],C).map(group=>{
  const rows=group.rows.map(row=>{
   const original=source.get(row.key),values=group.sizes.map(column=>{
    const indices=new Set(H.matches(row.product,column).map(size=>size.i));
    return original.entries.reduce((sum,entry)=>{if(!indices.has(entry.size)||assigned.has(entry.key))return sum;assigned.add(entry.key);return sum+entry.quantity},0);
   });
   return {...original,values,total:values.reduce((sum,value)=>sum+value,0)};
  }).filter(row=>row.total>0);
  return {...group,rows};
 }).filter(group=>group.rows.length):[];
 // Keep any unconfirmed or unavailable size identity visible instead of dropping its quantity.
 const remaining=new Map();
 for(const entry of entries){if(assigned.has(entry.key))continue;if(!remaining.has(entry.id))remaining.set(entry.id,[]);remaining.get(entry.id).push(entry)}
 for(const [id,left]of remaining){
  const p=left[0].product,indices=[...new Set(left.map(entry=>entry.size))].sort((a,b)=>a-b),sizes=indices.map(i=>({id:p?.sizeIds?.[i]||String(i),name:p?.legacySizeRecords?.[i]?.sourceName||p?.sizes?.[i]||''}));
  const rows=[...source.values()].filter(row=>row.p===id).map(row=>{const values=indices.map(i=>left.filter(entry=>entry.color===row.c&&entry.size===i).reduce((sum,entry)=>sum+entry.quantity,0));return {...row,values,total:values.reduce((sum,value)=>sum+value,0)}}).filter(row=>row.total>0);
  groups.push({key:'independent:'+id,name:H&&p?H.system(p,C).name:'',sizes,rows});
 }
 return {entries,groups,total:entries.reduce((sum,entry)=>sum+entry.quantity,0),styles:new Set(entries.map(entry=>entry.product?.sourceProductId||entry.id)).size,hasFit:entries.some(entry=>entry.product&&fitName(entry.product)),hasUnit:entries.some(entry=>entry.product?.unit)};
}
function summary({entries,styles}){
 const categories=new Map(),units=new Map(),seen=new Set(),C=window.PRODUCT_CATALOG;
 for(const entry of entries){
  const p=entry.product,unit=p?.unit||'件';units.set(unit,(units.get(unit)||0)+entry.quantity);
  const id=p?.sourceProductId||entry.id;if(seen.has(id))continue;seen.add(id);
  const name=(p?C?.salesCategory?.(p)?.name:'')||p?.category||'';
  if(name)categories.set(name,(categories.get(name)||0)+1);
 }
 return `<div class="totals" aria-label="商品汇总"><span data-print-styles>${styles}款</span><span data-print-units>${[...units].map(([unit,quantity])=>escapeHtml(quantity+unit)).join(' + ')||'0件'}</span>${categories.size?`<span class="product-tags" aria-label="商品信息">${[...categories].map(([name,count])=>`<span class="product-tag">${escapeHtml(name)} ${count}</span>`).join('')}</span>`:''}</div>`;
}
function sizeLabel(name){const text=String(name||''),at=text.indexOf('/');return at<0?escapeHtml(text):`<span>${escapeHtml(text.slice(0,at))}</span><span>${escapeHtml(text.slice(at+1))}</span>`}
function table(group,{hasFit,hasUnit},multiple){
 const fixedColumns=3+Number(hasFit)+Number(hasUnit),colspan=fixedColumns+group.sizes.length+1;
 const rows=group.rows.map(row=>{const p=row.product;return `<tr data-print-row="${escapeHtml(row.key)}"><td>${escapeHtml(p?.name||'')}</td><td class="style">${escapeHtml(p?.styleNumber||p?.displayId||p?.id||row.p)}</td><td class="center">${escapeHtml(p?.colors?.[row.c]||'')}</td>${hasFit?`<td class="center">${escapeHtml(p?fitName(p):'')}</td>`:''}${hasUnit?`<td class="center">${escapeHtml(p?.unit||'')}</td>`:''}${row.values.map(value=>`<td class="qty" data-print-quantity="${value}">${value||''}</td>`).join('')}<td class="qty subtotal" data-print-subtotal="${row.total}">${row.total}</td></tr>`}).join('');
 return `<table aria-label="调拨明细" data-size-system="${escapeHtml(group.key)}"><colgroup><col class="name"><col class="style"><col class="color">${hasFit?'<col class="fit">':''}${hasUnit?'<col class="unit">':''}${group.sizes.map(()=>'<col class="size">').join('')}<col class="subtotal"></colgroup><thead>${multiple&&group.name?`<tr class="group"><th colspan="${colspan}">${escapeHtml(group.name)}</th></tr>`:''}<tr><th>商品名称</th><th>款号</th><th>颜色</th>${hasFit?'<th>版型</th>':''}${hasUnit?'<th>单位</th>':''}${group.sizes.map(size=>`<th class="size-label" data-size-id="${escapeHtml(size.id)}">${sizeLabel(size.name)}</th>`).join('')}<th>小计</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><th colspan="${fixedColumns}">合计</th>${group.sizes.map((_,i)=>`<td class="qty">${group.rows.reduce((sum,row)=>sum+row.values[i],0)||''}</td>`).join('')}<td class="qty subtotal">${group.rows.reduce((sum,row)=>sum+row.total,0)}</td></tr></tfoot></table>`;
}
function render(doc,{unsaved=false}={}){
 const projection=matrix(doc),{groups}=projection;
 const number=doc.saved?doc.id:'未生成',date=String(doc.date||'').slice(0,10),from=doc.fromName||warehouse(doc.from),to=doc.toName||warehouse(doc.to);
 const auditor=doc.auditorActor?.name||doc.auditor||'',creator=doc.creatorActor?.name||doc.creator||'',note=String(doc.note||'').trim();
 return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(number)} · 杰威亚服饰发货单（调拨单）</title><style>
@page{size:${PAPER_WIDTH_MM}mm ${PAPER_HEIGHT_MM}mm;margin:0}
*{box-sizing:border-box}html,body{margin:0;padding:0}body{font-family:"Songti SC","SimSun",serif;font-size:11pt;line-height:1.2;color:#000;background:#edf0f3}
.paper{width:${PAPER_WIDTH_MM}mm;min-height:${PAPER_HEIGHT_MM}mm;margin:5mm auto;padding:8.9mm 5.5mm 9.4mm;background:#fff;box-shadow:0 3px 16px #2634491a;zoom:var(--preview-scale,1)}
.title{text-align:center;font-size:20pt;font-weight:700;margin:0 0 2mm}.draft{text-align:center;font-size:10pt;margin:0 0 2mm}
.meta{display:grid;grid-template-columns:95mm 140mm 1fr;gap:1mm 4mm;margin-bottom:2mm}.meta div{display:flex;min-width:0;align-items:baseline;gap:1mm;min-height:4.5mm}.meta span{white-space:nowrap;font-weight:700}.meta strong{font-weight:400;overflow-wrap:anywhere}.meta .from{grid-column:1;grid-row:2}.meta .to{grid-column:2;grid-row:2}.meta .note{grid-column:3;grid-row:1 / span 2;white-space:pre-wrap}
table{border-collapse:collapse;width:100%;table-layout:fixed;margin:0 0 3mm}col.name{width:44mm}col.style{width:47mm}col.color{width:22mm}col.fit{width:30mm}col.unit{width:11mm}col.subtotal{width:18mm}
th,td{border:.2mm solid #000;padding:.8mm 1mm;vertical-align:middle;overflow-wrap:anywhere;font-size:11pt}th{font-weight:700;text-align:center}.center,.qty{text-align:center}.qty{font-variant-numeric:tabular-nums}.style{white-space:normal}.subtotal,tfoot{font-weight:700}.size-label span{display:block}.group th{text-align:left;padding:1mm}.people{display:flex;gap:30mm;margin-top:3mm;break-inside:avoid}.totals{display:flex;align-items:center;flex-wrap:wrap;justify-content:flex-start;gap:3mm;font-weight:400;break-inside:avoid}.totals>span{white-space:nowrap}.product-tags{display:flex;flex-wrap:wrap;gap:2mm}.product-tag{padding:.6mm 1.5mm;border-radius:1mm;background:#f2f3f5;color:#444;print-color-adjust:exact;-webkit-print-color-adjust:exact}thead{display:table-header-group}tfoot{display:table-row-group}tr{break-inside:avoid;page-break-inside:avoid}
@media print{body{background:#fff}.paper{zoom:1!important;min-height:0;margin:0;box-shadow:none}thead{display:table-header-group}}
</style></head><body><main class="paper"><div class="title">杰威亚服饰发货单（调拨单）</div>${unsaved?'<div class="draft">未保存内容预览</div>':''}<div class="meta"><div><span>单据日期：</span><strong>${escapeHtml(date)}</strong></div><div><span>单据编号：</span><strong>${escapeHtml(number)}</strong></div><div class="from"><span>调出仓库：</span><strong>${escapeHtml(from)}</strong></div><div class="to"><span>调入仓库：</span><strong>${escapeHtml(to)}</strong></div>${note?`<div class="note"><span>备注：</span><strong>${escapeHtml(note)}</strong></div>`:''}</div>${groups.map(group=>table(group,projection,groups.length>1)).join('')||'<table aria-label="调拨明细"><tbody><tr><td class="center">暂无调拨明细</td></tr></tbody></table>'}${summary(projection)}${creator||auditor?`<div class="people">${creator?`<div>制单人：${escapeHtml(creator)}</div>`:''}${auditor?`<div>审核人：${escapeHtml(auditor)}</div>`:''}</div>`:''}</main><script>(()=>{const paper=document.querySelector('.paper');function fit(){paper.style.setProperty('--preview-scale',Math.min(1,Math.max(.1,(document.documentElement.clientWidth-32)/(${PAPER_WIDTH_MM}*96/25.4))))}fit();new ResizeObserver(fit).observe(document.documentElement)})();</script></body></html>`;
}
function preview(doc,{unsaved=false}={}){
 if(!doc)return window.toast?.('当前没有可预览的调拨单');
 document.querySelector('.transfer-print-dialog')?.remove();
 const dialog=document.createElement('dialog');dialog.className='iw-print-dialog transfer-print-dialog';
 dialog.innerHTML=`<header><strong>调拨单打印预览</strong><span class="transfer-print-paper">横向纸张 ${PAPER_WIDTH_MM} × ${PAPER_HEIGHT_MM} mm${unsaved?' · 未保存内容':''}</span><div class="actions"><button type="button" class="btn primary" data-print-go disabled>打印</button><button type="button" class="btn" data-print-close>关闭</button></div></header><iframe title="调拨单打印预览"></iframe>`;
 document.body.append(dialog);
 const frame=dialog.querySelector('iframe'),printButton=dialog.querySelector('[data-print-go]');
 const close=()=>{if(dialog.open)dialog.close();dialog.remove()};
 frame.addEventListener('load',()=>{printButton.disabled=false},{once:true});
 dialog.querySelector('[data-print-close]').addEventListener('click',close);
 dialog.addEventListener('cancel',event=>{event.preventDefault();close()});
 printButton.addEventListener('click',()=>{if(!frame.contentWindow)return;frame.contentWindow.focus();frame.contentWindow.print()});
 dialog.showModal();frame.srcdoc=render(doc,{unsaved});return dialog;
}
window.TRANSFER_PRINT_TEMPLATE={paper:{widthMm:PAPER_WIDTH_MM,heightMm:PAPER_HEIGHT_MM},details,matrix,render,preview};
})();
