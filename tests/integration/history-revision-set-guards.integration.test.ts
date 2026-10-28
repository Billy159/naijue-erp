/** Uses an independently prepared synthetic published fixture + exact runtime review.
 * T45 provisions it. This runner never creates/migrates/drops a database. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {createNativeRuntime26Issuer} from '../../adapters/postgres/src/native-import-accounting-capability.ts';
import {PostgresHistoryRevisionStore} from '../../adapters/postgres/src/history-revision-store.ts';
import {parseHistoryRevisionCommand} from '../../packages/application/src/history-revision-service.ts';
import type {HistoryRevisionGrant} from '../../packages/application/src/history-revision-contracts.ts';
import type {ActorContext} from '../../packages/application/src/ports.ts';
import type {PgSalesPool} from '../../adapters/postgres/src/sales-unit-of-work.ts';

test('P04 isolated real nonowner store, full ledger set, per-key conservation/CAS and original-key replay',{timeout:120000},async()=>{
 const database=process.env.NAIJUE_HV2_P04_DATABASE,url=process.env.NAIJUE_HV2_P04_URL;
 const file=process.env.NAIJUE_HV2_P04_FIXTURE,fixturePin=process.env.NAIJUE_HV2_P04_FIXTURE_SHA256;
 const reviewFile=process.env.NAIJUE_HV2_P04_REVIEW,reviewPin=process.env.NAIJUE_HV2_P04_REVIEW_SHA256;
 assert.ok(process.env.NAIJUE_HV2_P04_SYNTHETIC_AUTHORIZATION==='CONFIRMED_NEW_ISOLATED'&&database&&/^erp_hv2_p04_[a-z0-9_]+$/.test(database)&&url&&file&&fixturePin&&reviewFile&&reviewPin,'Explicit separately approved fresh synthetic target/fixture/review required');
 const bytes=readFileSync(file);assert.ok(bytes.length<=4*1024*1024);assert.equal(createHash('sha256').update(bytes).digest('hex'),fixturePin);
 const fixture=JSON.parse(bytes.toString('utf8')) as {syntheticOnly:boolean;database:string;cases:{actor:ActorContext;command:unknown;grant:HistoryRevisionGrant;now:string;keys:{warehouseId:string;skuId:string}[]}[]};
 assert.equal(fixture.syntheticOnly,true);assert.equal(fixture.database,database);assert.ok(fixture.cases.length>=3&&fixture.cases.length<=12,'Fixture must cover empty effect, one effect and multi-effect cases');
 const pool=new Pool({connectionString:url,max:3,connectionTimeoutMillis:3000,statement_timeout:15000,lock_timeout:3000});
 try{
  const client=await pool.connect();try{
   const i=(await client.query(`SELECT current_database() db,current_user role,session_user,(SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname=current_user) elevated,
    (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='naijue_erp.history_revision'::regclass) owner`)).rows[0];
   assert.equal(i.db,database);assert.equal(i.role,i.session_user);assert.equal(i.elevated,false);assert.notEqual(i.role,i.owner);
  }finally{client.release();}
  // This is the original genuine issuer; no boolean or fake assertWriteReady.
  const issuer=await createNativeRuntime26Issuer({connect:()=>pool.connect()} as unknown as PgSalesPool,{reviewFile,trustedReviewSha256:reviewPin});
  const store=PostgresHistoryRevisionStore.forRuntime26(issuer.pool,{runtime26:issuer.runtime26,newId:()=>randomUUID()});
  const effectSizes:number[]=[];
  for(const c of fixture.cases){
   const command=parseHistoryRevisionCommand(c.command);
   const before=(await pool.query(`SELECT k.warehouse_id::text,k.sku_id::text,b.quantity::text,b.version
    FROM unnest($1::uuid[],$2::uuid[]) k(warehouse_id,sku_id) LEFT JOIN naijue_erp.inventory_balance b USING(warehouse_id,sku_id)`,[c.keys.map(k=>k.warehouseId),c.keys.map(k=>k.skuId)])).rows;
   const receipt=await store.revise(c.actor,command,c.grant,c.now,new AbortController().signal);
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
   const replay=await store.revise(c.actor,command,c.grant,c.now,new AbortController().signal);assert.deepEqual(replay,receipt);
   assert.equal((await pool.query('SELECT count(*)::integer n FROM naijue_erp.history_revision WHERE operation_id=$1',[receipt.operationId])).rows[0].n,1);
  }
  assert.ok(effectSizes.includes(0)&&effectSizes.includes(1)&&effectSizes.some(n=>n>1),'Actual fixture must exercise zero/one/many effect paths');
 }finally{await pool.end();}
});
