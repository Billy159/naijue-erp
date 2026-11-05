import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {HISTORICAL_SALES_INTEGRATION_PINS,compileWholeSalesIntegrationCandidate,renderWholeSalesIntegrationCandidate} from '../scripts/release/unified-install/whole-sales-integration-candidate.mjs';
import {readWholeClosureIntegrationSources,renderWholeBatchClosureIntegrationCandidate} from '../scripts/release/unified-install/whole-closure-integration-candidate.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
const sources=await readWholeClosureIntegrationSources(root);
const batch=await readFile(resolve(root,'adapters/postgres/patches/0027_standard_whole_closure_batch_binding_candidate.sql'),'utf8');
const sales=Object.fromEntries(await Promise.all(HISTORICAL_SALES_INTEGRATION_PINS.map(async pin=>[pin.name,await readFile(resolve(root,pin.path),'utf8')])));
const candidate=await renderWholeSalesIntegrationCandidate(root),prior=await renderWholeBatchClosureIntegrationCandidate(root);
const strip=sql=>sql.replace(/^BEGIN;\n/m,'').slice(0,-'COMMIT;\n'.length);
const permissions=sql=>sql.match(/^(?:GRANT|REVOKE) .*;$/gm);
test('all five successor bodies remain exact, once, in dependency order under one transaction',()=>{
 const sql=candidate.sql;
 assert.equal((sql.match(/^BEGIN;$/gm)||[]).length,1);assert.equal((sql.match(/^COMMIT;$/gm)||[]).length,1);assert(sql.endsWith('COMMIT;\n'));
 let position=-1;
 for(const source of [sources.closure,batch,sales.profile,sales.missing,sales.restoration,candidate.accessSql]){
  const text=strip(source);assert.equal(sql.split(text).length,2);assert(sql.indexOf(text)>position);position=sql.indexOf(text);
 }
 assert.equal(candidate.manifest.sqlSha256,createHash('sha256').update(sql).digest('hex'));
});
test('access verifier changes only profile-command pin beyond the prior closure pin; permissions are identical',()=>{
 const profile=JSON.parse(sales.profile.split('$source_profile_changes$')[1]);
 assert.equal(candidate.accessSql,prior.accessSql.replace(profile.predecessor_sha256,profile.successor_sha256));
 assert.deepEqual(permissions(candidate.sql),permissions(prior.sql));assert.equal(permissions(candidate.sql).length,10);
 assert.equal(candidate.manifest.permissions.grantStatements,2);assert.equal(candidate.manifest.permissions.revokeStatements,8);
 for(const guard of ['HISTORY_SOURCE_PROFILE_PREDECESSOR_DIFFERS','MISSING_SETTLEMENT_PROOF_DIFFERS','RESTORATION_DEPENDENCY_DIFFERS','RESTORATION_TRIGGER_DIFFERS','RESTORATION_POSTCONDITION_FAILED','WHOLE_INSTALL_ACL_UNSAFE'])assert(candidate.sql.includes(guard));
});
test('exact chain proposals never claim installation or runtime admission',()=>{
 assert.equal(candidate.manifest.routineChanges.length,3);assert.equal(candidate.manifest.predecessorChain.length,5);
 const [missing,restoration]=candidate.manifest.predecessorChain.slice(-2);assert.equal(missing.after,restoration.before);
 for(const key of ['engineExecuted','reviewed','runtimeCatalogAdmitted','installationReady','activeProfilesChanged'])assert.equal(candidate.manifest[key],false,key);
 assert.equal(candidate.catalogPinProposal.sourceSpecSha256,null);assert.equal(candidate.catalogPinProposal.installedCatalogSha256,null);assert.equal(candidate.catalogPinProposal.independentlyReviewed,false);
 assert.equal(candidate.manifest.sourcePins.length,8);
 assert.equal(prior.manifest.sqlSha256,'aa7df2d099845c2f3f177999c08111b46266f0188fd1e674fb66785ff1608a5c');
});
test('every additional exact source pin rejects byte drift, missing or unexpected inputs',()=>{
 for(const {name} of HISTORICAL_SALES_INTEGRATION_PINS){
  assert.throws(()=>compileWholeSalesIntegrationCandidate(sources,batch,{...sales,[name]:sales[name]+'\n'}),/WHOLE_SALES_SOURCE_DIFFERS/);
  const missing={...sales};delete missing[name];assert.throws(()=>compileWholeSalesIntegrationCandidate(sources,batch,missing),/WHOLE_SALES_SOURCE_DIFFERS/);
 }
 assert.throws(()=>compileWholeSalesIntegrationCandidate(sources,batch,{...sales,extra:''}),/WHOLE_SALES_SOURCE_DIFFERS/);
 assert.throws(()=>compileWholeSalesIntegrationCandidate({...sources,kernel:sources.kernel+'\n'},batch,sales),/SOURCE_DIFFERS/);
 assert.throws(()=>compileWholeSalesIntegrationCandidate(sources,batch+'\n',sales),/SOURCE_DIFFERS/);
});
