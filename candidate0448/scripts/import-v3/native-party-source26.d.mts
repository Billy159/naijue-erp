import type { PreparedNativePartyImportChunk } from '../../packages/application/src/native-party-import.ts';
import type { SourceBinding26,SourceComponent26,SourceFileIo26,SourceClosureScope26,SourceClosureContext26,SourceClosure26 } from './verified-offset-source.mjs';
export interface ReviewedPartySource26 {
 readonly report:Readonly<{kind:'REVIEWED_ORDINARY_PARTY_SOURCE26_REFERENCE_ONLY_V1';ordinaryParties:number;historicalCustomers:number;rows:number;counts:Readonly<Record<'HALL'|'WAREHOUSE'|'STAFF'|'CUSTOMER'|'SUPPLIER',number>>;chunks:number;bootstrapAccountsCovered:boolean;executionAuthorized:false;newNativeUUIDs:0;noSql:true}>;
 verify():Promise<void>;chunks():AsyncGenerator<PreparedNativePartyImportChunk>;authorize(input:PreparedNativePartyImportChunk):Promise<void>;authorizePartyChunk(input:PreparedNativePartyImportChunk):Promise<void>;
 openClosure(scope:SourceClosureScope26,context:SourceClosureContext26):Promise<SourceClosure26>;close():Promise<void>;
}
export function openReviewedPartySource26(options:{binding:SourceBinding26;authorizedPayloadHash:string|null;source:SourceComponent26;historical:null|{sourceFile:string;candidateFile:string;reviewFile:string;contractFile:string;trustedReviewSha256:string};chunkRows:number},io?:SourceFileIo26):Promise<ReviewedPartySource26>;
