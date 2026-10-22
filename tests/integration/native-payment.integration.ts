/** Actual new schema1–17 PG; synthetic sources only, no settlement/history publication. */
import test from "node:test";import assert from "node:assert/strict";
import { integrationSettings } from "./safety.ts";import { openFreshNativePaymentDatabase } from "./native-payment-database.ts";
import { assertNativeImportAccountingGuards } from "../../adapters/postgres/src/native-import-accounting-capability.ts";
import { PostgresCutoffImportStore } from "../../adapters/postgres/src/inventory-cutoff-import-store.ts";
import { PostgresNativePartyImportStore } from "../../adapters/postgres/src/native-party-import.ts";
import { prepareNativePartyImportChunk } from "../../packages/application/src/native-party-import.ts";
import { prepareNativePaymentImportChunk } from "../../packages/application/src/native-payment-import.ts";
import { PostgresNativePaymentImportStore,nativePaymentBindingEvidence } from "../../adapters/postgres/src/native-payment-import.ts";
import { paymentChunk,paymentId as id,PAYMENT_HASH,PAYMENT_NAMESPACE,originalPaymentFields } from "../support/native-payment-fixtures.ts";
import { engineFixtures,ENGINE_TIME } from "./native-import-accounting-fixture.ts";
import { expectExactSqlFailure } from "./database.ts";
import { entityId } from "../../packages/domain/src/values.ts";
import type { CutoffImportCommand } from "../../packages/application/src/inventory-cutoff-import.ts";
import type { PgSalesPool } from "../../adapters/postgres/src/sales-unit-of-work.ts";
test("fresh PG17 prefix1–17: typed payment native creation, independent original sources, maintained replay and atomic rollback",async t=>{
 assert.equal(process.env.NAIJUE_PG_TEST_SUITE,"native-payment-0001-0017","Explicit separate schema17 suite required");
 const db=await openFreshNativePaymentDatabase(integrationSettings(process.env));
 try{const pool=db.pool,store=new PostgresNativePaymentImportStore(pool),count=async(table:string)=>Number((await pool.query(`SELECT count(*)::integer n FROM naijue_erp.${table}`)).rows[0]!.n);
  const methods=paymentChunk();methods.rows.push(paymentChunk("PAYMENT_METHOD",11).rows[0]!);const preparedMethods=prepareNativePaymentImportChunk(methods),account=prepareNativePaymentImportChunk(paymentChunk("PAYMENT_ACCOUNT",20));
  await t.test("exact17 runtime guards and original STAGE; disabled new trigger denies full capability without writes",async()=>{
   const client=await pool.connect();try{await assertNativeImportAccountingGuards(client);await client.query("BEGIN");await client.query("ALTER TABLE naijue_erp.import_native_payment_binding DISABLE TRIGGER native_payment_binding_stage");await assert.rejects(assertNativeImportAccountingGuards(client),{code:"NATIVE_IMPORT_GUARDS_NOT_READY"});await client.query("ROLLBACK");}finally{client.release();}
   await pool.query("INSERT INTO naijue_erp.staff(id,name,role,employment_status,version) VALUES($1,'SYNTHETIC PAYMENT IMPORTER','WAREHOUSE','在职',1)",[id(801)]);
   await pool.query("INSERT INTO naijue_erp.user_account(id,staff_id,login_name,password_hash,login_enabled,auth_version,version,created_at,updated_at) VALUES($1,$2,'SYNTHETIC_PAYMENT_NONLOGIN','SYNTHETIC_NOT_A_PASSWORD',false,1,1,$3,$3)",[id(802),id(801),ENGINE_TIME]);
   const stage:CutoffImportCommand={action:"IMPORT_STAGE",actorAccountId:entityId("account",id(802)),batchId:id(1),requestKey:"PAYMENT17-STAGE",sourceName:PAYMENT_NAMESPACE,sourceHash:PAYMENT_HASH,sourceManifestRef:"synthetic:payment17-selected",cutoffAt:ENGINE_TIME,mappingVersion:"V2_HISTORY_NULLABLE_1",
    expected:{WAREHOUSE:0,SKU:0,INVENTORY_LEDGER:0,IMPORT_BATCH:1},historyMetadata:{payloadHash:PAYMENT_HASH,expectedCounts:{import_source_row:6,import_sku_alias:0,import_stock_contributor:0,barcodes:0,history_sales_header:0,history_sales_line:0,history_sales_settlement:0,history_transfer_header:0,history_transfer_line:0}}};
   assert.equal((await new PostgresCutoffImportStore(pool).execute(stage,ENGINE_TIME)).status,"STAGED");
   const hall=engineFixtures().parties[0]!;hall.fixedSourceNamespace=PAYMENT_NAMESPACE;hall.selection.selectionSha256=PAYMENT_HASH;
   assert.deepEqual(await new PostgresNativePartyImportStore(pool).stage(prepareNativePartyImportChunk([hall])),{inserted:1,replayed:0});
  });
  await t.test("actual new methods and account require typed same-batch method creation; existing unproved identity cannot be adopted",async()=>{
   assert.deepEqual(await store.stage(preparedMethods),{inserted:2,replayed:0,nativeCurrentMatchesCreation:true});
   assert.deepEqual(await store.stage(account),{inserted:1,replayed:0,nativeCurrentMatchesCreation:true});
   assert.equal((await pool.query("SELECT payment_method_id FROM naijue_erp.payment_account WHERE id=$1",[id(20)])).rows[0]!.payment_method_id,id(10));
   await pool.query("INSERT INTO naijue_erp.payment_method(id,name,enabled,version) VALUES($1,'原方式99',true,1)",[id(99)]);
   await assert.rejects(store.stage(prepareNativePaymentImportChunk(paymentChunk("PAYMENT_METHOD",99))),{code:"NATIVE_PAYMENT_STORE"});
   assert.equal((await pool.query("SELECT count(*)::integer n FROM naijue_erp.import_source_row WHERE source_key='METHOD-99'")).rows[0]!.n,0);
  });
  await t.test("current account method/name maintenance remains intact on exact replay and optional original recommendation import",async()=>{
   await pool.query("UPDATE naijue_erp.payment_account SET name='MAINTAINED ACCOUNT',payment_method_id=$2,version=2 WHERE id=$1",[id(20),id(11)]);
   assert.deepEqual(await store.stage(account),{inserted:0,replayed:1,nativeCurrentMatchesCreation:false});
   const hall=engineFixtures().parties[0]!,relation=paymentChunk("PAYMENT_ACCOUNT_HALL",40),row=relation.rows[0]!;
   row.source.rawFields.厅来源编号="HALL-1";row.source.normalizedFields=structuredClone(row.source.rawFields);row.source.fieldProvenance=originalPaymentFields(row.source.rawFields);
   row.source.sourceKey=JSON.stringify(["ACCOUNT-20","HALL-1"]);row.references.厅来源编号={entity:"HALL",sourceKey:"HALL-1",nativeId:id(10),nativeSnapshot:hall.nativeSnapshot};
   const result=await store.stage(prepareNativePaymentImportChunk(relation));assert.equal(result.inserted,1);assert.equal(result.nativeCurrentMatchesCreation,false);
   assert.equal(await count("payment_account_hall"),1);const actual=(await pool.query("SELECT name,payment_method_id,version FROM naijue_erp.payment_account WHERE id=$1",[id(20)])).rows[0]!;
   assert.deepEqual(actual,{name:"MAINTAINED ACCOUNT",payment_method_id:id(11),version:2});
   assert.deepEqual(await store.stage(preparedMethods),{inserted:0,replayed:2,nativeCurrentMatchesCreation:true});
  });
  await t.test("real typed binding INSERT followed by injected throw rolls back native/source/binding as one transaction",async()=>{
   const prepared=prepareNativePaymentImportChunk(paymentChunk("PAYMENT_METHOD",50)),before=await Promise.all(["payment_method","import_source_row","import_native_payment_binding"].map(count));let injected=false;
   const fault:PgSalesPool={async connect(){const c=await pool.connect();return {async query(sql,values){const result=await c.query(sql,values);if(sql.includes("native-payment:binding-create")){injected=true;throw Error("AFTER_ACTUAL_TYPED_PAYMENT_INSERT");}return result;},release(error){c.release(error);}};}};
   await assert.rejects(new PostgresNativePaymentImportStore(fault).stage(prepared),/AFTER_ACTUAL_TYPED_PAYMENT_INSERT/);assert.equal(injected,true);
   assert.deepEqual(await Promise.all(["payment_method","import_source_row","import_native_payment_binding"].map(count)),before);
   assert.equal((await store.stage(prepared)).inserted,1);assert.equal((await store.stage(prepared)).replayed,1);
  });
  await t.test("native guard refuses binding old committed rows; typed evidence is immutable; staging has no live sale/stock/claim effects",async()=>{
   await expectExactSqlFailure(pool,"23514","payment binding requires fresh exact native creation, never adoption","guard_native_payment_binding",async c=>{
    await c.query("INSERT INTO naijue_erp.import_native_payment_binding SELECT (jsonb_populate_record(NULL::naijue_erp.import_native_payment_binding,$1::jsonb)).*",[JSON.stringify(nativePaymentBindingEvidence(preparedMethods.rows[0]!))]);
   });
   await expectExactSqlFailure(pool,"23514","append-only relation import_native_payment_binding cannot be updated or deleted","reject_immutable_change",async c=>{await c.query("UPDATE naijue_erp.import_native_payment_binding SET source_key=source_key");});
   for(const table of ["sales_header","sales_settlement","history_sales_settlement","inventory_ledger","inventory_balance","import_record_accounting_claim"])assert.equal(await count(table),0);
   assert.equal(await count("import_native_payment_binding"),5);assert.equal(await count("import_source_row"),6);
   assert.equal((await pool.query("SELECT status,checkpoint->>'cursor' cursor FROM naijue_erp.import_batch WHERE id=$1",[id(1)])).rows[0]!.status,"STAGED");
  });
 }finally{await db.close();}
});
