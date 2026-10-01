import {transaction} from './db.ts';
import {RUNTIME} from './runtime.ts';
export async function work(c:any){
 if(typeof c.docId!=='string'||c.docId.length>200)throw Error('INVALID_DOCUMENT_KEY');
 return transaction(RUNTIME,async tx=>{
 const key=c.docId;
 if(c.type==='logs')return {ok:true,items:(await tx.query('SELECT body FROM work_record WHERE document_key=$1 ORDER BY created_at,id',[key])).rows.map(x=>x.body)};
 if(['acquire','renew','release'].includes(c.type)){
  await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['lease:'+key]);
  const old=(await tx.query('SELECT *,expires_at>now() active FROM edit_lease WHERE document_key=$1 FOR UPDATE',[key])).rows[0];
  if(c.type==='release'){await tx.query('DELETE FROM edit_lease WHERE document_key=$1 AND token=$2 RETURNING token',[key,c.token]);return {ok:true};}
  const token=c.type==='acquire'?c.newToken:c.token;if(typeof token!=='string'||token.length>100)throw Error('INVALID_LEASE');
  if(old?.active&&old.token!==token)return {ok:false,code:'OCCUPIED',error:'此单正在另一窗口编辑，请关闭该窗口或稍后重试'};
  if(c.type==='renew'&&(!old||old.token!==token))return {ok:false,code:'LEASE',error:'编辑资格已失效'};
  const r=(await tx.query(`INSERT INTO edit_lease VALUES($1,$2,now()+interval '30 seconds') ON CONFLICT(document_key) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at RETURNING extract(epoch from expires_at)*1000 expires`,[key,token])).rows[0];return {ok:true,lease:{token,expires:Number(r.expires)}};
 }
 if(c.type==='work'){
  if(c.record){const id=c.record.id;if(typeof id!=='string')throw Error('INVALID_WORK_RECORD');await tx.query(`INSERT INTO work_record VALUES($1,$2,$3::jsonb,'local-admin',now()) ON CONFLICT(document_key,id) DO UPDATE SET body=excluded.body RETURNING id`,[key,id,JSON.stringify({...c.record,docId:key})]);return {ok:true};}
  const event={id:c.eventId,time:new Date().toISOString(),actor:{id:'local-admin',name:'管理员'},action:c.action,input:c.input};if(!event.id)throw Error('INVALID_WORK_EVENT');
  const r=await tx.query(`INSERT INTO work_event VALUES($1,$2,$3::jsonb,'local-admin',now()) ON CONFLICT DO NOTHING RETURNING id`,[key,event.id,JSON.stringify(event)]);return {ok:true,duplicate:r.rowCount===0,event};
 }
 throw Error('UNKNOWN_WORK_OPERATION');
 });
}
