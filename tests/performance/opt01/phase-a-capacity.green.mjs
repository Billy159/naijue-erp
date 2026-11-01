/** FINAL STRING V2 byte proof + real original transport guard; no PG/server/browser timing. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { phaseLoad, uid, signal, wireSku, response } from './phase-a-binding.mjs';
import { SKU_FIELDS, capacityFixture, stringWireV2 } from './sku-capacity-fixture.mjs';
const { createCurrentFormHttpReader } = await phaseLoad('apps/web/src/current-form/http-reader.ts');
const { encodeCurrentFormSavedEditSkuBatchWireV2 } = await phaseLoad('apps/api/src/current-form-http.ts');
const { CURRENT_FORM_SAVED_EDIT_SKU_WIRE_FIELDS } = await phaseLoad('packages/application/src/current-form-ports.ts');
const bytes = value => Buffer.byteLength(JSON.stringify(value));
const reader = value => createCurrentFormHttpReader({ origin: 'https://capacity.invalid', basePath: '', fetch: async () => response(value) });

test('FINAL STRING V2 exact constants and every 1<=N<=200 / 1<=P<=N / mixed E,U has at least26 bytes headroom', () => {
  assert.equal(SKU_FIELDS.reduce((sum, key) => sum + bytes(key) + 1, 0), 151);
  assert.deepEqual(CURRENT_FORM_SAVED_EDIT_SKU_WIRE_FIELDS, SKU_FIELDS);
  assert.equal(bytes([uid(20), 'ELIGIBLE', uid(30)]), 90); assert.equal(bytes([uid(20), 'UNAVAILABLE']), 54);
  let maximum = -Infinity, combinations = 0;
  for (let n = 1; n <= 200; n++) for (let p = 1; p <= n; p++) for (let e = 0; e <= p; e++) {
    const delta = 34 - 151 * n + 91 * e + 55 * (p - e);
    assert.ok(delta <= -26); maximum = Math.max(maximum, delta); combinations++;
  }
  assert.equal(maximum, -26); assert.equal(combinations, 1373500);
});
test('FINAL STRING V2 identical UTF8/escape value tokens cancel and all thirteen fields roundtrip at N1 and N200', async () => {
  for (const n of [1, 200]) for (const unavailable of [false, true]) {
    const skus = Array.from({ length: n }, (_, i) => wireSku({ id: uid(1000 + i), sizeId: uid(5000 + i),
      productId: uid(2000 + i), sizeGroupId: uid(3000 + i), skuCode: `CODE-${i}-"\\-😀-漢-\u2028-\ud800`, productName: '漢😀"\\'.repeat(100) }));
    const domain = { version: 1, skus, products: skus.map(row => unavailable ? { productId: row.productId, state: 'UNAVAILABLE' } : { productId: row.productId, state: 'ELIGIBLE', sizeGroupId: row.sizeGroupId }) };
    const wire = encodeCurrentFormSavedEditSkuBatchWireV2(domain), expectedDelta = 34 - 151 * n + (unavailable ? 55 : 91) * n;
    assert.deepEqual(wire, stringWireV2(domain));
    assert.equal(bytes(wire) - bytes(skus), expectedDelta);
    assert.deepEqual(await reader(wire).readSavedEditSkuBatch({ context: { kind: 'TRANSFER' }, skuIds: skus.map(row => row.id) }, signal()), domain);
  }
});
test('FINAL STRING V2 reproduces exact original8MiB witness without smaller data and returns all200 full domain rows', async t => {
  const fixture = capacityFixture(), { receipt, domain, query } = fixture;
  assert.equal(receipt.legacy.bytes, 8388508); assert.equal(receipt.legacy.sha256, 'be5a3e838aa4f2cf73e508db9008097fa9b41bc82da8beac7a5681d5aa5b8ba5');
  assert.equal(receipt.version1.bytes, 8388667); assert.equal(receipt.version1.sha256, '74892370631b8a060beaabceef157e8fcf75f7bf6386ba1eb248e0f3c0f69d81');
  assert.ok(domain.skus.every(row => row.skuCode.length <= 65536));
  assert.deepEqual(await reader(domain.skus).readSkuBatch(query, signal()), domain.skus);
  await assert.rejects(() => reader(domain).readSavedEditSkuBatch(query, signal()), { kind: 'too-large', code: 'RESPONSE_TOO_LARGE' });
  assert.equal(receipt.stringVersion2.bytes, receipt.legacy.bytes + 34 - 151 * 200 + 91);
  const actualWire = encodeCurrentFormSavedEditSkuBatchWireV2(domain);
  assert.equal(JSON.stringify(actualWire), fixture.version2Bytes);
  const actual = await reader(actualWire).readSavedEditSkuBatch(query, signal());
  assert.deepEqual(actual, domain); t.diagnostic(JSON.stringify(receipt));
});
test('FINAL STRING V2 rejects incorrect tuple arity/state/identity/order/coverage and does not raise byte limit', async () => {
  const skus = [wireSku(), wireSku({ id: uid(11), productId: uid(21), productCode: 'SYN-B', productName: 'B', sizeGroupId: uid(31) })];
  const domain = { version: 1, skus, products: [{ productId: uid(20), state: 'ELIGIBLE', sizeGroupId: uid(30) }, { productId: uid(21), state: 'UNAVAILABLE' }] };
  const query = { context: { kind: 'TRANSFER' }, skuIds: skus.map(row => row.id) };
  const changes = [w => { w.version = 1; }, w => { w.skus[0].pop(); }, w => { w.skus[0].push('extra'); },
    w => { w.skus[0][12] = 'AVAILABLE'; }, w => { w.skus[0][0] = uid(99); }, w => { w.skus.reverse(); },
    w => { w.products.reverse(); }, w => { w.products.pop(); }, w => { w.products.push(w.products[0]); },
    w => { w.products[0][1] = 1; }, w => { w.products[0][1] = false; }, w => { w.products[0][1] = null; },
    w => { w.products[0].pop(); }, w => { w.products[1].push(uid(31)); }, w => { w.products[0][2] = uid(99); }];
  for (const change of changes) { const wire = stringWireV2(domain); change(wire); await assert.rejects(() => reader(wire).readSavedEditSkuBatch(query, signal()), { kind: 'malformed-response' }); }
  for (let index = 0; index < 13; index++) {
    const wire = stringWireV2(domain); wire.skus[0][index] = null;
    await assert.rejects(() => reader(wire).readSavedEditSkuBatch(query, signal()), { kind: 'malformed-response' });
  }
  const huge = createCurrentFormHttpReader({ origin: 'https://capacity.invalid', basePath: '', fetch: async () => new Response('{}', { headers: { 'content-type': 'application/json', 'content-length': String(8 * 1024 * 1024 + 1) } }) });
  await assert.rejects(() => huge.readSavedEditSkuBatch(query, signal()), { kind: 'too-large', code: 'RESPONSE_TOO_LARGE' });
});
