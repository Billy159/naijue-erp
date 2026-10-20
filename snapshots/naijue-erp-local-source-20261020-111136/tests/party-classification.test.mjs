import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {existsSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {approvedPartyCounts, approvedPartyRole} from '../server/security/approved-party-roles.ts';

const decisionPath = fileURLToPath(new URL('../inputs/往来单位拆分-20261003/分类确认.json', import.meta.url));
const decision = existsSync(decisionPath) ? JSON.parse(readFileSync(decisionPath, 'utf8')) : null;

test('confirmed supplier and customer lists are exclusive and only two codes are excluded', () => {
  assert.deepEqual(approvedPartyCounts, {suppliers:222, customers:261, excluded:2});
  assert.equal(approvedPartyRole('AC-06-0000'), 'supplier');
  assert.equal(approvedPartyRole('AC-05-91101'), 'customer');
  assert.equal(approvedPartyRole('AC-06-0646'), null);
  assert.equal(approvedPartyRole('AC-06-0636'), null);
  assert.equal(approvedPartyRole('NEW-COUNTERPARTY'), undefined);
  if (!decision) return; // Private source files are intentionally absent in clean repository checkouts.
  assert.equal(decision.suppliers.length, 222);
  assert.equal(decision.customers.length, 261);
  assert.equal(decision.excluded_from_current_supplier_and_customer_views.length, 2);
  const seen = new Set();
  for (const [rows, role] of [[decision.suppliers, 'supplier'], [decision.customers, 'customer']]) {
    for (const row of rows) {
      assert.equal(seen.has(row.code), false, `duplicate code ${row.code}`);
      seen.add(row.code);
      assert.equal(approvedPartyRole(row.code), role, row.code);
    }
  }
  for (const code of decision.excluded_from_current_supplier_and_customer_views) {
    assert.equal(seen.has(code), false, code);
    seen.add(code);
    assert.equal(approvedPartyRole(code), null, code);
  }
  assert.equal(seen.size, 485);
});

test('local party editing keeps supplier and customer choices separate', async () => {
  const values = new Map();
  const localStorage = {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};
  const suppliers = [];
  const context = {window:null,addEventListener(){},location:{search:'?tr-space=party-qa&basic-demo=1',hash:'#inventory'},URLSearchParams,
    localStorage,sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},structuredClone,crypto:webcrypto,TextEncoder,
    navigator:{locks:{request:async (_key,work)=>work()}},ERP_DEMO:{warehouses:[],products:[]},
    PRODUCT_CATALOG:{suppliers,colors:[],groups:[],categories:[]},SALES_SERVICE:{catalog:{}},
    SALES_FUNDS_DATA:{methods:[],accounts:[]},Date,Promise,console};
  context.window=context;
  vm.createContext(context);
  vm.runInContext(readFileSync(new URL('../frontend/master-data.js',import.meta.url),'utf8'),context);
  const master=context.MASTER_DATA;
  assert.equal((await master.setup('admin','password123')).ok,true);
  assert.equal((await master.login('admin','password123')).ok,true);
  const save=(name,role)=>master.save('parties',{name,tags:[role]},{baseRevision:master.data.revision});
  assert.equal((await save('测试客户','customer')).ok,true);
  const customer=master.data.parties.at(-1);
  assert.equal((await save('测试供应商','supplier')).ok,true);
  const supplier=master.data.parties.at(-1);
  assert.equal(context.SALES_SERVICE.catalog.customers.some(row=>row.id===customer.id),true);
  assert.equal(context.SALES_SERVICE.catalog.customers.some(row=>row.id===supplier.id),false);
  assert.equal(suppliers.some(row=>row.id===supplier.id),true);
  assert.equal(suppliers.some(row=>row.id===customer.id),false);
  assert.equal((await master.save('parties',{name:'双重分类',tags:['customer','supplier']},{baseRevision:master.data.revision})).ok,false);
  assert.equal((await master.save('parties',{name:'未分类',tags:[]},{baseRevision:master.data.revision})).ok,false);
});
