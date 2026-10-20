const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'sales-current.js'), 'utf8');
const start = source.indexOf('async function commit('), end = source.indexOf('function showHistory', start);
assert(start >= 0 && end > start);
let finishWrite, finishSync;
const U = { busy: false, doc: { id: 'saved-sale', revision: 2, lines: [] }, pendingRequest: null };
const next = { id: 'saved-sale', revision: 3, status: '未审核', lines: [] };
const ctx = vm.createContext({
  U, crypto: require('node:crypto').webcrypto, copy: structuredClone, workTail: Promise.resolve(),
  settleEditors() {}, flushAdjustment() {}, stash() {}, refresh() {}, validationError() {},
  S: { call: () => new Promise(resolve => { finishWrite = resolve; }), sync: () => new Promise(resolve => { finishSync = resolve; }), session: { permissions: ['save'] } },
  setDoc: d => { U.doc = d; }, window: { REAL_DATA_MODE: true },
  A: { payment: () => ({ direction: '无' }), type: () => '销售' },
  SALES_FUNDS_UI: { remember() {} }, entryDoc: () => ({ lines: [] }),
  history: { replaceState() {} },
});
vm.runInContext(source.slice(start, end) + '\nglobalThis.commit = commit;', ctx);
(async () => {
  const task = ctx.commit('unaudit');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(U.busy, true);
  finishWrite({ ok: true, doc: next });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(U.busy, true, 'navigation and editing stay blocked until the saved document and list have been reconciled');
  assert.equal(U.doc.revision, 2);
  finishSync({ ok: true });
  await task;
  assert.equal(U.doc.revision, 3);
  assert.equal(U.busy, false);
  const failed = ctx.commit('unaudit');
  await new Promise(resolve => setImmediate(resolve));
  finishWrite({ ok: false, code: 'VALIDATION', error: 'retry' });
  await failed;
  assert.equal(U.busy, false, 'a failed write releases the busy state');
  console.log('Sales commit pending write/readback and failure state: PASS');
})().catch(error => { console.error(error); process.exitCode = 1; });
