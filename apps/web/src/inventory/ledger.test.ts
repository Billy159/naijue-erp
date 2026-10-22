import assert from 'node:assert/strict';
import test from 'node:test';
import { ReadContext } from '../loading/read-scope.ts';
import { HttpQueryError } from '../transport/http-query.ts';
import { parseInventoryLedgerQuery } from '../../../../packages/application/src/inventory-ledger-query-validation.ts';
import { checkedLedgerPage, createInventoryLedgerHttpReader, createInventoryLedgerQuery } from './ledger-http-reader.ts';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const context = () => new ReadContext({ accountId: id(1), sessionRevision: '1', permissionRevision: '1' });
const parameters = () => parseInventoryLedgerQuery({ warehouseId: id(2), skuId: id(3), pageSize: 1, after: null });
const page = () => ({ pageSize: 1, labelBasis: 'CURRENT_REFERENCE', warehouse: { id: id(2), label: '仓库', hallId: id(4) },
  sku: { id: id(3), code: 'SKU', product: { id: id(5), code: 'P01', name: '商品' }, color: { id: id(6), label: '蓝' }, fit: { id: id(7), code: 'A', label: 'A版' }, sizeGroup: { id: id(8), label: '上装' }, size: { id: id(9), code: null, label: '165/S' } },
  entries: [{ id: id(10), operationId: id(11), eventKind: 'APPROVE', quantityDelta: '-9007199254740993', source: { kind: 'TRANSFER', transferId: id(12), transferLineId: id(13), endpoint: 'FROM' }, sourceDocumentVersion: 1, reversesEntryId: null, businessDate: '2026-10-22', postedAt: '2026-10-22T01:02:03.123456Z' }],
  nextCursor: { postedAt: '2026-10-22T01:02:03.123456Z', entryId: id(10) } });

test('ledger preserves a signed integer beyond Number precision and a six-digit cursor', () => {
  const result = checkedLedgerPage(page(), parameters());
  assert.equal(result.entries[0]!.quantityDelta, '-9007199254740993');
  assert.equal(result.nextCursor!.postedAt, '2026-10-22T01:02:03.123456Z');
  const empty = { ...page(), entries: [], nextCursor: null };
  assert.equal(checkedLedgerPage(empty, parameters()).entries.length, 0);
});
test('wrong warehouse/SKU, unordered pages, invalid source and invented cursors reject', () => {
  const wrongWarehouse = page(); wrongWarehouse.warehouse.id = id(99);
  const wrongSku = page(); wrongSku.sku.id = id(99);
  const wrongCursor = page(); wrongCursor.nextCursor.entryId = id(99);
  const zero = page(); zero.entries[0]!.quantityDelta = '0';
  for (const bad of [wrongWarehouse, wrongSku, wrongCursor, zero]) assert.throws(() => checkedLedgerPage(bad, parameters()), /INVALID|valid|response/i);
  assert.throws(() => checkedLedgerPage(page(), { ...parameters(), after: { postedAt: '2026-10-22T01:02:03.123456Z', entryId: parameters().skuId as never } }));
  assert.throws(() => checkedLedgerPage({ ...page(), entries: [{ ...page().entries[0], source: { kind: 'SALES', salesId: id(12), salesLineId: id(13), endpoint: 'FROM' } }] }, parameters()));
});
test('real HTTP path projects null-prototype query snapshots; no construction-time IO', async () => {
  let calls = 0; const seen: unknown[] = []; const ctx = context(), scope = ctx.createScope('ledger', id(3));
  const reader = createInventoryLedgerHttpReader({ origin: 'https://erp.example', basePath: '/api', fetch: async (url, init) => {
    calls++; assert.equal(url, 'https://erp.example/api/inventory/ledger/query'); assert.equal(init.credentials, 'same-origin');
    seen.push(JSON.parse(init.body as string));
    return new Response(JSON.stringify(page()), { status: 200, headers: { 'content-type': 'application/json' } });
  } });
  assert.equal(calls, 0);
  const query = createInventoryLedgerQuery(scope, reader, () => assert.fail('unexpected denial'));
  assert.equal((await query.run(parameters())).status, 'success');
  assert.deepEqual(seen[0], parameters()); assert.equal(calls, 1); ctx.clear();
});
test('current denial clears successful facts before host notification; cancelled denial is ignored', async () => {
  const ctx = context(), scope = ctx.createScope('ledger', id(3)); let deny = false, notices = 0;
  const query = createInventoryLedgerQuery(scope, { readLedger: async () => { if (deny) throw new HttpQueryError('forbidden', 'FORBIDDEN', 403); return checkedLedgerPage(page(), parameters()); } }, () => { notices++; assert.equal(scope.active, false); assert.equal(query.getSnapshot().success, null); });
  await query.run(parameters()); deny = true; await query.run(parameters()); assert.equal(notices, 1);
  const scope2 = ctx.createScope('ledger-2', id(3)); let reject!: (error: unknown) => void;
  const query2 = createInventoryLedgerQuery(scope2, { readLedger: () => new Promise((_yes, no) => { reject = no; }) }, () => notices++);
  const pending = query2.run(parameters()); query2.cancel(); reject(new HttpQueryError('forbidden', 'FORBIDDEN', 403));
  assert.equal((await pending).status, 'discarded'); assert.equal(notices, 1); assert.equal(scope2.active, true); ctx.clear();
});
