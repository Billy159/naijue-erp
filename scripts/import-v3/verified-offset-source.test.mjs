import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,realpath,mkdir,writeFile,readFile,rename,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openReviewedMaterializedSource} from './verified-offset-source.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex'),pin='a'.repeat(64);
const entities=['SKU','PAYMENT_METHOD','PAYMENT_ACCOUNT','PAYMENT_ACCOUNT_HALL','INVENTORY_BASELINE','SALES_LINE','SETTLEMENT','TRANSFER_LINE'];
const all=['BARCODE','CUSTOMER','HALL','INVENTORY_BASELINE','ISSUE','PAYMENT_ACCOUNT','PAYMENT_ACCOUNT_HALL','PAYMENT_METHOD','PRODUCT','SALES_HEADER','SALES_LINE','SETTLEMENT','SKU','STAFF','SUPPLIER','TRANSFER_HEADER','TRANSFER_LINE','WAREHOUSE'];
async function fixture(t,csvFiles={}){
 const dir=await mkdtemp(join(await realpath(tmpdir()),'synthetic-reviewed-offset-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const snapshots=join(dir,'snapshots'),indices=join(dir,'indices');await mkdir(snapshots);await mkdir(indices);
 const sourceFile=join(snapshots,'all-business-source-rows.jsonl'),manifestFile=join(dir,'manifest.json'),indexManifestFile=join(indices,'INDEX-CANDIDATE.json'),reviewFile=join(dir,'C-synthetic-review.json'),qbFile=join(dir,'QB-synthetic-result.json');
 const raw=[],lines=[],indexRows=new Map();let offset=0;
 for(let i=0;i<entities.length;i++){const entity=entities[i],sourceId=entity==='PAYMENT_ACCOUNT_HALL'?'':`SYNTHETIC-${entity}`;
  const row={entity,sourceId,file:'SYNTHETIC.xlsx',sheet:entity,row:i+2,sourceSha256:pin,data:{'来源编号':sourceId,'原始文本':'零 0001 / 中文原文'}};raw.push(row);
  const line=JSON.stringify(row)+(entity==='SKU'?'\r':''),b=Buffer.from(line);lines.push(b,Buffer.from('\n'));
  indexRows.set(entity,{entity,sourceKey:sourceId,sourceLocator:{file:row.file,sheet:row.sheet,row:row.row,sourceSha256:pin},identityKind:sourceId===''?'ORIGINAL_LOCATOR_ONLY':'ORIGINAL_SOURCE_KEY_AND_LOCATOR',offset,length:b.length,sha256:hash(b)});offset+=b.length+1;
 }
 const source=Buffer.concat(lines);await writeFile(sourceFile,source);
 const payloadFiles=[{file:'snapshots/all-business-source-rows.jsonl',bytes:source.length,sha256:hash(source)}];
 for(const [file,text]of Object.entries(csvFiles)){await writeFile(join(dir,file),text);payloadFiles.push({file,bytes:Buffer.byteLength(text),sha256:hash(text)});}
 const base={payloadFiles,sourceInputSha256:{'SYNTHETIC.xlsx':pin}},baseBytes=Buffer.from(JSON.stringify(base));await writeFile(manifestFile,baseBytes);
 const counts=Object.fromEntries(all.map(e=>[e,entities.includes(e)?1:0]));const artifacts=[];
 for(const entity of entities){const bytes=Buffer.from(JSON.stringify(indexRows.get(entity))+'\n'),path=join(indices,entity+'.jsonl');await writeFile(path,bytes);artifacts.push({entity,path,rows:1,bytes:bytes.length,sha256:hash(bytes)});}
 const index={version:'MATERIALIZED_SOURCE_OFFSET_INDEX_CANDIDATE_V1',status:'COMPLETE_PINNED_SOURCE_INDEX_NOT_NATIVE_AUTHORITY',source:{path:sourceFile,bytes:source.length,sha256:hash(source),rows:raw.length},manifest:{path:manifestFile,sha256:hash(baseBytes)},indexRows:raw.length,indexBytes:artifacts.reduce((s,f)=>s+f.bytes,0),expectedEntityCounts:counts,observedEntityCounts:{...counts},artifacts,offsetEncoding:'UTF8_BYTE_OFFSET_LENGTH_EXCLUDES_LF_RETAINS_CR_V1',scannedOriginalWorkbooks:false,scannedVerifiedHeaderGzip:false,nativeUUIDsAllocated:0,sql:false,importAuthorized:false};
 const qb=Buffer.from(JSON.stringify({result:'PASS',scope:'SYNTHETIC_PROTOCOL_ONLY'}));await writeFile(qbFile,qb);
 const binding={batchId:'00000000-0000-4000-8000-000000000001',fixedSourceNamespace:'synthetic:offset-source',cutoffAt:'2026-10-04T12:00:00+08:00',selectionSha256:pin};
 const review={version:'C_MATERIALIZED_SOURCE_OFFSET_INDEX_REVIEW_V1',decision:'ACCEPT_EXACT_SOURCE_OFFSET_BINDINGS',binding,indexManifest:{path:indexManifestFile,sha256:'',bytes:0},source:{...index.source},scope:'OFFSET_ROWS_ONLY',independentReview:{path:qbFile,sha256:hash(qb),result:'PASS'},realImportExecutionAuthorized:false};
 async function save(){const ib=Buffer.from(JSON.stringify(index));await writeFile(indexManifestFile,ib);review.indexManifest={path:indexManifestFile,sha256:hash(ib),bytes:ib.length};const rb=Buffer.from(JSON.stringify(review));await writeFile(reviewFile,rb);return {indexManifestFile,trustedIndexManifestSha256:hash(ib),reviewFile,trustedReviewSha256:hash(rb),binding,entities:['SKU','PAYMENT_ACCOUNT_HALL']};}
 async function saveIndexRow(entity){const f=index.artifacts.find(f=>f.entity===entity),b=Buffer.from(JSON.stringify(indexRows.get(entity))+'\n');const old=f.bytes;await writeFile(f.path,b);f.bytes=b.length;f.sha256=hash(b);index.indexBytes+=b.length-old;return save();}
 return {dir,sourceFile,source,raw,index,indexRows,review,qbFile,reviewFile,indexManifestFile,save,saveIndexRow,options:await save()};
}
test('offset finite CSV records use the reviewed base manifest and original CSV parser alongside selected raw rows',async t=>{
 const f=await fixture(t,{'canonical.csv':'source,original,extra\r\n0001,"中文,原文",retained\r\n0002,"two\nlines",tail\r\n'}),reader=await openReviewedMaterializedSource(f.options);t.after(()=>reader.close());
 const rows=[];for await(const row of reader.records('canonical.csv',['source','original'],false))rows.push(row);
 assert.deepEqual(rows,[{source:'0001',original:'中文,原文',extra:'retained'},{source:'0002',original:'two\nlines',extra:'tail'}]);
 assert.equal(reader.report.baseDirectory,f.dir);assert.equal(reader.report.baseManifestSha256,f.index.manifest.sha256);assert.deepEqual(reader.report.binding,f.options.binding);
 await assert.rejects(async()=>{for await(const _ of reader.records('canonical.csv',['wrong'])){}},/CSV_HEADER/);
 await assert.rejects(async()=>{for await(const _ of reader.records('../canonical.csv')){}},/CSV_PATH/);
 await assert.rejects(async()=>{for await(const _ of reader.records('unlisted.csv')){}},/CSV_MANIFEST/);
 let count=0;for await(const chunk of reader.chunks('SKU'))count+=chunk.length;assert.equal(count,1);
 await writeFile(join(f.dir,'canonical.csv'),'changed');await assert.rejects(reader.verify(),/FILE_CHANGED/);
});
test('offset source retains exact raw UTF8 CR and blank locator-only identity under independently pinned selected indices',async t=>{
 const f=await fixture(t),reader=await openReviewedMaterializedSource(f.options);t.after(()=>reader.close());
 const chunks=[];for await(const c of reader.chunks('SKU',1))chunks.push(c);assert.equal(chunks.length,1);const row=chunks[0][0];assert.deepEqual(row.raw,f.raw[0]);assert.equal(row.rawLine.endsWith('\r'),true);assert.equal(hash(Buffer.from(row.rawLine)),row.index.sha256);
 const hall=[];for await(const c of reader.chunks('PAYMENT_ACCOUNT_HALL'))hall.push(...c);assert.equal(hall[0].raw.sourceId,'');assert.equal(hall[0].index.sourceKey,'');assert.equal(hall[0].index.identityKind,'ORIGINAL_LOCATOR_ONLY');
 assert.deepEqual(reader.report.entities,['SKU','PAYMENT_ACCOUNT_HALL']);assert.equal(reader.report.rows,2);assert.equal(reader.report.noFullSnapshotScan,true);assert.equal(reader.report.nativeReferenceAuthority,false);await reader.verify();
 assert.deepEqual(await readFile(f.sourceFile),f.source);await assert.rejects(async()=>{for await(const _ of reader.chunks('SALES_LINE')){}},/ENTITY_NOT_OPEN/);
});
test('offset source denies absent outside authority, getter configuration, self execution grant and unreviewed source/index binding',async t=>{
 const f=await fixture(t);await assert.rejects(openReviewedMaterializedSource({...f.options,trustedReviewSha256:undefined}),/OUTSIDE_PIN_REQUIRED/);
 let calls=0;const getter={...f.options};Object.defineProperty(getter,'indexManifestFile',{enumerable:true,get(){calls++;return f.indexManifestFile;}});await assert.rejects(openReviewedMaterializedSource(getter),/OPTIONS/);assert.equal(calls,0);
 const nested={...f.options,entities:['SKU']};Object.defineProperty(nested.entities,0,{enumerable:true,get(){calls++;return 'SKU';}});await assert.rejects(openReviewedMaterializedSource(nested),/ENTITIES/);assert.equal(calls,0);
 f.review.realImportExecutionAuthorized=true;await assert.rejects(openReviewedMaterializedSource(await f.save()),/REVIEW/);f.review.realImportExecutionAuthorized=false;
 f.review.source.sha256='b'.repeat(64);await assert.rejects(openReviewedMaterializedSource(await f.save()),/REVIEW_SOURCE/);f.review.source={...f.index.source};
 f.review.independentReview.result='PENDING';await assert.rejects(openReviewedMaterializedSource(await f.save()),/REVIEW_BINDING/);
 f.review.independentReview.result='PASS';const qb=Buffer.from(JSON.stringify({result:'NEED_FIX'}));await writeFile(f.qbFile,qb);f.review.independentReview.sha256=hash(qb);await assert.rejects(openReviewedMaterializedSource(await f.save()),/QB_RESULT/);
});
test('offset source validates offset bounds, original line hash and exact locator while preserving first-error rejection',async t=>{
 const f=await fixture(t);f.indexRows.get('SKU').length=4194305;await assert.rejects(openReviewedMaterializedSource(await f.saveIndexRow('SKU')),/INDEX_ROW/);
 f.indexRows.get('SKU').length=Buffer.byteLength(JSON.stringify(f.raw[0])+'\r');f.indexRows.get('SKU').sha256='b'.repeat(64);const badHash=await openReviewedMaterializedSource(await f.saveIndexRow('SKU'));t.after(()=>badHash.close());await assert.rejects(async()=>{for await(const _ of badHash.chunks('SKU')){}},/RAW_CHANGED/);await badHash.close();
 f.indexRows.get('SKU').sha256=hash(Buffer.from(JSON.stringify(f.raw[0])+'\r'));f.indexRows.get('SKU').sourceLocator.row=999;const badLocator=await openReviewedMaterializedSource(await f.saveIndexRow('SKU'));t.after(()=>badLocator.close());await assert.rejects(async()=>{for await(const _ of badLocator.chunks('SKU')){}},/ORIGINAL_LOCATOR/);
});
test('offset source lifetime refuses replaced review/index/source, symlink paths, parallel iteration and closed readers',async t=>{
 const f=await fixture(t),reader=await openReviewedMaterializedSource(f.options);t.after(()=>reader.close());
 const iter=reader.chunks('SKU',1);assert.equal((await iter.next()).done,false);await assert.rejects(reader.chunks('PAYMENT_ACCOUNT_HALL').next(),/SERIAL_ONLY/);await iter.return();
 await writeFile(f.qbFile,'{}');await assert.rejects(reader.verify(),/FILE_CHANGED/);await reader.close();await assert.rejects(reader.verify(),/CLOSED/);
 const g=await fixture(t),replacement=g.reviewFile+'.original';await rename(g.reviewFile,replacement);await symlink(replacement,g.reviewFile);await assert.rejects(openReviewedMaterializedSource(g.options),/REGULAR_PATH/);
 const h=await fixture(t),openReader=await openReviewedMaterializedSource(h.options);t.after(()=>openReader.close());await writeFile(h.index.artifacts[0].path,'{}\n');await assert.rejects(openReader.chunks('SKU').next(),/FILE_CHANGED/);
 const k=await fixture(t),sourceReader=await openReviewedMaterializedSource(k.options);t.after(()=>sourceReader.close());const changed=Buffer.from(k.source);changed[10]=changed[10]===88?89:88;await writeFile(k.sourceFile,changed);await assert.rejects(sourceReader.chunks('SKU').next(),/FILE_CHANGED/);
});
