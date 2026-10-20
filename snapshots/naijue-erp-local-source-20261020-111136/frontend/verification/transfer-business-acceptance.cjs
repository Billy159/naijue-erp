const {JSDOM}=require('jsdom'),fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('node:assert/strict');const root=path.resolve(__dirname,'..');
const dom=new JSDOM(fs.readFileSync(root+'/index.html','utf8'),{url:'http://localhost/?tr-space=acceptance-unit#transfer/new',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,d=w.document;
w.structuredClone=structuredClone;w.CSS={escape:x=>x};w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};w.HTMLElement.prototype.scrollIntoView=function(){};
let tail=Promise.resolve();Object.defineProperty(w.navigator,'locks',{value:{request:(key,fn)=>{const p=tail.then(fn);tail=p.catch(()=>{});return p}}});const errors=[];w.addEventListener('error',e=>errors.push(e.message));
for(const f of ['model.js','app.js','product-legacy-sizes.js','product-catalog.js','engine.js','gold.js','assets/vendor/jszip.min.js','inventory-result.js','inventory-xlsx.js','inventory-workbench.js','product-current.js','transfer-mock-core.js','transfer-mock-client.js','transfer-current.js'])vm.runInContext(fs.readFileSync(root+'/'+f,'utf8'),dom.getInternalVMContext());
const tick=()=>new Promise(r=>setTimeout(r,30)),checks=[],check=(name,fn)=>{fn();checks.push({name,result:'PASS'})};

(async()=>{
 await w.TRANSFER_SERVICE.ready;await tick();const U=w.TRANSFER_UI,T=U.state,S=w.TRANSFER_SERVICE,D=w.ERP_DEMO,G=w.GOLD;
 const results=[],stages={},copy=x=>JSON.parse(JSON.stringify(x)),stock=()=>copy(D.products.map(p=>({id:p.id,stock:p.stock}))),initial=stock();
 const business=x=>copy({id:x.id,date:x.date,from:x.from,to:x.to,q:x.q,items:x.items,creator:x.creatorActor,modified:x.modified,modifier:x.modifierActor,revision:x.revision,version:x.version,history:x.history});
 const state=()=>({dirty:U.dirty(),q:copy(T.doc.q),total:G.count(T.doc).units,failures:T.doc.scans.filter(l=>l.error).length,status:T.doc.status});
 const row=(scenario,before,expected)=>{const after=state();results.push({scenario,before,after,expected,result:after.dirty===expected?'PASS':'FAIL'});assert.equal(after.dirty,expected,scenario);return after};
 const edit=(key,n)=>{const el=[...d.querySelectorAll('[data-t-qty]')].find(e=>e.dataset.tQty===key);assert(el);el.value=String(n);el.dispatchEvent(new w.Event('input',{bubbles:true}))};
 const click=a=>{assert(d.querySelector('[data-t='+a+']'));d.querySelector('[data-t='+a+']').click()};
 const reopen=async()=>{const id=T.doc.id;click('list');await tick();assert.equal(d.querySelector('#tc-dialog').open,false);U.openDoc(id);await tick();await tick();assert.equal(T.doc.id,id);assert(!U.dirty())};
 T.doc.from='main';T.doc.to='outlet';T.doc.date='2026-09-15';
 await U.scan('BC-M26001-1-2','seed1');await U.scan('BC-M26002-1-1','seed2');await U.scan('BAD-SEED','bad-seed');await U.scan('BC-M26002-1-1','undo-seed');click('undo');await tick();await tick();
 edit('M26001|0|1',3);edit('M26001|1|2',2);edit('M26002|0|0',3);edit('M26002|1|9',1);
 await U.commit('save');await tick();assert(T.doc.saved);assert.equal(G.count(T.doc).units,9);const id=T.doc.id,creator=copy(T.doc.creatorActor);await reopen();stages.saved=copy(T.doc);
 let before=state(),saved=business(T.doc);await U.scan('UNKNOWN-A','unknown-a');row('A 已保存→仅失败',before,false);assert.deepEqual(business(T.doc),saved);assert.deepEqual(stock(),initial);
 // Even explicit log-only save must not write business modification metadata/history.
 await U.commit('save');await tick();assert.deepEqual(business(T.doc),saved);const count=T.doc.scans.filter(l=>l.error).length;before=state();await reopen();row('F 仅失败→返回再打开',before,false);assert.equal(T.doc.scans.filter(l=>l.error).length,count);
 before=state();edit('M26001|0|1',4);await U.scan('UNKNOWN-B','unknown-b');row('B 数量3→4→失败',before,true);assert.equal(Number(T.doc.q['M26001|0|1']),4);
 before=state();click('list');assert(d.querySelector('#tc-dialog').open);row('E 真实未保存→失败→返回需确认',before,true);click('close-modal');assert.equal(Number(T.doc.q['M26001|0|1']),4);
 await U.commit('save');await tick();await reopen();stages.modified=copy(T.doc);assert.equal(T.doc.id,id);assert.deepEqual(T.doc.creatorActor,creator);assert.equal(G.count(T.doc).units,10);assert.equal(Number(T.doc.q['M26002|1|9']),1);assert(T.doc.history.at(-1).changes.some(c=>c.before===3&&c.after===4));
 before=state();await U.scan('BC-M26002-1-1','success-c');row('C 已保存→成功+1',before,true);assert.equal(Number(T.doc.q['M26002|0|0']),4);
 before=state();click('undo');await tick();await tick();row('D 成功→撤销回基线',before,false);assert.equal(Number(T.doc.q['M26002|0|0']),3);assert(T.doc.scans.find(l=>l.eventId==='success-c').undone);await reopen();assert(T.doc.scans.find(l=>l.eventId==='success-c').undone);
 before=state();await U.scan('UNKNOWN-G','unknown-g');await U.scan('BC-M26002-1-1','success-g');row('G 失败→成功一次',before,true);assert.equal(Number(T.doc.q['M26002|0|0']),4);click('undo');await tick();await tick();assert(!U.dirty());
 assert.deepEqual(stock(),initial);stages.beforeAudit=copy(T.doc);
 const specRows=G.entries(T.doc).map(x=>{const p=D.products.find(p=>p.id===x.p);return {...copy(x),label:p.id+' / '+p.colors[x.c]+' / '+p.sizes[x.s],A:p.stock.main[x.c][x.s],B:p.stock.outlet[x.c][x.s]}});
 const inventory=()=>specRows.map(x=>{const p=D.products.find(p=>p.id===x.p);return {out:p.stock.main[x.c][x.s],in:p.stock.outlet[x.c][x.s]}});
 const call=S.call;let lastWrite;S.call=async c=>{if(c.type==='write')lastWrite=copy(c);return call(c)};
 await U.commit('audit');await tick();assert.equal(T.doc.status,'已审核');stages.audited=copy(T.doc);const first=inventory(),auditCmd=lastWrite,ev1=copy(G.events);
 first.forEach((v,i)=>{assert.equal(v.out,specRows[i].A-specRows[i].n);assert.equal(v.in,specRows[i].B+specRows[i].n);assert.equal(v.out+v.in,specRows[i].A+specRows[i].B)});
 assert((await S.call(auditCmd)).ok);await S.sync();assert.deepEqual(copy(G.events),ev1);assert.deepEqual(inventory(),first);await reopen();assert.deepEqual(inventory(),first);
 await U.commit('reverse');await tick();assert.equal(T.doc.status,'未审核');stages.reversed=copy(T.doc);const reversed=inventory(),reverseCmd=lastWrite,ev2=copy(G.events);reversed.forEach((v,i)=>assert.deepEqual(v,{out:specRows[i].A,in:specRows[i].B}));assert.equal(ev2.length,ev1.length*2);assert.deepEqual(ev2.slice(0,ev1.length),ev1);assert((await S.call(reverseCmd)).ok);await S.sync();assert.deepEqual(copy(G.events),ev2);
 edit('M26001|0|1',6);await U.commit('save');await tick();await U.commit('audit');await tick();assert.equal(T.doc.version,2);stages.reaudited=copy(T.doc);const again=inventory();again.forEach((v,i)=>{const n=specRows[i].p==='M26001'&&specRows[i].c===0&&specRows[i].s===1?6:specRows[i].n;assert.equal(v.out,specRows[i].A-n);assert.equal(v.in,specRows[i].B+n)});assert.equal(G.count(T.doc).units,12);
 const table=specRows.map((x,i)=>({...x,first:first[i],reversed:reversed[i],newN:x.p==='M26001'&&x.c===0&&x.s===1?6:x.n,again:again[i]}));
 // Separate authority instance: direct audit of unsaved draft and negative stock, no browser data touched.
 const core=require(root+'/transfer-mock-core.js');let ns=core.seed([],D.products.map(p=>({...copy(p),stock:initial.find(x=>x.id===p.id).stock}))),now=Date.now();const nc=c=>{const next=copy(ns),r=core.reduce(next,{...c,sessionId:'negative'},now);if(r.ok)ns=next;return r};nc({type:'login',account:'B'});const lid='direct-negative',lease=nc({type:'acquire',docId:lid,newToken:'negative'}).lease,p=ns.products.find(p=>p.id==='M26002'),A=p.stock.main[0][0],B=p.stock.outlet[0][0],N=A+5;
 const nr=nc({type:'write',kind:'audit',docId:lid,token:lease.token,requestId:'negative',baseRevision:0,draft:{date:'2026-09-15',from:'main',to:'outlet',q:{'M26002|0|0':N},items:['M26002'],hiddenColors:[],scans:[]}});assert(nr.ok);assert.equal(nr.doc.status,'已审核');assert.equal(ns.products.find(p=>p.id==='M26002').stock.main[0][0],-5);assert.equal(nr.doc.creatorActor.id,'mock-B');
 const output={scope:'JSDOM真实页面事件与当前Demo服务；独立隔离数据，非浏览器截图',results,table,totals:{saved:9,modified:10,firstAudit:10,reAudit:12,specSum:table.reduce((n,x)=>n+x.n,0),newSpecSum:table.reduce((n,x)=>n+x.newN,0)},stages,events:copy(G.events),idempotency:{audit:'PASS',reverse:'PASS',method:'实际重放同一服务write请求并对比事件与库存'},negative:{A,B,N,out:-5,in:ns.products.find(p=>p.id==='M26002').stock.outlet[0][0],actor:nr.doc.auditActor,history:nr.doc.history},errors};assert.deepEqual(errors,[]);fs.writeFileSync(__dirname+'/transfer-acceptance-evidence/acceptance-results.json',JSON.stringify(output,null,2));console.log('A–G, save/reopen, 4-SKU stock cycle, duplicate requests, direct audit and negative stock PASS');dom.window.close();
})().catch(e=>{console.error(e);dom.window.close();process.exitCode=1});
