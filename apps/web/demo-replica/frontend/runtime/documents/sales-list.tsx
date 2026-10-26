import {Pagination} from '../inventory/pagination.tsx';
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { documentRowKey, type NormalSalesRow } from './normal-list-reader.ts';
import type { ReplicaSalesSession } from './sales-session.ts';
import type { SalesFilterDraft, SalesReferenceReader, SalesQueryPageSize, SalesListQuery } from '../../../../src/sales/contracts.ts';
import { emptySalesFilter } from '../../../../src/sales/contracts.ts';
import { pageFacts, salesCount, salesMoney, salesParameters, salesStatusLabels } from '../../../../src/sales/model.ts';
import { HttpQueryError } from '../../../../src/transport/http-query.ts';
import { SalesReferenceFilter, SourceDate, SourceMulti } from './source-controls.tsx';

export interface SalesListViewState { draft:SalesFilterDraft; applied:SalesFilterDraft; size:SalesQueryPageSize;requested?:{sequence:number;draft:SalesFilterDraft};more:boolean; scrollTop:number;scrollLeft:number;reload:boolean }
export const newSalesListViewState=():SalesListViewState=>({draft:emptySalesFilter(),applied:emptySalesFilter(),size:20,more:false,scrollTop:0,scrollLeft:0,reload:false});
const updatedClock=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
function updatedMinute(value:string|null){if(!value)return '';const date=new Date(value);if(Number.isNaN(date.getTime()))return value.replace('T',' ').slice(0,16);const parts=Object.fromEntries(updatedClock.formatToParts(date).map(({type,value})=>[type,value]));return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;}
export function SalesList(p:{session:ReplicaSalesSession;view:SalesListViewState;references:SalesReferenceReader;canCreate:boolean;open:(row:NormalSalesRow)=>void;create:()=>void;onAccessFailure:(error:HttpQueryError)=>void}) {
 const query=p.session.list.list,state=useSyncExternalStore(query.subscribe,query.getSnapshot,query.getSnapshot);
 const [draft,setDraft]=useState(p.view.draft),[more,setMore]=useState(p.view.more),[applied,setApplied]=useState(p.view.applied),[error,setError]=useState('');
 const table=useRef<HTMLDivElement>(null),success=state.success,data=success?.data,busy=state.phase==='loading';
 useEffect(()=>{p.view.draft=draft;p.view.more=more;},[draft,more]);
 const execute=(parameters:SalesListQuery,chosen:SalesFilterDraft)=>{
  const snapshot=structuredClone(chosen);
  void query.run(parameters);
  const request=query.getSnapshot().request;
  if(request)p.view.requested={sequence:request.sequence,draft:snapshot};
 };
 useEffect(()=>{
  const success=state.success,requested=p.view.requested;
  if(success){
   p.view.size=success.parameters.pageSize;
   if(requested?.sequence===success.sequence){p.view.applied=requested.draft;setApplied(requested.draft);}
  }
 },[state.success]);
 useEffect(()=>{if(state.phase==='idle'||p.view.reload){p.view.reload=false;execute(salesParameters(p.view.applied,p.view.size),p.view.applied);}return()=>query.cancel();},[query]);
 useEffect(()=>{if(state.error instanceof HttpQueryError&&['unauthenticated','forbidden'].includes(state.error.kind))p.onAccessFailure(state.error);},[state.error]);
 useLayoutEffect(()=>{if(table.current){table.current.scrollTop=p.view.scrollTop;table.current.scrollLeft=p.view.scrollLeft;}},[]);
 const set=<K extends keyof SalesFilterDraft>(key:K,value:SalesFilterDraft[K])=>setDraft(old=>({...old,[key]:value}));
 const size=state.success?.parameters.pageSize??p.view.size;
 const run=(reset=false)=>{try{const chosen=reset?emptySalesFilter():draft,parameters=salesParameters(chosen,size);if(reset)setDraft(chosen);setError('');p.view.scrollTop=0;p.view.scrollLeft=0;execute(parameters,chosen);}catch{setError('请检查查询条件和日期。');}};
 const facts=pageFacts(data?.page??1,size,data?.exactTotal??null),page=data?.page??1;
 const goto=(n:number)=>{if(success&&n>=1&&BigInt(n)<=facts.pages){p.view.scrollTop=0;execute({...success.parameters,page:n},p.view.applied);}};
 const changed=JSON.stringify(draft)!==JSON.stringify(applied),moreCount=Number(!!draft.number)+Number(!!draft.customer.length)+Number(!!draft.warehouse.length);
 const ref=(key:'hall'|'salesperson'|'customer'|'warehouse',label:string)=><SalesReferenceFilter scope={p.session.scope} reader={p.references} kind={key} label={label} selected={draft[key]} change={value=>set(key,value)} onAccessFailure={p.onAccessFailure}/>;
 return <section className="tc-workbench tc-list" data-document-list="sales"><div className="tc-head"><h1>销货单列表</h1>{p.canCreate&&<button type="button" className="btn primary" onClick={p.create}>新增销货单</button>}</div>
 <form id="sale-filter" className="tc-filters tc-filters-two-row" onSubmit={e=>{e.preventDefault();run();}}><div className="tc-filter-row tc-filter-primary">
 <label className="tc-date-field"><span>开始日期</span><span className="tc-arco-date-host"><SourceDate label="开始日期" value={draft.startDate} change={value=>set('startDate',value)}/></span></label>
 <label className="tc-date-field"><span>结束日期</span><span className="tc-arco-date-host"><SourceDate label="结束日期" value={draft.endDate} change={value=>set('endDate',value)}/></span></label>
 <label className="tc-status-field"><span>状态</span><span className="tc-filter-multi-host"><SourceMulti label="状态" selected={draft.statuses.map(id=>({id,label:salesStatusLabels[id]}))} items={(['DRAFT','APPROVED','VOID'] as const).map(id=>({id,label:salesStatusLabels[id]}))} change={items=>set('statuses',items.map(x=>x.id as 'DRAFT'|'APPROVED'|'VOID'))}/></span></label>
 <label><span>业务类型</span><span className="tc-filter-multi-host"><SourceMulti label="业务类型" selected={draft.businessTypes.map(id=>({id,label:id==='SALE'?'销售':'退货/换货'}))} items={[{id:'SALE',label:'销售'},{id:'RETURN_EXCHANGE',label:'退货/换货'}]} change={items=>set('businessTypes',items.map(x=>x.id as 'SALE'|'RETURN_EXCHANGE'))}/></span></label>
 <label><span>营业厅</span>{ref('hall','营业厅')}</label><label><span>营业员</span>{ref('salesperson','营业员')}</label>
 <div className="tc-filter-actions"><button type="button" className="btn tc-filter-toggle" aria-expanded={more} aria-controls="sale-extra-filters" onClick={()=>setMore(value=>!value)}><span className="iw-filter-icon" aria-hidden>☷</span><span>{more?'收起筛选':'高级筛选'}</span>{moreCount>0&&<span className="iw-filter-count">{moreCount}</span>}<span aria-hidden>{more?'▴':'▾'}</span></button><button className="btn primary" disabled={busy}>查询</button><button type="button" className="btn" onClick={()=>run(true)}>重置</button></div></div>
 {more&&<div className="tc-filter-row tc-filter-secondary" id="sale-extra-filters"><label className="tc-number-field"><span>单号</span><input name="q" aria-label="销货单号" autoComplete="off" value={draft.number} placeholder="输入单号模糊搜索" onChange={e=>set('number',e.target.value)}/></label><label><span>客户</span>{ref('customer','客户')}</label><label><span>出库仓</span>{ref('warehouse','仓库')}</label></div>}</form>
 <p className="ui-query-note" role="status" data-pending={changed}>{changed?'条件已修改，点击“查询”更新结果。':'修改条件后点击“查询”；“重置”恢复全部结果。'}</p>
 <div id="sale-list-scroll" className="tc-list-scroll" ref={table} onScroll={e=>{p.view.scrollTop=e.currentTarget.scrollTop;p.view.scrollLeft=e.currentTarget.scrollLeft;}}>{busy&&<div className="iw-loading" role="status"><span className="iw-spinner" aria-hidden/><strong>正在查询销货单</strong></div>}{(state.phase==='error'||error)&&<div className="tc-empty" role="alert">{error||'销货单读取失败'} <button className="btn" onClick={()=>{if(state.request){setError('');execute(state.request.parameters,p.view.requested?.sequence===state.request.sequence?p.view.requested.draft:p.view.applied);}}}>重试</button></div>}{data?<><table><thead><tr>{['日期','销货单号','状态','业务类型','营业厅','营业员','商品信息','数量','金额','最后更新','操作'].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{data?.items.map(row=><tr key={documentRowKey(row)}><td>{row.businessDate??'—'}</td><td><button className="btn tc-link" onClick={()=>p.open(row)}>{row.number}</button></td><td><span className={'tc-state-tag '+({DRAFT:'doc-pending',APPROVED:'doc-effective',VOID:'doc-void'}[row.status])}>{salesStatusLabels[row.status]}</span></td><td>{row.businessType==='SALE'?'销售':'退货/换货'}</td><td title={row.hallName??''}>{row.hallName??'—'}</td><td title={row.salespersonName??''}>{row.salespersonName??''}</td><td><span className="tc-product-tags" title={row.productSummary.productCount===null?'商品款数未知':row.productSummary.productCount+'款'}>{row.productSummary.items.map((item,index)=><span className="tc-product-tag" key={index}>{[item.productCodeSnapshot,item.productNameSnapshot].filter(x=>x!==null).join(' ')||'商品名称未知'}</span>)}{row.productSummary.hasMore&&<span>{row.productSummary.productCount===null?'更多商品':'共'+row.productSummary.productCount+'款'}</span>}</span></td><td className="tc-num">{row.businessType==='SALE'?(row.quantity??'—'):`退${row.incomingQuantity??'—'} · 换${row.outgoingQuantity??'—'}`}</td><td className="tc-num">{row.netDue===null?'—':salesMoney(row.netDue)}</td><td>{row.updatedAt?updatedMinute(row.updatedAt):row.dataset==='HISTORY'?(row.updatedLocalAt??'—'):'—'}</td><td><button className="btn tc-link" onClick={()=>p.open(row)}>查看</button></td></tr>)}</tbody></table>{!data?.items.length&&<div className="tc-empty">没有符合条件的销货单</div>}</>:!busy&&!state.error&&!error&&<div className="tc-empty">列表资料尚未读取</div>}</div>
 {data&&data.historyCoverage!=='PUBLISHED_AUTHORIZED'&&<p className="ui-query-note" role="status">{data.historyCoverage==='NOT_PUBLISHED'?'历史单据尚未发布，当前结果仅含新系统单据。':'历史单据授权尚未就绪，当前结果覆盖不完整。'}</p>}
 <footer className="tc-foot tc-list-pagination"><span>筛选合计：数量 {data?.totals.quantity??'—'} · 退回 {data?.totals.incomingQuantity??'—'} · 换出 {data?.totals.outgoingQuantity??'—'} · 应结 ¥{data?.totals.netDue==null?'—':salesMoney(data.totals.netDue)}</span>{data?<Pagination unit="张" pageSizes={[20,50,100,200]} selectLabel="每页销货单数量" className="tc-document-pagination" page={page} size={size} total={BigInt(data.exactTotal)} busy={busy} change={goto} sizeChange={value=>{const next=value as SalesQueryPageSize;if(success)execute({...success.parameters,page:1,pageSize:next},p.view.applied);}}/>:<span>分页资料尚未读取</span>}</footer></section>;
}
