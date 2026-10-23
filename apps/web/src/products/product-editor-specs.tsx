import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Transfer } from '@arco-design/web-react';
import { UIInput, UISelect, UIButton, UICheckbox } from '../components/standard-controls.tsx';
import { StandardOverlay } from '../components/standard-overlay.tsx';
import { useProductPanelActive, ProductReadState, useProductRead } from '../inventory/product-tab-state.tsx';
import { assertProductSpecifications } from '../inventory/product-model.ts';
import { HttpQueryError } from '../transport/http-query.ts';
import { ProductCandidateSelect, type ProductEditorFieldsProps } from './product-editor-base.tsx';
import type { ProductEditorCapability, ProductSkuInput } from './product-editor-contracts.ts';
import type { DictionarySize } from '../../../../packages/application/src/dictionary-read-ports.ts';
import { LatestQuery } from '../loading/latest-query.ts';
import type { ProductMaintenanceCandidatePage, ProductMaintenanceCandidateQuery } from './product-editor-contracts.ts';

import type { ProductSpecSelection } from './product-editor-state.ts';
export { actualSpecSelection, hasUnresolvedSpecSelection, type ProductSpecSelection } from './product-editor-state.ts';

interface Props extends ProductEditorFieldsProps {
 readonly skus:readonly ProductSkuInput[];readonly changeSkus:(skus:readonly ProductSkuInput[])=>void;
 readonly capability:ProductEditorCapability;
 readonly selection:ProductSpecSelection;readonly changeSelection:(kind:'colors'|'fits',ids:readonly string[])=>void;
}
export function ProductEditorSpecs(props:Props){
 const active=useProductPanelActive();
 const [adding,setAdding]=useState(false),[editingSkus,setEditingSkus]=useState(false),[selecting,setSelecting]=useState<'colors'|'fits'|null>(null),[names,setNames]=useState<Readonly<Record<string,string>>>({});
 useEffect(()=>{if(!active){setAdding(false);setEditingSkus(false);setSelecting(null);}},[active]);
 const label=(kind:string,id:string)=>props.labels[`${kind}:${id}`]??names[`${kind}:${id}`]??'资料未提供';
 const colors=props.selection.colors,fits=props.selection.fits;
 return <div className="product-editor-spec-stack">
  {props.existing&&<ExistingSpecLabels {...props} setNames={setNames}/>}
  <section><div className="product-editor-section-head"><h3>颜色</h3><UIButton variant="text" disabled={props.disabled} onClick={()=>setSelecting('colors')}>编辑颜色</UIButton></div><div className="product-editor-spec-values">{colors.length?colors.map(id=><span key={id}>{label('colors',id)}</span>):<span>未设置</span>}</div></section>
  <section><div className="product-editor-section-head"><h3>尺码组</h3></div><div className="product-editor-group"><span>选择尺码组</span><ProductCandidateSelect scope={props.scope} reader={props.reader} kind="size-groups" label="尺码组" value={props.values.sizeGroupId||null} currentLabel={props.labels[`size-groups:${props.values.sizeGroupId}`]??null} disabled={props.disabled} onAccessFailure={props.onAccessFailure} onChange={(id,name)=>{props.remember(id,name,'size-groups');props.change({sizeGroupId:id??''});}}/></div></section>
  <section><div className="product-editor-section-head"><h3>版型</h3><UIButton variant="text" disabled={props.disabled} onClick={()=>setSelecting('fits')}>编辑版型</UIButton></div><div className="product-editor-spec-values">{fits.length?fits.map(id=><span key={id}>{label('fits',id)}</span>):<span>未设置</span>}</div></section>
  {active&&editingSkus&&<StandardOverlay title="规格明细" closeLabel="关闭规格明细" width={900} className="product-sku-maintenance" close={()=>setEditingSkus(false)} footer={close=><UIButton onClick={close}>完成</UIButton>}>
   <div className="product-editor-section-head"><span>修改随商品保存。</span><UIButton disabled={props.disabled||!props.values.sizeGroupId} onClick={()=>setAdding(true)}>新增规格</UIButton></div>
   <table className="product-editor-spec-table"><thead><tr><th>规格编码</th><th>颜色</th><th>版型</th><th>尺码</th><th>启用</th><th>操作</th></tr></thead><tbody>{props.skus.map((sku,index)=><tr key={sku.id??JSON.stringify([sku.colorId,sku.fitId,sku.sizeId])}><td>{sku.skuCode}</td><td>{label('colors',sku.colorId)}</td><td>{label('fits',sku.fitId)}</td><td>{label('sizes',sku.sizeId)}</td><td><UICheckbox disabled={props.disabled} checked={sku.enabled} onChange={enabled=>props.changeSkus(props.skus.map((item,i)=>i===index?{...item,enabled}:item))}/></td><td>{sku.id===null&&<UIButton disabled={props.disabled} onClick={()=>props.changeSkus(props.skus.filter((_,i)=>i!==index))}>删除未保存规格</UIButton>}</td></tr>)}</tbody></table>
  </StandardOverlay>}
  {active&&adding&&<AddSku {...props} close={()=>setAdding(false)}/>}
  {active&&selecting&&<SpecSelection {...props} kind={selecting} names={names} close={()=>setSelecting(null)} maintainSkus={()=>setEditingSkus(true)}/>}
 </div>;
}
function SpecSelection(props:Props&{readonly kind:'colors'|'fits';readonly names:Readonly<Record<string,string>>;readonly close:()=>void;readonly maintainSkus:()=>void}){
 const [query,setQuery]=useState<LatestQuery<ProductMaintenanceCandidateQuery,ProductMaintenanceCandidatePage>|null>(null);
 useEffect(()=>{const next=new LatestQuery<ProductMaintenanceCandidateQuery,ProductMaintenanceCandidatePage>({scope:props.scope,execute:async read=>{try{return await props.reader.readCandidates(read);}catch(error){if(props.scope.active&&!read.signal.aborted&&error instanceof HttpQueryError&&(error.kind==='unauthenticated'||error.kind==='forbidden'))props.onAccessFailure(error);throw error;}}});setQuery(next);return()=>next.dispose();},[props.scope,props.reader,props.kind]);
 return query&&props.scope.active?<SpecSelectionContent {...props} query={query}/>:null;
}
function SpecSelectionContent(props:Props&{readonly kind:'colors'|'fits';readonly names:Readonly<Record<string,string>>;readonly close:()=>void;readonly maintainSkus:()=>void;readonly query:LatestQuery<ProductMaintenanceCandidateQuery,ProductMaintenanceCandidatePage>}){
 const label=props.kind==='colors'?'颜色':'版型',snapshot=useSyncExternalStore(props.query.subscribe,props.query.getSnapshot,props.query.getSnapshot);
 const [selected,setSelected]=useState([...props.selection[props.kind]]),[search,setSearch]=useState(''),previous=useRef('');
 const remembered=useRef(new Map(props.selection[props.kind].map(id=>[id,{key:id,value:props.labels[`${props.kind}:${id}`]??props.names[`${props.kind}:${id}`]??'资料未提供',code:''}])));
 const run=(page=1)=>{if(props.scope.active)void props.query.run({kind:props.kind,search,page,pageSize:50});};
 useEffect(()=>{if(search===previous.current)return;previous.current=search;const timer=setTimeout(()=>run(),180);return()=>clearTimeout(timer);},[search,props.query]);
 const data=snapshot.phase==='success'&&snapshot.success?.parameters.search===search?snapshot.success.data:null;
 const current=new Map((data?.items??[]).map(item=>[item.id,{key:item.id,value:item.name,code:item.code??''}]));
 const rows=new Map([...remembered.current,...current]);
 const apply=()=>{if(props.disabled)return;for(const id of selected){const item=rows.get(id);if(item&&item.value!=='资料未提供')props.remember(id,item.value,props.kind);}props.changeSelection(props.kind,selected);props.close();};
 return <StandardOverlay title={`编辑${label}`} closeLabel={`关闭编辑${label}`} className="product-spec-transfer-modal" width={780} close={props.close} onReady={()=>{if(props.query.getSnapshot().phase==='idle')run();}} footer={close=><><UIButton className="product-spec-maintain-entry" disabled={props.disabled} onClick={()=>{if(props.disabled)return;apply();props.maintainSkus();}}>确定并维护规格</UIButton><UIButton onClick={close}>取消</UIButton><UIButton className="primary" disabled={props.disabled} onClick={apply}>确定</UIButton></>}>
  <Transfer className="product-spec-transfer" dataSource={[...rows.values()]} targetKeys={selected} showSearch searchPlaceholder={['搜索名称或编码','搜索已选']} titleTexts={[`系统可用${label}`,`当前商品已用${label}`]} operationTexts={['加入已选','移除已选']} filterOption={(q,item)=>`${item.value} ${rows.get(item.key)?.code??''}`.toLocaleLowerCase().includes(q.toLocaleLowerCase())}
   onSearch={(value,direction)=>{if(direction==='source'){props.query.cancel();setSearch(value);}}}
   onChange={keys=>{const next=keys.filter(key=>rows.has(key));for(const id of next)remembered.current.set(id,rows.get(id)!);setSelected(next);}}/>
  {snapshot.phase==='loading'&&<p role="status">正在读取{label}候选…</p>}
  {snapshot.phase==='error'&&<p role="alert">候选读取失败。<UIButton onClick={()=>run(snapshot.request?.parameters.page??1)}>重试</UIButton></p>}
  {data&&<div className="product-editor-candidate-pages"><UIButton disabled={data.page<=1} onClick={()=>run(data.page-1)}>上一页</UIButton><span>候选第 {data.page} 页，共 {data.total} 项；保留本次已选项</span><UIButton disabled={data.page*data.pageSize>=data.total} onClick={()=>run(data.page+1)}>下一页</UIButton></div>}
  <p className="product-field-hint">移除选择会停用对应规格；新增选择后请填写实际规格组合。</p>
 </StandardOverlay>;
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
