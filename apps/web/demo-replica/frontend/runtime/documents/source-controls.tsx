import { useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import DatePicker from '@arco-design/web-react/es/DatePicker';
import Select from '@arco-design/web-react/es/Select';
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
export function SourceSingle(p:{label:string;value:string;items:readonly{value:string;label:string}[];change?:(value:string)=>void;disabled?:boolean}) {
 return <div className="ui-single-host"><SourceControl css={singleCss}>{portal=><Select className="ui-flat-select" aria-label={p.label} value={p.value} options={[...p.items]} disabled={p.disabled??false} showSearch={false} getPopupContainer={()=>portal} {...(p.change?{onChange:p.change}:{})} renderFormat={()=> <span className="ui-single-tag">{p.items.find(x=>x.value===p.value)?.label??p.value}</span>}/>}</SourceControl></div>;
}
const ALL='__sales_filter_all__';
export function SourceMulti(p:{label:string;selected:readonly SalesReference[];items:readonly SalesReference[];change:(selected:readonly SalesReference[])=>void;open?:()=>void;close?:()=>void;search?:(value:string)=>void;footer?:ReactNode;loading?:boolean;allLabel?:string}) {
 const allLabel=p.allLabel??'全部'+p.label;const [text,setText]=useState('');const values=new Map(p.selected.map(x=>[x.id,x]));for(const x of p.items)values.set(x.id,x);
 return <SourceControl css={filterCss}>{(portal,host)=><TreeSelect className={!p.selected.length?'inv-all-selected':''} aria-label={p.label+'，多选'} style={{width:'100%'}} treeData={[{key:ALL,value:ALL,title:allLabel},...[...values.values()].map(x=>({key:x.id,value:x.id,title:x.label}))]} treeCheckable multiple treeCheckStrictly treeCheckedStrategy={TreeSelect.SHOW_ALL} showSearch={{retainInputValueWhileSelect:false}} inputValue={text} onInputValueChange={value=>{setText(value);p.search?.(value);}} filterTreeNode={(input,node)=>p.search?true:String(node.props.title).includes(input)} value={p.selected.length?p.selected.map(x=>x.id):[ALL]} placeholder={'搜索'+p.label} loading={p.loading??false} maxTagCount={{count:1,render:count=><span className="inv-filter-count">+{count} 更多</span>,showPopover:false}} renderFormat={(_,id)=>typeof id==='string'&&id===ALL?allLabel:values.get(typeof id==='string'?id:String(id.value))?.label??''} getPopupContainer={()=>portal} triggerProps={{position:'bl',autoAlignPopupWidth:false,popupStyle:{width:Math.min(Math.max(host.getBoundingClientRect().width,300),Math.max(180,innerWidth-host.getBoundingClientRect().left-12))}}} onVisibleChange={visible=>{if(visible)p.open?.();else p.close?.();}} onChange={(raw,extra)=>{
 const trigger=extra.trigger?._key;
 if(trigger===ALL){p.change([]);return;}
 const ids=(Array.isArray(raw)?raw:[]).map(x=>typeof x==='string'?x:String(x.value)).filter(x=>x!==ALL);
 p.change(ids.flatMap(id=>{const value=values.get(id);return value?[value]:[];}));
 }} dropdownRender={menu=><><div className="inv-filter-tools">已选 {p.selected.length} 项</div>{menu}{p.footer}</>}/>}</SourceControl>;
}
export function SalesReferenceFilter(p:{scope:ReadScope;reader:SalesReferenceReader;kind:SalesReferenceKind;label:string;selected:readonly SalesReference[];change:(value:readonly SalesReference[])=>void;onAccessFailure:(error:HttpQueryError)=>void}) {
 const query=useMemo(()=>new LatestQuery({scope:p.scope,execute:p.reader.readReferences}),[p.scope,p.reader]);
 const state=useSyncExternalStore(query.subscribe,query.getSnapshot,query.getSnapshot),data=state.success?.data;
 useEffect(()=>()=>query.dispose(),[query]);
 useEffect(()=>{if(state.error instanceof HttpQueryError&&['unauthenticated','forbidden'].includes(state.error.kind))p.onAccessFailure(state.error);},[state.error]);
 const run=(search='',page=1)=>void query.run({kind:p.kind,search,page,pageSize:20});
 return <SourceMulti label={p.label} selected={p.selected} items={data?.items??[]} change={p.change} open={()=>run()} close={()=>query.cancel()} search={value=>run(value)} loading={state.phase==='loading'} footer={<>{state.phase==='error'&&<div className="inv-filter-empty" role="alert">候选读取失败 <button className="btn" onMouseDown={e=>e.preventDefault()} onClick={()=>state.request&&void query.run(state.request.parameters)}>重试</button></div>}{data&&BigInt(data.exactTotal)>20n&&<div className="inv-filter-tools"><button className="btn" disabled={data.page===1} onMouseDown={e=>e.preventDefault()} onClick={()=>run(state.success!.parameters.search,data.page-1)}>上一页</button><span>共{data.exactTotal}项</span><button className="btn" disabled={BigInt(data.page)*20n>=BigInt(data.exactTotal)} onMouseDown={e=>e.preventDefault()} onClick={()=>run(state.success!.parameters.search,data.page+1)}>下一页</button></div>}</>}/>;
}
