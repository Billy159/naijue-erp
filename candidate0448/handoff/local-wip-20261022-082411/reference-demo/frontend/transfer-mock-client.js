/* Same-browser, same-origin mock service. localStorage + Web Locks are NOT a production backend. */
(function(){'use strict';
const params=new URLSearchParams(location.search),space=params.get('tr-space')||'normal',key='erp-transfer-mock-v1:'+space;
const demo=!!document.querySelector('meta[name="erp-runtime"][content="demo"]');
const account=space==='normal'?'A':params.get('mock-account')||'A';
// A reload is the same editor; a newly opened or duplicated tab is a new editor.
const sessionId=(()=>{const id=crypto.randomUUID();try{const k='tr-editor:'+key,nav=performance.getEntriesByType?.('navigation')[0]?.type,previous=sessionStorage.getItem(k);const next=nav==='reload'&&previous?previous:id;sessionStorage.setItem(k,next);return next}catch{return id}})();
const api={key,sessionId,actor:null,ready:null};let workRecords=[];
api.workLogs=id=>workRecords.filter(e=>e.docId===id&&e.record).map(e=>structuredClone(e.record));
api.recordWork=async(docId,token,record)=>{const r=await call({type:"work-result",docId,token,record});if(r.ok){workRecords=workRecords.filter(e=>e.id!==r.event.id);workRecords.push(r.event)}return r};
function compact(products){return products.map(p=>({id:p.id,colors:p.colors,sizes:p.sizes,colorIds:p.colorIds,sizeIds:p.sizeIds,stock:p.stock}))}
function initial(){return TRANSFER_MOCK_CORE.seed(GOLD.documents,compact(ERP_DEMO.products))}
async function call(command){
 if(!demo)return {ok:false,code:'AUTH',error:'当前环境未接入身份认证，不能执行录单操作。'};
 if(navigator.onLine===false&&['write','work','work-result','renew','acquire'].includes(command.type))return {ok:false,code:'CONNECTION',error:'连接已断开，本次操作未提交，未提交内容已保留。'};
 if(!navigator.locks)return {ok:false,code:'UNSUPPORTED',error:'此浏览器不支持共享模拟编辑资格，当前只读。'};
 return navigator.locks.request(key,()=>{
  const state=JSON.parse(localStorage.getItem(key)||'null')||initial();
  // Commit the whole cloned transaction only on success. Throw/quota failure cannot partially publish stock/audit.
  state.products=compact(state.products);window.PRODUCT_CATALOG?.syncDemo2026?.(state);
  const draft=structuredClone(state);if(window.MASTER_DATA?.active){const ctx=MASTER_DATA.context();if(!ctx)return {ok:false,code:'SESSION',error:'登录已失效，输入按原账号保留'};draft.sessions[sessionId]=ctx;for(const p of draft.products)for(const w of MASTER_DATA.data.warehouses)p.stock[w.id]??=p.colors.map(()=>p.sizes.map(()=>0));if(command.type==='login'){localStorage.setItem(key,JSON.stringify(draft));return {ok:true,session:ctx}}if(command.type!=='snapshot'&&command.type!=='logout'&&!MASTER_DATA.routeAllowed('transfer'))return {ok:false,code:'PERMISSION',error:'当前角色不能办理调拨'};}const result=TRANSFER_MOCK_CORE.reduce(draft,{...command,sessionId});
  if(result.ok&&!['snapshot','check'].includes(command.type))localStorage.setItem(key,JSON.stringify(draft));return result;
 });
}
api.call=call;
api.sync=async()=>{const r=await call({type:'snapshot'});if(!r.ok)return r;workRecords=r.workRecords||[];api.actor={id:r.session.accountId,name:r.session.name};GOLD.documents.splice(0,GOLD.documents.length,...r.docs);GOLD.events.splice(0,GOLD.events.length,...r.events);for(const p of ERP_DEMO.products){const saved=r.products.find(x=>x.id===p.id);if(saved)p.stock=structuredClone(saved.stock)}return r};
async function initialize(){if(window.REAL_DATA_MODE)return window.REAL_DATA_READY;if(window.MASTER_DATA?.active)await MASTER_DATA.ready;for(let attempt=0;attempt<2;attempt++){try{const r=await call({type:'login',account});if(!r.ok)return r;return await api.sync()}catch(e){api.initializationError=e.name;if(attempt===1)return {ok:false,code:'INITIALIZATION',error:'页面暂时无法加载，请稍后重新打开。'};}}}
api.ready=initialize();
window.TRANSFER_SERVICE=api;
})();
