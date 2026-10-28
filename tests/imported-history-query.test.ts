import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { DomainError } from '../packages/domain/src/errors.ts';
import { createImportedHistoryQueryService } from '../packages/application/src/imported-history-query-service.ts';
import { checkedImportedHistoryGrant, parseImportedHistoryListQuery, validateImportedHistoryHeader, validateImportedHistoryLine, validateImportedHistoryList, validateImportedHistoryDetail } from '../packages/application/src/imported-history-query-validation.ts';
import type { ImportedHistoryKind, ImportedHistoryReadIntent, ImportedHistoryScopedRead } from '../packages/application/src/imported-history-query-ports.ts';
import { PostgresImportedHistoryQueryReader, importedHistoryReadSql, importedHistoryReadScopeSql, importedHistoryTransferHallScopeSql } from '../adapters/postgres/src/imported-history-query-reader.ts';
import { NATIVE_IMPORT_ACCOUNTING_SCHEMA19_GUARD_CAPABILITY } from '../adapters/postgres/src/native-import-accounting-capability.ts';
import type { PgSalesClient, PgSalesPool } from '../adapters/postgres/src/sales-unit-of-work.ts';
import type { NativeRuntime26Capability } from '../packages/application/src/native-import-schema-contract.ts';
import { createImportedHistoryQueryHttpPlugin } from '../apps/api/src/imported-history-query-http.ts';
import { historyActor as actor, historyId as id, historyListQuery as listQuery, historyDetailQuery as detailQuery, historyGrant as grant, historyHeader as header, historyHeaderRow as headerRow } from './support/imported-history-query-fixtures.ts';
const signal = () => new AbortController().signal;
function intent(kind: ImportedHistoryKind = 'sales', detail = false): ImportedHistoryReadIntent { return detail ? { kind, operation: 'detail', parameters: detailQuery() } : { kind, operation: 'list', parameters: listQuery() }; }
function scoped(i = intent()): ImportedHistoryScopedRead { return { actor, intent: i, grant: grant(i), signal: signal() }; }
function emptyList(kind: ImportedHistoryKind) { return { dataset: 'HISTORY' as const, kind, documents: { page: 1, pageSize: 20 as const, total: '0', items: [] } }; }
function emptyDetail(kind: ImportedHistoryKind) { return { dataset: 'HISTORY' as const, kind, document: null, lines: { page: 1, pageSize: 20 as const, total: '0', items: [] }, settlements: { page: 1, pageSize: 20 as const, total: '0', items: [] } }; }

test('historical input rejects getters, hidden/symbol/extra fields, impossible dates and unbounded pages before any provider', async () => {
  let calls = 0, gets = 0;
  const service = createImportedHistoryQueryService({ authorization: { async authorize(_actor, i) { calls++; return grant(i); } }, reader: { async readList(r) { calls++; return emptyList(r.intent.kind); }, async readDetail(r) { calls++; return emptyDetail(r.intent.kind); } } });
  const accessor = Object.defineProperty(listQuery(), 'page', { enumerable: true, get() { gets++; return 1; } });
  for (const value of [accessor, { ...listQuery(), sourceHash: 'internal' }, Object.assign(listQuery(), { [Symbol('extra')]: 1 }), Object.defineProperty(listQuery(), 'hidden', { value: 1 }), { ...listQuery(), pageSize: 201 }, { ...listQuery(), page: 2147483646 }, { ...listQuery(), businessDateFrom: '2026-02-30' }, { ...listQuery(), businessDateFrom: '2026-10-05', businessDateTo: '2026-10-04' }, { ...listQuery(), fromWarehouseId: id(5) }]) {
    await assert.rejects(service.readList(actor, 'sales', value, signal()), { code: 'IMPORTED_HISTORY_INVALID_QUERY' });
  }
  assert.equal(calls, 0); assert.equal(gets, 0);
});
test('historical grants bind account/kind/operation/target; transfer scoped expansion and sparse grants reject', () => {
  const i = intent(), g = grant(i);
  for (const value of [{ ...g, actorAccountId: id(99) }, { ...g, kind: 'transfers' }, { ...g, operation: 'detail' }, { ...g, targetId: id(3) }, { ...g, dataset: 'LIVE' }, { ...g, scope: { kind: 'HALL_IDS', hallIds: [id(2), id(2)] } }, { ...g, scope: { kind: 'HALL_IDS', hallIds: new Array(1) } }]) assert.throws(() => checkedImportedHistoryGrant(value as never, i, actor), { code: 'IMPORTED_HISTORY_FORBIDDEN' });
  const transfer = intent('transfers');
  assert.throws(() => checkedImportedHistoryGrant({ ...grant(transfer), scope: { kind: 'HALL_IDS', hallIds: [id(2)] } }, transfer, actor), { code: 'IMPORTED_HISTORY_FORBIDDEN' });
  assert.throws(() => checkedImportedHistoryGrant(grant(intent('sales', true)), { kind: 'sales', operation: 'detail', parameters: { ...detailQuery(), documentId: id(66) } }, actor), { code: 'IMPORTED_HISTORY_FORBIDDEN' });
});
test('source query/authorization mutation cannot change captured request; denial repeats on every read', async () => {
  let auth = 0, reads = 0;
  const query = listQuery(), service = createImportedHistoryQueryService({ authorization: { async authorize(_actor, i) {
    auth++; const g = grant(i); (i.parameters as { page: number }).page = 99; (query as { page: number }).page = 50;
    await Promise.resolve(); if (auth === 2) throw new DomainError('FORBIDDEN', 'denied'); return g;
  } }, reader: { async readList(r) { reads++; assert.equal(r.intent.parameters && (r.intent.parameters as { page: number }).page, 1); return emptyList('sales'); }, async readDetail() { throw Error('unused'); } } });
  await service.readList(actor, 'sales', query, signal());
  await assert.rejects(service.readList(actor, 'sales', listQuery(), signal()), { code: 'FORBIDDEN' }); assert.equal(auth, 2); assert.equal(reads, 1);
});
test('HISTORY DTO preserves nullable persons/local microseconds/exact money; rejects leakage, wrong hall, unsafe numeric coercion', () => {
  const i = intent(); if (i.operation !== 'list') throw Error(); const g = grant(i), h = header('sales');
  assert.deepEqual(validateImportedHistoryHeader(h, 'sales', g), h);
  for (const value of [{ ...h, sourceKey: 'private' }, { ...h, rawFields: {} }, { ...h, grossAmount: -0.12 }, { ...h, createdInstant: '2026-10-04T12:00:00.123Z' }, { ...h, createdLocalAt: '2026-02-30T12:00:00.123456' }]) assert.throws(() => validateImportedHistoryHeader(value, 'sales', g), { code: 'IMPORTED_HISTORY_INVALID_RESPONSE' });
  assert.throws(() => validateImportedHistoryHeader(h, 'sales', { ...g, scope: { kind: 'HALL_IDS', hallIds: [id(99)] } }), { code: 'IMPORTED_HISTORY_INVALID_RESPONSE' });
  const baseLine = { id: id(10), lineNo: 1, skuId: id(11), quantity: '-9223372036854775808', productCodeSnapshot: null, productNameSnapshot: null, colorNameSnapshot: null, fitNameSnapshot: null, sizeNameSnapshot: null, barcodeSnapshot: null };
  assert.equal(validateImportedHistoryLine(baseLine, 'transfers').quantity, '-9223372036854775808');
  assert.throws(() => validateImportedHistoryLine({ ...baseLine, quantity: -2 }, 'transfers'), { code: 'IMPORTED_HISTORY_INVALID_RESPONSE' });
  const big = { dataset: 'HISTORY', kind: 'sales', documents: { page: 1, pageSize: 20, total: '9007199254740993', items: [] } };
  assert.throws(() => validateImportedHistoryList(big, i, g), { code: 'IMPORTED_HISTORY_INVALID_RESPONSE' });
});

/** Protocol double proves emitted SQL/transaction use, NOT PostgreSQL execution. */
function protocol(options: { failure?: string; final?: boolean; kind?: ImportedHistoryKind; schema?: number[]; guards?: boolean; mismatch?: boolean; afterQuery?: (tag: string) => void;
  transform?: (tag: string, sql: string, rows: Record<string, unknown>[]) => Record<string, unknown>[] } = {}) {
  const calls: { tag: string; sql: string; values: unknown[] }[] = [], releases: unknown[] = [];
  let connects = 0; let lastLineRows: Record<string, unknown>[] = [];
  const client: PgSalesClient = { async query(sql, values = []) {
    const tag = sql.startsWith('/*') ? sql.match(/^\/\* ([^*]+) \*\//)![1]! : sql;
    calls.push({ tag, sql, values: structuredClone(values) }); if (tag === options.failure) throw Error('SYNTHETIC:' + tag);
    let rows: Record<string, unknown>[] = [];
    if (tag === 'imported-history:schema') rows = [{ versions: options.schema ?? Array.from({ length: 19 }, (_, i) => i + 1) }];
    if (tag === 'inventory:guards') rows = [{ integrity_guards_present: options.guards !== false }];
    if (sql === NATIVE_IMPORT_ACCOUNTING_SCHEMA19_GUARD_CAPABILITY) rows = [{ accounting_guards_present: options.guards !== false }];
        if (tag === 'imported-history:list-shared') rows = options.final ? [headerRow(options.kind ?? 'sales')] : [];
    if (tag === 'imported-history:detail') rows = options.final ? [{ ...headerRow(options.kind ?? 'sales'), line_count: options.mismatch ? 1 : 0, settlement_count: 0 }] : [];
    if (tag.endsWith('-count') && !tag.includes('list-count')) rows = [{ total: '0' }];
    if (sql.includes(' AS effective_valid')) rows = rows.map(row => ({ ...row, effective_valid: true }));
    if (sql.includes(' AS responsible_staff_id')) rows = rows.map(row => ({ responsible_staff_id: null, responsible_name: null, ...row }));
    if (tag === 'imported-history:line-catalog') rows = lastLineRows.map(row => ({ line_id: row.id, sku_id: row.sku_id, line_source_id: null }));
    rows = options.transform?.(tag, sql, rows) ?? rows;
    if (tag === 'imported-history:line-page') lastLineRows = rows;
    if(tag==='imported-history:list-shared')rows=[{total:options.final?'1':'0',items:rows}];
    options.afterQuery?.(tag); return { rows, rowCount: rows.length };
  }, release(error) { releases.push(error); } };
  const pool: PgSalesPool = { async connect() { connects++; return client; } };
  return { pool, client, calls, releases, connects: () => connects };
}

function effectiveProtocol(kind: ImportedHistoryKind, failStage?: string) {
  return protocol({ final: true, kind, schema: Array.from({ length: 26 }, (_, i) => i + 1), transform(tag, sql, rows) {
    if (tag === 'imported-history:list-shared' || tag === 'imported-history:detail') {
      assert.match(sql, /coalesce\(e.version,h.version\)/); assert.match(sql, /er.to_version=e.version/);
      assert.match(sql, /er\.document_kind=/); assert.match(sql, /er\.operation_id IS NOT NULL/);
      rows = rows.map(row => ({ ...row, source_status: 'DRAFT', version: 3, line_count: 1, settlement_count: kind === 'sales' ? 1 : 0,
        ...(kind === 'sales' ? { gross_amount: '-3.69', order_discount: '0.00', net_due: '-3.69' } : {}) }));
    }
    if (tag === 'imported-history:line-count') rows = [{ total: '1' }];
    if (tag === 'imported-history:settlement-count') rows = [{ total: kind === 'sales' ? '1' : '0' }];
    if (tag === 'imported-history:line-page') {
      assert.match(sql, /coalesce\(le.quantity,l.quantity\)/); assert.match(sql, /lr.to_version<=\$5::integer/);
      assert.match(sql, /lr\.(sales_id|transfer_id)=l.header_id/);
      if (kind === 'sales') assert.match(sql, /CASE WHEN le.line_id IS NULL THEN l.allocated_discount ELSE le.allocated_discount END/);
      rows = [{ id: id(20), line_no: 1, sku_id: id(21), quantity: '-3', product_code_snapshot: null, product_name_snapshot: null,
        color_name_snapshot: null, fit_name_snapshot: null, size_name_snapshot: null, barcode_snapshot: null, effective_valid: true,
        ...(kind === 'sales' ? { reference_price: null, deal_price: '1.23', line_amount: '-3.69', allocated_discount: null,
          is_gift: null, pricing_method_source: null, discount_tenths: null, ordinary_zero_confirmed: null } : {}) }];
    }
    if (tag === 'imported-history:settlement-page') {
      assert.match(sql, /coalesce\(se.amount,s.amount\)/); assert.match(sql, /sr.to_version<=\$5::integer/);
      rows = [{ id: id(22), line_no: 1, payment_account_id: id(23), direction: 'REFUND', amount: '3.69',
        account_name_snapshot: null, method_name_snapshot: null, payment_method_id_snapshot: null, effective_valid: true }];
    }
    return tag === failStage ? rows.map(row => ({ ...row, effective_valid: false })) : rows;
  } });
}
function effectiveRuntime(p: ReturnType<typeof protocol>): NativeRuntime26Capability {
  // Scripted protocol capability only; no real runtime/permission grant is claimed.
  return { profile: 'EXACT26', contract: 'NATIVE_RUNTIME26_V1', async assertReady(client, purpose) { assert.equal(client, p.client); assert.equal(purpose, 'HISTORY_READ'); } };
}
test('history effective projection26: sales list/detail expose the current version, exact amounts and nullable discount without replacing original metadata', async () => {
  const p = effectiveProtocol('sales'), reader = new PostgresImportedHistoryQueryReader(p.pool, { runtime26: effectiveRuntime(p) });
  const list = await reader.readList(scoped()), detail = await reader.readDetail(scoped(intent('sales', true)));
  assert.equal(list.documents.items[0]!.version, 3); assert.deepEqual(detail.document, list.documents.items[0]);
  assert.equal(detail.document!.sourceStatus, 'DRAFT'); assert.equal(detail.document!.businessDate, null); assert.equal(detail.document!.updatedInstant, null);
  assert.deepEqual(detail.document!.createdBy, header('sales').createdBy);
  if (detail.document!.kind === 'sales') { assert.equal(detail.document!.grossAmount, '-3.69'); assert.equal(detail.document!.netDue, '-3.69'); }
  assert.equal(detail.lines.total, '1'); assert.equal(detail.lines.items[0]!.quantity, '-3'); assert.equal(detail.lines.items[0]!.skuId, id(21));
  const line = detail.lines.items[0]!; assert.ok('dealPrice' in line); assert.equal(line.dealPrice, '1.23'); assert.equal(line.allocatedDiscount, null); assert.equal(line.referencePrice, null);
  assert.equal(detail.settlements.items[0]!.amount, '3.69'); assert.equal(detail.settlements.items[0]!.paymentMethodIdSnapshot, null);
  for (const call of p.calls.filter(call => call.tag === 'imported-history:line-page' || call.tag === 'imported-history:settlement-page')) assert.equal(call.values[4], 3);
  assert.equal(p.connects(), 2); assert.deepEqual(p.releases, [undefined, undefined]);
  assert.ok(!p.calls.some(call => /INSERT INTO|UPDATE naijue|DELETE FROM|FOR UPDATE/.test(call.sql)));
});
test('history effective projection26: transfer uses its actual current line quantity and retains source dates/warehouses with no sales projection query', async () => {
  const p = effectiveProtocol('transfers'), detail = await new PostgresImportedHistoryQueryReader(p.pool, { runtime26: effectiveRuntime(p) }).readDetail(scoped(intent('transfers', true)));
  assert.equal(detail.document!.version, 3); assert.equal(detail.document!.sourceStatus, 'DRAFT'); assert.equal(detail.lines.items[0]!.quantity, '-3');
  assert.equal(detail.document!.businessDate, null); assert.equal(detail.document!.kind, 'transfers');
  if (detail.document!.kind === 'transfers') { assert.equal(detail.document!.fromWarehouseId, id(5)); assert.equal(detail.document!.toWarehouseId, id(6)); }
  assert.equal(detail.settlements.total, '0'); assert.ok(!p.calls.some(call => call.tag.startsWith('imported-history:settlement') || call.sql.includes('history_sales_effective')));
  assert.equal(p.calls.at(-1)!.tag, 'COMMIT'); assert.deepEqual(p.releases, [undefined]);
});
test('history effective projection26: contradictory document/revision or ahead-of-head line and settlement bindings reject the whole read', async () => {
  for (const kind of ['sales', 'transfers'] as const) for (const stage of ['imported-history:list-shared', 'imported-history:detail', 'imported-history:line-page', ...(kind === 'sales' ? ['imported-history:settlement-page'] : [])]) {
    const p = effectiveProtocol(kind, stage), reader = new PostgresImportedHistoryQueryReader(p.pool, { runtime26: effectiveRuntime(p) });
    await assert.rejects(stage === 'imported-history:list-shared' ? reader.readList(scoped(intent(kind))) : reader.readDetail(scoped(intent(kind, true))), { code: 'INVALID_DATABASE_VALUE' });
    assert.equal(p.calls.at(-1)!.tag, 'ROLLBACK'); assert.deepEqual(p.releases, [undefined]);
  }
});
test('history effective projection26: untouched exact26 falls through to original facts and exact19 never references the new projection tables', async () => {
  const p = protocol({ final: true, schema: Array.from({ length: 26 }, (_, i) => i + 1) });
  const detail = await new PostgresImportedHistoryQueryReader(p.pool, { runtime26: effectiveRuntime(p) }).readDetail(scoped(intent('sales', true)));
  assert.deepEqual(detail.document, header('sales')); assert.equal(detail.lines.total, '0');
  const old = protocol({ final: true }); await new PostgresImportedHistoryQueryReader(old.pool).readList(scoped());
  assert.ok(!old.calls.filter(call => call.tag.startsWith('imported-history:')).some(call => /history_(sales|transfer).*_effective|history_revision/.test(call.sql)));
});
test('HISTORY26: each sales and transfer list/detail proves the original client before SQL and preserves publication filtering', async () => {
  for (const kind of ['sales', 'transfers'] as const) {
    const p = protocol({ schema: Array.from({ length: 26 }, (_, i) => i + 1), final: true, kind }); let calls = 0, previousQueries = 0;
    const runtime26: NativeRuntime26Capability = { profile: 'EXACT26', contract: 'NATIVE_RUNTIME26_V1', async assertReady(client, purpose) {
      assert.equal(client, p.client); assert.equal(purpose, 'HISTORY_READ'); assert.equal(p.calls.length, previousQueries); calls++;
    } };
    const reader = new PostgresImportedHistoryQueryReader(p.pool, { runtime26 });
    assert.deepEqual((await reader.readList(scoped(intent(kind)))).documents.items, [header(kind)]); previousQueries = p.calls.length;
    assert.deepEqual((await reader.readDetail(scoped(intent(kind, true)))).document, header(kind));
    assert.equal(calls, 2); assert.equal(p.connects(), 2); assert.deepEqual(p.releases, [undefined, undefined]);
    for (const q of p.calls.filter(q => ['imported-history:list-shared', 'imported-history:detail'].includes(q.tag))) {
      assert.match(q.sql, /b\.status='IMPORTED'/); assert.match(q.sql, /history_validation_passed IS TRUE/);
      assert.match(q.sql, /import_record_accounting_claim/); assert.match(q.sql, /operation_receipt/); assert.match(q.sql, /audit_change/);
    }
    assert.equal(p.calls.filter(q => q.sql === 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY').length, 2);
    assert.ok(!p.calls.some(q => q.sql === NATIVE_IMPORT_ACCOUNTING_SCHEMA19_GUARD_CAPABILITY || /FOR UPDATE|LOCK TABLE|INSERT INTO|UPDATE naijue|DELETE FROM/.test(q.sql)));
  }
});
test('HISTORY26: explicit options capture capability and refuse absent, accessor and boolean or denied authority before SQL', async () => {
  const p = protocol({ schema: Array.from({ length: 26 }, (_, i) => i + 1) }); let gets = 0;
  const runtime26 = { profile: 'EXACT26' as const, contract: 'NATIVE_RUNTIME26_V1' as const, async assertReady(_client: object, _purpose: Parameters<NativeRuntime26Capability['assertReady']>[1]) {} };
  const accessor = Object.defineProperty({}, 'runtime26', { enumerable: true, get() { gets++; return runtime26; } });
  for (const options of [null, {}, { runtime26: undefined }, { runtime26, extra: true }, accessor]) assert.throws(() => new PostgresImportedHistoryQueryReader(p.pool, options as never), TypeError);
  assert.equal(gets, 0); assert.equal(p.connects(), 0);
  for (const verify of [async () => true, async () => { throw Error('SYNTHETIC_WRONG_TARGET'); }]) {
    const q = protocol(); const cap = { ...runtime26, assertReady: verify } as unknown as NativeRuntime26Capability;
    await assert.rejects(new PostgresImportedHistoryQueryReader(q.pool, { runtime26: cap }).readList(scoped()));
    assert.equal(q.calls.length, 0); assert.equal(q.connects(), 1); assert.equal(q.releases[0] instanceof Error, true);
  }
  let proofs = 0; runtime26.assertReady = async client => { assert.equal(client, p.client); proofs++; };
  const options = { runtime26 }, reader = new PostgresImportedHistoryQueryReader(p.pool, options);
  options.runtime26 = { ...runtime26, async assertReady() { throw Error('LATE_OPTIONS_MUTATION'); } };
  runtime26.assertReady = async () => { throw Error('LATE_CAPABILITY_MUTATION'); };
  await reader.readList(scoped()); assert.equal(proofs, 1);
});
test('HISTORY26: exact prefix is required without upgrading the default19 reader or falling back to it', async () => {
  for (const schema of [Array.from({ length: 19 }, (_, i) => i + 1), Array.from({ length: 25 }, (_, i) => i + 1), Array.from({ length: 27 }, (_, i) => i + 1), [...Array.from({ length: 25 }, (_, i) => i + 1), 27]]) {
    const p = protocol({ schema }); let proofs = 0;
    const runtime26: NativeRuntime26Capability = { profile: 'EXACT26', contract: 'NATIVE_RUNTIME26_V1', async assertReady(client, purpose) { assert.equal(client, p.client); assert.equal(purpose, 'HISTORY_READ'); proofs++; } };
    await assert.rejects(new PostgresImportedHistoryQueryReader(p.pool, { runtime26 }).readList(scoped()), { code: 'HISTORY_CLOSURE_SCHEMA_NOT_READY' });
    assert.equal(proofs, 1); assert.ok(!p.calls.some(q => q.tag.startsWith('imported-history:list'))); assert.equal(p.calls.at(-1)!.tag, 'ROLLBACK');
    assert.ok(!p.calls.some(q => q.sql === NATIVE_IMPORT_ACCOUNTING_SCHEMA19_GUARD_CAPABILITY));
  }
  const legacy = protocol({ schema: Array.from({ length: 26 }, (_, i) => i + 1) });
  await assert.rejects(new PostgresImportedHistoryQueryReader(legacy.pool).readList(scoped()));
  assert.ok(!legacy.calls.some(q => q.tag.startsWith('imported-history:list')));
});
test('HISTORY26: denied or cancelled preflight and unknown COMMIT preserve the original read outcome boundaries', async () => {
  const p = protocol({ schema: Array.from({ length: 26 }, (_, i) => i + 1), failure: 'COMMIT' });
  const runtime26: NativeRuntime26Capability = { profile: 'EXACT26', contract: 'NATIVE_RUNTIME26_V1', async assertReady() {} };
  await assert.rejects(new PostgresImportedHistoryQueryReader(p.pool, { runtime26 }).readList(scoped()), /SYNTHETIC:COMMIT/);
  assert.equal(p.connects(), 1); assert.equal(p.calls.filter(q => q.tag === 'ROLLBACK').length, 0); assert.equal(p.releases[0] instanceof Error, true);
  const q = protocol(), controller = new AbortController();
  const cancel = { ...runtime26, async assertReady() { controller.abort(); } };
  await assert.rejects(new PostgresImportedHistoryQueryReader(q.pool, { runtime26: cancel }).readDetail({ ...scoped(intent('sales', true)), signal: controller.signal }), { code: 'IMPORTED_HISTORY_READ_ABORTED' });
  assert.equal(q.calls.length, 0); assert.equal(q.releases[0] instanceof Error, true);
});
test('protocol: one RR READ ONLY snapshot; COUNT/page use same FINAL closure/receipt/audit scope and parameterized hall filter', async () => {
  const p = protocol({ final: true }), read = scoped();
  const constrained = { ...read, intent: { kind: 'sales' as const, operation: 'list' as const, parameters: { ...listQuery(), number: "'; DROP TABLE x;--" } }, grant: { ...read.grant, scope: { kind: 'HALL_IDS' as const, hallIds: [id(2)] } } };
  // No match is expected for the injection-shaped literal, so use empty protocol results.
  const empty = protocol(); await new PostgresImportedHistoryQueryReader(empty.pool).readList(constrained);
  const queries = empty.calls.filter(c => ['imported-history:list-shared'].includes(c.tag)); assert.equal(queries.length, 1);
  for (const q of queries) {
    assert.match(q.sql, /b\.status='IMPORTED'/); assert.match(q.sql, /history_validation_passed IS TRUE/); assert.match(q.sql, /import_record_accounting_claim/); assert.match(q.sql, /operation_receipt/); assert.match(q.sql, /audit_change/); assert.match(q.sql, /h\.hall_id=ANY\(\$2::uuid\[\]\)/);
    assert.ok(q.values.includes("'; DROP TABLE x;--")); assert.ok(!q.sql.includes('DROP TABLE'));
  }
  assert.deepEqual(queries[0]!.values.slice(-2),[20,'0']);
  const result = await new PostgresImportedHistoryQueryReader(p.pool).readList(read);
  assert.equal(result.documents.total, '1'); assert.deepEqual(result.documents.items[0], header('sales'));
  assert.equal(p.calls[0]!.sql, 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); assert.equal(p.calls.at(-1)!.sql, 'COMMIT');
  assert.equal(p.connects(), 1); assert.deepEqual(p.releases, [undefined]);
  assert.ok(p.calls.every(c => !/FOR UPDATE|FOR SHARE|LOCK TABLE|INSERT INTO|UPDATE naijue|DELETE FROM|SELECT naijue_erp\.assert_history_typed_closure\(/.test(c.sql)));
});
test('protocol: missing/unpublished detail does not query children; manifest cardinality mismatch rejects', async () => {
  const missing = protocol(); assert.equal((await new PostgresImportedHistoryQueryReader(missing.pool).readDetail(scoped(intent('sales', true)))).document, null);
  assert.ok(!missing.calls.some(c => c.tag.includes('line-') || c.tag.includes('settlement-')));
  const bad = protocol({ final: true, mismatch: true });
  await assert.rejects(new PostgresImportedHistoryQueryReader(bad.pool).readDetail(scoped(intent('sales', true))), { code: 'INVALID_DATABASE_VALUE' });
  assert.equal(bad.calls.at(-1)!.tag, 'ROLLBACK'); assert.ok(!bad.calls.some(c => c.tag === 'imported-history:line-page'));
  const transfer = protocol({ final: true, kind: 'transfers' });
  const result = await new PostgresImportedHistoryQueryReader(transfer.pool).readDetail(scoped(intent('transfers', true)));
  assert.equal(result.settlements.total, '0'); assert.ok(!transfer.calls.some(c => c.tag.includes('settlement-')));
});
test('protocol: finite19 missing/old/future schema and disabled guard reject before any document SQL', async () => {
  for (const options of [{ schema: Array.from({ length: 20 }, (_, i) => i + 1) }, { schema: Array.from({ length: 18 }, (_, i) => i + 1) }, { schema: [1, 2, 19] }, { guards: false }]) {
    const p = protocol(options); await assert.rejects(new PostgresImportedHistoryQueryReader(p.pool).readList(scoped()));
    assert.ok(!p.calls.some(c => c.tag.startsWith('imported-history:list'))); assert.equal(p.calls.at(-1)!.tag, 'ROLLBACK');
  }
});
test('protocol: query failure rolls back; unknown COMMIT discards without rollback/retry; cancellation opens no connection', async () => {
  for (const failure of ['imported-history:list-shared', 'COMMIT']) {
    const p = protocol({ failure }); await assert.rejects(new PostgresImportedHistoryQueryReader(p.pool).readList(scoped()), new RegExp('SYNTHETIC:' + failure));
    assert.equal(p.connects(), 1); assert.equal(p.calls.filter(c => c.tag === 'ROLLBACK').length, failure === 'COMMIT' ? 0 : 1); assert.equal(p.releases[0] instanceof Error, failure === 'COMMIT');
  }
  const p = protocol(), cancel = new AbortController(); cancel.abort();
  await assert.rejects(new PostgresImportedHistoryQueryReader(p.pool).readList({ ...scoped(), signal: cancel.signal }), { code: 'IMPORTED_HISTORY_READ_ABORTED' }); assert.equal(p.connects(), 0);
});
test('D3 read outcome: HISTORY late abort after confirmed COMMIT keeps the healthy connection', async () => {
  for (const detail of [false, true]) {
    const controller = new AbortController();
    const p = protocol({ afterQuery(tag) { if (tag === 'COMMIT') controller.abort(); } });
    const reader = new PostgresImportedHistoryQueryReader(p.pool), read = { ...scoped(intent('sales', detail)), signal: controller.signal };
    await assert.rejects(detail ? reader.readDetail(read) : reader.readList(read), { code: 'IMPORTED_HISTORY_READ_ABORTED' });
    assert.equal(p.calls.at(-1)!.tag, 'COMMIT'); assert.deepEqual(p.releases, [undefined]); assert.equal(p.connects(), 1);
  }
});
test('four POST-only HTTP endpoints require explicit policy/session; fail closed and sanitize provider errors', async () => {
  let authenticated = true, allowed = true, fail = false, unavailable = false, calls = 0;
  const app = Fastify();
  app.register(createImportedHistoryQueryHttpPlugin({ async authenticate(input) {
    if (input.headers.origin === 'https://evil.invalid') throw Object.assign(Error('private policy details'), { code: 'ORIGIN_REJECTED' });
    return authenticated ? actor : null;
  }, dependencies: { authorization: { async authorize(_actor, i) { if (!allowed) throw new DomainError('FORBIDDEN', 'private source'); return grant(i); } }, reader: { async readList(r) { calls++; if (fail) throw Error('secret path/source hash/password'); if (unavailable) throw new DomainError('HISTORY_CLOSURE_SCHEMA_NOT_READY', 'private'); return emptyList(r.intent.kind); }, async readDetail(r) { calls++; return emptyDetail(r.intent.kind); } } } }));
  await app.ready();
  try {
    for (const kind of ['sales', 'transfers'] as const) for (const detail of [false, true]) {
      const url = `/imported-history/${kind}/${detail ? 'detail/' : ''}query`, res = await app.inject({ method: 'POST', url, payload: detail ? detailQuery() : listQuery() });
      assert.equal(res.statusCode, 200); assert.equal(res.json().dataset, 'HISTORY'); assert.equal(res.headers['cache-control'], 'no-store');
      assert.equal((await app.inject({ method: 'GET', url })).statusCode, 404);
    }
    authenticated = false; assert.equal((await app.inject({ method: 'POST', url: '/imported-history/sales/query', payload: listQuery() })).statusCode, 401); authenticated = true;
    allowed = false; assert.equal((await app.inject({ method: 'POST', url: '/imported-history/sales/query', payload: listQuery() })).statusCode, 403); allowed = true;
    assert.equal((await app.inject({ method: 'POST', url: '/imported-history/sales/query', headers: { origin: 'https://evil.invalid' }, payload: listQuery() })).statusCode, 403);
    const before = calls;
    assert.equal((await app.inject({ method: 'POST', url: '/imported-history/sales/query?dataset=LIVE', payload: listQuery() })).statusCode, 400);
    assert.equal((await app.inject({ method: 'POST', url: '/imported-history/sales/query', headers: { 'content-type': 'application/json' }, payload: '{' })).statusCode, 400); assert.equal(calls, before);
    unavailable = true; assert.equal((await app.inject({ method: 'POST', url: '/imported-history/sales/query', payload: listQuery() })).statusCode, 503); unavailable = false;
    fail = true; const failed = await app.inject({ method: 'POST', url: '/imported-history/sales/query', payload: listQuery() }); assert.equal(failed.statusCode, 500); assert.ok(!failed.body.includes('secret'));
    assert.equal((await app.inject({ method: 'POST', url: '/imported-history/sales/save', payload: {} })).statusCode, 404);
  } finally { await app.close(); }
});
test('empty hall scope grants no SQL-visible rows; invalid input never silently falls back to LIVE', () => {
  assert.equal(parseImportedHistoryListQuery(listQuery(), 'sales').hallId, null);
  const i = intent(); assert.deepEqual(checkedImportedHistoryGrant({ ...grant(i), scope: { kind: 'HALL_IDS', hallIds: [] } }, i, actor).scope, { kind: 'HALL_IDS', hallIds: [] });
  assert.throws(() => parseImportedHistoryListQuery({ ...listQuery(), dataset: 'LIVE' }, 'sales'), { code: 'IMPORTED_HISTORY_INVALID_QUERY' });
});

test('v16 history projection: effective date endpoints responsible drive same count page detail and retain true creator', async () => {
  const p = protocol({ final: true, kind: 'transfers', schema: Array.from({ length: 26 }, (_, i) => i + 1), transform(tag, _sql, rows) {
    if (tag === 'imported-history:list-shared' || tag === 'imported-history:detail') return rows.map(row => ({ ...row, version: 2, source_status: 'DRAFT', business_date: '2026-10-24', from_warehouse_id: id(40), to_warehouse_id: id(41), responsible_staff_id: id(42), responsible_name: 'Synthetic responsible' }));
    return rows;
  } });
  const reader = new PostgresImportedHistoryQueryReader(p.pool, { runtime26: effectiveRuntime(p) });
  const i: ImportedHistoryReadIntent = { kind: 'transfers', operation: 'list', parameters: { ...listQuery(), businessDateFrom: '2026-10-24', fromWarehouseId: id(40) } };
  const list = await reader.readList(scoped(i)), detail = await reader.readDetail(scoped(intent('transfers', true)));
  assert.equal(list.documents.total, '1'); assert.deepEqual(list.documents.items[0], detail.document);
  assert.equal(detail.document!.responsibleStaffId, id(42)); assert.equal(detail.document!.responsibleName, 'Synthetic responsible');
  assert.deepEqual(detail.document!.createdBy, header('transfers').createdBy); assert.equal(detail.document!.createdLocalAt, header('transfers').createdLocalAt);
  for (const call of p.calls.filter(c => ['imported-history:list-shared'].includes(c.tag))) {
    assert.match(call.sql, /after_facts->>'businessDate'/); assert.match(call.sql, /after_facts->>'fromWarehouseId'/);
    assert.ok(call.values.includes('2026-10-24') && call.values.includes(id(40)));
  }
  const pageSQL = p.calls.find(c => c.tag === 'imported-history:list-shared')!.sql;
  assert.match(pageSQL, /responsible_staff\.id=\(er.after_facts->>'responsibleStaffId'\)::uuid/);
  assert.match(pageSQL, /ORDER BY business_date DESC NULLS LAST,number COLLATE "C",id/);
});
test('v16 history projection: old missing responsible stays null and orphan name cannot become creator fallback', async () => {
  const p = protocol({ final: true, schema: Array.from({ length: 26 }, (_, i) => i + 1) });
  const reader = new PostgresImportedHistoryQueryReader(p.pool, { runtime26: effectiveRuntime(p) });
  const detail = await reader.readDetail(scoped(intent('sales', true)));
  assert.equal(detail.document!.responsibleStaffId, null); assert.equal(detail.document!.responsibleName, null);
  assert.deepEqual(detail.document!.createdBy, header('sales').createdBy);
  const bad = { ...header('sales'), responsibleStaffId: null, responsibleName: 'Not a real responsible binding' };
  assert.throws(() => validateImportedHistoryHeader(bad, 'sales', grant(intent())), { code: 'IMPORTED_HISTORY_INVALID_RESPONSE' });
});


test('normal list history primitives: original publication and effective header/line fragments are inert and match the existing exact26 reader', async () => {
  for (const kind of ['sales', 'transfers'] as const) {
    const fragments = importedHistoryReadSql(kind, 7);
    assert.deepEqual(fragments.values, ["COMPLETE_SCOPE;ABSENT_IS_ZERO;ALL_FILES_VERIFIED;FINAL_DELTA_VERIFIED;NO_UNRESOLVED_EXCEPTIONS"]);
    assert.match(fragments.publicationFrom, /import_batch b JOIN naijue_erp.import_history_closure_manifest m/);
    assert.match(fragments.publishedPredicate, /f.decision_reason=\$7::text/); assert.doesNotMatch(fragments.publishedPredicate, /\$1::text/);
    for (const required of ["b.status='IMPORTED'", 'history_validation_passed IS TRUE', 'import_record_accounting_claim', 'operation_receipt', 'audit_change', "r.action='IMPORT_PUBLISH'", 'm.document_count=']) assert.ok(fragments.publishedPredicate.includes(required));
    assert.match(fragments.headerValidityPredicate, /er.to_version=e.version/); assert.match(fragments.headerValidityPredicate, /stock_effect_basis='CUTOFF_BASELINE_DELTA_V1'/);
    assert.match(fragments.lineValidityPredicate, /lr.to_version<=coalesce\(e.version,h.version\)/);
    assert.match(fragments.baselineEffectExpression, /APPROVED.*INCLUDED_APPROVED.*EXCLUDED_NOT_EFFECTIVE/);
    assert.doesNotMatch(Object.values(fragments).filter(v => typeof v === 'string').join(' '), /FOR UPDATE|FOR SHARE|BEGIN |\bCOMMIT\b|INSERT INTO|UPDATE naijue|assert_history_typed_closure\(/);
    const p = effectiveProtocol(kind), reader = new PostgresImportedHistoryQueryReader(p.pool, { runtime26: effectiveRuntime(p) });
    await reader.readDetail(scoped(intent(kind, true)));
    assert.ok(p.calls.find(c => c.tag === 'imported-history:detail')!.sql.includes(fragments.headerColumns));
    const line = p.calls.find(c => c.tag === 'imported-history:line-page')!.sql;
    assert.ok(line.includes(fragments.lineColumns.replaceAll(fragments.versionExpression, '$5::integer')));
    assert.ok(line.includes(fragments.lineEffectiveJoins)); assert.equal(p.connects(), 1); assert.deepEqual(p.releases, [undefined]);
  }
});
test('normal list history primitives: original warehouse and creator-hall source facts never grant current-person hall or implicit transfer scope', () => {
  const f = importedHistoryReadSql('transfers');
  for (const key of ['调出仓来源编号', '调入仓来源编号']) assert.ok(f.sourceWarehouseBindingsPredicate.includes(key));
  for (const required of ["wr_read.import_batch_id=h.batch_id", "wr_read.status='IMPORTED'", "wr_read.source_entity_type='WAREHOUSE'", 'wh_read.id=wr_read.target_id', 'wr_read.target_id=h.from_warehouse_id', 'wr_read.target_id=h.to_warehouse_id']) assert.ok(f.sourceWarehouseBindingsPredicate.includes(required));
  assert.match(f.fromWarehouseIdExpression, /er.after_facts->>'fromWarehouseId'/); assert.match(f.toWarehouseIdExpression, /er.after_facts->>'toWarehouseId'/);
  for (const required of ["h.created_hall_provenance='ORIGINAL'", "->>'origin'='ORIGINAL'", "->>'parsed'=h.created_hall_id::text", "ch_ref.native_hall_id=h.created_hall_id", "ch_ref.source_key=ch_source.normalized_fields->>'原创建厅编号'"]) assert.ok(f.originalCreatedHallPredicate.includes(required));
  assert.doesNotMatch(f.originalCreatedHallPredicate, /staff|responsible|MIGRATION_DERIVED|coalesce/i);
  const read = scoped(), salesScope = { ...read, grant: { ...read.grant, scope: { kind: 'HALL_IDS' as const, hallIds: [id(2)] } } };
  assert.deepEqual(importedHistoryReadScopeSql(salesScope, 8), { predicate: 'h.hall_id=ANY($8::uuid[])', values: [[id(2)]] });
  assert.deepEqual(importedHistoryReadScopeSql(read, 8), { predicate: 'TRUE', values: [] });
  const transfer = scoped(intent('transfers'));
  assert.throws(() => importedHistoryReadScopeSql({ ...transfer, grant: { ...transfer.grant, scope: { kind: 'HALL_IDS', hallIds: [id(2)] } } }, 8), { code: 'IMPORTED_HISTORY_FORBIDDEN' });
  assert.throws(() => importedHistoryReadScopeSql({ ...read, grant: { ...read.grant, actorAccountId: id(99) } }, 8), { code: 'IMPORTED_HISTORY_FORBIDDEN' });
  const cancelled = new AbortController(); cancelled.abort(); assert.throws(() => importedHistoryReadScopeSql({ ...read, signal: cancelled.signal }, 8), { code: 'IMPORTED_HISTORY_READ_ABORTED' });
});
test('normal list history primitives: kind and bind positions cannot become request SQL', () => {
  for (const index of [0, -1, 1.5, NaN, Infinity, "1); DROP TABLE x;--"]) assert.throws(() => importedHistoryReadSql('sales', index as number), { code: 'IMPORTED_HISTORY_INVALID_QUERY' });
  assert.throws(() => importedHistoryReadSql('sales; DROP TABLE x' as never), { code: 'IMPORTED_HISTORY_INVALID_QUERY' });
});


test('TRANSFER_HALL_IDS: explicit actor-hall grant never widens legacy sales HALL_IDS or crosses kinds/targets', () => {
  for (const detail of [false, true]) {
    const i = intent('transfers', detail), g = { ...grant(i), scope: { kind: 'TRANSFER_HALL_IDS' as const, hallIds: [actor.hallId!] } };
    assert.deepEqual(checkedImportedHistoryGrant(g, i, actor), g);
    for (const scope of [{ kind: 'HALL_IDS', hallIds: [id(2)] }, { kind: 'TRANSFER_HALL_IDS', hallIds: [id(99)] },
      { kind: 'TRANSFER_HALL_IDS', hallIds: [id(2), id(2)] }, { kind: 'TRANSFER_HALL_IDS', hallIds: new Array(1) }]) {
      assert.throws(() => checkedImportedHistoryGrant({ ...g, scope } as never, i, actor), { code: 'IMPORTED_HISTORY_FORBIDDEN' });
    }
    assert.throws(() => checkedImportedHistoryGrant(g, i, { ...actor, hallId: null }), { code: 'IMPORTED_HISTORY_FORBIDDEN' });
    assert.throws(() => checkedImportedHistoryGrant({ ...g, actorAccountId: id(99) }, i, actor), { code: 'IMPORTED_HISTORY_FORBIDDEN' });
    assert.throws(() => checkedImportedHistoryGrant({ ...g, targetId: id(99) }, i, actor), { code: 'IMPORTED_HISTORY_FORBIDDEN' });
    const sales = intent('sales', detail);
    assert.throws(() => checkedImportedHistoryGrant({ ...grant(sales), scope: g.scope }, sales, actor), { code: 'IMPORTED_HISTORY_FORBIDDEN' });
    assert.throws(() => validateImportedHistoryHeader(header('sales'), 'sales', { ...grant(sales), scope: g.scope }), { code: 'IMPORTED_HISTORY_INVALID_RESPONSE' });
  }
});
test('TRANSFER_HALL_IDS: scope SQL reuses original source facts with effective endpoints and no current-person hall fallback', () => {
  const read = scoped(intent('transfers')), transferRead = { ...read, grant: { ...read.grant, scope: { kind: 'TRANSFER_HALL_IDS' as const, hallIds: [id(2)] } } };
  const sql = importedHistoryReadScopeSql(transferRead, 8), facts = importedHistoryReadSql('transfers');
  assert.equal(sql.predicate, importedHistoryTransferHallScopeSql(8, true)); assert.deepEqual(sql.values, [[id(2)]]);
  for (const proof of [facts.sourceWarehouseBindingsPredicate, facts.originalCreatedHallPredicate, facts.fromWarehouseIdExpression, facts.toWarehouseIdExpression]) assert.ok(sql.predicate.includes(proof));
  assert.match(sql.predicate, /scope_fw.hall_id=ANY\(\$8::uuid\[\]\)/);
  assert.match(sql.predicate, /scope_tw.hall_id=ANY\(\$8::uuid\[\]\)/);
  assert.match(sql.predicate, /h.created_role_source='SALESPERSON' AND h.created_by_source_key IS NOT NULL/);
  assert.doesNotMatch(sql.predicate, /responsible_staff|staff\.hall_id|MIGRATION_DERIVED|\bTRUE\b/);
  const original = importedHistoryTransferHallScopeSql(8, false); assert.doesNotMatch(original, /er.after_facts|e.header_id/);
  const proposed = importedHistoryTransferHallScopeSql(2, false, [3, 4]);
  assert.match(proposed, /scope_fw.id=\$3::uuid/); assert.match(proposed, /scope_tw.id=\$4::uuid/);
  assert.ok(proposed.includes(facts.sourceWarehouseBindingsPredicate));
  for (const index of [0, -1, 1.5, NaN, Infinity]) assert.throws(() => importedHistoryTransferHallScopeSql(index, true), { code: 'IMPORTED_HISTORY_INVALID_QUERY' });
});
test('TRANSFER_HALL_IDS: list count/page and detail share the explicit source scope on one original snapshot in exact19 and exact26', async () => {
  for (const effective of [false, true]) for (const detail of [false, true]) {
    const p = protocol({ final: true, kind: 'transfers', schema: Array.from({ length: effective ? 26 : 19 }, (_, i) => i + 1),
      transform(_tag, sql, rows) { return sql.includes(' AS transfer_scope_valid') ? rows.map(r => ({ ...r, transfer_scope_valid: true })) : rows; } });
    const reader = new PostgresImportedHistoryQueryReader(p.pool, effective ? { runtime26: effectiveRuntime(p) } : undefined);
    const i = intent('transfers', detail), read = { ...scoped(i), grant: { ...grant(i), scope: { kind: 'TRANSFER_HALL_IDS' as const, hallIds: [id(2)] } } };
    const result = detail ? await reader.readDetail(read) : await reader.readList(read); assert.equal(result.kind, 'transfers');
    const position = detail ? 3 : 2, predicate = importedHistoryTransferHallScopeSql(position, effective);
    for (const q of p.calls.filter(q => ['imported-history:list-shared', 'imported-history:detail'].includes(q.tag))) {
      assert.ok(q.sql.includes('AND ' + predicate)); assert.deepEqual(q.values[position - 1], [id(2)]);
      if (q.tag !== 'imported-history:list-count') assert.ok(q.sql.includes(predicate + ' AS transfer_scope_valid'));
    }
    assert.equal(p.connects(), 1); assert.equal(p.calls.filter(c => c.sql === 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY').length, 1);
    assert.equal(p.calls.at(-1)!.sql, 'COMMIT'); assert.deepEqual(p.releases, [undefined]);
  }
});
test('TRANSFER_HALL_IDS: out-of-scope detail has no child reads; contradictory returned proof rejects instead of exposing header', async () => {
  const i = intent('transfers', true), read = { ...scoped(i), grant: { ...grant(i), scope: { kind: 'TRANSFER_HALL_IDS' as const, hallIds: [id(2)] } } };
  const absent = protocol({ kind: 'transfers' }); assert.equal((await new PostgresImportedHistoryQueryReader(absent.pool).readDetail(read)).document, null);
  assert.ok(!absent.calls.some(c => c.tag === 'imported-history:line-count' || c.tag === 'imported-history:line-page'));
  for (const proof of [undefined, false, null]) {
    const p = protocol({ kind: 'transfers', final: true, transform(tag, _sql, rows) { return tag === 'imported-history:detail' ? rows.map(r => ({ ...r, transfer_scope_valid: proof })) : rows; } });
    await assert.rejects(new PostgresImportedHistoryQueryReader(p.pool).readDetail(read), { code: 'INVALID_DATABASE_VALUE' });
    assert.equal(p.calls.at(-1)!.sql, 'ROLLBACK'); assert.ok(!p.calls.some(c => c.tag === 'imported-history:line-count'));
  }
  const empty = { ...read, grant: { ...read.grant, scope: { kind: 'TRANSFER_HALL_IDS' as const, hallIds: [] } } };
  assert.equal((await new PostgresImportedHistoryQueryReader(absent.pool).readDetail(empty)).document, null);
});


/** Source identity protocol fixtures; deliberately disabled/current group renamed.
 * Tests prove selected facts, emitted SQL and decoder behavior, not installed PG. */
function catalogFixture(options: { mutate?: (rows: Record<string, unknown>[]) => Record<string, unknown>[]; groups?: Record<string, unknown>[]; denyDetail?: boolean } = {}) {
  const sourceGroup = { id: id(60), name: '原组', code: 'SOURCE' }, sourceSize = { id: id(73), name: '原尺码A' };
  const originalLines = [41, 42].map((n, index) => ({ id: id(n), line_no: index + 1, sku_id: id(50), quantity: String(index + 1),
    product_code_snapshot: '原款号', product_name_snapshot: '历史品名', color_name_snapshot: '原颜色', fit_name_snapshot: '原版', size_name_snapshot: '原完整尺码', barcode_snapshot: null, effective_valid: true }));
  const rows = originalLines.map(line => ({ line_id: line.id, sku_id: line.sku_id, line_source_id: id(line.line_no + 100),
    line_source_entity: 'TRANSFER_LINE', expected_line_entity: 'TRANSFER_LINE', line_header_key: 'PRIVATE-header', header_source_key: 'PRIVATE-header',
    old_sku_key: 'PRIVATE-old', canonical_sku_key: 'PRIVATE-canonical', alias_source_id: id(110), alias_sku_id: id(50), alias_canonical_key: 'PRIVATE-canonical', mapping_basis: 'EXACT_SOURCE',
    alias_source_entity: 'SKU', alias_source_key: 'PRIVATE-old', alias_raw_key: 'PRIVATE-old', native_sku_id: id(50), product_id: id(70), color_id: id(71), fit_id: id(72), size_id: id(73),
    sku_enabled: false, current_group_id: id(99), current_group_name: '当前新组', selection_sha256: 'a'.repeat(64), canonical_source_id: id(111), record_count: '1', record_valid: true,
    sku_evidence: { validator_version: 'NATIVE_SKU_IMPORT_V1', native_sku_id: id(50), canonical_source_key: 'PRIVATE-canonical',
      mapping: { oldSourceSkuId: 'PRIVATE-old', canonicalSourceSkuId: 'PRIVATE-canonical', mappingBasis: 'EXACT_SOURCE' }, selection: { selectionSha256: 'a'.repeat(64) },
      native_sku: { id: id(50), product_id: id(70), color_id: id(71), fit_id: id(72), size_id: id(73), enabled: true },
      references: { product: { nativeId: id(70), nativeSnapshot: { id: id(70), size_group_id: id(60) } }, color: { nativeId: id(71), nativeSnapshot: { id: id(71) } },
        fit: { nativeId: id(72), nativeSnapshot: { id: id(72) } }, size: { nativeId: id(73), nativeSnapshot: sourceSize }, sizeGroup: { nativeId: id(60), nativeSnapshot: sourceGroup } } } }));
  const groups = [73, 74].map(n => ({ group_id: id(60), group_snapshot: sourceGroup, member_size_id: id(n), member_snapshot: { size_group_id: id(60), size_id: id(n), display_order: n === 73 ? 10 : 0 },
    size_snapshot: n === 73 ? sourceSize : { id: id(74), name: '原尺码B' } }));
  const p = protocol({ kind: 'transfers', final: true, schema: Array.from({ length: 26 }, (_, i) => i + 1), transform(tag, _sql, result) {
    if (tag === 'imported-history:detail') return options.denyDetail ? [] : result.map(row => ({ ...row, line_count: originalLines.length, transfer_scope_valid: true }));
    if (tag === 'imported-history:line-count') return [{ total: String(originalLines.length) }];
    if (tag === 'imported-history:line-page') return originalLines;
    if (tag === 'imported-history:line-catalog') return options.mutate?.(structuredClone(rows)) ?? structuredClone(rows);
    if (tag === 'imported-history:line-catalog-groups') return options.groups ?? structuredClone(groups);
    return result;
  } });
  const i = intent('transfers', true), read = { ...scoped(i), grant: { ...grant(i), scope: { kind: 'TRANSFER_HALL_IDS' as const, hallIds: [id(2)] } } };
  const reader = new PostgresImportedHistoryQueryReader(p.pool, { runtime26: effectiveRuntime(p) });
  return { ...p, originalLines, sourceGroup, rows, groups, read, run: () => reader.readDetail(read) };
}
test('HISTORY lineCatalog: disabled canonical identity and original group survive current maintenance without merging repeated original lines', async () => {
  const p = catalogFixture(), detail = await p.run(), catalog = detail.lineCatalog!;
  assert.deepEqual(detail.lines.items.map(l => [l.id, l.skuId, l.quantity, l.sizeNameSnapshot]), [[id(41), id(50), '1', '原完整尺码'], [id(42), id(50), '2', '原完整尺码']]);
  assert.deepEqual(catalog.items.map(v => v.identity), [0, 1].map(() => ({ state: 'BOUND', productId: id(70), colorId: id(71), fitId: id(72), sizeId: id(73) })));
  assert.deepEqual(catalog.items.map(v => v.sourceGroup), [{ state: 'BOUND', groupId: id(60) }, { state: 'BOUND', groupId: id(60) }]);
  assert.deepEqual(catalog.groups, [{ groupId: id(60), name: '原组', sizes: [{ sizeId: id(74), name: '原尺码B', displayOrder: 0 }, { sizeId: id(73), name: '原尺码A', displayOrder: 10 }] }]);
  assert.doesNotMatch(JSON.stringify(detail), /PRIVATE-|sku_evidence|nativeSnapshot|current_group|当前新组|mapping_basis|source_key/);
  assert.equal(p.connects(), 1); assert.equal(p.calls.filter(c => c.sql === 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY').length, 1);
  const queries = p.calls.filter(c => c.tag.startsWith('imported-history:line-catalog')); assert.equal(queries.length, 2);
  assert.deepEqual(queries[0]!.values, [id(4), id(3), [id(41), id(42)], 3]); assert.deepEqual(queries[1]!.values, [id(4), [id(60)], 1001]);
  assert.match(queries[0]!.sql, /l.batch_id=\$1::uuid AND l.header_id=\$2::uuid AND l.id=ANY\(\$3::uuid\[\]\)/);
  assert.match(queries[0]!.sql, /a.old_source_sku_id=ls.raw_fields->>'SKU来源编号'/);
  assert.match(queries[1]!.sql, /g.batch_id=\$1::uuid.*g.size_group_id=ANY\(\$2::uuid\[\]\)/);
  assert.ok(queries.every(q => !/\benabled\b|p.size_group_id|current-form|INSERT|UPDATE|assert_history_typed_closure/.test(q.sql)));
  assert.equal(p.calls.at(-1)!.sql, 'COMMIT'); assert.deepEqual(p.releases, [undefined]);
});
test('HISTORY lineCatalog: missing source/alias/evidence stays UNKNOWN and missing original group does not erase bound SKU identity', async () => {
  for (const field of ['line_source_id', 'alias_source_id', 'sku_evidence', 'canonical_source_id']) {
    const p = catalogFixture({ mutate(rows) { return rows.map(r => ({ ...r, [field]: null })); } }), detail = await p.run();
    assert.ok(detail.lineCatalog!.items.every(i => i.identity.state === 'UNKNOWN' && i.sourceGroup.state === 'UNKNOWN')); assert.deepEqual(detail.lineCatalog!.groups, []);
    assert.equal(p.calls.filter(c => c.tag === 'imported-history:line-catalog-groups').length, 0);
  }
  for (const groups of [[], [{ group_id: id(60), group_snapshot: { id: id(60), name: '原组' }, member_size_id: null, member_snapshot: null, size_snapshot: null }]]) {
    const p = catalogFixture({ groups }), detail = await p.run();
    assert.ok(detail.lineCatalog!.items.every(i => i.identity.state === 'BOUND' && i.sourceGroup.state === 'UNKNOWN')); assert.deepEqual(detail.lineCatalog!.groups, []);
  }
  const absentGroup = catalogFixture({ mutate(rows) { for (const r of rows) delete (r.sku_evidence as { references: { sizeGroup?: unknown } }).references.sizeGroup; return rows; } });
  assert.ok((await absentGroup.run()).lineCatalog!.items.every(i => i.identity.state === 'BOUND' && i.sourceGroup.state === 'UNKNOWN'));
});
test('HISTORY lineCatalog: wrong original aliases, native coordinates, source groups or member snapshots fail closed before COMMIT', async () => {
  const mutations: ((rows: Record<string, unknown>[]) => Record<string, unknown>[])[] = [
    rows => rows.map(r => ({ ...r, alias_sku_id: id(999) })), rows => rows.map(r => ({ ...r, alias_canonical_key: 'another-source' })),
    rows => rows.map(r => ({ ...r, line_header_key: 'another-header' })), rows => rows.map(r => ({ ...r, line_source_entity: 'SKU' })),
    rows => rows.map(r => ({ ...r, product_id: id(999) })), rows => rows.map(r => ({ ...r, record_valid: false })),
    rows => rows.map(r => ({ ...r, selection_sha256: 'b'.repeat(64) })), rows => [...rows, rows[0]!],
    rows => rows.map(r => { (r.sku_evidence as { references: { product: { nativeSnapshot: { size_group_id: string } } } }).references.product.nativeSnapshot.size_group_id = id(99); return r; })
  ];
  for (const mutate of mutations) {
    const p = catalogFixture({ mutate }); await assert.rejects(p.run(), { code: 'INVALID_DATABASE_VALUE' }); assert.equal(p.calls.at(-1)!.sql, 'ROLLBACK');
  }
  for (const broken of [{ group_id: id(60), group_snapshot: { id: id(99), name: '原组' }, member_size_id: id(73), member_snapshot: { size_group_id: id(60), size_id: id(73), display_order: 0 }, size_snapshot: { id: id(73), name: '原尺码A' } },
    { group_id: id(60), group_snapshot: { id: id(60), name: '原组' }, member_size_id: id(73), member_snapshot: { size_group_id: id(99), size_id: id(73), display_order: 0 }, size_snapshot: { id: id(73), name: '原尺码A' } }]) {
    const p = catalogFixture({ groups: [broken] }); await assert.rejects(p.run(), { code: 'INVALID_DATABASE_VALUE' }); assert.equal(p.calls.at(-1)!.sql, 'ROLLBACK');
  }
});
test('HISTORY lineCatalog: denied detail never reads catalog; original group bound rejects rather than returning partial members', async () => {
  const denied = catalogFixture({ denyDetail: true }); assert.equal((await denied.run()).document, null);
  assert.ok(!denied.calls.some(c => c.tag.startsWith('imported-history:line-catalog')));
  const groups = Array.from({ length: 1001 }, (_, i) => ({ group_id: id(60), group_snapshot: { id: id(60), name: '原组' }, member_size_id: id(1000 + i),
    member_snapshot: { size_group_id: id(60), size_id: id(1000 + i), display_order: i }, size_snapshot: { id: id(1000 + i), name: String(i) } }));
  const oversized = catalogFixture({ groups }); await assert.rejects(oversized.run(), { code: 'IMPORTED_HISTORY_CATALOG_TOO_LARGE' }); assert.equal(oversized.calls.at(-1)!.sql, 'ROLLBACK');
});
test('HISTORY lineCatalog: public validator preserves old absent providers and rejects wrong page identity, private fields and unrelated groups', async () => {
  const legacy = emptyDetail('transfers'), i = intent('transfers', true); if (i.operation !== 'detail') throw Error();
  assert.deepEqual(validateImportedHistoryDetail(legacy, i, grant(i)), legacy);
  const p = catalogFixture(), detail = await p.run(), catalog = detail.lineCatalog!;
  const malformed = [
    { ...catalog, items: catalog.items.slice(1) }, { ...catalog, items: [...catalog.items].reverse() },
    { ...catalog, items: catalog.items.map(v => ({ ...v, skuId: id(999) })) },
    { ...catalog, items: catalog.items.map(v => ({ ...v, privateSourceKey: 'do-not-publish' })) },
    { ...catalog, groups: catalog.groups.map(g => ({ ...g, sizes: [...g.sizes].reverse() })) },
    { ...catalog, groups: [...catalog.groups, { groupId: id(99), name: 'unrelated', sizes: [{ sizeId: id(100), name: 'X', displayOrder: 0 }] }] }
  ];
  for (const lineCatalog of malformed) assert.throws(() => validateImportedHistoryDetail({ ...detail, lineCatalog }, i, p.read.grant), { code: 'IMPORTED_HISTORY_INVALID_RESPONSE' });
});
