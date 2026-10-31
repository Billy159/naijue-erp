import { Button, Select } from '@arco-design/web-react';
import { useEffect, useReducer, useState, useSyncExternalStore } from 'react';
import { LatestQuery, type QuerySnapshot } from '../../../../src/loading/latest-query.ts';
import type { ReadScope } from '../../../../src/loading/read-scope.ts';
import type { SettingsDirectoryPage, SettingsDirectoryParameters, SettingsDirectoryReader, SettingsReference } from '../../../../src/settings/stores/maintenance-contracts.ts';
import { readMessage, settingsSingleCss } from './controls.tsx';
import { SourceControl } from '../common/ui/source-control.tsx';
import './payment-halls.css';
const idle=Object.freeze({phase:'idle' as const,request:null,success:null,error:null}),noSubscribe=()=>()=>{};
/** The approved fund-account multi-hall field; all selected native references survive paging. */
type Props={scope:ReadScope;reader:SettingsDirectoryReader|undefined;selected:readonly SettingsReference[];disabled:boolean;onChange:(halls:readonly SettingsReference[])=>void};
const controlCss=settingsSingleCss+'.arco-select.arco-select-multiple .arco-select-view{height:auto;max-height:none;min-height:32px}';
export default function PaymentHalls(props:Props){return <SourceControl css={controlCss} attributes={{className:"bs-multi runtime-payment-halls"}}>{(portal,host)=><PaymentHallsBody {...props} portal={portal} host={host}/>}</SourceControl>;}
function PaymentHallsBody(props:Props & {portal:HTMLElement;host:HTMLElement}){
 const [binding,setBinding]=useState<{scope:ReadScope;reader:SettingsDirectoryReader;query:LatestQuery<SettingsDirectoryParameters,SettingsDirectoryPage>}|null>(null);
 useEffect(()=>{if(!props.reader){setBinding(null);return;}const reader=props.reader,query=new LatestQuery<SettingsDirectoryParameters,SettingsDirectoryPage>({scope:props.scope,execute:read=>reader.read('halls',read.parameters,read.signal)});setBinding({scope:props.scope,reader,query});return()=>query.dispose();},[props.scope,props.reader]);
 const query=binding?.scope===props.scope&&binding.reader===props.reader?binding.query:null,state=useSyncExternalStore<QuerySnapshot<SettingsDirectoryParameters,SettingsDirectoryPage>>(query?.subscribe??noSubscribe,query?.getSnapshot??(()=>idle),query?.getSnapshot??(()=>idle));
 const [open,setOpen]=useState(false),[mounted,setMounted]=useState(false),[,refreshPortal]=useReducer(value=>value+1,0);
 useEffect(()=>{setMounted(true);},[]);useEffect(()=>{if(props.disabled)setOpen(false);},[props.disabled]);useEffect(()=>{if(!open||!mounted||props.disabled)return;let active=true;queueMicrotask(()=>{if(active)refreshPortal();});return()=>{active=false;};},[open,mounted,props.disabled]);
 const current=state.phase==='success'?state.success:null,selected=new Map(props.selected.map(hall=>[hall.id,hall])),options=new Map(selected);for(const hall of current?.data.items??[])options.set(hall.id,hall);
 const run=(search='',page=1)=>{if(!props.disabled)void query?.run({search,page,pageSize:20,hallId:null});};
 return <Select mode="multiple" aria-label="适用营业厅" value={props.selected.map(hall=>hall.id)} options={[...options.values()].map(hall=>({value:hall.id,label:hall.name??'名称未提供'}))} placeholder="请选择营业厅" showSearch filterOption={false} allowClear disabled={props.disabled||(!query&&props.selected.length===0)} loading={state.phase==='loading'} popupVisible={mounted&&open&&!props.disabled&&!!query} unmountOnExit getPopupContainer={()=>props.portal} triggerProps={{position:'bl'}}
 onVisibleChange={visible=>{setOpen(visible);if(visible)run();else query?.cancel();}} onSearch={search=>{if(open)run(search);}}
 onChange={(value:unknown)=>{if(props.disabled||!Array.isArray(value)||value.some(id=>typeof id!=='string')||new Set(value).size!==value.length)return;const currentIds=new Set(current?.data.items.map(hall=>hall.id)??[]);if(value.some(id=>!selected.has(id)&&!currentIds.has(id)))return;props.onChange(value.map(id=>options.get(id)!).filter(Boolean));}}
 dropdownRender={menu=><>{menu}{state.phase==='error'&&<div className="runtime-settings-directory" role="alert">{readMessage(state.error)}<Button onMouseDown={e=>e.preventDefault()} onClick={()=>{if(state.request)void query?.run(state.request.parameters);}}>重试</Button></div>}{current&&current.data.total>current.data.pageSize&&<div className="runtime-settings-directory"><Button size="mini" disabled={current.data.page<=1} onMouseDown={e=>e.preventDefault()} onClick={()=>run(current.parameters.search,current.data.page-1)}>上一页</Button><span>共 {current.data.total} 条</span><Button size="mini" disabled={current.data.page*current.data.pageSize>=current.data.total} onMouseDown={e=>e.preventDefault()} onClick={()=>run(current.parameters.search,current.data.page+1)}>下一页</Button></div>}</>}/>;
}
