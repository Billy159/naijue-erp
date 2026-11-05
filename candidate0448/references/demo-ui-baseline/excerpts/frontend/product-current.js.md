# frontend/product-current.js - Frozen UI excerpts

Source commit: `b8bcfe3eb43f6a7be0c60a77c6d6fb99e2ed5dd3`. Full source SHA256: `d5a3ae29d781aa725859196dac6ef4e64f0e3cea08b3cca5c199579c9527b0be`.

Boundary: Product columns, six tabs, base/specs/prices/stock/barcodes, categories and dictionaries. No catalogue, scheme literals, media or save branches. Old combinations/totals are presentation context only, not permission to create Cartesian-product SKUs or infer zero. These are incomplete reference fragments; unresolved expressions are preserved. Empty data has not been inserted to fabricate a runnable module.

## Original lines 79-81

```javascript
 const columns=['款号','商品名称','商品分类','年份 / 季节','供应商','版型','厚薄','零售价','总库存','操作'];
 const body=values.map(p=>`<tr><td><strong class="pc-product-code">${h(p.id)}</strong></td><td>${h(p.name)}</td><td title="${h(C.categoryLabel(p))}">${h(C.standardCategory(p)?.name||'')}</td><td>${h([p.year,C.seasonLabel(p)].filter(Boolean).join(' / '))}</td><td>${h(C.suppliers.find(s=>s.id===p.supplierId)?.name||'')}</td><td>${h((p.fitIds||[p.fitId]).map(id=>C.fit(id)?.name).filter(Boolean).join('、')||p.fit||'')}</td><td>${h(p.thickness||'')}</td><td class="num">${p.price==null||p.price===''?'':Number(p.price).toFixed(2)}</td><td class="num">${num(D.total(p))}</td><td>${btn('编辑','open-product',`data-id="${h(p.id)}"`,'ghost')}</td></tr>`).join('');
 return `<div class="pc-workbench pc-products">`+workspaceHead('商品信息',btn('新增商品','new-product','','primary'))+`<form id="pc-filter" class="toolbar pc-master-filters iw-query"><div class="pc-filter-row iw-query-row"><div id="product-arco-search" class="iw-product-select-host" aria-label="商品搜索"></div><div id="product-arco-category" class="iw-category-select-host" aria-label="商品分类"></div><div id="product-arco-years" class="iw-filter-host" aria-label="年份"></div><div id="product-arco-seasons" class="iw-filter-host" aria-label="季节"></div>${btn(`<span class="iw-filter-icon" aria-hidden="true">☷</span>${U.moreFilters?'收起筛选':'高级筛选'}<span aria-hidden="true">${U.moreFilters?'▴':'▾'}</span>`,'more-filters',`aria-expanded="${U.moreFilters}"`,'ghost pc-more-toggle iw-filter-toggle')}<button class="btn primary" type="submit">查询</button>${btn('重置','reset-filter','','ghost')}</div>${U.moreFilters?`<div class="pc-filter-row pc-more-filters"><div id="product-arco-supplierId" class="iw-filter-host" aria-label="供应商"></div><div id="product-arco-fitId" class="iw-filter-host" aria-label="版型"></div><div id="product-arco-thickness" class="iw-filter-host" aria-label="厚薄"></div><div id="product-arco-shapeCode" class="iw-filter-host" aria-label="领型 / 裤型"></div></div>`:''}</form><section class="pc-list-table"><div class="table-scroll" tabindex="0" aria-label="商品列表，可横向滚动"><table class="pc-data-table"><thead><tr>${columns.map(t=>`<th>${t}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>${rows.length?'':'<div id="pc-products-empty" class="iw-empty-host" data-state="no-results" data-title="暂无符合条件的商品" data-description="调整筛选条件后重新查询。"></div>'}</div></section>${window.INVENTORY_PAGER.render({page:U.page,size:U.size,total,button:btn,pageAction:'page',prevAction:'prev',nextAction:'next',jumpAction:'page-jump',selectId:'pc-size',jumpId:'pc-page-jump',selectAria:'商品每页款数',className:'pc-pagination'})}</div>`;
```

## Original lines 83-99

```javascript
function basicFields(p,id){
 const required=id==='new'||p.productSchema===2,mark=required?' *':'';
 const ar=(name)=>`<div id="pc-detail-${name}" class="pc-arco-host" data-control="${name}"></div>`;
 return `<div class="pc-form-grid pc-base-grid">
 ${field('款号 *',input('id',p.id,'text',id==='new'?'maxlength="40"':'readonly'))}
 ${field('商品名称 *',input('name',p.name,'text','maxlength="80"'))}
 ${field('商品分类'+mark,ar('category'))}
 ${field('年份 *',ar('year'))}
 ${field('季节 *',ar('season'))}
 ${field('供应商 *',ar('supplier'))}
 ${field('厚薄（可选）',ar('thickness'))}
 ${field('领型 / 裤型（可选）',ar('shape'))}
 ${field('系统货号 *',input('barcodeItemCode',p.barcodeItemCode??C.systemItemCode(p),'text','required aria-required="true" maxlength="30" placeholder="输入系统货号"'))}
 </div>`;
}
const tabs=[['base','基础资料'],['specs','规格'],['barcodes','条码'],['prices','价格'],['images','图片'],['stock','库存']];
function specSection(title,values,action,caption){return `<section class="pc-spec-section"><div class="pc-section-line"><h3>${title}</h3>${btn(action,'spec-edit',`data-kind="${title==='颜色'?'colors':title==='尺码'?'sizes':'fits'}"`,'ghost')}</div><div class="pc-spec-values">${values.length?values.map(v=>`<span class="pc-spec-value">${h(v)}</span>`).join(''):'<span class="hint">未设置</span>'}</div>${caption?`<small class="hint">${h(caption)}</small>`:''}</section>`}
```

## Original lines 107-111

```javascript
function specsBody(p){const names=specValues('fits',p).map(id=>C.fit(id)?.name||id).filter(Boolean);
 return `<div class="pc-spec-stack">${specSection('颜色',specValues('colors',p).map(id=>C.color(id)?.name||p.colors[p.colorIds.indexOf(id)]||id),'编辑颜色')}
 <section class="pc-spec-section"><div class="pc-section-line"><h3>尺码组</h3></div><div class="pc-spec-group"><span>选择尺码组</span><div id="pc-detail-group" class="pc-arco-host"></div></div></section>
 ${specSection('版型',names,'编辑版型')}${historicalSkuSection(p)}</div>`;
}
```

## Original lines 119-124

```javascript
function priceBody(p){return `<div class="pc-price-wrap"><div class="pc-price-paste"><span>价格</span><small>可从 Excel 整列复制价格，按下表顺序粘贴</small></div><table class="pc-price-table"><thead><tr><th>价格类型</th><th>金额</th></tr></thead><tbody>${C.priceFields.map(([key,label])=>`<tr><th scope="row">${h(label)}</th><td>${input(key,p[key]??'','text','inputmode="decimal" placeholder="未设置" data-price-field')}</td></tr>`).join('')}</tbody></table><small class="hint">空白表示未设置；0 表示价格为零。</small></div>`}
function stockBody(id){const saved=id==='new'?null:C.by(id);if(!saved)return '<div class="empty">新商品保存后可查看库存。</div>';
 const warehouses=D.warehouses;
 const rows=warehouses.map(w=>({warehouse:w,quantity:D.total(saved,[w.id])})).filter(x=>U.stockAll||x.quantity!==0);
 return `<div class="pc-stock-head"><strong>总库存：${num(D.total(saved))}</strong><div>${btn(U.stockAll?'仅看有库存':'查看全部仓库','stock-all','','ghost')}${btn('查看详细库存','to-inventory','','ghost')}</div></div><table class="pc-stock-overview"><thead><tr><th>仓库</th><th class="num">现存量</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${h(x.warehouse.name)}</td><td class="num">${x.quantity==null?'未知':num(x.quantity)}</td></tr>`).join('')}</tbody></table>${rows.length?'':'<div class="empty">各仓库当前库存为 0</div>'}${historicalSkuSection(saved)}`;
}
```

## Original lines 128-135

```javascript
 if(U.tab==='base')body=basicFields(p,id);
 if(U.tab==='specs')body=specsBody(p);
 if(U.tab==='barcodes')body=`<div class="pc-barcode-tools">${field('主条码默认方案',`<div id="pc-detail-scheme" class="pc-arco-host"></div>`)}${btn('查看方案','view-scheme','','ghost')}</div><small class="hint">修改方案只影响以后新生成的条码，已有条码保持不变。</small>${barcodeBody(p)}`;
 if(U.tab==='prices')body=priceBody(p);
 if(U.tab==='images')body=imageManager(p);
 if(U.tab==='stock')body=stockBody(id);
 return `<div class="pc-detail-workbench"><div class="pc-detail-sticky">${workspaceHead((p.id||'新增商品')+' · '+(p.name||'未命名'),(id==='new'?'':btn('删除商品','delete-master',`data-kind="products" data-id="${h(p.id)}"`,'ghost pc-danger'))+btn('取消','cancel-edit')+btn('保存','save-product','','primary'))}<div class="tabs" role="tablist" aria-label="商品详情">${tabs.map(([key,label])=>`<button type="button" role="tab" aria-selected="${U.tab===key}" data-pc="tab" data-tab="${key}" class="${U.tab===key?'active':''}">${label}</button>`).join('')}</div></div><div id="pc-editor-error" class="inline-error" role="alert"></div><section class="pc-editor-body pc-detail-body">${body}</section></div>`;
}
```

## Original lines 180-180

```javascript
 return `<div class="pc-workbench pc-categories">`+workspaceHead('商品分类',`${U.categoryUndo?btn('撤销排序','category-undo','','ghost'):''}${btn('新增一级分类','category-root','','ghost')}${btn('新增下级分类','category-child',isAll?'disabled title="请先选择一级分类"':'','ghost')}`)+`<div class="pc-category-layout"><aside class="pc-filter-tree"><div id="pc-arco-tree" class="pc-category-tree-host"></div></aside><section class="pc-editor-body pc-category-detail">${isAll?'<h2>分类资料</h2><div id="pc-category-empty" class="iw-empty-host" data-state="idle" data-title="选择分类" data-description="从左侧选择分类查看资料，或新增一级分类。"></div>':`<form id="pc-category-form"><div class="pc-category-detail-head"><h2>${c.isNew?'新增分类':'分类资料'}</h2><div>${btn('取消','category-cancel','','ghost')}<button class="btn primary" form="pc-category-form" type="submit">保存</button></div></div><div class="pc-category-facts"><div class="field"><span>分类路径</span><p class="pc-text-block">${h(c.parent==='all'?'一级分类':C.path(c.id)||C.path(c.parent))}</p></div>${field('分类名称',`<input data-cat="name" value="${h(c.name)}" required maxlength="40">`)}<div class="field"><span>商品数量</span><p class="pc-text-block">${products} 款</p></div><div class="field"><span>下级分类数量</span><p class="pc-text-block">${children} 个</p></div></div>${c.isNew?'':`<div class="pc-delete-zone">${btn('删除分类','delete-master',`data-kind="categories" data-id="${h(c.id)}"`,'ghost pc-danger')}</div>`}</form>`}<div id="pc-category-error" class="inline-error" role="alert"></div></section></div></div>`;
```

## Original lines 198-202

```javascript
 const editable=['colors','fits'].includes(type),headers=type==='groups'?['尺码组','包含尺码']:type==='seasons'?['季节']:['名称','编码','操作'];
 const body=rows.slice((paging.page-1)*paging.size,paging.page*paging.size).map(x=>`<tr><td>${h(x.name)}</td>${type==='groups'?`<td>${h(x.sizes.map(s=>s.name).join('、'))}</td>`:type==='seasons'?'':`<td>${h(x.code||'')}</td>`}${editable?`<td>${btn('编辑','edit-dict',`data-id="${h(x.id)}"`,'ghost')}</td>`:''}</tr>`).join('');
 const pager=window.INVENTORY_PAGER.render({page:paging.page,size:paging.size,total:rows.length,button:btn,pageAction:'setting-page',prevAction:'setting-prev',nextAction:'setting-next',selectId:'pc-dict-size',sizes:[20,50,100],unit:'条',selectAria:'商品设置每页条数',className:'pc-pagination pc-settings-pagination',jumpAction:'setting-jump',jumpId:'pc-setting-jump'});
 return `<div class="pc-workbench pc-settings-page">`+workspaceHead('商品设置')+`<section class="pc-settings"><div class="tabs" role="tablist">${[['colors','颜色'],['groups','尺码组'],['fits','版型'],['seasons','季节']].map(([k,t])=>`<button role="tab" aria-selected="${type===k}" class="${type===k?'active':''}" data-pc="setting" data-tab="${k}">${t}</button>`).join('')}</div><div class="pc-editor-body pc-settings-body"><div class="pc-section-line"><input id="pc-dict-search" type="search" placeholder="搜索${label}名称${['colors','fits'].includes(type)?'或编码':''}" value="${h(U.dictQ||'')}">${editable?btn('新增'+label,'new-dict','','primary'):''}</div><table><thead><tr>${headers.map(t=>`<th>${t}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>${rows.length?'':'<div class="empty">没有匹配的数据</div>'}${pager}</div></section></div>`;
}
```

## Original lines 207-207

```javascript
function schemes(){return `<div class="pc-workbench pc-schemes-page">`+workspaceHead('条码方案')+`<section class="pc-schemes"><div class="table-scroll"><table class="pc-data-table"><thead><tr>${['方案名称','条码类型','编码规则','总长度','状态','适用范围','操作'].map(t=>`<th>${t}</th>`).join('')}</tr></thead><tbody>${[...C.schemes].sort((a,b)=>a.priority-b.priority).map(s=>`<tr><td>${h(s.name)}</td><td>Code128</td><td>${schemeSummary(s)}</td><td>${schemeLength(s)}</td><td>${s.id==='2026'?'当前':'历史'}</td><td>${s.id==='2026'?'新建商品默认':'历史商品使用'}</td><td>${btn('查看','edit-scheme',`data-id="${s.id}" aria-label="查看方案：${h(s.name)}"`,'ghost')}</td></tr>`).join('')}</tbody></table></div><p class="hint spaced pc-scheme-note">历史商品使用已确认的条码记录，商品段采用 T+ 存货默认条码完整原值。历史数据已定稿，不自动重新生成条码。2026 方案用于新增商品。</p></section></div>`}
```

## Original lines 213-223

```javascript
function barcodeSource(meta){return meta?.source==='MANUAL'?'人工补录':C.schemes.find(s=>s.id===meta?.schemeId)?.name||'历史导入'}
function barcodeBody(p){
 const rows=specValues('colors',p).flatMap(cid=>specValues('fits',p).flatMap(fid=>C.sizeRecords(p).filter(size=>specValues('sizes',p).includes(size.id)).map(size=>{
  const skuId=p.currentSkuByUiCell?.[cid+'|'+fid+'|'+size.id];
  const fallback=fid===(p.baseFitId||p.fitId)?C.specKey(cid,size.id):cid+'|'+fid+'|'+size.id;
  const key=(skuId&&Object.keys(p.barcodes||{}).find(candidate=>p.barcodes[candidate]?.skuId===skuId))||fallback;
  const b=p.barcodes[key]||{current:'',history:[],compatible:[]},extras=[...(b.history||[]),...(b.compatible||[]).map(x=>x.code)];
  return `<tr data-barcode-sku="${h(key)}"><td>${h(C.color(cid)?.name||p.colorSplit?.colorName||'—')}</td><td>${h(C.fit(fid)?.name||fid||'—')}</td><td>${h(size.name)}</td><td class="pc-barcode-code">${h(b.current||(b.barcodeStatus==='NOT_REQUIRED'?'无需条码':p.excelBarcodeAuthority?.active?(b.skuId?'待补条码':'—'):'未生成'))}</td><td class="pc-barcode-code">${extras.length?`${h(extras[0])}${btn(extras.length>1?'+'+(extras.length-1)+' 更多':'查看','barcode-all',`data-key="${h(key)}"`,'ghost')}`:'—'}</td><td>${b.current||extras.length?btn('查看','barcode-all',`data-key="${h(key)}"`,'ghost'):''}${b.skuId?btn('添加旧条码','compatible-new',`data-key="${h(key)}"`,'ghost'):''}</td></tr>`;
 })));
 return `<div class="pc-section-line"><h3>当前规格条码</h3></div><div class="pc-detail-table pc-barcode-table"><table><thead><tr><th>颜色</th><th>版型</th><th>尺码</th><th>当前主条码</th><th>历史 / 兼容条码</th><th>操作</th></tr></thead><tbody>${rows.join('')}</tbody></table>${rows.length?'':'<div class="empty">当前没有可展示的 SKU 条码</div>'}</div>`;
}
```
