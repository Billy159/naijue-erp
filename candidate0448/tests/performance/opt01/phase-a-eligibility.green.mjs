/** Scripted original pool protocol, NOT actual PostgreSQL admission or plan evidence. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { phaseLoad, uid, signal, skus } from './phase-a-binding.mjs';
const { PostgresCurrentFormReader } = await phaseLoad('adapters/postgres/src/current-form-reader.ts');
const { createSourceConfirmedCurrentFormAuthorization } = await phaseLoad('packages/application/src/source-confirmed-current-form-authorization.ts');
const { DomainError } = await phaseLoad('packages/domain/src/errors.ts');
const actor = { accountId: uid(1), hallId: uid(2) };
const query = { context: { kind: 'SALES', hallId: uid(2) }, skuIds: [uid(11), uid(12), uid(10)] };
const nativeSku = row => ({ id: row.id, sku_code: row.skuCode, product_id: row.productId, product_code: row.productCode, product_name: row.productName,
  color_id: row.colorId, color_name: row.colorName, fit_id: row.fitId, fit_name: row.fitName,
  size_id: row.sizeId, size_name: row.sizeName, size_group_id: row.sizeGroupId, member_size_id: row.sizeId,
  sku_enabled: true, product_enabled: true, color_enabled: true, fit_enabled: true });
const nativeProduct = row => ({ id: row.productId, product_code: row.productCode, name: row.productName, retail_price: '999.99',
  enabled: true, size_group_id: row.sizeGroupId, category_id: uid(60), category_name: null });
function setup(options = {}) {
  const calls = [], releases = [], intents = [];
  const skuRows = options.skuRows ?? skus().map(nativeSku);
  const productRows = options.productRows ?? [nativeProduct(skus()[2]), nativeProduct(skus()[0])];
  const authorization = options.authorization ?? createSourceConfirmedCurrentFormAuthorization();
  const client = { async query(sql, values = []) {
    calls.push({ sql, values: structuredClone(values) });
    if (sql === 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [], rowCount: 0 };
    let rows;
    if (sql.includes('current-form:identity')) rows = [{ account_id: actor.accountId, staff_id: uid(3), login_enabled: true, role: 'SALESPERSON', employment_status: '在职', hall_id: actor.hallId, native_hall_id: actor.hallId, hall_enabled: true, ...options.identity }];
    else if (sql.includes('current-form:sales-hall')) rows = [{ id: uid(2), enabled: true }];
    else if (sql.includes('current-form:sku-batch')) rows = skuRows;
    else if (sql.includes('current-form:saved-edit-products')) { rows = productRows; options.afterProducts?.(); }
    else throw Error(`Unexpected SQL: ${sql}`);
    return { rows: structuredClone(rows), rowCount: rows.length };
  }, release(error) { releases.push(error); } };
  const reader = new PostgresCurrentFormReader({ async connect() { return client; } }, { async authorize(context, intent, active) {
    intents.push(intent); return authorization.authorize(context, intent, active);
  } });
  return { reader, calls, releases, intents };
}
test('combined batch uses one RR snapshot, actual SKU order and one source-admitted set query per unique product', async () => {
  const f = setup(), value = await f.reader.readSavedEditSkuBatch(actor, query, signal());
  assert.equal(value.version, 1); assert.deepEqual(value.skus.map(row => row.id), query.skuIds);
  assert.deepEqual(value.products, [{ productId: uid(20), state: 'ELIGIBLE', sizeGroupId: uid(30) }, { productId: uid(21), state: 'ELIGIBLE', sizeGroupId: uid(31) }]);
  assert.equal(f.intents.length, 1); assert.equal(f.intents[0].kind, 'saved-edit-sku-batch');
  assert.equal(f.calls[0].sql, 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); assert.equal(f.calls.at(-1).sql, 'COMMIT');
  assert.equal(f.calls.filter(call => call.sql.includes('current-form:sku-batch')).length, 1);
  const products = f.calls.filter(call => call.sql.includes('current-form:saved-edit-products'));
  assert.equal(products.length, 1); assert.deepEqual(products[0].values, [[uid(20), uid(21)], 3]);
  assert.match(products[0].sql, /p\.id = ANY\(\$1::uuid\[\]\)/);
  assert.match(products[0].sql, /p\.enabled/); assert.match(products[0].sql, /ib\.status<>'IMPORTED'/);
  assert.match(products[0].sql, /src\.entity_type='PRODUCT'/); assert.match(products[0].sql, /native_product_id/);
  assert.ok(!f.calls.some(call => /current-form:count|current-form:page|INSERT|UPDATE|DELETE/.test(call.sql)));
  assert.equal(f.releases.length, 1);
});
test('missing/source-excluded product result is explicit UNAVAILABLE, not SKU failure or assumed group', async () => {
  const f = setup({ productRows: [nativeProduct(skus()[2])] }), value = await f.reader.readSavedEditSkuBatch(actor, query, signal());
  assert.equal(value.skus.length, 3);
  assert.deepEqual(value.products, [{ productId: uid(20), state: 'UNAVAILABLE' }, { productId: uid(21), state: 'ELIGIBLE', sizeGroupId: uid(31) }]);
});
test('new intent must be explicitly authorized; old SKU authorization is not a fallback', async () => {
  const f = setup({ authorization: { async authorize(_context, intent) {
    if (intent.kind !== 'sku-batch') throw new DomainError('FORBIDDEN', 'New intent not authorized'); return { kind: 'all' };
  } } });
  await assert.rejects(() => f.reader.readSavedEditSkuBatch(actor, query, signal()), { code: 'FORBIDDEN' });
  assert.ok(!f.calls.some(call => call.sql.includes('current-form:sku-batch'))); assert.equal(f.calls.at(-1).sql, 'ROLLBACK');
});
test('target fields, product relation and mandatory native SKU facts remain strict all-or-fail', async () => {
  const invalidProducts = [
    [{ ...nativeProduct(skus()[0]), retail_price: 'broken' }], [{ ...nativeProduct(skus()[0]), category_id: 'not-native' }],
    [{ ...nativeProduct(skus()[0]), size_group_id: uid(99) }], [nativeProduct(skus()[0]), nativeProduct(skus()[0])],
    [{ ...nativeProduct(skus()[0]), id: uid(99) }],
  ];
  for (const productRows of invalidProducts) {
    const f = setup({ productRows });
    await assert.rejects(() => f.reader.readSavedEditSkuBatch(actor, query, signal()), error => error.code === 'INVALID_DATABASE_VALUE' || error.code === 'INVALID_ID');
    assert.equal(f.calls.at(-1).sql, 'ROLLBACK'); assert.equal(f.releases.length, 1);
  }
  for (const skuRows of [[], skus().map(nativeSku).map((row, index) => index ? row : { ...row, color_enabled: false }), skus().map(nativeSku).map((row, index) => index ? row : { ...row, member_size_id: uid(99) })]) {
    const f = setup({ skuRows });
    await assert.rejects(() => f.reader.readSavedEditSkuBatch(actor, query, signal()), error => ['SKU_UNAVAILABLE', 'INVALID_DATABASE_VALUE'].includes(error.code));
    assert.ok(!f.calls.some(call => call.sql.includes('current-form:saved-edit-products')));
  }
});
test('revoked current identity and cancellation never publish a combined success', async () => {
  const denied = setup({ identity: { login_enabled: false } });
  await assert.rejects(() => denied.reader.readSavedEditSkuBatch(actor, query, signal()), { code: 'FORBIDDEN' });
  const controller = new AbortController(), canceled = setup({ afterProducts: () => controller.abort() });
  await assert.rejects(() => canceled.reader.readSavedEditSkuBatch(actor, query, controller.signal), { code: 'CURRENT_FORM_READ_ABORTED' });
  assert.equal(canceled.calls.at(-1).sql, 'ROLLBACK');
});
