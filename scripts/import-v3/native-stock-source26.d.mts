import type { PreparedNativeStockGroup } from '../../packages/application/src/native-stock-contributor-import.ts';
import type { SourceBinding26,SourceComponent26,SourceClosureScope26,SourceClosureContext26,SourceClosure26 } from './verified-offset-source.mjs';
export interface ReviewedStockSource26 {
 readonly report:Readonly<{kind:'REVIEWED_STOCK26_GENUINE_SOURCE_REFERENCE_ONLY_V1';groups:number;contributors:number;signedTotal:string;negativeContributors:number;negativeGroups:number;warehouseReferenceScope:number;representedWarehouses:number;unrepresentedWarehouseScopes:number;unrepresentedNotInferredZero:true;referenceDecisionsAuthorized:true;executionAuthorized:false;baselinePosted:false;newNativeUUIDs:0;noSql:true}>;
 verify():Promise<void>;groups():AsyncGenerator<PreparedNativeStockGroup>;authorize(input:PreparedNativeStockGroup):Promise<void>;
 openClosure(scope:SourceClosureScope26,context:SourceClosureContext26):Promise<SourceClosure26>;close():Promise<void>;
}
export function openReviewedStockSource26(options:{binding:SourceBinding26;authorizedPayloadHash:string|null;reviewFile:string;trustedReviewSha256:string;source:{indexManifestFile:string;trustedIndexManifestSha256:string;reviewFile:string;trustedReviewSha256:string;baseDirectory:string};references:{parties:SourceComponent26;skus:{reviewFile:string;trustedReviewSha256:string}}}):Promise<ReviewedStockSource26>;
