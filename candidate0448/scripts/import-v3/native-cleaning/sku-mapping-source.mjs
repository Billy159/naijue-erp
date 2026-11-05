import {consumePrivateSnapshotTable} from './private-row-reader.mjs';
import {parseLegacyJsonText} from './legacy-json.mjs';
const need=(yes,code)=>{if(!yes)throw new Error(code);};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const text=value=>typeof value==='string';
const nonempty=value=>text(value)&&value.length>0;
const fields=['sku','product','color','sourceCode','sourceSize','sourceGroup'];

/** Existing source mapping six-fact matching, not approval validation or target
 * identity generation. Uses the sole committed source batch; multiple batches
 * need PostgreSQL's exact microsecond ordering and are not guessed here.
 * Source: paired inventory-sku-display.js mapped_input/mapped; original source
 * group name uses SQL COALESCE (including an explicit empty string).
 */
export function createLegacySkuMappingResolver({products,groups,batches,sources,settings}) {
  const index=(rows,key)=>{const result=new Map();for(const row of rows){need(nonempty(row[key])&&!result.has(row[key]),'SKU_MAPPING_SOURCE_IDENTITY');result.set(row[key],row);}return result;};
  const product=index(products,'id'),group=index(groups,'id');
  const committed=batches.filter(row=>row.status==='COMMITTED');
  need(committed.length<=1,'SKU_MAPPING_SOURCE_BATCH_ORDER_UNRESOLVED');
  need(settings.length<=1&&settings.every(row=>row.key==='inventory.standard-size-mappings'),'SKU_MAPPING_SETTING_SCOPE');
  const setting=settings[0]?.value,items=object(setting?.items)?setting.items:{};
  const packValid=text(setting?.packSha256)&&/^[a-f0-9]{64}$/.test(setting.packSha256);
  const source=new Map();
  if(committed.length===1)for(const row of sources)if(row.batch_id===committed[0].batch_id){
    need(nonempty(row.product_id)&&!source.has(row.product_id),'SKU_MAPPING_SOURCE_ASSOCIATION_AMBIGUOUS');source.set(row.product_id,row);
  }
  return row=>{
    need(nonempty(row.sku_id)&&nonempty(row.product_id),'SKU_MAPPING_SKU_IDENTITY');
    need(['SOURCE','RUNTIME'].includes(row.origin),'SKU_MAPPING_ORIGIN_REQUIRED');
    if(row.origin==='RUNTIME')return {status:'RUNTIME_IDENTITY_UNCHANGED',skuId:row.sku_id,productId:row.product_id};
    const ps=source.get(row.product_id),payload=ps?.source_payload;
    const sourceGroup=group.get(ps?.source_size_group_id)?.name??payload?.sourceSizeGroupName??payload?.sourceSizeGroupCode??null;
    const facts={sku:row.sku_id,product:product.get(row.product_id)?.code??null,color:row.options?.COLOR?.code??null,
      sourceCode:row.options?.SIZE?.code??null,sourceSize:row.options?.SIZE?.name??null,sourceGroup};
    if(!Object.hasOwn(items,row.sku_id))return {status:'UNMAPPED',skuId:row.sku_id,productId:row.product_id};
    const entry=items[row.sku_id],original=entry?.source,target=entry?.target;
    const matches=packValid&&object(original)&&fields.every(key=>text(facts[key])&&original[key]===facts[key])
      &&object(target)&&['group','fit','code','size'].every(key=>nonempty(target[key]))
      &&(facts.sourceSize!=='无尺码'||target.size==='无尺码');
    if(!matches)return {status:'SOURCE_IDENTITY_MISMATCH',skuId:row.sku_id,productId:row.product_id};
    return {status:'MATCHED_EXISTING_SOURCE_MAPPING',skuId:row.sku_id,productId:row.product_id,
      originalSizeId:row.options?.SIZE?.id??null,colorId:row.options?.COLOR?.id??null,
      source:{...facts},target:{group:target.group,fit:target.fit,code:target.code,size:target.size},
      mappingRevision:setting.revision??null,mappingPackSha256:setting.packSha256};
  };
}

/** Rebuild the original option identities from the source tables, rather than
 * trusting a potentially stale display relation to validate its own mapping. */
export function originalSkuRows({variants,options,dimensions,values}) {
  const indexed=(rows,key)=>{const m=new Map();for(const row of rows){need(nonempty(row[key])&&!m.has(row[key]),'SKU_MAPPING_OPTION_IDENTITY');m.set(row[key],row);}return m;};
  const v=indexed(variants,'id'),d=indexed(dimensions,'id'),sv=indexed(values,'id'),out=new Map();
  for(const row of variants)out.set(row.id,{sku_id:row.id,product_id:row.product_id,origin:'SOURCE',options:{}});
  for(const row of options){
    const variant=v.get(row.variant_id),dimension=d.get(row.dimension_id),value=sv.get(row.spec_value_id);
    need(variant&&dimension&&value&&value.dimension_id===dimension.id&&nonempty(dimension.code),'SKU_MAPPING_OPTION_REFERENCE');
    const o=out.get(variant.id).options;need(!Object.hasOwn(o,dimension.code),'SKU_MAPPING_DUPLICATE_OPTION_DIMENSION');
    o[dimension.code]={id:value.id,code:value.code,name:value.name};
  }
  return [...out.values()];
}

/** File-only join on the already adopted same-RR capture. Returns aggregate
 * coverage only; private mapping results never become approval or new SKU IDs.
 */
export async function readExistingSkuMappingCoverage(options) {
  const inputs={},receipts=[];
  for(const [key,table] of [['products','erp_prod_source.product'],['groups','erp_prod_source.size_group'],
    ['batches','erp_prod_source.tplus_import_run'],['sources','erp_prod_source.tplus_product_source'],['settings','erp_prod_source.system_setting'],
    ['variants','erp_prod_source.variant'],['options','erp_prod_source.variant_option'],
    ['dimensions','erp_prod_source.spec_dimension'],['values','erp_prod_source.spec_value']]){
    inputs[key]=[];
    receipts.push(await consumePrivateSnapshotTable({...options,table,maxRowBytes:1048576,onRow:row=>inputs[key].push(parseLegacyJsonText(row.raw_json))}));
  }
  const resolve=createLegacySkuMappingResolver(inputs),original=originalSkuRows(inputs),relations=new Map();
  receipts.push(await consumePrivateSnapshotTable({...options,table:'erp_prod_runtime.standard_sku_relation',maxRowBytes:1048576,onRow:envelope=>{
    const row=parseLegacyJsonText(envelope.raw_json);
    need(nonempty(row.sku_id)&&!relations.has(row.sku_id),'SKU_MAPPING_RELATION_IDENTITY');relations.set(row.sku_id,row);
  }}));
  const result={sourceRows:0,runtimeRows:0,matchedExistingMapping:0,unmapped:0,sourceIdentityMismatch:0,
    sourceMissingRelation:0,relationSourceMissingOriginal:0,relationOriginalIdentityDifference:0,
    unconfirmedRelationWithExistingMatch:0,confirmedRelationMissingMapping:0,missingFitWithExistingMatch:0,matchedTargetDiffersFromRelation:0};
  const confirmed=new Set(['CONFIRMED_SOURCE','CONFIRMED_RUNTIME','CONFIRMED_AUTHORITY']),sourceIds=new Set();
  for(const row of original){
    sourceIds.add(row.sku_id);result.sourceRows++;
    const relation=relations.get(row.sku_id),mapped=resolve(row);
    if(!relation)result.sourceMissingRelation++;
    else if(relation.product_id!==row.product_id||['COLOR','SIZE'].some(k=>['id','name','code'].some(f=>(relation.options?.[k]?.[f]??null)!==(row.options[k]?.[f]??null))))result.relationOriginalIdentityDifference++;
    if(mapped.status==='UNMAPPED')result.unmapped++;
    else if(mapped.status==='SOURCE_IDENTITY_MISMATCH')result.sourceIdentityMismatch++;
    else {
      result.matchedExistingMapping++;
      if(relation&&!confirmed.has(relation.mapping_status))result.unconfirmedRelationWithExistingMatch++;
      if(relation&&!nonempty(relation.fit_id))result.missingFitWithExistingMatch++;
      if(relation&&['group','fit','code','size'].some(key=>relation['standard_'+key]!==mapped.target[key]))result.matchedTargetDiffersFromRelation++;
    }
    if(relation&&confirmed.has(relation.mapping_status)&&mapped.status!=='MATCHED_EXISTING_SOURCE_MAPPING')result.confirmedRelationMissingMapping++;
  }
  for(const row of relations.values()){
    need(['SOURCE','RUNTIME'].includes(row.origin),'SKU_MAPPING_ORIGIN_REQUIRED');
    if(row.origin==='RUNTIME')result.runtimeRows++;else if(!sourceIds.has(row.sku_id))result.relationSourceMissingOriginal++;
  }
  return {status:'SCOPED_EXISTING_MAPPING_COVERAGE_NOT_TARGET_CONVERSION',...result,sourceManifestSha256:options.expectedManifestSha256,
    sourceFilesConsumed:receipts.length,sourceRowsConsumed:receipts.reduce((n,r)=>n+BigInt(r.rows),0n).toString(),
    sourceBytesConsumed:receipts.reduce((n,r)=>n+r.bytes,0),databaseConnections:0,targetWrites:0,identityAllocation:0,
    mappingApprovalAuthenticityVerified:false,targetDictionaryMappingVerified:false,independentTargetReadbackVerified:false};
}
