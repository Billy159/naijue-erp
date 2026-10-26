// Phase A source-only SALES_LINE authorization; no DB driver, SQL, retry or publish.
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {lstat,realpath,mkdtemp,chmod,open,rm,readFile} from 'node:fs/promises';
import {resolve,join,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {preflightV2} from './run.mjs';
import {openReviewedMaterializedSource} from '../import-v3/verified-offset-source.mjs';
import {IMPORT_V2_TABLES} from '../../packages/application/src/import-v2-contract.ts';
import {v2MoneyApprovalSet,v2ApprovedCents,v2Cents} from '../../packages/application/src/import-v2.ts';
import {stableImportId} from '../../packages/application/src/inventory-cutoff-import.ts';
import {requestHash} from '../../packages/application/src/request-hash.ts';
import {prepareHistorySettlementChunk,validatePreparedHistorySettlementChunk,historySettlementRequestHash,HISTORY_SETTLEMENT_VERSION} from '../../packages/application/src/import-v3-history-settlement.ts';
import {historyClosureProjectionRow26} from '../../packages/application/src/history-typed-closure.ts';
import {prepareHistorySalesDetailChunk,validatePreparedHistorySalesDetailChunk,historySalesDetailRequestHash,HISTORY_SALES_DETAIL_VERSION} from '../../packages/application/src/import-v3-history-sales-detail.ts';
const fail=code=>{throw Error(code);},sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const text=v=>typeof v==='string'&&v.length>0&&v.length<=65536&&!v.includes('\0');
const ALIAS='mappings/old-to-canonical-sku-15121.csv',MONEY='provenance/approved-money-tail-overlay.csv';
const MONEY_COLUMNS=['file','sheet','row','sourceId','entity','documentSourceId','field','rawValue','excessFromNearestCent','candidateExactCentValue','sourceFileSha256','decision','provenance','toleranceCurrencyUnits','corroboratingDocumentSourceId'];
/** Existing reader callback using C-adopted same-batch source identities and
 * approved five-field SKU alias bindings. No database/existence assertion. */
export function resolveSalesDetailSourceBinding(query,headers,skus){
 const oldKey=query.rawFields['SKU来源编号'],header=headers.get(query.normalizedFields['单据来源编号']),sku=skus.get(oldKey);
 if(!header||!sku||header.sourceKey!==query.normalizedFields['单据来源编号']||sku.oldSourceSkuKey!==oldKey||sku.canonicalSourceKey!==query.normalizedFields['SKU来源编号'])fail('SALES_DETAIL_READER_NATIVE_BINDING_MISMATCH');
 return structuredClone({header,sku});
}
const MAX_SPOOL=512*1024*1024,MAX_INDEX=256*1024*1024;
const approvals=map=>{if(!(map instanceof Map))fail('SALES_DETAIL_READER_APPROVAL_MAP');return [...map.entries()].sort(([a],[b])=>a<b?-1:a>b?1:0);};
async function* lines(chunks){let pending='',rows=0;for await(const chunk of chunks){let at=0;for(;;){const i=chunk.indexOf('\n',at),part=chunk.slice(at,i<0?undefined:i);if(pending.length+part.length>4*1024*1024)fail('SALES_DETAIL_READER_LINE_LIMIT');pending+=part;if(i<0)break;if(!pending||++rows>1_000_000)fail('SALES_DETAIL_READER_LINE_COUNT');yield pending;pending='';at=i+1;}}if(pending){if(++rows>1_000_000)fail('SALES_DETAIL_READER_LINE_COUNT');yield pending;}}
async function* checkedFile(path,size,expectedHash){const stat=await lstat(path);if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==size)fail('SALES_DETAIL_READER_SPOOL_CHANGED');
  const d=createHash('sha256'),decoder=new TextDecoder('utf8',{fatal:true,ignoreBOM:true});let count=0;
  for await(const bytes of createReadStream(path)){count+=bytes.length;if(count>size)fail('SALES_DETAIL_READER_SPOOL_CHANGED');d.update(bytes);yield decoder.decode(bytes,{stream:true});}yield decoder.decode();
  if(count!==size||d.digest('hex')!==expectedHash)fail('SALES_DETAIL_READER_SPOOL_CHANGED');}
/** External approval and whole approved-money digest are independent authority pins.
 * Resolver must independently prove actual header/source and old-alias/native IDs;
 * source IDs/names are never converted to UUIDs or used as binding heuristics. */
export async function openAuthorizedSalesDetailReader(options){
  if(Object.hasOwn(options??{},'capturedSource'))return openCapturedSalesSettlementSource(options,'SALES_LINE');
  const {trustedApprovalSha256,approvedMoneyOverlaySha256,batchId,fixedSourceNamespace,resolveNativeBinding}=options;
  if(!hash(trustedApprovalSha256)||!hash(approvedMoneyOverlaySha256))fail('SALES_DETAIL_READER_PINS_REQUIRED');
  if(!uuid(batchId)||typeof fixedSourceNamespace!=='string'||!/^[a-z][a-z0-9_.:-]{0,127}$/.test(fixedSourceNamespace))fail('SALES_DETAIL_READER_BATCH');
  const approval=resolve(options.v3Approval),stat=await lstat(approval);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>4*1024*1024)fail('SALES_DETAIL_READER_APPROVAL_PIN');
  const approvalBytes=await readFile(approval);if(sha(approvalBytes)!==trustedApprovalSha256)fail('SALES_DETAIL_READER_APPROVAL_PIN');
  const parent=await realpath(resolve(options.spoolParent)),base=await realpath(resolve(options.base)),amendment=await realpath(resolve(options.v3Amendment)),repo=await realpath(fileURLToPath(new URL('../../',import.meta.url))),approvalReal=await realpath(approval);
  if(approvalReal.startsWith(base+'/')||approvalReal.startsWith(amendment+'/'))fail('SALES_DETAIL_READER_EXTERNAL_APPROVAL_REQUIRED');
  if(parent.split('/').includes('.git')||[base,amendment,repo].some(r=>parent===r||parent.startsWith(r+'/'))||!(await lstat(parent)).isDirectory())fail('SALES_DETAIL_READER_SPOOL_OUTSIDE_INPUT_REPO');
  const directory=await mkdtemp(join(parent,'sales-detail-reader-'));await chmod(directory,0o700);
  const path=join(directory,'sales-lines.jsonl');let output,materialized,materializedReport,closed=false,spoolBytes=0,spoolRows=0,spoolSha256,preflight=null,selection,approvedSet,rawRows=0;
  const sourceHashes=new Map();
  const close=async()=>{closed=true;sourceHashes.clear();if(materialized){await materialized.close();materialized=undefined;}if(output){const handle=output;output=undefined;await handle.close();}await rm(directory,{recursive:true,force:true});};
  try{output=await open(path,'wx',0o600);const digest=createHash('sha256');
    const collect=async({records,rawLines,manifest,verified})=>{
      const table=IMPORT_V2_TABLES.find(t=>t.entity==='SALES_LINE'),selected=verified.selection.importFiles.find(f=>f.entity==='SALES_LINE'),aliasManifest=manifest.payloadFiles.find(f=>f.file===ALIAS);
      if(selected?.source!=='BASE_V2'||selected.path!==table.file||!hash(aliasManifest?.sha256))fail('SALES_DETAIL_READER_SELECTION');
      selection={entity:'SALES_LINE',source:'BASE_V2',path:table.file,baseManifestSha256:verified.selection.baseManifestSha256,selectionSha256:verified.selectionSha256,
        approvalSha256:trustedApprovalSha256,csvSha256:selected.sha256,aliasCsvSha256:aliasManifest.sha256,moneyApprovalSha256:approvedMoneyOverlaySha256};
      const normalized=new Map(),aliases=new Map(),positions=new Set();let indexBytes=0;
      const index=(s)=>{indexBytes+=Buffer.byteLength(s);if(indexBytes>MAX_INDEX)fail('SALES_DETAIL_READER_INDEX_LIMIT');};
      for await(const row of records(table.file,table.columns.map(c=>c.name))){const key=row['来源编号'],packed=JSON.stringify(row);if(normalized.has(key))fail('SALES_DETAIL_READER_DUPLICATE_NORMALIZED');index(key+packed);normalized.set(key,packed);}
      if(normalized.size!==selected.count)fail('SALES_DETAIL_READER_SELECTED_COUNT');
      for await(const row of records(ALIAS,['oldSourceSkuId','canonicalSourceSkuId'],false)){if(aliases.has(row.oldSourceSkuId))fail('SALES_DETAIL_READER_DUPLICATE_ALIAS');index(row.oldSourceSkuId+row.canonicalSourceSkuId);aliases.set(row.oldSourceSkuId,row.canonicalSourceSkuId);}
      const whole=[];for await(const row of records(MONEY,MONEY_COLUMNS))whole.push({fileSha256:row.sourceFileSha256,sheet:row.sheet,row:row.row,sourceId:row.sourceId,field:row.field,rawValue:row.rawValue,exactCentValue:row.candidateExactCentValue});
      approvedSet=v2MoneyApprovalSet(whole,whole);
      let buffer='';const flush=async()=>{if(!buffer)return;const b=Buffer.from(buffer);spoolBytes+=b.length;if(spoolBytes>MAX_SPOOL)fail('SALES_DETAIL_READER_SPOOL_LIMIT');digest.update(b);await output.writeFile(b);buffer='';};
      for await(const line of rawLines){rawRows++;const raw=JSON.parse(line);if(raw?.entity!=='SALES_LINE')continue;
        if(!text(raw.sourceId)||!text(raw.file)||!text(raw.sheet)||!Number.isSafeInteger(raw.row)||raw.row<1||!hash(raw.sourceSha256)
          ||!Object.hasOwn(manifest.sourceInputSha256??{},raw.file)||manifest.sourceInputSha256[raw.file]!==raw.sourceSha256||!raw.data||Array.isArray(raw.data)||typeof raw.data!=='object'
          ||raw.data['来源编号']!==raw.sourceId)fail('SALES_DETAIL_READER_SOURCE_PROVENANCE');
        const packed=normalized.get(raw.sourceId);if(packed===undefined)fail('SALES_DETAIL_READER_MISSING_DUPLICATE_SOURCE');normalized.delete(raw.sourceId);const canonical=JSON.parse(packed);
        if(aliases.get(raw.data['SKU来源编号'])!==canonical['SKU来源编号'])fail('SALES_DETAIL_READER_ALIAS_MISMATCH');
        if(table.columns.some(c=>!Object.hasOwn(raw.data,c.name)||typeof raw.data[c.name]!=='string'||(c.name!=='SKU来源编号'&&c.logicalType!=='MONEY'&&raw.data[c.name]!==canonical[c.name])))fail('SALES_DETAIL_READER_NONMONEY_REWRITE');
        if(materializedReport)for(const {name:field}of table.columns.filter(c=>c.logicalType==='MONEY')){
          if(raw.data[field]!==canonical[field])v2ApprovedCents({fileSha256:raw.sourceSha256,sheet:raw.sheet,row:String(raw.row),sourceId:raw.sourceId,field,rawValue:raw.data[field],exactCentValue:canonical[field]},approvedSet);
          else if(raw.data[field]!=='')v2Cents(raw.data[field]);
        }
        const position=JSON.stringify([raw.sourceSha256,raw.sheet,raw.row]);if(positions.has(position))fail('SALES_DETAIL_READER_DUPLICATE_POSITION');positions.add(position);index(position+raw.sourceId+'x'.repeat(64));
        const fields={};for(const [key,value]of Object.entries(raw.data))fields[key]={origin:'ORIGINAL',reason:'EXACT_ORIGINAL_SNAPSHOT_CELL',raw:value};
        if(raw.data['SKU来源编号']!==canonical['SKU来源编号'])fields['SKU来源编号']={origin:'MIGRATION_DERIVED',reason:'VERIFIED_OLD_TO_CANONICAL_ALIAS',raw:raw.data['SKU来源编号'],evidence_ref:ALIAS};
        const rowSha256=sha(Buffer.from(line,'utf8'));fields.__source_row_hash={origin:'ORIGINAL',reason:'SHA256_JSONL_UTF8_EXCLUDING_LF_RETAINING_CR_V1',raw:rowSha256};
        const source={id:stableImportId('source-row',fixedSourceNamespace,'SALES_LINE',raw.sourceId),batchId,entityType:'SALES_LINE',sourceKey:raw.sourceId,fileRef:raw.file,sheet:raw.sheet,rowNo:String(raw.row),
          sourceFileSha256:raw.sourceSha256,rowSha256,rawFields:raw.data,normalizedFields:canonical,fieldProvenance:{schema_version:1,fields}};
        const record={source,selection};sourceHashes.set(raw.sourceId,requestHash(record));buffer+=JSON.stringify(record)+'\n';spoolRows++;if(buffer.length>=65536)await flush();
      }
      if(normalized.size||spoolRows!==selected.count)fail('SALES_DETAIL_READER_SOURCE_COVERAGE');await flush();
    };
    if(options.materializedSource!==undefined){
      materialized=await openReviewedMaterializedSource(options.materializedSource);materializedReport=materialized.report;
      const b=materializedReport.binding,decision=JSON.parse(approvalBytes),selectionPath=join(amendment,'effective-import-selection.json'),s=await lstat(selectionPath);
      if(!s.isFile()||s.isSymbolicLink()||s.size>4*1024*1024)fail('SALES_DETAIL_READER_SELECTION');
      const bytes=await readFile(selectionPath),effective=JSON.parse(bytes),selected=effective.importFiles?.find(f=>f.entity==='SALES_LINE'),manifest=materialized.manifest;
      if(base!==materializedReport.baseDirectory||b.batchId!==batchId||b.fixedSourceNamespace!==fixedSourceNamespace||materializedReport.entities.length!==1||materializedReport.entities[0]!=='SALES_LINE'
        ||sha(bytes)!==b.selectionSha256||decision.selectionSha256!==b.selectionSha256||effective.baseManifestSha256!==materializedReport.baseManifestSha256||decision.baseManifestSha256!==materializedReport.baseManifestSha256
        ||selected?.count!==materializedReport.rows||selected.sha256!==manifest.payloadFiles.find(f=>f.file===selected.path)?.sha256||manifest.payloadFiles.find(f=>f.file===MONEY)?.sha256!==approvedMoneyOverlaySha256)fail('SALES_DETAIL_READER_SELECTION');
      async function* rawLines(){for await(const chunk of materialized.chunks('SALES_LINE'))for(const row of chunk)yield row.rawLine;}
      await collect({records:materialized.records,rawLines:rawLines(),manifest,verified:{selection:effective,selectionSha256:b.selectionSha256}});
      await materialized.verify();await materialized.close();materialized=undefined;
    }else preflight=await preflightV2(base,{v3Amendment:amendment,v3Approval:approval,approvedMoneyOverlaySha256,onVerifiedV3:async({records,strings,manifest,verified,report})=>{
      if(verified.approvalSha256!==trustedApprovalSha256||!report.wireRequiredFieldsValid||!report.referenceTargetsValid||report.originalSourceMoneyVerification?.approvedCellsMatched!==32)fail('SALES_DETAIL_READER_PREFLIGHT');
      await collect({records,rawLines:lines(strings('snapshots/all-business-source-rows.jsonl')),manifest,verified});
    }});
    await output.sync();await output.close();output=undefined;spoolSha256=digest.digest('hex');
  }catch(error){await close();throw error;}
  const assertOpen=()=>{if(closed)fail('SALES_DETAIL_READER_CLOSED');};
  const check=record=>{if(sourceHashes.get(record.source?.sourceKey)!==requestHash(record))fail('SALES_DETAIL_READER_SOURCE_NOT_AUTHORIZED');};
  return {report:{kind:'V3_SALES_DETAIL_SOURCE_READER',importReady:false,noSql:true,preflight,...(materializedReport?{materializedSource:materializedReport}:{}),rawRowsScanned:rawRows,selectedRows:spoolRows,spoolBytes,spoolSha256,
    rowHashAlgorithm:'SHA256_JSONL_UTF8_EXCLUDING_LF_RETAINING_CR_V1',originalWorkbooksReparsed:false,nativeBindingsVerified:false,settlementImplemented:false},
    async *rows(entity){assertOpen();if(entity!==undefined&&entity!=='SALES_LINE')fail('SALES_DETAIL_READER_ENTITY_NOT_SUPPORTED');for await(const line of lines(checkedFile(path,spoolBytes,spoolSha256))){assertOpen();const record=JSON.parse(line);check(record);yield {...record,moneyApprovals:structuredClone(approvedSet)};}},
    async authorize(original){assertOpen();if(typeof resolveNativeBinding!=='function')fail('SALES_DETAIL_READER_NATIVE_RESOLVER_REQUIRED');const chunk=structuredClone(original);validatePreparedHistorySalesDetailChunk(chunk);
      const input=chunk.input;if(input.batchId!==batchId||input.fixedSourceNamespace!==fixedSourceNamespace||requestHash(input.selection)!==requestHash(selection)
        ||requestHash(approvals(input.moneyApprovals))!==requestHash(approvals(approvedSet)))fail('SALES_DETAIL_READER_CONTEXT_NOT_AUTHORIZED');
      const authorized=[];for(const row of input.rows){const record={source:row.source,selection:input.selection};check(record);
        const binding=await resolveNativeBinding(structuredClone({entity:'SALES_LINE',sourceKey:row.source.sourceKey,rawFields:row.source.rawFields,normalizedFields:row.source.normalizedFields}));
        assertOpen();check(record);if(requestHash(binding)!==requestHash({header:row.header,sku:row.sku}))fail('SALES_DETAIL_READER_NATIVE_BINDING_MISMATCH');authorized.push({source:row.source,...binding});}
      const expected=prepareHistorySalesDetailChunk({batchId,fixedSourceNamespace,selection,moneyApprovals:approvedSet,rows:authorized});
      if(historySalesDetailRequestHash(expected)!==historySalesDetailRequestHash(chunk))fail('SALES_DETAIL_READER_PREPARED_NOT_AUTHORIZED');assertOpen();
    },close};
}

// The two existing readers share only this retained-input path. The sealed
// PAYMENT collector and original/materialized source paths are unchanged.
const capturedOwn=(value,keys)=>{
 if(!value||Object.getPrototypeOf(value)!==Object.prototype||Reflect.ownKeys(value).length!==keys.length)fail('CAPTURED_HISTORY_SHAPE');
 const result={};for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);if(!d?.enumerable||!Object.hasOwn(d,'value'))fail('CAPTURED_HISTORY_SHAPE');result[key]=d.value;}return result;
};
export async function openCapturedSalesSettlementSource(options,entity,io={}){
 if(!['SALES_LINE','SETTLEMENT'].includes(entity))fail('CAPTURED_HISTORY_ENTITY');
 const option=key=>{const d=Object.getOwnPropertyDescriptor(options??{},key);if(!d?.enumerable||!Object.hasOwn(d,'value'))fail('CAPTURED_HISTORY_OPTIONS');return d.value;};
 const captured=capturedOwn(option('capturedSource'),['manifestFile','trustedManifestSha256','selection','moneyApprovals','read','verify','close']);
 const read=capturedOwn(captured.read,['sourceRows','typedRow']);
 if(typeof captured.verify!=='function'||typeof captured.close!=='function'||Object.values(read).some(fn=>typeof fn!=='function'))fail('CAPTURED_HISTORY_CAPABILITY');
 let closed=false,closing;const known=new Map(),active=()=>{if(closed)fail('CAPTURED_HISTORY_CLOSED');};
 const close=()=>{if(closing)return closing;closed=true;known.clear();closing=Promise.resolve().then(()=>captured.close());return closing;};
 try{
  const batchId=option('batchId'),fixedSourceNamespace=option('fixedSourceNamespace'),trustedApprovalSha256=option('trustedApprovalSha256'),approvedMoneyOverlaySha256=option('approvedMoneyOverlaySha256');
  if(!uuid(batchId)||typeof fixedSourceNamespace!=='string'||!/^[a-z][a-z0-9_.:-]{0,127}$/.test(fixedSourceNamespace)||!hash(trustedApprovalSha256)||!hash(approvedMoneyOverlaySha256))fail('CAPTURED_HISTORY_BINDING');
  const resolverDescriptor=Object.getOwnPropertyDescriptor(options,'resolveNativeBinding');
  if(resolverDescriptor&&(!resolverDescriptor.enumerable||!Object.hasOwn(resolverDescriptor,'value')||typeof resolverDescriptor.value!=='function'))fail('CAPTURED_HISTORY_NATIVE_RESOLVER');
  const resolveBinding=resolverDescriptor?.value;
  historySettlementRequestHash({selection:captured.selection,moneyApprovals:captured.moneyApprovals});
  const selection=structuredClone(captured.selection),moneyApprovals=structuredClone(captured.moneyApprovals);
  if(selection.entity!==entity||selection.approvalSha256!==trustedApprovalSha256||selection.moneyApprovalSha256!==approvedMoneyOverlaySha256||!(moneyApprovals instanceof Map)||moneyApprovals.size!==32)fail('CAPTURED_HISTORY_SELECTION_MONEY');
  const values=[...moneyApprovals.values()],checked=v2MoneyApprovalSet(values,values);
  if(historySettlementRequestHash(checked)!==historySettlementRequestHash(moneyApprovals))fail('CAPTURED_HISTORY_SELECTION_MONEY');
  const manifestFile=captured.manifestFile,manifestSha256=captured.trustedManifestSha256;
  if(typeof manifestFile!=='string'||!isAbsolute(manifestFile)||!hash(manifestSha256))fail('CAPTURED_HISTORY_MANIFEST_PIN');
  const physical=io.resolveFile?await io.resolveFile({path:manifestFile,sha256:manifestSha256}):{path:manifestFile};active();
  const before=await lstat(physical.path);active();
  if(!before.isFile()||before.isSymbolicLink()||before.size>4*1024*1024||(physical.bytes!==undefined&&before.size!==physical.bytes))fail('CAPTURED_HISTORY_MANIFEST_PIN');
  const bytes=await readFile(physical.path),after=await lstat(physical.path);active();
  if(bytes.length!==before.size||['dev','ino','size','mtimeMs','ctimeMs'].some(k=>before[k]!==after[k])||sha(bytes)!==manifestSha256)fail('CAPTURED_HISTORY_MANIFEST_PIN');
  const manifest=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(bytes));historySettlementRequestHash(manifest);
  if(manifest.status!=='ACTUAL_SOURCE_TYPED_PROJECTIONS_COMPLETED_REFERENCE_ONLY'||manifest.referenceOnly!==true||manifest.nativeBindingsVerified!==false||manifest.PG!==false||manifest.MAIN!==false||manifest.PUBLISH!==false||manifest.all11!==false||manifest.actualPayloadHash!==null||!Array.isArray(manifest.artifacts))fail('CAPTURED_HISTORY_MANIFEST_SCOPE');
  const descriptors=manifest.artifacts;
  for(const d of descriptors)if(typeof d.path!=='string'||!isAbsolute(d.path)||!hash(d.sha256)||!Number.isSafeInteger(d.bytes)||d.bytes<=0||!Number.isSafeInteger(d.rows)||d.rows<=0||d.rows>1_000_000||d.mode!=='0600'||!['SALES_LINE','SETTLEMENT'].includes(d.entity)||![12,d.entity==='SALES_LINE'?21:11].includes(d.actualColumns))fail('CAPTURED_HISTORY_DESCRIPTOR');
  const sourceMatches=descriptors.filter(d=>d.entity===entity&&d.actualColumns===12),typedMatches=descriptors.filter(d=>d.entity===entity&&d.actualColumns===(entity==='SALES_LINE'?21:11));
  if(sourceMatches.length!==1||typedMatches.length!==1||sourceMatches[0].rows!==typedMatches[0].rows||new Set(descriptors.map(d=>d.path)).size!==descriptors.length||descriptors.filter(d=>d.actualColumns===12).reduce((n,d)=>n+d.rows,0)!==manifest.sourceRows||descriptors.filter(d=>d.actualColumns!==12).reduce((n,d)=>n+d.rows,0)!==manifest.typedRows)fail('CAPTURED_HISTORY_DESCRIPTOR');
  const source=structuredClone(sourceMatches[0]),typed=structuredClone(typedMatches[0]);
  const context={batchId,fixedSourceNamespace,selection,manifest:{path:manifestFile,bytes:before.size,sha256:manifestSha256},source,typed,moneyApprovalFingerprint:historySettlementRequestHash(moneyApprovals)};
  // C's existing retained reader verifies accepted exact-byte/source proof and
  // current lease. This module never rehashes either large data file.
  const verify=async()=>{active();if(await captured.verify(structuredClone(context))!==undefined)fail('CAPTURED_HISTORY_SOURCE_AUTHORITY');active();};
  const sales=entity==='SALES_LINE',prepare=sales?prepareHistorySalesDetailChunk:prepareHistorySettlementChunk,validate=sales?validatePreparedHistorySalesDetailChunk:validatePreparedHistorySettlementChunk;
  const stagingKey=sales?'history_sales_detail_staging':'history_settlement_staging',validator=sales?HISTORY_SALES_DETAIL_VERSION:HISTORY_SETTLEMENT_VERSION,relation=sales?'history_sales_line':'history_sales_settlement';
  const projection=(value,expectedRelation)=>{historySettlementRequestHash(value);const row=capturedOwn(value,['relation','key','projection']),canonical=historyClosureProjectionRow26(expectedRelation,row.projection);if(row.relation!==expectedRelation||requestHash(row)!==requestHash(canonical))fail('CAPTURED_HISTORY_PROJECTION');return canonical;};
  const sourceProjection=(row)=>historyClosureProjectionRow26('import_source_row',{id:row.source.id,batch_id:row.source.batchId,entity_type:row.source.entityType,source_key:row.source.sourceKey,file_ref:row.source.fileRef,sheet:row.source.sheet,row_no:row.source.rowNo,source_file_sha256:row.source.sourceFileSha256,row_sha256:row.source.rowSha256,raw_fields:row.source.rawFields,normalized_fields:row.source.normalizedFields,field_provenance:{...row.fieldProvenance,[stagingKey]:{validator_version:validator,fingerprint:row.fingerprint,selection:{...selection},header:{...row.header},...(sales?{sku:{...row.sku}}:{account:{...row.account},method:row.method?{...row.method}:null})}}});
  await verify();
  const reader={report:{kind:sales?'V3_SALES_DETAIL_SOURCE_READER':'HISTORY_SETTLEMENT_SOURCE_READER',importReady:false,noSql:true,preflight:null,selectedRows:source.rows,rawRowsScanned:0,originalWorkbooksReparsed:false,nativeBindingsVerified:false,capturedSource:structuredClone(context)},
   async *rows(requested){
    active();if(requested!==undefined&&requested!==entity)fail('CAPTURED_HISTORY_ENTITY');await verify();let count=0,previous;
    for await(const raw of read.sourceRows(structuredClone(source))){
     active();const capturedRow=projection(raw,'import_source_row'),s=capturedRow.projection;
     if(++count>source.rows||previous!==undefined&&Buffer.compare(Buffer.from(previous),Buffer.from(capturedRow.key))>=0||s.batch_id!==batchId||s.entity_type!==entity||s.id!==stableImportId('source-row',fixedSourceNamespace,entity,s.source_key))fail('CAPTURED_HISTORY_SOURCE_IDENTITY_ORDER');previous=capturedRow.key;
     const staged=capturedOwn(s.field_provenance[stagingKey],['validator_version','fingerprint','selection','header',...(sales?['sku']:['account','method'])]);
     if(staged.validator_version!==validator||requestHash(staged.selection)!==requestHash(selection))fail('CAPTURED_HISTORY_STAGING');
     // Invert only the deterministic augmentation performed by the original
     // C144 producer. Recomputed mapper fingerprint proves the exact round trip.
     const fields=Object.fromEntries(Object.entries(s.raw_fields).map(([key,value])=>[key,{origin:'ORIGINAL',reason:'EXACT_ORIGINAL_SNAPSHOT_CELL',raw:value}]));
     if(sales){if(s.raw_fields['SKU来源编号']!==s.normalized_fields['SKU来源编号'])fields['SKU来源编号']={origin:'MIGRATION_DERIVED',reason:'VERIFIED_OLD_TO_CANONICAL_ALIAS',raw:s.raw_fields['SKU来源编号'],evidence_ref:ALIAS};fields.__source_row_hash={origin:'ORIGINAL',reason:'SHA256_JSONL_UTF8_EXCLUDING_LF_RETAINING_CR_V1',raw:s.row_sha256};}
     const original={id:s.id,batchId:s.batch_id,entityType:s.entity_type,sourceKey:s.source_key,fileRef:s.file_ref,sheet:s.sheet,rowNo:s.row_no,sourceFileSha256:s.source_file_sha256,rowSha256:s.row_sha256,rawFields:s.raw_fields,normalizedFields:s.normalized_fields,fieldProvenance:{schema_version:1,fields}};
     const bindings=sales?{header:staged.header,sku:staged.sku}:{header:staged.header,account:staged.account,method:staged.method};
     const prepared=prepare({batchId,fixedSourceNamespace,selection,moneyApprovals,rows:[{source:original,...bindings}]}),row=prepared.rows[0],expected=historyClosureProjectionRow26(relation,sales?row.line:row.settlement);
     if(staged.fingerprint!==row.fingerprint||requestHash(sourceProjection(row))!==requestHash(capturedRow))fail('CAPTURED_HISTORY_SOURCE_ROUNDTRIP');
     const typedValue=await read.typedRow(structuredClone(typed),expected.key);active();
     if(requestHash(projection(typedValue,relation))!==requestHash(expected))fail('CAPTURED_HISTORY_TYPED_MISMATCH');
     const record={source:original,selection},entry={source:requestHash(record),bindings:requestHash(bindings),fingerprint:row.fingerprint};
     const prior=known.get(original.id);if(prior&&requestHash(prior)!==requestHash(entry))fail('CAPTURED_HISTORY_SOURCE_CHANGED');known.set(original.id,entry);
     yield {...structuredClone(record),moneyApprovals:structuredClone(moneyApprovals)};active();
    }
    if(count!==source.rows)fail('CAPTURED_HISTORY_SOURCE_COUNT');await verify();
   },
   async authorize(original){
    active();if(typeof resolveBinding!=='function')fail('CAPTURED_HISTORY_NATIVE_RESOLVER_REQUIRED');historySettlementRequestHash(original);validate(original);const chunk=structuredClone(original),input=chunk.input;
    if(input.batchId!==batchId||input.fixedSourceNamespace!==fixedSourceNamespace||requestHash(input.selection)!==requestHash(selection)||historySettlementRequestHash(input.moneyApprovals)!==historySettlementRequestHash(moneyApprovals))fail('CAPTURED_HISTORY_CONTEXT');await verify();const authorized=[];
    for(const row of input.rows){
     const expected=known.get(row.source.id);if(!expected||expected.source!==requestHash({source:row.source,selection:input.selection}))fail('CAPTURED_HISTORY_SOURCE_NOT_AUTHORIZED');
     const query={entity,sourceKey:row.source.sourceKey,rawFields:row.source.rawFields,normalizedFields:row.source.normalizedFields};
     const resolved=await resolveBinding(structuredClone(query));active();historySettlementRequestHash(resolved);const bindings=sales?{header:row.header,sku:row.sku}:{header:row.header,account:row.account,method:row.method};
     if(requestHash(resolved)!==expected.bindings||requestHash(bindings)!==expected.bindings)fail('CAPTURED_HISTORY_NATIVE_BINDING_MISMATCH');authorized.push({source:row.source,...structuredClone(resolved)});
    }
    const recomputed=prepare({batchId,fixedSourceNamespace,selection,moneyApprovals,rows:authorized});
    if(historySettlementRequestHash(recomputed)!==historySettlementRequestHash(chunk)||recomputed.rows.some(row=>row.fingerprint!==known.get(row.source.id).fingerprint))fail('CAPTURED_HISTORY_PREPARED_NOT_AUTHORIZED');await verify();
   },close};return reader;
 }catch(error){try{await close();}catch(cleanup){throw new AggregateError([error,cleanup],'Captured history construction and cleanup failed');}throw error;}
}
