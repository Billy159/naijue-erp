const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { webcrypto } = require('node:crypto');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const root = resolve(__dirname, '..');
const shared = new Map();
const storage = map => ({
  getItem: key => map.get(String(key)) ?? null,
  setItem: (key, value) => map.set(String(key), String(value)),
  removeItem: key => map.delete(String(key)),
});
const tabs = [];
function openTab(session = new Map(), withEntry = true) {
  const dom = new JSDOM('<div class="app"></div>', {
    url: 'http://127.0.0.1:8877/#sales',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  tabs.push(dom);
  const w = dom.window;
  Object.defineProperty(w, 'localStorage', { configurable: true, value: storage(shared) });
  Object.defineProperty(w, 'sessionStorage', { configurable: true, value: storage(session) });
  Object.defineProperty(w, 'crypto', { configurable: true, value: webcrypto });
  w.structuredClone = structuredClone;
  w.TextEncoder = TextEncoder;
  w.navigator.locks = { request: async (_key, callback) => callback() };
  w.ERP_DEMO = { warehouses: [], products: [] };
  w.PRODUCT_CATALOG = { suppliers: [], colors: [], groups: [], categories: [] };
  const load = file => vm.runInContext(readFileSync(join(root, file), 'utf8'), dom.getInternalVMContext(), { filename: file });
  load('master-data.js');
  load('service-client.js');
  if (withEntry) load('auth-entry.js');
  return { w, session, load };
}

(async () => {
  const first = openTab(new Map(), false);
  const password = 'DemoOnlyPass123';
  assert.equal((await first.w.MASTER_DATA.setup('demo-admin', password)).ok, true);
  assert.equal((await first.w.MASTER_DATA.login('demo-admin', password)).ok, true);
  const key = first.w.MASTER_DATA.authKey;
  const auth = shared.get(key);
  assert(auth && !auth.includes(password), 'Shared login must contain identity and expiry, never the password');
  assert.equal(first.session.has(key), false);

  const second = openTab();
  assert.equal(second.w.MASTER_DATA.current()?.loginName, 'demo-admin');
  assert.equal(second.w.document.querySelector('.login-overlay'), null, 'A new tab must enter without a second login');
  second.w.MASTER_DATA.current = () => ({ id: 'local-admin' }); // The runtime bridge wraps the visible operator.

  shared.delete(key);
  second.w.dispatchEvent(new second.w.StorageEvent('storage', { key, oldValue: auth, newValue: null }));
  assert(second.w.document.querySelector('.login-overlay'), 'Logout in another tab must lock this tab');

  const legacy = openTab(new Map([[key, auth]]), false);
  assert.equal(legacy.w.MASTER_DATA.current()?.loginName, 'demo-admin');
  assert.equal(legacy.session.has(key), false, 'An old per-tab login must migrate once');
  assert.equal(shared.get(key), auth);
  const afterMigration = openTab();
  assert.equal(afterMigration.w.document.querySelector('.login-overlay'), null);
  console.log('Shared login, cross-tab logout, and legacy session migration: passed');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => tabs.forEach(tab => tab.window.close()));
