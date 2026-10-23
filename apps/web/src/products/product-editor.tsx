import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode, type Dispatch, type SetStateAction } from 'react';
import { UIButton } from '../components/standard-controls.tsx';
import { StandardTabs } from '../components/standard-tabs.tsx';
import { StandardOverlay } from '../components/standard-overlay.tsx';
import { ReadScope } from '../loading/read-scope.ts';
import { AsyncLeafRegistry } from '../loading/async-leaf-registry.ts';
import type { ProductEditorFieldsProps } from './product-editor-base.tsx';
import { ProductPanelActivity, useProductPanelActive, ProductReadState, useProductRead } from '../inventory/product-tab-state.tsx';
import { HttpQueryError } from '../transport/http-query.ts';
import { CATALOGUE_PRICE_KEYS } from '../../../../packages/application/src/catalogue-price-input.ts';
import { ProductEditorController, productEditorDraftFingerprint, actualSpecSelection, hasUnresolvedSpecSelection, type ProductSpecSelection } from './product-editor-state.ts';
import { validateProductMaintenanceDetail, validateProductMaintenanceDetailV2 } from './product-maintenance-http-client.ts';
import type { ProductEditorProps, ProductMaintenanceDetail, ProductWriteValues, ProductSkuInput, ProductBarcodeInput, ProductMaintenanceCommand } from './product-editor-contracts.ts';
import type { ProductReadOnlyPageTab } from './product-page-contracts.ts';
import './product-page.css';

const tabs=[['base','基础资料'],['specs','规格'],['barcodes','条码'],['prices','价格'],['images','图片'],['stock','库存']]as const;
let editorSequence=0;
export function ProductEditor(props:ProductEditorProps){
 const capability=useMemo(()=>{
  const source=props.capability.productReader;
  const guarded=async<T,>(read:{signal:AbortSignal},work:()=>Promise<T>)=>{try{return await work();}catch(error){if(props.parent.active&&!read.signal.aborted&&error instanceof HttpQueryError&&(error.kind==='unauthenticated'||error.kind==='forbidden'))props.onAccessFailure(error);throw error;}};
  return {...props.capability,...(props.capability.stock?{stock:{read:read=>guarded(read,()=>props.capability.stock!.read(read)),...(props.capability.stock.readOverview?{readOverview:read=>guarded(read,()=>props.capability.stock!.readOverview!(read))}: {})}}:{}),productReader:{readProductBasics:read=>guarded(read,()=>source.readProductBasics(read)),readProductSpecifications:read=>guarded(read,()=>source.readProductSpecifications(read)),readProductImages:read=>guarded(read,()=>source.readProductImages(read)),readProductImage:read=>guarded(read,()=>source.readProductImage(read))}} satisfies ProductEditorProps['capability'];
 },[props.capability,props.parent,props.onAccessFailure]);
 const [activeId,setActiveId]=useState(props.productId),[revision,setRevision]=useState(0),[owner,setOwner]=useState<{parent:ReadScope;id:string|null;revision:number;scope:ReadScope}|null>(null);
 useEffect(()=>{setActiveId(props.productId);},[props.parent,props.productId]);
 useEffect(()=>{const scope=new ReadScope(props.parent.identity,`${props.parent.routeInstanceId}:product-editor:${++editorSequence}`,activeId,()=>{}),abort=()=>scope.dispose();props.parent.signal.addEventListener('abort',abort,{once:true});if(!props.parent.active)scope.dispose();setOwner({parent:props.parent,id:activeId,revision,scope});return()=>{props.parent.signal.removeEventListener('abort',abort);scope.dispose();};},[props.parent,activeId,revision]);
 if(!props.parent.active||owner?.parent!==props.parent||owner.id!==activeId||owner.revision!==revision||!owner.scope.active)return null;
 if((capability.client.contractVersion??1)!==(capability.reader.contractVersion??1))return <p role="alert">商品维护服务版本尚未对齐，请稍后重新打开。</p>;
 const reload=(id:string)=>{setActiveId(id);setRevision(v=>v+1);};
 return <section className="product-editor" aria-label={activeId?'编辑商品':'新增商品'}>{activeId?<ExistingEditor key={owner.scope.routeInstanceId} {...props} capability={capability} scope={owner.scope} targetId={activeId} reload={reload}/>:<EditorForm key={owner.scope.routeInstanceId} {...props} capability={capability} scope={owner.scope} detail={null} reload={reload}/>}</section>;
}
function ExistingEditor(props:ProductEditorProps&{readonly scope:ReadScope;readonly targetId:string;readonly reload:(id:string)=>void}){
 const {snapshot,read,cancel,cancelled}=useProductRead(props.scope,async input=>{try{return await props.capability.reader.readDetail(input);}catch(error){if(props.scope.active&&!input.signal.aborted&&error instanceof HttpQueryError&&(error.kind==='unauthenticated'||error.kind==='forbidden'))props.onAccessFailure(error);throw error;}},(value,p)=>{(props.capability.reader.contractVersion===2?validateProductMaintenanceDetailV2:validateProductMaintenanceDetail)(value,p.productId);});
 const data=snapshot.success?.data;
 return <>{!data&&<div className="product-editor-loading-head"><UIButton onClick={props.onClose}>返回商品信息</UIButton></div>}<ProductReadState phase={snapshot.phase} retry={read} cancel={cancel} cancelled={cancelled} empty={!data}>{data&&<EditorForm {...props} detail={data}/>}</ProductReadState></>;
}
function newValues(contractVersion:1|2):ProductWriteValues{return {productCode:'',name:'',categoryId:'',supplierId:null,...(contractVersion===2?{seasonIds:[]}:{seasonId:null}),sizeGroupId:'',year:Number(new Intl.DateTimeFormat('en',{timeZone:'Asia/Shanghai',year:'numeric'}).format(new Date())),systemItemCode:null,thickness:null,collarPantsType:null,defaultBarcodeSchemeId:null,enabled:true,prices:Object.fromEntries(CATALOGUE_PRICE_KEYS.map(key=>[key,null]))as ProductWriteValues['prices']};}
function refLabels(detail:ProductMaintenanceDetail|null):Readonly<Record<string,string>>{if(!detail)return {};const r=detail.references;return Object.fromEntries([...r.categoryPath.map(x=>[`categories:${x.id}`,x.name]),...(r.supplier?[[`suppliers:${r.supplier.id}`,r.supplier.name]]:[]),...('season' in r?(r.season?[[`seasons:${r.season.id}`,r.season.name]]:[]):r.seasons.map(x=>[`seasons:${x.id}`,x.name])),[`size-groups:${r.sizeGroup.id}`,r.sizeGroup.name],...(r.defaultBarcodeScheme?[[`barcode-schemes:${r.defaultBarcodeScheme.id}`,r.defaultBarcodeScheme.name]]:[])]);}
function EditorForm(props:ProductEditorProps&{readonly scope:ReadScope;readonly detail:ProductMaintenanceDetail|null;readonly reload:(id:string)=>void}){
 const [values,setValues]=useState(()=>props.detail?.values??newValues(props.capability.client.contractVersion??1)),[skus,setSkus]=useState<readonly ProductSkuInput[]>(()=>props.detail?.skus??[]),[barcodes,setBarcodes]=useState<readonly ProductBarcodeInput[]>(()=>props.detail?.barcodes??[]);
 const [specSelection,setSpecSelection]=useState<ProductSpecSelection>(()=>actualSpecSelection(props.detail?.skus??[]));
 const [labels,setLabels]=useState<Readonly<Record<string,string>>>(()=>refLabels(props.detail)),[tab,setTab]=useState<ProductReadOnlyPageTab>(props.initialTab??'base'),[error,setError]=useState(''),[leave,setLeave]=useState(false),[confirmDelete,setConfirmDelete]=useState(false);
 const baseline=useRef(productEditorDraftFingerprint({values,skus,barcodes})),guard=useRef(()=>true);
 const [write,setWrite]=useState<ProductEditorController|null>(null);
 useEffect(()=>{const state=new ProductEditorController({scope:props.scope,client:props.capability.client,newRequestKey:props.capability.newRequestKey,onRecoveryRequired:props.capability.onRecoveryRequired,onAccessFailure:e=>props.onAccessFailure(new HttpQueryError(e.kind==='unauthenticated'?'unauthenticated':'forbidden',e.code,e.status))});setWrite(state);return()=>state.dispose();},[props.scope,props.capability]);
 useEffect(()=>{props.onCanLeaveChange(()=>guard.current());return()=>props.onCanLeaveChange(null);},[props.scope,props.onCanLeaveChange]);
 return write?<EditorFields {...props} values={values} setValues={setValues} skus={skus} setSkus={setSkus} specSelection={specSelection} setSpecSelection={setSpecSelection} barcodes={barcodes} setBarcodes={setBarcodes} labels={labels} setLabels={setLabels} tab={tab} setTab={setTab} error={error} setError={setError} leave={leave} setLeave={setLeave} confirmDelete={confirmDelete} setConfirmDelete={setConfirmDelete} baseline={baseline.current} guard={guard} write={write}/>:<p role="status">正在准备商品表单…</p>;
}
interface Fields extends ProductEditorProps {
 readonly scope:ReadScope;readonly detail:ProductMaintenanceDetail|null;readonly reload:(id:string)=>void;readonly write:ProductEditorController;
 readonly values:ProductWriteValues;readonly setValues:(value:ProductWriteValues)=>void;readonly skus:readonly ProductSkuInput[];readonly setSkus:(value:readonly ProductSkuInput[])=>void;readonly barcodes:readonly ProductBarcodeInput[];readonly setBarcodes:(value:readonly ProductBarcodeInput[])=>void;
 readonly labels:Readonly<Record<string,string>>;readonly setLabels:Dispatch<SetStateAction<Readonly<Record<string,string>>>>;readonly tab:ProductReadOnlyPageTab;readonly setTab:(value:ProductReadOnlyPageTab)=>void;
 readonly specSelection:ProductSpecSelection;readonly setSpecSelection:(value:ProductSpecSelection)=>void;
 readonly error:string;readonly setError:(value:string)=>void;readonly leave:boolean;readonly setLeave:(value:boolean)=>void;readonly confirmDelete:boolean;readonly setConfirmDelete:(value:boolean)=>void;
 readonly baseline:string;readonly guard:{current:()=>boolean};
}
function EditorFields(p:Fields){
 const workbench=useRef<HTMLDivElement>(null),stickyTitle=useRef<HTMLDivElement>(null);
 useLayoutEffect(()=>{
  const host=workbench.current,title=stickyTitle.current;if(!host||!title)return;
  const measure=()=>{if(p.scope.active&&host.isConnected)host.style.setProperty('--product-sticky-title-height',`${title.getBoundingClientRect().height}px`);};
  measure();const observer=typeof ResizeObserver==='function'?new ResizeObserver(measure):null;observer?.observe(title);window.addEventListener('resize',measure);
  return()=>{observer?.disconnect();window.removeEventListener('resize',measure);};
 },[p.scope]);
 const positions=useRef<Partial<Record<ProductReadOnlyPageTab,{top:number;left:number}>>>({});
 const selectTab=(value:ProductReadOnlyPageTab)=>{const scroll=workbench.current?.closest<HTMLElement>('.demo-page');if(scroll)positions.current[p.tab]={top:scroll.scrollTop,left:scroll.scrollLeft};p.setTab(value);};
 useLayoutEffect(()=>{const scroll=workbench.current?.closest<HTMLElement>('.demo-page');if(scroll){const position=positions.current[p.tab];scroll.scrollTop=position?.top??0;scroll.scrollLeft=position?.left??0;}},[p.tab]);
 const [reloadConfirm,setReloadConfirm]=useState(false);
 const unresolvedSpecs=hasUnresolvedSpecSelection(p.specSelection,p.skus);
 const state=useSyncExternalStore(p.write.subscribe,p.write.getSnapshot,p.write.getSnapshot),dirty=unresolvedSpecs||productEditorDraftFingerprint({values:p.values,skus:p.skus,barcodes:p.barcodes})!==p.baseline;
 const pending=['submitting','checking','uncertain'].includes(state.phase),deleted=p.detail?.deletedAt!==null&&p.detail!==null,existing=!!p.detail;
 const reloadAllowed=()=>!['submitting','checking','uncertain'].includes(p.write.getSnapshot().phase);
 const requestReload=()=>{if(reloadAllowed())setReloadConfirm(true);};
 const can=(action:ProductMaintenanceCommand['action'])=>!deleted&&p.capability.allowedActions.includes(action),disabled=pending||state.phase==='committed'||!can(existing?'EDIT':'CREATE');
 p.guard.current=()=>!dirty&&!pending;
 const change=(patch:Partial<ProductWriteValues>)=>{if(!disabled)p.setValues({...p.values,...patch});};
 const remember=(id:string|null,name:string|null,kind:string)=>{if(id&&name)p.setLabels(current=>({...current,[`${kind}:${id}`]:name}));};
 const changeSkus=(skus:readonly ProductSkuInput[])=>{p.setSkus(skus);const actual=actualSpecSelection(skus);p.setSpecSelection({colors:[...new Set([...p.specSelection.colors,...actual.colors])],fits:[...new Set([...p.specSelection.fits,...actual.fits])]});};
 const changeSpecSelection=(kind:'colors'|'fits',ids:readonly string[])=>{p.setSpecSelection({...p.specSelection,[kind]:ids});const selected=new Set(ids);p.setSkus(p.skus.map(s=>s.enabled&&!selected.has(kind==='colors'?s.colorId:s.fitId)?{...s,enabled:false}:s));};
 const finish=()=>{const result=p.write.getSnapshot().result;if(result){p.onSaved(result.targetId);if(p.write.getSnapshot().command?.action==='DELETE')p.onClose();else p.reload(result.targetId);}};
 const save=async(action:ProductMaintenanceCommand['action']=existing?'EDIT':'CREATE')=>{p.setError('');try{
  if(!can(action)||pending||(action==='CREATE'||action==='EDIT')&&unresolvedSpecs)return;
  if(action==='CREATE')await p.write.submit({action,values:p.values,skus:p.skus,barcodes:p.barcodes});
  else if(p.detail&&action==='EDIT')await p.write.submit({action,id:p.detail.productId,expectedVersion:p.detail.version,values:p.values,skus:p.skus,barcodes:p.barcodes});
  else if(p.detail)await p.write.submit({action:action as 'DELETE'|'DISABLE'|'RESTORE',id:p.detail.productId,expectedVersion:p.detail.version});
  finish();
 }catch{p.setError('请检查必填资料、规格和价格；金额最多两位小数。');}};
 const close=()=>{if(pending)return;if(dirty)p.setLeave(true);else p.onClose();};
 const fields={scope:p.scope,reader:p.capability.reader,values:p.values,labels:p.labels,existing,disabled,change,remember,onAccessFailure:p.onAccessFailure,...(p.capability.categoryReader?{categoryReader:p.capability.categoryReader}:{}),categoryPath:p.detail?.references.categoryPath??[],seasonOriginallyUnknown:!!p.detail&&'seasonIds' in p.detail.values&&p.detail.values.seasonIds===null};
 if(!p.scope.active||state.phase==='disposed')return null;
 return <div ref={workbench} className="product-detail-workbench"><div ref={stickyTitle} className="product-detail-sticky"><div className="product-editor-head"><h1>{existing?`${p.detail!.values.productCode} · ${p.detail!.values.name}`:`新增商品 · ${p.values.name||'未命名'}`}</h1><div className="iw-actions">
  {existing&&can('DELETE')&&<UIButton disabled={pending} className="product-delete" onClick={()=>p.setConfirmDelete(true)}>删除商品</UIButton>}
  {existing&&can(p.values.enabled?'DISABLE':'RESTORE')&&<UIButton disabled={pending||dirty} onClick={()=>void save(p.values.enabled?'DISABLE':'RESTORE')}>{p.values.enabled?'停用':'恢复启用'}</UIButton>}
  <UIButton disabled={pending} onClick={close}>取消</UIButton><UIButton className="primary" disabled={disabled||unresolvedSpecs||existing&&!dirty} onClick={()=>void save()}>保存</UIButton></div></div>
 </div>
  {(p.error||state.error)&&<p role="alert" className="product-editor-error">{p.error||state.error?.message}{existing&&state.error?.kind==='conflict'&&<UIButton onClick={requestReload}>读取最新商品</UIButton>}</p>}
  {state.phase==='submitting'&&<p role="status">正在保存商品，请保留当前页面。</p>}
  {(state.phase==='uncertain'||state.phase==='checking')&&<div className="product-editor-recovery" role="status">保存结果尚未确认。<UIButton disabled={state.phase==='checking'} onClick={()=>void p.write.recover().then(finish)}>查回保存结果</UIButton><UIButton disabled={state.phase==='checking'} onClick={()=>void p.write.retryOriginal().then(finish)}>按原请求重试</UIButton></div>}
  {deleted&&<p role="status">该商品已删除，仅可查看。</p>}
  {unresolvedSpecs&&<p className="product-field-hint" role="status">已选颜色或版型尚无启用规格，请在规格页填写实际组合，或移除未使用的选择。</p>}
  <StandardTabs className="product-editor-tabs" label="商品详情" value={p.tab} items={tabs.map(([key,label])=>({key,label}))} onChange={selectTab} panels={Object.fromEntries(tabs.map(([key])=>[key,({active}:{readonly active:boolean})=><ProductPanelActivity value={active}><EditorPanel tab={key} fields={fields} owner={p} disabled={disabled} pending={pending} dirty={dirty} remember={remember} change={change} changeSkus={changeSkus} changeSpecSelection={changeSpecSelection} requestReload={requestReload}/></ProductPanelActivity>]))}/>
  {p.leave&&<StandardOverlay title="放弃未保存资料" closeLabel="关闭放弃确认" close={()=>p.setLeave(false)} footer={dismiss=><><UIButton onClick={dismiss}>继续填写</UIButton><UIButton onClick={p.onClose}>放弃填写</UIButton></>}><p>是否放弃当前未保存的商品资料？</p></StandardOverlay>}
  {p.confirmDelete&&<StandardOverlay title="删除商品" closeLabel="关闭删除确认" close={()=>p.setConfirmDelete(false)} footer={dismiss=><><UIButton onClick={dismiss}>取消</UIButton><UIButton className="primary" onClick={()=>{p.setConfirmDelete(false);void save('DELETE');}}>确认删除</UIButton></>}><p>确认删除“{p.values.productCode} · {p.values.name}”？已有库存或业务引用时无法删除。</p></StandardOverlay>}
  {reloadConfirm&&<StandardOverlay title="重新读取商品" closeLabel="关闭重新读取确认" close={()=>setReloadConfirm(false)} footer={dismiss=><><UIButton onClick={dismiss}>继续填写</UIButton><UIButton disabled={pending} onClick={()=>{if(p.detail&&reloadAllowed())p.reload(p.detail.productId);}}>放弃输入并读取</UIButton></>}><p>当前未保存输入将被放弃，并读取最新商品资料。</p></StandardOverlay>}
 </div>;
}

interface EditorPanelInput {
 readonly tab:ProductReadOnlyPageTab;readonly fields:ProductEditorFieldsProps;readonly owner:Fields;
 readonly disabled:boolean;readonly pending:boolean;readonly dirty:boolean;
 readonly remember:(id:string|null,name:string|null,kind:string)=>void;readonly change:(patch:Partial<ProductWriteValues>)=>void;
 readonly changeSkus:(skus:readonly ProductSkuInput[])=>void;readonly changeSpecSelection:(kind:'colors'|'fits',ids:readonly string[])=>void;
 readonly requestReload:()=>void;
}
const editorLeaves=new AsyncLeafRegistry<Record<ProductReadOnlyPageTab,{readonly load:()=>Promise<{readonly render:(input:EditorPanelInput)=>ReactNode}>}>>({
 base:{load:()=>import('./product-editor-base.tsx').then(m=>({render:(p:EditorPanelInput)=><m.ProductEditorBase {...p.fields}/>}))},
 specs:{load:()=>import('./product-editor-specs.tsx').then(m=>({render:(p:EditorPanelInput)=><m.ProductEditorSpecs {...p.fields} capability={p.owner.capability} skus={p.owner.skus} changeSkus={p.changeSkus} selection={p.owner.specSelection} changeSelection={p.changeSpecSelection}/>}))},
 barcodes:{load:()=>import('./product-editor-barcodes.tsx').then(m=>({render:(p:EditorPanelInput)=><m.ProductEditorBarcodes {...p.owner} disabled={p.disabled} remember={p.remember} change={p.change}/>}))},
 prices:{load:()=>import('./product-editor-prices.tsx').then(m=>({render:(p:EditorPanelInput)=><m.ProductEditorPrices values={p.owner.values} disabled={p.disabled} change={p.change} setError={p.owner.setError}/>}))},
 images:{load:()=>import('./product-editor-media.tsx').then(m=>({render:(p:EditorPanelInput)=><m.ProductEditorMedia scope={p.owner.scope} productId={p.owner.detail?.productId??null} expectedVersion={p.owner.detail?.version??null} reader={p.owner.capability.productReader} {...(p.owner.capability.media?{media:p.owner.capability.media}:{})} onAccessFailure={p.owner.onAccessFailure} reloadBlocked={p.pending} onReloadRequest={p.requestReload}/>}))},
 stock:{load:()=>import('./product-page-stock.tsx').then(m=>({render:(p:EditorPanelInput)=>p.owner.detail&&p.owner.capability.stock?<m.View scope={p.owner.scope} reader={{stock:p.owner.capability.stock}} {...(p.owner.onOpenInventory?{openInventory:async()=>{if(!p.owner.scope.active||!p.owner.guard.current()||!p.owner.detail)return false;return p.owner.onOpenInventory!({id:p.owner.detail.productId,label:`${p.owner.values.productCode} · ${p.owner.values.name}`});},navigationDisabled:p.dirty||p.pending}: {})}/>:<p className="product-field-hint">{p.owner.detail?'库存资料暂不可读取。':'新商品保存后可查看库存。'}</p>}))},
},{maxRetainedEntries:6});
function EditorPanel(props:EditorPanelInput){
 const active=useProductPanelActive(),[attempt,setAttempt]=useState(0),[started,setStarted]=useState(false);
 const [loaded,setLoaded]=useState<{readonly scope:ReadScope;readonly render:(input:EditorPanelInput)=>ReactNode;readonly failed?:false}|{readonly scope:ReadScope;readonly failed:true}|null>(null);
 useEffect(()=>{if(!active||loaded?.scope===props.owner.scope&&!loaded.failed)return;let attached=true;const scope=props.owner.scope;void editorLeaves.load(props.tab,scope).then(module=>{if(attached&&scope.active)setLoaded({scope,render:module.render});},()=>{if(attached&&scope.active)setLoaded({scope,failed:true});});return()=>{attached=false;};},[props.owner.scope,props.tab,attempt,active]);
 const current=loaded?.scope===props.owner.scope&&props.owner.scope.active?loaded:null;
 useEffect(()=>{if(active&&current&&!current.failed)setStarted(true);},[active,current]);
 return <div className="product-editor-body">{current?.failed?<p role="alert">当前页签组件未加载。<UIButton onClick={()=>setAttempt(value=>value+1)}>重试加载页签</UIButton></p>:current&&(active||started)?current.render(props):<p role="status">正在准备当前页签…</p>}</div>;
}
