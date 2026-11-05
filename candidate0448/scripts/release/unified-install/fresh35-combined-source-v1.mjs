/** Additive current-source layer over the immutable r2 35-table projection.
 * Captured source and later source deltas are deliberately separate. No old
 * reviewed loader, fixed refusal, installation record or source pin is edited. */
import {readFile,lstat,realpath} from 'node:fs/promises';
import {resolve,dirname,relative,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {mapFresh35RetirementIdentities} from './fresh35-retirement-identity.mjs';
const sources=new WeakMap();
export const combinedSha256=value=>createHash('sha256').update(value).digest('hex');
const hash=combinedSha256,need=(ok,code)=>{if(!ok)throw Error('FRESH35_COMBINED_'+code)};
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value)}return value};
const ownPath='scripts/release/unified-install/fresh35-combined-source-v1.mjs',ownHash=hash(await readFile(new URL(import.meta.url)));
export const FRESH35_COMBINED_BASE_ARTIFACTS=Object.freeze({
 '00-BLOCKED-entry.sql':'0741b94139b125637f5f81b784b5229ec4537904ef93639aced8129f2a38ea0c',
 '01-schema-REVIEW-ONLY.sql':'5fc8508ea96062898a42dc4c03c3a6ebe166158037cc6c7c3130a13d3ee14931',
 '02-lineage-REVIEW-ONLY.sql':'8785f1e225335caaf5777e477c761889b290d8543a4952cd897afff920df51d9',
 'candidate-source-pins.json':'0d018a1dff6f26e81be64892f5af596fa2a3ad9f15be654acf44acb463dc4d51',
 'expected-core-metadata.json':'2e2af3c2b8fa7460e2842e08d906bfee1114dd6c8d7d907ed5c3ed1e1c5ae480',
 'expected-declared-metadata.json':'3056cd7d6a36c6d08b712d2084d435807f448d9a7af2149ea723b40659efa47e',
 'migration-lineage.json':'11290c3de0b9f1711f748643091e1c14f44f83006b6b8991fa5fd12daf61abad',
});
async function regularFile(root,path){
 const full=resolve(root,path);need(full.startsWith(root+sep)&&await realpath(full)===full,'REGULAR_SOURCE_PATH_REQUIRED');
 const stat=await lstat(full);need(stat.isFile()&&!stat.isSymbolicLink()&&stat.size>0&&stat.size<=16*1024*1024,'BOUNDED_SOURCE_FILE_REQUIRED');
 return readFile(full);
}
/** The two pg_dump restrict markers are client state, not SQL. No SQL gate or
 * condition is removed. Unknown client commands are refused. */
export function fresh35DumpSqlForNativeClient(dump){
 need(typeof dump==='string','DUMP_TEXT_REQUIRED');
 const commands=dump.split('\n').filter(line=>line.startsWith('\\'));
 need(commands.length===2&&/^\\restrict [A-Za-z0-9]+$/.test(commands[0])&&commands[1]===commands[0].replace('\\restrict','\\unrestrict'),'EXACT_DUMP_RESTRICT_PAIR_REQUIRED');
 return dump.replace(/^\\(?:un)?restrict [A-Za-z0-9]+\n/gm,'');
}
/** Patches are independently pinned sources. Only their outer transaction is
 * absorbed into the combination; inner DO blocks and every guard remain. */
export function fresh35PatchTransactionBody(sql){
 need(typeof sql==='string'&&(sql.match(/^BEGIN(?: ISOLATION LEVEL READ COMMITTED)?;$/gm)||[]).length===1&&(sql.match(/^COMMIT;$/gm)||[]).length===1&&sql.endsWith('COMMIT;\n')&&!/^\s*\\/m.test(sql),'EXACT_PATCH_TRANSACTION_REQUIRED');
 return sql.replace(/^BEGIN(?: ISOLATION LEVEL READ COMMITTED)?;\n/m,'').slice(0,-'COMMIT;\n'.length);
}
async function importClosure(root,paths){
 const queue=[...paths],seen=new Set(),pins=[];
 while(queue.length){
  const path=queue.shift();if(seen.has(path))continue;seen.add(path);
  const bytes=await regularFile(root,path);pins.push({path,sha256:hash(bytes)});
  if(!/\.(?:mjs|js|ts|mts)$/.test(path))continue;
  const text=bytes.toString('utf8');
  for(const m of text.matchAll(/(?:\b(?:import|export)\s+(?:[^;\n]*?\s+from\s*)?|\bimport\s*\()\s*['"](\.[^'"]+)['"]/g)){
   const dependency=resolve(root,dirname(path),m[1]);need(dependency.startsWith(root+sep),'LOCAL_IMPORT_ESCAPES_SOURCE_ROOT');
   queue.push(relative(root,dependency).split(sep).join('/'));
  }
 }
 return pins.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
}
export async function loadFresh35CombinedSource(root,{baselineDirectory}){
 root=resolve(root);need(await realpath(root)===root&&hash(await regularFile(root,ownPath))===ownHash,'RUNNING_SOURCE_MODULE_DIFFERS');
 need(typeof baselineDirectory==='string'&&resolve(baselineDirectory)===baselineDirectory&&await realpath(baselineDirectory)===baselineDirectory,'CANONICAL_BASE_DIRECTORY_REQUIRED');
 const artifacts={};for(const [name,sha] of Object.entries(FRESH35_COMBINED_BASE_ARTIFACTS)){
  const bytes=await regularFile(baselineDirectory,name);need(hash(bytes)===sha,'IMMUTABLE_BASE_ARTIFACT_DIFFERS:'+name);artifacts[name]=bytes.toString('utf8');
 }
 const oldPins=JSON.parse(artifacts['candidate-source-pins.json']);need(oldPins.length===180&&new Set(oldPins.map(p=>p.path)).size===180,'EXACT_BASE_SOURCE_PINS_REQUIRED');
 const hallPath='scripts/release/unified-install/fresh35-sales-hall-candidate.mjs';
 const amountPath='scripts/release/unified-install/fresh35-historical-amount-candidate.mjs';
 const hallModule=await import(pathToFileURL(resolve(root,hallPath)).href),amountModule=await import(pathToFileURL(resolve(root,amountPath)).href);
 need(typeof hallModule.loadFresh35SalesHallCandidate==='function'&&typeof amountModule.loadFresh35HistoricalAmountCandidate==='function','CURRENT_SUCCESSOR_MODULES_REQUIRED');
 const hall=await hallModule.loadFresh35SalesHallCandidate(root),amount=await amountModule.loadFresh35HistoricalAmountCandidate(root);
 const patches=[{name:'historical-sales-hall',...hall},{name:'historical-line-amount',...amount}];
 for(const patch of patches)need(typeof patch.patchSql==='string'&&Array.isArray(patch.manifest?.sourcePins)&&Array.isArray(patch.manifest?.routineChanges),'EXACT_SUCCESSOR_DESCRIPTOR_REQUIRED');
 const entryPaths=[ownPath,hallPath,amountPath,'package.json','package-lock.json','scripts/release/unified-install/launch-fresh35-isolated-v1.py','scripts/release/unified-install/fresh35-isolated-entry-v1.mjs',...['target','lifecycle','record','catalog'].map(n=>'scripts/release/unified-install/fresh35-combined-'+n+'-v1.mjs')];
 const pins=await importClosure(root,[...oldPins.map(p=>p.path),...entryPaths,...patches.flatMap(p=>p.manifest.sourcePins.map(pin=>pin.path))]);
 for(const patch of patches)for(const pin of patch.manifest.sourcePins)need(pins.some(p=>p.path===pin.path&&p.sha256===pin.sha256),'SUCCESSOR_SOURCE_PIN_DIFFERS:'+pin.path);
 const oldMap=new Map(oldPins.map(p=>[p.path,p.sha256]));
 const delta=pins.filter(p=>oldMap.get(p.path)!==p.sha256).map(p=>({path:p.path,predecessorSha256:oldMap.get(p.path)??null,currentSha256:p.sha256}));
 const schema=artifacts['01-schema-REVIEW-ONLY.sql'],core=JSON.parse(artifacts['expected-core-metadata.json']),declarations=JSON.parse(artifacts['expected-declared-metadata.json']);
 need(declarations.tables.length===35&&core.routines.length===152&&!declarations.tables.some(t=>t.name==='history_sales_header'),'EXACT_BASE35_REQUIRED');
 const binding={format:'FRESH35_COMBINED_CURRENT_SOURCE_V1',baseArtifacts:FRESH35_COMBINED_BASE_ARTIFACTS,capturedSourcePins:oldPins,currentSourcePins:pins,currentSourceDelta:delta,patches:patches.map(p=>({name:p.name,sqlSha256:hash(p.patchSql),manifest:p.manifest}))};
 const source=freeze({...binding,sourceSetSha256:hash(JSON.stringify(binding)),capturedEvidenceAppliesToCurrentChanges:false,engineVerified:false,installationReady:false});
 const token=Object.freeze({profile:'FRESH35_COMBINED_CURRENT_SOURCE_V1'});
 sources.set(token,{root,baselineDirectory,source,artifacts,schema,core,declarations,patches});
 await assertFresh35CombinedSourcesCurrent(token);return token;
}
export function describeFresh35CombinedSource(token){need(sources.has(token),'GENUINE_SOURCE_REQUIRED');return sources.get(token).source}
export function fresh35CombinedSourceData(token){describeFresh35CombinedSource(token);const s=sources.get(token);return freeze({root:s.root,baselineDirectory:s.baselineDirectory,schema:s.schema,core:s.core,declarations:s.declarations,lineageSql:s.artifacts['02-lineage-REVIEW-ONLY.sql'],lineage:JSON.parse(s.artifacts['migration-lineage.json']),patches:s.patches})}
export async function assertFresh35CombinedSourcesCurrent(token){
 const descriptor=describeFresh35CombinedSource(token),s=sources.get(token);
 for(const pin of descriptor.currentSourcePins)need(hash(await regularFile(s.root,pin.path))===pin.sha256,'CURRENT_SOURCE_CHANGED:'+pin.path);
 for(const [name,sha] of Object.entries(FRESH35_COMBINED_BASE_ARTIFACTS))need(hash(await regularFile(s.baselineDirectory,name))===sha,'IMMUTABLE_BASE_ARTIFACT_DIFFERS:'+name);
 return descriptor;
}
export function renderFresh35CombinedSchema(token,target){
 const s=fresh35CombinedSourceData(token);need(target&&typeof target.owner==='string'&&typeof target.controller==='string','EXPLICIT_TARGET_ROLES_REQUIRED');
 const unchanged=target.owner==='fresh35_owner_20261105_r1'&&target.controller==='fresh35_controller_20261105_r1';
 const mapped=unchanged?{sql:s.schema,sha256:hash(s.schema),mapping:{owner:{source:target.owner,target:target.owner},controller:{source:target.controller,target:target.controller}}}:mapFresh35RetirementIdentities(s.schema,{owner:{source:'fresh35_owner_20261105_r1',target:target.owner},controller:{source:'fresh35_controller_20261105_r1',target:target.controller}});
 return freeze({schemaSql:fresh35DumpSqlForNativeClient(mapped.sql),lineageSql:s.lineageSql,patchBodies:s.patches.map(p=>({name:p.name,sql:fresh35PatchTransactionBody(p.patchSql)})),identityMapping:mapped.mapping,schemaSha256:mapped.sha256});
}
