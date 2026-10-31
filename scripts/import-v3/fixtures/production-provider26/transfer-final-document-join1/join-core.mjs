/** Finite projection transform and the existing real per-document folds.
 * Injected readers/codecs confer no authority; bootstrap supplies pinned ones. */
import {createHash} from 'node:crypto';
const must=(v,c)=>{if(!v)throw Object.assign(Error(c),{code:c});};
const sha=b=>createHash('sha256').update(b).digest('hex');
const uuid=s=>typeof s==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(s);
const uuidBytes=s=>{must(uuid(s),'JOIN_UUID_FORMAT');return Buffer.from(s.replaceAll('-',''),'hex');};
const compare=(a,b)=>Buffer.compare(Buffer.from(a),Buffer.from(b));
const order=r=>r.relation+'\0'+r.key;
export const RECORD_BYTES=256;
export class PackedLineIndex {
 constructor(expectedRows,documents){
  must(Number.isSafeInteger(expectedRows)&&expectedRows>0&&expectedRows<=261641&&Array.isArray(documents)&&documents.length>0&&documents.length<=14279,'JOIN_INDEX_LIMIT');
  this.expectedRows=expectedRows;this.documents=documents;this.rows=0;this.sealed=false;this.buffer=Buffer.alloc(expectedRows*RECORD_BYTES);this.counts=new Uint32Array(documents.length);this.sourceOrder=new Uint32Array(expectedRows);this.typedOrder=new Uint32Array(expectedRows);this.byKey=new Map();const sources=new Set();
  for(let n=0;n<documents.length;n++){const d=documents[n];must(d.kind==='TRANSFER'&&Object.keys(d).length===4&&typeof d.sourceKey==='string'&&d.sourceKey.length>0&&uuid(d.headerId)&&uuid(d.headerSourceRowId)&&!this.byKey.has(d.sourceKey)&&!sources.has(d.headerSourceRowId)&&(n===0||compare(documents[n-1].headerId,d.headerId)<0),'JOIN_DOCUMENT_ALLOCATIONS');this.byKey.set(d.sourceKey,n);sources.add(d.headerSourceRowId);}
 }
 add(source,typed,sourceRef,typedRef){
  must(!this.sealed&&this.rows<this.expectedRows,'JOIN_INDEX_EXCESS');const s=source.projection,t=typed.projection,n=this.byKey.get(s.normalized_fields?.单据来源编号),d=this.documents[n];
  must(d&&source.relation==='import_source_row'&&typed.relation==='history_transfer_line'&&Object.keys(s).length===12&&Object.keys(t).length===13&&s.entity_type==='TRANSFER_LINE'&&t.batch_id===s.batch_id&&s.raw_fields?.来源编号===s.source_key&&s.normalized_fields?.来源编号===s.source_key&&s.raw_fields?.单据来源编号===d.sourceKey&&s.normalized_fields.单据来源编号===d.sourceKey&&t.header_id===d.headerId&&t.source_row_id===s.id&&source.key===s.id&&typed.key===t.id&&uuid(s.id)&&uuid(t.id),'JOIN_LINE_MEMBERSHIP');
  const sourceKey=Buffer.from(source.key),typedKey=Buffer.from(typed.key);must(sourceKey.length<=64&&typedKey.length<=64,'JOIN_PACKED_KEY_LIMIT');
  for(const r of [sourceRef,typedRef])must(Number.isSafeInteger(r.offset)&&r.offset>=0&&Number.isSafeInteger(r.bytes)&&r.bytes>0&&r.bytes<=4194304&&/^[a-f0-9]{64}$/.test(r.sha256),'JOIN_PACKED_REFERENCE');
  const i=this.rows++,at=i*RECORD_BYTES,b=this.buffer;b.writeUInt32LE(n,at);b.writeBigUInt64LE(BigInt(sourceRef.offset),at+4);b.writeUInt32LE(sourceRef.bytes,at+12);b.writeBigUInt64LE(BigInt(typedRef.offset),at+16);b.writeUInt32LE(typedRef.bytes,at+24);uuidBytes(s.id).copy(b,at+28);uuidBytes(t.id).copy(b,at+44);b[at+60]=sourceKey.length;b[at+61]=typedKey.length;sourceKey.copy(b,at+64);typedKey.copy(b,at+128);Buffer.from(sourceRef.sha256,'hex').copy(b,at+192);Buffer.from(typedRef.sha256,'hex').copy(b,at+224);this.counts[n]++;this.sourceOrder[i]=i;this.typedOrder[i]=i;
 }
 keyBytes(i,side){const at=i*RECORD_BYTES;return this.buffer.subarray(at+(side==='source'?64:128),at+(side==='source'?64:128)+this.buffer[at+(side==='source'?60:61)]);}
 ordinal(i){return this.buffer.readUInt32LE(i*RECORD_BYTES);}
 entry(i,side){const at=i*RECORD_BYTES,source=side==='source';return {ordinal:this.ordinal(i),offset:Number(this.buffer.readBigUInt64LE(at+(source?4:16))),bytes:this.buffer.readUInt32LE(at+(source?12:24)),sha256:this.buffer.subarray(at+(source?192:224),at+(source?224:256)).toString('hex'),key:this.keyBytes(i,side).toString('utf8'),sourceId:this.buffer.subarray(at+28,at+44),lineId:this.buffer.subarray(at+44,at+60)};}
 seal(){
  must(!this.sealed&&this.rows===this.expectedRows&&this.counts.every(n=>n>0),'JOIN_INDEX_INCOMPLETE_OR_EMPTY_HEADER');
  for(const [side,permutation]of [['source',this.sourceOrder],['typed',this.typedOrder]]){
   permutation.sort((a,b)=>Buffer.compare(this.keyBytes(a,side),this.keyBytes(b,side)));for(let n=1;n<permutation.length;n++)must(Buffer.compare(this.keyBytes(permutation[n-1],side),this.keyBytes(permutation[n],side))<0,'JOIN_GLOBAL_DUPLICATE_PROJECTION_ID');
   permutation.sort((a,b)=>this.ordinal(a)-this.ordinal(b)||Buffer.compare(this.keyBytes(a,side),this.keyBytes(b,side)));
  }
  this.starts=new Uint32Array(this.documents.length+1);for(let n=0;n<this.documents.length;n++)this.starts[n+1]=this.starts[n]+this.counts[n];must(this.starts.at(-1)===this.rows,'JOIN_INDEX_TOTAL');this.sealed=true;
 }
 *range(ordinal,side){must(this.sealed,'JOIN_INDEX_NOT_SEALED');const p=side==='source'?this.sourceOrder:this.typedOrder;for(let n=this.starts[ordinal];n<this.starts[ordinal+1];n++){const e=this.entry(p[n],side);must(e.ordinal===ordinal,'JOIN_INDEX_WRONG_HEADER');yield e;}}
 async write(writer,active){
  must(this.sealed,'JOIN_INDEX_NOT_SEALED');const header=Buffer.alloc(64);header.write('TL26JOIN1',0,'ascii');header.writeUInt32LE(1,12);header.writeUInt32LE(this.rows,16);header.writeUInt32LE(this.documents.length,20);header.writeUInt32LE(RECORD_BYTES,24);header.writeUInt32LE(this.buffer.length,28);header.writeUInt32LE(this.sourceOrder.byteLength,32);header.writeUInt32LE(this.typedOrder.byteLength,36);header.writeUInt32LE(this.documents.length*36,40);header.writeUInt32LE(64,44);await writer.append(header);
  for(let n=0;n<this.buffer.length;n+=65536){active();await writer.append(this.buffer.subarray(n,n+65536));}
  for(const p of [this.sourceOrder,this.typedOrder]){for(let n=0;n<p.length;n+=16384){active();const part=Buffer.alloc(Math.min(16384,p.length-n)*4);for(let j=0;j<part.length/4;j++)part.writeUInt32LE(p[n+j],j*4);await writer.append(part);}}
  for(let n=0;n<this.documents.length;n++){active();const d=this.documents[n],b=Buffer.alloc(36);uuidBytes(d.headerId).copy(b,0);uuidBytes(d.headerSourceRowId).copy(b,16);b.writeUInt32LE(this.counts[n],32);await writer.append(b);}return writer.finish();
 }
 clear(){this.buffer?.fill(0);this.buffer=null;this.sourceOrder=null;this.typedOrder=null;this.byKey.clear();this.counts=null;this.starts=null;}
}
export async function preserveLineProjections({reader,documents,writers,codecs,binding,expectedRows,expectedFingerprint,expectedCountsHash,active,state}){
 const index=new PackedLineIndex(expectedRows,documents),fold=createHash('sha256');let rows=0,chunks=0;
 try{
  for await(const chunk of reader.chunks()){
   active();must(chunk.rows.length>0&&chunk.rows.length<=200,'JOIN_CHUNK_LIMIT');await reader.authorize(chunk);active();chunks++;
   for(const row of chunk.rows){active();must(row.source.batchId===binding.batchId&&/^[a-f0-9]{64}$/.test(row.fingerprint),'JOIN_PREPARED_SCOPE');const source=codecs.project('import_source_row',codecs.evidence(row,chunk.selection)),typed=codecs.project('history_transfer_line',row.line),refs=[];
    for(const [writer,value]of [[writers[0],source],[writers[1],typed]]){const b=Buffer.from(JSON.stringify(value)+'\n');must(b.length<=4194304,'JOIN_PROJECTION_ROW_LIMIT');const r={offset:writer.size,bytes:b.length,sha256:sha(b)};await writer.append(b);active();refs.push(r);}index.add(source,typed,...refs);fold.update(row.fingerprint+'\n');rows++;state.lineRowsPreserved=rows;
   }
  }
  must(rows===expectedRows&&fold.digest('hex')===expectedFingerprint,'JOIN_CAPTURE_COUNTS_OR_FINGERPRINT');index.seal();const counts=documents.map((d,n)=>({sourceKey:d.sourceKey,headerId:d.headerId,lineCount:index.counts[n]})).sort((a,b)=>compare(a.sourceKey,b.sourceKey));must(codecs.requestHash(counts)===expectedCountsHash,'JOIN_PER_HEADER_COUNT_HASH');await reader.verify();active();state.lineChunks=chunks;state.lineRows=rows;return index;
 }catch(e){index.clear();throw e;}
}
async function* mergeHeader(header,lines){let inserted=false;for await(const line of lines){if(!inserted){const n=compare(order(header),order(line));must(n!==0,'JOIN_HEADER_LINE_KEY_COLLISION');if(n<0){inserted=true;yield header;}}yield line;}if(!inserted)yield header;}
export async function buildTransferDocumentDigests({headers,index,writers,documentWriter,codecs,active,state,binding,checkpoint=async()=>{}}){
 must(index.sealed&&headers.documents.length===index.documents.length,'JOIN_DIGEST_SCOPE');let docCount=0,sourceLines=0,typedLines=0;
 for(let ordinal=0;ordinal<index.documents.length;ordinal++){
  active();const d=index.documents[ordinal],h=await headers.readHeader(ordinal,codecs.project);active();must(h.sourceRow.projection.batch_id===binding.batchId&&h.typedRow.projection.batch_id===binding.batchId,'JOIN_HEADER_BATCH');const sourceLineNumbers={count:0},typedLineNumbers={count:0,seen:new Set()};
  async function* lineRows(side){
   const writer=side==='source'?writers[0]:writers[1],relation=side==='source'?'import_source_row':'history_transfer_line';
   for(const ref of index.range(ordinal,side)){
    active();const original=await writer.readRow(ref),r=codecs.project(relation,original.projection),p=r.projection;active();must(original.relation===relation&&original.key===r.key&&r.key===ref.key,'JOIN_SPOOL_KEY');
    if(side==='source'){must(p.batch_id===binding.batchId&&p.entity_type==='TRANSFER_LINE'&&uuidBytes(p.id).equals(ref.sourceId)&&p.raw_fields.单据来源编号===d.sourceKey&&p.normalized_fields.单据来源编号===d.sourceKey,'JOIN_DIGEST_SOURCE_MEMBERSHIP');sourceLineNumbers.count++;sourceLines++;}
    else{must(uuidBytes(p.id).equals(ref.lineId)&&uuidBytes(p.source_row_id).equals(ref.sourceId)&&p.header_id===d.headerId&&!typedLineNumbers.seen.has(p.line_no),'JOIN_DIGEST_TYPED_MEMBERSHIP_OR_LINE_NUMBER');typedLineNumbers.seen.add(p.line_no);typedLineNumbers.count++;typedLines++;}if((side==='source'?sourceLines:typedLines)%200===0){await checkpoint();active();}yield r;
   }
  }
  const scope=binding.batchId+':TRANSFER:'+d.headerId,source=await codecs.hashRows('document-source:'+scope,mergeHeader(h.sourceRow,lineRows('source'))),typed=await codecs.hashRows('document-typed:'+scope,mergeHeader(h.typedRow,lineRows('typed')));active();const n=index.counts[ordinal];must(n>0&&source.rows===n+1&&typed.rows===n+1&&sourceLineNumbers.count===n&&typedLineNumbers.count===n,'JOIN_DOCUMENT_COUNTS');
  const document={...d,headerSourceSha256:codecs.rowHash(h.sourceRow),lineCount:n,settlementCount:0,sourceDocumentSha256:source.sha256,typedDocumentSha256:typed.sha256};must(Object.keys(document).length===9,'JOIN_DOCUMENT_SHAPE');await documentWriter.append(Buffer.from(JSON.stringify(document)+'\n'));docCount++;state.documentsHashed=docCount;state.sourceLineDigestRows=sourceLines;state.typedLineDigestRows=typedLines;typedLineNumbers.seen.clear();if(docCount%200===0){await checkpoint();active();}
 }
 must(docCount===index.documents.length&&sourceLines===index.expectedRows&&typedLines===index.expectedRows,'JOIN_DOCUMENT_TOTALS');await headers.verify();active();return {documents:docCount,sourceLineDigestRows:sourceLines,typedLineDigestRows:typedLines};
}
