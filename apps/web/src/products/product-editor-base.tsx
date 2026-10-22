import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { UIInput, UISelect, UIButton } from '../components/standard-controls.tsx';
import { LatestQuery } from '../loading/latest-query.ts';
import type { ReadScope } from '../loading/read-scope.ts';
import { HttpQueryError } from '../transport/http-query.ts';
import type { ProductWriteValues, ProductMaintenanceReader, ProductMaintenanceCandidateKind, ProductMaintenanceCandidateQuery, ProductMaintenanceCandidatePage } from './product-editor-contracts.ts';

export interface ProductCandidateSelectProps {
  readonly scope: ReadScope; readonly reader: ProductMaintenanceReader; readonly kind: ProductMaintenanceCandidateKind;
  readonly label: string; readonly value: string | null; readonly currentLabel?: string | null; readonly disabled: boolean;
  readonly allowClear?: boolean; readonly allowCreate?: boolean;
  readonly onChange: (id: string | null, name: string | null) => void;
  readonly onAccessFailure: (error: HttpQueryError) => void;
}
export function ProductCandidateSelect(props: ProductCandidateSelectProps) {
  const [owner,setOwner]=useState<{scope:ReadScope;query:LatestQuery<ProductMaintenanceCandidateQuery,ProductMaintenanceCandidatePage>}|null>(null);
  const current=useRef(props);current.current=props;
  useEffect(()=>{
    const query=new LatestQuery<ProductMaintenanceCandidateQuery,ProductMaintenanceCandidatePage>({scope:props.scope,execute:async read=>{
      try{return await props.reader.readCandidates(read);}catch(error){if(props.scope.active&&!read.signal.aborted&&error instanceof HttpQueryError&&(error.kind==='unauthenticated'||error.kind==='forbidden'))current.current.onAccessFailure(error);throw error;}
    }});setOwner({scope:props.scope,query});return()=>query.dispose();
  },[props.scope,props.reader,props.kind]);
  return owner?.scope===props.scope&&props.scope.active?<CandidateSelectContent {...props} query={owner.query}/>:<UISelect disabled placeholder={`选择${props.label}`}/>;
}
function CandidateSelectContent(props:ProductCandidateSelectProps&{readonly query:LatestQuery<ProductMaintenanceCandidateQuery,ProductMaintenanceCandidatePage>}){
 const snapshot=useSyncExternalStore(props.query.subscribe,props.query.getSnapshot,props.query.getSnapshot);
 const [open,setOpen]=useState(false),[search,setSearch]=useState('');
 const run=(page=1)=>{if(props.scope.active&&!props.disabled)void props.query.run({kind:props.kind,search,page,pageSize:50});};
 useEffect(()=>{if(!open||props.disabled)return;const timer=setTimeout(()=>run(),180);return()=>clearTimeout(timer);},[search,open,props.disabled]);
 const data=snapshot.phase==='success'&&snapshot.success?.parameters.search===search?snapshot.success.data:null;
 const options=(data?.items??[]).map(item=>({value:item.id,label:props.kind==='years'?`${item.name}年`:item.name}));
 if(props.value!==null&&!options.some(item=>item.value===props.value))options.unshift({value:props.value,label:props.currentLabel??'资料未提供'});
 const choose=(value:unknown)=>{if(typeof value!=='string'||!value){props.onChange(null,null);return;}const found=data?.items.find(item=>item.id===value);
  if(found)props.onChange(found.id,props.kind==='years'?`${found.name}年`:found.name);else if(value===props.value)return;else if(props.allowCreate)props.onChange(value,value);
 };
 return <div className="product-editor-select"><UISelect aria-label={props.label} value={props.value??''} options={options} placeholder={`选择${props.label}`} disabled={props.disabled} showSearch filterOption={false} allowClear={!!props.allowClear} allowCreate={!!props.allowCreate} loading={snapshot.phase==='loading'} popupVisible={open} onVisibleChange={visible=>{setOpen(visible);if(!visible)props.query.cancel();}} onSearch={setSearch} onChange={choose}
  dropdownRender={menu=><>{menu}{snapshot.phase==='error'&&<div role="alert">候选读取失败。<UIButton onClick={()=>run()}>重试</UIButton></div>}{data&&data.total>data.pageSize&&<div className="product-editor-candidate-pages"><UIButton disabled={data.page<=1} onClick={()=>run(data.page-1)}>上一页</UIButton><span>第 {data.page} 页</span><UIButton disabled={data.page*data.pageSize>=data.total} onClick={()=>run(data.page+1)}>下一页</UIButton></div>}</>}/></div>;
}
export interface ProductEditorFieldsProps {
 readonly scope:ReadScope;readonly reader:ProductMaintenanceReader;readonly values:ProductWriteValues;readonly labels:Readonly<Record<string,string>>;
 readonly existing:boolean;readonly disabled:boolean;readonly change:(patch:Partial<ProductWriteValues>)=>void;
 readonly remember:(id:string|null,name:string|null,kind:ProductMaintenanceCandidateKind|'sizes')=>void;readonly onAccessFailure:(error:HttpQueryError)=>void;
}
export function ProductEditorBase(props:ProductEditorFieldsProps){
 const p=props.values;
 const choose=(field:'categoryId'|'supplierId'|'seasonId'|'defaultBarcodeSchemeId',kind:ProductMaintenanceCandidateKind,label:string)=>
  <ProductCandidateSelect scope={props.scope} reader={props.reader} kind={kind} label={label} value={p[field]||null} currentLabel={p[field]===null?null:props.labels[`${kind}:${p[field]}`]??null} disabled={props.disabled} allowClear={field!=='categoryId'} onAccessFailure={props.onAccessFailure} onChange={(id,name)=>{props.remember(id,name,kind);props.change({[field]:id??(field==='categoryId'?'':null)});}}/>;
 return <div className="product-editor-base-grid">
  <label className="field"><span>款号 *</span><UIInput aria-label="款号" value={p.productCode} readOnly={props.existing} disabled={props.disabled} onChange={productCode=>props.change({productCode})}/></label>
  <label className="field"><span>商品名称 *</span><UIInput aria-label="商品名称" value={p.name} disabled={props.disabled} onChange={name=>props.change({name})}/></label>
  <label className="field"><span>商品分类 *</span>{choose('categoryId','categories','商品分类')}</label>
  <label className="field"><span>年份 *</span><ProductCandidateSelect scope={props.scope} reader={props.reader} kind="years" label="年份" value={p.year===null?null:String(p.year)} currentLabel={p.year===null?null:`${p.year}年`} disabled={props.disabled} allowCreate allowClear onAccessFailure={props.onAccessFailure} onChange={year=>{if(year===null)props.change({year:null});else if(/^-?(?:0|[1-9]\d*)$/.test(year)&&Number.isSafeInteger(Number(year))&&Number(year)>=-2147483648&&Number(year)<=2147483647)props.change({year:Number(year)});}}/></label>
  <label className="field"><span>季节 *</span>{choose('seasonId','seasons','季节')}</label>
  <label className="field"><span>供应商 *</span>{choose('supplierId','suppliers','供应商')}</label>
  {(['thickness','collarPantsType']as const).map((field,index)=><label className="field" key={field}><span>{index===0?'厚薄（可选）':'领型 / 裤型（可选）'}</span><ProductCandidateSelect scope={props.scope} reader={props.reader} kind={index===0?'thicknesses':'collar-pants-types'} label={index===0?'厚薄':'领型 / 裤型'} value={p[field]} currentLabel={p[field]} disabled={props.disabled} allowCreate allowClear onAccessFailure={props.onAccessFailure} onChange={value=>props.change({[field]:value})}/></label>)}
  <label className="field"><span>系统货号 *</span><UIInput aria-label="系统货号" value={p.systemItemCode??''} disabled={props.disabled} onChange={value=>props.change({systemItemCode:value===''?null:value})}/></label>
 </div>;
}
