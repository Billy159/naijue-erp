const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), {
  url: 'http://localhost/?tr-space=sales-redesign&sale-fixtures=1#sales/new',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
});
const w = dom.window;
const d = w.document;
w.structuredClone = structuredClone;
w.CSS = { escape: value => value };
w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
w.HTMLDialogElement.prototype.close = function () { this.open = false; };
w.HTMLElement.prototype.scrollIntoView = function () {};
let tail = Promise.resolve();
Object.defineProperty(w.navigator, 'locks', { value: {
  request: (_, callback) => {
    const result = tail.then(callback);
    tail = result.catch(() => {});
    return result;
  },
} });
const errors = [];
w.addEventListener('error', event => errors.push(event.message));
for (const script of d.querySelectorAll('script[src]')) {
  const source = script.getAttribute('src').split('?')[0];
  if (script.type === 'module' || source.startsWith('assets/') && source.endsWith('.bundle.js')) continue;
  vm.runInContext(fs.readFileSync(path.join(root, source), 'utf8'), dom.getInternalVMContext(), { filename: source });
}
const tick = () => new Promise(resolve => setTimeout(resolve, 40));

(async () => {
  await w.SALES_SERVICE.ready;
  await tick();
  const ui = w.SALES_UI;
  const state = ui.state;
  for (const selector of ['.sale-editor.tc-editor', '.sale-head.tc-head', '.sale-doc-fields.tc-gold-doc-fields', '.sale-section-head.tc-section-head', '.sale-summary.tc-gold-footer']) {
    assert(d.querySelector(selector), `销货单详情复用调拨单结构：${selector}`);
  }
  assert.deepEqual([...d.querySelectorAll('.sale-doc-fields > label')].slice(0, 6).map(x => x.querySelector('.sale-field-label')?.firstChild.textContent.trim() || x.firstChild.textContent.trim()), [
    '单据日期', '业务类型', '营业厅', '营业员', '客户', '出库仓',
  ]);
  assert(d.querySelector('[data-sales-date="document"]'));
  assert.equal(d.querySelector('[data-sale-field="date"]').type, 'hidden');
  assert(!d.querySelector('[data-sale="toggle-scan"], [data-sale="pick"]'));
  assert(!d.querySelector('.sale-lines-table tbody').textContent.includes('—'));
  assert(d.querySelector('.sale-summary').textContent.includes('款'));
  assert(d.querySelector('.sale-summary').textContent.includes('销售金额'));
  assert(d.querySelector('.sale-note-row input[placeholder="输入本单备注（可选）"]'));
  assert(d.querySelector('.sale-due-value'));
  assert(d.querySelector('.sale-lines-table colgroup'));
  assert(!d.querySelector('.sale-note'));

  d.querySelector('[data-sale="save"]').click();
  assert(d.querySelector('#sale-error').textContent.includes('业务类型'));
  assert.equal(state.doc.revision, 0);

  const sample = w.SALES_SERVICE.sample(1);
  sample.status = '未审核';
  sample.businessType = '销售';
  ui.setDoc(sample, true);
  w.render();
  const adjustment = d.querySelector('[data-document-adjustment]');
  adjustment.value = 'abc';
  adjustment.dispatchEvent(new w.Event('input', { bubbles: true }));
  assert.equal(d.querySelector('#sale-error').textContent, '');
  d.querySelector('[data-sale="save"]').click();
  assert(d.querySelector('#sale-error').textContent.includes('优惠'));
  assert.equal(state.doc.revision, 0);
  adjustment.value = '0';
  adjustment.dispatchEvent(new w.Event('input', { bubbles: true }));
  d.querySelector('[data-sale="save"]').click();
  await tick();
  assert.equal(state.doc.revision, 1);
  assert.equal(state.doc.status, '未审核');
  assert.equal(state.editing, true);
  ui.setDoc(state.doc, true);
  w.render();
  assert(d.querySelector('[data-sale-field="date"]'));
  assert(d.querySelector('[data-line-qty]'));

  w.history.replaceState(null, '', '#sales');
  w.render();
  await tick();
  const heads = [...d.querySelectorAll('#sale-list-scroll thead th')].map(x => x.textContent);
  assert.deepEqual(heads, ['日期', '销货单号', '状态', '业务类型', '营业厅', '营业员', '商品信息', '数量', '金额', '最后更新', '操作']);
  assert(!d.querySelector('.sale-quick-filters'));
  assert(!d.querySelector('[data-sale-entity="creatorId"]'));
  for (const kind of ['status', 'businessType', 'storeId', 'salespersonId']) assert(d.querySelector(`[data-sale-multi="${kind}"]`));
  d.querySelector('[data-sale="more-filter"]').click();
  for (const kind of ['customerId', 'warehouseId']) assert(d.querySelector(`[data-sale-multi="${kind}"]`));
  assert(d.querySelector('[data-filter="number"]'));
  assert(d.querySelector('#sale-page-size'));
  assert.equal(d.querySelector('#sale-list-scroll tbody tr td:last-child').textContent.trim(), '查看');

  state.filter.status = ['已作废'];
  d.querySelector('#sale-filter').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await tick();
  assert.equal(state.rows.length, 0);
  state.filter.status = [];
  state.filter.number = state.doc.id;
  d.querySelector('#sale-filter').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await tick();
  assert.equal(state.rows.length, 1);
  w.history.replaceState(null, '', '#transfer');
  w.render();
  await tick();
  const transferHeads = [...d.querySelectorAll('.tc-list-scroll thead th')].map(x => x.textContent);
  assert(transferHeads.includes('数量'));
  assert(!transferHeads.includes('审核'));
  d.querySelector('.tc-list [data-t="new"]').click();
  await tick();
  const required = [...d.querySelectorAll('.tc-gold-doc-fields .tc-required-label')].map(x => x.textContent.trim());
  for (const name of ['单据日期', '调出仓库', '调入仓库', '创建者']) assert(required.some(text => text.includes(name) && text.includes('*')));
  d.querySelector('.tc-editor [data-t="save"]').click();
  assert(d.querySelector('#tc-error').textContent.includes('请先完成必填项'));
  assert.deepEqual(errors, []);
  console.log('sales redesign smoke PASS');
})().then(() => process.exit(0)).catch(error => {
  console.error(error);
  process.exit(1);
});
