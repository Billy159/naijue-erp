import {createHash} from 'node:crypto';
import {parseStrictJson,decodeUtf8,findCredentialPath,TABLE_SCHEMAS,historicalSalesHallEvidenceMatchesProfile} from './unified-import-contract.ts';
import type {PackageManifest,IdentityEntry,StandardRecord,SourceRef} from './unified-import-contract.ts';
import {validateHistoricalSalesHallEvidence,historicalSalesHallApprovalMatchesSource} from './unified-historical-sales-hall-evidence.ts';
import {parseHistoricalSalesHallInputEvidence} from './historical-sales-hall-evidence.ts';
import type {HistoricalSalesHallApproval} from './unified-historical-sales-hall-evidence.ts';
import type {HistoricalSalesHallInputEvidence} from './historical-sales-hall-evidence.ts';
import {requestHash} from './request-hash.ts';
import {validateZeroAmountArchive} from './unified-zero-amount-archive.ts';
import {explicitZeroApproved,explicitZeroApprovalDescriptor} from './unified-explicit-zero-approval.ts';
import type {ExplicitZeroApproval} from './unified-explicit-zero-approval.ts';

/** An independently pinned census, not an import permission or proof of source truth.
 * Package row counts remain target counts; this ledger retains original occurrences.
 * No identities are allocated, no records are changed, and no database is opened. */
export interface SourceOccurrence {entity_type:string;source_key:string;source_parent_key:string|null;source_refs:SourceRef[];original_values:Record<string,string|null>;}
export interface SourceOccurrenceMapping {entity_type:string;source_key:string;source_parent_key:string|null;target_record_sha256:string;target:{table:string;source_key:string;archive_source_key:string|null};}
interface Ledger {format_version:'SOURCE_OCCURRENCE_LEDGER_V1';source_namespace:string;manifest_value_sha256:string;source_occurrences:SourceOccurrence[];mappings:SourceOccurrenceMapping[];}
export interface SourceOccurrenceEvidence {readonly sha256:string;readonly source_namespace:string;readonly manifest_value_sha256:string;readonly occurrence_count:number;}
export interface SourceReconciliationContext {manifest:PackageManifest;registry:Iterable<IdentityEntry>;records:(table:string)=>Iterable<StandardRecord>;explicitZeroApproval?:ExplicitZeroApproval;storage?:SourceOccurrenceStorage;historicalSalesHallApproval?:HistoricalSalesHallApproval;}
const ledgers=new WeakMap<object,any>();
export const SOURCE_OCCURRENCE_STREAM_MAX_ROWS=5_000_000;
/** Disk collections are supplied only by the offline bounded reader. */
export interface SourceOccurrenceStorage {map():any;set():any;list():any;groups():any;}
const MAX_OCCURRENCES=250000;
const object=(x:unknown):x is Record<string,any>=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const closed=(x:unknown,keys:string[]):x is Record<string,any>=>object(x)&&Object.keys(x).sort().join('\0')===[...keys].sort().join('\0');
const hash=(x:unknown)=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const text=(x:unknown)=>typeof x==='string'&&x.length>0&&x.length<=4096&&!/[\uD800-\uDFFF]/u.test(x)&&!/[\u0000-\u001f]/u.test(x);
function fail(code:string):never{throw Error(code);}
const sourceKey=(r:Pick<SourceOccurrence,'entity_type'|'source_key'|'source_parent_key'>)=>JSON.stringify([r.entity_type,r.source_parent_key,r.source_key]);
const targetKey=(r:SourceOccurrenceMapping['target'])=>JSON.stringify([r.table,r.source_key,r.archive_source_key]);
const refKey=(r:SourceRef)=>JSON.stringify([r.file_sha256,r.sheet,r.row]);
function validRefs(refs:unknown):refs is SourceRef[]{return Array.isArray(refs)&&refs.length>0&&refs.length<=100&&refs.every(r=>closed(r,['file_sha256','sheet','row'])&&hash(r.file_sha256)&&(r.sheet===null||text(r.sheet))&&Number.isSafeInteger(r.row)&&r.row>=1&&r.row<=2147483647)&&new Set(refs.map(refKey)).size===refs.length;}
function freezeDeep<T>(value:T):T{if(value&&typeof value==='object'){for(const child of Object.values(value))freezeDeep(child);Object.freeze(value);}return value;}
export function readSourceOccurrenceEvidence(input:{bytes:Uint8Array;trustedSha256:string}):SourceOccurrenceEvidence {
 if(!(input.bytes instanceof Uint8Array)||input.bytes.byteLength<1||input.bytes.byteLength>64*1024*1024)fail('SOURCE_RECONCILIATION_EVIDENCE_SIZE');
 const bytes=Buffer.from(input.bytes);
 if(!hash(input.trustedSha256)||createHash('sha256').update(bytes).digest('hex')!==input.trustedSha256)fail('SOURCE_RECONCILIATION_EVIDENCE_HASH');
 const v=parseStrictJson(decodeUtf8(bytes));
 if(findCredentialPath(v)||!closed(v,['format_version','source_namespace','manifest_value_sha256','source_occurrences','mappings'])||v.format_version!=='SOURCE_OCCURRENCE_LEDGER_V1'||!text(v.source_namespace)||!hash(v.manifest_value_sha256)||!Array.isArray(v.source_occurrences)||v.source_occurrences.length>MAX_OCCURRENCES||!Array.isArray(v.mappings)||v.mappings.length>MAX_OCCURRENCES)fail('SOURCE_RECONCILIATION_EVIDENCE_SHAPE');
 return registerSourceOccurrenceLedger(v,input.trustedSha256);
}
/** Shares the exact V1 row semantics with the byte reader; streaming reader verifies raw bytes before registration. */
function registerSourceOccurrenceLedger(v:any,trustedSha256:string,storage?:SourceOccurrenceStorage):SourceOccurrenceEvidence {
 if(!hash(trustedSha256)||v.format_version!=='SOURCE_OCCURRENCE_LEDGER_V1'||!text(v.source_namespace)||!hash(v.manifest_value_sha256)||v.source_occurrences.length>SOURCE_OCCURRENCE_STREAM_MAX_ROWS||v.mappings.length>SOURCE_OCCURRENCE_STREAM_MAX_ROWS)fail('SOURCE_RECONCILIATION_EVIDENCE_SHAPE');
 const sources=storage?.set()??new Set<string>(),mapped=storage?.set()??new Set<string>();
 for(const row of v.source_occurrences){
  if(findCredentialPath(row)||!closed(row,['entity_type','source_key','source_parent_key','source_refs','original_values'])||!text(row.entity_type)||!text(row.source_key)||!(row.source_parent_key===null||text(row.source_parent_key))||!validRefs(row.source_refs)||!object(row.original_values)||Object.keys(row.original_values).length<1||Object.keys(row.original_values).length>100||!Object.entries(row.original_values).every(([k,x])=>text(k)&&(x===null||typeof x==='string'&&x.length<=16384)))fail('SOURCE_RECONCILIATION_OCCURRENCE_INVALID');
  const key=sourceKey(row as unknown as SourceOccurrence);if(sources.has(key))fail('SOURCE_RECONCILIATION_DUPLICATE_OCCURRENCE');sources.add(key);
 }
 for(const row of v.mappings){
  if(!closed(row,['entity_type','source_key','source_parent_key','target_record_sha256','target'])||!text(row.entity_type)||!text(row.source_key)||!(row.source_parent_key===null||text(row.source_parent_key))||!hash(row.target_record_sha256)||!closed(row.target,['table','source_key','archive_source_key'])||!text(row.target.table)||!text(row.target.source_key)||!(row.target.archive_source_key===null||text(row.target.archive_source_key)))fail('SOURCE_RECONCILIATION_MAPPING_INVALID');
  const key=sourceKey(row as unknown as SourceOccurrence);if(!sources.has(key)||mapped.has(key))fail('SOURCE_RECONCILIATION_MAPPING_COVERAGE');mapped.add(key);
 }
 if(mapped.size!==sources.size)fail('SOURCE_RECONCILIATION_MAPPING_COVERAGE');
 const ledger=storage?v:freezeDeep(v as Ledger),evidence=Object.freeze({sha256:trustedSha256,source_namespace:ledger.source_namespace,manifest_value_sha256:ledger.manifest_value_sha256,occurrence_count:sources.size});ledgers.set(evidence,ledger);return evidence;
}

export function reconcileSourceOccurrenceEvidence(evidence:SourceOccurrenceEvidence,context:SourceReconciliationContext){
 const ledger=ledgers.get(evidence);if(!ledger)fail('SOURCE_RECONCILIATION_EVIDENCE_UNVERIFIED');
 const m=context.manifest;
 if(ledger.source_namespace!==m.source_namespace||ledger.manifest_value_sha256!==requestHash(m))fail('SOURCE_RECONCILIATION_PACKAGE_MISMATCH');
 const sourceHashes=new Set(m.source_files.map(f=>f.sha256));
 const store=context.storage,limit=store?SOURCE_OCCURRENCE_STREAM_MAX_ROWS:MAX_OCCURRENCES;
 const originals=store?.map()??new Map();for(const r of ledger.source_occurrences)originals.set(sourceKey(r),r);
 const groups=store?.groups()??new Map<string,SourceOccurrenceMapping[]>();
 for(const r of ledger.mappings){const key=targetKey(r.target);if(store)groups.add(key,r);else{const group=groups.get(key)??[];group.push(r);groups.set(key,group);}}
 const neededIdentityKeys=store?.set()??new Set<string>();
 for(const r of ledger.source_occurrences)if(r.source_parent_key===null)neededIdentityKeys.add(JSON.stringify([r.entity_type,r.source_key]));
 for(const r of ledger.mappings)neededIdentityKeys.add(JSON.stringify([r.target.table.toUpperCase(),r.target.source_key]));
 const aliases=store?.map()??new Map<string,string>();
 for(const r of context.registry){
  if(r.source_namespace!==m.source_namespace)fail('SOURCE_RECONCILIATION_IDENTITY_MISMATCH');
  for(const key of [r.canonical_source_key,...r.aliases]){const k=JSON.stringify([r.entity_type,key]);if(!neededIdentityKeys.has(k))continue;if(aliases.has(k))fail('SOURCE_RECONCILIATION_IDENTITY_MISMATCH');aliases.set(k,r.target_id);}
 }
 const sourceToTarget:{source:SourceOccurrence;target:SourceOccurrenceMapping['target'];target_id:string|null;target_record_sha256:string}[]=store?.list()??[];
 const manyToOne:{table:string;target_source_key:string;source_occurrence_count:number;target_id:string|null}[]=store?.list()??[];
 const byTable:Record<string,{original_source_occurrences:number;standard_target_rows:number;approved_absence_zero_targets:number;zero_amount_archive_occurrences:number;many_to_one_targets:number}>={};
 for(const table of Object.keys(TABLE_SCHEMAS))byTable[table]={original_source_occurrences:0,standard_target_rows:0,approved_absence_zero_targets:0,zero_amount_archive_occurrences:0,many_to_one_targets:0};
 const approvedZeros:{source_key:string;warehouse_id:string;sku_id:string;quantity:'0';inventory_file_sha256:string;cutoff_at:string;approval_sha256:string;approval_jsonl_line:number;locator_role:'APPROVAL_JSONL_LINE_NOT_INVENTORY_SOURCE_ROW';target_record_sha256:string}[]=store?.list()??[];
 const historicalHalls:{sales_source_key:string;sales_id:string|null;selected_hall_id:unknown;original_hall_id:string|null;warehouse_id:unknown;warehouse_current_hall_id:unknown;salesperson_id:unknown;salesperson_current_hall_id:unknown;source_refs:SourceRef[];historical_hall_evidence:HistoricalSalesHallInputEvidence|null;target_record_sha256:string}[]=store?.list()??[];
 const warehouses=store?.map()??new Map<string,unknown>(),staff=store?.map()??new Map<string,unknown>();
 let referenceRows=0;for(const r of context.records('warehouse')){if(++referenceRows>limit)fail('SOURCE_RECONCILIATION_TARGET_LIMIT');const id=aliases.get(JSON.stringify(['WAREHOUSE',r.source_key]));if(id)warehouses.set(id,{source_key:r.source_key,target_id:id,fields:r.fields});}
 for(const r of context.records('staff')){if(++referenceRows>limit)fail('SOURCE_RECONCILIATION_TARGET_LIMIT');const id=aliases.get(JSON.stringify(['STAFF',r.source_key]));if(id)staff.set(id,r.fields.hall_id);}
 let sourceRecords=0,targetRows=0,archiveRows=0,fundsActions=0,listedZeroRows=0;
 const usedGroups=store?.set()??new Set<string>(),approvalRows=store?.set()??new Set<number>();
 function bind(table:string,row:StandardRecord,recordHash:string,archive?:{source_key:string;source_refs:SourceRef[];original_values:Record<string,string|null>;archive_id:string}){
  const target={table,source_key:row.source_key,archive_source_key:archive?.source_key??null},key=targetKey(target),links=groups.get(key);
  if(!links?.length)fail('SOURCE_RECONCILIATION_TARGET_UNCOVERED');
  if(usedGroups.has(key))fail('SOURCE_RECONCILIATION_DUPLICATE_TARGET');usedGroups.add(key);
  const id=archive?.archive_id??(TABLE_SCHEMAS[table]?.id?aliases.get(JSON.stringify([table.toUpperCase(),row.source_key]))??null:null);
  if(!archive&&Object.hasOwn(row.fields,'id')&&row.fields.id!==id)fail('SOURCE_RECONCILIATION_IDENTITY_MISMATCH');
  if(links.length>1){
   if(archive||['sales_header','sales_line','sales_settlement','transfer_header','transfer_line'].includes(table))fail('SOURCE_RECONCILIATION_DOCUMENT_COLLAPSE');
   manyToOne.push({table,target_source_key:row.source_key,source_occurrence_count:links.length,target_id:id});byTable[table]!.many_to_one_targets++;
  }
  const refs=new Set((archive?.source_refs??row.source_refs).map(refKey));
  for(const link of links){
   const source=originals.get(sourceKey(link))!;
   if(link.target_record_sha256!==recordHash)fail('SOURCE_RECONCILIATION_TARGET_RECORD_MISMATCH');
   if(!source.source_refs.every((ref:SourceRef)=>sourceHashes.has(ref.file_sha256)&&refs.has(refKey(ref))))fail('SOURCE_RECONCILIATION_SOURCE_REF_MISMATCH');
   if(archive){
    if(source.entity_type!=='SALES_SETTLEMENT'||source.source_parent_key!==row.source_key||source.source_key!==archive.source_key||requestHash(source.original_values)!==requestHash(archive.original_values))fail('SOURCE_RECONCILIATION_ARCHIVE_IDENTITY_MISMATCH');
    byTable.sales_settlement!.original_source_occurrences++;byTable.sales_settlement!.zero_amount_archive_occurrences++;
   }else{
    if(source.entity_type!==table.toUpperCase()||source.source_parent_key!==null)fail('SOURCE_RECONCILIATION_IDENTITY_MISMATCH');
    if(TABLE_SCHEMAS[table]?.id){
     if(aliases.get(JSON.stringify([source.entity_type,source.source_key]))!==id||aliases.get(JSON.stringify([source.entity_type,row.source_key]))!==id)fail('SOURCE_RECONCILIATION_IDENTITY_MISMATCH');
    }
    if(['sales_header','sales_line','sales_settlement','transfer_header','transfer_line'].includes(table)&&source.source_key!==row.source_key)fail('SOURCE_RECONCILIATION_DOCUMENT_IDENTITY_CHANGED');
    byTable[table]!.original_source_occurrences++;
   }
   sourceRecords++;sourceToTarget.push({source:structuredClone(source),target,target_id:id,target_record_sha256:recordHash});
  }
 }
 for(const table of Object.keys(TABLE_SCHEMAS)){
  const seen=store?.set()??new Set<string>();
  for(const row of context.records(table)){
   const recordHash=requestHash(row);
   if(++targetRows>limit)fail('SOURCE_RECONCILIATION_TARGET_LIMIT');
   if(seen.has(row.source_key))fail('SOURCE_RECONCILIATION_DUPLICATE_TARGET');seen.add(row.source_key);byTable[table]!.standard_target_rows++;
   if(row.explicit_zero_evidence!==undefined){
    if(table!=='inventory_baseline'||!explicitZeroApproved(context.explicitZeroApproval,m.source_namespace,m.inventory_source.source_file_sha256,m.inventory_source.cutoff_at??'',row))fail('SOURCE_RECONCILIATION_ZERO_APPROVAL');
    const e=row.explicit_zero_evidence;
    if(!sourceHashes.has(e.approval_sha256)||!sourceHashes.has(e.inventory_file_sha256))fail('SOURCE_RECONCILIATION_ZERO_SOURCE_PIN');
    if(groups.has(targetKey({table,source_key:row.source_key,archive_source_key:null})))fail('SOURCE_RECONCILIATION_ZERO_FABRICATED_SOURCE');
    if(approvalRows.has(e.approval_row))fail('SOURCE_RECONCILIATION_ZERO_DUPLICATE');approvalRows.add(e.approval_row);
    byTable[table]!.approved_absence_zero_targets++;approvedZeros.push({source_key:row.source_key,warehouse_id:String(row.fields.warehouse_id),sku_id:String(row.fields.sku_id),quantity:'0',inventory_file_sha256:e.inventory_file_sha256,cutoff_at:e.cutoff_at,approval_sha256:e.approval_sha256,approval_jsonl_line:e.approval_row,locator_role:'APPROVAL_JSONL_LINE_NOT_INVENTORY_SOURCE_ROW',target_record_sha256:requestHash(row)});
   }else{bind(table,row,recordHash);if(table==='inventory_baseline'&&row.fields.quantity==='0')listedZeroRows++;}
   if(table==='sales_settlement'){
    if(typeof row.fields.amount!=='string'||!/^\d+\.\d{2}$/.test(row.fields.amount)||BigInt(row.fields.amount.replace('.',''))===0n)fail('SOURCE_RECONCILIATION_ZERO_FUNDS_ACTION');fundsActions++;
   }
   if(table==='sales_header'){
    if(row.fields.stock_basis==='CUTOFF_HISTORY'){
     const raw=(row as StandardRecord & {historical_hall_evidence?:unknown}).historical_hall_evidence;
     const hallEvidence=raw===undefined?null:parseHistoricalSalesHallInputEvidence(raw);
     if(hallEvidence?.format_version==='HISTORICAL_SALES_HALL_EVIDENCE_V2'&&hallEvidence.target_snapshot.captured_at===null){
      if(!historicalSalesHallEvidenceMatchesProfile(hallEvidence,m.schema_contract.source_declarations_sha256))fail('HISTORICAL_HALL_PROFILE_VERSION');
      if(!historicalSalesHallApprovalMatchesSource(context.historicalSalesHallApproval,m.source_namespace,sourceHashes))fail('HISTORICAL_HALL_APPROVAL_REQUIRED');
      const warehouse=warehouses.get(String(row.fields.warehouse_id)) as {source_key:string;target_id:string;fields:Record<string,unknown>}|undefined;
      if(!warehouse)fail('HISTORICAL_HALL_CAPTURE_REQUIRED');
      validateHistoricalSalesHallEvidence(hallEvidence,{sourceNamespace:m.source_namespace,sourceKey:row.source_key,targetId:aliases.get(JSON.stringify(['SALES_HEADER',row.source_key])),sourceRefs:row.source_refs,fields:row.fields,approval:context.historicalSalesHallApproval,warehouse:warehouse.fields,warehouseSourceKey:warehouse.source_key,warehouseTargetId:warehouse.target_id,requireInitializationMaster:true});
     }
     if(hallEvidence&&(hallEvidence.selected_hall_id!==row.fields.hall_id||hallEvidence.warehouse_id!==row.fields.warehouse_id))fail('SOURCE_RECONCILIATION_HALL_FIELDS_MISMATCH');
     historicalHalls.push({sales_source_key:row.source_key,sales_id:aliases.get(JSON.stringify(['SALES_HEADER',row.source_key]))??null,selected_hall_id:row.fields.hall_id,original_hall_id:hallEvidence?.original_hall_id??null,warehouse_id:row.fields.warehouse_id,warehouse_current_hall_id:(warehouses.get(String(row.fields.warehouse_id)) as {fields:Record<string,unknown>}|undefined)?.fields.hall_id??null,salesperson_id:row.fields.salesperson_id,salesperson_current_hall_id:staff.get(String(row.fields.salesperson_id))??null,source_refs:structuredClone(row.source_refs),historical_hall_evidence:hallEvidence?structuredClone(hallEvidence):null,target_record_sha256:requestHash(row)});
    }
    if(row.zero_amount_archive!==undefined){for(const archive of validateZeroAmountArchive(row.zero_amount_archive,{sourceNamespace:m.source_namespace,salesSourceKey:row.source_key,sourceFileHashes:sourceHashes})){archiveRows++;bind(table,row,recordHash,archive);}}
   }else if(row.zero_amount_archive!==undefined)fail('SOURCE_RECONCILIATION_ARCHIVE_PARENT_INVALID');
  }
 }
 if(usedGroups.size!==groups.size||sourceRecords!==ledger.source_occurrences.length)fail('SOURCE_RECONCILIATION_TARGET_MISSING');
 if(context.explicitZeroApproval&&approvalRows.size!==explicitZeroApprovalDescriptor(context.explicitZeroApproval).record_count)fail('SOURCE_RECONCILIATION_ZERO_APPROVAL_COVERAGE');
 const result={format_version:'SOURCE_OCCURRENCE_RECONCILIATION_V1' as const,state:'DECLARED_SOURCE_OCCURRENCES_MATCH_PACKAGE' as const,evidence_sha256:evidence.sha256,manifest_value_sha256:ledger.manifest_value_sha256,source_namespace:m.source_namespace,source_truth_verified:false as const,business_database_writes:false as const,counts:{original_source_occurrences:sourceRecords,standard_target_rows:targetRows,mapped_standard_target_rows:targetRows-approvedZeros.length,zero_amount_archive_occurrences:archiveRows,funds_action_count:fundsActions,approved_absence_zero_targets:approvedZeros.length,listed_inventory_zero_targets:listedZeroRows,historical_hall_relations:historicalHalls.length,historical_hall_original:historicalHalls.filter(r=>r.historical_hall_evidence?.basis==='ORIGINAL').length,historical_hall_migration_derived:historicalHalls.filter(r=>r.historical_hall_evidence?.basis==='MIGRATION_DERIVED').length,historical_hall_pending_review:historicalHalls.filter(r=>r.historical_hall_evidence?.basis==='PENDING_REVIEW').length,historical_hall_unclassified:historicalHalls.filter(r=>r.historical_hall_evidence===null).length,historical_hall_differences:historicalHalls.filter(r=>r.historical_hall_evidence?.has_difference).length,historical_hall_review_required:historicalHalls.filter(r=>r.historical_hall_evidence?.review_required).length,many_to_one_targets:manyToOne.length},tables:byTable,source_to_target:sourceToTarget,many_to_one:manyToOne,zero_amount_archive:{source_record_count:archiveRows,funds_action_count:0 as const,funds_amount_cents:'0',settlement_state:'NOT_INFERRED'},historical_hall_relations:historicalHalls,approved_explicit_zeros:approvedZeros,limits:{max_occurrences:limit},remaining_checks:['Original-source census completeness and raw-value truth require independent source review.','Scalar value conservation and PostgreSQL readback are separate checks.']};
 return store?result:freezeDeep(result);
}

/** Raw bytes are hashed and strict JSON is exhausted before the private V1 capability is registered. */
export async function readSourceOccurrenceFile(path:string,trustedSha256:string):Promise<SourceOccurrenceEvidence>{
 const {readOccurrenceFileWithRegister}=await import('../../../tools/unified-import/source-occurrence-file-reader.mjs');
 return readOccurrenceFileWithRegister(path,trustedSha256,registerSourceOccurrenceLedger);
}
