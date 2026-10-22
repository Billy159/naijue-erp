# frontend/sales-current.js - Frozen UI excerpts

Source commit: `b8bcfe3eb43f6a7be0c60a77c6d6fb99e2ed5dd3`. Full source SHA256: `846a217125cc7f0fe2800a7508a01131ad3648cdd4fe8a69cf8284a4b6b4d3a1`.

Boundary: Sales list, line table, return/exchange sections, header and toolbar. No loader, save or type-switch write branches. Use current precise monetary and SALE/RETURN/EXCHANGE contracts. These are incomplete reference fragments; unresolved expressions are preserved. Empty data has not been inserted to fabricate a runnable module.

## Original lines 82-98

```javascript
 return `<section class="tc-workbench tc-list" data-document-list="sales"><div class="tc-head"><h1>销货单列表</h1>${b('新增销货单','new','','primary')}</div>
 <form id="sale-filter" class="tc-filters tc-filters-two-row">
 <div class="tc-filter-row tc-filter-primary">
 <label class="tc-date-field"><span>开始日期</span><span class="tc-arco-date-host" data-sales-date="start"></span></label>
 <label class="tc-date-field"><span>结束日期</span><span class="tc-arco-date-host" data-sales-date="end"></span></label>
 <label class="tc-status-field"><span>状态</span>${saleFilterHost('status')}</label>
 <label><span>业务类型</span>${saleFilterHost('businessType')}</label>
 <label><span>营业厅</span>${saleFilterHost('storeId')}</label>
 <label><span>营业员</span>${saleFilterHost('salespersonId')}</label>
 <div class="tc-filter-actions">${b(`<span class="iw-filter-icon" aria-hidden="true">☷</span><span>${U.moreFilters?'收起筛选':'高级筛选'}</span>${moreCount?`<span class="iw-filter-count">${moreCount}</span>`:''}<span aria-hidden="true">${U.moreFilters?'▴':'▾'}</span>`,'more-filter',`aria-expanded="${U.moreFilters}" aria-controls="sale-extra-filters"`,'tc-filter-toggle')}<button class="btn primary" ${U.listLoading?'disabled':''}>查询</button>${b('重置','reset')}</div>
 </div>
 ${U.moreFilters?`<div class="tc-filter-row tc-filter-secondary" id="sale-extra-filters"><label class="tc-number-field"><span>单号</span><input name="q" data-filter="number" aria-label="销货单号" autocomplete="off" value="${h(f.number)}" placeholder="输入单号模糊搜索"></label><label><span>客户</span>${saleFilterHost('customerId')}</label><label><span>出库仓</span>${saleFilterHost('warehouseId')}</label></div>`:''}
 </form>
 <p class="ui-query-note" role="status" data-pending="${saleFiltersChanged()}">${saleFiltersChanged()?'条件已修改，点击“查询”更新结果。':'修改条件后点击“查询”；“重置”恢复全部结果。'}</p>
 <div id="sale-list-scroll" class="tc-list-scroll">${U.listLoading?'<div class="iw-loading" role="status"><span class="iw-spinner" aria-hidden="true"></span><strong>正在查询销货单</strong></div>':U.listError?`<div class="tc-empty" role="alert">${h(U.listError)} ${b('重试','query')}</div>`:`<table><thead><tr>${['日期','销货单号','状态','业务类型','营业厅','营业员','商品信息','数量','金额','最后更新','操作'].map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${pageRows.map(d=>`<tr><td>${h((d.date||'').slice(0,10))}</td><td>${b(h(d.id),'open',`data-id="${h(d.id)}"`,'tc-link')}</td><td><span class="tc-state-tag ${stateClass(d)}">${statusLabel(d)}</span></td><td>${h(A.type(d)==='销售'?'销售':'退货/换货')}</td><td title="${h(d.storeName||'')}">${h(d.storeName||'')}</td><td title="${h(d.salespersonName||staff(d.salespersonId))}">${h(d.salespersonName||staff(d.salespersonId))}</td><td>${salesListProducts(d)}</td><td class="tc-num">${h(A.type(d)==='销售'?salesUnits(d.salesFacts.units):'退'+salesUnits(K.totals({lines:A.incoming(d)}).units)+' · 换'+salesUnits(K.totals({lines:A.outgoing(d)}).units))}</td><td class="tc-num">${K.money(A.amounts(d).difference)}</td><td>${h(updatedMinute(d.updated))}</td><td>${b('查看','open',`data-id="${h(d.id)}"`,'tc-link')}</td></tr>`).join('')}</tbody></table>${!pageRows.length?'<div class="tc-empty">没有符合条件的销货单</div>':''}`}</div>
 <footer class="tc-foot tc-list-pagination"><span class="sale-pagination-count"><select id="sale-page-size" class="tc-page-size" aria-label="每页销货单数量">${[20,50,100,200].map(n=>`<option value="${n}" ${n===U.pageSize?'selected':''}>${n}张/页</option>`).join('')}</select><span>共 ${total.toLocaleString('zh-CN')} 张，当前第 ${total?(U.page-1)*U.pageSize+1:0}–${Math.min(U.page*U.pageSize,total)} 张</span></span><nav aria-label="销货单列表分页">${b('上一页','page',`data-page="${U.page-1}" ${U.page===1?'disabled':''}`)}${pageNumbers.map((n,i)=>(i&&n-pageNumbers[i-1]>1?'<span>…</span>':'')+b(String(n),'page',`data-page="${n}" aria-label="第${n}页" ${n===U.page?'aria-current="page"':''}`)).join('')}${b('下一页','page',`data-page="${U.page+1}" ${U.page===pages?'disabled':''}`)}<span>第 ${U.page} / ${pages} 页</span></nav></footer></section>`;
}
```

## Original lines 103-118

```javascript
function lineTable(){
 const columns=['款号／商品名称','颜色','版型','尺码','数量','参考零售价','折扣','成交单价','金额','操作'];
 const rows=entryDoc().lines.map(l=>{
  const staged=(U.entries||[]).find(e=>e.lineId===l.id);
  if(staged&&canEdit())return entryRow(staged);
  if(U.identityEdit?.id===l.id&&canEdit())return identityRow(U.identityEdit);
  const fit=l.fit||C.fit?.(l.fitId)?.name||p(l.productId)?.fit||'未设置版型';
  const name=`<strong>${h(p(l.productId)?.displayId||l.productId)}</strong><span class="sale-product-name" title="${h(l.name)}">${h(l.name)}</span>`;
  return `<tr data-line="${h(l.id)}"><td><div class="sale-product-cell">${identityTrigger(l,name,'商品')}${l.gift?'<span class="sale-gift">赠品</span>':''}</div></td><td>${identityTrigger(l,h(l.color),'颜色')}</td><td>${identityTrigger(l,h(fit),'版型')}</td><td>${identityTrigger(l,h(l.size),'尺码')}</td><td>${canEdit()?`${direction(l)}<input class="${l.quantity<0?'negative':''}" data-line-qty="${h(l.id)}" type="text" inputmode="numeric" aria-label="${h(l.productId+' '+l.color+' '+l.size)} 数量" value="${h(l.quantity)}">`:`<span class="${l.quantity<0?'negative':''}">${A.type(U.doc)==='退货/换货'?(l.quantity<0?'退回 ':'换出 '):''}${h(l.quantity)}</span>`}</td><td class="sale-num sale-muted">${l.referenceCents==null?'':K.money(l.referenceCents)}</td><td>${discountField(l)}</td><td>${canEdit()&&!l.gift?`<input data-line-price="${h(l.id)}" type="text" inputmode="decimal" aria-label="${h(l.productId+' '+l.color+' '+l.size)} 成交单价" placeholder="待填写" value="${h(U.rawPrices[l.id]??(l.priceCents==null?'':K.money(l.priceCents)))}">`:K.money(l.priceCents)}</td><td class="sale-num" data-line-amount="${h(l.id)}">${l.priceCents==null?'待填写':K.money(l.priceCents*l.quantity)}</td><td>${rowActions(l)}</td></tr>`;
 }).join('');
 const html=`<table class="sale-lines-table"><colgroup>${[270,100,122,84,80,95,90,108,99,142].map(width=>`<col style="width:${width}px">`).join('')}</colgroup><thead><tr>${columns.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows}${canEdit()?entries().filter(e=>!e.lineId).map(entryRow).join(''):''}</tbody></table>`;
 return sectionIncoming()?html.replaceAll('成交单价','退货单价'):html;
}
function sectionIncoming(){return A.type(U.doc)==='退货'||A.type(U.doc)==='换货'&&(U.renderSection||U.section)==='in'}
function entryDoc(){if(A.type(U.doc)!=='换货'||(U.renderSection||U.section)!=='in')return U.doc;return {get lines(){return U.doc.returnLines||(U.doc.returnLines=[])},set lines(v){U.doc.returnLines=v},warehouseId:U.doc.returnWarehouseId,adjustmentCents:0}}
function businessTypeField(){return `<label class="tc-gold-field"><span class="sale-field-label">业务类型 <span class="ui-required">*</span></span>${canEdit()?`<select class="ui-flat-select-source" aria-label="业务类型" data-sale-field="businessType"><option value="" disabled hidden ${U.doc.businessType?'':'selected'}>请选择</option>${['销售','退货/换货'].map(x=>`<option ${U.doc.businessType===x?'selected':''}>${x}</option>`).join('')}</select>`:`<span class="sale-read-value">${A.type(U.doc)==='销售'?'销售':'退货/换货'}</span>`}</label>`}
```

## Original lines 121-138

```javascript
function entrySections(){
 const exchange=A.type(U.doc)==='换货';
 const sections=exchange?[['in','退回商品'],['out','换出商品']]:[['out',A.type(U.doc)==='退货'?'退回商品':'商品明细']];
 return sections.map(([key,title])=>{const active=!exchange||key===(U.section||'out');U.renderSection=key;U.renderRead=!active;const table=lineTable();U.renderRead=false;U.renderSection=null;return `<section class="sale-entry-section" data-business-section="${key}"><div class="tc-section-head sale-section-head"><strong>${title}</strong>${!active&&canEdit()?b('录入'+title,'entry-section',`data-section="${key}"`,'sale-link'):''}</div><div ${active?'id="sale-lines"':''} class="sale-lines">${table}</div></section>`}).join('');
}
function directSummary(){
 const d=U.doc,a=A.amounts(d),qty=lines=>salesUnits(K.totals({lines:lines.filter(l=>!l.gift),adjustmentCents:0}).units);
 return `<div class="sale-summary-primary"><strong>退回 ${h(qty(A.incoming(d)))}</strong><strong>换出 ${h(qty(A.outgoing(d)))}</strong><strong>${a.direction==='收款'?'应收':a.direction==='退款'?'应退':'差额'} ¥${K.money(a.amountCents)}</strong></div>`;
}
function summary(){
 if(A.type(U.doc)!=='销售')return directSummary();
 const d=visibleDraft(),v=salesFacts(d),t=K.totals(d),units=d.lines.reduce((n,l)=>n+Number(l.quantity||0),0),gifts=d.lines.filter(l=>l.gift).reduce((n,l)=>n+Number(l.quantity||0),0),pending=d.lines.filter(l=>l.priceCents===null).length;
 return `<div class="sale-summary-detail"><strong>${t.styles}款 ${units}件</strong>${gifts?`<span>其中赠品${gifts}件</span>`:''}${v.categories.map(c=>`<span class="tc-product-tag" title="${h(c.fullName)}">${h(c.name)}${h(K.unitText(c.units))}</span>`).join('')}${pending?`<span>${pending}条待定价</span>`:''}</div><div class="sale-summary-primary"><strong>销售金额 ¥${K.money(t.gross)}</strong><strong>优惠 ¥${K.money(d.adjustmentCents||0)}</strong><strong>应结 ¥${K.money(t.total)}</strong></div>`;
}
function dueField(d){const amount=A.amounts(d).difference;return `<label class="tc-gold-field sale-due-field"><span class="sale-field-label">应结金额</span><strong class="sale-due-value" data-sale-due>${amount<0?'-':''}¥${K.money(Math.abs(amount))}</strong></label>`}
function adjustmentField(d){
 const applicable=A.type(d)==='销售',value=U.adjustmentRaw??((d.adjustmentCents?'-':'')+K.money(d.adjustmentCents||0));
 return `<label class="tc-gold-field sale-discount-field"><span class="sale-field-label">整单优惠 / 抹零</span>${canEdit()&&applicable?`<input data-document-adjustment aria-label="整单优惠 / 抹零" inputmode="decimal" value="${h(value)}">`:`<span class="sale-read-value">${applicable?'¥'+K.money(d.adjustmentCents||0):''}</span>`}</label>`;
```

## Original lines 163-182

```javascript
function editor(){
 const d=U.doc,editable=canEdit(),canReview=A.canAudit(d,S.session,S.catalog)&&d.status==='未审核';
 return `<section class="tc-workbench tc-editor sale-workbench sale-editor"><div class="tc-head sale-head"><h1>${d.revision?editable?'编辑销货单':'查看销货单':'新增销货单'}</h1><span class="tc-status ${stateClass(d)}">${statusLabel(d)}</span><span id="sale-save-state" class="sale-muted">${dirty()?'· 有未保存修改':d.revision?'· 已保存':'· 未保存'}</span><div class="actions">${b('返回列表','list')}${U.editing?`${d.revision?b('取消修改','cancel-edit')+(d.status==='未审核'?b('作废','delete-doc','','sale-delete-action'):''):''}${b('保存','save',!editable?'disabled':'')}${canReview?b('审核','audit','','primary'):''}`:`${d.status==='未审核'&&S.session?.permissions.includes('save')?b('作废','delete-doc','','sale-delete-action')+b('修改','edit')+(A.canAudit(d,S.session,S.catalog)?b('审核','audit','','primary'):''):''}${d.auditWorkflow&&A.audited(d)&&A.canReverse(S.session,S.catalog)?b('弃审','unaudit'):''}`}${b('导出','export',U.busy?'disabled':'')}${b('打印','print')}${d.revision?b('操作历史','history'):''}</div></div>
 <div class="tc-doc-header sale-doc-header"><div class="tc-gold-doc-fields sale-doc-fields">
 <label class="tc-gold-field sale-date-field"><span class="sale-field-label">单据日期 <span class="ui-required">*</span></span><input type="hidden" data-sale-field="date" value="${h((d.date||'').slice(0,10))}"><span class="tc-arco-date-host" data-sales-date="document" data-sales-readonly="${!editable}"></span></label>
 ${businessTypeField()}
 ${select('营业厅','storeId',S.catalog.stores,d.storeId)}
 ${select('营业员','salespersonId',S.catalog.staff,d.salespersonId)}
 ${select('客户','customerId',S.catalog.customers,d.customerId)}
 ${select('出库仓','warehouseId',D.warehouses,d.warehouseId)}
 <label class="tc-gold-field tc-gold-meta sale-number-field"><span class="sale-field-label">单号</span><strong class="sale-number-value">${d.revision?h(d.id):'保存后生成'}</strong></label>
 ${adjustmentField(d)}
 ${dueField(d)}
 ${SALES_FUNDS_UI.field(d,editable)}
 </div></div>
 <label class="sale-note-row"><span class="sale-field-label">备注</span>${editable?`<input data-sale-field="note" aria-label="备注" placeholder="输入本单备注（可选）" value="${h(d.note)}">`:`<span class="sale-note-read">${h(d.note||'—')}</span>`}</label>
 <div id="sale-error" role="alert">${h(U.error)}${U.conflict?b('查看最新单据','latest','','sale-link'):''}</div>
 ${entrySections()}
 <footer id="sale-summary" class="tc-foot tc-gold-footer sale-summary">${summary()}</footer></section>`;
}
```
