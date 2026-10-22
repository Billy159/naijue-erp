import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { UIButton, UIInput, UICheckbox, UISelect } from '../components/standard-controls.tsx';
import { StandardTabs } from '../components/standard-tabs.tsx';
import { StandardOverlay } from '../components/standard-overlay.tsx';
import { ReadScope } from '../loading/read-scope.ts';
import { ProductReadState, useProductRead } from '../inventory/product-tab-state.tsx';
import { HttpQueryError } from '../transport/http-query.ts';
import { CATALOGUE_PRICE_KEYS } from '../../../../packages/application/src/catalogue-price-input.ts';
import { ProductEditorController } from './product-editor-state.ts';
import { validateProductMaintenanceDetail } from './product-maintenance-http-client.ts';
import { ProductEditorBase, ProductCandidateSelect } from './product-editor-base.tsx';
import { ProductEditorSpecs } from './product-editor-specs.tsx';
import { ProductEditorMedia } from './product-editor-media.tsx';
import { View as ProductStockView } from './product-page-stock.tsx';
import type { ProductEditorProps, ProductMaintenanceDetail, ProductWriteValues, ProductSkuInput, ProductBarcodeInput, ProductMaintenanceCommand } from './product-editor-contracts.ts';
import type { ProductReadOnlyPageTab } from './product-page-contracts.ts';
import './product-page.css';

const tabs=[['base','基础资料'],['specs','规格'],['barcodes','条码'],['prices','价格'],['images','图片'],['stock','库存']]as const;
const priceLabels=['采购价','零售价','五级批发价（工厂店供货价）','六级批发价（贴牌价）','七级批发价（批发价）','八级批发价（代理商供货价）','九级批发价（工厂店零售价）','十级批发价（葛玉珠）','最低售价'];
let editorSequence=0;
export function ProductEditor(props:ProductEditorProps){
 const capability=useMemo(()=>{
  const source=props.capability.productReader;
  const guarded=async<T,>(read:{signal:AbortSignal},work:()=>Promise<T>)=>{try{return await work();}catch(error){if(props.parent.active&&!read.signal.aborted&&error instanceof HttpQueryError&&(error.kind==='unauthenticated'||error.kind==='forbidden'))props.onAccessFailure(error);throw error;}};
  return {...props.capability,...(props.capability.stock?{stock:{read:read=>guarded(read,()=>props.capability.stock!.read(read))}}:{}),productReader:{readProductBasics:read=>guarded(read,()=>source.readProductBasics(read)),readProductSpecifications:read=>guarded(read,()=>source.readProductSpecifications(read)),readProductImages:read=>guarded(read,()=>source.readProductImages(read)),readProductImage:read=>guarded(read,()=>source.readProductImage(read))}} satisfies ProductEditorProps['capability'];
 },[props.capability,props.parent,props.onAccessFailure]);
 const [activeId,setActiveId]=useState(props.productId),[revision,setRevision]=useState(0),[owner,setOwner]=useState<{parent:ReadScope;id:string|null;revision:number;scope:ReadScope}|null>(null);
 useEffect(()=>{setActiveId(props.productId);},[props.parent,props.productId]);
 useEffect(()=>{const scope=new ReadScope(props.parent.identity,`${props.parent.routeInstanceId}:product-editor:${++editorSequence}`,activeId,()=>{}),abort=()=>scope.dispose();props.parent.signal.addEventListener('abort',abort,{once:true});if(!props.parent.active)scope.dispose();setOwner({parent:props.parent,id:activeId,revision,scope});return()=>{props.parent.signal.removeEventListener('abort',abort);scope.dispose();};},[props.parent,activeId,revision]);
 if(!props.parent.active||owner?.parent!==props.parent||owner.id!==activeId||owner.revision!==revision||!owner.scope.active)return null;
 const reload=(id:string)=>{setActiveId(id);setRevision(v=>v+1);};
 return <section className="product-editor" aria-label={activeId?'编辑商品':'新增商品'}>{activeId?<ExistingEditor key={owner.scope.routeInstanceId} {...props} capability={capability} scope={owner.scope} targetId={activeId} reload={reload}/>:<EditorForm key={owner.scope.routeInstanceId} {...props} capability={capability} scope={owner.scope} detail={null} reload={reload}/>}</section>;
}
function ExistingEditor(props:ProductEditorProps&{readonly scope:ReadScope;readonly targetId:string;readonly reload:(id:string)=>void}){
 const {snapshot,read,cancel,cancelled}=useProductRead(props.scope,async input=>{try{return await props.capability.reader.readDetail(input);}catch(error){if(props.scope.active&&!input.signal.aborted&&error instanceof HttpQueryError&&(error.kind==='unauthenticated'||error.kind==='forbidden'))props.onAccessFailure(error);throw error;}},(value,p)=>{validateProductMaintenanceDetail(value,p.productId);});
 const data=snapshot.success?.data;
 return <>{!data&&<div className="product-editor-loading-head"><UIButton onClick={props.onClose}>返回商品信息</UIButton></div>}<ProductReadState phase={snapshot.phase} retry={read} cancel={cancel} cancelled={cancelled} empty={!data}>{data&&<EditorForm {...props} detail={data}/>}</ProductReadState></>;
}
function newValues():ProductWriteValues{return {productCode:'',name:'',categoryId:'',supplierId:null,seasonId:null,sizeGroupId:'',year:Number(new Intl.DateTimeFormat('en',{timeZone:'Asia/Shanghai',year:'numeric'}).format(new Date())),systemItemCode:null,thickness:null,collarPantsType:null,defaultBarcodeSchemeId:null,enabled:true,prices:Object.fromEntries(CATALOGUE_PRICE_KEYS.map(key=>[key,null]))as ProductWriteValues['prices']};}
function refLabels(detail:ProductMaintenanceDetail|null):Readonly<Record<string,string>>{if(!detail)return {};const r=detail.references;return Object.fromEntries([...r.categoryPath.map(x=>[`categories:${x.id}`,x.name]),...(r.supplier?[[`suppliers:${r.supplier.id}`,r.supplier.name]]:[]),...(r.season?[[`seasons:${r.season.id}`,r.season.name]]:[]),[`size-groups:${r.sizeGroup.id}`,r.sizeGroup.name],...(r.defaultBarcodeScheme?[[`barcode-schemes:${r.defaultBarcodeScheme.id}`,r.defaultBarcodeScheme.name]]:[])]);}
function EditorForm(props:ProductEditorProps&{readonly scope:ReadScope;readonly detail:ProductMaintenanceDetail|null;readonly reload:(id:string)=>void}){
 const [values,setValues]=useState(()=>props.detail?.values??newValues()),[skus,setSkus]=useState<readonly ProductSkuInput[]>(()=>props.detail?.skus??[]),[barcodes,setBarcodes]=useState<readonly ProductBarcodeInput[]>(()=>props.detail?.barcodes??[]);
 const [labels,setLabels]=useState<Readonly<Record<string,string>>>(()=>refLabels(props.detail)),[tab,setTab]=useState<ProductReadOnlyPageTab>('base'),[error,setError]=useState(''),[leave,setLeave]=useState(false),[confirmDelete,setConfirmDelete]=useState(false);
 const baseline=useRef(JSON.stringify({values,skus,barcodes})),guard=useRef(()=>true);
 const [write,setWrite]=useState<ProductEditorController|null>(null);
 useEffect(()=>{const state=new ProductEditorController({scope:props.scope,client:props.capability.client,newRequestKey:props.capability.newRequestKey,onRecoveryRequired:props.capability.onRecoveryRequired,onAccessFailure:e=>props.onAccessFailure(new HttpQueryError(e.kind==='unauthenticated'?'unauthenticated':'forbidden',e.code,e.status))});setWrite(state);return()=>state.dispose();},[props.scope,props.capability]);
 useEffect(()=>{props.onCanLeaveChange(()=>guard.current());return()=>props.onCanLeaveChange(null);},[props.scope,props.onCanLeaveChange]);
 return write?<EditorFields {...props} values={values} setValues={setValues} skus={skus} setSkus={setSkus} barcodes={barcodes} setBarcodes={setBarcodes} labels={labels} setLabels={setLabels} tab={tab} setTab={setTab} error={error} setError={setError} leave={leave} setLeave={setLeave} confirmDelete={confirmDelete} setConfirmDelete={setConfirmDelete} baseline={baseline.current} guard={guard} write={write}/>:<p role="status">正在准备商品表单…</p>;
}
interface Fields extends ProductEditorProps {
 readonly scope:ReadScope;readonly detail:ProductMaintenanceDetail|null;readonly reload:(id:string)=>void;readonly write:ProductEditorController;
 readonly values:ProductWriteValues;readonly setValues:(value:ProductWriteValues)=>void;readonly skus:readonly ProductSkuInput[];readonly setSkus:(value:readonly ProductSkuInput[])=>void;readonly barcodes:readonly ProductBarcodeInput[];readonly setBarcodes:(value:readonly ProductBarcodeInput[])=>void;
 readonly labels:Readonly<Record<string,string>>;readonly setLabels:(value:Readonly<Record<string,string>>)=>void;readonly tab:ProductReadOnlyPageTab;readonly setTab:(value:ProductReadOnlyPageTab)=>void;
 readonly error:string;readonly setError:(value:string)=>void;readonly leave:boolean;readonly setLeave:(value:boolean)=>void;readonly confirmDelete:boolean;readonly setConfirmDelete:(value:boolean)=>void;
 readonly baseline:string;readonly guard:{current:()=>boolean};
}
function EditorFields(p:Fields){
 const [reloadConfirm,setReloadConfirm]=useState(false);
 const state=useSyncExternalStore(p.write.subscribe,p.write.getSnapshot,p.write.getSnapshot),dirty=JSON.stringify({values:p.values,skus:p.skus,barcodes:p.barcodes})!==p.baseline;
 const pending=['submitting','checking','uncertain'].includes(state.phase),deleted=p.detail?.deletedAt!==null&&p.detail!==null,existing=!!p.detail;
 const can=(action:ProductMaintenanceCommand['action'])=>!deleted&&p.capability.allowedActions.includes(action),disabled=pending||state.phase==='committed'||!can(existing?'EDIT':'CREATE');
 p.guard.current=()=>!dirty&&!pending;
 const change=(patch:Partial<ProductWriteValues>)=>{if(!disabled)p.setValues({...p.values,...patch});};
 const remember=(id:string|null,name:string|null,kind:string)=>{if(id&&name)p.setLabels({...p.labels,[`${kind}:${id}`]:name});};
 const finish=()=>{const result=p.write.getSnapshot().result;if(result){p.onSaved(result.targetId);if(p.write.getSnapshot().command?.action==='DELETE')p.onClose();else p.reload(result.targetId);}};
 const save=async(action:ProductMaintenanceCommand['action']=existing?'EDIT':'CREATE')=>{p.setError('');try{
  if(!can(action)||pending)return;
  if(action==='CREATE')await p.write.submit({action,values:p.values,skus:p.skus,barcodes:p.barcodes});
  else if(p.detail&&action==='EDIT')await p.write.submit({action,id:p.detail.productId,expectedVersion:p.detail.version,values:p.values,skus:p.skus,barcodes:p.barcodes});
  else if(p.detail)await p.write.submit({action:action as 'DELETE'|'DISABLE'|'RESTORE',id:p.detail.productId,expectedVersion:p.detail.version});
  finish();
 }catch{p.setError('请检查必填资料、规格和价格；金额最多两位小数。');}};
 const close=()=>{if(pending)return;if(dirty)p.setLeave(true);else p.onClose();};
 const fields={scope:p.scope,reader:p.capability.reader,values:p.values,labels:p.labels,existing,disabled,change,remember,onAccessFailure:p.onAccessFailure};
 if(!p.scope.active||state.phase==='disposed')return null;
 return <div className="product-detail-workbench"><div className="product-detail-sticky"><div className="product-editor-head"><h1>{existing?`${p.detail!.values.productCode} · ${p.detail!.values.name}`:`新增商品 · ${p.values.name||'未命名'}`}</h1><div className="iw-actions">
  {existing&&can('DELETE')&&<UIButton disabled={pending} className="product-delete" onClick={()=>p.setConfirmDelete(true)}>删除商品</UIButton>}
  {existing&&can(p.values.enabled?'DISABLE':'RESTORE')&&<UIButton disabled={pending||dirty} onClick={()=>void save(p.values.enabled?'DISABLE':'RESTORE')}>{p.values.enabled?'停用':'恢复启用'}</UIButton>}
  <UIButton disabled={pending} onClick={close}>取消</UIButton><UIButton className="primary" disabled={disabled||existing&&!dirty} onClick={()=>void save()}>保存</UIButton></div></div>
 </div>
  {(p.error||state.error)&&<p role="alert" className="product-editor-error">{p.error||state.error?.message}{existing&&state.error?.kind==='conflict'&&<UIButton onClick={()=>setReloadConfirm(true)}>读取最新商品</UIButton>}</p>}
  {state.phase==='submitting'&&<p role="status">正在保存商品，请保留当前页面。</p>}
  {(state.phase==='uncertain'||state.phase==='checking')&&<div className="product-editor-recovery" role="status">保存结果尚未确认。<UIButton disabled={state.phase==='checking'} onClick={()=>void p.write.recover().then(finish)}>查回保存结果</UIButton><UIButton disabled={state.phase==='checking'} onClick={()=>void p.write.retryOriginal().then(finish)}>按原请求重试</UIButton></div>}
  {deleted&&<p role="status">该商品已删除，仅可查看。</p>}
  <StandardTabs label="商品详情" value={p.tab} items={tabs.map(([key,label])=>({key,label}))} onChange={p.setTab}><div className="product-editor-body">
   {p.tab==='base'&&<ProductEditorBase {...fields}/>}
   {p.tab==='specs'&&<ProductEditorSpecs {...fields} capability={p.capability} skus={p.skus} changeSkus={p.setSkus}/>}
   {p.tab==='barcodes'&&<BarcodeEditor {...p} disabled={disabled} remember={remember} change={change}/>}
   {p.tab==='prices'&&<div className="product-price-wrap"><div className="product-price-paste"><strong>价格</strong><span>可从 Excel 整列复制价格，按下表顺序粘贴</span></div><table className="product-price-table"><thead><tr><th>价格类型</th><th>金额</th></tr></thead><tbody>{CATALOGUE_PRICE_KEYS.map((key,index)=><tr key={key}><th scope="row">{priceLabels[index]}</th><td><UIInput aria-label={priceLabels[index]} inputMode="decimal" placeholder="未设置" value={p.values.prices[key]??''} disabled={disabled} onChange={text=>change({prices:{...p.values.prices,[key]:text===''?null:text}})} onPaste={event=>{
    const raw=event.clipboardData.getData('text/plain');if(disabled||!/[\t\r\n]/.test(raw))return;event.preventDefault();const cells=raw.replace(/\r\n?/g,'\n').replace(/\n$/,'').split(/[\t\n]/).map(text=>text.trim());const keys=CATALOGUE_PRICE_KEYS.slice(index);
    if(cells.length>keys.length||cells.some(text=>text!==''&&!/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/.test(text))){p.setError('价格必须是非负金额，最多两位小数；空白表示未设置。');return;}
    const prices={...p.values.prices};cells.forEach((text,i)=>{prices[keys[i]!]=text===''?null:text;});change({prices});p.setError('');
   }}/></td></tr>)}</tbody></table><p className="product-field-hint">空白表示未设置；0 表示价格为零。</p></div>}
   {p.tab==='images'&&<ProductEditorMedia scope={p.scope} productId={p.detail?.productId??null} reader={p.capability.productReader}/>}
   {p.tab==='stock'&&(existing&&p.capability.stock?<ProductStockView scope={p.scope} reader={{stock:p.capability.stock}}/>:<p className="product-field-hint">{existing?'库存资料暂不可读取。':'新商品保存后可查看库存。'}</p>)}
  </div></StandardTabs>
  {p.leave&&<StandardOverlay title="放弃未保存资料" closeLabel="关闭放弃确认" close={()=>p.setLeave(false)} footer={dismiss=><><UIButton onClick={dismiss}>继续填写</UIButton><UIButton onClick={p.onClose}>放弃填写</UIButton></>}><p>是否放弃当前未保存的商品资料？</p></StandardOverlay>}
  {p.confirmDelete&&<StandardOverlay title="删除商品" closeLabel="关闭删除确认" close={()=>p.setConfirmDelete(false)} footer={dismiss=><><UIButton onClick={dismiss}>取消</UIButton><UIButton className="primary" onClick={()=>{p.setConfirmDelete(false);void save('DELETE');}}>确认删除</UIButton></>}><p>确认删除“{p.values.productCode} · {p.values.name}”？已有库存或业务引用时无法删除。</p></StandardOverlay>}
  {reloadConfirm&&<StandardOverlay title="重新读取商品" closeLabel="关闭重新读取确认" close={()=>setReloadConfirm(false)} footer={dismiss=><><UIButton onClick={dismiss}>继续填写</UIButton><UIButton onClick={()=>{if(p.detail)p.reload(p.detail.productId);}}>放弃输入并读取</UIButton></>}><p>当前未保存输入将被放弃，并读取最新商品资料。</p></StandardOverlay>}
 </div>;
}
function BarcodeEditor(p:Fields&{readonly disabled:boolean;readonly remember:(id:string|null,name:string|null,kind:string)=>void;readonly change:(patch:Partial<ProductWriteValues>)=>void}){
 const [adding,setAdding]=useState(false),[raw,setRaw]=useState(''),[coordinate,setCoordinate]=useState(''),[error,setError]=useState('');
 const label=(barcode:ProductBarcodeInput)=>p.skus.find(s=>s.colorId===barcode.colorId&&s.fitId===barcode.fitId&&s.sizeId===barcode.sizeId)?.skuCode??'规格资料未提供';
 return <><div className="product-barcode-tools"><span>主条码默认方案</span><ProductCandidateSelect scope={p.scope} reader={p.capability.reader} kind="barcode-schemes" label="主条码默认方案" value={p.values.defaultBarcodeSchemeId} currentLabel={p.values.defaultBarcodeSchemeId?(p.labels[`barcode-schemes:${p.values.defaultBarcodeSchemeId}`]??null):null} disabled={p.disabled} onAccessFailure={p.onAccessFailure} onChange={(id,name)=>{p.remember(id,name,'barcode-schemes');p.change({defaultBarcodeSchemeId:id});}}/></div><p className="product-field-hint">已有条码保持原值。</p>
  <div className="product-editor-section-head"><h3>规格条码</h3><UIButton disabled={p.disabled||!p.skus.length} onClick={()=>setAdding(true)}>添加旧条码</UIButton></div>
  <table className="product-editor-spec-table"><thead><tr><th>规格编码</th><th>条码</th><th>类型</th><th>启用</th><th>操作</th></tr></thead><tbody>{p.barcodes.map((barcode,index)=><tr key={barcode.id??barcode.barcode}><td>{label(barcode)}</td><td className="product-raw-barcode">{barcode.barcode}</td><td>{barcode.kind==='MAIN'?'主条码':'已确认旧码'}</td><td><UICheckbox checked={barcode.enabled} disabled={p.disabled} onChange={enabled=>p.setBarcodes(p.barcodes.map((b,i)=>i===index?{...b,enabled}:b))}/></td><td>{barcode.id===null&&<UIButton disabled={p.disabled} onClick={()=>p.setBarcodes(p.barcodes.filter((_,i)=>i!==index))}>删除未保存条码</UIButton>}</td></tr>)}</tbody></table>
  {adding&&<StandardOverlay title="添加旧条码" closeLabel="关闭添加旧条码" close={()=>setAdding(false)} footer={dismiss=><><UIButton onClick={dismiss}>取消</UIButton><UIButton className="primary" onClick={()=>{const sku=p.skus.find(s=>JSON.stringify([s.colorId,s.fitId,s.sizeId])===coordinate);if(!sku||!raw.length||raw.includes('\0')||p.barcodes.some(b=>b.barcode===raw)){setError('请选择规格，并填写未重复的完整旧条码。');return;}p.setBarcodes([...p.barcodes,{id:null,barcode:raw,colorId:sku.colorId,fitId:sku.fitId,sizeId:sku.sizeId,kind:'CONFIRMED_OLD',schemeId:null,enabled:true}]);setAdding(false);}}>确定</UIButton></>}>
   <div className="product-editor-fields"><label className="field"><span>规格</span><UISelect aria-label="旧条码规格" value={coordinate} placeholder="选择规格" options={p.skus.map(s=>({value:JSON.stringify([s.colorId,s.fitId,s.sizeId]),label:s.skuCode}))} onChange={value=>{if(typeof value==='string')setCoordinate(value);}}/></label><label className="field"><span>完整旧条码</span><UIInput aria-label="完整旧条码" value={raw} onChange={setRaw}/></label></div>{error&&<p role="alert">{error}</p>}
  </StandardOverlay>}
 </>;
}
