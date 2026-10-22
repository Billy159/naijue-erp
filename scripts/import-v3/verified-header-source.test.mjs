import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,writeFile,readFile,realpath,rm,lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { openVerifiedHeaderSource } from './verified-header-source.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),pin='a'.repeat(64),id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
async function fixture(t,alter=()=>{}){
 const dir=await mkdtemp(join(await realpath(tmpdir()),'verified-headers-synthetic-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const binding={batchId:id(1),fixedSourceNamespace:'SYNTHETIC_HEADERS',selectionSha256:pin,cutoffAt:'2026-10-04T12:00:00+08:00'},spoolFile=join(dir,'headers.jsonl.gz'),receiptFile=join(dir,'receipt.json');
 const records=['SALES_HEADER','TRANSFER_HEADER'].map((entity,i)=>({source:{id:id(10+i),batchId:binding.batchId,entityType:entity,sourceKey:'SYNTHETIC_HEADER_'+i,fileRef:'synthetic.xlsx',sheet:'SYNTHETIC',rowNo:String(2+i),sourceFileSha256:pin,rowSha256:pin,rawFields:{'原单号':'SYNTHETIC_'+i},normalizedFields:{'原单号':'SYNTHETIC_'+i},fieldProvenance:{schema_version:1,fields:{}}},selection:{entity,source:'BASE_V2',selectionSha256:pin},creatorHallOverlay:{reason:'SYNTHETIC_APPROVED_OVERLAY'},temporalEvidence:{businessDate:null}}));
 let raw=Buffer.from(records.map(r=>JSON.stringify(r)+'\n').join('')),stored=gzipSync(raw);
 const receipt={taskId:'B06-HEADER-SOURCE-ONLY-GZIP-ONE-WINDOW',status:'PASS_COMPLETE_42561_HEADER_SOURCE_ONLY_NO_SQL',sql:false,stage:false,publish:false,readerReturned:true,readerClosed:true,sourceChecks:'SOURCE_ONLY_COUNTS_AND_ORIGINAL_CELLS_VERIFIED_NOT_NATIVE_BINDINGS',...binding,actualRows:2,actualCounts:{SALES_HEADER:1,TRANSFER_HEADER:1},preservedCompressedSource:{path:spoolFile,bytes:stored.length,sha256:sha(stored),rawBytes:raw.length,rawSha256:sha(raw)}};
 const mutable={receipt,stored,raw,records};alter(mutable);stored=mutable.stored;raw=mutable.raw;const rb=Buffer.from(JSON.stringify(receipt));await writeFile(spoolFile,stored,{mode:0o600});await writeFile(receiptFile,rb,{mode:0o600});return {options:{spoolFile,receiptFile,trustedReceiptSha256:sha(rb),binding,limits:{maxStoredBytes:134217728,maxRawBytes:536870912,maxLineBytes:4194304}},records,spoolFile,receiptFile,stored};
}
test('verified gzip source validates complete bytes before rows, authorizes exact record and retains original raw/date/overlay',async t=>{
 const f=await fixture(t),s=await openVerifiedHeaderSource(f.options);t.after(()=>s.close());assert.equal(s.report.rows,2);assert.equal(s.report.nativeBindingsVerified,false);assert.equal(s.report.noSql,true);
 const rows=[];for await(const row of s.rows())rows.push(row);assert.deepEqual(rows,f.records);await s.authorizeSource(rows[0]);
 const changed=structuredClone(rows[0]);changed.temporalEvidence.businessDate='2026-10-22';await assert.rejects(s.authorizeSource(changed),/RECORD_CHANGED/);
 const selected=[];for await(const row of s.rows('SALES_HEADER'))selected.push(row);assert.equal(selected.length,1);assert.deepEqual(selected[0],f.records[0]);
});
test('truncated gzip/incorrect raw digest/count and missing outside receipt pin fail before any consumer row',async t=>{
 for(const alter of [m=>{m.stored=m.stored.subarray(0,m.stored.length-6);m.receipt.preservedCompressedSource.bytes=m.stored.length;m.receipt.preservedCompressedSource.sha256=sha(m.stored);},m=>{m.receipt.preservedCompressedSource.rawSha256='b'.repeat(64);},m=>{m.receipt.actualRows=3;m.receipt.actualCounts.SALES_HEADER=2;}]){
  const f=await fixture(t,alter);await assert.rejects(openVerifiedHeaderSource(f.options));
 }
 const f=await fixture(t);await assert.rejects(openVerifiedHeaderSource({...f.options,trustedReceiptSha256:null}),/OUTSIDE_PIN/);
});
test('metadata replacement revokes reads and source authorization; close/abort retain the completed gzip without deleting it',async t=>{
 const f=await fixture(t),s=await openVerifiedHeaderSource(f.options),iterator=s.rows();assert.equal((await iterator.next()).value.source.sourceKey,'SYNTHETIC_HEADER_0');await iterator.return();await s.verify();await s.close();assert.deepEqual(await readFile(f.spoolFile),f.stored);assert.equal((await lstat(f.spoolFile)).size,f.stored.length);await assert.rejects(s.verify(),/CLOSED/);
 const changed=await fixture(t),reader=await openVerifiedHeaderSource(changed.options);t.after(()=>reader.close());await writeFile(changed.spoolFile,Buffer.from('changed'));await assert.rejects(reader.authorizeSource(changed.records[0]),/FILE_CHANGED/);await assert.rejects(reader.rows().next(),/FILE_CHANGED/);
 const aborted=await fixture(t),controller=new AbortController(),a=await openVerifiedHeaderSource({...aborted.options,signal:controller.signal});controller.abort();await a.close();await assert.rejects(a.rows().next(),/CLOSED/);assert.deepEqual(await readFile(aborted.spoolFile),aborted.stored);
});
