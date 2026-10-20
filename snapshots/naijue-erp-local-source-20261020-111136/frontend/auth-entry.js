/* Shared employee login. The real Demo validates passwords and roles on the server. */
(function(){'use strict';const M=MASTER_DATA;if(!M.active){M.ready=Promise.resolve();return}let resolve,signedIn=null,sessionEpoch=0,logoutInFlight=null,pendingSessionRead=null;M.ready=new Promise(r=>resolve=r);
const rememberKey='erp-remember-name';
const h=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function preserve(){window.BASIC_SETTINGS?.stash();window.SALES_UI?.stash();window.SALES_RETURNS?.stash?.();window.TRANSFER_UI?.stash?.();window.PRODUCT_UI?.stash?.();window.SCAN_WORKBENCH?.unbind()}
const request=(path,body,options={})=>{if(path==='session'&&body===undefined){if(pendingSessionRead)return pendingSessionRead;pendingSessionRead=ERP_API.request('/runtime/'+path,body,{expire:true,...options}).finally(()=>{pendingSessionRead=null});return pendingSessionRead}return ERP_API.request('/runtime/'+path,body,{expire:!(path==='session'&&body!==undefined)&&path!=='logout',...options})};
function retryBusiness(host,complete){
 let button=host.querySelector('[data-erp-retry]');
 if(!button){button=document.createElement('button');button.type='button';button.className='btn';button.dataset.erpRetry='true';button.textContent='重试加载资料';host.querySelector('.login-panel').append(button);}
 button.hidden=false;button.onclick=async()=>{const epoch=sessionEpoch;button.disabled=true;try{
  if(!M.current()||!window.LEGACY_REAL?.startSession)throw Error('登录或业务程序尚未准备，请重新加载');
  const result=await window.LEGACY_REAL.startSession();if(epoch===sessionEpoch)complete(result);
 }catch(error){if(epoch===sessionEpoch)complete({ok:false,error:error.message});}finally{button.disabled=false;}};
}
function loginScreen(message=''){document.querySelector('[data-erp-startup]')?.remove();let overlay=document.querySelector('.login-overlay');if(overlay){overlay.querySelector('[role=alert]').textContent=message;return}document.querySelector('.app')?.setAttribute('inert','');overlay=document.createElement('section');overlay.className='login-overlay iw-arco-controls';overlay.innerHTML=`<form class="login-panel"><div class="brand" aria-label="奈爵服饰"><span class="brand-mark" aria-hidden="true">奈</span><span class="brand-name">奈爵服饰</span></div><h1>登录</h1><label>登录账号<input name="username" autocomplete="username" required value="${h(localStorage.getItem(rememberKey)||'')}"></label><label>密码<div class="login-password"><input name="password" type="password" autocomplete="current-password" required><button class="btn" type="button" data-show>显示</button></div></label><label class="remember"><input type="checkbox" name="remember" ${localStorage.getItem(rememberKey)?'checked':''}>记住账号</label><div class="basic-error" role="alert">${h(message)}</div><button class="btn primary">登录</button><p><small>忘记密码请联系管理员重置</small></p></form>`;document.body.append(overlay);
 overlay.querySelector('[data-show]').onclick=e=>{const p=overlay.querySelector('[name=password]');p.type=p.type==='password'?'text':'password';e.target.textContent=p.type==='password'?'显示':'隐藏'};
 overlay.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=e.target,b=f.querySelector('.primary'),name=f.username.value.trim(),password=f.password.value;if(logoutInFlight){f.querySelector('[role=alert]').textContent='正在退出，请稍后再登录';return}b.disabled=true;let authenticated=false;try{const r=await M.login(name,password);f.password.value='';if(!r.ok){f.querySelector('[role=alert]').textContent=r.error;return}authenticated=true;if(f.remember.checked)localStorage.setItem(rememberKey,name);else localStorage.removeItem(rememberKey);if(!M.routeAllowed(location.hash.slice(1)))history.replaceState(null,'','#'+M.landing());resolve();if(window.REAL_DATA_MODE){if(!window.LEGACY_REAL?.startSession)throw Error('业务页面程序尚未准备，请稍后重试');const started=await window.LEGACY_REAL.startSession();if(started?.ok!==true)throw Error(started?.error||'业务资料尚未读取完成');overlay.remove();document.querySelector('.app')?.removeAttribute('inert');window.render?.()}else{overlay.remove();document.querySelector('.app')?.removeAttribute('inert');location.reload();}}catch(x){f.password.value='';f.querySelector('[role=alert]').textContent=(authenticated?'登录已确认，业务资料未准备：':'登录未完成：')+x.message;if(authenticated){retryBusiness(overlay,started=>{if(!M.current())return;if(started?.ok!==true){f.querySelector('[role=alert]').textContent='业务资料加载未完成：'+(started?.error||'请重试');return;}overlay.remove();document.querySelector('.app')?.removeAttribute('inert');window.render?.();});}}finally{b.disabled=false}};overlay.querySelector('[name=username]').focus()
}
M.expire=(message='登录已失效，请重新登录')=>{sessionEpoch++;if(signedIn)preserve();window.ERP_USER_STATE?.deactivate(false);signedIn=null;if(M.serverAuth)M.setSessionEmployee(null);loginScreen(message)};M.loginScreen=loginScreen;ERP_API.configure({onAuthExpired:message=>M.expire(message)});
M.logout=()=>{
 if(logoutInFlight)return logoutInFlight;
 logoutInFlight=(async()=>{
  sessionEpoch++;preserve();window.ERP_USER_STATE?.deactivate(true);signedIn=null;
  if(M.serverAuth){M.setSessionEmployee(null);M.setServerEmployees([])}
  sessionStorage.setItem('erp-logout-pending-v1','true');loginScreen('正在退出，请稍候');
  try{if(M.serverAuth){const result=await request('logout',{});if(result?.loggedOut!==true)throw Error('退出结果未确认')}}
  catch{loginScreen('退出结果尚未确认，请恢复连接后重新登录');return {ok:false}}
  localStorage.removeItem(M.authKey);sessionStorage.removeItem(M.authKey);sessionStorage.removeItem('erp-logout-pending-v1');
  if(window.REAL_DATA_MODE)loginScreen();else location.reload();
  return {ok:true};
 })().finally(()=>{logoutInFlight=null});
 return logoutInFlight;
};
if(window.REAL_DATA_MODE){
 const versions=new Map();
 M.serverAuth={
  async login(loginName,password){try{if(pendingSessionRead)await pendingSessionRead.catch(()=>{});const {employee,stateScope}=await request('session',{loginName,password});sessionEpoch++;M.setSessionEmployee(employee);sessionStorage.removeItem('erp-logout-pending-v1');window.ERP_USER_STATE?.activate(employee,stateScope);signedIn=employee;return {ok:true}}catch(e){return {ok:false,error:e.message}}},
  async employees(){const rows=await request('employees');rows.forEach(e=>versions.set(e.id,e.authVersion));M.setServerEmployees(rows);return rows},
  async save(record,password=''){const employee=await request('employees',{record,expectedVersion:versions.get(record.id),password});versions.set(employee.id,employee.authVersion);if(employee.id===M.current()?.id)M.setSessionEmployee(employee);return employee},
  async changeOwnPassword(currentPassword,newPassword){return request('password/change',{currentPassword,newPassword},{expire:false})},
  async refresh(){const started=sessionEpoch,{employee,stateScope}=await request('session');if(started!==sessionEpoch)return;if(!employee){M.expire();return}const old=M.current();if(old&&(old.id!==employee.id||old.role!==employee.role||old.authVersion!==employee.authVersion||old.storeId!==employee.storeId)){window.ERP_USER_STATE?.deactivate(false);M.setSessionEmployee(employee);location.reload();return}M.setSessionEmployee(employee);if(window.ERP_USER_STATE?.snapshot().owner!==employee.id)window.ERP_USER_STATE?.activate(employee,stateScope);signedIn=employee;}
 };
 document.querySelector('.app')?.setAttribute('inert','');
 const bootSession=()=>{
  const bootEpoch=sessionEpoch;
  if(sessionStorage.getItem('erp-logout-pending-v1')){loginScreen('上次退出结果尚未确认，请重新登录');return}
  const startup=document.querySelector('[data-erp-startup]');
  if(startup)startup.querySelector('[role=status]').textContent='正在确认登录并读取业务资料…';
  request('session',undefined,{expire:false}).then(({employee,stateScope})=>{
   if(bootEpoch!==sessionEpoch)return;
   M.setSessionEmployee(employee);if(employee)window.ERP_USER_STATE?.activate(employee,stateScope);
   if(!employee){loginScreen();return}
   signedIn=employee;document.querySelector('.login-overlay:not([data-erp-startup])')?.remove();resolve();
   const finish=started=>{
    if(bootEpoch!==sessionEpoch||!M.current())return;
    if(startup&&started?.ok===false){startup.querySelector('[role=status]').textContent='业务资料加载未完成：'+(started.error||'请重新加载后重试');return}
    startup?.remove();document.querySelector('.app')?.removeAttribute('inert');window.render?.();
   };
   if(startup){
    const complete=started=>{finish(started);if(started?.ok===false&&bootEpoch===sessionEpoch&&M.current())retryBusiness(startup,complete);};
    const loading=window.LEGACY_REAL?.startSession?.()||window.REAL_DATA_READY;
    if(loading)loading.then(complete).catch(error=>complete({ok:false,error:error.message||'请重新加载后重试'}));else complete({ok:false,error:'业务页面程序尚未准备，请重新加载'});
   }else finish();
  }).catch(()=>{if(bootEpoch===sessionEpoch)loginScreen('登录服务暂不可用，请稍后重试')});
 };
 // Avoid starting the short session timeout while parser-blocking assets still occupy the browser connection queue.
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bootSession,{once:true});else bootSession();
}else{signedIn=M.current();if(signedIn){M.actor=M.context();resolve()}else loginScreen()}
window.addEventListener('erp-user-cleared',()=>{document.querySelectorAll('dialog').forEach(d=>{if(d.open)d.close();d.replaceChildren();});document.querySelector('#page')?.replaceChildren();});
window.addEventListener('storage',e=>{if(e.key===M.authKey){if(!e.newValue){M.expire();return}const next=JSON.parse(e.newValue);if(!signedIn||signedIn.id!==next.id||signedIn.authVersion!==next.version)location.reload()}else if((e.key===M.key||e.key==='erp-runtime-masters-v1:normal')&&!M.serverAuth&&!M.current())M.expire()});
setInterval(()=>{if(M.serverAuth&&signedIn)M.serverAuth.refresh().catch(()=>{});else if(M.actor&&!M.current())M.expire()},10000);
})();
