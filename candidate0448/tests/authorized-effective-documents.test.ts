/** Actual readers and revision planner with scripted storage results. These
 * tests do not parse/execute SQL or establish PostgreSQL permissions or SLO. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizedEffectiveDocumentIdentity, assertEffectiveDocumentPage, nullableEffectiveDocumentQuantity, nullableEffectiveDocumentMoney } from '../packages/application/src/authorized-effective-documents.ts';
import { PostgresSalesQueryReader, normalDocumentReferenceScopeOn } from '../adapters/postgres/src/sales-query-reader.ts';
import { PostgresTransferQueryReader } from '../adapters/postgres/src/transfer-query-reader.ts';
import { PostgresImportedHistoryQueryReader, importedHistoryTransferHallScopeSql, importedHistoryTransferSingleHallScopeSql } from '../adapters/postgres/src/imported-history-query-reader.ts';
import { planHistoryRevision } from '../packages/application/src/history-revision-service.ts';
import type { HistoryRevisionCurrent, HistoryRevisionCommand } from '../packages/application/src/history-revision-contracts.ts';
import { actor } from './support/synthetic-fixtures.ts';
import { historyActor, historyGrant, historyHeaderRow, historyListQuery } from './support/imported-history-query-fixtures.ts';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const filter = { startDate: null, endDate: null, statuses: [], number: null };
const salesParameters = { page: 1, pageSize: 20 as const, filter: { ...filter, businessTypes: [], hallIds: [], salespersonIds: [], customerIds: [], warehouseIds: [] } };
const transferParameters = { page: 1, pageSize: 20 as const, filter: { ...filter, fromWarehouseIds: [], toWarehouseIds: [] } };
const stamp = '2026-10-04T00:00:00.000000Z';
function normalRow(kind: 'sales' | 'transfers', dataset: 'LIVE' | 'HISTORY') {
  const history = dataset === 'HISTORY';
  return { dataset, batch_id: history ? id(10) : null, id: id(history ? 12 : 11), version: history ? 3 : 1, number: dataset,
    status: 'APPROVED', business_date: history ? null : '2026-10-04', business_type: 'SALE',
    hall_id: actor.hallId, warehouse_id: id(21), customer_id: id(22), salesperson_id: null, responsible_staff_id: null, responsible_name: null,
    quantity: history ? null : '2', incoming_quantity: history ? null : '0', outgoing_quantity: history ? null : '2',
    gross_amount: history ? null : '2.00', order_discount: history ? null : '0.00', net_due: history ? null : '2.00',
    created_by_name: history ? null : 'synthetic', hall_name: 'disabled historic hall', warehouse_name: 'disabled historic warehouse', customer_name: 'customer', salesperson_name: null,
    created_by_account_id: history ? null : id(30), created_at: history ? null : stamp, updated_at: history ? null : stamp,
    created_local_at: history ? '2026-10-04T12:00:00.123456' : null, updated_local_at: null,
    from_warehouse_id: id(21), to_warehouse_id: id(23), from_warehouse_name: 'from', to_warehouse_name: 'to', from_hall_name: 'fromhall', to_hall_name: 'tohall', approved_by_name: null,
    product_count: '0', product_items: [], product_has_more: false,
    category_count: history ? '0' : '1', category_items: history ? [] : [{categoryId:null,categoryName:null,value:kind==='sales'?'2':'1'}], category_has_more:false, syntheticKind: kind };
}
function readerFixture(kind: 'sales' | 'transfers', items: Record<string, unknown>[], valid = true) {
  const calls: { sql: string; values: unknown[] }[] = []; let connects = 0;
  const unknown = items.some(row => row.dataset === 'HISTORY');
  const client = { async query(sql: string, values: unknown[] = []) {
    calls.push({ sql, values }); let rows: Record<string, unknown>[] = [];
    if (sql.includes('read-authorization:identity')) rows = [{ account_id: actor.accountId, staff_id: id(31), login_enabled: true, employment_status: '在职', role: 'SALESPERSON', hall_id: actor.hallId, native_hall_id: actor.hallId, hall_enabled: true }];
    if (sql.includes('normal-document-list:shared')) rows = [{ exact_total: String(items.length), history_valid: valid, history_published: unknown,
      quantity: unknown ? null : '2', incoming_quantity: unknown ? null : '0', outgoing_quantity: unknown ? null : '2', gross_amount: unknown ? null : '2.00', order_discount: unknown ? null : '0.00', net_due: unknown ? null : '2.00', items }];
    return { rows, rowCount: rows.length };
  }, release() {} };
  const pool = { async connect() { connects++; return client; } };
  const options = { profile: 'source-confirmed-normal-document-lists-v1' as const, runtime26: { profile: 'EXACT26' as const, contract: 'NATIVE_RUNTIME26_V1' as const, async assertReady(actual: unknown, purpose: unknown) { assert.equal(actual, client); assert.equal(purpose, 'HISTORY_READ'); } } };
  return { calls, connects: () => connects, client, options, read: () => kind === 'sales'
    ? new PostgresSalesQueryReader(pool, options).readList({ actor, signal: new AbortController().signal, scope: { kind: 'all' }, parameters: salesParameters })
    : new PostgresTransferQueryReader(pool, options).readList({ actor: { ...actor, role: 'SALESPERSON' }, signal: new AbortController().signal, scope: { kind: 'all' }, parameters: transferParameters }) };
}

test('H02 actual sales/transfer readers retain LIVE-only, HISTORY-only and mixed identities, exact totals and unknown times/values on one shared query', async () => {
  for (const kind of ['sales', 'transfers'] as const) for (const datasets of [['LIVE'], ['HISTORY'], ['LIVE', 'HISTORY']] as const) {
    const f = readerFixture(kind, datasets.map(dataset => normalRow(kind, dataset))), result = await f.read();
    assert.ok('totals' in result); assert.equal(result.exactTotal, BigInt(datasets.length)); assert.deepEqual(result.items.map(row => row.dataset), datasets); assert.equal(f.connects(), 1);
    const queries = f.calls.filter(call => call.sql.includes('normal-document-list:shared')); assert.equal(queries.length, 1);
    assert.match(queries[0]!.sql, /matched AS MATERIALIZED/); assert.match(queries[0]!.sql, /total_metrics/); assert.match(queries[0]!.sql, /page_headers AS MATERIALIZED/);
    assert.match(queries[0]!.sql, /count\(\*\) FILTER\(WHERE is_gift IS NULL\)>0 THEN NULL/);
    assert.match(queries[0]!.sql, /history_validity AS/); assert.match(queries[0]!.sql, /IMPORT_PUBLISH/); assert.match(queries[0]!.sql, /r.status='COMMITTED'/);
    const historical = result.items.find(row => row.dataset === 'HISTORY');
    if (historical) { assert.equal(historical.effectiveVersion, 3); assert.equal(historical.businessDate, null); assert.equal(historical.updatedAt, null); assert.equal(historical.updatedLocalAt, null); assert.equal(historical.createdLocalAt, '2026-10-04T12:00:00.123456');
      assert.equal(kind === 'sales' ? (historical as { quantity: unknown }).quantity : (historical as { totalQuantity: unknown }).totalQuantity, null); }
    for(const row of result.items){
      assert.ok(row.categorySummary,'Actual normal-list reader must provide its bounded category summary');
      assert.equal(row.categorySummary.metric,kind==='sales'?'QUANTITY':'PRODUCT_COUNT');
      assert.deepEqual(row.categorySummary,row.dataset==='HISTORY'?{basis:'UNKNOWN',metric:kind==='sales'?'QUANTITY':'PRODUCT_COUNT',items:[],hasMore:false,categoryCount:null}
        :{basis:'CURRENT',metric:kind==='sales'?'QUANTITY':'PRODUCT_COUNT',items:[{categoryId:null,categoryName:null,value:kind==='sales'?2n:1n}],hasMore:false,categoryCount:1n});
    }
    assert.equal(kind === 'sales' ? (result.totals as { quantity: unknown }).quantity : (result.totals as { totalQuantity: unknown }).totalQuantity, datasets.includes('HISTORY' as never) ? null : 2n);
  }
});

test('H02 real normal reader validates authorized history before exposing page/totals and rejects bad dataset/batch/version/duplicate identities', async () => {
  await assert.rejects(readerFixture('sales', [], false).read(), { code: 'INVALID_DATABASE_VALUE' });
  for (const patch of [{ dataset: 'UNKNOWN' }, { dataset: 'LIVE', batch_id: id(10) }, { dataset: 'HISTORY', batch_id: null }, { version: '3' }, { version: 0 }])
    await assert.rejects(readerFixture('sales', [{ ...normalRow('sales', 'HISTORY'), ...patch }]).read());
  const row = normalRow('transfers', 'HISTORY'); await assert.rejects(readerFixture('transfers', [row, { ...row }]).read(), { code: 'INVALID_DATABASE_VALUE' });
});

test('normal sales and transfer pages order globally by genuine creation instant before paging without adding wire metadata', async () => {
  for (const kind of ['sales', 'transfers'] as const) {
    const f = readerFixture(kind, []);
    await f.read();
    const sql = f.calls.find(call => call.sql.includes('normal-document-list:shared'))!.sql;
    assert.match(sql, /h\.created_at AS sort_created_at/);
    // Keep the raw instant type; headerColumns also contains formatted display text.
    assert.match(sql, /h\.created_instant AS sort_created_at/);
    assert.match(sql, /hb\.sort_created_at/);
    assert.match(sql, /SELECT \* FROM matched ORDER BY sort_created_at DESC NULLS LAST,id ASC,dataset ASC,batch_id ASC NULLS FIRST LIMIT/);
    assert.match(sql, /ORDER BY h\.sort_created_at DESC NULLS LAST,h\.id ASC,h\.dataset ASC,h\.batch_id ASC NULLS FIRST/);
    assert.match(sql, /jsonb_agg\(to_jsonb\(p\)-'sort_created_at' ORDER BY p\.sort_created_at DESC NULLS LAST,p\.id ASC,p\.dataset ASC,p\.batch_id ASC NULLS FIRST\)/);
    assert.doesNotMatch(sql, /ORDER BY (?:h\.|p\.)?updated_at DESC/);
    assert.doesNotMatch(sql, /coalesce\([^)]*(?:created_instant|sort_created_at)[^)]*(?:business_date|updated_at|created_local_at)/);
    assert.deepEqual(f.calls.find(call => call.sql.includes('normal-document-list:shared'))!.values.slice(-2), [20, '0']);
  }
});

test('H02 LIVE category projection omissions and inconsistent bounded counts reject rather than fabricate empty categories',async()=>{
 for(const kind of ['sales','transfers'] as const)for(const patch of [{category_items:undefined},{category_count:undefined},{category_has_more:undefined},{category_count:'0'},{category_has_more:true},{category_items:[{categoryId:null,categoryName:null,value:null}]}]){
  await assert.rejects(readerFixture(kind,[{...normalRow(kind,'LIVE'),...patch}]).read(),{code:'INVALID_DATABASE_VALUE'});
 }
});

test('H02 ordinary transfer and explicit historical transfer grants compile one source-bound effective endpoint/creator predicate with original bind shapes', async () => {
  const f = readerFixture('transfers', []);
  const scoped = await normalDocumentReferenceScopeOn(f.client, f.options, 'transfers', { actor, signal: new AbortController().signal }, { scope: 'TRUE', values: [] });
  assert.equal(scoped.historyScope, importedHistoryTransferSingleHallScopeSql(2));
  assert.equal(scoped.historyScope, importedHistoryTransferHallScopeSql(2, true).replaceAll('=ANY($2::uuid[])', '=$2::uuid'));
  assert.equal(scoped.values[1], actor.hallId); assert.match(scoped.historyScope, /wr_read.status='IMPORTED'/); assert.match(scoped.historyScope, /er.after_facts->>'fromWarehouseId'/);
  assert.match(scoped.historyScope, /h.created_role_source='SALESPERSON'/); assert.match(scoped.historyScope, /h.created_by_source_key IS NOT NULL/);
  assert.doesNotMatch(scoped.historyScope, /responsible_staff.hall_id|hall_relations/);
  const proposed = importedHistoryTransferHallScopeSql(3, true, [4, 5]); assert.match(proposed, /scope_fw.id=\$4::uuid/); assert.match(proposed, /scope_tw.id=\$5::uuid/);
  for (const bad of [0, -1, 1.5, NaN]) assert.throws(() => importedHistoryTransferSingleHallScopeSql(bad));
});

test('H02 standalone historical reader consumes the shared identity/page contract without altering publication proof, effective date filters or nullable source metadata', async () => {
  for (const kind of ['sales', 'transfers'] as const) {
    const calls: string[] = [], row = { ...historyHeaderRow(kind), effective_valid: true, responsible_staff_id: null, responsible_name: null };
    const client = { async query(sql: string) { calls.push(sql); const rows = sql.includes('imported-history:schema') ? [{ versions: Array.from({ length: 26 }, (_, i) => i + 1) }]
      : sql.includes('imported-history:list-shared') ? [{ total: '1', items: [row] }] : []; return { rows, rowCount: rows.length }; }, release() {} };
    const reader = new PostgresImportedHistoryQueryReader({ async connect() { return client; } }, { runtime26: { profile: 'EXACT26', contract: 'NATIVE_RUNTIME26_V1', async assertReady(actual, purpose) { assert.equal(actual, client); assert.equal(purpose, 'HISTORY_READ'); } } });
    const intent = { kind, operation: 'list' as const, parameters: historyListQuery() }, result = await reader.readList({ actor: historyActor, intent, grant: historyGrant(intent), signal: new AbortController().signal });
    assert.equal(result.documents.total, '1'); assert.equal(result.documents.items[0]!.businessDate, null); assert.equal(result.documents.items[0]!.updatedInstant, null);
    assert.equal(calls.filter(sql => sql.includes('imported-history:list-shared')).length, 1); assert.match(calls.find(sql => sql.includes('imported-history:list-shared'))!, /b.status='IMPORTED'/);
  }
});

test('H02 exact paging and nullable values distinguish zero, unknown and malformed data without numeric coercion or cross-dataset identity collapse', () => {
  const history = authorizedEffectiveDocumentIdentity('HISTORY', id(2), id(1), 2), live = authorizedEffectiveDocumentIdentity('LIVE', null, id(1), 1);
  assertEffectiveDocumentPage([history, live], 1, 20, 2n); assertEffectiveDocumentPage([], 2, 20, 2n);
  assert.throws(() => assertEffectiveDocumentPage([history, history], 1, 20, 2n)); assert.throws(() => assertEffectiveDocumentPage([], 1, 20, 1n));
  assert.equal(nullableEffectiveDocumentQuantity('9007199254740993'), 9007199254740993n); assert.equal(nullableEffectiveDocumentQuantity('-2'), -2n); assert.equal(nullableEffectiveDocumentQuantity('0'), 0n); assert.equal(nullableEffectiveDocumentQuantity(null), null);
  assert.equal(nullableEffectiveDocumentMoney('90071992547409.93'), 9007199254740993n); assert.equal(nullableEffectiveDocumentMoney('0.00'), 0n); assert.equal(nullableEffectiveDocumentMoney(null), null);
  for (const bad of [undefined, 0, NaN, '', '1.5', '-0']) assert.throws(() => nullableEffectiveDocumentQuantity(bad));
});

test('H02 actual historical A→B→C planner equals A→C, conserves both transfer endpoints and never reposts baseline quantity', () => {
  for (const kind of ['sales', 'transfers'] as const) {
    const a: HistoryRevisionCurrent = { kind, documentId: id(1), version: 1, previousRevisionId: null, importBatchId: id(2), publishedOperationId: id(3), documentManifestHash: 'a'.repeat(64), responsibleStaffId: null,
      sourceStatus: 'APPROVED', baselineEffect: 'INCLUDED_APPROVED', businessDate: '2026-10-04', warehouseId: kind === 'sales' ? id(4) : null, fromWarehouseId: kind === 'transfers' ? id(4) : null, toWarehouseId: kind === 'transfers' ? id(5) : null,
      lines: [{ lineId: id(6), skuId: id(7), quantity: '2', ...(kind === 'sales' ? { dealPrice: '10.00', lineAmount: '20.00', allocatedDiscount: null } : {}) }], totals: kind === 'sales' ? { grossAmount: '20.00', orderDiscount: '0.00', netDue: '20.00' } : null,
      settlements: kind === 'sales' ? [{ settlementId: id(8), direction: 'RECEIVE', amount: '20.00' }] : [] };
    const command = (version: number, quantity: string): HistoryRevisionCommand => ({ kind, documentId: a.documentId, expectedVersion: version, requestKey: `synthetic-${version}`, reason: 'synthetic', lines: [{ lineId: id(6), quantity }], totals: null, settlements: [] });
    const b = planHistoryRevision(a, command(1, '5'), id(90)), c = planHistoryRevision(b.after, command(2, '1'), id(91)), direct = planHistoryRevision(a, command(1, '1'), id(92));
    for (const endpoint of direct.effects) assert.equal([...b.effects, ...c.effects].filter(e => e.endpoint === endpoint.endpoint).reduce((n, e) => n + BigInt(e.quantityDelta), 0n), BigInt(endpoint.quantityDelta));
    if (kind === 'transfers') for (const step of [b, c, direct]) assert.equal(step.effects.reduce((n, e) => n + BigInt(e.quantityDelta), 0n), 0n);
    assert.equal(a.lines[0]!.quantity, '2'); assert.equal(c.after.version, 3); assert.equal(c.after.lines[0]!.quantity, '1');
    assert.throws(() => planHistoryRevision({ ...a, businessDate: null }, command(1, '3'), id(93)), { code: 'HISTORY_REVISION_BUSINESS_DATE_UNKNOWN' });
  }
});
