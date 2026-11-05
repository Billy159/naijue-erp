import type { PreparedNativeSkuImport26 } from '../../packages/application/src/native-sku-import.ts';
import type { SourceBinding26,SourceClosureScope26,SourceClosureContext26,SourceClosure26 } from './verified-offset-source.mjs';
export interface CatalogueSourceFiles26 {mappingFile:string;trustedMappingSha256:string;reviewApprovalFile:string;trustedReviewApprovalSha256:string;}
export interface ReviewedSkuSource26 {
 readonly report:Readonly<{kind:'REVIEWED_SKU26_ORIGINAL_SOURCE_REFERENCE_ONLY_V1';rows:number;oldAliases:number;collisionGroups:number;collisionMembers:number;referenceDecisionsAuthorized:true;executionAuthorized:false;newNativeUUIDs:0;noSql:true}>;
 verify():Promise<void>;rows():AsyncGenerator<PreparedNativeSkuImport26>;authorize(input:PreparedNativeSkuImport26):Promise<void>;
 openClosure(scope:SourceClosureScope26,context:SourceClosureContext26):Promise<SourceClosure26>;close():Promise<void>;
}
export function openReviewedSkuSource26(options:{reviewFile:string;trustedReviewSha256:string;binding:SourceBinding26;authorizedPayloadHash:string|null;baseDirectory:string;productSnapshotFile:string;catalogue:CatalogueSourceFiles26}):Promise<ReviewedSkuSource26>;
