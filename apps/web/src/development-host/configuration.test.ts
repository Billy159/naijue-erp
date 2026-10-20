import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDevelopmentHostConfiguration, parseDevelopmentHostAssets, developmentAssetUrl } from './configuration.ts';

const configuration = () => ({ kind: 'naijue-erp-development-host', http: { origin: 'https://synthetic.test', basePath: '/api' },
  assets: { basePath: '/development/erp/' }, routes: { inventory: true, sales: true, transfers: false }, session: { verifyOnMount: false } });
const assets = () => ({ entry: 'application.js', styles: { application: 'application.css', inventory: 'inventory.css', sales: 'sales.css', 'sales-detail': 'sales-detail.css', parties: 'parties.css', transfers: 'transfers.css', 'transfer-detail': 'transfer-detail.css', 'transfer-product': 'transfer-product.css' }, productDrawerStyles: 'chunks/product-drawer.css' });

test('public development settings are explicit, copied/frozen, and only resolve same-origin manifest assets', () => {
  const source = configuration(); const parsed = parseDevelopmentHostConfiguration(source);
  source.http.origin = 'https://changed.invalid'; source.routes.inventory = false;
  assert.equal(parsed.http.origin, 'https://synthetic.test'); assert.equal(parsed.routes.inventory, true);
  for (const value of [parsed, parsed.http, parsed.assets, parsed.routes, parsed.session]) assert.ok(Object.isFrozen(value));
  assert.equal(developmentAssetUrl(parsed, 'chunks/product-drawer.css'), 'https://synthetic.test/development/erp/chunks/product-drawer.css');
  for (const basePath of ['', '/', '/api/', '/app/api']) assert.equal(parseDevelopmentHostConfiguration({ ...configuration(), http: { origin: 'https://synthetic.test', basePath } }).http.basePath, basePath);
});
test('missing fields, unknown fields and credentials/policy/account inputs fail closed', () => {
  for (const key of Object.keys(configuration())) { const value: Record<string, unknown> = configuration(); delete value[key]; assert.throws(() => parseDevelopmentHostConfiguration(value)); }
  for (const [key, value] of Object.entries({ password: 'SYNTHETIC-NOT-A-REAL-SECRET', account: {}, principal: {}, authorization: {}, role: 'ADMIN', database: {}, token: 'SYNTHETIC' })) {
    assert.throws(() => parseDevelopmentHostConfiguration({ ...configuration(), [key]: value }));
  }
  for (const key of ['http', 'assets', 'routes', 'session'] as const) assert.throws(() => parseDevelopmentHostConfiguration({ ...configuration(), [key]: { ...configuration()[key], secret: 'SYNTHETIC' } }));
  assert.throws(() => parseDevelopmentHostConfiguration({ ...configuration(), kind: 'production' }));
});
test('HTTPS exact origin has no credential, query, fragment, path, inferred default or downgrade', () => {
  for (const origin of [undefined, '', 'http://synthetic.test', 'https://synthetic.test/', 'https://user:pass@synthetic.test', 'https://synthetic.test/path', 'https://synthetic.test?token=SYNTHETIC', 'https://synthetic.test#secret', '//synthetic.test']) {
    assert.throws(() => parseDevelopmentHostConfiguration({ ...configuration(), http: { origin, basePath: '/api' } }));
  }
});
test('API and asset prefixes reject URL redirection, encoded paths, traversal and query strings', () => {
  for (const basePath of [undefined, 'api', '//other.test', '/a/../api', '/a%2fapi', '/api?x=1', '/api#x', '/api\\x']) assert.throws(() => parseDevelopmentHostConfiguration({ ...configuration(), http: { origin: 'https://synthetic.test', basePath } }));
  for (const basePath of [undefined, '', 'assets/', '/assets', '//other.test/', '/a/../', '/a%2f/', '/assets/?x=1', '/assets/#x', '/a\\b/']) assert.throws(() => parseDevelopmentHostConfiguration({ ...configuration(), assets: { basePath } }));
  assert.equal(parseDevelopmentHostConfiguration({ ...configuration(), assets: { basePath: '/' } }).assets.basePath, '/');
});
test('capability switches and optional session verification have no truthy or missing defaults', () => {
  for (const key of ['inventory', 'sales', 'transfers']) for (const value of [undefined, 'true', 1, null, {}]) assert.throws(() => parseDevelopmentHostConfiguration({ ...configuration(), routes: { ...configuration().routes, [key]: value } }));
  for (const verifyOnMount of [undefined, 'false', 0, null]) assert.throws(() => parseDevelopmentHostConfiguration({ ...configuration(), session: { verifyOnMount } }));
  assert.deepEqual(parseDevelopmentHostConfiguration({ ...configuration(), routes: { inventory: false, sales: false, transfers: false } }).routes, { inventory: false, sales: false, transfers: false });
});
test('actual emitted manifest is copied and constrained to finite relative JS/CSS assets', () => {
  const source = assets(); const parsed = parseDevelopmentHostAssets(source); source.styles.sales = 'changed.css';
  assert.equal(parsed.styles.sales, 'sales.css'); assert.ok(Object.isFrozen(parsed.styles));
  for (const file of ['https://other.test/app.js', '//other.test/app.js', '../app.js', 'chunks/../app.js', 'app.js?token=SYNTHETIC', 'app.js#x', 'app%2ejs', 'app.css', '/app.js']) assert.throws(() => parseDevelopmentHostAssets({ ...assets(), entry: file }));
  for (const file of ['../product.css', '//other.test/x.css', 'product.css?x=1', 'product.js']) assert.throws(() => parseDevelopmentHostAssets({ ...assets(), productDrawerStyles: file }));
  assert.throws(() => parseDevelopmentHostAssets({ ...assets(), token: 'SYNTHETIC' }));
  assert.throws(() => parseDevelopmentHostAssets({ ...assets(), styles: { ...assets().styles, secret: 'SYNTHETIC' } }));
});
