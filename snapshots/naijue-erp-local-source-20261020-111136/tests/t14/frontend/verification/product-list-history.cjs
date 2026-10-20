const {JSDOM}=require('jsdom');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');

const root=path.resolve(__dirname,'..');
const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{
  url:'http://127.0.0.1:8877/#products',runScripts:'outside-only',pretendToBeVisual:true,
});
const w=dom.window;
w.structuredClone=structuredClone;
w.HTMLDialogElement.prototype.showModal=function(){this.open=true};
w.HTMLDialogElement.prototype.close=function(){this.open=false};
for(const file of ['model.js','app.js','product-legacy-sizes.js','product-catalog.js','barcode-2026.js','product-master.js','engine.js','gold.js','inventory-result.js','inventory-fit-projection.js','inventory-workbench.js','product-current.js']){
  vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),dom.getInternalVMContext(),{filename:file});
}

const products=w.ERP_DEMO.products,state=w.PRODUCT_UI.state;
assert(products.length>2);
products[0].createdAt='2020-01-01T00:00:00Z';
products[1].createdAt='2030-01-01T00:00:00Z';
w.render();
const headers=[...w.document.querySelectorAll('.pc-list-table th')].map(x=>x.textContent.trim());
assert(headers.includes('版型')&&headers.includes('厚薄')&&!headers.includes('版型 / 厚薄'));
assert.equal(w.document.querySelector('.pc-product-code').textContent,products[1].id);
assert.equal(w.document.querySelector('.pc-list-table tbody tr td:last-child').textContent.trim(),'编辑');
assert.equal(w.document.querySelector('.pc-list-table tbody tr td:first-child a'),null);

state.filterDraft.fitId=['regular'];
w.document.querySelector('#pc-filter').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
assert(w.document.querySelectorAll('.pc-list-table tbody tr').length>0);
w.document.querySelector('[data-pc=reset-filter]').click();
assert.equal(w.document.querySelector('.pc-product-code').textContent,products[1].id);

products[1].historicalUnmappedSkus=[{
  skuId:'OLD-SKU-1',color:'旧颜色',fit:'',size:'旧尺码',barcodes:['完整历史条码'],
  warehouses:[{warehouseId:w.ERP_DEMO.warehouses[0].id,quantity:-2}],
}];
products[1].productBarcodes=[{barcode:'未绑定 SKU 的完整条码',product_id:products[1].uuid,sku_id:null,sku_binding_known:false}];
w.location.hash='#product/'+products[1].id;
w.render();
w.document.querySelector('[data-pc=tab][data-tab=specs]').click();
assert(w.document.querySelector('.pc-historical-skus summary')?.textContent.includes('存在历史未映射规格'));
assert(w.document.querySelector('.pc-historical-unbound')?.textContent.includes('未绑定 SKU 的完整条码'));
console.log('Product list order, filters, columns, actions, and historical SKU detail: passed');
dom.window.close();
