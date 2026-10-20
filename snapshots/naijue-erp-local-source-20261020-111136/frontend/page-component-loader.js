/* Public code/styles share one graph. Account-owned data stays in scoped state. */
(function(root){'use strict';
 const entries={
  account:['assets/modules/topbar-account.js','TOPBAR_ACCOUNT'],
  product:['assets/modules/product-arco.js','PRODUCT_ARCO'],
  search:['assets/modules/inventory-select.js','INVENTORY_SELECT'],
  category:['assets/modules/inventory-category.js','INVENTORY_CATEGORY'],
  filters:['assets/modules/inventory-filters.js','INVENTORY_FILTERS'],
  date:['assets/modules/transfer-date.js','TRANSFER_DATE'],
  single:['assets/modules/unified-single-select.js','UNIFIED_SINGLE_SELECT'],
  settings:['assets/modules/basic-settings-v2.js','BASIC_SETTINGS_V2'],
  correction:['assets/modules/inventory-correction.js','INVENTORY_CORRECTION'],
  imports:['assets/modules/reference-import.js','REFERENCE_IMPORT'],
  future:['assets/modules/future-preview.js','FUTURE_PREVIEW'],
  foundation:['assets/modules/page-foundation.js','ERP_PAGE_FOUNDATION']
 };
 const dependencies={settings:['single','filters']},pending=new Map(),loaded=new Set();
 const modulePending=new Map(),modules=new Map(),attempts=new Map(),styles=new Map(),routes=new Map();
 const version=root.ERP_FRONTEND_RELEASE?.version||'development';
 let context=null,services=null,active=null,generation=0;
 function resource(path){
  if((root.ERP_FRONTEND_RELEASE?.version||'development')!==version)throw Error('页面版本已变化，请刷新后重试');
  const release=root.ERP_FRONTEND_RELEASE;
  if(release&&!Object.hasOwn(release.assets||{},path))throw Error('组件不在当前发布清单中');
  const value=release?.assets?.[path]||path,url=new URL(value,document.baseURI);
  if(url.origin!==location.origin)throw Error('组件地址与当前系统不一致');
  return url.href;
 }
 function timed(task,message){
  let timer;
  return Promise.race([task,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(message)),30000);})]).finally(()=>clearTimeout(timer));
 }
 function style(path){
  const url=resource(path);
  if(styles.has(path))return styles.get(path);
  const task=new Promise((resolve,reject)=>{
   const link=document.createElement('link');link.rel='stylesheet';link.dataset.erpStyle=path;
   let timer;
   const fail=()=>{clearTimeout(timer);link.remove();styles.delete(path);reject(Error('页面样式加载失败，请重试'));};
   link.onload=()=>{clearTimeout(timer);resolve();};link.onerror=fail;
   timer=setTimeout(fail,30000);link.href=url;document.head.append(link);
  });
  styles.set(path,task);task.catch(()=>styles.delete(path));return task;
 }
 async function loadModule(path){
  resource(path);
  if(!/^assets\/modules\/[a-z0-9-]+\.js$/.test(path))throw Error('页面入口未配置');
  if(modules.has(path))return modules.get(path);
  let task=modulePending.get(path);
  if(!task){
   const url=new URL(resource(path)),count=attempts.get(path)||0;
   if(count)url.searchParams.set('erpRetry',String(count));
   task=(async()=>{
    for(const css of root.ERP_FRONTEND_RELEASE?.components?.[path]?.css||[])await style(css);
    return import(url.href);
   })();
   modulePending.set(path,task);
   task.then(value=>{modules.set(path,value);modulePending.delete(path);},()=>{modulePending.delete(path);attempts.set(path,count+1);});
  }
  // Retry a timed-out in-flight import without evaluating the entry twice.
  return timed(task,'页面组件读取超时，请重试');
 }
 function load(name){
  if(!entries[name])return Promise.reject(Error('页面组件未配置'));
  try{resource(entries[name][0]);}catch(error){return Promise.reject(error);}
  if(loaded.has(name))return Promise.resolve();
  if(pending.has(name))return pending.get(name);
  const task=(async()=>{
   for(const dependency of dependencies[name]||[])await load(dependency);
   const [path,globalName]=entries[name];
   // An old isolated bundle cannot satisfy the shared release's contract.
   await loadModule(path);
   if(!root[globalName])throw Error('页面组件未就绪，请刷新后重试');
   loaded.add(name);
  })();
  pending.set(name,task);task.then(()=>pending.delete(name),()=>pending.delete(name));return task;
 }
 function namesFor(route){
  if(routes.has(route))return ['account','foundation'];
  const names=['account','single'];
  if(route==='inventory'||route==='products')names.push('search','category','filters');
  if(route==='products'||/^product(?:\/|-view\/|-categories$|-settings$)|^barcode-schemes$/.test(route))names.push('product');
  if(/^transfer(?:\/|$)|^sales(?:\/|$)/.test(route))names.push('filters','date');
  if(route.startsWith('settings/'))names.push('settings');
  if(route==='future-preview')names.push('future');
  return [...new Set(names)];
 }
 function registerModernRoute(route,descriptor){
  if(!/^[a-z0-9-]+(?:\/[a-z0-9-]+)*$/.test(route)||(!descriptor?.module&&typeof descriptor?.Component!=='function'))throw Error('新页面路由未配置');
  if(routes.has(route))throw Error('新页面路由重复注册');
  if(descriptor.module)resource(descriptor.module);
  routes.set(route,{...descriptor});
 }
 function scope(){
  if(!context||typeof context.scope!=='function')throw Error('页面登录范围未就绪');
  return JSON.stringify([version,context.scope()]);
 }
 async function ensure(route){
  await Promise.all(namesFor(route).map(load));
  const descriptor=routes.get(route);
  if(descriptor?.module){const value=await loadModule(descriptor.module);descriptor.Component=value[descriptor.exportName||'default'];}
  if(descriptor&&typeof descriptor.Component!=='function')throw Error('新页面组件未就绪');
 }
 function useLegacyRoute(){
  generation++;active=null;
  const host=document.querySelector('#react-page-host');
  root.ERP_PAGE_FOUNDATION?.unmount(host);if(host)host.hidden=true;
  const legacy=document.querySelector('#page');if(legacy)legacy.hidden=false;
  services?.reads.invalidate();services?.store.sync();
 }
 function status(host,error,retry){
  const box=document.createElement('div');box.className='empty';box.setAttribute('role',error?'alert':'status');
  const message=document.createElement('p');message.textContent=error?'页面读取未完成：'+error.message:'正在准备当前页面…';box.append(message);
  if(error){const button=document.createElement('button');button.className='btn';button.type='button';button.textContent='重试';button.onclick=retry;box.append(button);}
  host.replaceChildren(box);
 }
 function renderRoute(route){
  if(!routes.has(route))return false;
  const host=document.querySelector('#react-page-host'),legacy=document.querySelector('#page'),owner=scope();
  if(!host)throw Error('新页面宿主未配置');
  if(legacy)legacy.hidden=true;host.hidden=false;
  if(active?.route===route&&active.scope===owner&&active.loading)return true;
  const unchanged=active?.route===route&&active.scope===owner&&active.mounted;
  const current=++generation;
  if(!unchanged){root.ERP_PAGE_FOUNDATION?.unmount(host);host.hidden=false;status(host);}
  active={route,scope:owner,loading:true,mounted:unchanged};
  ensure(route).then(()=>{
   if(current!==generation||scope()!==owner||(location.hash.slice(1)||context.landing?.())!==route)return;
   if(!services)services=root.ERP_PAGE_FOUNDATION.createPageServices({scope,request:(...args)=>context.request(...args),getContext:()=>context});
   services.store.sync();services.reads.scope();
   root.TOPBAR_ACCOUNT?.mount(document.querySelector('.basic-account'),root.MASTER_DATA?.current());
   const descriptor=routes.get(route);
   root.ERP_PAGE_FOUNDATION.mount(host,{route,scope:owner,Component:descriptor.Component,props:descriptor.props,services});
   active={route,scope:owner,loading:false,mounted:true};
  }).catch(error=>{
   if(current!==generation||scope()!==owner)return;
   root.ERP_PAGE_FOUNDATION?.unmount(host);host.hidden=false;active=null;status(host,error,()=>renderRoute(route));
  });
  return true;
 }
 root.ERP_PAGE_COMPONENTS={load,loadModule,resource,namesFor,ensure,registerModernRoute,renderRoute,useLegacyRoute,
  setContext(value){context=value;},scope,isModernRoute:route=>routes.has(route),
  ready:route=>namesFor(route).every(name=>loaded.has(name))&&(!routes.has(route)||typeof routes.get(route).Component==='function'),get version(){return version;}};
 for(const [route,descriptor] of Object.entries(root.ERP_FRONTEND_RELEASE?.routes||{}))registerModernRoute(route,descriptor);
 root.addEventListener('erp-user-cleared',useLegacyRoute);
 document.addEventListener('click',event=>{
  const trigger=event.target.closest('[data-i="correction"],[data-reference-import-open]');if(!trigger)return;
  const name=trigger.hasAttribute('data-reference-import-open')?'imports':'correction';
  if(loaded.has(name))return;
  event.preventDefault();event.stopImmediatePropagation();
  const owner=JSON.stringify([root.ERP_API?.stateScope,root.MASTER_DATA?.current()?.id,root.MASTER_DATA?.current()?.authVersion]);
  load(name).then(()=>{if(owner===JSON.stringify([root.ERP_API?.stateScope,root.MASTER_DATA?.current()?.id,root.MASTER_DATA?.current()?.authVersion])&&trigger.isConnected)trigger.click();})
   .catch(error=>root.toast?.(error.message));
 },true);
})(window);
