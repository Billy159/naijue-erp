import type {ImportSourceEvidence} from '../../packages/application/src/history-storage-contract.ts';
import type {HistorySettlementSelection,HistorySettlementRow,PreparedHistorySettlementChunk} from '../../packages/application/src/import-v3-history-settlement.ts';
import type {MoneyApproval} from '../../packages/application/src/import-v2.ts';
export interface AuthorizedSettlementRecord {source:ImportSourceEvidence;selection:HistorySettlementSelection;moneyApprovals:ReadonlyMap<string,MoneyApproval>}
export interface AuthorizedSettlementReader {
 readonly report:Readonly<{kind:'HISTORY_SETTLEMENT_SOURCE_READER';importReady:false;noSql:true;preflight:Record<string,unknown>;rawRowsScanned:number;selectedRows:number;counts:Readonly<Record<'SETTLEMENT',number>>;spoolBytes:number;spoolSha256:string;rowHashAlgorithm:'SHA256_JSONL_UTF8_EXCLUDING_LF_RETAINING_CR_V1';originalWorkbooksReparsed:false;nativeBindingsVerified:false}>;
 rows(entity?:'SETTLEMENT'):AsyncGenerator<AuthorizedSettlementRecord>;
 authorize(chunk:PreparedHistorySettlementChunk):Promise<void>;
 close():Promise<void>;
}
export function openAuthorizedSettlementReader(options:{
 base:string;v3Amendment:string;v3Approval:string;trustedApprovalSha256:string;approvedMoneyOverlaySha256:string;spoolParent:string;batchId:string;fixedSourceNamespace:string;
 /** Optional lower operator cap only; positive safe integer <=512MiB, default512MiB. */
 maxSpoolBytes?:number;
 resolveNativeBinding?:(query:{entity:'SETTLEMENT';sourceKey:string;rawFields:ImportSourceEvidence['rawFields'];normalizedFields:ImportSourceEvidence['normalizedFields']})=>Promise<Omit<HistorySettlementRow,'source'>>;
}):Promise<AuthorizedSettlementReader>;
