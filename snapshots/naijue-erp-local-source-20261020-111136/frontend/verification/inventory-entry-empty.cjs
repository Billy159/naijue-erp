const { JSDOM } = require('jsdom');
const { readFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const root = resolve(__dirname, '..');
const dom = new JSDOM(readFileSync(join(root, 'index.html'), 'utf8'), {
  url: 'http://127.0.0.1:8877/#inventory',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
});
const { window: w } = dom;
const { document: d } = w;
w.REAL_DATA_MODE = true;
w.structuredClone = structuredClone;
w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
w.HTMLDialogElement.prototype.close = function () { this.open = false; };
for (const file of ['model.js', 'app.js', 'product-legacy-sizes.js', 'product-catalog.js', 'engine.js', 'gold.js', 'inventory-result.js', 'inventory-workbench.js']) {
  vm.runInContext(readFileSync(join(root, file), 'utf8'), dom.getInternalVMContext(), { filename: file });
}

assert(d.querySelector('.iw-bootstrap'), 'Initial inventory page must render its shell while master data loads');
assert(d.querySelector('.iw-head h1')?.textContent === '库存状况表');
assert(d.querySelector('#inventory-arco-empty')?.dataset.title === '等待查询');
assert(d.querySelector('[data-i=query]')?.disabled, 'Query cannot use fixture data before real master data is ready');
assert(!d.querySelector('#page').textContent.includes('正在读取真实数据'));

let requests = 0;
w.LEGACY_REAL = { inventoryReady: true, inventory: async query => { requests++; return { query, products: [], rows: [], productCount: 0, warehouses: [], total: 0 }; } };
w.render();
assert(!d.querySelector('.iw-bootstrap'), 'Real filter page must replace the shell when master data is ready');
assert(d.querySelector('[data-i=query]') && !d.querySelector('[data-i=query]').disabled);
assert(d.querySelector('#inventory-arco-empty')?.dataset.title === '等待查询');
assert.equal(requests, 0, 'Opening inventory must not query stock');

(async () => {
  await w.INVENTORY_UI.query();
  assert.equal(requests, 1, 'Only the explicit query may request inventory');
  assert.equal(d.querySelector('#inventory-arco-empty')?.dataset.title, '暂无符合条件的库存');
  console.log('Inventory entry shell, Arco empty host, and query timing: passed');
  w.close();
})().catch(error => { console.error(error); w.close(); process.exitCode = 1; });
