import type { ImportSourceEvidence } from '../../packages/application/src/history-storage-contract.ts';
import type { HistorySalesDetailSelection, HistorySalesHeaderBinding, HistorySalesSkuBinding, PreparedHistorySalesDetailChunk } from '../../packages/application/src/import-v3-history-sales-detail.ts';
import type { MoneyApproval } from '../../packages/application/src/import-v2.ts';
export interface AuthorizedSalesDetailRecord {source:ImportSourceEvidence;selection:HistorySalesDetailSelection;moneyApprovals:ReadonlyMap<string,MoneyApproval>}
export interface AuthorizedSalesDetailReader {
 readonly report:Readonly<{kind:'V3_SALES_DETAIL_SOURCE_READER';importReady:false;noSql:true;preflight:Record<string,unknown>;rawRowsScanned:number;selectedRows:number;spoolBytes:number;spoolSha256:string;rowHashAlgorithm:'SHA256_JSONL_UTF8_EXCLUDING_LF_RETAINING_CR_V1';originalWorkbooksReparsed:false;nativeBindingsVerified:false;settlementImplemented:false}>;
 rows(entity?:'SALES_LINE'):AsyncGenerator<AuthorizedSalesDetailRecord>;authorize(chunk:PreparedHistorySalesDetailChunk):Promise<void>;close():Promise<void>;
}
export function openAuthorizedSalesDetailReader(options:{base:string;v3Amendment:string;v3Approval:string;trustedApprovalSha256:string;approvedMoneyOverlaySha256:string;spoolParent:string;batchId:string;fixedSourceNamespace:string;
 resolveNativeBinding?:(query:{entity:'SALES_LINE';sourceKey:string;rawFields:ImportSourceEvidence['rawFields'];normalizedFields:ImportSourceEvidence['normalizedFields']})=>Promise<{header:HistorySalesHeaderBinding;sku:HistorySalesSkuBinding}>;
}):Promise<AuthorizedSalesDetailReader>;
