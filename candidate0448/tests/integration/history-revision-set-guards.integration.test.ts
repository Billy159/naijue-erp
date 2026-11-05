/** Uses an independently prepared synthetic published fixture + exact runtime review.
 * T45 provisions it. This runner never creates/migrates/drops a database. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {Pool} from 'pg';
import type {PoolClient} from 'pg';
import {createNativeRuntime26Issuer} from '../../adapters/postgres/src/native-import-accounting-capability.ts';
import {PostgresHistoryRevisionStore} from '../../adapters/postgres/src/history-revision-store.ts';
import {createSourceConfirmedHistoryRevisionAuthorization} from '../../apps/api/src/history-revision-authorization.ts';
import {parseHistoryRevisionCommand} from '../../packages/application/src/history-revision-service.ts';
import type {HistoryRevisionGrant,HistoryRevisionCommand,HistoryRevisionReceipt} from '../../packages/application/src/history-revision-contracts.ts';
import type {ActorContext} from '../../packages/application/src/ports.ts';
import type {PgSalesPool} from '../../adapters/postgres/src/sales-unit-of-work.ts';

test('P04 isolated real nonowner store, full ledger set, per-key conservation/CAS, rollback and contended original-key replay',{timeout:120000},async t=>{
 const database=process.env.NAIJUE_HV2_P04_DATABASE,url=process.env.NAIJUE_HV2_P04_URL;
 const file=process.env.NAIJUE_HV2_P04_FIXTURE,fixturePin=process.env.NAIJUE_HV2_P04_FIXTURE_SHA256;
 const reviewFile=process.env.NAIJUE_HV2_P04_REVIEW,reviewPin=process.env.NAIJUE_HV2_P04_REVIEW_SHA256;
 assert.ok(process.env.NAIJUE_HV2_P04_SYNTHETIC_AUTHORIZATION==='CONFIRMED_NEW_ISOLATED'&&database&&/^(?:erp_hv2_p04_|naijue_erp_test_b07_syn_approved_hv2p04_)[a-z0-9_]+$/.test(database)&&url&&file&&fixturePin&&reviewFile&&reviewPin,'Explicit separately approved fresh synthetic target/fixture/review required');
 const bytes=readFileSync(file);assert.ok(bytes.length<=4*1024*1024);assert.equal(createHash('sha256').update(bytes).digest('hex'),fixturePin);
 const fixture=JSON.parse(bytes.toString('utf8')) as {syntheticOnly:boolean;database:string;cases:{actor:ActorContext;command:unknown;grant:HistoryRevisionGrant;now:string;keys:{warehouseId:string;skuId:string}[]}[]};
 assert.equal(fixture.syntheticOnly,true);assert.equal(fixture.database,database);assert.equal(fixture.cases.length,4,'Exact original zero/one/16/two-endpoint fixture required');
 const commands=fixture.cases.map(c=>parseHistoryRevisionCommand(c.command));
 assert.deepEqual(commands.map(c=>[c.kind,c.expectedVersion]),[['sales',1],['sales',2],['sales',3],['transfers',1]]);
 const keys=[...new Map(fixture.cases.flatMap(c=>c.keys).map(k=>[JSON.stringify([k.warehouseId,k.skuId]),k])).values()];
 const pool=new Pool({connectionString:url,max:3,connectionTimeoutMillis:3000,statement_timeout:15000,lock_timeout:3000});
 type Probe={leases:{pid:number;events:string[];released:boolean;discarded:boolean}[]};
 let probe:Probe|null=null;
 const timings:Record<string,unknown>[]=[];
 const timed=async<T>(work:()=>Promise<T>):Promise<{value:T;ms:number}>=>{const start=performance.now();const value=await work();return{value,ms:performance.now()-start};};
 try{
  const client=await pool.connect();try{
   const i=(await client.query(`SELECT current_database() db,current_user role,session_user,(SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname=current_user) elevated,
    (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='naijue_erp.history_revision'::regclass) owner`)).rows[0];
   assert.equal(i.db,database);assert.equal(i.role,i.session_user);assert.equal(i.elevated,false);assert.notEqual(i.role,i.owner);
  }finally{client.release();}
  // The genuine issuer still checks each actual leased PostgreSQL connection. The two probes only
  // observe delegated real query completion/release; they never supply SQL results or readiness.
  const issuer=await createNativeRuntime26Issuer({async connect(){
   const observed=probe,raw=await pool.connect();if(!observed)return raw;
   try{
    const pid=(await raw.query('SELECT pg_backend_pid() pid')).rows[0].pid as number;
    const lease={pid,events:[] as string[],released:false,discarded:false};observed.leases.push(lease);
    return{async query(sql:string,values?:unknown[]){
     const result=await raw.query(sql,values);
     if(sql.startsWith('BEGIN ')||sql==='ROLLBACK'||sql==='COMMIT')lease.events.push(sql);
     else if(sql.includes('history-revise:source'))lease.events.push('SOURCE_READ_COMPLETED');
     return result;
    },release(error?:Error|boolean){lease.released=true;lease.discarded=Boolean(error);raw.release(error);}};
   }catch(error){raw.release(error instanceof Error?error:true);throw error;}
  }} as PgSalesPool,{reviewFile,trustedReviewSha256:reviewPin});
  const policy=createSourceConfirmedHistoryRevisionAuthorization(issuer.pool,issuer.runtime26);
  const store=PostgresHistoryRevisionStore.forRuntime26(issuer.pool,{runtime26:issuer.runtime26,newId:()=>randomUUID()});
  // Full affected projections are PostgreSQL JSON text, preserving numeric precision; no business
  // hash encoder or JavaScript number conversion is applied to database row snapshots.
  const snapshot=async(command:HistoryRevisionCommand,actor:ActorContext,extraKey?:string)=>{
   const family=command.kind==='sales'?'sales':'transfer',target=command.kind==='sales'?'HISTORY_SALES':'HISTORY_TRANSFER';
   const c=await pool.connect();const result:Record<string,string[]>={};let began=false;
   try{
    await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');began=true;
    const read=async(name:string,sql:string,values:unknown[])=>{const rows=(await c.query(sql,values)).rows;assert.ok(rows.length<=100000,'Affected snapshot must be complete within its fixed row bound');result[name]=rows.map(r=>r.row as string).sort();};
    const document=[command.documentId];
    await read('source_head',`SELECT to_jsonb(x)::text row FROM naijue_erp.history_${family}_header x WHERE id=$1::uuid LIMIT 100001`,document);
    await read('source_lines',`SELECT to_jsonb(x)::text row FROM naijue_erp.history_${family}_line x WHERE header_id=$1::uuid LIMIT 100001`,document);
    await read('effective_head',`SELECT to_jsonb(x)::text row FROM naijue_erp.history_${family}_effective x WHERE header_id=$1::uuid LIMIT 100001`,document);
    await read('effective_lines',`SELECT to_jsonb(x)::text row FROM naijue_erp.history_${family}_line_effective x WHERE line_id IN(SELECT id FROM naijue_erp.history_${family}_line WHERE header_id=$1::uuid) LIMIT 100001`,document);
    if(command.kind==='sales'){
     await read('source_settlements','SELECT to_jsonb(x)::text row FROM naijue_erp.history_sales_settlement x WHERE header_id=$1::uuid LIMIT 100001',document);
     await read('effective_settlements','SELECT to_jsonb(x)::text row FROM naijue_erp.history_sales_settlement_effective x WHERE settlement_id IN(SELECT id FROM naijue_erp.history_sales_settlement WHERE header_id=$1::uuid) LIMIT 100001',document);
    }
    await read('revisions',`SELECT to_jsonb(x)::text row FROM naijue_erp.history_revision x WHERE ${command.kind==='sales'?'sales_id':'transfer_id'}=$1::uuid LIMIT 100001`,document);
    await read('audits','SELECT to_jsonb(x)::text row FROM naijue_erp.audit_change x WHERE object_id=$1::uuid AND object_type=$2 LIMIT 100001',[command.documentId,target]);
    await read('receipts','SELECT to_jsonb(x)::text row FROM naijue_erp.operation_receipt x WHERE (target_id=$1::uuid AND target_type=$2) OR (actor_account_id=$3::uuid AND request_key=ANY($4::text[])) LIMIT 100001',[command.documentId,target,actor.accountId,[command.requestKey,...(extraKey?[extraKey]:[])]]);
    for(const table of ['inventory_ledger','inventory_balance'])await read(table,`SELECT to_jsonb(x)::text row FROM naijue_erp.${table} x WHERE EXISTS(SELECT 1 FROM unnest($1::uuid[],$2::uuid[]) k(warehouse_id,sku_id) WHERE k.warehouse_id=x.warehouse_id AND k.sku_id=x.sku_id) LIMIT 100001`,[keys.map(k=>k.warehouseId),keys.map(k=>k.skuId)]);
    for(const table of ['import_batch','import_history_closure_manifest','import_history_document_manifest'])await read(table,`SELECT to_jsonb(x)::text row FROM naijue_erp.${table} x WHERE ${table==='import_batch'?'id':'batch_id'} IN(SELECT batch_id FROM naijue_erp.history_${family}_header WHERE id=$1::uuid) LIMIT 100001`,document);
    return result;
   }finally{let discard:Error|undefined;try{if(began)await c.query('ROLLBACK');}catch(error){discard=error instanceof Error?error:Error('Snapshot rollback failed');throw error;}finally{c.release(discard);}}
  };
  const effectSizes:number[]=[],receipts:HistoryRevisionReceipt[]=[];
  for(const [index,c] of fixture.cases.entries()){
   const command=commands[index]!;
   const authorized=await timed(()=>policy.authorize(c.actor,command,new AbortController().signal));const grant=authorized.value;assert.deepEqual(grant,c.grant);
   const before=(await pool.query(`SELECT k.warehouse_id::text,k.sku_id::text,b.quantity::text,b.version
    FROM unnest($1::uuid[],$2::uuid[]) k(warehouse_id,sku_id) LEFT JOIN naijue_erp.inventory_balance b USING(warehouse_id,sku_id)`,[c.keys.map(k=>k.warehouseId),c.keys.map(k=>k.skuId)])).rows;
   const revised=await timed(()=>store.revise(c.actor,command,grant,c.now,new AbortController().signal));const receipt=revised.value;receipts.push(receipt);
   const revision=(await pool.query('SELECT before_facts,after_facts,stock_effect_evidence FROM naijue_erp.history_revision WHERE id=$1',[receipt.revisionId])).rows[0];
   assert.equal(revision.after_facts.version,command.expectedVersion+1);assert.equal(revision.before_facts.version,command.expectedVersion);
   const ledger=(await pool.query('SELECT id::text,warehouse_id::text,sku_id::text,quantity_delta::text FROM naijue_erp.inventory_ledger WHERE operation_id=$1 ORDER BY id',[receipt.operationId])).rows;
   assert.deepEqual(ledger.map(r=>r.id).sort(),[...receipt.ledgerEntryIds].sort());effectSizes.push(ledger.length);
   assert.deepEqual([...revision.stock_effect_evidence.ledgerEntryIds].sort(),[...receipt.ledgerEntryIds].sort());
   const totals=new Map<string,{delta:bigint;count:number}>();
   for(const row of ledger){const key=JSON.stringify([row.warehouse_id,row.sku_id]),old=totals.get(key)??{delta:0n,count:0};old.delta+=BigInt(row.quantity_delta);old.count++;totals.set(key,old);}
   for(const [key,total] of totals){const [warehouse,sku]=JSON.parse(key);const old=before.find(r=>r.warehouse_id===warehouse&&r.sku_id===sku);assert.ok(old,'Every effect key must be covered by fixture before snapshot');
    const after=(await pool.query('SELECT quantity::text,version FROM naijue_erp.inventory_balance WHERE warehouse_id=$1 AND sku_id=$2',[warehouse,sku])).rows[0];
    assert.equal(BigInt(after.quantity),BigInt(old.quantity??'0')+total.delta);assert.equal(after.version,(old.version??0)+total.count);
   }
   const replayBefore=await snapshot(command,c.actor);
   const reauthorized=await timed(()=>policy.authorize(c.actor,command,new AbortController().signal));assert.deepEqual(reauthorized.value,c.grant);
   const replay=await timed(()=>store.revise(c.actor,command,reauthorized.value,c.now,new AbortController().signal));assert.deepEqual(replay.value,receipt);
   assert.deepEqual(await snapshot(command,c.actor),replayBefore,'Original-key replay must not change any affected ledger/balance/source/effective/revision/audit/receipt/publication projection');
   assert.equal((await pool.query('SELECT count(*)::integer n FROM naijue_erp.history_revision WHERE operation_id=$1',[receipt.operationId])).rows[0].n,1);
   timings.push({case:index+1,kind:command.kind,effects:ledger.length,authorizeMs:authorized.ms,reviseMs:revised.ms,replayAuthorizeMs:reauthorized.ms,replayMs:replay.ms});
  }
  assert.deepEqual(effectSizes,[0,1,16,2],'Exact original four effect paths required');
  // A new deterministic *rejected* key prevents the original committed-receipt replay branch
  // from bypassing CAS. Source authorization passes; the actual store must BEGIN/read/ROLLBACK.
  const first=fixture.cases[0]!,original=commands[0]!;
  const conflict=parseHistoryRevisionCommand({...original,requestKey:original.requestKey+'_VERSION_CONFLICT'});
  assert.equal((await pool.query('SELECT count(*)::integer n FROM naijue_erp.operation_receipt WHERE actor_account_id=$1 AND request_key=$2',[first.actor.accountId,conflict.requestKey])).rows[0].n,0,'Failure probe key must never adopt prior work');
  const conflictAuthorized=await timed(()=>policy.authorize(first.actor,conflict,new AbortController().signal));assert.deepEqual(conflictAuthorized.value,first.grant);
  const conflictBefore=await snapshot(conflict,first.actor);
  const failed:Probe={leases:[]};probe=failed;
  try{await assert.rejects(store.revise(first.actor,conflict,conflictAuthorized.value,first.now,new AbortController().signal),{code:'VERSION_CONFLICT'});}finally{probe=null;}
  assert.equal(failed.leases.length,1);const failedLease=failed.leases[0]!;
  assert.deepEqual(failedLease.events,['BEGIN ISOLATION LEVEL READ COMMITTED','SOURCE_READ_COMPLETED','ROLLBACK']);assert.equal(failedLease.released,true);assert.equal(failedLease.discarded,false);
  const reusable=await pool.connect();try{
   const state=(await reusable.query('SELECT pg_backend_pid() pid,pg_current_xact_id_if_assigned() IS NULL unassigned')).rows[0];
   assert.equal(state.pid,failedLease.pid,'The actual rolled-back backend must be reusable');assert.equal(state.unassigned,true,'No old assigned transaction may survive rollback');
  }finally{reusable.release();}
  assert.deepEqual(await snapshot(conflict,first.actor),conflictBefore,'Version conflict must leave every affected state unchanged');
  timings.push({case:'VERSION_CONFLICT',authorizeMs:conflictAuthorized.ms,rollbackVerified:true,sameBackendReused:true});
  // Hold exactly the original receipt and document locks, then observe a real store replay waiting
  // on that same key/document. Releasing the holder must serialize into the original receipt only.
  const contentionAuthorized=await timed(()=>policy.authorize(first.actor,original,new AbortController().signal));assert.deepEqual(contentionAuthorized.value,first.grant);
  const contentionBefore=await snapshot(original,first.actor);
  const blocker=await pool.connect();let observer:PoolClient|undefined;
  let pending:Promise<{ok:true;value:{value:HistoryRevisionReceipt;ms:number}}|{ok:false;error:unknown}>|undefined,blockerBegan=false;
  const contended:Probe={leases:[]};let waitObservedMs=0;
  try{
   observer=await pool.connect();await blocker.query('BEGIN ISOLATION LEVEL READ COMMITTED');blockerBegan=true;
   const blockerPid=(await blocker.query('SELECT pg_backend_pid() pid')).rows[0].pid as number;
   for(const lock of [`naijue:receipt:${JSON.stringify([first.actor.accountId,original.requestKey])}`,`naijue:history:${original.kind}:${original.documentId}`])await blocker.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[lock]);
   probe=contended;
   pending=timed(()=>store.revise(first.actor,original,contentionAuthorized.value,first.now,new AbortController().signal)).then(value=>({ok:true as const,value}),error=>({ok:false as const,error}));
   const start=performance.now();let blocked=false;
   while(performance.now()-start<10000){
    const pid=contended.leases[0]?.pid;
    if(pid!==undefined){const row=(await observer.query(`SELECT pg_blocking_pids($1) blockers,EXISTS(SELECT 1 FROM pg_locks WHERE pid=$1 AND locktype='advisory' AND NOT granted) advisory_wait`,[pid])).rows[0];if(row.advisory_wait===true&&(row.blockers as number[]).includes(blockerPid)){blocked=true;waitObservedMs=performance.now()-start;break;}}
    await new Promise(resolve=>setTimeout(resolve,10));
   }
   assert.equal(blocked,true,'Same-key/document replay must actually wait on the original advisory lock holder');
   await blocker.query('COMMIT');blockerBegan=false;
   const outcome=await pending;if(!outcome.ok)throw outcome.error;assert.deepEqual(outcome.value.value,receipts[0]);
   assert.equal(contended.leases.length,1);assert.deepEqual(contended.leases[0]!.events,['BEGIN ISOLATION LEVEL READ COMMITTED','SOURCE_READ_COMPLETED','COMMIT']);assert.equal(contended.leases[0]!.released,true);assert.equal(contended.leases[0]!.discarded,false);
   timings.push({case:'CONTENDED_ORIGINAL_KEY_REPLAY',authorizeMs:contentionAuthorized.ms,replayMs:outcome.value.ms,waitObservedMs,includesDeliberateLockWait:true});
  }finally{
   probe=null;
   let discard:Error|undefined;
   try{if(blockerBegan)await blocker.query('ROLLBACK');}catch(error){discard=error instanceof Error?error:Error('Contention holder rollback failed');throw error;}
   finally{try{blocker.release(discard);}finally{try{observer?.release();}finally{if(pending)await pending;}}}
  }
  assert.deepEqual(await snapshot(original,first.actor),contentionBefore,'Serialized replay must not add or change any affected state');
 }finally{
  t.diagnostic(JSON.stringify({timings,interpretation:'OBSERVED_ONLY_SYNTHETIC_16_LINE_FIXTURE_NOT_SCALE_OR_SLO_ACCEPTANCE'}));
  await pool.end();
 }
});
