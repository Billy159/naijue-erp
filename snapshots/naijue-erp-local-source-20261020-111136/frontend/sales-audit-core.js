/* Unified Demo sales/returns/exchanges. One atomic state publication, shared stock lock. */
(function(root){'use strict';
const K=root.SALES_CORE, legacyApply=K.apply, legacyBusiness=K.business, legacyValidation=K.validation;
const clone=x=>structuredClone(x), fail=(code,error)=>({ok:false,code,error});
const type=d=>d.businessType||'销售', audited=d=>['已审核','已生效'].includes(d?.status), voided=d=>['已删除','已作废'].includes(d?.status);
const incoming=d=>type(d)==='退货/换货'?d.lines.filter(l=>l.quantity<0).map(l=>({...l,quantity:-l.quantity})):type(d)==='退货'?d.lines:type(d)==='换货'?(d.returnLines||[]):[];
const outgoing=d=>type(d)==='退货/换货'?d.lines.filter(l=>l.quantity>0):type(d)==='退货'?[]:d.lines;
function amounts(d){const sale=K.totals({...d,lines:outgoing(d)}).total,returned=K.totals({lines:incoming(d),adjustmentCents:type(d)==='退货'?d.adjustmentCents:0}).total;const difference=sale-returned;return {sale,returned,difference,direction:difference>0?'收款':difference<0?'退款':'无',amountCents:Math.abs(difference)}}
const methods=()=>root.MASTER_DATA.data.payments.filter(x=>!x.legacyOnly);
const accounts=()=>root.MASTER_DATA.data.fundAccounts;
function payment(d){const a=amounts(d);return {methodId:d.funds?.methodId||d.paymentMethodId||'',accountId:d.funds?.accountId||d.fundAccountId||'',amountCents:d.funds?.amountCents??null,direction:a.direction,manualAmount:!!d.funds?.manualAmount}}
function fundsError(d){const f=payment(d);if(f.direction==='无')return f.amountCents===0?'':'零差额单据资金金额必须为0';if(!methods().some(x=>x.id===f.methodId))return '请选择'+f.direction+'方式';if(!accounts().some(x=>x.id===f.accountId))return '请选择'+f.direction+'账户';if(!Number.isSafeInteger(f.amountCents)||f.amountCents<0)return '请填写有效收退款金额';if(f.amountCents!==amounts(d).amountCents)return '收款金额与单据金额不一致，请核对后再审核';const account=accounts().find(x=>x.id===f.accountId);if(account?.methodIds?.length!==1||account.methodIds[0]!==f.methodId)return '资金账户须配置唯一所属收款方式';return ''}
function role(s,catalog){return s.role||catalog.accounts?.[s.accountId]?.role||(catalog.accounts?.[s.accountId]?.staffId?'营业员':s.permissions.includes('reverse')?'仓库人员':'营业员')}
function canReverse(s,catalog){return ['管理员','仓库人员','warehouse'].includes(role(s,catalog))}
function canAudit(d,s,catalog){return !!s?.permissions.includes('save')&&(canReverse(s,catalog)||d.creator?.id===s.accountId)}
K.business=d=>({...legacyBusiness(d),businessType:type(d),returnWarehouseId:d.returnWarehouseId||'',returnLines:legacyBusiness({...d,lines:d.returnLines||[]}).lines,funds:d.funds||null});
K.validation=function(d,catalog,warehouses){if(!['销售','退货','换货','退货/换货'].includes(d.businessType))return '请选择业务类型';if(type(d)==='退货/换货'&&d.adjustmentCents)return '退货/换货不使用整单优惠';if(type(d)==='退货/换货'&&d.lines.some(l=>l.quantity<0)&&!warehouses.includes(d.returnWarehouseId||d.warehouseId))return '请选择退入仓';const err=legacyValidation({...d,warehouseId:type(d)==='退货/换货'&&!d.lines.some(l=>l.quantity>0)?d.returnWarehouseId||d.warehouseId:d.warehouseId,lines:type(d)==='退货/换货'?d.lines.map(l=>({...l,quantity:Math.abs(l.quantity)})):d.lines,paymentMethodId:''},catalog,warehouses);if(err)return err.replace('销售明细；空单无需保存',type(d)==='退货'?'退回商品':'商品明细');if(!['销售','退货','换货','退货/换货'].includes(type(d)))return '请选择业务类型';if(type(d)==='换货'){if(!warehouses.includes(d.returnWarehouseId))return '请选择退入仓';const e=legacyValidation({...d,lines:d.returnLines||[],warehouseId:d.returnWarehouseId,adjustmentCents:0,paymentMethodId:''},catalog,warehouses);if(e)return '退回商品：'+e.replace('销售明细；空单无需保存','退回明细')}return ''};
function stockImpact(d,sign,map){for(const [lines,warehouse,factor] of [[outgoing(d),d.warehouseId,-1],[incoming(d),['退货','退货/换货'].includes(type(d))?d.warehouseId:d.returnWarehouseId,1]])for(const l of lines){const key=JSON.stringify([l.productId,l.colorId,l.sizeId,warehouse]);map.set(key,(map.get(key)||0)+sign*factor*l.quantity)}}
K.apply=function(original,c,context,now=Date.now()){
 if(c.type==='return')return fail('HISTORICAL_ONLY','历史退换记录仅供查询；请新增销货单并选择退货或换货');
 if(c.type==='snapshot')return legacyApply(original,c,context,now);
 if(c.type==='work'){
  const saved=original.salesDocs?.find(d=>d.id===(original.salesOrigins?.[c.docId]||c.docId));
  if(voided(saved))return fail('STATE','已作废单据不能继续录入');
  return legacyApply(original,c,context,now);
 }
 const s=context.session;if(!s||s.expires<=now)return fail('SESSION','登录已失效，本次输入已保留');if(!s.permissions.includes('save'))return fail('PERMISSION','当前账号不能修改销货单');
 if(c.type!=='write'||!c.requestId||!['save','audit','unaudit','void','delete'].includes(c.kind))return fail('COMMAND','无效的销货操作');
 const st=clone(original);st.salesDocs??=[];st.salesRequests??={};st.salesSeq??=0;st.fundsRecords??=[];
 const key=s.accountId+'|'+c.requestId,fp=JSON.stringify(c),prior=st.salesRequests[key];if(prior)return prior.fingerprint===fp?{ok:true,doc:clone(prior.doc),replayed:true,state:st}:fail('REQUEST','同一次请求内容已改变');
 const doc=st.salesDocs.find(x=>x.id===(st.salesOrigins?.[c.docId]||c.docId));
 const allowed=d=>s.warehouses.includes(d.warehouseId)&&(!d.storeId?s.salesScope!=='ownStore':!context.catalog.accounts||context.catalog.accounts[s.accountId]?.storeIds.includes(d.storeId));
 if(doc&&!allowed(doc))return fail('SCOPE','当前账号不能操作其他营业厅的单据');
 if((doc?.revision||0)!==c.baseRevision)return {...fail('REVISION','单据已更新，请核对最新版本；本次输入已保留'),latest:clone(doc)};
 if(voided(doc))return fail('STATE','已作废单据不能继续操作');
 if(doc&&!doc.auditWorkflow)return fail('HISTORICAL_ONLY','历史销货单仅供查询，保持原库存及成交记录');
 if(doc?.source==='历史归档')return fail('MIGRATION','历史归档仅供查阅');
 const next=doc?clone(doc):{id:'DEMO-XH-'+String(++st.salesSeq).padStart(6,'0'),revision:0,creator:{id:s.accountId,name:s.name},created:new Date(now).toISOString(),source:'Demo录入',history:[],links:[]};
 if(c.kind==='save'){
  if(audited(doc))return fail('STATE','请由仓库人员弃审后再修改');
  if(!c.draft)return fail('VALIDATION','单据内容不可用');
  if(Object.hasOwn(c.draft,'creator')&&!c.draft.creator?.id)return fail('VALIDATION','请选择创建者');
  const creatorId=c.draft.creator?.id||doc?.creator?.id||s.accountId;
  if(creatorId!==(doc?.creator?.id||s.accountId)&&(role(s,context.catalog)!=='管理员'||!s.creatorCandidates?.some(x=>x.id===creatorId)))return fail('PERMISSION','当前账号不能选择其他创建者');
  next.creator=clone(creatorId===s.accountId?{id:s.accountId,name:s.name}:s.creatorCandidates?.find(x=>x.id===creatorId)||doc?.creator);
  for(const k of ['businessType','returnWarehouseId','returnLines','funds','customerId','warehouseId','salespersonId','date','department','storeId','note','adjustmentCents','lines','defaults'])next[k]=clone(c.draft[k]??(['lines','returnLines'].includes(k)?[]:k==='adjustmentCents'?0:''));
  if(!['销售','退货/换货'].includes(next.businessType))return fail('VALIDATION','请选择销售或退货/换货');next.businessType=type(next);next.paymentMethodId=c.draft.funds?.methodId||c.draft.paymentMethodId||'';next.fundAccountId=c.draft.funds?.accountId||c.draft.fundAccountId||'';next.status='未审核';next.auditWorkflow=1;
  if(!allowed(next))return fail('SCOPE','当前账号不能操作所选营业厅或仓库');
 }else if(!doc)return fail('STATE','请先保存销货单');
 if(c.kind==='audit'){
  if(!canAudit(doc,s,context.catalog))return fail('PERMISSION','营业员只能审核自己录入的单据');
  if(audited(doc))return fail('STATE','该单已审核，不会重复生效');
  next.status='已审核';
 }
 if(['save','audit'].includes(c.kind)){

  const warehouses=s.operationWarehouses||s.warehouses,err=K.validation(next,context.catalog,warehouses);if(err)return fail('VALIDATION',err);
  for(const field of ['lines','returnLines'])for(const l of next[field]||[]){const p=context.products.find(x=>x.id===l.productId),ci=p?.colorIds.indexOf(l.colorId),si=p?.sizeIds.indexOf(l.sizeId);if(s.productIds&&!s.productIds.includes(l.productId))return fail('SCOPE','商品不在可查看范围');if(!K.validSpec(p,ci,si))return fail('SPEC','商品规格不存在或条码绑定不可用，请核对');const old=doc?.[field]?.find(x=>x.id===l.id&&x.productId===l.productId);const categorySnapshot=old?(old.categorySnapshot||root.SALES_SUMMARY.missingCategory()):root.SALES_SUMMARY.categorySnapshot(p,root.PRODUCT_CATALOG);Object.assign(l,{name:old?.name||p.name,color:p.colors[ci],size:p.sizes[si],unit:old?.unit||p.unit||'件',categorySnapshot:clone(categorySnapshot)});}
  next.lines=type(next)==='退货/换货'?next.lines.map(l=>({...l,grossCents:l.quantity*l.priceCents,discountCents:0,netCents:l.quantity*l.priceCents})):K.allocate(next.lines,next.adjustmentCents);next.returnLines=K.allocate(next.returnLines||[],0);
  for(const [field,list,label]of [['customerId','customers','customerName'],['salespersonId','staff','salespersonName'],['storeId','stores','storeName']])next[label]=context.catalog[list]?.find(x=>x.id===next[field])?.name||'';
  next.warehouseName=context.warehouses.find(x=>x.id===next.warehouseId)?.name||'';next.returnWarehouseName=context.warehouses.find(x=>x.id===next.returnWarehouseId)?.name||'';
  next.funds={...payment(next),accountName:accounts().find(x=>x.id===next.funds?.accountId)?.name||next.funds?.accountName||'',methodName:methods().find(x=>x.id===next.funds?.methodId)?.name||next.funds?.methodName||''};
  next.paymentMethodId=next.funds.methodId;next.fundAccountId=next.funds.accountId;
  if(c.kind==='audit'){const issue=K.minimumPriceIssue({...next,lines:outgoing(next)},context.products);if(issue)return fail('MINIMUM_PRICE',issue.message);const error=fundsError(next);if(error)return fail('FUNDS',error)}
 }
 if(c.kind==='unaudit'){
  if(!canReverse(s,context.catalog))return fail('PERMISSION','营业员不能弃审，请联系仓库人员');
  if(!audited(doc))return fail('STATE','该单未审核，无需弃审');
  if(doc.links?.length||doc.returnRecords?.length)return fail('LINK','该历史销售已有退换关联，不能撤销原库存影响');
  next.status='未审核';next.auditWorkflow=1;next.businessType=type(next);next.returnLines??=[];
 }
 if(c.kind==='void'){if(audited(doc))return fail('STATE','已审核单据请先弃审');next.status='已作废'}
 if(c.kind==='delete'){if(!doc||doc.status!=='未审核')return fail('STATE','只有已保存的未审核单据可以作废');next.status='已作废'}
 const deltas=new Map();if(c.kind==='unaudit')stockImpact(doc,-1,deltas);if(c.kind==='audit')stockImpact(next,1,deltas);
 const changes=[];for(const [key,delta]of deltas){if(!delta)continue;const [id,cid,sid,w]=JSON.parse(key),p=st.products.find(x=>x.id===id),ci=p?.colorIds.indexOf(cid),si=p?.sizeIds.indexOf(sid),before=p?.stock[w]?.[ci]?.[si];if(!Number.isSafeInteger(before)||!Number.isSafeInteger(before+delta))return fail('STOCK','库存资料不完整，整单未生效');changes.push({p,ci,si,w,cid,sid,before,delta})}
 const at=new Date(now).toISOString();next.revision=(doc?.revision||0)+1;next.updated=at;next.updatedBy={id:s.accountId,name:s.name};next.totals=K.totals(next);
 const action={save:doc?'修改未审核单据':'创建未审核单据',audit:'审核',unaudit:'弃审',void:'作废',delete:'作废'}[c.kind];
 for(const b of changes){b.p.stock[b.w][b.ci][b.si]+=b.delta;st.events.push({id:++st.serial,key:[b.p.id,b.ci,b.si,b.w].join('|'),productId:b.p.id,colorId:b.cid,sizeId:b.sid,time:at,type:type(next)+action,delta:b.delta,before:b.before,after:b.before+b.delta,source:next.id,user:s.name,actor:clone(next.updatedBy),version:next.revision,reason:c.reason||action,reversesRevision:c.kind==='unaudit'?doc.revision:null})}
 if(c.kind==='audit'&&next.funds.direction!=='无')st.fundsRecords.push({id:'funds-'+next.id+'-v'+next.revision+'-single',settlementId:'single',documentId:next.id,revision:next.revision,...clone(next.funds),paymentMethodId:next.paymentMethodId,fundAccountId:next.fundAccountId,status:'已生效',time:at,actor:clone(next.updatedBy)});
 if(c.kind==='unaudit')for(const record of st.fundsRecords)if(record.documentId===next.id&&record.status==='已生效')Object.assign(record,{status:'已撤销',reversedAt:at,reversedBy:clone(next.updatedBy),reversedRevision:next.revision});
 const snap=d=>d?clone(Object.fromEntries(Object.entries(d).filter(([k])=>k!=='history'))):null;
 const historyChanges=c.kind==='save'?K.changes(doc,next):[];
 if(c.kind==='save'&&doc?.creator?.id!==next.creator?.id)historyChanges.push({field:'creator',before:doc?.creator?.name||'',after:next.creator?.name||''});
 if(c.kind==='save')for(const field of ['businessType','returnWarehouseId','returnLines','funds'])if(JSON.stringify(doc?.[field])!==JSON.stringify(next[field]))historyChanges.push({field,before:clone(doc?.[field]??''),after:clone(next[field]??'')});
 historyChanges.push({field:'status',before:doc?.status||'未保存',after:next.status});
 next.history.push({id:'sales-history-'+(++st.serial),documentId:next.id,action,actor:clone(next.updatedBy),time:at,reason:c.reason||action,revisionBefore:doc?.revision||0,revisionAfter:next.revision,changes:historyChanges,before:snap(doc),after:snap(next)});
 if(doc)st.salesDocs[st.salesDocs.indexOf(doc)]=next;else{st.salesDocs.push(next);st.salesOrigins??={};st.salesOrigins[c.docId]=next.id;for(const r of st.salesWork||[])if(r.docId===c.docId&&r.actor.id===s.accountId)r.docId=next.id}
 st.salesRequests[key]={fingerprint:fp,doc:clone(next)};return {ok:true,state:st,doc:clone(next)};
};
root.SALES_AUDIT={type,audited,incoming,outgoing,amounts,payment,fundsError,methods,accounts,canReverse,canAudit};
})(window);
