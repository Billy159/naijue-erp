import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import DatePicker from '@arco-design/web-react/es/DatePicker';
import Input from '@arco-design/web-react/es/Input';
import type { ReadScope } from '../../../../src/loading/read-scope.ts';
import type { InventoryCellTarget } from '../../../../src/inventory/contracts.ts';
import type { InventoryLedgerEntry, InventoryLedgerReader, InventoryLedgerFilter } from '../../../../src/inventory/ledger-contracts.ts';
import { createInventoryLedgerQuery } from '../../../../src/inventory/ledger-http-reader.ts';
import { entityId } from '../../../../../../packages/domain/src/values.ts';
import { formatQuantity } from '../../../../src/inventory/model.ts';
import { HttpQueryError } from '../../../../src/transport/http-query.ts';
import { SourceDialog } from './dialog.tsx';
import { SourceControl } from './candidates.tsx';
import { dateCss } from './source-control-css.ts';
import { Pagination, SingleChoice } from './pagination.tsx';
const types={BASELINE:'库存初始化 / 期初',TRANSFER_IN:'调拨入',TRANSFER_OUT:'调拨出',SALE:'销货出库',RETURN:'退货入库',EXCHANGE:'换货',UNKNOWN:'未知类型'};
const day=(time:number)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(time);
export function InventoryLedger(p:{target:InventoryCellTarget;quantity:string;scope:ReadScope;reader:InventoryLedgerReader;dialog:HTMLDialogElement;onAccessFailure:(e:HttpQueryError)=>void;onOpenSource?:(entry:InventoryLedgerEntry)=>boolean|Promise<boolean>;close:()=>void}){
 const [query]=useState(()=>createInventoryLedgerQuery(p.scope,p.reader,p.onAccessFailure));const state=useSyncExternalStore(query.subscribe,query.getSnapshot,query.getSnapshot);
 const [draft,setDraft]=useState<InventoryLedgerFilter>(()=>({dateFrom:day(Date.now()-30*86400000),dateTo:day(Date.now()),businessType:null,source:''})),[error,setError]=useState('');
 const [opening,setOpening]=useState<string|null>(null),navigationRequest=useRef<{id:number;entryId:string}|null>(null),navigationSequence=useRef(0),closed=useRef(false);
 const close=()=>{closed.current=true;navigationRequest.current=null;navigationSequence.current++;p.close();};
 const read=(page=1,filter=draft)=>{if(filter.dateFrom&&filter.dateTo&&filter.dateFrom>filter.dateTo){setError('开始日期不能晚于结束日期');return;}setError('');void query.run({warehouseId:entityId('warehouse',p.target.warehouse.id),skuId:entityId('sku',p.target.skuId),pageSize:20,after:null,page,filter});};
 const mounted=useRef(false);useEffect(()=>{let active=true;mounted.current=true;queueMicrotask(()=>{if(active&&mounted.current)read();});return()=>{active=false;mounted.current=false;navigationRequest.current=null;navigationSequence.current++;query.cancel();queueMicrotask(()=>{if(!mounted.current)query.dispose();});};},[query]);const data=state.success?.data,busy=state.phase==='loading';
 const navigation=async(entry:InventoryLedgerEntry)=>{
  if(!p.onOpenSource||!mounted.current||closed.current||!p.scope.active||navigationRequest.current?.entryId===entry.id)return;
  const request={id:++navigationSequence.current,entryId:entry.id};navigationRequest.current=request;setOpening(entry.id);setError('');
  const current=()=>mounted.current&&!closed.current&&p.scope.active&&navigationRequest.current===request;
  try{const opened=await p.onOpenSource(entry);if(!current())return;if(opened)close();else setError('该来源单据当前不可查看。');}
  catch{if(current())setError('来源单据读取失败，请重试。');}
  finally{if(current()){navigationRequest.current=null;setOpening(null);}}
 };
 return <SourceDialog existing={p.dialog} className="wide inventory-ledger" label="库存流水" close={close}><header className="gd-head"><h2>库存流水</h2><button className="btn ledger-close" aria-label="关闭库存流水" onClick={close}>×</button></header><div className="gd-body"><div className="ledger-identity"><strong>{p.target.productLabel}</strong><p>{p.target.color.label} · {p.target.fit.label} · {p.target.size.label} · {p.target.warehouse.label} · 当前库存 {formatQuantity(p.quantity)}</p></div><form id="ledger-filter" className="mini-filter" onSubmit={e=>{e.preventDefault();read();}}>
 {(['dateFrom','dateTo'] as const).map((key,index)=><SourceControl key={key} css={dateCss} attributes={{'data-ledger-date':key}}>{portal=><DatePicker aria-label={index?'结束日期':'开始日期'} value={draft[key]??''} allowClear onChange={value=>setDraft({...draft,[key]:value||null})} getPopupContainer={()=>portal}/>}</SourceControl>)}
 <div className="ui-single-host"><SingleChoice label="业务类型" value={draft.businessType??''} items={[{value:'',label:'全部类型'},...Object.entries(types).map(([value,label])=>({value,label}))]} change={value=>setDraft({...draft,businessType:(value||null) as InventoryLedgerFilter['businessType']})}/></div>
 <SourceControl css={dateCss} attributes={{'data-ledger-source':''}}>{()=> <Input aria-label="来源单据" placeholder="来源单据" value={draft.source} onChange={source=>setDraft({...draft,source})}/>}</SourceControl><button className="btn primary" disabled={busy}>{busy?'查询中…':'查询'}</button></form>
 {opening&&<p role="status">正在打开来源单据…</p>}
 <div className="ledger-filter-error" role="alert">{error||(state.phase==='error'?'库存流水读取失败，请重试。':'')}</div>{state.phase==='error'&&<button className="btn" onClick={()=>read(state.request?.parameters.page??1,state.request?.parameters.filter??draft)}>重试</button>}
 <div className="ledger-stats">{busy?'正在读取库存流水…':data?`${state.phase==='error'?'上一次成功查询：':''}共 ${data.filteredTotal} 条 · 每页 20 条`:'尚未取得流水'}</div><div className="table-scroll ledger-scroll" aria-busy={busy}><table><thead><tr>{['时间','业务类型','变化','变化前 → 后','来源单据','操作人'].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{data?.entries.map(entry=><tr key={entry.id}><td>{entry.display?.date??entry.businessDate}</td><td>{entry.display?types[entry.display.businessType]:'未知类型'}</td><td>{entry.quantityDelta.startsWith('-')?'':'+'}{formatQuantity(entry.quantityDelta)}</td><td>未记录</td><td>{entry.display?.sourceNumber?(p.onOpenSource&&entry.source.kind!=='CUTOFF_BASELINE'?<a href="#" aria-busy={opening===entry.id} aria-disabled={opening===entry.id} onClick={e=>{e.preventDefault();void navigation(entry);}}>{entry.display.sourceNumber}</a>:entry.display.sourceNumber):'未记录'}</td><td>{entry.display?.operator.name??'未记录'}</td></tr>)}</tbody></table>{state.phase==='success'&&data&&!data.entries.length&&<div className="empty">当前范围无流水</div>}</div>
 <footer className="ledger-footer">{data&&<Pagination ledger page={data.page??1} size={20} total={BigInt(data.filteredTotal!)} busy={busy} change={page=>read(page,state.success!.parameters.filter!)}/>}</footer></div></SourceDialog>;
}
