const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const dom = new JSDOM('<div class="tc-layout"><div class="tc-section-head"></div><div class="tc-doc-header"></div><div id="tc-lines"></div><div id="tc-pop"></div>', {
  url: 'http://localhost/#transfer/doc/HISTORY', runScripts: 'outside-only', pretendToBeVisual: true,
});
const w = dom.window, d = w.document;
const records = [
  ['size-39', '170/M', '170/88A 39'],
  ['size-40', '175/L', '175/92A  40'],
  ['size-41', '175/L', '175/96A 41'],
  ['size-43', '180/XL', '180/104A  43'],
  ['size-42', '180/XL', '180/100A  42'],
  ['size-44', '180/XL', '180/108A 44'],
].map(([id, name, sourceName]) => ({ id, name, sourceName, standardGroup: '男装上衣尺码', standardFit: 'A版' }));
const p = {
  id: '586CS5361723', uuid: 'historical-product', name: '长袖衬衫', fitId: 'A', fit: 'A版（标准）',
  sizeSystem: 'legacy', groupId: 'historical-shirt', colors: ['蓝色'], colorIds: ['blue'],
  sizes: records.map(s => s.name), sizeIds: records.map(s => s.id), legacySizeRecords: records,
  barcodes: Object.fromEntries(records.map((s, i) => ['blue|' + s.id, { current: '9536172350110' + i }])),
};
const doc = { id: 'HISTORY', status: '未审核', items: [p.id], hiddenColors: [], scans: [],
  q: { '586CS5361723|0|1': 4, '586CS5361723|0|3': 1, '586CS5361723|0|4': 1 }, matrixRowIds: {} };
let opened;
w.structuredClone = structuredClone;
w.REAL_DATA_MODE = true;
w.ERP_DEMO = { products: [p], warehouses: [] };
w.PRODUCT_CATALOG = { fit: () => ({ name: 'A版（标准）' }), fits2026: [{ id: 'A' }], resolve: () => ({ matches: [] }), group: () => null };
w.TRANSFER_UI = { state: { doc, ready: true, lease: { expires: Date.now() + 60000 }, scroll: { top: 0, left: 0 }, touched: {}, route: 'transfer/doc/HISTORY' },
  setSkuQuantity(key, value) { if (Number(value)) doc.q[key] = Number(value); else delete doc.q[key]; return true; } };
w.TRANSFER_HISTORY_QUANTITY = { open(config) { opened = config; } };
w.toast = () => {};
w.render = () => {};
w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
w.HTMLDialogElement.prototype.close = function () { this.open = false; };
w.HTMLElement.prototype.scrollIntoView = function () {};
for (const file of ['interaction-common.js', 'product-finder.js', 'matrix-sections.js', 'transfer-matrix-experiment.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), dom.getInternalVMContext(), { filename: file });
}
const checks = [];
const check = (name, fn) => { fn(); checks.push(name); };
const matrix = w.TRANSFER_MATRIX_EXPERIMENT;
const cell = label => {
  const table = d.querySelector('.mx-section .mx-table');
  const index = [...table.querySelectorAll('thead th')].findIndex(th => th.textContent === label);
  assert(index >= 0, label);
  return table.querySelector('tbody tr').cells[index];
};
try {
  check('历史尺码映射同一列时只显示一个数量入口', () => {
    for (const label of ['175/L', '180/XL']) assert.equal(cell(label).querySelectorAll('input,button').length, 1, label + ' must stay compact');
    assert(!cell('180/XL').querySelector('br'));
  });
  const original = JSON.stringify(doc.q);
  check('显示合计但保留各历史 SKU 数量', () => {
    assert.equal(cell('175/L').querySelector('[data-mx-quantity-total]').textContent, '4');
    assert.equal(cell('180/XL').querySelector('[data-mx-quantity-total]').textContent, '2');
    assert.equal(JSON.stringify(doc.q), original);
  });
  cell('180/XL').querySelector('button').click();
  check('编辑明细包含原尺码及独立数量，打开不改草稿', () => {
    assert.deepEqual(Array.from(opened.rows, r => r.name), ['180/104A  43', '180/100A  42', '180/108A 44']);
    assert.deepEqual(Array.from(opened.rows, r => r.value), [1, 1, 0]);
    assert.equal(JSON.stringify(doc.q), original);
  });
  check('非法数量或已变化的源值不允许覆盖', () => {
    assert.equal(opened.onConfirm({ 'size-43': -1, 'size-42': 1, 'size-44': 0 }), false);
    assert.equal(JSON.stringify(doc.q), original);
    doc.q[p.id + '|0|3'] = 2;
    assert.equal(opened.onConfirm({ 'size-43': 3, 'size-42': 1, 'size-44': 0 }), false);
    doc.q[p.id + '|0|3'] = 1;
  });
  check('确认只修改对应原 SKU，不重新分摊或合并', () => {
    assert.equal(opened.onConfirm({ 'size-43': 2, 'size-42': 1, 'size-44': 0 }), true);
    assert.equal(doc.q[p.id + '|0|3'], 2);
    assert.equal(doc.q[p.id + '|0|4'], 1);
    assert.equal(doc.q[p.id + '|0|1'], 4);
    assert.equal(doc.q[p.id + '|0|5'], undefined);
    assert.deepEqual(p.sizeIds, records.map(s => s.id));
  });
  matrix.beginReplace(p.id + '|0');
  d.querySelector('.mx-inline-replacement [data-mx="history-qty"][data-mx-size-ids*="size-43"]').click();
  const replacementOriginal = JSON.stringify(doc.q);
  check('行修改中的原尺码数量先暂存，取消整行保留原值', () => {
    assert.equal(opened.onConfirm({ 'size-43': 5, 'size-42': 1, 'size-44': 0 }), true);
    assert.equal(matrix.state.pending.quantities['size-43'], 5);
    assert.equal(JSON.stringify(doc.q), replacementOriginal);
    matrix.cancelReplace();
    assert.equal(JSON.stringify(doc.q), replacementOriginal);
  });
  const next = { ...p, id: 'NEW-SHIRT', uuid: 'new-shirt' };
  w.ERP_DEMO.products.push(next);
  matrix.state.pending = { query: next.id, productId: next.id, colorId: 'blue', fitId: 'A', quantities: {} };
  matrix.render();
  d.querySelector('.mx-draft-row [data-mx="history-qty"][data-mx-size-ids*="size-43"]').click();
  check('新增行按原尺码同时录入，保留各 SKU 并只加入一行', () => {
    assert.equal(opened.onConfirm({ 'size-43': 2, 'size-42': 3, 'size-44': 0 }), true);
    assert.equal(doc.q[next.id + '|0|3'], 2);
    assert.equal(doc.q[next.id + '|0|4'], 3);
    assert.equal(doc.items.filter(id => id === next.id).length, 1);
    assert.equal(d.querySelectorAll('[data-mx-row="NEW-SHIRT|0"]').length, 1);
  });
  w.TRANSFER_UI.state.doc.status = '已审核';
  matrix.render();
  cell('180/XL').querySelector('button').click();
  check('已审核仍可查看原尺码，不能改数量', () => {
    assert.equal(opened.editable, false);
    const before = JSON.stringify(doc.q);
    assert.equal(opened.onConfirm({ 'size-43': 5, 'size-42': 1, 'size-44': 0 }), false);
    assert.equal(JSON.stringify(doc.q), before);
  });
  check('打印和导出按尺码汇总，原数量总计保持正确', () => {
    const printed = new w.DOMParser().parseFromString(matrix.renderTable(true), 'text/html');
    assert.equal(printed.querySelectorAll('input,button').length, 0);
    assert.equal(printed.querySelector('tr[data-mx-row]').cells[5].textContent, '3');
    const report = matrix.report(), row = report.find(row => row[0] === p.id);
    assert.equal(row.at(-1), 7);
  });
  console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
} finally { w.close(); }
