import { UIButton } from '../components/standard-controls.tsx';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { QueryRead } from '../loading/latest-query.ts';
import { validateCatalogueSettingsTree } from '../../../../packages/application/src/catalogue-settings-read-validation.ts';
import type { CatalogueSettingsPageProps, CatalogueSettingsTree, CatalogueSettingsTreeQuery } from '../product-settings/colors/contracts.ts';
import { useCatalogueReadOwner, type CatalogueReadOwner } from '../product-settings/colors/read-owner.tsx';
import { CatalogueReadState } from '../product-settings/colors/read-state.tsx';
import { CatalogueCategoryTree } from './category-tree.tsx';
import { StandardOverlay } from '../components/standard-overlay.tsx';
import { useCatalogueEditor, type CatalogueEditorController } from '../product-settings/catalogue-maintenance-state.ts';
import { CatalogueWriteFeedback } from '../product-settings/colors/entry-view.tsx';
import type { CatalogueMaintenanceCapability, CatalogueSettingsCategory } from '../product-settings/colors/contracts.ts';
import type { CategoryWriteValues, CatalogueMaintenanceResult, CatalogueMaintenanceAction, CategoryOrderResult } from '../product-settings/catalogue-maintenance-http-client.ts';
import { categoryPath, categoryTreeIndex, categoryReorderDraft } from './tree-model.ts';
import '../product-settings/colors/source-catalogue-settings.css';
import './source-product-categories.css';

const initial: CatalogueSettingsTreeQuery = Object.freeze({});
export function ProductCategoriesPage(props: CatalogueSettingsPageProps) {
  const execute = useMemo(() => async (read: QueryRead<CatalogueSettingsTreeQuery>) => validateCatalogueSettingsTree(await props.reader.readCategories(read)), [props.reader]);
  const owner = useCatalogueReadOwner(props, execute, initial);
  if(props.maintenance&&props.maintenance.kind!=='CATEGORY')throw new TypeError('Category maintenance capability required.');
  return owner ? props.maintenance&&props.onCanLeaveChange ? <CategoryMaintenanceContent key={owner.scope.routeInstanceId} {...props} capability={props.maintenance} onCanLeaveChange={props.onCanLeaveChange} owner={owner}/> : <CategoryContent key={owner.scope.routeInstanceId} owner={owner} /> : null;
}
function CategoryContent({ owner }: { readonly owner: CatalogueReadOwner<CatalogueSettingsTreeQuery, CatalogueSettingsTree> }) {
  const { scope, query } = owner, snapshot = useSyncExternalStore(query.subscribe, query.getSnapshot, query.getSnapshot);
  const result = snapshot.success?.data, index = useMemo(() => categoryTreeIndex(result?.items ?? []), [result]);
  const [selection, setSelection] = useState<string | null>(null), selected = selection && index.byId.has(selection) ? index.byId.get(selection)! : (index.children.get(null)?.[0] ?? null);
  const run = () => { if (scope.active) void query.run(initial); }, busy = snapshot.phase === 'loading';
  const state = <CatalogueReadState accessFailure={owner.getAccessFailure()} snapshot={snapshot} retry={run} cancel={() => query.cancel()} />;
  if (snapshot.phase === 'disposed') return <div className="catalogue-workbench">{state}</div>;
  return <div className="catalogue-categories pc-workbench pc-categories pc-native-categories"><div className="gold-head iw-head pc-page-head"><h1>商品分类</h1><div className="actions iw-head-actions"><button className="btn ghost" type="button" disabled title="分类维护暂不可用。">新增一级分类</button><button className="btn ghost" type="button" disabled title="分类维护暂不可用。">新增下级分类</button></div></div>{state}{snapshot.success && (busy || snapshot.phase === 'error') && <p role="status">以下仍为上次成功读取的完整分类目录，并非本次读取结果。</p>}<div className="pc-category-layout"><aside className="pc-filter-tree">{result ? <CatalogueCategoryTree index={index} selectedId={selected?.id ?? null} select={id => { if (scope.active) setSelection(id); }} /> : <p className="hint">分类资料尚未读取。</p>}</aside><section className="pc-editor-body pc-category-detail" aria-label="分类资料">{selected ? <form id="pc-category-form" onSubmit={event => event.preventDefault()}><div className="pc-category-detail-head"><h2>分类资料</h2><div><button type="button" className="btn ghost" disabled title="当前为只读资料，没有未保存编辑">取消</button><button className="btn primary" type="button" disabled title="分类维护暂不可用。">保存</button></div></div><div className="pc-category-facts"><div className="field"><span>分类路径</span><p className="pc-text-block">{selected.parentId === null ? '一级分类' : categoryPath(index, selected.id).map(item => item.name).join(' / ')}</p></div><label className="field"><span>分类名称</span><input aria-label="分类名称" name="name" value={selected.name} readOnly /></label><div className="field"><span>商品数量</span><p className="pc-text-block" data-category-product-count>{selected.productCount === null ? '未提供' : `${selected.productCount} 款`}</p></div><div className="field"><span>下级分类数量</span><p className="pc-text-block">{selected.childCount} 个</p></div></div><div className="pc-delete-zone"><button type="button" className="btn ghost pc-danger" disabled title="分类维护暂不可用。">删除分类</button></div></form> : <><h2>分类资料</h2><div className="empty" role="status">{result ? '没有分类资料。' : '选择分类前请先读取资料。'}</div></>}</section></div></div>;
}

type CategoryOwner=CatalogueReadOwner<CatalogueSettingsTreeQuery,CatalogueSettingsTree>;
interface MaintenanceProps extends CatalogueSettingsPageProps {readonly owner:CategoryOwner;readonly capability:CatalogueMaintenanceCapability;readonly onCanLeaveChange:(guard:(()=>boolean)|null)=>void}
function CategoryMaintenanceContent(props:MaintenanceProps) {
 const controller=useCatalogueEditor(props.owner.scope,props.capability,props.onAccessFailure);
 return controller?<CategoryMaintenanceReady {...props} orderController={controller}/>:null;
}
function sameOrder(tree:CatalogueSettingsTree, saved:CategoryOrderResult):boolean {
 const siblings=categoryTreeIndex(tree.items).children.get(saved.order.parentId)??[];
 return siblings.length===saved.order.members.length&&siblings.every((item,index)=>{const member=saved.order.members[index];return member?.id===item.id&&member.version===item.version&&member.displayOrder===item.displayOrder;});
}
function CategoryMaintenanceReady(props:MaintenanceProps&{readonly orderController:CatalogueEditorController}) {
 const {scope,query}=props.owner,snapshot=useSyncExternalStore(query.subscribe,query.getSnapshot,query.getSnapshot),result=snapshot.success?.data;
 const orderState=useSyncExternalStore(props.orderController.subscribe,props.orderController.getSnapshot,props.orderController.getSnapshot);
 const index=useMemo(()=>categoryTreeIndex(result?.items??[]),[result]);
 const [selection,setSelection]=useState<string|null>(null),[creating,setCreating]=useState<CategoryWriteValues|null>(null),[revision,setRevision]=useState(0),[notice,setNotice]=useState(''),[deferred,setDeferred]=useState<{run:()=>void}|null>(null);
 const [lastOrder,setLastOrder]=useState<CategoryOrderResult|null>(null),[readingOrder,setReadingOrder]=useState(false);
 const guard=useRef<(()=>boolean)|null>(null),pending=useRef<()=>boolean>(()=>false),orderBlocked=useRef(false),finishingOrder=useRef(false),submittedRead=useRef(snapshot.success);
 const selected=selection&&index.byId.has(selection)?index.byId.get(selection)!:index.children.get(null)?.[0]??null,fresh=snapshot.phase==='success';
 const orderLocked=['submitting','checking','uncertain','committed'].includes(orderState.phase);orderBlocked.current=orderLocked;
 const receiveGuard=useCallback((next:(()=>boolean)|null,locked:()=>boolean)=>{guard.current=next;pending.current=locked;},[]);
 useEffect(()=>{props.onCanLeaveChange(()=>!orderBlocked.current&&(guard.current?.()??true));return()=>props.onCanLeaveChange(null);},[props.onCanLeaveChange]);
 const ready=props.capability.kind==='CATEGORY'&&props.capability.categoryOrderReady===true&&props.capability.allowedActions.includes('REORDER')&&props.capability.allowedActions.includes('UNDO_REORDER')&&orderState.error?.code!=='CATALOGUE_ORDER_NOT_READY';
 const conflictNeedsRead=orderState.phase==='rejected'&&['CATEGORY_ORDER_CONFLICT','CATEGORY_UNDO_CONFLICT','VERSION_CONFLICT'].includes(orderState.error?.code??'')&&snapshot.success===submittedRead.current;
 const canOrder=ready&&fresh&&!orderLocked&&!conflictNeedsRead;
 const request=(run:()=>void)=>{if(!scope.active)return;if(pending.current()||orderLocked){setNotice('请先确认当前保存或排序结果。');return;}if(guard.current&&!guard.current()){setDeferred({run});return;}run();};
 const refresh=()=>request(()=>{setCreating(null);setRevision(v=>v+1);setNotice('');void query.run(initial);});
 const reset=()=>{setCreating(null);setRevision(v=>v+1);};
 const create=(parentId:string|null)=>request(()=>{if(!fresh||!result)return;const siblings=index.children.get(parentId)??[],displayOrder=siblings.length?Math.max(...siblings.map(item=>item.displayOrder))+1:0;if(displayOrder>2147483647){setNotice('该层级显示顺序已达上限，暂时无法追加分类。');return;}setCreating({name:'',parentId,displayOrder});setRevision(v=>v+1);setNotice('');});
 const readCommitted=async(saved:CatalogueMaintenanceResult,action:CatalogueMaintenanceAction)=>{if(!scope.active)return;setNotice('已保存，正在读取最新目录。');const outcome=await query.run(initial);if(!scope.active)return;
  if(outcome.status==='success'){const found=outcome.data.items.find(item=>item.id===saved.targetId);if(action==='DELETE'?!found:found&&found.version>=saved.version){setSelection(action==='DELETE'?null:saved.targetId);setCreating(null);setRevision(v=>v+1);setNotice('已保存。');return;}}
  setNotice('保存已提交，最新目录尚未确认，请重新读取目录。');
 };
 const finishOrder=async()=>{
  const saved=props.orderController.getSnapshot();
  if(finishingOrder.current||saved.phase!=='committed'||!saved.result||!('order' in saved.result)||!saved.command||!['REORDER','UNDO_REORDER'].includes(saved.command.action)||!scope.active)return;
  finishingOrder.current=true;setReadingOrder(true);setNotice('排序已提交，正在读取完整目录。');
  try {
   const outcome=await query.run(initial);if(!scope.active)return;
   if(outcome.status!=='success'){setNotice('排序已提交，最新目录尚未确认，请重新读取目录。');return;}
   const matches=sameOrder(outcome.data,saved.result);
   setLastOrder(saved.command.action==='REORDER'&&matches?saved.result:null);reset();
   props.orderController.resetAfterOrderReload();
   setNotice(matches?(saved.command.action==='REORDER'?'同级顺序已调整，可撤销最近一次排序。':'已撤销最近一次排序。'):'排序已提交，目录随后发生变化；请按当前目录继续操作，原排序不可撤销。');
  } finally {finishingOrder.current=false;if(scope.active)setReadingOrder(false);}
 };
 const reorder=(movedId:string,targetId:string,placement:'before'|'after')=>{
  if(!canOrder)return;const draft=categoryReorderDraft(index,movedId,targetId,placement);if(!draft)return;
  request(()=>{submittedRead.current=snapshot.success;reset();setNotice('');void props.orderController.submit(draft).then(finishOrder).catch(()=>setNotice('排序请求未发送，请读取最新目录后重试。'));});
 };
 const undo=()=>{
  if(!canOrder||!lastOrder||!result||!sameOrder(result,lastOrder))return;
  request(()=>{submittedRead.current=snapshot.success;reset();setNotice('');void props.orderController.submit({action:'UNDO_REORDER',originalOperationId:lastOrder.operationId,expectedSiblings:(index.children.get(lastOrder.order.parentId)??[]).map(item=>({id:item.id,expectedVersion:item.version}))}).then(finishOrder).catch(()=>setNotice('撤销请求未发送，请读取最新目录后重试。'));});
 };
 const readState=<CatalogueReadState accessFailure={props.owner.getAccessFailure()} snapshot={snapshot} retry={orderState.phase==='committed'?()=>void finishOrder():refresh} cancel={()=>query.cancel()}/>;
 if(!scope.active||snapshot.phase==='disposed')return <div className="catalogue-workbench">{readState}</div>;
 const draft=creating??(selected?{name:selected.name,parentId:selected.parentId,displayOrder:selected.displayOrder}:null);
 const path=draft?.parentId===null?'一级分类':draft&&index.byId.has(draft.parentId!)?(creating?categoryPath(index,draft.parentId!):categoryPath(index,selected!.id)).map(item=>item.name).join(' / '):'分类路径未提供';
 return <div className="catalogue-categories pc-workbench pc-categories pc-native-categories"><div className="gold-head iw-head pc-page-head"><h1>商品分类</h1><div className="actions iw-head-actions">{lastOrder&&<button type="button" className="btn ghost" disabled={!canOrder||!result||!sameOrder(result,lastOrder)} onClick={undo}>撤销排序</button>}<button type="button" className="btn ghost" disabled={!fresh||orderLocked||!props.capability.allowedActions.includes('CREATE')} onClick={()=>create(null)}>新增一级分类</button><button type="button" className="btn ghost" disabled={!fresh||orderLocked||!selected||selected.parentId!==null||!props.capability.allowedActions.includes('CREATE')} title={selected?.parentId!==null?'请选择一级分类':''} onClick={()=>{if(selected)create(selected.id);}}>新增下级分类</button></div></div>
  {readState}{notice&&<p role="status">{notice}</p>}{snapshot.success&&!fresh&&<p role="status">以下仍为上次成功读取的目录。</p>}
  <CatalogueWriteFeedback state={orderState} controller={props.orderController} finish={()=>void finishOrder()}/>
  {orderState.phase==='rejected'&&<UIButton onClick={refresh}>读取最新目录</UIButton>}{orderState.phase==='committed'&&<UIButton disabled={readingOrder} onClick={()=>void finishOrder()}>重新读取目录</UIButton>}
  <div className="pc-category-layout"><aside className="pc-filter-tree">{result?<CatalogueCategoryTree index={index} selectedId={creating?null:selected?.id??null} select={id=>{if(fresh)request(()=>{setSelection(id);reset();setNotice('');});}} {...(canOrder?{reorder}:{})}/>:<p className="hint">分类资料尚未读取。</p>}</aside><section className="pc-editor-body pc-category-detail" aria-label="分类资料">{draft?<CategoryEditor key={`${creating?'new':`${selected?.id}:${selected?.version??0}`}:${revision}`} scope={scope} capability={props.capability} target={creating?null:selected} initialValues={draft} path={path} fresh={fresh&&!orderLocked} cancel={()=>request(reset)} onGuard={receiveGuard} onAccessFailure={props.onAccessFailure} onCommitted={readCommitted} refresh={refresh}/>:<><h2>分类资料</h2><div role="status" className="empty">{result?'没有分类资料。':'分类资料尚未读取。'}</div></>}</section></div>
  {deferred&&<StandardOverlay title="放弃未保存资料" closeLabel="关闭放弃确认" close={()=>setDeferred(null)} footer={dismiss=><><UIButton onClick={dismiss}>继续填写</UIButton><UIButton onClick={()=>{const action=deferred.run;setDeferred(null);action();}}>放弃填写</UIButton></>}><p>是否放弃当前未保存的分类资料？</p></StandardOverlay>}
 </div>;
}
interface CategoryEditorProps {
 readonly scope:CategoryOwner['scope'];readonly capability:CatalogueMaintenanceCapability;readonly target:CatalogueSettingsCategory|null;readonly initialValues:CategoryWriteValues;readonly path:string;readonly fresh:boolean;
 readonly cancel:()=>void;readonly refresh:()=>void;readonly onGuard:(guard:(()=>boolean)|null,pending:()=>boolean)=>void;readonly onAccessFailure:CatalogueSettingsPageProps['onAccessFailure'];readonly onCommitted:(result:CatalogueMaintenanceResult,action:CatalogueMaintenanceAction)=>Promise<void>;
}
function CategoryEditor(props:CategoryEditorProps){const controller=useCatalogueEditor(props.scope,props.capability,props.onAccessFailure);return controller?<CategoryEditorForm {...props} controller={controller}/>:null;}
function CategoryEditorForm(props:CategoryEditorProps&{readonly controller:CatalogueEditorController}){
 const [name,setName]=useState(props.initialValues.name),[error,setError]=useState(''),[deleting,setDeleting]=useState(false),[reading,setReading]=useState(false),guard=useRef<()=>boolean>(()=>true),locked=useRef<()=>boolean>(()=>false),finishing=useRef(false);
 const state=useSyncExternalStore(props.controller.subscribe,props.controller.getSnapshot,props.controller.getSnapshot),dirty=name!==props.initialValues.name,pending=['submitting','checking','uncertain'].includes(state.phase),committed=state.phase==='committed';
 const action=props.target?'EDIT':'CREATE',allowed=(a:CatalogueMaintenanceAction)=>props.capability.allowedActions.includes(a),disabled=pending||committed||!props.fresh||!allowed(action);
 guard.current=()=>committed||!dirty&&!pending;locked.current=()=>pending;
 useEffect(()=>{props.onGuard(()=>guard.current(),()=>locked.current());return()=>props.onGuard(null,()=>false);},[props.onGuard]);
 const finish=()=>{const saved=props.controller.getSnapshot();if(saved.result&&saved.command&&!finishing.current&&props.scope.active){finishing.current=true;setReading(true);void props.onCommitted(saved.result,saved.command.action).finally(()=>{finishing.current=false;setReading(false);});}};
 const submit=async(next:CatalogueMaintenanceAction=action)=>{if(pending||committed||!props.fresh||!allowed(next))return;setError('');try{
  if(next==='CREATE')await props.controller.submit({action:'CREATE',values:{...props.initialValues,name}});
  else if(props.target&&next==='EDIT')await props.controller.submit({action:'EDIT',id:props.target.id,expectedVersion:props.target.version,values:{...props.initialValues,name}});
  else if(props.target&&next==='DELETE')await props.controller.submit({action:'DELETE',id:props.target.id,expectedVersion:props.target.version});finish();
 }catch{setError('请填写分类名称，最多40字。');}};
 if(!props.scope.active||state.phase==='disposed')return null;
 return <><form id="pc-category-form" onSubmit={event=>{event.preventDefault();void submit();}}><div className="pc-category-detail-head"><h2>{props.target?'分类资料':'新增分类'}</h2><div><button type="button" className="btn ghost" disabled={pending} onClick={props.cancel}>取消</button><button className="btn primary" form="pc-category-form" disabled={disabled||!!props.target&&!dirty} type="submit">保存</button></div></div><div className="pc-category-facts"><div className="field"><span>分类路径</span><p className="pc-text-block">{props.path}</p></div><label className="field"><span>分类名称</span><input data-cat="name" name="name" aria-label="分类名称" value={name} maxLength={40} disabled={disabled} onChange={event=>setName(event.currentTarget.value)}/></label><div className="field"><span>商品数量</span><p className="pc-text-block">{props.target?props.target.productCount===null?'未提供':`${props.target.productCount} 款`:'保存后可查看'}</p></div><div className="field"><span>下级分类数量</span><p className="pc-text-block">{props.target?`${props.target.childCount} 个`:'保存后可查看'}</p></div></div>{props.target&&allowed('DELETE')&&<div className="pc-delete-zone"><button type="button" className="btn ghost pc-danger" disabled={pending||committed||!props.fresh} onClick={()=>setDeleting(true)}>删除分类</button></div>}
  {error&&<p role="alert" className="catalogue-write-error">{error}</p>}<CatalogueWriteFeedback state={state} controller={props.controller} finish={finish}/>{state.error?.code==='VERSION_CONFLICT'&&<UIButton onClick={props.refresh}>读取最新目录</UIButton>}{committed&&<UIButton disabled={reading} onClick={finish}>重新读取目录</UIButton>}
 </form>{deleting&&<StandardOverlay title="确认删除分类" closeLabel="关闭删除确认" close={()=>setDeleting(false)} footer={dismiss=><><UIButton onClick={dismiss}>取消</UIButton><UIButton className="primary" onClick={()=>{setDeleting(false);void submit('DELETE');}}>确认删除</UIButton></>}><p>确认删除“{props.target?.name}”？仍有商品或下级分类引用时无法删除。</p></StandardOverlay>}</>;
}
