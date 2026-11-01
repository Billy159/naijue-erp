import test from 'node:test';
import assert from 'node:assert/strict';
import {createLegacySkuMappingResolver,originalSkuRows} from '../scripts/import-v3/native-cleaning/sku-mapping-source.mjs';
const fixture=()=>{
 const row={sku_id:'sku-1',product_id:'product-1',origin:'SOURCE',options:{COLOR:{id:'color-id',code:'07'},SIZE:{id:'size-id',code:'201',name:'160/XS'}}};
 const entry={source:{sku:'sku-1',product:'007',color:'07',sourceCode:'201',sourceSize:'160/XS',sourceGroup:'Original group'},target:{group:'男装上衣尺码',fit:'Y',code:'201',size:'160/XS'}};
 const input={products:[{id:'product-1',code:'007'}],groups:[{id:'g',name:'Original group'}],batches:[{batch_id:'batch',status:'COMMITTED'}],
  sources:[{batch_id:'batch',product_id:'product-1',source_size_group_id:'g',source_payload:{sourceSizeGroupName:'unused'}}],
  settings:[{key:'inventory.standard-size-mappings',value:{revision:'r',packSha256:'a'.repeat(64),items:{'sku-1':entry}}}]};
 return {row,entry,input};
};
test('six original facts match with color code and product code, preserving real IDs',()=>{
 const {row,input}=fixture(),before=structuredClone(input),r=createLegacySkuMappingResolver(input)(row);
 assert.equal(r.status,'MATCHED_EXISTING_SOURCE_MAPPING');assert.equal(r.source.product,'007');assert.equal(r.source.color,'07');
 assert.equal(r.skuId,'sku-1');assert.equal(r.originalSizeId,'size-id');assert.equal(r.colorId,'color-id');assert.equal(r.target.fit,'Y');
 assert.deepEqual(input,before);assert.equal(Object.hasOwn(r,'newSkuId'),false);
});
test('each changed source fact refuses reuse, no labels or prefix/case normalization',()=>{
 for(const key of ['sku','product','color','sourceCode','sourceSize','sourceGroup']){
  const {row,input,entry}=fixture();entry.source[key]+=' ';assert.equal(createLegacySkuMappingResolver(input)(row).status,'SOURCE_IDENTITY_MISMATCH');
 }
 const {row,input,entry}=fixture();entry.source.color='color-id';assert.equal(createLegacySkuMappingResolver(input)(row).status,'SOURCE_IDENTITY_MISMATCH');
});
test('SQL group COALESCE honors empty string, falls through only null/absent',()=>{
 const {row,input,entry}=fixture();input.groups[0].name='';
 assert.equal(createLegacySkuMappingResolver(input)(row).status,'SOURCE_IDENTITY_MISMATCH');entry.source.sourceGroup='';
 assert.equal(createLegacySkuMappingResolver(input)(row).status,'MATCHED_EXISTING_SOURCE_MAPPING');
 input.groups[0].name=null;entry.source.sourceGroup='unused';
 assert.equal(createLegacySkuMappingResolver(input)(row).status,'MATCHED_EXISTING_SOURCE_MAPPING');
});
test('missing mapping, explicit null, invalid pack and incomplete target stay distinct',()=>{
 const {row,input,entry}=fixture();input.settings=[];assert.equal(createLegacySkuMappingResolver(input)(row).status,'UNMAPPED');
 const f=fixture();f.input.settings[0].value.items['sku-1']=null;assert.equal(createLegacySkuMappingResolver(f.input)(f.row).status,'SOURCE_IDENTITY_MISMATCH');
 for(const field of ['group','fit','code','size']){const x=fixture();x.entry.target[field]='';assert.equal(createLegacySkuMappingResolver(x.input)(x.row).status,'SOURCE_IDENTITY_MISMATCH');}
 const y=fixture();y.input.settings[0].value.packSha256='bad';assert.equal(createLegacySkuMappingResolver(y.input)(y.row).status,'SOURCE_IDENTITY_MISMATCH');
});
test('none-size cannot be remapped into sized identity; runtime is not source-remapped',()=>{
 const {row,input,entry}=fixture();row.options.SIZE.name='无尺码';entry.source.sourceSize='无尺码';
 assert.equal(createLegacySkuMappingResolver(input)(row).status,'SOURCE_IDENTITY_MISMATCH');entry.target.size='无尺码';entry.target.code='910';
 assert.equal(createLegacySkuMappingResolver(input)(row).target.code,'910');
 row.origin='RUNTIME';assert.equal(createLegacySkuMappingResolver(input)(row).status,'RUNTIME_IDENTITY_UNCHANGED');
});
test('multiple source batches or product associations cannot silently choose a source',()=>{
 const {input}=fixture();input.batches.push({batch_id:'other',status:'COMMITTED'});
 assert.throws(()=>createLegacySkuMappingResolver(input),/BATCH_ORDER_UNRESOLVED/);
 const x=fixture();x.input.sources.push({...x.input.sources[0]});assert.throws(()=>createLegacySkuMappingResolver(x.input),/ASSOCIATION_AMBIGUOUS/);
 const y=fixture();y.input.settings.push({...y.input.settings[0],key:'another'});assert.throws(()=>createLegacySkuMappingResolver(y.input),/SETTING_SCOPE/);
});

test('original option join uses UUIDs and source dimension code, never display relation labels',()=>{
 const x={variants:[{id:'s',product_id:'p'}],dimensions:[{id:'c',code:'COLOR'},{id:'z',code:'SIZE'}],
  values:[{id:'red',dimension_id:'c',code:'01',name:'red'},{id:'small',dimension_id:'z',code:'201',name:'160/XS'}],
  options:[{variant_id:'s',dimension_id:'c',spec_value_id:'red'},{variant_id:'s',dimension_id:'z',spec_value_id:'small'}]};
 const r=originalSkuRows(x);assert.equal(r[0].sku_id,'s');assert.equal(r[0].options.SIZE.id,'small');assert.equal(r[0].options.COLOR.code,'01');
 const mismatch=structuredClone(x);mismatch.values[1].dimension_id='c';assert.throws(()=>originalSkuRows(mismatch),/OPTION_REFERENCE/);
 const duplicate=structuredClone(x);duplicate.options.push({...duplicate.options[0]});assert.throws(()=>originalSkuRows(duplicate),/DUPLICATE_OPTION_DIMENSION/);
});

test('file coverage independently joins source identities and flags stale display mapping',async()=>{
 const {mkdtemp,mkdir,writeFile}=await import('node:fs/promises');const {join}=await import('node:path');
 const {tmpdir}=await import('node:os');const {createHash}=await import('node:crypto');
 const {readExistingSkuMappingCoverage}=await import('../scripts/import-v3/native-cleaning/sku-mapping-source.mjs');
 const {row,input}=fixture(),directory=join(await mkdtemp(join(tmpdir(),'erp-synthetic-mapping-')),'snapshot');await mkdir(directory,{mode:0o700});
 const tables={product:input.products,size_group:input.groups,tplus_import_run:input.batches,tplus_product_source:input.sources,system_setting:input.settings,
  variant:[{id:row.sku_id,product_id:row.product_id}],variant_option:[{variant_id:row.sku_id,dimension_id:'color',spec_value_id:'color-id'},{variant_id:row.sku_id,dimension_id:'size',spec_value_id:'size-id'}],
  spec_dimension:[{id:'color',code:'COLOR'},{id:'size',code:'SIZE'}],spec_value:[{...row.options.COLOR,dimension_id:'color'},{...row.options.SIZE,dimension_id:'size'}]};
 const full=Object.fromEntries(Object.entries(tables).map(([k,v])=>['erp_prod_source.'+k,v]));
 // Same original IDs, stale cached labels and missing mapping. Source mapping
 // must still be matched using original tables, rather than cached redacted name.
 full['erp_prod_runtime.standard_sku_relation']=[{...row,options:{...row.options,SIZE:{...row.options.SIZE,name:'stale'}},mapping_status:'UNMAPPED',fit_id:''}];
 const files=[];const hash=x=>createHash('sha256').update(x).digest('hex');
 for(const [table,rows] of Object.entries(full)){
  const bytes=Buffer.from(rows.map(r=>JSON.stringify({source_key_json:JSON.stringify([r.id??r.sku_id??r.key??'synthetic']),raw_json:JSON.stringify(r)})+'\n').join(''));
  const filename=table+'.ndjson';await writeFile(join(directory,filename),bytes,{mode:0o600});files.push({table,filename,rows:String(rows.length),bytes:bytes.length,sha256:hash(bytes)});
 }
 const manifest=Buffer.from(JSON.stringify({status:'COMPLETE_SCOPED_PRIVATE_SNAPSHOT',files:[...files,...Array.from({length:83},(_,i)=>({table:'synthetic-unused-'+i}))]}));
 await writeFile(join(directory,'SNAPSHOT.json'),manifest,{mode:0o600});
 const r=await readExistingSkuMappingCoverage({directory,expectedManifestSha256:hash(manifest),expectedUid:process.getuid()});
 assert.equal(r.sourceFilesConsumed,10);assert.equal(r.matchedExistingMapping,1);assert.equal(r.unconfirmedRelationWithExistingMatch,1);
 assert.equal(r.missingFitWithExistingMatch,1);assert.equal(r.relationOriginalIdentityDifference,1);assert.equal(r.targetWrites,0);
 assert.equal(r.mappingApprovalAuthenticityVerified,false);assert.equal(JSON.stringify(r).includes('sku-1'),false);
});
