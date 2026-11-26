import {AsyncLeaf} from '../common/async-leaf.tsx';
import {isLegacyExchangeSale} from '../../../../src/current-form/sales-business-mode.ts';
import {salesDocumentOutput} from '../../../../src/components/document-output-contracts.ts';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {submitDisplayedSalesAction} from './displayed-action.ts';
import { ConfirmDialog } from '../common/confirm-dialog.tsx';
import { LatestQuery } from '../../../../src/loading/latest-query.ts';
import { HttpQueryError } from '../../../../src/transport/http-query.ts';
import { entityId } from '../../../../../../packages/domain/src/values.ts';
import type {Options} from './sales-page-contracts.ts';
import {WriteRecovery} from './sales-write-recovery.tsx';
import {SalesReadBody} from './sales-read-body.tsx';
const loadDocumentOutputActions=()=>import('../../../../src/components/document-output.tsx').then(module=>({default:module.DocumentOutputActions}));
const loadHistory=()=>import('./sales-history.tsx');
export default function ReadDocument(p:Options&{id:string}){
 const [query]=useState(()=>new LatestQuery({scope:p.scope,execute:p.session.reader.readDetail}));
 const state=useSyncExternalStore(query.subscribe,query.getSnapshot,query.getSnapshot);
 const editor=useSyncExternalStore(p.session.editor.subscribe,p.session.editor.getSnapshot,p.session.editor.getSnapshot);
 const [action,setAction]=useState<'APPROVE'|'UNAPPROVE'|'VOID'|null>(null),[notice,setNotice]=useState(''),[historyOpen,setHistoryOpen]=useState(false);
 const productRead=useRef<AbortController|null>(null);useEffect(()=>()=>productRead.current?.abort(),[p.scope]);
 const viewSku=async(skuId:string,label:string)=>{if(!p.viewProduct)return;productRead.current?.abort();const own=new AbortController();productRead.current=own;const signal=AbortSignal.any([own.signal,p.scope.signal]),detail=query.getSnapshot().success?.data;if(!detail)return;try{const h=detail.document.header;if(h.hallId===null){setNotice('营业厅归属待核，暂不可按当前厅读取商品资料。');return;}const rows=await p.session.current.readSkuBatch({context:{kind:'SALES',hallId:h.hallId},skuIds:[entityId('sku',skuId)]},signal);if(signal.aborted||!p.scope.active)return;const actual=rows.find(row=>row.id===skuId);if(!actual){setNotice('原规格的当前商品身份尚未取得。');return;}p.viewProduct({id:actual.productId,label});}catch(error){if(signal.aborted||!p.scope.active)return;if(error instanceof HttpQueryError&&['unauthenticated','forbidden'].includes(error.kind))p.denied(error);else setNotice('商品资料未能读取，请重试。');}};

 const refresh=async()=>{
  const active=()=>{
   const route=p.scope, session=p.session.scope;
   return route.active&&session.active&&query.getSnapshot().phase!=='disposed'
    &&route.identity.accountId===session.identity.accountId&&route.identity.sessionRevision===session.identity.sessionRevision
    &&route.identity.permissionRevision===session.identity.permissionRevision;
  };
  if(!active())return;
  const owner=p.session.editor;
  const salesId=entityId('sales',p.id);
  const read=await owner.commands.readCurrent();
  if(!active())return;
  const candidate=owner.getSnapshot().command.editor?.current;
  const shown=query.getSnapshot().success?.data;
  if(read&&candidate?.document.header.id===salesId&&(!shown||candidate.document.header.version>=shown.document.header.version)
    &&owner.adoptCurrent(true)&&active()){
   const adopted=owner.getSnapshot().command.editor?.detail;
   if(adopted===candidate){
    // Same active authority, ID and freshly server-validated detail, not a receipt or draft.
    query.acceptAuthoritative({salesId},adopted);
    p.view.reload=true;
    setNotice('已重新读取服务器单据。');
    return;
   }
  }
  if(active())setNotice('原操作已确认，当前单据尚未重新读取，请继续读取核实。');
 };
 const submit=async()=>{const intent=action,shown=state.success?.data;setAction(null);if(!intent||!shown)return;const result=await submitDisplayedSalesAction(p.session,shown,intent);if(result==='committed')await refresh();else if(result==='changed'){p.view.reload=true;await query.run({salesId:entityId('sales',p.id)});setNotice('单据已更新，请核对最新内容后再操作。');}else setNotice(p.session.editor.getSnapshot().command.notice??'状态操作尚未完成，请核对当前提示或原回执。');};
 useEffect(()=>{void query.run({salesId:entityId('sales',p.id)});return()=>query.dispose();},[query,p.id]);
 useEffect(()=>{if(state.error instanceof HttpQueryError&&['unauthenticated','forbidden'].includes(state.error.kind))p.denied(state.error);},[state.error]);
 if(state.phase!=='success'||!state.success)return <div className="sale-empty" role={state.error?'alert':'status'}>{state.error?'销货单读取失败。':'正在读取销货单…'}{!!state.error&&<button className="btn" onClick={()=>void query.run({salesId:entityId('sales',p.id)})}>重试</button>}</div>;
 const readHistory=p.session.reader.readHistory;
 const detail=state.success.data,h=detail.document.header,role=p.principal.role,localHall=p.principal.hallId!==null&&p.principal.hallId===h.hallId;
 const retiredExchange=isLegacyExchangeSale(detail.document);
 const mayWrite=!retiredExchange&&p.existingEdit&&(p.session.ordinary||detail.stockBasis==='RUNTIME_LEDGER'),busy=editor.preparing||editor.command.editor?.phase==='loading'||['submitting','checking','replaying','uncertain','committed'].includes(editor.command.write.phase);
 return <><SalesReadBody detail={detail} {...(p.viewProduct?{viewSku:(skuId:string,label:string)=>void viewSku(skuId,label)}:{})} actions={<><button className="btn" disabled={busy} onClick={()=>p.navigate('sales')}>返回列表</button>{mayWrite&&h.status==='DRAFT'&&(role!=='SALESPERSON'||localHall)&&<><button className="btn sale-delete-action" disabled={busy} onClick={()=>setAction('VOID')}>作废</button><button className="btn" disabled={busy} onClick={()=>p.navigate('sales/edit/'+encodeURIComponent(p.id))}>修改</button>{(role!=='SALESPERSON'||h.createdByAccountId===p.principal.accountId)&&<button className="btn primary" disabled={busy} onClick={()=>setAction('APPROVE')}>审核</button>}</>}{mayWrite&&h.status==='APPROVED'&&role!=='SALESPERSON'&&<button className="btn" disabled={busy} onClick={()=>setAction('UNAPPROVE')}>弃审</button>}<AsyncLeaf load={loadDocumentOutputActions} scope={p.scope} label="输出功能" pending={<><button className="btn" disabled>导出</button><button className="btn" disabled>打印</button></>}>{DocumentOutputActions=><DocumentOutputActions sourceKey={`${h.id}:${h.version}`} {...(!busy&&!editor.preparing&&p.scope.active&&p.session.editor.canLeave()?{getDocument:()=>salesDocumentOutput(detail)}:{})} unavailableReason="请先完成当前操作并读取已保存单据"/>}</AsyncLeaf>{p.session.reader.readHistory&&<button className="btn" disabled={busy} onClick={()=>setHistoryOpen(true)}>操作历史</button>}</>}/><p role="status">{notice||editor.notice||editor.command.notice||(retiredExchange?'旧版换货记录只能查看。补发商品请另开销售单。':'')}</p>{historyOpen&&readHistory&&<AsyncLeaf load={loadHistory} scope={p.scope} label="操作历史" pending={<p role="status">正在加载操作历史…</p>} close={()=>setHistoryOpen(false)}>{History=><History scope={p.scope} id={p.id} reader={{readHistory}} close={()=>setHistoryOpen(false)} denied={p.denied}/>}</AsyncLeaf>}{editor.command.write.phase==='committed'&&<button className="btn" onClick={()=>void refresh()}>重新读取单据</button>}<WriteRecovery session={p.session} committed={()=>void refresh()}/>{action&&<ConfirmDialog tone={action==='VOID'?'danger':'normal'} title={{APPROVE:'审核这张单吗？',UNAPPROVE:'取消审核吗？',VOID:'作废这张单吗？'}[action]} onCancel={()=>setAction(null)} onConfirm={()=>void submit()}><p>{{APPROVE:'审核后，会按这张单更新库存和结算记录。',UNAPPROVE:'库存会撤回这张单审核时的变动，结算记录仍会保留。',VOID:`作废后，单据 ${h.number} 不能再修改或审核，但仍可查看。`}[action]}</p></ConfirmDialog>}</>;

}
