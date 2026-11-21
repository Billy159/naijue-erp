import { uncertainOperation } from '../common/dialog-copy.ts';
import { SettingsDialog } from './settings-dialog.tsx';
import { Button, Input, Switch } from '@arco-design/web-react';
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
  return <SettingsDialog visible className="bs-modal iw-arco-modal iw-arco-controls runtime-settings" title={`${{CREATE:'新增',EDIT:'编辑',DISABLE:'要停用',RESTORE:'要恢复'}[editor.action]}${label}${editing?'':'吗？'}`} autoFocus={false} onCancel={()=>{controller.discardEditor();}} onOk={()=>{void controller.submit();}} confirmLoading={pending} okText={editing?'保存':'确定'} okButtonProps={{disabled:locked||!validName(editor.draftName)||!!editor.current||editor.action==='EDIT'&&editor.record?.name===editor.draftName&&editor.record.enabled===editor.draftEnabled}}>
    {editor.phase==='loading'&&<p role="status">正在读取当前{label}…</p>}
    {editor.phase==='error'&&<p className="bs-error" role="alert">{editor.readError?.kind==='not-found'?'找不到这条资料。':'没打开，填好的内容还在。'}<Button type="text" onClick={()=>{void controller.retryDetail();}}>重试</Button></p>}
    <div className="bs-form-fields iw-form-fields"><Field title="名称" required>{editing?<Input className="iw-arco-input" aria-label="名称" value={editor.draftName} autoComplete="off" disabled={locked} onChange={name=>controller.editName(name)}/>:<div className="bs-readonly">{editor.record?.name??'尚未读取'}</div>}</Field>
      <Field title="编码"><div className="bs-readonly" role="textbox" aria-label="编码" aria-readonly="true">{editor.record?.code??'保存后生成'}</div></Field>
      {editor.action==='EDIT'&&<Field title="使用状态"><div className="bs-switch"><Switch aria-label="使用状态" checked={editor.draftEnabled} disabled={locked} onChange={enabled=>controller.editEnabled(enabled)}/><span>{editor.draftEnabled?'正常':'已停用'}</span></div></Field>}
    </div>
    {!editing&&editor.phase==='ready'&&<p>{editor.action==='DISABLE'?`停用后不能再选这个${label}，以前的单据还在。`:`恢复后，又能选这个${label}。`}</p>}
    {state.notice&&<p className="bs-error" role="alert">{state.notice}</p>}
    {write.phase==='rejected'&&<section className="bs-error" role="alert"><p>{rejectionMessage(write.error?.code??'')}</p>{editor.id&&<Button onClick={()=>{void controller.readCurrent();}}>看最新资料</Button>}</section>}
    {uncertain&&<section className="bs-error" role="alert"><p>{uncertainOperation.body}</p><div className="bs-row-actions"><Button onClick={()=>{void controller.checkReceipt();}}>{uncertainOperation.check}</Button><Button onClick={()=>{void controller.replayOriginal();}}>{uncertainOperation.retry}</Button></div></section>}
    {editor.current&&<section className="runtime-settings-note" role="status"><p>资料已更新：{editor.current.name} · {editor.current.enabled?'正常':'已停用'}。你填的内容还在。</p><Button onClick={()=>controller.prepareCurrentVersion()}>用新资料</Button></section>}
  </SettingsDialog>;
}
