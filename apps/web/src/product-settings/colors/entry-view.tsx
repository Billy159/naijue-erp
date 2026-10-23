import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Input } from '@arco-design/web-react';
import './source-catalogue-settings.css';
import { UIButton } from '../../components/standard-controls.tsx';
import { StandardOverlay } from '../../components/standard-overlay.tsx';
import type { ReadScope } from '../../loading/read-scope.ts';
import type { CatalogueMaintenanceCapability, CatalogueSettingsEntry } from './contracts.ts';
import { useCatalogueEditor, type CatalogueEditorController, type CatalogueWriteState } from '../catalogue-maintenance-state.ts';
import type { CatalogueMaintenanceAction, CatalogueMaintenanceResult } from '../catalogue-maintenance-http-client.ts';

export function CatalogueWriteFeedback({ state, controller, finish }: {readonly state:CatalogueWriteState;readonly controller:CatalogueEditorController;readonly finish:()=>void}) {
  return <>{state.error&&<p role="alert" className="catalogue-write-error">{state.error.message}</p>}{state.phase==='submitting'&&<p role="status">正在保存，请保留当前页面。</p>}
    {(state.phase==='uncertain'||state.phase==='checking')&&<div className="catalogue-write-recovery" role="status"><p>保存结果尚未确认。</p><UIButton disabled={state.phase==='checking'} onClick={()=>void controller.recover().then(finish)}>查回保存结果</UIButton><UIButton disabled={state.phase==='checking'} onClick={()=>void controller.retryOriginal().then(finish)}>按原请求重试</UIButton></div>}</>;
}
interface EditorProps {
  readonly scope:ReadScope;readonly capability:CatalogueMaintenanceCapability;readonly entry:CatalogueSettingsEntry|null;readonly label:'颜色'|'版型';
  readonly close:()=>void;readonly onCommitted:(result:CatalogueMaintenanceResult,values?:{readonly name:string;readonly code:string})=>void;readonly reload:()=>void;
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
  const finish=()=>{const result=props.controller.getSnapshot().result;if(result&&!finished.current&&props.scope.active){finished.current=true;const command=props.controller.getSnapshot().command;props.onCommitted(result,command&&'values' in command&&'code' in command.values?{name:command.values.name,code:command.values.code}:undefined);}};
  const close=(action:'close'|'reload'='close')=>{if(pending)return;if(dirty&&!committed)setDiscard(action);else{props.close();if(action==='reload')props.reload();}};
  const submit=async(action:CatalogueMaintenanceAction=writeAction)=>{if(pending||committed||!allowed(action))return;setError('');try{
    if(action==='CREATE')await props.controller.submit({action,values:{name,code,enabled:true}});
    else if(props.entry&&action==='EDIT')await props.controller.submit({action,id:props.entry.id,expectedVersion:props.entry.version,values:{name,code,enabled:props.entry.enabled}});
    else if(props.entry)await props.controller.submit({action:action as 'DISABLE'|'RESTORE'|'DELETE',id:props.entry.id,expectedVersion:props.entry.version});
    finish();
  }catch{setError(props.label==='版型'?'请填写名称（最多40字）和一个大写英文字母代码。':'请填写名称（最多40字）和代码（最多12字）。');}};
  if(!props.scope.active||state.phase==='disposed')return null;
  return <StandardOverlay presentation="catalogue" title={`${props.entry?'编辑':'新增'}${props.label}`} closeLabel={`关闭${props.entry?'编辑':'新增'}${props.label}`} close={()=>close()} className="catalogue-entry-modal pc-arco-modal" width={480}
    footer={<div className="pc-modal-foot">{props.entry&&allowed('DELETE')&&<button type="button" className="btn ghost pc-danger pc-delete-left" disabled={pending||committed} onClick={()=>setDeleting(true)}>删除</button>}{props.entry&&allowed(props.entry.enabled?'DISABLE':'RESTORE')&&<button type="button" className="btn" disabled={pending||committed||dirty} onClick={()=>void submit(props.entry!.enabled?'DISABLE':'RESTORE')}>{props.entry.enabled?'停用':'恢复启用'}</button>}<button type="button" className="btn" disabled={pending} onClick={()=>close()}>取消</button><button type="submit" form="product-catalogue-entry-form" className="btn primary" disabled={pending||committed||!allowed(writeAction)||!!props.entry&&!dirty}>确定</button></div>}>
    <div className="pc-modal-body"><form id="product-catalogue-entry-form" onSubmit={event=>{event.preventDefault();void submit();}} aria-label={`${props.label}维护`}><div className="field"><span className="pc-field-caption">{props.label}名称</span><div className="pc-arco-host"><Input name="name" aria-label={`${props.label}名称`} value={name} maxLength={40} placeholder="" disabled={pending||committed||!allowed(writeAction)} onChange={setName}/></div></div><div className="field"><span className="pc-field-caption">{props.label}代码</span><div className="pc-arco-host"><Input name="code" aria-label={`${props.label}代码`} value={code} maxLength={props.label==='版型'?1:12} placeholder="" disabled={pending||committed||!allowed(writeAction)} onChange={setCode}/></div></div></form></div>
    {error&&<p role="alert" className="catalogue-write-error">{error}</p>}<CatalogueWriteFeedback state={state} controller={props.controller} finish={finish}/>
    {state.error?.code==='VERSION_CONFLICT'&&<UIButton onClick={()=>close('reload')}>关闭并读取最新目录</UIButton>}
    {discard&&<StandardOverlay presentation="catalogue" title="有未保存的修改" closeLabel="关闭放弃确认" close={()=>setDiscard(null)} footer={dismiss=><div className="pc-modal-foot"><button type="button" className="btn" onClick={dismiss}>继续填写</button><button type="button" className="btn" onClick={()=>{const action=discard;props.close();if(action==='reload')props.reload();}}>放弃填写</button></div>}><p>是否放弃当前未保存的{props.label}资料？</p></StandardOverlay>}
    {deleting&&<StandardOverlay presentation="catalogue" title={`确认删除${props.label}`} closeLabel="关闭删除确认" close={()=>setDeleting(false)} footer={dismiss=><div className="pc-modal-foot"><button type="button" className="btn" onClick={dismiss}>取消</button><button type="button" className="btn primary" onClick={()=>{setDeleting(false);void submit('DELETE');}}>确认删除</button></div>}><p>确认删除“{props.entry?.name}”？仍有商品、规格或图片引用时无法删除。</p></StandardOverlay>}
  </StandardOverlay>;
}
