import type { NativePaymentImportChunk, NativePaymentImportRow, NativePaymentReference } from "../../packages/application/src/native-payment-import.ts";
import type { JsonObject } from "../../packages/application/src/history-storage-contract.ts";
export const paymentId = (n: number) => `00000000-0000-0000-0000-${n.toString().padStart(12,"0")}`;
export const PAYMENT_HASH = "a".repeat(64), PAYMENT_NAMESPACE = "synthetic.payment17";
export const originalPaymentFields = (raw: JsonObject): JsonObject => ({ schema_version: 1, fields: Object.fromEntries(Object.entries(raw).map(([k,v]) => [k,{origin:"ORIGINAL",reason:"Exact synthetic original cell",raw:v}])) });
export function methodReference(n = 10): NativePaymentReference {
  return { entity:"PAYMENT_METHOD",sourceKey:`METHOD-${n}`,nativeId:paymentId(n),nativeSnapshot:{id:paymentId(n),name:`原方式${n}`,enabled:true,version:1} };
}
export function paymentChunk(entity: "PAYMENT_METHOD"|"PAYMENT_ACCOUNT"|"PAYMENT_ACCOUNT_HALL" = "PAYMENT_METHOD", n = 10): NativePaymentImportChunk {
  const raw: JsonObject = entity==="PAYMENT_METHOD"?{来源编号:`METHOD-${n}`,方式名称:`原方式${n}`,状态:"正常"}:
    entity==="PAYMENT_ACCOUNT"?{来源编号:`ACCOUNT-${n}`,账户显示名称:`原账户${n}`,收款方式来源编号:"METHOD-10",状态:"正常"}:
    {账户来源编号:"ACCOUNT-20",厅来源编号:"HALL-30"};
  const path = entity==="PAYMENT_METHOD"?"business/09收款方式.csv":entity==="PAYMENT_ACCOUNT"?"business/10收款账户.csv":"business/11账户适用厅.csv";
  const refs: Record<string,NativePaymentReference> = entity==="PAYMENT_METHOD"?{}:entity==="PAYMENT_ACCOUNT"?{收款方式来源编号:methodReference()}:{
    账户来源编号:{entity:"PAYMENT_ACCOUNT",sourceKey:"ACCOUNT-20",nativeId:paymentId(20),nativeSnapshot:{id:paymentId(20),name:"原账户20",payment_method_id:paymentId(10),enabled:true,version:1}},
    厅来源编号:{entity:"HALL",sourceKey:"HALL-30",nativeId:paymentId(30),nativeSnapshot:{id:paymentId(30),name:"原厅30",default_customer_id:null,default_sales_warehouse_id:null,enabled:true,version:1}},
  };
  const row:NativePaymentImportRow={source:{id:paymentId(1000+n),batchId:paymentId(1),entityType:entity,sourceKey:entity==="PAYMENT_ACCOUNT_HALL"?JSON.stringify([raw.账户来源编号,raw.厅来源编号]):raw.来源编号 as string,
    fileRef:"synthetic-payment.xlsx",sheet:entity,rowNo:String(n),sourceFileSha256:PAYMENT_HASH,rowSha256:PAYMENT_HASH,rawFields:raw,normalizedFields:structuredClone(raw),fieldProvenance:originalPaymentFields(raw)},
    nativeId:entity==="PAYMENT_ACCOUNT_HALL"?null:paymentId(n),enabledMapping:entity==="PAYMENT_ACCOUNT_HALL"?null:{raw:"正常",native:true,evidenceRef:"synthetic-reviewed-state-map"},references:refs};
  return {batchId:paymentId(1),fixedSourceNamespace:PAYMENT_NAMESPACE,selection:{entity,source:"BASE_V2",path,baseManifestSha256:PAYMENT_HASH,selectionSha256:PAYMENT_HASH,approvalSha256:PAYMENT_HASH,csvSha256:PAYMENT_HASH},rows:[row]};
}
