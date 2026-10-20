import type {AuthorizedContext} from '../../security/service.js';
import {identifier,object,SecurityError} from '../../security/errors.js';
import {listMasterRecords,masterKinds,saveMasterRecord} from '../../security/master-data.js';
import {catalog,productMasters,productReference} from '../products/catalog.js';
import {fail,text} from '../products/definitions.js';
import {idempotent,saveProfile} from '../products/profile.js';
import {canonicalJson,hashIdempotencyPayload} from '../idempotency/index.js';
import {importSku} from './sku.js';

export interface ImportRow {rowKey:string;kind:string;payload:Record<string,unknown>}
export interface ImportBatch {batchId:string;source:{name:string;sha256:string};rows:ImportRow[]}
export interface RowResult {rowKey:string;kind:string;targetId:string;label:string;status:'READY'|'UNCHANGED'|'FAILED'|'COMMITTED'|'SKIPPED';code:string;message:string;enabled:unknown;source:ImportBatch['source'];version?:number;claimedCodes?:string[]}
const allowedKinds=['product','sku',...masterKinds];
function only(input:Record<string,unknown>,allowed:string[]):void {if(Object.keys(input).some(k=>!allowed.includes(k)))return fail('包含未支持字段；期初、库存余额、历史重放与删除不属于资料导入');}
export function batchInput(raw:unknown,commit=false):ImportBatch {
  const input=object(raw);only(input,['batchId','source','rows',...(commit?['preflightHash','selectedRowKeys','requestKey','confirmed']:[])]);
  const batchId=text(identifier(input['batchId']),'批次编号',120),src=object(input['source']);only(src,['name','sha256']);
  const source={name:text(src['name'],'来源文件名称',200),sha256:text(src['sha256'],'来源文件 SHA-256',64)};
  if(!/^[a-f0-9]{64}$/.test(source.sha256))return fail('来源文件 SHA-256 无效');
  if(!Array.isArray(input['rows'])||!input['rows'].length||input['rows'].length>100||Buffer.byteLength(JSON.stringify(input['rows']))>800000)return fail('每批须为 1–100 行且小于 800KB，请分批导入');
  const rows=input['rows'].map(value=>{const row=object(value);only(row,['rowKey','kind','payload']);return {rowKey:text(row['rowKey'],'来源行号',80),kind:text(row['kind'],'资料类型',30),payload:object(row['payload'])};});
  if(new Set(rows.map(r=>r.rowKey)).size!==rows.length)return fail('来源行号必须唯一');
  return {batchId,source,rows};
}
function rowBody(row:ImportRow):Record<string,unknown>{const value=row.kind==='product'?row.payload['profile']:row.payload['body'];return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};}
function label(row:ImportRow):string{const body=rowBody(row);return (row.kind==='sku'?[body['fitId'],body['sizeName'],body['sizeCode']]:[row.payload['newCode']||body['code'],body['name']]).filter(v=>v!==undefined&&v!==null).map(String).join(' · ');}
function target(row:ImportRow):string{return String(row.payload[row.kind==='product'?'productId':'id']||'');}
function rowHash(row:ImportRow):string{const payload={...row.payload};delete payload['expectedVersion'];return hashIdempotencyPayload({kind:row.kind,payload});}
function validateRow(row:ImportRow):void {
  if(!allowedKinds.includes(row.kind))return fail('资料类型不支持；账号须走管理员账号入口，期初与历史须走专用迁移入口');
  only(row.payload,row.kind==='product'?['productId','newCode','expectedVersion','profile','specs','aliases']:row.kind==='sku'?['id','productId','expectedVersion','body']:['id','expectedVersion','body']);
  if(row.kind==='product'){const profile=object(row.payload['profile']);if(Object.hasOwn(profile,'images'))return fail('媒体请通过受控商品图片入口维护');}
  identifier(target(row),row.kind==='product'||row.kind==='sku');
}
async function currentVersion(context:AuthorizedContext,row:ImportRow):Promise<number> {
  if(row.kind==='product'||row.kind==='sku')return (await context.session.query<{version:number}>(`SELECT version FROM ${context.repo.runtime}.product_profile_overlay WHERE product_id=$1::uuid`,[identifier(row.payload['productId'],true)])).rows[0]?.version||0;
  return (await listMasterRecords(context.session,context.repo)).records.find(r=>r.kind===row.kind&&r.id===target(row))?.version||0;
}
async function receiptMatches(context:AuthorizedContext,row:ImportRow):Promise<boolean> {
  const receipts=(await context.session.query<{result:RowResult}>(`SELECT result FROM ${context.repo.runtime}.reference_import_row WHERE kind=$1 AND target_id=$2 AND input_hash=$3`,[row.kind,target(row),rowHash(row)])).rows;
  if(!receipts.length)return false;
  const version=await currentVersion(context,row);return receipts.some(r=>r.result.version===version&&['COMMITTED','UNCHANGED'].includes(r.result.status));
}
async function applyRow(context:AuthorizedContext,batch:ImportBatch,row:ImportRow,validateOnly:boolean):Promise<Record<string,unknown>> {
  const requestKey='t26_'+hashIdempotencyPayload({batch:batch.batchId,row:row.rowKey}).slice(0,48),input={...row.payload,requestKey};
  if(row.kind==='product')return object(await saveProfile(context,input,[],validateOnly));
  if(row.kind==='sku')return importSku(context,input,validateOnly);
  const record=await saveMasterRecord(context.session,context.repo,context.actor,{...input,kind:row.kind},validateOnly);
  return {version:record.version,created:record.version===1};
}
async function stateHash(context:AuthorizedContext):Promise<string> {
  const state:unknown[]=[await catalog(context),await productMasters(context),await listMasterRecords(context.session,context.repo)];
  for(const kind of ['units','categories','colors'])state.push(await productReference(context,kind));
  state.push((await context.session.query(`SELECT barcode,sku_id,product_id FROM ${context.repo.runtime}.generated_barcode_retired UNION ALL SELECT barcode,sku_id,product_id FROM ${context.repo.runtime}.product_barcode_alias_retired`)).rows);
  // Canonicalise unordered query arrays; no inventory projection or opening data is written or used as imported values.
  const clean=(v:unknown):unknown=>Array.isArray(v)?v.map(clean).sort((a,b)=>canonicalJson(a).localeCompare(canonicalJson(b))):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,clean(x)])):v;
  return hashIdempotencyPayload(clean(JSON.parse(JSON.stringify(state))));
}
export async function preflight(context:AuthorizedContext,batch:ImportBatch):Promise<{batchId:string;preflightHash:string;rows:RowResult[];committed:boolean}> {
  const ledger=(await context.session.query<{payload_hash:string}>(`SELECT payload_hash FROM ${context.repo.runtime}.reference_import_batch WHERE batch_id=$1`,[batch.batchId])).rows[0];
  if(ledger){return {batchId:batch.batchId,preflightHash:'',committed:true,rows:batch.rows.map(row=>({rowKey:row.rowKey,kind:row.kind,targetId:target(row),label:label(row),status:'FAILED',code:'BATCH_COMMITTED',message:'此批次已提交，请查询批次结果；修正资料须使用新批次编号',enabled:null,source:batch.source}))};}
  const rows:RowResult[]=[],targets=new Map<string,RowResult>(),codes=new Map<string,RowResult>();
  for(const row of batch.rows){const result:RowResult={rowKey:row.rowKey,kind:row.kind,targetId:target(row),label:label(row),status:'READY',code:'READY',message:'校验通过，待确认',enabled:rowBody(row)['enabled']??null,source:batch.source};rows.push(result);
    try{
      validateRow(row);
      // Product versions also guard SKU enable/disable. One change per product prevents self-conflicting versions.
      const key=row.kind==='sku'?'product|'+String(row.payload['productId']):row.kind+'|'+target(row);
      if(targets.has(key)){Object.assign(targets.get(key)!,{status:'FAILED',code:'DUPLICATE_TARGET',message:'同一资料或商品状态在批内重复，请拆分后预检'});return fail('同一资料或商品状态在批内重复，请拆分后预检','DUPLICATE_TARGET');}targets.set(key,result);
      const code=row.kind==='product'?row.payload['newCode']:row.kind==='sku'?null:object(row.payload['body'])['code'];
      const codeKey=code?row.kind+'|'+String(code).trim().toLowerCase():'';
      if(codeKey&&codes.has(codeKey)){const prior=codes.get(codeKey)!;Object.assign(prior,{status:'FAILED',code:'DUPLICATE_CODE',message:'批内相同编码不能创建不同身份'});return fail('批内相同编码不能创建不同身份','DUPLICATE_CODE');}if(codeKey)codes.set(codeKey,result);
      if(await receiptMatches(context,row)){result.status='UNCHANGED';result.code='UNCHANGED';result.message='相同资料已导入且版本未变化，将跳过';result.version=await currentVersion(context,row);continue;}
      const plan=await applyRow(context,batch,row,true);result.version=Number(plan['version']);
      const created=Array.isArray(plan['created'])?plan['created'].map(object):[];
      result.claimedCodes=[...(Array.isArray(plan['claimedCodes'])?plan['claimedCodes'] as string[]:[]),...created.map(x=>String(x['barcode'])),...(Array.isArray(row.payload['aliases'])?row.payload['aliases'].map(a=>text(object(a)['code'],'人工旧码',80)):[])];
      for(const barcode of result.claimedCodes){const key='barcode|'+barcode;if(codes.has(key)){const prior=codes.get(key)!;Object.assign(prior,{status:'FAILED',code:'BARCODE_CONFLICT',message:'批内条码占用重复，请核对具体 SKU'});return fail('批内条码占用重复，请核对具体 SKU','BARCODE_CONFLICT',409);}codes.set(key,result);}
      if(plan['unchanged']){result.status='UNCHANGED';result.message='资料相同，将跳过';}
    }catch(error){if(!(error instanceof SecurityError))throw error;result.status='FAILED';result.code=error.code;result.message=error.message;}
  }
  const preflightHash=hashIdempotencyPayload({batch,state:await stateHash(context),rows:rows.map(({claimedCodes,...r})=>r)});
  return {batchId:batch.batchId,preflightHash,rows,committed:false};
}
export async function commit(context:AuthorizedContext,input:Record<string,unknown>):Promise<unknown> {
  const batch=batchInput(input,true);
  if(input['confirmed']!==true)return fail('请核对预检结果并明确确认提交');
  const selected=input['selectedRowKeys'];
  if(!Array.isArray(selected)||!selected.length||selected.some(k=>typeof k!=='string')||new Set(selected).size!==selected.length)return fail('请明确选择预检通过的来源行');
  const selectedSet=new Set(selected as string[]),binding={batch,selectedRowKeys:[...selectedSet].sort()},payloadHash=hashIdempotencyPayload(binding);
  return idempotent(context,{...binding,requestKey:identifier(input['requestKey'])},'imports.referenceCommit',async()=>{
    const prior=(await context.session.query<{payload_hash:string;response:unknown}>(`SELECT payload_hash,response FROM ${context.repo.runtime}.reference_import_batch WHERE batch_id=$1`,[batch.batchId])).rows[0];
    if(prior){if(prior.payload_hash!==payloadHash)return fail('批次编号已绑定不同资料或选择，不能覆盖','IDEMPOTENCY_CONFLICT',409);return prior.response;}
    const preview=await preflight(context,batch);
    if(input['preflightHash']!==preview.preflightHash)return fail('资料或版本已变化，请重新预检后确认','PREFLIGHT_CHANGED',409);
    if([...selectedSet].some(k=>!preview.rows.some(r=>r.rowKey===k&&r.status!=='FAILED')))return fail('不能提交失败行或不存在的来源行','ROW_REJECTED',409);
    const results:RowResult[]=[];
    for(const row of batch.rows){const planned=preview.rows.find(r=>r.rowKey===row.rowKey)!;
      if(!selectedSet.has(row.rowKey)){results.push({...planned,status:planned.status==='FAILED'?'FAILED':'SKIPPED'});continue;}
      if(planned.status==='UNCHANGED'){results.push(planned);continue;}
      try{const saved=await applyRow(context,batch,row,false);results.push({...planned,status:'COMMITTED',code:'COMMITTED',message:'已提交',version:Number(saved['version'])});}
      catch(error){if(error instanceof SecurityError)throw new SecurityError(error.code,error.statusCode,`来源行 ${row.rowKey}：${error.message}；本批选中行全部回滚`);throw error;}
    }
    const response={batchId:batch.batchId,payloadHash,source:batch.source,rows:results,committedAt:new Date().toISOString(),actorId:context.actor.id};
    await context.session.query(`INSERT INTO ${context.repo.runtime}.reference_import_batch(batch_id,payload_hash,actor_id,source,response) VALUES($1,$2,$3,$4::jsonb,$5::jsonb)`,[batch.batchId,payloadHash,context.actor.id,JSON.stringify(batch.source),JSON.stringify(response)]);
    for(const row of batch.rows){const result=results.find(r=>r.rowKey===row.rowKey)!;await context.session.query(`INSERT INTO ${context.repo.runtime}.reference_import_row(batch_id,row_key,kind,target_id,input_hash,result) VALUES($1,$2,$3,$4,$5,$6::jsonb)`,[batch.batchId,row.rowKey,row.kind,target(row),rowHash(row),JSON.stringify(result)]);}
    return response;
  });
}
export async function batchResult(context:AuthorizedContext,id:unknown):Promise<unknown> {
  const result=(await context.session.query<{response:unknown}>(`SELECT response FROM ${context.repo.runtime}.reference_import_batch WHERE batch_id=$1`,[text(id,'批次编号',120)])).rows[0];
  if(!result)return fail('批次尚未提交或不存在','NOT_FOUND',404);return result.response;
}
