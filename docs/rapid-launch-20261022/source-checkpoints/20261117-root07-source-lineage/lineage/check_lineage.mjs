/** Check already-derived real metadata, preserving original JSON insertion order. */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const H=resolve('outputs/D1/20261117-r3-root07-source-successor-01');
const sha=b=>createHash('sha256').update(b).digest('hex');
const hash=v=>sha(JSON.stringify(v));
const read=async p=>JSON.parse(await readFile(p));
const project=(v,keys)=>Object.fromEntries(keys.map(k=>[k,v[k]]));
const evidence=[];
const meta=await read(H+'/DERIVED-METADATA.json');
const keys={combined:['format','baseArtifacts','capturedSourcePins','currentSourcePins','currentSourceDelta','patches'],admin154:['format','predecessorSourceSetSha256','currentSourcePins','patchSqlSha256','routineChanges','permissionChanges'],compactZero:['format','predecessorSourceSetSha256','currentSourcePins','patchSqlSha256','routineChanges','permissionChanges']};
const source={},catalog={};
for(const label of ['historical-root06','root07-candidate']){
 source[label]={};catalog[label]={};
 for(const kind of Object.keys(keys)){
  const p=H+'/metadata/'+label+'/source-'+kind+'.json',raw=await readFile(p),v=JSON.parse(raw);
  assert.equal(hash(project(v,keys[kind])),v.sourceSetSha256,kind);
  source[label][kind]=v;evidence.push({path:p.slice(H.length+1),sha256:sha(raw)});
 }
 assert.equal(source[label].admin154.predecessorSourceSetSha256,source[label].combined.sourceSetSha256);
 assert.equal(source[label].compactZero.predecessorSourceSetSha256,source[label].admin154.sourceSetSha256);
 for(const kind of ['compactZero','batched','command']){
  const p=H+'/metadata/'+label+'/catalog-'+kind+'.json',raw=await readFile(p),v=JSON.parse(raw);
  const {catalogSpecSha256,...withoutDigest}=v;assert.equal(hash(withoutDigest),catalogSpecSha256,kind);
  catalog[label][kind]=v;evidence.push({path:p.slice(H.length+1),sha256:sha(raw)});
 }
 assert.equal(catalog[label].compactZero.sourceSetSha256,source[label].compactZero.sourceSetSha256);
 assert.equal(catalog[label].batched.sourceSetSha256,hash({parent:catalog[label].compactZero.sourceSetSha256,pins:{'EXPECTED161-MODEL.json':'4e692cad636a86b4cc3bb3c55874c926e32b79508b846222f32d0d01f3ffed51','EXPECTED161-DEFINITIONS.json':'b3f394b80055f164b2e11449487c3da5c234a510b39dfae73dab8993c0f79216','EXPECTED161-BODIES.json':'a57ed0c0663b913e82f90b0bef4cef51506542c4398bef7330a7f6775ae60942'}}));
 assert.equal(catalog[label].command.sourceSetSha256,hash({parent:catalog[label].batched.sourceSetSha256,reviewSha256:'849288162c8e21036b2b50e1a8ceaf4d5bc5edad2340a679dae488e9e10749f7'}));
}
const old=catalog['historical-root06'],next=catalog['root07-candidate'];
for(const kind of ['compactZero','batched','command']){
 const omit=v=>Object.fromEntries(Object.entries(v).filter(([key])=>!['sourceSetSha256','catalogSpecSha256','observationSqlSha256'].includes(key)));
 assert.deepEqual(omit(old[kind]),omit(next[kind]));
}
const rows=await read(H+'/source-rows.json');assert.equal(rows.length,387);
const stage=await read(H+'/STAGING-CHECKS.json');assert.equal(stage.changed.length,1);
const description=await read(H+'/source-description.json');assert.equal(description.changes.length,1);
assert.equal(description.sourceRowsSha256,sha(await readFile(H+'/source-rows.json')));
assert.equal(description.sourceSetSha256,source['root07-candidate'].compactZero.sourceSetSha256);
const oldSQL=await readFile(H+'/metadata/historical-root06/observationSql.sql','utf8');
const newSQL=await readFile(H+'/metadata/root07-candidate/observationSql.sql','utf8');
assert.equal(newSQL,oldSQL.replaceAll(old.command.sourceSetSha256,next.command.sourceSetSha256));
assert.equal(sha(newSQL),next.command.observationSqlSha256);
assert.equal(await readFile(H+'/metadata/historical-root06/guardSql.sql','utf8'),await readFile(H+'/metadata/root07-candidate/guardSql.sql','utf8'));
const historyPath=resolve('outputs/T45/revisions/20261116-r3-batched161-formal-run-package-local-01/NORMAL35-RUNTIME-01/catalog_update/ACTUAL-CATALOG35-RESULT.json');
const historyRaw=await readFile(historyPath),history=JSON.parse(historyRaw);
assert.equal(sha(historyRaw),'4691772528f237973a6a2b0d636edde1ffcf7916c30db0f55bc0e714dd11547e');
assert.deepEqual(project(old.command,['sourceSetSha256','catalogSpecSha256','modelSha256']),history.result.batchedCatalog);
const report={format:'D1_R3_SOURCE_CATALOG_LINEAGE_V1',state:'STATIC_SOURCE_LINEAGE_PROVED_NOT_LIVE_CATALOG_PASS',historicalTargetSha256:meta.historicalTargetSha256,
 historicalRoot06:{sourceSetSha256:source['historical-root06'].compactZero.sourceSetSha256,sourceRowsSha256:description.predecessorSourceRowsSha256,resultSha256:description.predecessorMaterializationSha256},
 root07:{requestKey:'t45-r3-batched-root07-source-delta-20261117-01',operatorRoot:'/var/lib/naijue-erp/fresh35-production/installed-real-operation-batched-root07-20261117-01/operation',hostOutputDirectory:'/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/installed-real-operation-batched-root07-20261117-01',sourceSetSha256:description.sourceSetSha256,sourceRowsSha256:description.sourceRowsSha256,sourceDescriptionSha256:sha(await readFile(H+'/source-description.json')),sourceFiles:387,changed:description.changes},
 historicalCatalog:history.result.batchedCatalog,currentSourceCatalog:project(next.command,['sourceSetSha256','catalogSpecSha256','modelSha256']),
 historicalCatalogEvidence:{protocolSha256:sha(historyRaw),terminalSha256:history.rootPins.terminal,resultSha256:history.rootPins.result,publicResultSha256:history.publicResultSha256,completionSha256:history.result.completionSha256},
 sourceLayers:Object.fromEntries(Object.entries(source).map(([k,v])=>[k,Object.fromEntries(Object.entries(v).map(([n,o])=>[n,o.sourceSetSha256]))])),
 sourcePathsUnchanged:true,runtimeLeafChanges:1,inheritedUnchangedFiles:386,onlySourceObservationTagChanged:true,modelAndGuardSQLUnchanged:true,descriptorChangesOnly:['sourceSetSha256','observationSqlSha256','catalogSpecSha256'],
 evidence,metadataOperationRequired:false,materializationRuntimeProven:false,nativeCatalogRuntimeProven:false,futureC:null,futureAuthority:null,futureProgramSha256:null};
await writeFile(H+'/SOURCE-CATALOG-LINEAGE.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({state:report.state,source:description.sourceSetSha256,current:report.currentSourceCatalog,leafChanges:1,hash:sha(await readFile(H+'/SOURCE-CATALOG-LINEAGE.json'))}));
