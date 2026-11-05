import test from 'node:test';
import assert from 'node:assert/strict';
import {legacyReferenceTables,legacySourceProofTables,legacyAccountIdentityTables, readFixedLegacyTableSet} from '../scripts/import-v3/native-cleaning/reference-snapshot-reader.mjs';
import {legacyInventoryEffectTables} from '../scripts/import-v3/native-cleaning/inventory-effect-snapshot-reader.mjs';
import {readLegacyCleaningSnapshot,readLegacyCleaningWithSourceProofSnapshot,readLegacyCleaningWithAccountIdentitySnapshot} from '../scripts/import-v3/native-cleaning/document-snapshot-reader.mjs';

function database({tables = {}, counts = {}, failSql} = {}) {
  const calls = [], positions = new Map(); let connections = 0;
  return {calls, get connections() {return connections;}, pool: {connect: async () => {
    connections++;
    return {release: error => calls.push({release: error?.message ?? null}), query: async sql => {
      calls.push(sql);
      if (sql === failSql) throw new Error('SYNTHETIC_INVENTORY_READ_FAILURE');
      if (sql.includes('pg_current_snapshot')) return {rows: [{database: 'synthetic', role: 'ordinary', snapshot: '1:2:', read_only: 'on', isolation: 'repeatable read'}]};
      const count = /AS expected FROM (\w+\.\w+)/.exec(sql);
      if (count) return {rows: [{expected: counts[count[1]] ?? String((tables[count[1]] ?? []).length)}]};
      if (sql.includes(' AS documents,')) return {rows: [{documents: '1', revisions: '1'}]};
      if (sql.startsWith('FETCH')) {
        const cursor = sql.split(' ').at(-1), size = Number(sql.split(' ')[2]), offset = positions.get(cursor) ?? 0;
        positions.set(cursor, offset + size);
        const match = /^cleaning_(reference|inventory_effect|source_proof|account_identity)_(\d+)$/.exec(cursor);
        const rows = match ? tables[({reference:legacyReferenceTables,inventory_effect:legacyInventoryEffectTables,source_proof:legacySourceProofTables,account_identity:legacyAccountIdentityTables})[match[1]][Number(match[2])].table] ?? []
          : [{source_document_id: 'synthetic', source_revision: '2', raw_json: '{"version":3,"active_effect_revision":1}'}];
        return {rows: rows.slice(offset, offset + size)};
      }
      return {rows: []};
    }};
  }}};
}
const row = (keys, raw_json) => ({source_key_json: JSON.stringify(keys), raw_json});
const sinks = {pageRows: 1, onInventory: async () => {}, onReferences: async () => {}, onDocuments: async () => {}, onRevisions: async () => {}};

test('new source proof capture shares exactly one RR with all93 scopes, without changing original entry', async () => {
  const source=row(['proof-row'],'{"raw_value":{"amount":9007199254740993.1234}}'), seen=[];
  const db=database({tables:{'erp_prod_source.source_record':[source]}});
  const result=await readLegacyCleaningWithSourceProofSnapshot(db.pool,{...sinks,onSourceProof:async(table,rows)=>seen.push(...rows)});
  assert.equal(result.status,'COMPLETE_SCOPED_LEGACY_CLEANING_WITH_SOURCE_PROOF_SNAPSHOT');
  assert.deepEqual(seen,[source]);assert.equal(result.sourceProof.length,2);
  assert.ok(result.sourceProof.every(x=>x.eofObserved&&x.expected===x.rowsRead));
  assert.equal(db.connections,1);assert.equal(db.calls.filter(x=>typeof x==='string'&&x.startsWith('BEGIN')).length,1);
  assert.equal(db.calls.filter(x=>x==='ROLLBACK').length,1);
  assert.equal(result.references.length+result.inventory.length+result.sourceProof.length+2,95);
  const old=database();await readLegacyCleaningSnapshot(old.pool,sinks);
  assert.equal(old.calls.some(x=>typeof x==='string'&&x.includes('source_record')),false);
});

test('source proof COUNT/duplicate/sink failures stop the whole cohort and never expose raw proof in progress', async () => {
  const table='erp_prod_source.source_record',source=row(['proof-row'],'{"private":"sentinel"}');
  for(const config of [{tables:{[table]:[source]},counts:{[table]:'2'}},{tables:{[table]:[source,source]}}]) {
    const db=database(config);
    await assert.rejects(readLegacyCleaningWithSourceProofSnapshot(db.pool,{...sinks,onSourceProof:async()=>{}}),e=>{
      assert.ok(e.sourceProofSnapshotProgress);assert.equal(JSON.stringify(e.sourceProofSnapshotProgress).includes('sentinel'),false);return true;
    });
    assert.equal(db.calls.at(-2),'ROLLBACK');
    assert.equal(db.calls.some(x=>typeof x==='string'&&/DECLARE cleaning_(reference|documents|inventory)/.test(x)),false);
  }
  const db=database({tables:{[table]:[source]}});
  await assert.rejects(readLegacyCleaningWithSourceProofSnapshot(db.pool,{...sinks,onSourceProof:async()=>{throw Error('SINK_FAILED');}}),/SINK_FAILED/);
  assert.equal(db.calls.at(-2),'ROLLBACK');
});

test('source proof callback must exist before taking the shared connection', async () => {
  const db=database();await assert.rejects(readLegacyCleaningWithSourceProofSnapshot(db.pool,sinks),/SOURCE_PROOF_SNAPSHOT_SINK_REQUIRED/);
  assert.equal(db.connections,0);
});

test('43 inventory/effect scopes share the reference/document snapshot without posting or deriving zeros', async () => {
  const table = 'erp_prod_runtime.inventory_stock_member';
  const source = row(['generation', 'warehouse', 'sku'], '{"quantity":-9007199254740993,"before":null}');
  const db = database({tables: {[table]: [source]}}), seen = [];
  const result = await readLegacyCleaningSnapshot(db.pool, {...sinks, onInventory: async (name, rows) => seen.push({name, rows})});
  assert.equal(result.status, 'COMPLETE_SCOPED_LEGACY_CLEANING_SNAPSHOT');
  assert.equal(result.inventory.length, 43); assert.equal(result.references.length, 48);
  assert.ok(result.inventory.every(item => item.rowsRead === item.expected && item.eofObserved));
  assert.equal(db.connections, 1);
  assert.equal(db.calls.filter(sql => typeof sql === 'string' && sql.startsWith('BEGIN')).length, 1);
  assert.equal(db.calls.filter(sql => sql === 'ROLLBACK').length, 1);
  assert.equal(seen.length, 1); assert.deepEqual(seen[0].rows, [source]);
  assert.equal(result.inventory.find(item => item.table === table).rowsRead, '1');
  assert.equal(db.calls.some(sql => typeof sql === 'string' && /^(INSERT|UPDATE|DELETE|CREATE|ALTER)/.test(sql)), false);
  assert.ok(legacyInventoryEffectTables.some(item => item.table === 'erp_prod_runtime.posting'));
  assert.ok(legacyInventoryEffectTables.some(item => item.table === 'erp_prod_runtime.version_history'));
  assert.equal(legacyInventoryEffectTables.some(item => /inventory_current_export_|auth|session/.test(item.table)), false);
});
test('overlapping source identities in different generations remain separate exact keys', async () => {
  const table = 'erp_prod_runtime.inventory_stock_member', seen = [];
  const db = database({tables: {[table]: [row(['g1','w','s'], '{"quantity":1}'), row(['g2','w','s'], '{"quantity":2}')]}});
  const result = await readLegacyCleaningSnapshot(db.pool, {...sinks, onInventory: async (name, rows) => seen.push(...rows)});
  assert.equal(seen.length, 2);
  assert.equal(result.inventory.find(item => item.table === table).rowsRead, '2');
});
test('missing or duplicate inventory row refuses the entire snapshot before reference/document reads', async () => {
  const table = 'erp_prod_runtime.inventory_delta', source = row(['w','s'], '{"quantity":1}');
  for (const config of [{tables: {[table]: [source]}, counts: {[table]:'2'}}, {tables: {[table]: [source,source]}}]) {
    const db = database(config);
    await assert.rejects(readLegacyCleaningSnapshot(db.pool, sinks), error => {
      assert.ok(error.inventorySnapshotProgress);
      assert.equal(JSON.stringify(error.inventorySnapshotProgress).includes('"quantity"'), false);
      assert.equal(error.referenceSnapshotProgress, undefined); return true;
    });
    assert.equal(db.calls.includes('ROLLBACK'), true);
    assert.equal(db.calls.some(sql => typeof sql === 'string' && /DECLARE cleaning_(reference|documents)/.test(sql)), false);
  }
});
test('query failure and cancellation roll back and release without claiming inventory completion', async () => {
  const failSql = 'FETCH FORWARD 1 FROM cleaning_inventory_effect_0', db = database({failSql});
  await assert.rejects(readLegacyCleaningSnapshot(db.pool, sinks), /SYNTHETIC_INVENTORY_READ_FAILURE/);
  assert.equal(db.calls.at(-2), 'ROLLBACK');
  const table = legacyInventoryEffectTables[0].table, abort = new AbortController();
  const cancelled = database({tables: {[table]:[row(['inventory.standard-size-mappings'], '{}')]}});
  await assert.rejects(readLegacyCleaningSnapshot(cancelled.pool, {...sinks, signal:abort.signal, onInventory:async()=>abort.abort()}), {name:'AbortError'});
  assert.equal(cancelled.calls.at(-2), 'ROLLBACK');
});
test('only the exact mapping setting is queried, with identical COUNT/cursor selection', async () => {
  const db = database();
  await readLegacyCleaningSnapshot(db.pool, sinks);
  const settingQueries = db.calls.filter(sql => typeof sql === 'string' && sql.includes('erp_prod_source.system_setting'));
  assert.equal(settingQueries.length, 2);
  assert.ok(settingQueries.every(sql => sql.includes("WHERE r.key='inventory.standard-size-mappings'")));
});
test('missing inventory sink and unsafe internal table specifications refuse before querying', async () => {
  const db = database();
  await assert.rejects(readLegacyCleaningSnapshot(db.pool, {...sinks,onInventory:undefined}), /INVENTORY_SNAPSHOT_SINK_REQUIRED/);
  assert.equal(db.connections, 0);
  await assert.rejects(readFixedLegacyTableSet({query(){throw Error('MUST_NOT_QUERY');}}, [{table:'erp_prod_runtime.posting; DELETE',keys:['id'],keyKind:'PRIMARY_KEY'}], {pageRows:1,onReferences:async()=>{}}), /FIXED_LEGACY_TABLE_SPECIFICATION_REQUIRED/);
});

test('account successor shares one RR, selects only safe keys and requires sink before connection',async()=>{
  const source=row(['account-1'],'{"id":"account-1","body":{"role":null},"login_name_present":true,"login_name_nonblank":false}');
  const db=database({tables:{'erp_prod_auth.employee_login':[source]}}),seen=[];
  const result=await readLegacyCleaningWithAccountIdentitySnapshot(db.pool,{...sinks,onSourceProof:async()=>{},onAccountIdentity:async(t,rows)=>seen.push(...rows)});
  assert.deepEqual(seen,[source]);assert.equal(result.accountIdentity[0].rowsRead,'1');assert.equal(result.accountIdentity[0].eofObserved,true);
  assert.equal(result.references.length+result.inventory.length+result.sourceProof.length+result.accountIdentity.length+2,96);
  assert.equal(db.connections,1);assert.equal(db.calls.filter(x=>x==='ROLLBACK').length,1);
  const sql=db.calls.find(x=>typeof x==='string'&&x.startsWith('DECLARE cleaning_account_identity'));
  assert.ok(sql.includes("r.body ? k"));assert.ok(sql.includes("r.body->k"));assert.ok(sql.includes("r.login_name IS NOT NULL"));
  assert.equal(/to_jsonb\(r\)|password|hash|salt|token|phone|sourceFacts|session/i.test(sql),false);
  assert.equal((sql.match(/r\.login_name/g)||[]).length,3);
  assert.ok(sql.includes("'login_name_nonblank',CASE WHEN r.login_name IS NULL THEN false ELSE btrim(r.login_name)<>'' END"));
  const absent=database();await assert.rejects(readLegacyCleaningWithAccountIdentitySnapshot(absent.pool,{...sinks,onSourceProof:async()=>{}}),/ACCOUNT_IDENTITY_SNAPSHOT_SINK_REQUIRED/);assert.equal(absent.connections,0);
});
test('account count mismatch, duplicate and sink failure abort entire new cohort',async()=>{
  const table='erp_prod_auth.employee_login',source=row(['a'],'{"id":"a"}');
  for(const config of [{tables:{[table]:[source]},counts:{[table]:'2'}},{tables:{[table]:[source,source]}}]) {
    const db=database(config);await assert.rejects(readLegacyCleaningWithAccountIdentitySnapshot(db.pool,{...sinks,onSourceProof:async()=>{},onAccountIdentity:async()=>{}}),e=>Boolean(e.accountIdentitySnapshotProgress));
    assert.equal(db.calls.at(-2),'ROLLBACK');assert.equal(db.calls.some(x=>typeof x==='string'&&x.startsWith('DECLARE cleaning_source_proof')),false);
  }
});

test('auth cannot be queried as a whole row or through another selection/key',async()=>{
  for(const spec of [
    {table:'erp_prod_auth.employee_login',keys:['id'],keyKind:'PRIMARY_KEY'},
    {table:'erp_prod_auth.employee_login',keys:['login_name'],keyKind:'PRIMARY_KEY',selection:'ACCOUNT_IDENTITY_ONLY'},
    {table:'erp_prod_auth.session',keys:['id'],keyKind:'PRIMARY_KEY',selection:'ACCOUNT_IDENTITY_ONLY'},
  ]) {
    const db=database();const client=await db.pool.connect();
    await assert.rejects(readFixedLegacyTableSet(client,[spec],{pageRows:1,onReferences:async()=>{}}),/FIXED_LEGACY_TABLE_SPECIFICATION_REQUIRED/);
    assert.equal(db.calls.length,0);
  }
});
