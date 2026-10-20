const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const dom = new JSDOM(html, {
  url: `http://localhost/?tr-space=delete-ui-${Date.now()}&sale-fixtures=1#transfer/new`,
  runScripts: 'outside-only',
  pretendToBeVisual: true,
});
const w = dom.window;
const d = w.document;
w.structuredClone = structuredClone;
w.CSS = { escape: x => x };
w.REAL_DATA_MODE = false;
w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
w.HTMLDialogElement.prototype.close = function () { this.open = false; };
w.HTMLElement.prototype.scrollIntoView = function () {};
let tail = Promise.resolve();
Object.defineProperty(w.navigator, 'locks', {
  value: { request: (_key, fn) => {
    const pending = tail.then(fn);
    tail = pending.catch(() => {});
    return pending;
  } },
});
const errors = [];
w.addEventListener('error', event => errors.push(event.message));
for (const script of d.querySelectorAll('script[src]')) {
  if (script.type === 'module') continue;
  const file = script.getAttribute('src').split('?')[0];
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), dom.getInternalVMContext(), { filename: file });
}

const tick = () => new Promise(resolve => setTimeout(resolve, 60));
const click = selector => {
  const button = d.querySelector(selector);
  assert(button, `missing ${selector}`);
  button.click();
};
const before = (left, right) => Boolean(left.compareDocumentPosition(right) & w.Node.DOCUMENT_POSITION_FOLLOWING);

(async () => {
  await Promise.all([w.TRANSFER_SERVICE.ready, w.SALES_SERVICE.ready]);
  await tick();

  const transfer = w.TRANSFER_UI;
  const transferState = transfer.state;
  transferState.doc.from = 'main';
  transferState.doc.to = 'outlet';
  transferState.doc.items = ['M26002'];
  transferState.doc.q = { 'M26002|0|0': 1 };
  await transfer.commit('save');
  await tick();
  assert.equal(transferState.doc.status, '未审核');
  const transferId = transferState.doc.id;
  assert(before(d.querySelector('[data-t="delete-doc"]'), d.querySelector('[data-t="save"]')));
  assert.equal(d.querySelector('[data-t="delete-doc"]').textContent.trim(), '作废');
  const transferRevision = transferState.doc.revision;
  click('[data-t="delete-doc"]');
  assert(d.querySelector('#tc-dialog').open);
  assert.match(d.querySelector('#tc-dialog').textContent, /确认作废调拨单/);
  click('#tc-dialog [data-t="close-modal"]');
  assert.equal(transferState.doc.revision, transferRevision);
  click('[data-t="delete-doc"]');
  click('#tc-dialog [data-t="confirm-action"]');
  await tick();
  assert.equal(transferState.doc.status, '已作废');
  assert.equal(w.GOLD.documents.find(item => item.id === transferId).status, '已作废');
  assert.equal(d.querySelector('[data-t="save"]'), null);
  assert.equal(d.querySelector('[data-t="delete-doc"]'), null);

  const sales = w.SALES_UI;
  sales.loadSample(1);
  await tick();
  sales.state.doc.businessType = '销售';
  sales.state.doc.status = '未审核';
  await sales.commit('save');
  await tick();
  assert.equal(sales.state.doc.status, '未审核');
  const salesId = sales.state.doc.id;
  click('[data-sale="edit"]');
  await tick();
  assert(before(d.querySelector('[data-sale="delete-doc"]'), d.querySelector('[data-sale="save"]')));
  assert.equal(d.querySelector('[data-sale="delete-doc"]').textContent.trim(), '作废');
  const salesRevision = sales.state.doc.revision;
  click('[data-sale="delete-doc"]');
  assert(d.querySelector('#sale-dialog').open);
  assert.match(d.querySelector('#sale-dialog').textContent, /确认作废销货单/);
  click('#sale-dialog [data-sale="close"]');
  assert.equal(sales.state.doc.revision, salesRevision);
  click('[data-sale="delete-doc"]');
  click('#sale-dialog [data-sale="confirm"]');
  await tick();
  assert.equal(sales.state.doc.status, '已作废');
  assert.equal(w.SALES_SERVICE.docs.find(item => item.id === salesId).status, '已作废');
  assert.equal(d.querySelector('[data-sale="save"]'), null);
  assert.equal(d.querySelector('[data-sale="delete-doc"]'), null);
  assert.deepEqual(errors, []);
  console.log('Transfer and sales void confirmation UI PASS');
  process.exit(0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
