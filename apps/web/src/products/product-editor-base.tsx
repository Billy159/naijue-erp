import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ComponentType, type ReactNode } from 'react';
import { Cascader } from '@arco-design/web-react';
import { UIInput, UISelect, UIButton } from '../components/standard-controls.tsx';
import { LatestQuery } from '../loading/latest-query.ts';
import type { ReadScope } from '../loading/read-scope.ts';
import { HttpQueryError } from '../transport/http-query.ts';
import type { ProductWriteValues, ProductMaintenanceReader, ProductMaintenanceCandidateKind, ProductMaintenanceCandidateQuery, ProductMaintenanceCandidatePage } from './product-editor-contracts.ts';
import type { ProductEditorCapability } from './product-editor-contracts.ts';
import { validateCatalogueSettingsTree } from '../../../../packages/application/src/catalogue-settings-read-validation.ts';
import type { CatalogueSettingsTree } from '../product-settings/colors/contracts.ts';
import { categoryPath, categoryTreeIndex } from '../product-categories/tree-model.ts';
import { createDemoSingleSelectStyles, loadDemoSingleSelectAction, type DemoSingleSelectActionProps } from '../demo-controls/single-select-contract.ts';

export interface ProductCandidateSelectProps {
  readonly scope: ReadScope; readonly reader: ProductMaintenanceReader; readonly kind: ProductMaintenanceCandidateKind;
  readonly label: string; readonly value: string | null; readonly currentLabel?: string | null; readonly disabled: boolean;
  readonly allowClear?: boolean; readonly allowCreate?: boolean; readonly showSearch?: boolean; readonly required?: boolean;
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
 const choose=(value:unknown)=>{if(typeof value!=='string'||!value){if(!props.required)props.onChange(null,null);return;}const found=data?.items.find(item=>item.id===value);
  if(found)props.onChange(found.id,props.kind==='years'?`${found.name}年`:found.name);else if(value===props.value)return;else if(props.allowCreate)props.onChange(value,value);
 };
 const menu=(content:ReactNode)=><>{content}{snapshot.phase==='error'&&<div role="alert">候选读取失败。<UIButton onClick={()=>run()}>重试</UIButton></div>}{data&&data.total>data.pageSize&&<div className="product-editor-candidate-pages"><UIButton disabled={data.page<=1} onClick={()=>run(data.page-1)}>上一页</UIButton><span>第 {data.page} 页</span><UIButton disabled={data.page*data.pageSize>=data.total} onClick={()=>run(data.page+1)}>下一页</UIButton></div>}</>;
 if(props.kind==='years')return <ProductYearCandidatePresentation scope={props.scope} value={props.value??''} options={options} disabled={props.disabled} open={open} loading={snapshot.phase==='loading'} dropdownRender={menu} onOpenChange={visible=>{setOpen(visible);if(!visible)props.query.cancel();}} onChange={choose}/>;
 return <div className="product-editor-select"><UISelect aria-label={props.label} aria-required={props.required||undefined} value={props.value??''} options={options} placeholder={`选择${props.label}`} disabled={props.disabled} showSearch={props.showSearch!==false} filterOption={false} allowClear={!props.required&&!!props.allowClear} allowCreate={!!props.allowCreate} loading={snapshot.phase==='loading'} popupVisible={open} onVisibleChange={visible=>{setOpen(visible);if(!visible)props.query.cancel();}} {...(props.showSearch!==false?{onSearch:setSearch}:{})} onChange={choose}
  dropdownRender={menu}/></div>;
}
/** Only the non-search year consumes this shared flat presentation. Remote reads stay above. */
function ProductYearCandidatePresentation(props:{
 readonly scope:ReadScope;readonly value:string;readonly options:readonly {value:string;label:string}[];
 readonly disabled:boolean;readonly open:boolean;readonly loading:boolean;readonly dropdownRender:(menu:ReactNode)=>ReactNode;
 readonly onOpenChange:(open:boolean)=>void;readonly onChange:(value:string)=>void;
}){
 const host=useRef<HTMLDivElement>(null);
 const [ready,setReady]=useState<{scope:ReadScope;Action:ComponentType<DemoSingleSelectActionProps>}|null>(null);
 const [failed,setFailed]=useState(false),[retry,setRetry]=useState(0),[popupWidth,setPopupWidth]=useState<number|null>(null);
 useEffect(()=>{
  const element=host.current;if(!element||!props.scope.active)return;
  const styles=createDemoSingleSelectStyles(element.ownerDocument);let active=true;
  setReady(null);setFailed(false);
  const abort=()=>{active=false;styles.dispose();setReady(null);};
  props.scope.signal.addEventListener('abort',abort,{once:true});
  void Promise.all([loadDemoSingleSelectAction(),styles.load()]).then(([module])=>{
   if(active&&props.scope.active)setReady({scope:props.scope,Action:module.DemoSingleSelectAction});
  }).catch(()=>{if(active&&props.scope.active)setFailed(true);});
  return()=>{active=false;props.scope.signal.removeEventListener('abort',abort);styles.dispose();};
 },[props.scope,retry]);
 const measure=()=>{
  const element=host.current,view=element?.ownerDocument.defaultView;if(!element||!view||!props.scope.active)return;
  const rect=element.getBoundingClientRect();
  setPopupWidth(Math.min(Math.max(rect.width,300),Math.max(180,view.innerWidth-rect.left-12)));
 };
 useLayoutEffect(()=>{
  if(ready?.scope!==props.scope||!props.scope.active)return;measure();
  const view=host.current?.ownerDocument.defaultView;if(!view)return;
  view.addEventListener('resize',measure);
  const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(measure);
  if(host.current)observer?.observe(host.current);
  return()=>{view.removeEventListener('resize',measure);observer?.disconnect();};
 },[ready,props.scope]);
 const Action=ready?.scope===props.scope&&props.scope.active?ready.Action:null;
 return <div ref={host} className="product-editor-select product-year-select">{Action&&popupWidth!==null?<Action presentation="flat" label="年份" placeholder="选择年份" required value={props.value} options={props.options} disabled={props.disabled} open={props.open} loading={props.loading} dropdownRender={props.dropdownRender} popupWidth={popupWidth} placement="bl"
  onOpenChange={visible=>{if(visible){if(props.disabled||!props.scope.active)return;measure();}props.onOpenChange(visible);}} onChange={value=>{if(props.scope.active&&!props.disabled)props.onChange(value);}}/>:<UISelect aria-label="年份" aria-required disabled showSearch={false} value={props.value} options={props.options.map(option=>({...option}))} placeholder="正在准备年份…"/>}
  {failed&&<div role="alert">年份选择暂不可用。<UIButton disabled={!props.scope.active} onClick={()=>setRetry(value=>value+1)}>重试</UIButton></div>}
 </div>;
}
export interface ProductEditorFieldsProps {
 readonly scope:ReadScope;readonly reader:ProductMaintenanceReader;readonly values:ProductWriteValues;readonly labels:Readonly<Record<string,string>>;
 readonly seasonOriginallyUnknown?:boolean;
 readonly existing:boolean;readonly disabled:boolean;readonly change:(patch:Partial<ProductWriteValues>)=>void;
 readonly remember:(id:string|null,name:string|null,kind:ProductMaintenanceCandidateKind|'sizes')=>void;readonly onAccessFailure:(error:HttpQueryError)=>void;
 readonly categoryReader?: ProductEditorCapability['categoryReader'];
 readonly categoryPath?: readonly {readonly id:string;readonly name:string}[];
}
interface CategoryOption {value:string;label:string;children?:CategoryOption[]}
/** Complete authorized hierarchy only. A page of candidates cannot establish roots or leaves. */
function ProductCategorySelect(props:ProductEditorFieldsProps){
 const host=useRef<HTMLDivElement>(null),[owner,setOwner]=useState<LatestQuery<Readonly<Record<string,never>>,CatalogueSettingsTree>|null>(null);
 useEffect(()=>{if(!props.categoryReader)return;const reader=props.categoryReader;
  const query=new LatestQuery<Readonly<Record<string,never>>,CatalogueSettingsTree>({scope:props.scope,execute:async read=>{try{return validateCatalogueSettingsTree(await reader.readCategories(read));}catch(error){if(props.scope.active&&!read.signal.aborted&&error instanceof HttpQueryError&&(error.kind==='unauthenticated'||error.kind==='forbidden'))props.onAccessFailure(error);throw error;}}});
  setOwner(query);return()=>query.dispose();
 },[props.scope,props.categoryReader]);
 return owner&&props.scope.active?<CategorySelectContent {...props} query={owner} host={host}/>:<UISelect disabled aria-label="商品分类" placeholder="正在准备分类…"/>;
}
function CategorySelectContent(props:ProductEditorFieldsProps&{readonly query:LatestQuery<Readonly<Record<string,never>>,CatalogueSettingsTree>;readonly host:{current:HTMLDivElement|null}}){
 const snapshot=useSyncExternalStore(props.query.subscribe,props.query.getSnapshot,props.query.getSnapshot);
 const data=snapshot.phase==='success'?snapshot.success?.data:null,index=data?categoryTreeIndex(data.items):null;
 const options:CategoryOption[]=[];
 if(index){const nodes=new Map(data!.items.map(item=>[item.id,{value:item.id,label:item.name}as CategoryOption]));for(const [parentId,items]of index.children){const children=items.map(item=>nodes.get(item.id)!);if(parentId===null)options.push(...children);else nodes.get(parentId)!.children=children;}}
 const path=index&&index.byId.has(props.values.categoryId)?categoryPath(index,props.values.categoryId):props.categoryPath?.at(-1)?.id===props.values.categoryId?props.categoryPath:[];
 const label=path.length?path.map(item=>item.name).join(' / '):props.labels[`categories:${props.values.categoryId}`]??'';
 const run=()=>{if(props.scope.active&&!props.disabled)void props.query.run({});};
 return <div ref={props.host} className="product-editor-category"><Cascader aria-label="商品分类" options={options} value={path.map(item=>item.id)} changeOnSelect expandTrigger="click" allowClear={false} showSearch disabled={props.disabled} loading={snapshot.phase==='loading'} placeholder={label||'选择商品分类'} renderFormat={()=>label} getPopupContainer={()=>props.host.current??document.body}
  onVisibleChange={visible=>{if(visible&&props.query.getSnapshot().phase!=='success')run();else if(!visible)props.query.cancel();}}
  onChange={value=>{const id=value.at(-1);if(typeof id!=='string'||!index||snapshot.phase!=='success')return;const item=index.byId.get(id);if(item){props.remember(item.id,categoryPath(index,id).map(node=>node.name).join(' / '),'categories');props.change({categoryId:item.id});}}}
  dropdownRender={menu=><>{menu}{snapshot.phase==='error'&&<div role="alert">分类读取失败。<UIButton onClick={run}>重试</UIButton></div>}</>}/></div>;
}
export function ProductEditorBase(props:ProductEditorFieldsProps){
 const p=props.values;
 const choose=(field:'categoryId'|'supplierId'|'defaultBarcodeSchemeId',kind:ProductMaintenanceCandidateKind,label:string)=>
  <ProductCandidateSelect scope={props.scope} reader={props.reader} kind={kind} label={label} value={p[field]||null} currentLabel={p[field]===null?null:props.labels[`${kind}:${p[field]}`]??null} disabled={props.disabled} required={field==='supplierId'} allowClear={field!=='categoryId'&&field!=='supplierId'} onAccessFailure={props.onAccessFailure} onChange={(id,name)=>{props.remember(id,name,kind);props.change({[field]:id??(field==='categoryId'?'':null)});}}/>;
 return <div className="product-editor-base-grid" role="group" aria-label="商品基础资料">
  <label className="field"><span>款号 *</span><UIInput aria-label="款号" value={p.productCode} readOnly={props.existing} disabled={props.disabled} onChange={productCode=>props.change({productCode})}/></label>
  <label className="field"><span>商品名称 *</span><UIInput aria-label="商品名称" value={p.name} disabled={props.disabled} onChange={name=>props.change({name})}/></label>
  <label className="field"><span>商品分类 *</span>{props.categoryReader?<ProductCategorySelect {...props}/>:choose('categoryId','categories','商品分类')}</label>
  <label className="field"><span>年份 *</span><ProductCandidateSelect scope={props.scope} reader={props.reader} kind="years" label="年份" value={p.year===null?null:String(p.year)} currentLabel={p.year===null?null:`${p.year}年`} disabled={props.disabled} required showSearch={false} onAccessFailure={props.onAccessFailure} onChange={year=>{if(year!==null&&/^-?(?:0|[1-9]\d*)$/.test(year)&&Number.isSafeInteger(Number(year))&&Number(year)>=-2147483648&&Number(year)<=2147483647)props.change({year:Number(year)});}}/></label>
  <div className="field"><span>{'seasonIds' in p ? '季节' : '季节 *'}</span>{'seasonIds' in p ? <ProductSeasonSelect scope={props.scope} reader={props.reader} value={p.seasonIds} labels={props.labels} originallyUnknown={!!props.seasonOriginallyUnknown} disabled={props.disabled} onAccessFailure={props.onAccessFailure} remember={(id,name)=>props.remember(id,name,'seasons')} change={seasonIds=>props.change({seasonIds})}/> : <ProductCandidateSelect scope={props.scope} reader={props.reader} kind="seasons" label="季节" value={p.seasonId} currentLabel={p.seasonId?props.labels[`seasons:${p.seasonId}`]??null:null} disabled={props.disabled} allowClear onAccessFailure={props.onAccessFailure} onChange={(seasonId,name)=>{props.remember(seasonId,name,'seasons');props.change({seasonId});}}/>}</div>
  <label className="field"><span>供应商 *</span>{choose('supplierId','suppliers','供应商')}</label>
  {(['thickness','collarPantsType']as const).map((field,index)=><label className="field" key={field}><span>{index===0?'厚薄（可选）':'领型 / 裤型（可选）'}</span><ProductCandidateSelect scope={props.scope} reader={props.reader} kind={index===0?'thicknesses':'collar-pants-types'} label={index===0?'厚薄':'领型 / 裤型'} value={p[field]} currentLabel={p[field]} disabled={props.disabled} allowCreate allowClear onAccessFailure={props.onAccessFailure} onChange={value=>props.change({[field]:value})}/></label>)}
  <label className="field"><span>系统货号 *</span><UIInput aria-label="系统货号" placeholder="输入系统货号" value={p.systemItemCode??''} disabled={props.disabled} onChange={value=>props.change({systemItemCode:value===''?null:value})}/></label>
 </div>;
}

interface ProductSeasonSelectProps {
 readonly scope:ReadScope; readonly reader:ProductMaintenanceReader; readonly value:readonly string[]|null;
 readonly labels:Readonly<Record<string,string>>; readonly originallyUnknown:boolean; readonly disabled:boolean;
 readonly change:(ids:readonly string[]|null)=>void; readonly remember:(id:string,name:string)=>void;
 readonly onAccessFailure:(error:HttpQueryError)=>void;
}
/** Individual native season candidates only; opening a dropdown never edits UNKNOWN. */
export function ProductSeasonSelect(props:ProductSeasonSelectProps) {
 const [owner,setOwner]=useState<{scope:ReadScope;query:LatestQuery<ProductMaintenanceCandidateQuery,ProductMaintenanceCandidatePage>}|null>(null);
 const current=useRef(props);current.current=props;
 useEffect(()=>{
  const query=new LatestQuery<ProductMaintenanceCandidateQuery,ProductMaintenanceCandidatePage>({scope:props.scope,execute:async read=>{
   try{return await props.reader.readCandidates(read);}catch(error){if(props.scope.active&&!read.signal.aborted&&error instanceof HttpQueryError&&(error.kind==='unauthenticated'||error.kind==='forbidden'))current.current.onAccessFailure(error);throw error;}
  }});setOwner({scope:props.scope,query});return()=>query.dispose();
 },[props.scope,props.reader]);
 return owner?.scope===props.scope&&props.scope.active?<SeasonSelectContent {...props} query={owner.query}/>:<UISelect disabled aria-label="季节" placeholder="正在准备季节…"/>;
}
function SeasonSelectContent(props:ProductSeasonSelectProps&{readonly query:LatestQuery<ProductMaintenanceCandidateQuery,ProductMaintenanceCandidatePage>}) {
 const snapshot=useSyncExternalStore(props.query.subscribe,props.query.getSnapshot,props.query.getSnapshot);
 const [open,setOpen]=useState(false),[search,setSearch]=useState('');
 const selected=props.value??[];
 const run=(page=1)=>{if(props.scope.active&&!props.disabled)void props.query.run({kind:'seasons',search,page,pageSize:50});};
 useEffect(()=>{if(!open||props.disabled)return;const timer=setTimeout(()=>run(),180);return()=>clearTimeout(timer);},[search,open,props.disabled]);
 const data=snapshot.phase==='success'&&snapshot.success?.parameters.search===search?snapshot.success.data:null;
 const options=(data?.items??[]).map(item=>({value:item.id,label:item.name}));
 for(const id of selected)if(!options.some(option=>option.value===id))options.push({value:id,label:props.labels[`seasons:${id}`]??'资料未提供'});
 const choose=(value:unknown)=>{
  if(props.disabled||!Array.isArray(value)||value.some(id=>typeof id!=='string')||new Set(value).size!==value.length)return;
  if(value.some(id=>!selected.includes(id)&&!data?.items.some(item=>item.id===id)))return;
  for(const id of value){const item=data?.items.find(item=>item.id===id);if(item)props.remember(item.id,item.name);}
  props.change([...value]);
 };
 return <div className="product-editor-select product-season-select"><UISelect aria-label="季节" mode="multiple" value={[...selected]} options={options} placeholder={props.value===null?'历史未确认':'选择季节（可多选）'} disabled={props.disabled} showSearch filterOption={false} allowClear maxTagCount="responsive" loading={snapshot.phase==='loading'} popupVisible={open}
  onVisibleChange={visible=>{setOpen(visible);if(!visible)props.query.cancel();}} onSearch={value=>{props.query.cancel();setSearch(value);}} onChange={choose}
  dropdownRender={menu=><>{menu}{snapshot.phase==='error'&&<div role="alert">季节候选读取失败。<UIButton onClick={()=>run()}>重试</UIButton></div>}{data&&data.total>data.pageSize&&<div className="product-editor-candidate-pages"><UIButton disabled={data.page<=1} onClick={()=>run(data.page-1)}>上一页</UIButton><span>第 {data.page} 页</span><UIButton disabled={data.page*data.pageSize>=data.total} onClick={()=>run(data.page+1)}>下一页</UIButton></div>}</>}/>
  {props.value===null?<span className="product-season-hint">历史未确认，未修改时保留。<UIButton disabled={props.disabled} className="iw-link" onClick={()=>props.change([])}>清空季节</UIButton></span>:props.originallyUnknown?<span className="product-season-hint"><UIButton disabled={props.disabled} className="iw-link" onClick={()=>props.change(null)}>保留历史未知</UIButton></span>:null}
 </div>;
}
