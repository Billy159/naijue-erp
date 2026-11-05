import type { PreparedNativePaymentImportChunk } from '../../packages/application/src/native-payment-import.ts';
import type { SourceBinding26,SourceFileIo26,SourceClosureScope26,SourceClosureContext26,SourceClosure26 } from './verified-offset-source.mjs';
export interface ReviewedPaymentSource26 {
 readonly report:Readonly<{kind:'REVIEWED_PAYMENT_SOURCE26_REFERENCE_ONLY_V1';rows:number;chunks:number;counts:Readonly<Record<'PAYMENT_METHOD'|'PAYMENT_ACCOUNT'|'PAYMENT_ACCOUNT_HALL',number>>;originalBlankRelationIds:number;referenceDecisionsAuthorized:true;executionAuthorized:false;noSql:true}>;
 verify():Promise<void>;chunks():AsyncGenerator<PreparedNativePaymentImportChunk>;authorize(input:PreparedNativePaymentImportChunk):Promise<void>;
 openClosure(scope:SourceClosureScope26,context:SourceClosureContext26):Promise<SourceClosure26>;close():Promise<void>;
}
export function openReviewedPaymentSource26(options:{reviewFile:string;trustedReviewSha256:string;binding:SourceBinding26;authorizedPayloadHash:string|null},io?:SourceFileIo26):Promise<ReviewedPaymentSource26>;
