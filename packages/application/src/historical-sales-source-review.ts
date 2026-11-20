/** Separate unresolved-source contract. These are raw review facts, never an
 * ordinary sales header, a confirmed hall mapping, or execution authority. */
export const SOURCE_REVIEW_APPROVAL_FORMAT='HISTORICAL_SALES_SOURCE_REVIEW_APPROVAL_V1' as const;
export const SOURCE_REVIEW_PROTOCOL='HISTORICAL_SALES_SOURCE_REVIEW_SQL_V1' as const;
export type SourceReviewEntity='SALES_HEADER'|'SALES_LINE'|'SALES_SETTLEMENT';
export type SourceReviewGrouping='COMPLETE_GROUP'|'ORPHAN'|'AMBIGUOUS';
export interface SourceReviewRef {readonly file_sha256:string;readonly sheet:string|null;readonly row:number;readonly occurrence:number}
export interface SourceReviewRecord {
 readonly source_entity_type:SourceReviewEntity;readonly source_key:string;readonly group_key:string|null;
 readonly source_ref:SourceReviewRef;readonly raw_fields:Readonly<Record<string,string|null>>;
 readonly normalized_fields:Readonly<Record<string,string|null>>|null;readonly normalization_version:string|null;
 readonly raw_warehouse_value:string|null;readonly reliable_original_hall_evidence:string|null;
 readonly reason:'WAREHOUSE_UNRESOLVED';readonly grouping:SourceReviewGrouping;
}
export interface SourceReviewApproval {
 readonly format_version:typeof SOURCE_REVIEW_APPROVAL_FORMAT;readonly source_namespace:string;
 readonly package_manifest_sha256:string;readonly records:readonly SourceReviewRecord[];
}
export interface SourceReviewExpected {
 readonly occurrences:number;readonly headers:number;readonly lines:number;readonly settlements:number;
 readonly known_groups:number;readonly ungrouped_occurrences:number;
}
export const sourceReviewNeed:(ok:unknown,code:string)=>asserts ok=(ok,code)=>{if(!ok)throw Error('SOURCE_REVIEW_'+code)};
export const sourceReviewHash=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export const sourceReviewUuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
export const sourceReviewText=(v:unknown,max=65536):v is string=>typeof v==='string'&&v.length<=max&&!v.includes('\0')&&!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(v);
export function sourceReviewClosed(v:unknown,keys:readonly string[]):v is Record<string,unknown>{
 return v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).length===keys.length&&keys.every(k=>{const d=Object.getOwnPropertyDescriptor(v,k);return d?.enumerable===true&&Object.hasOwn(d,'value')});
}
const nonempty=(v:unknown,max=65536):v is string=>sourceReviewText(v,max)&&v.length>0;
function fields(v:unknown):Readonly<Record<string,string|null>>{
 sourceReviewNeed(v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype,'RAW_FIELDS');
 const keys=Reflect.ownKeys(v);sourceReviewNeed(keys.length<=2048,'RAW_FIELDS_SIZE');const copy:Record<string,string|null>={};
 for(const key of keys){sourceReviewNeed(typeof key==='string'&&nonempty(key,1024)&&!['__proto__','prototype','constructor'].includes(key),'RAW_FIELD_KEY');const d=Object.getOwnPropertyDescriptor(v,key);sourceReviewNeed(d?.enumerable&&Object.hasOwn(d,'value')&&(d.value===null||sourceReviewText(d.value,262144)),'RAW_FIELD_VALUE');Object.defineProperty(copy,key,{value:d.value,enumerable:true});}
 return Object.freeze(copy);
}
export function parseSourceReviewRecord(value:unknown):SourceReviewRecord {
 sourceReviewNeed(sourceReviewClosed(value,['source_entity_type','source_key','group_key','source_ref','raw_fields','normalized_fields','normalization_version','raw_warehouse_value','reliable_original_hall_evidence','reason','grouping']),'RECORD_SHAPE');
 const v=value;sourceReviewNeed(['SALES_HEADER','SALES_LINE','SALES_SETTLEMENT'].includes(v.source_entity_type as string)&&sourceReviewText(v.source_key),'RECORD_IDENTITY');
 sourceReviewNeed(v.group_key===null||nonempty(v.group_key),'GROUP_KEY');
 sourceReviewNeed(['COMPLETE_GROUP','ORPHAN','AMBIGUOUS'].includes(v.grouping as string)&&v.reason==='WAREHOUSE_UNRESOLVED','RECORD_CLASSIFICATION');
 sourceReviewNeed(v.grouping!=='COMPLETE_GROUP'||v.group_key!==null,'COMPLETE_GROUP_KEY');
 sourceReviewNeed(sourceReviewClosed(v.source_ref,['file_sha256','sheet','row','occurrence']),'REF_SHAPE');const r=v.source_ref;
 sourceReviewNeed(sourceReviewHash(r.file_sha256)&&(r.sheet===null||nonempty(r.sheet,1024))&&Number.isSafeInteger(r.row)&&Number(r.row)>=1&&Number(r.row)<=2147483647&&Number.isSafeInteger(r.occurrence)&&Number(r.occurrence)>=0&&Number(r.occurrence)<=2147483647,'REF_VALUE');
 sourceReviewNeed((v.normalized_fields===null)===(v.normalization_version===null)&&(v.normalization_version===null||nonempty(v.normalization_version,256)),'NORMALIZATION_PAIR');
 sourceReviewNeed(v.raw_warehouse_value===null||sourceReviewText(v.raw_warehouse_value),'RAW_WAREHOUSE');
 sourceReviewNeed(v.reliable_original_hall_evidence===null||nonempty(v.reliable_original_hall_evidence),'ORIGINAL_HALL_EVIDENCE');
 return Object.freeze({source_entity_type:v.source_entity_type as SourceReviewEntity,source_key:v.source_key,group_key:v.group_key as string|null,source_ref:Object.freeze({file_sha256:r.file_sha256,sheet:r.sheet as string|null,row:r.row as number,occurrence:r.occurrence as number}),raw_fields:fields(v.raw_fields),normalized_fields:v.normalized_fields===null?null:fields(v.normalized_fields),normalization_version:v.normalization_version as string|null,raw_warehouse_value:v.raw_warehouse_value as string|null,reliable_original_hall_evidence:v.reliable_original_hall_evidence as string|null,reason:'WAREHOUSE_UNRESOLVED',grouping:v.grouping as SourceReviewGrouping});
}
/** Complete means an explicitly reviewed group, not a successful import. Orphans
 * and ambiguous occurrences remain separate and are never assigned a group. */
export function sourceReviewExpectedCounts(records:readonly SourceReviewRecord[]):SourceReviewExpected {
 const complete=new Map<string,SourceReviewRecord[]>(),unresolvedGroups=new Set<string>();let headers=0,lines=0,settlements=0,ungrouped=0;
 for(const r of records){if(r.source_entity_type==='SALES_HEADER')headers++;else if(r.source_entity_type==='SALES_LINE')lines++;else settlements++;
  if(r.grouping==='COMPLETE_GROUP'){const key=r.group_key!;const group=complete.get(key)||[];group.push(r);complete.set(key,group)}else {ungrouped++;if(r.group_key!==null)unresolvedGroups.add(r.group_key);}
 }
 for(const [key,group] of complete){const heads=group.filter(r=>r.source_entity_type==='SALES_HEADER');sourceReviewNeed(heads.length===1&&heads[0]!.source_key===key,'GROUP_HEADER_CLOSURE');sourceReviewNeed(!unresolvedGroups.has(key),'GROUP_CLASSIFICATION_CONFLICT');}
 return Object.freeze({occurrences:records.length,headers,lines,settlements,known_groups:complete.size,ungrouped_occurrences:ungrouped});
}
/** SOURCE_REVIEW_RECORD_HASH_V1: hash the exact UTF-8 of this ordered tuple.
 * SQL compares parsed JSON to this tuple and hashes original UTF-8, never jsonb::text. */
export function sourceReviewRecordPreimage(namespace:string,r:SourceReviewRecord):string {
 return JSON.stringify([namespace,r.source_entity_type,r.source_key,r.group_key,r.source_ref.file_sha256,r.source_ref.sheet,r.source_ref.row,r.source_ref.occurrence,r.raw_fields,r.normalized_fields,r.normalization_version,r.raw_warehouse_value,r.reliable_original_hall_evidence,r.reason,r.grouping]);
}
