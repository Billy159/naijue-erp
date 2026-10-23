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

const numberedParameters = (current = 1, source = '') => parseInventoryLedgerQuery({ warehouseId: id(2), skuId: id(3), pageSize: 20, after: null, page: current,
  filter: { dateFrom: '2026-10-01', dateTo: '2026-10-31', businessType: null, source } });
function numberedPage(current = 1, total = '45') {
  const remaining = BigInt(total) - (BigInt(current) - 1n) * 20n;
  const count = Number(remaining < 0n ? 0n : remaining > 20n ? 20n : remaining);
  return { ...page(), pageSize: 20, page: current, filteredTotal: total, nextCursor: null,
    entries: Array.from({ length: count }, (_, index) => ({ ...page().entries[0]!, id: id(1000 - index), display: {
      date: '2026-10-22', businessType: 'TRANSFER_OUT', sourceNumber: 'ı_%\\0001',
      operator: { accountId: id(20), name: '当前员工', labelBasis: 'CURRENT_REFERENCE' },
      balanceTransition: { state: 'UNKNOWN', before: null, after: null, reason: 'NO_RECORDED_BALANCE_TRANSITION' }, navigation: 'NOT_CHECKED',
    } })) };
}
test('numbered ledger keeps authoritative exact totals across full, last and out-of-range pages', () => {
  for (const [current, count] of [[2, 20], [3, 5], [4, 0]] as const) {
    const result = checkedLedgerPage(numberedPage(current), numberedParameters(current));
    assert.equal(result.entries.length, count); assert.equal(result.page, current); assert.equal(result.filteredTotal, '45'); assert.equal(result.nextCursor, null);
  }
  const large = checkedLedgerPage(numberedPage(1, '9007199254740993'), numberedParameters());
  assert.equal(large.filteredTotal, '9007199254740993'); assert.equal(large.entries[0]!.quantityDelta, '-9007199254740993');
  assert.equal(large.entries[0]!.postedAt, '2026-10-22T01:02:03.123456Z');
  assert.equal(checkedLedgerPage(numberedPage(1, '0'), numberedParameters()).entries.length, 0);
});
test('numbered HTTP keeps paired page/filter through immutable query snapshots on the same endpoint', async () => {
  const ctx = context(), scope = ctx.createScope('numbered-ledger', id(3)); const bodies: unknown[] = [];
  const reader = createInventoryLedgerHttpReader({ origin: 'https://erp.example', basePath: '/api', fetch: async (url, init) => {
    assert.equal(url, 'https://erp.example/api/inventory/ledger/query'); assert.equal(init.method, 'POST');
    bodies.push(JSON.parse(init.body as string));
    return new Response(JSON.stringify(numberedPage(2)), { status: 200, headers: { 'content-type': 'application/json' } });
  } });
  const query = createInventoryLedgerQuery(scope, reader, () => assert.fail('unexpected denial'));
  assert.equal(bodies.length, 0);
  const input = numberedParameters(2, '  I_%\\0001  ');
  assert.equal((await query.run(input)).status, 'success');
  assert.deepEqual(bodies, [input]); assert.equal(query.getSnapshot().success!.parameters.filter!.source, 'I_%\\0001');
  assert.equal(query.getSnapshot().success!.data.entries[0]!.display!.sourceNumber, 'ı_%\\0001', 'DB locale source match is not redone by JS lowercase');
  ctx.clear();
});
test('numbered consumer rejects contradictory counts, display facts and permission claims', () => {
  const edits: ((value: ReturnType<typeof numberedPage>) => void)[] = [
    value => { value.page = 2; }, value => { value.filteredTotal = '19'; }, value => { value.filteredTotal = '045'; },
    value => { value.entries.pop(); }, value => { value.entries[0]!.display.date = '2026-02-30'; },
    value => { value.entries[0]!.display.date = '2026-09-30'; }, value => { value.entries[0]!.display.businessType = 'PURCHASE'; },
    value => { value.entries[0]!.display.navigation = 'ALLOWED'; }, value => { value.entries[0]!.display.operator.labelBasis = 'HISTORICAL'; },
    value => { value.entries[0]!.display.balanceTransition.state = 'KNOWN'; },
  ];
  for (const edit of edits) { const bad = numberedPage(); edit(bad); assert.throws(() => checkedLedgerPage(bad, numberedParameters()), (error: unknown) => error instanceof HttpQueryError && error.kind === 'malformed-response'); }
  const badAccount = numberedPage(); Object.assign(badAccount.entries[0]!.display.operator, { accountId: null });
  assert.throws(() => checkedLedgerPage(badAccount, numberedParameters()));
  const inventedZero = numberedPage(); Object.assign(inventedZero.entries[0]!.display.balanceTransition, { before: '0', after: '-9007199254740993' });
  assert.throws(() => checkedLedgerPage(inventedZero, numberedParameters()));
  const request = { ...numberedParameters(), filter: { ...numberedParameters().filter!, businessType: 'SALE' as const } };
  assert.throws(() => checkedLedgerPage(numberedPage(), request));
  assert.throws(() => checkedLedgerPage(numberedPage(), parameters()), 'legacy mode must not silently accept a different DTO');
});
test('numbered consumer retains native HISTORY_REVISION identity and nullable display facts', () => {
  const raw = numberedPage(1, '1');
  Object.assign(raw.entries[0]!, { eventKind: 'HISTORY_REVISION', sourceDocumentVersion: 2,
    source: { kind: 'HISTORY_REVISION', documentKind: 'SALES', revisionId: id(30), salesId: id(31), salesLineId: id(32), endpoint: 'SALES_WAREHOUSE' } });
  Object.assign(raw.entries[0]!.display, { businessType: 'RETURN', sourceNumber: null, operator: { accountId: null, name: null, labelBasis: 'CURRENT_REFERENCE' } });
  const parsed = checkedLedgerPage(raw, numberedParameters());
  assert.equal(parsed.entries[0]!.source.kind, 'HISTORY_REVISION'); assert.equal(parsed.entries[0]!.display!.businessType, 'RETURN');
  assert.equal(parsed.entries[0]!.display!.operator.name, null); assert.equal(parsed.entries[0]!.display!.balanceTransition.before, null);
  raw.entries[0]!.sourceDocumentVersion = 1; assert.throws(() => checkedLedgerPage(raw, numberedParameters()));
});
