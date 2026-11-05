import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {loadFresh35CatalogCandidate,stripPinnedTransaction} from '../scripts/release/unified-install/fresh35-catalog-candidate.mjs';
import {deriveCombinedPins,loadFresh56CombinedCandidate,renderFresh56CombinedReview,runFresh56CombinedInstall} from '../scripts/release/unified-install/fresh56-combined-candidate.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)).replace(/\/$/,'');
const candidate=await loadFresh56CombinedCandidate(root);
const predecessorCandidate=await loadFresh35CatalogCandidate(root);
test('combines 20 disjoint body successors, preserves 157 and never promotes to installed',()=>{
 assert.equal(candidate.replacements.length,20);
 assert.equal(candidate.successorRoutinePins.filter((p,i)=>p.sha256!==candidate.predecessorRoutinePins[i].sha256).length,20);
 for(let i=0;i<177;i++){const {sha256:a,...before}=candidate.predecessorRoutinePins[i],{sha256:b,...after}=candidate.successorRoutinePins[i];assert.deepEqual(before,after);}
 assert.equal(candidate.sources.length,3);assert.equal(candidate.foreignKeyDelta.length,7);
 assert.deepEqual(candidate.foreignKeyDelta,predecessorCandidate.foreignKeyDelta);
 assert.equal(candidate.tableCount,56);assert.equal(candidate.installationReady,false);
 assert.equal(candidate.reviewedCatalog,false);assert.equal(candidate.engineVerified,false);
 assert.ok(Object.isFrozen(candidate.successorRoutinePins[0]));
});
test('overlap, wrong predecessor, unknown routine and incomplete replacement cohorts fail closed',()=>{
 const r=candidate.replacements,p=candidate.predecessorRoutinePins;
 assert.throws(()=>deriveCombinedPins(p,[...r.slice(1),r[1]]),/EXACT_REPLACEMENT/);
 assert.throws(()=>deriveCombinedPins(p,r.map((v,i)=>i?v:{...v,before_sha256:'0'.repeat(64)})),/PREDECESSOR/);
 assert.throws(()=>deriveCombinedPins(p,r.map((v,i)=>i?v:{...v,signature:'naijue_erp.missing()'})),/MISSING/);
 assert.throws(()=>deriveCombinedPins(p,r.slice(1)),/EXACT_REPLACEMENT/);
});
test('records older balance overlap and unresolved lexical embedded pin occurrences without relaxing them',()=>{
 assert.match(candidate.supersededCandidate.path,/history_balance_rowtype/);
 assert.equal(candidate.supersededCandidate.included,false);
 assert.equal(candidate.supersededCandidate.sameSuccessor,true);
 assert.ok(candidate.embeddedPinOccurrences.some(x=>x.path==='adapters/postgres/src/native-import-accounting-capability.ts'));
 assert.ok(candidate.embeddedPinOccurrences.every(x=>/^[a-f0-9]{64}$/.test(x.sourceSha256)&&x.matches.length));
 assert.equal(candidate.embeddedPinsReconciled,false);
});
test('single blocked transaction holds all three unchanged candidate bodies and preserves safety guards',async()=>{
 const {sql}=await renderFresh56CombinedReview(root);
 assert.equal((sql.match(/^BEGIN ISOLATION LEVEL READ COMMITTED;$/gm)||[]).length,1);
 assert.equal((sql.match(/^BEGIN;$/gm)||[]).length,0);
 assert.equal((sql.match(/^COMMIT;$/gm)||[]).length,1);
 assert.ok(sql.indexOf('FRESH56_COMBINED_REVIEW_ONLY')<sql.indexOf('DO $specialize$'));
 for(const message of ['PUBLICATION_ISOLATION_PREDECESSOR_DIFFERS','CORE_HISTORY_FK_NEW_EMPTY_TARGET_REQUIRED','LEGACY_ROWTYPE_PREDECESSOR_DIFFERS','LEGACY_ROWTYPE_CATALOG_CHANGED'])assert.ok(sql.includes(message));
 assert.doesNotMatch(sql,/DROP TABLE/i);
 const exactBodies=await Promise.all(candidate.sources.map(async pin=>stripPinnedTransaction(await readFile(resolve(root,pin.path),'utf8'),pin.sha256)));
 assert.ok(sql.includes(exactBodies.join('\n')), 'All three unchanged candidate bodies occur contiguously in their exact dependency order');
 for(const body of exactBodies)assert.equal(sql.split(body).length,2, 'Each exact candidate body occurs once');
});
test('installer refuses without touching caller objects',async()=>{
 let touched=0;await assert.rejects(runFresh56CombinedInstall(new Proxy({},{get(){touched++;throw Error('TOUCHED');}})),/FRESH56_COMBINED_REVIEW_ONLY/);assert.equal(touched,0);
});
test('changed candidate bytes are rejected through real loader, without installing or altering original sources',async()=>{
 const {mkdtemp,mkdir,copyFile,appendFile}=await import('node:fs/promises');
 const {tmpdir}=await import('node:os');const {join,dirname}=await import('node:path');
 const {loadWholeCatalogSpec}=await import('../scripts/release/unified-install/whole-catalog-gate.mjs');
 const {FRESH35_SOURCE_PINS}=await import('../scripts/release/unified-install/fresh35-source-route.mjs');
 const spec=await loadWholeCatalogSpec(root),temp=await mkdtemp(join(tmpdir(),'fresh56-candidate-test-'));
 const paths=new Set([...spec.installation_sources.map(x=>x.path),...FRESH35_SOURCE_PINS.map(x=>x.path),...candidate.sources.map(x=>x.path),'adapters/postgres/src/native-import-accounting-capability.ts']);
 for(const path of paths){await mkdir(dirname(join(temp,path)),{recursive:true});await copyFile(join(root,path),join(temp,path));}
 assert.equal((await loadFresh56CombinedCandidate(temp)).sourceSetSha256,candidate.sourceSetSha256);
 await appendFile(join(temp,candidate.sources[2].path),'\n');
 await assert.rejects(loadFresh56CombinedCandidate(temp),/FRESH56_CANDIDATE_SOURCE_CHANGED/);
});
