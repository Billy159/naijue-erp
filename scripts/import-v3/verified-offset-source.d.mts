import type { JsonObject } from '../../packages/application/src/history-storage-contract.ts';
import type { HistoryClosureRow } from '../../packages/application/src/history-typed-closure.ts';
import type { HistoryClosureDocumentAllocation, HistoryClosureSourceGroup } from '../import-v2/authorized-history-closure-reader.mjs';
/** File/evidence types only. Runtime verification and external authority stay in the original readers. */
export interface SourceBinding26 { batchId:string; fixedSourceNamespace:string; cutoffAt:string; selectionSha256:string; }
export interface SourceFilePin26 { path:string; bytes:number; sha256:string; }
export interface SourceComponent26 { directory:string; trustedManifestSha256:string; reviewRecordFile:string; trustedReviewRecordSha256:string; }
export interface SourceClosureScope26 { batchId:string; fixedSourceNamespace:string; selectionSha256:string; authorizedPayloadHash:string; }
export interface SourceClosureContext26 { group:HistoryClosureSourceGroup; signal:AbortSignal; }
export interface SourceClosure26 {
 verify():Promise<void>; sourceRows():AsyncIterable<HistoryClosureRow>; typedRows():AsyncIterable<HistoryClosureRow>;
 documents():AsyncIterable<HistoryClosureDocumentAllocation>; close():Promise<void>;
}
export interface SourceFileIo26 { resolveFile?:(file:{path:string;sha256:string})=>Promise<{path:string;bytes?:number}>; }
export type OffsetSourceEntity26='SKU'|'PAYMENT_METHOD'|'PAYMENT_ACCOUNT'|'PAYMENT_ACCOUNT_HALL'|'INVENTORY_BASELINE'|'SALES_LINE'|'SETTLEMENT'|'TRANSFER_LINE';
export interface OffsetSourceLocator26 {file:string;sheet:string;row:number;sourceSha256:string;}
export interface OffsetSourceIndex26 {entity:OffsetSourceEntity26;sourceKey:string;sourceLocator:OffsetSourceLocator26;identityKind:'ORIGINAL_SOURCE_KEY_AND_LOCATOR'|'ORIGINAL_LOCATOR_ONLY';offset:number;length:number;sha256:string;}
export interface OffsetSourceRecord26 {raw:{entity:OffsetSourceEntity26;sourceId:string;file:string;sheet:string;row:number;sourceSha256:string;data:JsonObject};rawLine:string;index:OffsetSourceIndex26;}
export interface MaterializedSource26 {
 readonly manifest:JsonObject;
 readonly report:Readonly<{kind:'REVIEWED_MATERIALIZED_OFFSET_SOURCE_V1';entities:readonly OffsetSourceEntity26[];rows:number;sourceSha256:string;baseDirectory:string;baseManifestSha256:string;binding:SourceBinding26;noFullSnapshotScan:true;noSql:true;nativeReferenceAuthority:false}>;
 verify():Promise<void>; records(relative:string,columns?:readonly string[],exactHeader?:boolean):AsyncGenerator<Record<string,string>>;
 chunks(entity:OffsetSourceEntity26,chunkRows?:number):AsyncGenerator<OffsetSourceRecord26[]>;close():Promise<void>;
}
export function openReviewedMaterializedSource(options:{indexManifestFile:string;trustedIndexManifestSha256:string;reviewFile:string;trustedReviewSha256:string;binding:SourceBinding26;entities:readonly OffsetSourceEntity26[]}):Promise<MaterializedSource26>;
