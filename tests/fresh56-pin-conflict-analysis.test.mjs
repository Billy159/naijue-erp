import test from 'node:test';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
import {analyzeFresh56PinConflicts,inspectPinnedBodyLiterals} from '../scripts/release/unified-install/fresh56-pin-conflict-analysis.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)).replace(/\/$/,'');
const report=await analyzeFresh56PinConflicts(root);
test('all177 exact pinned body contents found, no embedded predecessor hash in those bodies',()=>{
 assert.equal(report.routines.length,177);assert.equal(report.routines.filter(r=>r.predecessorPinLiterals.length).length,0);
 assert.equal(report.lexicalOccurrenceFiles.length,13);assert.equal(report.installationReady,false);
 assert.equal(report.runtimeReachabilityProven,false);assert.equal(report.installedCatalogVerified,false);
});
test('runtime27 flow sources have none of20 old hashes; runtime26 issuer contains11 and remains untouched',()=>{
 assert.deepEqual(report.flowSources.map(s=>s.predecessorPinLiterals.length),[0,0,0,11]);
 for(const source of report.flowSources)assert.match(source.sha256,/^[a-f0-9]{64}$/);
});
test('diagnostic refuses incomplete body coverage or wrong source bytes',()=>{
 const pins=report.routines.map(r=>({signature:r.signature,sha256:r.bodySha256}));
 assert.throws(()=>inspectPinnedBodyLiterals([],pins,[]),/LITERAL_MISSING/);
 assert.throws(()=>inspectPinnedBodyLiterals([{sql:'changed',sha256:'0'.repeat(64)}],pins,[]),/SOURCE_CHANGED/);
 assert.throws(()=>inspectPinnedBodyLiterals([],pins.slice(1),[]),/EXACT_COHORT/);
});
