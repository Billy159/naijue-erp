import assert from 'node:assert/strict';
import test from 'node:test';
import { ReadContext } from '../loading/read-scope.ts';
import { assertProductBasics, assertProductImage, assertProductImages, assertProductSpecifications, createProductQuery } from './product-model.ts';
import { createSyntheticProductReader } from '../../preview/synthetic-product-reader.ts';
import type { ProductBasics, ProductSpecifications } from './product-contracts.ts';

const identity = { accountId: 'SYNTHETIC-PRODUCT', sessionRevision: '1', permissionRevision: '1' };
const parameters = { productId: 'test-product-1' };
const basics: ProductBasics = { productId: parameters.productId, code: 'TEST-001', name: '测试上衣1', categoryLabel: null, yearLabel: null, seasonLabel: null, supplierLabel: null, systemCode: null, retailPrice: null };
const specs: ProductSpecifications = { productId: parameters.productId, sizeGroup: { id: 'test-group', label: '测试上衣' }, colors: [{ id: 'test-blue', label: '测试蓝' }], fits: [{ id: 'test-Y', label: 'Y版（修身）' }, { id: 'test-A', label: 'A版（标准）' }], sizes: [{ id: 'test-size', label: '165/S' }], skus: [{ id: 'test-sku-Y', colorId: 'test-blue', fitId: 'test-Y', sizeId: 'test-size' }, { id: 'test-sku-A', colorId: 'test-blue', fitId: 'test-A', sizeId: 'test-size' }] };

test('product DTOs validate target identity and preserve same-color/size different FIT legal SKUs', () => {
  assertProductBasics(basics, parameters); assertProductSpecifications(specs, parameters);
  assert.throws(() => assertProductBasics({ ...basics, productId: 'other' }, parameters), /目标/);
  assert.throws(() => assertProductSpecifications({ ...specs, skus: [...specs.skus, specs.skus[0]!] }, parameters), /重复/);
  assert.throws(() => assertProductSpecifications({ ...specs, skus: [{ ...specs.skus[0]!, sizeId: 'missing' }] }, parameters), /缺少/);
  assert.equal(specs.skus.length, 2); assert.equal(specs.sizes[0]!.label, '165/S');
});
test('null/empty product facts are distinct from malformed success and unsafe media', () => {
  assertProductBasics(null, parameters); assertProductImages({ productId: parameters.productId, images: [] }, parameters);
  assert.throws(() => assertProductBasics({ ...basics, systemCode: '' }, parameters), /缺失/);
  assert.throws(() => assertProductImages({ productId: parameters.productId, images: [{ id: 'x', label: 'test', thumbnailUrl: 'javascript:alert(1)' }] }, parameters), /地址/);
  assert.throws(() => assertProductImage({ productId: parameters.productId, imageId: 'other', url: 'https://synthetic.test/image.png' }, { ...parameters, imageId: 'image' }), /目标/);
  assert.throws(() => assertProductImage({ productId: parameters.productId, imageId: 'image', url: 'data:image/svg+xml;base64,PHN2Zz4=' }, { ...parameters, imageId: 'image' }), /地址/);
});
test('product query is inert until activated; close clears facts and stale ignored transport cannot republish', async () => {
  const context = new ReadContext(identity), scope = context.createScope('TEST-PRODUCT-ROUTE', parameters.productId);
  let calls = 0;
  let deliver!: (data: ProductBasics) => void;
  const query = createProductQuery(scope, () => { calls++; return new Promise<ProductBasics>(resolve => { deliver = resolve; }); }, assertProductBasics);
  assert.equal(calls, 0);
  const pending = query.run(parameters); assert.equal(calls, 1);
  scope.dispose(); deliver(basics);
  assert.equal((await pending).status, 'discarded'); assert.equal(query.getSnapshot().phase, 'disposed'); assert.equal(query.getSnapshot().success, null);
});
test('synthetic provider reads target tabs independently and never reads originals for metadata', async () => {
  const events: string[] = [], context = new ReadContext(identity), scope = context.createScope('TEST-PRODUCT-READ', parameters.productId);
  const reader = createSyntheticProductReader({ delayMs: 0, onRead: event => events.push(event.kind) });
  const base = createProductQuery(scope, read => reader.readProductBasics(read), assertProductBasics);
  const skuQuery = createProductQuery(scope, read => reader.readProductSpecifications(read), assertProductSpecifications);
  assert.equal(events.length, 0); await base.run(parameters); assert.deepEqual(events, ['base']);
  const result = await skuQuery.run(parameters); assert.equal(result.status, 'success');
  if (result.status === 'success') {
    assert.ok(result.data!.skus.some(sku => sku.fitId === 'test-fit-Y'));
    assert.ok(result.data!.skus.some(sku => sku.fitId === 'test-fit-A'));
    assert.equal(result.data!.skus.length, 28);
    assert.equal(result.data!.sizes[1]!.label, '165/S');
  }
  assert.deepEqual(events, ['base', 'specs']); context.clear();
});

test('synthetic thumbnail fixture contains a decodable real PNG rather than passing only URL syntax', async () => {
  const { inflateSync } = await import('node:zlib');
  const reader = createSyntheticProductReader({ delayMs: 0 });
  const controller = new AbortController();
  const data = await reader.readProductImages({ parameters, signal: controller.signal, identity, routeInstanceId: 'TEST-PNG', entityId: parameters.productId });
  const bytes = Buffer.from(data!.images[0]!.thumbnailUrl.split(',')[1]!, 'base64');
  assert.deepEqual(bytes.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const compressed: Buffer[] = [];
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    if (bytes.toString('ascii', offset + 4, offset + 8) === 'IDAT') compressed.push(bytes.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  assert.deepEqual(inflateSync(Buffer.concat(compressed)), Buffer.from([0, 62, 123, 243, 255]));
});
