export interface HistoricalSalesHallEvidence {
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
export function parseHistoricalSalesHallEvidence(value:unknown):HistoricalSalesHallEvidence {
 fail(closed(value,keys),'HISTORICAL_HALL_EVIDENCE_SHAPE');const v=value as Record<string,any>;
 fail(v.format_version==='HISTORICAL_SALES_HALL_EVIDENCE_V1'&&['ORIGINAL','MIGRATION_DERIVED','PENDING_REVIEW'].includes(v.basis)&&uuid(v.warehouse_id)
  &&[v.original_hall_id,v.selected_hall_id,v.warehouse_hall_id_at_capture].every(x=>x===null||uuid(x))&&typeof v.has_difference==='boolean'&&typeof v.review_required==='boolean','HISTORICAL_HALL_EVIDENCE_SHAPE');
 const captured=v.warehouse_version!==null||v.captured_at!==null;
 fail(captured ? Number.isSafeInteger(v.warehouse_version)&&v.warehouse_version>0&&v.warehouse_version<=2147483647&&capturedInstant(v.captured_at) : v.warehouse_hall_id_at_capture===null,'HISTORICAL_HALL_CAPTURE_REQUIRED');
 if(v.basis==='ORIGINAL')fail(v.original_hall_id!==null&&v.selected_hall_id===v.original_hall_id&&v.has_difference===(v.warehouse_hall_id_at_capture!==null&&v.original_hall_id!==v.warehouse_hall_id_at_capture)&&v.review_required===(v.has_difference||v.warehouse_hall_id_at_capture===null),'HISTORICAL_HALL_ORIGINAL_CONFLICT');
 else if(v.basis==='MIGRATION_DERIVED')fail(v.original_hall_id===null&&v.warehouse_hall_id_at_capture!==null&&v.selected_hall_id===v.warehouse_hall_id_at_capture&&!v.has_difference&&!v.review_required&&captured,'HISTORICAL_HALL_DERIVATION_INVALID');
 else fail(v.original_hall_id===null&&v.selected_hall_id===null&&v.warehouse_hall_id_at_capture===null&&!v.has_difference&&v.review_required,'HISTORICAL_HALL_PENDING_INVALID');
 return Object.freeze({...v}) as HistoricalSalesHallEvidence;
}
/** Derive only from the supplied trusted observation; never look up by a name/code.
 * Caller must authenticate the source and captured warehouse snapshot separately. */
export function buildHistoricalSalesHallEvidence(input:{originalHallId:string|null;warehouseId:string;warehouseHallId:string|null;warehouseVersion:number|null;capturedAt:string|null}):HistoricalSalesHallEvidence {
 const original=input.originalHallId,observed=input.warehouseHallId,difference=original!==null&&observed!==null&&original!==observed;
 return parseHistoricalSalesHallEvidence({format_version:'HISTORICAL_SALES_HALL_EVIDENCE_V1',basis:original!==null?'ORIGINAL':observed!==null?'MIGRATION_DERIVED':'PENDING_REVIEW',original_hall_id:original,selected_hall_id:original??observed,warehouse_id:input.warehouseId,warehouse_hall_id_at_capture:observed,warehouse_version:input.warehouseVersion,captured_at:input.capturedAt,has_difference:difference,review_required:difference||observed===null});
}
