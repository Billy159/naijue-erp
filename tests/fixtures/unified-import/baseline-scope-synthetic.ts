/** Small synthetic variant of the original Fresh35 fixture. No connections,
 * installation, authority issuance or production source data. */
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {createSyntheticFresh35WholePackageInput} from './whole-package-synthetic.ts';
import {repinSyntheticPackage} from './synthetic-package.ts';
import {stableImportId} from '../../../packages/application/src/inventory-cutoff-import.ts';
import {sha256,registryTargetId} from '../../../packages/application/src/unified-import-contract.ts';
import type {UnifiedPackage} from '../../../packages/application/src/unified-import-contract.ts';
import {readExplicitZeroScopeApproval,closeExplicitZeroApproval} from '../../../packages/application/src/unified-explicit-zero-approval.ts';
import type {ExplicitZeroApproval} from '../../../packages/application/src/unified-explicit-zero-approval.ts';
import {assertWholeSalesAdmissionV1} from '../../../scripts/release/unified-install/whole-sales-admission-v1.mjs';
import {streamPreflight} from '../../../tools/unified-import/stream-preflight.mjs';
import {prepareStreamPlan} from '../../../tools/unified-import/stream-plan.mjs';
import {buildStreamProgram} from '../../../tools/unified-import/stream-program.mjs';
import type {StandardImportTarget,StandardImportStep} from '../../../packages/application/src/unified-import-execution.ts';
export function createSyntheticBaselineScopeInput(targetCapturedAt:string|null){
 const input=createSyntheticFresh35WholePackageInput(targetCapturedAt),pkg=input.pkg,namespace=pkg.manifest.source_namespace;
 const w=structuredClone(pkg.records.warehouse![0]!);w.source_key='warehouse:03';w.fields.id=registryTargetId(namespace,'WAREHOUSE',w.source_key);w.fields.name='SYNTHETIC negative baseline warehouse';pkg.records.warehouse!.push(w);
 pkg.registry.push({entity_type:'WAREHOUSE',source_namespace:namespace,canonical_source_key:w.source_key,target_id:w.fields.id as string,aliases:[],identity_basis:'STABLE_IMPORT_ID_V1',source_refs:structuredClone(w.source_refs)});
 pkg.records.inventory_baseline=pkg.records.inventory_baseline!.filter(r=>r.fields.quantity!=='0');
 const negative=structuredClone(pkg.records.inventory_baseline[0]!);negative.source_key='inventory_baseline:03';negative.fields.warehouse_id=w.fields.id;negative.fields.quantity='-7';negative.source_refs=[{...negative.source_refs[0]!,row:3}];pkg.records.inventory_baseline.push(negative);
 const reconciliation=pkg.reports['reconciliation.json'] as {tables:Record<string,unknown>};for(const table of ['warehouse','inventory_baseline']){const n=pkg.records[table]!.length;reconciliation.tables[table]={source_rows:n,retained_rows:n,rejected_rows:0};}
 repinSyntheticPackage(pkg);const manifestBytes=Buffer.from(JSON.stringify(pkg.manifest,null,2)+'\n');
 return {...input,manifestBytes,expectedManifestSha256:sha256(manifestBytes),syntheticWarehouseRows:pkg.records.warehouse!.map(r=>({id:r.fields.id as string,hallId:r.fields.hall_id as string,label:r.fields.name as string})),expectedBaseline:{nonzeroCount:2,total:'93',missingWarehouseId:pkg.records.warehouse![1]!.fields.id as string,negativeWarehouseId:w.fields.id as string}};
}
/** Creates pinned evidence only from the caller's small synthetic fixture. */
export async function createSyntheticBaselineScopeApproval(pkg:UnifiedPackage,directory:string):Promise<ExplicitZeroApproval>{
 if(pkg.manifest.package_kind!=='SYNTHETIC')throw Error('SYNTHETIC_SCOPE_ONLY');await mkdir(directory,{recursive:true});
 const pin=async(name:string,rows:unknown[])=>{const bytes=Buffer.from(rows.map(r=>JSON.stringify(r)+'\n').join(''));await writeFile(join(directory,name),bytes,{flag:'wx'});return {relative_path:name,sha256:sha256(bytes),row_count:rows.length,records_sha256:sha256(bytes)};};
 const warehouses=pkg.records.warehouse!.map(r=>({id:r.fields.id as string})).sort((a,b)=>a.id.localeCompare(b.id)),skus=pkg.records.sku!.map(r=>({id:r.fields.id as string})).sort((a,b)=>a.id.localeCompare(b.id));
 const values=pkg.records.inventory_baseline!.map(r=>({warehouse_id:r.fields.warehouse_id as string,sku_id:r.fields.sku_id as string,quantity:r.fields.quantity as string})).sort((a,b)=>(a.warehouse_id+':'+a.sku_id).localeCompare(b.warehouse_id+':'+b.sku_id));
 const registryBytes=pkg.artifacts[pkg.manifest.identity_registry.relative_path]!;await writeFile(join(directory,'registry.jsonl'),registryBytes,{flag:'wx'});
 const core={source_namespace:pkg.manifest.source_namespace,batch_key:'SYNTHETIC_BASELINE_SCOPE_V1',inventory_file_sha256:pkg.manifest.inventory_source.source_file_sha256,cutoff_at:pkg.manifest.inventory_source.cutoff_at!,identity_registry:{relative_path:'registry.jsonl',sha256:sha256(registryBytes),row_count:pkg.registry.length},warehouses:await pin('warehouses.jsonl',warehouses),skus:await pin('skus.jsonl',skus),explicit_values:await pin('explicit.jsonl',values),unknown_mask:await pin('unknown.jsonl',[])};
 const m=await pin('input-manifest.json',[{format_version:'EXPLICIT_ZERO_SCOPE_INPUT_V2',...core}]);
 const summary={format_version:'INVENTORY_BASELINE_SCOPE_V1',...core,decision_ref:'SYNTHETIC_ACCEPTANCE_ONLY',input_manifest:{relative_path:m.relative_path,sha256:m.sha256},counts:{universe:warehouses.length*skus.length,explicit_confirmed:values.length,zero:warehouses.length*skus.length-values.length,unknown:0,explicit_unknown_overlap:0}};
 const bytes=Buffer.from(JSON.stringify(summary)+'\n');return readExplicitZeroScopeApproval({bytes,trustedSha256:sha256(bytes),directory,sourceNamespace:core.source_namespace,inventoryFileSha256:core.inventory_file_sha256,cutoffAt:core.cutoff_at});
}
/** Same real admission, preflight, stream planner and compiler as the original
 * fixture. The target/capability must come from the existing authorized host. */
export async function buildSyntheticBaselineScopeFixture(target:StandardImportTarget,encodedScrypt:string,options:{historicalSalesAdmission:object;workspaceDirectory:string;targetCapturedAt:string|null}){
 const input=createSyntheticBaselineScopeInput(options.targetCapturedAt);
 if(assertWholeSalesAdmissionV1(options.historicalSalesAdmission,target)!==input.sourceProfileSha256)throw Error('SYNTHETIC_FRESH35_V2_ADMISSION_REQUIRED');
 const scratch=await mkdtemp(join(options.workspaceDirectory,'baseline-scope-synthetic-')),packageDirectory=join(scratch,'package'),reportDirectory=join(scratch,'report');let scope:ExplicitZeroApproval|undefined,plan:Awaited<ReturnType<typeof prepareStreamPlan>>|undefined,disposed=false;
 const dispose=async()=>{if(disposed)return;disposed=true;try{await plan?.dispose()}finally{closeExplicitZeroApproval(scope);await rm(scratch,{recursive:true,force:true});}};
 try{await mkdir(packageDirectory);for(const [path,bytes]of Object.entries(input.pkg.artifacts)){await mkdir(dirname(join(packageDirectory,path)),{recursive:true});await writeFile(join(packageDirectory,path),bytes,{flag:'wx'});}await writeFile(join(packageDirectory,'manifest.json'),input.manifestBytes,{flag:'wx'});
  scope=await createSyntheticBaselineScopeApproval(input.pkg,join(scratch,'scope'));
  const validation={allowSynthetic:true,historicalSalesHallApproval:input.historicalSalesHallApproval,historicalLineAmountEvidence:input.historicalLineAmountEvidence,explicitZeroApproval:scope};
  const summary=await streamPreflight(packageDirectory,reportDirectory,{...validation,expectedManifestSha256:input.expectedManifestSha256});if(!summary.checks_passed)throw Error('SYNTHETIC_BASELINE_SCOPE_PREFLIGHT_REJECTED');
  const index=join(reportDirectory,'index.sqlite');plan=await prepareStreamPlan(index,summary,input.manifestBytes,{...validation,target,initialization_identity:input.admin,historicalSalesAdmission:options.historicalSalesAdmission});
  const native=await buildStreamProgram(plan,index,summary,input.admin),steps:StandardImportStep[]=[];for await(const step of native.steps)steps.push(structuredClone(step));
  return {...input,identity:native.identity,initialize:native.initialize,steps,explicitZeroApproval:scope,counts:summary.counts,totals:plan.totals,packageDirectory,reportDirectory,dispose};
 }catch(error){await dispose();throw error;}
}
