import { GUARD_CAPABILITY } from '../adapters/postgres/src/inventory-publication-guards.ts';
import { NATIVE_IMPORT_ACCOUNTING_GUARD_CAPABILITY, NATIVE_IMPORT_ACCOUNTING_SCHEMA19_GUARD_CAPABILITY } from '../adapters/postgres/src/native-import-accounting-capability.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { IMPORT_V2_TABLES } from '../packages/application/src/import-v2-contract.ts';
import { prepareNativePartyImportChunk, stageNativePartyImports, nativeSupplierImportSource } from '../packages/application/src/native-party-import.ts';
import type { NativePartyImportEntity, NativePartyImportInput, PreparedNativePartyImportChunk } from '../packages/application/src/native-party-import.ts';
import { PostgresNativePartyImportStore } from '../adapters/postgres/src/native-party-import.ts';
import type { PgSalesClient, PgSalesPool, PgSalesResult } from '../adapters/postgres/src/sales-unit-of-work.ts';
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`, hash = 'a'.repeat(64);
function fixture(entity: NativePartyImportEntity = 'CUSTOMER', offset = 0): NativePartyImportInput {
  const table = IMPORT_V2_TABLES.find(t => t.entity === entity)!, fields = Object.fromEntries(table.columns.map(c => [c.name, '']));
  Object.assign(fields, { '来源编号': `legacy-${entity}-${offset}` });
  let nativeSnapshot: NativePartyImportInput['nativeSnapshot'], enumMappings: NativePartyImportInput['enumMappings'];
  if (entity === 'CUSTOMER' || entity === 'SUPPLIER') {
    Object.assign(fields, { '原编码': ` 0001-${offset} `, '名称': '原始名称', '状态': '原停用' });
    nativeSnapshot = { id: id(10 + offset), code: fields['原编码']!, name: '原始名称', enabled: false, version: 1, created_at: null, updated_at: null };
    enumMappings = { '状态': { raw: '原停用', native: false, evidenceRef: 'reviewed-state-map#1' } };
  } else if (entity === 'HALL') {
    Object.assign(fields, { '厅名称': '原始厅', '状态': '原正常' });
    nativeSnapshot = { id: id(10 + offset), name: '原始厅', default_customer_id: null, default_sales_warehouse_id: null, enabled: true, version: 1 };
    enumMappings = { '状态': { raw: '原正常', native: true, evidenceRef: 'reviewed-state-map#2' } };
  } else if (entity === 'WAREHOUSE') {
    Object.assign(fields, { '仓库名称': '原仓', '所属厅来源编号': 'legacy-HALL-0', '状态': '原正常', '切换范围': '本次完整核准' });
    nativeSnapshot = { id: id(10 + offset), name: '原仓', hall_id: id(10), enabled: true, version: 1 };
    enumMappings = { '状态': { raw: '原正常', native: true, evidenceRef: 'reviewed-warehouse-state' } };
  } else {
    Object.assign(fields, { '姓名': '原员工', '角色': '原营业员', '任职状态': '原离职', '联系方式': '001234' });
    nativeSnapshot = { id: id(10 + offset), name: '原员工', hall_id: null, role: 'SALESPERSON', contact: '001234', employment_status: 'LEFT', version: 1 };
    enumMappings = { '角色': { raw: '原营业员', native: 'SALESPERSON', evidenceRef: 'reviewed-role' }, '任职状态': { raw: '原离职', native: 'LEFT', evidenceRef: 'reviewed-employment' } };
  }
  return { batchId: id(1), fixedSourceNamespace: 'synthetic-only', selection: { baseManifestSha256: hash, selectionSha256: hash, approvalSha256: hash, csvSha256: hash, entity, source: 'BASE_V2', path: table.file },
    source: { id: id(100 + offset), batchId: id(1), entityType: entity, sourceKey: fields['来源编号']!, fileRef: 'synthetic-original.xlsx', sheet: entity,
      rowNo: String(offset + 2), sourceFileSha256: hash, rowSha256: hash, rawFields: { ...fields }, normalizedFields: fields, fieldProvenance: { schema_version: 1, fields: {} } },
    nativeSnapshot, enumMappings, bindings: entity === 'WAREHOUSE' ? { '所属厅来源编号': { sourceKey: 'legacy-HALL-0', nativeId: id(10) } } : {},
    ...(entity === 'WAREHOUSE' ? { warehouseRecord: { id: id(500 + offset), reviewedAt: '2026-10-21T13:00:00.000Z', decisionReason: 'SYNTHETIC_REVIEWED_WAREHOUSE_MAPPING' } } : {}) };
}
type Evidence = Record<string, unknown>;
/** Synthetic SQL protocol simulator, NOT PostgreSQL or trigger/engine proof. */
class FakePool implements PgSalesPool {
  calls: Array<{ sql: string; values: unknown[] }> = []; connects = 0; discarded: Error | undefined;
  inventoryGuardsReady = true; guardsReady = true; records: Evidence[] = []; workingRecords: Evidence[] = []; failHallCompletion = false; failWarehouseRecord = false; recordConflict = false;
  evidence: Evidence[] = []; workingEvidence: Evidence[] = []; sources: Evidence[] = []; workingSources: Evidence[] = [];
  natives = new Set<string>(); workingNatives = new Set<string>(); closed = false; published = false; orphan = false; priorBatchEvidence = false; priorSource = false; schemaReady = true; schemaVersions = [1,2,3,4,5,6,7,8,9,10,11,12,13]; conflict = false; failCreateAt = 0; creates = 0; failCommit = false; commitThenLoseAck = false;
  async connect(): Promise<PgSalesClient> { this.connects++; return { query: async (sql, values = []) => this.query(sql, values), release: error => { this.discarded = error instanceof Error ? error : undefined; } }; }
  async query(sql: string, values: unknown[]): Promise<PgSalesResult> {
    this.calls.push({ sql, values }); const answer = (rows: Evidence[] = []): PgSalesResult => ({ rows, rowCount: rows.length });
    if (sql.startsWith('BEGIN')) { this.workingEvidence = structuredClone(this.evidence); this.workingSources = structuredClone(this.sources); this.workingNatives = new Set(this.natives); this.workingRecords = structuredClone(this.records); return answer(); }
    if (sql === 'COMMIT') { if (this.failCommit) throw Error('commit unknown'); this.evidence = this.workingEvidence; this.sources = this.workingSources; this.natives = this.workingNatives; this.records = this.workingRecords; if (this.commitThenLoseAck) throw Error('commit acknowledged unknown after success'); return answer(); }
    if (sql === 'ROLLBACK') return answer();
    if (sql === GUARD_CAPABILITY) return answer([{integrity_guards_present:this.inventoryGuardsReady}]);
    if (sql === NATIVE_IMPORT_ACCOUNTING_GUARD_CAPABILITY) return answer([{accounting_guards_present:this.schemaVersions.length!==19&&this.guardsReady}]);
    if (sql === NATIVE_IMPORT_ACCOUNTING_SCHEMA19_GUARD_CAPABILITY) return answer([{accounting_guards_present:this.schemaVersions.length===19&&this.guardsReady}]);
    if (sql.includes('native-party-import:schema')) return answer([{ installed_versions: this.schemaReady ? this.schemaVersions : null }]);
    if (sql.includes(':batch')) return answer([{ mapping_version: 'V2_HISTORY_NULLABLE_1', status: this.closed ? 'IMPORTED' : 'STAGED', source_hash: hash, source_name: 'synthetic-only', already_published: this.published }]);
    if (sql.includes('native-party-import:target')) return answer(this.conflict ? [{ id: id(999) }] : this.workingNatives.has(String(values[0])) ? [{ id: values[0] }] : []);
    if (sql.includes(':relation-native')) return answer(this.workingNatives.has(String(values[0])) ? [{ id: values[0] }] : []);
    if (sql.includes('native-party-import:complete-new-hall')) { if (this.failHallCompletion) throw Error('hall completion failed'); return answer([{ id: values[0] }]); }
    if (sql.includes('native-party-import:warehouse-record-replay')) return answer(this.recordConflict ? [{ record_equal: false }] : this.workingRecords.filter(r => r.id === values[1]).map(r => ({ record_equal: JSON.stringify(r) === values[0] })));
    if (sql.includes('native-party-import:warehouse-record */')) { if (this.failWarehouseRecord) throw Error('warehouse record failed'); const r = JSON.parse(String(values[0])) as Evidence; this.workingRecords.push(r); return answer([{ id: r.id }]); }
    if (sql.includes('reference:relation */')) return answer([{ id: id(501), source_row_id: id(100) }]);
    if (sql.includes('native-party-import:new-source-identity')) return answer(this.priorSource ? [{ id: id(900) }] : this.workingSources.filter(s => s.entity_type === values[1] && s.source_key === values[2]).map(s => ({ id: s.id })));
    if (sql.includes('native-party-import:replay-complete')) return answer([{ source_complete: !this.orphan, reference_complete: !this.orphan, record_complete: !this.orphan }]);
    if (sql.includes('native-party-import:replay')) { if (this.priorBatchEvidence) return answer([{ evidence_equal: false, source_complete: true, reference_complete: true, record_complete: true }]); return answer(this.workingEvidence.filter(e => e.source_row_id === values[1] || e.batch_id === values[2] && e.entity_type === values[3] && (e.source_key === values[4] || e.native_id === values[5])).map(e => ({ evidence_equal: JSON.stringify(e) === values[0], source_complete: !this.orphan && this.workingSources.some(s => s.id === e.source_row_id), reference_complete: !this.orphan, record_complete: !this.orphan }))); }
    if (sql.includes('native-party-import:intent')) { const e = JSON.parse(String(values[0])) as Evidence; this.workingEvidence.push(e); return answer([{ source_row_id: e.source_row_id }]); }
    if (sql.includes('native-party-import:create')) { if (++this.creates === this.failCreateAt) throw Error('native create failed'); const n = JSON.parse(String(values[0])) as Evidence; this.workingNatives.add(String(n.id)); return answer([{ id: n.id }]); }
    if (sql.includes('reference:native')) return answer([{ id: values[0], native_equal: true }]);
    if (sql.includes('reference:replay')) return answer(this.workingSources.filter(s => s.id === values[0]).map(s => ({ source_equal: JSON.stringify(s) === values[1], reference_equal: true })));
    if (sql.includes('native-party-import:supplier-source-replay')) return answer(this.workingSources.filter(s => s.id === values[0]).map(s => ({ source_equal: JSON.stringify(s) === values[1] })));
    if (sql.includes('reference:source') || sql.includes('native-party-import:supplier-source */')) { const s = JSON.parse(String(values[0])) as Evidence; this.workingSources.push(s); return answer([{ id: s.id }]); }
    if (sql.includes('reference:reference')) return answer([{ source_row_id: (JSON.parse(String(values[0])) as Evidence).source_row_id }]);
    return answer();
  }
}
const store = (pool: FakePool) => new PostgresNativePartyImportStore(pool);
test('all four creation shapes preserve original codes/state/unknown historical timestamps and never create auth identity', () => {
  for (const entity of ['HALL', 'CUSTOMER', 'SUPPLIER', 'STAFF'] as const) {
    const input = fixture(entity), before = structuredClone(input), chunk = prepareNativePartyImportChunk([input]), row = chunk.rows[0]!;
    assert.deepEqual(row.nativeSnapshot, input.nativeSnapshot); assert.deepEqual(input, before); assert.equal(row.nativeSnapshot.version, 1);
    assert.equal(row.headerReference === null, entity === 'SUPPLIER'); assert.equal(row.authorization.sourceKey, input.source.sourceKey);
    if (entity === 'CUSTOMER' || entity === 'SUPPLIER') { assert.equal(row.nativeSnapshot.enabled, false); assert.equal(row.nativeSnapshot.code, ' 0001-0 '); assert.equal(row.nativeSnapshot.created_at, null); }
    assert.ok(!Object.keys(row.nativeSnapshot).some(k => /login|password|account|api_key/.test(k)));
  }
});
test('DRY_RUN is default and performs no row authorization or connection; STAGE requires exact EVERY-row grants', async () => {
  const pool = new FakePool(); let grants = 0;
  const authorizeRow = async (row: ReturnType<typeof prepareNativePartyImportChunk>['rows'][number]) => { grants++; return row.authorization; };
  assert.equal((await stageNativePartyImports([fixture()], { store: store(pool), authorizeRow })).mode, 'DRY_RUN'); assert.equal(grants, 0); assert.equal(pool.connects, 0);
  await assert.rejects(stageNativePartyImports([fixture()], { mode: 'STAGE', store: store(pool) }), /AUTHORIZATION/);
  await assert.rejects(stageNativePartyImports([fixture(), fixture('CUSTOMER', 1)], { mode: 'STAGE', store: store(pool), authorizeRow: async row => ({ ...row.authorization, nativeId: id(999) }) }), /EXACT_ROW_AUTHORIZATION/); assert.equal(pool.connects, 0);
  await stageNativePartyImports([fixture(), fixture('CUSTOMER', 1)], { mode: 'STAGE', store: store(pool), authorizeRow }); assert.equal(grants, 2); assert.equal(pool.natives.size, 2);
});
test('unknown required native fields, invented dates/codes/defaults, changed original text and unsupported source mode fail closed', () => {
  const mutations: Array<(row: NativePartyImportInput) => void> = [r => { r.nativeSnapshot.version = 2; }, r => { r.nativeSnapshot.code = 'KH000001'; }, r => { r.nativeSnapshot.created_at = '2026-10-21T00:00:00Z'; }, r => { r.source.rawFields['名称'] = 'other'; }, r => { r.nativeSnapshot.name = ''; }, r => { r.selection.source = 'AMENDMENT_V3' as never; }, r => { delete r.nativeSnapshot.enabled; }, r => { r.enumMappings = {}; }];
  for (const entity of ['CUSTOMER', 'SUPPLIER'] as const) for (const mutation of mutations) { const row = fixture(entity); mutation(row); assert.throws(() => prepareNativePartyImportChunk([row])); }
  const hall = fixture('HALL'); hall.nativeSnapshot.default_customer_id = id(22); assert.throws(() => prepareNativePartyImportChunk([hall]), /RELATION_MAPPING/);
  const staff = fixture('STAFF'); staff.nativeSnapshot.contact = null; assert.throws(() => prepareNativePartyImportChunk([staff]), /NATIVE_FIELDS/);
});
test('prepared DTO tampering is rederived before opening a connection', async () => {
  for (const mutate of [c => { c.rows[0]!.nativeId = id(999); }, c => { c.rows[0]!.authorization.rowFingerprint = 'b'.repeat(64); }, c => { c.rows[0]!.fingerprint = hash; }] satisfies Array<(c: PreparedNativePartyImportChunk) => void>) {
    const pool = new FakePool(), c = prepareNativePartyImportChunk([fixture()]); mutate(c); await assert.rejects(store(pool).stage(c), /PREPARED_CHANGED/); assert.equal(pool.connects, 0);
  }
});
test('SQL creates all native targets before immutable originals and shares single transaction with 0012 reference writer', async () => {
  for (const entity of ['HALL', 'CUSTOMER', 'SUPPLIER', 'STAFF'] as const) {
    const pool = new FakePool(); assert.deepEqual(await store(pool).stage(prepareNativePartyImportChunk([fixture(entity), fixture(entity, 1)])), { inserted: 2, replayed: 0 });
    assert.equal(pool.evidence.length, 2); assert.equal(pool.sources.length, 2); assert.equal(pool.natives.size, 2);
    const lastCreate = pool.calls.findLastIndex(c => c.sql.includes('native-party-import:create')), firstSource = pool.calls.findIndex(c => /reference:replay|supplier-source-replay/.test(c.sql));
    assert.ok(lastCreate < firstSource); assert.equal(pool.calls.filter(c => c.sql.startsWith('BEGIN')).length, 1); assert.equal(pool.calls.filter(c => c.sql === 'COMMIT').length, 1);
    const writes = pool.calls.filter(c => /\bINSERT INTO\b/.test(c.sql)); assert.ok(writes.every(c => /naijue_erp\.(native_party_import_evidence|hall|customer|supplier|staff|import_source_row|import_header_native_reference)\b/.test(c.sql)));
  }
});
test('exact replay after native maintenance changes never overwrites source/native evidence; changed intent conflicts', async () => {
  const pool = new FakePool(), input = fixture('SUPPLIER'), chunk = prepareNativePartyImportChunk([input]);
  await store(pool).stage(chunk); assert.deepEqual(await store(pool).stage(chunk), { inserted: 0, replayed: 1 }); assert.equal(pool.creates, 1);
  const changed = structuredClone(input); changed.source.rawFields['名称'] = 'changed'; changed.source.normalizedFields['名称'] = 'changed'; changed.nativeSnapshot.name = 'changed';
  await assert.rejects(store(pool).stage(prepareNativePartyImportChunk([changed])), /REPLAY_CONFLICT/); assert.equal(pool.evidence.length, 1);
  assert.equal(nativeSupplierImportSource(chunk.rows[0]!).raw_fields && (nativeSupplierImportSource(chunk.rows[0]!).raw_fields as Record<string, unknown>)['原编码'], ' 0001-0 ');
});
test('schema/closed batch/ID or code conflicts stop before any INSERT, and existing nonimport native cannot be adopted', async () => {
  for (const flag of ['closed', 'conflict', 'published', 'priorBatchEvidence'] as const) { const pool = new FakePool(); pool[flag] = true; await assert.rejects(store(pool).stage(prepareNativePartyImportChunk([fixture()]))); assert.ok(!pool.calls.some(c => /INSERT INTO/.test(c.sql))); }
  const schema = new FakePool(); schema.schemaReady = false; await assert.rejects(store(schema).stage(prepareNativePartyImportChunk([fixture()])), { code: 'NATIVE_PARTY_SCHEMA_NOT_READY' });
  const native = new FakePool(); native.natives.add(id(10)); await assert.rejects(store(native).stage(prepareNativePartyImportChunk([fixture()])), /EXISTING_NATIVE/);
});
test('native party18/19 recognition still requires actual scripted guard success before any targets or writes',async()=>{
 for(const length of [18,19])for(const denied of ['inventory','accounting']){
  const pool=new FakePool();pool.schemaVersions=Array.from({length},(_,i)=>i+1);if(denied==='inventory')pool.inventoryGuardsReady=false;else pool.guardsReady=false;
  await assert.rejects(store(pool).stage(prepareNativePartyImportChunk([fixture()])),{code:'NATIVE_IMPORT_GUARDS_NOT_READY'});
  assert.equal(pool.calls.some(c=>/:batch|:target|\b(?:INSERT|UPDATE|DELETE)\b/.test(c.sql)),false);assert.equal(pool.calls.at(-1)!.sql,'ROLLBACK');assert.equal(pool.creates,0);assert.equal(pool.sources.length,0);assert.equal(pool.evidence.length,0);
 }
 const pool=new FakePool();pool.schemaVersions=Array.from({length:19},(_,i)=>i+1);await store(pool).stage(prepareNativePartyImportChunk([fixture()]));
 assert.deepEqual(pool.calls.filter(c=>c.sql===NATIVE_IMPORT_ACCOUNTING_GUARD_CAPABILITY||c.sql===NATIVE_IMPORT_ACCOUNTING_SCHEMA19_GUARD_CAPABILITY).map(c=>c.sql),[NATIVE_IMPORT_ACCOUNTING_GUARD_CAPABILITY,NATIVE_IMPORT_ACCOUNTING_SCHEMA19_GUARD_CAPABILITY]);
});
test('native party accepts guarded reviewed schema13–19 but rejects missing, duplicate and unknown20 before targets or writes', async () => {
  const prefix = [1,2,3,4,5,6,7,8,9,10,11,12,13];
  for (const schemaVersions of [prefix, [...prefix,14], [...prefix,14,15], [...prefix,14,15,16], [...prefix,14,15,16,17], [...prefix,14,15,16,17,18], [...prefix,14,15,16,17,18,19]]) {
    const pool = new FakePool(); pool.schemaVersions = schemaVersions;
    assert.deepEqual(await store(pool).stage(prepareNativePartyImportChunk([fixture()])), { inserted: 1, replayed: 0 });
  }
  for (const schemaVersions of [prefix.slice(0, -1), prefix.filter(version => version !== 11),
    [...prefix,13], [...prefix,14,15,16,17,18,19,20], [...prefix,15]]) {
    const pool = new FakePool(); pool.schemaVersions = schemaVersions;
    await assert.rejects(store(pool).stage(prepareNativePartyImportChunk([fixture()])),
      { code: 'NATIVE_PARTY_SCHEMA_NOT_READY' });
    assert.ok(!pool.calls.some(call => call.sql.includes('native-party-import:target') || /\bINSERT INTO\b/.test(call.sql)));
    assert.equal(pool.calls.at(-1)!.sql, 'ROLLBACK');
  }
});
test('failure after first new native rolls entire chunk back; unknown COMMIT discards once without rollback/retry', async () => {
  const pool = new FakePool(); pool.failCreateAt = 2; await assert.rejects(store(pool).stage(prepareNativePartyImportChunk([fixture(), fixture('CUSTOMER', 1)])), /native create failed/); assert.equal(pool.evidence.length, 0); assert.equal(pool.natives.size, 0); assert.equal(pool.sources.length, 0); assert.equal(pool.calls.at(-1)!.sql, 'ROLLBACK');
  const unknown = new FakePool(); unknown.failCommit = true; await assert.rejects(store(unknown).stage(prepareNativePartyImportChunk([fixture()])), /commit unknown/); assert.equal(unknown.connects, 1); assert.ok(unknown.discarded); assert.equal(unknown.calls.at(-1)!.sql, 'COMMIT');
});
function hallWarehousePair(): NativePartyImportInput[] {
  const hall = fixture('HALL'), warehouse = fixture('WAREHOUSE', 1);
  hall.source.rawFields['默认销货仓来源编号'] = warehouse.source.sourceKey;
  hall.source.normalizedFields['默认销货仓来源编号'] = warehouse.source.sourceKey;
  hall.nativeSnapshot.default_sales_warehouse_id = warehouse.nativeSnapshot.id!;
  hall.bindings = { '默认销货仓来源编号': { sourceKey: warehouse.source.sourceKey, nativeId: warehouse.nativeSnapshot.id as string } };
  return [hall, warehouse];
}
test('explicit identical resubmission resolves both possible unknown-COMMIT outcomes without duplicate creation', async () => {
  for (const committed of [false, true]) {
    const pool = new FakePool(), chunk = prepareNativePartyImportChunk([fixture('SUPPLIER')]);
    pool.failCommit = !committed; pool.commitThenLoseAck = committed;
    await assert.rejects(store(pool).stage(chunk), /commit/); assert.equal(pool.connects, 1); assert.ok(pool.discarded);
    pool.failCommit = false; pool.commitThenLoseAck = false;
    assert.deepEqual(await store(pool).stage(chunk), committed ? { inserted: 0, replayed: 1 } : { inserted: 1, replayed: 0 });
    assert.equal(pool.evidence.length, 1); assert.equal(pool.sources.length, 1); assert.equal(pool.natives.size, 1);
    assert.equal(pool.connects, 2); assert.equal(pool.creates, committed ? 1 : 2);
  }
});
test('warehouse exclusion or unknown cutoff scope cannot become an IMPORTED native target', () => {
  for (const scope of ['排除', '待核', '']) { const row = fixture('WAREHOUSE', 1); row.source.rawFields['切换范围'] = scope; row.source.normalizedFields['切换范围'] = scope; assert.throws(() => prepareNativePartyImportChunk([row])); }
});
test('new HALL/WAREHOUSE immediate-FK cycle closes atomically with exact final defaults before any source/proof', async () => {
  const pool = new FakePool(), inputs = hallWarehousePair(), prepared = prepareNativePartyImportChunk(inputs);
  assert.deepEqual(await store(pool).stage(prepared), { inserted: 2, replayed: 0 }); assert.equal(pool.records.length, 1);
  const creates = pool.calls.filter(c => c.sql.includes('native-party-import:create'));
  assert.equal((JSON.parse(String(creates[0]!.values[0])) as Evidence).default_sales_warehouse_id, null);
  assert.equal((JSON.parse(String(creates[1]!.values[0])) as Evidence).hall_id, id(10));
  const completion = pool.calls.findIndex(c => c.sql.includes('complete-new-hall')), source = pool.calls.findIndex(c => /reference:replay|supplier-source-replay/.test(c.sql));
  assert.ok(completion > pool.calls.findLastIndex(c => c.sql.includes('native-party-import:create')) && completion < source);
  assert.equal(pool.calls[completion]!.values[1], id(11)); assert.match(pool.calls[completion]!.sql, /creation_xid=pg_current_xact_id\(\)/);
  assert.equal((pool.evidence.find(e => e.entity_type === 'HALL')!.native_snapshot as Evidence).default_sales_warehouse_id, id(11));
  assert.equal(pool.records[0]!.target_id, id(11)); assert.equal(pool.records[0]!.source_entity_type, 'WAREHOUSE');
  assert.deepEqual(await store(pool).stage(prepared), { inserted: 0, replayed: 2 });
  assert.equal(pool.creates, 2); assert.equal(pool.calls.filter(c => c.sql.includes('complete-new-hall')).length, 1);
});
test('HALL/WAREHOUSE fail-at-middle and record conflicts roll everything back; pre-existing HALL is never temporarily nulled', async () => {
  for (const failure of ['failHallCompletion', 'failWarehouseRecord', 'recordConflict'] as const) {
    const pool = new FakePool(); pool[failure] = true; await assert.rejects(store(pool).stage(prepareNativePartyImportChunk(hallWarehousePair())));
    assert.equal(pool.natives.size, 0); assert.equal(pool.evidence.length, 0); assert.equal(pool.sources.length, 0); assert.equal(pool.records.length, 0); assert.equal(pool.calls.at(-1)!.sql, 'ROLLBACK');
  }
  const failWarehouseCreate = new FakePool(); failWarehouseCreate.failCreateAt = 2; await assert.rejects(store(failWarehouseCreate).stage(prepareNativePartyImportChunk(hallWarehousePair())), /native create failed/);
  assert.equal(failWarehouseCreate.natives.size, 0); assert.equal(failWarehouseCreate.sources.length, 0); assert.equal(failWarehouseCreate.evidence.length, 0);
  const existing = new FakePool(); existing.natives.add(id(10)); await assert.rejects(store(existing).stage(prepareNativePartyImportChunk(hallWarehousePair())), /EXISTING_NATIVE/);
  assert.ok(!existing.calls.some(c => /complete-new-hall|native-party-import:create/.test(c.sql)));
  const unknown = new FakePool(); unknown.failCommit = true; await assert.rejects(store(unknown).stage(prepareNativePartyImportChunk(hallWarehousePair())), /commit unknown/);
  assert.equal(unknown.connects, 1); assert.equal(unknown.calls.at(-1)!.sql, 'COMMIT'); assert.ok(unknown.discarded);
});
test('orphaned replay cannot repair/adopt partial source/reference/record evidence', async () => {
  const pool = new FakePool(), chunk = prepareNativePartyImportChunk([fixture()]); await store(pool).stage(chunk);
  pool.orphan = true; const start = pool.calls.length; await assert.rejects(store(pool).stage(chunk), /REPLAY_INCOMPLETE/);
  assert.ok(!pool.calls.slice(start).some(c => /INSERT INTO|complete-new-hall/.test(c.sql)));
});
test('mixed replay/new chunk reads no original source before every new native is created', async () => {
  const pool = new FakePool(), first = fixture('SUPPLIER'); await store(pool).stage(prepareNativePartyImportChunk([first]));
  const start = pool.calls.length; assert.deepEqual(await store(pool).stage(prepareNativePartyImportChunk([first, fixture('SUPPLIER', 1)])), { inserted: 1, replayed: 1 });
  const calls = pool.calls.slice(start), lastCreate = calls.findLastIndex(c => c.sql.includes('native-party-import:create'));
  const firstOriginal = calls.findIndex(c => /new-source-identity|replay-complete|reference:replay|supplier-source-replay/.test(c.sql));
  assert.ok(lastCreate >= 0 && firstOriginal > lastCreate);
});
test('first creation cannot adopt a prior source-only orphan or another batch source binding', async () => {
  const pool = new FakePool(); pool.priorSource = true;
  await assert.rejects(store(pool).stage(prepareNativePartyImportChunk([fixture('SUPPLIER')])), /SOURCE_ALREADY_BOUND/);
  assert.equal(pool.natives.size, 0); assert.equal(pool.evidence.length, 0); assert.equal(pool.sources.length, 0);
  assert.ok(!pool.calls.some(c => /reference:source|supplier-source \*\//.test(c.sql))); assert.equal(pool.calls.at(-1)!.sql, 'ROLLBACK');
});
test('party consumers already preserve nullable historical timestamps without weakening runtime/read contracts', async () => {
  const ports = await readFile(new URL('../packages/application/src/party-maintenance-ports.ts', import.meta.url), 'utf8');
  const reader = await readFile(new URL('../adapters/postgres/src/party-maintenance-store.ts', import.meta.url), 'utf8');
  const web = await readFile(new URL('../apps/web/src/parties/response-validation.ts', import.meta.url), 'utf8');
  assert.match(ports, /createdAt: string \| null; readonly updatedAt: string \| null/); assert.match(reader, /createdAt: nullableString\(row.created_at\), updatedAt: nullableString\(row.updated_at\)/); assert.match(web, /nullableTimestamp\(row.createdAt\).*nullableTimestamp\(row.updatedAt\)/);
});
