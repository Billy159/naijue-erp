// Pure seam between the two completed captures and ORIGINAL header chunk/store.
// No source reads, database, authorization grant, sorting or publication here.
import assert from 'node:assert/strict';
const need=(v,c)=>{if(!v)throw Object.assign(Error(c),{code:c});};
function local(value){if(value===null)return null;const m=/^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,6}))?$/.exec(value);need(m,'SALES_HEADER_LOCAL');return m[1]+'.'+(m[2]??'').padEnd(6,'0');}
function instant(value){if(value===null)return null;const m=/^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,6}))?(Z|[+-]\d\d:\d\d)$/.exec(value);need(m,'SALES_HEADER_INSTANT');const n=Date.parse(m[1]+m[3]);need(Number.isFinite(n),'SALES_HEADER_INSTANT');return new Date(n).toISOString().slice(0,19)+'.'+(m[2]??'').padEnd(6,'0')+'Z';}
export function salesHeaderProjection26(project,p){
 const s=p.source,h=p.header;need(p.entity==='SALES_HEADER'&&typeof h.hallId==='string','SALES_HEADER_ENTITY');
 const typed={id:h.id,source_row_id:h.sourceRowId,batch_id:h.batchId,version:h.version,number:h.number,business_date:h.businessDate,source_status:h.sourceStatus,note:h.note,
  created_by_source_key:h.createdBySourceKey,approved_by_source_key:h.approvedBySourceKey,created_hall_id:h.createdHallId,created_hall_provenance:h.createdHallProvenance,created_hall_reason:h.createdHallReason,
  created_local_at:local(h.createdLocalAt),updated_local_at:local(h.updatedLocalAt),approved_local_at:local(h.approvedLocalAt),created_instant:instant(h.createdInstant),updated_instant:instant(h.updatedInstant),approved_instant:instant(h.approvedInstant),
  business_type:h.businessType,hall_id:h.hallId,customer_id:h.customerId,warehouse_id:h.warehouseId,salesperson_id:h.salespersonId,gross_amount:h.grossAmount,order_discount:h.orderDiscount,net_due:h.netDue};
 const evidence={id:s.id,batch_id:s.batchId,entity_type:s.entityType,source_key:s.sourceKey,file_ref:s.fileRef,sheet:s.sheet,row_no:s.rowNo,source_file_sha256:s.sourceFileSha256,row_sha256:s.rowSha256,raw_fields:s.rawFields,normalized_fields:s.normalizedFields,
  field_provenance:{...p.fieldProvenance,history_header_staging:{validator_version:'V3_HISTORY_HEADER_STAGE_1',fingerprint:p.fingerprint,selection:p.selection}}};
 return{sourceRow:project('import_source_row',evidence),typedRow:project('history_sales_header',typed),document:{kind:'SALES',sourceKey:s.sourceKey,headerSourceRowId:s.id,headerId:h.id}};
}
/** items <=100; caller bounds UTF8 bytes using the original chunk constructor.
 * Restoring32 is required staging input work, NOT recapturing original history.
 * A step with unknown COMMIT must recover these original keys, never new IDs.
 */ 
export function prepareRetainedSalesHeaderWindow(source,{binding,items,moneyApprovals}){
 need(Array.isArray(items)&&items.length>0&&items.length<=100&&moneyApprovals instanceof Map&&moneyApprovals.size===32,'SALES_HEADER_RETAINED_WINDOW');
 const saved=[],inputs=items.map(({partition,value})=>{
  need(['KNOWN25811','MAPPED2471'].includes(partition)&&value?.prepared&&value.decision,'SALES_HEADER_CAPTURE_FORMAT');
  let input;
  if(partition==='KNOWN25811'){
   need(value.record&&!Object.hasOwn(value,'input'),'SALES_HEADER_KNOWN_FORMAT');
   input={batchId:binding.batchId,fixedSourceNamespace:binding.fixedSourceNamespace,...value.record,bindings:value.decision.bindings,moneyApprovals:structuredClone(moneyApprovals)};
   need(input.source.rawFields.所属厅来源编号!==''&&input.source.normalizedFields.所属厅来源编号===input.source.rawFields.所属厅来源编号,'SALES_HEADER_KNOWN_HALL');
  }else{
   need(value.originalRecord&&value.input?.businessHallOverlay&&!Object.hasOwn(value.input,'moneyApprovals'),'SALES_HEADER_MAPPED_FORMAT');
   input={...structuredClone(value.input),moneyApprovals:structuredClone(moneyApprovals)};
   need(value.originalRecord.source.rawFields.所属厅来源编号===''&&value.originalRecord.source.normalizedFields.所属厅来源编号==='','SALES_HEADER_MAPPED_ORIGINAL');
   assert.deepEqual(input.source.rawFields,value.originalRecord.source.rawFields);
   assert.deepEqual(input.source.normalizedFields,{...value.originalRecord.source.normalizedFields,所属厅来源编号:input.businessHallOverlay.targetHallSourceKey});
   for(const key of ['id','sourceKey','sourceFileSha256','rowSha256','fileRef','sheet','rowNo'])assert.deepEqual(input.source[key],value.originalRecord.source[key]);
   assert.deepEqual(input.creatorHallOverlay,value.originalRecord.creatorHallOverlay);assert.deepEqual(input.temporalEvidence,value.originalRecord.temporalEvidence);
  }
  need(input.batchId===binding.batchId&&input.fixedSourceNamespace===binding.fixedSourceNamespace&&input.selection.selectionSha256===binding.selectionSha256,'SALES_HEADER_RETAINED_BINDING');
  need(value.decision.sourceRowId===input.source.id&&value.decision.sourceKey===input.source.sourceKey&&value.decision.preparedFingerprint===value.prepared.fingerprint,'SALES_HEADER_ORIGINAL_DECISION');
  saved.push(value);return input;
 });
 const chunk=source.prepareV3HistoryHeaderChunk(inputs);source.validatePreparedHistoryHeaderChunk(chunk);
 const projections=chunk.rows.map((row,i)=>{assert.deepEqual(row.prepared,saved[i].prepared);assert.deepEqual(row.prepared.header,saved[i].decision.header);
  return salesHeaderProjection26(source.historyClosureProjectionRow26,row.prepared);});
 return{chunk,projections,keys:chunk.rows.map(r=>({sourceKey:r.prepared.source.sourceKey,sourceRowId:r.prepared.source.id,headerId:r.prepared.header.id,fingerprint:r.prepared.fingerprint}))};
}
