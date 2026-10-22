import { IMPORT_V2_TABLES } from "../../packages/application/src/import-v2-contract.ts";
import { v2MoneyApprovalSet } from "../../packages/application/src/import-v2.ts";
import type { HistorySalesDetailChunk } from "../../packages/application/src/import-v3-history-sales-detail.ts";
export const salesDetailId=(n:number)=>`00000000-0000-0000-0000-${String(n).padStart(12,"0")}`;
export const salesDetailHash="a".repeat(64);
export function syntheticSalesDetailChunk():HistorySalesDetailChunk{
 const h=salesDetailHash;
 const n=Object.fromEntries(IMPORT_V2_TABLES.find(t=>t.entity==="SALES_LINE")!.columns.map(c=>[c.name,""]));
 Object.assign(n,{"来源编号":"SYNTHETIC-LINE-0001","单据来源编号":"SYNTHETIC-SALES-1","原行号":"7","SKU来源编号":"SYNTHETIC-CANONICAL-SKU","原数量":"-2","原成交单价":"0.03","原行金额":"-0.12","原赠品标记":"否","原款号":"0007","原使用条码":"0000123"});
 const raw={...n,"SKU来源编号":"SYNTHETIC-OLD-SKU"};
 const approved=Array.from({length:32},(_,i)=>({fileSha256:h,sheet:"SYNTHETIC",row:String(i+20),sourceId:`SYNTHETIC-OTHER-${i}`,field:"原行金额",rawValue:"1.00000000000001",exactCentValue:"1.00"}));
 return {batchId:salesDetailId(1),fixedSourceNamespace:"synthetic-sales-detail",selection:{entity:"SALES_LINE",source:"BASE_V2",path:"business/14历史销货明细.csv",baseManifestSha256:h,selectionSha256:h,approvalSha256:h,csvSha256:h,aliasCsvSha256:h,moneyApprovalSha256:h},moneyApprovals:v2MoneyApprovalSet(approved,approved),rows:[{
  source:{id:salesDetailId(10),batchId:salesDetailId(1),entityType:"SALES_LINE",sourceKey:n["来源编号"]!,fileRef:"SYNTHETIC.xlsx",sheet:"SYNTHETIC",rowNo:"2",sourceFileSha256:h,rowSha256:h,rawFields:raw,normalizedFields:n,
   fieldProvenance:{schema_version:1,fields:Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,{origin:"ORIGINAL",reason:"Exact synthetic original cell",raw:v}]))}},
  header:{sourceKey:n["单据来源编号"]!,nativeId:salesDetailId(2),sourceRowId:salesDetailId(3),sourceFileSha256:h,rowSha256:h,version:1},
  sku:{oldSourceSkuKey:raw["SKU来源编号"],canonicalSourceKey:n["SKU来源编号"]!,nativeId:salesDetailId(4),aliasSourceRowId:salesDetailId(5),importRecordId:salesDetailId(6)}
 }]};
}
