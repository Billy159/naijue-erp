const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const dom = new JSDOM('<div class="tc-layout"><div class="tc-section-head"></div><div class="tc-doc-header"></div><div id="tc-lines"></div><div id="tc-pop"></div>', {
  url: 'http://localhost/#transfer/new',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
});
const w = dom.window;
const d = w.document;
const product = (id, styleNumber, fitId) => ({
  id, styleNumber, fitId, fit: `${fitId}版`, name: '针织衫',
  colors: ['黑色', '白色'], colorIds: ['black', 'white'],
  sizes: ['165/S'], sizeIds: ['s'], sizeSystem: 'custom', groupId: 'S',
  barcodes: { 'black|s': { current: `${id}-black-s` }, 'white|s': { current: `${id}-white-s` } },
});
const products = [product('STYLE-B', 'STYLE', 'B'), product('STYLE-A', 'STYLE', 'A'), product('SOLO-B', 'SOLO', 'B')];
const doc = { id: 'DOC', status: '未审核', items: [], hiddenColors: [], q: {}, scans: [], matrixRowIds: {}, from: 'from', to: 'to' };
let barcodeResolve = () => ({ matches: [] });
w.crypto.randomUUID = () => `row-${Math.random()}`;
w.ERP_DEMO = { products, warehouses: [] };
w.TRANSFER_UI = { state: { doc, ready: true, lease: { expires: Date.now() + 60000 }, scroll: { top: 0, left: 0 }, touched: {}, route: 'transfer/new' } };
w.PRODUCT_CATALOG = { fits2026: [{ id: 'A' }, { id: 'B' }], fit: id => ({ name: `${id}版` }), resolve: code => barcodeResolve(code) };
w.INVENTORY_SELECT_BRIDGE = { previewData: id => ({ fields: [['款号', id]], photos: [] }) };
w.INTERACTION_COMMON = { replacement: () => { let current; return {
  begin(id, snapshot, cancel) { current = { id, snapshot, cancel }; },
  cancel() { const old = current; current = null; old?.cancel(); },
  finish() { current = null; },
}; } };
w.toast = () => {};
w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
w.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
w.SCAN_WORKBENCH = { target: '', pause() {}, unbind() {}, raise() {} };
w.render = () => {};
w.HTMLElement.prototype.scrollIntoView = function () {};
for (const name of ['product-finder.js', 'matrix-sections.js', 'transfer-print-template.js', 'transfer-matrix-experiment.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, name), 'utf8'), dom.getInternalVMContext(), { filename: name });
}

const pending = () => w.TRANSFER_MATRIX_EXPERIMENT.state.pending;
const search = async (id, resultId = id) => {
  const input = d.querySelector('#mx-transfer-search');
  input.value = id;
  input.dispatchEvent(new w.Event('input', { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 0));
  const result = [...d.querySelectorAll('#transfer-product-finder [data-finder-option]')].find(el => el.textContent.includes(resultId));
  assert(result, `finder result ${id}: ${d.querySelector('#transfer-product-finder')?.innerHTML}`);
  result.click();
};
const change = (selector, value) => {
  const el = d.querySelector(selector);
  assert(el, selector);
  el.value = value;
  el.dispatchEvent(new w.Event('change', { bubbles: true }));
};
const enterQuantity = (value = '1') => {
  const field = d.querySelector('[data-mx-draft-qty]');
  assert(field, 'draft size input is available');
  field.value = value;
  field.dispatchEvent(new w.Event('input', { bubbles: true }));
  field.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
};

(async () => {
  await search('STYLE-B');
  assert.equal(pending().productId, 'STYLE-A', 'A fit is the default for a shared style');
  assert.equal(pending().fitId, 'A');
  assert.equal(d.querySelector('.mx-entry-identity .mx-inline-name').textContent, '针织衫');
  assert.equal(d.querySelector('.mx-entry-identity #mx-transfer-search').value, 'STYLE-A');
  change('#mx-transfer-color', 'black');
  assert.equal(pending().fitId, 'A');
  assert.equal(doc.items.length, 0, 'choosing a color only stages a draft row');
  change('#mx-transfer-fit', 'B');
  assert.equal(doc.items.length, 0, 'choosing a fit does not add a zero quantity row');
  assert.equal(pending().productId, 'STYLE-B');
  enterQuantity('2');
  assert(doc.items.includes('STYLE-B'), 'the first quantity commits the B source product');
  assert(!doc.items.includes('STYLE-A'));
  assert(d.querySelector('[data-mx-row="STYLE-B|0"]'));
  assert.equal(doc.q['STYLE-B|0|0'], 2);
  assert(d.querySelector('#tc-lines > .mx-draft-dock .mx-draft-row'), 'the empty row stays at the end of the matrix');
  assert.equal(d.querySelector('.mx-section thead th').textContent, '款号／商品名称');
  assert.equal(d.querySelector('.mx-product-line strong').textContent, 'STYLE-B');
  assert.equal(d.querySelector('.mx-product-line > span').textContent, '针织衫');
  assert(d.querySelector('tbody .mx-fit-col').textContent.startsWith('B版'));

  delete products.find(p => p.id === 'STYLE-A').barcodes['white|s'];
  await search('STYLE-A');
  assert.equal(pending().fitId, 'A');
  change('#mx-transfer-color', 'white');
  assert.equal(pending().productId, 'STYLE-B', 'a color unavailable in A falls back to its available fit');
  assert(!d.querySelector('[data-mx-row="STYLE-B|1"]'));
  enterQuantity();
  assert(d.querySelector('[data-mx-row="STYLE-B|1"]'));

  await search('SOLO-B');
  assert.equal(pending().fitId, 'B', 'first available fit is used when A is unavailable');
  change('#mx-transfer-color', 'white');
  assert(!doc.items.includes('SOLO-B'));
  enterQuantity();
  assert(doc.items.includes('SOLO-B'));
  assert(d.querySelector('[data-mx-row="SOLO-B|1"]'));
  assert(!d.querySelector('[data-mx-row="STYLE-A|0"]'));

  const barcodeA = product('BAR-A', 'BAR', 'A');
  const barcodeB = product('BAR-B', 'BAR', 'B');
  products.push(barcodeA, barcodeB);
  barcodeResolve = code => code === 'BAR-B-black-s'
    ? { matches: [{ p: barcodeB, c: 0, s: 0 }] }
    : { matches: [] };
  await search('BAR-B-black-s', 'BAR-B');
  assert.equal(pending().productId, 'BAR-B', 'an exact barcode keeps its source fit identity in the draft');
  enterQuantity();
  assert(doc.items.includes('BAR-B'));
  assert(!doc.items.includes('BAR-A'));

  d.querySelector('[data-mx-row="STYLE-B|0"] [data-mx=replace-fit]').click();
  assert.equal(pending().replace, 'STYLE-B|0');
  assert.equal(pending().quantities.s, 2, 'replacement stages the current size quantity');
  change('#mx-transfer-fit', 'A');
  assert.equal(doc.q['STYLE-B|0|0'], 2, 'selecting a new fit does not mutate the source row');
  d.querySelector('[data-mx=replace-apply]').click();
  assert.equal(doc.q['STYLE-A|0|0'], 2, 'confirming moves the quantity to the new fit');
  assert.equal(doc.q['STYLE-B|0|0'], undefined);
  assert(d.querySelector('[data-mx-row="STYLE-A|0"]'));

  d.querySelector('[data-mx-row="STYLE-A|0"] [data-mx=replace-color]').click();
  change('#mx-transfer-color', 'white');
  d.querySelector('[data-mx=replace-apply]').click();
  assert(d.querySelector('#mx-transfer-dialog[open]'), 'an existing target row requires merge confirmation');
  assert.equal(doc.q['STYLE-A|0|0'], 2, 'source stays intact before confirming the merge');
  d.querySelector('#mx-transfer-dialog [data-mx=confirm]').click();
  assert.equal(doc.q['STYLE-B|1|0'], 3, 'confirmed merge adds quantities without another row');
  assert.equal(doc.q['STYLE-A|0|0'], undefined);
  assert.equal(d.querySelectorAll('[data-mx-row="STYLE-B|1"]').length, 1);

  // The inline correction picker must handle a real style with many colors without
  // putting its menu inside the scrolling matrix or treating a placeholder as a value.
  const colorProducts = Array.from({ length: 12 }, (_, i) => ({
    ...product(`COLOR-${i}`, 'COLOR-STYLE', i >= 10 ? 'B' : 'A'),
    colors: [`颜色${i}`], colorIds: [`color-${i}`],
    barcodes: { [`color-${i}|s`]: { current: `COLOR-${i}-s` } },
  }));
  colorProducts.push({ ...product('COLOR-0-B', 'COLOR-STYLE', 'B'),
    colors: ['颜色0'], colorIds: ['color-0'],
    barcodes: { 'color-0|s': { current: 'COLOR-0-B-s' } },
  });
  products.push(...colorProducts);
  doc.items.push('COLOR-0');
  doc.q['COLOR-0|0|0'] = 3;
  w.render();
  d.querySelector('[data-mx-row="COLOR-0|0"] [data-mx=replace-color]').click();
  const colorMenu = d.querySelector('#mx-transfer-spec-menu');
  assert.equal(colorMenu.parentElement, d.body, 'the color menu is portaled outside the scrolling table');
  assert.equal(colorMenu.querySelectorAll('[data-mx-spec-option]').length, 12, 'all style colors are available');
  assert.equal([...colorMenu.querySelectorAll('[data-mx-spec-option]')].some(el => el.textContent.trim() === '颜色'), false);
  [...colorMenu.querySelectorAll('[data-mx-spec-option]')].find(el => el.textContent.includes('颜色11')).click();
  assert.equal(pending().productId, 'COLOR-11');
  assert.equal(pending().fitId, 'B', 'changing to a B-only color selects that product fit');
  assert.equal(doc.q['COLOR-0|0|0'], 3, 'choosing a color still does not change the source row');
  d.querySelector('#mx-transfer-fit').click();
  assert.deepEqual([...colorMenu.querySelectorAll('[data-mx-spec-option]')].map(el => el.textContent.trim()), ['B版✓'], 'only that color’s available fit is shown');
  d.querySelector('#mx-transfer-color').click();
  [...colorMenu.querySelectorAll('[data-mx-spec-option]')].find(el => el.textContent.includes('颜色0')).click();
  d.querySelector('#mx-transfer-fit').click();
  assert.deepEqual([...colorMenu.querySelectorAll('[data-mx-spec-option]')].map(el => el.textContent.replace('✓', '').trim()), ['A版', 'B版'], 'a color with two actual fits lists only those fits');
  d.querySelector('[data-mx=replace-cancel]').click();
  assert.equal(doc.q['COLOR-0|0|0'], 3, 'cancel leaves the original quantity untouched');
  assert.equal(d.querySelectorAll('[data-mx-row="COLOR-11|0"]').length, 0);

  d.querySelector('[data-mx-row="COLOR-0|0"] [data-mx=replace-color]').click();
  doc.q['COLOR-0|0|0'] = 4;
  w.render();
  assert.match(d.querySelector('.mx-inline-replacement').textContent, /原行数量已变化/, 'a changed source row explains why its staged replacement cannot be confirmed');
  assert.equal(d.querySelector('[data-mx=replace-apply]').disabled, true);
  assert.equal(w.TRANSFER_MATRIX_EXPERIMENT.applyReplace(), false, 'a stale replacement cannot overwrite a scanned quantity');
  assert.equal(doc.q['COLOR-0|0|0'], 4);
  d.querySelector('[data-mx=replace-cancel]').click();
  doc.q['COLOR-0|0|0'] = 3;
  w.render();

  d.querySelector('[data-mx-row="COLOR-0|0"] [data-mx=replace-color]').click();
  const stagedQuantity = d.querySelector('.mx-inline-replacement [data-mx-replace-qty]');
  stagedQuantity.value = '5';
  stagedQuantity.dispatchEvent(new w.Event('input', { bubbles: true }));
  assert.equal(d.querySelector('.mx-inline-replacement .tc-subtotal').textContent, '5');
  d.querySelector('[data-mx=replace-apply]').click();
  assert.equal(doc.q['COLOR-0|0|0'], 5, 'confirm applies quantity edits even when the SKU identity stays the same');

  d.querySelector('[data-mx-row="COLOR-0|0"] [data-mx=replace-color]').click();
  const replaceSearch = d.querySelector('.mx-inline-replacement #mx-transfer-search');
  replaceSearch.value = 'COLOR-';
  replaceSearch.dispatchEvent(new w.Event('input', { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 0));
  const compactFinder = d.querySelector('#transfer-replacement-finder');
  assert.equal(compactFinder.classList.contains('pf-compact'), true);
  assert.equal(compactFinder.querySelectorAll('[data-finder-option]').length, 1, 'search groups color variants as one style');
  assert.equal(compactFinder.querySelector('.pf-preview'), null, 'inline search does not cover the table with a large preview card');
  replaceSearch.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  assert.equal(pending().productId, 'COLOR-0', 'Enter accepts an unambiguous style code without waiting for a second click');
  d.querySelector('[data-mx=replace-cancel]').click();

  w.REAL_DATA_MODE = true;
  w.PRODUCT_CATALOG.group = id => id === 'UPPER' ? { sizes: ['160/XS', '165/S', '170/M', '175/L', '180/XL', '185/2XL', '190/3XL', '195/4XL', '200/5XL', '205/6XL', '无尺码'].map(name => ({ id: name, name })) } : null;
  const mapped = { ...product('005CS5371652', '005CS5371652', 'A'), uuid: '99a0f589-e51f-e8a3-b24c-10c538d62f78',
    colors: ['灰色'], colorIds: ['gray'], sizes: ['165/S'], sizeIds: ['source-165'], stock: {},
    barcodes: { 'gray|source-165': { current: '' } },
    legacySizeRecords: [{ id: 'source-165', name: '165/S', sourceName: '175/92A', standardGroup: '2026年男装上衣尺码组', standardFit: 'A版' }] };
  products.push(mapped);
  doc.items.push(mapped.id);
  doc.q[`${mapped.id}|0|0`] = 1;
  w.render();
  const row = d.querySelector(`[data-mx-row="${mapped.id}|0"]`);
  assert(row, 'mapped product row is visible');
  const firstSize = row.querySelector('[data-t-size="draft:2026年男装上衣尺码组|160/XS"]');
  assert(firstSize, '160/XS is editable even when this product has no original SKU');
  assert.equal(firstSize.dataset.tQty, `${mapped.id}|0|1`);
  assert.equal(d.querySelector('[data-size-system="mapped:2026年男装上衣尺码组"] thead').textContent.includes('无尺码'), true);
  doc.q[firstSize.dataset.tQty] = '3';
  w.render();
  assert.equal(d.querySelector(`[data-mx-row="${mapped.id}|0"] [data-t-row]`).textContent, '4');
  assert.equal(w.TRANSFER_MATRIX_EXPERIMENT.report().some(line => line[0] === mapped.id && line.includes(3)), true);

  const pantsSizes = ['29', '30', '31', '32', '33', '34', '35', '36', '38', '无尺码'];
  const pants = { ...product('PANTS-ALIGN', 'PANTS-ALIGN', 'A'),
    sizeIds: pantsSizes.map((_, i) => `pants-${i}`), sizes: pantsSizes,
    legacySizeRecords: pantsSizes.map((name, i) => ({ id: `pants-${i}`, name, sourceName: name, standardGroup: '男装裤子尺码组' })),
    stock: {}, barcodes: {} };
  products.push(pants);
  doc.q['PANTS-ALIGN|0|0'] = 1;
  const matrix = d.createElement('div');
  matrix.innerHTML = w.TRANSFER_MATRIX_EXPERIMENT.renderTable(true, doc);
  const upper = matrix.querySelector('[data-size-system="mapped:2026年男装上衣尺码组"]');
  const lower = matrix.querySelector('[data-size-system="mapped:男装裤子尺码组"]');
  const upperHeads = [...upper.querySelectorAll('thead th')];
  const lowerHeads = [...lower.querySelectorAll('thead th')];
  assert.equal(upperHeads.length, lowerHeads.length, 'upper and pants groups use the same column count');
  assert.equal(lowerHeads[3].textContent, '29', 'pants size 29 starts under upper 160/XS');
  assert(lowerHeads.at(-3).classList.contains('mx-size-gap'), 'one missing pants size is a blank column before no-size');
  assert.equal(lowerHeads.at(-2).textContent, '无尺码');
  assert.equal(upperHeads.at(-1).textContent, lowerHeads.at(-1).textContent, 'subtotals share a column');
  assert.equal(upper.querySelector('colgroup').children.length, lower.querySelector('colgroup').children.length);

  const orderedNames = ['女装西裤尺码组2', '男装裤子尺码组', '女装上衣尺码组1', '2026年男装上衣尺码组'];
  const orderRows = orderedNames.map((name, index) => {
    const p = { ...product(`GROUP-${index}`, `GROUP-${index}`, 'A'), legacySizeRecords: [{ id: `group-size-${index}`, name: '29', sourceName: '29', standardGroup: name }] };
    products.push(p);
    return { p: p.id, c: 0 };
  });
  assert.deepEqual(Array.from(w.MATRIX_SECTIONS.displaySections(orderRows, products, w.PRODUCT_CATALOG), x => x.name),
    ['2026年男装上衣尺码组', '男装裤子尺码组', '女装上衣尺码组1', '女装西裤尺码组2']);
  assert(fs.readFileSync(path.join(root, 'inventory-matrix-experiment.js'), 'utf8').includes('款号／商品名称'));
  const lines = d.querySelector('#tc-lines');
  Object.defineProperty(lines, 'clientHeight', { configurable: true, value: 160 });
  Object.defineProperty(lines, 'scrollHeight', { configurable: true, value: 150 });
  w.dispatchEvent(new w.Event('resize'));
  assert(!lines.querySelector('.mx-draft-dock').classList.contains('mx-draft-pinned'), 'short lists keep the empty row directly after the last detail');
  Object.defineProperty(lines, 'scrollHeight', { configurable: true, value: 500 });
  w.dispatchEvent(new w.Event('resize'));
  assert(lines.querySelector('.mx-draft-dock').classList.contains('mx-draft-pinned'), 'overflowing lists pin the empty row at the bottom');
  const printButton = d.createElement('button');
  printButton.dataset.t = 'print';
  d.body.append(printButton);
  printButton.click();
  const printDialog = d.querySelector('.transfer-print-dialog');
  assert(printDialog, 'the transfer print action opens the new preview even for an unsaved document');
  assert.match(printDialog.querySelector('iframe').srcdoc, /@page\{size:241mm 552mm;margin:0\}/);
  assert.match(printDialog.querySelector('iframe').srcdoc, /未保存内容预览/);
  printDialog.querySelector('[data-print-close]').click();
  console.log('transfer fit, missing sizes, group order, and product layout checks PASS');
  w.close();
})().catch(error => {
  console.error(error);
  w.close();
  process.exitCode = 1;
});
