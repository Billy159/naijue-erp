// Independent bounded protocol/source probes only. No database, listener, network, or browser.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { PostgresSalesQueryReader } from '../adapters/postgres/src/sales-query-reader.ts';
import { createSalesQueryService } from '../packages/application/src/sales-query-service.ts';
import { salesListResponse } from '../apps/web/src/sales/response-validation.ts';
import { exactJson } from '../apps/api/src/sales-http.ts';
import { summary } from '../apps/web/src/sales/tests/fixtures.ts';

const uuid = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const actor = { accountId: uuid(901), hallId: uuid(902) };
const parameters = () => ({ page: 1, pageSize: 20, filter: { startDate: null, endDate: null, status: null,
  businessType: null, hallId: null, salespersonId: null, customerId: null, warehouseId: null, number: null } });
const scope = { kind: 'restricted', clauses: [{ hallId: actor.hallId }, { createdByAccountId: actor.accountId }] };
const timestamp = '2026-10-20T00:00:00.123456Z';
const header = n => ({ id: uuid(n), number: `SYNTHETIC-${n}`, business_type: ['SALE', 'RETURN', 'EXCHANGE'][n % 3],
  business_date: '2026-10-20', hall_id: actor.hallId, customer_id: uuid(903), salesperson_id: null,
  warehouse_id: uuid(904), status: 'DRAFT', version: 1, gross_amount: '0.00', order_discount: '0.00', net_due: '0.00',
  updated_at: timestamp, hall_name: 'SYNTHETIC HALL', warehouse_name: 'SYNTHETIC WAREHOUSE',
  customer_name: 'SYNTHETIC CUSTOMER', salesperson_name: null });
const aggregate = (n, q = '0', incoming = '0', outgoing = '0') => ({ sales_id: uuid(n), quantity: q,
  incoming_quantity: incoming, outgoing_quantity: outgoing });
function protocol(headers, aggregates, options = {}) {
  const calls = []; let connections = 0; let releases = 0;
  const client = { async query(sql, values = []) {
    calls.push({ sql, values: structuredClone(values) });
    options.inspect?.(sql, values);
    if (/^BEGIN |^COMMIT$|^ROLLBACK$/.test(sql)) return { rows: [], rowCount: 0 };
    if (/^SELECT COUNT/.test(sql)) return { rows: [{ exact_total: String(options.total ?? headers.length) }], rowCount: 1 };
    if (/^SELECT h.id/.test(sql)) return { rows: structuredClone(headers), rowCount: headers.length };
    if (/^SELECT page.id/.test(sql)) { options.afterBatch?.(); return { rows: structuredClone(aggregates), rowCount: aggregates.length }; }
    assert.fail(`Unexpected SQL: ${sql}`);
  }, release(error) { releases++; assert.equal(error, undefined); } };
  const reader = new PostgresSalesQueryReader({ async connect() { connections++; return client; } });
  return { reader, calls, check() { assert.equal(connections, 1); assert.equal(releases, 1); } };
}
const read = (p = parameters(), signal = new AbortController().signal) => ({ actor, scope, parameters: p, signal });

test('frozen sources: signed non-gift sales summary, ignored retired returns, historical missing category, directional list and Shanghai minute', () => {
  const root = '/workspace/shared/frozen-demo-ui/extracted/8877-ui-evidence-b8bcfe3/frontend/';
  const context = { module: { exports: {} } }; runInNewContext(readFileSync(root + 'sales-summary.js', 'utf8'), context);
  const saved = { id: 'saved', revision: 1, lines: [{ id: 'out', productId: 'p', quantity: 8, unit: '件' },
    { id: 'in', productId: 'p', quantity: -5, unit: '件' }, { id: 'gift', productId: 'p', quantity: 1000, unit: '件', gift: true }] };
  const result = context.module.exports.project(saved, [{ returnLines: [{ quantity: 999, unit: '件' }] }],
    [{ id: 'p', categoryId: 'today' }], { categories: [{ id: 'today', name: 'TODAY' }] });
  assert.equal(result.units['件'], 3); assert.equal(result.gifts['件'], 1000); assert.equal(result.hasReturns, false);
  assert.equal(result.categories[0].id, '__unrecorded'); assert.equal(result.categories[0].units['件'], 3);
  const current = readFileSync(root + 'sales-current.js', 'utf8');
  assert.ok(current.includes("A.type(d)==='销售'?salesUnits(d.salesFacts.units):'退'+salesUnits(K.totals({lines:A.incoming(d)}).units)+' · 换'+salesUnits(K.totals({lines:A.outgoing(d)}).units)"));
  assert.ok(current.includes("timeZone:'Asia/Shanghai'"));
});

test('one RR snapshot, exact signed/minbigint/overflow/cancellation/zero facts and 200 IDs in one batch', async () => {
  const headers = Array.from({ length: 200 }, (_, n) => header(n + 1));
  const rows = headers.map((row, i) => aggregate(i + 1));
  rows[0] = aggregate(1, '-9223372036854775808', '9223372036854775808', '0');
  rows[1] = aggregate(2, '18446744073709551616', '0', '18446744073709551616');
  rows[2] = aggregate(3, '0', '18446744073709551616', '18446744073709551616');
  rows[3] = aggregate(4, '-2', '5', '3');
  const p = parameters(); p.pageSize = 200; p.filter.number = "%_\\' OR TRUE";
  const f = protocol(headers, rows.toReversed()); const result = await f.reader.readList(read(p)); f.check();
  assert.equal(f.calls.length, 5); assert.equal(f.calls[0].sql, 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  assert.equal(f.calls[4].sql, 'COMMIT'); assert.deepEqual(f.calls[1].values, f.calls[2].values.slice(0, -2));
  assert.deepEqual(f.calls[3].values, [headers.map(row => row.id)]); assert.equal(f.calls[3].values[0].length, 200);
  assert.ok(f.calls[1].sql.includes('h.hall_id = $1::uuid')); assert.ok(f.calls[2].sql.includes('h.hall_id = $1::uuid'));
  assert.ok(!f.calls[1].sql.includes(p.filter.number)); assert.ok(!f.calls[2].sql.includes(p.filter.number));
  const batch = f.calls[3].sql;
  assert.match(batch, /LEFT JOIN naijue_erp.sales_line l/); assert.match(batch, /l.is_current AND NOT l.is_gift/);
  assert.match(batch, /SUM\(l.quantity::numeric\)/); assert.match(batch, /-\(l.quantity::numeric\)/);
  assert.ok(!/catalog|product|sku|settlement|LIMIT|OFFSET/.test(batch));
  assert.deepEqual(result.items.slice(0, 5).map(row => [row.quantity, row.incomingQuantity, row.outgoingQuantity]),
    [[-9223372036854775808n, 9223372036854775808n, 0n], [18446744073709551616n, 0n, 18446744073709551616n],
      [0n, 18446744073709551616n, 18446744073709551616n], [-2n, 5n, 3n], [0n, 0n, 0n]]);
  assert.ok(result.items.every(row => row.updatedAt === timestamp));
  const wire = JSON.parse(exactJson(result));
  assert.equal(wire.items[0].quantity, '-9223372036854775808'); assert.equal(wire.items[1].outgoingQuantity, '18446744073709551616');
  assert.equal(wire.items[2].quantity, '0'); assert.equal(wire.items[0].updatedAt, timestamp);
});

test('empty page avoids batch, but missing/duplicate/foreign aggregates and malformed exact facts roll back', async () => {
  const empty = protocol([], [], { total: 0 }); assert.deepEqual((await empty.reader.readList(read())).items, []); empty.check();
  assert.equal(empty.calls.length, 4); assert.ok(!empty.calls.some(call => /^SELECT page.id/.test(call.sql)));
  const malformed = [[], [aggregate(1), aggregate(1)], [aggregate(1), aggregate(999)],
    [aggregate(1), { ...aggregate(2), quantity: '-0' }], [aggregate(1), { ...aggregate(2), quantity: '+0' }],
    [aggregate(1), { ...aggregate(2), quantity: '0.0' }], [aggregate(1), { ...aggregate(2), incoming_quantity: null }],
    [aggregate(1), { ...aggregate(2), outgoing_quantity: 0 }], [aggregate(1), aggregate(2, '1', '2', '2')]];
  for (const rows of malformed) {
    const f = protocol([header(1), header(2)], rows);
    await assert.rejects(() => f.reader.readList(read()), { code: 'INVALID_DATABASE_VALUE' }); f.check();
    assert.equal(f.calls.at(-1).sql, 'ROLLBACK'); assert.ok(!f.calls.some(call => call.sql === 'COMMIT'));
  }
  const duplicateHeader = protocol([header(1), header(1)], [aggregate(1)]);
  await assert.rejects(() => duplicateHeader.reader.readList(read()), { code: 'INVALID_DATABASE_VALUE' }); duplicateHeader.check();
  assert.ok(!duplicateHeader.calls.some(call => /^SELECT page.id/.test(call.sql)));
  const nullStamp = protocol([{ ...header(1), updated_at: null }], [aggregate(1)]);
  await assert.rejects(() => nullStamp.reader.readList(read()), { code: 'INVALID_DATABASE_VALUE' }); nullStamp.check();
});

test('abort after batch cannot publish success and does not query or commit again', async () => {
  const controller = new AbortController(); const f = protocol([header(1)], [aggregate(1)], { afterBatch: () => controller.abort() });
  await assert.rejects(() => f.reader.readList(read(parameters(), controller.signal)), { code: 'SALES_READ_ABORTED' }); f.check();
  assert.equal(f.calls.at(-1).sql, 'ROLLBACK'); assert.equal(f.calls.length, 5);
});

test('new response fields cannot be injected into request/auth scope and current authorization runs once per list', async () => {
  let policies = 0; let lists = 0; const calls = [];
  const reader = { readReferences() {}, readDetail() {}, readHistory() {}, readSettlementStatistics() {}, async readList(read) {
    lists++; calls.push(read); return { page: read.parameters.page, pageSize: read.parameters.pageSize, exactTotal: 0n, items: [] };
  } };
  const service = createSalesQueryService({ authorization: { async authorize(a, intent) {
    policies++; assert.deepEqual(a, actor); assert.equal(intent.kind, 'list'); return scope;
  } }, reader });
  for (const field of ['quantity', 'incomingQuantity', 'outgoingQuantity', 'updatedAt', 'categorySummary', 'unit']) {
    const p = parameters(); assert.throws(() => service.readList(actor, { ...p, [field]: '1' }, new AbortController().signal), { code: 'INVALID_SALES_QUERY' });
    assert.throws(() => service.readList(actor, { ...p, filter: { ...p.filter, [field]: '1' } }, new AbortController().signal), { code: 'INVALID_SALES_QUERY' });
  }
  assert.equal(policies, 0); assert.equal(lists, 0);
  await service.readList(actor, parameters(), new AbortController().signal); await service.readList(actor, parameters(), new AbortController().signal);
  assert.equal(policies, 2); assert.equal(lists, 2); assert.ok(calls.every(read => Object.isFrozen(read.scope) && Object.isFrozen(read.parameters.filter)));
});

test('client exact strict shape keeps aggregate overflow but rejects omitted fields, malformed timestamp, duplicates and query mismatch', () => {
  const p = parameters(); const row = { ...summary(), businessType: 'EXCHANGE', quantity: '0', incomingQuantity: '18446744073709551616', outgoingQuantity: '18446744073709551616' };
  const dto = item => ({ page: 1, pageSize: 20, exactTotal: '1', items: [item] });
  assert.equal(salesListResponse(dto(row), p).items[0].incomingQuantity, '18446744073709551616');
  for (const field of ['quantity', 'incomingQuantity', 'outgoingQuantity', 'updatedAt']) {
    const missing = { ...row }; delete missing[field]; assert.throws(() => salesListResponse(dto(missing), p));
  }
  for (const patch of [{ quantity: 0 }, { quantity: '-0' }, { incomingQuantity: '-1' }, { outgoingQuantity: '0.0' },
    { updatedAt: null }, { updatedAt: '2026-02-30T00:00:00Z' }, { updatedAt: '' }, { categorySummary: [] }, { unit: '件' }]) {
    assert.throws(() => salesListResponse(dto({ ...row, ...patch }), p));
  }
  assert.throws(() => salesListResponse({ page: 1, pageSize: 20, exactTotal: '2', items: [row, row] }, p));
  assert.throws(() => salesListResponse(dto(row), { ...p, page: 2 }));
  assert.throws(() => salesListResponse(dto(row), { ...p, filter: { ...p.filter, businessType: 'SALE' } }));
});
