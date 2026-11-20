/** Offline-only independent original-occurrence census. Never grants execution. */
import {realpath} from 'node:fs/promises';
import {relative,sep} from 'node:path';
import {readOccurrenceFile,closeOccurrenceEvidence} from './source-occurrence-reader.mjs';
import {requestHash} from '../../packages/application/src/request-hash.ts';
export async function readSourceOccurrenceCliEvidence(packageDirectory,manifest,path,trustedSha256){
 const relation=relative(await realpath(packageDirectory),await realpath(path));
 if(!relation||relation!=='..'&&!relation.startsWith('..'+sep)&&!relation.startsWith(sep))throw Error('SOURCE_RECONCILIATION_EVIDENCE_OUTSIDE_PACKAGE_REQUIRED');
 const evidence=await readOccurrenceFile(path,trustedSha256);
 if(evidence.source_namespace!==manifest.source_namespace||evidence.manifest_value_sha256!==requestHash(manifest)){closeOccurrenceEvidence(evidence);throw Error('SOURCE_RECONCILIATION_PACKAGE_MISMATCH');}
 return evidence;
}
