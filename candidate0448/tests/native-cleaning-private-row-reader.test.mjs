import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,appendFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {consumePrivateSnapshotTable} from '../scripts/import-v3/native-cleaning/private-row-reader.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
async function fixture(rows,table='erp_prod_runtime.revision',rawBytes) {
  const directory=join(await mkdtemp(join(tmpdir(),'erp-synthetic-private-rows-')),'snapshot');await mkdir(directory,{mode:0o700});
  const bytes=rawBytes??Buffer.from(rows.map(row=>JSON.stringify(row)+'\n').join(''));
  const filename=`${table}.ndjson`;await writeFile(join(directory,filename),bytes,{mode:0o600});
  const files=[{table,filename,rows:String(rows.length),bytes:bytes.length,sha256:hash(bytes)},...Array.from({length:92},(_,i)=>({table:`unused-${i}`}))];
  const manifest={status:'COMPLETE_SCOPED_PRIVATE_SNAPSHOT',files},mb=Buffer.from(JSON.stringify(manifest));await writeFile(join(directory,'SNAPSHOT.json'),mb,{mode:0o600});
  return {directory,expectedManifestSha256:hash(mb),expectedUid:process.getuid(),table,maxRowBytes:33554432,onRow:async()=>{}};
}
const row=raw_json=>({source_document_id:'private-id',source_revision:'1',raw_json});
test('streams large escaped UTF8 rows across64KiB blocks with exact raw number text and ordinal proof',async()=>{
  const raw='{"quantity":9007199254740993.0000,"text":'+JSON.stringify('衣\\\n'.repeat(30000))+'}';
  const f=await fixture([row(raw),row('{}')]);const seen=[];
  const result=await consumePrivateSnapshotTable({...f,onRow:async(r,proof)=>{seen.push([r.raw_json,proof.ordinal,proof.envelopeSha256]);}});
  assert.equal(seen[0][0],raw);assert.equal(seen[0][1],'1');assert.equal(seen[1][1],'2');assert.match(seen[0][2],/^[a-f0-9]{64}$/);
  assert.equal(result.rows,'2');assert.equal(result.databaseConnections,0);assert.equal(result.targetWrites,0);
  assert.equal(JSON.stringify(result).includes('private-id'),false);
});
test('empty files complete only with exact zero count',async()=>{
  const f=await fixture([],'erp_prod_source.product'),result=await consumePrivateSnapshotTable(f);
  assert.equal(result.rows,'0');assert.equal(result.bytes,0);
});
test('incomplete last row, empty line, bad UTF8 and malformed JSON are rejected with code only',async()=>{
  for (const [bytes,error] of [[Buffer.from(JSON.stringify(row('{}'))),/EOF_REFUSED/],[Buffer.from('\n'),/EMPTY_LINE_REFUSED/],
    [Buffer.from([255,10]),/ENVELOPE_JSON_REFUSED/],[Buffer.from('secret-private-business\n'),/ENVELOPE_JSON_REFUSED/]]) {
    const f=await fixture([row('{}')],'erp_prod_runtime.revision',bytes);
    await assert.rejects(consumePrivateSnapshotTable(f),error);
  }
});
test('wrong manifest, source corruption and post-read file mutation cannot return completion',async()=>{
  const f=await fixture([row('{}')]);await assert.rejects(consumePrivateSnapshotTable({...f,expectedManifestSha256:'a'.repeat(64)}),/MANIFEST_PIN_REFUSED/);
  const path=join(f.directory,`${f.table}.ndjson`),bytes=await readFile(path);bytes[bytes.indexOf('private-id')]=80;await writeFile(path,bytes);
  await assert.rejects(consumePrivateSnapshotTable(f),/FILE_DIGEST_REFUSED/);
  const g=await fixture([row('{}')]);
  await assert.rejects(consumePrivateSnapshotTable({...g,onRow:()=>appendFile(join(g.directory,`${g.table}.ndjson`),'\n')}),/COUNT_MISMATCH|EMPTY_LINE_REFUSED|FILE_CHANGED/);
});
test('bounded row size, cancellation and callback failure do not promote provisional results',async()=>{
  const f=await fixture([row('{}')]);await assert.rejects(consumePrivateSnapshotTable({...f,maxRowBytes:2}),/SIZE_LIMIT/);
  await assert.rejects(consumePrivateSnapshotTable({...f,onRow:()=>{throw new Error('SYNTHETIC_SINK_FAILURE');}}),/SYNTHETIC_SINK_FAILURE/);
  const abort=new AbortController();abort.abort();await assert.rejects(consumePrivateSnapshotTable({...f,signal:abort.signal}),{name:'AbortError'});
});
test('only fixed93 table names and correct per-kind envelope are accepted',async()=>{
  const f=await fixture([row('{}')]);await assert.rejects(consumePrivateSnapshotTable({...f,table:'erp_prod_auth.employee_login'}),/EXACT_INPUT_REQUIRED/);
  const g=await fixture([row('{}')],'erp_prod_source.product');await assert.rejects(consumePrivateSnapshotTable(g),/REFERENCE_IDENTITY_REFUSED/);
});
