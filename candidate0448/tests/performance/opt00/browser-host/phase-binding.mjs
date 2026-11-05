/** Test-only source/phase binding. Frozen profiles keep their BEFORE provenance. */
import assert from 'node:assert/strict';
export const BEFORE_ORIGIN=Object.freeze({commit:'0905e799e69b0a486b0ae3366774c0c8fc3e7232',tree:'a2735e895e7a5a233cf9c85baa2d41744c1e4e61',datasetVersion:'opt00.synthetic.v2',profilesManifestSha256:'507d574dee47cf3cbcca985efe88a3d17c76c25df1bfe733542c370af5f9ebe3',logicalDataSha256:'0d8222981e8d3371c6f2dffa5f26b5d4f49e4ed5898ea236dc9af7ba99cc87c8'});
export const AFTER_PROTOCOL=Object.freeze({endpoint:'/current-form/saved-edit-sku-batch-v2/query',wireVersion:2,skuEncoding:'STRING_TUPLE_13',productEncoding:'STRING_STATE_TUPLES',domainVersion:1});
export const PHASES=Object.freeze(['BEFORE_OPT00','AFTER_OPT01_A_R2']);
const REJECTED_ENVELOPE_V1_COMMIT='548b852155b58781b2f609f583492474623a43d1';
export const AFTER_PRODUCTION_PATHS=Object.freeze(['packages/application/src/current-form-ports.ts','packages/application/src/source-confirmed-current-form-authorization.ts','adapters/postgres/src/current-form-reader.ts','apps/api/src/current-form-http.ts','apps/web/src/current-form/http-reader.ts','apps/web/src/current-form/sales-existing-document.ts','apps/web/src/current-form/transfer-existing-document.ts'].sort());
const keys=(value,wanted)=>{assert.ok(value&&typeof value==='object'&&!Array.isArray(value));assert.deepEqual(Object.keys(value).sort(),[...wanted].sort(),'Closed phase manifest keys');};
export function checkedPhase(phase){assert.ok(PHASES.includes(phase),'Explicit known BEFORE/AFTER phase required');return phase;}
export function createPhaseBinding({phase,runtimeCommit,runtimeTree,reviewedManifest=null,reviewedManifestSha256=null}){
  checkedPhase(phase);assert.match(runtimeCommit,/^[a-f0-9]{40}$/);assert.match(runtimeTree,/^[a-f0-9]{40}$/);
  let productionSources=[];
  if(phase==='BEFORE_OPT00'){
    assert.equal(runtimeCommit,BEFORE_ORIGIN.commit,'BEFORE commit must remain original anchor');assert.equal(runtimeTree,BEFORE_ORIGIN.tree,'BEFORE tree must remain original anchor');assert.equal(reviewedManifest,null);assert.equal(reviewedManifestSha256,null);
  }else{
    assert.notEqual(runtimeCommit,REJECTED_ENVELOPE_V1_COMMIT,'Superseded C08 envelope-v1 capacity-regression source cannot be AFTER');
    keys(reviewedManifest,['format','phase','protocol','beforeOrigin','runtimeCommit','runtimeTree','productionSources']);
    assert.equal(reviewedManifest.format,'opt00-controller-reviewed-after-runtime-v2');assert.equal(reviewedManifest.phase,phase);assert.deepEqual(reviewedManifest.protocol,AFTER_PROTOCOL,'Exact reviewed STRING V2 protocol required');assert.deepEqual(reviewedManifest.beforeOrigin,BEFORE_ORIGIN,'AFTER cannot rewrite data/before provenance');assert.equal(reviewedManifest.runtimeCommit,runtimeCommit);assert.equal(reviewedManifest.runtimeTree,runtimeTree);assert.notEqual(runtimeTree,BEFORE_ORIGIN.tree,'AFTER must contain reviewed actual production change');assert.match(reviewedManifestSha256,/^[a-f0-9]{64}$/);
    assert.ok(Array.isArray(reviewedManifest.productionSources));assert.deepEqual(reviewedManifest.productionSources.map(x=>x.path).sort(),AFTER_PRODUCTION_PATHS,'Exactly the seven reviewed OPT01-A production leaves required');
    productionSources=reviewedManifest.productionSources.map(source=>{keys(source,['path','bytes','sha256']);assert.ok(Number.isInteger(source.bytes)&&source.bytes>0);assert.match(source.sha256,/^[a-f0-9]{64}$/);return Object.freeze({...source});}).sort((a,b)=>a.path.localeCompare(b.path));
  }
  return Object.freeze({format:'opt00-runtime-phase-binding-v2',phase,afterProtocol:phase==='BEFORE_OPT00'?null:AFTER_PROTOCOL,beforeOrigin:BEFORE_ORIGIN,actualRuntime:Object.freeze({commit:runtimeCommit,tree:runtimeTree}),reviewedRuntimeManifestSha256:reviewedManifestSha256,reviewedProductionSources:Object.freeze(productionSources)});
}
export function assertProfilePhase(binding,manifest,manifestSha256){
  checkedPhase(binding.phase);assert.deepEqual(binding.beforeOrigin,BEFORE_ORIGIN);assert.equal(manifestSha256,BEFORE_ORIGIN.profilesManifestSha256,'Use unchanged frozen v2 manifest');assert.equal(manifest.baseline.candidateCommit,BEFORE_ORIGIN.commit);assert.equal(manifest.baseline.candidateTree,BEFORE_ORIGIN.tree,'Profile provenance is always BEFORE, never actual AFTER tree');assert.equal(manifest.baseline.datasetVersion,BEFORE_ORIGIN.datasetVersion);assert.ok(Array.isArray(manifest.profiles)&&manifest.profiles.length===6);for(const profile of manifest.profiles)assert.equal(profile.logicalDataSha256,BEFORE_ORIGIN.logicalDataSha256);
}
