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
import {decimalToMinor} from '../../packages/domain/src/values.ts';
import type {LightMyRequestResponse} from 'fastify';
import type {BoundedPostgresDriverConfig, PostgresPoolDriverFactory} from '../../adapters/postgres/src/bounded-pool.ts';
import type {NativeRuntime26Issuer} from '../../adapters/postgres/src/native-import-accounting-capability.ts';
import {checkedNativeRuntime26Capability} from '../../packages/application/src/native-import-schema-contract.ts';
import {parseNativeSalesSaveProposal} from '../../packages/application/src/native-sales-preparation.ts';
import type {NativeSalesSaveProposal} from '../../packages/application/src/native-sales-preparation.ts';
import {parseNativeTransferSaveProposal} from '../../packages/application/src/native-transfer-preparation.ts';
import type {NativeTransferSaveProposal} from '../../packages/application/src/native-transfer-preparation.ts';
import {importedHistoryReadSql} from '../../adapters/postgres/src/imported-history-query-reader.ts';
import {createProductionRuntime26FullApplicationApi, parseProductionRuntime26R3Configuration, createSyntheticRuntime35ApplicationApi, parseProductionRuntime35Configuration} from '../../apps/api/src/production-provider-composition.ts';
import type {PostgresApplicationApi} from '../../apps/api/src/postgres-read-api.ts';
import {createProductionCapacityLaunch,parseProductionCapacityLaunch} from '../../apps/api/src/production-capacity-launch.ts';
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
function observedDriver(ordinary35=false){
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
   return {get readyForQuery(){return ordinary35?(raw as unknown as {readyForQuery?:boolean}).readyForQuery:undefined;},getTransactionStatus(){return ordinary35?(raw as unknown as {getTransactionStatus?:()=>string}).getTransactionStatus?.()??null:null;},on:(event,listener)=>raw.on(event,listener),removeListener:(event,listener)=>raw.removeListener(event,listener),async query(sql,values){
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

/** Dormant finite fresh35 branch. The V8 entry above retains its original guards. */
export interface Fresh35OrdinaryScenario {
 readonly syntheticOnly:true;
 readonly login:{readonly accountId:string;readonly loginName:string;readonly password:string};
 readonly salesPositive:NativeSalesSaveProposal;
 readonly salesMixed:NativeSalesSaveProposal;
 readonly transfer:NativeTransferSaveProposal;
 readonly initialInventory:LiveLedgerBalancePairsScenario['initialInventory'];
 readonly keys:{readonly salesPositive:Keys;readonly salesMixed:Keys;readonly transfer:Keys};
 /** An existing, genuinely logged-in salesperson and an actual out-of-scope sales proposal. */
 readonly forbidden:{readonly login:Fresh35OrdinaryScenario['login'];readonly sales:NativeSalesSaveProposal;readonly requestKey:string};
}
export interface Fresh35OrdinaryContext {
 readonly configuration:unknown;
 readonly capacityLaunch:unknown;
 readonly staffCredentialRequestTag:CredentialRequestTag|null;
 readonly publication:LiveLedgerBalancePairsContext['publication'];
 readonly privateScenarioFile:string;
}
export function checkFresh35OrdinaryScenario(value:Fresh35OrdinaryScenario):Fresh35OrdinaryScenario {
 assert.equal(value.syntheticOnly,true);
 for(const login of [value.login,value.forbidden?.login])assert.ok(login&&typeof login.accountId==='string'&&typeof login.loginName==='string'&&typeof login.password==='string'&&login.password.length>0);
 const positive=parseNativeSalesSaveProposal(value.salesPositive),mixed=parseNativeSalesSaveProposal(value.salesMixed),transfer=parseNativeTransferSaveProposal(value.transfer);
 assert.ok(positive.salesId===null&&positive.businessType==='SALE'&&positive.lines.length===1&&int(positive.lines[0]!.quantity)>0n);
 assert.ok(mixed.salesId===null&&mixed.businessType==='SALE'&&mixed.lines.length===2&&Number(mixed.orderDiscount)===0&&mixed.lines.some(l=>int(l.quantity)>0n)&&mixed.lines.some(l=>int(l.quantity)<0n));
 for(const proposal of [positive,mixed]){
  assert.equal(Number(proposal.orderDiscount),0);assert.ok(proposal.lines.every(l=>'skuId'in l&&l.existingLineId===null&&int(l.quantity)!==0n&&l.pricingRule==='UNIT_PRICE'&&l.dealPrice!==null&&!l.isGift));
  assert.ok(proposal.settlements.length>0&&proposal.settlements.every(s=>s.existingSettlementId===null&&s.direction==='RECEIVE'));
 }
 assert.ok(transfer.transferId===null&&transfer.fromWarehouseId!==transfer.toWarehouseId&&transfer.lines.length===1&&transfer.lines.every(l=>'skuId'in l&&l.existingLineId===null&&int(l.quantity)>0n));
 const denied=parseNativeSalesSaveProposal(value.forbidden.sales);assert.equal(denied.salesId,null);assert.notEqual(value.forbidden.login.accountId,value.login.accountId);
 const keys=[...Object.values(value.keys.salesPositive),...Object.values(value.keys.salesMixed),...Object.values(value.keys.transfer),value.forbidden.requestKey];
 assert.equal(keys.length,22);assert.equal(new Set(keys).size,22);assert.ok(keys.every(k=>typeof k==='string'&&/^[A-Za-z0-9._:-]{1,128}$/.test(k)));
 const pairs=[...positive.lines.map(l=>key(positive.warehouseId,l.skuId)),...mixed.lines.map(l=>key(mixed.warehouseId,l.skuId)),...transfer.lines.flatMap(l=>[key(transfer.fromWarehouseId,l.skuId),key(transfer.toWarehouseId,l.skuId)])];
 assert.deepEqual([...new Set(value.initialInventory.map(b=>key(b.warehouseId,b.skuId)))].sort(),[...new Set(pairs)].sort());assert.equal(new Set(value.initialInventory.map(b=>key(b.warehouseId,b.skuId))).size,value.initialInventory.length);
 value.initialInventory.forEach(b=>{int(b.quantity);assert.ok(Number.isSafeInteger(b.version)&&b.version>0);});
 return {...value,salesPositive:positive,salesMixed:mixed,transfer,forbidden:{...value.forbidden,sales:denied}};
}
export function assertFresh35PostingChain(before:unknown,effects:readonly Row[],after:unknown):void {
 let quantity=int(before);const pending=[...effects];
 while(pending.length){const i=pending.findIndex(l=>int(l.quantity_before)===quantity);assert.ok(i>=0,'Exact per-entry before/after chain');const [row]=pending.splice(i,1);quantity+=int(row!.quantity_delta);assert.equal(int(row!.quantity_after),quantity);}
 assert.equal(int(after),quantity);
}
export async function runFresh35OrdinaryIntegration(context:Fresh35OrdinaryContext):Promise<void>{
 let api:PostgresApplicationApi|undefined,capacity:Awaited<ReturnType<typeof createProductionCapacityLaunch>>|undefined,phase='PRIVATE_INPUT',failure:Error|undefined;
 try{
  const c=parseProductionRuntime35Configuration(context.configuration),t=parseProductionCapacityLaunch(context.capacityLaunch).target;
  assert.equal(c.profile,'source-confirmed-native-exact35-v1');assert.match(t.database,/^synthetic_fresh35_[0-9]{8}_r[1-9][0-9]*$/);
  assert.equal(t.database,c.postgres.target.database);assert.equal(t.role,c.postgres.target.user);
  const path=context.privateScenarioFile;assert.ok(path.endsWith('/credentials/fresh35-ordinary-scenario.json')&&isAbsolute(path)&&resolve(path)===path&&await realpath(path)===path);
  const before=await lstat(path);assert.ok(before.isFile()&&!before.isSymbolicLink()&&before.uid===process.getuid?.()&&(before.mode&0o077)===0&&before.size>0&&before.size<=262144);
  const bytes=await readFile(path),after=await lstat(path);assert.ok(before.dev===after.dev&&before.ino===after.ino&&before.mtimeMs===after.mtimeMs&&before.ctimeMs===after.ctimeMs&&before.size===bytes.length);
  const s=checkFresh35OrdinaryScenario(JSON.parse(bytes.toString('utf8')) as Fresh35OrdinaryScenario),fault=observedDriver(true);
  const allKeys=[...Object.values(s.keys.salesPositive),...Object.values(s.keys.salesMixed),...Object.values(s.keys.transfer),s.forbidden.requestKey],known={sales:[] as string[],transfers:[] as string[]};
  phase='REAL_CAPACITY';capacity=await createProductionCapacityLaunch(context.capacityLaunch,c);
  phase='REAL_SYNTHETIC_ADMISSION';api=await createSyntheticRuntime35ApplicationApi(c,fault.driver,context.staffCredentialRequestTag,capacity,t);await capacity.preflight();assert.equal(api.app.server.listening,false);
  const observe=async():Promise<Snapshot>=>{
   const client=new Client(fault.config());client.on('error',()=>{});let begun=false;
   try{
    await client.connect();
    const id=(await client.query(`SELECT current_database() db,session_user, current_user actor,(SELECT oid::text FROM pg_database WHERE datname=current_database()) oid,pg_postmaster_start_time()::text started,
     (SELECT rolcanlogin AND NOT(rolsuper OR rolinherit OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls) FROM pg_roles WHERE rolname=session_user) ordinary,
     (SELECT coalesce(jsonb_agg(jsonb_build_array(p.rolname,m.admin_option,m.inherit_option,m.set_option) ORDER BY p.rolname),'[]'::jsonb) FROM pg_auth_members m JOIN pg_roles p ON p.oid=m.roleid WHERE m.member=(SELECT oid FROM pg_roles WHERE rolname=session_user)) memberships`)).rows[0];
    assert.ok(id.db===t.database&&id.oid===t.databaseOid&&id.started===t.postmasterStart&&id.session_user===t.role&&id.actor===t.role&&id.ordinary===true&&!fault.pids.has(Number((await client.query('SELECT pg_backend_pid() pid')).rows[0].pid)));
    assert.deepEqual(id.memberships,[['erp_unified27_runtime_2393dbc6db9581c2',false,false,true]]);
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');begun=true;await client.query('SET LOCAL ROLE erp_unified27_runtime_2393dbc6db9581c2');
    const pub=importedHistoryReadSql('sales'),p=context.publication;
    const published=(await client.query(`SELECT b.id,b.source_hash,b.history_payload_hash,(${pub.publishedPredicate}) published FROM ${pub.publicationFrom} WHERE b.id=$2::uuid`,[pub.values[0],p.batchId])).rows;
    assert.ok(published.length===1&&published[0].published===true&&published[0].source_hash===p.sourceHash&&published[0].history_payload_hash===p.historyPayloadHash);
    const bound=[s.initialInventory.map(x=>x.warehouseId),s.initialInventory.map(x=>x.skuId)];
    const balances=(await client.query('SELECT b.warehouse_id,b.sku_id,b.quantity::text,b.version,b.last_operation_id,b.updated_at::text FROM naijue_erp.inventory_balance b JOIN unnest($1::uuid[],$2::uuid[]) k(w,s) ON k.w=b.warehouse_id AND k.s=b.sku_id ORDER BY b.warehouse_id,b.sku_id',bound)).rows as Row[];assert.equal(balances.length,s.initialInventory.length);
    const ledger=(await client.query('SELECT l.id,l.operation_id,l.event_kind,l.warehouse_id,l.sku_id,l.quantity_delta::text,l.quantity_before::text,l.quantity_after::text,l.source_sales_line_id,l.source_transfer_line_id,l.source_import_batch_id,l.source_history_revision_id,l.endpoint,l.source_document_version,l.reverses_entry_id,l.posted_at::text FROM naijue_erp.inventory_ledger l JOIN unnest($1::uuid[],$2::uuid[]) k(w,s) ON k.w=l.warehouse_id AND k.s=l.sku_id ORDER BY l.id LIMIT 10001',bound)).rows as Row[];assert.ok(ledger.length<10001);
    for(const row of ledger)if(row.source_import_batch_id!==null||row.event_kind==='HISTORY_REVISION')assert.ok(row.quantity_before===null&&row.quantity_after===null);
    const headers:Row[]=[],lines:Row[]=[];
    for(const family of ['sales','transfers'] as const){const f=family==='sales'?'sales':'transfer';
     headers.push(...(await client.query(`SELECT '${family}' family,id,status,version,stock_basis${family==='sales'?',gross_amount::text,order_discount::text,net_due::text':''} FROM naijue_erp.${f}_header WHERE id=ANY($1::uuid[]) ORDER BY id`,[known[family]])).rows);
     lines.push(...(await client.query(`SELECT '${family}' family,id,${f}_id document_id,line_no,sku_id,quantity::text,is_current${family==='sales'?',deal_price::text,line_amount::text,allocated_discount::text':''} FROM naijue_erp.${f}_line WHERE ${f}_id=ANY($1::uuid[]) ORDER BY document_id,line_no,id`,[known[family]])).rows);
    }
    const settlements=(await client.query('SELECT id,sales_id,line_no,payment_account_id,payment_method_id_snapshot,direction,amount::text FROM naijue_erp.sales_settlement WHERE sales_id=ANY($1::uuid[]) ORDER BY sales_id,line_no,id',[known.sales])).rows as Row[];
    const receipts=(await client.query('SELECT id,actor_account_id,request_key,action,target_id,status,result_data,completed_at::text FROM naijue_erp.operation_receipt WHERE actor_account_id=ANY($1::uuid[]) AND request_key=ANY($2::text[]) ORDER BY id',[[s.login.accountId,s.forbidden.login.accountId],allKeys])).rows as Row[];
    const audits=(await client.query('SELECT id,operation_id,actor_account_id,object_id,action,old_version,new_version,occurred_at::text FROM naijue_erp.audit_change WHERE operation_id=ANY($1::uuid[]) ORDER BY id',[receipts.map(r=>r.id)])).rows as Row[];
    await client.query('ROLLBACK');begun=false;return{balances,ledger,headers,lines,settlements,receipts,audits};
   }finally{try{if(begun)await client.query('ROLLBACK');}finally{await client.end();}}
  };
  let initial=await observe();assert.equal(initial.receipts.length,0);for(const b of s.initialInventory){const actual=initial.balances.find(x=>key(x.warehouse_id,x.sku_id)===key(b.warehouseId,b.skuId));assert.ok(actual);assert.equal(actual.quantity,b.quantity);assert.equal(actual.version,b.version);}
  const login=async(credentials:Fresh35OrdinaryScenario['login'])=>{const r=await api!.app.inject({method:'POST',url:'/auth/login',headers:{origin:c.publicOrigin,'content-type':'application/json'},payload:{loginName:credentials.loginName,password:credentials.password}});assert.equal(r.statusCode,200);const cookie=r.headers['set-cookie'];assert.ok(typeof cookie==='string'&&cookie.startsWith('__Host-naijue_session='));const headers={origin:c.publicOrigin,cookie:cookie.split(';')[0]!,'content-type':'application/json'};const session:LightMyRequestResponse=await api!.app.inject({method:'GET',url:'/auth/session',headers});assert.equal(session.statusCode,200);const principal=session.json<{principal:{accountId:string;role:string}}>().principal;assert.equal(principal.accountId,credentials.accountId);if(credentials.accountId===s.forbidden.login.accountId)assert.equal(principal.role,'SALESPERSON');return headers;};
  const headers=await login(s.login),deniedHeaders=await login(s.forbidden.login);
  const post=(family:Family,body:object,h=headers)=>api!.app.inject({method:'POST',url:`/${family}/commands`,headers:h,payload:body});
  const result=(r:LightMyRequestResponse):Result=>{assert.equal(r.statusCode,200);return r.json<Result>();};
  const idOf=(f:Family,r:Result)=>{const id=f==='sales'?r.salesId:r.transferId;assert.ok(typeof id==='string');return id;};
  const committed=(x:Snapshot,r:Result,k:string,action:string,f:Family)=>{const id=idOf(f,r),h=x.headers.find(a=>a.id===id),receipt=x.receipts.find(a=>a.request_key===k),audit=x.audits.find(a=>a.operation_id===r.operationId);assert.ok(h&&h.status===r.status&&h.version===r.version&&h.stock_basis==='RUNTIME_LEDGER');assert.ok(receipt&&audit&&receipt.id===r.operationId&&receipt.status==='COMMITTED'&&receipt.action===action&&receipt.target_id===id&&receipt.actor_account_id===s.login.accountId);assert.deepEqual(receipt.result_data,r);assert.ok(audit.object_id===id&&audit.actor_account_id===s.login.accountId&&audit.action===action&&audit.new_version===r.version&&audit.old_version===(r.version===1?null:r.version-1)&&audit.occurred_at===receipt.completed_at);};
  phase='AUTHENTICATED_SCOPE_DENIAL';const denied=await post('sales',{action:'SAVE',requestKey:s.forbidden.requestKey,expectedVersion:null,proposal:s.forbidden.sales},deniedHeaders);assert.equal(denied.statusCode,403);assert.equal(denied.json<{error:{code:string}}>().error.code,'FORBIDDEN');assert.deepEqual(await observe(),initial);
  for(const name of ['salesPositive','salesMixed','transfer'] as const){
   const family:Family=name==='transfer'?'transfers':'sales',proposal=name==='transfer'?s.transfer:s[name],keys=s.keys[name];
   phase=name+':PREPARE';const {lines, ...head}=proposal;const newHead={...head} as Record<string,unknown>;delete newHead.salesId;delete newHead.transferId;
   const prepLines=lines.map(l=>{const {existingLineId,...row}=l;return row;});if('settlements'in newHead)newHead.settlements=(proposal as NativeSalesSaveProposal).settlements.map(({existingSettlementId,...v})=>v);
   const prepared:LightMyRequestResponse=await api.app.inject({method:'POST',url:`/${family}/prepare-create`,headers,payload:{...newHead,lines:prepLines}});assert.equal(prepared.statusCode,200);
   phase=name+':SAVE';const saveBody={action:'SAVE',requestKey:keys.save,expectedVersion:null,proposal};let before=await observe();const saved=result(await post(family,saveBody));known[family].push(idOf(family,saved));let state=await observe();committed(state,saved,keys.save,'SAVE',family);assert.equal(saved.status,'DRAFT');assert.equal(saved.version,1);assert.deepEqual(state.balances,before.balances);assert.deepEqual(state.ledger,before.ledger);
   if(family==='sales'){
    const expected=proposal as NativeSalesSaveProposal,h=state.headers.find(x=>x.id===idOf(family,saved))!;
    const cents=(v:unknown)=>decimalToMinor(String(v),{scale:2});
    const actualLines=state.lines.filter(x=>x.document_id===idOf(family,saved)).sort((x,y)=>Number(x.line_no)-Number(y.line_no));
    assert.equal(actualLines.length,expected.lines.length);
    for(const [i,line] of actualLines.entries()){const wanted=expected.lines[i]!;assert.equal(line.sku_id,wanted.skuId);assert.equal(int(line.quantity),int(wanted.quantity));assert.equal(cents(line.deal_price),cents(wanted.dealPrice));assert.equal(cents(line.line_amount),cents(line.deal_price)*int(line.quantity));}
    assert.equal(cents(h.gross_amount),actualLines.reduce((n,l)=>n+cents(l.line_amount),0n));assert.equal(cents(h.order_discount),cents(expected.orderDiscount));assert.equal(cents(h.net_due),cents(h.gross_amount)-cents(h.order_discount));
    const paid=state.settlements.filter(x=>x.sales_id===idOf(family,saved));assert.equal(paid.length,expected.settlements.length);
    for(const [i,row] of paid.entries()){const wanted=expected.settlements[i]!;assert.equal(row.direction,wanted.direction);assert.equal(row.payment_account_id,wanted.paymentAccountId);assert.equal(row.payment_method_id_snapshot,wanted.paymentMethodId);assert.equal(cents(row.amount),cents(wanted.amount));}
    assert.equal(paid.reduce((n,l)=>n+(l.direction==='RECEIVE'?1n:-1n)*cents(l.amount),0n),cents(h.net_due));
    const draft=prepared.json<{header:{grossAmount:string;orderDiscount:string;netDue:string}}>();assert.equal(BigInt(draft.header.grossAmount),cents(h.gross_amount));assert.equal(BigInt(draft.header.netDue),cents(h.net_due));
   }

   const command=(action:string,k:string,v:number)=>({action,requestKey:k,expectedVersion:v,...(family==='sales'?{salesId:idOf(family,saved)}:{transferId:idOf(family,saved)})});
   const posting=(old:Snapshot,next:Snapshot,r:Result,k:string,action:'APPROVE'|'UNAPPROVE',reverse?:Row[])=>{
    committed(next,r,k,action,family);const rows=next.ledger.filter(l=>l.operation_id===r.operationId),own=next.lines.filter(l=>l.document_id===idOf(family,r)&&l.is_current===true);assert.equal(rows.length,own.length*(family==='sales'?1:2));assert.deepEqual(rows.map(l=>l.id).sort(),[...r.ledgerEntryIds].sort());assert.deepEqual(next.ledger.filter(l=>old.ledger.some(b=>b.id===l.id)),old.ledger);
    for(const line of own){const effects=rows.filter(l=>(family==='sales'?l.source_sales_line_id:l.source_transfer_line_id)===line.id);assert.equal(effects.length,family==='sales'?1:2);for(const row of effects){const from=family==='sales'?(proposal as NativeSalesSaveProposal).warehouseId:(proposal as NativeTransferSaveProposal).fromWarehouseId;const to=family==='sales'?from:(proposal as NativeTransferSaveProposal).toWarehouseId;assert.ok(row.warehouse_id===from||row.warehouse_id===to);assert.equal(row.sku_id,line.sku_id);assert.equal(row.endpoint,family==='sales'?'SALES_WAREHOUSE':row.warehouse_id===from?'FROM':'TO');assert.equal(int(row.quantity_delta),(row.warehouse_id===from?-int(line.quantity):int(line.quantity))*(action==='APPROVE'?1n:-1n));assert.ok(row.event_kind===action&&row.source_document_version===r.version&&row.source_import_batch_id===null&&row.source_history_revision_id===null);if(reverse){const original=reverse.find(x=>x.source_sales_line_id===row.source_sales_line_id&&x.source_transfer_line_id===row.source_transfer_line_id&&x.endpoint===row.endpoint);assert.ok(original);assert.equal(row.reverses_entry_id,original.id);}else assert.equal(row.reverses_entry_id,null);}}
    for(const oldBalance of old.balances){const effects=rows.filter(l=>key(l.warehouse_id,l.sku_id)===key(oldBalance.warehouse_id,oldBalance.sku_id)),balance=next.balances.find(b=>key(b.warehouse_id,b.sku_id)===key(oldBalance.warehouse_id,oldBalance.sku_id));assert.ok(balance);assertFresh35PostingChain(oldBalance.quantity,effects,balance.quantity);if(effects.length){assert.equal(balance.version,Number(oldBalance.version)+effects.length);assert.equal(balance.last_operation_id,r.operationId);}else assert.deepEqual(balance,oldBalance);}
    if(family==='transfers')assert.equal(rows.reduce((n,l)=>n+int(l.quantity_delta),0n),0n);return rows;
   };
   phase=name+':APPROVE';const approveBody=command('APPROVE',keys.approve,saved.version);before=state;const approved=result(await post(family,approveBody));state=await observe();const original=posting(before,state,approved,keys.approve,'APPROVE');assert.equal(approved.status,'APPROVED');assert.equal(approved.version,2);assert.deepEqual(result(await post(family,approveBody)),approved);assert.deepEqual(await observe(),state);
   phase=name+':UNAPPROVE';before=state;const unapproved=result(await post(family,command('UNAPPROVE',keys.unapprove,approved.version)));state=await observe();posting(before,state,unapproved,keys.unapprove,'UNAPPROVE',original);assert.equal(unapproved.version,3);assert.equal(unapproved.status,'DRAFT');
   const own=state.lines.filter(l=>l.document_id===idOf(family,saved)&&l.is_current===true).sort((a,b)=>Number(a.line_no)-Number(b.line_no));const reopened={...proposal,...(family==='sales'?{salesId:idOf(family,saved),settlements:(proposal as NativeSalesSaveProposal).settlements.map((v,i)=>({...v,existingSettlementId:String(state.settlements.filter(r=>r.sales_id===idOf(family,saved))[i]!.id)}))}:{transferId:idOf(family,saved)}),lines:proposal.lines.map((l,i)=>({...l,existingLineId:String(own[i]!.id)}))};
   phase=name+':REOPEN';const existingPreparation:LightMyRequestResponse=await api.app.inject({method:'POST',url:`/${family}/prepare-existing`,headers,payload:{...reopened,expectedVersion:unapproved.version}});assert.equal(existingPreparation.statusCode,200);
   before=state;const edited=result(await post(family,{action:'SAVE',requestKey:keys.reopen,expectedVersion:unapproved.version,proposal:reopened}));state=await observe();committed(state,edited,keys.reopen,'SAVE',family);assert.equal(edited.version,4);assert.deepEqual(state.balances,before.balances);assert.deepEqual(state.ledger,before.ledger);
   before=state;const reapproved=result(await post(family,command('APPROVE',keys.reapprove,edited.version)));state=await observe();const active=posting(before,state,reapproved,keys.reapprove,'APPROVE');assert.equal(reapproved.version,5);
   phase=name+':REAL_ROLLBACK';before=state;fault.arm(family,'rollback');assert.equal((await post(family,command('UNAPPROVE',keys.rollback,reapproved.version))).statusCode,500);fault.assertConsumed();assert.deepEqual(await observe(),before);assert.equal((await api.app.inject({method:'GET',url:`/${family}/receipts/${encodeURIComponent(keys.rollback)}`,headers})).statusCode,404);
   phase=name+':LOST_COMMIT_ACK';const unknown=command('UNAPPROVE',keys.unknownCommit,reapproved.version);fault.arm(family,'unknown');assert.equal((await post(family,unknown)).statusCode,500);fault.assertConsumed();const receipt:LightMyRequestResponse=await api.app.inject({method:'GET',url:`/${family}/receipts/${encodeURIComponent(keys.unknownCommit)}`,headers});assert.equal(receipt.statusCode,200);const recovered=receipt.json<{status:string;result:Result}>();assert.equal(recovered.status,'COMMITTED');assert.equal(recovered.result.version,6);state=await observe();posting(before,state,recovered.result,keys.unknownCommit,'UNAPPROVE',active);assert.deepEqual(result(await post(family,unknown)),recovered.result);assert.deepEqual(await observe(),state);
   phase=name+':DETAIL';const detail:LightMyRequestResponse=await api.app.inject({method:'POST',url:`/${family}/detail/query`,headers,payload:family==='sales'?{salesId:idOf(family,saved)}:{transferId:idOf(family,saved)}});assert.equal(detail.statusCode,200);const read=detail.json<{document:{header:{id:string;status:string;version:number};lines:Row[]};stockBasis:string}>();assert.equal(read.document.header.id,idOf(family,saved));assert.equal(read.document.header.status,'DRAFT');assert.equal(read.document.header.version,recovered.result.version);assert.equal(read.stockBasis,'RUNTIME_LEDGER');assert.equal(read.document.lines.length,proposal.lines.length);
  }
 }catch{failure=Error(`Fresh35 ordinary acceptance failed at ${phase}; remaining checks NOT_EXECUTED; no private diagnostics exported`);}
 finally{try{if(api)await api.close();else capacity?.close();}catch{failure??=Error('Fresh35 ordinary cleanup unconfirmed');}}
 if(failure)throw failure;
}


if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
test('fresh35 scenario rejects missing actual keys, reused keys and invalid mixed rows without PG',()=>{
 const id=(n:number)=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
 const line={skuId:id(1),existingLineId:null,quantity:'2',dealPrice:'1.00',pricingRule:'UNIT_PRICE' as const,discountTenths:null,isGift:false,zeroConfirmed:false};
 const sale={salesId:null,businessType:'SALE' as const,businessDate:'2026-11-05',note:null,hallId:id(2),customerId:id(3),salespersonId:id(4),warehouseId:id(5),orderDiscount:'0.00',lines:[line],settlements:[{existingSettlementId:null,paymentAccountId:id(6),paymentMethodId:id(7),direction:'RECEIVE' as const,amount:'2.00'}]};
 const keys=(prefix:string)=>Object.fromEntries(['save','approve','unapprove','reopen','reapprove','rollback','unknownCommit'].map(k=>[k,prefix+':'+k])) as unknown as Keys;
 const raw:Fresh35OrdinaryScenario={syntheticOnly:true,login:{accountId:id(8),loginName:'model-admin',password:'model-only'},salesPositive:sale,salesMixed:{...sale,lines:[line,{...line,quantity:'-1'}],settlements:[{...sale.settlements[0]!,amount:'1.00'}]},transfer:{transferId:null,businessDate:'2026-11-05',note:null,fromWarehouseId:id(5),toWarehouseId:id(9),lines:[{skuId:id(1),existingLineId:null,quantity:'1'}]},initialInventory:[{warehouseId:id(5),skuId:id(1),quantity:'100',version:1},{warehouseId:id(9),skuId:id(1),quantity:'0',version:1}],keys:{salesPositive:keys('positive'),salesMixed:keys('mixed'),transfer:keys('transfer')},forbidden:{login:{accountId:id(10),loginName:'model-denied',password:'model-only'},sales:sale,requestKey:'denied:save'}};
 assert.equal(checkFresh35OrdinaryScenario(raw).salesMixed.lines.length,2);
 for(const mutate of [(s:Fresh35OrdinaryScenario)=>({...s,initialInventory:s.initialInventory.slice(0,1)}),(s:Fresh35OrdinaryScenario)=>({...s,keys:{...s.keys,transfer:s.keys.salesPositive}}),(s:Fresh35OrdinaryScenario)=>({...s,salesMixed:{...s.salesMixed,lines:[line,line]}}),(s:Fresh35OrdinaryScenario)=>({...s,salesMixed:{...s.salesMixed,orderDiscount:'1'}}),(s:Fresh35OrdinaryScenario)=>({...s,forbidden:{...s.forbidden,login:s.login}})])assert.throws(()=>checkFresh35OrdinaryScenario(mutate(structuredClone(raw))));
});
test('fresh35 mixed same-SKU ledger chain keeps both effects and rejects omitted or broken pairs',()=>{
 const rows=[{quantity_before:'98',quantity_delta:'1',quantity_after:'99'},{quantity_before:'100',quantity_delta:'-2',quantity_after:'98'}];
 assertFresh35PostingChain('100',rows,'99');
 assert.throws(()=>assertFresh35PostingChain('100',rows.slice(1),'99'));
 assert.throws(()=>assertFresh35PostingChain('100',[rows[0]!,{...rows[1]!,quantity_after:'97'}],'99'));
});

}
