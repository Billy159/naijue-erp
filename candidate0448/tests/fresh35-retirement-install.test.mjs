import test from 'node:test';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
import {createFresh35RetirementTargetGuard,loadFresh35MigrationLineage} from '../scripts/release/unified-install/fresh35-retirement-install.mjs';
const target={database_name:'synthetic_fresh35_test_20261104',database_oid:'16390',system_identifier:'7580000000000000001',owner:'synthetic_owner',server_version_num:'170011'};
test('new target guard binds physical identity, ordinary owner and empty schema without connecting',()=>{
 const sql=createFresh35RetirementTargetGuard(target);
 for(const value of Object.values(target))assert.ok(sql.includes(value));
 for(const marker of ['pg_control_system','current_user=session_user','nspname=\'naijue_erp\'','rolsuper','rolcreaterole','rolbypassrls','pg_event_trigger','pg_extension'])assert.ok(sql.includes(marker));
 assert.doesNotMatch(sql,/\b(?:DROP|TRUNCATE|CREATE ROLE|ALTER ROLE)\b/i);
});
test('target validator refuses normal databases, ambiguous identity and SQL injection',()=>{
 for(const change of [{database_name:'postgres'},{database_name:'production'},{database_oid:'0'},{system_identifier:'not-an-id'},{owner:"owner'; SELECT 1; --"},{server_version_num:'180001'},{extra:true}])assert.throws(()=>createFresh35RetirementTargetGuard({...target,...change}),/TARGET/);
});
test('fresh schema lineage derives exactly27 descriptions from their pinned migration sources',async()=>{
 const result=await loadFresh35MigrationLineage(fileURLToPath(new URL('../',import.meta.url)));
 assert.equal(result.rows.length,27);assert.deepEqual(result.rows.map(row=>row.version),Array.from({length:27},(_,i)=>i+1));
 assert.equal((result.sql.match(/INSERT INTO naijue_erp.schema_migration/g)||[]).length,27);
 assert.doesNotMatch(result.sql,/applied_at|DELETE|TRUNCATE|UPDATE naijue_erp/i);
 assert.ok(result.rows.every(row=>row.description.length>0&&/^[a-f0-9]{64}$/.test(row.sourceSha256)));
});

import {loadFresh35RetirementPlan} from '../scripts/release/unified-install/fresh35-retirement-plan.mjs';
import {renderFresh35RetirementInstall} from '../scripts/release/unified-install/fresh35-retirement-install.mjs';
import {createHash} from 'node:crypto';
const hash=value=>createHash('sha256').update(value).digest('hex');
test('source-model wrapper refuses missing complete catalog evidence instead of body-only installation',async()=>{
 const root=fileURLToPath(new URL('../',import.meta.url));
 await assert.rejects(()=>renderFresh35RetirementInstall(root,{dump:'',dumpSha256:hash(''),target}),/FRESH35_COMPLETE_POSTCONDITION_EVIDENCE_REQUIRED/);
});

import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const evidenceDirectory=process.env.FRESH35_PREDECESSOR_EVIDENCE_DIR;
test('pinned real-dump wrapper includes complete metadata guards inside one transaction and records all helper sources',{skip:!evidenceDirectory},async()=>{
 const root=fileURLToPath(new URL('../',import.meta.url)),plan=await loadFresh35RetirementPlan(root);
 const dump=await readFile(resolve(evidenceDirectory,'schema178-naijue-erp.sql'),'utf8');
 const identityMapping={owner:{source:'schema178_owner_20261104_1710',target:'fresh35_owner_20261104_r1'},controller:{source:'schema178_controller_20261104_1710',target:'fresh35_controller_20261104_r1'}};
 const input={dump,dumpSha256:hash(dump),predecessorSourceSpecSha256:plan.predecessorSourceSpecSha256,target:{...target,owner:identityMapping.owner.target},identityMapping,postconditionEvidenceDirectory:evidenceDirectory};
 const output=await renderFresh35RetirementInstall(root,input);
 assert.equal((output.sql.match(/^BEGIN ISOLATION LEVEL READ COMMITTED;$/gm)||[]).length,1);
 assert.equal((output.sql.match(/^COMMIT;$/gm)||[]).length,1);assert.ok(output.sql.endsWith('COMMIT;\n'));
 assert.ok(output.sql.indexOf('FRESH35_EMPTY_DATABASE_REQUIRED')<output.sql.indexOf('CREATE SCHEMA'));
 for(const marker of ['FRESH35_COMPLETE_ROUTINE_METADATA_DIFFERS','FRESH35_COMPLETE_SCHEMA_ACL_DIFFERS','FRESH35_COMPLETE_CONSTRAINTS_DIFFER','FRESH35_COMPLETE_INDEXES_DIFFER','FRESH35_COMPLETE_TRIGGERS_DIFFER','FRESH35_COMPLETE_SEQUENCES_DIFFER','FRESH35_COMPLETE_COLUMNS_DIFFER','FRESH35_COMPLETE_POLICIES_DIFFER'])assert.ok(output.sql.includes(marker),marker);
 assert.equal(output.lineage.length,27);assert.equal(output.connectionsOpened,0);assert.equal(output.engineVerified,false);assert.equal(output.installationReady,false);assert.equal(output.sha256,hash(output.sql));
 assert.equal(output.identityMapping.bodyHashesBefore.length,152);assert.equal(output.identityMapping.privilegeKindsAndGrantOptionsChanged,false);
 assert.equal(output.postconditions.completeMetadataGuardSource,true);assert.equal(output.postconditions.sourceSchemaSha256,output.schemaSha256);
 for(const name of ['fresh35-retirement-install','fresh35-retirement-identity','fresh35-retirement-metadata','fresh35-catalog-postconditions']){
  const path='scripts/release/unified-install/'+name+'.mjs',pin=output.installationSourcePins.find(row=>row.path===path);
  assert.ok(pin,path);assert.equal(pin.sha256,hash(await readFile(resolve(root,path))));
 }
 assert.equal(output.installationSourceSetSha256,hash(JSON.stringify(output.installationSourcePins)));
 await assert.rejects(()=>renderFresh35RetirementInstall(root,{...input,target:{...input.target,owner:'other_owner'}}),/MAPPED_OWNER_TARGET_DIFFERS/);
 await assert.rejects(()=>renderFresh35RetirementInstall(root,{...input,identityMapping:undefined}),/EXPLICIT_IDENTITY_MAPPING_REQUIRED/);
 const drift=dump.replace('SECURITY DEFINER','SECURITY INVOKER');assert.notEqual(drift,dump);
 await assert.rejects(()=>renderFresh35RetirementInstall(root,{...input,dump:drift,dumpSha256:hash(drift)}),/PINNED_DUMP_REQUIRED/);
});

import * as installer from '../scripts/release/unified-install/fresh35-retirement-install.mjs';
import {mkdtemp,mkdir,writeFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,relative} from 'node:path';
test('installation source pins include every local static renderer import, including runtime and conservative type dependencies',async()=>{
 const root=fileURLToPath(new URL('../',import.meta.url)),plan=await loadFresh35RetirementPlan(root);
 const result=await installer.loadFresh35InstallationSourcePins(root,plan),pins=new Map(result.pins.map(pin=>[pin.path,pin.sha256]));
 const queue=['scripts/release/unified-install/fresh35-retirement-install.mjs'],seen=new Set();
 for(let i=0;i<queue.length;i++){
  const path=queue[i];if(seen.has(path))continue;seen.add(path);
  const source=await readFile(resolve(root,path),'utf8');assert.equal(pins.get(path),hash(source),'Unpinned local renderer dependency: '+path);
  // Independent finite-tree regression scan, not a general JS security parser.
  for(const match of source.matchAll(/\b(?:import|export)\s+(?:[^;]*?\s+from\s*)?["'](\.[^"']+)["']/g)){
   const raw=resolve(root,dirname(path),match[1]);let found;
   for(const candidate of [raw,raw.replace(/\.js$/,'.ts'),raw.replace(/\.mjs$/,'.mts')])try{if((await stat(candidate)).isFile()){found=candidate;break;}}catch{}
   assert.ok(found,'Unresolved local dependency: '+match[1]);const next=relative(root,found);assert.ok(!next.startsWith('../'));queue.push(next);
  }
 }
 assert.ok(seen.size>=43);assert.ok(pins.has('scripts/release/unified-install/whole-closure-integration-candidate.mjs'));
 assert.ok(pins.has('packages/application/src/unified-historical-staff-hall-approval.ts'));assert.equal(result.sha256,hash(JSON.stringify(result.pins)));
 const temp=await mkdtemp(resolve(tmpdir(),'fresh35-source-pins-'));
 try{
  for(const pin of result.pins){const to=resolve(temp,pin.path);await mkdir(dirname(to),{recursive:true});await writeFile(to,await readFile(resolve(root,pin.path)));}
  const path='scripts/release/unified-install/whole-closure-integration-candidate.mjs';await writeFile(resolve(temp,path),(await readFile(resolve(temp,path),'utf8'))+'\n// source pin regression only\n');
  const changed=await installer.loadFresh35InstallationSourcePins(temp,plan);assert.notEqual(changed.sha256,result.sha256);assert.notEqual(changed.pins.find(pin=>pin.path===path).sha256,pins.get(path));
 }finally{await rm(temp,{recursive:true,force:true});}
});
