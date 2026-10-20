const {JSDOM}=require('jsdom'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const dom=new JSDOM(html,{url:'http://127.0.0.1:8767/#products',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window,doc=w.document,errors=[];w.addEventListener('error',e=>errors.push(e.error?.message||e.message));
w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
w.eval(fs.readFileSync(path.join(root,'model.js'),'utf8'));w.eval(fs.readFileSync(path.join(root,'app.js'),'utf8'));
const results=[];function check(name,fn){fn();results.push(name);}
const click=s=>{const e=doc.querySelector(s);assert.ok(e,s);e.click();};
function change(s,value){const e=doc.querySelector(s);e.value=value;e.dispatchEvent(new w.Event('change',{bubbles:true}));}
function qty(key,value){const e=doc.querySelector(`[data-quantity="${key}"]`);e.value=value;e.dispatchEvent(new w.Event('input',{bubbles:true}));}
const tick=()=>new Promise(r=>setTimeout(r,0));async function route(name){w.location.hash=name;await tick();}
(async()=>{
 check('商品列表一款一行，共 4 款，M26001 只出现 1 行',()=>{assert.equal(doc.querySelectorAll('.products-table tbody tr').length,4);assert.equal([...doc.querySelectorAll('.products-table tbody tr')].filter(x=>x.textContent.includes('M26001')).length,1);});
 check('菜单顺序与用户指定一致',()=>{const nav=doc.querySelector('nav').textContent;assert(nav.indexOf('库存管理')<nav.indexOf('销货与退换'));assert(nav.indexOf('销货与退换')<nav.indexOf('商品管理'));assert.equal(doc.querySelectorAll('nav a').length,3);});
 doc.querySelector('[name=q]').value='不存在';doc.querySelector('#product-filter').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 check('商品搜索空结果明确，重置恢复列表',()=>{assert.equal(doc.querySelectorAll('.products-table tbody tr').length,0);click('[data-action=reset-product]');assert.equal(doc.querySelectorAll('.products-table tbody tr').length,4);});
 click('[data-detail=M26001]');check('商品详情打开，基础资料可修改',()=>{assert(doc.querySelector('#detail').open);assert(doc.querySelector('#detail-form'));});
 click('[data-detail-tab-only=specs]');check('规格页按两色四码显示 8 个规格',()=>assert.equal(doc.querySelectorAll('#detail tbody tr').length,8));
 click('[data-detail-tab-only=barcodes]');check('条码页含当前示意码和历史码，不伪造已核验',()=>{assert(doc.querySelector('#detail').textContent.includes('00-DEMO-OLD-A01'));assert(doc.querySelector('#detail').textContent.includes('未核验'));});
 click('[data-detail-tab-only=stock]');check('详情库存按 4 仓展示，总仓 77，全仓 124',()=>{assert.equal(doc.querySelectorAll('#detail tbody tr').length,4);assert(doc.querySelector('#detail').textContent.includes('124'));assert(doc.querySelector('#detail tbody tr').textContent.includes('77'));});
 click('[data-action=detail-to-inventory]');await tick();
 check('详情跳转独立库存状况，默认三仓合计 120',()=>{assert.equal(w.location.hash,'#inventory');assert(!doc.querySelector('#detail').open);assert.equal(doc.querySelector('.matrix tfoot td:last-child').textContent,'120');});
 click('[data-action=warehouses-clear]');check('零仓库显示未选择，不把它冒充库存 0',()=>{assert(!doc.querySelector('.matrix'));assert(doc.querySelector('#page').textContent.includes('尚未选择仓库'));});
 let cb=doc.querySelector('[data-warehouse=main]');cb.checked=true;cb.dispatchEvent(new w.Event('change',{bubbles:true}));
 check('单总仓矩阵行合计 39/38、列合计19/32/20/6、总计77',()=>{assert.deepEqual([...doc.querySelectorAll('.matrix tbody tr')].map(r=>r.lastElementChild.textContent),['39','38']);assert.deepEqual([...doc.querySelectorAll('.matrix tfoot td')].slice(1).map(e=>e.textContent),['19','32','20','6','77']);});
 click('[data-action=warehouses-all]');click('[data-mode=compare]');
 check('四仓分组共 8 行仓库明细、2 行小计，总计124',()=>{assert.equal(doc.querySelectorAll('.matrix tbody tr').length,10);assert.equal(doc.querySelector('.matrix tfoot td:last-child').textContent,'124');assert(doc.querySelector('.matrix .negative').textContent.includes('-1'));});
 click('[data-action=collapse-colors]');check('全部折叠保留两组小计和全仓总计',()=>{assert.equal(doc.querySelectorAll('.matrix tbody tr').length,2);assert.equal(doc.querySelector('.matrix tfoot td:last-child').textContent,'124');});
 click('[data-action=expand-colors]');click('[data-cell="0:2"][data-cell-warehouse=reserve]');check('点击负库存格可见仓库及规格来源',()=>{assert(doc.querySelector('#cell-insight').textContent.includes('备货仓：-1'));assert(doc.querySelector('#cell-insight').textContent.includes('藏青 / XL'));});
 change('#color-filter','1');check('颜色筛选更新合计并标记筛选范围',()=>{assert.equal(doc.querySelector('.matrix tfoot td:last-child').textContent,'60');assert(doc.querySelector('.matrix tfoot').textContent.includes('筛选合计'));});
 change('#inventory-product','M26004');check('长表压力样例有8色6码，四仓展开40行',()=>{assert.equal(doc.querySelectorAll('.matrix tbody tr').length,40);assert.equal(doc.querySelectorAll('.matrix thead th').length,9);});
 click('[data-action=collapse-colors]');check('长表全部折叠后8行，仓库范围不丢失',()=>assert.equal(doc.querySelectorAll('.matrix tbody tr').length,8));
 await route('transfer');
 const before=JSON.stringify(w.ERP_DEMO.products.map(p=>p.stock));
 check('调拨初始现存18、录入4，合计4件',()=>{assert.equal(doc.querySelector('[data-quantity="0:1"]').value,'4');assert(doc.querySelector('#transfer-summary').textContent.includes('4'));});
 qty('0:3','2');check('零库存录入2显示不足2，但预览未被禁止',()=>{assert(doc.querySelector('[data-quantity-warning="0:3"]').textContent.includes('不足 2'));assert.equal(doc.querySelector('#preview-transfer').disabled,false);});
 qty('0:0','1.5');check('非整数标错且阻止预览',()=>{assert.equal(doc.querySelector('#preview-transfer').disabled,true);assert.equal(doc.querySelector('[data-quantity="0:0"]').getAttribute('aria-invalid'),'true');});qty('0:0','');
 change('#transfer-to','main');check('同仓提示且阻止预览',()=>assert.equal(doc.querySelector('#preview-transfer').disabled,true));change('#transfer-to','outlet');
 click('[data-action=preview-transfer]');check('明细显示两条规格和数学预览，不表示已审核',()=>{assert(doc.querySelector('#preview').open);assert.equal(doc.querySelectorAll('#preview tbody tr').length,2);assert(doc.querySelector('#preview').textContent.includes('不是')||doc.querySelector('#preview').textContent.includes('不表示'));});click('[data-action=close-preview]');
 click('[data-action=draft-transfer]');check('草稿演示只保存会话状态，库存完全未变',()=>{assert(doc.querySelector('#draft-note').textContent.includes('已保存'));assert.equal(JSON.stringify(w.ERP_DEMO.products.map(p=>p.stock)),before);});
 change('#transfer-from','reserve');check('换调出仓保留数量并重新提示不足',()=>{assert.equal(doc.querySelector('[data-quantity="0:1"]').value,'4');assert(doc.querySelector('[data-quantity-warning="0:1"]').textContent.includes('不足 2'));});
 await route('products');click('[data-detail=M26001]');doc.querySelector('#detail-form [name=name]').value='商务免烫衬衫（体验修改）';doc.querySelector('#detail-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 check('档案演示修改反映到主列表但不改库存',()=>{assert(doc.querySelector('.products-table').textContent.includes('体验修改'));assert.equal(JSON.stringify(w.ERP_DEMO.products.map(p=>p.stock)),before);});
 check('前端运行无 JavaScript 事件错误',()=>assert.deepEqual(errors,[]));
 fs.writeFileSync(path.join(root,'verification-results.json'),JSON.stringify({scope:'Node DOM 模拟环境；非真实浏览器视觉或布局测试',passed:results.length,results},null,2));console.log(JSON.stringify({passed:results.length,results},null,2));dom.window.close();
})().catch(e=>{console.error(e);dom.window.close();process.exitCode=1});
