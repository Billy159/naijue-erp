/** Synthetic only. Builds a standard package; never connects or writes a database. */
import {createSyntheticPackage,repinSyntheticPackage} from '../../fixtures/unified-import/synthetic-package.ts';
import {createLineImportIdentity} from '../../../packages/application/src/unified-import-stable-identity.ts';
import {stableImportId} from '../../../packages/application/src/inventory-cutoff-import.ts';
import {sha256} from '../../../packages/application/src/unified-import-contract.ts';
import {compileStandardWholePackageProfile} from '../../../packages/application/src/unified-import-whole-package-profile.ts';
export function buildSettlementIdentityProgram(target){
 const pkg=createSyntheticPackage(),header=pkg.registry.find(r=>r.entity_type==='SALES_HEADER');
 pkg.registry=pkg.registry.filter(r=>r.entity_type!=='SALES_SETTLEMENT');
 for(const [i,row]of pkg.records.sales_settlement.entries()){
  const identity=createLineImportIdentity({source_namespace:pkg.manifest.source_namespace,entity_type:'SALES_SETTLEMENT',header,basis:'PERSISTED_LEDGER_ID',original_id:`11111111-1111-4111-8111-${String(i+1).padStart(12,'0')}`,source_refs:row.source_refs});
  if(i===0){identity.identity_basis='EXISTING_VERIFIED';identity.target_id='99999999-9999-4999-8999-999999999999';}
  pkg.registry.push(identity);row.source_key=identity.canonical_source_key;row.fields.id=identity.target_id;
 }
 repinSyntheticPackage(pkg);
 const admin={staff_id:stableImportId('SYNTHETIC_V2_COMPAT','staff'),account_id:stableImportId('SYNTHETIC_V2_COMPAT','account'),login_name:'synthetic-v1-compat',staff_name:'SYNTHETIC V1 compatibility ADMIN'};
 const manifestBytes=Buffer.from(JSON.stringify(pkg.manifest)+'\n');
 const program=compileStandardWholePackageProfile({pkg,manifestBytes,expectedManifestSha256:sha256(manifestBytes),allowSynthetic:true,target,initialization_identity:admin});
 return{program,expected:pkg.records.sales_settlement.map(row=>({id:row.fields.id,sales_id:row.fields.sales_id,source_key:row.source_key,record_id:stableImportId('standard-import-record-v1',pkg.manifest.source_namespace,'SALES_SETTLEMENT',row.source_key)}))};
}
