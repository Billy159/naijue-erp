import type {AuthorizedContext} from '../../security/service.js';
import type {SqlValue} from '../../database/session.js';
import {authorizeDocument} from '../../security/policies.js';
import {scopeFromBody} from '../../security/repository.js';
import {identifier, invalid, object, SecurityError} from '../../security/errors.js';
import {parseBusinessDay} from '../transactions/decimal.js';
import {saleHasAssociations} from './returns.js';

interface SaleRow extends Record<string,unknown> {id:string;body:Record<string,unknown>;version:number}
const selection=`d.*,r.body,r.original_imported,
  (EXISTS(SELECT 1 FROM __S__.business_document legacy WHERE legacy.type='RETURN_EXCHANGE' AND
    (legacy.id::text IN(d.id::text,d.source_identity->>'source_document_id',d.source_identity->>'documentId')
      OR EXISTS(SELECT 1 FROM __R__.revision ir WHERE ir.document_id=d.id AND ir.original_imported AND ir.body#>>'{header,source_document_id}'=legacy.id::text)))
    OR EXISTS(SELECT 1 FROM __R__.revision ir WHERE ir.document_id=d.id AND ir.original_imported
      AND (ir.body#>>'{header,source_payload,legacy_immediate}')='true')) legacy_readonly,
  EXISTS(SELECT 1 FROM __R__.revision origin WHERE origin.document_id=d.id AND origin.original_imported) source_imported,
  (SELECT jsonb_build_object('id',v.actor_id,'name',o.name) FROM __R__.revision v LEFT JOIN __R__.operator o ON o.id=v.actor_id
    WHERE v.document_id=d.id AND v.revision=1 AND v.actor_id IS NOT NULL) creator`;
export async function saleDetail(context:AuthorizedContext,id:string):Promise<SaleRow> {
  const {repo,session}=context;
  const row=(await session.query<SaleRow>(`SELECT ${selection.replaceAll('__R__',repo.runtime).replaceAll('__S__',repo.source)} FROM ${repo.runtime}.document d
    JOIN ${repo.runtime}.revision r ON r.document_id=d.id AND r.revision=d.current_revision WHERE d.id=$1::uuid AND d.document_type='SALE'`,[id])).rows[0];
  if(!row)throw new SecurityError('NOT_FOUND',404,'销货单不存在');
  return {...row,association_protected:await saleHasAssociations(context,id),history:await saleHistory(context,id)};
}
export async function saleHistory(context:AuthorizedContext,id:string):Promise<Record<string,unknown>[]> {
  const {repo,session,actor}=context;
  const current=await repo.document(id);
  await authorizeDocument(actor,current,'sales.history',repo);
  const revisions=(await session.query<{body:Record<string,unknown>} & Record<string,unknown>>(`SELECT revision,original_imported,body,actor_id,created_at
    FROM ${repo.runtime}.revision WHERE document_id=$1::uuid ORDER BY revision`,[id])).rows;
  const visible=async(body:Record<string,unknown>):Promise<boolean>=>{
    try{await authorizeDocument(actor,scopeFromBody('SALE',body),'sales.history',repo);return true;}
    catch(error){if(error instanceof SecurityError&&['SCOPE','FORBIDDEN'].includes(error.code))return false;throw error;}
  };
  const visibleRevisions:typeof revisions=[];
  for(const revision of revisions)if(await visible(revision.body))visibleRevisions.push(revision);
  const versions=(await session.query<{body:Record<string,unknown>;previous_body:Record<string,unknown>|null} & Record<string,unknown>>(`SELECT h.*,o.name actor_name,r.body,r.original_imported,
    (SELECT p.body FROM ${repo.runtime}.revision p WHERE p.document_id=h.document_id AND p.revision=h.revision-1) previous_body,
    (SELECT jsonb_agg(jsonb_build_object('id',p.id,'reason',p.reason,'reversedEffectIdentity',p.reversed_effect_identity) ORDER BY p.id)
      FROM ${repo.runtime}.posting p WHERE p.document_id=h.document_id AND p.actor_id=h.actor_id AND p.request_key=h.request_key
      AND (h.operation='approve' AND p.reason='REVISION_APPROVAL' OR h.operation='unapprove' AND p.reason<>'REVISION_APPROVAL')) postings
    FROM ${repo.runtime}.version_history h JOIN ${repo.runtime}.revision r ON r.document_id=h.document_id AND r.revision=h.revision
    LEFT JOIN ${repo.runtime}.operator o ON o.id=h.actor_id WHERE h.document_id=$1::uuid ORDER BY h.version`,[id])).rows;
  // Imported revision 1 may have no operational version_history. Expose it without fabricating actor/auditor.
  const imported=visibleRevisions.filter(r=>r['original_imported']&&!versions.some(v=>v['revision']===r['revision']&&v['operation']==='import'));
  const visibleVersions:Record<string,unknown>[]=[];
  for(const version of versions){
    if(!await visible(version.body))continue;
    visibleVersions.push({...version,previous_body:version.previous_body&&await visible(version.previous_body)?version.previous_body:null});
  }
  return [...imported.map(r=>({...r,operation:'import',version:null,actor_name:null,previous_body:null,
    imported_at:r['created_at'],created_at:object(r.body['header'])['created_at']??null})),...visibleVersions];
}
const pageNumber=(v:unknown,fallback:number,max:number):number=>{
  if(v===undefined)return fallback;if(!/^[1-9]\d*$/.test(String(v))||!Number.isSafeInteger(Number(v))||Number(v)>max)return invalid();return Number(v);
};
export async function saleList(context:AuthorizedContext,input:unknown):Promise<Record<string,unknown>> {
  const q=object(input),page=pageNumber(q['page'],1,1000000),size=pageNumber(q['size'],20,200);
  if(Object.keys(q).some(k=>!['type','page','size','filters','storeId'].includes(k)))return invalid();
  let filters:Record<string,unknown>={};
  if(q['filters']!==undefined){if(typeof q['filters']!=='string'||q['filters'].length>8192)return invalid();try{filters=object(JSON.parse(q['filters']));}catch{return invalid();}}
  if(Object.keys(filters).some(k=>!['start','end','q','number','exactNumber','warehouseId','storeId','customerId','salespersonId','warehouse','warehouses','store','stores','customer','customers','salesperson','salespeople','status','businessType'].includes(k)))return invalid();
  const values:SqlValue[]=[],where=["d.document_type='SALE'"];
  const add=(sql:string,value:SqlValue):void=>{values.push(value);where.push(sql.replace('?',`$${values.length}`));};
  if(context.listScope?.type!=='SALE')return invalid();
  if(context.listScope.storeId)add("r.body->'header'->>'hall_id'=?::text",context.listScope.storeId);
  if(filters['exactNumber']!==undefined){const number=filters['exactNumber'];if(typeof number!=='string'||!number.length||number.length>128)return invalid();add('d.number=?::text',number);}
  for(const k of ['start','end'] as const)if(filters[k]){try{parseBusinessDay(filters[k]);}catch{return invalid();}add(`d.business_day ${k==='start'?'>=':'<='} ?::date`,String(filters[k]));}
  if(filters['start']&&filters['end']&&String(filters['start'])>String(filters['end']))return invalid();
  const search=filters['q']??filters['number'];
  if(search){if(typeof search!=='string'||search.length>128)return invalid();add("position(lower(?) in lower(d.number||' '||coalesce(r.body->'header'->>'note','')))>0",search);}
  const fieldMap:Record<string,string>={warehouseId:'source_warehouse_id',storeId:'hall_id',customerId:'source_party_id',salespersonId:'source_employee_id',warehouse:'source_warehouse_id',warehouses:'source_warehouse_id',store:'hall_id',stores:'hall_id',customer:'source_party_id',customers:'source_party_id',salesperson:'source_employee_id',salespeople:'source_employee_id'};
  for(const [key,field] of Object.entries(fieldMap))if(filters[key]!==undefined){if(!Array.isArray(filters[key])||(filters[key] as unknown[]).length>100)return invalid();const ids=(filters[key] as unknown[]).map(v=>identifier(v));if(ids.length)add(`r.body->'header'->>'${field}'=ANY(?::text[])`,ids);}
  if(filters['status']!==undefined){if(!Array.isArray(filters['status'])||(filters['status'] as unknown[]).length>4)return invalid();
    const map:Record<string,string>={'已审核':'APPROVED','未审核':'UNAUDITED','已作废':'DELETED',APPROVED:'APPROVED',UNAUDITED:'UNAUDITED',DRAFT:'DRAFT',DELETED:'DELETED'};
    const states=(filters['status'] as unknown[]).map(v=>map[String(v)]??invalid());if(states.length)add('d.status=ANY(?::text[])',states);
  }
  if(filters['businessType']!==undefined){const types=filters['businessType'];if(!Array.isArray(types)||types.some(x=>!['销售','退货/换货','SALE','RETURN_EXCHANGE'].includes(String(x))))return invalid();
    if(types.length)add("coalesce(r.body->'header'->>'business_type','SALE')=ANY(?::text[])",types.map(v=>v==='销售'?'SALE':v==='退货/换货'?'RETURN_EXCHANGE':String(v)));
  }
  const {repo,session,actor}=context,from=`FROM ${repo.runtime}.document d JOIN ${repo.runtime}.revision r ON r.document_id=d.id AND r.revision=d.current_revision WHERE ${where.join(' AND ')}`;
  const total=Number((await session.query<{total:string}>(`SELECT count(*)::text total ${from}`,values)).rows[0]?.total??'0');
  const items=(await session.query<SaleRow>(`SELECT ${selection.replaceAll('__R__',repo.runtime).replaceAll('__S__',repo.source)} ${from} ORDER BY d.business_day DESC NULLS LAST,d.created_at DESC,d.id LIMIT $${values.length+1} OFFSET $${values.length+2}`,[...values,size,(page-1)*size])).rows;
  for(const row of items)await authorizeDocument(actor,scopeFromBody('SALE',row.body),'sales.list',repo);
  return {items,total,page,size};
}
