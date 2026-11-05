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

import type { HistorySettlementSelection, HistoryPaymentBinding, PreparedHistorySettlementChunk } from '../../packages/application/src/import-v3-history-settlement.ts';
import type { HistoryClosureRow } from '../../packages/application/src/history-typed-closure.ts';
export type CapturedMoneyEntity='SALES_LINE'|'SETTLEMENT';
export interface CapturedProjectionDescriptor {path:string;bytes:number;sha256:string;rows:number;mode:'0600';entity:CapturedMoneyEntity;actualColumns:number;}
export type CapturedMoneySelection<E extends CapturedMoneyEntity>=E extends 'SALES_LINE'?HistorySalesDetailSelection:HistorySettlementSelection;
export type CapturedMoneyBindings<E extends CapturedMoneyEntity>=E extends 'SALES_LINE'?{header:HistorySalesHeaderBinding;sku:HistorySalesSkuBinding}:{header:HistorySalesHeaderBinding;account:HistoryPaymentBinding;method:HistoryPaymentBinding|null};
export interface CapturedMoneyContext<E extends CapturedMoneyEntity> {batchId:string;fixedSourceNamespace:string;selection:CapturedMoneySelection<E>;manifest:{path:string;bytes:number;sha256:string};source:CapturedProjectionDescriptor;typed:CapturedProjectionDescriptor;moneyApprovalFingerprint:string;}
export interface CapturedMoneyReader<E extends CapturedMoneyEntity> {
 readonly report:Readonly<{kind:'V3_SALES_DETAIL_SOURCE_READER'|'HISTORY_SETTLEMENT_SOURCE_READER';importReady:false;noSql:true;preflight:null;selectedRows:number;rawRowsScanned:0;originalWorkbooksReparsed:false;nativeBindingsVerified:false;capturedSource:CapturedMoneyContext<E>}>;
 rows(requested?:E):AsyncGenerator<{source:ImportSourceEvidence;selection:CapturedMoneySelection<E>;moneyApprovals:ReadonlyMap<string,MoneyApproval>}>;
 authorize(input:E extends 'SALES_LINE'?PreparedHistorySalesDetailChunk:PreparedHistorySettlementChunk):Promise<void>;close():Promise<void>;
}
/** Existing runtime export; this declaration does not supply source authority or an implementation. */
export function openCapturedSalesSettlementSource<E extends CapturedMoneyEntity>(options:{
 batchId:string;fixedSourceNamespace:string;trustedApprovalSha256:string;approvedMoneyOverlaySha256:string;
 resolveNativeBinding?:(query:{entity:E;sourceKey:string;rawFields:ImportSourceEvidence['rawFields'];normalizedFields:ImportSourceEvidence['normalizedFields']})=>Promise<CapturedMoneyBindings<E>>;
 capturedSource:{manifestFile:string;trustedManifestSha256:string;selection:CapturedMoneySelection<E>;moneyApprovals:ReadonlyMap<string,MoneyApproval>;
  read:{sourceRows(descriptor:CapturedProjectionDescriptor):Iterable<HistoryClosureRow>|AsyncIterable<HistoryClosureRow>;typedRow(descriptor:CapturedProjectionDescriptor,key:string):Promise<HistoryClosureRow|undefined>|HistoryClosureRow|undefined};
  verify(context:CapturedMoneyContext<E>):Promise<void>|void;close():Promise<void>|void;};
},entity:E,io?:{resolveFile?:(file:{path:string;sha256:string})=>Promise<{path:string;bytes?:number}>}):Promise<CapturedMoneyReader<E>>;
