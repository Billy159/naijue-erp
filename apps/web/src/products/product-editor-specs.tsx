import { useEffect, useState } from 'react';
import { UIInput, UISelect, UIButton, UICheckbox } from '../components/standard-controls.tsx';
import { StandardOverlay } from '../components/standard-overlay.tsx';
import { ProductReadState, useProductRead } from '../inventory/product-tab-state.tsx';
import { assertProductSpecifications } from '../inventory/product-model.ts';
import { HttpQueryError } from '../transport/http-query.ts';
import { ProductCandidateSelect, type ProductEditorFieldsProps } from './product-editor-base.tsx';
import type { ProductEditorCapability, ProductSkuInput } from './product-editor-contracts.ts';
import type { DictionarySize } from '../../../../packages/application/src/dictionary-read-ports.ts';

interface Props extends ProductEditorFieldsProps {
 readonly skus:readonly ProductSkuInput[];readonly changeSkus:(skus:readonly ProductSkuInput[])=>void;
 readonly capability:ProductEditorCapability;
}
export function ProductEditorSpecs(props:Props){
 const [adding,setAdding]=useState(false),[names,setNames]=useState<Readonly<Record<string,string>>>({});
 const label=(kind:string,id:string)=>props.labels[`${kind}:${id}`]??names[`${kind}:${id}`]??'资料未提供';
 const colors=[...new Set(props.skus.filter(s=>s.enabled).map(s=>s.colorId))],fits=[...new Set(props.skus.filter(s=>s.enabled).map(s=>s.fitId))];
 return <div className="product-editor-spec-stack">
  {props.existing&&<ExistingSpecLabels {...props} setNames={setNames}/>}
  <section><div className="product-editor-section-head"><h3>颜色</h3><UIButton disabled={props.disabled||!props.values.sizeGroupId} onClick={()=>setAdding(true)}>编辑颜色</UIButton></div><div className="product-editor-spec-values">{colors.length?colors.map(id=><span key={id}>{label('colors',id)}</span>):<span>未设置</span>}</div></section>
  <section><h3>尺码组</h3><div className="product-editor-group"><span>选择尺码组</span><ProductCandidateSelect scope={props.scope} reader={props.reader} kind="size-groups" label="尺码组" value={props.values.sizeGroupId||null} currentLabel={props.labels[`size-groups:${props.values.sizeGroupId}`]??null} disabled={props.disabled} onAccessFailure={props.onAccessFailure} onChange={(id,name)=>{props.remember(id,name,'size-groups');props.change({sizeGroupId:id??''});}}/></div></section>
  <section><div className="product-editor-section-head"><h3>版型</h3><UIButton disabled={props.disabled||!props.values.sizeGroupId} onClick={()=>setAdding(true)}>编辑版型</UIButton></div><div className="product-editor-spec-values">{fits.length?fits.map(id=><span key={id}>{label('fits',id)}</span>):<span>未设置</span>}</div></section>
  <section><div className="product-editor-section-head"><h3>规格明细</h3><UIButton disabled={props.disabled||!props.values.sizeGroupId} onClick={()=>setAdding(true)}>新增规格</UIButton></div>
   <table className="product-editor-spec-table"><thead><tr><th>规格编码</th><th>颜色</th><th>版型</th><th>尺码</th><th>启用</th><th>操作</th></tr></thead><tbody>{props.skus.map((sku,index)=><tr key={sku.id??JSON.stringify([sku.colorId,sku.fitId,sku.sizeId])}><td>{sku.skuCode}</td><td>{label('colors',sku.colorId)}</td><td>{label('fits',sku.fitId)}</td><td>{label('sizes',sku.sizeId)}</td><td><UICheckbox disabled={props.disabled} checked={sku.enabled} onChange={enabled=>props.changeSkus(props.skus.map((item,i)=>i===index?{...item,enabled}:item))}/></td><td>{sku.id===null&&<UIButton disabled={props.disabled} onClick={()=>props.changeSkus(props.skus.filter((_,i)=>i!==index))}>删除未保存规格</UIButton>}</td></tr>)}</tbody></table>
  </section>{adding&&<AddSku {...props} close={()=>setAdding(false)}/>}</div>;
}
function ExistingSpecLabels(props:Props&{readonly setNames:(names:Readonly<Record<string,string>>)=>void}){
 const {snapshot,read,cancel,cancelled}=useProductRead(props.scope,async value=>{try{return await props.capability.productReader.readProductSpecifications(value);}catch(error){if(props.scope.active&&!value.signal.aborted&&error instanceof HttpQueryError&&(error.kind==='unauthenticated'||error.kind==='forbidden'))props.onAccessFailure(error);throw error;}},assertProductSpecifications);
 const data=snapshot.success?.data;
 useEffect(()=>{if(data)props.setNames(Object.fromEntries([...[...data.colors].map(x=>[`colors:${x.id}`,x.label]),...[...data.fits].map(x=>[`fits:${x.id}`,x.label]),...[...data.sizes].map(x=>[`sizes:${x.id}`,x.label])]));},[data]);
 return snapshot.phase==='success'?null:<ProductReadState phase={snapshot.phase} retry={read} cancel={cancel} cancelled={cancelled} empty={!data}>{null}</ProductReadState>;
}
function AddSku(props:Props&{readonly close:()=>void}){
 const [colorId,setColor]=useState<string|null>(null),[fitId,setFit]=useState<string|null>(null),[sizeId,setSize]=useState<string>(''),[skuCode,setCode]=useState(''),[sizes,setSizes]=useState<readonly DictionarySize[]|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{
  const controller=new AbortController(),abort=()=>controller.abort();props.scope.signal.addEventListener('abort',abort,{once:true});
  const name=props.labels[`size-groups:${props.values.sizeGroupId}`];
  if(!name){setError('尺码组名称未提供，请重新选择尺码组。');return()=>props.scope.signal.removeEventListener('abort',abort);}
  void props.capability.dictionaryReader.readSizeGroups({parameters:{search:name,page:1,pageSize:100},signal:controller.signal,identity:props.scope.identity,routeInstanceId:props.scope.routeInstanceId,entityId:props.scope.entityId}).then(page=>{
   if(controller.signal.aborted)return;const group=page.items.find(item=>item.id===props.values.sizeGroupId);if(group)setSizes(group.sizes);else setError('当前未读到所选尺码组的尺码资料。');
  },e=>{if(controller.signal.aborted)return;setError('尺码资料读取失败。');if(e instanceof HttpQueryError&&(e.kind==='unauthenticated'||e.kind==='forbidden'))props.onAccessFailure(e);});
  return()=>{props.scope.signal.removeEventListener('abort',abort);controller.abort();};
 },[props.scope,props.values.sizeGroupId,retry]);
 const save=()=>{const size=sizes?.find(s=>s.id===sizeId);if(!colorId||!fitId||!size||!skuCode.trim()){setError('请填写规格编码并选择颜色、版型和尺码。');return;}
  if(props.skus.some(s=>s.colorId===colorId&&s.fitId===fitId&&s.sizeId===sizeId)){setError('该规格组合已存在。');return;}
  props.remember(size.id,size.name,'sizes');props.changeSkus([...props.skus,{id:null,expectedVersion:null,skuCode,colorId,fitId,sizeId,enabled:true}]);props.close();
 };
 return <StandardOverlay title="新增规格" closeLabel="关闭新增规格" close={props.close} width={520} footer={close=><><UIButton onClick={close}>取消</UIButton><UIButton className="primary" disabled={!sizes} onClick={save}>确定</UIButton></>}>
  <div className="product-editor-fields"><label className="field"><span>规格编码 *</span><UIInput aria-label="规格编码" value={skuCode} onChange={setCode}/></label>
  <label className="field"><span>颜色 *</span><ProductCandidateSelect scope={props.scope} reader={props.reader} kind="colors" label="颜色" value={colorId} currentLabel={colorId?(props.labels[`colors:${colorId}`]??null):null} disabled={false} onAccessFailure={props.onAccessFailure} onChange={(id,name)=>{setColor(id);props.remember(id,name,'colors');}}/></label>
  <label className="field"><span>版型 *</span><ProductCandidateSelect scope={props.scope} reader={props.reader} kind="fits" label="版型" value={fitId} currentLabel={fitId?(props.labels[`fits:${fitId}`]??null):null} disabled={false} onAccessFailure={props.onAccessFailure} onChange={(id,name)=>{setFit(id);props.remember(id,name,'fits');}}/></label>
  <label className="field"><span>尺码 *</span><UISelect aria-label="尺码" value={sizeId} options={(sizes??[]).map(s=>({value:s.id,label:s.name}))} disabled={!sizes} placeholder="选择尺码" onChange={value=>{if(typeof value==='string')setSize(value);}}/></label></div>
  {error&&<p role="alert">{error}{sizes===null&&<UIButton onClick={()=>{setError('');setRetry(v=>v+1);}}>重试</UIButton>}</p>}
 </StandardOverlay>;
}
