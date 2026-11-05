import test from 'node:test';
import assert from 'node:assert/strict';
import { createReadonlyTransferFixtures } from './readonly-transfer-fixtures.ts';
import { transferDetailResponse } from '../src/transfers/response-validation.ts';
import { transferMatrix, transferMatrixDisplay } from '../src/transfers/matrix.ts';
import { createSyntheticUnifiedTransport } from './synthetic-transport.ts';
import { createTransferHttpReader } from '../src/transfers/http-reader.ts';
import { createProductHttpReader } from '../src/transport/product-http-reader.ts';
import { syntheticId } from '../management-browser-harness/synthetic-transport.ts';
import type { QueryRead } from '../src/loading/latest-query.ts';
const read = <P>(parameters: P): QueryRead<P> => ({ parameters, signal: new AbortController().signal, identity: { accountId: syntheticId(900), sessionRevision: 'SYN-RO', permissionRevision: 'SYN-RO' }, routeInstanceId: 'SYN-RO', entityId: null });
test('wide readonly facts validate actual reader shape, unique line.id/repeated SKU and original fallback', () => {
  const fixture = createReadonlyTransferFixtures(), allIds = new Set<string>();
  assert.deepEqual(fixture.details.map(data => data.document.lines.length), [40, 83, 2000]);
  for (const data of fixture.details) {
    transferDetailResponse(data, { transferId: data.document.header.id });
    assert.equal(data.stockBasis, 'CUTOFF_HISTORY'); assert.equal(new Set(data.document.lines.map(line => line.skuId)).size, 1);
    for (const line of data.document.lines) { assert.ok(!allIds.has(line.id)); allIds.add(line.id); assert.equal(line.transferId, data.document.header.id); }
    assert.equal(data.document.lines[0]!.snapshot.barcode, null); assert.equal(data.document.lines[1]!.snapshot.barcode, ''); assert.equal(data.document.lines[2]!.snapshot.barcode, '000001234567890123');
    assert.notEqual(data.document.lines[0]!.snapshot.productName, data.catalog.skus[0]!.productName);
    assert.equal(data.catalog.sizeGroups[0]!.members.length, 200); assert.equal(transferMatrixDisplay(transferMatrix(data)).mode, 'paged-lines');
  }
  assert.deepEqual(fixture.summaries.map(row => row.totalQuantity), ['9007199254741032', '9007199254741075', '9007199254742992']);
  const original = fixture.details[0]!, invalid = { ...original, document: { ...original.document, lines: original.document.lines.map((line, index) => index === 1 ? { ...line, id: original.document.lines[0]!.id } : line) } }; assert.throws(() => transferDetailResponse(invalid, { transferId: invalid.document.header.id }), 'Duplicate actual line identities must remain invalid');
});
test('only explicit readonly transport exposes wide facts/product reads and refuses prepare/save without writes', async () => {
  const standard = createSyntheticUnifiedTransport(); standard.authorize();
  const transport = createSyntheticUnifiedTransport(undefined, 'transfer-readonly'); transport.authorize();
  const query = { filter: { startDate: null, endDate: null, statuses: [], number: null, fromWarehouseIds: [], toWarehouseIds: [] }, page: 1, pageSize: 20 as const };
  const reader = createTransferHttpReader(transport.http), list = await reader.readList(read(query)); assert.equal(list.items.length, 3); assert.equal(list.exactTotal, '3');
  const normal = await createTransferHttpReader(standard.http).readList(read(query)); assert.equal(normal.items.length, 1); assert.equal(normal.items[0]!.number, 'SYN-HISTORY-DB-001');
  const data = await reader.readDetail(read({ transferId: list.items[2]!.id })); assert.equal(data.document.lines.length, 2000); assert.equal(data.catalog.sizeGroups[0]!.members.length, 200);
  const filtered = await reader.readList(read({ ...query, filter: { ...query.filter, number: 'TR-83' } })); assert.equal(filtered.items.length, 1); assert.equal(filtered.items[0]!.number, 'SYN-RO-TR-83');
  const product = createProductHttpReader(transport.http), parameters = { productId: data.catalog.skus[0]!.productId };
  assert.equal((await product.readProductBasics(read(parameters)))?.name, data.catalog.skus[0]!.productName); assert.equal((await product.readProductSpecifications(read(parameters)))?.sizes.length, 200); assert.equal((await product.readProductImages(read(parameters)))?.images.length, 0);
  for (const path of ['/transfers/prepare-create', '/transfers/commands']) { const result = await transport.http.fetch(transport.http.origin + '/api' + path, { method: 'POST', credentials: 'same-origin', body: '{}' }); assert.equal(result.status, 403); }
  assert.equal(transport.savedCounts().transfers, 0); transport.revoke(); await assert.rejects(reader.readList(read(query)), { kind: 'unauthenticated' });
});
