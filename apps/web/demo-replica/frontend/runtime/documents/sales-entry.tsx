import { createRoot } from 'react-dom/client';
import { lazy, Suspense, useEffect, useState, useSyncExternalStore } from 'react';
import type { ReplicaSalesSession } from './sales-session.ts';
import { SalesList, newSalesListViewState, type SalesListViewState } from './sales-list.tsx';
import { SalesProposalForm } from './proposal-form.tsx';
import { SaleDialog } from './native-dialog.tsx';
import { LatestQuery } from '../../../../src/loading/latest-query.ts';
import type { ReadScope } from '../../../../src/loading/read-scope.ts';
import type { SalesDetailDto, SalesReferenceReader } from '../../../../src/sales/contracts.ts';
import type { ProductReadOnlyReader } from '../../../../src/inventory/product-contracts.ts';
import { HttpQueryError } from '../../../../src/transport/http-query.ts';
import { salesInputMoney } from '../../../../src/sales/commands/form-model.ts';
import { salesStatusLabels } from '../../../../src/sales/model.ts';
import { entityId } from '../../../../../../packages/domain/src/values.ts';
import type { AuthenticationPrincipal } from '../../../../src/authentication/contracts.ts';
import type { SalesExistingDocumentSession } from '../../../../src/current-form/sales-existing-document.ts';

const History=lazy(()=>import('./sales-history.tsx'));
export {newSalesListViewState};
export function salesCanLeave(session:ReplicaSalesSession):boolean {
 if(!session.scope.active)return true;
 if(session.editor.getSnapshot().command.write.phase==='committed')return true;
 const proposal=session.proposal.getSnapshot();
 return session.editor.canLeave()&&!session.create.getSnapshot().preparing&&!proposal.dirty&&!proposal.lineEdit&&!Object.values(proposal.entries).flat().some(row=>row.product||row.query.trim());
}
interface Options {principal:AuthenticationPrincipal;session:ReplicaSalesSession;scope:ReadScope;references:SalesReferenceReader;productReader:ProductReadOnlyReader;view:SalesListViewState;manualCreate:boolean;existingEdit:boolean;denied:(error:HttpQueryError)=>void;navigate:(route:string)=>void;onCommitted:()=>void;onDiscarded:()=>void}
export function mountSales(host:HTMLElement,route:string,p:Options){
 document.body.classList.add('sale-mode','gold-mode');
 const root=createRoot(host);const canLeave=()=>salesCanLeave(p.session);
 root.render(route==='sales'?<SalesList session={p.session} view={p.view} references={p.references} canCreate={p.manualCreate} open={id=>p.navigate('sales/view/'+encodeURIComponent(id))} create={()=>p.navigate('sales/new')} onAccessFailure={p.denied}/>:route==='sales/new'&&p.manualCreate?<NewDocument {...p}/>:route.startsWith('sales/edit/')&&p.existingEdit?<EditDocument {...p} id={decodeURIComponent(route.slice('sales/edit/'.length))}/>:route.startsWith('sales/view/')?<ReadDocument {...p} id={decodeURIComponent(route.slice('sales/view/'.length))}/>:<p role="alert">当前版本未开放此销货操作。</p>);
 return {dispose:()=>{root.unmount();document.body.classList.remove('sale-mode','gold-mode');p.session.create.cancelPreparation();p.session.editor.suspend();},canLeave:()=>canLeave()};
}
function WriteRecovery(p:{session:ReplicaSalesSession;committed:()=>void}) {
 const editor=p.session.editor,state=useSyncExternalStore(editor.subscribe,editor.getSnapshot,editor.getSnapshot),write=state.command.write;
 const [closed,setClosed]=useState(false);
 useEffect(()=>{if(write.phase==='uncertain')setClosed(false);},[write.phase]);
 const finish=async(task:Promise<boolean>)=>{await task;if(editor.getSnapshot().command.write.phase==='committed')p.committed();};
 return <>{write.phase==='uncertain'&&closed&&<button className="btn" onClick={()=>setClosed(false)}>核实原操作</button>}{write.phase==='uncertain'&&!closed&&<SaleDialog title="核实原操作" close={()=>setClosed(true)} footer={<><button className="btn" onClick={()=>void finish(editor.commands.checkReceipt())}>查询原回执</button><button className="btn" onClick={()=>void finish(editor.commands.replayOriginal())}>按原请求重试</button></>}><p>{state.command.notice??'原操作结果尚未确认，输入与原请求已保留。'}</p></SaleDialog>}{['submitting','checking','replaying'].includes(write.phase)&&<div role="status">正在处理原操作… <button className="btn" onClick={()=>editor.commands.cancelWaiting()}>停止等待</button></div>}</>;
}
function NewDocument(p:Options){
 const session=p.session,created=useSyncExternalStore(session.create.subscribe,session.create.getSnapshot,session.create.getSnapshot),editor=useSyncExternalStore(session.editor.subscribe,session.editor.getSnapshot,session.editor.getSnapshot);
 const [discard,setDiscard]=useState(false),[notice,setNotice]=useState<string|null>(null);
 const busy=created.preparing||['submitting','checking','replaying','uncertain','committed'].includes(editor.command.write.phase);
 const done=()=>{const result=session.editor.getSnapshot().command.write.result;if(result&&session.editor.getSnapshot().command.write.phase==='committed'){session.proposal.reset(true);session.editor.discardEditor(true);p.onCommitted();p.navigate('sales/view/'+encodeURIComponent(result.salesId));}};
 const save=async()=>{setNotice(null);try{await session.create.save();done();}catch{setNotice('保存尚未完成，输入已保留。');}};
 return <><SalesProposalForm session={session.proposal} scope={p.scope} productReader={p.productReader} denied={p.denied} busy={busy} notice={notice??created.notice??editor.notice??editor.command.notice} actions={<><button className="btn" disabled={busy} onClick={()=>salesCanLeave(session)?p.navigate('sales'):setDiscard(true)}>返回列表</button><button className="btn primary" disabled={busy} onClick={()=>void save()}>保存</button></>}/><WriteRecovery session={session} committed={done}/>{discard&&<SaleDialog title="放弃未保存修改" close={()=>setDiscard(false)} footer={<><button className="btn" onClick={()=>setDiscard(false)}>取消</button><button className="btn primary" onClick={()=>{if(session.editor.discardEditor(true)&&session.proposal.reset(true)){setDiscard(false);p.onDiscarded();p.navigate('sales');}}}>确定</button></>}><p>本单修改尚未保存，确定返回列表？</p></SaleDialog>}</>;
}
function EditDocument(p:Options&{id:string}) {
 const editor=p.session.editor,state=useSyncExternalStore(editor.subscribe,editor.getSnapshot,editor.getSnapshot);
 const [model,setModel]=useState<SalesExistingDocumentSession|null>(null),[notice,setNotice]=useState('正在读取完整单据…');
 useEffect(()=>{let active=true;void(async()=>{if(state.command.editor?.salesId!==p.id&&!await editor.openExisting(p.id)){if(active)setNotice('单据未能读取，请返回列表后重试。');return;}const next=editor.prepareExistingDocument();if(!next){if(active)setNotice('当前单据不满足现有编辑合同，未发送保存请求。');return;}await next.initialize();if(active){setModel(next);setNotice(next.getSnapshot().notice??'');}})();return()=>{active=false;};},[p.id]);
 return model?<ExistingForm {...p} model={model}/>:<section className="tc-workbench tc-editor sale-workbench sale-editor"><div className="tc-head"><h1>编辑销货单</h1><button className="btn" onClick={()=>{if(editor.discardEditor(true))p.navigate('sales/view/'+encodeURIComponent(p.id));}}>返回单据</button></div><p role="status">{notice}</p></section>;
}
function ExistingForm(p:Options&{id:string;model:SalesExistingDocumentSession}){
 const model=useSyncExternalStore(p.model.subscribe,p.model.getSnapshot,p.model.getSnapshot),editor=useSyncExternalStore(p.session.editor.subscribe,p.session.editor.getSnapshot,p.session.editor.getSnapshot);
 const [discard,setDiscard]=useState(false);
 const done=()=>{const write=p.session.editor.getSnapshot().command.write;if(write.phase==='committed'&&write.result){p.session.editor.discardEditor(true);p.onCommitted();p.navigate('sales/view/'+encodeURIComponent(write.result.salesId));}};
 const busy=model.preparing||editor.preparing||['submitting','checking','replaying','uncertain','committed'].includes(editor.command.write.phase);
 return <>{model.phase==='ready'&&model.proposal?<SalesProposalForm session={model.proposal} scope={p.scope} productReader={p.productReader} denied={p.denied} number={p.model.original?.document.header.number??p.id} busy={busy} notice={model.notice??editor.notice??editor.command.notice} actions={<><button className="btn" disabled={busy} onClick={()=>setDiscard(true)}>取消修改</button><button className="btn primary" disabled={busy} onClick={()=>void p.model.save().then(done)}>保存</button></>}/>:<p role="alert">{model.notice??'完整编辑资料尚未就绪。'}</p>}<WriteRecovery session={p.session} committed={done}/>{discard&&<SaleDialog title="取消修改" close={()=>setDiscard(false)} footer={<><button className="btn" onClick={()=>setDiscard(false)}>继续修改</button><button className="btn primary" onClick={()=>{if(p.session.editor.discardEditor(true)){setDiscard(false);p.navigate('sales/view/'+encodeURIComponent(p.id));}}}>确定</button></>}><p>确定放弃本次未保存修改并重新读取单据？</p></SaleDialog>}</>;
}
function ReadDocument(p:Options&{id:string}){
 const [query]=useState(()=>new LatestQuery({scope:p.scope,execute:p.session.reader.readDetail}));
 const state=useSyncExternalStore(query.subscribe,query.getSnapshot,query.getSnapshot);
 const editor=useSyncExternalStore(p.session.editor.subscribe,p.session.editor.getSnapshot,p.session.editor.getSnapshot);
 const [action,setAction]=useState<'APPROVE'|'UNAPPROVE'|'VOID'|null>(null),[notice,setNotice]=useState(''),[historyOpen,setHistoryOpen]=useState(false);
 const refresh=async()=>{if(await p.session.editor.commands.readCurrent()&&p.session.editor.adoptCurrent(true)){p.view.reload=true;await query.run({salesId:entityId('sales',p.id)});setNotice('已重新读取服务器单据。');}else setNotice('原操作已确认，当前单据尚未重新读取，请继续读取核实。');};
 const submit=async()=>{const intent=action;setAction(null);if(!intent)return;if(await p.session.editor.openExisting(p.id)){await p.session.editor.submit(intent);if(p.session.editor.getSnapshot().command.write.phase==='committed')await refresh();}else setNotice('单据未能重新读取，未发送状态操作。');};
 useEffect(()=>{void query.run({salesId:entityId('sales',p.id)});return()=>query.dispose();},[query,p.id]);
 useEffect(()=>{if(state.error instanceof HttpQueryError&&['unauthenticated','forbidden'].includes(state.error.kind))p.denied(state.error);},[state.error]);
 if(state.phase!=='success'||!state.success)return <div className="sale-empty" role={state.error?'alert':'status'}>{state.error?'销货单读取失败。':'正在读取销货单…'}{!!state.error&&<button className="btn" onClick={()=>void query.run({salesId:entityId('sales',p.id)})}>重试</button>}</div>;
 const detail=state.success.data,h=detail.document.header,role=p.principal.role,localHall=p.principal.hallId===h.hallId;
 const mayWrite=p.existingEdit&&detail.stockBasis==='RUNTIME_LEDGER',busy=['submitting','checking','replaying','uncertain','committed'].includes(editor.command.write.phase);
 return <><SalesReadBody detail={detail} actions={<><button className="btn" disabled={busy} onClick={()=>p.navigate('sales')}>返回列表</button>{mayWrite&&h.status==='DRAFT'&&(role!=='SALESPERSON'||localHall)&&<><button className="btn sale-delete-action" disabled={busy} onClick={()=>setAction('VOID')}>作废</button><button className="btn" disabled={busy} onClick={()=>p.navigate('sales/edit/'+encodeURIComponent(p.id))}>修改</button>{(role!=='SALESPERSON'||h.createdByAccountId===p.principal.accountId)&&<button className="btn primary" disabled={busy} onClick={()=>setAction('APPROVE')}>审核</button>}</>}{mayWrite&&h.status==='APPROVED'&&role!=='SALESPERSON'&&<button className="btn" disabled={busy} onClick={()=>setAction('UNAPPROVE')}>弃审</button>}{p.session.reader.readHistory&&<button className="btn" disabled={busy} onClick={()=>setHistoryOpen(true)}>操作历史</button>}</>}/><p role="status">{notice||editor.notice||editor.command.notice}</p>{historyOpen&&p.session.reader.readHistory&&<Suspense fallback={<p role="status">正在加载操作历史…</p>}><History scope={p.scope} id={p.id} reader={{readHistory:p.session.reader.readHistory}} close={()=>setHistoryOpen(false)} denied={p.denied}/></Suspense>}{editor.command.write.phase==='committed'&&<button className="btn" onClick={()=>void refresh()}>重新读取单据</button>}<WriteRecovery session={p.session} committed={()=>void refresh()}/>{action&&<SaleDialog title={{APPROVE:'审核销货单',UNAPPROVE:'弃审销货单',VOID:'作废销货单'}[action]} close={()=>setAction(null)} footer={<><button className="btn" onClick={()=>setAction(null)}>取消</button><button className="btn primary" onClick={()=>void submit()}>确定</button></>}><p>{{APPROVE:'审核后按本单业务类型处理库存和结算，确定审核？',UNAPPROVE:'确定退回未审核并撤销本单库存影响？',VOID:'作废后保留单据及操作历史，确定作废？'}[action]}</p></SaleDialog>}</>;

}
function SalesReadBody(p:{detail:SalesDetailDto;actions:React.ReactNode}){
 const {document:d,referenceNames:n}=p.detail,h=d.header,money=salesInputMoney;
 const fields=[['单据日期',h.businessDate],['业务类型',h.businessType==='SALE'?'销售':'退货/换货'],['营业厅',n.hallName],['营业员',n.salespersonName],['客户',n.customerName],['出库仓',n.warehouseName],['单号',h.number],['整单优惠 / 抹零','¥'+money(h.orderDiscount)],['应结金额','¥'+money(h.netDue)]];
 return <section className="tc-workbench tc-editor sale-workbench sale-editor"><div className="tc-head sale-head"><h1>查看销货单</h1><span className="tc-status">{salesStatusLabels[h.status]}</span><span className="sale-muted">· 已保存</span><div className="actions">{p.actions}</div></div><div className="tc-doc-header sale-doc-header"><div className="tc-gold-doc-fields sale-doc-fields">{fields.map(([label,value])=><label className="tc-gold-field" key={label}><span className="sale-field-label">{label}</span><span className="sale-read-value">{value??'—'}</span></label>)}<div className="tc-gold-field sale-payment-field"><span className="sale-field-label">收款</span><div className="sale-payment-rows">{d.settlements.map(row=>{const name=p.detail.settlementNames.find(name=>name.settlementId===row.id);return <div className="sale-payment-read" key={row.id}><span>{name?.methodNameSnapshot??'—'}</span><span>{name?.accountNameSnapshot??'—'}</span><strong>{row.direction==='REFUND'?'-':''}¥{money(row.amount)}</strong></div>;})}</div></div></div></div><label className="sale-note-row"><span className="sale-field-label">备注</span><span className="sale-note-read">{h.note??'—'}</span></label>{(h.businessType==='SALE'?['OUT']:h.businessType==='RETURN'?['IN']:['IN','OUT']).map(direction=>{const lines=d.lines.filter(row=>row.quantity.startsWith('-')===(direction==='IN'));return <section className="sale-entry-section" data-business-section={direction.toLowerCase()} key={direction}><div className="tc-section-head sale-section-head"><strong>{h.businessType==='SALE'?'商品明细':direction==='IN'?'退回商品':'换出商品'}</strong></div><div className="sale-lines"><table className="sale-lines-table"><colgroup>{[270,100,122,84,80,95,90,108,99,142].map((width,index)=><col key={index} style={{width}}/>)}</colgroup><thead><tr>{['款号／商品名称','颜色','版型','尺码','数量','参考零售价','折扣','成交单价','金额','操作'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{lines.map(row=><tr key={row.id}><td><strong>{row.snapshot.productCode}</strong><span className="sale-entry-name">{row.snapshot.productName}</span></td><td>{row.snapshot.colorName}</td><td>{row.snapshot.fitName}</td><td>{row.snapshot.sizeName}</td><td>{row.quantity}</td><td>{row.referencePrice==null?'':money(row.referencePrice)}</td><td>{row.discountTenths==null?'':String(row.discountTenths/10)+'折'}</td><td>{money(row.dealPrice)}</td><td>{money(row.lineAmount)}</td><td>{row.isGift?'赠品':''}</td></tr>)}</tbody></table></div></section>;})}<footer className="tc-foot tc-gold-footer sale-summary"><div className="sale-summary-primary"><strong>销售金额 ¥{money(h.grossAmount)}</strong><strong>优惠 ¥{money(h.orderDiscount)}</strong><strong>应结 ¥{money(h.netDue)}</strong></div></footer></section>;
}
