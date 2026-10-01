const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const source = fs.readFileSync(path.resolve(__dirname, '../transfer-golden.js'), 'utf8');
const failures = [];
function check(name, run) {
  try { run(); console.log('PASS', name); }
  catch (error) { failures.push({ name, error: error.stack }); console.error('FAIL', name, error.message); }
}
function setup(route, html) {
  const dom = new JSDOM(html, { url: `http://127.0.0.1:8877/?v=document-exports-20261001b#${route}`, runScripts: 'outside-only' });
  const w = dom.window;
  const doc = { id: 'TEST', saved: false, status: '未审核', date: '2026-10-01', from: 'from', to: 'to', creatorId: 'employee-1', creator: '王芳', q: {}, items: [] };
  w.ERP_DEMO = { warehouses: [{ id: 'from', name: '调出仓库' }, { id: 'to', name: '调入仓库' }], products: [] };
  w.PRODUCT_CATALOG = {};
  w.GOLD = { documents: [doc] };
  w.TRANSFER_UI = { state: { doc, filter: { q: '', from: [], to: [], status: [], start: '', end: '' }, listPaging: { page: 1, size: 20 }, lease: { expires: Date.now() + 60000 }, busy: false }, syncAvailability() {} };
  w.TRANSFER_SERVICE = { total: 1, actor: { id: 'employee-1', name: '王芳' }, sync: () => Promise.resolve({ ok: true }) };
  w.SALES_SERVICE = { session: { role: '管理员', creatorCandidates: [{ id: 'employee-1', name: '王芳' }, { id: 'employee-2', name: '李明' }] } };
  w.render = () => {};
  vm.runInContext(source, dom.getInternalVMContext(), { filename: 'transfer-golden.js' });
  return { dom, w, d: w.document, state: w.TRANSFER_UI.state };
}
check('list mounts compact filters and retains the shared filter state', () => {
  const { dom, w, d, state } = setup('transfer', '<section class="tc-list"><form id="tc-list-filter"></form><div class="tc-list-scroll"><table><thead><tr></tr></thead><tbody></tbody></table></div><div class="tc-list-pagination"><span></span></div></section>');
  try {
    assert.equal(d.querySelectorAll('.tc-filter-primary > *').length, 6);
    assert.equal(d.querySelectorAll('[data-transfer-date]').length, 2);
    assert.equal(d.querySelectorAll('[data-transfer-multi]').length, 3);
    state.filter.q = 'ALAL-2026-09-0128';
    d.querySelector('[data-tg="more-filters"]').click();
    assert.equal(d.querySelector('input[name="q"]').value, state.filter.q);
    assert.equal(d.querySelector('[data-tg="more-filters"]').getAttribute('aria-expanded'), 'true');
    w.render();
    assert.equal(d.querySelectorAll('.tc-filter-primary').length, 1);
    assert.equal(d.querySelector('.iw-filter-count').textContent, '1');
  } finally { dom.window.close(); }
});
check('new transfer retains date, warehouses and creator after enhancement', () => {
  const { dom, w, d, state } = setup('transfer/new', '<section class="tc-editor"><div class="tc-head"><div class="actions"></div></div><div class="tc-doc-header"><label class="tc-date-label">单据日期<input id="tc-date" type="date" value="2026-10-01"></label><div class="tc-warehouse-direction"><label>调出仓库<button data-t="select"></button></label><label>调入仓库<button data-t="select"></button></label></div><div class="tc-meta"><span>草稿单号</span><span>创建者</span></div></div><div id="tc-totals"></div></section>');
  try {
    const before = JSON.stringify(state.doc.q);
    w.render();
    assert.equal(d.querySelectorAll('.tc-gold-doc-fields > label').length, 5);
    assert(d.querySelector('[data-transfer-date="document"]'));
    assert.equal(d.querySelectorAll('[data-ui-single="transfer"]').length, 2);
    assert.equal(d.querySelector('.tc-doc-number-value').textContent, '保存后生成');
    const creator = d.querySelector('[data-transfer-creator]');
    assert.equal(creator.disabled, false);
    creator.value = 'employee-2';
    creator.dispatchEvent(new w.Event('change', { bubbles: true }));
    assert.equal(state.doc.creatorId, 'employee-2');
    assert.equal(state.doc.creator, '李明');
    assert.equal(JSON.stringify(state.doc.q), before);
  } finally { dom.window.close(); }
});
if (failures.length) process.exitCode = 1;
