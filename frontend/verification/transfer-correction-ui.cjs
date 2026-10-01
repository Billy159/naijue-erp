const {JSDOM}=require('jsdom'),fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('node:assert/strict');const root=path.resolve(__dirname,'..');
const dom=new JSDOM(fs.readFileSync(root+'/index.html','utf8'),{url:'http://localhost/?tr-space=unit#transfer/new',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,d=w.document;
w.structuredClone=structuredClone;w.CSS={escape:x=>x};w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};w.HTMLElement.prototype.scrollIntoView=function(){};
let tail=Promise.resolve();Object.defineProperty(w.navigator,'locks',{value:{request:(key,fn)=>{const p=tail.then(fn);tail=p.catch(()=>{});return p}}});const errors=[];w.addEventListener('error',e=>errors.push(e.message));
for(const f of ['model.js','app.js','product-legacy-sizes.js','product-catalog.js','engine.js','gold.js','assets/vendor/jszip.min.js','inventory-result.js','inventory-xlsx.js','inventory-workbench.js','product-current.js','transfer-mock-core.js','transfer-mock-client.js','transfer-current.js'])vm.runInContext(fs.readFileSync(root+'/'+f,'utf8'),dom.getInternalVMContext());
const tick=()=>new Promise(r=>setTimeout(r,30)),checks=[],check=(name,fn)=>{fn();checks.push({name,result:'PASS'})};
(async()=>{await w.TRANSFER_SERVICE.ready;await tick();const U=w.TRANSFER_UI,T=U.state,G=w.GOLD,C=w.PRODUCT_CATALOG,D=w.ERP_DEMO;
check('初始无重复字段错误，有禁用原因',()=>{assert.equal(d.querySelector('#tc-from-hint').textContent,'');assert.equal(d.querySelector('#tc-to-hint').textContent,'');assert(d.querySelector('[data-t=save]').disabled);assert(d.querySelector('[data-t=save]').title)});
const initial=JSON.stringify(D.products.map(p=>p.stock));const productCount=D.products.length;
await U.scan('M26002','product-lookup');check('款号只添加商品不加数量',()=>{assert(T.doc.items.includes('M26002'));assert.equal(G.count(T.doc).units,0)});
for(let i=0;i<5;i++)await U.scan('BC-M26002-1-1','independent-'+i);
check('五个独立扫描+5，工作记录5条',()=>{assert.equal(T.doc.q['M26002|0|0'],5);assert.equal(T.doc.scans.length,5)});
await U.scan('BC-M26002-1-1','independent-4');check('同事件重试不重复加数',()=>assert.equal(T.doc.q['M26002|0|0'],5));
await U.scan('OLD-M26002-1-1','historical');check('历史码同格累加',()=>assert.equal(T.doc.q['M26002|0|0'],6));
const p=D.products.find(p=>p.id==='M26002');(p.barcodes[C.specKey(p.colorIds[0],p.sizeIds[0])].compatible??=[]).push({code:'000012345678',schemeId:'legacy'});
await U.scan('000012345678','compatible');check('兼容码同格累加、前导零保留',()=>{assert.equal(T.doc.q['M26002|0|0'],7);assert.equal(T.doc.scans.at(-1).code,'000012345678')});
await U.scan('NOT-A-CODE','missing');await U.scan('AMB-001','ambiguous');check('未知与歧义记录失败，不加数不建档',()=>{assert.equal(T.doc.q['M26002|0|0'],7);assert.equal(D.products.length,productCount);assert.equal(T.doc.scans.at(-1).kind,'ambiguous');assert(T.doc.scans.at(-2).error)});
check('扫描阶段库存完全不变',()=>assert.equal(JSON.stringify(D.products.map(p=>p.stock)),initial));
let input=d.querySelector('#tc-scan');input.value='BC-M26002-1-1';input.dispatchEvent(new w.Event('input',{bubbles:true}));const ime=new w.KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true,cancelable:true});input.dispatchEvent(ime);check('中文输入法Enter被阻止提交',()=>assert(ime.defaultPrevented));
// Two end signals with no new barcode: submit clears the input synchronously, so only one work event is created.
const form=d.querySelector('#tc-scan-form');form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();check('组合结束信号只录入一次，不自动保存或审核',()=>{assert.equal(T.doc.q['M26002|0|0'],8);assert(!T.doc.saved);assert.equal(T.doc.status,'草稿')});
check('连续输入不替换扫码框DOM',()=>assert.equal(d.querySelector('#tc-scan'),input));
T.doc.from='main';T.doc.to='outlet';await U.commit('save');await tick();check('扫码保存成功，责任人为会话A',()=>{assert(T.doc.saved);assert.equal(T.doc.creatorActor.id,'mock-A');assert.equal(T.doc.scans[0].actor.id,'mock-A')});
const before=T.doc.history.length;await U.commit('save');await tick();check('同内容再次保存不制造历史',()=>assert.equal(T.doc.history.length,before));
T.doc.q['M26002|0|0']=11;w.render();d.querySelector('[data-t=undo]').click();await tick();check('手改后撤销沿旧算法减1，扫描快照不改',()=>{assert.equal(T.doc.q['M26002|0|0'],10);assert.equal(T.doc.scans.find(l=>l.eventId==='independent-0').after,1);assert.equal(T.doc.scans.find(l=>l.undoEvent)?.undoEvent.actor.id,'mock-A')});
await U.commit('save');await tick();check('保存撤销事实成功',()=>assert.equal(T.doc.q['M26002|0|0'],10));
T.doc.q['M26002|0|0']=p.stock.main[0][0]+5;await U.commit('audit');await tick();check('审核产生负库存也不阻断',()=>{assert.equal(T.doc.status,'已审核');assert.equal(G.events.length,2);assert.equal(p.stock.main[0][0],-5)});
const q=T.doc.q['M26002|0|0'];await U.scan('BC-M26002-1-1','readonly');check('已审核拦截扫码',()=>assert.equal(T.doc.q['M26002|0|0'],q));
await U.commit('reverse');await tick();check('弃审追加两条反向事件',()=>{assert.equal(T.doc.status,'未审核');assert.equal(G.events.length,4)});

let shared=JSON.parse(w.localStorage.getItem(w.TRANSFER_SERVICE.key));shared.leases[T.doc.id].expires=0;w.localStorage.setItem(w.TRANSFER_SERVICE.key,JSON.stringify(shared));d.dispatchEvent(new w.Event('visibilitychange'));await tick();await tick();check('无竞争的到期资格自动恢复，无技术按钮',()=>{assert(!T.blocked);assert(T.lease.expires>Date.now());assert(d.querySelector('#tc-scan'));assert(!d.querySelector('[data-t=recover],[data-t=latest],[data-t=local-draft]'))});
const unchangedHistory=JSON.stringify(T.doc.history);T.doc.q['M26002|0|0']=q+2;shared=JSON.parse(w.localStorage.getItem(w.TRANSFER_SERVICE.key));const latest=shared.docs.find(x=>x.id===T.doc.id);latest.q['M26002|0|0']=q+9;latest.revision++;latest.updatedBy={id:'mock-B',name:'李四'};shared.leases[T.doc.id].expires=0;w.localStorage.setItem(w.TRANSFER_SERVICE.key,JSON.stringify(shared));d.dispatchEvent(new w.Event('visibilitychange'));await tick();await tick();check('自动恢复不能覆盖他人新修订，保留本地输入',()=>{assert.equal(T.blockedCode,'REVISION');assert.equal(T.doc.q['M26002|0|0'],q+2);assert.equal(JSON.parse(w.localStorage.getItem(w.TRANSFER_SERVICE.key)).docs.find(x=>x.id===T.doc.id).q['M26002|0|0'],q+9);assert.equal(JSON.stringify(T.doc.history),unchangedHistory)});
// Restore the original local quantity only inside this isolated test before the session-expiry assertion.
T.doc.q['M26002|0|0']=q;T.blocked='';T.lease=(await w.TRANSFER_SERVICE.call({type:'acquire',docId:T.doc.id,newToken:'test-reacquired'})).lease;
await w.TRANSFER_SERVICE.call({type:'logout'});await U.scan('BC-M26002-1-1','expired-session');check('身份失效实际服务拒绝，原账号草稿不重新署名',()=>{assert(T.blocked.includes('当前无法继续录单'));assert.equal(T.doc.q['M26002|0|0'],q);assert.equal(T.doc.creatorActor.id,'mock-A')});
check('运行无JS错误',()=>assert.deepEqual(errors,[]));
fs.writeFileSync(__dirname+'/transfer-correction-evidence/ui-model-checks.json',JSON.stringify({checks,total:checks.length,scope:'JSDOM plus same mock service; not browser hardware test'},null,2));console.log(checks.length+' UI/service checks PASS');dom.window.close();})().catch(e=>{console.error(e);dom.window.close();process.exitCode=1});
