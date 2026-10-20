import type {AuthorizedContext} from '../../security/service.js';
import type {SqlValue} from '../../database/session.js';
import {authorizeDocument} from '../../security/policies.js';
import {scopeFromBody,withTransferCreationScope,type Role} from '../../security/repository.js';
import {identifier,invalid,object,SecurityError} from '../../security/errors.js';
import {parseBusinessDay} from '../transactions/decimal.js';

interface TransferRow extends Record<string,unknown> {id:string;body:Record<string,unknown>;version:number;transfer_creator_hall_id:string|null;transfer_creator_account_id:string|null;transfer_creator_role:Role|null;creator:{id:string}|null}
const selection=`d.*,to_char(d.business_day,'YYYY-MM-DD') business_day,r.body,r.original_imported,
  (SELECT jsonb_build_object('id',v.actor_id,'name',o.name) FROM __R__.revision v
    LEFT JOIN __R__.operator o ON o.id=v.actor_id WHERE v.document_id=d.id AND v.revision=1 AND v.actor_id IS NOT NULL) creator`;
export async function transferDetail(context:AuthorizedContext,id:string):Promise<TransferRow> {
  const {repo,session}=context;
  const row=(await session.query<TransferRow>(`SELECT ${selection.replaceAll('__R__',repo.runtime)} FROM ${repo.runtime}.document d
    JOIN ${repo.runtime}.revision r ON r.document_id=d.id AND r.revision=d.current_revision WHERE d.id=$1::uuid AND d.document_type='TRANSFER'`,[id])).rows[0];
  if(!row) throw new SecurityError('NOT_FOUND',404,'调拨单不存在');
  return {...row,history:await transferHistory(context,id)};
}
export async function transferHistory(context:AuthorizedContext,id:string):Promise<Record<string,unknown>[]> {
  const {repo,session,actor}=context;
  const current=await repo.document(id);
  await authorizeDocument(actor,current,'transfers.history',repo);
  const rows=(await session.query<{body:Record<string,unknown>;previous_body:Record<string,unknown>|null} & Record<string,unknown>>(`SELECT h.*,o.name actor_name,r.body,r.original_imported,
    (SELECT p.body FROM ${repo.runtime}.revision p WHERE p.document_id=h.document_id AND p.revision=coalesce(
      (SELECT prev.revision FROM ${repo.runtime}.version_history prev WHERE prev.document_id=h.document_id AND prev.version=h.version-1),h.revision-1)) previous_body,
    (SELECT jsonb_agg(jsonb_build_object('id',p.id,'reason',p.reason,'reversedEffectIdentity',p.reversed_effect_identity) ORDER BY p.id)
      FROM ${repo.runtime}.posting p WHERE p.document_id=h.document_id AND p.actor_id=h.actor_id AND p.request_key=h.request_key
      AND (h.operation='approve' AND p.reason='REVISION_APPROVAL' OR h.operation='unapprove' AND p.reason<>'REVISION_APPROVAL')) postings
    FROM ${repo.runtime}.version_history h JOIN ${repo.runtime}.revision r ON r.document_id=h.document_id AND r.revision=h.revision
    LEFT JOIN ${repo.runtime}.operator o ON o.id=h.actor_id WHERE h.document_id=$1::uuid ORDER BY h.version`,[id])).rows;
  const visible=async(body:Record<string,unknown>):Promise<boolean>=>{
    try {await authorizeDocument(actor,withTransferCreationScope(scopeFromBody('TRANSFER',body),current),'transfers.history',repo);return true;}
    catch(error){if(error instanceof SecurityError&&['SCOPE','FORBIDDEN'].includes(error.code))return false;throw error;}
  };
  const allowed:Record<string,unknown>[]=[];
  for(const row of rows){
    if(!await visible(row.body))continue;
    allowed.push({...row,previous_body:row.previous_body&&await visible(row.previous_body)?row.previous_body:null});
  }
  return allowed;
}
const pageNumber=(raw:unknown,fallback:number,max:number):number=>{
  if(raw===undefined)return fallback;
  if(!/^[1-9]\d*$/.test(String(raw))||!Number.isSafeInteger(Number(raw))||Number(raw)>max)return invalid();return Number(raw);
};
export async function transferList(context:AuthorizedContext,input:unknown):Promise<Record<string,unknown>> {
  const q=object(input),page=pageNumber(q['page'],1,1000000),size=pageNumber(q['size'],20,200);
  if(Object.keys(q).some(k=>!['type','page','size','filters'].includes(k)))return invalid();
  let f:Record<string,unknown>={};
  if(q['filters']!==undefined){if(typeof q['filters']!=='string'||q['filters'].length>8192)return invalid();try{f=object(JSON.parse(q['filters']));}catch{return invalid();}}
  if(Object.keys(f).some(k=>!['start','end','q','from','to','status'].includes(k)))return invalid();
  const values:SqlValue[]=[],where=["d.document_type='TRANSFER'"];
  const add=(expression:string,value:SqlValue):void=>{values.push(value);where.push(expression.replace('?',`$${values.length}`));};
  for(const k of ['start','end'] as const)if(f[k]){try{parseBusinessDay(f[k]);}catch{return invalid();}add(`d.business_day ${k==='start'?'>=':'<='} ?::date`,String(f[k]));}
  if(f['start']&&f['end']&&String(f['start'])>String(f['end']))return invalid();
  if(f['q']){if(typeof f['q']!=='string'||f['q'].length>128)return invalid();add("position(lower(?) in lower(d.number||' '||coalesce(r.body->'header'->>'note','')))>0",f['q']);}
  for(const k of ['from','to'] as const){if(f[k]!==undefined){if(!Array.isArray(f[k])||(f[k] as unknown[]).length>100)return invalid();const ids=(f[k] as unknown[]).map(v=>identifier(v,true));if(ids.length)add(`r.body->'header'->>'source_${k==='from'?'from':'to'}_warehouse_id'=ANY(?::text[])`,ids);}}
  if(f['status']!==undefined){if(!Array.isArray(f['status'])||(f['status'] as unknown[]).length>4)return invalid();const map:Record<string,string>={'已审核':'APPROVED','未审核':'UNAUDITED','已作废':'DELETED','APPROVED':'APPROVED','UNAUDITED':'UNAUDITED','DRAFT':'DRAFT','DELETED':'DELETED'};
    const states=(f['status'] as unknown[]).map(v=>map[String(v)]??invalid());if(states.length)add('d.status=ANY(?::text[])',states);}
  const {repo,session,actor}=context;
  let visibility='';
  if(actor.role==='SALESPERSON'){
    if(!actor.storeId)throw new SecurityError('SCOPE',403,'营业厅归属未知');
    values.push(actor.storeId);const hall=`$${values.length}`;
    // Resolve warehouse membership once per statement in this action's read snapshot.
    // Runtime records shadow source even when their ownership is unknown or empty.
    visibility=`WITH hall_warehouses AS MATERIALIZED (
      SELECT m.id warehouse_id FROM ${repo.runtime}.master_data_entity m WHERE m.kind='warehouses'
        AND coalesce((m.body->>'sourceOwnershipUnknown')::boolean,true)=false
        AND jsonb_typeof(m.body->'hallRelations')='array' AND m.body->'hallRelations' ? ${hall}::uuid::text
      UNION
      SELECT wh.id::text FROM ${repo.source}.tplus_hall h CROSS JOIN LATERAL unnest(h.warehouse_ids) wh(id)
        WHERE h.id::text=${hall}::uuid::text AND h.batch_id=(
          SELECT i.batch_id FROM ${repo.source}.tplus_import_run i WHERE i.status='COMMITTED'
          ORDER BY i.committed_at DESC NULLS LAST,i.started_at DESC LIMIT 1)
        AND NOT EXISTS(SELECT 1 FROM ${repo.runtime}.master_data_entity m WHERE m.kind='warehouses' AND m.id=wh.id::text)
    ) `;
    where.push(`((d.transfer_creator_hall_id=${hall}::uuid AND d.transfer_creator_role='SALESPERSON'
      AND EXISTS(SELECT 1 FROM ${repo.runtime}.revision first WHERE first.document_id=d.id AND first.revision=1 AND first.actor_id=d.transfer_creator_account_id))
      OR r.body#>>'{header,source_from_warehouse_id}' IN (SELECT warehouse_id FROM hall_warehouses)
      OR r.body#>>'{header,source_to_warehouse_id}' IN (SELECT warehouse_id FROM hall_warehouses))`);
  }
  const from=`FROM ${repo.runtime}.document d JOIN ${repo.runtime}.revision r ON r.document_id=d.id AND r.revision=d.current_revision WHERE ${where.join(' AND ')}`;
  const total=Number((await session.query<{total:string}>(`${visibility}SELECT count(*)::text total ${from}`,values)).rows[0]?.total??'0');
  const rows=(await session.query<TransferRow>(`${visibility}SELECT ${selection.replaceAll('__R__',repo.runtime)} ${from} ORDER BY d.business_day DESC NULLS LAST,d.created_at DESC,d.id LIMIT $${values.length+1} OFFSET $${values.length+2}`,[...values,size,(page-1)*size])).rows;
  for(const row of rows)await authorizeDocument(actor,withTransferCreationScope(scopeFromBody('TRANSFER',row.body),{creatorHallId:row.transfer_creator_hall_id,creatorId:row.creator?.id??null,creatorAccountId:row.transfer_creator_account_id,creatorRole:row.transfer_creator_role}),'transfers.list',repo);
  return {items:rows,total,page,size};
}
