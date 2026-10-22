import type { AuthorizedV3Reader } from './authorized-reader.mjs';
import type { PreparedNativeProductImportChunk } from '../../packages/application/src/native-product-import.ts';
export interface NativeProductCompositeAuthorizer {
  readonly report: Readonly<{kind:'NATIVE_PRODUCT_COMPOSITE_AUTHORIZER';importReady:false;noSql:true;referenceDecisionSha256:string;
    decisions:number;mappingFiles:number;sourceAuthorization:'REQUIRED_FOR_EVERY_CHUNK';referenceDecisionVersion:string}>;
  authorize(chunk:PreparedNativeProductImportChunk):Promise<void>;
  /** Does not close the separately supplied source reader. */
  close():Promise<void>;
}
export function openNativeProductAuthorizer(options:{
  sourceReader:Pick<AuthorizedV3Reader,'authorize'>;referenceDecisionFile:string;trustedReferenceDecisionSha256:string;
  mappingFiles:Readonly<Record<string,string>>;
}):Promise<NativeProductCompositeAuthorizer>;
