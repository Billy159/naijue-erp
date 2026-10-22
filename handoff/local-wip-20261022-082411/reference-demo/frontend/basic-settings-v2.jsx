/* Basic settings composes the inventory controls, pagination and shared density. */
import React, {useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import Input from '@arco-design/web-react/es/Input';
import Button from '@arco-design/web-react/es/Button';
import Table from '@arco-design/web-react/es/Table';
import Tag from '@arco-design/web-react/es/Tag';
import Modal from '@arco-design/web-react/es/Modal';
import Drawer from '@arco-design/web-react/es/Drawer';
import Checkbox from '@arco-design/web-react/es/Checkbox';
import Switch from '@arco-design/web-react/es/Switch';
import DatePicker from '@arco-design/web-react/es/DatePicker';
import Empty from '@arco-design/web-react/es/Empty';
import IconSearch from '@arco-design/web-react/icon/react-icon/IconSearch';
import arcoCss from '@arco-design/web-react/dist/css/arco.css?inline';
import settingsCss from './basic-settings-v2.css?inline';
import './topbar-account.jsx';

const M=window.MASTER_DATA;
const names={stores:'营业厅',warehouses:'仓库',parties:'往来单位',staff:'员工',payments:'收款方式',fundAccounts:'资金账户'};
const group={stores:['stores','warehouses'],parties:['parties'],staff:['staff'],payments:['payments','fundAccounts']};
const titles={stores:'营业厅与仓库',parties:'往来单位',staff:'员工与账号',payments:'收款配置'};
const defaultFilter=()=>({q:'',status:'normal',storeId:'',tags:[],role:'',employmentStatus:'在职',loginStatus:'',methodId:''});
const cache=Object.fromEntries(Object.keys(names).map(type=>[type,{draft:defaultFilter(),applied:defaultFilter(),page:1,size:20,resetKey:0}]));
const storageState={stores:window.BASIC_SETTINGS_INITIAL_TAB==='warehouses'?'warehouses':'stores',payments:window.BASIC_SETTINGS_INITIAL_TAB==='fundAccounts'?'fundAccounts':'payments'};
for(const contents of [arcoCss,settingsCss]){const style=document.createElement('style');style.textContent=contents;document.head.append(style)}
const rows=type=>M.data[type]||[];
const item=(type,id)=>rows(type).find(x=>x.id===id);
const label=(type,id)=>item(type,id)?.name||'';
const active=(type,x)=>M.isActive(type,x);
const options=list=>list.map(x=>({label:x.name,value:x.id}));
const msg=value=>window.toast?.(value);

// The very same Arco single Select used by inventory pagination and document fields.
function SmallSelect({value,onChange,items,placeholder,search=false,clear=false,disabled=false,label:ariaLabel}){
 const host=useRef(),callback=useRef(onChange);callback.current=onChange;
 useLayoutEffect(()=>{window.UNIFIED_SINGLE_SELECT.mount(host.current,{value:value||undefined,items,label:ariaLabel||placeholder,
  placeholder,showSearch:search,allowClear:clear,disabled,flatValue:true,onChange:value=>callback.current(value)});});
 useEffect(()=>{const node=host.current;return()=>queueMicrotask(()=>window.UNIFIED_SINGLE_SELECT.unmount(node))},[]);
 return <div ref={host} className="ui-single-host bs-single"/>;
}
function TagFilter({value,onChange}){
 const host=useRef(),callback=useRef(onChange);callback.current=onChange;
 useLayoutEffect(()=>{
  const node=host.current;
  window.INVENTORY_FILTERS.mountBasic('tags',node,{
   snapshot:()=>({items:[{id:'customer',name:'客户'},{id:'supplier',name:'供应商'}],selected:value,defaultAll:!value.length,label:'标签',ariaLabel:'标签'}),
   setSelected:(_,ids)=>callback.current(!ids||ids.length===2?[]:ids),
  });
  return()=>queueMicrotask(()=>window.INVENTORY_FILTERS.unmount(node));
 },[]);
 return <div ref={host} className="bs-multi"/>;
}
function Status({type,row}){const text=type==='staff'?row.employmentStatus||'在职':active(type,row)?'正常':'已停用';return <Tag className={'iw-status '+(text==='正常'||text==='在职'?'normal':'off')}>{text}</Tag>}
function Filters({type,filter,onDraft,apply,reset,resetKey}){
 const fields=[];
 const input=placeholder=>fields.push(<div className="bs-filter search" key="q"><Input className="iw-arco-input iw-search-input" size="default" aria-label={placeholder} value={filter.q} onChange={v=>onDraft('q',v)} placeholder={placeholder} suffix={<IconSearch/>} allowClear/></div>);
 const select=(key,placeholder,choices,search=false)=>fields.push(<div className="bs-filter" key={key}><SmallSelect value={filter[key]} onChange={v=>onDraft(key,v||'')} items={choices} placeholder={placeholder} search={search} clear={!['status','employmentStatus','loginStatus','role'].includes(key)}/></div>);
 const state=[{label:'正常',value:'normal'},{label:'已停用',value:'disabled'},{label:'全部',value:'all'}];
 if(type==='stores'){input('搜索营业厅名称');select('status','状态',state)}
 if(type==='warehouses'){input('搜索仓库名称');select('storeId','全部营业厅',options(rows('stores')),true);select('status','状态',state)}
 if(type==='parties'){input('搜索名称或编码');fields.push(<div className="bs-filter" key="tags"><TagFilter key={resetKey} value={filter.tags} onChange={v=>onDraft('tags',v)}/></div>);select('status','状态',state)}
 if(type==='staff'){input('搜索姓名或登录账号');select('role','全部角色',[{label:'全部角色',value:''},...M.roles.map(x=>({label:x,value:x}))]);select('storeId','全部营业厅',options(rows('stores')),true);select('employmentStatus','员工状态',[{label:'在职',value:'在职'},{label:'离职',value:'离职'},{label:'全部',value:'all'}]);select('loginStatus','全部登录权限',[{label:'全部',value:''},{label:'已开通',value:'open'},{label:'已关闭',value:'closed'}])}
 if(type==='payments'){input('搜索收款方式');select('status','状态',state)}
 if(type==='fundAccounts'){input('搜索账户名称');select('methodId','全部收款方式',options(rows('payments').filter(x=>!x.legacyOnly)),true);select('status','状态',state)}
 return <div className="bs-toolbar"><div className="bs-filter-fields">{fields}</div><div className="bs-toolbar-actions iw-query-actions"><Button className="btn primary" type="primary" onClick={apply}>查询</Button><Button className="btn iw-reset" onClick={reset}>重置</Button></div></div>;
}
function matched(type,filter){const q=filter.q.trim().toLocaleLowerCase();return rows(type).filter(x=>!x.legacyOnly&&(!q||[x.name,x.code,x.loginName].join(' ').toLocaleLowerCase().includes(q))&&
 (type==='staff'?(filter.employmentStatus==='all'||x.employmentStatus===filter.employmentStatus)&&(!filter.loginStatus||!!x.loginEnabled===(filter.loginStatus==='open')):(filter.status==='all'||active(type,x)===(filter.status==='normal')))&&
 (!filter.storeId||x.storeId===filter.storeId)&&(!filter.role||x.role===filter.role)&&(!filter.methodId||(x.methodIds||[]).includes(filter.methodId))&&
 (!filter.tags?.length||filter.tags.some(tag=>(x.tags||x.usage||[]).includes(tag))));}
function Field({title,required=false,children}){return <div className="bs-field iw-form-field" role="group" aria-label={title}><span>{title}{required&&<i> *</i>}</span>{children}</div>}
function Readonly({title,children}){return <Field title={title}><div className="bs-readonly">{children}</div></Field>}
function Fields({type,form,setForm,editing,hadAccount}){
 const update=(key,value)=>setForm(v=>({...v,[key]:value}));
 const text=(key,title,required=false)=><Field key={key} title={title} required={required}><Input className="iw-arco-input" aria-label={title} value={form[key]||''} onChange={v=>update(key,v)} autoComplete="off"/></Field>;
 const select=(key,title,choices,{search=true,clear=true,required=false}={})=>{
  const source={storeId:'stores',defaultCustomerId:'parties',defaultWarehouseId:'warehouses'}[key],past=form[key]&&source?item(source,form[key]):null;
  const candidates=past&&!choices.some(x=>x.value===form[key])?[{label:past.name,value:form[key],disabled:true},...choices]:choices;
  return <Field key={key} title={title} required={required}><SmallSelect value={form[key]} onChange={v=>update(key,v||'')} items={candidates} label={title} placeholder="请选择" search={search} clear={clear&&!required}/></Field>;
 };
 const fields=[text('name',type==='staff'?'姓名':type==='fundAccounts'?'账户名称':'名称',true)];
 if(type==='stores')fields.push(select('defaultCustomerId','默认零售客户',options(M.selectable('parties').filter(x=>(x.usage||[]).includes('customer')))),select('defaultWarehouseId','默认出库仓',options([...M.selectable('warehouses')].sort((a,b)=>Number(b.storeId===form.id)-Number(a.storeId===form.id)))));
 if(type==='warehouses')fields.push(select('storeId','所属营业厅',options(M.selectable('stores')),{required:true}));
 if(type==='parties')fields.push(<Field title="标签" key="tags"><div className="bs-checks">{[['customer','客户'],['supplier','供应商']].map(([id,title])=><Checkbox key={id} checked={(form.tags||[]).includes(id)} onChange={checked=>update('tags',checked?[...new Set([...(form.tags||[]),id])]:(form.tags||[]).filter(x=>x!==id))}>{title}</Checkbox>)}</div></Field>,<Readonly title="编码" key="code">{editing?form.code||'':'保存后生成'}</Readonly>);
 if(type==='staff'){
  fields.push(select('role','角色',M.roles.map(x=>({label:x,value:x})),{search:false,required:true}),select('storeId','所属营业厅',options(M.selectable('stores')),{required:form.role==='营业员'}),text('phone','联系方式'));
  if(!editing)fields.push(<div className="bs-wide" key="account"><Checkbox checked={form.loginEnabled!==false} onChange={checked=>setForm(v=>({...v,loginEnabled:checked,loginName:checked?v.loginName:'',password:checked?v.password:''}))}>同步开通登录账号</Checkbox></div>);
  if(editing&&!hadAccount&&!form.loginEnabled)fields.push(<Readonly key="loginName" title="登录账号">未开通</Readonly>);
  if(hadAccount||form.loginEnabled)fields.push(text('loginName','登录账号',true));
  if(!hadAccount&&form.loginEnabled)fields.push(<Field key="password" title="初始密码" required><Input.Password className="iw-arco-input" aria-label="初始密码" value={form.password||''} onChange={v=>update('password',v)} autoComplete="new-password"/></Field>);
  if(editing&&hadAccount)fields.push(<Field key="newPassword" title="重置密码"><Input.Password className="iw-arco-input" aria-label="重置密码" value={form.password||''} onChange={v=>update('password',v)} placeholder="留空保留原密码" autoComplete="new-password"/></Field>);
  if(editing)fields.push(<Field key="loginEnabled" title="登录权限"><div className="bs-switch"><Switch aria-label="登录权限" checked={!!form.loginEnabled} disabled={form.employmentStatus==='离职'} onChange={v=>update('loginEnabled',v)}/><span>{form.loginEnabled?'已开通':'已关闭'}</span></div></Field>);
 }
 if(type==='fundAccounts')fields.push(editing?<Readonly key="method" title="所属收款方式">{(form.methodIds||[]).map(id=>label('payments',id)).filter(Boolean).join('、')}</Readonly>:select('primaryMethodId','所属收款方式',options(M.selectable('payments')),{required:true}));
 if(editing&&type!=='staff')fields.push(<Field key="enabled" title="使用状态"><div className="bs-switch"><Switch aria-label="使用状态" checked={form.enabled!==false} onChange={v=>update('enabled',v)}/><span>{form.enabled!==false?'正常':'已停用'}</span></div></Field>);
 return <div className={'bs-form-fields iw-form-fields'+(type==='staff'?' bs-staff-fields':'')}>{fields}</div>;
}

// Render and route events from the existing inventory pager; no second pagination implementation.
function Pager({count,page,size,onPage,onSize,id='bs-list'}){
 const host=useRef(),handlers=useRef();handlers.current={onPage,onSize,page,size,count};
 useLayoutEffect(()=>{
  const node=host.current;
  node.innerHTML=window.INVENTORY_PAGER.render({page,size,total:count,sizes:[20,50,100],unit:'条',selectAria:'每页数量',
   selectId:id+'-size',jumpId:id+'-jump',pageAction:'page',prevAction:'prev',nextAction:'next',jumpAction:'jump',
   button:(text,action,attrs='',cls='')=>`<button type="button" class="btn ${cls}" data-bs-page="${action}" ${attrs}>${text}</button>`});
  window.UNIFIED_SINGLE_SELECT.mountAll();
 },[count,page,size,id]);
 useEffect(()=>{
  const node=host.current;
  const click=event=>{const button=event.target.closest('[data-bs-page]');if(!button||!node.contains(button)||button.disabled)return;
   const h=handlers.current,action=button.dataset.bsPage,pages=Math.max(1,Math.ceil(h.count/h.size));
   const next=action==='prev'?h.page-1:action==='next'?h.page+1:action==='jump'?Number(node.querySelector('#'+id+'-jump')?.value):Number(button.dataset.page);
   if(Number.isInteger(next)&&next>=1&&next<=pages)h.onPage(next);
  };
  const change=event=>{if(event.target.id===id+'-size')handlers.current.onSize(Number(event.target.value))};
  const key=event=>{if(event.key==='Enter'&&event.target.id===id+'-jump'){event.preventDefault();node.querySelector('[data-bs-page=jump]')?.click()}};
  node.addEventListener('click',click);node.addEventListener('change',change);node.addEventListener('keydown',key);
  return()=>{node.removeEventListener('click',click);node.removeEventListener('change',change);node.removeEventListener('keydown',key)};
 },[id]);
 return <div ref={host} className="bs-pager"/>;
}
const auditFields={name:'名称',code:'编码',enabled:'状态',employmentStatus:'员工状态',loginEnabled:'登录权限',role:'角色',storeId:'所属营业厅',loginName:'登录账号',phone:'联系方式',defaultCustomerId:'默认零售客户',defaultWarehouseId:'默认出库仓',tags:'标签',usage:'标签',methodIds:'所属收款方式',credential:'密码'};
const auditAction=action=>({'员工离职':'办理离职','员工恢复':'恢复在职'})[action]||action;
function auditValue(field,value){if(value==null||value==='')return '空';if(field==='credential')return typeof value==='string'?value:'已设置';if(field==='enabled')return value?'正常':'已停用';if(field==='loginEnabled')return value?'已开通':'已关闭';if(field==='tags'||field==='usage')return (value||[]).map(x=>x==='customer'?'客户':x==='supplier'?'供应商':x).join('、')||'空';if(field==='methodIds')return (value||[]).map(x=>label('payments',x)||x).join('、')||'空';const source={storeId:'stores',defaultCustomerId:'parties',defaultWarehouseId:'warehouses'}[field];return source?label(source,value)||String(value):String(value)}
function LogDrawer({visible,onClose,refresh}){
 const blank={module:'',object:'',actor:'',action:'',start:'',end:''};
 const [draft,setDraft]=useState(blank),[applied,setApplied]=useState(blank),[page,setPage]=useState(1),[size,setSize]=useState(20);
 const set=(key,value)=>setDraft(v=>({...v,[key]:value||''}));
 const records=useMemo(()=>(M.data.audit||[]).slice().reverse().filter(x=>{
  const f=applied;return (!f.module||x.type===f.module)&&(!f.object||[x.object,x.target].join(' ').toLocaleLowerCase().includes(f.object.toLocaleLowerCase()))&&(!f.actor||String(x.actor||'').includes(f.actor))&&(!f.action||auditAction(x.action)===f.action)&&(!f.start||x.time?.slice(0,10)>=f.start)&&(!f.end||x.time?.slice(0,10)<=f.end);
 }).map(x=>({...x,module:names[x.type]||({'员工与账号':'员工'})[x.module]||x.module,action:auditAction(x.action),changes:(x.changes||[]).filter(c=>typeof c==='string'||c.field!=='ownershipPending')})),[applied,refresh]);
 const current=Math.min(page,Math.max(1,Math.ceil(records.length/size)));
 const columns=[{title:'时间',dataIndex:'time',width:158,render:v=>new Date(v).toLocaleString('zh-CN')},{title:'操作人',dataIndex:'actor',width:90},{title:'模块',dataIndex:'module',width:92},{title:'对象',dataIndex:'object',width:145},{title:'操作',dataIndex:'action',width:98},{title:'变化字段',dataIndex:'changes',render:value=>(value||[]).map((c,i)=>typeof c==='string'?<div key={i}>{c}</div>:<div key={i}>{auditFields[c.field]||c.field}：{auditValue(c.field,c.before)} → {auditValue(c.field,c.after)}</div>)}];
 return <Drawer visible={visible} width={1040} title="基础设置操作记录" onCancel={onClose} maskClosable={false} className="bs-audit-drawer iw-arco-controls"
  footer={<Pager id="bs-log" count={records.length} page={current} size={size} onPage={setPage} onSize={v=>{setSize(v);setPage(1)}}/>}>
  <div className="bs-log-filters"><SmallSelect value={draft.module} onChange={v=>set('module',v)} items={Object.entries(names).map(([value,label])=>({value,label}))} placeholder="全部模块" clear/>
   <Input className="iw-arco-input" aria-label="数据对象" value={draft.object} onChange={v=>set('object',v)} placeholder="数据对象" allowClear/><Input className="iw-arco-input" aria-label="操作人" value={draft.actor} onChange={v=>set('actor',v)} placeholder="操作人" allowClear/>
   <SmallSelect value={draft.action} onChange={v=>set('action',v)} items={['新增','修改','停用','恢复使用','办理离职','恢复在职','登录账号关闭','登录账号恢复','重置密码','修改本人密码'].map(value=>({value,label:value}))} placeholder="全部操作" clear/>
   <DatePicker aria-label="开始日期" value={draft.start||undefined} onChange={v=>set('start',v)} placeholder="开始日期"/><DatePicker aria-label="结束日期" value={draft.end||undefined} onChange={v=>set('end',v)} placeholder="结束日期"/>
   <div className="bs-toolbar-actions bs-log-actions"><Button type="primary" onClick={()=>{setApplied({...draft});setPage(1)}}>查询</Button><Button onClick={()=>{setDraft(blank);setApplied(blank);setPage(1)}}>重置</Button></div></div>
  <div className="bs-log-results iw-arco-table"><Table size="small" rowKey="_key" columns={columns} data={records.slice((current-1)*size,current*size).map((x,i)=>({...x,_key:`${x.time}:${x.target}:${(current-1)*size+i}`}))} pagination={false} noDataElement={<Empty description="暂无操作记录"/>}/></div>
 </Drawer>;
}
function App({route}){
 const rootType=route.split('/')[1]||'stores';
 const [type,setType]=useState(group[rootType]?.includes(storageState[rootType])?storageState[rootType]:rootType);
 const [revision,setRevision]=useState(0),[modal,setModal]=useState(null),[form,setForm]=useState({}),[error,setError]=useState(''),[saving,setSaving]=useState(false),[logOpen,setLogOpen]=useState(false),[confirm,setConfirm]=useState(null);
 const f=cache[type];const rerender=()=>setRevision(x=>x+1);
 useEffect(()=>{setType(group[rootType]?.includes(storageState[rootType])?storageState[rootType]:rootType)},[rootType]);
 useEffect(()=>{M.refreshWarehouseStocks?.().then(rerender).catch(()=>{})},[]);
 const results=useMemo(()=>matched(type,f.applied),[type,revision]);f.page=Math.min(f.page,Math.max(1,Math.ceil(results.length/f.size)));
 const view=results.slice((f.page-1)*f.size,f.page*f.size);
 const updateDraft=(key,value)=>{f.draft={...f.draft,[key]:value};rerender()};
 const apply=()=>{f.applied={...f.draft};f.page=1;rerender()};
 const reset=()=>{f.draft=defaultFilter();f.applied=defaultFilter();f.page=1;f.resetKey++;rerender()};
 const open=(row=null)=>{const initial=row?structuredClone(row):{name:'',enabled:true};
  if(type==='parties')initial.tags=row?[...(row.tags||row.usage||[])].filter(x=>['customer','supplier'].includes(x)):[];
  if(type==='staff'&&!row)Object.assign(initial,{role:'',storeId:'',employmentStatus:'在职',loginEnabled:true,loginName:'',password:''});
  if(type==='fundAccounts')initial.primaryMethodId=row?.methodIds?.[0]||'';
  setModal({type,editing:!!row,hadAccount:!!row?.loginName,baseRevision:M.data.revision});setForm(initial);setError('');
 };
 const save=async()=>{const value=structuredClone(form),password=value.password||'';delete value.password;
  if(modal.type==='fundAccounts'){value.methodIds=modal.editing?form.methodIds:[value.primaryMethodId].filter(Boolean);delete value.primaryMethodId}
  setSaving(true);let result;try{result=await M.save(modal.type,value,{password,baseRevision:modal.baseRevision})}catch(e){result={ok:false,error:e.message}}setSaving(false);
  if(!result.ok){setError(result.error);return}setModal(null);setError('');M.sync();if(!M.routeAllowed(location.hash.slice(1))){history.replaceState(null,'','#'+M.landing());window.render();return}rerender();msg('资料已保存');
 };
 const changeEmployment=async()=>{const request=confirm;const result=await M.setStatus('staff',request.id,'employmentStatus',request.next,{baseRevision:request.baseRevision});if(!result.ok){setError(result.error);setConfirm({...request,blocked:true});return}setConfirm(null);M.sync();rerender();msg('员工状态已更新')};
 const actionColumn={title:'操作',width:type==='staff'?158:76,render:(_,row)=><div className="bs-row-actions"><Button type="text" size="small" onClick={()=>open(row)}>编辑</Button>{type==='staff'&&<Button type="text" size="small" onClick={()=>{setError('');setConfirm({id:row.id,name:row.name,next:row.employmentStatus==='离职'?'在职':'离职',baseRevision:M.data.revision})}}>{row.employmentStatus==='离职'?'恢复在职':'办理离职'}</Button>}</div>};
 const columns={
  stores:[{title:'名称',dataIndex:'name'},{title:'默认零售客户',render:(_,r)=>label('parties',r.defaultCustomerId)},{title:'默认出库仓',render:(_,r)=>label('warehouses',r.defaultWarehouseId)},{title:'状态',width:100,render:(_,r)=><Status type={type} row={r}/>},actionColumn],
  warehouses:[{title:'仓库名称',dataIndex:'name'},{title:'所属营业厅',render:(_,r)=>label('stores',r.storeId)},{title:'状态',width:100,render:(_,r)=><Status type={type} row={r}/>},actionColumn],
  parties:[{title:'名称',dataIndex:'name'},{title:'编码',dataIndex:'code'},{title:'标签',render:(_,r)=>(r.tags||r.usage||[]).filter(x=>['customer','supplier'].includes(x)).map(x=>x==='customer'?'客户':'供应商').join('、')},{title:'状态',width:100,render:(_,r)=><Status type={type} row={r}/>},actionColumn],
  staff:[{title:'姓名',dataIndex:'name'},{title:'登录账号',dataIndex:'loginName'},{title:'角色',render:(_,r)=>r.role||'未配置'},{title:'所属营业厅',render:(_,r)=>label('stores',r.storeId)},{title:'员工状态',width:95,render:(_,r)=><Status type={type} row={r}/>},{title:'登录权限',width:95,render:(_,r)=><Tag className={'iw-status '+(r.loginEnabled?'normal':'off')}>{r.loginEnabled?'已开通':'已关闭'}</Tag>},actionColumn],
  payments:[{title:'名称',dataIndex:'name'},{title:'状态',width:100,render:(_,r)=><Status type={type} row={r}/>},actionColumn],
  fundAccounts:[{title:'账户名称',dataIndex:'name'},{title:'所属收款方式',render:(_,r)=>(r.methodIds||[]).map(id=>label('payments',id)).filter(Boolean).join('、')},{title:'状态',width:100,render:(_,r)=><Status type={type} row={r}/>},actionColumn],
 };
 return <section className="bs-page iw-workbench iw-arco-controls"><header className="bs-head iw-head"><h1>{titles[rootType]}</h1><div className="bs-head-actions"><Button type="text" onClick={()=>setLogOpen(true)}>操作记录</Button><Button type="primary" onClick={()=>open()}>新增{names[type]}</Button></div></header>
  {group[rootType].length>1&&<nav className="bs-tabs" role="tablist">{group[rootType].map(id=><button type="button" role="tab" aria-selected={type===id} key={id} onClick={()=>{storageState[rootType]=id;setType(id)}}>{names[id]}</button>)}</nav>}
  <Filters key={type} type={type} filter={f.draft} resetKey={f.resetKey} onDraft={updateDraft} apply={apply} reset={reset}/>
  <div className="bs-table-wrap iw-arco-table"><Table size="small" rowKey="id" columns={columns[type]} data={view} pagination={false} noDataElement={<Empty description="暂无符合条件的数据"/>}/></div>
  <Pager count={results.length} page={f.page} size={f.size} onPage={page=>{f.page=page;rerender()}} onSize={size=>{f.size=size;f.page=1;rerender()}}/>
  <Modal className={'bs-modal iw-arco-modal iw-arco-controls'+(modal?.type==='staff'?' bs-modal-staff':'')} visible={!!modal} title={modal?(modal.editing?'编辑':'新增')+names[modal.type]:''} onCancel={()=>setModal(null)} onOk={save} confirmLoading={saving} okText="确定" cancelText="取消" maskClosable={false} autoFocus={false}>
   {modal&&<><Fields {...modal} form={form} setForm={setForm}/>{error&&<p className="bs-error" role="alert">{error}</p>}</>}
  </Modal>
  <Modal className="bs-modal iw-arco-modal iw-arco-controls" visible={!!confirm} title={confirm?.blocked?'无法完成操作':confirm?.next==='离职'?'确认办理离职':'确认恢复在职'} onCancel={()=>{setConfirm(null);setError('')}} onOk={confirm?.blocked?()=>{setConfirm(null);setError('')}:changeEmployment} okText={confirm?.blocked?'知道了':'确定'} cancelText="取消" hideCancel={!!confirm?.blocked}>
   {confirm?.blocked?<p className="bs-error">{error}</p>:confirm?.next==='离职'?<p>确定为「{confirm.name}」办理离职？办理后登录权限关闭，员工资料、登录账号和历史单据继续保留。恢复在职后登录权限仍保持关闭。</p>:<p>确定恢复「{confirm?.name}」在职？登录权限仍保持关闭，需要登录时请在编辑员工中手工开通。</p>}
  </Modal>
  <LogDrawer visible={logOpen} onClose={()=>setLogOpen(false)} refresh={revision}/>
 </section>;
}
let root=null;
function mount(route){if(!M.routeAllowed(route))return;const page=document.querySelector('#page');if(!page)return;if(root){root.unmount();root=null}page.innerHTML='<div id="basic-settings-v2"></div>';root=createRoot(page.firstElementChild);root.render(<App route={route}/>)}
const previous=window.render;
window.render=function(...args){if(root){root.unmount();root=null}const result=previous(...args);const route=location.hash.slice(1);if(route.startsWith('settings/')&&M.current()&&(!window.REAL_DATA_MODE||window.LEGACY_REAL?.loaded)&&group[route.slice(9)]&&M.routeAllowed(route)){document.querySelector('#breadcrumb').textContent='基础设置 / '+titles[route.slice(9)];mount(route)}return result};
window.BASIC_SETTINGS_V2={mount};
