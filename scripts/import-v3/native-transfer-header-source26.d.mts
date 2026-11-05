import type { PreparedHistoryHeader } from '../../packages/application/src/import-v3-history-header.ts';
import type { PreparedHistoryHeaderChunk } from '../../packages/application/src/import-v3-history-header-staging.ts';
import type { HistoryClosureRow } from '../../packages/application/src/history-typed-closure.ts';
import type { SourceBinding26,SourceComponent26,SourceClosureScope26,SourceClosureContext26,SourceClosure26 } from './verified-offset-source.mjs';
export interface TransferHeaderCaptureObservation26 extends SourceBinding26 {taskId:'HEADER_SOURCE_CAPTURE26_V1';status:'CAPTURE_COMPLETE';sql:false;stage:false;publish:false;readerReturned:true;readerClosed:true;actualRows:number;actualCounts:{SALES_HEADER:number;TRANSFER_HEADER:number};preservedCompressedSource:{path:string;bytes:number;sha256:string;rawBytes:number;rawSha256:string};}
export function observeTransferHeaderCapture26(options:{spoolFile:string;binding:SourceBinding26}):Promise<TransferHeaderCaptureObservation26>;
export function transferHeaderProjection26(prepared:PreparedHistoryHeader):{sourceRow:HistoryClosureRow;typedRow:HistoryClosureRow;document:{kind:'TRANSFER';sourceKey:string;headerSourceRowId:string;headerId:string}};
export interface ReviewedTransferHeaderSource26 {
 readonly report:Readonly<{kind:'GENUINE_TRANSFER_HEADER26_REFERENCE_ONLY_V1';rows:number;containerRows:number;containerCounts:Readonly<{SALES_HEADER:number;TRANSFER_HEADER:number}>;physicalGzipPasses:number;nativeContextRows:number;cache:Readonly<{directory:string;path:string;bytes:number;sha256:string}>;historyIdentityRule:'EXISTING_MAPPER_STABLE_IMPORT_ID';wholeHeadersComplete:false;executionAuthorized:false;newNativeUUIDs:0;noSql:true}>;verify():Promise<void>;chunks():AsyncGenerator<PreparedHistoryHeaderChunk>;authorize(input:PreparedHistoryHeaderChunk):Promise<void>;
 openClosure(scope:SourceClosureScope26,context:SourceClosureContext26):Promise<SourceClosure26>;close():Promise<void>;
}
export function openReviewedTransferHeaderSource26(options:{binding:SourceBinding26;authorizedPayloadHash:string|null;reviewFile:string;trustedReviewSha256:string;originalSource:{spoolFile:string;receiptFile:string;trustedReceiptSha256:string};parties:SourceComponent26;cacheParent:string;signal?:AbortSignal}):Promise<ReviewedTransferHeaderSource26>;
