import assert from 'node:assert/strict';
import test from 'node:test';
import { ReadContext } from '../loading/read-scope.ts';
import { HttpQueryError } from '../transport/http-query.ts';
import { createTransferPageController } from './controller.ts';
import { emptyTransferFilter } from './contracts.ts';
import type { TransferListDto, TransferReader } from './contracts.ts';
import { createTransferHttpReader, createTransferWarehouseHttpReader } from './http-reader.ts';
import { createTransferDetailQuery, createTransferListQuery, transferParameters, transferTarget } from './model.ts';
import { transferCount, transferPageFacts, transferUpdatedMinute } from './format.ts';
import { transferMatrix, transferMatrixDisplay } from './matrix.ts';
import { transferDetailResponse, transferListResponse, transferWarehousesResponse } from './response-validation.ts';
import { detail, summary, uuid, warehouse } from './tests/fixtures.ts';
import { entityId } from '../../../../packages/domain/src/values.ts';
const identity = { accountId: 'TEST-ACCOUNT', sessionRevision: '1', permissionRevision: '1' };
const context = () => new ReadContext(identity);
const list = (n = 1): TransferListDto => ({ page: 1, pageSize: 20, exactTotal: '1', items: [summary(n)] });
const native: TransferReader = { readList: async () => list(), readDetail: async () => detail() };
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
function pending<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

test('construction and parameter edits are inert, source arrays/page sizes are strict', () => {
  let reads = 0; const scope = context().createScope('TEST'); const controller = createTransferPageController(scope, { ...native, readList: async () => { reads++; return list(); } });
  const draft = { ...emptyTransferFilter(), statuses: ['DRAFT', 'VOID'] as const, from: [warehouse()], to: [warehouse(21)], number: ' tr ' };
  const p = transferParameters(draft, 50); assert.equal(p.filter.number, 'tr'); assert.deepEqual(p.filter.statuses, ['DRAFT', 'VOID']); assert.deepEqual(p.filter.fromWarehouseIds, [uuid(20)]); assert.equal(reads, 0);
  assert.throws(() => transferParameters(emptyTransferFilter(), 30 as never)); assert.throws(() => transferParameters({ ...draft, startDate: '2026-10-21', endDate: '2026-10-20' }, 20)); controller.dispose(); assert.equal(scope.active, true);
});
test('exact read HTTP request shape, trusted session only and no hydration', async () => {
  const calls: { url: string; init: RequestInit }[] = []; const reader = createTransferHttpReader({ origin: 'https://synthetic.test', basePath: '/api', fetch: async (url, init) => { calls.push({ url, init }); return json(url.endsWith('/detail/query') ? detail() : list()); } });
  assert.equal(calls.length, 0); const scope = context().createScope('TEST'); const query = createTransferListQuery(scope, reader); await query.run(transferParameters(emptyTransferFilter(), 20));
  assert.equal(calls.length, 1); assert.equal(calls[0]!.url, 'https://synthetic.test/api/transfers/query'); const body = JSON.parse(calls[0]!.init.body as string); assert.deepEqual(Object.keys(body).sort(), ['filter', 'page', 'pageSize']); assert.deepEqual(Object.keys(body.filter).sort(), ['endDate', 'fromWarehouseIds', 'number', 'startDate', 'statuses', 'toWarehouseIds']);
  assert.equal(calls[0]!.init.credentials, 'same-origin'); assert.equal(calls[0]!.init.cache, 'no-store'); assert.doesNotMatch(calls[0]!.init.body as string, /actor|role|permission|TEST-ACCOUNT/);
  const q = createTransferDetailQuery(scope, reader); assert.equal((await q.run(transferTarget(uuid(1)))).status, 'success'); assert.equal(calls.length, 2); assert.deepEqual(JSON.parse(calls[1]!.init.body as string), { transferId: uuid(1) }); scope.dispose();
});
test('response fails closed for missing summaries, wrong scope/count/page, duplicates and scalar aliases', () => {
  const p = transferParameters(emptyTransferFilter(), 20); assert.equal(transferListResponse(list(), p).items.length, 1);
  const withoutQuantity = structuredClone(list()) as unknown as { items: Record<string, unknown>[] }; delete withoutQuantity.items[0]!.totalQuantity;
  assert.throws(() => transferListResponse(withoutQuantity, p)); assert.throws(() => transferListResponse({ ...list(), exactTotal: '2' }, p)); assert.throws(() => transferListResponse({ ...list(), page: 2 }, p));
  assert.throws(() => transferListResponse({ ...list(), exactTotal: '2', items: [summary(), summary()] }, p));
  assert.throws(() => transferListResponse(list(), { ...p, filter: { ...p.filter, statuses: ['APPROVED'] } }));
  assert.equal(transferListResponse(list(), { ...p, filter: { ...p.filter, number: 'test-tr' } }).items.length, 1);
});
test('detail validates complete canonical metadata while keeping saved full labels', () => {
  const d = detail(); assert.equal(transferDetailResponse(d, transferTarget(uuid(1))), d);
  assert.throws(() => transferDetailResponse(d, transferTarget(uuid(2))));
  const noSku = structuredClone(d); (noSku.catalog.skus as unknown[]).shift(); assert.throws(() => transferDetailResponse(noSku, transferTarget(uuid(1))));
  const badGroup = structuredClone(d); (badGroup.catalog.sizeGroups[0]!.members as unknown[]).shift(); assert.throws(() => transferDetailResponse(badGroup, transferTarget(uuid(1))));
  const duplicateSku = structuredClone(d); (duplicateSku.catalog.skus as unknown[]).push(duplicateSku.catalog.skus[0]); assert.throws(() => transferDetailResponse(duplicateSku, transferTarget(uuid(1))));
  const oldLine = structuredClone(d); (oldLine.document.lines[0] as { isCurrent: boolean }).isCurrent = false; assert.throws(() => transferDetailResponse(oldLine, transferTarget(uuid(1))));
  assert.equal(d.document.lines[0]!.snapshot.fitName, 'TEST 原Y版（修身）'); assert.equal(d.catalog.skus[0]!.fitName, 'Y版（修身）完整名称');
});
test('contradictory current product/color/FIT/size identity facts fail closed', () => {
  for (const field of ['productCode', 'productName', 'colorName', 'fitName'] as const) {
    const d = structuredClone(detail()); (d.catalog.skus[1] as unknown as Record<string, unknown>)[field] = 'CONTRADICTORY';
    assert.throws(() => transferDetailResponse(d, transferTarget(uuid(1))));
  }
  const d = structuredClone(detail()); const group = { ...d.catalog.sizeGroups[0]!, sizeGroupId: entityId('sizeGroup', uuid(99)) };
  (d.catalog.sizeGroups as unknown[]).push(group); (d.catalog.skus[1] as unknown as Record<string, unknown>).sizeGroupId = group.sizeGroupId;
  assert.throws(() => transferDetailResponse(d, transferTarget(uuid(1))));
});
test('canonical matrix uses identities, full ordered sizes, exact actual quantities and legal empty vs nonexistent SKU', () => {
  const d = detail(); const matrix = transferMatrix(d); assert.equal(matrix.length, 1); assert.deepEqual(matrix[0]!.group.members.map(size => size.name), ['165/S', '170/M', '175/L', '180/XL']);
  const row = matrix[0]!.rows[0]!; assert.equal(row.total, 9007199254740995n); assert.equal(row.skus.has(uuid(62)), true); assert.equal(row.quantities.has(uuid(72)), false); assert.equal(row.skus.has(uuid(63)), false);
  assert.equal(transferMatrixDisplay(matrix).mode, 'matrix');
});
test('same labels never merge different product/color/FIT identities', () => {
  const d = structuredClone(detail()); const second = { ...d.catalog.skus[0]!, skuId: entityId('sku', uuid(80)), productId: entityId('product', uuid(81)) };
  (d.catalog.skus as unknown[]).push(second); (d.document.lines as unknown[]).push({ ...d.document.lines[0]!, id: entityId('transferLine', uuid(180)), lineNo: 3, skuId: second.skuId, quantity: '1' });
  assert.equal(transferMatrix(transferDetailResponse(d, transferTarget(uuid(1))))[0]!.rows.length, 2);
});
test('wide and many-row grids select explicit bounded fallback before Cartesian materialization', () => {
  const section = transferMatrix(detail())[0]!;
  const wide = { ...section, group: { ...section.group, members: Array.from({ length: 20000 }, (_, i) => ({ ...section.group.members[0]!, sizeId: entityId('size', uuid(1000 + i)), name: `完整尺码 ${i}`, displayOrder: i })) } };
  assert.equal(transferMatrixDisplay([wide]).mode, 'paged-lines');
  assert.equal(transferMatrixDisplay([{ ...section, rows: Array.from({ length: 2000 }, () => section.rows[0]!) }]).mode, 'paged-lines');
  assert.equal(transferMatrixDisplay([{ ...section, rows: Array.from({ length: 60 }, () => section.rows[0]!), group: { ...section.group, members: Array.from({ length: 40 }, () => section.group.members[0]!) } }]).mode, 'matrix');
});
test('exact formatting and huge count paging do not round quantities or expose unsafe page actions', () => {
  assert.equal(transferCount('9007199254740995'), '9,007,199,254,740,995'); assert.equal(transferUpdatedMinute('2026-10-20T20:34:00.000000Z'), '2026-10-21 04:34');
  assert.equal(transferPageFacts(1, 20, '900719925474099300').pages, 45035996273704965n); assert.equal(transferPageFacts(2, 20, '21').first, 21n); assert.equal(transferPageFacts(2, 20, '21').last, 21n);
  assert.throws(() => transferCount('01')); assert.throws(() => transferPageFacts(1, 30, '10')); assert.equal(transferPageFacts(1, 20, '0').first, 0n);
});
test('superseded and cancelled list reads discard late ignored-signal success', async () => {
  const first = pending<TransferListDto>(); const second = pending<TransferListDto>(); let n = 0; const signals: AbortSignal[] = [];
  const scope = context().createScope('TEST'); const query = createTransferListQuery(scope, { ...native, readList: async read => { signals.push(read.signal); return ++n === 1 ? first.promise : second.promise; } });
  const p = transferParameters(emptyTransferFilter(), 20); const older = query.run(p); const newer = query.run(p); assert.equal(signals[0]!.aborted, true); second.resolve(list(2)); assert.equal((await newer).status, 'success'); first.resolve(list()); assert.equal((await older).status, 'discarded'); assert.equal(query.getSnapshot().success!.data.items[0]!.id, uuid(2));
  const stalled = pending<TransferListDto>(); const q = createTransferListQuery(scope, { ...native, readList: () => stalled.promise }); const cancelled = q.run(p); q.cancel(); assert.equal((await cancelled).status, 'discarded'); stalled.resolve(list()); await Promise.resolve(); assert.equal(q.getSnapshot().success, null); scope.dispose();
});
test('failed read retains marked executed facts, identity replacement clears all list/detail results', async () => {
  const c = context(); const scope = c.createScope('TEST'); let fail = false; const query = createTransferListQuery(scope, { ...native, readList: async () => { if (fail) throw new Error('private provider error'); return list(); } }); const p = transferParameters(emptyTransferFilter(), 20);
  await query.run(p); fail = true; await query.run({ ...p, pageSize: 50 }); assert.equal(query.getSnapshot().phase, 'error'); assert.equal(query.getSnapshot().success!.parameters.pageSize, 20); assert.equal(query.getSnapshot().request!.parameters.pageSize, 50);
  const q = createTransferDetailQuery(scope, native); await q.run(transferTarget(uuid(1))); c.replaceIdentity({ ...identity, permissionRevision: '2' }); assert.equal(query.getSnapshot().success, null); assert.equal(q.getSnapshot().success, null);
});
test('401/403 revoke route and child reads immediately without retained old labels', async () => {
  for (const [kind, status] of [['unauthenticated', 401], ['forbidden', 403]] as const) {
    const scope = context().createScope('TEST'); let fail = false; const query = createTransferListQuery(scope, { ...native, readList: async () => { if (fail) throw new HttpQueryError(kind, 'SAFE', status); return list(); } }); const p = transferParameters(emptyTransferFilter(), 20); await query.run(p); fail = true; await query.run(p); assert.equal(scope.active, false); assert.equal(query.getSnapshot().success, null); assert.equal(query.getSnapshot().phase, 'disposed');
  }
});
test('detail version guard never regresses an already-known version', async () => {
  const scope = context().createScope('TEST'); let current = 2; const q = createTransferDetailQuery(scope, { ...native, readDetail: async () => ({ ...detail(), document: { ...detail().document, header: { ...detail().document.header, version: current as never } } }) });
  const p = transferTarget(uuid(1)); assert.equal((await q.run(p)).status, 'success'); current = 1; assert.deepEqual(await q.run(p), { status: 'discarded', reason: 'older-version' }); assert.equal(q.getSnapshot().success!.data.document.header.version, 2); scope.dispose();
});
test('bounded warehouse HTTP is independent, exact selected-ID intersection and rejects malformed candidates', async () => {
  const calls: unknown[] = []; const reader = createTransferWarehouseHttpReader({ origin: 'https://synthetic.test', basePath: '/api', fetch: async (url, init) => { calls.push([url, JSON.parse(init.body as string)]); return json({ page: 1, pageSize: 20, exactTotal: '1', items: [warehouse()] }); } });
  assert.equal(calls.length, 0); const scope = context().createScope('TEST'); const p = { search: '', selectedIds: [warehouse().id], page: 1, pageSize: 20 };
  await reader.readWarehouses({ parameters: p, signal: scope.signal, identity, routeInstanceId: 'TEST', entityId: null }); assert.deepEqual(calls, [['https://synthetic.test/api/transfers/warehouses/query', p]]);
  const dto = { page: 1, pageSize: 20, exactTotal: '1', items: [warehouse()] }; assert.equal(transferWarehousesResponse(dto, p).items[0]!.enabled, false);
  assert.throws(() => transferWarehousesResponse(dto, { ...p, selectedIds: [warehouse(21).id] })); assert.throws(() => transferWarehousesResponse({ ...dto, exactTotal: '2' }, p));
  await assert.rejects(async () => reader.readWarehouses({ parameters: { ...p, search: 'X' }, signal: scope.signal, identity, routeInstanceId: 'TEST', entityId: null })); assert.equal(calls.length, 1); scope.dispose();
});
test('malformed transport data never becomes successful empty results or fixtures', async () => {
  const scope = context().createScope('TEST'); const reader = createTransferHttpReader({ origin: 'https://synthetic.test', basePath: '', fetch: async () => json({ page: 1, pageSize: 20, exactTotal: '1', items: [] }) });
  const query = createTransferListQuery(scope, reader); assert.equal((await query.run(transferParameters(emptyTransferFilter(), 20))).status, 'error'); assert.equal(query.getSnapshot().success, null); scope.dispose();
});
