// Only retained captures and fixed source SQL; no target/source factories or PG.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {applyFresh35Sql39CatalogDelta} from './source/scripts/release/unified-install/fresh35-sql39-catalog-delta.mjs';
process.on('uncaughtException',error=>{process.stderr.write(JSON.stringify({type:error.name,code:error.code,frame:error.stack?.split('\n').find(line=>line.includes('offline-input-regression.mjs:'))})+'\n');process.exit(1)});
const root=resolve(process.argv[2]),base=root+'/scripts/release/unified-install';
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const hash=s=>createHash('sha256').update(s).digest('hex');
const normal=s=>s.replaceAll('pg_catalog.','').replace(/\btimestamp with time zone\b/g,'timestamptz').replace(/\binteger\b/g,'int4').replace(/\bboolean\b/g,'bool').replace(/\bbigint\b/g,'int8').replace(/\s*,\s*/g,',');
const parentPath=base+'/performance155/parents/20261115-r3-root114-final-combination-local-01';
const capture=await read(parentPath+'/PARENT154-CAPTURE.json');
const sql=await readFile(root+'/adapters/postgres/patches/prefix155/01-ten-routines.sql','utf8');
assert.equal(hash(sql),'1f3deac19334fc58b5ace7a9d69fc727110eb64252208b784112dc9f88c37951');
const specs=JSON.parse(sql.split('$body_specs$')[1]);assert.equal(specs.length,10);
const input={model:structuredClone(capture.model),definitions:new Map(capture.functions.map(f=>[normal(f.signature),f.definition])),bodies:new Map(capture.functions.map(f=>[normal(f.signature),f.body]))};
const changed=[];
for(const spec of specs){
 const key=normal(spec.signature),after=input.bodies.get(key);assert.equal(hash(after),spec.afterSha256);
 let before=after;
 for(const [oldText,newText,occurrences=1] of [...spec.replacements].reverse()){
  assert.equal(occurrences,1);assert.equal(before.split(newText).length,2);
  before=before.replace(newText,()=>oldText);
 }
 assert.equal(hash(before),spec.beforeSha256);
 const definition=input.definitions.get(key);assert.equal(definition.split(after).length,2);
 const originalDefinition=definition.replace(after,()=>before);
 input.bodies.set(key,before);input.definitions.set(key,originalDefinition);
 const row=input.model.routines.find(r=>normal(r.signature)===key);
 row.bodySha256=hash(before);row.definitionSha256=hash(originalDefinition);
 changed.push({signature:key,beforeSha256:spec.beforeSha256,afterSha256:spec.afterSha256});
}
const {derivePerformance155:deriveRoot}=await import(pathToFileURL(parentPath+'/derive155.mjs'));
let failure;
try{deriveRoot(input)}catch(error){failure=error}
assert.equal(failure?.code,'ERR_ASSERTION');
assert.ok(failure.stack.includes('derive155.mjs:41:10'));
const snapshot=JSON.stringify(input.model),definitionSnapshot=[...input.definitions],bodySnapshot=[...input.bodies];
const sql39=applyFresh35Sql39CatalogDelta(input,specs);
assert.deepEqual(sql39.model,capture.model);
assert.equal(JSON.stringify(input.model),snapshot);
assert.deepEqual([...input.definitions],definitionSnapshot);assert.deepEqual([...input.bodies],bodySnapshot);
for(const [key,value]of Object.entries(input.model))if(key!=='routines')assert.deepEqual(sql39.model[key],value);
const {derivePerformance155}=await import(pathToFileURL(base+'/performance155/derive155.mjs'));
const actual=derivePerformance155(sql39);
const final=await read(base+'/performance155/FINAL155-CAPTURE.json');
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const modelRows=model=>Object.fromEntries(Object.entries(model).map(([key,value])=>[key,Array.isArray(value)?value.map(row=>JSON.stringify(canonical(row))).sort():canonical(value)]));
assert.deepEqual(modelRows(actual.model),modelRows(final.model));
for(const f of final.functions){
 const key=normal(f.signature);assert.equal(actual.definitions.get(key),f.definition);assert.equal(actual.bodies.get(key),f.body);
}
assert.equal(actual.definitions.size,155);assert.equal(actual.bodies.size,155);
// The live production compiler remaps these same two role identities.
const roles={fresh35_owner_20261105_r1:'erp35_owner_20261110_r3',fresh35_controller_20261105_r1:'erp35_controller_20261110_r3'};
const remap=v=>Array.isArray(v)?v.map(remap):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>{const m=remap(x);return [k,k==='acl'&&Array.isArray(m)?m.sort():m]})):typeof v==='string'?(roles[v]??v.replace(/^([^=]*)=([^/]*)\/(.+)$/,(all,g,p,o)=>(roles[g]??g)+'='+p+'/'+(roles[o]??o))):v;
const production={...input,model:remap(input.model)};
const productionResult=derivePerformance155(applyFresh35Sql39CatalogDelta(production,specs),roles);
assert.deepEqual(modelRows(productionResult.model),modelRows(remap(final.model)));
const result={state:'OFFLINE_REAL_CAPTURE_RED_THEN_CORRECT_COMBINATION_PASS',node:process.version,unfixedFailure:{type:failure.name,code:failure.code,source:'DERIVE_ROOT114',line:41,column:10},retained154IsAfterSql39:10,restoredInputBeforePinsMatched:10,changed,sql39ResultEqualsRetainedParent154:true,corrected155EqualsFixedFinalModelByCanonicalRows:true,preservedInputModelOrderRatherThanNativeCaptureRowOrder:true,corrected155DefinitionsAndBodiesExact:155,productionRoleMappingMatchesFixedFinal:true,inputUnmodified:true,nonRoutineCategoriesUnmodifiedBySql39:true,genuineFactoryCalls:0,postgresConnections:0,serverActions:0};
await writeFile(new URL('./OFFLINE-RESULT.json',import.meta.url),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
process.stdout.write(JSON.stringify({state:result.state,unfixedFailure:result.unfixedFailure,corrected155DefinitionsAndBodiesExact:155,productionRoleMappingMatchesFixedFinal:true})+'\n');
