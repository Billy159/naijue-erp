import { Button, Checkbox, Input, Modal, Switch } from '@arco-design/web-react';
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { LatestQuery } from '../../../../src/loading/latest-query.ts';
import type { StaffSettingsProps, StaffSettingsRecord } from '../../../../src/staff-settings/contracts.ts';
import { staffRejectionMessage, type StaffSettingsController, type StaffEditorIntent } from '../../../../src/staff-settings/controller.ts';
import { readMessage, ReferenceSelect, SmallSelect } from './controls.tsx';
interface Props extends StaffSettingsProps{editor:StaffSettingsController|null;detail:LatestQuery<{id:string},StaffSettingsRecord|null>|null;intent:StaffEditorIntent;onRecord:(record:StaffSettingsRecord)=>void;close:()=>void;}
function Field(props:{title:string;required?:boolean;error?:string|undefined;children:ReactNode}){return <div className="bs-field iw-form-field" role="group" aria-label={props.title}><span>{props.title}{props.required&&<i> *</i>}</span>{props.children}{props.error&&<small className="bs-error" role="alert">{props.error}</small>}</div>;}
export default function StaffForm(props:Props){return props.editor?<Editor {...props} editor={props.editor}/>:props.detail?<Detail {...props} detail={props.detail}/>:null;}
function Detail(props:Props&{detail:NonNullable<Props['detail']>}){
 const state=useSyncExternalStore(props.detail.subscribe,props.detail.getSnapshot,props.detail.getSnapshot),delivered=useRef(false);
 useEffect(()=>{if(!delivered.current&&state.phase==='success'&&state.success?.data){delivered.current=true;props.onRecord(state.success.data);}},[state,props.onRecord]);
 return <Modal visible className="bs-modal bs-modal-staff iw-arco-modal iw-arco-controls" title="员工资料" maskClosable={false} onCancel={props.close} footer={<Button onClick={props.close}>取消</Button>}>{state.phase==='loading'||state.phase==='idle'?<p role="status">正在读取当前员工…</p>:state.phase==='error'?<p className="bs-error" role="alert">{readMessage(state.error)}<Button onClick={()=>{if(state.request)void props.detail.run(state.request.parameters);}}>重试资料</Button></p>:<p role="status">{state.success?.data?'正在准备编辑…':'当前员工不存在或已不可用。'}</p>}</Modal>;
}
function Editor(props:Props&{editor:StaffSettingsController}){
 const {editor}=props,state=useSyncExternalStore(editor.subscribe,editor.getSnapshot,editor.getSnapshot),password=useRef<HTMLDivElement>(null),[passwordKey,setPasswordKey]=useState(0),confirmed=useRef(false);
 useEffect(()=>()=>editor.passwordInputDetached(),[editor]);
 useEffect(()=>{if(state.write.phase==='committed'&&state.readback.phase==='idle')void editor.readback();if(state.write.phase==='committed'&&state.readback.phase==='ready'&&!confirmed.current){confirmed.current=true;props.close();}},[state.write.phase,state.readback.phase,editor,props.close]);
 if(state.disposed||!state.draft)return null;
 const draft=state.draft,record=editor.record,editing=editor.intent==='edit',hadAccount=!!record?.account,locked=editor.locked,requiresHall=props.roles.find(role=>role.value===draft.role)?.requiresHall===true;
 const cancel=()=>{if(editor.requestClose())props.close();};
 const submit=()=>{const value=password.current?.querySelector('input')?.value??'';if(Object.keys(editor.validate(value.length>0)).length)return;void editor.submit(value);setPasswordKey(value=>value+1);};
 const roles=props.roles.map(role=>({value:role.value,label:role.label}));if(draft.role&&!roles.some(role=>role.value===draft.role))roles.unshift({value:draft.role,label:'原角色未配置'});
 return <Modal visible className={`bs-modal iw-arco-modal iw-arco-controls runtime-settings${editing?' bs-modal-staff':''}`} title={editing?`${record?'编辑':'新增'}员工`:editor.intent==='LEAVE'?'确认办理离职':'确认恢复在职'} maskClosable={false} autoFocus={false} onCancel={cancel} onOk={submit} confirmLoading={['submitting','recovering'].includes(state.write.phase)} okText="确定" cancelText="取消" okButtonProps={{disabled:!editor.writesEnabled||locked}}>
 {editing?<div className="bs-form-fields iw-form-fields bs-staff-fields"><Field title="姓名" required error={state.errors.name}><Input className="iw-arco-input" aria-label="姓名" value={draft.name} disabled={locked} onChange={name=>editor.update({name})} autoComplete="off"/></Field><Field title="角色" required error={state.errors.role}><SmallSelect label="角色" placeholder="请选择" value={draft.role} items={roles} disabled={locked} onChange={role=>editor.update({role})}/></Field>
 <Field title="所属营业厅" required={requiresHall} error={state.errors.hall}><ReferenceSelect scope={props.scope} reader={props.directory} kind="halls" label="所属营业厅" selected={draft.hall} required={requiresHall} disabled={locked} onChange={hall=>editor.update({hall})}/></Field><Field title="联系方式" error={state.errors.contact}><Input className="iw-arco-input" aria-label="联系方式" value={draft.contact} disabled={locked} onChange={contact=>editor.update({contact})}/></Field>
 {!record&&<div className="bs-wide"><Checkbox checked={draft.loginEnabled} disabled={locked} onChange={loginEnabled=>{editor.update({loginEnabled,...(!loginEnabled?{loginName:''}:{})});if(!loginEnabled)setPasswordKey(value=>value+1);}}>同步开通登录账号</Checkbox></div>}
 {record&&!hadAccount&&!draft.loginEnabled&&<Field title="登录账号"><div className="bs-readonly">未开通</div></Field>}
 {(hadAccount||draft.loginEnabled)&&<Field title="登录账号" required error={state.errors.loginName}><Input className="iw-arco-input" aria-label="登录账号" value={draft.loginName} disabled={locked} onChange={loginName=>editor.update({loginName})} autoComplete="off"/></Field>}
 {(hadAccount||draft.loginEnabled)&&<Field title={hadAccount?'重置密码':'初始密码'} required={!hadAccount} error={state.errors.password}><div ref={password}><Input.Password key={passwordKey} className="iw-arco-input" aria-label={hadAccount?'重置密码':'初始密码'} defaultValue="" autoComplete="new-password" disabled={locked} placeholder={hadAccount?'留空保留原密码':''} onChange={value=>editor.setPasswordIntent(value.length>0)}/></div></Field>}
 {record&&<Field title="登录权限" error={state.errors.loginEnabled}><div className="bs-switch"><Switch aria-label="登录权限" checked={draft.loginEnabled} disabled={locked||record.employmentStatus==='离职'} onChange={loginEnabled=>editor.update({loginEnabled})}/><span>{draft.loginEnabled?'已开通':'已关闭'}</span></div></Field>}
 </div>:<p>{editor.intent==='LEAVE'?`确定为「${record?.name??''}」办理离职？办理后登录权限关闭，员工资料、登录账号和历史单据继续保留。恢复在职后登录权限仍保持关闭。`:`确定恢复「${record?.name??''}」在职？登录权限仍保持关闭，需要登录时请在编辑员工中手工开通。`}</p>}
 {!editor.writesEnabled&&<p className="runtime-settings-note" role="status">维护保存尚未接入，填写内容不会提交。</p>}
 {state.needsPasswordReentry&&!locked&&<p className="bs-error" role="status">密码已从输入框清除，请重新输入后再提交。{hadAccount&&<Button type="text" onClick={()=>{editor.cancelPasswordReset();setPasswordKey(value=>value+1);}}>取消本次改密</Button>}</p>}
 {state.write.phase==='rejected'&&<p className="bs-error" role="alert">{staffRejectionMessage(state.write.error?.code??'')}</p>}
 {state.write.phase==='uncertain'&&<section className="bs-error" role="alert"><p>提交结果尚未确认，原请求身份已保留，不能重新提交或放弃。</p><Button onClick={()=>{void editor.recover();}}>查询原操作回执</Button></section>}
 {state.write.phase==='committed'&&<p role="status">保存已确认。{state.readback.phase==='error'?'重新读取资料暂未完成。':'正在重新读取资料…'}{state.readback.phase==='error'&&<Button onClick={()=>{void editor.readback();}}>重试读取</Button>}</p>}
 {state.closePrompt&&<section className="runtime-settings-note" role="alert"><p>放弃本次填写？</p><Button onClick={()=>editor.keepEditing()}>继续填写</Button><Button onClick={()=>{if(editor.discard())props.close();}}>放弃本次填写</Button></section>}
 </Modal>;
}
