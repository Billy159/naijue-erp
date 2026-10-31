import {emptyTransferFilter} from '../../../../src/transfers/contracts.ts';
import type {TransferListViewState} from './transfers-list-state.ts';
import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import type {ReplicaTransferSession} from './transfers-session.ts';
import {transferCanLeave} from './transfers-session.ts';
import type {ProductReadOnlyReader} from '../../../../src/inventory/product-contracts.ts';
import type {HttpQueryError} from '../../../../src/transport/http-query.ts';
import type {ReadScope} from '../../../../src/loading/read-scope.ts';
import {TransferProposalForm} from './transfer-proposal-form.tsx';
import {SaleDialog} from './native-dialog.tsx';

export default function NewTransfer(p:{session:ReplicaTransferSession;scope:ReadScope;view:TransferListViewState;productReader:ProductReadOnlyReader;denied:(error:HttpQueryError)=>void;navigate:(route:string)=>void;reset:()=>void;viewProduct?:((product:{id:string;label:string})=>void)}){
 const s=p.session,created=useSyncExternalStore(s.create.subscribe,s.create.getSnapshot,s.create.getSnapshot),command=useSyncExternalStore(s.workspace.subscribe,s.workspace.getSnapshot,s.workspace.getSnapshot),write=command.write;
 const stopScan=useRef<()=>void>(()=>{}),defaultRequest=useRef<AbortController|null>(null);
 const [discard,setDiscard]=useState(false),[recovery,setRecovery]=useState(true),[notice,setNotice]=useState<string|null>(null);
 useEffect(()=>{if(write.phase==='uncertain')setRecovery(true);},[write.phase]);
 const responsibleIntent=()=>{s.proposal.touchResponsibleStaff();defaultRequest.current?.abort();setNotice(null);};
 useEffect(()=>{
  const writableNew=()=>!s.workspace.hasUnresolvedWrite&&s.workspace.getSnapshot().write.phase==='idle'
   &&!s.create.getSnapshot().preparing&&!s.workspace.getSnapshot().editor;
  if(!s.workspace.responsibleStaff||!s.proposal.canDefaultResponsibleStaff||!s.currentEmployee.id||!s.proposal.matchesIdentity(p.scope)||!writableNew())return;
  let active=true;const controller=new AbortController();defaultRequest.current=controller;
  const signal=AbortSignal.any([controller.signal,p.scope.signal,s.scope.signal]);
  const mayDefault=()=>active&&!signal.aborted&&s.proposal.canDefaultResponsibleStaff&&s.proposal.matchesIdentity(p.scope)&&writableNew();
  void(async()=>{try{
   // Always re-read the paired current staff directory, even when principal
   // has a name. Only an exact current staffId candidate may initialize it.
   for(let page=1;;page++){
    const result=await s.workspace.responsibleStaff!.readCandidates({parameters:{search:'',page,pageSize:20},signal,identity:p.scope.identity,routeInstanceId:p.scope.routeInstanceId,entityId:null});
    if(!mayDefault())return;
    const exact=result.items.find(item=>item.id===s.currentEmployee.id);
    if(exact){s.proposal.applyDefaultResponsibleStaff(exact,s.currentEmployee.id,s.proposal.getSnapshot().draft);return;}
    if(page*20>=result.total){setNotice('当前员工尚未在可选资料中找到，未自动指定负责人；可手动选择。');return;}
   }
  }catch(error){if(mayDefault()){if(error instanceof Error&&'kind'in error&&['unauthenticated','forbidden'].includes(String(error.kind)))p.denied(error as HttpQueryError);else setNotice('当前员工资料未能读取，请手动选择负责人。');}}})();
  return()=>{active=false;controller.abort();if(defaultRequest.current===controller)defaultRequest.current=null;};
 },[s,p.scope]);
 const busy=created.preparing||['submitting','checking','replaying','uncertain','committed'].includes(write.phase);
 const done=()=>{const current=s.workspace.getSnapshot().write;if(current.phase==='committed'&&current.result){const id=current.result.transferId;Object.assign(p.view,{draft:emptyTransferFilter(),applied:emptyTransferFilter(),scrollTop:0,scrollLeft:0,reload:true});delete p.view.requested;p.reset();p.navigate('transfer/view/'+encodeURIComponent(id));}};
 const save=async()=>{stopScan.current();setNotice(null);try{await s.create.save();done();}catch{if(p.scope.active)setNotice('保存尚未完成，输入已保留。');}};
 const recover=async(task:Promise<boolean>)=>{await task;done();};
 return <><TransferProposalForm registerScanCloser={close=>{stopScan.current=close;}} {...(p.viewProduct?{viewProduct:p.viewProduct}:{})} session={s.proposal} scope={p.scope} onResponsibleIntent={responsibleIntent} productReader={p.productReader} denied={p.denied} busy={busy} notice={notice??created.notice??command.notice} {...(s.workspace.responsibleStaff?{responsibleStaff:s.workspace.responsibleStaff}:{})} actions={<><button type="button" className="btn tc-back-link" disabled={busy} onClick={()=>transferCanLeave(s)?p.navigate('transfer'):setDiscard(true)}>返回列表</button><button type="button" className="btn" disabled={busy} onClick={()=>void save()}>保存</button><button type="button" className="btn primary" disabled title="保存并读取当前单据后可用">审核</button><button type="button" className="btn tc-secondary-action" disabled title="导出暂不可用">导出</button><button type="button" className="btn tc-secondary-action" disabled title="打印暂不可用">打印</button><button type="button" className="btn tc-secondary-action" disabled title="保存并读取当前单据后可用">操作历史</button></>}/>{['submitting','checking','replaying'].includes(write.phase)&&<p role="status">正在处理原操作… <button type="button" className="btn" onClick={()=>s.workspace.cancelWaiting()}>停止等待</button></p>}{write.phase==='committed'&&<button type="button" className="btn" onClick={done}>读取已保存单据</button>}{write.phase==='uncertain'&&(recovery?<SaleDialog variant="transfer" title="核实原操作" close={()=>setRecovery(false)} footer={<><button type="button" className="btn" onClick={()=>void recover(s.workspace.checkReceipt())}>查询原回执</button><button type="button" className="btn" onClick={()=>void recover(s.workspace.replayOriginal())}>按原请求重试</button></>}><p>{command.notice??'原操作结果尚未确认，草稿和原请求已保留。'}</p></SaleDialog>:<button type="button" className="btn" onClick={()=>setRecovery(true)}>核实原操作</button>)}{discard&&<SaleDialog variant="transfer" className="tc-confirm tc-danger" title="有未保存的修改" close={()=>setDiscard(false)} footer={<><button type="button" className="btn" onClick={()=>setDiscard(false)}>继续编辑</button><button type="button" className="btn primary" onClick={()=>{if(!s.create.getSnapshot().preparing&&!s.workspace.hasUnresolvedWrite&&s.workspace.discardEditor()&&s.proposal.reset(true)){p.reset();p.navigate('transfer');}}}>放弃修改并离开</button></>}><p>离开后，本次未保存的修改将丢失。</p></SaleDialog>}</>;
}
