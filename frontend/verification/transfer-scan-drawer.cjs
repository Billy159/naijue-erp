const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const dom = new JSDOM('<main><input data-t-qty="P1|0|0"><input data-t-qty="P1|0|1"></main>', {
  url: 'http://localhost/#transfer/doc/D1', runScripts: 'outside-only', pretendToBeVisual: true,
});
const w = dom.window;
const d = w.document;
const product = { id: 'P1', name: '长袖衬衫', colors: ['蓝色'], sizes: ['160/XS', '165/S'], fitId: 'A', fit: 'A版（标准）' };
const doc = { id: 'D1', status: '未审核', saved: true, q: {}, items: [], hiddenColors: [], scans: [] };
const state = { doc, ready: true, lease: { expires: Date.now() + 60000 }, busy: false, blocked: '', viewLatest: false };
w.ERP_DEMO = { products: [product] };
w.TRANSFER_UI = {
  state,
  async renewLease() { state.lease.expires = Date.now() + 60000; },
  async scan(code) {
    if (code === 'BAD') return { ok: false, error: '条码不存在，未加入' };
    const key = code === 'B2' ? 'P1|0|1' : 'P1|0|0';
    const before = Number(doc.q[key] || 0);
    doc.q[key] = before + 1;
    if (code === 'PARTIAL') return { ok: false, partial: true, key, before, after: before + 1, productId: 'P1', colorIndex: 0, sizeIndex: 0, error: '扫码记录提交失败，数量可能已暂存；请核对明细后再继续扫码' };
    return { ok: true, key, before, after: before + 1, productId: 'P1', colorIndex: 0, sizeIndex: Number(key.at(-1)) };
  },
  setSkuQuantity(key, quantity) {
    if (quantity) doc.q[key] = quantity;
    else delete doc.q[key];
    const outer = d.querySelector(`[data-t-qty="${key}"]`);
    if (outer) outer.value = quantity ? String(quantity) : '';
    w.TRANSFER_SCAN_DRAWER?.refresh();
    return true;
  },
};
let scanned = 0;
w.TRANSFER_MATRIX_EXPERIMENT = { state: { pending: { replace: 'P1|0' } }, afterScan() { scanned++; }, afterSkuDelete() {} };
w.crypto.randomUUID = () => String(Math.random());
vm.runInContext(fs.readFileSync(path.join(root, 'transfer-scan-drawer.js'), 'utf8'), dom.getInternalVMContext(), { filename: 'transfer-scan-drawer.js' });
const drawer = w.TRANSFER_SCAN_DRAWER;
const tick = () => new Promise(resolve => setTimeout(resolve, 10));
const enter = async code => {
  const input = d.querySelector('#transfer-scan-input');
  input.value = code;
  input.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  await tick();
  assert.equal(input.value, '', 'each scan clears the input');
  assert.equal(input.disabled, false, 'each scan leaves input enabled');
  assert.equal(d.activeElement, input, 'each scan restores scanning focus');
};

(async () => {
  drawer.show();
  const input = d.querySelector('#transfer-scan-input');
  assert.equal(input.disabled, false, 'an unreviewed document remains scannable while a row replacement is staged');
  assert.equal(d.activeElement, input, 'opening focuses the scan input');
  await enter('B1');
  w.TRANSFER_MATRIX_EXPERIMENT.state.pending = {};
  assert.equal(doc.q['P1|0|0'], 1);
  assert.equal(d.querySelectorAll('[data-transfer-sku]').length, 1);
  assert.match(d.querySelector('[data-transfer-scan-feedback]').textContent, /新增成功/);
  assert.equal(d.querySelector('[data-transfer-count]').textContent, '1 条明细');
  assert(d.querySelector('[data-transfer-sku="P1|0|0"]').classList.contains('tsd-row-current'), 'scanned SKU is highlighted');
  await enter('B1');
  assert.equal(doc.q['P1|0|0'], 2);
  assert.equal(d.querySelectorAll('[data-transfer-sku]').length, 1, 'the same SKU occupies one row');
  assert.match(d.querySelector('[data-transfer-scan-feedback]').textContent, /数量 \+1/);
  assert.match(d.querySelector('[data-transfer-scan-feedback]').textContent, /1\s*→\s*2/);
  input.value = 'BAD';
  input.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  input.value = 'B2';
  input.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  await tick();
  assert.equal(doc.q['P1|0|0'], 2);
  assert.equal(doc.q['P1|0|1'], undefined, 'queued scans after a failure are not processed');
  assert.equal(input.disabled, true, 'failure pauses scanning');
  assert.match(d.querySelector('[data-transfer-scan-feedback]').textContent, /扫码失败/);
  assert.match(d.querySelector('[data-transfer-scan-feedback]').textContent, /BAD/);
  await new Promise(resolve => setTimeout(resolve, 2800));
  assert.equal(d.querySelector('[data-transfer-scan-feedback]').dataset.state, 'error', 'failure stays visible');
  d.querySelector('[data-transfer-ignore]').click();
  assert.equal(input.disabled, false);
  assert.equal(d.activeElement, input);
  assert.match(d.querySelector('[data-transfer-scan-feedback]').textContent, /待扫码/);
  await enter('B2');
  assert.equal(d.querySelectorAll('[data-transfer-sku]').length, 2, 'a different size is a separate SKU');
  assert.deepEqual([...d.querySelectorAll('[data-transfer-sku]')].map(row => row.dataset.transferSku), ['P1|0|0', 'P1|0|1'], 'new SKUs append below existing rows');
  assert.equal(scanned, 3);
  input.value = 'B1';
  input.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  input.value = 'B1';
  input.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  await tick();
  assert.equal(doc.q['P1|0|0'], 4, 'fast consecutive scans are queued without losing either item');
  assert.deepEqual([...d.querySelectorAll('[data-transfer-sku]')].map(row => row.dataset.transferSku), ['P1|0|0', 'P1|0|1'], 'repeated scans keep the original row position');
  assert.equal(d.activeElement, input);
  await new Promise(resolve => setTimeout(resolve, 2800));
  assert.equal(d.querySelector('[data-transfer-scan-feedback]').dataset.state, 'idle', 'success returns to waiting');
  assert.equal(d.activeElement, input, 'scanning focus survives the feedback reset');

  input.value = 'BAD';
  input.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  await tick();
  drawer.close();
  drawer.show();
  assert.equal(input.disabled, true, 'reopening does not silently dismiss a failed scan');
  d.querySelector('[data-transfer-retry]').click();
  assert.equal(input.value, 'BAD', 'retry keeps the failed barcode available for correction');
  assert.equal(d.activeElement, input);
  input.value = 'B1';
  await enter('B1');

  input.value = 'PARTIAL';
  input.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  await tick();
  assert.equal(input.disabled, true, 'a partly recorded scan pauses further scanning');
  assert.equal(d.querySelector('[data-transfer-retry]'), null, 'a partly recorded scan must not invite a duplicate retry');
  assert.match(d.querySelector('[data-transfer-scan-feedback]').textContent, /数量可能已暂存/);
  assert(d.querySelector('[data-transfer-sku="P1|0|0"]').classList.contains('tsd-row-current'), 'the affected line stays highlighted for review');
  d.querySelector('[data-transfer-ignore]').click();

  doc.q['P1|0|0'] = 5;
  drawer.refresh();
  assert.equal(d.querySelector('[data-transfer-sku="P1|0|0"] [data-transfer-qty]').value, '5', 'outer changes update the drawer');
  const qty = d.querySelector('[data-transfer-sku="P1|0|0"] [data-transfer-qty]');
  qty.value = '7';
  qty.dispatchEvent(new w.Event('input', { bubbles: true }));
  assert.equal(doc.q['P1|0|0'], 7, 'drawer edits share the document quantities');
  assert.equal(d.querySelector('[data-t-qty="P1|0|0"]').value, '7', 'drawer edits update the outer grid');
  qty.focus();
  qty.dispatchEvent(new w.Event('change', { bubbles: true }));
  assert.equal(d.activeElement, input, 'finishing a quantity edit returns focus to scanning');
  d.querySelector('[data-transfer-sku="P1|0|0"] [data-transfer-delete]').click();
  await tick();
  assert.equal(doc.q['P1|0|0'], undefined);
  assert.equal(d.querySelector('[data-transfer-sku="P1|0|0"]'), null, 'deleting a SKU removes it from the drawer');
  assert.equal(d.querySelector('[data-t-qty="P1|0|0"]').value, '', 'deleting a SKU clears the outer grid');
  assert.equal(d.querySelector('#transfer-scan-drawer [data-transfer-undo]'), null, 'there is no undo control');
  assert.equal(d.querySelector('#transfer-scan-drawer [type=submit]'), null, 'there is no submit button');
  state.lease.expires = Date.now() - 1;
  drawer.refresh();
  assert.equal(input.disabled, true, 'an expired lease pauses the input');
  drawer.show();
  await tick();
  assert.equal(input.disabled, false, 'opening the drawer renews an expired lease and resumes scanning');
  assert.equal(d.activeElement, input);
  state.blocked = '此单正在另一窗口编辑';
  drawer.refresh();
  assert.equal(input.disabled, true);
  assert.match(d.querySelector('[data-transfer-scan-feedback]').textContent, /此单正在另一窗口编辑/, 'read-only feedback names the actual blocker');
  console.log('transfer scan drawer acceptance PASS');
  w.close();
})().catch(error => { console.error(error); w.close(); process.exitCode = 1; });
