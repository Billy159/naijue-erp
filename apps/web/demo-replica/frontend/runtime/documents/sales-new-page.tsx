import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { SalesProposalForm, salesPaymentSummary } from './proposal-form.tsx';
import { SaleDialog } from './native-dialog.tsx';
import { HttpQueryError } from '../../../../src/transport/http-query.ts';
import type {Options} from './sales-page-contracts.ts';
import {WriteRecovery} from './sales-write-recovery.tsx';
import {salesCanLeave} from './sales-session.ts';
export default function NewDocument(p:Options){
 const session=p.session,created=useSyncExternalStore(session.create.subscribe,session.create.getSnapshot,session.create.getSnapshot),editor=useSyncExternalStore(session.editor.subscribe,session.editor.getSnapshot,session.editor.getSnapshot);
 const [discard,setDiscard]=useState(false),[notice,setNotice]=useState<string|null>(null);
 const [businessChoice,setBusinessChoice]=useState(session.presentation.businessChoice);const chooseBusiness=(value:'SALE'|'RETURN_EXCHANGE'|null)=>{session.presentation.businessChoice=value;setBusinessChoice(value);};
 const defaultState=session.presentation.salespersonDefault,defaultRequest=useRef<AbortController|null>(null);
 const [salespersonNotice,setSalespersonNotice]=useState(defaultState.notice);
 const defaultNotice=(value:string|null)=>{defaultState.notice=value;setSalespersonNotice(value);};
 const salespersonIntent=()=>{defaultState.touched=true;defaultState.attempted=true;defaultRequest.current?.abort();defaultNotice(null);setNotice(null);};
 useEffect(()=>{
  const writableNew=()=>!session.editor.commands.hasUnresolvedWrite&&session.editor.getSnapshot().command.write.phase!=='committed'&&!session.editor.getSnapshot().preparing&&!session.create.getSnapshot().preparing&&session.editor.getSnapshot().command.editor?.mode!=='EXISTING';
  if(defaultState.attempted||defaultState.touched||session.proposal.getSnapshot().draft.salesperson||!session.currentEmployee.id||!session.proposal.matchesIdentity(p.scope)||!writableNew())return;
  let active=true;const controller=new AbortController();defaultRequest.current=controller;
  const signal=AbortSignal.any([controller.signal,p.scope.signal,session.scope.signal]);
  const current=()=>active&&!signal.aborted&&!defaultState.touched&&session.proposal.matchesIdentity(p.scope)&&writableNew();
  void(async()=>{try{
   for(let page=1;;page++){
    const result=await session.current.readSalesReferences({kind:'salesperson',hallId:null,search:'',page,pageSize:20},signal);
    if(!current())return;
    const exact=result.items.find(candidate=>candidate.id===session.currentEmployee.id);
    if(exact){
     defaultState.attempted=true;
     if(session.proposal.applyDefaultSalesperson(exact,session.currentEmployee.id,session.proposal.getSnapshot().draft))defaultNotice(null);
     else if(!session.proposal.getSnapshot().draft.salesperson)defaultNotice('请手工选择在职营业员。');
     return;
    }
    if(BigInt(page)*20n>=result.exactTotal){defaultState.attempted=true;defaultNotice('当前登录员工未在可选在职人员中找到，请手工选择营业员。');return;}
   }
  }catch(error){if(current()){defaultState.attempted=true;if(error instanceof HttpQueryError&&['unauthenticated','forbidden'].includes(error.kind))p.denied(error);else defaultNotice('当前登录员工资料读取失败，请手工选择在职营业员。');}}})();
  return()=>{active=false;controller.abort();if(defaultRequest.current===controller)defaultRequest.current=null;};
 },[session,p.scope]);
 const busy=created.preparing||['submitting','checking','replaying','uncertain','committed'].includes(editor.command.write.phase);
 const done=()=>{const result=session.editor.getSnapshot().command.write.result;if(result&&session.editor.getSnapshot().command.write.phase==='committed'){session.proposal.reset(true);session.editor.discardEditor(true);p.onCommitted();p.navigate('sales/view/'+encodeURIComponent(result.salesId));}};
 const save=async()=>{if(!businessChoice){setNotice('请选择业务类型。');return;}if(!session.proposal.getSnapshot().draft.salesperson){setNotice('请选择在职营业员。');return;}setNotice(null);try{await session.create.save();done();}catch{setNotice('保存尚未完成，输入已保留。');}};
 return <><SalesProposalForm onSalespersonIntent={salespersonIntent} businessChoice={businessChoice} chooseBusiness={chooseBusiness} currentEmployeeId={session.currentEmployee.id} {...(p.viewProduct?{viewProduct:p.viewProduct}:{})} session={session.proposal} scope={p.scope} productReader={p.productReader} denied={p.denied} busy={busy} notice={notice??salespersonNotice??created.notice??editor.notice??editor.command.notice} actions={<><button className="btn" disabled={busy} onClick={()=>salesCanLeave(session)?p.navigate('sales'):setDiscard(true)}>返回列表</button><button className="btn primary" disabled={busy||!businessChoice} onClick={()=>void save()}>保存</button><button type="button" className="btn primary" disabled title="保存并读取当前单据后可审核">审核</button><button type="button" className="btn" disabled title="保存并读取单据后可导出">导出</button><button type="button" className="btn" disabled title="保存并读取单据后可打印">打印</button></>}/><WriteRecovery session={session} committed={done}/>{discard&&<SaleDialog className="sale-confirm sale-danger" title="有未保存的修改" close={()=>setDiscard(false)} footer={<><button className="btn" onClick={()=>setDiscard(false)}>继续录单</button><button className="btn primary" onClick={()=>{if(session.editor.discardEditor(true)&&session.proposal.reset(true)){setDiscard(false);p.onDiscarded();p.navigate('sales');}}}>放弃修改并离开</button></>}><p>此新单尚未保存。离开将放弃本次录入，不会产生销货单或库存变动。</p></SaleDialog>}</>;
}
