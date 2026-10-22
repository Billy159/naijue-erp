/** Exact borrowed-client protocol only; no real PostgreSQL or bootstrap account. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { IMPORT_V2_TABLES } from '../packages/application/src/import-v2-contract.ts';
import { prepareNativePartyImportChunk } from '../packages/application/src/native-party-import.ts';
import { PostgresNativePartyImportStore, stageNativePartyImportsOnClient } from '../adapters/postgres/src/native-party-import.ts';
import type { PgSalesClient, PgSalesResult } from '../adapters/postgres/src/sales-unit-of-work.ts';
import type { NativeRuntime26Capability } from '../packages/application/src/native-import-schema-contract.ts';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, hash = 'a'.repeat(64);
function chunk() {
  const table = IMPORT_V2_TABLES.find(t => t.entity === 'STAFF')!, raw = Object.fromEntries(table.columns.map(c => [c.name, '']));
  Object.assign(raw, { '来源编号': 'original-staff', '姓名': 'SYNTHETIC actual staff', '角色': '管理员', '任职状态': '在职' });
  return prepareNativePartyImportChunk([{ batchId: id(1), fixedSourceNamespace: 'synthetic-bootstrap',
    selection: { entity: 'STAFF', source: 'BASE_V2', path: table.file, baseManifestSha256: hash, selectionSha256: hash, approvalSha256: hash, csvSha256: hash },
    source: { id: id(2), batchId: id(1), entityType: 'STAFF', sourceKey: raw['来源编号']!, fileRef: 'synthetic-source.xlsx', sheet: 'STAFF', rowNo: '2', sourceFileSha256: hash,
      rowSha256: hash, rawFields: raw, normalizedFields: raw, fieldProvenance: { schema_version: 1, fields: {} } },
    nativeSnapshot: { id: id(3), name: raw['姓名']!, hall_id: null, role: 'ADMIN', contact: null, employment_status: '在职', version: 1 }, bindings: {},
    enumMappings: { '角色': { raw: '管理员', native: 'ADMIN', evidenceRef: 'synthetic-exact-role' }, '任职状态': { raw: '在职', native: '在职', evidenceRef: 'synthetic-exact-state' } } }]);
}
type Row = Record<string, unknown>;
class BorrowedClient implements PgSalesClient {
  calls: string[] = []; releases = 0; failNativeCreate = false; schemaVersion = 19;
  committed: { native: Row[]; sources: Row[]; intents: Row[] } = { native: [], sources: [], intents: [] };
  working = structuredClone(this.committed);
  release() { this.releases++; }
  async query(sql: string, values: unknown[] = []): Promise<PgSalesResult> {
    this.calls.push(sql); const answer = (rows: Row[] = []): PgSalesResult => ({ rows, rowCount: rows.length });
    if (sql.startsWith('BEGIN')) { this.working = structuredClone(this.committed); return answer(); }
    if (sql === 'COMMIT') { this.committed = structuredClone(this.working); return answer(); }
    if (sql === 'ROLLBACK') { this.working = structuredClone(this.committed); return answer(); }
    if (sql.includes('native-party-import:schema')) return answer([{ installed_versions: Array.from({ length: this.schemaVersion }, (_, i) => i + 1) }]);
    if (sql.includes('AS integrity_guards_present')) return answer([{ integrity_guards_present: true }]);
    if (sql.includes('AS accounting_guards_present')) return answer([{ accounting_guards_present: true }]);
    if (sql.includes(':global-lock')) return answer();
    if (sql.includes(':batch')) return answer([{ mapping_version: 'V2_HISTORY_NULLABLE_1', status: 'STAGED', source_hash: hash, source_name: 'synthetic-bootstrap', already_published: false }]);
    if (sql.includes('native-party-import:target')) return answer(this.working.native.filter(n => n.id === values[0]).map(n => ({ id: n.id })));
    if (sql.includes('native-party-import:replay-complete')) return answer([{ source_complete: this.working.sources.length === 1, reference_complete: true, record_complete: true }]);
    if (sql.includes('native-party-import:replay')) return answer(this.working.intents.filter(e => e.source_row_id === values[1]).map(e => ({ evidence_equal: JSON.stringify(e) === values[0] })));
    if (sql.includes('native-party-import:intent')) { const e = JSON.parse(String(values[0])) as Row; this.working.intents.push(e); return answer([{ source_row_id: e.source_row_id }]); }
    if (sql.includes('native-party-import:create')) { if (this.failNativeCreate) throw Error('SYNTHETIC native failure'); const n = JSON.parse(String(values[0])) as Row; this.working.native.push(n); return answer([{ id: n.id }]); }
    if (sql.includes('native-party-import:new-source-identity')) return answer([]);
    if (sql.includes('reference:native')) return answer([{ id: values[0], native_equal: true }]);
    if (sql.includes('reference:replay')) return answer(this.working.sources.filter(s => s.id === values[0]).map(s => ({ source_equal: JSON.stringify(s) === values[1], reference_equal: true })));
    if (sql.includes('reference:source')) { const s = JSON.parse(String(values[0])) as Row; this.working.sources.push(s); return answer([{ id: s.id }]); }
    if (sql.includes('reference:reference')) return answer([{ source_row_id: (JSON.parse(String(values[0])) as Row).source_row_id }]);
    throw Error('Unexpected borrowed-client protocol: ' + sql.slice(0, 100));
  }
}
test('borrowed original writer leaves commit/release to MAIN; ordinary PARTY stage accepts exact bootstrap evidence replay', async () => {
  const client = new BorrowedClient(), prepared = chunk(); await client.query('BEGIN'); const start = client.calls.length;
  assert.deepEqual(await stageNativePartyImportsOnClient(client, prepared), { inserted: 1, replayed: 0 });
  assert.equal(client.releases, 0); assert.equal(client.committed.native.length, 0); assert.equal(client.working.native.length, 1); assert.equal(client.working.sources.length, 1);
  assert.ok(client.calls.slice(start).every(sql => !/^(?:BEGIN|COMMIT|ROLLBACK)\b/.test(sql)));
  await client.query('COMMIT'); const prior = structuredClone(client.committed), replayStart = client.calls.length; let connects = 0;
  const store = new PostgresNativePartyImportStore({ async connect() { connects++; return client; } });
  assert.deepEqual(await store.stage(prepared), { inserted: 0, replayed: 1 }); assert.deepEqual(client.committed, prior);
  assert.equal(connects, 1); assert.equal(client.releases, 1); assert.equal(client.calls.slice(replayStart).filter(sql => sql === 'COMMIT').length, 1);
  assert.equal(client.calls.slice(replayStart).filter(sql => sql.includes('native-party-import:create')).length, 0);
});
test('borrowed writer validates before SQL and propagates failure without rolling back the owner transaction', async () => {
  const client = new BorrowedClient(), altered = structuredClone(chunk()); altered.rows[0]!.nativeId = id(99);
  await assert.rejects(stageNativePartyImportsOnClient(client, altered), /PREPARED_CHANGED/); assert.equal(client.calls.length, 0);
  await client.query('BEGIN'); client.failNativeCreate = true; const start = client.calls.length;
  await assert.rejects(stageNativePartyImportsOnClient(client, chunk()), /SYNTHETIC native failure/);
  assert.equal(client.releases, 0); assert.equal(client.working.intents.length, 1); assert.equal(client.committed.intents.length, 0);
  assert.ok(client.calls.slice(start).every(sql => !/^(?:BEGIN|COMMIT|ROLLBACK)\b/.test(sql)));
  await client.query('ROLLBACK'); assert.equal(client.working.intents.length, 0); assert.equal(client.working.native.length, 0);
});
function successorChunk() {
  const input = { ...chunk().rows[0]!.input, schemaProfile: 'EXACT26' as const };
  return prepareNativePartyImportChunk([input]);
}
test('party26 DTO never enters the old19 writer even when STAFF native fields are unchanged', async () => {
  const client = new BorrowedClient(), prepared = successorChunk();
  assert.deepEqual(prepared.rows[0]!.nativeSnapshot, chunk().rows[0]!.nativeSnapshot);
  await assert.rejects(stageNativePartyImportsOnClient(client, prepared), /NATIVE_PARTY_EXACT26_REQUIRED/);
  assert.equal(client.calls.length, 0); let connects = 0;
  await assert.rejects(new PostgresNativePartyImportStore({ async connect() { connects++; return client; } }).stage(prepared), /NATIVE_PARTY_EXACT26_REQUIRED/);
  assert.equal(connects, 0); assert.equal(client.calls.length, 0);
});
test('party26 verifies original borrowed client before SQL and preserves it through shared header persistence', async () => {
  const client = new BorrowedClient(); client.schemaVersion = 26; await client.query('BEGIN'); let verified = 0;
  const cap: NativeRuntime26Capability = { profile: 'EXACT26', contract: 'NATIVE_RUNTIME26_V1', async assertReady(target, purpose) {
    assert.equal(target, client); assert.equal(purpose, 'IMPORT_STAGE');
    if (verified++ === 0) assert.deepEqual(client.calls, ['BEGIN']);
  } };
  assert.deepEqual(await stageNativePartyImportsOnClient(client, successorChunk(), cap), { inserted: 1, replayed: 0 });
  assert.equal(verified, 2); assert.equal(client.working.native.length, 1); assert.equal(client.working.sources.length, 1);
  assert.equal(client.committed.native.length, 0); assert.equal(client.releases, 0);
  assert.ok(client.calls.slice(1).every(sql => !/^(BEGIN|COMMIT|ROLLBACK)/.test(sql)));
  await client.query('ROLLBACK'); assert.equal(client.working.native.length, 0);
});
test('party26 rejects failed or boolean capabilities before SQL and rejects a wrong schema before native targets', async () => {
  for (const verify of [async () => { throw Error('SYNTHETIC wrong target'); }, async () => true]) {
    const client = new BorrowedClient(), cap = { profile: 'EXACT26', contract: 'NATIVE_RUNTIME26_V1', assertReady: verify } as unknown as NativeRuntime26Capability;
    await assert.rejects(stageNativePartyImportsOnClient(client, successorChunk(), cap));
    assert.equal(client.calls.length, 0); assert.equal(client.releases, 0);
  }
  const client = new BorrowedClient(), cap: NativeRuntime26Capability = { profile: 'EXACT26', contract: 'NATIVE_RUNTIME26_V1', async assertReady(target) { assert.equal(target, client); } };
  await assert.rejects(stageNativePartyImportsOnClient(client, successorChunk(), cap), /NATIVE_PARTY_SCHEMA_NOT_READY/);
  assert.ok(!client.calls.some(sql => /native-party-import:(target|batch|create|intent)/.test(sql)));
  assert.equal(client.working.native.length, 0);
});
