// Read-only source loader. Writes only its own private bounded spool; never imports a DB driver.
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, realpath, mkdtemp, chmod, open, rm, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { preflightV2 } from './run.mjs';
import { IMPORT_V2_TABLES } from '../../packages/application/src/import-v2-contract.ts';
import { stableImportId } from '../../packages/application/src/inventory-cutoff-import.ts';
import { requestHash } from '../../packages/application/src/request-hash.ts';
import { prepareV3HistoryChunk } from '../../packages/application/src/import-v3-history-staging.ts';
import { prepareProductEvidenceChunk } from '../../packages/application/src/product-evidence-staging.ts';
const fail=code=>{throw Error(code);};
const sha=value=>createHash('sha256').update(value).digest('hex');
const entities=['PRODUCT','TRANSFER_LINE'];
const uuid=value=>typeof value==='string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
const rowKey=(entity,id)=>JSON.stringify([entity,id]);
const MAX_SPOOL=1024*1024*1024;
const MAX_PACKED_CANONICAL=192*1024*1024, MAX_INDEX_TEXT=96*1024*1024;
async function* lines(chunks) {
  let pending='',count=0;
  for await(const chunk of chunks) {
    let start=0;
    for(;;) {
      const end=chunk.indexOf('\n',start), part=chunk.slice(start,end<0?undefined:end);
      if(pending.length+part.length>4*1024*1024)fail('READER_LINE_LIMIT'); pending+=part;
      if(end<0)break;
      if(!pending || ++count>1_000_000)fail('READER_LINE_COUNT');yield pending;pending='';start=end+1;
    }
  }
  if(pending){if(++count>1_000_000)fail('READER_LINE_COUNT');yield pending;}
}
/** trustedApprovalSha256 is an independent caller pin, never extracted from the supplied package.
 * resolveNativeBinding is a reviewed operator/native mapping resolver, NOT a source-key→UUID guess.
 * No ready database binding resolver is supplied. Omit it for source-only verification/iteration. */
export async function openAuthorizedV3Reader({base,v3Amendment,v3Approval,trustedApprovalSha256,spoolParent,batchId,fixedSourceNamespace,resolveNativeBinding}) {
  if(!/^[a-f0-9]{64}$/.test(trustedApprovalSha256??''))fail('READER_TRUSTED_APPROVAL_PIN_REQUIRED');
  if(!uuid(batchId) || typeof fixedSourceNamespace!=='string' || !/^[a-z][a-z0-9_.:-]{0,127}$/.test(fixedSourceNamespace))fail('READER_BATCH_NAMESPACE');
  const approvalStat=await lstat(resolve(v3Approval));
  if(!approvalStat.isFile() || approvalStat.isSymbolicLink() || approvalStat.size>4*1024*1024 || sha(await readFile(v3Approval))!==trustedApprovalSha256)fail('READER_APPROVAL_PIN_MISMATCH');
  const parent=await realpath(resolve(spoolParent)), baseRoot=await realpath(resolve(base)), amendmentRoot=await realpath(resolve(v3Amendment));
  const repoRoot=await realpath(new URL('../../',import.meta.url));
  if(parent.split('/').includes('.git') || [repoRoot,baseRoot,amendmentRoot].some(root=>parent===root || parent.startsWith(root+'/')))fail('READER_SPOOL_MUST_BE_OUTSIDE_INPUT_AND_REPO');
  if(!(await lstat(parent)).isDirectory())fail('READER_SPOOL_PARENT');
  const directory=await mkdtemp(join(parent,'v3-source-reader-'));await chmod(directory,0o700);
  const path=join(directory,'selected-source.jsonl'), output=await open(path,'wx',0o600);
  let outputClosed=false,closed=false,spoolBytes=0,spoolRows=0,rawRows=0,spoolSha256,report;
  const digest=createHash('sha256'), sourceHashes=new Map(), selections=new Map(), counts=Object.fromEntries(entities.map(e=>[e,0]));
  const cleanup=async()=>{closed=true;sourceHashes.clear();if(!outputClosed){await output.close();outputClosed=true;}await rm(directory,{recursive:true,force:true});};
  try {
    report=await preflightV2(base,{v3Amendment,v3Approval,onVerifiedV3:async({records,strings,manifest,verified,report:preflight})=>{
      if(verified.approvalSha256!==trustedApprovalSha256 || !preflight.referenceTargetsValid || !preflight.wireRequiredFieldsValid)fail('READER_UNSATISFIED_PREFLIGHT');
      const normalized=new Map(),aliases=new Map(),sourcePositions=new Set();let canonicalBytes=0,indexTextBytes=0;
      for(const entity of entities){
        const table=IMPORT_V2_TABLES.find(t=>t.entity===entity),selected=verified.selection.importFiles.find(f=>f.entity===entity);
        if(selected.source!=='BASE_V2' || selected.path!==table.file)fail('READER_ENTITY_SELECTION');
        selections.set(entity,{baseManifestSha256:verified.selection.baseManifestSha256,selectionSha256:verified.selectionSha256,approvalSha256:trustedApprovalSha256,entity,source:'BASE_V2',path:table.file,csvSha256:selected.sha256});
        // Canonical rows are packed strings, not a second object graph of all historical fields.
        for await(const row of records(table.file,table.columns.map(c=>c.name))){const key=rowKey(entity,row['来源编号']);if(normalized.has(key))fail('READER_DUPLICATE_CANONICAL');const packed=JSON.stringify(row);canonicalBytes+=Buffer.byteLength(packed)+Buffer.byteLength(key);if(canonicalBytes>MAX_PACKED_CANONICAL)fail('READER_CANONICAL_INDEX_LIMIT');normalized.set(key,packed);}
      }
      for await(const row of records('mappings/old-to-canonical-sku-15121.csv',['oldSourceSkuId','canonicalSourceSkuId'],false)){
        if(aliases.has(row.oldSourceSkuId))fail('READER_DUPLICATE_ALIAS');indexTextBytes+=Buffer.byteLength(row.oldSourceSkuId)+Buffer.byteLength(row.canonicalSourceSkuId);if(indexTextBytes>MAX_INDEX_TEXT)fail('READER_SOURCE_INDEX_LIMIT');aliases.set(row.oldSourceSkuId,row.canonicalSourceSkuId);
      }
      let buffered='';
      const flush=async()=>{if(!buffered)return;const bytes=Buffer.from(buffered);spoolBytes+=bytes.length;if(spoolBytes>MAX_SPOOL)fail('READER_SPOOL_LIMIT');digest.update(bytes);await output.writeFile(bytes);buffered='';};
      for await(const line of lines(strings('snapshots/all-business-source-rows.jsonl'))){
        rawRows++;const raw=JSON.parse(line);if(!entities.includes(raw?.entity))continue;
        if(typeof raw.sourceId!=='string' || !raw.sourceId || raw.sourceId.length>65536 || typeof raw.file!=='string' || raw.file.length>65536 || typeof raw.sheet!=='string' || !raw.sheet || raw.sheet.length>65536 || !Number.isSafeInteger(raw.row) || raw.row<1
          || typeof raw.sourceSha256!=='string' || !/^[a-f0-9]{64}$/.test(raw.sourceSha256) || !Object.hasOwn(manifest.sourceInputSha256??{},raw.file)
          || !raw.data || Array.isArray(raw.data) || typeof raw.data!=='object' || raw.data['来源编号']!==raw.sourceId || manifest.sourceInputSha256?.[raw.file]!==raw.sourceSha256)fail('READER_SOURCE_PROVENANCE');
        const key=rowKey(raw.entity,raw.sourceId), packed=normalized.get(key);if(packed===undefined)fail('READER_MISSING_OR_DUPLICATE_SOURCE');normalized.delete(key);
        const position=JSON.stringify([raw.sourceSha256,raw.sheet,raw.row]);indexTextBytes+=Buffer.byteLength(position)+Buffer.byteLength(key)+64;if(indexTextBytes>MAX_INDEX_TEXT)fail('READER_SOURCE_INDEX_LIMIT');if(sourcePositions.has(position))fail('READER_DUPLICATE_POSITION');sourcePositions.add(position);
        const canonical=JSON.parse(packed),fields={};
        for(const [field,value] of Object.entries(raw.data))fields[field]={origin:'ORIGINAL',reason:'EXACT_ORIGINAL_SNAPSHOT_CELL',raw:value};
        if(raw.entity==='TRANSFER_LINE'){
          if(typeof raw.data['SKU来源编号']!=='string' || aliases.get(raw.data['SKU来源编号'])!==canonical['SKU来源编号'])fail('READER_OLD_CANONICAL_ALIAS_MISMATCH');
          for(const col of IMPORT_V2_TABLES.find(t=>t.entity==='TRANSFER_LINE').columns)if(!Object.hasOwn(raw.data,col.name) || typeof raw.data[col.name]!=='string' || (col.name!=='SKU来源编号' && raw.data[col.name]!==canonical[col.name]))fail('READER_TRANSFER_RAW_FIELDS_CHANGED_OR_MISSING');
          if(raw.data['SKU来源编号']!==canonical['SKU来源编号'])fields['SKU来源编号']={origin:'MIGRATION_DERIVED',reason:'VERIFIED_OLD_TO_CANONICAL_ALIAS',raw:raw.data['SKU来源编号'],evidence_ref:'mappings/old-to-canonical-sku-15121.csv'};
        }
        const rowSha256=sha(Buffer.from(line,'utf8'));
        fields.__source_row_hash={origin:'ORIGINAL',reason:'SHA256_JSONL_UTF8_EXCLUDING_LF_RETAINING_CR_V1',raw:rowSha256};
        const source={id:stableImportId('source-row',fixedSourceNamespace,raw.entity,raw.sourceId),batchId,entityType:raw.entity,sourceKey:raw.sourceId,fileRef:raw.file,sheet:raw.sheet,rowNo:String(raw.row),sourceFileSha256:raw.sourceSha256,rowSha256,rawFields:raw.data,normalizedFields:canonical,fieldProvenance:{schema_version:1,fields}};
        sourceHashes.set(key,requestHash(source));counts[raw.entity]++;spoolRows++;
        buffered+=JSON.stringify({source,selection:selections.get(raw.entity)})+'\n';if(buffered.length>=65536)await flush();
      }
      if(normalized.size)fail('READER_SOURCE_COVERAGE');await flush();
    }});
    await output.sync();await output.close();outputClosed=true;spoolSha256=digest.digest('hex');
  }catch(error){await cleanup();throw error;}
  const assertOpen=()=>{if(closed)fail('READER_CLOSED');};
  const checkSource=source=>{if(sourceHashes.get(rowKey(source.entityType,source.sourceKey))!==requestHash(source))fail('READER_SOURCE_NOT_AUTHORIZED');};
  return {
    report:{kind:'V3_SOURCE_ROW_READER',importReady:false,noSql:true,preflight:report,rawRowsScanned:rawRows,selectedRows:spoolRows,counts,spoolBytes,spoolSha256,rowHashAlgorithm:'SHA256_JSONL_UTF8_EXCLUDING_LF_RETAINING_CR_V1',nativeBindingsVerified:false},
    async *rows(entity){
      assertOpen();if(entity!==undefined && !entities.includes(entity))fail('READER_ENTITY_NOT_SUPPORTED');
      const stat=await lstat(path);if(!stat.isFile() || stat.isSymbolicLink() || stat.size!==spoolBytes)fail('READER_SPOOL_CHANGED');
      const hash=createHash('sha256'),decoder=new TextDecoder('utf8',{fatal:true});let size=0;
      async function* text(){for await(const bytes of createReadStream(path)){size+=bytes.length;if(size>spoolBytes)fail('READER_SPOOL_CHANGED');hash.update(bytes);yield decoder.decode(bytes,{stream:true});}yield decoder.decode();}
      for await(const line of lines(text())){assertOpen();const record=JSON.parse(line);checkSource(record.source);if(requestHash(record.selection)!==requestHash(selections.get(record.source.entityType)))fail('READER_SELECTION_CHANGED');if(entity===undefined || record.source.entityType===entity)yield record;}
      if(size!==spoolBytes || hash.digest('hex')!==spoolSha256)fail('READER_SPOOL_CHANGED');
    },
    async authorize(inputChunk){
      assertOpen();const chunk=structuredClone(inputChunk);if(typeof resolveNativeBinding!=='function')fail('READER_NATIVE_BINDING_RESOLVER_REQUIRED');
      if(chunk.batchId!==batchId || chunk.fixedSourceNamespace!==fixedSourceNamespace || !selections.has(chunk.selection?.entity) || requestHash(chunk.selection)!==requestHash(selections.get(chunk.selection.entity)))fail('READER_SELECTION_NOT_AUTHORIZED');
      // Re-run shape validators; full original/normalized/provenance bytes are independently indexed above.
      const input={batchId,fixedSourceNamespace,selection:chunk.selection,rows:chunk.rows};
      if(chunk.selection.entity==='TRANSFER_LINE'){
        input.rows=chunk.rows.map(row=>({source:row.source,header:{sourceKey:row.source.normalizedFields['单据来源编号'],nativeId:row.line?.header_id},sku:{sourceKey:row.source.normalizedFields['SKU来源编号'],nativeId:row.line?.sku_id}}));
        if(requestHash(prepareV3HistoryChunk(input))!==requestHash(chunk))fail('READER_PREPARED_CHANGED');
      }else if(requestHash(prepareProductEvidenceChunk(input))!==requestHash(chunk))fail('READER_PREPARED_CHANGED');
      for(const row of chunk.rows){
        checkSource(row.source);const binding=await resolveNativeBinding(structuredClone({entity:row.source.entityType,sourceKey:row.source.sourceKey,rawFields:row.source.rawFields,normalizedFields:row.source.normalizedFields}));
        assertOpen();checkSource(row.source);
        if(row.source.entityType==='TRANSFER_LINE'){
          if(!binding || binding.header?.sourceKey!==row.source.normalizedFields['单据来源编号'] || binding.header?.nativeId!==row.line.header_id || binding.sku?.sourceKey!==row.source.normalizedFields['SKU来源编号'] || binding.sku?.nativeId!==row.line.sku_id)fail('READER_NATIVE_BINDING_MISMATCH');
        }else if(!binding || requestHash(binding.product)!==requestHash(row.product) || binding.blankPricePolicy!==row.blankPricePolicy)fail('READER_NATIVE_BINDING_MISMATCH');
      }
      assertOpen();
    },
    close:cleanup,
  };
}
