// Source-only header authorization. Fixed reviewed OOXML extractor + complete preflight;
// caller maps/aggregate reports are never trust roots. No DB driver, SQL, retry or publish.
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, realpath, mkdtemp, chmod, open, rm, readFile, unlink } from 'node:fs/promises';
import { resolve, join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { preflightV2 } from './run.mjs';
import { IMPORT_V2_TABLES } from '../../packages/application/src/import-v2-contract.ts';
import { v2MoneyApprovalSet } from '../../packages/application/src/import-v2.ts';
import { stableImportId } from '../../packages/application/src/inventory-cutoff-import.ts';
import { requestHash } from '../../packages/application/src/request-hash.ts';
import { prepareV3HistoryHeader } from '../../packages/application/src/import-v3-history-header.ts';
import { validatePreparedHistoryHeaderChunk } from '../../packages/application/src/import-v3-history-header-staging.ts';
const fail=code=>{throw Error(code);};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const hash=value=>typeof value==='string' && /^[a-f0-9]{64}$/.test(value);
const uuid=value=>typeof value==='string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
const text=value=>typeof value==='string' && value.length>0 && value.length<=65536 && !value.includes('\0');
const entities=['SALES_HEADER','TRANSFER_HEADER'], referenceEntities=['HALL','CUSTOMER','STAFF'], temporalFields=['业务日期','原创建时间','原修改时间','原审核时间'];
const rowKey=(entity,id)=>JSON.stringify([entity,id]);
const MAX_SPOOL=512*1024*1024, MAX_INDEX=256*1024*1024;
function captureOptions(original){
  if(!original||typeof original!=='object'||Array.isArray(original)||Object.getPrototypeOf(original)!==Object.prototype)fail('HEADER_READER_OPTIONS');
  const captured={};
  for(const key of Reflect.ownKeys(original)){
    const d=Object.getOwnPropertyDescriptor(original,key);
    if(typeof key!=='string'||!d||!('value'in d)||!d.enumerable)fail('HEADER_READER_OPTIONS');
    Object.defineProperty(captured,key,{value:d.value,enumerable:true,writable:true,configurable:true});
  }
  for(const [key,code]of [['maxEvidenceSpoolBytes','HEADER_READER_EVIDENCE_BOUND'],['maxSpoolBytes','HEADER_READER_SPOOL_BOUND']]){
    if(Object.hasOwn(captured,key)&&(!Number.isSafeInteger(captured[key])||captured[key]<=0||captured[key]>MAX_SPOOL))fail(code);
    captured[key]??=MAX_SPOOL;
  }
  return captured;
}
const creatorPath='provenance/creator-hall-approved-overlay.csv', moneyPath='provenance/approved-money-tail-overlay.csv';
const creatorColumns=['file','sheet','row','sourceId','documentNumber','personField','personId','matchedStaffId','currentEmployeeHall','uploadedWarehouseDerivedHall','candidateCreatorHall','provenance','reason','comparison','rawCreatorDisplay','rawPeopleSupportRow'];
const moneyColumns=['file','sheet','row','sourceId','entity','documentSourceId','field','rawValue','excessFromNearestCent','candidateExactCentValue','sourceFileSha256','decision','provenance','toleranceCurrencyUnits','corroboratingDocumentSourceId'];
async function* lines(chunks) {
  let pending='',count=0;
  for await(const chunk of chunks){let start=0;for(;;){const end=chunk.indexOf('\n',start),part=chunk.slice(start,end<0?undefined:end);if(pending.length+part.length>4*1024*1024)fail('HEADER_READER_LINE_LIMIT');pending+=part;if(end<0)break;if(!pending||++count>1_000_000)fail('HEADER_READER_LINE_COUNT');yield pending;pending='';start=end+1;}}
  if(pending){if(++count>1_000_000)fail('HEADER_READER_LINE_COUNT');yield pending;}
}
const sameFile=(a,b)=>a.dev===b.dev&&a.ino===b.ino&&a.mode===b.mode&&a.size===b.size&&a.mtimeMs===b.mtimeMs&&a.ctimeMs===b.ctimeMs;
async function* checkedFile(path,expectedBytes,expectedHash,identity){
  const stat=await lstat(path);if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==expectedBytes||(stat.mode&0o777)!==0o600||(identity&&!sameFile(stat,identity)))fail('HEADER_READER_FILE_CHANGED');
  const fd=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{
    if(!sameFile(await fd.stat(),stat))fail('HEADER_READER_FILE_CHANGED');
    const digest=createHash('sha256'),decoder=new TextDecoder('utf8',{fatal:true,ignoreBOM:true}),buffer=Buffer.alloc(65536);let count=0;
    for(;;){const{bytesRead}=await fd.read(buffer,0,buffer.length,count);if(!bytesRead)break;count+=bytesRead;if(count>expectedBytes)fail('HEADER_READER_FILE_CHANGED');digest.update(buffer.subarray(0,bytesRead));yield decoder.decode(buffer.subarray(0,bytesRead),{stream:true});}yield decoder.decode();
    if(count!==expectedBytes||digest.digest('hex')!==expectedHash||!sameFile(await fd.stat(),stat))fail('HEADER_READER_FILE_CHANGED');
  }finally{await fd.close();}
}
async function smallJson(path){const s=await lstat(path);if(!s.isFile()||s.isSymbolicLink()||s.size>4*1024*1024)fail('HEADER_READER_METADATA_FILE');return JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(await readFile(path)));}
async function regenerateCells(options,directory){
  // No shell, custom executable, custom extractor, caller evidence file or arbitrary callback.
  const script=fileURLToPath(new URL('./extract-history-cell-evidence.py',import.meta.url));
  const args=[script,'--source-root',options.sourceRoot,'--base',options.base,'--amendment',options.v3Amendment,'--approval-file',options.v3Approval,'--trusted-sha',options.trustedApprovalSha256,'--output-parent',directory,'--max-evidence-bytes',String(options.maxEvidenceSpoolBytes)];
  const summary=await new Promise((accept,reject)=>{
    const child=spawn('/usr/bin/python3',args,{stdio:['ignore','pipe','pipe'],env:{PATH:'/usr/bin:/bin',PYTHONIOENCODING:'utf-8',PYTHONDONTWRITEBYTECODE:'1'}});let out='',error='',settled=false;
    const done=(err,result)=>{if(settled)return;settled=true;clearTimeout(timer);err?reject(err):accept(result);};
    const timer=setTimeout(()=>{child.kill('SIGKILL');done(Error('HEADER_READER_CELL_EXTRACTION_TIMEOUT'));},15*60*1000);
    child.stdout.on('data',b=>{out+=b.toString('utf8');if(Buffer.byteLength(out)>65536){child.kill('SIGKILL');done(Error('HEADER_READER_CELL_EXTRACTOR_OUTPUT_LIMIT'));}});
    child.stderr.on('data',b=>{error+=b.toString('utf8');if(Buffer.byteLength(error)>65536){child.kill('SIGKILL');done(Error('HEADER_READER_CELL_EXTRACTOR_OUTPUT_LIMIT'));}});
    child.on('error',()=>done(Error('HEADER_READER_CELL_EXTRACTOR_UNAVAILABLE')));
    child.on('close',code=>{if(code!==0)return done(Error('HEADER_READER_CELL_EXTRACTION_FAILED'));try{done(null,JSON.parse(out));}catch{done(Error('HEADER_READER_CELL_EXTRACTOR_PROTOCOL'));}});
  });
  const path=resolve(summary.outputDirectory??'');
  if(dirname(path)!==directory||!basename(path).startsWith('history-cell-evidence-')||!(await lstat(path)).isDirectory()||(await lstat(path)).isSymbolicLink())fail('HEADER_READER_CELL_EXTRACTOR_PATH');
  const report=await smallJson(join(path,'report.json'));
  if(summary.importReady!==false||summary.noSql!==true||report.kind!=='HISTORY_XLSX_CELL_EVIDENCE_V1'||report.evidenceFile!=='evidence.jsonl'
    ||!hash(report.evidenceSha256)||report.evidenceSha256!==summary.evidenceSha256||!Number.isSafeInteger(report.evidenceBytes)||report.evidenceBytes<0||report.evidenceBytes>options.maxEvidenceSpoolBytes
    ||summary.evidenceBytes!==report.evidenceBytes||summary.maxEvidenceBytes!==options.maxEvidenceSpoolBytes||report.maxEvidenceBytes!==options.maxEvidenceSpoolBytes
    ||report.sourceOriginalsUnchangedAfterRead!==true||report.dateValuesConverted!==false||report.timezoneAssigned!==false||report.timestampPrecisionRounded!==false||report.dateOnlyMidnightInvented!==false)fail('HEADER_READER_CELL_EXTRACTOR_PROTOCOL');
  return {path:join(path,report.evidenceFile),report};
}
const approvalEntries=map=>{if(!(map instanceof Map))fail('HEADER_READER_APPROVAL_MAP');return [...map.entries()].sort(([a],[b])=>a.localeCompare(b));};
const contextOf=input=>({source:input.source,selection:input.selection,creatorHallOverlay:input.creatorHallOverlay,temporalEvidence:input.temporalEvidence});
/** This reader authenticates source facts, not native catalogue readiness. It always requires
 * original XLSX regeneration, independent external approval and money pins, complete preflight.
 * resolveNativeBinding is a reviewed explicit source->native resolver; omission is source-only. */
export async function openAuthorizedV3HeaderReader(options){
  options=captureOptions(options);
  const {trustedApprovalSha256,approvedMoneyOverlaySha256,batchId,fixedSourceNamespace,resolveNativeBinding,resolveNativeReferenceBinding}=options;
  if(options.includeNativeReferenceSources!==undefined&&typeof options.includeNativeReferenceSources!=='boolean')fail('HEADER_READER_REFERENCE_MODE');
  const includeReferences=options.includeNativeReferenceSources===true;
  const readEntities=includeReferences?[...entities,...referenceEntities]:entities;
  if(!hash(trustedApprovalSha256)||!hash(approvedMoneyOverlaySha256))fail('HEADER_READER_INDEPENDENT_PINS_REQUIRED');
  if(!uuid(batchId)||typeof fixedSourceNamespace!=='string'||!/^[a-z][a-z0-9_.:-]{0,127}$/.test(fixedSourceNamespace))fail('HEADER_READER_BATCH_NAMESPACE');
  const approvalStat=await lstat(resolve(options.v3Approval));
  if(!approvalStat.isFile()||approvalStat.isSymbolicLink()||approvalStat.size>4*1024*1024||sha(await readFile(options.v3Approval))!==trustedApprovalSha256)fail('HEADER_READER_APPROVAL_PIN_MISMATCH');
  const parent=await realpath(resolve(options.spoolParent)),roots=await Promise.all([options.base,options.v3Amendment,options.sourceRoot,fileURLToPath(new URL('../../',import.meta.url))].map(p=>realpath(resolve(p))));
  if(parent.split('/').includes('.git')||roots.some(r=>parent===r||parent.startsWith(r+'/'))||!(await lstat(parent)).isDirectory())fail('HEADER_READER_SPOOL_MUST_BE_OUTSIDE_INPUT_AND_REPO');
  const directory=await mkdtemp(join(parent,'v3-header-reader-'));await chmod(directory,0o700);
  const path=join(directory,'selected-headers.jsonl');let output,closed=false,spoolBytes=0,spoolRows=0,referenceRows=0,rawRows=0,spoolSha256,preflight,cellReport;
  const sourceHashes=new Map(),selections=new Map(),counts=Object.fromEntries(readEntities.map(e=>[e,0]));let approvedSet;
  const cleanup=async()=>{closed=true;sourceHashes.clear();if(output){const handle=output;output=undefined;await handle.close();}await rm(directory,{recursive:true,force:true});};
  try{
    const regenerated=await regenerateCells(options,directory);cellReport=regenerated.report;
    const evidenceIdentity=await lstat(regenerated.path);
    const cells=new Map();let indexBytes=0;
    for await(const line of lines(checkedFile(regenerated.path,cellReport.evidenceBytes,cellReport.evidenceSha256,evidenceIdentity))){
      const cell=JSON.parse(line),key=rowKey(cell.entityType,cell.sourceKey);
      if(cell.schemaVersion!=='HISTORY_XLSX_CELL_EVIDENCE_V1'||!entities.includes(cell.entityType)||cells.has(key))fail('HEADER_READER_CELL_IDENTITY');
      indexBytes+=Buffer.byteLength(line)+Buffer.byteLength(key);if(indexBytes>MAX_INDEX)fail('HEADER_READER_INDEX_LIMIT');cells.set(key,line);
    }
    if(cells.size!==cellReport.headerRows)fail('HEADER_READER_CELL_COVERAGE');
    // The complete hash and all source-cell records are now in the bounded Map,
    // and checkedFile awaited its fd close. Only this new derived file is released.
    const evidenceNow=await lstat(regenerated.path);
    if(dirname(dirname(regenerated.path))!==directory||basename(regenerated.path)!=='evidence.jsonl'||!evidenceNow.isFile()||evidenceNow.isSymbolicLink()||(evidenceNow.mode&0o777)!==0o600||!sameFile(evidenceNow,evidenceIdentity))fail('HEADER_READER_FILE_CHANGED');
    await unlink(regenerated.path);
    output=await open(path,'wx',0o600);const digest=createHash('sha256');
    preflight=await preflightV2(options.base,{v3Amendment:options.v3Amendment,v3Approval:options.v3Approval,approvedMoneyOverlaySha256,verifyCreatorHall:true,onVerifiedV3:async({records,strings,manifest,verified,report})=>{
      if(verified.approvalSha256!==trustedApprovalSha256||!report.referenceTargetsValid||!report.wireRequiredFieldsValid
        ||report.originalSourceMoneyVerification?.approvedCellsMatched!==32||report.creatorHallSourceVerification?.status!=='SOURCE_AND_RULES_VERIFIED')fail('HEADER_READER_UNSATISFIED_PREFLIGHT');
      const normalized=new Map(),overlays=new Map(),positions=new Set();
      for(const entity of readEntities){const table=IMPORT_V2_TABLES.find(t=>t.entity===entity),selected=verified.selection.importFiles.find(f=>f.entity===entity);
        if(selected?.source!=='BASE_V2'||selected.path!==table.file)fail('HEADER_READER_SELECTION');
        const selection={baseManifestSha256:verified.selection.baseManifestSha256,selectionSha256:verified.selectionSha256,approvalSha256:trustedApprovalSha256,entity,source:'BASE_V2',path:table.file,csvSha256:selected.sha256};
        if(entities.includes(entity)&&requestHash(selection)!==requestHash(cellReport.selection?.[entity]))fail('HEADER_READER_CELL_SELECTION');selections.set(entity,selection);
        for await(const row of records(table.file,table.columns.map(c=>c.name))){const key=rowKey(entity,row['来源编号']),packed=JSON.stringify(row);if(normalized.has(key))fail('HEADER_READER_DUPLICATE_CANONICAL');indexBytes+=Buffer.byteLength(packed)+Buffer.byteLength(key);if(indexBytes>MAX_INDEX)fail('HEADER_READER_INDEX_LIMIT');normalized.set(key,packed);}
      }
      for await(const overlay of records(creatorPath,creatorColumns)){if(overlays.has(overlay.sourceId))fail('HEADER_READER_DUPLICATE_OVERLAY');const packed=JSON.stringify(overlay);indexBytes+=Buffer.byteLength(packed);if(indexBytes>MAX_INDEX)fail('HEADER_READER_INDEX_LIMIT');overlays.set(overlay.sourceId,packed);}
      const approvals=[];
      for await(const row of records(moneyPath,moneyColumns))approvals.push({fileSha256:row.sourceFileSha256,sheet:row.sheet,row:row.row,sourceId:row.sourceId,field:row.field,rawValue:row.rawValue,exactCentValue:row.candidateExactCentValue});
      approvedSet=v2MoneyApprovalSet(approvals,approvals);
      let buffer='';const flush=async()=>{if(!buffer)return;const bytes=Buffer.from(buffer);spoolBytes+=bytes.length;if(spoolBytes>options.maxSpoolBytes)fail('HEADER_READER_SPOOL_LIMIT');digest.update(bytes);await output.writeFile(bytes);buffer='';};
      for await(const line of lines(strings('snapshots/all-business-source-rows.jsonl'))){
        rawRows++;const raw=JSON.parse(line);if(!readEntities.includes(raw?.entity))continue;
        if(!text(raw.sourceId)||!text(raw.file)||!text(raw.sheet)||!Number.isSafeInteger(raw.row)||raw.row<1||!hash(raw.sourceSha256)
          ||!Object.hasOwn(manifest.sourceInputSha256??{},raw.file)||manifest.sourceInputSha256[raw.file]!==raw.sourceSha256
          ||!raw.data||typeof raw.data!=='object'||Array.isArray(raw.data)||raw.data['来源编号']!==raw.sourceId)fail('HEADER_READER_SOURCE_PROVENANCE');
        const key=rowKey(raw.entity,raw.sourceId),packed=normalized.get(key),cellPacked=cells.get(key),overlayPacked=overlays.get(raw.sourceId);
        if(packed===undefined||(entities.includes(raw.entity)&&(cellPacked===undefined||overlayPacked===undefined)))fail('HEADER_READER_MISSING_OR_DUPLICATE_SOURCE');normalized.delete(key);
        if(referenceEntities.includes(raw.entity)){
          const canonical=JSON.parse(packed),table=IMPORT_V2_TABLES.find(t=>t.entity===raw.entity);
          if(table.columns.some(c=>!Object.hasOwn(raw.data,c.name)||typeof raw.data[c.name]!=='string'||raw.data[c.name]!==canonical[c.name]))fail('HEADER_READER_REFERENCE_RAW_CHANGED_OR_MISSING');
          const position=JSON.stringify([raw.sourceSha256,raw.sheet,raw.row]);if(positions.has(position))fail('HEADER_READER_DUPLICATE_POSITION');positions.add(position);
          const fields={};for(const [field,value]of Object.entries(raw.data))fields[field]={origin:'ORIGINAL',reason:'EXACT_ORIGINAL_SNAPSHOT_CELL',raw:value};
          const rowSha256=sha(Buffer.from(line,'utf8'));fields.__source_row_hash={origin:'ORIGINAL',reason:'SHA256_JSONL_UTF8_EXCLUDING_LF_RETAINING_CR_V1',raw:rowSha256};
          const source={id:stableImportId('source-row',fixedSourceNamespace,raw.entity,raw.sourceId),batchId,entityType:raw.entity,sourceKey:raw.sourceId,fileRef:raw.file,sheet:raw.sheet,rowNo:String(raw.row),sourceFileSha256:raw.sourceSha256,rowSha256,rawFields:raw.data,normalizedFields:canonical,fieldProvenance:{schema_version:1,fields}};
          const record={source,selection:selections.get(raw.entity)};sourceHashes.set(key,requestHash(record));counts[raw.entity]++;referenceRows++;buffer+=JSON.stringify(record)+'\n';if(buffer.length>=65536)await flush();continue;
        }
        cells.delete(key);overlays.delete(raw.sourceId);
        const canonical=JSON.parse(packed),cell=JSON.parse(cellPacked),o=JSON.parse(overlayPacked),selection=selections.get(raw.entity);
        if(requestHash(cell.selection)!==requestHash(selection)||cell.fileRef!==raw.file||cell.sourceFileSha256!==raw.sourceSha256||cell.sheet!==raw.sheet||cell.rowNo!==String(raw.row)||cell.sourceKey!==raw.sourceId||cell.documentNumber!==raw.data['原单号']
          ||temporalFields.some(f=>cell.cells?.[f]?.raw!==(raw.data[f]??'')||cell.cells[f].raw!==canonical[f]))fail('HEADER_READER_CELL_SOURCE_MISMATCH');
        const position=JSON.stringify([raw.sourceSha256,raw.sheet,raw.row]);if(positions.has(position))fail('HEADER_READER_DUPLICATE_POSITION');positions.add(position);
        const fields={};for(const [field,value]of Object.entries(raw.data))fields[field]={origin:'ORIGINAL',reason:'EXACT_ORIGINAL_SNAPSHOT_CELL',raw:value};
        const rowSha256=sha(Buffer.from(line,'utf8'));fields.__source_row_hash={origin:'ORIGINAL',reason:'SHA256_JSONL_UTF8_EXCLUDING_LF_RETAINING_CR_V1',raw:rowSha256};
        const source={id:stableImportId('source-row',fixedSourceNamespace,raw.entity,raw.sourceId),batchId,entityType:raw.entity,sourceKey:raw.sourceId,fileRef:raw.file,sheet:raw.sheet,rowNo:String(raw.row),sourceFileSha256:raw.sourceSha256,rowSha256,rawFields:raw.data,normalizedFields:canonical,
          fieldProvenance:{schema_version:1,fields,history_cell_encoding_evidence:cell}};
        const creatorHallOverlay={evidenceRef:creatorPath,file:o.file,sheet:o.sheet,row:o.row,sourceId:o.sourceId,documentNumber:o.documentNumber,personField:o.personField,personId:o.personId,uploadedWarehouseDerivedHall:o.uploadedWarehouseDerivedHall,candidateCreatorHall:o.candidateCreatorHall,provenance:o.provenance,reason:o.reason};
        const record={source,selection,creatorHallOverlay,temporalEvidence:cell.temporalEvidence};
        // Mapper verifies every raw/canonical difference (money uses authenticated 32-cell map),
        // enums and overlay identity when a reviewed native resolver supplies real bindings.
        sourceHashes.set(key,requestHash(record));counts[raw.entity]++;spoolRows++;buffer+=JSON.stringify(record)+'\n';if(buffer.length>=65536)await flush();
      }
      if(normalized.size||cells.size||overlays.size)fail('HEADER_READER_SOURCE_COVERAGE');await flush();
    }});
    if(spoolBytes>options.maxSpoolBytes)fail('HEADER_READER_SPOOL_LIMIT');
    await output.sync();await output.close();output=undefined;spoolSha256=digest.digest('hex');
  }catch(error){await cleanup();throw error;}
  const assertOpen=()=>{if(closed)fail('HEADER_READER_CLOSED');};
  const checkRecord=record=>{if(sourceHashes.get(rowKey(record.source?.entityType,record.source?.sourceKey))!==requestHash(record))fail('HEADER_READER_SOURCE_NOT_AUTHORIZED');};
  return {
    report:{kind:'V3_HEADER_SOURCE_ROW_READER',importReady:false,noSql:true,preflight,rawRowsScanned:rawRows,selectedRows:spoolRows,counts,spoolBytes,spoolSha256,rowHashAlgorithm:'SHA256_JSONL_UTF8_EXCLUDING_LF_RETAINING_CR_V1',originalCellEvidenceRegenerated:true,numericCellEvidence:cellReport.numericCellEvidence,nativeBindingsVerified:false,nativeReferenceSourcesIncluded:includeReferences,nativeReferenceRows:referenceRows},
    async *rows(entity){assertOpen();if(entity!==undefined&&!entities.includes(entity))fail('HEADER_READER_ENTITY_NOT_SUPPORTED');for await(const line of lines(checkedFile(path,spoolBytes,spoolSha256))){assertOpen();const record=JSON.parse(line);checkRecord(record);if(entities.includes(record.source.entityType)&&(entity===undefined||record.source.entityType===entity))yield {...record,moneyApprovals:structuredClone(approvedSet)};}},
    async *referenceRows(entity){assertOpen();if(!includeReferences)fail('HEADER_READER_REFERENCE_MODE_REQUIRED');if(entity!==undefined&&!referenceEntities.includes(entity))fail('HEADER_READER_ENTITY_NOT_SUPPORTED');for await(const line of lines(checkedFile(path,spoolBytes,spoolSha256))){assertOpen();const record=JSON.parse(line);checkRecord(record);if(referenceEntities.includes(record.source.entityType)&&(entity===undefined||record.source.entityType===entity))yield record;}},
    async authorizeReferences(inputChunk){
      assertOpen();if(!includeReferences||typeof resolveNativeReferenceBinding!=='function')fail('HEADER_READER_REFERENCE_RESOLVER_REQUIRED');
      const {validatePreparedHistoryHeaderNativeReferenceChunk,prepareV3HistoryHeaderNativeReferenceChunk}=await import('../../packages/application/src/import-v3-history-header-native-reference.ts');
      const chunk=structuredClone(inputChunk);validatePreparedHistoryHeaderNativeReferenceChunk(chunk);
      if(chunk.batchId!==batchId||chunk.fixedSourceNamespace!==fixedSourceNamespace)fail('HEADER_READER_BATCH_NOT_AUTHORIZED');
      for(const row of chunk.rows){const input=row.input,record={source:input.source,selection:input.selection};checkRecord(record);
        if(!referenceEntities.includes(input.source.entityType)||requestHash(input.selection)!==requestHash(selections.get(input.source.entityType)))fail('HEADER_READER_REFERENCE_SELECTION');
        const binding=await resolveNativeReferenceBinding(structuredClone({entity:input.source.entityType,sourceKey:input.source.sourceKey,rawFields:input.source.rawFields,normalizedFields:input.source.normalizedFields}));assertOpen();checkRecord(record);
        if(requestHash(binding)!==requestHash({nativeSnapshot:input.nativeSnapshot,bindings:input.bindings,enumMappings:input.enumMappings}))fail('HEADER_READER_REFERENCE_NATIVE_BINDING_MISMATCH');
        const expected=prepareV3HistoryHeaderNativeReferenceChunk([{batchId,fixedSourceNamespace,...record,...binding}]).rows[0].prepared;
        if(requestHash(expected)!==requestHash(row.prepared))fail('HEADER_READER_REFERENCE_PREPARED_NOT_AUTHORIZED');
      }assertOpen();
    },
    async authorize(inputChunk){
      assertOpen();if(typeof resolveNativeBinding!=='function')fail('HEADER_READER_NATIVE_BINDING_RESOLVER_REQUIRED');const chunk=structuredClone(inputChunk);validatePreparedHistoryHeaderChunk(chunk);
      if(chunk.batchId!==batchId||chunk.fixedSourceNamespace!==fixedSourceNamespace)fail('HEADER_READER_BATCH_NOT_AUTHORIZED');
      for(const row of chunk.rows){const input=row.input,record=contextOf(input);checkRecord(record);
        if(requestHash(input.selection)!==requestHash(selections.get(input.source.entityType))||requestHash(approvalEntries(input.moneyApprovals))!==requestHash(approvalEntries(approvedSet)))fail('HEADER_READER_CONTEXT_NOT_AUTHORIZED');
        const bindings=await resolveNativeBinding(structuredClone({entity:input.source.entityType,sourceKey:input.source.sourceKey,rawFields:input.source.rawFields,normalizedFields:input.source.normalizedFields}));assertOpen();checkRecord(record);
        if(requestHash(bindings)!==requestHash(input.bindings))fail('HEADER_READER_NATIVE_BINDING_MISMATCH');
        const expected=prepareV3HistoryHeader({...record,batchId,fixedSourceNamespace,bindings,moneyApprovals:approvedSet});
        if(requestHash(expected)!==requestHash(row.prepared))fail('HEADER_READER_PREPARED_NOT_AUTHORIZED');
      }
      assertOpen();
    },close:cleanup,
  };
}
