const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const source = fs.readFileSync(path.join(__dirname, '..', 'real-data-bridge.mjs'), 'utf8');
const start = source.indexOf('// Render payment records in the document header');
const end = source.indexOf('bridge.inventory=async', start);
assert(start >= 0 && end > start, 'real payment UI section must exist');

const dom = new JSDOM('<main><div data-funds-field></div></main>', { url: 'http://localhost/#sales/new' });
const { window } = dom;
window.structuredClone = structuredClone;
window.crypto.randomUUID = () => String(Math.random());
const ctx = vm.createContext({
  window, document: window.document, crypto: window.crypto,
  refs: {
    'payment-methods': [
      { id: 'wechat', name: '微信', enabled: true },
      { id: 'card', name: '信用卡', enabled: true },
      { id: 'empty', name: '无账户方式', enabled: true },
      { id: 'off', name: '已停用', enabled: false },
    ],
    'fund-accounts': [
      { id: 'global-wechat', name: '微信-通用账户', enabled: true, primary_payment_method_id: 'wechat', storeIds: ['hall-a', 'hall-b', 'hall-c'] },
      { id: 'other-wechat', name: '微信-其他店', enabled: true, primary_payment_method_id: 'wechat', storeIds: ['hall-b'] },
      { id: 'local-wechat', code: '10203', name: '10203微信-当前店', enabled: true, primary_payment_method_id: 'wechat', storeIds: ['hall-a'] },
      { id: 'other-card', name: '信用卡-其他店', enabled: true, primary_payment_method_id: 'card', storeIds: ['hall-b'] },
      { id: 'off-wechat', name: '停用微信账户', enabled: false, primary_payment_method_id: 'wechat', storeIds: ['hall-a'] },
    ],
  },
  SALES_AUDIT: { amounts: d => ({ difference: d.due }) },
  SALES_CORE: { money: cents => (Number(cents) / 100).toFixed(2), cents: value => Math.round(Number(value) * 100) },
  SALES_UI: { state: { editing: true, doc: null }, update() {} },
  SALES_FUNDS_UI: {}, UNIFIED_SINGLE_SELECT: { mountAll() {} }, bridge: {
    recommendationForHall: id => id === 'hall-a' ? { accounts: [{methodId:'wechat',accountId:'local-wechat'}] } : null,
    ensureRecommendations: async () => null,
  },
});
vm.runInContext(source.slice(start, end) + '\nwindow.__paymentProbe={availableAccounts,paymentRow,paymentStatus,fundsField,fundsSum,dueAmount};', ctx, { filename: 'real-data-bridge.mjs#payment' });
const p = window.__paymentProbe;
const doc = { storeId: 'hall-a', due: 173600, status: '未审核', lines: [{}], fundsRecords: [] };
ctx.SALES_UI.state.doc = doc;

// A recommendation can arrive while the account picker or amount is focused.
let hallRecommendation = null;
ctx.bridge.recommendationForHall = () => hallRecommendation;
doc.fundsRecords = [{ id: 'focused', methodId: 'wechat', accountId: 'other-wechat', amountCents: 100000 }];
window.document.querySelector('[data-funds-field]').outerHTML = p.fundsField(doc, true);
const focusedField = window.document.querySelector('[data-funds-field]');
const focusedAccount = focusedField.querySelector('[data-rf=accountId]');
const focusedAmount = focusedField.querySelector('[data-rf=amount]');
focusedAmount.focus();
hallRecommendation = { accounts: [{ methodId: 'wechat', accountId: 'local-wechat' }] };
ctx.SALES_FUNDS_UI.syncField(doc, true);
assert.equal(window.document.querySelector('[data-funds-field]'), focusedField, 'async recommendations retain the mounted payment field');
assert.equal(window.document.activeElement, focusedAmount, 'async recommendations retain input focus');
assert.equal(focusedAccount.querySelector('optgroup[label="推荐"] option')?.value, 'local-wechat', 'focused controls must receive the newly loaded recommendation');
assert.equal(focusedAccount.value, 'other-wechat', 'an entered account is not replaced by a recommendation');
assert.equal(focusedAmount.value, '1000.00');
doc.fundsRecords = [];
ctx.bridge.recommendationForHall = id => id === 'hall-a' ? hallRecommendation : null;

assert.deepEqual(Array.from(p.availableAccounts(doc, 'wechat'), a => a.id), ['local-wechat', 'global-wechat', 'other-wechat']);
assert.deepEqual(Array.from(p.availableAccounts(doc, 'card'), a => a.id), ['other-card']);
let html = p.paymentRow(doc, { methodId: '', accountId: '', amountCents: 0 }, 0, true, true);
assert(!html.includes('无账户方式'), 'a method with no normal account must not be selectable');
assert(!html.includes('已停用'), 'disabled payment methods must not be selectable');
assert.match(html, /data-rf-add disabled/, 'an untouched first row must be filled before another row is added');
html = p.paymentRow(doc, { methodId: 'wechat', accountId: '', amountCents: 100000 }, 0, true, false);
assert(html.includes('微信-其他店'), 'other halls remain selectable');
assert(html.includes('推荐'), 'current hall recommendation is visible');
assert(!html.includes('10203 10203微信'), 'account codes already present in names must not be repeated');

doc.fundsRecords = [{ id: 'first', methodId: 'wechat', accountId: 'local-wechat', amountCents: 100000 }];
assert.equal(p.paymentStatus(doc).text, '已收 ¥1000.00 · 待收 ¥736.00');
window.document.querySelector('[data-funds-field]').outerHTML = p.fundsField(doc, true);
window.document.querySelector('[data-rf-add]').click();
assert.equal(doc.fundsRecords.length, 2);
assert.equal(doc.fundsRecords[1].amountCents, 73600);
assert(!window.document.querySelector('[data-funds-row="0"] [data-rf-add]'), 'add follows the last payment row');
assert(window.document.querySelector('[data-funds-row="1"] [data-rf-add]'));
assert(window.document.querySelectorAll('[data-rf-remove]').length === 2);

doc.fundsRecords[1].amountCents = 73600;
window.document.querySelector('[data-funds-field]').outerHTML = p.fundsField(doc, true);
window.document.querySelector('[data-rf-add]')?.click();
assert.equal(doc.fundsRecords.length, 3, 'fully settled payment can append another row');
assert.equal(doc.fundsRecords[2].amountCents, null, 'a settled payment starts the next row empty');
assert.equal(window.document.querySelector('[data-funds-row="2"] [data-rf=amount]').value, '', 'settled amount must visibly be blank');
assert.equal(doc.fundsRecords[0].amountCents, 100000, 'first payment is not rebalanced');
assert.equal(doc.fundsRecords[1].amountCents, 73600, 'second payment is not rebalanced');
assert.equal(p.paymentStatus({ ...doc, due: 0 }).text, '已收 ¥1736.00 · 超收 ¥1736.00');
assert.equal(p.paymentStatus({ ...doc, due: 0, fundsRecords: [{ amountCents: -10000 }] }).text, '已退 ¥100.00 · 多退 ¥100.00');
assert.equal(p.paymentStatus(doc).text, '已收 ¥1736.00 · 已结清');

// The latest user rule allows adding a row even before goods or after overpayment.
doc.due = 0;
doc.lines = [];
doc.fundsRecords = [{ id: 'prepaid', methodId: 'card', accountId: 'other-card', amountCents: 5000 }];
window.document.querySelector('[data-funds-field]').outerHTML = p.fundsField(doc, true);
assert.equal(window.document.querySelector('[data-rf-add]').disabled, false, 'zero due and overpayment must allow adding a payment');
window.document.querySelector('[data-rf=amount]').focus();
ctx.SALES_FUNDS_UI.syncField(doc, true);
assert.equal(window.document.querySelector('[data-rf-add]').disabled, false, 'the focused amount field must not disable adding after overpayment');
const prepaid = JSON.stringify(doc.fundsRecords[0]);
window.document.querySelector('[data-rf-add]').click();
assert.equal(doc.fundsRecords.length, 2);
assert.equal(doc.fundsRecords[1].amountCents, 0, 'overpayment must not create an automatic negative refund');
assert.equal(JSON.stringify(doc.fundsRecords[0]), prepaid, 'adding must preserve money already entered');
window.document.querySelector('[data-rf-add]').click();
assert.equal(doc.fundsRecords.length, 3);
assert(!window.document.querySelector('[data-rf-add]'), 'three payment rows remain the maximum');
assert.equal(window.document.querySelectorAll('[data-rf-remove]').length, 3);
assert(!p.paymentRow(doc, doc.fundsRecords[0], 0, false, false).includes('data-rf-add'), 'read-only receipts never show the add action');
doc.due = -5000;
doc.fundsRecords = [{ id: 'refund', methodId: 'card', accountId: 'other-card', amountCents: -5000 }];
window.document.querySelector('[data-funds-field]').outerHTML = p.fundsField(doc, true);
window.document.querySelector('[data-rf-add]').click();
assert.equal(doc.fundsRecords[1].amountCents, null, 'an exactly settled refund starts the next row empty');
assert.equal(window.document.querySelector('[data-funds-row="1"] [data-rf=amount]').value, '');

doc.fundsRecords = [{ id: 'historic', methodId: 'card', accountId: 'other-card', amountCents: 89800, methodName: '原信用卡名称', accountName: '原账户名称' }];
doc.due = 89800;
const originalAmount = doc.fundsRecords[0].amountCents;
doc.due = 80000;
ctx.SALES_FUNDS_UI.syncField(doc, true);
assert.equal(doc.fundsRecords[0].amountCents, originalAmount, 'amount already entered must not follow due changes');
assert.equal(p.paymentStatus(doc).text, '已收 ¥898.00 · 超收 ¥98.00');
assert(p.paymentRow(doc, doc.fundsRecords[0], 0, false, false).includes('原账户名称'), 'historical snapshot must win over current account name');
doc.storeId = 'hall-c';
ctx.SALES_FUNDS_UI.reconcile(doc);
assert.equal(doc.fundsRecords[0].accountId, 'other-card', 'changing hall must not erase an otherwise active account');
assert.deepEqual(Array.from(p.availableAccounts(doc, 'card'), a => a.id), ['other-card'], 'switching hall does not restrict account options');
assert.equal(ctx.SALES_FUNDS_UI.validate(doc, { audit: false }), '');
assert.match(ctx.SALES_FUNDS_UI.validate(doc, { audit: true }), /不一致/);
assert.match(ctx.SALES_FUNDS_UI.validate({ ...doc, due: 0 }, { audit: true }), /不一致/, 'zero due with a positive receipt cannot be audited');

const bodyStart = source.indexOf('function bodyFrom(');
const bodyEnd = source.indexOf('const pending=', bodyStart);
assert(bodyStart >= 0 && bodyEnd > bodyStart);
const saveContext = vm.createContext({
  copy: structuredClone,
  D: { products: [] },
  crypto: window.crypto,
  by: (kind, id) => ({ 'payment-methods': { card: { name: '当前信用卡名称' } }, 'fund-accounts': { 'other-card': { name: '当前账户名称' } } })[kind]?.[id],
});
vm.runInContext(source.slice(bodyStart, bodyEnd) + '\nglobalThis.__bodyFrom = bodyFrom;', saveContext);
const oldPayment = {
  source_id: 'historic', payment_method_id: 'card', fund_account_id: 'other-card',
  source_payment_method_name: '原信用卡名称', source_fund_account_name: '原账户名称', amount: '898',
};
const savedDoc = {
  ...doc, lines: [], _runtime: { body: { header: {}, lines: [], fundsRecords: [oldPayment] } },
};
let savedPayment = saveContext.__bodyFrom(savedDoc, 'SALE').fundsRecords[0];
assert.equal(savedPayment.source_payment_method_name, '原信用卡名称');
assert.equal(savedPayment.source_fund_account_name, '原账户名称');
assert.equal(savedPayment.amount, '898');
savedDoc._runtime.body.fundsRecords = [];
savedPayment = saveContext.__bodyFrom(savedDoc, 'SALE').fundsRecords[0];
assert.equal(savedPayment.source_payment_method_name, '当前信用卡名称', 'new payment captures the current method name');
assert.equal(savedPayment.source_fund_account_name, '当前账户名称', 'new payment captures the current account name');

console.log('sales inline payment policy: PASS');
dom.window.close();
