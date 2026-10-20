import assert from 'node:assert/strict';
import test from 'node:test';
import { LatestQuery } from '../loading/latest-query.ts';
import { ReadContext } from '../loading/read-scope.ts';
import { createSalesPageController } from './controller.ts';
import { emptySalesFilter } from './contracts.ts';
import type { SalesReader, SalesDetailDto, SalesReferenceParameters, SalesReferencePage } from './contracts.ts';
import { createSalesDetailQuery, pageFacts, salesCount, salesMoney, salesParameters, salesTarget } from './model.ts';
import { salesDetailResponse, salesListResponse, salesReferencesResponse } from './response-validation.ts';
import { createSalesHttpReader, createSalesFilterReferenceHttpReader } from './http-reader.ts';
import { detail, summary, uuid } from './tests/fixtures.ts';
const parameters = () => salesParameters(emptySalesFilter(), 20);
const scope = () => new ReadContext({ accountId: 'TEST', sessionRevision: '1', permissionRevision: '1' }).createScope('TEST-SALES');
const response = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });

test('sales money and counts remain exact beyond Number and preserve negative sign', () => {
  assert.equal(salesMoney('-900719925474099301'), '-9007199254740993.01'); assert.equal(salesMoney('1'), '0.01'); assert.equal(salesMoney('0'), '0.00');
  assert.equal(salesCount('900719925474099301'), '900,719,925,474,099,301');
  for (const value of ['1.1', '-0', '01', '1e3', 'NaN']) assert.throws(() => salesMoney(value));
  assert.equal(pageFacts(1, 20, '900719925474099301').pages, 45035996273704966n);
});
test('sales filters project the committed shape, reject dates/UUID/status and trim literal number', () => {
  const draft = { ...emptySalesFilter(), number: ' TEST_% ' }; const query = salesParameters(draft, 50); assert.equal(query.filter.number, 'TEST_%'); assert.equal(query.pageSize, 50);
  assert.equal(Object.keys(query.filter).length, 9);
  assert.throws(() => salesParameters({ ...draft, startDate: '2026-10-21', endDate: '2026-10-20' }, 20));
  assert.throws(() => salesParameters({ ...draft, hall: { id: 'not-uuid', label: 'TEST' } }, 20));
});
test('list validates exact totals, bounded page/row membership, no coercion or hidden extensions', () => {
  const p = parameters(); const result = { page: 1, pageSize: 20, exactTotal: '1', items: [summary()] };
  assert.equal(salesListResponse(result, p), result);
  for (const invalid of [{ ...result, exactTotal: 1 }, { ...result, exactTotal: '2' }, { ...result, page: 2 }, { ...result, actor: 'CLIENT' }, { ...result, items: [{ ...summary(), netDue: 0 }] }, { ...result, items: [{ ...summary(), version: 9007199254740992 }] }]) assert.throws(() => salesListResponse(invalid, p));
  assert.throws(() => salesListResponse(result, { ...p, filter: { ...p.filter, status: 'APPROVED' } }));
  assert.throws(() => salesListResponse(result, { ...p, filter: { ...p.filter, number: 'NO-MATCH' } }));
});
test('detail preserves independent RETURN snapshots, IDs, full size/FIT and nullable metadata', () => {
  const data = detail(); assert.equal(salesDetailResponse(data, salesTarget(uuid(1))), data);
  assert.equal(data.document.lines[0]?.quantity, '-1'); assert.equal(data.document.lines[0]?.snapshot.sizeName, '165/S');
  assert.throws(() => salesDetailResponse(data, salesTarget(uuid(2))));
  assert.throws(() => salesDetailResponse({ ...data, document: { ...data.document, originalSaleId: uuid(3) } }, salesTarget(uuid(1))));
});
test('detail rejects wrong target lines, inactive rows, floating amounts, overflows and duplicate line identity', () => {
  const data = detail(); const original = data.document.lines[0]!;
  for (const line of [{ ...original, salesId: uuid(2) }, { ...original, isCurrent: false }, { ...original, dealPrice: 1.2 }, { ...original, quantity: '9223372036854775808' }, { ...original, snapshot: { ...original.snapshot, unit: 'X' } }]) {
    assert.throws(() => salesDetailResponse({ ...data, document: { ...data.document, lines: [line] } }, salesTarget(uuid(1))));
  }
  assert.throws(() => salesDetailResponse({ ...data, document: { ...data.document, lines: [original, original] } }, salesTarget(uuid(1))));
});
test('reference port rejects partial pages and noncanonical identities', () => {
  const p = { kind: 'hall' as const, search: '', page: 1, pageSize: 20 as const }; const data = { page: 1, exactTotal: '1', items: [{ id: uuid(11), label: 'TEST 厅' }] };
  assert.equal(salesReferencesResponse(data, p), data);
  assert.throws(() => salesReferencesResponse({ ...data, exactTotal: '2' }, p)); assert.throws(() => salesReferencesResponse({ ...data, items: [{ id: 'FAKE', label: 'TEST' }] }, p));
});
test('HTTP construction is inert and one explicit list/detail call uses exact existing same-origin endpoints', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const reader = createSalesHttpReader({ origin: 'https://synthetic.test', basePath: '/api', fetch: async (url, init) => { calls.push({ url, init }); return response(url.endsWith('/detail/query') ? detail() : { page: 1, pageSize: 20, exactTotal: '1', items: [summary()] }); } });
  assert.equal(calls.length, 0); const controller = createSalesPageController(scope(), reader); assert.equal(calls.length, 0);
  await controller.list.run(parameters()); assert.equal(calls.length, 1); assert.equal(calls[0]?.url, 'https://synthetic.test/api/sales/query');
  const body = JSON.parse(calls[0]!.init.body as string) as Record<string, unknown>; assert.deepEqual(Object.keys(body).sort(), ['filter', 'page', 'pageSize']);
  assert.equal(calls[0]?.init.credentials, 'same-origin'); assert.equal(calls[0]?.init.redirect, 'error'); assert.equal(calls[0]?.init.cache, 'no-store');
  const query = createSalesDetailQuery(controller.scope, reader); await query.run(salesTarget(uuid(1))); assert.equal(calls[1]?.url, 'https://synthetic.test/api/sales/detail/query');
  assert.equal(JSON.parse(calls[1]!.init.body as string).salesId, uuid(1)); query.dispose(); controller.dispose();
});
test('malformed HTTP success cannot become an empty or successful sales result', async () => {
  const reader = createSalesHttpReader({ origin: 'https://synthetic.test', basePath: '', fetch: async () => response({ page: 1, pageSize: 20, exactTotal: '0', items: [summary()] }) });
  const query = createSalesPageController(scope(), reader); const outcome = await query.list.run(parameters()); assert.equal(outcome.status, 'error'); assert.equal(query.list.getSnapshot().success, null); query.dispose();
});
test('safe HTTP status kinds remain errors, never successful zero pages', async () => {
  for (const status of [401, 403, 404, 413, 500, 503]) {
    const reader = createSalesHttpReader({ origin: 'https://synthetic.test', basePath: '', fetch: async () => new Response(JSON.stringify({ error: { code: 'DOCUMENT_NOT_FOUND', message: 'SECRET ERROR' } }), { status, headers: { 'content-type': 'application/json' } }) });
    const query = createSalesPageController(scope(), reader); const result = await query.list.run(parameters()); assert.equal(result.status, 'error'); assert.equal(query.list.getSnapshot().success, null);
    assert.doesNotMatch(String(query.list.getSnapshot().error), /SECRET/); query.dispose();
  }
});
test('superseded/cancelled details and identity replacement discard transports that ignore signals', async () => {
  const context = new ReadContext({ accountId: 'TEST', sessionRevision: '1', permissionRevision: '1' }); const s = context.createScope('TEST-RACES');
  const pending: { resolve: (value: SalesDetailDto) => void; signal: AbortSignal }[] = [];
  const reader: SalesReader = { readList: async () => ({ page: 1, pageSize: 20, exactTotal: '0', items: [] }), readDetail: read => new Promise(resolve => pending.push({ resolve, signal: read.signal })) };
  const query = createSalesDetailQuery(s, reader); const old = query.run(salesTarget(uuid(1))); const current = query.run(salesTarget(uuid(2)));
  assert.equal(pending[0]?.signal.aborted, true); pending[0]!.resolve(detail(1)); pending[1]!.resolve(detail(2)); assert.equal((await old).status, 'discarded'); assert.equal((await current).status, 'success');
  const next = query.run(salesTarget(uuid(2))); context.replaceIdentity({ accountId: 'TEST', sessionRevision: '2', permissionRevision: '1' });
  assert.equal(pending[2]?.signal.aborted, true); assert.equal(query.getSnapshot().success, null); pending[2]!.resolve(detail(2)); assert.equal((await next).status, 'discarded');
});

test('named detail is required and nullable current salesperson matches its reference identity', () => {
  const data = detail(); const { referenceNames: _references, settlementNames: _settlements, ...oldShape } = data;
  assert.throws(() => salesDetailResponse(oldShape, salesTarget(uuid(1))));
  assert.throws(() => salesDetailResponse({ ...data, referenceNames: { ...data.referenceNames, hallName: 17 } }, salesTarget(uuid(1))));
  assert.throws(() => salesDetailResponse({ ...data, referenceNames: { ...data.referenceNames, salespersonName: 'NOT NULL' } }, salesTarget(uuid(1))));
  assert.throws(() => salesDetailResponse({ ...data, document: { ...data.document, header: { ...data.document.header, salespersonId: uuid(19) } } }, salesTarget(uuid(1))));
  assert.equal(data.referenceNames.hallName, 'TEST 当前营业厅');
});
test('settlement name records map one-to-one to exact settlement/account identities with historical and current facts distinct', () => {
  const data = detail(); const names = data.settlementNames[0]!;
  for (const invalid of [[], [names, names], [{ ...names, settlementId: uuid(999) }], [{ ...names, paymentAccountId: uuid(999) }], [{ ...names, accountNameSnapshot: null }], [{ ...names, currentMethodName: 17 }], [{ ...names, extra: true }]]) {
    assert.throws(() => salesDetailResponse({ ...data, settlementNames: invalid }, salesTarget(uuid(1))));
  }
  const empty = { ...data, document: { ...data.document, settlements: [] }, settlementNames: [] };
  assert.equal(salesDetailResponse(empty, salesTarget(uuid(1))), empty);
  assert.notEqual(names.accountNameSnapshot, names.currentAccountName); assert.notEqual(names.methodNameSnapshot, names.currentMethodName);
});
test('concrete filter reference HTTP reader is inert and projects only the actual bounded endpoint contract', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const reader = createSalesFilterReferenceHttpReader({ origin: 'https://synthetic.test', basePath: '/api', fetch: async (url, init) => { calls.push({ url, init }); return response({ page: 1, exactTotal: '1', items: [{ id: uuid(11), label: 'TEST 历史停用厅' }] }); } });
  assert.equal(calls.length, 0);
  const query = new LatestQuery<SalesReferenceParameters, SalesReferencePage>({ scope: scope(), execute: read => reader.readReferences(read) });
  const outcome = await query.run({ kind: 'hall', search: '', page: 1, pageSize: 20 });
  assert.equal(outcome.status, 'success'); assert.equal(calls.length, 1); assert.equal(calls[0]?.url, 'https://synthetic.test/api/sales/references/query');
  assert.deepEqual(JSON.parse(calls[0]!.init.body as string), { kind: 'hall', search: '', page: 1, pageSize: 20 });
  assert.equal(calls[0]?.init.credentials, 'same-origin'); assert.equal(calls[0]?.init.cache, 'no-store'); query.dispose();
});
test('filter reference HTTP rejects invalid parameters before fetch and old/malformed candidate responses without fallback', async () => {
  let calls = 0;
  const reader = createSalesFilterReferenceHttpReader({ origin: 'https://synthetic.test', basePath: '', fetch: async () => { calls++; return response({ page: 1, exactTotal: '1', items: [] }); } });
  const query = new LatestQuery<SalesReferenceParameters, SalesReferencePage>({ scope: scope(), execute: read => reader.readReferences(read) });
  for (const search of [' leading', 'trailing ', 'x\n', 'x'.repeat(201)]) {
    assert.equal((await query.run({ kind: 'customer', search, page: 1, pageSize: 20 })).status, 'error');
  }
  assert.equal(calls, 0); assert.equal((await query.run({ kind: 'warehouse', search: '', page: 1, pageSize: 20 })).status, 'error');
  assert.equal(calls, 1); assert.equal(query.getSnapshot().success, null); query.dispose();
});
