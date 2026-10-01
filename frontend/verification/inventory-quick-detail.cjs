const {JSDOM}=require('jsdom'),fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=__dirname+'/inventory-quick-detail-evidence';
const dom=new JSDOM(fs.readFileSync(root+'/index.html','utf8'),{url:'http://127.0.0.1:8767/#products',runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window,d=w.document;
w.structuredClone=structuredClone;w.CSS={escape:x=>x};w.confirm=()=>true;w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'))};
const errors=[],checks=[];w.addEventListener('error',e=>errors.push(e.message));for(const f of ['model.js','app.js','product-legacy-sizes.js','product-catalog.js','engine.js','gold.js','assets/vendor/jszip.min.js','inventory-result.js','inventory-xlsx.js','inventory-workbench.js','product-current.js','transfer-mock-core.js','transfer-mock-client.js','transfer-current.js'])vm.runInContext(fs.readFileSync(root+'/'+f,'utf8'),dom.getInternalVMContext());
w.JSZip=require('jszip');
const R=w.INVENTORY_RESULT,S=w.GOLD_UI.state,W=w.INVENTORY_UI.state,I=w.INVENTORY_UI;
const check=(name,fn)=>{fn();checks.push(name)},click=s=>{const e=d.querySelector(s);assert(e,s);assert(!e.disabled,s);e.click()},wait=()=>new Promise(r=>setTimeout(r,240));
(async()=>{
await w.TRANSFER_SERVICE.ready;w.PRODUCT_UI.navigate('inventory');I.applyFixture('demo-ten');await wait();
const facts=()=>JSON.stringify({products:w.ERP_DEMO.products,documents:w.GOLD.documents});
const view=()=>JSON.stringify({draft:S.draft,applied:S.applied,page:S.page,foldP:[...S.foldP],foldC:[...S.foldC],rows:W.snapshot.rows,total:W.snapshot.total});
const beforeFacts=facts();click('[data-i=fold-color]');const beforeView=view(),node=d.querySelector('#iw-results');node.scrollTop=150;node.scrollLeft=80;
click('[data-i=photo][data-id=M26001]');
check('文字入口/右侧认货Drawer/无复杂操作',()=>{assert.equal(d.querySelector('[data-i=photo]').textContent,'详情');assert(d.querySelector('#tc-dialog').open);assert(d.querySelector('#tc-dialog'));assert(d.querySelector('#tc-dialog-title').textContent.includes('M26001'));assert.equal(d.querySelectorAll('#tc-dialog [role=tab]').length,3);assert.equal(d.querySelector('#tc-dialog [aria-selected=true]').textContent,'商品信息');assert(![...d.querySelectorAll('#tc-dialog [role=tab]')].some(e=>e.textContent==='库存'));assert.equal(d.querySelectorAll('#tc-dialog input').length,0);assert.equal(d.querySelectorAll('#tc-dialog button:not([role=tab])').length,1)});
check('商品条码按颜色分组展示且无库存Tab',()=>{click('[data-t=detail-tab][data-tab=barcode]');assert(d.querySelector('#tc-dialog').textContent.includes('BC-M26001-1-1'));assert(d.querySelector('#tc-dialog').textContent.includes('BC-M26001-2-1'));assert.equal(d.querySelectorAll('.tc-barcode-detail tbody tr').length,20);click('[data-t=detail-tab][data-tab=product]')});
check('无图明确空态',()=>{assert(d.querySelector('.tc-product-info').textContent.includes('暂无商品图片'));assert(!d.querySelector('.tc-product-info img'))});
click('#tc-dialog [data-t=close-modal]');check('关闭保持原DOM/筛选/展开/位置',()=>{assert.equal(view(),beforeView);assert.equal(d.querySelector('#iw-results'),node);assert.equal(node.scrollTop,150);assert.equal(node.scrollLeft,80)});
click('[data-i=photo][data-id=M26002]');check('不同商品不串',()=>{assert(d.querySelector('#tc-dialog-title').textContent.includes('M26002'));assert(!d.querySelector('#tc-dialog-title').textContent.includes('M26001'))});click('#tc-dialog [data-t=close-modal]');
check('查看不修改商品/单据/库存',()=>assert.equal(facts(),beforeFacts));
// URL selection tests only; these are not real merchandise photographs.
const p=w.ERP_DEMO.products.find(p=>p.id==='M26001');p.images=[{role:'颜色配图',colorId:p.colorIds[0],url:'test-color.jpg'},{role:'主图',url:'test-main.jpg'}];
click('[data-i=photo][data-id=M26001]');check('商品级入口使用主图、不冒称颜色关联',()=>{assert.equal(d.querySelector('.tc-product-info img').getAttribute('src'),'test-main.jpg');assert(d.querySelector('.tc-detail-context').textContent.includes('商品级资料'));assert(!d.querySelector('#tc-dialog').textContent.includes('当前颜色'))});
d.querySelector('.tc-product-info img').dispatchEvent(new w.Event('error'));check('图片加载失败与无图分开',()=>{assert(d.querySelector('.tc-product-info img').hidden);assert(!d.querySelector('.tc-photo-error').hidden);assert(!d.querySelector('.tc-product-info').textContent.includes('暂无商品图片'))});click('#tc-dialog [data-t=close-modal]');p.images=[];
check('打印不出现详情入口',()=>assert(!I.printDocument().includes('iw-quick-detail')));check('无JS错误',()=>assert.deepEqual(errors,[]));
fs.mkdirSync(out,{recursive:true});fs.writeFileSync(out+'/checks.json',JSON.stringify({checks,photoLimit:'URL selection/error-event test only; no real merchandise photo available'},null,2));console.log(checks.length+' checks PASS');dom.window.close();
})().catch(e=>{console.error(e);dom.window.close();process.exitCode=1});
