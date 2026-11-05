import { constants } from 'node:fs';
import { open, lstat, realpath } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { inspectPackageDirectory } from './package-reader.ts';
import { parseStrictJson, decodeUtf8, decodeJsonl, sha256 } from '../../packages/application/src/unified-import-contract.ts';
import type { UnifiedPackage, PackageManifest, IdentityEntry, StandardRecord } from '../../packages/application/src/unified-import-contract.ts';
import { buildUnifiedImportPlan, UnifiedImportExecutionError } from '../../packages/application/src/unified-import-execution.ts';
import type { BuildUnifiedImportPlanInput, UnifiedImportPlan, StandardImportCurrentAdmin, StandardImportRegistration, StandardImportTarget } from '../../packages/application/src/unified-import-execution.ts';

import {buildUnifiedImportPlanV2} from '../../packages/application/src/unified-import-execution-v2.ts';
import type {UnifiedImportPlanV2} from '../../packages/application/src/unified-import-execution-v2.ts';

export interface LoadExecutionPlanOptions {historicalSalesHallApproval?:NonNullable<BuildUnifiedImportPlanInput['historicalSalesHallApproval']>;currentEffectiveAlignmentEvidence?:NonNullable<BuildUnifiedImportPlanInput['currentEffectiveAlignmentEvidence']>;expectedManifestSha256:string;allowSynthetic?:boolean;explicitZeroApproval?:NonNullable<BuildUnifiedImportPlanInput['explicitZeroApproval']>;historicalSalesAdmission?:object;historicalStaffHallApproval?:NonNullable<BuildUnifiedImportPlanInput['historicalStaffHallApproval']>;registration?:StandardImportRegistration;target?:StandardImportTarget;}
/** Reuse the existing intake gate, then independently bind the exact bytes used by
 * execution. It reads ONLY declared standard artifacts, never source_files/raw data. */
export async function readPinnedPackageForExecution(directory:string,options:LoadExecutionPlanOptions):Promise<BuildUnifiedImportPlanInput> {
  const validation=await inspectPackageDirectory(directory,options);
  if(!validation.valid)throw new UnifiedImportExecutionError('PREFLIGHT_REJECTED');
  const root=await realpath(resolve(directory));let total=0;
  async function readPinned(path:string,limit:number):Promise<Uint8Array>{
    let ancestor=root;
    for(const part of path.split('/')){ancestor=join(ancestor,part);if((await lstat(ancestor)).isSymbolicLink())throw new UnifiedImportExecutionError('PACKAGE_CHANGED');}
    const actual=await realpath(join(root,path));if(!actual.startsWith(root+sep))throw new UnifiedImportExecutionError('PACKAGE_CHANGED');
    const h=await open(actual,constants.O_RDONLY|constants.O_NOFOLLOW);
    try{const before=await h.stat();if(!before.isFile()||before.size>limit||total+before.size>256*1024*1024)throw new UnifiedImportExecutionError('PACKAGE_CHANGED');
      const bytes=await h.readFile();const after=await h.stat();if(bytes.length!==before.size||after.size!==before.size||after.mtimeMs!==before.mtimeMs)throw new UnifiedImportExecutionError('PACKAGE_CHANGED');total+=bytes.length;return bytes;
    }finally{await h.close();}
  }
  const manifestBytes=await readPinned('manifest.json',2*1024*1024);
  if(sha256(manifestBytes)!==options.expectedManifestSha256)throw new UnifiedImportExecutionError('MANIFEST_HASH_MISMATCH');
  const manifest=parseStrictJson(decodeUtf8(manifestBytes)) as PackageManifest;
  const artifacts:Record<string,Uint8Array>={},records:Record<string,StandardRecord[]>={},reports:Record<string,unknown>={};let registry:IdentityEntry[]=[];
  for(const pin of [manifest.identity_registry,...manifest.files,...manifest.reports,...manifest.assets]){
    const bytes=await readPinned(pin.relative_path,64*1024*1024);
    if(bytes.length!==pin.bytes||sha256(bytes)!==pin.sha256)throw new UnifiedImportExecutionError('PACKAGE_CHANGED');
    artifacts[pin.relative_path]=bytes;
    if(pin===manifest.identity_registry)registry=decodeJsonl(bytes) as IdentityEntry[];
    else if('table' in pin&&typeof pin.table==='string')records[pin.table]=decodeJsonl(bytes) as StandardRecord[];
    else if('encoding' in pin)reports[pin.relative_path]=pin.encoding==='JSON'?parseStrictJson(decodeUtf8(bytes)):decodeJsonl(bytes);
  }
  const pkg:UnifiedPackage={manifest,registry,records,artifacts,reports};
  return{pkg,manifestBytes,...options};
}

/** Legacy V1 entrypoint/default remains unchanged. */
export async function loadUnifiedImportPlan(directory:string,options:LoadExecutionPlanOptions):Promise<UnifiedImportPlan> {return buildUnifiedImportPlan(await readPinnedPackageForExecution(directory,options));}
export interface LoadExecutionPlanOptionsV2 extends LoadExecutionPlanOptions {initialization_identity:StandardImportCurrentAdmin;max_master_chunk_rows?:number;}
/** Explicit offline V2 only, consuming the exact same standard-package reader. */
export async function loadUnifiedImportPlanV2(directory:string,options:LoadExecutionPlanOptionsV2):Promise<UnifiedImportPlanV2> {const{initialization_identity,max_master_chunk_rows,...base}=options;return buildUnifiedImportPlanV2({...await readPinnedPackageForExecution(directory,base),initialization_identity,...(max_master_chunk_rows!==undefined?{max_master_chunk_rows}:{})});}
