/** Synthetic only. This verifies the offline V2 compiler, not SQL, saving or scanning. */
import test from 'node:test';import assert from 'node:assert/strict';
import {createSyntheticPackage,repinSyntheticPackage} from './fixtures/unified-import/synthetic-package.ts';
import {BARCODE_SCHEMES} from '../packages/application/src/barcode-generation.ts';
import {BARCODE_PACKAGE_V2,compileUnifiedImportBarcodeV2} from '../packages/application/src/unified-import-barcode-v2.ts';
import {sha256} from '../packages/application/src/unified-import-contract.ts';
const admin={staff_id:'11111111-1111-4111-8111-111111111111',account_id:'22222222-2222-4222-8222-222222222222',login_name:'SYNTHETIC',staff_name:'SYNTHETIC'};
const cases=[
 ['2018',BARCODE_SCHEMES.y2018,'06008','0','06','806008006'],
 ['2020',BARCODE_SCHEMES.y2020,'5122301721','0','07','05122301721007'],
 ['2021',BARCODE_SCHEMES.y2021,'5139305','504','03','6513930550403'],
 ['2021fit',BARCODE_SCHEMES.y2021fit,'31550411','501','03','23155041150103'],
 ['2023',BARCODE_SCHEMES.y2023,'5336253','501','508','95336253501508'],
] as const;
for(const [label,scheme,segment,color,size,expected] of cases)test(`offline V2 exact ${label} source-segment reference`,()=>{
 const pkg=createSyntheticPackage();pkg.records.product![0]!.fields.default_barcode_scheme_id=scheme;repinSyntheticPackage(pkg);
 const manifestBytes=Buffer.from(JSON.stringify(pkg.manifest)),manifestHash=sha256(manifestBytes),r=(t:string)=>pkg.records[t]![0]!,ref=(t:string)=>r(t).source_refs[0]!;
 const declaration={format_version:BARCODE_PACKAGE_V2,base_manifest_sha256:manifestHash,source_namespace:pkg.manifest.source_namespace,source_files:pkg.manifest.source_files,
  product_records:[{entity_type:'PRODUCT',source_key:r('product').source_key,historical_barcode_attestation:{version:'HISTORICAL_BARCODE_ATTESTATION_V1',product_id:r('product').fields.id,product_source_key:r('product').source_key,
   entries:[{scheme_id:scheme,color_id:r('color').fields.id,fit_id:r('fit').fields.id,size_id:r('size').fields.id,product_segment:segment,color_code:color,size_code:size,sources:{product:ref('product'),color:ref('color'),fit:ref('fit'),size:ref('size')}}]}}]};
 const bytes=Buffer.from(JSON.stringify(declaration)),base={pkg,manifestBytes,expectedManifestSha256:manifestHash,allowSynthetic:true,target:{protocol:'STANDARD_IMPORT_SQL_V1' as const,system_identifier:'1',database_oid:'2',database_name:'SYNTHETIC',catalog_sha256:'a'.repeat(64)}};
 const result=compileUnifiedImportBarcodeV2({base,sidecarBytes:bytes,expectedSidecarSha256:sha256(bytes)},admin),intent=result.product_records[0]!.coordinate_intents[0]!;
 assert.equal(intent.barcode,expected);assert.equal(result.verification,'LOCAL_DECLARATION_ONLY');assert.equal(result.execution_scope,'OFFLINE_COMPILER_ONLY');assert.equal('sku_id' in intent,false);
});
