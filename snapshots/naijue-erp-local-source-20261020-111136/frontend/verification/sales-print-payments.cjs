const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const K = require('../sales-core.js');
const source = fs.readFileSync(path.join(__dirname, '..', 'sales-current.js'), 'utf8');
const start = source.indexOf('function printUnified(d)');
const end = source.indexOf('function printDoc(d)', start);
let printed;
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const A = {
  amounts: d => ({ sale: K.totals(d).total, returned: 0, difference: K.totals(d).total }),
  payment: d => d.funds || {direction: '收款', amountCents: (d.fundsRecords || []).reduce((n, r) => n + r.amountCents, 0)},
  methods: () => [{id: 'wechat', name: '现名微信'}], accounts: () => [{id: 'first', name: '现名账户'}],
  type: d => d.businessType, incoming: () => [], outgoing: d => d.lines,
};
const U = {};
const context = vm.createContext({A, K, U, h: escape, p: () => ({displayId: '真实款号'}), C: {fit: id => ({name: id + '版'})}, statusLabel: d => d.status, copy: structuredClone, b: () => '', modal: (title, body) => printed = body});
vm.runInContext(source.slice(start, end) + ';globalThis.printDoc=printUnified;', context);
const doc = {id:'V2-XS-PRINT',businessType:'销售',status:'已审核',revision:2,date:'2026-10-01',storeName:'营业厅',customerName:'客户',salespersonName:'员工',warehouseName:'仓库',note:'备注',adjustmentCents:1000,lines:[{productId:'内部::fit:B',name:'商品',color:'白色',fitId:'B',sourceSize:'原尺码',size:'标准尺码',quantity:2,priceCents:9000,gift:false}],fundsRecords:[{methodId:'wechat',accountId:'first',methodName:'原名微信',accountName:'原名微信账户',amountCents:10000,direction:'receipt'},{methodName:'现金',accountName:'现金账户',amountCents:7000,direction:'receipt'}]};
const before = structuredClone(doc);
context.printDoc(doc);
const dom = new JSDOM(printed).window.document;
const rows = dom.querySelectorAll('table')[1].querySelectorAll('tbody tr');
assert.equal(rows.length, 2, 'every saved payment gets its own row');
assert(rows[0].textContent.includes('原名微信账户') && rows[0].textContent.includes('100.00'));
assert(rows[1].textContent.includes('现金账户') && rows[1].textContent.includes('70.00'));
assert(dom.body.textContent.includes('收退款合计 ¥170.00'));
assert(dom.body.textContent.includes('白色／B版／原尺码'), 'print retains fit and original size');
assert(!dom.body.textContent.includes('内部::fit:B'), 'view identity cannot leak into printed business code');
assert.deepEqual(doc, before, 'printing never changes the document');
const refund = {...doc, fundsRecords:[{methodName:'现金',accountName:'原退款账户',amountCents:-7000,direction:'refund'}]};
context.printDoc(refund);
assert(printed.includes('退款') && printed.includes('70.00') && printed.includes('原退款账户'));
context.printDoc({...doc, fundsRecords:[]});
assert(printed.includes('无收退款记录'));
const fallback = {...doc, fundsRecords:undefined, funds:{direction:'收款',methodId:'wechat',accountId:'first',amountCents:17000}};
context.printDoc(fallback);
assert(printed.includes('现名微信') && printed.includes('现名账户') && printed.includes('170.00'));
console.log('Saved mixed payments, refunds, original fit/size and readonly print: PASS');
