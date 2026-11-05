/** Actual apply must run from a complete committed export, not this WIP checkout. */
import {ROOT,need,sourceFile,hash} from './source-plan.mjs';
const proofs=new WeakMap();
export async function verifyUnifiedExecutionSource(sourceCommit){
 const {verifySourceExport}=await import('../build-production.mjs');
 const observed=await verifySourceExport(ROOT,sourceCommit);
 const proof=Object.freeze({profile:'UNIFIED_VERIFIED_EXECUTION_EXPORT_V1'});proofs.set(proof,{sourceCommit,observed});return proof;
}
export function assertUnifiedExecutionSource(proof,expectedCommit){const p=proofs.get(proof);need(p&&p.sourceCommit===expectedCommit,'GENUINE_REVIEWED_COMMITTED_EXECUTION_EXPORT_REQUIRED');return Object.freeze({sourceCommit:p.sourceCommit});}
export async function assertUnifiedExecutionFiles(proof,expectedCommit){assertUnifiedExecutionSource(proof,expectedCommit);const p=proofs.get(proof);for(const r of p.observed.records.values())if(r.path.startsWith('scripts/release/unified-install/')||['tests/performance/opt02/legacy-cutoff/physical-send.mjs','tests/performance/opt02/current-native-stock/sequence-acl-micro/contract.mjs','tests/integration/runtime26-baseline/schema-objects-only/lifecycle.mjs'].includes(r.path))need(hash(await sourceFile(ROOT,r.path))===r.sha256,'EXECUTION_COMPONENT_SOURCE_CHANGED:'+r.path);}
