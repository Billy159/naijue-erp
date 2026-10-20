import type {AuthorizedContext} from '../../security/service.js';
import {identifier, object, SecurityError} from '../../security/errors.js';
import {canonicalJson} from '../idempotency/index.js';

export async function linkSaleDraftWork(context:AuthorizedContext,documentId:string,body:Record<string,unknown>):Promise<void> {
  const header=object(body['header']),p=header['source_payload']===undefined?{}:object(header['source_payload']),draft=p['v2_draft_key'];
  if(draft===undefined)return;
  if(typeof draft!=='string'||!/^unsaved-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(draft))throw new SecurityError('VALIDATION',400,'销货草稿工作身份无效');
  const {session,repo,actor}=context;
  for(const table of ['work_record','work_event'])await session.query(`INSERT INTO ${repo.runtime}.${table}(document_key,id,body,actor_id)
    SELECT $1,id,body||jsonb_build_object('docId',$2::text,'draftId',$3::text),actor_id FROM ${repo.runtime}.${table}
    WHERE document_key=$4 AND actor_id=$5`,['sale:'+documentId,documentId,draft,`sale-draft:${actor.id}:${draft}`,actor.id]);
}

/** Actor-bound unsaved scan facts and object-authorized saved facts; never changes quantities. */
export async function saleWork(context:AuthorizedContext,input:unknown):Promise<Record<string,unknown>> {
  const b=object(input),id=identifier(b['docId']),{session,repo,actor}=context;
  if(context.documents.length&&context.documents[0]?.type!=='SALE')throw new SecurityError('SCOPE');
  const key=id.startsWith('unsaved-')?`sale-draft:${actor.id}:${id}`:`sale:${id}`;
  if(b['type']==='logs')return {items:(await session.query<{body:Record<string,unknown>}>(`SELECT body FROM ${repo.runtime}.work_record WHERE document_key=$1 ORDER BY created_at,id`,[key])).rows.map(r=>r.body)};
  if(b['type']!=='work')throw new SecurityError('VALIDATION',400,'扫码工作记录类型无效');
  const record=object(b['record']),eventId=identifier(record['eventId']??record['id']);
  const old=(await session.query<{body:Record<string,unknown>;actor_id:string}>(`SELECT body,actor_id FROM ${repo.runtime}.work_record WHERE document_key=$1 AND id=$2`,[key,eventId])).rows[0];
  const fields=['code','lineId','productId','color','size','before','after','section','manualGeneration'];
  const facts=Object.fromEntries(fields.filter(k=>record[k]!==undefined).map(k=>[k,record[k]]));
  if(old){
    const oldFacts=Object.fromEntries(fields.filter(k=>old.body[k]!==undefined).map(k=>[k,old.body[k]]));
    if(old.actor_id!==actor.id||canonicalJson(facts)!==canonicalJson(oldFacts)||old.body['undone']===true&&record['undone']!==true)throw new SecurityError('IDEMPOTENCY_CONFLICT',409,'同一扫码事件不能改为另一条记录');
    if(record['undone']===true&&old.body['undone']!==true){
      const account=await repo.account(actor.id),undo={id:eventId+':undo',eventId,action:'undo',time:new Date().toISOString(),actor:{id:actor.id,name:account?.body['name']??null}};
      await session.query(`INSERT INTO ${repo.runtime}.work_event(document_key,id,body,actor_id) VALUES($1,$2,$3::jsonb,$4)`,[key,undo.id,JSON.stringify(undo),actor.id]);
      await session.query(`UPDATE ${repo.runtime}.work_record SET body=body||$3::jsonb WHERE document_key=$1 AND id=$2`,[key,eventId,JSON.stringify({undone:true,undoTime:undo.time,undoActor:undo.actor})]);
      return {ok:true,record:{...old.body,undone:true,undoTime:undo.time,undoActor:undo.actor}};
    }
    return {ok:true,duplicate:true};
  }
  if(record['undone']===true)throw new SecurityError('VALIDATION',400,'不能撤销未登记的扫描');
  const account=await repo.account(actor.id),value={...facts,id:eventId,eventId,docId:id,time:new Date().toISOString(),actor:{id:actor.id,name:account?.body['name']??null}};
  await session.query(`INSERT INTO ${repo.runtime}.work_record(document_key,id,body,actor_id) VALUES($1,$2,$3::jsonb,$4)`,[key,eventId,JSON.stringify(value),actor.id]);
  return {ok:true,record:value};
}
