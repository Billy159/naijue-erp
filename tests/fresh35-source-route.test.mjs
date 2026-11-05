import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {FRESH35_SOURCE_PROFILE as profile,FRESH35_SOURCE_PINS as pins,selectFresh35SourceRoute,verifyFresh35SourceSet,loadFresh35SourceRoute,describeFresh35SourceRoute,runFresh35Install} from '../scripts/release/unified-install/fresh35-source-route.mjs';
const sourceRoot=fileURLToPath(new URL('..',import.meta.url)).replace(/\/$/,'');
const sources=await Promise.all(pins.map(async p=>({path:p.path,bytes:await readFile(new URL('../'+p.path,import.meta.url))})));
test('default stays on old route; unknown or implicit opt in rejected',()=>{
 assert.equal(selectFresh35SourceRoute().route,'EXISTING_INSTALLER_UNCHANGED');
 for(const p of [null,'',true,'FRESH35',{}]) assert.throws(()=>selectFresh35SourceRoute(p));
 assert.equal(selectFresh35SourceRoute(profile).installationReady,false);
});
test('exact seventy input source route, never a 35 table installation claim',async()=>{
 const d=describeFresh35SourceRoute(await loadFresh35SourceRoute({sourceRoot,profile}));
 assert.equal(d.sources.length,70);assert.equal(d.reviewStages[0].paths.length,67);
 assert.equal(d.reviewStages[1].replacements.length,9);assert.equal(d.reviewStages[2].oldEdges,7);
 assert.equal(d.predecessor.tableCount,56);assert.equal(d.target.desiredTableCount,35);assert.equal(d.target.implementedTableCount,null);
 for(const k of ['installationReady','targetAdmitted','engineVerified','oldTablesRemoved','existingProfilesChanged','executableSqlProvided']) assert.equal(d[k],false);
 assert.ok(Object.isFrozen(d.reviewStages[1].replacements[0]));assert.equal(d.prerequisites.length,5);
});
test('missing, extra and reordered sources rejected',()=>{
 for(const s of [sources.slice(1),[...sources,sources[0]],[sources[1],sources[0],...sources.slice(2)]]) assert.throws(()=>verifyFresh35SourceSet(s));
});
test('every individual source byte is pinned',()=>{
 for(let i=0;i<sources.length;i++){const changed=sources.map((s,j)=>i===j?{...s,bytes:Buffer.concat([s.bytes,Buffer.from('\n')])}:s);assert.throws(()=>verifyFresh35SourceSet(changed),/SOURCE_PIN_MISMATCH/);}
 assert.equal(verifyFresh35SourceSet(sources),true);
});
test('caller cannot self attest installation readiness or supply a database client',async()=>{
 for(const extra of [{installationReady:true},{client:{}},{catalogPassed:true}]) await assert.rejects(loadFresh35SourceRoute({sourceRoot,profile,...extra}),/CLOSED_OPTIONS/);
 await assert.rejects(loadFresh35SourceRoute({sourceRoot,profile:undefined}),/EXPLICIT_SOURCE_PROFILE/);
 assert.throws(()=>describeFresh35SourceRoute({profile}),/GENUINE/);
});
test('install fails before touching client or any supplied option',async()=>{
 let touched=0;const poison=new Proxy({}, {get(){touched++;throw Error('TOUCHED');}});
 await assert.rejects(runFresh35Install(poison),{code:'FRESH35_INSTALL_PREREQUISITES_UNIMPLEMENTED'});assert.equal(touched,0);
});
test('candidates remain outside current installer registry',async()=>{
 const {WHOLE_INSTALL_PATCHES}=await import('../scripts/release/unified-install/render-whole-package-local.mjs');
 for(const p of pins.slice(67)) assert.ok(!WHOLE_INSTALL_PATCHES.includes(p.path.split('/').at(-1)));
});
test('first 67 pins stay aligned with the existing installer order',async()=>{
 const {loadFresh27Plan,describeFresh27Plan,FRESH27_PROFILE}=await import('../scripts/release/unified-install/fresh27-plan.mjs');
 const {WHOLE_INSTALL_PATCHES}=await import('../scripts/release/unified-install/render-whole-package-local.mjs');
 const baseline=describeFresh27Plan(await loadFresh27Plan({sourceRoot,profile:FRESH27_PROFILE}));
 const expected=[...baseline.graph.map(p=>p.path),...WHOLE_INSTALL_PATCHES.map(p=>'adapters/postgres/patches/'+p),'adapters/postgres/patches/0027_document_specification_barcodes_permissions.psql','adapters/postgres/patches/0027_product_maintenance_permissions.psql'];
 assert.deepEqual(pins.slice(0,67).map(p=>p.path),expected);
 assert.deepEqual(pins.slice(0,48).map(p=>p.sha256),baseline.graph.map(p=>p.sha256));
});
