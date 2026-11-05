import test from "node:test";import assert from "node:assert/strict";
import { integrationSettings } from "./safety.ts";import { openFreshNativePaymentDatabase } from "./native-payment-database.ts";
import { seedHistorySettlementFixture } from "./history-settlement-fixture.ts";
import { createPostgresHistorySettlementBindingResolver,PostgresHistorySettlementStagingStore } from "../../adapters/postgres/src/import-v3-history-settlement-staging-store.ts";
import { prepareHistorySettlementChunk } from "../../packages/application/src/import-v3-history-settlement.ts";
import type { HistorySettlementChunk } from "../../packages/application/src/import-v3-history-settlement.ts";
import { settlementChunk } from "../support/history-settlement-fixtures.ts";
import { paymentId as id,PAYMENT_NAMESPACE,PAYMENT_HASH,originalPaymentFields } from "../support/native-payment-fixtures.ts";
import type { PgSalesPool } from "../../adapters/postgres/src/sales-unit-of-work.ts";
import { expectExactSqlFailure } from "./database.ts";
test("fresh PG17 historical SETTLEMENT: exact readonly typed resolver, independent original method/NULL, atomic stage/replay",async t=>{
 assert.equal(process.env.NAIJUE_PG_TEST_SUITE,"history-settlement-0001-0017","Exact fresh settlement17 suite required");
 const db=await openFreshNativePaymentDatabase(integrationSettings(process.env));
 try{const pool=db.pool;await seedHistorySettlementFixture(pool);
  const count=async(table:string)=>Number((await pool.query(`SELECT count(*)::integer n FROM naijue_erp.${table}`)).rows[0]!.n);
  const resolver=createPostgresHistorySettlementBindingResolver(pool,{batchId:id(1),fixedSourceNamespace:PAYMENT_NAMESPACE,selectionSha256:PAYMENT_HASH}),store=new PostgresHistorySettlementStagingStore(pool);
  const resolve=async(input:HistorySettlementChunk)=>{for(const row of input.rows){const b=await resolver({entity:"SETTLEMENT",sourceKey:row.source.sourceKey,rawFields:row.source.rawFields,normalizedFields:row.source.normalizedFields});Object.assign(row,b);}return input;};
  let explicit:HistorySettlementChunk,unknown:HistorySettlementChunk;
  await t.test("actual RR READ ONLY binding resolves independent historical methodB against account methodA, absent original method stays NULL",async()=>{
   explicit=await resolve(settlementChunk());unknown=settlementChunk(false);const s=unknown.rows[0]!.source;
   s.id=id(1601);s.sourceKey="SETTLEMENT-0002";s.rowNo="3";s.rawFields.来源编号=s.sourceKey;s.rawFields.原收退行号="10";s.rawFields.金额="0";s.rawFields.方向="收款";s.rawFields.原账户显示名="";s.rawFields.原方式显示名="";s.normalizedFields=structuredClone(s.rawFields);s.fieldProvenance=originalPaymentFields(s.rawFields);unknown=await resolve(unknown);
   assert.equal(explicit.rows[0]!.account.nativeSnapshot.payment_method_id,id(10));assert.equal(explicit.rows[0]!.method!.nativeId,id(11));assert.equal(unknown.rows[0]!.method,null);
   assert.equal(await count("history_sales_settlement"),0);assert.equal(await count("import_source_row"),7);
   const bad=structuredClone(explicit.rows[0]!.source);bad.rawFields.原收款方式来源编号="MISSING";bad.normalizedFields.原收款方式来源编号="MISSING";
   await assert.rejects(resolver({entity:"SETTLEMENT",sourceKey:bad.sourceKey,rawFields:bad.rawFields,normalizedFields:bad.normalizedFields}));assert.equal(await count("import_source_row"),7);
  });
  await t.test("two original settlements keep exact amounts/directions/text/NULL and replay after current account maintenance",async()=>{
   const input={...explicit!,rows:[explicit!.rows[0]!,unknown!.rows[0]!]},prepared=prepareHistorySettlementChunk(input);
   assert.deepEqual(await store.stage(prepared),{inserted:2,replayed:0});assert.deepEqual(await store.stage(prepared),{inserted:0,replayed:2});
   const rows=(await pool.query("SELECT line_no,payment_account_id,payment_method_id_snapshot,direction,amount::text,account_name_snapshot,method_name_snapshot FROM naijue_erp.history_sales_settlement ORDER BY line_no")).rows;
   assert.deepEqual(rows,[{line_no:9,payment_account_id:id(20),payment_method_id_snapshot:id(11),direction:"REFUND",amount:"7.03",account_name_snapshot:"历史账户旧名",method_name_snapshot:"历史方式旧名"},{line_no:10,payment_account_id:id(20),payment_method_id_snapshot:null,direction:"RECEIVE",amount:"0.00",account_name_snapshot:null,method_name_snapshot:null}]);
   await pool.query("UPDATE naijue_erp.payment_account SET name='MAINTAINED CURRENT',payment_method_id=$2,enabled=false,version=2 WHERE id=$1",[id(20),id(11)]);
   assert.deepEqual(await store.stage(prepared),{inserted:0,replayed:2});assert.equal((await resolve(settlementChunk())).rows[0]!.account.nativeSnapshot.payment_method_id,id(10));
  });
  await t.test("actual second typed INSERT failure rolls back the complete two-row source/settlement transaction; known rollback later stage succeeds",async()=>{
   const input=settlementChunk();input.rows=[0,1].map(i=>{const row=structuredClone(explicit!.rows[0]!);row.source.id=id(1602+i);row.source.sourceKey=`SETTLEMENT-000${3+i}`;row.source.rowNo=String(4+i);row.source.rawFields.来源编号=row.source.sourceKey;row.source.rawFields.原收退行号=String(11+i);row.source.normalizedFields=structuredClone(row.source.rawFields);row.source.fieldProvenance=originalPaymentFields(row.source.rawFields);return row;});
   const prepared=prepareHistorySettlementChunk(await resolve(input));let actualTyped=0;const before=[await count("import_source_row"),await count("history_sales_settlement")];
   const fault:PgSalesPool={async connect(){const c=await pool.connect();return {async query(sql,values){const result=await c.query(sql,values);if(sql.includes("settlement:insert-typed")&&++actualTyped===2)throw Error("AFTER_SECOND_ACTUAL_SETTLEMENT_INSERT");return result;},release(error){c.release(error);}};}};
   await assert.rejects(new PostgresHistorySettlementStagingStore(fault).stage(prepared),/AFTER_SECOND_ACTUAL_SETTLEMENT_INSERT/);assert.equal(actualTyped,2);assert.deepEqual([await count("import_source_row"),await count("history_sales_settlement")],before);
   assert.deepEqual(await store.stage(prepared),{inserted:2,replayed:0});assert.deepEqual(await store.stage(prepared),{inserted:0,replayed:2});
  });
  await t.test("forged typed fingerprint rejects before any insert; immutable SQL and zero live/stock effects retained; nonzero history remains unpublished",async()=>{
   const input=await resolve(settlementChunk()),row=input.rows[0]!;row.source.id=id(1605);row.source.sourceKey="SETTLEMENT-FORGED";row.source.rowNo="7";row.source.rawFields.来源编号=row.source.sourceKey;row.source.rawFields.原收退行号="15";row.source.normalizedFields=structuredClone(row.source.rawFields);row.source.fieldProvenance=originalPaymentFields(row.source.rawFields);row.account.fingerprint="b".repeat(64);
   await assert.rejects(store.stage(prepareHistorySettlementChunk(input)),{code:"HISTORY_SETTLEMENT_STORE"});assert.equal(await count("import_source_row"),11);assert.equal(await count("history_sales_settlement"),4);
   await expectExactSqlFailure(pool,"23514","append-only relation history_sales_settlement cannot be updated or deleted","reject_immutable_change",async c=>{await c.query("UPDATE naijue_erp.history_sales_settlement SET amount=amount");});
   for(const table of ["sales_header","sales_settlement","inventory_ledger","inventory_balance","import_record_accounting_claim"])assert.equal(await count(table),0);
   const b=(await pool.query("SELECT status,checkpoint->>'cursor' cursor FROM naijue_erp.import_batch WHERE id=$1",[id(1)])).rows[0]!;assert.deepEqual(b,{status:"STAGED",cursor:"0"});
  });
 }finally{await db.close();}
});
