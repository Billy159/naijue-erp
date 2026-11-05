import { Button, Input, Modal, Switch } from '@arco-design/web-react';
import { useSyncExternalStore, type ReactNode } from 'react';
import { partyLabels } from '../../../../src/parties/contracts.ts';
import { rejectionMessage, type PartyMaintenanceController } from '../../../../src/parties/controller.ts';
import { validName } from '../../../../src/parties/response-validation.ts';

function Field(props:{title:string;required?:boolean;children:ReactNode}){return <div className="bs-field iw-form-field" role="group" aria-label={props.title}><span>{props.title}{props.required&&<i> *</i>}</span>{props.children}</div>;}
/** Frozen parties Fields/Modal, with the approved independent customer/supplier identity. */
export default function PartyForm(props:{controller:PartyMaintenanceController}){
  const {controller}=props,state=useSyncExternalStore(controller.subscribe,controller.getSnapshot,controller.getSnapshot),editor=state.editor,write=state.write,label=partyLabels[controller.kind];
  if(!editor||state.disposed||!controller.scope.active)return null;
  const editing=editor.action==='CREATE'||editor.action==='EDIT',pending=['submitting','checking','replaying'].includes(write.phase),uncertain=write.phase==='uncertain',locked=pending||uncertain||editor.phase!=='ready';
  return <Modal visible className="bs-modal iw-arco-modal iw-arco-controls runtime-settings" title={`${{CREATE:'新增',EDIT:'编辑',DISABLE:'停用',RESTORE:'恢复'}[editor.action]}${label}`} maskClosable={false} autoFocus={false} onCancel={()=>{controller.discardEditor();}} onOk={()=>{void controller.submit();}} confirmLoading={pending} okText="确定" cancelText="取消" okButtonProps={{disabled:locked||!validName(editor.draftName)||!!editor.current||editor.action==='EDIT'&&editor.record?.name===editor.draftName&&editor.record.enabled===editor.draftEnabled}}>
    {editor.phase==='loading'&&<p role="status">正在读取当前{label}…</p>}
    {editor.phase==='error'&&<p className="bs-error" role="alert">{editor.readError?.kind==='not-found'?'当前资料不存在或已不可用。':'当前资料读取失败，输入已保留。'}<Button type="text" onClick={()=>{void controller.retryDetail();}}>重试资料</Button></p>}
    <div className="bs-form-fields iw-form-fields"><Field title="名称" required>{editing?<Input className="iw-arco-input" aria-label="名称" value={editor.draftName} autoComplete="off" disabled={locked} onChange={name=>controller.editName(name)}/>:<div className="bs-readonly">{editor.record?.name??'尚未读取'}</div>}</Field>
      <Field title="编码"><div className="bs-readonly" role="textbox" aria-label="编码" aria-readonly="true">{editor.record?.code??'保存后生成'}</div></Field>
      {editor.action==='EDIT'&&<Field title="使用状态"><div className="bs-switch"><Switch aria-label="使用状态" checked={editor.draftEnabled} disabled={locked} onChange={enabled=>controller.editEnabled(enabled)}/><span>{editor.draftEnabled?'正常':'已停用'}</span></div></Field>}
    </div>
    {!editing&&editor.phase==='ready'&&<p>{editor.action==='DISABLE'?`确认停用此${label}？历史引用保留。`:`确认恢复此${label}？`}</p>}
    {state.notice&&<p className="bs-error" role="alert">{state.notice}</p>}
    {write.phase==='rejected'&&<section className="bs-error" role="alert"><p>{rejectionMessage(write.error?.code??'')}</p>{editor.id&&<Button onClick={()=>{void controller.readCurrent();}}>读取最新状态</Button>}</section>}
    {uncertain&&<section className="bs-error" role="alert"><p>提交结果尚未确认。输入、原请求键及目标版本已保留。</p><div className="bs-row-actions"><Button onClick={()=>{void controller.checkReceipt();}}>查询原操作回执</Button><Button onClick={()=>{void controller.replayOriginal();}}>重放原请求</Button></div></section>}
    {editor.current&&<section className="runtime-settings-note" role="status"><p>服务器当前：{editor.current.name} · {editor.current.enabled?'正常':'已停用'}。填写内容仍保留，请比较后确认。</p><Button onClick={()=>controller.prepareCurrentVersion()}>按最新版本重新准备</Button></section>}
  </Modal>;
}
