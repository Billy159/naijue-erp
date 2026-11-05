/** Test-only deterministic package for an isolated new-empty PostgreSQL target.
 * It compiles source rows; publication and the parent SAVE are separate steps. */
import { createSyntheticPackage, repinSyntheticPackage } from '../../fixtures/unified-import/synthetic-package.ts';
import { compileStandardWholePackageProfile } from '../../../packages/application/src/unified-import-whole-package-profile.ts';
import { stableImportId } from '../../../packages/application/src/inventory-cutoff-import.ts';
import { sha256, validateUnifiedPackage, registryTargetId } from '../../../packages/application/src/unified-import-contract.ts';
import type { StandardImportTarget } from '../../../packages/application/src/unified-import-execution.ts';
export function buildMultisizeSyntheticProgram(target: StandardImportTarget, sizeCount=2) {
 if(!Number.isInteger(sizeCount)||sizeCount<2||sizeCount>5000)throw Error('SYNTHETIC_SIZE_COUNT_INVALID');
 const pkg=createSyntheticPackage();
 if(pkg.manifest.package_kind!=='SYNTHETIC')throw Error('SYNTHETIC_PACKAGE_REQUIRED');
 const original=pkg.records.size?.[0], member=pkg.records.size_group_member?.[0], item=pkg.records.product?.[0], color=pkg.records.color?.[0];
 const registry=pkg.registry.find(r=>r.entity_type==='SIZE'&&r.canonical_source_key===original?.source_key);
 if(!original||!member||!item||!color||!registry)throw Error('SYNTHETIC_DIMENSIONS_REQUIRED');
 const sizeIds=[String(original.fields.id)];
 for(let i=1;i<sizeCount;i++){
  const code=String(900+i),key=`SYNTHETIC-DOCUMENT-SIZE-${code}`,sizeId=registryTargetId(registry.source_namespace,'SIZE',key);
  const row=structuredClone(original);row.source_key=key;row.fields.id=sizeId;row.fields.code=code;row.fields.name=`SYNTHETIC size ${code}`;pkg.records.size!.push(row);
  pkg.registry.push({...structuredClone(registry),canonical_source_key:key,target_id:sizeId});
  const entry=structuredClone(member);entry.source_key=`SYNTHETIC-DOCUMENT-SIZE-GROUP-MEMBER-${code}`;entry.fields.size_id=sizeId;entry.fields.display_order=i+1;pkg.records.size_group_member!.push(entry);sizeIds.push(sizeId);
 }
 color.fields.code='504';item.fields.system_item_code='1234567';item.fields.default_barcode_scheme_id='9c584ada-9d42-4159-9e51-208577657021';
 for(const name of ['size','size_group_member']){const table=(pkg.reports['reconciliation.json'] as {tables:Record<string,{source_rows:number;retained_rows:number;rejected_rows:number}>}).tables[name];if(!table)throw Error('SYNTHETIC_RECONCILIATION_REQUIRED');table.source_rows=sizeCount;table.retained_rows=sizeCount;}
 repinSyntheticPackage(pkg);
 const admin={staff_id:stableImportId('SYNTHETIC_V2_COMPAT','staff'),account_id:stableImportId('SYNTHETIC_V2_COMPAT','account'),login_name:'synthetic-v1-compat',staff_name:'SYNTHETIC V1 compatibility ADMIN'};
 const manifestBytes=Buffer.from(JSON.stringify(pkg.manifest,null,2)+'\n');
 const validation=validateUnifiedPackage(pkg,{allowSynthetic:true});if(!validation.valid)throw Error('SYNTHETIC_MULTISIZE_PREFLIGHT:'+JSON.stringify(validation.issues));
 const program=compileStandardWholePackageProfile({pkg,manifestBytes,expectedManifestSha256:sha256(manifestBytes),allowSynthetic:true,target,initialization_identity:admin});
 return {program,categoryId:String(item.fields.category_id),supplierId:String(pkg.records.supplier![0]!.fields.id),sizeGroupId:String(item.fields.size_group_id),seasonId:String(pkg.records.season![0]!.fields.id),productId:String(item.fields.id),colorId:String(color.fields.id),fitId:String(pkg.records.fit![0]!.fields.id),existingSizeId:String(original.fields.id),addedSizeId:sizeIds[1]!,sizeIds,existingSkuId:String(pkg.records.sku![0]!.fields.id),hallId:String(pkg.records.hall![0]!.fields.id),warehouseId:String(pkg.records.warehouse![0]!.fields.id),customerId:String(pkg.records.customer![0]!.fields.id),staffId:String(pkg.records.staff![0]!.fields.id),paymentAccountId:String(pkg.records.payment_account![0]!.fields.id),paymentMethodId:String(pkg.records.payment_method![0]!.fields.id),admin};
}
