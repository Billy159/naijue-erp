import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, appendFile, writeFile, symlink, unlink, chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {captureLegacyCleaningSnapshot} from '../scripts/import-v3/native-cleaning/private-snapshot-files.mjs';
import {verifyLegacyCleaningSnapshotFiles} from '../scripts/import-v3/native-cleaning/snapshot-file-verification.mjs';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

async function fixture() {
  const directory = join(await mkdtemp(join(tmpdir(), 'erp-synthetic-file-review-')), 'snapshot');
  const seen = new Set();
  const pool = {connect:async()=>({release(){},query:async sql=> {
    if (sql.includes('pg_current_snapshot')) return {rows:[{database:'synthetic',role:'ordinary',snapshot:'1:2:',read_only:'on',isolation:'repeatable read'}]};
    if (sql.includes('AS expected FROM')) return {rows:[{expected:'0'}]};
    if (sql.includes(' AS documents,')) return {rows:[{documents:'1',revisions:'1'}]};
    if (sql.startsWith('FETCH') && /FROM cleaning_(documents|revisions)$/.test(sql) && !seen.has(sql)) {
      seen.add(sql);
      return {rows:[{source_document_id:'synthetic-id',source_revision:'1',raw_json:'{"quantity":-9007199254740993,"text":"\\n衣"}'}]};
    }
    return {rows:[]};
  }})};
  const manifest = await captureLegacyCleaningSnapshot(pool,{directory,maxBytes:1024*1024});
  const manifestBytes = await readFile(join(directory,'SNAPSHOT.json'));
  return {directory,manifest,options:{directory,expectedManifestSha256:sha(manifestBytes),maxBytes:1024*1024,expectedUid:process.getuid()}};
}

test('independent disk reread verifies all93 files, exact bytes/digests and escaped newline row counts', async()=>{
  const f=await fixture(),result=await verifyLegacyCleaningSnapshotFiles(f.options);
  assert.equal(result.status,'VERIFIED_SCOPED_PRIVATE_SOURCE_FILES');
  assert.equal(result.files,93);assert.equal(result.rows,'2');
  assert.equal(result.sourceFileBytes,f.manifest.totalBytes);
  assert.equal(result.databaseConnections,0);assert.equal(result.targetWrites,0);
  assert.equal(result.semanticConversionVerified,false);assert.equal(result.independentTargetReadbackVerified,false);
  assert.equal(JSON.stringify(result).includes('synthetic-id'),false);
});
test('an external manifest hash is mandatory and a wrong pin fails before reading source files',async()=>{
  const f=await fixture();
  await assert.rejects(verifyLegacyCleaningSnapshotFiles({...f.options,expectedManifestSha256:undefined}),/INPUT_REQUIRED/);
  await assert.rejects(verifyLegacyCleaningSnapshotFiles({...f.options,expectedManifestSha256:'a'.repeat(64)}),/MANIFEST_PIN_REFUSED/);
});
test('post-capture source corruption is rejected even with unchanged file length',async()=>{
  const f=await fixture(),path=join(f.directory,'erp_prod_runtime.document.ndjson');
  const original=await readFile(path);const changed=Buffer.from(original);changed[10]^=1;
  await writeFile(path,changed);
  await assert.rejects(verifyLegacyCleaningSnapshotFiles(f.options),/FILE_DIGEST_MISMATCH/);
});
test('growth, exposed permissions and symbolic links are refused',async()=>{
  const f=await fixture(),path=join(f.directory,'erp_prod_runtime.document.ndjson');
  await appendFile(path,'\n');await assert.rejects(verifyLegacyCleaningSnapshotFiles(f.options),/FILE_PROTECTION_REFUSED/);
  const g=await fixture(),file=join(g.directory,'erp_prod_runtime.document.ndjson');
  await chmod(file,0o644);await assert.rejects(verifyLegacyCleaningSnapshotFiles(g.options),/FILE_PROTECTION_REFUSED/);
  const h=await fixture(),selected=join(h.directory,'erp_prod_runtime.document.ndjson');
  await unlink(selected);await symlink(join(h.directory,'erp_prod_runtime.revision.ndjson'),selected);
  await assert.rejects(verifyLegacyCleaningSnapshotFiles(h.options),/FILE_PROTECTION_REFUSED/);
});
test('incomplete output, cancellation and insufficient overall byte budget do not verify',async()=>{
  const f=await fixture();
  await assert.rejects(verifyLegacyCleaningSnapshotFiles({...f.options,maxBytes:1}),/BYTE_BUDGET_EXCEEDED/);
  const abort=new AbortController();abort.abort();
  await assert.rejects(verifyLegacyCleaningSnapshotFiles({...f.options,signal:abort.signal}),{name:'AbortError'});
  await unlink(join(f.directory,'COMPLETE.json'));
  await assert.rejects(verifyLegacyCleaningSnapshotFiles(f.options),{code:'ENOENT'});
});
test('even an explicitly supplied changed manifest cannot claim a partial source or bypass row counts',async()=>{
  for (const kind of ['partial','rowcount']) {
    const f=await fixture();
    if (kind==='partial') f.manifest.receipt.inventory[0].eofObserved=false;
    else {
      const file=f.manifest.files.find(item=>item.table==='erp_prod_runtime.document');
      const path=join(f.directory,file.filename),bytes=await readFile(path);
      const withoutLf=bytes.subarray(0,bytes.length-1);await writeFile(path,withoutLf);
      file.bytes=withoutLf.length;file.sha256=sha(withoutLf);f.manifest.totalBytes--;
    }
    const bytes=Buffer.from(JSON.stringify(f.manifest));await writeFile(join(f.directory,'SNAPSHOT.json'),bytes);
    await assert.rejects(verifyLegacyCleaningSnapshotFiles({...f.options,expectedManifestSha256:sha(bytes)}),kind==='partial'?/TABLE_COMPLETION_REFUSED/:/FILE_ROW_COUNT_MISMATCH/);
  }
});
