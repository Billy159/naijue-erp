/** Dormant real-PG acceptance for the original T45 prepared synthetic host.
 * Import runLiveLedgerBalancePairsIntegration AFTER original import/PUBLISH,
 * V8 review, ordinary LOGIN and finite scenario preparation. No seed/import,
 * DDL/GRANT, key/review/capacity issuance, listener or automatic retry here.
 * Unlike tests/support/live-ledger-api-v*-fixtures, this uses real pg only.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {lstat, readFile, realpath} from 'node:fs/promises';
import {isAbsolute, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Client, Pool} from 'pg';
import type {LightMyRequestResponse} from 'fastify';
import type {BoundedPostgresDriverConfig, PostgresPoolDriverFactory} from '../../adapters/postgres/src/bounded-pool.ts';
import type {NativeRuntime26Issuer} from '../../adapters/postgres/src/native-import-accounting-capability.ts';
import {checkedNativeRuntime26Capability} from '../../packages/application/src/native-import-schema-contract.ts';
import {parseNativeSalesSaveProposal} from '../../packages/application/src/native-sales-preparation.ts';
import type {NativeSalesSaveProposal} from '../../packages/application/src/native-sales-preparation.ts';
import {parseNativeTransferSaveProposal} from '../../packages/application/src/native-transfer-preparation.ts';
import type {NativeTransferSaveProposal} from '../../packages/application/src/native-transfer-preparation.ts';
import {importedHistoryReadSql} from '../../adapters/postgres/src/imported-history-query-reader.ts';
import {createProductionRuntime26FullApplicationApi, parseProductionRuntime26R3Configuration} from '../../apps/api/src/production-provider-composition.ts';
import type {PostgresApplicationApi} from '../../apps/api/src/postgres-read-api.ts';
import type {CapacityAdmission} from '../../apps/api/src/capacity-admission.ts';
import type {CredentialRequestTag} from '../../packages/application/src/maintenance-commit-ports.ts';

export const LIVE_LEDGER_PAIRS_SYNTHETIC_TARGET='demo_8877_v7_r1_rehearsal_20261031_01';
type Family='sales'|'transfers';
type Row=Record<string,unknown>;
interface Keys {readonly save:string;readonly approve:string;readonly unapprove:string;readonly reopen:string;readonly reapprove:string;readonly rollback:string;readonly unknownCommit:string}
/** Private input from the original approved fixture channel, not a new producer.
 * Both proposals use one ALREADY EXISTING real SKU, no specification creation.
 * Baseline quantities/versions are explicit real source fixture expectations;
 * an absent balance is NOT silently interpreted as zero in this finite case.
 * The original host must also supply real baseline + HISTORY_REVISION ledger IDs
 * on these keys to exercise preservation of their unknown recorded balances.
 */
export interface LiveLedgerBalancePairsScenario {
 readonly syntheticOnly:true;
 readonly login:{readonly accountId:string;readonly loginName:string;readonly password:string};
 readonly sales:NativeSalesSaveProposal;
 readonly transfers:NativeTransferSaveProposal;
 readonly initialInventory:readonly {readonly warehouseId:string;readonly skuId:string;readonly quantity:string;readonly version:number}[];
 readonly unrecordedLedgerIds:{readonly baseline:readonly string[];readonly historyRevision:readonly string[]};
 readonly keys:{readonly sales:Keys;readonly transfers:Keys};
}
export interface LiveLedgerBalancePairsContext {
 readonly authorization:'CONFIRMED_NEW_ISOLATED_LIVE_LEDGER_PAIRS';
 readonly configuration:unknown;
 readonly issuer:NativeRuntime26Issuer;
 readonly target:{readonly database:string;readonly databaseOid:string;readonly runtimeRole:string;readonly postmasterStart:string};
 readonly publication:{readonly batchId:string;readonly sourceHash:string;readonly historyPayloadHash:string};
 readonly privateScenarioFile:string;
 /** Actual existing host resource/tag, never an allow-all/local fake admission. */
 readonly capacityAdmission:CapacityAdmission;
 readonly staffCredentialRequestTag:CredentialRequestTag|null;
}
interface Result {operationId:string;salesId?:string;transferId?:string;version:number;status:string;ledgerEntryIds:string[]}
interface Snapshot {balances:Row[];ledger:Row[];headers:Row[];lines:Row[];settlements:Row[];receipts:Row[];audits:Row[]}
const key=(warehouse:unknown,sku:unknown)=>`${String(warehouse)}:${String(sku)}`;
const int=(value:unknown):bigint=>{assert.ok(typeof value==='string'&&/^(?:0|-?[1-9]\d*)$/.test(value),'Exact PG integer text required');return BigInt(value);};
async function scenarioFile(filename:string):Promise<LiveLedgerBalancePairsScenario>{
 try{
  assert.ok(isAbsolute(filename)&&resolve(filename)===filename&&await realpath(filename)===filename);
  const before=await lstat(filename);assert.ok(before.isFile()&&!before.isSymbolicLink()&&before.uid===process.getuid?.()&&(before.mode&0o077)===0&&before.size>0&&before.size<=262144);
  const bytes=await readFile(filename),after=await lstat(filename);
  assert.ok(before.dev===after.dev&&before.ino===after.ino&&before.size===after.size&&bytes.length===before.size&&before.mtimeMs===after.mtimeMs&&before.ctimeMs===after.ctimeMs);
  const s=JSON.parse(bytes.toString('utf8')) as LiveLedgerBalancePairsScenario;
  assert.ok(s.syntheticOnly===true&&typeof s.login?.accountId==='string'&&typeof s.login.loginName==='string'&&typeof s.login.password==='string'&&s.login.password.length>0);
  const sales=parseNativeSalesSaveProposal(s.sales),transfers=parseNativeTransferSaveProposal(s.transfers);
  assert.ok(sales.salesId===null&&sales.businessType==='SALE'&&sales.lines.length===1&&sales.settlements.length===1&&sales.lines[0]!.existingLineId===null&&sales.settlements[0]!.existingSettlementId===null);
  assert.ok(transfers.transferId===null&&transfers.lines.length===1&&transfers.lines[0]!.existingLineId===null&&transfers.fromWarehouseId!==transfers.toWarehouseId);
  for(const line of [sales.lines[0]!,transfers.lines[0]!])assert.ok('skuId'in line&&int(line.quantity)>0n,'Existing concrete SKU only; no automatic specification creation');
  const keys=[...Object.values(s.keys.sales),...Object.values(s.keys.transfers)];
  assert.ok(keys.length===14&&new Set(keys).size===14&&keys.every(k=>typeof k==='string'&&/^[A-Za-z0-9._:-]{1,128}$/.test(k)));
  assert.ok(Array.isArray(s.initialInventory)&&s.initialInventory.length>0&&s.initialInventory.every(b=>typeof b.warehouseId==='string'&&typeof b.skuId==='string'&&typeof b.quantity==='string'&&Number.isInteger(b.version)&&b.version>0));
  s.initialInventory.forEach(b=>int(b.quantity));
  assert.ok(s.unrecordedLedgerIds.baseline.length>0&&s.unrecordedLedgerIds.historyRevision.length>0,'Actual original baseline/history unknown-pair rows must be supplied, never fabricated or skipped');
  return {...s,sales,transfers};
 }catch{throw Error('Approved private live-ledger synthetic scenario missing or invalid; no input details exported');}
}
/** Real driver with two finite faults, following staff-credential-production-entry.
 * All results come from pg. Rollback fault executes a real server error after a
 * real uncommitted ledger INSERT. Unknown fault really COMMITs, then loses ACK.
 */
function observedDriver(){
 let config:BoundedPostgresDriverConfig|undefined;
 let armed:{family:Family;kind:'rollback'|'unknown'}|undefined;
 const pids=new Set<number>();
 const counts={commits:0,rollbacks:0,rollbackFaults:0,unknownFaults:0,discarded:0};
 const driver:PostgresPoolDriverFactory=c=>{
  assert.equal(config,undefined,'One original application driver only');config=c;const pool=new Pool(c);
  return {on:(event,listener)=>pool.on(event,listener),end:()=>pool.end(),async connect(){
   const raw=await pool.connect();let family:Family|undefined,lost=false;
   let pid:number;
   try{pid=Number((await raw.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);}
   catch(error){raw.release(error instanceof Error?error:Error('PID observation failed'));throw error;}
   return {on:(event,listener)=>raw.on(event,listener),removeListener:(event,listener)=>raw.removeListener(event,listener),async query(sql,values){
    if(/^BEGIN\b/.test(sql))family=undefined;
    if(/\b(?:INSERT INTO|UPDATE) naijue_erp\.sales_(?:header|line)\b/.test(sql))family='sales';
    if(/\b(?:INSERT INTO|UPDATE) naijue_erp\.transfer_(?:header|line)\b/.test(sql))family='transfers';
    const ledger=/\bINSERT INTO naijue_erp\.inventory_ledger\b/.test(sql);
    if(ledger)family=sql.includes('source_sales_line_id')?'sales':'transfers';
    const result=await raw.query(sql,values);
    if(ledger&&armed&&armed.family===family&&armed.kind==='rollback'){
     armed=undefined;counts.rollbackFaults++;
     await raw.query('SELECT 1/0'); // actual SQLSTATE22012; original transaction must roll back
     throw Error('Expected real PostgreSQL failure did not occur');
    }
    if(sql==='ROLLBACK'&&family){counts.rollbacks++;family=undefined;}
    if(sql==='COMMIT'&&family){
     counts.commits++;pids.add(pid);
     if(armed&&armed.family===family&&armed.kind==='unknown'){
      armed=undefined;counts.unknownFaults++;lost=true;
      throw Error('Synthetic acknowledgement lost after actual COMMIT');
     }
     family=undefined;
    }
    return result;
   },release(error){if(lost&&error)counts.discarded++;raw.release(error);}};
  }};
 };
 return {driver,config:()=>{assert.ok(config);return config;},pids,counts,
  arm(family:Family,kind:'rollback'|'unknown'){assert.equal(armed,undefined);armed={family,kind};},
  assertConsumed(){assert.equal(armed,undefined,'Original requested fault must actually be reached');}};
}

export async function runLiveLedgerBalancePairsIntegration(context:LiveLedgerBalancePairsContext):Promise<void>{
 let api:PostgresApplicationApi|undefined,phase='INPUT',failure:Error|undefined;
 try{
  assert.equal(context?.authorization,'CONFIRMED_NEW_ISOLATED_LIVE_LEDGER_PAIRS');
  const c=parseProductionRuntime26R3Configuration(context.configuration),target=context.target;
  assert.ok(target.database===LIVE_LEDGER_PAIRS_SYNTHETIC_TARGET&&/^[1-9]\d*$/.test(target.databaseOid)&&target.runtimeRole===c.postgres.target.user&&target.database===c.postgres.target.database&&target.postmasterStart.length>0);
  assert.ok(c.existingPreparation.sales&&c.existingPreparation.transfers&&context.capacityAdmission,'Original reviewed Full host with both existing preparations and real capacity required');
  const runtime=checkedNativeRuntime26Capability(context.issuer?.runtime26);assert.ok(runtime&&context.issuer.pool,'Genuine original issuer required');
  const s=await scenarioFile(context.privateScenarioFile);
  const saleLine=s.sales.lines[0]!,transferLine=s.transfers.lines[0]!;assert.ok('skuId'in saleLine&&'skuId'in transferLine);
  const pairs=[{warehouse:s.sales.warehouseId,sku:saleLine.skuId},{warehouse:s.transfers.fromWarehouseId,sku:transferLine.skuId},{warehouse:s.transfers.toWarehouseId,sku:transferLine.skuId}];
  const distinct=[...new Map(pairs.map(p=>[key(p.warehouse,p.sku),p])).values()];
  assert.equal(s.initialInventory.length,distinct.length);assert.equal(new Set(s.initialInventory.map(b=>key(b.warehouseId,b.skuId))).size,distinct.length);
  assert.ok(distinct.every(p=>s.initialInventory.some(b=>b.warehouseId===p.warehouse&&b.skuId===p.sku)),'All affected baseline keys must be explicit');
  const lease=await context.issuer.pool.connect();
  try{await runtime.assertReady(lease,'INVENTORY_ADMISSION');const id=(await lease.query('SELECT current_database() db,current_user role,session_user,(SELECT oid::text FROM pg_database WHERE datname=current_database()) oid,pg_postmaster_start_time()::text started')).rows[0];
   assert.ok(id?.db===target.database&&id.oid===target.databaseOid&&id.role===target.runtimeRole&&id.session_user===target.runtimeRole&&id.started===target.postmasterStart);
  }finally{lease.release();}
  const fault=observedDriver();phase='FULL_HOST_V8_ISSUER';
  api=await createProductionRuntime26FullApplicationApi(c,fault.driver,context.staffCredentialRequestTag,context.capacityAdmission);
  assert.equal(api.app.server.listening,false,'No listener is created for this acceptance');
  const knownIds:{sales:string[];transfers:string[]}={sales:[],transfers:[]};
  const allKeys=[...Object.values(s.keys.sales),...Object.values(s.keys.transfers)];
  /** Every invocation opens/closes a genuinely NEW normal-login pg.Client,
   * never an owner, borrowed writer client, cached result or reused pool lease. */
  const observe=async():Promise<Snapshot>=>{
   const client=new Client(fault.config());client.on('error',()=>{});let began=false;
   try{
    await client.connect();await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');began=true;
    const id=(await client.query(`SELECT current_database() db,current_user role,session_user,pg_backend_pid() pid,
     (SELECT oid::text FROM pg_database WHERE datname=current_database()) oid,pg_postmaster_start_time()::text started,
     (SELECT rolcanlogin AND NOT(rolsuper OR rolinherit OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls) FROM pg_roles WHERE rolname=current_user) ordinary,
     ((SELECT pg_get_userbyid(datdba)=current_user FROM pg_database WHERE datname=current_database())
      OR EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='naijue_erp' AND pg_get_userbyid(nspowner)=current_user)
      OR EXISTS(SELECT 1 FROM pg_class WHERE relnamespace='naijue_erp'::regnamespace AND pg_get_userbyid(relowner)=current_user)
      OR EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='naijue_erp'::regnamespace AND pg_get_userbyid(proowner)=current_user)) owns,
     EXISTS(SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=current_user)) member`)).rows[0];
    assert.ok(id.db===target.database&&id.oid===target.databaseOid&&id.role===target.runtimeRole&&id.session_user===target.runtimeRole&&id.started===target.postmasterStart&&id.ordinary===true&&id.owns===false&&id.member===false&&!fault.pids.has(Number(id.pid)),'Fresh physical nonowner direct LOGIN must independently match target/process');
    const pub=importedHistoryReadSql('sales'),p=context.publication;
    const published=(await client.query(`SELECT b.id,b.source_hash,b.history_payload_hash,(${pub.publishedPredicate}) published FROM ${pub.publicationFrom} WHERE b.id=$2::uuid`,[pub.values[0],p.batchId])).rows;
    assert.ok(published.length===1&&published[0].published===true&&published[0].source_hash===p.sourceHash&&published[0].history_payload_hash===p.historyPayloadHash,'Original complete PUBLISH receipt/audit/closure readback required; never STAGED');
    const bound=[distinct.map(p=>p.warehouse),distinct.map(p=>p.sku)];
    const balances=(await client.query(`SELECT b.warehouse_id,b.sku_id,b.quantity::text,b.version,b.last_operation_id,b.updated_at::text
     FROM naijue_erp.inventory_balance b JOIN unnest($1::uuid[],$2::uuid[]) k(w,s) ON k.w=b.warehouse_id AND k.s=b.sku_id ORDER BY b.warehouse_id,b.sku_id`,bound)).rows as Row[];
    assert.equal(balances.length,distinct.length,'Missing balance remains UNKNOWN, not zero or a fixture creation request');
    const ledger=(await client.query(`SELECT l.id,l.operation_id,l.event_kind,l.warehouse_id,l.sku_id,l.quantity_delta::text,l.quantity_before::text,l.quantity_after::text,
     l.source_sales_line_id,l.source_transfer_line_id,l.source_import_batch_id,l.source_history_revision_id,l.source_history_sales_line_id,l.source_history_transfer_line_id,
     l.endpoint,l.source_document_version,l.reverses_entry_id,l.business_date::text,l.posted_at::text
     FROM naijue_erp.inventory_ledger l JOIN unnest($1::uuid[],$2::uuid[]) k(w,s) ON k.w=l.warehouse_id AND k.s=l.sku_id ORDER BY l.id LIMIT 10001`,bound)).rows as Row[];
    assert.ok(ledger.length<10001,'Finite host fixture must not silently truncate ledger readback');
    for(const r of ledger)if(r.event_kind==='HISTORY_REVISION'||r.source_import_batch_id!==null)assert.ok(r.quantity_before===null&&r.quantity_after===null,'Historical/import recorded balances must remain unknown, never inferred zero');
    for(const [kind,ids]of Object.entries(s.unrecordedLedgerIds))for(const id of ids){const r=ledger.find(r=>r.id===id);assert.ok(r&&r.quantity_before===null&&r.quantity_after===null&&(kind==='baseline'?r.source_import_batch_id!==null:r.event_kind==='HISTORY_REVISION'),'Explicit host baseline/history example must really exist on affected keys');}
    const headers:Row[]=[],lines:Row[]=[],settlements:Row[]=[];
    for(const family of ['sales','transfers'] as const){const f=family==='sales'?'sales':'transfer';
     headers.push(...(await client.query(`SELECT '${family}' family,id,number,status,version,stock_basis FROM naijue_erp.${f}_header WHERE id=ANY($1::uuid[]) ORDER BY id`,[knownIds[family]])).rows);
     lines.push(...(await client.query(`SELECT '${family}' family,id,${f}_id document_id,line_no,sku_id,quantity::text,is_current FROM naijue_erp.${f}_line WHERE ${f}_id=ANY($1::uuid[]) ORDER BY id`,[knownIds[family]])).rows);
    }
    settlements.push(...(await client.query('SELECT id,sales_id,line_no,payment_account_id,payment_method_id_snapshot,direction,amount::text FROM naijue_erp.sales_settlement WHERE sales_id=ANY($1::uuid[]) ORDER BY line_no,id',[knownIds.sales])).rows);
    const receipts=(await client.query(`SELECT id,actor_account_id,request_key,action,target_type,target_id,status,result_data,completed_at::text FROM naijue_erp.operation_receipt WHERE actor_account_id=$1::uuid AND request_key=ANY($2::text[]) ORDER BY id`,[s.login.accountId,allKeys])).rows as Row[];
    const audits=(await client.query('SELECT id,operation_id,actor_account_id,object_type,object_id,action,old_version,new_version,occurred_at::text FROM naijue_erp.audit_change WHERE operation_id=ANY($1::uuid[]) ORDER BY id',[receipts.map(r=>r.id)])).rows as Row[];
    await client.query('ROLLBACK');began=false;return {balances,ledger,headers,lines,settlements,receipts,audits};
   }finally{try{if(began)await client.query('ROLLBACK');}finally{await client.end();}}
  };
  phase='BASELINE_NEW_LOGIN_AND_PUBLISHED_FIXTURE';const initial=await observe();
  assert.equal(initial.receipts.length,0,'Fresh scenario original keys must be unused; no silent rerun');
  for(const b of s.initialInventory){const actual=initial.balances.find(r=>key(r.warehouse_id,r.sku_id)===key(b.warehouseId,b.skuId));assert.ok(actual);assert.equal(actual.quantity,b.quantity);assert.equal(actual.version,b.version);}
  phase='ORDINARY_CREDENTIAL_LOGIN';
  const login=await api.app.inject({method:'POST',url:'/auth/login',headers:{origin:c.publicOrigin,'content-type':'application/json'},payload:{loginName:s.login.loginName,password:s.login.password}});
  assert.equal(login.statusCode,200);const setCookie=login.headers['set-cookie'];assert.ok(typeof setCookie==='string'&&setCookie.startsWith('__Host-naijue_session='));const cookie=setCookie.split(';')[0]!;
  const headers={origin:c.publicOrigin,cookie,'content-type':'application/json'};
  const post=(family:Family,body:object)=>api!.app.inject({method:'POST',url:`/${family}/commands`,headers,payload:body});
  const result=(response:Awaited<ReturnType<typeof post>>):Result=>{assert.equal(response.statusCode,200,'Original actual business command must commit');return response.json<Result>();};
  const idOf=(family:Family,r:Result)=>{const id=family==='sales'?r.salesId:r.transferId;assert.ok(typeof id==='string');return id;};
  const stockOnly=(x:Snapshot)=>({balances:x.balances,ledger:x.ledger});
  const committed=(family:Family,x:Snapshot,r:Result,requestKey:string,action:string)=>{
   const id=idOf(family,r),h=x.headers.find(h=>h.id===id&&h.family===family);assert.ok(h&&h.status===r.status&&h.version===r.version&&h.stock_basis==='RUNTIME_LEDGER');
   const receipt=x.receipts.find(a=>a.request_key===requestKey),audit=x.audits.find(a=>a.operation_id===r.operationId);
   assert.ok(receipt&&audit&&receipt.id===r.operationId&&receipt.status==='COMMITTED'&&receipt.action===action&&receipt.target_id===id&&receipt.actor_account_id===s.login.accountId);
   assert.deepEqual(receipt.result_data,r);assert.ok(audit.object_id===id&&audit.actor_account_id===s.login.accountId&&audit.action===action&&audit.new_version===r.version&&audit.old_version===(r.version===1?null:r.version-1)&&audit.occurred_at===receipt.completed_at);
   return {h,receipt};
  };
  const posting=(family:Family,before:Snapshot,after:Snapshot,r:Result,k:string,action:'APPROVE'|'UNAPPROVE',reverseOf?:Row[])=>{
   const {receipt}=committed(family,after,r,k,action),newRows=after.ledger.filter(x=>x.operation_id===r.operationId);
   assert.equal(newRows.length,family==='sales'?1:2);assert.deepEqual(newRows.map(x=>x.id).sort(),[...r.ledgerEntryIds].sort());
   assert.deepEqual(after.ledger.filter(x=>before.ledger.some(b=>b.id===x.id)),before.ledger,'Every previous live/history/import ledger row is immutable');
   const q=int(family==='sales'?saleLine.quantity:transferLine.quantity),sign=action==='APPROVE'?1n:-1n;
   let total=0n;const changed=new Set<string>();
   for(const row of newRows){
    assert.ok(family==='sales'?row.warehouse_id===s.sales.warehouseId:[s.transfers.fromWarehouseId,s.transfers.toWarehouseId].includes(String(row.warehouse_id)),'Exact document endpoint warehouse required');
    const from=family==='sales'?s.sales.warehouseId:s.transfers.fromWarehouseId,delta=(row.warehouse_id===from?-q:q)*sign;
    assert.ok(row.event_kind===action&&row.source_document_version===r.version&&row.posted_at===receipt.completed_at&&row.source_import_batch_id===null&&row.source_history_revision_id===null);
    const line=after.lines.find(l=>l.family===family&&l.document_id===idOf(family,r)&&l.is_current===true);assert.ok(line);
    assert.ok(row.sku_id===line.sku_id&&(family==='sales'?row.source_sales_line_id===line.id&&row.source_transfer_line_id===null&&row.endpoint==='SALES_WAREHOUSE':row.source_transfer_line_id===line.id&&row.source_sales_line_id===null&&row.endpoint===(row.warehouse_id===from?'FROM':'TO')));
    const identity=key(row.warehouse_id,row.sku_id),old=before.balances.find(b=>key(b.warehouse_id,b.sku_id)===identity),next=after.balances.find(b=>key(b.warehouse_id,b.sku_id)===identity);assert.ok(old&&next&&!changed.has(identity));changed.add(identity);
    assert.equal(int(row.quantity_delta),delta);assert.equal(row.quantity_before,old.quantity);assert.equal(int(row.quantity_after),int(old.quantity)+delta);
    assert.equal(next.quantity,row.quantity_after);assert.equal(next.version,Number(old.version)+1);assert.equal(next.last_operation_id,r.operationId);assert.equal(next.updated_at,receipt.completed_at);
    if(reverseOf){const original=reverseOf.find(o=>o.warehouse_id===row.warehouse_id&&o.sku_id===row.sku_id&&o.endpoint===row.endpoint);assert.ok(original);assert.equal(row.reverses_entry_id,original.id);assert.equal(int(row.quantity_delta),-int(original.quantity_delta));}
    else assert.equal(row.reverses_entry_id,null);
    total+=int(row.quantity_delta);
   }
   if(family==='transfers')assert.equal(total,0n,'Both warehouses conserve the exact same original SKU quantity');else assert.equal(total,-q*sign);
   for(const b of before.balances)if(!changed.has(key(b.warehouse_id,b.sku_id)))assert.deepEqual(after.balances.find(a=>key(a.warehouse_id,a.sku_id)===key(b.warehouse_id,b.sku_id)),b);
   return newRows;
  };
  for(const family of ['sales','transfers'] as const){
   const keys=s.keys[family],proposal=family==='sales'?s.sales:s.transfers;
   phase=`${family}:SAVE_REAL_COMMIT`;let before=await observe();
   const saveBody={action:'SAVE',requestKey:keys.save,expectedVersion:null,proposal};const saved=result(await post(family,saveBody));knownIds[family].push(idOf(family,saved));
   let state=await observe();committed(family,state,saved,keys.save,'SAVE');assert.ok(saved.status==='DRAFT'&&saved.version===1);assert.deepEqual(saved.ledgerEntryIds,[]);assert.deepEqual(stockOnly(state),stockOnly(before),'SAVE must not change stock');
   const command=(action:'APPROVE'|'UNAPPROVE',requestKey:string,version:number)=>({action,requestKey,expectedVersion:version,...(family==='sales'?{salesId:idOf(family,saved)}:{transferId:idOf(family,saved)})});
   phase=`${family}:APPROVE_REAL_COMMIT_AND_NEW_CONNECTION`;before=state;const approveBody=command('APPROVE',keys.approve,saved.version),approved=result(await post(family,approveBody));state=await observe();const first=posting(family,before,state,approved,keys.approve,'APPROVE');
   assert.equal(approved.status,'APPROVED');assert.equal(approved.version,2);
   phase=`${family}:ORIGINAL_KEY_REPLAY`;assert.deepEqual(result(await post(family,approveBody)),approved);assert.deepEqual(await observe(),state,'Original-key replay cannot write again');
   phase=`${family}:UNAPPROVE_AND_COMPENSATION`;before=state;const unapproved=result(await post(family,command('UNAPPROVE',keys.unapprove,approved.version)));state=await observe();posting(family,before,state,unapproved,keys.unapprove,'UNAPPROVE',first);assert.equal(unapproved.status,'DRAFT');assert.equal(unapproved.version,3);
   // Reopen/edit through the original SAVE proposal. The real persisted child
   // IDs are used; no synthetic number/snapshot/specification is constructed.
   phase=`${family}:REOPEN_EXISTING_SAVE`;const own=state.lines.filter(l=>l.family===family&&l.document_id===idOf(family,saved)&&l.is_current===true);assert.equal(own.length,1);
   const reopenedProposal=family==='sales'?{...s.sales,salesId:idOf(family,saved),lines:s.sales.lines.map(l=>({...l,existingLineId:String(own[0]!.id)})),settlements:s.sales.settlements.map((v,i)=>{const old=state.settlements[i];assert.ok(old&&old.sales_id===idOf(family,saved));return {...v,existingSettlementId:String(old.id)};})}
    :{...s.transfers,transferId:idOf(family,saved),lines:s.transfers.lines.map(l=>({...l,existingLineId:String(own[0]!.id)}))};
   before=state;const reopened=result(await post(family,{action:'SAVE',requestKey:keys.reopen,expectedVersion:unapproved.version,proposal:reopenedProposal}));state=await observe();committed(family,state,reopened,keys.reopen,'SAVE');assert.equal(reopened.version,4);assert.equal(reopened.status,'DRAFT');assert.deepEqual(stockOnly(state),stockOnly(before));
   phase=`${family}:REAPPROVE`;before=state;const reapproved=result(await post(family,command('APPROVE',keys.reapprove,reopened.version)));state=await observe();const active=posting(family,before,state,reapproved,keys.reapprove,'APPROVE');assert.equal(reapproved.version,5);
   phase=`${family}:REAL_FAILURE_ROLLBACK`;before=state;const countsBefore={...fault.counts};fault.arm(family,'rollback');
   assert.equal((await post(family,command('UNAPPROVE',keys.rollback,reapproved.version))).statusCode,500);fault.assertConsumed();
   assert.equal(fault.counts.rollbackFaults,countsBefore.rollbackFaults+1);assert.equal(fault.counts.rollbacks,countsBefore.rollbacks+1);assert.equal(fault.counts.commits,countsBefore.commits);assert.deepEqual(await observe(),before,'Real failed transaction must leave header/children/stock/ledger/audit/receipt unchanged');
   const failedReceipt:LightMyRequestResponse=await api.app.inject({method:'GET',url:`/${family}/receipts/${encodeURIComponent(keys.rollback)}`,headers});assert.equal(failedReceipt.statusCode,404);
   phase=`${family}:ACTUAL_COMMIT_ACK_LOSS`;const previous={...fault.counts},unknownBody=command('UNAPPROVE',keys.unknownCommit,reapproved.version);fault.arm(family,'unknown');
   assert.equal((await post(family,unknownBody)).statusCode,500);fault.assertConsumed();
   assert.equal(fault.counts.unknownFaults,previous.unknownFaults+1);assert.equal(fault.counts.commits,previous.commits+1);assert.equal(fault.counts.discarded,previous.discarded+1);assert.equal(fault.counts.rollbacks,previous.rollbacks,'Unknown COMMIT must never ROLLBACK or auto-retry');
   phase=`${family}:ORIGINAL_KEY_RECEIPT_RECOVERY`;const receipt:LightMyRequestResponse=await api.app.inject({method:'GET',url:`/${family}/receipts/${encodeURIComponent(keys.unknownCommit)}`,headers});assert.equal(receipt.statusCode,200);
   const recovery=receipt.json<{status:string;result:Result}>();assert.equal(recovery.status,'COMMITTED');assert.equal(recovery.result.version,6);assert.equal(recovery.result.status,'DRAFT');
   state=await observe();posting(family,before,state,recovery.result,keys.unknownCommit,'UNAPPROVE',active);
   const recoveredCounts={...fault.counts};assert.deepEqual(result(await post(family,unknownBody)),recovery.result);assert.deepEqual(fault.counts,recoveredCounts);assert.deepEqual(await observe(),state,'Explicit SAME-key recovery must not post twice');
  }
  assert.equal(api.app.server.listening,false);
 }catch{failure=Error(`Real live-ledger acceptance failed at ${phase}; later checks NOT_EXECUTED; no private diagnostics exported`);}
 finally{
  try{if(api)await api.close();else context?.capacityAdmission?.close();}catch{failure??=Error('Live-ledger host cleanup unconfirmed; no acceptance');}
 }
 if(failure)throw failure;
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 test('live-ledger integration requires the original prepared real synthetic host',()=>{
  throw Error('REAL_PG_NOT_EXECUTED: import runLiveLedgerBalancePairsIntegration from original T45 host with exact new target/V8 issuer/review/published fixture/private scenario/real capacity; no connection attempted');
 });
}
