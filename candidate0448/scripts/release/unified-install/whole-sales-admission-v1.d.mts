import type {StandardImportTarget} from '../../../packages/application/src/unified-import-execution.ts';
export function assertWholeSalesAdmissionV1(admission:unknown,target:StandardImportTarget,client?:object):string;
export function withVerifiedWholeSalesAdmissionV1<T>(verified:unknown,verifiedClient:object,executionClient:object,target:StandardImportTarget,work:(admission:Readonly<{profile:'WHOLE_SALES_EXECUTION_ADMISSION_V1'}>,verified:unknown)=>Promise<T>|T):Promise<T>;
