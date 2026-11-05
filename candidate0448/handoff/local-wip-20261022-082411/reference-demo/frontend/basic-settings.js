/* Route and login shell for the Arco basic settings workbench. */
(function(){'use strict';
const M=window.MASTER_DATA;
if(!M?.active)return;
const page=document.querySelector('#page');
const previous=window.render;
const settingsRoutes=new Set(['settings/stores','settings/parties','settings/staff','settings/payments']);
const aliases={'settings/warehouses':'settings/stores','settings/fundAccounts':'settings/payments','settings/options':'settings/stores','sales-returns':'sales'};

window.render=function(){
 if(!M.current()){M.loginScreen();return}
 M.sync();
 const brand=document.querySelector('.sidebar .brand-name');if(brand)brand.textContent=M.brand;
 let route=location.hash.slice(1);
 if(aliases[route]){
  if(route==='settings/warehouses')window.BASIC_SETTINGS_INITIAL_TAB='warehouses';
  if(route==='settings/fundAccounts')window.BASIC_SETTINGS_INITIAL_TAB='fundAccounts';
  route=aliases[route];history.replaceState(null,'','#'+route);
 }
 if(!route||['desktop','home','dashboard'].includes(route)||!M.routeAllowed(route)){
  route=M.landing();
  if(!route){page.innerHTML='<section class="basic-page"><h1>暂无可用业务页面</h1></section>';return}
  history.replaceState(null,'','#'+route);
 }
 document.querySelectorAll('[data-route]').forEach(a=>{
  a.hidden=!M.routeAllowed(a.dataset.route);
  a.classList.toggle('selected',a.dataset.route===route);
 });
 document.querySelectorAll('.tc-nav-group').forEach(group=>{group.hidden=![...group.querySelectorAll('[data-route]')].some(a=>!a.hidden)});
 document.querySelectorAll('.sidebar .nav.parent').forEach(title=>{let next=title.nextElementSibling,visible=false;while(next&&!next.matches('.nav.parent')){if(next.matches('[data-route],.tc-nav-group')&&!next.hidden)visible=true;next=next.nextElementSibling}title.hidden=!visible});
 let account=document.querySelector('.basic-account');
 if(!account){account=document.createElement('div');account.className='basic-account';document.querySelector('.topbar')?.append(account)}
 window.TOPBAR_ACCOUNT?.mount(account,M.current());
 if(!M.routeAllowed(route))return;
 if(settingsRoutes.has(route)){
  document.body.classList.remove('pc-mode','gold-mode','tc-mode','sale-mode','inventory-workbench');
  if(window.REAL_DATA_MODE&&!window.LEGACY_REAL?.loaded){page.innerHTML='<div class="iw-loading" role="status">正在读取基础资料…</div>';return}
  page.innerHTML='<div id="basic-settings-v2"></div>';
  return;
 }
 previous();
};
window.BASIC_SETTINGS={stash(){}};
M.ready.then(()=>{M.sync();window.render()});
})();
