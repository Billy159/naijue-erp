import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode, type ComponentType } from 'react';
import DatePicker from '@arco-design/web-react/es/DatePicker';
import Select from '@arco-design/web-react/es/Select';
import type {SelectProps} from '@arco-design/web-react/es/Select';
import {ALL_FILTER_VALUE,checkedFilterValues,resolveFilterSelection} from '../inventory/filter-selection.ts';
import TreeSelect from '@arco-design/web-react/es/TreeSelect';
import { SourceControl } from '../inventory/candidates.tsx';
import { dateCss, filterCss, singleCss } from '../inventory/source-control-css.ts';
import { LatestQuery } from '../../../../src/loading/latest-query.ts';
import type { ReadScope } from '../../../../src/loading/read-scope.ts';
import type { SalesReference, SalesReferenceKind, SalesReferenceReader } from '../../../../src/sales/contracts.ts';
import { HttpQueryError } from '../../../../src/transport/http-query.ts';

// Original transfer-date.jsx viewport correction; only this document control uses it.
const documentDateCss=dateCss.replace('#portal .arco-trigger{','#portal .arco-trigger{left:var(--transfer-popup-left)!important;');
interface SourceDateProps{label:string;value:string;change?:(value:string)=>void;required?:boolean;disabled?:boolean}
export function SourceDate(p:SourceDateProps) {
 return <SourceControl css={documentDateCss}>{(portal,host)=><DocumentDateControl {...p} portal={portal} host={host}/>}</SourceControl>;
}
function DocumentDateControl(p:SourceDateProps&{portal:HTMLElement;host:HTMLElement}){
 const align=()=>p.portal.style.setProperty('--transfer-popup-left',Math.max(8,Math.min(p.host.getBoundingClientRect().left,innerWidth-275))+'px');
 useLayoutEffect(()=>{align();p.host.addEventListener('pointerdown',align,true);p.host.addEventListener('focusin',align);return()=>{p.host.removeEventListener('pointerdown',align,true);p.host.removeEventListener('focusin',align);};},[p.portal,p.host]);
 return <DatePicker value={p.value} format="YYYY-MM-DD" placeholder={p.label} aria-label={p.label} allowClear={!p.required} disabled={p.disabled??false} getPopupContainer={()=>p.portal} onVisibleChange={align} {...(p.change?{onChange:(value:string|string[])=>p.change!(typeof value==='string'?value:'')}:{})}/>;
}
const ClearableSelect=Select as unknown as ComponentType<Omit<SelectProps,'value'>&{value:SelectProps['value']|undefined}>;
export function SourceSingle(p:{label:string;value:string;items:readonly{value:string;label:string}[];change?:(value:string)=>void;disabled?:boolean;clearable?:boolean}) {
 return <div className="ui-single-host"><SourceControl css={singleCss}>{portal=><ClearableSelect className="ui-flat-select" aria-label={p.label} value={p.value||undefined} placeholder={'请选择'+p.label} options={[...p.items]} disabled={p.disabled??false} allowClear={p.clearable??!!p.change} showSearch={false} getPopupContainer={()=>portal} {...(p.change?{onChange:(value:unknown)=>p.change!(typeof value==='string'?value:'')}:{})} renderFormat={()=> <span className="ui-single-tag">{p.items.find(x=>x.value===p.value)?.label??p.value}</span>}/>}</SourceControl></div>;
}
export function SourceMulti(p:{label:string;selected:readonly SalesReference[];items:readonly SalesReference[];change:(selected:readonly SalesReference[])=>void;open?:()=>void;close?:()=>void;search?:(value:string)=>void;footer?:ReactNode;loading?:boolean;allLabel?:string;loadAll?:()=>Promise<readonly SalesReference[]>;itemsComplete?:boolean;failure?:(error:unknown)=>void}) {
 const allLabel=p.allLabel??'全部'+p.label,[text,setText]=useState(''),[pending,setPending]=useState(false),[error,setError]=useState(''),sequence=useRef(0);
 const selectionKey=JSON.stringify(p.selected.map(item=>item.id));useEffect(()=>{sequence.current++;setPending(false);},[selectionKey]);useEffect(()=>()=>{sequence.current++;},[]);
 const values=new Map(p.selected.map(x=>[x.id,x]));for(const x of p.items)values.set(x.id,x);
 const complete=p.itemsComplete??!p.search,value=p.selected.length?p.selected:null,choices=[...values.values()];
 return <SourceControl css={filterCss}>{(portal,host)=><TreeSelect className={!p.selected.length?'inv-all-selected':''} aria-label={p.label+'，多选'} style={{width:'100%'}} treeData={[{key:ALL_FILTER_VALUE,value:ALL_FILTER_VALUE,title:allLabel},...choices.map(x=>({key:x.id,value:x.id,title:x.label}))]} treeCheckable multiple treeCheckStrictly treeCheckedStrategy={TreeSelect.SHOW_ALL} showSearch={{retainInputValueWhileSelect:false}} inputValue={text} onInputValueChange={value=>{setText(value);p.search?.(value);}} filterTreeNode={(input,node)=>p.search?true:String(node.props.title).includes(input)} value={checkedFilterValues(value,choices,complete)} placeholder={'搜索'+p.label} allowClear onClear={()=>p.change([])} disabled={pending} loading={pending||p.loading===true} maxTagCount={{count:1,render:count=>!p.selected.length?null:<span className="inv-filter-count">+{count} 更多</span>,showPopover:false}} renderFormat={(_,id)=>typeof id==='string'&&id===ALL_FILTER_VALUE?allLabel:values.get(typeof id==='string'?id:String(id.value))?.label??''} getPopupContainer={()=>portal} triggerProps={{position:'bl',autoAlignPopupWidth:false,popupStyle:{width:Math.min(Math.max(host.getBoundingClientRect().width,300),Math.max(180,innerWidth-host.getBoundingClientRect().left-12))}}} onVisibleChange={visible=>{if(visible)p.open?.();else p.close?.();}} onChange={(raw,extra)=>{
  const own=++sequence.current;setError('');setPending(true);
  void resolveFilterSelection(value,choices,raw,extra,p.loadAll??(()=>complete?Promise.resolve(p.items):Promise.reject(new Error('Incomplete document filter candidates'))),complete).then(next=>{if(own===sequence.current){setPending(false);p.change(next??[]);}},error=>{if(own===sequence.current){p.failure?.(error);setPending(false);setError('完整筛选项读取失败，原选择已保留。');}}).finally(()=>{if(own===sequence.current)setPending(false);});
 }} dropdownRender={menu=><><div className="inv-filter-tools">{p.selected.length?'已选 '+p.selected.length+' 项':allLabel}</div>{menu}{error&&<p role="alert">{error}</p>}{p.footer}</>}/>}</SourceControl>;
}
export function SalesReferenceFilter(p:{scope:ReadScope;reader:SalesReferenceReader;kind:SalesReferenceKind;label:string;selected:readonly SalesReference[];change:(value:readonly SalesReference[])=>void;onAccessFailure:(error:HttpQueryError)=>void}) {
 const query=useMemo(()=>new LatestQuery({scope:p.scope,execute:p.reader.readReferences}),[p.scope,p.reader]);
 const state=useSyncExternalStore(query.subscribe,query.getSnapshot,query.getSnapshot),data=state.success?.data;
 useEffect(()=>()=>query.dispose(),[query]);
 useEffect(()=>{if(state.error instanceof HttpQueryError&&['unauthenticated','forbidden'].includes(state.error.kind))p.onAccessFailure(state.error);},[state.error]);
 const run=(search='',page=1)=>void query.run({kind:p.kind,search,page,pageSize:20});
 const loadAll=async()=>{const items:SalesReference[]=[];let total:string|null=null;for(let page=1;;page++){const data=await p.reader.readReferences({parameters:{kind:p.kind,search:'',page,pageSize:20},signal:p.scope.signal,identity:p.scope.identity,routeInstanceId:p.scope.routeInstanceId,entityId:null});if(!p.scope.active)throw Error('Retired filter');if(total!==null&&total!==data.exactTotal)throw Error('Filter changed');total=data.exactTotal;items.push(...data.items);if(BigInt(page)*20n>=BigInt(total)){if(BigInt(items.length)!==BigInt(total)||new Set(items.map(row=>row.id)).size!==items.length)throw Error('Incomplete filter candidates');return items;}}};
 return <SourceMulti failure={error=>{if(error instanceof HttpQueryError&&['unauthenticated','forbidden'].includes(error.kind))p.onAccessFailure(error);}} loadAll={loadAll} label={p.label} selected={p.selected} items={data?.items??[]} change={p.change} open={()=>run()} close={()=>query.cancel()} search={value=>run(value)} loading={state.phase==='loading'} footer={<>{state.phase==='error'&&<div className="inv-filter-empty" role="alert">候选读取失败 <button className="btn" onMouseDown={e=>e.preventDefault()} onClick={()=>state.request&&void query.run(state.request.parameters)}>重试</button></div>}{data&&BigInt(data.exactTotal)>20n&&<div className="inv-filter-tools"><button className="btn" disabled={data.page===1} onMouseDown={e=>e.preventDefault()} onClick={()=>run(state.success!.parameters.search,data.page-1)}>上一页</button><span>共{data.exactTotal}项</span><button className="btn" disabled={BigInt(data.page)*20n>=BigInt(data.exactTotal)} onMouseDown={e=>e.preventDefault()} onClick={()=>run(state.success!.parameters.search,data.page+1)}>下一页</button></div>}</>}/>;
}
