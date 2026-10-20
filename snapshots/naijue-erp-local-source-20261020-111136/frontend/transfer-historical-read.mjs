/** A read-only projection. It never creates effective SKU cells or command DTOs. */
export const KIND='BOUND_TRANSFER_READ_ONLY';
export const SCHEMA='TRANSFER_HISTORICAL_READ_V1';
const CONTRACT='ac2a22a713120323626f01e2e96e570082f3f0bce88db9dda59c23ac7ac86188';
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
const hash=v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
const invalid=reason=>{throw Error('历史调拨资料无法安全展示：'+reason);};
const text=v=>typeof v==='string'&&v!==''?v:null;
const equals=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const clone=v=>structuredClone(v);
export const isHistoricalTransfer=d=>d?.kind===KIND&&d.schemaVersion===SCHEMA;

export function isBoundReadonlyTransfer(row){
 const binding=row?.source_identity?.currentSourceBinding;
 if(binding===undefined)return false;
 const p=row.read_projection,b=row.body?.readProjection;
 if(row.document_type!=='TRANSFER'||row.original_imported!==true||row.legacy_readonly!==true
  ||binding.schemaVersion!=='T32-APPROVED-CURRENT-SOURCE-BINDING-v1'||binding.contractSha256!==CONTRACT
  ||binding.mode!=='BOUND_READONLY_CURRENT_DOCUMENT'||binding.readonly!==true||binding.auditAllowed!==false
  ||binding.historicalStateTimelineConfirmed!==false||binding.historicalStateAtExactCutoffConfirmed!==false
  ||binding.statusSemantic!=='CURRENT_IMPORTED_READONLY_CONTAINER'||binding.groupingEvidence?.kind!=='CONFIRMED_COMPLETE_CURRENT_EXPORT_GROUP'
  ||!uuid(row.id)||!Number.isSafeInteger(row.current_revision)||row.current_revision<1
  ||!object(p)||!object(b)||!object(row.body?.sourceFacts)||!Array.isArray(row.body.lines)||!row.body.lines.length
  ||!Array.isArray(row.body.sourceFacts.lines)||row.body.sourceFacts.lines.length!==row.body.lines.length
  ||!Array.isArray(binding.bindings)||binding.bindings.length!==row.body.lines.length*2)return invalid('只读来源证明不完整');
 for(const projection of [p,b])if(projection.schemaVersion!=='T20-CURRENT-SOURCE-TRANSFER-READ-v1'
  ||projection.readonly!==true||projection.auditAllowed!==false||projection.identityKind!=='CURRENT_DISPLAY_ONLY'
  ||projection.historicalSkuEvidenceClaimed!==false||projection.sourceGroupKey!==binding.sourceGroupKey
  ||projection.approvalManifestSha256!==binding.approvalManifestSha256||!hash(projection.approvalManifestSha256)
  ||!hash(projection.originalBodySha256))return invalid('只读投影不一致');
 if(p.originalBodySha256!==b.originalBodySha256)return invalid('原文摘要不一致');
 return true;
}

function scaled(value){
 if(value===null||value===undefined||value==='')return null;
 if(typeof value!=='string'||!/^[-+]?\d+(?:\.\d{1,4})?$/.test(value))return invalid('原数量格式');
 const negative=value.startsWith('-'),[whole,fraction='']=value.replace(/^[-+]/,'').split('.');
 return (BigInt(whole)*10000n+BigInt(fraction.padEnd(4,'0')))*(negative?-1n:1n);
}
const decimal=n=>{const negative=n<0n,absolute=negative?-n:n,fraction=String(absolute%10000n).padStart(4,'0').replace(/0+$/,'');return (negative?'-':'')+String(absolute/10000n)+(fraction?'.'+fraction:'');};
export function quantitySummary(lines){
 const units=new Map();
 for(const line of lines){const unit=line.unit??null;let entry=units.get(unit);if(!entry){entry={unit,value:0n,unknown:false};units.set(unit,entry);}const n=scaled(line.quantity);if(n===null)entry.unknown=true;else entry.value+=n;}
 return [...units.values()].map(({unit,value,unknown})=>({unit,quantity:unknown?null:decimal(value),knownQuantity:decimal(value),complete:!unknown}));
}

export function historicalTransfer(row,{rawSkus=new Map(),products=[],warehouseName=()=>null}={}){
 if(!isBoundReadonlyTransfer(row))return invalid('不是受证明的历史只读单据');
 const body=row.body,header=body.header||{},seen=new Set(),original=body.sourceFacts;
 const lines=body.lines.map((line,index)=>{
  const facts=line.sourceFacts,prior=original.lines[index],identity=line.readIdentity;
  if(!object(facts)||!object(prior)||!object(facts.originalFields?.fields)||!equals(facts,prior)
   ||!text(facts.source_line_id)||seen.has(facts.source_line_id)||!uuid(line.sku_id)||!uuid(line.product_id)
   ||identity?.kind!=='CURRENT_DISPLAY_ONLY'||identity.historicalSkuEvidenceClaimed!==false
   ||identity.primaryLineId!==facts.source_line_id||!text(identity.inLineId)||!text(identity.outLineId)
   ||!equals(line.originalFields,facts.originalFields)||line.source_quantity!==facts.source_quantity
   ||scaled(line.quantity)!==scaled(facts.source_quantity))return invalid('第'+(index+1)+'行原始事实或身份不一致');
  seen.add(facts.source_line_id);
  const raw=rawSkus.get(line.sku_id);
  if(raw&&raw.product_id!==line.product_id)return invalid('当前商品与 SKU 归属冲突');
  const fields=facts.originalFields.fields,product=products.find(p=>p.uuid===line.product_id||p.id===line.product_id);
  return {position:index+1,sourceLineId:facts.source_line_id,originalSkuId:facts.sku_id??null,
   original:{code:fields['存货编码']??facts.source_product_code??null,name:fields['存货名称']??facts.source_product_name??null,
    color:fields['颜色']??facts.source_color_name??null,size:fields['尺码']??facts.source_size_name??null,fit:fields['版型']??null,
    category:fields['所属类别']??null,quantity:facts.source_quantity??null,unit:facts.unit??null},
   quantity:facts.source_quantity??null,unit:facts.unit??null,
   currentBinding:{kind:'CURRENT_DISPLAY_ONLY',historicalSkuEvidenceClaimed:false,skuId:line.sku_id,productId:line.product_id,
    code:product?.displayId||product?.id||null,name:product?.name||null,color:raw?.options?.COLOR?.name??null,
    size:raw?.options?.SIZE?.name??null,fit:raw?.fit_id??null},
   mappingReason:raw?.historicalUnmappedReason??null,readIdentity:clone(identity),sourceFacts:clone(facts)};
 });
 const totals=quantitySummary(lines),categories=new Map(),tags=new Map();
 for(const line of lines){const id=line.currentBinding.productId;let names=categories.get(id);if(!names){names=new Set();categories.set(id,names);}const name=line.original.category;names.add(name===null||name===undefined||name===''?null:String(name));}
 for(const names of categories.values()){
  const known=[...names].filter(name=>name!==null),state=names.size===1?(known.length?'KNOWN':'UNKNOWN'):known.length===1?'INCOMPLETE':'CONFLICT';
  const name=state==='KNOWN'?known[0]:state==='UNKNOWN'?'未提供类别':state==='INCOMPLETE'?'类别未完整':'类别不一致',key=state+'\0'+name;
  const tag=tags.get(key)||{name,state,count:0};tag.count++;tags.set(key,tag);
 }
 const dto={kind:KIND,schemaVersion:SCHEMA,readonly:true,auditAllowed:false,uuid:row.id,id:row.number??null,
  version:row.version??null,currentRevision:row.current_revision,_detail:Array.isArray(row.history),
  date:header.business_date??row.business_day??null,status:row.status==='DELETED'?'已作废':row.status==='APPROVED'?'已审核':'未审核',
  from:header.source_from_warehouse_id??null,to:header.source_to_warehouse_id??null,
  fromName:warehouseName(header.source_from_warehouse_id),toName:warehouseName(header.source_to_warehouse_id),
  creator:row.creator?.name??null,created:header.created_at??null,updated:header.updated_at??null,note:header.note??header.source_payload?.note??null,
  lines,quantityTotals:totals,productCount:new Set(lines.map(l=>l.currentBinding.productId)).size,
  productTags:[...tags.values()],sourceFacts:clone(original),readProjection:clone(row.read_projection),history:[]};
 dto.history=(row.history||[]).map(history=>{
  // Each revision supplies its own proof. Never copy the current proof to older bodies.
  let after=null,error=null;
  try{after=historicalTransfer({...history,number:row.number,history:[]},{rawSkus,products,warehouseName});}catch(e){error=e.message;}
  return {version:history.version??null,revision:history.revision??history.current_revision??null,operation:history.operation??null,
   time:history.created_at??null,actor:history.actor_name??null,after,error,previousAvailable:history.previous_body!==null&&history.previous_body!==undefined};
 });
 return dto;
}

const escape=value=>String(value??'未知').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const quantityLabel=totals=>totals.map(t=>(t.quantity??'未知')+' '+(t.unit??'未知单位')).join(' + ')||'未知';
export function historicalListCells(d){
 const view=`<button type="button" class="btn tc-link" data-th="open" data-uuid="${escape(d.uuid)}">查看</button>`;
 return `<td>${escape(d.date?.slice(0,10))}</td><td><button type="button" class="btn tc-link" data-th="open" data-uuid="${escape(d.uuid)}">${escape(d.id)}</button></td><td><span class="tc-state-tag">${escape(d.status)}</span></td><td>${escape(d.fromName)}</td><td>${escape(d.toName)}</td><td>${d.productTags.length?d.productTags.map(t=>escape(t.name)+' '+t.count).join(' · '):d.productCount+' 款'}</td><td class="tc-num">${escape(quantityLabel(d.quantityTotals))}</td><td>${escape(d.creator)}</td><td>${escape(d.updated)}</td><td>${view}</td>`;
}
const lineTable=lines=>`<div class="tc-history-scroll"><table><thead><tr>${['序号','款号','商品名称','原颜色','原版型','原尺码','原数量','原单位','原 SKU 身份'].map(t=>'<th>'+t+'</th>').join('')}</tr></thead><tbody>${lines.map(l=>`<tr><td>${l.position}</td><td>${escape(l.original.code)}</td><td>${escape(l.original.name)}</td><td>${escape(l.original.color)}</td><td>${escape(l.original.fit)}</td><td>${escape(l.original.size)}</td><td class="tc-num">${escape(l.original.quantity)}</td><td>${escape(l.original.unit)}</td><td>${escape(l.originalSkuId)}</td></tr>`).join('')}</tbody></table></div>`;
export function historicalTransferHtml(d){
 if(!isHistoricalTransfer(d))return invalid('只读展示协议');
 return `<section class="tc-workbench tc-history-read"><div class="tc-head"><h1>查看调拨单</h1><span class="tc-status">${escape(d.status)}</span><div class="actions"><button type="button" class="btn" data-th="list">返回列表</button><a class="btn" href="export-workbench.html?context=transfer&amp;tab=documents&amp;returnTo=transfer" target="_blank" rel="noopener">打印/导出中心</a></div></div><div class="tc-doc-header"><strong>${escape(d.id)}</strong><span>日期：${escape(d.date)}</span><span>调出：${escape(d.fromName)}</span><span>调入：${escape(d.toName)}</span></div><p class="tc-readonly">历史资料只读。原始规格按原文显示；未确认的标准映射保持未知。</p><p>备注：${escape(d.note)}</p>${lineTable(d.lines)}<div class="tc-foot">${d.productCount} 款 · ${escape(quantityLabel(d.quantityTotals))}</div><details><summary>当前资料关联与来源</summary>${d.lines.map(l=>`<p>第 ${l.position} 行：当前 SKU ${escape(l.currentBinding.skuId)}；当前商品 ${escape(l.currentBinding.code)}；映射状态 ${escape(l.mappingReason)}。当前关联不作为原 SKU 实证。</p>`).join('')}</details><details><summary>操作历史（${d.history.length}）</summary>${d.history.map(v=>`<article><p>版本 ${escape(v.version)} · ${escape(v.operation)} · ${escape(v.actor)} · ${escape(v.time)}</p>${v.after?lineTable(v.after.lines):`<p role="status">${escape(v.error||'此版本未提供可验证的原明细')}</p>`}</article>`).join('')||'<p>未提供操作历史。</p>'}</details></section>`;
}
