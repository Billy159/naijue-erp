# frontend/inventory-matrix-experiment.js - Frozen UI excerpts

Source commit: `b8bcfe3eb43f6a7be0c60a77c6d6fb99e2ed5dd3`. Full source SHA256: `7439eb810ac2da36dbe791b9eb37240a4bcf6654bec98dff5674168e6e68e7a5`.

Boundary: Inventory product/group/color/size matrix presentation. Excludes localStorage history and loader; never merge inventory identity or coerce unknown quantities to zero. These are incomplete reference fragments; unresolved expressions are preserved. Empty data has not been inserted to fabricate a runnable module.

## Original lines 17-65

```javascript
function value(v){return typeof v==='number'&&Number.isFinite(v)?String(v):'未知'}
function detailValue(p,c,z,row){const xs=H.matches(p,z).filter(x=>valid(p,c,x.i)&&(!row.sources||row.sources[x.i]?.length));return xs.length?value(xs.reduce((n,x)=>n+Number(row.values[x.i]||0),0)):'0'}
function sectionTotal(g,p,cols){return g.sizes.reduce((n,z)=>n+H.matches(p,z).reduce((a,x)=>a+Number(cols[x.i]||0),0),0)}
function productCell(p,print=false,showMeta=true){
 const fields=['category','supplierId','fitId','groupId','season'].filter(k=>S.settings[k]);
 const extras=fields.map(k=>`<span><em>${h(({category:'分类',supplierId:'供应商',fitId:'版型',groupId:'尺码组',season:'季节'})[k])}</em> ${h(I.label(p,k))}</span>`).join('');
 return `<div class="mx-product-identity"><strong>${h(p.displayId||p.id)}</strong><span title="${h(p.name)}">${h(p.name)}</span></div>${showMeta&&extras&&!print?`<div class="mx-meta">${extras}</div>`:''}`;
}
function foldButton(action,key,expanded,label,print=false){
 if(print)return '<span class="mx-fold-spacer"></span>';
 return `<button type="button" class="mx-fold" data-i="${action}" ${action==='fold-product'?`data-id="${h(key)}"`:`data-key="${h(key)}"`} aria-label="${expanded?'折叠':'展开'}${h(label)}" aria-expanded="${expanded}">${expanded?'▾':'▸'}</button>`;
}
const spacer='<span class="mx-fold-spacer" aria-hidden="true"></span>';
function indent(button,label){return `<div class="mx-indent">${button}${label}</div>`}
function aggregate(g,p,group,label,kind,print=false,fold=null){
 const product=fold?productCell(p,print,fold.firstColor??true):h(label);
 const color=fold?.level==='product'?indent(foldButton('fold-product',p.id,false,p.id,print),'所有颜色'):fold?.level==='color'?indent(fold.firstColor?foldButton('fold-product',p.id,true,p.id,print):spacer,h(fold.color)):'';
 const warehouse=fold?.level==='product'?indent(spacer,'所有库存'):fold?.level==='color'?indent(foldButton('fold-color',p.id+'|'+fold.c,false,fold.color,print),'所有库存'):'';
 return `<tr data-inventory-product="${h(p.id)}" class="mx-${kind}${fold?' mx-folded':''}"><td class="mx-product">${product}</td><td class="mx-color">${color}</td><td class="mx-warehouse">${warehouse}</td>${g.sizes.map(z=>`<td>${h(value(H.matches(p,z).reduce((n,x)=>n+Number(group.cols[x.i]||0),0)))}</td>`).join('')}<td class="mx-total-cell">${h(value(sectionTotal(g,p,group.cols)))}</td>${print?'':`<td class="mx-summary-operation">${fold?`<button class="mx-view" data-i="view-product" data-id="${h(p.id)}" aria-label="打开商品资料">查看</button>`:''}</td>`}</tr>`;
}
function table(rows,{print=false}={}){
 const snap=W.snapshot;if(!snap)return '';
 return H.displaySections(rows,snap.products,C).map(g=>{
  const shownP=new Set(),shownC=new Set();let body='';
  for(const r of g.rows){
   const p=r.product,pk=S.page+':'+p.id,ck=S.page+':'+p.id+'|'+r.c,pg=snap.groups.get(p.id),cg=snap.groups.get(p.id+'|'+r.c),foldP=!print&&S.foldP.has(pk),foldC=!print&&S.foldC.has(ck);
   const first=!shownP.has(p.id),firstColor=!shownC.has(ck);
   if(foldP){
    if(first)body+=aggregate(g,p,pg,'','total',print,{level:'product'});
    shownP.add(p.id);continue;
   }
   if(foldC){
    if(firstColor)body+=aggregate(g,p,cg,'','subtotal',print,{level:'color',firstColor:first,c:r.c,color:r.color});
    shownP.add(p.id);shownC.add(ck);
    if(S.settings.total&&r.index===pg.last)body+=aggregate(g,p,pg,'商品合计','total',print);
    continue;
   }
   shownP.add(p.id);shownC.add(ck);
   const productArrow=first?foldButton('fold-product',p.id,true,p.id,print):spacer;
   const warehouseArrow=firstColor?foldButton('fold-color',p.id+'|'+r.c,true,r.color,print):spacer;
   body+=`<tr data-inventory-product="${h(p.id)}" data-inventory-row="${h(r.key)}"><td class="mx-product">${productCell(p,print,first)}</td><td class="mx-color">${indent(productArrow,h(r.color))}</td><td class="mx-warehouse" title="${h(r.warehouse+' '+r.warehouseCode)}">${indent(warehouseArrow,h(r.warehouse))}</td>${g.sizes.map(z=>{const matched=H.matches(p,z),size=matched.length===1?matched[0].i:-1,v=detailValue(p,r.c,z,r),attrs=`data-mx-stock data-product="${h(p.id)}" data-color="${h(p.colorIds[r.c])}" data-size="${h(z.id)}" data-warehouse="${h(r.w)}"`;return `<td ${attrs} class="${v==='—'?'mx-invalid':v==='0'?'mx-zero':Number(v)<0?'minus':''}">${print||!valid(p,r.c,size)||typeof r.values[size]!=='number'?h(v):`<span class="iw-number" role="button" tabindex="0" data-i="ledger" data-p="${h(p.id)}" data-c="${r.c}" data-s="${size}" data-w="${h(r.w)}">${h(v)}</span>`}</td>`}).join('')}<td class="mx-total-cell">${h(value(sectionTotal(g,p,r.values)))}</td>${print?'':`<td><button class="mx-view" data-i="view-product" data-id="${h(p.id)}" aria-label="打开商品资料">查看</button></td>`}</tr>`;
   if(S.settings.subtotal&&r.index===cg.last)body+=aggregate(g,p,cg,'颜色小计','subtotal',print);
   if(S.settings.total&&r.index===pg.last)body+=aggregate(g,p,pg,'商品合计','total',print);
  }
  const tableWidth=300+116+152+g.sizes.length*76+76+(print?0:70);
  return `<section class="mx-section" style="--mx-table-width:${tableWidth}px" data-size-system="${h(g.key)}"><h3 ${S.settings.sizeDescription?'':'hidden'}>${h(g.name)} <small>${g.sizes.map(z=>h(z.name)).join(' / ')}</small></h3><table class="mx-table"><colgroup><col style="width:${print?'19%':'300px'}"><col style="width:${print?'8%':'116px'}"><col style="width:${print?'10%':'152px'}">${g.sizes.map(()=>`<col style="width:${print?(57/g.sizes.length)+'%':'76px'}">`).join('')}<col style="width:${print?'6%':'76px'}">${print?'':'<col style="width:70px">'}</colgroup><thead><tr><th class="mx-product">款号／商品名称</th><th class="mx-color">颜色</th><th class="mx-warehouse">仓库</th>${g.sizes.map(z=>`<th data-size-id="${h(z.id)}">${h(z.name)}</th>`).join('')}<th class="mx-total-cell">合计</th>${print?'':'<th>操作</th>'}</tr></thead><tbody>${body}</tbody></table></section>`;
 }).join('');
}
// Reuse the same matrix projection, replacing only this product's existing rows.
```
