import type { HistoryHeaderInput, HistoryHeaderEntity, HeaderNativeBinding } from '../../packages/application/src/import-v3-history-header.ts';
import type { PreparedHistoryHeaderChunk } from '../../packages/application/src/import-v3-history-header-staging.ts';
import type { HistoryHeaderNativeReferenceInput, PreparedHistoryHeaderNativeReferenceChunk, HistoryHeaderNativeReferenceEntity } from '../../packages/application/src/import-v3-history-header-native-reference.ts';
import type { ImportSourceEvidence } from '../../packages/application/src/history-storage-contract.ts';
export type AuthorizedHeaderRecord = Pick<HistoryHeaderInput,'source'|'selection'|'creatorHallOverlay'|'temporalEvidence'|'moneyApprovals'>;
export interface AuthorizedV3HeaderReader {
  readonly report: Readonly<{kind:'V3_HEADER_SOURCE_ROW_READER';importReady:false;noSql:true;preflight:Record<string,unknown>;
    rawRowsScanned:number;selectedRows:number;counts:Record<HistoryHeaderEntity,number>;spoolBytes:number;spoolSha256:string;
    rowHashAlgorithm:'SHA256_JSONL_UTF8_EXCLUDING_LF_RETAINING_CR_V1';originalCellEvidenceRegenerated:true;numericCellEvidence:number;nativeBindingsVerified:false;nativeReferenceSourcesIncluded:boolean;nativeReferenceRows:number}>;
  rows(entity?:HistoryHeaderEntity):AsyncGenerator<AuthorizedHeaderRecord>;
  referenceRows(entity?:HistoryHeaderNativeReferenceEntity):AsyncGenerator<Pick<HistoryHeaderNativeReferenceInput,'source'|'selection'>>;
  authorizeReferences(chunk:PreparedHistoryHeaderNativeReferenceChunk):Promise<void>;
  authorize(chunk:PreparedHistoryHeaderChunk):Promise<void>;
  close():Promise<void>;
}
export function openAuthorizedV3HeaderReader(options:{
  base:string;v3Amendment:string;v3Approval:string;trustedApprovalSha256:string;approvedMoneyOverlaySha256:string;
  sourceRoot:string;spoolParent:string;batchId:string;fixedSourceNamespace:string;includeNativeReferenceSources?:boolean;
  /** Optional stricter operator bound, positive safe integer <=512MiB; absent retains512MiB. */
  maxEvidenceSpoolBytes?:number;
  /** Optional stricter selected DTO spool bound with the same positive safe <=512MiB/default policy. */
  maxSpoolBytes?:number;
  resolveNativeReferenceBinding?:(query:{entity:HistoryHeaderNativeReferenceEntity;sourceKey:string;rawFields:ImportSourceEvidence['rawFields'];normalizedFields:ImportSourceEvidence['normalizedFields']})=>Promise<Pick<HistoryHeaderNativeReferenceInput,'nativeSnapshot'|'bindings'|'enumMappings'>>;
  resolveNativeBinding?:(query:{entity:HistoryHeaderEntity;sourceKey:string;rawFields:ImportSourceEvidence['rawFields'];normalizedFields:ImportSourceEvidence['normalizedFields']})=>Promise<Readonly<Record<string,HeaderNativeBinding|undefined>>>;
}):Promise<AuthorizedV3HeaderReader>;
