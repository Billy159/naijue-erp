/** Synthetic real-adapter prerequisites, no fake SQL/auth/source authority. */
import type { Pool } from "pg";
import { IMPORT_V2_TABLES } from "../../packages/application/src/import-v2-contract.ts";
import { entityId } from "../../packages/domain/src/values.ts";
import { PostgresCutoffImportStore } from "../../adapters/postgres/src/inventory-cutoff-import-store.ts";
import { PostgresNativePartyImportStore } from "../../adapters/postgres/src/native-party-import.ts";
import { prepareNativePartyImportChunk } from "../../packages/application/src/native-party-import.ts";
import type { NativePartyImportInput } from "../../packages/application/src/native-party-import.ts";
import { prepareNativePaymentImportChunk } from "../../packages/application/src/native-payment-import.ts";
import { PostgresNativePaymentImportStore } from "../../adapters/postgres/src/native-payment-import.ts";
import { prepareV3HistoryHeaderChunk } from "../../packages/application/src/import-v3-history-header-staging.ts";
import type { HistoryHeaderInput } from "../../packages/application/src/import-v3-history-header.ts";
import { PostgresV3HistoryHeaderStagingStore } from "../../adapters/postgres/src/import-v3-history-header-staging-store.ts";
import { engineFixtures,ENGINE_TIME } from "./native-import-accounting-fixture.ts";
import { paymentChunk,paymentId as id,PAYMENT_NAMESPACE,PAYMENT_HASH as H,originalPaymentFields } from "../support/native-payment-fixtures.ts";
export async function seedHistorySettlementFixture(pool:Pool){
 await pool.query("INSERT INTO naijue_erp.staff(id,name,role,employment_status,version) VALUES($1,'SYNTHETIC HISTORY IMPORTER','WAREHOUSE','在职',1)",[id(801)]);
 await pool.query("INSERT INTO naijue_erp.user_account(id,staff_id,login_name,password_hash,login_enabled,auth_version,version,created_at,updated_at) VALUES($1,$2,'SYNTHETIC_SETTLEMENT_NONLOGIN','SYNTHETIC_NOT_A_PASSWORD',false,1,1,$3,$3)",[id(802),id(801),ENGINE_TIME]);
 await new PostgresCutoffImportStore(pool).execute({action:"IMPORT_STAGE",actorAccountId:entityId("account",id(802)),batchId:id(1),requestKey:"SETTLEMENT17-STAGE",sourceName:PAYMENT_NAMESPACE,sourceHash:H,sourceManifestRef:"synthetic:settlement17-selected",cutoffAt:ENGINE_TIME,mappingVersion:"V2_HISTORY_NULLABLE_1",
  expected:{WAREHOUSE:1,SKU:0,INVENTORY_LEDGER:0,IMPORT_BATCH:1},historyMetadata:{payloadHash:H,expectedCounts:{import_source_row:11,import_sku_alias:0,import_stock_contributor:0,barcodes:0,history_sales_header:1,history_sales_line:0,history_sales_settlement:4,history_transfer_header:0,history_transfer_line:0}}},ENGINE_TIME);
 const parties=engineFixtures().parties;for(const row of parties){row.fixedSourceNamespace=PAYMENT_NAMESPACE;row.selection.selectionSha256=H;}
 const rawCustomer=Object.fromEntries(IMPORT_V2_TABLES.find(t=>t.entity==="CUSTOMER")!.columns.map(c=>[c.name,""]));Object.assign(rawCustomer,{来源编号:"CUSTOMER-1",原编码:"SYNTHETIC-CUSTOMER-1",名称:"SYNTHETIC CUSTOMER",状态:"正常"});
 const customer:NativePartyImportInput={batchId:id(1),fixedSourceNamespace:PAYMENT_NAMESPACE,selection:{entity:"CUSTOMER",source:"BASE_V2",path:"business/04客户.csv",baseManifestSha256:H,selectionSha256:H,approvalSha256:H,csvSha256:H},
  source:{id:id(1070),batchId:id(1),entityType:"CUSTOMER",sourceKey:"CUSTOMER-1",fileRef:"synthetic-customer.xlsx",sheet:"CUSTOMER",rowNo:"2",sourceFileSha256:H,rowSha256:H,rawFields:rawCustomer,normalizedFields:rawCustomer,fieldProvenance:originalPaymentFields(rawCustomer)},
  nativeSnapshot:{id:id(70),code:"SYNTHETIC-CUSTOMER-1",name:"SYNTHETIC CUSTOMER",enabled:true,version:1,created_at:null,updated_at:null},enumMappings:{状态:{raw:"正常",native:true,evidenceRef:"synthetic-reviewed-state"}},bindings:{}};
 await new PostgresNativePartyImportStore(pool).stage(prepareNativePartyImportChunk([...parties,customer]));
 const methods=paymentChunk();methods.rows.push(paymentChunk("PAYMENT_METHOD",11).rows[0]!);const payments=new PostgresNativePaymentImportStore(pool);
 await payments.stage(prepareNativePaymentImportChunk(methods));await payments.stage(prepareNativePaymentImportChunk(paymentChunk("PAYMENT_ACCOUNT",20)));
 const n=Object.fromEntries(IMPORT_V2_TABLES.find(t=>t.entity==="SALES_HEADER")!.columns.map(c=>[c.name,""]));
 Object.assign(n,{来源编号:"HEADER-1",原单号:"0000123",业务日期:"2024-02-29",原审核状态:"已审核",创建厅归属来源:"UNKNOWN",创建厅归属原因:"UNKNOWN_ORIGINAL_CREATOR_UNMATCHED",单据类型:"销售",所属厅来源编号:"HALL-1",客户来源编号:"CUSTOMER-1",仓库来源编号:"WH-1",优惠前金额:"10.00",整单优惠:"1",应结金额:"8.50"});
 const raw={...n};delete raw.创建厅归属来源;delete raw.创建厅归属原因;
 const headerInput:HistoryHeaderInput={batchId:id(1),fixedSourceNamespace:PAYMENT_NAMESPACE,selection:{baseManifestSha256:H,selectionSha256:H,approvalSha256:H,csvSha256:H,source:"BASE_V2",entity:"SALES_HEADER",path:"business/13历史销货单头.csv"},
  source:{id:id(1400),batchId:id(1),entityType:"SALES_HEADER",sourceKey:"HEADER-1",fileRef:"synthetic-header.xlsx",sheet:"HEADER",rowNo:"2",sourceFileSha256:H,rowSha256:H,rawFields:raw,normalizedFields:n,fieldProvenance:originalPaymentFields(raw)},
  bindings:{所属厅来源编号:{sourceKey:"HALL-1",nativeId:id(10)},客户来源编号:{sourceKey:"CUSTOMER-1",nativeId:id(70)},仓库来源编号:{sourceKey:"WH-1",nativeId:id(40)}},
  creatorHallOverlay:{evidenceRef:"synthetic-reviewed-unknown-creator.csv#2",file:"synthetic-header.xlsx",sheet:"HEADER",row:"2",sourceId:"HEADER-1",documentNumber:"0000123",personField:"营业员来源编号",personId:"",uploadedWarehouseDerivedHall:"",candidateCreatorHall:"",provenance:"UNKNOWN",reason:"UNKNOWN_ORIGINAL_CREATOR_UNMATCHED"}};
 const header=prepareV3HistoryHeaderChunk([headerInput]);await new PostgresV3HistoryHeaderStagingStore(pool).stage(header);
 return {headerId:header.rows[0]!.prepared.header.id};
}
