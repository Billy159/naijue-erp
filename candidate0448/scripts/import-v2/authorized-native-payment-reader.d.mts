import type {ImportSourceEvidence} from '../../packages/application/src/history-storage-contract.ts';
import type {NativePaymentEntity,NativePaymentSelection,NativePaymentImportRow,PreparedNativePaymentImportChunk} from '../../packages/application/src/native-payment-import.ts';
export interface AuthorizedNativePaymentRecord {source:ImportSourceEvidence;selection:NativePaymentSelection}
export interface AuthorizedNativePaymentReader {
 readonly report:Readonly<{kind:'NATIVE_PAYMENT_SOURCE_READER';importReady:false;noSql:true;preflight:Record<string,unknown>;rawRowsScanned:number;selectedRows:number;counts:Readonly<Record<NativePaymentEntity,number>>;spoolBytes:number;spoolSha256:string;rowHashAlgorithm:'SHA256_JSONL_UTF8_EXCLUDING_LF_RETAINING_CR_V1';originalWorkbooksReparsed:false;nativeBindingsVerified:false}>;
 rows(entity?:NativePaymentEntity):AsyncGenerator<AuthorizedNativePaymentRecord>;
 authorize(chunk:PreparedNativePaymentImportChunk):Promise<void>;
 close():Promise<void>;
}
export function openAuthorizedNativePaymentReader(options:{
 base:string;v3Amendment:string;v3Approval:string;trustedApprovalSha256:string;approvedMoneyOverlaySha256:string;spoolParent:string;batchId:string;fixedSourceNamespace:string;
 /** Optional lower operator cap only; positive safe integer <=512MiB, default512MiB. */
 maxSpoolBytes?:number;
 resolveNativeBinding?:(query:{entity:NativePaymentEntity;sourceKey:string;rawFields:ImportSourceEvidence['rawFields'];normalizedFields:ImportSourceEvidence['normalizedFields']})=>Promise<Omit<NativePaymentImportRow,'source'>>;
}):Promise<AuthorizedNativePaymentReader>;
