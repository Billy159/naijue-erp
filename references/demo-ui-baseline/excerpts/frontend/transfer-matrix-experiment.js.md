# frontend/transfer-matrix-experiment.js - Frozen UI excerpts

Source commit: `b8bcfe3eb43f6a7be0c60a77c6d6fb99e2ed5dd3`. Full source SHA256: `4cb72dcf248c21aa9fcc7f9988533f4e788bbbf386601bc0fb048061bc182e5d`.

Boundary: Transfer size matrix, rows and initial entry dock. Excludes fixture/scan commit/replacement commit/save paths; adapt to genuine SKU identities. These are incomplete reference fragments; unresolved expressions are preserved. Empty data has not been inserted to fabricate a runnable module.

## Original lines 8-10

```javascript
function specControl(kind,e,p){const values=kind==='color'?colorsFor(p):fitsFor(p,e.colorId),value=kind==='color'?e.colorId:e.fitId,selected=values.find(x=>x.id===value),label=kind==='color'?'颜色':'版型',disabled=!p||kind==='fit'&&!e.colorId;return INTERACTION_COMMON.specButton({id:'mx-transfer-'+kind,attribute:'data-mx="spec-'+kind+'"',label,selected:selected?.name,disabled})}
function fitControl(e,p){return specControl('fit',e,p)}
function productEntry(e,p){return `<div class="mx-entry-identity${p?' has-product':''}"><input id="mx-transfer-search" placeholder="商品款号 / 名称 / 条码" aria-label="调拨行内找货或扫描条码" autocomplete="off" spellcheck="false" value="${h(e.query)}">${p?`<span class="mx-inline-name" title="${h(p.name)}">${h(p.name)}</span>`:''}</div>`}
```

## Original lines 24-26

```javascript
function button(text,a,attrs=''){return `<button type="button" class="btn" data-mx="${a}" ${attrs}>${text}</button>`}
function alignedGroup(group,count){const sizes=[...group.sizes],missing=Math.max(0,count-sizes.length);if(missing){const noSize=sizes.at(-1)?.name==='无尺码'?sizes.pop():null;for(let i=0;i<missing;i++)sizes.push({empty:true,id:'empty:'+i,name:''});if(noSize)sizes.push(noSize)}return {...group,sizes}}
function tableSection(g,body,print=false,{className='',header=true}={}){return `<section class="mx-section ${className}" data-size-system="${h(g.key)}"${print?'':` style="--mx-table-width:${592+g.sizes.length*56}px"`}><table class="mx-table"><colgroup><col style="width:${print?'23%':'280px'}"><col style="width:${print?'9%':'76px'}"><col style="width:${print?'10%':'88px'}">${g.sizes.map(()=>`<col style="width:${print?(50/g.sizes.length)+'%':'56px'}">`).join('')}<col style="width:${print?'8%':'52px'}">${print?'':'<col style="width:96px">'}</colgroup>${header?`<thead><tr><th class="mx-product">款号／商品名称</th><th class="tc-color mx-color">颜色</th><th class="mx-fit-col">版型</th>${g.sizes.map(size=>size.empty?'<th class="mx-size-gap" aria-hidden="true"></th>':`<th data-size-id="${h(size.id)}">${h(size.name)}</th>`).join('')}<th class="tc-subtotal">小计</th>${print?'':'<th>操作</th>'}</tr></thead>`:''}<tbody>${body}</tbody></table></section>`}
```

## Original lines 60-87

```javascript
function rowMarkup(r,g,doc,print){
 const p=r.product,c=r.c,fit=C.fit(p.fitId)?.name||p.fit||'未设置版型';
 const cells=g.sizes.map(column=>{
  if(column.empty)return '<td class="mx-size-gap" aria-hidden="true"></td>';
  const matches=cellSizes(p,g,column,print);
  if(!matches.length)return '<td class="mx-size-blank"></td>';
  if(matches.length>1)return '<td>'+(print?h(matches.reduce((sum,size)=>sum+(Number(doc.q[p.id+'|'+c+'|'+p.sizeIds.indexOf(size.id)])||0),0)||''):historyQuantityControl(p,c,column,matches,'doc'))+'</td>';
  return '<td>'+matches.map(size=>{
   const i=p.sizeIds.indexOf(size.id),key=p.id+'|'+c+'|'+i,value=doc.q[key]??'';
   if(i<0||!canWriteSpec(p,c,i)&&!Number(value))return '';
   const content=print?h(Number(value)>0?value:''):!editable()?h(value||0):`<input class="tc-qty" inputmode="numeric" data-t-qty="${h(key)}" data-t-product="${h(p.id)}" data-t-color="${h(p.colorIds[c])}" data-t-size="${h(size.id)}" aria-label="${h(p.id+' '+p.colors[c]+' '+fit+' '+size.name)} 本次调拨数量" value="${h(value)}">`;
   return content;
  }).join('<br>')+'</td>';
 }).join('');
 const editMark='<span class="mx-spec-edit-mark" aria-hidden="true">改</span>';
 const color=editable()&&!print?`<button type="button" class="mx-spec-edit" data-mx="replace-color" data-key="${h(r.key)}" aria-label="更换 ${h(p.id)} 的颜色"><span class="mx-spec-edit-value">${h(p.colors[c])}</span>${editMark}</button>`:h(p.colors[c]);
 const fitCell=editable()&&!print?`<button type="button" class="mx-spec-edit" data-mx="replace-fit" data-key="${h(r.key)}" aria-label="更换 ${h(p.id)} 的版型"><span class="mx-spec-edit-value">${h(fit)}</span>${editMark}</button>`:h(fit);
 return `<tr data-mx-row="${h(r.key)}" data-row-id="${h(r.id||'')}"><td class="mx-product"><span class="mx-product-line"><strong title="${h(p.displayId||p.id)}">${h(p.displayId||p.id)}</strong><span title="${h(p.name)}">${h(p.name)}</span></span></td><td class="tc-color mx-color" title="${h(p.colors[c])}">${color}</td><td class="mx-fit-col" title="${h(fit)}">${fitCell}</td>${cells}<td class="tc-subtotal" data-t-row="${h(r.key)}">${p.sizes.reduce((n,_,i)=>n+(!g.key.startsWith('mapped:')||p.legacySizeRecords[i]?.standardGroup===g.name?Number(doc.q[p.id+'|'+c+'|'+i])||0:0),0)}</td>${print?'':`<td><div class="mx-actions"><button class="btn" data-t="detail" data-id="${h(p.id)}" data-c="${c}">查看</button>${editable()?`<button class="btn" data-t="delete-color" data-id="${h(p.id)}" data-c="${c}">删除</button>`:''}</div></td>`}</tr>`;
}
// Group display columns by the confirmed new size group; original IDs remain command keys.
function transferSections(source){return H.displaySections(source,source.map(row=>product(row.p)).filter(Boolean),C)}
function renderTable(print=false,doc=T.doc){const source=print?[...new Set(Object.entries(doc.q).filter(([,n])=>Number(n)>0).map(([k])=>k.split('|').slice(0,2).join('|')))].map(key=>({p:key.split('|')[0],c:Number(key.split('|')[1]),key})):rows();const groups=transferSections(source),next=!print&&E.pending.replace?product(E.pending.productId):null,nextGroup=next?{...H.system(next,C),sizes:H.columns(next,C)}:null,draft=!print&&editable()&&!E.pending.replace?product(E.pending.productId):null,draftGroup=draft?transferSections([{p:draft.id,c:0}])[0]:null,count=Math.max(0,...groups.map(g=>g.sizes.length),nextGroup?.sizes.length||0,draftGroup?.sizes.length||0);let html='';for(const g of groups.map(group=>alignedGroup(group,count))){let body='';for(const row of g.rows){if(!print&&E.pending.replace===row.key){const meta=nextGroup?alignedGroup(nextGroup,count):g;if(meta.key!==g.key){if(body)html+=tableSection(g,body);body='';html+=tableSection(meta,replacementRow(row,meta));}else body+=replacementRow(row,g)}else body+=rowMarkup(row,g,doc,print)}if(body)html+=tableSection(g,body,print)}return html}
function draftRow(g){const e=E.pending,p=product(e.productId),c=p?.colorIds.indexOf(e.colorId)??-1,ready=!!p&&c>=0&&e.fitId===(p.fitId||'');let total=0;
 const cells=g.sizes.map(column=>{if(column.empty||!ready)return `<td class="${column.empty?'mx-size-gap':'mx-size-blank'}"></td>`;const sizes=cellSizes(p,g,column,false);if(sizes.length>1){total+=sizes.reduce((sum,size)=>sum+(Number(e.quantities[size.id])||0),0);return '<td>'+historyQuantityControl(p,c,column,sizes,'draft')+'</td>'}return '<td>'+sizes.map(size=>{const i=p.sizeIds.indexOf(size.id);if(i<0||!canWriteSpec(p,c,i))return '';const value=e.quantities[size.id]??'';total+=Number(value)||0;return `<input class="tc-qty" inputmode="numeric" data-mx-draft-qty="${h(size.id)}" aria-label="${h(p.id+' '+p.colors[c]+' '+(C.fit(p.fitId)?.name||p.fit||'')+' '+size.name)} 本次调拨数量" value="${h(value)}">`}).join('')+'</td>'}).join('');
 return `<tr class="mx-draft-row"><td class="mx-product">${productEntry(e,p)}</td><td class="tc-color mx-color">${colorControl(e,p)}</td><td class="mx-fit-col">${fitControl(e,p)}</td>${cells}<td class="tc-subtotal">${total||''}</td><td class="ui-action-cell">${p?`<div class="mx-actions"><button type="button" class="btn" data-t="detail" data-id="${h(p.id)}" data-c="${c}">查看</button>${button('删除','draft-clear')}</div>`:''}</td></tr>`}
function draftDock(){const groups=transferSections(rows()),p=product(E.pending.productId)||groups.at(-1)?.rows.at(-1)?.product||D.products.find(x=>x.groupId==='UPPER'&&F.specs(x).length)||D.products.find(x=>F.specs(x).length),group=p?transferSections([{p:p.id,c:0}])[0]:{key:'draft-empty',sizes:[],rows:[]};if(!group)return '';const count=Math.max(group.sizes.length,...groups.map(x=>x.sizes.length),0),showHeader=!groups.length||group.key!==groups.at(-1).key;return tableSection(alignedGroup(group,count),draftRow(alignedGroup(group,count)),false,{className:'mx-draft-dock',header:showHeader})}
function pinDraftIfNeeded(){const box=$('#tc-lines'),dock=box?.querySelector('.mx-draft-dock');if(!dock)return;dock.classList.remove('mx-draft-pinned');dock.classList.toggle('mx-draft-pinned',box.scrollHeight>box.clientHeight+1)}
function render(){if(!active())return;syncRows();const layout=$('.tc-layout');if(layout)layout.classList.add('mx-transfer-layout');const head=$('.tc-section-head');if(head){const hint=head.querySelector('#tc-lines-hint')?.textContent||'';head.innerHTML='<strong>调拨明细</strong><span id="tc-lines-hint">'+h(hint)+'</span><div class="actions">'+button('扫码录入','scan')+button('导出','export')+'</div>'}const actions=head?.querySelector('.actions');if(actions){actions.classList.add('tc-entry-actions');$('.tc-doc-header')?.append(actions)}const box=$('#tc-lines');if(box){box.classList.add('mx-results');box.innerHTML=renderTable()+(editable()&&!E.pending.replace?draftDock():'');pinDraftIfNeeded();box.scrollTop=T.scroll.top;box.scrollLeft=T.scroll.left}}
```
