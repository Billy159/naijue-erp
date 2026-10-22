# frontend/basic-settings-v2.jsx - Frozen UI excerpts

Source commit: `b8bcfe3eb43f6a7be0c60a77c6d6fb99e2ed5dd3`. Full source SHA256: `c16e44268ac75f50784c0ce8c8b45826eb267ec85c8cee06596d24ab2a0761fa`.

Boundary: Settings filters, field components, store/warehouse/staff/payment forms and modals. Excludes MASTER_DATA contents, M.save/status commands and mount override. Split customer/supplier; warehouse single hall, funds multi-hall. Password controls contain field code only, no password values. These are incomplete reference fragments; unresolved expressions are preserved. Empty data has not been inserted to fabricate a runnable module.

## Original lines 20-23

```jsx
const names={stores:'营业厅',warehouses:'仓库',parties:'往来单位',staff:'员工',payments:'收款方式',fundAccounts:'资金账户'};
const group={stores:['stores','warehouses'],parties:['parties'],staff:['staff'],payments:['payments','fundAccounts']};
const titles={stores:'营业厅与仓库',parties:'往来单位',staff:'员工与账号',payments:'收款配置'};
const defaultFilter=()=>({q:'',status:'normal',storeId:'',tags:[],role:'',employmentStatus:'在职',loginStatus:'',methodId:''});
```

## Original lines 35-67

```jsx
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
```

## Original lines 72-98

```jsx
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
```

## Original lines 170-191

```jsx
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
```
