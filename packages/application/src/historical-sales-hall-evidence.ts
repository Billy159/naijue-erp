export interface HistoricalSalesHallEvidenceV1 {
 readonly format_version:'HISTORICAL_SALES_HALL_EVIDENCE_V1';
 readonly basis:'ORIGINAL'|'MIGRATION_DERIVED'|'PENDING_REVIEW';
 readonly original_hall_id:string|null; readonly selected_hall_id:string|null;
 readonly warehouse_id:string; readonly warehouse_hall_id_at_capture:string|null;
 readonly warehouse_version:number|null; readonly captured_at:string|null;
 readonly has_difference:boolean; readonly review_required:boolean;
}

const keys=['format_version','basis','original_hall_id','selected_hall_id','warehouse_id','warehouse_hall_id_at_capture','warehouse_version','captured_at','has_difference','review_required'];
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const closed=(v:unknown,fields:readonly string[]):v is Record<string,any>=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).length===fields.length&&fields.every(k=>{const d=Object.getOwnPropertyDescriptor(v,k);return d?.enumerable&&Object.hasOwn(d,'value');});
const fail=(ok:unknown,code:string):void=>{if(!ok)throw Error(code);};
function capturedInstant(value:unknown):boolean {
 if(typeof value!=='string')return false;
 const m=/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.\d{1,9})?(?:Z|[+-]\d\d:\d\d)$/.exec(value);
 if(!m||!Number.isFinite(Date.parse(value)))return false;
 const [year,month,day,hour,minute,second]=m.slice(1).map(Number),leap=year!%4===0&&(year!%100!==0||year!%400===0);
 return year!>0&&month!>=1&&month!<=12&&day!>=1&&day!<=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31][month!-1]!&&hour!<24&&minute!<60&&second!<60;
}
/** Shape validation is not source authorization. Useful for truthful readback. */
function parseV1(value:unknown):HistoricalSalesHallEvidenceV1 {
 fail(closed(value,keys),'HISTORICAL_HALL_EVIDENCE_SHAPE');const v=value as Record<string,any>;
 fail(v.format_version==='HISTORICAL_SALES_HALL_EVIDENCE_V1'&&['ORIGINAL','MIGRATION_DERIVED','PENDING_REVIEW'].includes(v.basis)&&uuid(v.warehouse_id)
  &&[v.original_hall_id,v.selected_hall_id,v.warehouse_hall_id_at_capture].every(x=>x===null||uuid(x))&&typeof v.has_difference==='boolean'&&typeof v.review_required==='boolean','HISTORICAL_HALL_EVIDENCE_SHAPE');
 const captured=v.warehouse_version!==null||v.captured_at!==null;
 fail(captured ? Number.isSafeInteger(v.warehouse_version)&&v.warehouse_version>0&&v.warehouse_version<=2147483647&&capturedInstant(v.captured_at) : v.warehouse_hall_id_at_capture===null,'HISTORICAL_HALL_CAPTURE_REQUIRED');
 if(v.basis==='ORIGINAL')fail(v.original_hall_id!==null&&v.selected_hall_id===v.original_hall_id&&v.has_difference===(v.warehouse_hall_id_at_capture!==null&&v.original_hall_id!==v.warehouse_hall_id_at_capture)&&v.review_required===(v.has_difference||v.warehouse_hall_id_at_capture===null),'HISTORICAL_HALL_ORIGINAL_CONFLICT');
 else if(v.basis==='MIGRATION_DERIVED')fail(v.original_hall_id===null&&v.warehouse_hall_id_at_capture!==null&&v.selected_hall_id===v.warehouse_hall_id_at_capture&&!v.has_difference&&!v.review_required&&captured,'HISTORICAL_HALL_DERIVATION_INVALID');
 else fail(v.original_hall_id===null&&v.selected_hall_id===null&&v.warehouse_hall_id_at_capture===null&&!v.has_difference&&v.review_required,'HISTORICAL_HALL_PENDING_INVALID');
 return Object.freeze({...v}) as HistoricalSalesHallEvidenceV1;
}
/** Derive only from the supplied trusted observation; never look up by a name/code.
 * Caller must authenticate the source and captured warehouse snapshot separately. */
export function buildHistoricalSalesHallEvidence(input:{originalHallId:string|null;warehouseId:string;warehouseHallId:string|null;warehouseVersion:number|null;capturedAt:string|null}):HistoricalSalesHallEvidenceV1 {
 const original=input.originalHallId,observed=input.warehouseHallId,difference=original!==null&&observed!==null&&original!==observed;
 return parseV1({format_version:'HISTORICAL_SALES_HALL_EVIDENCE_V1',basis:original!==null?'ORIGINAL':observed!==null?'MIGRATION_DERIVED':'PENDING_REVIEW',original_hall_id:original,selected_hall_id:original??observed,warehouse_id:input.warehouseId,warehouse_hall_id_at_capture:observed,warehouse_version:input.warehouseVersion,captured_at:input.capturedAt,has_difference:difference,review_required:difference||observed===null});
}

export interface HistoricalHallSourceCapture {
 readonly capture_evidence_sha256:string;readonly source_namespace:string;readonly warehouse_source_key:string;readonly runtime_warehouse_id:string;
 readonly source_native_version:number|null;readonly effective_version:number;readonly runtime_hall_ids:readonly string[];
 readonly captured_at:string;readonly transaction_snapshot:string;readonly relation_basis:string;
}
export interface HistoricalHallEvidenceReference {readonly evidence_sha256:string;readonly record_key:string;}
export interface HistoricalSalesHallEvidenceV2 {
 readonly format_version:'HISTORICAL_SALES_HALL_EVIDENCE_V2';readonly basis:'MIGRATION_DERIVED';
 readonly original_hall_id:null;readonly selected_hall_id:string;readonly warehouse_id:string;
 readonly target_snapshot:{readonly warehouse_id:string;readonly hall_id:string;readonly version:number;readonly captured_at:string};
 readonly source_capture:HistoricalHallSourceCapture;readonly identity_bridge:HistoricalHallEvidenceReference;
 readonly resolution:HistoricalHallEvidenceReference|null;readonly has_difference:boolean;readonly review_required:boolean;
}
export type HistoricalSalesHallEvidence=HistoricalSalesHallEvidenceV1|HistoricalSalesHallEvidenceV2;
export type HistoricalSalesHallInitializationIntent=Omit<HistoricalSalesHallEvidenceV2,'target_snapshot'>&{readonly target_snapshot:{readonly warehouse_id:string;readonly hall_id:string;readonly version:number;readonly captured_at:null}};
export type HistoricalSalesHallInputEvidence=HistoricalSalesHallEvidence|HistoricalSalesHallInitializationIntent;
export function isHistoricalHallInitializationIntent(value:HistoricalSalesHallInputEvidence):value is HistoricalSalesHallInitializationIntent{return value.format_version==='HISTORICAL_SALES_HALL_EVIDENCE_V2'&&value.target_snapshot.captured_at===null;}
const text=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=4096&&!/[\u0000-\u001f\u007f]/.test(v);
const digest=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const version=(v:unknown,min:number)=>Number.isSafeInteger(v)&&Number(v)>=min&&Number(v)<=2147483647;
const reference=(v:unknown)=>closed(v,['evidence_sha256','record_key'])&&digest(v.evidence_sha256)&&text(v.record_key);
const freeze=<T>(v:T):T=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v)}return v};
export function parseHistoricalHallSourceCapture(value:unknown):HistoricalHallSourceCapture {
 fail(closed(value,['capture_evidence_sha256','source_namespace','warehouse_source_key','runtime_warehouse_id','source_native_version','effective_version','runtime_hall_ids','captured_at','transaction_snapshot','relation_basis']),'HISTORICAL_HALL_SOURCE_CAPTURE_SHAPE');
 const v=value as Record<string,any>;
 fail(digest(v.capture_evidence_sha256)&&text(v.source_namespace)&&text(v.warehouse_source_key)&&uuid(v.runtime_warehouse_id)&&(v.source_native_version===null||version(v.source_native_version,0))&&version(v.effective_version,0)&&Array.isArray(v.runtime_hall_ids)&&v.runtime_hall_ids.length>=1&&v.runtime_hall_ids.length<=100&&v.runtime_hall_ids.every(uuid)&&new Set(v.runtime_hall_ids).size===v.runtime_hall_ids.length&&capturedInstant(v.captured_at)&&text(v.transaction_snapshot)&&text(v.relation_basis),'HISTORICAL_HALL_SOURCE_CAPTURE_SHAPE');
 return freeze(structuredClone(v)) as HistoricalHallSourceCapture;
}
function parseEvidence(value:unknown,allowIntent:boolean):HistoricalSalesHallInputEvidence {
 if(value&&typeof value==='object'&&Object.getOwnPropertyDescriptor(value,'format_version')?.value==='HISTORICAL_SALES_HALL_EVIDENCE_V1')return parseV1(value);
 fail(closed(value,['format_version','basis','original_hall_id','selected_hall_id','warehouse_id','target_snapshot','source_capture','identity_bridge','resolution','has_difference','review_required']),'HISTORICAL_HALL_EVIDENCE_SHAPE');
 const v=value as Record<string,any>;
 fail(v.format_version==='HISTORICAL_SALES_HALL_EVIDENCE_V2'&&v.basis==='MIGRATION_DERIVED'&&v.original_hall_id===null&&uuid(v.selected_hall_id)&&uuid(v.warehouse_id)&&typeof v.has_difference==='boolean'&&typeof v.review_required==='boolean','HISTORICAL_HALL_EVIDENCE_SHAPE');
 const t=v.target_snapshot;
 fail(closed(t,['warehouse_id','hall_id','version','captured_at'])&&t.warehouse_id===v.warehouse_id&&t.hall_id===v.selected_hall_id&&version(t.version,1)&&(capturedInstant(t.captured_at)||allowIntent&&t.captured_at===null),'HISTORICAL_HALL_TARGET_SNAPSHOT_INVALID');
 const capture=parseHistoricalHallSourceCapture(v.source_capture);
 fail(reference(v.identity_bridge)&&(v.resolution===null||reference(v.resolution)),'HISTORICAL_HALL_EVIDENCE_REFERENCE_INVALID');
 const difference=capture.runtime_hall_ids.length>1;
 fail(v.has_difference===difference&&v.review_required===(difference&&v.resolution===null)&&(!difference?v.resolution===null:true),'HISTORICAL_HALL_RESOLUTION_REQUIRED');
 return freeze({...structuredClone(v),source_capture:capture}) as HistoricalSalesHallEvidenceV2|HistoricalSalesHallInitializationIntent;
}
/** Final readback never accepts an unobserved initialization intent. */
export function parseHistoricalSalesHallEvidence(value:unknown):HistoricalSalesHallEvidence{return parseEvidence(value,false) as HistoricalSalesHallEvidence;}
/** Input shape only; an external MASTER member and same-transaction SQL proof are still required. */
export function parseHistoricalSalesHallInputEvidence(value:unknown):HistoricalSalesHallInputEvidence{return parseEvidence(value,true);}
/** The caller supplies actual target and source observations separately. Parsing
 * neither authenticates the external members nor invents a target capture. */
export function buildHistoricalSalesHallEvidenceV2(value:Omit<HistoricalSalesHallEvidenceV2,'format_version'>):HistoricalSalesHallEvidenceV2 {
 return parseHistoricalSalesHallEvidence({...value,format_version:'HISTORICAL_SALES_HALL_EVIDENCE_V2'}) as HistoricalSalesHallEvidenceV2;
}

export function buildHistoricalSalesHallInitializationIntent(value:Omit<HistoricalSalesHallInitializationIntent,'format_version'>):HistoricalSalesHallInitializationIntent{const parsed=parseHistoricalSalesHallInputEvidence({...value,format_version:'HISTORICAL_SALES_HALL_EVIDENCE_V2'});fail(isHistoricalHallInitializationIntent(parsed),'HISTORICAL_HALL_INITIALIZATION_INTENT_REQUIRED');return parsed as HistoricalSalesHallInitializationIntent;}
