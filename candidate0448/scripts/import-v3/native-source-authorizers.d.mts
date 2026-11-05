import type { ImportSourceEvidence } from '../../packages/application/src/history-storage-contract.ts';
import type { PreparedNativeCatalogueImportChunk26 } from '../../packages/application/src/native-catalogue-import.ts';
import type { SourceBinding26,SourceComponent26,SourceFileIo26,SourceClosureScope26,SourceClosureContext26,SourceClosure26 } from './verified-offset-source.mjs';
export interface CatalogueSourceFiles26 {mappingFile:string;trustedMappingSha256:string;reviewApprovalFile:string;trustedReviewApprovalSha256:string;}
export interface ReviewedCatalogueSource26 {
 verify():Promise<void>;chunks():AsyncGenerator<PreparedNativeCatalogueImportChunk26>;authorize(input:PreparedNativeCatalogueImportChunk26):Promise<void>;
 openClosure(scope:SourceClosureScope26,context:SourceClosureContext26):Promise<SourceClosure26>;close():Promise<void>;
}
export function openReviewedCatalogueSource26(options:CatalogueSourceFiles26&{binding:SourceBinding26},io?:SourceFileIo26):Promise<ReviewedCatalogueSource26>;
export function openReviewedProductEvidenceSource(options:SourceComponent26&{binding:SourceBinding26},io?:SourceFileIo26):Promise<{report:Readonly<{products:number}>;verify():Promise<void>;rows():AsyncGenerator<ImportSourceEvidence>;close():Promise<void>}>;
