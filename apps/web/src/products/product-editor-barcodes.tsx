import { useEffect, useState, useSyncExternalStore } from 'react';
import { UIButton } from '../components/standard-controls.tsx';
import { StandardOverlay } from '../components/standard-overlay.tsx';
import { useProductPanelActive, ProductReadState, useProductRead } from '../inventory/product-tab-state.tsx';
import { assertProductSpecifications } from '../inventory/product-model.ts';
import { LatestQuery } from '../loading/latest-query.ts';
import { validateDictionaryScheme } from '../../../../packages/application/src/dictionary-read-validation.ts';
import type { DictionaryBarcodeScheme, DictionarySchemeQuery } from '../../../../packages/application/src/dictionary-read-ports.ts';
import { HttpQueryError } from '../transport/http-query.ts';
import type { ReadScope } from '../loading/read-scope.ts';
import { ProductBarcodeSourceBody } from './product-page-barcodes.tsx';
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
  <div className="pc-barcode-tools product-barcode-tools"><div className="field"><span className="pc-field-caption">主条码默认方案</span><div id="pc-detail-scheme" className="pc-arco-host"><ProductCandidateSelect scope={p.scope} reader={p.capability.reader} kind="barcode-schemes" label="主条码默认方案" value={p.values.defaultBarcodeSchemeId} currentLabel={p.values.defaultBarcodeSchemeId?(p.labels[`barcode-schemes:${p.values.defaultBarcodeSchemeId}`]??null):null} disabled={p.disabled} onAccessFailure={p.onAccessFailure} onChange={(id,name)=>{p.remember(id,name,'barcode-schemes');p.change({defaultBarcodeSchemeId:id});}}/></div></div><button type="button" className="btn ghost" disabled={!p.values.defaultBarcodeSchemeId||!p.capability.barcodeSchemeReader} title={p.capability.barcodeSchemeReader?undefined:'方案资料暂不可读取'} onClick={()=>setScheme(p.values.defaultBarcodeSchemeId)}>查看方案</button></div>
  <small className="hint">已有条码保持原值。</small>
  <ProductBarcodeSourceBody className="product-barcode-groups" rows={[...groups].map(([key,group])=>{const main=group.barcodes.filter(({barcode})=>barcode.kind==='MAIN'&&barcode.enabled),old=group.barcodes.filter(({barcode})=>barcode.kind==='CONFIRMED_OLD');return {key,...(group.sku?.id?{skuId:group.sku.id}:{}),color:label('colors',group.coordinate.colorId),fit:label('fits',group.coordinate.fitId),size:<>{label('sizes',group.coordinate.sizeId)}{group.sku&&!group.sku.enabled&&<span>（停用）</span>}</>,current:main.length?main.map(({barcode,index})=><span className="product-raw-barcode" key={index}>{barcode.barcode}</span>):'未设置',extras:old.length?<><span className="product-raw-barcode">{old[0]!.barcode.barcode}</span><button type="button" className="btn ghost" onClick={()=>setViewing(key)}>{old.length>1?`+${old.length-1} 更多`:'查看'}</button></>:'—',actions:<>{(main.length>0||old.length>0)&&<button type="button" className="btn ghost" onClick={()=>setViewing(key)}>查看</button>}{group.sku&&<button type="button" className="btn ghost" disabled={p.disabled} onClick={()=>{setRaw('');setError('');setAdding(key);}}>添加旧条码</button>}</>};})}/>
  {active&&selected&&<StandardOverlay presentation="catalogue" className="pc-arco-modal product-source-modal product-source-ui" title="查看全部条码" closeLabel="关闭查看全部条码" width={820} close={()=>setViewing(null)} footer={close=><div className="pc-modal-foot"><button type="button" className="btn" onClick={close}>关闭</button></div>}>
   <p className="spaced">商品规格：{describe(selected.coordinate)}{selected.sku?` · ${selected.sku.skuCode}`:' · 规格资料未提供'}</p>
   <table className="pc-barcode-view-table"><thead><tr><th>条码</th><th>类型</th><th>来源</th><th>历史规格</th><th>操作</th></tr></thead><tbody>{selected.barcodes.map(({barcode,index})=><tr key={barcode.id??index}><td className="product-raw-barcode">{barcode.barcode}</td><td>{barcode.kind==='MAIN'?'主条码':'已确认旧码'}{!barcode.enabled&&'（停用）'}</td><td>未提供</td><td>未提供</td><td>{barcode.kind!=='MAIN'&&<button type="button" className="btn ghost" disabled={p.disabled||barcode.id!==null} onClick={()=>{if(!p.disabled&&barcode.id===null)p.setBarcodes(p.barcodes.filter((_,i)=>i!==index));}}>删除</button>}</td></tr>)}</tbody></table>
   {!selected.barcodes.length&&<p>当前规格暂无条码。</p>}
  </StandardOverlay>}
  {active&&target&&<StandardOverlay presentation="catalogue" title="添加旧条码" closeLabel="关闭添加旧条码" className="pc-arco-modal product-source-modal product-source-ui product-barcode-add" close={()=>setAdding(null)} footer={dismiss=><div className="pc-modal-foot"><button type="button" className="btn" onClick={dismiss}>取消</button><button type="button" className="btn primary" disabled={p.disabled||!target.sku} onClick={add}>确定</button></div>}>
   <div className="pc-modal-body"><p className="pc-modal-sku">商品规格：{describe(target.coordinate)}{target.sku?` · ${target.sku.skuCode}`:''}</p><p className="hint">当前主条码：{target.barcodes.find(({barcode})=>barcode.kind==='MAIN'&&barcode.enabled)?.barcode.barcode??'未设置'}</p>
   <form onSubmit={event=>{event.preventDefault();add();}}><div className="field"><span className="pc-field-caption">完整条码 *</span><input name="barcode" aria-label="完整旧条码" required autoComplete="off" disabled={p.disabled} value={raw} onChange={event=>setRaw(event.currentTarget.value)}/></div><div className="field"><span className="pc-field-caption">历史规格说明（可选）</span><input name="note" aria-label="历史规格说明" disabled title="暂不可填写" placeholder="例如：165/84A"/></div></form>{error&&<div className="inline-error" role="alert">{error}</div>}</div>
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
 return <StandardOverlay presentation="catalogue" title="查看条码方案" closeLabel="关闭查看条码方案" className="pc-arco-modal product-source-modal product-source-ui product-barcode-scheme-modal" width={640} close={p.close} onReady={()=>{if(p.query.getSnapshot().phase==='idle')run();}} footer={close=><div className="pc-modal-foot"><button type="button" className="btn" onClick={close}>关闭</button></div>}>
  <ProductReadState phase={snapshot.phase} retry={run} cancel={()=>p.query.cancel()} cancelled={snapshot.phase==='idle'} empty={snapshot.phase==='success'&&data===null}>
   {data&&<dl className="pc-rule"><dt>方案名称</dt><dd>{data.name}</dd><dt>条码类型</dt><dd>{data.barcodeType}</dd><dt>编码规则</dt><dd>{data.ruleDescription}</dd><dt>总长度</dt><dd>{data.codeLength===null?'未提供':`${data.codeLength} 位`}</dd></dl>}
  </ProductReadState>
 </StandardOverlay>;
}
