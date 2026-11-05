import { stableImportId } from './inventory-cutoff-import.ts';

/** Source evidence only. These entries are NEVER sales_settlement records and
 * cannot establish payment direction, a money movement, or settlement status.
 * The caller must bind the enclosing sales source row and manifest source pins. */
export const ZERO_AMOUNT_ARCHIVE_PROFILE = 'ZERO_AMOUNT_SOURCE_ARCHIVE_V1' as const;
export interface ZeroArchiveSourceRef {file_sha256:string;sheet:string|null;row:number;}
export interface ZeroArchiveRecord {source_key:string;amount:'0.00';source_refs:ZeroArchiveSourceRef[];original_values:Record<string,string|null>;}
export interface ZeroArchiveContext {sourceNamespace:string;salesSourceKey:string;sourceFileHashes:ReadonlySet<string>;}
export interface RetainedZeroArchiveRecord extends ZeroArchiveRecord {archive_id:string;sales_source_key:string;source_namespace:string;}
const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&(Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
const exact=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).sort().join('\0')===[...keys].sort().join('\0')&&Object.getOwnPropertySymbols(v).length===0&&Object.values(Object.getOwnPropertyDescriptors(v)).every(d=>'value'in d);
const text=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=4096&&!/[\u0000-\u001f]/u.test(v);
const secret=/(?:password|passwd|secret|token|credential|authorization|private.?key|密码|口令|令牌)/iu;
function fail(code:string):never{throw new Error(code);}
export function zeroAmountArchiveId(namespace:string,salesSourceKey:string,sourceKey:string):string{
 if(!text(namespace)||!text(salesSourceKey)||!text(sourceKey))fail('ZERO_ARCHIVE_IDENTITY_REQUIRED');
 return stableImportId('zero-amount-source-archive-v1',namespace,salesSourceKey,sourceKey);
}
export function validateZeroAmountArchive(value:unknown,context:ZeroArchiveContext):RetainedZeroArchiveRecord[]{
 if(!text(context.sourceNamespace)||!text(context.salesSourceKey)||!context.sourceFileHashes||typeof context.sourceFileHashes.has!=='function')fail('ZERO_ARCHIVE_CONTEXT_REQUIRED');
 if(!object(value)||!exact(value,['profile','records'])||value.profile!==ZERO_AMOUNT_ARCHIVE_PROFILE||!Array.isArray(value.records)||value.records.length<1||value.records.length>1000)fail('ZERO_ARCHIVE_SHAPE_INVALID');
 const seen=new Set<string>();const out:RetainedZeroArchiveRecord[]=[];
 for(const row of value.records){
  if(!object(row)||!exact(row,['source_key','amount','source_refs','original_values'])||!text(row.source_key)||row.amount!=='0.00')fail('ZERO_ARCHIVE_RECORD_INVALID');
  if(seen.has(row.source_key))fail('ZERO_ARCHIVE_DUPLICATE_SOURCE_KEY');seen.add(row.source_key);
  if(!Array.isArray(row.source_refs)||row.source_refs.length<1||row.source_refs.length>100)fail('ZERO_ARCHIVE_SOURCE_REQUIRED');
  for(const ref of row.source_refs)if(!object(ref)||!exact(ref,['file_sha256','sheet','row'])||typeof ref.file_sha256!=='string'||!/^[a-f0-9]{64}$/.test(ref.file_sha256)||!context.sourceFileHashes.has(ref.file_sha256)||!(ref.sheet===null||text(ref.sheet))||!Number.isSafeInteger(ref.row)||Number(ref.row)<1||Number(ref.row)>2147483647)fail('ZERO_ARCHIVE_SOURCE_INVALID');
  if(!object(row.original_values)||Object.keys(row.original_values).length<1||Object.keys(row.original_values).length>100||Object.getOwnPropertySymbols(row.original_values).length||!Object.values(Object.getOwnPropertyDescriptors(row.original_values)).every(d=>'value'in d))fail('ZERO_ARCHIVE_ORIGINAL_VALUES_INVALID');
  for(const [key,v]of Object.entries(row.original_values))if(!text(key)||secret.test(key)||!(v===null||typeof v==='string'&&v.length<=16384)||key==='__proto__'||key==='constructor'||key==='prototype')fail('ZERO_ARCHIVE_ORIGINAL_VALUES_INVALID');
  const record=structuredClone(row) as unknown as ZeroArchiveRecord;
  out.push({...record,archive_id:zeroAmountArchiveId(context.sourceNamespace,context.salesSourceKey,record.source_key),sales_source_key:context.salesSourceKey,source_namespace:context.sourceNamespace});
 }
 return out;
}
export function zeroAmountArchiveSummary(rows:readonly RetainedZeroArchiveRecord[]){
 return {source_record_count:rows.length,funds_action_count:0,funds_amount_cents:'0',settlement_state:'NOT_INFERRED'} as const;
}
