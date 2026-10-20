import type {DataSession} from '../database/session.js';
import {CommandError, executeIdempotent} from '../domain/idempotency/index.js';
import {hasNonzeroInventory} from '../domain/transactions/inventory.js';
import {SecurityError, identifier, object} from './errors.js';
import {acknowledgeFundAccountUpdate, fundAccountSourceFacts, projectApprovedFundAccount} from './approved-fund-accounts.js';
import {employeeView, roleOf, roleNames, type AccountRow, type Actor, type EmployeeView, type SecurityRepository} from './repository.js';

export const masterKinds = ['halls','warehouses','parties','payments','fundAccounts'] as const;
export type MasterKind = typeof masterKinds[number];
export interface MasterRecord {readonly id: string; readonly kind: MasterKind; readonly version: number; readonly body: Record<string, unknown>; readonly sourceFacts: Record<string,unknown>}
interface DbRecord {kind: string; id: string; body: Record<string, unknown>; source_facts?: Record<string,unknown>; version: number; updated_by?: string}
interface ImportBatch {batch_id: string}
const fields: Record<MasterKind, readonly string[]> = {
  halls: ['code','name','enabled','defaultCustomerId','defaultWarehouseId'],
  warehouses: ['code','name','enabled','hallRelations','sourceOwnershipUnknown','type','sourceFacts'],
  parties: ['code','name','enabled','usage','tags','sourceFacts'],
  payments: ['code','name','enabled'],
  fundAccounts: ['code','name','enabled','primaryPaymentMethodId','type','bank','accountNumber','department','sourceFacts'],
};
const isKind = (value: unknown): value is MasterKind => typeof value === 'string' && (masterKinds as readonly string[]).includes(value);
const string = (value: unknown, max: number, optional = false): string => {
  if (optional && (value === undefined || value === null)) return '';
  if (typeof value !== 'string' || value.length > max || value.includes('\0')) throw new SecurityError('VALIDATION',400,'基础资料字段无效');
  return value.trim();
};
const sourceActive = (payload: unknown): boolean => {
  const p = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const src = p['source'] && typeof p['source'] === 'object' ? p['source'] as Record<string, unknown> : {};
  return p['enabled'] !== false && src['停用'] !== 1 && src['停用'] !== '1';
};
const jsonObject = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
function validateBody(kind: MasterKind, value: unknown, repo:SecurityRepository, id:string): Record<string, unknown> {
  const body = object(value);
  if (Object.keys(body).some(key => !fields[kind].includes(key))) throw new SecurityError('VALIDATION',400,'基础资料包含未支持字段');
  const result: Record<string, unknown> = {...body};
  result['code'] = string(body['code'] ?? '',128,true);
  result['name'] = string(body['name'],256);
  if (!result['name']) throw new SecurityError('VALIDATION',400,'名称不能为空');
  if (typeof body['enabled'] !== 'boolean') throw new SecurityError('VALIDATION',400,'启停状态无效');
  for (const key of ['defaultCustomerId','defaultWarehouseId','primaryPaymentMethodId'] as const) {
    if (Object.hasOwn(body,key)) result[key] = string(body[key] ?? '',128,true);
  }
  for (const key of ['type','bank','accountNumber','department'] as const) if (Object.hasOwn(body,key)) result[key] = string(body[key] ?? '',256,true);
  if (kind === 'warehouses') {
    if (!Array.isArray(body['hallRelations']) || body['hallRelations'].length > 200) throw new SecurityError('VALIDATION',400,'仓库营业厅关系无效');
    const relations = body['hallRelations'].map(id => identifier(id));
    if (new Set(relations).size !== relations.length) throw new SecurityError('VALIDATION',400,'仓库营业厅关系重复');
    if (typeof body['sourceOwnershipUnknown'] !== 'boolean') throw new SecurityError('VALIDATION',400,'仓库归属确认状态无效');
    if (body['sourceOwnershipUnknown'] && relations.length) throw new SecurityError('VALIDATION',400,'归属未核实的仓库不能保存为已确认营业厅关系');
    if (!body['sourceOwnershipUnknown'] && !relations.length) throw new SecurityError('VALIDATION',400,'已确认归属的仓库须关联至少一个营业厅');
    result['hallRelations'] = relations;
  }
  if (kind === 'parties') {
    for (const key of ['usage','tags'] as const) {
      const list = body[key];
      if (!Array.isArray(list) || list.length > 100 || list.some(item => typeof item !== 'string' || item.length > 128)) throw new SecurityError('VALIDATION',400,'往来标签无效');
      result[key] = [...new Set(list as string[])];
    }
    if ((result['usage'] as string[]).some(role => !['customer','supplier'].includes(role)) || (result['tags'] as string[]).some(tag => !['customer','supplier'].includes(tag))) throw new SecurityError('VALIDATION',400,'往来标签仅支持客户或供应商');
    if ((result['usage'] as string[]).length !== 1 || JSON.stringify(result['tags']) !== JSON.stringify(result['usage'])) throw new SecurityError('VALIDATION',400,'请选择客户或供应商中的一种分类');
    const approved = repo.partyRole(result['code'] as string,result,id);
    if (approved === null) throw new SecurityError('VALIDATION',409,'该编码未纳入当前客户或供应商名单');
    if (approved !== undefined && (result['usage'] as string[])[0] !== approved) throw new SecurityError('VALIDATION',409,'该编码的分类与已确认清单不一致');
  }
  if (Object.hasOwn(body,'sourceFacts')) {
    const sourceFacts = object(body['sourceFacts']);
    if (Buffer.byteLength(JSON.stringify(sourceFacts)) > 65536) throw new SecurityError('VALIDATION',400,'来源资料过大');
    result['sourceFacts'] = sourceFacts;
  }
  return result;
}

async function committedBatch(session: DataSession, repo: SecurityRepository): Promise<string | null> {
  const rows = await session.query<ImportBatch>(`SELECT batch_id FROM ${repo.source}.tplus_import_run WHERE status='COMMITTED' ORDER BY committed_at DESC NULLS LAST,started_at DESC LIMIT 1`);
  return rows.rows[0]?.batch_id ?? null;
}

/** Source identities remain visible, while only auth-schema accounts can open a session. */
export async function listEmployeeRecords(session: DataSession, repo: SecurityRepository): Promise<EmployeeView[]> {
  const source = new Map<string,Record<string,unknown>>(), batch=await committedBatch(session,repo);
  if(batch){
    const rows=await session.query<{id:string;code:string|null;name:string;hall_id:string|null;role:string|null;source_salesperson:boolean;payload:unknown}>(
      `SELECT id::text,source_code AS code,name,hall_id::text,role,source_salesperson,source_payload AS payload FROM ${repo.source}.tplus_employee WHERE batch_id=$1 ORDER BY id`,[batch]);
    for(const row of rows.rows){
      const payload=jsonObject(row.payload),sourceFields=jsonObject(payload['source']),role=roleOf(row.role)|| (row.source_salesperson?'SALESPERSON':null);
      const left=!!(sourceFields['离职日期']&&String(sourceFields['离职日期']).trim());
      source.set(row.id,{code:row.code||'',name:row.name,role:role?roleNames[role]:'',hallId:row.hall_id||'',storeId:row.hall_id||'',phone:String(sourceFields['手机']??sourceFields['联系电话']??''),employmentStatus:left?'离职':'在职',enabled:!left,loginEnabled:false,loginName:'',sourceFacts:{source:payload}});
    }
  }
  const accounts=await session.query<AccountRow>(`SELECT id,login_name,body,password_salt,password_hash,version FROM ${repo.auth}.employee_login ORDER BY id`);
  const views=new Map<string,EmployeeView>();
  for(const row of accounts.rows){
    const imported=source.get(row.id)||{},body={...imported,...row.body};
    if(!body['sourceFacts']&&imported['sourceFacts'])body['sourceFacts']=imported['sourceFacts'];
    const merged={...row,body};
    views.set(row.id,employeeView(merged));
  }
  for(const [id,body] of source){if(views.has(id))continue;const row:AccountRow={id,login_name:null,body,password_salt:null,password_hash:null,version:0};views.set(id,employeeView(row));}
  return [...views.values()].sort((a,b)=>a.code.localeCompare(b.code,'zh-CN',{numeric:true})||a.id.localeCompare(b.id));
}

/** Load current source facts first, then apply versioned edits without changing imported snapshots. */
export interface MasterReadOptions {readonly kinds?: readonly MasterKind[]}
export async function listMasterRecords(session: DataSession, repo: SecurityRepository, options: MasterReadOptions = {}): Promise<{revision: number; records: MasterRecord[]}> {
  const requested=options.kinds??masterKinds;
  if (!Array.isArray(requested)||!requested.length||requested.some(kind=>!isKind(kind))) throw new SecurityError('VALIDATION',400,'基础资料读取类型无效');
  const kinds=new Set<MasterKind>(requested);
  const fundUpdate=kinds.has('fundAccounts')?repo.fundAccountApproval():undefined;
  const records = new Map<string,MasterRecord>();
  const put = (kind: MasterKind,id: string,body: Record<string,unknown>,version = 0,sourceFacts:Record<string,unknown> = {}) => {
    if (kinds.has(kind)) records.set(kind+'|'+id,{kind,id,body,version,sourceFacts});
  };
  const warehouseRows = kinds.has('warehouses')?await session.query<{id:string;code:string;name:string;enabled:boolean;type:string}>(`SELECT id::text,code,name,enabled,type FROM ${repo.source}.warehouse ORDER BY id`):{rows:[]};
  for (const row of warehouseRows.rows) put('warehouses',row.id,{code:row.code,name:row.name,enabled:row.enabled,type:row.type,hallRelations:[],sourceOwnershipUnknown:true});
  const batch = await committedBatch(session,repo);
  if (batch) {
    if (kinds.has('halls')) {
      const halls=await session.query<{id:string;source_code:string;name:string;default_customer_id:string|null;default_warehouse_id:string|null;warehouse_ids:string[];source_payload:unknown}>(`SELECT id::text,source_code,name,default_customer_id::text,default_warehouse_id::text,warehouse_ids::text[],source_payload FROM ${repo.source}.tplus_hall WHERE batch_id=$1 ORDER BY id`,[batch]);
      for (const row of halls.rows) put('halls',row.id,{code:row.source_code,name:row.name,enabled:sourceActive(row.source_payload),defaultCustomerId:row.default_customer_id||'',defaultWarehouseId:row.default_warehouse_id||''},0,jsonObject(row.source_payload));
    }
    if (kinds.has('parties')) {
      // source_id identifies an import row and can be a hash; the counterparty owns the business code.
      const parties=await session.query<{id:string;code:string;name:string;usage:string[];payloads:unknown[]}>(`SELECT p.party_id::text AS id,coalesce(max(c.code),'') AS code,max(p.name) AS name,array_agg(DISTINCT p.role ORDER BY p.role) AS usage,jsonb_agg(p.source_payload ORDER BY p.role) AS payloads FROM ${repo.source}.tplus_party_role p LEFT JOIN ${repo.source}.counterparty c ON c.id=p.party_id WHERE p.batch_id=$1 GROUP BY p.party_id ORDER BY p.party_id`,[batch]);
      for (const row of parties.rows) {
        const sourceFacts={records:row.payloads};
        const approved = repo.partyRole(row.code,{code:row.code,name:row.name,usage:row.usage,sourceFacts},row.id,sourceFacts);
        const usages = approved === undefined ? row.usage.filter(role=>role==='customer'||role==='supplier') : approved === null ? [] : [approved];
        put('parties',row.id,{code:row.code,name:row.name,enabled:row.payloads.some(sourceActive),usage:usages,tags:usages,sourceFacts},0,sourceFacts);
      }
    }
    if (kinds.has('payments')) {
      const payments=await session.query<{id:string;code:string|null;name:string;payload:unknown}>(`SELECT id::text,source_code AS code,name,source_payload AS payload FROM ${repo.source}.tplus_payment_method WHERE batch_id=$1 ORDER BY id`,[batch]);
      for (const row of payments.rows) put('payments',row.id,{code:row.code||'',name:row.name,enabled:sourceActive(row.payload)},0,jsonObject(row.payload));
    }
    if (fundUpdate) {
      const accounts=await session.query<{id:string;code:string;name:string;account_number:string|null;bank:string|null;account_type:string|null;primary_payment_method_id:string|null;hall_ids:string[];source_department_id:string|null;payload:unknown}>(`SELECT id::text,source_code AS code,name,account_number,bank,account_type,primary_payment_method_id::text,hall_ids::text[],source_department_id::text,source_payload AS payload FROM ${repo.source}.tplus_fund_account WHERE batch_id=$1 ORDER BY id`,[batch]);
      for (const row of accounts.rows) {
        const sourceFacts={...jsonObject(row.payload),hallIds:row.hall_ids};
        const body={code:row.code,name:row.name,enabled:sourceActive(row.payload),primaryPaymentMethodId:row.primary_payment_method_id||'',type:row.account_type||'',bank:row.bank||'',accountNumber:row.account_number||'',department:row.source_department_id||'',sourceFacts};
        put('fundAccounts',row.id,projectApprovedFundAccount(row.id,body,fundUpdate.syntheticSource?sourceFacts:{},fundUpdate),0,sourceFacts);
      }
    }
    if (kinds.has('warehouses')) {
      const warehouseRelations=await session.query<{warehouse_id:string;hall_ids:string[]}>(`SELECT warehouse_id::text,array_agg(DISTINCT id::text ORDER BY id::text) AS hall_ids FROM ${repo.source}.tplus_hall CROSS JOIN LATERAL unnest(warehouse_ids) warehouse_id WHERE batch_id=$1 GROUP BY warehouse_id`,[batch]);
      const relations = new Map(warehouseRelations.rows.map(row=>[row.warehouse_id,row.hall_ids]));
      for (const row of warehouseRows.rows) {
        const hallRelations = relations.get(row.id) ?? [];
        put('warehouses',row.id,{code:row.code,name:row.name,enabled:row.enabled,type:row.type,hallRelations,sourceOwnershipUnknown:hallRelations.length===0});
      }
    }
  }
  const overlays = await session.query<DbRecord>(`SELECT kind,id,body,source_facts,version,updated_by FROM ${repo.runtime}.master_data_entity WHERE kind=ANY($1::text[]) ORDER BY kind,id`,[[...kinds]]);
  for (const row of overlays.rows) if (isKind(row.kind)&&kinds.has(row.kind)) {
    let body=jsonObject(row.body);
    let sourceFacts=jsonObject(row.source_facts);
    if (row.kind==='fundAccounts'&&fundUpdate) {
      body=projectApprovedFundAccount(row.id,body,sourceFacts,fundUpdate);
      sourceFacts=fundAccountSourceFacts(sourceFacts);
    }
    if (row.kind==='parties') {
      const validationBody=Object.hasOwn(body,'sourceFacts')?body:{...body,sourceFacts};
      const approved=repo.partyRole(String(body['code']??''),validationBody,row.id,sourceFacts);
      if (approved!==undefined) body={...body,usage:approved?[approved]:[],tags:approved?[approved]:[]};
    }
    put(row.kind,row.id,body,row.version,sourceFacts);
  }
  const state = await session.query<{revision:number}>(`SELECT revision FROM ${repo.runtime}.master_data_state WHERE singleton=true`);
  return {revision:Number(state.rows[0]?.revision??0),records:[...records.values()].sort((a,b)=>a.kind.localeCompare(b.kind)||a.id.localeCompare(b.id))};
}

async function references(session: DataSession, repo: SecurityRepository): Promise<Map<string,MasterRecord>> {
  const {records} = await listMasterRecords(session,repo);
  return new Map(records.map(row=>[row.kind+'|'+row.id,row]));
}
async function validateRelations(session: DataSession, repo: SecurityRepository, kind: MasterKind, id: string, body: Record<string,unknown>, all: Map<string,MasterRecord>, previous?: Record<string,unknown>): Promise<void> {
  const get=(type:MasterKind,target:unknown)=>typeof target==='string'&&target?all.get(type+'|'+target):undefined;
  if (kind==='halls') {
    const customer=get('parties',body['defaultCustomerId']),warehouse=get('warehouses',body['defaultWarehouseId']);
    if (body['defaultCustomerId']&&body['defaultCustomerId']!==previous?.['defaultCustomerId']&&(!customer||customer.body['enabled']!==true||(customer.body['usage'] as string[]|undefined)?.length!==1||(customer.body['usage'] as string[])[0]!=='customer')) throw new SecurityError('VALIDATION',400,'默认零售客户须为正常客户');
    if (body['defaultWarehouseId']&&body['defaultWarehouseId']!==previous?.['defaultWarehouseId']&&(!warehouse||(body['enabled']===true&&warehouse.body['enabled']!==true)||warehouse.body['sourceOwnershipUnknown']===true||!(warehouse.body['hallRelations'] as string[]|undefined)?.includes(id))) throw new SecurityError('VALIDATION',400,'默认出库仓须为本营业厅关联的正常仓库');
  } else if (kind==='warehouses') {
    for (const target of body['hallRelations'] as string[]) {
      const hall=get('halls',target);
      if (!hall || (body['enabled']===true && hall.body['enabled']!==true)) throw new SecurityError('VALIDATION',400,'仓库营业厅须为正常营业厅');
    }
    if (!previous||JSON.stringify(previous['hallRelations'])!==JSON.stringify(body['hallRelations'])) for (const hall of all.values()) if (hall.kind==='halls'&&hall.body['defaultWarehouseId']===id&&!(body['hallRelations'] as string[]).includes(hall.id)) throw new SecurityError('VALIDATION',409,'请先修改营业厅的默认出库仓');
  } else if (kind==='parties') {
    if (body['enabled']===false && previous?.['enabled']!==false && [...all.values()].some(row=>row.kind==='halls'&&row.body['defaultCustomerId']===id)) throw new SecurityError('VALIDATION',409,'仍有营业厅将此往来单位设为默认零售客户');
  } else if (kind==='fundAccounts') {
    const method=get('payments',body['primaryPaymentMethodId']);
    if (body['primaryPaymentMethodId']&&(!method||method.body['enabled']!==true)) throw new SecurityError('VALIDATION',400,'所属收款方式须为正常方式');
  } else if (kind==='payments') {
    const inUse=[...all.values()].some(row=>row.kind==='fundAccounts'&&row.id!==id&&row.body['enabled']===true&&row.body['primaryPaymentMethodId']===id);
    if (body['enabled']===false&&inUse) throw new SecurityError('VALIDATION',409,'仍有正常资金账户使用此收款方式');
  }
  if (kind==='warehouses'&&body['enabled']===false&&previous?.['enabled']!==false) {
    if ([...all.values()].some(row=>row.kind==='halls'&&row.body['defaultWarehouseId']===id)) throw new SecurityError('VALIDATION',409,'仍有营业厅将此仓库设为默认出库仓');
    if (await hasNonzeroInventory(session,repo.runtime,repo.source,[id])) throw new SecurityError('VALIDATION',409,'仓库仍有库存，暂不能停用');
  }
  if (kind==='halls'&&body['enabled']===false) {
    const staff=await session.query<{in_use:boolean}>(`SELECT EXISTS(SELECT 1 FROM ${repo.auth}.employee_login e WHERE e.body->>'storeId'=$1 AND e.body->>'employmentStatus'='在职' AND e.body->>'role'='营业员') AS in_use`,[id]);
    if (staff.rows[0]?.in_use) throw new SecurityError('VALIDATION',409,'仍有在职营业员归属此营业厅');
  }
}

export async function saveMasterRecord(session: DataSession, repo: SecurityRepository, actor: Actor, input: unknown, validateOnly = false): Promise<MasterRecord> {
  const request=object(input),requestKey=identifier(request['requestKey']),id=identifier(request['id']);
  if (request['kind']==='fundAccounts') repo.fundAccountApproval();
  if (validateOnly) return saveMasterRecordInternal(session,repo,actor,input,true);
  try {
    return await executeIdempotent(session,{actorId:actor.id,commandScope:'masters.save',idempotencyKey:requestKey,runtimeSchema:repo.runtime,
      payload:{kind:request['kind'],id,expectedVersion:request['expectedVersion'],body:request['body']},execute:()=>saveMasterRecordInternal(session,repo,actor,input)});
  } catch (error) {
    if (error instanceof CommandError) {
      if (error.code==='IDEMPOTENCY_CONFLICT') throw new SecurityError('IDEMPOTENCY_CONFLICT',409,'原请求编号已用于其他基础资料内容');
      if (error.code==='VALIDATION_ERROR') throw new SecurityError('VALIDATION',400,'基础资料请求无效');
      throw new SecurityError('PENDING_VERIFICATION',409,'原请求结果待核实，请查询原请求');
    }
    throw error;
  }
}

async function saveMasterRecordInternal(session: DataSession, repo: SecurityRepository, actor: Actor, input: unknown, validateOnly = false): Promise<MasterRecord> {
  const request = object(input), kind = request['kind'], id = identifier(request['id']), expectedVersion=request['expectedVersion'], requestKey=identifier(request['requestKey']);
  if (!isKind(kind) || !Number.isInteger(expectedVersion) || Number(expectedVersion)<0) throw new SecurityError('VALIDATION',400,'基础资料版本或类型无效');
  const body=validateBody(kind,request['body'],repo,id);
  const replay=validateOnly?{rows:[]}:await session.query<{kind:string;id:string;version:number;body:Record<string,unknown>;source_facts:Record<string,unknown>}>(`SELECT kind,id,version,body,source_facts FROM ${repo.runtime}.master_data_history WHERE actor_id=$1 AND request_key=$2`,[actor.id,requestKey]);
  if (replay.rows[0]) {
    const row=replay.rows[0];
    if (row.kind!==kind||row.id!==id||JSON.stringify(row.body)!==JSON.stringify(body)) throw new SecurityError('IDEMPOTENCY_CONFLICT',409,'原请求编号已用于其他基础资料内容');
    const facts=jsonObject(row.source_facts);
    return {kind:row.kind as MasterKind,id:row.id,version:row.version,body:jsonObject(row.body),sourceFacts:kind==='fundAccounts'?fundAccountSourceFacts(facts):facts};
  }
  const all=await references(session,repo), sourceCurrent=all.get(kind+'|'+id);
  if (body['code'] && [...all.values()].some(row=>row.kind===kind&&row.id!==id&&String(row.body['code']??'').trim().toLocaleLowerCase()===String(body['code']).trim().toLocaleLowerCase())) throw new SecurityError('VALIDATION',409,'编码已存在，请核对后重试');
  const current=await session.query<DbRecord>(`SELECT kind,id,body,source_facts,version,updated_by FROM ${repo.runtime}.master_data_entity WHERE kind=$1 AND id=$2 ${validateOnly?'':'FOR UPDATE'}`,[kind,id]);
  const old=current.rows[0], currentVersion=old?.version??sourceCurrent?.version??0;
  const beforeBody=kind==='fundAccounts'?(sourceCurrent?.body??old?.body??null):(old?.body??sourceCurrent?.body??null);
  const existingFacts=jsonObject(old?.source_facts??sourceCurrent?.sourceFacts??body['sourceFacts']);
  const sourceFacts=kind==='fundAccounts'?fundAccountSourceFacts(existingFacts):existingFacts;
  if (currentVersion!==expectedVersion) throw new SecurityError('VERSION_CONFLICT',409,'基础资料已更新，请重新打开核对');
  if (kind==='fundAccounts'&&!body['primaryPaymentMethodId']&&!sourceCurrent&&!old) throw new SecurityError('VALIDATION',400,'请选择所属收款方式');
  if ((old||sourceCurrent) && JSON.stringify(body['sourceFacts']??null)!==JSON.stringify(beforeBody?.['sourceFacts']??null)) throw new SecurityError('VALIDATION',409,'来源事实只读，不能修改');
  if (sourceCurrent && body['code']!==beforeBody?.['code']) throw new SecurityError('VALIDATION',409,'来源编码只读，不能修改');
  if ((sourceCurrent||currentVersion>0)&&kind==='fundAccounts'&&beforeBody?.['primaryPaymentMethodId']!==body['primaryPaymentMethodId']) throw new SecurityError('VALIDATION',409,'资金账户创建后不能修改所属收款方式，请新建账户并停用旧账户');
  all.set(kind+'|'+id,{kind,id,version:currentVersion,body,sourceFacts});
  await validateRelations(session,repo,kind,id,body,all,beforeBody??undefined);
  const version=currentVersion+1, action=currentVersion===0&&!sourceCurrent?'CREATE':beforeBody?.['enabled']!==body['enabled']?(body['enabled']?'ENABLE':'DISABLE'):'UPDATE';
  if (validateOnly) return {kind,id,version,body,sourceFacts};
  const storedSourceFacts=kind==='fundAccounts'?acknowledgeFundAccountUpdate(id,body,sourceFacts,repo.fundAccountApproval()):sourceFacts;
  const actorAccount=await repo.account(actor.id), actorName=string(actorAccount?.body['name']??actor.id,128);
  await session.query(`INSERT INTO ${repo.runtime}.master_data_entity(kind,id,body,source_facts,version,updated_by) VALUES($1,$2,$3::jsonb,$4::jsonb,$5,$6)
    ON CONFLICT(kind,id) DO UPDATE SET body=excluded.body,source_facts=excluded.source_facts,version=excluded.version,updated_by=excluded.updated_by,updated_at=now()`,[kind,id,JSON.stringify(body),JSON.stringify(storedSourceFacts),version,actor.id]);
  await session.query(`INSERT INTO ${repo.runtime}.master_data_history(kind,id,version,request_key,operation,actor_id,actor_name,before_body,body,before_source_facts,source_facts)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb)`,[kind,id,version,requestKey,action,actor.id,actorName,beforeBody?JSON.stringify(beforeBody):null,JSON.stringify(body),sourceCurrent?.sourceFacts?JSON.stringify(sourceCurrent.sourceFacts):null,JSON.stringify(storedSourceFacts)]);
  await session.query(`UPDATE ${repo.runtime}.master_data_state SET revision=revision+1 WHERE singleton=true`);
  return {kind,id,version,body,sourceFacts};
}

export async function setMasterEnabled(session: DataSession, repo: SecurityRepository, actor: Actor, input: unknown): Promise<MasterRecord> {
  const request=object(input),kind=request['kind'];
  if (!isKind(kind)||typeof request['enabled']!=='boolean') throw new SecurityError('VALIDATION',400,'基础资料类型或启停状态无效');
  const id=identifier(request['id']),expectedVersion=request['expectedVersion'];
  if (!Number.isInteger(expectedVersion)||Number(expectedVersion)<0) throw new SecurityError('VALIDATION',400,'基础资料版本无效');
  const row=(await references(session,repo)).get(kind+'|'+id);
  if (!row||row.version!==expectedVersion) throw new SecurityError('VERSION_CONFLICT',409,'基础资料已更新，请重新打开核对');
  if (row.body['enabled']===request['enabled']) return row;
  const body={...row.body,enabled:request['enabled']};
  return saveMasterRecord(session,repo,actor,{kind,id,expectedVersion,requestKey:request['requestKey'],body});
}

export async function masterHistory(session: DataSession, repo: SecurityRepository, actor: Actor, query: unknown): Promise<Array<Record<string,unknown>>> {
  const input=object(query),kind=input['kind'],id=input['id'];
  if (kind!==undefined&&!isKind(kind)) throw new SecurityError('VALIDATION',400,'基础资料类型无效');
  const history=await session.query<{kind:string;id:string;version:number;operation:string;actor_id:string|null;actor_name:string;before_body:Record<string,unknown>|null;body:Record<string,unknown>;created_at:Date}>(
    `SELECT kind,id,version,operation,actor_id,actor_name,before_body,body,created_at FROM ${repo.runtime}.master_data_history WHERE ($1::text IS NULL OR kind=$1) AND ($2::text IS NULL OR id=$2) ORDER BY created_at DESC,kind,id,version DESC LIMIT 1000`,[kind??null,id?identifier(id):null]);
  const result=history.rows.map(row=>({time:row.created_at.toISOString(),actor:row.actor_name,actorId:row.actor_id,module:row.kind, type:row.kind,object:row.body['name']||row.id,target:row.id,action:row.operation==='CREATE'?'新增':row.operation==='ENABLE'?'恢复使用':row.operation==='DISABLE'?'停用':row.operation==='MIGRATED'?'迁入':'修改',changes:Object.keys(row.body).filter(key=>JSON.stringify(row.before_body?.[key])!==JSON.stringify(row.body[key])).map(field=>({field,before:row.before_body?.[field]??null,after:row.body[field]??null})),version:row.version}));
  if(actor.role==='ADMIN') {
    const employeeAudit=await session.query<{id:number;actor_id:string;employee_id:string;action:string;changes:unknown;created_at:Date;actor_name:string|null;employee_name:string|null}>(
      `SELECT a.id,a.actor_id,a.employee_id,a.action,a.changes,a.created_at,actor.body->>'name' AS actor_name,target.body->>'name' AS employee_name
        FROM ${repo.auth}.employee_account_audit a LEFT JOIN ${repo.auth}.employee_login actor ON actor.id=a.actor_id LEFT JOIN ${repo.auth}.employee_login target ON target.id=a.employee_id ORDER BY a.id DESC LIMIT 1000`);
    for(const row of employeeAudit.rows) result.push({time:row.created_at.toISOString(),actor:row.actor_name||row.actor_id,actorId:row.actor_id,module:'staff',type:'staff',object:row.employee_name||row.employee_id,target:row.employee_id,action:row.action,changes:Array.isArray(row.changes)?row.changes:[],version:row.id});
  }
  return result.sort((a,b)=>String(b['time']).localeCompare(String(a['time'])));
}
