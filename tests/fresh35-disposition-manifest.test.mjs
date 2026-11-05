import test from 'node:test';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
import {loadFresh35DispositionManifest,validateDispositionManifest,collectDispositionBodies} from '../scripts/release/unified-install/fresh35-disposition-manifest.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)).replace(/\/$/,'');const m=await loadFresh35DispositionManifest(root);
test('complete source cohort inventories56 tables and177 transformed bodies but authorizes zero drops',()=>{
 assert.equal(m.tables.length,56);assert.equal(m.routines.length,177);assert.equal(m.candidateTables.length,21);
 assert.equal(m.tables.filter(t=>t.retirementCandidate).length,21);assert.ok(m.tables.every(t=>!t.dropAuthorized));
 assert.equal(m.implementedTableCount,null);assert.equal(m.engineDependencyGraphComplete,false);assert.equal(m.final35Approved,false);
 assert.equal(m.routines.filter(r=>r.rowtypes.length).length,0);assert.ok(Object.isFrozen(m.routines[0]));
});
test('both composite signatures and five source-row cast routines remain explicit unresolved objects',()=>{
 assert.equal(m.routines.filter(r=>r.compositeInputs.length).length,2);assert.equal(m.routines.filter(r=>r.typedCasts.includes('import_source_row')).length,5);
 assert.ok(m.routines.filter(r=>r.lexicalRelations.length).every(r=>r.reachability==='UNKNOWN'));
 assert.ok(m.routines.some(r=>r.lexicalCalleeCandidates.length));
 assert.ok(m.coreTriggerReview.every(t=>Array.isArray(t.lexicalReachableAffectedCandidates)));
 assert.ok(m.coreTriggerReview.some(t=>t.lexicalReachableAffectedCandidates.length));
 assert.ok(m.coreTriggerReview.length>0);assert.ok(m.coreTriggerReview.some(t=>t.table==='sales_header'));
 assert.ok(m.triggerDeclarations.every(t=>t.finalCatalogStatus.startsWith('UNKNOWN')));
});
test('altered disposition, evidence claims and omissions fail exact manifest comparison',()=>{
 assert.equal(validateDispositionManifest(structuredClone(m),m).installationReady,false);
 assert.throws(()=>validateDispositionManifest(structuredClone(m),structuredClone(m)),/DIFFERS/);
 for(const mutate of [x=>x.final35Approved=true,x=>x.tables[0].dropAuthorized=true,x=>x.tables.pop(),x=>x.routines.pop(),x=>x.engineDependencyGraphComplete=true]){const x=structuredClone(m);mutate(x);assert.throws(()=>validateDispositionManifest(x,m),/DIFFERS/);}
});
test('body collection refuses missing cohort or source tamper',()=>{
 const pins=m.routines.map(r=>({signature:r.signature,sha256:r.bodySha256}));
 assert.throws(()=>collectDispositionBodies([],pins,[]),/MISSING/);
 assert.throws(()=>collectDispositionBodies([{sql:'bad',sha256:'0'.repeat(64)}],pins,[]),/SOURCE_CHANGED/);
 assert.throws(()=>collectDispositionBodies([],pins.slice(1),[]),/EXACT_COHORT/);
});
test('saved disposition snapshot exactly matches the current pinned-source generator',async()=>{
 const {readFile}=await import('node:fs/promises');
 const snapshot=JSON.parse(await readFile(new URL('../docs/legacy-retirement-source/FRESH35-DISPOSITION-SOURCE-MANIFEST.json',import.meta.url),'utf8'));
 assert.deepEqual(snapshot,m);assert.equal(validateDispositionManifest(snapshot,m).final35Approved,false);
});

test('table routine mentions explicitly cover retirement candidates only, never imply retained tables have no references',()=>{
 for(const table of m.tables){
  assert.equal(table.routineMentionScope,'RETIREMENT_CANDIDATE_TABLES_ONLY_NOT_ALL_RELATIONS');
  assert.equal(Object.hasOwn(table,'directlyMentioningRoutines'),false);
  if(!table.retirementCandidate)assert.deepEqual(table.retirementScopedDirectRoutineMentions,[]);
 }
 assert.ok(m.tables.some(t=>t.retirementCandidate&&t.retirementScopedDirectRoutineMentions.length));
});
