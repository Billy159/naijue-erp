/* Default projection of the original applied inventory snapshot; never writes stock. */
(function(){'use strict';
const I=INVENTORY_UI,W=I.state,S=GOLD_UI.state,R=INVENTORY_RESULT,C=PRODUCT_CATALOG,F=PRODUCT_FINDER,H=MATRIX_SECTIONS,$=s=>document.querySelector(s),h=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),active=()=>location.hash==='#inventory',E={locate:null};S.size=100;
const prefsKey='matrix-inventory-display:'+TRANSFER_SERVICE.key,initialPrefs=structuredClone(S.settings);try{const saved=JSON.parse(localStorage.getItem(prefsKey)||'null');if(saved)S.settings={...initialPrefs,...saved}}catch{}
const savePrefs=()=>localStorage.setItem(prefsKey,JSON.stringify(S.settings));
const products=()=>R.data(S.draft.dataset).products,resolve=q=>S.draft.dataset==='stress'?{kind:'missing',matches:[]}:C.resolve(q);
function closeOldPop(){W.pop=null;const pop=$('#iw-pop');if(pop)pop.hidden=true}

const historyKey='inventory-search:'+TRANSFER_SERVICE.key+':'+(window.MASTER_DATA?.current()?.id||TRANSFER_SERVICE.actor?.id||'local');
function historyItems(){try{const items=JSON.parse(localStorage.getItem(historyKey)||'[]');return Array.isArray(items)?items.filter(x=>typeof x==='string'):[]}catch{return []}}
function rememberSearch(q){if(!q?.trim())return;localStorage.setItem(historyKey,JSON.stringify([q.trim(),...historyItems().filter(x=>x!==q.trim())].slice(0,15)))}
function setHistory(items){localStorage.setItem(historyKey,JSON.stringify(items))}
function applyQuery(){S.draft.keyword='';[...S.draft.products].reverse().forEach(rememberSearch);closeOldPop();return I.query()}
async function applyIdentity(identity){S.draft.products=[identity.productId];S.draft.keyword='';E.locate=identity.colorId?identity:null;await applyQuery();locate()}
function locate(){if(!E.locate||!W.snapshot)return;const p=W.snapshot.products.find(p=>p.id===E.locate.productId),c=p?.colorIds.indexOf(E.locate.colorId),row=W.snapshot.rows.find(r=>r.p===p?.id&&r.c===c);if(!row)return;const page=W.snapshot.remote?S.page:Math.floor(W.snapshot.products.findIndex(x=>x.id===p.id)/S.size)+1;if(S.page!==page){S.page=page;window.render()}const cell=[...document.querySelectorAll('[data-mx-stock]')].find(el=>el.dataset.product===p.id&&el.dataset.color===E.locate.colorId&&el.dataset.size===E.locate.sizeId);if(cell){cell.classList.add('mx-located');cell.scrollIntoView({block:'nearest',inline:'nearest'})}}
function valid(p,c,s){if(p.inventoryProjection)return s>=0;return s>=0&&(p.demoFixture&&Object.keys(p.barcodes||{}).length===0?Object.values(p.stock||{}).some(w=>Array.isArray(w?.[c])&&s<w[c].length):F.validSpec(p,c,s))}
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
function refreshFold(productId){
 const box=$('#iw-results');if(!active()||W.status!=='ready'||!W.snapshot||!box)return false;
 const rows=R.page(W.snapshot,S.page,S.size),selected=rows.filter(row=>row.p===productId);if(!selected.length)return false;
 const template=document.createElement('template');template.innerHTML=table(selected);
 const sections=[...box.querySelectorAll('.mx-section')],updates=[];
 for(const next of template.content.querySelectorAll('.mx-section')){
  const section=sections.find(item=>item.dataset.sizeSystem===next.dataset.sizeSystem);
  const old=section&&[...section.querySelectorAll('tbody > tr')].filter(row=>row.dataset.inventoryProduct===productId);
  if(!old?.length)return false;
  updates.push({old,next:[...next.querySelector('tbody').children]});
 }
 if(!updates.length)return false;
 const scroll={top:box.scrollTop,left:box.scrollLeft},focus=document.activeElement;
 const focusAction=focus?.dataset.i,focusKey=focus?.dataset.id||focus?.dataset.key;
 for(const update of updates){const fragment=document.createDocumentFragment();fragment.append(...update.next);update.old[0].before(fragment);update.old.forEach(row=>row.remove())}
 const collapsed=[...new Set(rows.map(row=>row.p))].every(id=>S.foldP.has(S.page+':'+id));
 const toggle=$('[data-i=toggle-folds]');if(toggle){toggle.textContent=collapsed?'展开':'折叠';toggle.title=(collapsed?'展开':'折叠')+'当前页商品'}
 W.scroll=scroll;box.scrollTop=scroll.top;box.scrollLeft=scroll.left;
 if(focusAction&&focusKey&&!focus.isConnected)[...box.querySelectorAll('[data-i]')].find(button=>button.dataset.i===focusAction&&(button.dataset.id||button.dataset.key)===focusKey)?.focus({preventScroll:true});
 return true;
}
function render(){if(!active())return;const box=$('#iw-results');if(box&&W.snapshot&&(W.snapshot.productCount??W.snapshot.products.length)>0&&W.status!=='loading'){box.classList.add('mx-results');box.innerHTML=table(R.page(W.snapshot,S.page,S.size));box.scrollTop=W.scroll.top;box.scrollLeft=W.scroll.left}window.INVENTORY_EMPTY?.mount($('#inventory-arco-empty'));window.INVENTORY_SELECT?.mount($('#inventory-arco-select'));window.INVENTORY_CATEGORY?.mount($('#inventory-arco-category'));for(const kind of ['warehouses','supplierId','fitId','season'])window.INVENTORY_FILTERS?.mount(kind,$('#inventory-arco-'+kind));if(SCAN_WORKBENCH.target==='inventory:'+TRANSFER_SERVICE.key)SCAN_WORKBENCH.unbind()}
const previous=window.render;window.render=function(){window.INVENTORY_EMPTY?.beforeRender();window.INVENTORY_SELECT?.beforeRender();window.INVENTORY_CATEGORY?.beforeRender();window.INVENTORY_FILTERS?.beforeRender();if(!active()&&SCAN_WORKBENCH.target?.startsWith('inventory:'))SCAN_WORKBENCH.unbind();previous();render()};
function report(){const snap=W.snapshot;if(window.MASTER_DATA?.active&&snap?.query.warehouses.some(id=>!MASTER_DATA.context()?.warehouses.includes(id)))throw Error('库存查询范围已失效，请重新查询');if(!snap)return [];const result=[['奈爵服饰 '+'库存状况'],['查询范围',I.scope(snap.query,true)]];for(const g of H.displaySections(snap.rows,snap.products,C)){result.push([g.name]);result.push(['货号','商品名称',...(snap.splitFit?['版型']:[]),'颜色','仓库',...g.sizes.map(z=>z.name)]);for(const r of g.rows){const p=r.product;result.push([p.displayId||p.id,p.name,...(snap.splitFit?[I.label(p,'fitId')]:[]),r.color,r.warehouse,...g.sizes.map(z=>{const v=detailValue(p,r.c,z,r);return ['—','未知'].includes(v)?v:Number(v)})]);}}return result}
function yintaiReport(){const snap=W.snapshot;if(!snap)return [];if(window.MASTER_DATA?.active&&snap.query.warehouses.some(id=>!MASTER_DATA.context()?.warehouses.includes(id)))throw Error('库存查询范围已失效，请重新查询');
 const rows=[['默认条形码','款号','商品名称','系统货号','存货分类','零售价(主)','颜色','尺码','现存量(主)','主计量']];
 for(const p of snap.sourceProducts||snap.products)for(let c=0;c<p.colorIds.length;c++)for(let s=0;s<p.sizeIds.length;s++){if(!F.validSpec(p,c,s))continue;const binding=p.barcodes?.[C.specKey(p.colorIds[c],p.sizeIds[s])],values=snap.warehouses.map(w=>p.stock?.[w.id]?.[c]?.[s]),quantity=R.sum(values);rows.push([binding?.current||'',p.styleNumber||p.id,p.name,C.systemItemCode(p),C.categoryLabel(p),p.source?.referencePriceProvided===false||p.price==null||p.price===''?'':Number(p.price),p.colors[c],p.sizes[s],R.finite(quantity)?quantity:'未知',p.unit||'']);}return rows;
}
function exportTemplate(){const dialog=document.createElement('dialog');dialog.className='iw-export-dialog';dialog.setAttribute('aria-labelledby','iw-export-title');dialog.innerHTML=`<form><header><h2 id="iw-export-title">导出库存</h2><button type="button" class="btn ghost" data-export-close aria-label="关闭导出窗口" title="关闭">×</button></header><div class="iw-export-body"><fieldset><legend>选择导出模板</legend><label class="iw-export-option"><input type="radio" name="template" value="default" data-export-default checked><span><strong>默认库存明细</strong><small>按仓库分别展示，尺码横向排列。</small></span></label><label class="iw-export-option"><input type="radio" name="template" value="yintai" data-export-yintai><span><strong>银泰库存模板</strong><small>按颜色、尺码合并所选仓库，保留各版型条码。</small></span></label></fieldset><p class="iw-export-scope">导出当前查询的全部结果，不受分页影响。不包含小计、合计。</p><p class="iw-export-error" role="alert" hidden></p></div><footer><button type="button" class="btn" data-export-close>取消</button><button type="submit" class="btn primary" data-export-confirm>导出</button></footer></form>`;document.body.append(dialog);const close=()=>{dialog.close();dialog.remove()};dialog.querySelectorAll('[data-export-close]').forEach(b=>b.onclick=close);dialog.querySelector('form').onsubmit=async e=>{e.preventDefault();const selected=dialog.querySelector('input:checked').value,controls=[...dialog.querySelectorAll('button,input')],submit=dialog.querySelector('[data-export-confirm]'),error=dialog.querySelector('[role=alert]');controls.forEach(b=>b.disabled=true);error.hidden=true;submit.textContent='导出中…';try{const restore=window.REAL_DATA_MODE?await LEGACY_REAL.allInventory():()=>{};try{await MATRIX_REPORT.download(selected==='yintai'?yintaiReport():report(),selected==='yintai'?'银泰库存状况':'库存状况')}finally{restore()}close()}catch(e){error.textContent='导出失败：'+e.message;error.hidden=false;controls.forEach(b=>b.disabled=false);submit.textContent='重新导出'}};dialog.addEventListener('cancel',()=>dialog.remove());dialog.showModal();dialog.querySelector('input:checked').focus()}

function printDocument(){if(!W.snapshot)return '';return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>库存状况打印</title><style>@page{size:A4 landscape;margin:9mm}body{font:11px Arial,"PingFang SC",sans-serif;color:#263440}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{padding:4px;overflow-wrap:break-word;border:1px solid #dce1e5;text-align:right}th{background:#f3f5f7}thead{display:table-header-group}tr{break-inside:avoid}.mx-product,.mx-color,.mx-warehouse,.mx-sum-label{text-align:left}.mx-product strong{white-space:nowrap}.mx-product span{display:block}.mx-color,.mx-warehouse{word-break:keep-all}.mx-meta{display:block;color:#52616f}.mx-section h3{font-size:12px}.mx-section{break-inside:auto;margin-bottom:12px}.mx-subtotal,.mx-total{background:#f3f5f7}small{font-weight:normal}</style><h1>库存状况</h1><p>${h(I.scope(W.snapshot.query,true))}</p><p>共 ${W.snapshot.rows.length} 条数据行 · 全量库存 ${h(value(W.snapshot.total))}。遵循颜色小计、商品合计及尺码组说明设置；打印全部展开。</p>${table(W.snapshot.rows,{print:true})}</html>`}
async function print(){const restore=window.REAL_DATA_MODE?await LEGACY_REAL.allInventory():()=>{};closeOldPop();const dialog=document.createElement('dialog');dialog.className='iw-print-dialog';dialog.innerHTML='<header><strong>库存打印预览</strong><span>已执行查询的全部结果</span><button class="btn" data-print>打印</button><button class="btn" data-close>关闭</button></header><iframe title="库存分区全量打印预览"></iframe>';const frame=dialog.querySelector('iframe');frame.srcdoc=printDocument();restore();dialog.querySelector('[data-print]').onclick=()=>{frame.contentWindow.focus();frame.contentWindow.print()};dialog.querySelector('[data-close]').onclick=()=>{dialog.close();dialog.remove()};dialog.addEventListener('cancel',()=>dialog.remove());document.body.append(dialog);dialog.showModal()}
document.addEventListener('click',e=>{if(!active())return;const el=e.target.closest('[data-i]');if(!el)return;if(el.dataset.i==='query'){e.preventDefault();e.stopImmediatePropagation();applyQuery();return}if(el.dataset.i==='export'){e.preventDefault();e.stopImmediatePropagation();closeOldPop();if(W.snapshot)exportTemplate();return}if(el.dataset.i==='print'){e.preventDefault();e.stopImmediatePropagation();if(W.snapshot)print();return}},true);
document.addEventListener('change',e=>{if(active()&&e.target.dataset.iSetting){e.stopImmediatePropagation();S.settings[e.target.dataset.iSetting]=e.target.checked;savePrefs();if(e.target.dataset.iSetting==='fitId'&&S.applied){if(window.REAL_DATA_MODE){I.query({refreshOnly:true});return}W.snapshot=R.build(S.applied);S.result=W.snapshot.products;S.page=1;S.foldP.clear();S.foldC.clear()}window.render()}},true);
document.addEventListener('click',e=>{if(active()&&e.target.closest('[data-i=defaults]')){e.preventDefault();e.stopImmediatePropagation();S.settings={category:true,supplierId:false,fitId:false,groupId:false,season:false,subtotal:false,total:true,sizeDescription:false};savePrefs();if(S.applied){if(window.REAL_DATA_MODE){I.query({refreshOnly:true});return}W.snapshot=R.build(S.applied);S.result=W.snapshot.products;S.page=1}closeOldPop();window.render()}},true);
window.INVENTORY_SELECT_BRIDGE={
 snapshot:()=>({selected:[...S.draft.products],dataset:S.draft.dataset}),
 search:q=>F.search(products(),q,resolve,{includeBarcodes:false}).map(x=>x.p),
 exact:raw=>{const q=String(raw).trim().toLocaleLowerCase(),candidates=products().filter(p=>F.specs(p).length&&(p.id.toLocaleLowerCase()===q||String(p.barcodeItemCode||p.goodsCode||'').toLocaleLowerCase()===q));return candidates.length===1?candidates[0].id:null},
 previewData:id=>{const p=products().find(x=>x.id===id);if(!p)return null;const imageColor=im=>im.colorName||p.colors[p.colorIds.indexOf(im.colorId)]||(/^\d+_([^/]+)\//.exec(im.name||'')||[])[1]||'';const priority=im=>im.role==='主图'?0:im.role==='颜色配图'&&/人像/.test(im.name||'')?1:im.role==='颜色配图'?2:3;const images=(p.images||[]).filter(im=>im&&typeof im==='object'&&im.url).sort((a,b)=>priority(a)-priority(b));const photos=p.colors.map(color=>({color,image:images.find(im=>imageColor(im)===color)})).filter(x=>x.image).map(x=>({color:x.color,url:x.image.url}));if(!photos.length){const main=images.find(im=>im.role==='主图')||images[0];if(main)photos.push({color:imageColor(main)||'商品图片',url:main.url})}const fields=[['款号',p.id],['商品名称',p.name],['颜色',p.colors.length+' 色'],['商品分类',C.categoryLabel(p)||p.category],['年份',p.year],['季节',C.seasonLabel(p)||p.season],['版型',C.fit(p.fitId)?.name||p.fit],['供应商',C.suppliers.find(x=>x.id===p.supplierId)?.name],['零售价',p.price==null||p.source?.referencePriceProvided===false?'':Number(p.price).toFixed(2)],['厚薄',p.thickness],['领型 / 裤型',C.shapeOptions(p)?.find(x=>x[0]===p.shapeCode)?.[1]||p.shapeCode]].filter(([,value])=>value!==undefined&&value!==null&&value!=='');return {fields,photos}},
 setSelected:ids=>{const available=new Set(products().map(p=>p.id));S.draft.products=[...new Set(ids.filter(id=>available.has(id)))];S.draft.keyword='';I.updateDraft()},
 historyItems,rememberHistory:rememberSearch,removeHistory:q=>setHistory(historyItems().filter(x=>x!==q)),clearHistory:()=>setHistory([])
};
window.INVENTORY_CATEGORY_BRIDGE={
 snapshot:()=>({selected:R.categoryIds(S.draft),nodes:C.categoryNodes()}),
 setSelected:ids=>{S.draft.categories=[...new Set(ids)];S.draft.category=S.draft.categories.length===1?S.draft.categories[0]:'all';I.updateDraft()}
};
window.INVENTORY_FILTERS_BRIDGE={
 snapshot:kind=>{
  const items=kind==='warehouses'?I.accessibleWarehouses().map(w=>({id:w.id,name:w.name,code:w.code})):kind==='supplierId'?C.suppliers.filter(x=>!x.disabled).map(x=>({id:x.id,name:x.name,code:x.code})):kind==='fitId'?[...C.fits2026.map(x=>({id:x.id,name:x.name,code:x.code})),...(window.REAL_DATA_MODE?[]:[{id:'__unset',name:'未设置 / 历史商品'}])]:C.seasons.map(x=>({id:x.name,name:x.name}));
  const selected=kind==='warehouses'?S.draft.warehouses:S.draft.more[kind]||[];
  return {items,selected:Array.isArray(selected)?selected:selected?[selected]:[],defaultAll:kind!=='warehouses'&&!Object.hasOwn(S.draft.more,kind),label:kind==='warehouses'?'仓库':{supplierId:'供应商',fitId:'版型',season:'季节'}[kind]};
 },
 setSelected:(kind,ids)=>{if(kind==='warehouses')S.draft.warehouses=ids;else if(ids===null)delete S.draft.more[kind];else S.draft.more[kind]=ids;I.updateDraft()}
};
window.INVENTORY_MATRIX_EXPERIMENT={state:E,table,refreshFold,report,yintaiReport,exportTemplate,print,printDocument,render,applyIdentity};window.render();
})();
