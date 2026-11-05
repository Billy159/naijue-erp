import type { PreparedNativeProductImportChunk26 } from '../../packages/application/src/native-product-import.ts';
import type { SourceBinding26,SourceComponent26,SourceClosureScope26,SourceClosureContext26,SourceClosure26 } from './verified-offset-source.mjs';
export interface ReviewedProductSource26 {
 readonly report:Readonly<{kind:'REVIEWED_GENUINE_PRODUCT_SOURCE26_REFERENCE_ONLY_V1';products:number;chunks:number;unknownSeasons:number;multipleSeasons:number;executionAuthorized:false;newNativeUUIDs:0;noSql:true}>;
 verify(references?:boolean):Promise<void>;chunks():AsyncGenerator<PreparedNativeProductImportChunk26>;
 authorize(input:PreparedNativeProductImportChunk26):Promise<void>;openClosure(scope:SourceClosureScope26,context:SourceClosureContext26):Promise<SourceClosure26>;close():Promise<void>;
}
export function openReviewedProductSource26(options:{binding:SourceBinding26;authorizedPayloadHash:string|null;source:SourceComponent26;reference:{referenceDecisionFile:string;trustedReferenceDecisionSha256:string;mappingFiles:Readonly<Record<string,string>>;reviewFile:string;trustedReviewSha256:string};chunkRows:number}):Promise<ReviewedProductSource26>;
