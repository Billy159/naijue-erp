import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { DomainError } from '../packages/domain/src/errors.ts';
import { createImportedHistoryQueryService } from '../packages/application/src/imported-history-query-service.ts';
import { checkedImportedHistoryGrant, parseImportedHistoryListQuery, validateImportedHistoryHeader, validateImportedHistoryLine, validateImportedHistoryList } from '../packages/application/src/imported-history-query-validation.ts';
import type { ImportedHistoryKind, ImportedHistoryReadIntent, ImportedHistoryScopedRead } from '../packages/application/src/imported-history-query-ports.ts';
import { PostgresImportedHistoryQueryReader } from '../adapters/postgres/src/imported-history-query-reader.ts';
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
  let connects = 0;
  const client: PgSalesClient = { async query(sql, values = []) {
    const tag = sql.startsWith('/*') ? sql.match(/^\/\* ([^*]+) \*\//)![1]! : sql;
    calls.push({ tag, sql, values: structuredClone(values) }); if (tag === options.failure) throw Error('SYNTHETIC:' + tag);
    let rows: Record<string, unknown>[] = [];
    if (tag === 'imported-history:schema') rows = [{ versions: options.schema ?? Array.from({ length: 19 }, (_, i) => i + 1) }];
    if (tag === 'inventory:guards') rows = [{ integrity_guards_present: options.guards !== false }];
    if (sql === NATIVE_IMPORT_ACCOUNTING_SCHEMA19_GUARD_CAPABILITY) rows = [{ accounting_guards_present: options.guards !== false }];
    if (tag === 'imported-history:list-count') rows = [{ total: options.final ? '1' : '0' }];
    if (tag === 'imported-history:list-page') rows = options.final ? [headerRow(options.kind ?? 'sales')] : [];
    if (tag === 'imported-history:detail') rows = options.final ? [{ ...headerRow(options.kind ?? 'sales'), line_count: options.mismatch ? 1 : 0, settlement_count: 0 }] : [];
    if (tag.endsWith('-count') && !tag.includes('list-count')) rows = [{ total: '0' }];
    if (sql.includes(' AS effective_valid')) rows = rows.map(row => ({ ...row, effective_valid: true }));
    if (sql.includes(' AS responsible_staff_id')) rows = rows.map(row => ({ responsible_staff_id: null, responsible_name: null, ...row }));
    rows = options.transform?.(tag, sql, rows) ?? rows;
    options.afterQuery?.(tag); return { rows, rowCount: rows.length };
  }, release(error) { releases.push(error); } };
  const pool: PgSalesPool = { async connect() { connects++; return client; } };
  return { pool, client, calls, releases, connects: () => connects };
}

function effectiveProtocol(kind: ImportedHistoryKind, failStage?: string) {
  return protocol({ final: true, kind, schema: Array.from({ length: 26 }, (_, i) => i + 1), transform(tag, sql, rows) {
    if (tag === 'imported-history:list-page' || tag === 'imported-history:detail') {
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
  for (const kind of ['sales', 'transfers'] as const) for (const stage of ['imported-history:list-page', 'imported-history:detail', 'imported-history:line-page', ...(kind === 'sales' ? ['imported-history:settlement-page'] : [])]) {
    const p = effectiveProtocol(kind, stage), reader = new PostgresImportedHistoryQueryReader(p.pool, { runtime26: effectiveRuntime(p) });
    await assert.rejects(stage === 'imported-history:list-page' ? reader.readList(scoped(intent(kind))) : reader.readDetail(scoped(intent(kind, true))), { code: 'INVALID_DATABASE_VALUE' });
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
    for (const q of p.calls.filter(q => ['imported-history:list-count', 'imported-history:list-page', 'imported-history:detail'].includes(q.tag))) {
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
  const queries = empty.calls.filter(c => ['imported-history:list-count', 'imported-history:list-page'].includes(c.tag)); assert.equal(queries.length, 2);
  for (const q of queries) {
    assert.match(q.sql, /b\.status='IMPORTED'/); assert.match(q.sql, /history_validation_passed IS TRUE/); assert.match(q.sql, /import_record_accounting_claim/); assert.match(q.sql, /operation_receipt/); assert.match(q.sql, /audit_change/); assert.match(q.sql, /h\.hall_id=ANY\(\$2::uuid\[\]\)/);
    assert.ok(q.values.includes("'; DROP TABLE x;--")); assert.ok(!q.sql.includes('DROP TABLE'));
  }
  assert.deepEqual(queries[1]!.values.slice(0, -2), queries[0]!.values);
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
  for (const failure of ['imported-history:list-page', 'COMMIT']) {
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
    if (tag === 'imported-history:list-page' || tag === 'imported-history:detail') return rows.map(row => ({ ...row, version: 2, source_status: 'DRAFT', business_date: '2026-10-24', from_warehouse_id: id(40), to_warehouse_id: id(41), responsible_staff_id: id(42), responsible_name: 'Synthetic responsible' }));
    return rows;
  } });
  const reader = new PostgresImportedHistoryQueryReader(p.pool, { runtime26: effectiveRuntime(p) });
  const i: ImportedHistoryReadIntent = { kind: 'transfers', operation: 'list', parameters: { ...listQuery(), businessDateFrom: '2026-10-24', fromWarehouseId: id(40) } };
  const list = await reader.readList(scoped(i)), detail = await reader.readDetail(scoped(intent('transfers', true)));
  assert.equal(list.documents.total, '1'); assert.deepEqual(list.documents.items[0], detail.document);
  assert.equal(detail.document!.responsibleStaffId, id(42)); assert.equal(detail.document!.responsibleName, 'Synthetic responsible');
  assert.deepEqual(detail.document!.createdBy, header('transfers').createdBy); assert.equal(detail.document!.createdLocalAt, header('transfers').createdLocalAt);
  for (const call of p.calls.filter(c => ['imported-history:list-count', 'imported-history:list-page'].includes(c.tag))) {
    assert.match(call.sql, /after_facts->>'businessDate'/); assert.match(call.sql, /after_facts->>'fromWarehouseId'/);
    assert.ok(call.values.includes('2026-10-24') && call.values.includes(id(40)));
  }
  const pageSQL = p.calls.find(c => c.tag === 'imported-history:list-page')!.sql;
  assert.match(pageSQL, /responsible_staff\.id=\(er.after_facts->>'responsibleStaffId'\)::uuid/);
  assert.match(pageSQL, /ORDER BY \(CASE WHEN e.header_id IS NULL THEN h.business_date/);
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
