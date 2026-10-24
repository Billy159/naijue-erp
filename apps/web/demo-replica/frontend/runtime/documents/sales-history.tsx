import { useEffect, useState, useSyncExternalStore } from 'react';
import { LatestQuery } from '../../../../src/loading/latest-query.ts';
import type { ReadScope } from '../../../../src/loading/read-scope.ts';
import type { SalesHistoryReader } from '../../../../src/sales/history-http-reader.ts';
import { HttpQueryError } from '../../../../src/transport/http-query.ts';
import { entityId } from '../../../../../../packages/domain/src/values.ts';
import { SaleDialog } from './native-dialog.tsx';
/** Exact audit metadata available from the current port; no synthetic actor/reason/diff. */
export default function SalesHistory(p:{scope:ReadScope;id:string;reader:SalesHistoryReader;close:()=>void;denied:(error:HttpQueryError)=>void}) {
 const [query]=useState(()=>new LatestQuery({scope:p.scope,execute:p.reader.readHistory}));
 const state=useSyncExternalStore(query.subscribe,query.getSnapshot,query.getSnapshot),data=state.success?.data;
 const run=(page:number)=>void query.run({salesId:entityId('sales',p.id),page,pageSize:20});
 useEffect(()=>{run(1);return()=>query.dispose();},[query]);
 useEffect(()=>{if(state.error instanceof HttpQueryError&&['unauthenticated','forbidden'].includes(state.error.kind))p.denied(state.error);},[state.error]);
 return <SaleDialog title="操作历史" close={p.close} footer={data&&<><span>共 {data.exactTotal} 条</span><button className="btn" disabled={state.phase==='loading'||data.page<=1} onClick={()=>run(data.page-1)}>上一页</button><span>第 {data.page} 页</span><button className="btn" disabled={state.phase==='loading'||BigInt(data.page)*20n>=BigInt(data.exactTotal)} onClick={()=>run(data.page+1)}>下一页</button></>}>
 {state.phase==='loading'?<p role="status">正在读取操作历史…</p>:state.error?<p role="alert">操作历史读取失败 <button className="btn" onClick={()=>run(state.request?.parameters.page??1)}>重试</button></p>:data?.items.map(row=><article className="tc-history" key={row.id}><strong>{{SAVE:'保存',APPROVE:'审核',UNAPPROVE:'弃审',VOID:'作废'}[row.action]} · v{row.oldVersion??'—'} → v{row.newVersion}</strong><small>账号 {row.actorAccountId} · {new Date(row.occurredAt).toLocaleString('zh-CN',{hour12:false,timeZone:'Asia/Shanghai'})}</small><p>原因与修改前后值暂不可用</p></article>)}{state.phase==='success'&&!data?.items.length&&<p>暂无成功业务历史</p>}
 </SaleDialog>;
}
