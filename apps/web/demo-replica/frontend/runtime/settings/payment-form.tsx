import { Button, Input, Modal, Switch } from '@arco-design/web-react';
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { LatestQuery } from '../../../../src/loading/latest-query.ts';
import type { PaymentSettingsKind, PaymentSettingsProps, PaymentSettingsRecord } from '../../../../src/payment-settings/contracts.ts';
import { PaymentSettingsController, paymentRejectionMessage } from '../../../../src/payment-settings/controller.ts';
import { ReferenceSelect, readMessage } from './controls.tsx';
import PaymentHalls from './payment-halls.tsx';
interface Props extends PaymentSettingsProps{kind:PaymentSettingsKind;editor:PaymentSettingsController|null;detail:LatestQuery<{id:string},PaymentSettingsRecord|null>|null;onRecord:(record:PaymentSettingsRecord)=>void;close:(readbackConfirmed?:true)=>void;}
const names={methods:'收款方式',accounts:'资金账户'} as const;
function Field(props:{title:string;required?:boolean;error?:string|undefined;children:ReactNode}){return <div className="bs-field iw-form-field" role="group" aria-label={props.title}><span>{props.title}{props.required&&<i> *</i>}</span>{props.children}{props.error&&<small className="bs-error" role="alert">{props.error}</small>}</div>;}
export default function PaymentForm(props:Props){return props.editor?<Editor {...props} editor={props.editor}/>:props.detail?<Detail {...props} detail={props.detail}/>:null;}
function Detail(props:Props&{detail:NonNullable<Props['detail']>}){
 const state=useSyncExternalStore(props.detail.subscribe,props.detail.getSnapshot,props.detail.getSnapshot),delivered=useRef(false);
 useEffect(()=>{if(!delivered.current&&state.phase==='success'&&state.success?.data){delivered.current=true;props.onRecord(state.success.data);}},[state,props.onRecord]);
 return <Modal visible className="bs-modal iw-arco-modal iw-arco-controls" title={`编辑${names[props.kind]}`} maskClosable={false} autoFocus={false} onCancel={()=>props.close()} footer={<Button onClick={()=>props.close()}>取消</Button>}>{state.phase==='loading'||state.phase==='idle'?<p role="status">正在读取当前资料…</p>:state.phase==='error'?<p className="bs-error" role="alert">{readMessage(state.error)}<Button onClick={()=>{if(state.request)void props.detail.run(state.request.parameters);}}>重试资料</Button></p>:<p role="status">{state.success?.data?'正在准备编辑…':'当前资料不存在或已不可用。'}</p>}</Modal>;
}
function Editor(props:Props&{editor:PaymentSettingsController}){
 const {editor,kind}=props,state=useSyncExternalStore(editor.subscribe,editor.getSnapshot,editor.getSnapshot),confirmed=useRef(false),close=useRef(props.close);
 close.current=props.close;
 const [readback,setReadback]=useState<'idle'|'loading'|'error'>('idle'),[readbackAttempt,retryReadback]=useState(0);
 const result=state.write.phase==='committed'?state.write.result:null;
 useEffect(()=>{if(!result||confirmed.current)return;if(!props.detail){setReadback('error');return;}let active=true;setReadback('loading');
  void props.detail.run({id:result.targetId}).then(outcome=>{if(!active||!props.scope.active)return;if(outcome.status==='success'&&outcome.data?.id===result.targetId&&outcome.data.kind===kind&&outcome.data.version>=result.version){confirmed.current=true;close.current(true);}else setReadback('error');});
  return()=>{active=false;};
 },[result,props.detail,props.scope,kind,readbackAttempt]);
 if(state.disposed||!state.draft)return null;
 const draft=state.draft,editing=editor.record!==null,locked=editor.locked,cancel=()=>{if(state.write.phase==='committed')return;if(editor.requestClose())props.close();};
 return <Modal visible className="bs-modal iw-arco-modal iw-arco-controls runtime-settings" title={`${editing?'编辑':'新增'}${names[kind]}`} maskClosable={false} closable={state.write.phase!=='committed'} autoFocus={false} onCancel={cancel} onOk={()=>{void editor.submit();}} confirmLoading={['submitting','recovering'].includes(state.write.phase)} okText="确定" cancelText="取消" cancelButtonProps={{disabled:state.write.phase==='committed'}} okButtonProps={{disabled:!editor.writesEnabled||locked}}>
 <div className="bs-form-fields iw-form-fields"><Field title={kind==='accounts'?'账户名称':'名称'} required error={state.errors.name}><Input className="iw-arco-input" aria-label={kind==='accounts'?'账户名称':'名称'} value={draft.name} disabled={locked} autoComplete="off" onChange={name=>editor.update({name})}/></Field>
 {kind==='accounts'&&<><Field title="所属收款方式" required={!editing} error={state.errors.method}>{editing?<div className="bs-readonly">{draft.method?.name??'名称未提供'}</div>:<ReferenceSelect scope={props.scope} reader={props.directory} kind="payment-methods" label="所属收款方式" selected={draft.method} required disabled={locked} onChange={method=>editor.update({method})}/>}</Field>
 <Field title="适用营业厅" error={state.errors.halls}><PaymentHalls scope={props.scope} reader={props.directory} selected={draft.halls} disabled={locked} onChange={halls=>editor.update({halls})}/>{draft.halls.length===0&&<small>未关联营业厅。</small>}</Field></>}
 {editing&&<Field title="使用状态"><div className="bs-switch"><Switch aria-label="使用状态" checked={draft.enabled} disabled={locked} onChange={enabled=>editor.update({enabled})}/><span>{draft.enabled?'正常':'已停用'}</span></div></Field>}</div>
 {!editor.writesEnabled&&<p className="runtime-settings-note" role="status">维护保存尚未接入，填写内容不会提交。</p>}{state.write.phase==='rejected'&&<p className="bs-error" role="alert">{paymentRejectionMessage(state.write.error?.code??'')}</p>}
 {state.write.phase==='uncertain'&&<section className="bs-error" role="alert"><p>提交结果尚未确认，原请求身份与填写内容已保留，不能重新提交或放弃。</p><Button onClick={()=>{void editor.recover();}}>查询原操作回执</Button></section>}
 {state.write.phase==='committed'&&<p role={readback==='error'?'alert':'status'}>保存已确认。{readback==='error'?'当前资料读回失败，请重试读取。':'正在重新读取当前资料…'}{readback==='error'&&<Button onClick={()=>retryReadback(value=>value+1)}>重试读取</Button>}</p>}
 {state.closePrompt&&<section className="runtime-settings-note" role="alert"><p>放弃本次填写？</p><Button onClick={()=>editor.keepEditing()}>继续填写</Button><Button onClick={()=>{if(editor.discard())props.close();}}>放弃本次填写</Button></section>}
 </Modal>;
}
