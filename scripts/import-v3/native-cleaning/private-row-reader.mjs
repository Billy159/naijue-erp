import {open,lstat} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {legacyReferenceTables} from './reference-snapshot-reader.mjs';
import {legacyInventoryEffectTables} from './inventory-effect-snapshot-reader.mjs';

const tables=new Set([...legacyReferenceTables,...legacyInventoryEffectTables].map(row=>row.table)
  .concat(['erp_prod_runtime.document','erp_prod_runtime.revision']));
const need=(yes,code)=>{if(!yes)throw new Error(code);};
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const unchanged=(a,b)=>['ino','dev','size','mode','uid','mtimeMs','ctimeMs'].every(k=>a[k]===b[k]);
const protectedFile=(s,uid)=>s.isFile()&&!s.isSymbolicLink()&&s.uid===uid&&(s.mode&0o777)===0o600;

/** Stream an exact table from the adopted private artifact. Callbacks may only
 * accumulate provisional private analysis/conversion output: completion is not
 * established until the final hash/count and file identity checks return. No DB
 * or target writer, no source identity allocation and no public row output. */
export async function consumePrivateSnapshotTable({directory,expectedManifestSha256,expectedUid,table,maxRowBytes,signal,onRow}) {
  need(typeof directory==='string'&&isAbsolute(directory)&&/^[a-f0-9]{64}$/.test(expectedManifestSha256)
    &&Number.isSafeInteger(expectedUid)&&expectedUid>=0&&tables.has(table)&&typeof onRow==='function'
    &&Number.isSafeInteger(maxRowBytes)&&maxRowBytes>0&&maxRowBytes<=33554432,'PRIVATE_ROW_EXACT_INPUT_REQUIRED');
  signal?.throwIfAborted();
  const root=await lstat(directory);need(root.isDirectory()&&!root.isSymbolicLink()&&root.uid===expectedUid&&(root.mode&0o777)===0o700,'PRIVATE_ROW_DIRECTORY_REFUSED');
  const manifestPath=join(directory,'SNAPSHOT.json'),prior=await lstat(manifestPath);
  need(protectedFile(prior,expectedUid)&&prior.size>0&&prior.size<=262144,'PRIVATE_ROW_MANIFEST_REFUSED');
  const mh=await open(manifestPath,constants.O_RDONLY|constants.O_NOFOLLOW);let manifestBytes;
  try {manifestBytes=await mh.readFile();need(unchanged(prior,await mh.stat()),'PRIVATE_ROW_MANIFEST_CHANGED');} finally {await mh.close();}
  need(digest(manifestBytes)===expectedManifestSha256,'PRIVATE_ROW_MANIFEST_PIN_REFUSED');
  let manifest;try {manifest=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(manifestBytes));}catch {throw new Error('PRIVATE_ROW_MANIFEST_JSON_REFUSED');}
  need(manifest.status==='COMPLETE_SCOPED_PRIVATE_SNAPSHOT'&&manifest.files?.length===93,'PRIVATE_ROW_COMPLETE_SOURCE_REQUIRED');
  const selected=manifest.files.filter(row=>row.table===table);need(selected.length===1,'PRIVATE_ROW_TABLE_REFUSED');
  const file=selected[0];need(file.filename===`${table}.ndjson`&&Number.isSafeInteger(file.bytes)&&file.bytes>=0
    &&/^(0|[1-9][0-9]*)$/.test(file.rows)&&/^[a-f0-9]{64}$/.test(file.sha256),'PRIVATE_ROW_FILE_METADATA_REFUSED');
  const path=join(directory,file.filename),before=await lstat(path);
  need(protectedFile(before,expectedUid)&&before.size===file.bytes,'PRIVATE_ROW_FILE_PROTECTION_REFUSED');
  const fh=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW),buffer=Buffer.allocUnsafe(65536),hash=createHash('sha256');
  let bytes=0,rows=0n,parts=[],pending=0;
  try {
    need(unchanged(before,await fh.stat()),'PRIVATE_ROW_FILE_CHANGED');
    for (;;) {
      signal?.throwIfAborted();
      const chunk=await fh.read(buffer,0,buffer.length,null);if(!chunk.bytesRead)break;
      bytes+=chunk.bytesRead;need(bytes<=file.bytes,'PRIVATE_ROW_FILE_CHANGED');
      const view=buffer.subarray(0,chunk.bytesRead);hash.update(view);let start=0;
      for (;;) {
        const end=view.indexOf(10,start),piece=view.subarray(start,end<0?view.length:end);
        pending+=piece.length;need(pending<=maxRowBytes,'PRIVATE_ROW_SIZE_LIMIT');
        if(piece.length)parts.push(Buffer.from(piece));
        if(end<0)break;
        const line=Buffer.concat(parts,pending);need(line.length>0,'PRIVATE_ROW_EMPTY_LINE_REFUSED');
        let row;try {row=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(line));}catch {throw new Error('PRIVATE_ROW_ENVELOPE_JSON_REFUSED');}
        need(row!==null&&typeof row==='object'&&!Array.isArray(row)&&typeof row.raw_json==='string','PRIVATE_ROW_ENVELOPE_REFUSED');
        if(table==='erp_prod_runtime.document'||table==='erp_prod_runtime.revision')
          need(typeof row.source_document_id==='string'&&typeof row.source_revision==='string','PRIVATE_ROW_DOCUMENT_IDENTITY_REFUSED');
        else need(typeof row.source_key_json==='string','PRIVATE_ROW_REFERENCE_IDENTITY_REFUSED');
        rows++;need(rows<=BigInt(file.rows),'PRIVATE_ROW_COUNT_MISMATCH');
        await onRow(row,{ordinal:rows.toString(),envelopeSha256:digest(line)});
        parts=[];pending=0;start=end+1;
      }
    }
    signal?.throwIfAborted();
    need(pending===0,'PRIVATE_ROW_EOF_REFUSED');
    need(bytes===file.bytes&&rows.toString()===file.rows,'PRIVATE_ROW_COUNT_MISMATCH');
    need(hash.digest('hex')===file.sha256,'PRIVATE_ROW_FILE_DIGEST_REFUSED');
    need(unchanged(before,await fh.stat())&&unchanged(before,await lstat(path))
      &&unchanged(prior,await lstat(manifestPath)),'PRIVATE_ROW_FILE_CHANGED');
  } finally {await fh.close();}
  return {status:'CONSUMED_SCOPED_PRIVATE_TABLE',table,rows:rows.toString(),bytes,sha256:file.sha256,
    sourceManifestSha256:expectedManifestSha256,databaseConnections:0,targetWrites:0};
}
