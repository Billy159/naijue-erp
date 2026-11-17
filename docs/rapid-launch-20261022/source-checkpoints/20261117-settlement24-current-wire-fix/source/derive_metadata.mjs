/** Pure SOURCE derivation using the real historical target, never runtime authority. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const HERE=resolve('outputs/D1/20261117-r3-settlement24-current-wire-fix-source-01');
const BASE=resolve('outputs/D1/20261117-r3-root07-source-successor-01');
const OP=join(HERE,'operation');
const sha=raw=>createHash('sha256').update(raw).digest('hex');
const save=async(path,value)=>{await mkdir(resolve(path,'..'),{recursive:true});await writeFile(path,JSON.stringify(value,null,2)+'\n')};
let clockCalls=0;
Date.now=()=>{clockCalls++;throw Error('CURRENT_CLOCK_FORBIDDEN_IN_SOURCE_DERIVATION')};
const moduleAt=path=>import(pathToFileURL(join(OP,'scripts/release/unified-install',path)));
const src=await moduleAt('fresh35-combined-source-v1.mjs');
const cat=await moduleAt('fresh35-combined-catalog-v1.mjs');
const targets=await moduleAt('fresh35-combined-target-v1.mjs');
const actualPath=resolve('outputs/T45/revisions/20261110-r3-installed-proof-result-01/fresh35-production-facts-result.json');
const actualRaw=await readFile(actualPath),actual=JSON.parse(actualRaw);
assert.equal(actual.status,'DURABLE_PRODUCTION_SHARED_NAMESPACE_FACTS_NOT_DEPLOYMENT_APPROVAL');
const input=actual.creationFacts.target;
const target=targets.bindFresh35CombinedProductionTargetV2(input,input.startsAt);
const description=targets.describeFresh35CombinedTarget(target);
assert.equal(sha(JSON.stringify(description)),actual.programBinding.targetSha256);
assert.equal(sha(JSON.stringify(description)),'fe0b2fe570382453f27def1c9d92eac8fc2fb5b37fc51f096a1a8c912bc28168');
const refs=resolve('outputs/T45/revisions/20261115-r3-batched-carrier-prep-local-01/materials/reference-inputs');
const paths=await src.resolveFresh35ReferenceInputPaths(refs);
const source=await src.loadFresh35CompactZeroSource(OP,paths);
const admin=src.fresh35CompactZeroSourceData(source).base;
const combined=src.fresh35Admin154SourceData(admin).base;
const sources={combined:src.describeFresh35CombinedSource(combined),admin154:src.describeFresh35CombinedSource(admin),compactZero:src.describeFresh35CombinedSource(source)};
const compact=await cat.buildFresh35CompactZeroCatalog(source,target,paths);
const batched=await cat.buildFresh35BatchedCatalogV1(source,target,compact);
const command=await cat.buildFresh35BatchedCommandSuccessorCatalogV1(source,target,batched);
const successor=await cat.buildFresh35Settlement24CurrentWireCatalogV1(source,target,command);
const catalogs=Object.fromEntries(Object.entries({compactZero:compact,batched,command,settlement24:successor}).map(([k,v])=>[k,cat.describeFresh35CombinedCatalog(v)]));
const sql=cat.fresh35CombinedCatalogSql(successor,source,target);
for(const [name,value]of Object.entries(sources))await save(join(HERE,'metadata','source-'+name+'.json'),value);
for(const [name,value]of Object.entries(catalogs))await save(join(HERE,'metadata','catalog-'+name+'.json'),value);
for(const [name,text]of Object.entries(sql))await writeFile(join(HERE,'metadata',name+'.sql'),text);
const previous=JSON.parse(await readFile(join(BASE,'metadata/root07-candidate/source-compactZero.json')));
const beforePins=new Map(previous.currentSourcePins.map(x=>[x.path,x.sha256]));
const changed=sources.compactZero.currentSourcePins.filter(x=>beforePins.has(x.path)&&beforePins.get(x.path)!==x.sha256);
const added=sources.compactZero.currentSourcePins.filter(x=>!beforePins.has(x.path));
const expectedChanged=['scripts/release/unified-install/fresh35-combined-source-v1.mjs','scripts/release/unified-install/fresh35-combined-catalog-v1.mjs','tools/unified-import/fresh35-host-session.mjs'];
assert.deepEqual(changed.map(x=>x.path).sort(),expectedChanged.sort());
assert.equal(added.length,5);
const oldRowsRaw=await readFile(join(BASE,'source-rows.json'));
assert.equal(sha(oldRowsRaw),'74de5cbfd7315fbfa28be3f42087cb187709b16a0685dcca3a24ae1e66c3813e');
const oldRows=JSON.parse(oldRowsRaw),nextRows=[];
for(const row of oldRows){
 const bytes=await readFile(join(OP,row.path)),pin={bytes:bytes.length,path:row.path,sha256:sha(bytes)};
 if(!expectedChanged.includes(row.path))assert.deepEqual(pin,row);
 nextRows.push(pin);
}
for(const item of added){const bytes=await readFile(join(OP,item.path));nextRows.push({bytes:bytes.length,path:item.path,sha256:sha(bytes)});}
assert.equal(nextRows.length,392);
await save(join(HERE,'source-rows.json'),nextRows);
const predecessor=JSON.parse(await readFile(join(BASE,'metadata/root07-candidate/catalog-command.json')));
assert.equal(catalogs.command.modelSha256,predecessor.modelSha256);
assert.notEqual(catalogs.settlement24.modelSha256,predecessor.modelSha256);
const report={format:'D1_SETTLEMENT24_CURRENT_WIRE_SOURCE_METADATA_V1',state:'SOURCE_ONLY_NOT_INSTALLED_OR_RUNTIME_READY',
 historicalTarget:{path:actualPath,sha256:sha(actualRaw),targetSha256:sha(JSON.stringify(description)),usedForMetadataOnly:true},
 predecessorSourceRowsSha256:sha(oldRowsRaw),sourceRowsSha256:sha(await readFile(join(HERE,'source-rows.json'))),sourceFiles:392,
 changed,added,sourceSetSha256:sources.compactZero.sourceSetSha256,sourceLayers:Object.fromEntries(Object.entries(sources).map(([k,v])=>[k,v.sourceSetSha256])),
 catalog:catalogs.settlement24,predecessorCatalog:predecessor,guardSqlSha256:sha(sql.guardSql),observationSqlSha256:sha(sql.observationSql),
 SQLModelChanged:true,oldSourceLineageDoesNotProveNewSQLInstalled:true,clockCalls,nativeCalls:0,PGConnections:0,
 authorityIssued:false,futureC:null,futureEpoch:null,executionReady:false};
assert.equal(clockCalls,0);
await save(join(HERE,'DERIVED-METADATA.json'),report);
console.log(JSON.stringify({state:report.state,sourceSetSha256:report.sourceSetSha256,catalog:report.catalog,rows:report.sourceRowsSha256}));
