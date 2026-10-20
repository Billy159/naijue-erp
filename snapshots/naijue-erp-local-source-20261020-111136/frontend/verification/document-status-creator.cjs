const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const transfer = require(path.join(root, 'transfer-mock-core.js'));
const now = Date.parse('2026-09-28T10:00:00Z');
const product = {
  id: 'sku', colorIds: ['color'], sizeIds: ['size'], colors: ['蓝色'], sizes: ['M'],
  stock: { from: [[10]], to: [[2]] },
};
let state = transfer.seed([], [product]);
function transferCall(command) {
  const next = structuredClone(state);
  const result = transfer.reduce(next, command, now);
  if (result.ok) state = next;
  return result;
}
assert(transferCall({ type: 'login', sessionId: 'admin', account: 'A' }).ok);
Object.assign(state.sessions.admin, {
  role: '管理员', warehouses: ['from', 'to'],
  creatorCandidates: [{ id: 'employee-1', name: '王芳' }],
});
const tempId = '草稿-test';
let lease = transferCall({ type: 'acquire', sessionId: 'admin', docId: tempId, newToken: 'lease-1' }).lease;
const draft = {
  id: tempId, date: '2026-09-28', from: 'from', to: 'to',
  q: { 'sku|0|0': 1 }, items: ['sku'], hiddenColors: [], scans: [],
  creatorId: 'employee-1', status: '未审核', version: 1,
};
const writeTransfer = (kind, docId, baseRevision, value) => transferCall({
  type: 'write', kind, sessionId: 'admin', docId, token: lease.token,
  baseRevision, draft: value, requestId: `${kind}-${baseRevision}`,
});
let saved = writeTransfer('save', tempId, 0, draft).doc;
assert.equal(saved.status, '未审核');
assert.deepEqual(saved.creatorActor, { id: 'employee-1', name: '王芳' });
assert.deepEqual(state.products[0].stock, product.stock);
let approved = writeTransfer('audit', saved.id, saved.revision, saved).doc;
assert.equal(approved.status, '已审核');
assert.deepEqual(state.products[0].stock, { from: [[9]], to: [[3]] });
let reversed = writeTransfer('reverse', approved.id, approved.revision, approved).doc;
assert.equal(reversed.status, '未审核');
assert.equal(reversed.history.at(-1).action, '弃审');
assert.deepEqual(state.products[0].stock, product.stock);
let reapproved = writeTransfer('audit', reversed.id, reversed.revision, reversed).doc;
assert.equal(reapproved.status, '已审核');
assert.equal(reapproved.version, 2);
assert.equal(writeTransfer('delete', reapproved.id, reapproved.revision, reapproved).code, 'STATE');
const toDelete = writeTransfer('reverse', reapproved.id, reapproved.revision, reapproved).doc;
const transferStock = structuredClone(state.products[0].stock);
const deletedTransfer = writeTransfer('delete', toDelete.id, toDelete.revision, toDelete).doc;
assert.equal(deletedTransfer.status, '已作废');
assert.equal(deletedTransfer.history.at(-1).action, '作废');
assert.deepEqual(state.products[0].stock, transferStock);
assert.equal(writeTransfer('audit', deletedTransfer.id, deletedTransfer.revision, deletedTransfer).code, 'STATE');
assert.equal(writeTransfer('save', deletedTransfer.id, deletedTransfer.revision, deletedTransfer).code, 'STATE');

const dom = new JSDOM('', { runScripts: 'outside-only' });
const w = dom.window;
w.structuredClone = structuredClone;
w.MASTER_DATA = { data: { payments: [], fundAccounts: [] } };
w.SALES_SUMMARY = { missingCategory: () => ({}), categorySnapshot: () => ({}) };
w.PRODUCT_CATALOG = {};
for (const file of ['sales-core.js', 'sales-audit-core.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), dom.getInternalVMContext());
}
const context = {
  session: {
    accountId: 'admin', name: '管理员', role: '管理员', expires: now + 3600000,
    permissions: ['view', 'save', 'audit', 'reverse'], warehouses: ['from'],
    creatorCandidates: [{ id: 'employee-1', name: '王芳' }], salesScope: 'all',
  },
  catalog: {
    customers: [{ id: 'customer' }], stores: [{ id: 'store' }],
    staff: [{ id: 'staff' }], payments: [],
  },
  warehouses: [{ id: 'from', name: '调出仓' }],
  products: [product],
};
let salesState = { salesDocs: [], salesRequests: {}, salesSeq: 0, serial: 0,
  products: [structuredClone(product)], events: [], fundsRecords: [] };
function saleCall(kind, docId, baseRevision, saleDraft) {
  const result = w.SALES_CORE.apply(salesState, {
    type: 'write', kind, docId, baseRevision, requestId: `${kind}-${baseRevision}`,
    ...(saleDraft ? { draft: saleDraft } : {}),
  }, context, now);
  assert.equal(result.ok, true, result.error);
  salesState = result.state;
  return result.doc;
}
const saleDraft = {
  businessType: '销售', returnWarehouseId: '', returnLines: [],
  funds: { amountCents: 0 }, customerId: 'customer', warehouseId: 'from',
  salespersonId: 'staff', date: '2026-09-28T10:00', department: '',
  storeId: 'store', note: '', adjustmentCents: 0, defaults: {},
  lines: [{ id: 'line-1', productId: 'sku', colorId: 'color', sizeId: 'size',
    quantity: 1, priceCents: 0, gift: true, zeroConfirmed: true }],
  creator: { id: 'employee-1', name: '王芳' },
};
const saleSaved = saleCall('save', 'unsaved-sale', 0, saleDraft);
assert.equal(saleSaved.status, '未审核');
assert.deepEqual(saleSaved.creator, { id: 'employee-1', name: '王芳' });
const saleApproved = saleCall('audit', saleSaved.id, saleSaved.revision);
assert.equal(saleApproved.status, '已审核');
assert.equal(salesState.products[0].stock.from[0][0], 9);
assert.equal(w.SALES_CORE.apply(salesState, { type: 'write', kind: 'delete', docId: saleApproved.id, baseRevision: saleApproved.revision, requestId: 'reject-approved-delete' }, context, now).code, 'STATE');
const saleReversed = saleCall('unaudit', saleApproved.id, saleApproved.revision);
assert.equal(saleReversed.status, '未审核');
assert.equal(saleReversed.history.at(-1).action, '弃审');
assert.equal(salesState.products[0].stock.from[0][0], 10);
const deletedSale = saleCall('delete', saleReversed.id, saleReversed.revision);
assert.equal(deletedSale.status, '已作废');
assert.equal(deletedSale.history.at(-1).action, '作废');
assert.equal(salesState.products[0].stock.from[0][0], 10);
assert.equal(w.SALES_CORE.apply(salesState, { type: 'write', kind: 'audit', docId: deletedSale.id, baseRevision: deletedSale.revision, requestId: 'reject-deleted-audit' }, context, now).code, 'STATE');
console.log('Transfer and sales status/creator checks PASS');
