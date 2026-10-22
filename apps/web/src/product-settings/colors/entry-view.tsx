import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { UIButton, UIInput } from '../../components/standard-controls.tsx';
import { StandardOverlay } from '../../components/standard-overlay.tsx';
import type { ReadScope } from '../../loading/read-scope.ts';
import type { CatalogueMaintenanceCapability, CatalogueSettingsEntry } from './contracts.ts';
import { useCatalogueEditor, type CatalogueEditorController, type CatalogueWriteState } from '../catalogue-maintenance-state.ts';
import type { CatalogueMaintenanceAction, CatalogueMaintenanceResult } from '../catalogue-maintenance-http-client.ts';

/** Exact authorized list snapshot, never an editor or write capability. */
export function CatalogueEntryView({ entry, label, close }: { readonly entry: CatalogueSettingsEntry; readonly label: '颜色' | '版型'; readonly close: () => void }) {
  return <StandardOverlay title={`查看${label}`} closeLabel={`关闭查看${label}`} close={close} className="catalogue-entry-modal pc-arco-modal" width={480}
    footer={dismiss => <><UIButton className="pc-delete-left" disabled title="删除维护尚未接入">删除</UIButton><UIButton onClick={dismiss}>取消</UIButton><UIButton className="primary" disabled title="保存维护尚未接入">确定</UIButton></>}>
    <p className="catalogue-view-note">当前仅查看已授权读取的资料；新增、修改和删除尚未接入。</p>
    <form onSubmit={event => event.preventDefault()} aria-label={`${label}资料只读`}><label className="field"><span>{label}名称</span><UIInput value={entry.name} readOnly /></label><label className="field"><span>{label}代码</span><UIInput value={entry.code} readOnly /></label><div className="field"><span>启用状态</span><p className="pc-text-block">{entry.enabled ? '启用' : '停用'}</p></div><p className="catalogue-version">版本：{entry.version}</p></form>
  </StandardOverlay>;
}
export function CatalogueWriteFeedback({ state, controller, finish }: {readonly state:CatalogueWriteState;readonly controller:CatalogueEditorController;readonly finish:()=>void}) {
  return <>{state.error&&<p role="alert" className="catalogue-write-error">{state.error.message}</p>}{state.phase==='submitting'&&<p role="status">正在保存，请保留当前页面。</p>}
    {(state.phase==='uncertain'||state.phase==='checking')&&<div className="catalogue-write-recovery" role="status"><p>保存结果尚未确认。</p><UIButton disabled={state.phase==='checking'} onClick={()=>void controller.recover().then(finish)}>查回保存结果</UIButton><UIButton disabled={state.phase==='checking'} onClick={()=>void controller.retryOriginal().then(finish)}>按原请求重试</UIButton></div>}</>;
}
interface EditorProps {
  readonly scope:ReadScope;readonly capability:CatalogueMaintenanceCapability;readonly entry:CatalogueSettingsEntry|null;readonly label:'颜色'|'版型';
  readonly close:()=>void;readonly onCommitted:(result:CatalogueMaintenanceResult)=>void;readonly reload:()=>void;
  readonly onAccessFailure:(kind:'unauthenticated'|'forbidden')=>void;readonly onCanLeaveChange:(guard:(()=>boolean)|null)=>void;
}
export function CatalogueEntryEditor(props:EditorProps){
  const controller=useCatalogueEditor(props.scope,props.capability,props.onAccessFailure);
  return controller?<EntryEditorForm {...props} controller={controller}/>:null;
}
function EntryEditorForm(props:EditorProps&{readonly controller:CatalogueEditorController}){
  const [name,setName]=useState(props.entry?.name??''),[code,setCode]=useState(props.entry?.code??''),[error,setError]=useState('');
  const [discard,setDiscard]=useState<'close'|'reload'|null>(null),[deleting,setDeleting]=useState(false),guard=useRef<()=>boolean>(()=>true),finished=useRef(false);
  const state=useSyncExternalStore(props.controller.subscribe,props.controller.getSnapshot,props.controller.getSnapshot);
  const dirty=name!==(props.entry?.name??'')||code!==(props.entry?.code??''),pending=['submitting','checking','uncertain'].includes(state.phase),committed=state.phase==='committed';
  const allowed=(action:CatalogueMaintenanceAction)=>props.capability.allowedActions.includes(action),writeAction=props.entry?'EDIT':'CREATE';
  guard.current=()=>committed||!dirty&&!pending;
  useEffect(()=>{props.onCanLeaveChange(()=>guard.current());return()=>props.onCanLeaveChange(null);},[props.onCanLeaveChange]);
  const finish=()=>{const result=props.controller.getSnapshot().result;if(result&&!finished.current&&props.scope.active){finished.current=true;props.onCommitted(result);}};
  const close=(action:'close'|'reload'='close')=>{if(pending)return;if(dirty&&!committed)setDiscard(action);else{props.close();if(action==='reload')props.reload();}};
  const submit=async(action:CatalogueMaintenanceAction=writeAction)=>{if(pending||committed||!allowed(action))return;setError('');try{
    if(action==='CREATE')await props.controller.submit({action,values:{name,code,enabled:true}});
    else if(props.entry&&action==='EDIT')await props.controller.submit({action,id:props.entry.id,expectedVersion:props.entry.version,values:{name,code,enabled:props.entry.enabled}});
    else if(props.entry)await props.controller.submit({action:action as 'DISABLE'|'RESTORE'|'DELETE',id:props.entry.id,expectedVersion:props.entry.version});
    finish();
  }catch{setError(props.label==='版型'?'请填写名称（最多40字）和一个大写英文字母代码。':'请填写名称（最多40字）和代码（最多12字）。');}};
  if(!props.scope.active||state.phase==='disposed')return null;
  return <StandardOverlay title={`${props.entry?'编辑':'新增'}${props.label}`} closeLabel={`关闭${props.entry?'编辑':'新增'}${props.label}`} close={()=>close()} className="catalogue-entry-modal pc-arco-modal" width={480}
    footer={<>{props.entry&&allowed('DELETE')&&<UIButton className="pc-delete-left" disabled={pending||committed} onClick={()=>setDeleting(true)}>删除</UIButton>}{props.entry&&allowed(props.entry.enabled?'DISABLE':'RESTORE')&&<UIButton disabled={pending||committed||dirty} onClick={()=>void submit(props.entry!.enabled?'DISABLE':'RESTORE')}>{props.entry.enabled?'停用':'恢复启用'}</UIButton>}<UIButton disabled={pending} onClick={()=>close()}>取消</UIButton><UIButton className="primary" disabled={pending||committed||!allowed(writeAction)||!!props.entry&&!dirty} onClick={()=>void submit()}>确定</UIButton></>}>
    <form onSubmit={event=>{event.preventDefault();void submit();}} aria-label={`${props.label}维护`}><label className="field"><span>{props.label}名称</span><UIInput aria-label={`${props.label}名称`} value={name} maxLength={40} disabled={pending||committed||!allowed(writeAction)} onChange={setName}/></label><label className="field"><span>{props.label}代码</span><UIInput aria-label={`${props.label}代码`} value={code} maxLength={props.label==='版型'?1:12} disabled={pending||committed||!allowed(writeAction)} onChange={setCode}/></label></form>
    {error&&<p role="alert" className="catalogue-write-error">{error}</p>}<CatalogueWriteFeedback state={state} controller={props.controller} finish={finish}/>
    {state.error?.code==='VERSION_CONFLICT'&&<UIButton onClick={()=>close('reload')}>关闭并读取最新目录</UIButton>}
    {discard&&<StandardOverlay title="放弃未保存资料" closeLabel="关闭放弃确认" close={()=>setDiscard(null)} footer={dismiss=><><UIButton onClick={dismiss}>继续填写</UIButton><UIButton onClick={()=>{const action=discard;props.close();if(action==='reload')props.reload();}}>放弃填写</UIButton></>}><p>是否放弃当前未保存的{props.label}资料？</p></StandardOverlay>}
    {deleting&&<StandardOverlay title={`确认删除${props.label}`} closeLabel="关闭删除确认" close={()=>setDeleting(false)} footer={dismiss=><><UIButton onClick={dismiss}>取消</UIButton><UIButton className="primary" onClick={()=>{setDeleting(false);void submit('DELETE');}}>确认删除</UIButton></>}><p>确认删除“{props.entry?.name}”？仍有商品、规格或图片引用时无法删除。</p></StandardOverlay>}
  </StandardOverlay>;
}
