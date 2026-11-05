/** Source definition bundle, deliberately NOT a fabricated live catalog. */
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {unifiedInstallPlanData,describeUnifiedInstallPlan,assertUnifiedInstallSources,sourceFile,ROOT,hash,freeze,need} from './source-plan.mjs';
export async function writeTargetSourceBundle(plan,directory){
 const s=unifiedInstallPlanData(plan);need(path.isAbsolute(directory)&&path.resolve(directory)===directory,'FRESH_ABSOLUTE_SOURCE_BUNDLE_DIRECTORY_REQUIRED');for(const root of [path.resolve(ROOT),s.cohort.root])need(directory!==root&&!directory.startsWith(root+path.sep),'SOURCE_BUNDLE_MUST_BE_OUTSIDE_SOURCE_ROOTS');await assertUnifiedInstallSources(plan);await mkdir(directory,{mode:0o700});
 const members=[];async function save(name,bytes){const p=path.join(directory,name);await mkdir(path.dirname(p),{recursive:true,mode:0o700});await writeFile(p,bytes,{flag:'wx',mode:0o400});members.push({path:name,sha256:hash(bytes),bytes:Buffer.byteLength(bytes)});}
 for(const file of s.plan.files)await save('source/'+file.path,await sourceFile(s.cohort.root,file.path));
 const schema=s.plan.inventory.profiles.HISTORY.schema;
 await save('SOURCE-PLAN.json',JSON.stringify(describeUnifiedInstallPlan(plan),null,2)+'\n');
 await save('SOURCE-DECLARATIONS.json',JSON.stringify({format:'UNIFIED_TARGET_SOURCE_DECLARATIONS_NOT_LIVE_CATALOG_V1',tables:schema.tables,sequences:schema.sequences,orderedSchemaStatements:schema.statements,finiteDynamicDdl:s.plan.manifest,
  warning:'Column definition strings describe CREATE/ADD/RENAME provenance; later ALTER COLUMN/constraint changes remain explicitly in the ordered statement ledger. Do not mislabel these scanner strings as PostgreSQL-normalized final type/null/default values. Collect actual installed catalog before a full structural diff.',
  normalizedInstalledCatalogAvailable:false,ordinaryRuntimeAclEstablished:false,legacyDataTransformationAuthorized:false},null,2)+'\n');
 await save('SOURCE-ROUTINES.json',JSON.stringify({format:'UNIFIED_SOURCE_FINAL_137_ROUTINES_V1',routines:s.plan.routines,completeSourceBodiesInRawSqlMembers:true,notInstalledDefinitionHashes:true},null,2)+'\n');
 await assertUnifiedInstallSources(plan);const manifest=freeze({format:'UNIFIED_TARGET_STRUCTURE_SOURCE_BUNDLE_V1',base:s.descriptor.base,sourceFingerprint:s.plan.sourceFingerprint,planSha256:s.descriptor.planSha256,members,
  status:'SOURCE_DEFINITION_ONLY_NOT_ACTUAL_TARGET_SCHEMA_OR_RUNTIME_READY',sourceFiles:40,finalSourceRoutines:137,tables:56,columns:584,productionAuthorized:false,actualDatabaseRead:false});
 await writeFile(path.join(directory,'SOURCE-MANIFEST.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o400});return manifest;
}
