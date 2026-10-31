/** QA897-only source composition for the ORIGINAL openImportHost26/executor26.
 * Reads independently pinned inputs; never emits a grant, Map approval, SQL,
 * pool, review or publication. Production53 and V3 production counts stay intact.
 *
 * Input refs are {path,bytes,sha256}. The externally pinned input contains:
 * {version,binding,core,closureScope,warehouses,producers,productEvidence,
 *  coreProjection,initialization,preparation,money,executionAuthorization}.
 * producers has exactly the original11 groups. Seven ordinary groups use
 * {mode:'ORIGINAL',options}; HEADERS uses {mode:'HEADERS',transfer,sales};
 * BARCODES uses QA_CAPTURE; two money groups use CAPTURED_MONEY (below).
 * An independent C execution grant (same existing wire format) binds every
 * non-grant input field, registered job, exact MAIN commands and group set.
 * Missing or preparation-only reviews can never activate this source session.
 */
import { lstat, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { requestHash } from '../../packages/application/src/request-hash.ts';
import { historySettlementRequestHash } from '../../packages/application/src/import-v3-history-settlement.ts';
import { v2MoneyApprovalSet, parseV2Csv } from '../../packages/application/src/import-v2.ts';
import { IMPORT_V2_TABLES } from '../../packages/application/src/import-v2-contract.ts';
import { stableImportId, validateCutoffImportCommand } from '../../packages/application/src/inventory-cutoff-import.ts';
import { validateNativeImportAccountingCommand } from '../../packages/application/src/native-import-record-accounting.ts';
import { prepareNativeBarcode, validatePreparedNativeBarcode, nativeBarcodeSourceEvidence, nativeBarcodeSchemeInitializationRows26, validateNativeBarcodeSchemeInitializationRows26 } from '../../packages/application/src/native-barcode-import.ts';
import { prepareV3HistoryHeaderChunk, validatePreparedHistoryHeaderChunk } from '../../packages/application/src/import-v3-history-header-staging.ts';
import { prepareHistorySalesDetailChunk } from '../../packages/application/src/import-v3-history-sales-detail.ts';
import { prepareHistorySettlementChunk } from '../../packages/application/src/import-v3-history-settlement.ts';
import { historyClosureProjectionRow26, historyClosureRowHash } from '../../packages/application/src/history-typed-closure.ts';
import { checkedNativeRuntime26Capability } from '../../packages/application/src/native-import-schema-contract.ts';
import { readNativeCoreWarehouseCarryForward } from '../../adapters/postgres/src/native-import-record-accounting.ts';
import { CORE_PREFIX_GROUPS22 } from '../../adapters/postgres/src/native-core-staged-prefix-bind.ts';
import { HISTORY_CLOSURE_SOURCE_GROUPS, openAuthorizedHistoryClosureReader26 } from '../../scripts/import-v2/authorized-history-closure-reader.mjs';
import { openCapturedSalesSettlementSource } from '../../scripts/import-v2/authorized-sales-detail-reader.mjs';
import { openReviewedPartySource26 } from '../../scripts/import-v3/native-party-source26.mjs';
import { openReviewedCatalogueSource26, openReviewedProductEvidenceSource, createNativeSourceStepAuthorizer } from '../../scripts/import-v3/native-source-authorizers.mjs';
import { openReviewedProductSource26 } from '../../scripts/import-v3/native-product-source26.mjs';
import { openReviewedSkuSource26 } from '../../scripts/import-v3/native-sku-source26.mjs';
import { openReviewedStockSource26 } from '../../scripts/import-v3/native-stock-source26.mjs';
import { openReviewedPaymentSource26 } from '../../scripts/import-v3/native-payment-source26.mjs';
import { openReviewedTransferHeaderSource26 } from '../../scripts/import-v3/native-transfer-header-source26.mjs';
import { openReviewedTransferLineSource26 } from '../../scripts/import-v3/native-transfer-line-source26.mjs';
import { selectProductionContinuation26, stagedPrefixStockRow22, stagedPrefixSkuRecord22 } from '../../scripts/import-v3/production-source-provider26.mjs';
import { validateExecutableSourceHostJob26 } from '../../scripts/import-v3/production-source-host.mjs';

import {CURRENT_LIVE_LEDGER_QA_TARGET,CURRENT_LIVE_LEDGER_QA_NAMESPACE,CURRENT_LIVE_LEDGER_QA_BATCH} from './current-runtime26-sales-fixture.ts';

export const providerVersion='NATIVE_IMPORT_PRODUCTION_PROVIDERS_26_V1';
export const sourceGroups=Object.freeze([...HISTORY_CLOSURE_SOURCE_GROUPS]);
const TARGET='naijue_erp_test_hv2_qa897_20261029_01',NAMESPACE='synthetic.qa897.sales.20261029',BATCH='e2dfa367-7cda-42d2-9726-f7cc52124cf1';
const fail=code=>{throw Object.assign(Error(code),{code});};
const must=(v,code)=>{if(!v)fail('QA897_SOURCE_'+code);};
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const equal=(a,b)=>historySettlementRequestHash(a)===historySettlementRequestHash(b);
const digest=v=>createHash('sha256').update(v).digest('hex');
function bag(v,keys,code='SHAPE'){must(v&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).length===keys.length,code);for(const k of keys){const d=Object.getOwnPropertyDescriptor(v,k);must(d&&d.enumerable&&Object.hasOwn(d,'value'),code);}return v;}
const same=(a,b)=>['dev','ino','mode','size','mtimeMs','ctimeMs'].every(k=>a[k]===b[k]);
const sorted=rows=>[...rows].sort((a,b)=>Buffer.compare(Buffer.from(a.relation+'\0'+a.key),Buffer.from(b.relation+'\0'+b.key)));
const sourceData=(s,field_provenance)=>({id:s.id,batch_id:s.batchId,entity_type:s.entityType,source_key:s.sourceKey,file_ref:s.fileRef,sheet:s.sheet,row_no:s.rowNo,source_file_sha256:s.sourceFileSha256,row_sha256:s.rowSha256,raw_fields:s.rawFields,normalized_fields:s.normalizedFields,field_provenance});
const revive=(_k,v)=>v&&typeof v==='object'&&Object.keys(v).length===1&&Object.hasOwn(v,'__bigint')?(must(typeof v.__bigint==='string'&&/^(?:0|-?[1-9]\d*)$/.test(v.__bigint),'INTEGER'),BigInt(v.__bigint)):v;

export function validateQa22Binding(binding){
 must(binding?.version==='NATIVE_IMPORT_EXECUTION_26_V1'&&binding.phase==='FULL_SOURCE_CONTINUATION_26_V1','BINDING');
 const old=binding.target?.database===TARGET;
 must(old||binding.target?.database===CURRENT_LIVE_LEDGER_QA_TARGET,'TARGET');
 must(binding.batchId===(old?BATCH:CURRENT_LIVE_LEDGER_QA_BATCH)&&binding.fixedSourceNamespace===(old?NAMESPACE:CURRENT_LIVE_LEDGER_QA_NAMESPACE),'TARGET');
 must(hash(binding.selectionSha256)&&hash(binding.authorizedPayloadHash)&&hash(binding.coreSourceDigest)&&binding.authorizedPayloadHash!==binding.coreSourceDigest,'FULL_SOURCE_REQUIRED');
 must(typeof binding.coreReceiptId==='string'&&typeof binding.actorAccountId==='string','CORE_BINDING');
}
/** This source step does not widen the old QA897 review/OID/32-cell authority.
 * The new exact scene may be built/selected purely, but opening its factories
 * needs C's finite fresh-target review envelope successor first. */
function originalQa897ReviewOnly(binding){
 must(binding?.target?.database!==CURRENT_LIVE_LEDGER_QA_TARGET&&binding?.fixedSourceNamespace!==CURRENT_LIVE_LEDGER_QA_NAMESPACE&&binding?.batchId!==CURRENT_LIVE_LEDGER_QA_BATCH,'V7_R1_FRESH_CAPTURE_MONEY_REVIEW_AND_ACTUAL_TARGET_ENVELOPE_REQUIRED');
}
/** Metadata only; all trusted pins are supplied outside the file being read. */
class Inputs {
 constructor(signal){this.signal=signal;this.closed=false;this.files=new Map();}
 active(){must(!this.closed&&!this.signal.aborted,'CLOSED');}
 async bytes(ref,max=8*1024*1024){this.active();bag(ref,['path','bytes','sha256'],'REF');must(isAbsolute(ref.path)&&hash(ref.sha256)&&Number.isSafeInteger(ref.bytes)&&ref.bytes>0&&ref.bytes<=max,'REF');
  let path=ref.path,leaf=true;for(;;){const s=await lstat(path);must(!s.isSymbolicLink()&&(leaf?s.isFile():s.isDirectory()),'REGULAR_FILE');leaf=false;const parent=dirname(path);if(parent===path)break;path=parent;}
  const before=await lstat(ref.path),bytes=await readFile(ref.path),after=await lstat(ref.path);this.active();must(same(before,after)&&bytes.length===ref.bytes&&digest(bytes)===ref.sha256,'FILE_CHANGED');this.files.set(ref.path,{ref:structuredClone(ref),stat:after});return bytes;}
 async json(ref,max){return JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(await this.bytes(ref,max)),revive);}
 async verify(){this.active();for(const [path,f]of this.files){const s=await lstat(path);must(s.isFile()&&!s.isSymbolicLink()&&same(f.stat,s),'FILE_CHANGED');}this.active();}
 close(){this.closed=true;this.files.clear();}
}
const short=b=>Object.fromEntries(['batchId','fixedSourceNamespace','cutoffAt','selectionSha256'].map(k=>[k,b[k]]));
async function csvRows(files,ref,entity){const text=new TextDecoder('utf8',{fatal:true}).decode(await files.bytes(ref));const columns=IMPORT_V2_TABLES.find(t=>t.entity===entity)?.columns.map(c=>c.name);must(columns,'ENTITY');let header;const rows=[];for await(const row of parseV2Csv((async function*(){yield text;})())){if(!header){must(equal(row,columns),'CSV_HEADER');header=row;}else{must(row.length===header.length,'CSV_ROW');rows.push(Object.fromEntries(header.map((k,i)=>[k,row[i]])));}}must(header,'CSV_HEADER');return rows;}
/** Every captured row is tied to real original bytes and canonical cells, not
 * merely to a prepared JSON/hash. Public original preparers remain authoritative. */
async function originalRows(files,ref){const list=await files.json(ref);must(Array.isArray(list)&&list.length>0&&list.length<=100,'ORIGINAL_ROWS');const byId=new Map();for(const item of list){bag(item,['rawLine','sourceFile']);const raw=JSON.parse(item.rawLine),f=item.sourceFile;bag(f,['logicalPath','path','bytes','sha256']);await files.bytes({path:f.path,bytes:f.bytes,sha256:f.sha256});must(raw.file===f.logicalPath&&raw.sourceSha256===f.sha256&&typeof raw.sourceId==='string'&&typeof raw.entity==='string'&&Number.isSafeInteger(raw.row)&&raw.row>0,'ORIGINAL_LOCATOR');const id=stableImportId('source-row',NAMESPACE,raw.entity,raw.sourceId);must(!byId.has(id),'ORIGINAL_DUPLICATE');byId.set(id,{raw,line:item.rawLine});}return byId;}
function assertOriginal(source,originals,canonical){const o=originals.get(source.id);must(o&&o.raw.entity===source.entityType&&o.raw.sourceId===source.sourceKey&&o.raw.file===source.fileRef&&o.raw.sheet===source.sheet&&String(o.raw.row)===source.rowNo&&o.raw.sourceSha256===source.sourceFileSha256&&digest(o.line)===source.rowSha256&&equal(o.raw.data,source.rawFields),'ORIGINAL_CHANGED');must(equal(source.normalizedFields,canonical),'CANONICAL_CHANGED');}
function headerRows(prepared){const h=prepared.header;const common={id:h.id,source_row_id:h.sourceRowId,batch_id:h.batchId,version:h.version,number:h.number,business_date:h.businessDate,source_status:h.sourceStatus,note:h.note,created_by_source_key:h.createdBySourceKey,approved_by_source_key:h.approvedBySourceKey,created_hall_id:h.createdHallId,created_hall_provenance:h.createdHallProvenance,created_hall_reason:h.createdHallReason,created_local_at:h.createdLocalAt,updated_local_at:h.updatedLocalAt,approved_local_at:h.approvedLocalAt,created_instant:h.createdInstant,updated_instant:h.updatedInstant,approved_instant:h.approvedInstant};
 const native={...common,business_type:h.businessType,hall_id:h.hallId,customer_id:h.customerId,warehouse_id:h.warehouseId,salesperson_id:h.salespersonId,gross_amount:h.grossAmount,order_discount:h.orderDiscount,net_due:h.netDue};
 return {source:historyClosureProjectionRow26('import_source_row',sourceData(prepared.source,{...prepared.fieldProvenance,history_header_staging:{validator_version:'V3_HISTORY_HEADER_STAGE_1',fingerprint:prepared.fingerprint,selection:prepared.selection}})),typed:historyClosureProjectionRow26('history_sales_header',native),document:{kind:'SALES',sourceKey:prepared.source.sourceKey,headerSourceRowId:prepared.source.id,headerId:h.id}};
}
/** Narrow missing public source ports: literal BARCODE and SALES_HEADER only.
 * QA_CAPTURE recipe={mode,review,records,originals,canonicalCsv,nativeBindings}.
 * review binds each ref and independent PASS to the same target/selection.
 */
export async function openReviewedQa22Capture(recipe,binding,signal){
 originalQa897ReviewOnly(binding);
 validateQa22Binding(binding);bag(recipe,['mode','review','records','originals','canonicalCsv','nativeBindings']);must(recipe.mode==='QA_CAPTURE','CAPTURE_MODE');
 const files=new Inputs(signal);try{
  const review=await files.json(recipe.review);bag(review,['version','decision','binding','entity','records','originals','canonicalCsv','nativeBindings','independentReview','realImportExecutionAuthorized']);
  must(review.version==='C_QA897_CAPTURE_SOURCE26_REVIEW_V1'&&review.decision==='ACCEPT_EXACT_SOURCE_NATIVE_PROJECTIONS'&&review.realImportExecutionAuthorized===false&&equal(review.binding,short(binding))&&['BARCODE','SALES_HEADER'].includes(review.entity),'CAPTURE_REVIEW');
  for(const k of ['records','originals','canonicalCsv','nativeBindings'])must(equal(review[k],recipe[k]),'CAPTURE_REVIEW');
  const qb=await files.json(review.independentReview);must(qb.result==='PASS'&&qb.recordsSha256===recipe.records.sha256&&qb.originalsSha256===recipe.originals.sha256&&qb.nativeBindingsSha256===recipe.nativeBindings.sha256,'CAPTURE_QB');
  const originals=await originalRows(files,recipe.originals),canonical=await csvRows(files,recipe.canonicalCsv,review.entity),bindings=await files.json(recipe.nativeBindings),inputs=await files.json(recipe.records);must(Array.isArray(bindings)&&bindings.length===1&&Array.isArray(inputs)&&inputs.length===1&&canonical.length===1&&originals.size===1,'CAPTURE_COMPLETE');
  const known=new Map(),chunks=[];for(const input of inputs){const s=input.source;must(s?.batchId===binding.batchId&&s.entityType===review.entity&&input.selection?.selectionSha256===binding.selectionSha256&&input.selection.csvSha256===recipe.canonicalCsv.sha256,'CAPTURE_SCOPE');assertOriginal(s,originals,canonical.find(r=>r.来源编号===s.sourceKey));
   const native=bindings.find(r=>r.sourceKey===s.sourceKey);must(native&&native.sourceRowId===s.id,'NATIVE_BINDING');
   if(review.entity==='BARCODE'){must(equal(native.references,{sku:input.sku,scheme:input.scheme})&&native.nativeId===input.nativeBarcodeId,'NATIVE_BINDING');const prepared=prepareNativeBarcode(input);must(prepared.nativeBarcode.barcode==='897000000000001','BARCODE_LITERAL');chunks.push(prepared);known.set(s.id,prepared);}
   else{must(equal(native.references,{bindings:input.bindings,creatorHallOverlay:input.creatorHallOverlay,temporalEvidence:input.temporalEvidence??{}}),'NATIVE_BINDING');const chunk=prepareV3HistoryHeaderChunk([input]);must(native.nativeId===chunk.rows[0].prepared.header.id,'NATIVE_BINDING');must(chunk.rows[0].prepared.header.sourceStatus==='DRAFT'&&chunk.rows[0].prepared.header.approvedBySourceKey===null,'DRAFT_ONLY');chunks.push(chunk);known.set(s.id,chunk.rows[0]);}}
  const verify=()=>files.verify();
  const authorize=async value=>{await verify();if(review.entity==='BARCODE'){validatePreparedNativeBarcode(value);must(equal(value,known.get(value.source.id)),'ROW_NOT_AUTHORIZED');}else{validatePreparedHistoryHeaderChunk(value);must(value.rows.length===1&&equal(value.rows[0],known.get(value.rows[0].input.source.id)),'ROW_NOT_AUTHORIZED');}await verify();};
  return {verify,authorize,async *rows(){await verify();for(const c of chunks){yield structuredClone(c);await verify();}},async *chunks(){await verify();for(const c of chunks){yield structuredClone(c);await verify();}},async openClosure(scope,context){await verify();must(equal(scope.batchId,binding.batchId)&&scope.fixedSourceNamespace===binding.fixedSourceNamespace&&scope.selectionSha256===binding.selectionSha256&&scope.authorizedPayloadHash===binding.authorizedPayloadHash&&context.group===(review.entity==='BARCODE'?'BARCODES':'HEADERS')&&!context.signal.aborted,'CLOSURE_SCOPE');let closed=false;const current=async()=>{must(!closed&&!context.signal.aborted,'CLOSED');await verify();};const pairs=review.entity==='BARCODE'?chunks.map(c=>({source:historyClosureProjectionRow26('import_source_row',nativeBarcodeSourceEvidence(c)),typed:historyClosureProjectionRow26('sku_barcode',c.nativeBarcode)})):chunks.flatMap(c=>c.rows.map(r=>headerRows(r.prepared)));
   return {verify:current,async *sourceRows(){await current();for(const p of sorted(pairs.map(p=>p.source))){await current();yield structuredClone(p);}},async *typedRows(){await current();const rows=pairs.map(p=>p.typed);if(review.entity==='BARCODE')rows.push(...nativeBarcodeSchemeInitializationRows26().map(s=>historyClosureProjectionRow26('barcode_scheme',s.native)));for(const p of sorted(rows)){await current();yield structuredClone(p);}},async *documents(){await current();for(const p of pairs)if(p.document){await current();yield structuredClone(p.document);}},async close(){closed=true;}};},async close(){files.close();}};
 }catch(error){files.close();throw error;}
}

const ordinary={PARTIES:openReviewedPartySource26,CATALOGUE:openReviewedCatalogueSource26,PRODUCTS:openReviewedProductSource26,SKUS:openReviewedSkuSource26,STOCK_CONTRIBUTORS:openReviewedStockSource26,PAYMENT:openReviewedPaymentSource26,TRANSFER_LINES:openReviewedTransferLineSource26};
const stage={PRODUCTS:['PRODUCT','chunks'],SKUS:['SKU','rows'],STOCK_CONTRIBUTORS:['STOCK_CONTRIBUTOR','groups'],HEADERS:['HEADER','chunks'],TRANSFER_LINES:['TRANSFER_LINES','chunks'],PAYMENT:['PAYMENT','chunks'],BARCODES:['BARCODE','rows'],SALES_DETAILS:['SALES_DETAIL','chunks'],SETTLEMENTS:['SETTLEMENT','chunks']};
async function compositeHeaders(transfer,sales){return {async verify(){await transfer.verify();await sales.verify();},async authorize(chunk){return (chunk.selection.entity==='TRANSFER_HEADER'?transfer:sales).authorize(chunk);},async *chunks(){yield* transfer.chunks();yield* sales.chunks();},async openClosure(scope,context){const children=[await transfer.openClosure(scope,context)];try{children.push(await sales.openClosure(scope,context));}catch(e){await children[0].close();throw e;}return {async verify(){for(const c of children)await c.verify();},async *sourceRows(){const rows=[];for(const c of children)for await(const r of c.sourceRows())rows.push(r);yield* sorted(rows);},async *typedRows(){const rows=[];for(const c of children)for await(const r of c.typedRows())rows.push(r);yield* sorted(rows);},async *documents(){for(const c of children)yield* c.documents();},async close(){for(const c of children.reverse())await c.close();}};},async close(){await sales.close();await transfer.close();}};}

/** Actual C-adopted32 restoration. An entries JSON is not itself an approval. */
export async function readQa22Money(files,money,binding){originalQa897ReviewOnly(binding);bag(money,['decision','entries']);const decision=await files.json(money.decision),encoded=await files.json(money.entries);
 must(decision.version==='C_ADOPTED_SYNTHETIC_MONEY32_DECISION_SNAPSHOT_V1'&&decision.fullSourceExecutionAuthorized===false&&decision.syntheticTarget?.database===TARGET&&decision.syntheticTarget.databaseOid==='21551'&&decision.syntheticTarget.batchId===binding.batchId&&decision.syntheticTarget.namespace===binding.fixedSourceNamespace&&decision.adoptedDecision?.decision==='ADOPT_EXACT_32_SYNTHETIC_SOURCE_CELL_NORMALIZATIONS_FOR_NONEXECUTION_SOURCE_PREPARATION','MONEY_DECISION');
 must(encoded.version==='ORIGINAL_V2_MONEY_APPROVAL_MAP32_ENTRIES_V1'&&encoded.fullSourceExecutionAuthorized===false&&encoded.authorityArtifact?.path===money.decision.path&&encoded.authorityArtifact.sha256===money.decision.sha256&&Array.isArray(encoded.entries),'MONEY_ENTRIES');
 const map=v2MoneyApprovalSet(decision.adoptedDecision.cells,encoded.entries.map(e=>e[1]));must(equal([...map.entries()],[...new Map(encoded.entries).entries()]),'MONEY_ENTRIES_CHANGED');return map;
}
/** CAPTURED_MONEY recipe supplies original captured manifest + NDJSON projection
 * refs, raw original records/CSV, and separately reviewed native binding rows.
 * Source/typed descriptors are the existing C144 wire format, with QA16 rows.
 */
async function openMoney(recipe,group,files,binding,money){bag(recipe,['mode','manifest','sourceRows','typedRows','originals','canonicalCsv','nativeBindings','selection']);must(recipe.mode==='CAPTURED_MONEY','MONEY_CAPTURE');const entity=group==='SALES_DETAILS'?'SALES_LINE':'SETTLEMENT';
 await files.json(recipe.manifest);
 const originals=await originalRows(files,recipe.originals),canonical=await csvRows(files,recipe.canonicalCsv,entity),bindings=await files.json(recipe.nativeBindings);
 const parse=async ref=>new TextDecoder('utf8',{fatal:true}).decode(await files.bytes(ref,16*1024*1024)).trimEnd().split('\n').map(l=>JSON.parse(l));
 const sourceRows=await parse(recipe.sourceRows),typedRows=await parse(recipe.typedRows);must(sourceRows.length===16&&typedRows.length===16&&originals.size===16&&canonical.length===16&&Array.isArray(bindings)&&bindings.length===16&&new Set(bindings.map(r=>r.sourceKey)).size===16,'MONEY_COMPLETE');
 const byTyped=new Map(typedRows.map(r=>[r.key,r]));must(byTyped.size===16,'MONEY_DUPLICATE');
 for(const row of sourceRows){const s=row.projection;must(row.relation==='import_source_row'&&s.entity_type===entity&&s.batch_id===binding.batchId,'MONEY_SCOPE');assertOriginal({id:s.id,sourceKey:s.source_key,entityType:s.entity_type,fileRef:s.file_ref,sheet:s.sheet,rowNo:s.row_no,sourceFileSha256:s.source_file_sha256,rowSha256:s.row_sha256,rawFields:s.raw_fields,normalizedFields:s.normalized_fields},originals,canonical.find(r=>r.来源编号===s.source_key));}
 let closed=false;const verify=async()=>{must(!closed,'CLOSED');await files.verify();};
 const resolver=async query=>{await verify();const row=bindings.find(r=>r.sourceKey===query.sourceKey);const source=sourceRows.find(r=>r.projection.source_key===query.sourceKey)?.projection;must(row&&source&&equal(source.raw_fields,query.rawFields)&&equal(source.normalized_fields,query.normalizedFields)&&row.rawRowSha256===source.row_sha256,'MONEY_NATIVE_REFERENCE');return structuredClone(row.bindings);};
 const reader=await openCapturedSalesSettlementSource({batchId:binding.batchId,fixedSourceNamespace:binding.fixedSourceNamespace,trustedApprovalSha256:recipe.selection.approvalSha256,approvedMoneyOverlaySha256:money.decision.sha256,resolveNativeBinding:resolver,capturedSource:{manifestFile:recipe.manifest.path,trustedManifestSha256:recipe.manifest.sha256,selection:recipe.selection,moneyApprovals:money.map,read:{async *sourceRows(descriptor){must(descriptor.path===recipe.sourceRows.path&&descriptor.sha256===recipe.sourceRows.sha256,'MONEY_DESCRIPTOR');await verify();yield* sorted(sourceRows);},async typedRow(descriptor,key){must(descriptor.path===recipe.typedRows.path&&descriptor.sha256===recipe.typedRows.sha256,'MONEY_DESCRIPTOR');await verify();return structuredClone(byTyped.get(key));}},async verify(context){must(context.source.sha256===recipe.sourceRows.sha256&&context.typed.sha256===recipe.typedRows.sha256&&equal(context.selection,recipe.selection),'MONEY_DESCRIPTOR');await verify();},async close(){closed=true;}}},entity);
 const prepare=entity==='SALES_LINE'?prepareHistorySalesDetailChunk:prepareHistorySettlementChunk;
 async function prepared(){const rows=[];for await(const r of reader.rows(entity))rows.push({source:r.source,...await resolver({sourceKey:r.source.sourceKey,rawFields:r.source.rawFields,normalizedFields:r.source.normalizedFields})});const chunk=prepare({batchId:binding.batchId,fixedSourceNamespace:binding.fixedSourceNamespace,selection:recipe.selection,moneyApprovals:money.map,rows});await reader.authorize(chunk);return chunk;}
 await prepared();
 return {verify,async *chunks(){yield await prepared();},authorize:chunk=>reader.authorize(chunk),async openClosure(scope,context){must(scope.batchId===binding.batchId&&scope.fixedSourceNamespace===binding.fixedSourceNamespace&&scope.selectionSha256===binding.selectionSha256&&scope.authorizedPayloadHash===binding.authorizedPayloadHash&&context.group===group&&!context.signal.aborted,'CLOSURE_SCOPE');await prepared();let childClosed=false;const current=async()=>{must(!childClosed&&!context.signal.aborted,'CLOSED');await verify();};return {verify:current,async *sourceRows(){for(const row of sorted(sourceRows)){await current();yield structuredClone(row);}},async *typedRows(){for(const row of sorted(typedRows)){await current();yield structuredClone(row);}},async *documents(){await current();},async close(){childClosed=true;}};},close:()=>reader.close()};
}

/** Selects no source iterator merely because metadata says a prefix exists.
 * Only a fully verified generic actual readback passed through the ORIGINAL
 * command-chain selector can choose the already-bound path.
 */
export function qa22ContinuationPlan(binding,commands,progress){
 validateQa22Binding(binding);const selected=selectProductionContinuation26({binding,commands,progress});
 const bound=progress.committedOperations.some(op=>op.action==='IMPORT_BIND_FULL_SOURCE');
 must(progress.coreClaims.length===22&&progress.coreWarehouses.length===22&&progress.warehouses.length===22,'CORE_SCOPE');
 const prefixRequired=!bound&&progress.status!=='IMPORTED';return {selected,prefixRequired,prefixGroups:prefixRequired?['PRODUCTS','SKUS','STOCK_CONTRIBUTORS','HEADERS','TRANSFER_LINES']:[]};
}

export async function createQa22SourceSession({inputFile,trustedInputSha256,executionAuthorizationSha256,binding,sources,database,signal}){
 validateQa22Binding(binding);originalQa897ReviewOnly(binding);must(signal instanceof AbortSignal&&!signal.aborted&&typeof database?.ready==='function','CONTEXT');must(hash(trustedInputSha256)&&hash(executionAuthorizationSha256)&&isAbsolute(inputFile),'EXTERNAL_PINS');
 const files=new Inputs(signal),resources=[];let closed=false,closure,preflight=false,stepped=false,actualCore;
 const active=()=>{files.active();must(!closed,'CLOSED');};const verify=async()=>{active();await files.verify();};
 async function close(){if(closed)return;closed=true;const errors=[];for(const r of [...resources].reverse())try{await r.close();}catch(e){errors.push(e);}files.close();if(errors.length)throw new AggregateError(errors,'QA897 source close failed');}
 try{
  const inputStat=await lstat(inputFile),input=await files.json({path:inputFile,bytes:inputStat.size,sha256:trustedInputSha256});
  bag(input,['version','binding','core','closureScope','warehouses','producers','productEvidence','coreProjection','initialization','preparation','money','executionAuthorization']);
  must(input.version==='QA897_FULL_SOURCE_PROVIDER26_INPUT_V1'&&equal(input.binding,binding),'INPUT_BINDING');bag(input.producers,sourceGroups);must(input.executionAuthorization.sha256===executionAuthorizationSha256,'C_EXECUTION_PIN');
  const {executionAuthorization:_authorization,...data}=input,dataDigest=historySettlementRequestHash(data),grant=await files.json(input.executionAuthorization);
  bag(grant,['version','decision','issuingAuthority','realImportExecutionAuthorized','job','sourceInputDigest','groups','mainCommands']);
  must(grant.version==='C_PRODUCTION_SOURCE_EXECUTION26_AUTHORIZATION_V1'&&grant.decision==='AUTHORIZE_EXACT_REGISTERED_FULL_SOURCE_EXECUTION'&&grant.issuingAuthority==='C'&&grant.realImportExecutionAuthorized===true&&grant.sourceInputDigest===dataDigest&&equal([...grant.groups].sort(),[...sourceGroups].sort()),'C_EXECUTION_SCOPE');
  const job=validateExecutableSourceHostJob26(await files.json(grant.job));must(equal(job.binding,binding)&&equal(job.sources,sources)&&job.providers.path===fileURLToPath(import.meta.url)&&job.providers.sha256===digest(await readFile(new URL(import.meta.url))),'REGISTERED_JOB');
  const deadline=Date.parse(job.deadlineUtc);const live=async()=>{await verify();must(Date.now()<deadline,'EXPIRED');};
  const scope=input.closureScope;must(equal(scope.expectedCounts,{history_sales_header:1,history_sales_line:16,history_sales_settlement:16,history_transfer_header:1,history_transfer_line:1,import_source_row:167,import_sku_alias:1,import_stock_contributor:2,barcodes:1}),'QA_COUNTS');must(scope.batchId===binding.batchId&&scope.fixedSourceNamespace===binding.fixedSourceNamespace&&scope.selectionSha256===binding.selectionSha256&&scope.authorizedPayloadHash===binding.authorizedPayloadHash,'CLOSURE_SCOPE');
  must(Array.isArray(input.warehouses)&&input.warehouses.length===22&&new Set(input.warehouses.map(w=>w.targetId)).size===22&&input.core.receiptId===binding.coreReceiptId&&input.core.coreSourceDigest===binding.coreSourceDigest,'CORE_SCOPE');
  const commands=[];bag(grant.mainCommands,['BIND','ACCOUNT','PUBLISH']);must(Array.isArray(grant.mainCommands.ACCOUNT)&&grant.mainCommands.ACCOUNT.length>0,'COMMANDS');
  for(const ref of [grant.mainCommands.BIND,...grant.mainCommands.ACCOUNT,grant.mainCommands.PUBLISH]){const c=await files.json(ref);validateCutoffImportCommand(c);if(c.action!=='IMPORT_BIND_FULL_SOURCE')validateNativeImportAccountingCommand(c);must(c.actorAccountId===binding.actorAccountId&&c.batchId===binding.batchId,'COMMAND_SCOPE');commands.push(c);}
  must(commands[0].action==='IMPORT_BIND_FULL_SOURCE'&&commands.at(-1).action==='IMPORT_PUBLISH'&&commands.slice(1,-1).every(c=>c.action==='IMPORT_CHUNK')&&new Set(commands.map(c=>c.requestKey)).size===commands.length,'COMMAND_CHAIN');
  const full=commands[0].fullBinding;must(full.coreReceiptId===binding.coreReceiptId&&full.coreSourceDigest===binding.coreSourceDigest&&full.authorizedPayloadHash===binding.authorizedPayloadHash&&equal(full.inventoryExpectedCounts,{WAREHOUSE:22,SKU:1,INVENTORY_LEDGER:1,IMPORT_BATCH:1})&&equal(full.historyExpectedCounts,scope.expectedCounts)&&full.sourceClosurePins.length===11,'FULL_SOURCE');
  for(const g of sourceGroups)must(full.sourceClosurePins.filter(p=>p.group===g&&hash(p.sha256)).length===1,'FULL_SOURCE');
  const runtimeRef=job.runtime26Review;const runtimeStat=await lstat(runtimeRef.reviewFile);const runtimeReview=await files.json({path:runtimeRef.reviewFile,bytes:runtimeStat.size,sha256:runtimeRef.trustedReviewSha256},65536);must(runtimeReview.target?.databaseOid==='21551','DATABASE_OID');
  const moneyMap=await readQa22Money(files,input.money,binding),money={...input.money,map:moneyMap};
  const readers=new Map();for(const group of sourceGroups){await live();const recipe=input.producers[group];let reader;
   if(ordinary[group]){bag(recipe,['mode','options']);must(recipe.mode==='ORIGINAL'&&equal(recipe.options.binding,short(binding)),'ORIGINAL_SOURCE_OPTIONS');reader=await ordinary[group](recipe.options);}
   else if(group==='HEADERS'){bag(recipe,['mode','transfer','sales']);must(recipe.mode==='HEADERS'&&equal(recipe.transfer.binding,short(binding)),'HEADER_OPTIONS');const transfer=await openReviewedTransferHeaderSource26(recipe.transfer);try{reader=await compositeHeaders(transfer,await openReviewedQa22Capture(recipe.sales,binding,signal));}catch(e){await transfer.close();throw e;}}
   else if(group==='BARCODES')reader=await openReviewedQa22Capture(recipe,binding,signal);
   else reader=await openMoney(recipe,group,files,binding,money);
   must(reader&&typeof reader.close==='function','READER');resources.push(reader);readers.set(group,reader);}
  const evidence=await openReviewedProductEvidenceSource(input.productEvidence);resources.push(evidence);
  const projection=await files.json(input.coreProjection),initialization=await files.json(input.initialization),preparation=await files.json(input.preparation);validateCutoffImportCommand(initialization);
  must(initialization.action==='IMPORT_INITIALIZE_BARCODE_SCHEMES'&&initialization.batchId===binding.batchId&&initialization.actorAccountId===binding.actorAccountId&&equal(initialization.schemeInitialization.target,binding.target),'INITIALIZATION');validateNativeBarcodeSchemeInitializationRows26(initialization.schemeInitialization.schemes);
  bag(preparation,['inputDigest','manifestSha256']);bag(projection,['coreMembers','staffProofs','coreMaintenanceBinding']);
  must(hash(preparation.inputDigest)&&hash(preparation.manifestSha256)&&Array.isArray(projection.coreMembers)&&projection.coreMembers.length===115&&Array.isArray(projection.staffProofs)&&projection.staffProofs.length===49,'CORE_PROJECTION');
  const originalMain=async(actor,command)=>{await live();const c=commands.find(c=>c.requestKey===command.requestKey);must(actor===binding.actorAccountId&&c&&equal(c,command),'MAIN_NOT_AUTHORIZED');};
  const handlers=Object.fromEntries(['PARTY','CATALOGUE','PRODUCT','SKU','BARCODE','STOCK_CONTRIBUTOR','PAYMENT','HEADER_REFERENCE','HEADER','SALES_DETAIL','SETTLEMENT','TRANSFER_LINES','MAIN','CLOSURE'].map(k=>[k,async()=>fail('QA897_SOURCE_UNUSED_KIND')]));
  for(const [group,[kind]]of Object.entries(stage))handlers[kind]=async payload=>{await live();await readers.get(group).authorize(payload);await live();};
  handlers.PARTY=async payload=>{await live();await readers.get('PARTIES').authorize(payload);await live();};handlers.CATALOGUE=async payload=>{await live();await readers.get('CATALOGUE').authorize(payload);await live();};
  let authorizeStep;const openSources=Object.fromEntries(sourceGroups.map(group=>[group,async(s,c)=>{await live();must(equal(s,scope)&&c.group===group&&!c.signal.aborted,'CLOSURE_SCOPE');await ensureCore();return readers.get(group).openClosure(s,c);} ]));
  async function ensureCore(){if(actualCore){await live();return actualCore;}await live();const runtime=database.ready();must(checkedNativeRuntime26Capability(runtime.runtime26),'RUNTIME');const client=await runtime.pool.connect();let began=false,committing=false,discard,verifiedCore;
   try{await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');began=true;const p=await readNativeCoreWarehouseCarryForward(client,{batchId:binding.batchId,coreReceiptId:binding.coreReceiptId,coreSourceDigest:binding.coreSourceDigest},runtime.runtime26);
    must(p.actorAccountId===binding.actorAccountId&&p.fixedSourceNamespace===binding.fixedSourceNamespace&&p.selectionSha256===binding.selectionSha256&&p.coreClaims.length===22&&p.coreWarehouses.length===22&&p.warehouses.length===22,'ACTUAL_CORE');
    for(const row of p.coreWarehouses)must(input.warehouses.some(w=>equal(w,row)),'ACTUAL_CORE_SOURCE');
    const init=p.committedOperations.find(c=>c.action==='IMPORT_INITIALIZE_BARCODE_SCHEMES');must(init&&init.requestKey===initialization.requestKey&&init.requestHash===historySettlementRequestHash(initialization),'ACTUAL_INIT');
    committing=true;await client.query('COMMIT');verifiedCore=p;
   }catch(e){if(!began||committing)discard=e;else try{await client.query('ROLLBACK');}catch(r){discard=r;throw new AggregateError([e,r],'QA897 CORE read/rollback');}throw e;}finally{client.release(discard);}
   await readers.get('PARTIES').bindCoreContinuation({authorizedPayloadHash:binding.authorizedPayloadHash,coreMembers:projection.coreMembers,staffProofs:projection.staffProofs,coreMaintenanceBinding:projection.coreMaintenanceBinding,verify:live});actualCore=verifiedCore;return actualCore;}
  async function expected(){await ensureCore();if(!closure){closure=await openAuthorizedHistoryClosureReader26({scope,openSources,trustedSelectionSha256:binding.selectionSha256,trustedAuthorizedPayloadHash:binding.authorizedPayloadHash});resources.push(closure);}return closure.expected();}
  const adoptedClosure={expected,async authorizeStage(value){await expected();await closure.authorizeStage(value);},async authorizePublish(command){await originalMain(binding.actorAccountId,command);const e=await expected();must(equal(command.historyClosure,e.plan),'PUBLISH_CLOSURE');}};
  handlers.MAIN=command=>originalMain(binding.actorAccountId,command);handlers.CLOSURE=value=>adoptedClosure.authorizeStage(value);authorizeStep=createNativeSourceStepAuthorizer(handlers);
  const skuRecords=[];
  const stagedPrefixBinding26={async capture(command){await originalMain(binding.actorAccountId,command);must(command.action==='IMPORT_BIND_FULL_SOURCE','PREFIX_BIND');await ensureCore();
   const groups=CORE_PREFIX_GROUPS22.map(name=>({name,sourceRows:async function*(){const s=await openSources[name](scope,{group:name,signal});try{await s.verify();yield* s.sourceRows();}finally{await s.close();}},typedRows:async function*(){const s=await openSources[name](scope,{group:name,signal});try{await s.verify();for await(const row of s.typedRows())yield name==='STOCK_CONTRIBUTORS'?stagedPrefixStockRow22(row):row;}finally{await s.close();}}}));
   must(skuRecords.length===1,'PREFIX_SKU_RECORDS');return {version:'CORE_STAGED_PREFIX_BIND_V22',binding:{...short(binding),actorAccountId:binding.actorAccountId,commandHash:historySettlementRequestHash(command)},preparation,groups,schemes:initialization.schemeInitialization.schemes.map(s=>s.native),skuRecords:async function*(){yield* structuredClone(skuRecords);},schemeInitialization:{operationId:stableImportId('operation',binding.actorAccountId,initialization.requestKey),requestKey:initialization.requestKey,requestHash:historySettlementRequestHash(initialization),approvalPins:initialization.schemeInitialization.approvalPins}};}};
  const nativeProductSourceReader={async authorize(value){await live();await evidence.authorize(value);await live();}};
  if(typeof evidence.resolveFile==='function')nativeProductSourceReader.resolveFile=async ref=>{await live();const result=await evidence.resolveFile(ref);await live();return result;};
  return {bootstrap26:null,nativeProductSourceReader,closureScope:scope,openSources,adoptedClosure,stagedPrefixBinding26,now:()=>new Date().toISOString(),
   async preflight(){must(!preflight,'PREFLIGHT_ONCE');await live();for(const reader of readers.values())await reader.verify();await evidence.verify();preflight=true;},
   async assertExecutionAllowed(actual){await live();must(preflight&&equal(actual,binding),'EXECUTION_BINDING');},authorizeStep,assertAllowed:originalMain,authorizeNativeCommand:async(actor,c)=>{await originalMain(actor,c);if(c.action==='IMPORT_PUBLISH')await adoptedClosure.authorizePublish(c);},
   async *steps(){must(preflight&&!stepped,'STEPS_ONCE');stepped=true;const p=await ensureCore(),plan=qa22ContinuationPlan(binding,commands,p);if(p.status==='IMPORTED'){must(plan.selected.remaining.length===0,'PUBLISHED_CHAIN');return p.committedOperations.at(-1).result;}
    {for(const group of plan.prefixGroups){const [kind,iterator]=stage[group];for await(const payload of readers.get(group)[iterator]()){await authorizeStep({kind,payload});if(kind==='SKU')skuRecords.push(stagedPrefixSkuRecord22(payload));yield {kind,payload};}}}
    const remaining=plan.selected.remaining;for(const command of remaining.filter(c=>c.action==='IMPORT_BIND_FULL_SOURCE')){await originalMain(binding.actorAccountId,command);yield {kind:'MAIN',payload:command};}
    for(const group of ['PAYMENT','BARCODES','SALES_DETAILS','SETTLEMENTS']){const [kind,iterator]=stage[group];for await(const payload of readers.get(group)[iterator]()){await authorizeStep({kind,payload});yield {kind,payload};}}
    for(const command of remaining.filter(c=>c.action==='IMPORT_CHUNK')){await originalMain(binding.actorAccountId,command);yield {kind:'MAIN',payload:command};}
    const value=await expected();await adoptedClosure.authorizeStage(value);yield {kind:'CLOSURE',payload:value};
    for(const command of remaining.filter(c=>c.action==='IMPORT_PUBLISH')){await adoptedClosure.authorizePublish(command);yield {kind:'MAIN',payload:command};}
   },close};
 }catch(error){try{await close();}catch(c){throw new AggregateError([error,c],'QA897 construction/close');}throw error;}
}
export async function openSourceSession(context){return createQa22SourceSession({...context,inputFile:process.env.NAIJUE_QA897_SOURCE_INPUT_FILE,trustedInputSha256:process.env.NAIJUE_QA897_SOURCE_INPUT_SHA256,executionAuthorizationSha256:process.env.NAIJUE_IMPORT_EXECUTION26_AUTHORIZATION_SHA256});}
