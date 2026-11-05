import {createHash} from 'node:crypto';
import {decodeUtf8,parseStrictJson} from './unified-import-contract.ts';
import {SOURCE_REVIEW_APPROVAL_FORMAT,sourceReviewClosed,sourceReviewHash,sourceReviewNeed,sourceReviewText,parseSourceReviewRecord,sourceReviewExpectedCounts,sourceReviewRecordPreimage,type SourceReviewApproval,type SourceReviewExpected,type SourceReviewRecord} from './historical-sales-source-review.ts';
const hash=(v:Uint8Array|string)=>createHash('sha256').update(v).digest('hex');
export const SOURCE_REVIEW_LIMITS=Object.freeze({approvalBytes:64*1024*1024,records:250000,recordBytes:1024*1024,approvalSegmentBytes:1024*1024,commandBytes:8*1024*1024,chunkRecords:1000});
export interface SourceReviewCaptureRecord {readonly id:string;readonly occurrence_key:string;readonly source_record_sha256:string;readonly source_hash_preimage:string;readonly source:SourceReviewRecord}
interface Verified {readonly bytes:Uint8Array;readonly sha256:string;readonly captures:readonly SourceReviewCaptureRecord[];readonly expected:SourceReviewExpected}
const verified=new WeakMap<object,Verified>();
export function sourceReviewOccurrenceKey(namespace:string,r:SourceReviewRecord):string{return hash(JSON.stringify([namespace,r.source_entity_type,r.source_ref.file_sha256,r.source_ref.sheet,r.source_ref.row,r.source_ref.occurrence]));}
/** RFC 9562 version-8 UUID from the occurrence SHA256. This is a
 * capture identity, never an invented warehouse, hall or ordinary target ID. */
export function sourceReviewRecordId(occurrenceKey:string):string{sourceReviewNeed(sourceReviewHash(occurrenceKey),'OCCURRENCE_HASH');let v=occurrenceKey.slice(0,32).split('');v[12]='8';v[16]=((parseInt(v[16]!,16)&3)|8).toString(16);const s=v.join('');return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`;}
/** Exact UTF-8 octet budget for PostgreSQL jsonb::text on this protocol's
 * JSON values: object colons and every structural comma have one following
 * space. Key ordering changes no byte count. Only finite safe integers occur
 * in protocol data; unsupported numbers/objects/getters are rejected. */
export function projectedJsonbTextBytes(value:unknown):number {
 const active=new WeakSet<object>();
 const stringBytes=(v:string)=>{sourceReviewNeed(sourceReviewText(v,Number.MAX_SAFE_INTEGER),'JSONB_TEXT_STRING');return Buffer.byteLength(JSON.stringify(v),'utf8');};
 const visit=(v:unknown):number=>{
  if(v===null)return 4;if(typeof v==='boolean')return v?4:5;if(typeof v==='string')return stringBytes(v);
  if(typeof v==='number'){sourceReviewNeed(Number.isSafeInteger(v),'JSONB_TEXT_NUMBER');return Buffer.byteLength(JSON.stringify(v),'utf8');}
  sourceReviewNeed(v!==null&&typeof v==='object'&&!active.has(v),'JSONB_TEXT_OBJECT');active.add(v);
  let size=2;
  if(Array.isArray(v)){
   sourceReviewNeed(Object.getPrototypeOf(v)===Array.prototype&&Reflect.ownKeys(v).length===v.length+1,'JSONB_TEXT_ARRAY');
   for(let i=0;i<v.length;i++){const d=Object.getOwnPropertyDescriptor(v,String(i));sourceReviewNeed(d?.enumerable&&Object.hasOwn(d,'value'),'JSONB_TEXT_PROPERTY');size+=visit(d.value)+(i?2:0);}
  }else{
   sourceReviewNeed(Object.getPrototypeOf(v)===Object.prototype,'JSONB_TEXT_OBJECT');let count=0;
   for(const key of Reflect.ownKeys(v)){const d=Object.getOwnPropertyDescriptor(v,key);sourceReviewNeed(typeof key==='string'&&d?.enumerable&&Object.hasOwn(d,'value'),'JSONB_TEXT_PROPERTY');size+=stringBytes(key)+2+visit(d.value)+(count++?2:0);}
  }
  active.delete(v);return size;
 };
 return visit(value);
}
/** No floating-point test can distinguish 1 from a nonintegral decimal rounded
 * to 1. Validate original numeric lexemes from Node24 JSON.parse context after
 * parseStrictJson has already rejected duplicate keys. Only coordinates are
 * numeric in the approval schema. Raw field strings are never interpreted. */
function assertExactCoordinateNumbers(text:string):void {
 const exact=(lexeme:string,value:number)=>{
  const match=/^(-?)([0-9]+)(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]+))?$/.exec(lexeme);
  sourceReviewNeed(match,'COORDINATE_NUMBER_LEXEME');const fraction=match[3]??'',exponent=Number(match[4]??'0');
  sourceReviewNeed(Number.isSafeInteger(exponent),'COORDINATE_NUMBER_EXPONENT');
  // PostgreSQL unconstrained numeric/jsonb input bounds. No giant expanded
  // strings, BigInt powers or floating-point rounding are used for this check.
  sourceReviewNeed(Math.max(0,match[2]!.length+exponent)<=131072&&Math.max(0,fraction.length-exponent)<=16383,'COORDINATE_NUMBER_RANGE');
  const digits=(match[2]!+fraction).replace(/^0+/,'');if(!digits){sourceReviewNeed(value===0,'COORDINATE_NUMBER_VALUE');return;}
  sourceReviewNeed(match[1]!=='-','COORDINATE_NUMBER_RANGE');const scale=fraction.length-exponent;let integer:string;
  if(scale>0){sourceReviewNeed(scale<digits.length&&/^0*$/.test(digits.slice(-scale)),'COORDINATE_NUMBER_INTEGER');integer=digits.slice(0,-scale);}
  else{sourceReviewNeed(digits.length-scale<=10,'COORDINATE_NUMBER_RANGE');integer=digits+'0'.repeat(-scale);}
  sourceReviewNeed(integer.length<=10&&Number(integer)<=2147483647&&Number(integer)===value,'COORDINATE_NUMBER_RANGE');
 };
 const parse=JSON.parse as unknown as (text:string,reviver:(key:string,value:unknown,context?:{source?:string})=>unknown)=>unknown;
 parse(text,(_key,value,context)=>{if(typeof value==='number'){sourceReviewNeed(typeof context?.source==='string','NUMBER_SOURCE_REQUIRED');exact(context.source,value);}return value;});
}
export function readSourceReviewApproval(input:{bytes:Uint8Array;trustedSha256:string;sourceNamespace:string;packageManifestSha256:string;sourceHashes:ReadonlySet<string>}):SourceReviewApproval {
 sourceReviewNeed(input.bytes.byteLength>0&&input.bytes.byteLength<=SOURCE_REVIEW_LIMITS.approvalBytes,'APPROVAL_SIZE');
 const bytes=Uint8Array.from(input.bytes);sourceReviewNeed(sourceReviewHash(input.trustedSha256)&&hash(bytes)===input.trustedSha256,'APPROVAL_HASH');
 const text=decodeUtf8(bytes),v=parseStrictJson(text);assertExactCoordinateNumbers(text);sourceReviewNeed(sourceReviewClosed(v,['format_version','source_namespace','package_manifest_sha256','records']),'APPROVAL_SHAPE');
 sourceReviewNeed(v.format_version===SOURCE_REVIEW_APPROVAL_FORMAT&&typeof v.source_namespace==='string'&&v.source_namespace.length<=256&&/^[a-z][a-z0-9_.:-]*$/.test(v.source_namespace)&&v.source_namespace===input.sourceNamespace&&sourceReviewHash(v.package_manifest_sha256)&&v.package_manifest_sha256===input.packageManifestSha256,'APPROVAL_SOURCE');
 sourceReviewNeed(Array.isArray(v.records)&&v.records.length>0&&v.records.length<=SOURCE_REVIEW_LIMITS.records,'APPROVAL_RECORDS');
 const records=v.records.map(parseSourceReviewRecord),seen=new Set<string>(),ids=new Set<string>(),captures:SourceReviewCaptureRecord[]=[];
 for(const r of records){sourceReviewNeed(input.sourceHashes.has(r.source_ref.file_sha256),'SOURCE_FILE_PIN');const occurrence_key=sourceReviewOccurrenceKey(v.source_namespace,r),id=sourceReviewRecordId(occurrence_key);sourceReviewNeed(!seen.has(occurrence_key)&&!ids.has(id),'DUPLICATE_OCCURRENCE');seen.add(occurrence_key);ids.add(id);const source_hash_preimage=sourceReviewRecordPreimage(v.source_namespace,r);sourceReviewNeed(Buffer.byteLength(source_hash_preimage,'utf8')<=SOURCE_REVIEW_LIMITS.recordBytes,'RECORD_SIZE');captures.push(Object.freeze({id,occurrence_key,source_record_sha256:hash(source_hash_preimage),source_hash_preimage,source:r}));}
 const approval=Object.freeze({format_version:SOURCE_REVIEW_APPROVAL_FORMAT,source_namespace:v.source_namespace,package_manifest_sha256:v.package_manifest_sha256,records:Object.freeze(records)});
 verified.set(approval,{bytes,sha256:input.trustedSha256,captures:Object.freeze(captures),expected:sourceReviewExpectedCounts(records)});return approval;
}
function proof(a:SourceReviewApproval):Verified{const p=verified.get(a);sourceReviewNeed(p,'GENUINE_APPROVAL_REQUIRED');return p;}
/** No connection, command execution, host admission or durable-state assertion. */
export function sourceReviewOfflineSummary(a:SourceReviewApproval){const p=proof(a);return Object.freeze({scope:'SOURCE_REVIEW_APPROVAL_ONLY_OFFLINE' as const,approval_sha256:p.sha256,package_manifest_sha256:a.package_manifest_sha256,approval_bytes:p.bytes.byteLength,expected:p.expected,checks_passed:true,source_files_read:false,database_connected:false,persisted:false,fresh_bootstrap_closed:false,reprocessing_implemented:false,exclusions:0});}
/** Sensitive full capture stays internal or in a deliberate review artifact; do
 * not print this alongside the public count/hash-only summary. */
export function sourceReviewCaptureRecords(a:SourceReviewApproval):readonly SourceReviewCaptureRecord[]{return proof(a).captures;}
export function sourceReviewApprovalSegments(a:SourceReviewApproval):readonly {readonly offset:number;readonly bytes_base64:string}[]{const p=proof(a),out=[];for(let offset=0;offset<p.bytes.byteLength;offset+=SOURCE_REVIEW_LIMITS.approvalSegmentBytes)out.push(Object.freeze({offset,bytes_base64:Buffer.from(p.bytes.subarray(offset,offset+SOURCE_REVIEW_LIMITS.approvalSegmentBytes)).toString('base64')}));return Object.freeze(out);}
/** Bounded capture payloads only. A later reviewed host must still provide its
 * authenticated target, sequence and operation keys; these are not commands. */
export function sourceReviewCapturePayloads(a:SourceReviewApproval):readonly {readonly records:readonly SourceReviewCaptureRecord[]}[]{
 const out:{readonly records:readonly SourceReviewCaptureRecord[]}[]=[];let rows:SourceReviewCaptureRecord[]=[],wireBytes=14,pgBytes=15;
 const budget=SOURCE_REVIEW_LIMITS.commandBytes-65536;
 for(const r of proof(a).captures){const wire=Buffer.byteLength(JSON.stringify(r),'utf8'),pg=projectedJsonbTextBytes(r);
  sourceReviewNeed(wire+14<=budget&&pg+15<=budget,'CAPTURE_TOO_LARGE');
  if(rows.length===SOURCE_REVIEW_LIMITS.chunkRecords||wireBytes+wire+(rows.length?1:0)>budget||pgBytes+pg+(rows.length?2:0)>budget){out.push(Object.freeze({records:Object.freeze(rows)}));rows=[];wireBytes=14;pgBytes=15;}
  wireBytes+=wire+(rows.length?1:0);pgBytes+=pg+(rows.length?2:0);rows.push(r);
 }
 if(rows.length)out.push(Object.freeze({records:Object.freeze(rows)}));return Object.freeze(out);
}
