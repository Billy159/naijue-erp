import {createHash} from 'node:crypto';
import type {AuthorizedContext} from '../../security/service.js';
import {identifier,object,invalid,SecurityError} from '../../security/errors.js';
import {canonicalJson} from '../idempotency/index.js';

const ttl=60000;
const digest=(actor:string,token:string):string=>createHash('sha256').update(JSON.stringify([actor,token])).digest('hex');
export const transferWorkId=(value:unknown):string=>typeof value==='string'&&/^草稿-[a-f0-9]{8}$/.test(value)?value:identifier(value,true);
/** Link the current actor's draft scan evidence in the same transaction as create. */
export async function linkTransferDraftWork(context:AuthorizedContext,documentId:string,body:Record<string,unknown>):Promise<void> {
  const header=object(body['header']),payload=header['source_payload']===undefined?{}:object(header['source_payload']),draft=payload['v2_draft_key'];
  if(draft===undefined)return;
  if(typeof draft!=='string'||!/^草稿-[a-f0-9]{8}$/.test(draft))return invalid();
  const {repo,session,actor}=context,source=`transfer-draft:${actor.id}:${draft}`,target=`transfer:${documentId}`;
  for(const table of ['work_event','work_record'])await session.query(`INSERT INTO ${repo.runtime}.${table}(document_key,id,body,actor_id)
    SELECT $1,id,body||jsonb_build_object('docId',$2::text,'draftId',$3::text),actor_id FROM ${repo.runtime}.${table}
    WHERE document_key=$4 AND actor_id=$5`,[target,documentId,draft,source,actor.id]);
}
export async function transferWork(context:AuthorizedContext,input:unknown):Promise<Record<string,unknown>> {
  const b=object(input),{repo,session,actor}=context,id=transferWorkId(b['docId']);
  if(context.documents.length&&context.documents[0]?.type!=='TRANSFER')throw new SecurityError('SCOPE');
  const key=/^草稿-/.test(id)?`transfer-draft:${actor.id}:${id}`:`transfer:${id}`;
  const type=b['type'];
  if(type==='logs')return {ok:true,items:(await session.query<{body:Record<string,unknown>}>(`SELECT body FROM ${repo.runtime}.work_record WHERE document_key=$1 ORDER BY created_at,id`,[key])).rows.map(r=>r.body)};
  const now=Date.now(),newToken=typeof b['newToken']==='string'?identifier(b['newToken']):null,token=typeof b['token']==='string'?identifier(b['token']):null;
  const lease=(await session.query<{token:string;expires:number}>(`SELECT token,(extract(epoch FROM expires_at)*1000)::float8 expires FROM ${repo.runtime}.edit_lease WHERE document_key=$1 FOR UPDATE`,[key])).rows[0];
  if(type==='acquire'){
    if(!newToken)return invalid();
    if(lease&&lease.expires>now&&lease.token!==digest(actor.id,newToken))return {ok:false,code:'OCCUPIED',error:'此单正在编辑，请稍后再试'};
    await session.query(`INSERT INTO ${repo.runtime}.edit_lease(document_key,token,expires_at) VALUES($1,$2,to_timestamp($3/1000.0))
      ON CONFLICT(document_key) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at`,[key,digest(actor.id,newToken),now+ttl]);
    return {ok:true,lease:{token:newToken,expires:now+ttl}};
  }
  if(type==='release'){
    if(token)await session.query(`DELETE FROM ${repo.runtime}.edit_lease WHERE document_key=$1 AND token=$2`,[key,digest(actor.id,token)]);
    return {ok:true};
  }
  if(!token||!lease||lease.expires<=now||lease.token!==digest(actor.id,token))return {ok:false,code:'LEASE',error:'编辑凭据已失效，请重新获取'};
  if(type==='renew'){
    await session.query(`UPDATE ${repo.runtime}.edit_lease SET expires_at=to_timestamp($2/1000.0) WHERE document_key=$1`,[key,now+ttl]);
    return {ok:true,lease:{token,expires:now+ttl}};
  }
  if(type!=='work')return invalid();
  const account=await repo.account(actor.id),actorView={id:actor.id,name:account?.body['name']??null};
  if(b['record']!==undefined){
    const record=object(b['record']),eventId=identifier(record['eventId']??record['id']);
    const event=(await session.query<{body:Record<string,unknown>;actor_id:string}>(`SELECT body,actor_id FROM ${repo.runtime}.work_event WHERE document_key=$1 AND id=$2`,[key,eventId])).rows[0];
    if(!event||event.actor_id!==actor.id)throw new SecurityError('SCOPE');
    const stored=(await session.query<{body:Record<string,unknown>}>(`SELECT body FROM ${repo.runtime}.work_record WHERE document_key=$1 AND id=$2`,[key,eventId])).rows[0];
    const normalized={...record,id:eventId,eventId,docId:id,actor:actorView,time:event.body['time'],serviceTime:event.body['time']};
    if(stored){if(canonicalJson(stored.body)!==canonicalJson(normalized))throw new SecurityError('IDEMPOTENCY_CONFLICT',409,'同一扫码事件已登记不同结果');return {ok:true,duplicate:true};}
    await session.query(`INSERT INTO ${repo.runtime}.work_record(document_key,id,body,actor_id) VALUES($1,$2,$3::jsonb,$4)`,[key,eventId,JSON.stringify(normalized),actor.id]);return {ok:true};
  }
  const eventId=identifier(b['eventId']),action=b['action'],raw=b['input']??'';
  if(typeof action!=='string'||!['scan','undo'].includes(action)||typeof raw!=='string'||raw.length>512)return invalid();
  const previous=(await session.query<{body:Record<string,unknown>;actor_id:string}>(`SELECT body,actor_id FROM ${repo.runtime}.work_event WHERE document_key=$1 AND id=$2`,[key,eventId])).rows[0];
  if(previous){if(previous.actor_id!==actor.id||previous.body['action']!==action||previous.body['input']!==raw)throw new SecurityError('IDEMPOTENCY_CONFLICT',409,'扫码事件编号已绑定其他内容');return {ok:true,duplicate:true,event:previous.body};}
  const event={id:eventId,action,input:raw,actor:actorView,time:new Date(now).toISOString()};
  await session.query(`INSERT INTO ${repo.runtime}.work_event(document_key,id,body,actor_id) VALUES($1,$2,$3::jsonb,$4)`,[key,eventId,JSON.stringify(event),actor.id]);return {ok:true,event};
}
