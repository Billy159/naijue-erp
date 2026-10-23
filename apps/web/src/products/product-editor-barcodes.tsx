import { useEffect, useState, useSyncExternalStore } from 'react';
import { UIButton, UIInput, UICheckbox } from '../components/standard-controls.tsx';
import { StandardOverlay } from '../components/standard-overlay.tsx';
import { useProductPanelActive, ProductReadState, useProductRead } from '../inventory/product-tab-state.tsx';
import { assertProductSpecifications } from '../inventory/product-model.ts';
import { LatestQuery } from '../loading/latest-query.ts';
import { validateDictionaryScheme } from '../../../../packages/application/src/dictionary-read-validation.ts';
import type { DictionaryBarcodeScheme, DictionarySchemeQuery } from '../../../../packages/application/src/dictionary-read-ports.ts';
import { HttpQueryError } from '../transport/http-query.ts';
import type { ReadScope } from '../loading/read-scope.ts';
import { ProductCandidateSelect } from './product-editor-base.tsx';
import type { ProductEditorProps, ProductMaintenanceDetail, ProductWriteValues, ProductSkuInput, ProductBarcodeInput } from './product-editor-contracts.ts';

export interface ProductEditorBarcodeProps {
 readonly scope:ReadScope; readonly capability:ProductEditorProps['capability']; readonly detail:ProductMaintenanceDetail|null;
 readonly values:ProductWriteValues; readonly labels:Readonly<Record<string,string>>;
 readonly skus:readonly ProductSkuInput[]; readonly barcodes:readonly ProductBarcodeInput[];
 readonly setBarcodes:(value:readonly ProductBarcodeInput[])=>void; readonly disabled:boolean;
 readonly remember:(id:string|null,name:string|null,kind:string)=>void; readonly change:(patch:Partial<ProductWriteValues>)=>void;
 readonly onAccessFailure:ProductEditorProps['onAccessFailure'];
}
const barcodeCoordinate=(item:{readonly colorId:string;readonly fitId:string;readonly sizeId:string})=>JSON.stringify([item.colorId,item.fitId,item.sizeId]);
export function ProductEditorBarcodes(p:ProductEditorBarcodeProps){
 const active=useProductPanelActive();
 const [adding,setAdding]=useState<string|null>(null),[viewing,setViewing]=useState<string|null>(null),[scheme,setScheme]=useState<string|null>(null),[raw,setRaw]=useState(''),[error,setError]=useState(''),[names,setNames]=useState<Readonly<Record<string,string>>>({});
 useEffect(()=>{if(!active){setAdding(null);setViewing(null);setScheme(null);}},[active]);
 const label=(kind:string,id:string)=>p.labels[`${kind}:${id}`]??names[`${kind}:${id}`]??'资料未提供';
 const groups=new Map<string,{sku:ProductSkuInput|null;coordinate:ProductBarcodeInput|ProductSkuInput;barcodes:{barcode:ProductBarcodeInput;index:number}[]}>();
 for(const sku of p.skus)groups.set(barcodeCoordinate(sku),{sku,coordinate:sku,barcodes:[]});
 p.barcodes.forEach((barcode,index)=>{const key=barcodeCoordinate(barcode);let group=groups.get(key);if(!group){group={sku:null,coordinate:barcode,barcodes:[]};groups.set(key,group);}group.barcodes.push({barcode,index});});
 const selected=viewing===null?null:groups.get(viewing),target=adding===null?null:groups.get(adding);
 const describe=(item:{readonly colorId:string;readonly fitId:string;readonly sizeId:string})=>[label('colors',item.colorId),label('fits',item.fitId),label('sizes',item.sizeId)].join(' / ');
 const add=()=>{if(p.disabled||adding===null)return;const sku=p.skus.find(s=>barcodeCoordinate(s)===adding);if(!sku||!raw.length||raw.includes('\0')||p.barcodes.some(b=>b.barcode===raw)){setError('请填写未重复的完整旧条码。');return;}p.setBarcodes([...p.barcodes,{id:null,barcode:raw,colorId:sku.colorId,fitId:sku.fitId,sizeId:sku.sizeId,kind:'CONFIRMED_OLD',schemeId:null,enabled:true}]);setAdding(null);};
 return <>
  {p.detail&&<BarcodeSpecLabels {...p} setNames={setNames}/>}
  <div className="product-barcode-tools"><div className="field"><span>主条码默认方案</span><ProductCandidateSelect scope={p.scope} reader={p.capability.reader} kind="barcode-schemes" label="主条码默认方案" value={p.values.defaultBarcodeSchemeId} currentLabel={p.values.defaultBarcodeSchemeId?(p.labels[`barcode-schemes:${p.values.defaultBarcodeSchemeId}`]??null):null} disabled={p.disabled} onAccessFailure={p.onAccessFailure} onChange={(id,name)=>{p.remember(id,name,'barcode-schemes');p.change({defaultBarcodeSchemeId:id});}}/></div><UIButton variant="text" disabled={!p.values.defaultBarcodeSchemeId||!p.capability.barcodeSchemeReader} title={p.capability.barcodeSchemeReader?undefined:'方案资料暂不可读取'} onClick={()=>setScheme(p.values.defaultBarcodeSchemeId)}>查看方案</UIButton></div>
  <p className="product-field-hint">已有条码保持原值。</p>
  <h3 className="product-barcode-heading">当前规格条码</h3><div className="product-barcode-table-wrap"><table className="product-editor-spec-table product-barcode-groups"><thead><tr><th>颜色</th><th>版型</th><th>尺码</th><th>当前主条码</th><th>历史 / 兼容条码</th><th>操作</th></tr></thead><tbody>{[...groups].map(([key,group])=>{const main=group.barcodes.filter(({barcode})=>barcode.kind==='MAIN'&&barcode.enabled),old=group.barcodes.filter(({barcode})=>barcode.kind==='CONFIRMED_OLD');return <tr key={key} data-sku-id={group.sku?.id??undefined}><td>{label('colors',group.coordinate.colorId)}</td><td>{label('fits',group.coordinate.fitId)}</td><td>{label('sizes',group.coordinate.sizeId)}{!group.sku&&<span className="product-field-hint">（规格资料未提供）</span>}{group.sku&&!group.sku.enabled&&<span className="product-field-hint">（停用）</span>}</td><td>{main.length?main.map(({barcode,index})=><div key={index} className="product-raw-barcode">{barcode.barcode}</div>):'未设置'}</td><td>{old.length?<><span className="product-raw-barcode">{old[0]!.barcode.barcode}</span>{!old[0]!.barcode.enabled&&<span>（停用）</span>}{old.length>1&&<UIButton variant="text" onClick={()=>setViewing(key)}>另 {old.length-1} 条</UIButton>}</>:'无'}</td><td><div className="product-barcode-row-actions"><UIButton variant="text" onClick={()=>setViewing(key)}>查看条码</UIButton><UIButton variant="text" disabled={p.disabled||!group.sku} onClick={()=>{setRaw('');setError('');setAdding(key);}}>添加旧条码</UIButton></div></td></tr>;})}</tbody></table></div>
  {!groups.size&&<p className="product-field-hint">尚未填写实际规格，请先在规格页维护。</p>}
  {active&&selected&&<StandardOverlay title="规格条码" closeLabel="关闭规格条码" width={820} close={()=>setViewing(null)} footer={close=><UIButton onClick={close}>关闭</UIButton>}>
   <p>{describe(selected.coordinate)}{selected.sku?` · ${selected.sku.skuCode}`:' · 规格资料未提供'}</p>
   <table className="product-editor-spec-table"><thead><tr><th>条码</th><th>类型</th><th>启用</th><th>操作</th></tr></thead><tbody>{selected.barcodes.map(({barcode,index})=><tr key={barcode.id??index}><td className="product-raw-barcode">{barcode.barcode}</td><td>{barcode.kind==='MAIN'?'主条码':'已确认旧码'}</td><td><UICheckbox aria-label={`启用条码 ${barcode.barcode}`} checked={barcode.enabled} disabled={p.disabled} onChange={enabled=>{if(!p.disabled)p.setBarcodes(p.barcodes.map((b,i)=>i===index?{...b,enabled}:b));}}/></td><td>{barcode.id===null&&<UIButton disabled={p.disabled} onClick={()=>{if(!p.disabled)p.setBarcodes(p.barcodes.filter((_,i)=>i!==index));}}>删除未保存条码</UIButton>}</td></tr>)}</tbody></table>
   {!selected.barcodes.length&&<p>当前规格暂无条码。</p>}
  </StandardOverlay>}
  {active&&target&&<StandardOverlay title="添加旧条码" closeLabel="关闭添加旧条码" className="product-barcode-add" close={()=>setAdding(null)} footer={dismiss=><><UIButton onClick={dismiss}>取消</UIButton><UIButton className="primary" disabled={p.disabled||!target.sku} onClick={add}>确定</UIButton></>}>
   <div className="product-editor-fields"><div className="field"><span>规格</span><span>{describe(target.coordinate)}{target.sku?` · ${target.sku.skuCode}`:''}</span></div><label className="field"><span>完整旧条码</span><UIInput aria-label="完整旧条码" disabled={p.disabled} value={raw} onChange={setRaw}/></label></div>{error&&<p role="alert">{error}</p>}
  </StandardOverlay>}
  {active&&scheme&&p.capability.barcodeSchemeReader&&<ProductBarcodeSchemePreview scope={p.scope} schemeId={scheme} reader={p.capability.barcodeSchemeReader} onAccessFailure={p.onAccessFailure} close={()=>setScheme(null)}/>}
 </>;
}
function BarcodeSpecLabels(p:ProductEditorBarcodeProps&{readonly setNames:(value:Readonly<Record<string,string>>)=>void}){
 const {snapshot,read,cancel,cancelled}=useProductRead(p.scope,read=>p.capability.productReader.readProductSpecifications(read),assertProductSpecifications);
 const data=snapshot.phase==='success'?snapshot.success?.data:null;
 useEffect(()=>{if(data)p.setNames(Object.fromEntries([...data.colors.map(x=>[`colors:${x.id}`,x.label]),...data.fits.map(x=>[`fits:${x.id}`,x.label]),...data.sizes.map(x=>[`sizes:${x.id}`,x.label])]));},[data]);
 return snapshot.phase==='success'?null:<ProductReadState phase={snapshot.phase} retry={read} cancel={cancel} cancelled={cancelled} empty={!data}>{null}</ProductReadState>;
}
interface BarcodeSchemePreviewProps {readonly scope:ReadScope;readonly schemeId:string;readonly reader:NonNullable<ProductEditorProps['capability']['barcodeSchemeReader']>;readonly onAccessFailure:ProductEditorProps['onAccessFailure'];readonly close:()=>void}
function ProductBarcodeSchemePreview(p:BarcodeSchemePreviewProps){
 const [query,setQuery]=useState<LatestQuery<DictionarySchemeQuery,DictionaryBarcodeScheme|null>|null>(null);
 useEffect(()=>{const next=new LatestQuery<DictionarySchemeQuery,DictionaryBarcodeScheme|null>({scope:p.scope,execute:async read=>{try{const value=await p.reader.readBarcodeScheme(read);if(value===null)return null;const result=validateDictionaryScheme(value);if(result.id!==read.parameters.schemeId)throw new Error('Invalid scheme target');return result;}catch(error){if(p.scope.active&&!read.signal.aborted&&error instanceof HttpQueryError&&(error.kind==='unauthenticated'||error.kind==='forbidden')){next.dispose();p.onAccessFailure(error);}throw error;}}});setQuery(next);return()=>next.dispose();},[p.scope,p.reader,p.schemeId]);
 return query&&p.scope.active?<ProductBarcodeSchemeDetail {...p} query={query}/>:null;
}
function ProductBarcodeSchemeDetail(p:BarcodeSchemePreviewProps&{readonly query:LatestQuery<DictionarySchemeQuery,DictionaryBarcodeScheme|null>}){
 const snapshot=useSyncExternalStore(p.query.subscribe,p.query.getSnapshot,p.query.getSnapshot),data=snapshot.phase==='success'?snapshot.success?.data:null;
 const run=()=>{if(p.scope.active)void p.query.run({schemeId:p.schemeId});};
 return <StandardOverlay title="查看条码方案" closeLabel="关闭查看条码方案" className="product-barcode-scheme-modal" width={640} close={p.close} onReady={()=>{if(p.query.getSnapshot().phase==='idle')run();}} footer={close=><UIButton onClick={close}>关闭</UIButton>}>
  <ProductReadState phase={snapshot.phase} retry={run} cancel={()=>p.query.cancel()} cancelled={snapshot.phase==='idle'} empty={snapshot.phase==='success'&&data===null}>
   {data&&<dl className="product-barcode-scheme-detail"><dt>方案名称</dt><dd>{data.name}</dd><dt>条码类型</dt><dd>{data.barcodeType}</dd><dt>编码规则</dt><dd>{data.ruleDescription}</dd><dt>总长度</dt><dd>{data.codeLength===null?'未提供':`${data.codeLength} 位`}</dd><dt>规则版本</dt><dd>{data.ruleVersion}</dd><dt>状态</dt><dd>{data.status==='CURRENT'?'当前方案':'历史方案'}</dd></dl>}
  </ProductReadState>
 </StandardOverlay>;
}
