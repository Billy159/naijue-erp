import {salesBusinessMode} from '../../../../src/current-form/sales-business-mode.ts';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { SalesProposalForm, salesPaymentSummary } from './proposal-form.tsx';
import { SaleDialog } from './native-dialog.tsx';
import { HttpQueryError } from '../../../../src/transport/http-query.ts';
import type { SalesExistingDocumentSession } from '../../../../src/current-form/sales-existing-document.ts';
import type {Options} from './sales-page-contracts.ts';
import {WriteRecovery} from './sales-write-recovery.tsx';
import {SalesReadBody} from './sales-read-body.tsx';
export default function EditDocument(p:Options&{id:string}) {
 const editor=p.session.editor;
 const [model,setModel]=useState<SalesExistingDocumentSession|null>(null),[notice,setNotice]=useState('正在读取完整单据…'),[attempt,setAttempt]=useState(0),[loading,setLoading]=useState(true);
 useEffect(()=>{let active=true;setModel(null);setLoading(true);setNotice('正在读取完整单据…');void(async()=>{try{if(!await editor.openExisting(p.id)){if(active&&p.scope.active)setNotice('单据未能读取，当前输入已保留。');return;}const next=editor.prepareExistingDocument();if(!next){if(active&&p.scope.active)setNotice('当前单据编辑资料未就绪，请返回单据核对后重试。');return;}await next.initialize();if(active&&p.scope.active){setModel(next);setNotice(next.getSnapshot().notice??'');}}catch(error){if(active&&p.scope.active){if(error instanceof HttpQueryError&&['unauthenticated','forbidden'].includes(error.kind))p.denied(error);else setNotice('编辑资料读取失败，当前输入已保留。');}}finally{if(active&&p.scope.active)setLoading(false);}})();return()=>{active=false;};},[p.id,attempt]);
 return model?<ExistingForm {...p} model={model} retry={()=>setAttempt(value=>value+1)}/>:<section className="tc-workbench tc-editor sale-workbench sale-editor"><div className="tc-head"><h1>编辑销货单</h1><button className="btn" onClick={()=>{if(editor.discardEditor(true))p.navigate('sales/view/'+encodeURIComponent(p.id));}}>返回单据</button><button type="button" className="btn" disabled={loading} onClick={()=>setAttempt(value=>value+1)}>重试编辑资料</button></div><p role={loading?'status':'alert'}>{notice}</p></section>;
}
function ExistingForm(p:Options&{id:string;model:SalesExistingDocumentSession;retry:()=>void}){
 const model=useSyncExternalStore(p.model.subscribe,p.model.getSnapshot,p.model.getSnapshot),editor=useSyncExternalStore(p.session.editor.subscribe,p.session.editor.getSnapshot,p.session.editor.getSnapshot);
 const [discard,setDiscard]=useState(false);
 const [businessChoice,setBusinessChoice]=useState<'SALE'|'RETURN_EXCHANGE'|null>(salesBusinessMode(p.model.original?.document.header.businessType??'SALE'));
 const done=()=>{const write=p.session.editor.getSnapshot().command.write;if(write.phase==='committed'&&write.result){p.session.editor.discardEditor(true);p.onCommitted();p.navigate('sales/view/'+encodeURIComponent(write.result.salesId));}};
 const busy=model.preparing||editor.preparing||['submitting','checking','replaying','uncertain','committed'].includes(editor.command.write.phase);
 const finishCancel=()=>{if(busy||!p.scope.active)return;if(p.session.editor.discardEditor(true)){setDiscard(false);p.navigate('sales/view/'+encodeURIComponent(p.id));}};
 const cancel=()=>{if(busy||!p.scope.active)return;if(p.model.hasDirtyDraft)setDiscard(true);else finishCancel();};
 if(model.phase!=='ready'||!model.proposal){const original=p.model.original;const actions=<><button type="button" className="btn" disabled={busy} onClick={()=>p.navigate('sales/view/'+encodeURIComponent(p.id))}>返回单据</button><button type="button" className="btn primary" disabled={busy} onClick={p.retry}>重试编辑资料</button></>;return <>{original?<SalesReadBody detail={original} actions={actions}/>:<section className="tc-workbench tc-editor sale-workbench sale-editor"><div className="tc-head"><h1>编辑销货单</h1><div className="actions">{actions}</div></div></section>}<p role="alert">{model.notice??'完整编辑资料未就绪，已保留读取的原单据，尚未启用修改。'}</p><WriteRecovery session={p.session} committed={done}/></>;}

 return <>{model.phase==='ready'&&model.proposal?<SalesProposalForm businessChoice={businessChoice} chooseBusiness={setBusinessChoice} currentEmployeeId={p.session.currentEmployee.id} {...(p.viewProduct?{viewProduct:p.viewProduct}:{})} session={model.proposal} scope={p.scope} productReader={p.productReader} denied={p.denied} number={p.model.original?.document.header.number??p.id} busy={busy} notice={model.notice??editor.notice??editor.command.notice} actions={<><button className="btn" disabled={busy} onClick={cancel}>取消修改</button><button className="btn primary" disabled={busy||!businessChoice} onClick={()=>{if(businessChoice)void p.model.save().then(done);}}>保存</button></>}/>:<p role="alert">{model.notice??'完整编辑资料尚未就绪。'}</p>}<WriteRecovery session={p.session} committed={done}/>{discard&&<SaleDialog className="sale-confirm sale-danger" title="有未保存的修改" close={()=>setDiscard(false)} footer={<><button className="btn" onClick={()=>setDiscard(false)}>继续录单</button><button className="btn primary" disabled={busy} onClick={finishCancel}>放弃修改并离开</button></>}><p>离开将放弃本次修改，已保存单据保持原样。</p></SaleDialog>}</>;
}
