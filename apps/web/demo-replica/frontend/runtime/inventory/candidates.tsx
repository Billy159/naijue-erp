import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Select from '@arco-design/web-react/es/Select';
import TreeSelect from '@arco-design/web-react/es/TreeSelect';
import Tag from '@arco-design/web-react/es/Tag';
import Empty from '@arco-design/web-react/es/Empty';
import { IconSearch } from '@arco-design/web-react/icon';
import arcoCss from '@arco-design/web-react/dist/css/arco.css?inline';
import { LatestQuery } from '../../../../src/loading/latest-query.ts';
import type { ReadScope } from '../../../../src/loading/read-scope.ts';
import type { Candidate, CandidateKind, CandidatePage, CandidateParameters, InventoryReader, Selection } from '../../../../src/inventory/contracts.ts';
import { HttpQueryError } from '../../../../src/transport/http-query.ts';
import type { ProductReadOnlyReader } from '../../../../src/inventory/product-contracts.ts';
import { ProductCandidatePreview } from '../products/preview.tsx';
import { productCss, categoryCss, filterCss, emptyCss } from './source-control-css.ts';

import { ALL_FILTER_VALUE as ALL,checkedFilterValues,resolveFilterSelection } from './filter-selection.ts';
const labels: Record<CandidateKind,string> = { product:'商品',category:'商品分类',warehouse:'仓库',supplier:'供应商',fit:'版型',season:'季节' };
const sourceArcoCss=arcoCss.replace(/\bbody\s*\{/g,':host {');
const sourceSheets=new WeakMap<Document,Map<string,CSSStyleSheet>>();
function sharedSourceSheet(doc:Document,css:string):CSSStyleSheet {
 let sheets=sourceSheets.get(doc);if(!sheets){sheets=new Map();sourceSheets.set(doc,sheets);}
 let sheet=sheets.get(css);if(!sheet){sheet=new doc.defaultView!.CSSStyleSheet();sheet.replaceSync(css);sheets.set(css,sheet);}return sheet;
}
/** The source shadow host is retained; portals belong to the SAME React root. */
export function SourceControl(p:{css:string;attributes?:Record<string,string>;children:(portal:HTMLElement,host:HTMLElement)=>ReactNode}) {
 const host=useRef<HTMLDivElement>(null),[nodes,setNodes]=useState<{app:HTMLElement;portal:HTMLElement;host:HTMLElement}|null>(null);
 useLayoutEffect(()=>{
  const el=host.current!,doc=el.ownerDocument,shadow=el.shadowRoot??el.attachShadow({mode:'open'}),app=doc.createElement('div'),portal=doc.createElement('div');
  let releaseStyles:()=>void;
  if('adoptedStyleSheets' in shadow&&typeof doc.defaultView?.CSSStyleSheet.prototype.replaceSync==='function'){
   // Adopt both layers: adopted sheets follow style elements, so mixing the two would reverse Demo overrides.
   const sheets=[sharedSourceSheet(doc,sourceArcoCss),sharedSourceSheet(doc,p.css)];
   shadow.adoptedStyleSheets=[...shadow.adoptedStyleSheets,...sheets];
   releaseStyles=()=>{shadow.adoptedStyleSheets=shadow.adoptedStyleSheets.filter(sheet=>!sheets.includes(sheet));};
  }else{
   const style=doc.createElement('style'),local=doc.createElement('style');style.textContent=sourceArcoCss;local.textContent=p.css;shadow.append(style,local);releaseStyles=()=>{style.remove();local.remove();};
  }
  app.id='root';portal.id='portal';shadow.append(app,portal);setNodes({app,portal,host:el});
  return()=>{releaseStyles();app.remove();portal.remove();};
 },[p.css]);
 return <div ref={host} {...p.attributes}>{nodes&&createPortal(p.children(nodes.portal,nodes.host),nodes.app)}</div>;
}
export function SourceEmpty(p:{title:string;description:string}) {return <div id="inventory-arco-empty" className="iw-empty-host"><SourceControl css={emptyCss}>{()=> <Empty description={<div className="inv-empty-copy"><strong>{p.title}</strong><span>{p.description}</span></div>}/>}</SourceControl></div>;}
type CandidateGeometry={left:number;width:number;viewport:number;filterRight:number};
function measureCandidateGeometry(host:HTMLElement):CandidateGeometry {
 const rect=host.getBoundingClientRect();
 const category=document.getElementById('inventory-arco-category')?.getBoundingClientRect();
 const warehouse=document.getElementById('inventory-arco-warehouses')?.getBoundingClientRect();
 const sameRow=!!category&&!!warehouse&&Math.abs(category.top-rect.top)<3&&Math.abs(warehouse.top-rect.top)<3;
 return {left:rect.left,width:rect.width,viewport:window.innerWidth,filterRight:sameRow?warehouse.right:0};
}
export interface CandidateSelectProps {
 kind:CandidateKind;value:readonly Selection[]|null;categoryIds:readonly string[];scope:ReadScope;reader:InventoryReader;
 productReader:ProductReadOnlyReader;onChange:(items:readonly Selection[]|null)=>void;onAccessFailure:(error:HttpQueryError)=>void;
}
export function CandidateSelect(p:CandidateSelectProps){return <SourceControl css={p.kind==='product'?productCss:p.kind==='category'?categoryCss:filterCss}>{(portal,host)=><CandidateContent {...p} portal={portal} host={host}/>}</SourceControl>;}
function CandidateContent(p:CandidateSelectProps&{portal:HTMLElement;host:HTMLElement}){
 const [query]=useState(()=>new LatestQuery<CandidateParameters,CandidatePage>({scope:p.scope,execute:r=>p.reader.readCandidates(r)}));
 const state=useSyncExternalStore(query.subscribe,query.getSnapshot,query.getSnapshot);
 const [open,setOpen]=useState(false),[input,setInput]=useState(''),[items,setItems]=useState<readonly Candidate[]>([]);
 const [geometry,setGeometry]=useState<CandidateGeometry>(()=>measureCandidateGeometry(p.host));
 const [loaded,setLoaded]=useState<{signature:string;page:number;total:number}|null>(null);
 const [previewId,setPreviewId]=useState('');
 const refs=useRef(p);refs.current=p;
 const selectionSignature=JSON.stringify((p.value??[]).map(x=>x.id));
 const signature=JSON.stringify([input.trim(),p.categoryIds]);
 const signatureRef=useRef(signature);signatureRef.current=signature;
 const historyKey='inventory-search:'+p.scope.identity.accountId;const [history,setHistory]=useState<string[]>(()=>{try{const rows=JSON.parse(localStorage.getItem(historyKey)??'[]');return Array.isArray(rows)?rows.filter((x):x is string=>typeof x==='string').slice(0,15):[];}catch{return [];}});const paste=useRef<AbortController|null>(null);
 const saveHistory=(rows:string[])=>{setHistory(rows);try{localStorage.setItem(historyKey,JSON.stringify(rows));}catch{}};const notify=(message:string)=>(window as Window&{toast?:(text:string)=>void}).toast?.(message);
 const selectRef=useRef<{focus:()=>void}|null>(null),selectionRequest=useRef<AbortController|null>(null);
 const [selecting,setSelecting]=useState(false);
 useEffect(()=>()=>selectionRequest.current?.abort(),[p.value,signature]);
 useLayoutEffect(()=>{const measure=()=>{const next=measureCandidateGeometry(p.host);setGeometry(current=>current.left===next.left&&current.width===next.width&&current.viewport===next.viewport&&current.filterRight===next.filterRight?current:next);};const ro=new ResizeObserver(measure);ro.observe(p.host);window.addEventListener('resize',measure);measure();return()=>{ro.disconnect();window.removeEventListener('resize',measure);};},[p.host]);
 const run=(page:number)=>query.run({kind:p.kind,search:input.trim(),page,pageSize:20,selectedIds:(refs.current.value??[]).map(x=>x.id),categoryIds:[...p.categoryIds]});
 useEffect(()=>{if(!open||p.kind==='product'&&!input.trim())return;setItems([]);setLoaded(null);const timer=setTimeout(()=>{void run(1);},input.trim()?180:0);return()=>{clearTimeout(timer);query.cancel();};},[open,signature]);
 const mounted=useRef(false);useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;query.cancel();paste.current?.abort();selectionRequest.current?.abort();queueMicrotask(()=>{if(!mounted.current)query.dispose();});};},[query]);
 useEffect(()=>{if(state.phase==='success'&&state.success){const {parameters,data}=state.success;const own=JSON.stringify([parameters.search,parameters.categoryIds]);if(own!==signatureRef.current)return;setItems(previous=>parameters.page===1?data.items:[...new Map([...previous,...data.items].map(item=>[item.id,item])).values()]);setLoaded({signature:own,page:data.page,total:data.exactTotal});}if(state.phase==='error'&&state.error instanceof HttpQueryError&&(state.error.kind==='forbidden'||state.error.kind==='unauthenticated')){refs.current.onAccessFailure(state.error);p.scope.dispose();}},[state]);
 const allLabel=p.kind==='category'?'全部分类':'全部'+labels[p.kind];
 const selected=p.value??[];
 const names=useMemo(()=>new Map([[ALL,allLabel],...items.map(x=>[x.id,x.label] as const),...selected.map(x=>[x.id,x.label] as const)]),[items,p.value,p.kind]);
 const tagLimit=useMemo(()=>{const canvas=document.createElement('canvas').getContext('2d');if(!canvas)return 1;canvas.font='13px Arial';const values=selected.slice(0,3).map(x=>Math.min(canvas.measureText(x.label).width+37,geometry.width-50));for(let n=Math.min(3,selected.length);n>1;n--)if(values.slice(0,n).reduce((a,b)=>a+b,0)+(n-1)*4+(selected.length>n?92:42)<=geometry.width)return n;return 1;},[selectionSignature,geometry.width]);
 const busy=state.phase==='loading';
 const more=()=>{if(query.getSnapshot().phase!=='loading'&&loaded?.signature===signature&&items.length<loaded.total)void run(loaded.page+1);};
 const scroll=(event:React.UIEvent)=>{const el=event.target as HTMLElement;if((el.classList.contains('arco-select-popup-inner')||el.classList.contains('arco-tree'))&&el.scrollHeight-el.scrollTop-el.clientHeight<48)more();};
 const change=(values:unknown)=>{const ids=(Array.isArray(values)?values:[]).map(x=>typeof x==='string'?x:(x as {value:string}).value).filter(x=>x!==ALL);const byId=new Map([...items,...selected].map(x=>[x.id,x]));p.onChange(ids.map(id=>byId.get(id)).filter((x):x is Selection=>!!x).map(x=>({id:x.id,label:p.kind==='product'&&'code'in x&&typeof x.code==='string'?x.code:x.label})));if(p.kind==='product'){const added=ids.filter(id=>!selected.some(x=>x.id===id)).map(id=>items.find(x=>x.id===id)?.code).filter((x):x is string=>!!x);saveHistory([...new Set([...added.reverse(),...history])].slice(0,15));}setInput('');requestAnimationFrame(()=>selectRef.current?.focus());};
 const resolveCodes=async(codes:readonly string[])=>{paste.current?.abort();const own=new AbortController();paste.current=own;const signal=AbortSignal.any([own.signal,p.scope.signal]);const categories=[...p.categoryIds];try{const results=await Promise.all(codes.map(async code=>{let page=1;for(;;){const data=await p.reader.readCandidates({parameters:{kind:'product',search:code,page,pageSize:20,selectedIds:[],categoryIds:categories},signal,identity:p.scope.identity,routeInstanceId:p.scope.routeInstanceId,entityId:null});if(signal.aborted)return null;const matches=data.items.filter(x=>x.code?.toLocaleLowerCase()===code.toLocaleLowerCase());if(matches.length===1)return matches[0]!;if(page*20>=data.exactTotal)return null;page++;}}));if(signal.aborted||JSON.stringify(categories)!==JSON.stringify(refs.current.categoryIds))return;const found=results.filter((x):x is Candidate=>!!x);p.onChange([...new Map([...selected,...found.map(x=>({id:x.id,label:x.code!}))].map(x=>[x.id,x])).values()]);saveHistory([...new Set([...found.map(x=>x.code!).reverse(),...history])].slice(0,15));setInput('');if(found.length<codes.length)notify(`${codes.length-found.length} 个款号未匹配，已跳过`);}catch(e){if(signal.aborted)return;if(e instanceof HttpQueryError&&(e.kind==='forbidden'||e.kind==='unauthenticated')){p.onAccessFailure(e);p.scope.dispose();}else notify('商品读取失败，请重试；当前选择已保留。');}finally{if(paste.current===own)paste.current=null;}};
 const status=<>{state.phase==='error'?<div className="inv-filter-empty" role="alert">读取失败 <button type="button" className="btn ghost" onClick={()=>void run(loaded?loaded.page+1:1)}>重试</button></div>:busy?<div className="inv-filter-empty" role="status">正在读取…</div>:null}</>;
 if(p.kind==='product'){
  const preview=items.find(x=>x.id===previewId)??items[0];
  const availableWidth=Math.max(0,geometry.viewport-geometry.left-12);
  const alignedWidth=geometry.filterRight?geometry.filterRight-geometry.left:0;
  const popupWidth=Math.min(!input.trim()||!items.length?geometry.width:Math.max(geometry.width+308,alignedWidth),availableWidth);
  const listWidth=Math.min(geometry.width,Math.max(250,popupWidth-308));
  return <Select ref={selectRef as never} id="iw-arco-select" className={selected.length?'inv-has-tags':''} aria-label="商品搜索，多选" mode="multiple" showSearch value={selected.map(x=>x.id)} inputValue={input} filterOption={false} size="default" arrowIcon={<IconSearch/>}
   renderTag={({value,closable,onClose})=><Tag className="inv-tag" closable={closable} onClose={onClose}><button type="button" className="inv-tag-copy" title={'点击复制款号 '+(names.get(String(value))??value)} onMouseDown={e=>e.preventDefault()} onClick={e=>{e.stopPropagation();const item=items.find(x=>x.id===value);void navigator.clipboard.writeText(item?.code??names.get(String(value))??String(value)).then(()=>notify('已复制款号'),()=>notify('复制失败，请检查剪贴板权限')); }}>{items.find(x=>x.id===value)?.code??names.get(String(value))??String(value)}</button></Tag>}
   maxTagCount={{count:tagLimit,render:n=><span className="inv-count">+{n} 更多</span>,showPopover:false}} placeholder="商品款号 / 名称 / 系统货号" notFoundContent={<div className="inv-no-result">{busy?'正在读取…':state.phase==='error'?'读取失败':'没有匹配商品，可继续输入'}</div>} getPopupContainer={()=>p.portal} triggerProps={{position:'bl',autoAlignPopupWidth:false,popupStyle:{width:popupWidth}}}
   onInputValueChange={setInput} onChange={values=>{const recent=(values as string[]).find(x=>String(x).startsWith('__recent__'));if(recent){const code=history[Number(recent.slice(10))];if(code)void resolveCodes([code]);return;}change(values);}} onPaste={e=>{const raw=String(e.clipboardData?.getData('text')??'');const codes=[...new Set<string>(raw.split(/[\s,，;；、]+/).filter(Boolean))];if(codes.length>1){e.preventDefault();void resolveCodes(codes);}}} onVisibleChange={visible=>{setOpen(visible);if(!visible)query.cancel();}}
   dropdownRender={menu=>!input.trim()?<div className="inv-history-menu"><div className="inv-menu-heading"><span>最近搜索</span>{history.length>0&&<button type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>saveHistory([])}>清空</button>}</div>{menu}</div>:<div className={preview?'inv-menu-grid':'inv-menu-grid inv-menu-grid-empty'} style={{'--inv-list-width':`${listWidth}px`} as React.CSSProperties}><div className="inv-menu-list" onScrollCapture={scroll}>{items.length>0&&<div className="inv-result-heading"><span>商品款号</span><span>商品名称</span></div>}{menu}{status}</div>{preview&&<ProductCandidatePreview key={preview.id} productId={preview.id} reader={p.productReader} scope={p.scope} portal={p.portal} onAccessFailure={p.onAccessFailure}/>}</div>}>
    {!input.trim()?(history.length?history.map((code,index)=><Select.Option key={code} value={'__recent__'+index}><span className="inv-recent"><span title={code}>{code}</span><button type="button" aria-label={'删除最近搜索 '+code} onMouseDown={e=>{e.preventDefault();e.stopPropagation();}} onClick={e=>{e.stopPropagation();saveHistory(history.filter(x=>x!==code));}}>×</button></span></Select.Option>):<Select.Option value="__recent_empty__" disabled>暂无最近搜索</Select.Option>):items.map(item=><Select.Option key={item.id} value={item.id} disabled={!!item.disabled} onMouseEnter={()=>setPreviewId(item.id)}><span className="inv-option-row"><span className="inv-option-code">{item.code}</span><span className="inv-option-name">{item.name}</span></span></Select.Option>)}
   </Select>;
 }
 type Node={key:string;value:string;title:string;disabled?:boolean;children?:Node[]};
 const nodes:Node[]=items.map(item=>({key:item.id,value:item.id,title:item.label,...(item.disabled?{disabled:true}:{})}));
 const roots:Node[]=[];const byId=new Map(nodes.map(n=>[n.key,n]));
 if(p.kind==='category')for(const item of items){const node=byId.get(item.id)!;if(item.parentId){let parent=byId.get(item.parentId);if(!parent){parent={key:item.parentId,value:item.parentId,title:item.parentLabel??'',disabled:true,children:[]};byId.set(parent.key,parent);roots.push(parent);}parent.children??=[];parent.children.push(node);}else roots.push(node);}
 else roots.push(...nodes);
 const completeCandidates=loaded?.signature===signature&&!input.trim()&&items.length===loaded.total;
 const checked=checkedFilterValues(p.value,items,completeCandidates),allSelected=checked.includes(ALL);
 const choose=async(next:unknown,extra:Parameters<typeof resolveFilterSelection>[3])=>{
  selectionRequest.current?.abort();const own=new AbortController();selectionRequest.current=own;const signal=AbortSignal.any([own.signal,p.scope.signal]);setSelecting(true);
  try{
   const result=await resolveFilterSelection(p.value,items,next,extra,async()=>{
    const result:Candidate[]=[];for(let page=1;;page++){if(signal.aborted)throw new DOMException('已取消','AbortError');const data=await p.reader.readCandidates({parameters:{kind:p.kind,search:'',page,pageSize:20,selectedIds:[],categoryIds:[...p.categoryIds]},signal,identity:p.scope.identity,routeInstanceId:p.scope.routeInstanceId,entityId:null});result.push(...data.items);if(page*20>=data.exactTotal)return result;}
   },completeCandidates);
   if(!signal.aborted&&selectionRequest.current===own){p.onChange(result);setInput('');}
  }catch(e){if(signal.aborted)return;if(e instanceof HttpQueryError&&(e.kind==='forbidden'||e.kind==='unauthenticated')){p.onAccessFailure(e);p.scope.dispose();}else notify('读取完整候选失败，当前选择已保留，请重试。');}
  finally{if(selectionRequest.current===own){selectionRequest.current=null;setSelecting(false);}}
 };
 return <TreeSelect ref={selectRef as never} loading={selecting} allowClear className={allSelected?'inv-all-selected':p.kind==='category'?'inventory-category-tree':''} aria-label={labels[p.kind]+'，多选'} style={{width:'100%'}} treeData={[{key:ALL,value:ALL,title:allLabel},...roots]} treeCheckable multiple treeCheckStrictly treeCheckedStrategy={TreeSelect.SHOW_ALL} showSearch={{retainInputValueWhileSelect:false}} filterTreeNode={()=>true} inputValue={input} onInputValueChange={setInput} value={checked} placeholder={'搜索'+labels[p.kind]} notFoundContent={<div className="inv-filter-empty">没有匹配的{labels[p.kind]}</div>}
  maxTagCount={{count:allSelected?1:tagLimit,render:n=>allSelected?null:<span className="inv-filter-count">+{n} 更多</span>,showPopover:false}} renderFormat={(_,id)=>names.get(typeof id==='string'?id:id.value)??String(id)} getPopupContainer={()=>p.portal} triggerProps={{position:'bl',autoAlignPopupWidth:false,popupStyle:{width:Math.min(Math.max(geometry.width,300),innerWidth-p.host.getBoundingClientRect().left-12)}}}
  onVisibleChange={visible=>{setOpen(visible);if(!visible)query.cancel();}} onChange={(next,extra)=>void choose(next,extra)}
  dropdownRender={menu=><div onScrollCapture={scroll}><div className="inv-filter-tools">{loaded?'匹配 '+loaded.total+' 项':'请选择'} · {allSelected?'全部':`已选 ${selected.length} 项`}</div>{menu}{status}</div>}/>;
}
