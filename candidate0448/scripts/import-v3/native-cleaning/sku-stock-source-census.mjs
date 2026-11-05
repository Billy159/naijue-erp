import {consumePrivateSnapshotTable} from './private-row-reader.mjs';
import {parseLegacyJsonText,legacyDecimalText} from './legacy-json.mjs';
const need=(yes,code)=>{if(!yes)throw new Error(code);};
const id=value=>typeof value==='string'&&value.length>0;
const confirmed=new Set(['CONFIRMED_SOURCE','CONFIRMED_RUNTIME','CONFIRMED_AUTHORITY']);
const min=-9223372036854775808n,max=9223372036854775807n;
function scaled(value) {
  if(value===null)return null;
  const text=legacyDecimalText(value);need(typeof text==='string'&&text.length<=128,'STOCK_CENSUS_EXACT_QUANTITY_REQUIRED');
  const match=/^(-?)(0|[1-9][0-9]*)(?:\.([0-9]{1,4}))?$/.exec(text);
  need(match,'STOCK_CENSUS_EXACT_QUANTITY_REQUIRED');
  return BigInt(match[1]+match[2])*10000n+(match[1]==='-'?-1n:1n)*BigInt((match[3]??'').padEnd(4,'0'));
}

/** Bounded private accumulators. Physical stock rows and source SKU identities
 * remain distinct; no authoritative generation selection or target conversion. */
export function createSkuStockSourceCensus() {
  const r={status:'SCOPED_SKU_STOCK_SOURCE_CENSUS_NOT_CONVERSION',
    sku:{rows:0,present:0,enabled:0,unconfirmedMapping:0,missingColorIdentity:0,missingOriginalSizeIdentity:0,missingFitIdentity:0,missingStandardGroupOrSize:0,duplicateOriginalTupleGroups:0,duplicateStandardDisplayTupleGroups:0},
    stock:{cells:0,runs:0,activations:0,maintainedGenerations:0,activeMaintainedGenerations:0,sourceUnitCount:0,missingCellIdentity:0,unknownRunCells:0,unknownRunActivations:0,
      duplicateWarehouseSkuGroups:0,mixedUnitWarehouseSkuGroups:0,stockSkuOutsideStandardRelationRows:0,
      confirmedOpeningNull:0,sourceNetNull:0,invalidQuantityComponents:0,fractionalQuantityComponents:0,
      knownComponentPairs:0,incompleteComponentPairs:0,knownPairFractional:0,knownPairNegative:0,knownPairOutsideTargetBigint:0},
    targetWrites:0,identityAllocation:0,inventoryConservationVerified:false,independentTargetReadbackVerified:false};
  const skuIds=new Set(),original=new Map(),display=new Map(),runs=new Set(),activationRuns=[],cellRuns=new Map(),cellSkus=new Map(),units=new Set(),stockGroups=new Map();
  const increment=(map,key)=>map.set(key,(map.get(key)??0)+1);
  return {
    sku(row) {
      need(id(row.sku_id)&&id(row.product_id)&&!skuIds.has(row.sku_id),'SKU_CENSUS_IDENTITY_REFUSED');skuIds.add(row.sku_id);r.sku.rows++;
      need(typeof row.present_in_catalog==='boolean'&&typeof row.enabled==='boolean','SKU_CENSUS_TYPED_PRESENCE_REQUIRED');
      if(row.present_in_catalog)r.sku.present++;if(row.enabled)r.sku.enabled++;
      if(!confirmed.has(row.mapping_status))r.sku.unconfirmedMapping++;
      const color=row.options?.COLOR?.id,size=row.options?.SIZE?.id,fit=row.fit_id;
      if(!id(color))r.sku.missingColorIdentity++;if(!id(size))r.sku.missingOriginalSizeIdentity++;if(!id(fit))r.sku.missingFitIdentity++;
      if(!id(row.standard_group_id)||!id(row.standard_size_id))r.sku.missingStandardGroupOrSize++;
      if(id(color)&&id(size)&&id(fit))increment(original,JSON.stringify([row.product_id,color,fit,size]));
      if(id(color)&&id(fit)&&id(row.standard_group_id)&&id(row.standard_size_id))increment(display,JSON.stringify([row.product_id,color,fit,row.standard_group_id,row.standard_size_id]));
    },
    run(row){need(id(row.id)&&!runs.has(row.id),'STOCK_CENSUS_RUN_IDENTITY_REFUSED');runs.add(row.id);r.stock.runs++;},
    activation(row){need(id(row.run_id),'STOCK_CENSUS_RUN_IDENTITY_REFUSED');activationRuns.push(row.run_id);r.stock.activations++;},
    generation(row){need(typeof row.active==='boolean','STOCK_CENSUS_GENERATION_FLAG_REQUIRED');r.stock.maintainedGenerations++;if(row.active)r.stock.activeMaintainedGenerations++;},
    cell(row) {
      r.stock.cells++;need(id(row.run_id),'STOCK_CENSUS_RUN_IDENTITY_REFUSED');increment(cellRuns,row.run_id);
      if(id(row.sku_id))increment(cellSkus,row.sku_id);
      if(!id(row.warehouse_id)||!id(row.sku_id)||!id(row.source_unit))r.stock.missingCellIdentity++;
      else {
        units.add(row.source_unit);const key=JSON.stringify([row.run_id,row.warehouse_id,row.sku_id]);
        const group=stockGroups.get(key)??{rows:0,units:new Set()};group.rows++;group.units.add(row.source_unit);stockGroups.set(key,group);
      }
      let left,right,valid=true;
      for(const [field,counter] of [['confirmed_opening','confirmedOpeningNull'],['source_net','sourceNetNull']]) {
        need(Object.hasOwn(row,field),'STOCK_CENSUS_QUANTITY_COLUMN_MISSING');
        if(row[field]===null)r.stock[counter]++;
        try {
          const value=scaled(row[field]);if(value!==null&&value%10000n!==0n)r.stock.fractionalQuantityComponents++;
          if(field==='confirmed_opening')left=value;else right=value;
        } catch(error) {
          if(!['STOCK_CENSUS_EXACT_QUANTITY_REQUIRED','EXACT_LEGACY_DECIMAL_SOURCE_REQUIRED'].includes(error.message))throw error;
          valid=false;r.stock.invalidQuantityComponents++;
        }
      }
      // No NULL-to-zero, no rounding and no unit conversion. Known pairs only.
      if(valid&&left!==null&&right!==null){
        r.stock.knownComponentPairs++;const total=left+right;
        if(total%10000n!==0n)r.stock.knownPairFractional++;
        if(total<0n)r.stock.knownPairNegative++;
        if(total<min*10000n||total>max*10000n)r.stock.knownPairOutsideTargetBigint++;
      } else r.stock.incompleteComponentPairs++;
    },
    finish() {
      r.stock.sourceUnitCount=units.size;
      r.sku.duplicateOriginalTupleGroups=[...original.values()].filter(n=>n>1).length;
      r.sku.duplicateStandardDisplayTupleGroups=[...display.values()].filter(n=>n>1).length;
      r.stock.duplicateWarehouseSkuGroups=[...stockGroups.values()].filter(g=>g.rows>1).length;
      r.stock.mixedUnitWarehouseSkuGroups=[...stockGroups.values()].filter(g=>g.units.size>1).length;
      for(const [run,n] of cellRuns)if(!runs.has(run))r.stock.unknownRunCells+=n;
      for(const [sku,n] of cellSkus)if(!skuIds.has(sku))r.stock.stockSkuOutsideStandardRelationRows+=n;
      r.stock.unknownRunActivations=activationRuns.filter(run=>!runs.has(run)).length;
      return structuredClone(r);
    }
  };
}

export async function readSkuStockSourceCensus(options) {
  const census=createSkuStockSourceCensus(),receipts=[];
  for(const [table,method] of [['erp_prod_runtime.standard_sku_relation','sku'],['erp_prod_runtime.inventory_stock_generation','generation'],
    ['erp_prod_runtime.inventory_formal_baseline_run','run'],['erp_prod_runtime.inventory_formal_baseline_activation','activation'],
    ['erp_prod_runtime.inventory_formal_baseline_cell','cell']]) {
    receipts.push(await consumePrivateSnapshotTable({...options,table,maxRowBytes:1048576,onRow:row=>census[method](parseLegacyJsonText(row.raw_json))}));
  }
  return {...census.finish(),sourceManifestSha256:options.expectedManifestSha256,sourceFilesConsumed:receipts.length,
    sourceRowsConsumed:receipts.reduce((n,r)=>n+BigInt(r.rows),0n).toString(),sourceFileBytes:receipts.reduce((n,r)=>n+r.bytes,0),databaseConnections:0};
}
