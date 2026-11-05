import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readLegacyDocumentSnapshot } from '../scripts/import-v3/native-cleaning/document-snapshot-reader.mjs';

function database({ docs = [['a','1'],['b','2']], revisions = [['a','1'],['a','2'],['b','2']], counts, failAt, rollbackFails = false } = {}) {
  const calls = [], positions = { documents: 0, revisions: 0 };
  const client = {
    async query(sql) {
      calls.push(sql);
      if (failAt && sql.includes(failAt)) throw new Error('QUERY_FAILED');
      if (sql === 'ROLLBACK' && rollbackFails) throw new Error('ROLLBACK_FAILED');
      if (sql.includes('pg_current_snapshot')) return { rows: [{ database:'isolated',role:'ordinary',snapshot:'10:20:',read_only:'on',isolation:'repeatable read' }] };
      if (sql.includes('count(*)')) return { rows: [counts ?? {documents:String(docs.length),revisions:String(revisions.length)}] };
      if (sql.startsWith('FETCH')) {
        const kind = sql.endsWith('cleaning_documents') ? 'documents' : 'revisions';
        const source = kind === 'documents' ? docs : revisions;
        const size = Number(sql.match(/FORWARD (\d+)/)[1]);
        const selected = source.slice(positions[kind], positions[kind] + size);
        positions[kind] += selected.length;
        return { rows:selected.map(([id,revision]) => ({ source_document_id:id,source_revision:revision,
          raw_json:'{"amount":9007199254740993.01,"body":null}' })) };
      }
      return { rows:[] };
    },
    release(error) { calls.push({release:error?.message ?? null}); },
  };
  return { calls, pool:{connect:async()=>client} };
}
const sinks = () => ({onDocuments:async()=>{},onRevisions:async()=>{}});
test('same connection/snapshot; exact page multiple still fetches EOF; JSON remains exact text', async()=>{
  const db=database(), rows=[];
  const receipt=await readLegacyDocumentSnapshot(db.pool,{pageRows:1,onDocuments:async p=>rows.push(...p),onRevisions:async p=>rows.push(...p)});
  assert.equal(receipt.status,'COMPLETE_DOCUMENT_SNAPSHOT');
  assert.deepEqual(receipt.counts,{documents:'2',revisions:'3'});
  assert.equal(db.calls.filter(x=>typeof x==='string'&&x.startsWith('FETCH')).length,7);
  assert.ok(rows.every(r=>r.raw_json.includes('9007199254740993.01')));
  assert.deepEqual(db.calls.at(-1),{release:null});
  assert.equal(db.calls.at(-2),'ROLLBACK');
});
for (const [title,options,message] of [
  ['missing rows',{counts:{documents:'3',revisions:'3'}},'SOURCE_EOF_COUNT_MISMATCH'],
  ['duplicate headers',{docs:[['a','1'],['a','1']]},'DUPLICATE_DOCUMENT_ID'],
  ['duplicate revisions',{revisions:[['a','1'],['a','1'],['b','2']]},'DUPLICATE_REVISION_KEY'],
  ['missing current revision',{revisions:[['a','2'],['b','2']]},'CURRENT_REVISION_MISSING'],
  ['orphan revisions',{revisions:[['a','1'],['c','2']]},'REVISION_DOCUMENT_OUTSIDE_COHORT'],
  ['query failure',{failAt:'FETCH'},'QUERY_FAILED'],
]) test(`${title} refuses completion and releases transaction`,async()=>{
  const db=database(options);
  await assert.rejects(readLegacyDocumentSnapshot(db.pool,{...sinks(),pageRows:1}),new RegExp(message));
  assert.equal(db.calls.at(-2),'ROLLBACK');
  assert.deepEqual(db.calls.at(-1),{release:null});
});
test('sink failure never returns complete; broken rollback discards connection',async()=>{
  const db=database({rollbackFails:true});
  await assert.rejects(readLegacyDocumentSnapshot(db.pool,{...sinks(),onDocuments:async()=>{throw new Error('DISK_FULL');}}),/DISK_FULL/);
  assert.deepEqual(db.calls.at(-1),{release:'ROLLBACK_FAILED'});
});
test('cancellation after a page rolls back without fetching next page',async()=>{
  const db=database(), controller=new AbortController();
  await assert.rejects(readLegacyDocumentSnapshot(db.pool,{...sinks(),signal:controller.signal,onDocuments:async()=>controller.abort()}),{name:'AbortError'});
  assert.equal(db.calls.filter(x=>typeof x==='string'&&x.startsWith('FETCH')).length,1);
  assert.equal(db.calls.at(-2),'ROLLBACK');
});
test('empty source still verifies explicit EOF and completes',async()=>{
  const db=database({docs:[],revisions:[]});
  assert.deepEqual((await readLegacyDocumentSnapshot(db.pool,sinks())).counts,{documents:'0',revisions:'0'});
});

test('unknown BEGIN discards the connection instead of pooling uncertain transaction state',async()=>{
  const db=database({failAt:'BEGIN'});
  await assert.rejects(readLegacyDocumentSnapshot(db.pool,sinks()),/QUERY_FAILED/);
  assert.deepEqual(db.calls.at(-1),{release:'QUERY_FAILED'});
  assert.equal(db.calls.includes('ROLLBACK'),false);
});

test('failed read reports exact known counts and observed EOF without claiming completion',async()=>{
  const db=database({counts:{documents:'3',revisions:'3'}});
  await assert.rejects(readLegacyDocumentSnapshot(db.pool,{...sinks(),pageRows:1}),error=>{
    assert.deepEqual(error.snapshotProgress,{
      documents:{expected:'3',rowsRead:'2',eofObserved:true},
      revisions:{expected:'3',rowsRead:'0',eofObserved:false},
    });
    assert.equal(error.message,'SOURCE_EOF_COUNT_MISMATCH');
    return true;
  });
});
