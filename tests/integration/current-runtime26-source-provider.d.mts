import type { PreparedNativeBarcode } from '../../packages/application/src/native-barcode-import.ts';
import type { PreparedHistoryHeaderChunk } from '../../packages/application/src/import-v3-history-header-staging.ts';
import type { SourceBinding26,SourceFilePin26,SourceClosureScope26,SourceClosureContext26,SourceClosure26 } from '../../scripts/import-v3/verified-offset-source.mjs';
import type { HistoryClosureSourceGroup } from '../../scripts/import-v2/authorized-history-closure-reader.mjs';
export const providerVersion:'NATIVE_IMPORT_PRODUCTION_PROVIDERS_26_V1';
export const sourceGroups:readonly HistoryClosureSourceGroup[];
export interface Qa22Binding26 extends SourceBinding26 {
 version:string;phase:string;actorAccountId:string;authorizedPayloadHash:string;coreSourceDigest:string;coreReceiptId:string;
 target:{database:string;role:string;serverAddress:string;serverPort:number;postmasterStartedAt:string};
}
export interface Qa22Target26 {database:string;databaseOid:string;actingRole:string;sessionUser:string;serverAddress:string;serverPort:number;postmasterStart:string;}
export function validateQa22Binding(binding:Qa22Binding26):void;
export function validateV7R1Target(target:Qa22Target26,binding:Qa22Binding26):Qa22Target26;
export interface ReviewedQa22Capture26 {
 verify():Promise<void>;authorize(input:PreparedNativeBarcode|PreparedHistoryHeaderChunk):Promise<void>;
 rows():AsyncGenerator<PreparedNativeBarcode|PreparedHistoryHeaderChunk>;chunks():AsyncGenerator<PreparedNativeBarcode|PreparedHistoryHeaderChunk>;
 openClosure(scope:SourceClosureScope26,context:SourceClosureContext26):Promise<SourceClosure26>;close():Promise<void>;
}
export function openReviewedQa22Capture(recipe:{mode:'QA_CAPTURE';review:SourceFilePin26;records:SourceFilePin26;originals:SourceFilePin26;canonicalCsv:SourceFilePin26;nativeBindings:SourceFilePin26},binding:Qa22Binding26,signal:AbortSignal,trustedTarget:Qa22Target26):Promise<ReviewedQa22Capture26>;
