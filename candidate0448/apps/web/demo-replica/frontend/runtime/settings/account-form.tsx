import { Button, Input, Modal, Switch } from '@arco-design/web-react';
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { LatestQuery, type QuerySnapshot } from '../../../../src/loading/latest-query.ts';
import type { AccountIntent, AccountSettingsProps, AccountSettingsRecord, AccountStaffCandidate } from '../../../../src/account-settings/contracts.ts';
import type { StaffSettingsPage, StaffSettingsQuery } from '../../../../src/staff-settings/contracts.ts';
import { AccountSettingsController, accountRejectionMessage } from '../../../../src/account-settings/controller.ts';
import { accountStaffCandidate } from '../../../../src/account-settings/response-validation.ts';
import { readMessage, SmallSelect } from './controls.tsx';
interface Props extends AccountSettingsProps{editor:AccountSettingsController|null;detail:LatestQuery<{id:string},AccountSettingsRecord|null>|null;intent:AccountIntent;onRecord:(record:AccountSettingsRecord)=>void;close:()=>void;}
const idle=Object.freeze({phase:'idle' as const,request:null,success:null,error:null}),noSubscribe=()=>()=>{};
function Field(props:{title:string;required?:boolean;error?:string|undefined;children:ReactNode}){return <div className="bs-field iw-form-field" role="group" aria-label={props.title}><span>{props.title}{props.required&&<i> *</i>}</span>{props.children}{props.error&&<small className="bs-error" role="alert">{props.error}</small>}</div>;}
export default function AccountForm(props:Props){return props.editor?<Editor {...props} editor={props.editor}/>:props.detail?<Detail {...props} detail={props.detail}/>:null;}
function Detail(props:Props&{detail:NonNullable<Props['detail']>}){
 const state=useSyncExternalStore(props.detail.subscribe,props.detail.getSnapshot,props.detail.getSnapshot),delivered=useRef(false);
 useEffect(()=>{if(!delivered.current&&state.phase==='success'&&state.success?.data){delivered.current=true;props.onRecord(state.success.data);}},[state,props.onRecord]);
 return <Modal visible className="bs-modal iw-arco-modal iw-arco-controls" title="登录账号" maskClosable={false} onCancel={props.close} footer={<Button onClick={props.close}>取消</Button>}>{state.phase==='loading'||state.phase==='idle'?<p role="status">正在读取当前账号…</p>:state.phase==='error'?<p className="bs-error" role="alert">{readMessage(state.error)}<Button onClick={()=>{if(state.request)void props.detail.run(state.request.parameters);}}>重试资料</Button></p>:<p role="status">{state.success?.data?'正在准备编辑…':'当前账号不存在或已不可用。'}</p>}</Modal>;
}
function Editor(props:Props&{editor:AccountSettingsController}){
 const {editor}=props,state=useSyncExternalStore(editor.subscribe,editor.getSnapshot,editor.getSnapshot),password=useRef<HTMLDivElement>(null),[passwordKey,setPasswordKey]=useState(0),confirmed=useRef(false);
 useEffect(()=>()=>editor.passwordInputDetached(),[editor]);
 useEffect(()=>{if(state.write.phase==='committed'&&state.readback.phase==='idle')void editor.readback();if(state.write.phase==='committed'&&state.readback.phase==='ready'&&!confirmed.current){confirmed.current=true;props.close();}},[state.write.phase,state.readback.phase,editor,props.close]);
 if(state.disposed||!state.draft)return null;
 const draft=state.draft,locked=editor.locked,editing=editor.intent==='CREATE'||editor.intent==='EDIT',withPassword=editor.intent==='CREATE'||editor.intent==='RESET_PASSWORD',role=props.roles.find(role=>role.value===draft.staff?.role)?.label??'未提供';
 const cancel=()=>{if(editor.discard())props.close();},submit=()=>{const value=password.current?.querySelector('input')?.value??'';if(Object.keys(editor.validate(value.length>0)).length)return;void editor.submit(value);setPasswordKey(value=>value+1);};
 return <Modal visible className="bs-modal iw-arco-modal iw-arco-controls runtime-settings" title={{CREATE:'新增账号',EDIT:'编辑账号',DISABLE:'禁用账号',RESTORE:'启用账号',RESET_PASSWORD:'重置密码'}[editor.intent]} maskClosable={false} autoFocus={false} onCancel={cancel} onOk={submit} confirmLoading={['checking','submitting','recovering'].includes(state.write.phase)} okText="确定" cancelText="取消" okButtonProps={{disabled:!editor.writesEnabled||locked}}>
 <div className="bs-form-fields iw-form-fields"><Field title="所属员工" required={editor.intent==='CREATE'} error={state.errors.staff}>{editor.intent==='CREATE'?<StaffPicker {...props} selected={draft.staff} disabled={locked} onChange={staff=>editor.selectStaff(staff)}/>:<div className="bs-readonly">{draft.staff?.name??'未提供'}</div>}</Field>
 {draft.staff&&<Field title="员工资料"><div className="bs-readonly">{role} · {draft.staff.employmentStatus||'未提供'}</div></Field>}
 <Field title="登录账号" required={editing} error={state.errors.loginName}>{editing?<Input className="iw-arco-input" aria-label="登录账号" value={draft.loginName} autoComplete="off" disabled={locked} onChange={loginName=>editor.update({loginName})}/>:<div className="bs-readonly">{draft.loginName}</div>}</Field>
 {editing&&<Field title="登录权限" error={state.errors.loginEnabled}><div className="bs-switch"><Switch aria-label="登录权限" checked={draft.loginEnabled} disabled={locked} onChange={loginEnabled=>editor.update({loginEnabled})}/><span>{draft.loginEnabled?'已开通':'已关闭'}</span></div></Field>}
 {withPassword&&<Field title={editor.intent==='CREATE'?'初始密码':'新密码'} required error={state.errors.password}><div ref={password}><Input.Password key={passwordKey} className="iw-arco-input" aria-label={editor.intent==='CREATE'?'初始密码':'新密码'} defaultValue="" autoComplete="new-password" disabled={locked} onChange={value=>editor.setPasswordIntent(value.length>0)}/></div></Field>}</div>
 {(editor.intent==='DISABLE'||editor.intent==='RESTORE')&&<p>{editor.intent==='DISABLE'?'确认关闭此账号的登录权限？员工和历史记录继续保留。':'确认开通此账号的登录权限？服务器仍会核对员工与角色状态。'}</p>}
 {Object.entries(state.errors).filter(([key])=>!['staff','loginName','loginEnabled','password'].includes(key)).map(([key,error])=><p key={key} className="bs-error" role="alert">{error}</p>)}
 {!editor.writesEnabled&&<p className="runtime-settings-note" role="status">账号维护保存尚未接入。</p>}{state.needsPasswordReentry&&!locked&&<p className="bs-error" role="status">密码已从输入框清除，请重新输入后再提交。</p>}
 {state.write.phase==='rejected'&&<p className="bs-error" role="alert">{accountRejectionMessage(state.write.error?.code??'')}</p>}
 {state.write.phase==='uncertain'&&<section className="bs-error" role="alert"><p>提交结果尚未确认，原请求身份已保留，不能重新提交或放弃。</p><Button onClick={()=>{void editor.recover();}}>查询原操作回执</Button></section>}
 {state.write.phase==='committed'&&<p role="status">保存已确认。{state.readback.phase==='error'?'重新读取账号暂未完成。':'正在重新读取账号…'}{state.readback.phase==='error'&&<Button onClick={()=>{void editor.readback();}}>重试读取</Button>}</p>}
 </Modal>;
}
function StaffPicker(props:Props&{selected:AccountStaffCandidate|null;disabled:boolean;onChange:(staff:AccountStaffCandidate)=>void}){
 const [binding,setBinding]=useState<{scope:Props['scope'];reader:Props['staffReader'];query:LatestQuery<StaffSettingsQuery,StaffSettingsPage>}|null>(null),[opened,setOpened]=useState(false);
 useEffect(()=>{if(!props.staffReader){setBinding(null);return;}const reader=props.staffReader,query=new LatestQuery<StaffSettingsQuery,StaffSettingsPage>({scope:props.scope,execute:read=>reader.readList(read)});setBinding({scope:props.scope,reader,query});return()=>query.dispose();},[props.scope,props.staffReader]);
 const query=binding?.scope===props.scope&&binding.reader===props.staffReader?binding.query:null,state=useSyncExternalStore<QuerySnapshot<StaffSettingsQuery,StaffSettingsPage>>(query?.subscribe??noSubscribe,query?.getSnapshot??(()=>idle),query?.getSnapshot??(()=>idle));
 const current=state.phase==='success'?state.success:null,options=new Map<string,{value:string;label:string;disabled?:boolean}>();if(props.selected)options.set(props.selected.id,{value:props.selected.id,label:props.selected.name});for(const staff of current?.data.items??[])options.set(staff.id,{value:staff.id,label:staff.name,disabled:staff.account!==null});
 const run=(search='',page=1)=>{if(!props.disabled)void query?.run({search,page,pageSize:20,role:'',hallId:null,employmentStatus:'all',loginStatus:''});};
 return <SmallSelect label="所属员工" placeholder="请选择员工" value={props.selected?.id??''} items={[...options.values()]} disabled={props.disabled||!query} loading={state.phase==='loading'} search remote onOpen={()=>{setOpened(true);run();}} onClose={()=>{setOpened(false);query?.cancel();}} onSearch={search=>{if(opened)run(search);}} onChange={id=>{const record=current?.data.items.find(staff=>staff.id===id&&staff.account===null);if(record)props.onChange(accountStaffCandidate(record));}}
 footer={<>{state.phase==='error'&&<div className="runtime-settings-directory" role="alert">{readMessage(state.error)}<Button onMouseDown={e=>e.preventDefault()} onClick={()=>{if(state.request)void query?.run(state.request.parameters);}}>重试</Button></div>}{current&&current.data.total>current.data.pageSize&&<div className="runtime-settings-directory"><Button size="mini" disabled={current.data.page<=1} onMouseDown={e=>e.preventDefault()} onClick={()=>run(current.parameters.search,current.data.page-1)}>上一页</Button><span>共 {current.data.total} 条</span><Button size="mini" disabled={current.data.page*current.data.pageSize>=current.data.total} onMouseDown={e=>e.preventDefault()} onClick={()=>run(current.parameters.search,current.data.page+1)}>下一页</Button></div>}</>}/>;
}
