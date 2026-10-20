const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');
const {webcrypto}=require('node:crypto');
const root=resolve(__dirname,'..');
const dom=new JSDOM('<div class="app"></div>',{url:'http://127.0.0.1:8877/#inventory',runScripts:'outside-only'});
const w=dom.window;
w.structuredClone=structuredClone;w.TextEncoder=TextEncoder;
Object.defineProperty(w,'crypto',{value:webcrypto});
w.navigator.locks={request:async(_,callback)=>callback()};
w.ERP_DEMO={warehouses:[],products:[]};
w.PRODUCT_CATALOG={suppliers:[],colors:[],groups:[],categories:[]};
w.REAL_DATA_MODE=true;
let restore;
w.fetch=()=>new Promise(r=>{restore=employee=>r({ok:true,json:async()=>({ok:true,data:{employee}})});});
const load=file=>vm.runInContext(readFileSync(resolve(root,file),'utf8'),dom.getInternalVMContext(),{filename:file});
(async()=>{
 load('master-data.js');load('service-client.js');load('auth-entry.js');
 const M=w.MASTER_DATA;
 // Initial rendering can show login while the existing server session is still loading.
 M.loginScreen();assert(w.document.querySelector('.login-overlay'));
 restore({id:'employee-admin',name:'实际管理员',role:'管理员',employmentStatus:'在职',loginEnabled:true,authVersion:1});
 await M.ready;
 assert.equal(w.document.querySelector('.login-overlay'),null);
 assert.equal(w.document.querySelector('.app').hasAttribute('inert'),false);
 assert.equal(M.current().name,'实际管理员');
 const business=['inventory','transfer','transfer/new','sales','sales/new','product-view/existing'];
 const product=['products','product/new','product/existing','product-categories','product-settings','barcode-schemes'];
 const base=['settings/stores','settings/warehouses','settings/parties','settings/payments','settings/fundAccounts'];
 for(const role of M.roles){
  M.setSessionEmployee({id:role,name:role,role,employmentStatus:'在职',loginEnabled:true,authVersion:1});
  for(const path of business)assert.equal(M.routeAllowed(path),true,role+': '+path);
  for(const path of [...product,...base])assert.equal(M.routeAllowed(path),role!=='营业员',role+': '+path);
  assert.equal(M.routeAllowed('settings/staff'),role==='管理员');
  assert.equal(M.canManage('staff'),role==='管理员');
  assert.equal(M.canManage('products'),role!=='营业员');
  assert.equal(M.canManage('warehouses'),role!=='营业员');
  assert.equal(M.context().employeeId,role);
  assert.equal(M.routeAllowed('sales-returns'),false,role+': retired entry is canonicalized before authorization');
  assert.equal(M.routeAllowed('sales-returns-extra'),false,role+': unrelated old prefixes cannot pass authorization');
  if(role!=='管理员')assert.equal((await M.save('staff',{name:'无权新增'})).ok,false);
 }
 w.document.querySelector('.app').innerHTML='<aside class="sidebar"><div class="brand-name"></div><a data-route="products"></a><a data-route="sales"></a></aside><header class="topbar"></header><main id="page"></main>';
 let renderedRoute='';w.render=()=>{renderedRoute=w.location.hash};
 load('basic-settings.js');
 for(const role of M.roles){
  M.setSessionEmployee({id:role,name:role,role,employmentStatus:'在职',loginEnabled:true,authVersion:1});
  w.location.hash='#sales-returns';w.render();
  assert.equal(w.location.hash,'#sales');assert.equal(renderedRoute,'#sales');
  if(role==='营业员')assert.equal(w.document.querySelector('[data-route="products"]').hidden,true);
 }
 // The runtime data gate wraps the route shell; it must canonicalize the old link first as well.
 const runtime=readFileSync(resolve(root,'real-data-bridge.mjs'),'utf8');
 const gate=runtime.slice(runtime.indexOf('const oldRender=window.render;'),runtime.indexOf('const refs={};'));
 vm.runInContext('const M=window.MASTER_DATA,D=window.ERP_DEMO,bridge={loaded:true};'+gate,dom.getInternalVMContext());
 for(const role of M.roles){
  M.setSessionEmployee({id:role,name:role,role,employmentStatus:'在职',loginEnabled:true,authVersion:1});
  w.location.hash='#sales-returns';w.render();
  assert.equal(w.location.hash,'#sales');assert.equal(renderedRoute,'#sales');
 }
 M.setSessionEmployee(null);assert.equal(M.routeAllowed('inventory'),false);
 console.log('Client three-role routes/functions and restored-session overlay race: passed');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>dom.window.close());
