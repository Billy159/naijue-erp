import type { ImportSourceEvidence } from '../../packages/application/src/history-storage-contract.ts';
import type { PreparedHistoryChunk, V3HistorySelectionBinding } from '../../packages/application/src/import-v3-history-staging.ts';
import type { PreparedProductEvidenceChunk, ProductEvidenceSelection } from '../../packages/application/src/product-evidence-staging.ts';
import type { CatalogueBlankPricePolicy } from '../../packages/application/src/catalogue-source-proof.ts';
export type AuthorizedSourceEntity = 'PRODUCT' | 'TRANSFER_LINE';
export interface AuthorizedSourceRecord { source: ImportSourceEvidence; selection: V3HistorySelectionBinding | ProductEvidenceSelection }
export interface NativeSourceBindingQuery {
  entity: AuthorizedSourceEntity; sourceKey: string;
  rawFields: ImportSourceEvidence['rawFields']; normalizedFields: ImportSourceEvidence['normalizedFields'];
}
export type NativeSourceBinding = {
  header: {sourceKey:string;nativeId:string}; sku: {sourceKey:string;nativeId:string};
} | {product:{sourceKey:string;nativeId:string;expectedVersion:number};blankPricePolicy:CatalogueBlankPricePolicy};
export interface AuthorizedV3Reader {
  readonly report: Readonly<{kind:'V3_SOURCE_ROW_READER';importReady:false;noSql:true;preflight:Record<string,unknown>;
    rawRowsScanned:number;selectedRows:number;counts:Record<AuthorizedSourceEntity,number>;spoolBytes:number;spoolSha256:string;
    rowHashAlgorithm:'SHA256_JSONL_UTF8_EXCLUDING_LF_RETAINING_CR_V1';nativeBindingsVerified:false}>;
  rows(entity?:AuthorizedSourceEntity):AsyncGenerator<AuthorizedSourceRecord>;
  authorize(chunk:PreparedHistoryChunk | PreparedProductEvidenceChunk):Promise<void>;
  close():Promise<void>;
}
export function openAuthorizedV3Reader(options:{
  base:string;v3Amendment:string;v3Approval:string;trustedApprovalSha256:string;spoolParent:string;batchId:string;fixedSourceNamespace:string;
  resolveNativeBinding?:(query:NativeSourceBindingQuery)=>Promise<NativeSourceBinding>;
}):Promise<AuthorizedV3Reader>;
