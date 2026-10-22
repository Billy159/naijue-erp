import type { HistorySettlementChunk, HistoryPaymentBinding } from "../../packages/application/src/import-v3-history-settlement.ts";
import { syntheticSalesDetailChunk } from "./synthetic-sales-detail-fixtures.ts";
import { paymentId as id,PAYMENT_HASH,originalPaymentFields } from "./native-payment-fixtures.ts";
export function paymentBinding(entity:"PAYMENT_ACCOUNT"|"PAYMENT_METHOD",n:number):HistoryPaymentBinding {
 return {entity,sourceKey:entity==="PAYMENT_ACCOUNT"?`ACCOUNT-${n}`:`METHOD-${n}`,nativeId:id(n),sourceRowId:id(1000+n),sourceFileSha256:PAYMENT_HASH,rowSha256:PAYMENT_HASH,fingerprint:PAYMENT_HASH,
  nativeSnapshot:entity==="PAYMENT_ACCOUNT"?{id:id(n),name:`当前创建账户${n}`,payment_method_id:id(10),enabled:true,version:1}:{id:id(n),name:`创建方式${n}`,enabled:true,version:1}};
}
export function settlementChunk(withMethod=true):HistorySettlementChunk {
 const raw={来源编号:"SETTLEMENT-0001",单据来源编号:"HEADER-1",原收退行号:"9",账户来源编号:"ACCOUNT-20",方向:"退款",金额:"7.03",原账户显示名:"历史账户旧名",原方式显示名:"历史方式旧名",...(withMethod?{原收款方式来源编号:"METHOD-11"}:{})};
 return {batchId:id(1),fixedSourceNamespace:"synthetic.payment17",selection:{entity:"SETTLEMENT",source:"BASE_V2",path:"business/15历史收退记录.csv",baseManifestSha256:PAYMENT_HASH,selectionSha256:PAYMENT_HASH,approvalSha256:PAYMENT_HASH,csvSha256:PAYMENT_HASH,moneyApprovalSha256:PAYMENT_HASH},moneyApprovals:syntheticSalesDetailChunk().moneyApprovals,
  rows:[{source:{id:id(1600),batchId:id(1),entityType:"SETTLEMENT",sourceKey:raw.来源编号,fileRef:"synthetic-settlement.xlsx",sheet:"SETTLEMENT",rowNo:"2",sourceFileSha256:PAYMENT_HASH,rowSha256:PAYMENT_HASH,rawFields:raw,normalizedFields:structuredClone(raw),fieldProvenance:originalPaymentFields(raw)},
   header:{sourceKey:"HEADER-1",nativeId:id(400),sourceRowId:id(1400),sourceFileSha256:PAYMENT_HASH,rowSha256:PAYMENT_HASH,version:1},account:paymentBinding("PAYMENT_ACCOUNT",20),method:withMethod?paymentBinding("PAYMENT_METHOD",11):null}]};
}
