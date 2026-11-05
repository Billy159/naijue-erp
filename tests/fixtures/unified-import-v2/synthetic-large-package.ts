/** Deterministic SYNTHETIC ONLY test source. Never user rows or a cleaning pipeline. */
import {mkdir,writeFile} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {createSyntheticPackage,repinSyntheticPackage} from '../unified-import/synthetic-package.ts';
import {registryTargetId} from '../../../packages/application/src/unified-import-contract.ts';
import {STANDARD_MASTER_TABLES} from '../../../packages/application/src/unified-import-execution.ts';
export function createSizedSyntheticPackage(masterCount:number){
 const pkg=createSyntheticPackage(),original=STANDARD_MASTER_TABLES.reduce((n,t)=>n+pkg.records[t]!.length,0);
 if(!Number.isSafeInteger(masterCount)||masterCount<original)throw new Error('SYNTHETIC_MASTER_COUNT_INVALID');
 const template=pkg.records.color![0]!;
 for(let i=original;i<masterCount;i++){
  const source_key=`SYNTHETIC-V2-COLOR:${String(i).padStart(8,'0')}`,id=registryTargetId(pkg.manifest.source_namespace,'COLOR',source_key),source_refs=[{...template.source_refs[0]!,row:i+1}];
  pkg.records.color!.push({source_key,fields:{...template.fields,id,code:`SYNTHETIC-V2-${i}`,name:`SYNTHETIC V2 color ${i}`},source_refs});
  pkg.registry.push({entity_type:'COLOR',source_namespace:pkg.manifest.source_namespace,canonical_source_key:source_key,target_id:id,aliases:[],identity_basis:'STABLE_IMPORT_ID_V1',source_refs:structuredClone(source_refs)});
 }
 const reconciliation=pkg.reports['reconciliation.json'] as {tables:Record<string,{source_rows:number;retained_rows:number;rejected_rows:number}>};
 reconciliation.tables.color={source_rows:pkg.records.color!.length,retained_rows:pkg.records.color!.length,rejected_rows:0};return repinSyntheticPackage(pkg);
}
export async function writeSizedSyntheticPackage(root:string,masterCount:number){const pkg=createSizedSyntheticPackage(masterCount);await mkdir(root,{recursive:true});for(const[path,bytes]of Object.entries(pkg.artifacts)){const target=join(root,path);await mkdir(dirname(target),{recursive:true});await writeFile(target,bytes);}await writeFile(join(root,'manifest.json'),JSON.stringify(pkg.manifest,null,2)+'\n');return pkg;}
