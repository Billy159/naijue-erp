import test from 'node:test';
import assert from 'node:assert/strict';
import {createSkuStockSourceCensus} from '../scripts/import-v3/native-cleaning/sku-stock-source-census.mjs';
import {parseLegacyJsonText} from '../scripts/import-v3/native-cleaning/legacy-json.mjs';
const sku=(sku_id,size='original-size')=>({sku_id,product_id:'private-product',present_in_catalog:true,enabled:true,mapping_status:'CONFIRMED_SOURCE',fit_id:'A',options:{COLOR:{id:'original-color'},SIZE:{id:size}},standard_group_id:'display-group',standard_size_id:'display-size'});
const cell=(a,b,source_unit='private-unit')=>({run_id:'private-run',warehouse_id:'private-warehouse',sku_id:'private-sku',source_unit,confirmed_opening:a,source_net:b});
test('distinct original SKU identities stay distinct even if display size agrees',()=>{
  const c=createSkuStockSourceCensus();c.sku(sku('one','original-one'));c.sku(sku('two','original-two'));
  const r=c.finish();assert.equal(r.sku.duplicateOriginalTupleGroups,0);assert.equal(r.sku.duplicateStandardDisplayTupleGroups,1);
  assert.equal(r.identityAllocation,0);assert.equal(r.targetWrites,0);assert.equal(r.inventoryConservationVerified,false);
  assert.equal(JSON.stringify(r).includes('private-product'),false);
});
test('physical duplicate original tuple groups are detected without aliasing or deletion',()=>{
  const c=createSkuStockSourceCensus();c.sku(sku('one'));c.sku(sku('two'));assert.equal(c.finish().sku.duplicateOriginalTupleGroups,1);
  assert.throws(()=>c.sku(sku('one')),/IDENTITY_REFUSED/);
});
test('quantity tokens preserve BIGINT boundaries and fractional offsets without float arithmetic',()=>{
  const c=createSkuStockSourceCensus();c.run({id:'private-run'});c.activation({run_id:'private-run'});c.sku(sku('private-sku'));
  c.cell(parseLegacyJsonText(JSON.stringify(cell(null,null)).replace('"confirmed_opening":null','"confirmed_opening":9223372036854775807.0000').replace('"source_net":null','"source_net":0.0000')));
  c.cell(cell('9223372036854775807.0000','1.0000'));
  c.cell(cell('-2.2500','0.2500'));c.cell(cell('0.0001','0.0000'));
  const r=c.finish();assert.equal(r.stock.knownPairOutsideTargetBigint,1);assert.equal(r.stock.knownPairFractional,1);
  assert.equal(r.stock.fractionalQuantityComponents,3);assert.equal(r.stock.knownPairNegative,1);
  assert.equal(r.stock.knownComponentPairs,4);assert.equal(r.stock.unknownRunCells,0);assert.equal(r.stock.stockSkuOutsideStandardRelationRows,0);
});
test('NULL, unsupported quantities and missing identity remain separate from known zero',()=>{
  const c=createSkuStockSourceCensus();c.cell(cell(null,'0'));c.cell(cell(true,'0'));c.cell(cell('1e3','0'));c.cell({...cell('0','0'),sku_id:null});
  const r=c.finish();assert.equal(r.stock.confirmedOpeningNull,1);assert.equal(r.stock.invalidQuantityComponents,2);
  assert.equal(r.stock.incompleteComponentPairs,3);assert.equal(r.stock.knownComponentPairs,1);assert.equal(r.stock.missingCellIdentity,1);
  assert.equal(r.stock.unknownRunCells,4);assert.equal(r.stock.stockSkuOutsideStandardRelationRows,3);
  assert.throws(()=>c.cell({run_id:'run'}),/QUANTITY_COLUMN_MISSING/);
});
test('units and multiple stock contributors are counted independently, never summed across units',()=>{
  const c=createSkuStockSourceCensus();c.cell(cell('1','2','one-unit'));c.cell(cell('3','4','two-unit'));
  c.generation({active:true});c.generation({active:false});
  const r=c.finish();assert.equal(r.stock.sourceUnitCount,2);assert.equal(r.stock.duplicateWarehouseSkuGroups,1);
  assert.equal(r.stock.mixedUnitWarehouseSkuGroups,1);assert.equal(r.stock.activeMaintainedGenerations,1);
  assert.equal(Object.hasOwn(r.stock,'quantityTotal'),false);assert.equal(JSON.stringify(r).includes('one-unit'),false);
});
