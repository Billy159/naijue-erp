import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { transaction, SOURCE } from './db.ts';
import { sizeMapping } from './size-mapping.ts';
import { product as adaptProduct, FITS } from '../adapter.mjs';
import {currentSizeGroups} from '../../frontend/product-size-groups.mjs';
import { currentSpecView } from '../../frontend/product-spec-view.mjs';

const groups=currentSizeGroups();
const rows = (await transaction('public', tx => tx.query(`
 SELECT v.id sku_id,v.product_id,p.code product_code,p.name product_name,p.enabled product_enabled,
 f.name fit_name,c.id color_id,c.name color_name,c.code color_code,c.enabled color_enabled,
 s.id size_id,s.name size_name,s.code size_code
 FROM ${SOURCE}.variant v
 JOIN ${SOURCE}.product p ON p.id=v.product_id
 LEFT JOIN ${SOURCE}.fit f ON f.id=p.fit_id
 JOIN ${SOURCE}.variant_option co ON co.variant_id=v.id
 JOIN ${SOURCE}.spec_dimension cd ON cd.id=co.dimension_id AND cd.code='COLOR'
 JOIN ${SOURCE}.spec_value c ON c.id=co.spec_value_id
 JOIN ${SOURCE}.variant_option so ON so.variant_id=v.id
 JOIN ${SOURCE}.spec_dimension sd ON sd.id=so.dimension_id AND sd.code='SIZE'
 JOIN ${SOURCE}.spec_value s ON s.id=so.spec_value_id
 ORDER BY p.code,v.id
 `))).rows;
assert.equal(rows.length, 14864);
const colors = [...new Map(rows.map((row:any) => [row.color_id, {id:row.color_id,name:row.color_name,code:row.color_code,enabled:row.color_enabled}])).values()];
const C = { groups, colors, fits:FITS, group:(id:string)=>groups.find((group:any)=>group.id===id) };
const catalogProducts = (await transaction('public',tx=>tx.query(`SELECT p.id,p.code,p.name,p.enabled,f.name fit_name FROM ${SOURCE}.product p LEFT JOIN ${SOURCE}.fit f ON f.id=p.fit_id ORDER BY p.code`))).rows;
const byProduct = new Map<string, any[]>();
for (const row of rows) {
 const list = byProduct.get(row.product_id)||[];
 const mapping = sizeMapping.get(row.sku_id);
 list.push({id:row.sku_id,product_id:row.product_id,options:{
  COLOR:{id:row.color_id,name:row.color_name,code:row.color_code},
  SIZE:{id:row.size_id,sourceName:row.size_name,sourceCode:row.size_code,
   name:mapping?.sourceCode==='910'&&mapping?.sourceSize==='无尺码'?'无尺码':mapping?.targetSize||row.size_name,
   code:mapping?.target?.[2]||row.size_code,currentGroupId:mapping?.targetGroup,
   standardGroup:mapping?.target?.[0]}
 },historicalUnmappedReason:mapping?undefined:'MISSING_SIZE_MAPPING'});
 byProduct.set(row.product_id,list);
}
const products = new Map<string, any>();
let mapped = 0, ambiguous = 0;
for (const row of catalogProducts) {
 const list = byProduct.get(row.id)||[];
 const source = adaptProduct({...row,attributes:{}},list,[],[]);
 const current = currentSpecView(source,list,C);
 assert.ok(Array.isArray(current.selectedColorIds)&&Array.isArray(current.selectedFitIds)&&Array.isArray(current.selectedSizeIds));
 assert.ok(current.mappedCurrentSkuIds.every((id:string)=>list.some(sku=>sku.id===id)));
 products.set(source.id,current);
 mapped += current.mappedCurrentSkuIds.length;
 ambiguous += current.ambiguousCurrentCells.length;
}
assert.equal(products.size,2941);
const women=products.get('501XF6365882');assert.ok(women);assert.equal(women.groupId,'WOMEN');
const womenSmall=sizeMapping.get('4150bd33-f5f2-99dc-61f0-4c0f22c07add');assert.ok(womenSmall);
assert.equal(womenSmall.sourceCode,'772');assert.equal(womenSmall.sourceSize,'155/82B S');
assert.equal(womenSmall.targetSize,'155/S');assert.equal(womenSmall.target[2],'252');
assert.equal(sizeMapping.get('ff992176-8e0f-49c2-6573-b99147b095c2')?.targetSize,'175/2XL');
const knit = products.get('026MS5133001'),old = products.get('000JK0000006');
assert.ok(knit&&old);
assert.ok(knit.selectedColorIds.length>=10 && knit.selectedSizeIds.length>=9);
assert.equal(old.selectedSizeIds.length,groups.find((group:any)=>group.id===old.groupId).sizes.length, 'Current selection covers the whole group; original SKU mappings remain separate');
const firstSize=groups.find((group:any)=>group.id===knit.groupId).sizes.find((size:any)=>size.id===knit.selectedSizeIds[0]);
const addedFit=knit.selectedFitIds.includes('B')?'C':'B';
const addedSku={id:'overlay-test-sku',product_id:knit.uuid,overlay:true,fit_id:addedFit,options:{
 COLOR:{id:knit.selectedColorIds[0]},SIZE:{id:'persisted-size-id',name:firstSize.name}
}};
const projected=currentSpecView({
 ...knit,profileVersion:1,selectedFitIds:[...knit.selectedFitIds,addedFit],
 specSizeRecords:[{id:'persisted-size-id',uiSizeId:firstSize.id,name:firstSize.name,groupName:groups.find((group:any)=>group.id===knit.groupId).name}]
},[...byProduct.get(knit.uuid),addedSku],C);
assert.equal(projected.currentSkuByUiCell[knit.selectedColorIds[0]+'|'+addedFit+'|'+firstSize.id],addedSku.id);
assert.ok(projected.mappedCurrentSkuIds.includes(addedSku.id));
const retiredView=currentSpecView({...knit,selectedSizeIds:[...knit.selectedSizeIds,'retired-old-size-id']},byProduct.get(knit.uuid),C);
assert.ok(!retiredView.selectedSizeIds.includes('retired-old-size-id'));
const duplicate={...byProduct.get(knit.uuid)[0],id:'ambiguous-test-sku'};
const ambiguousView=currentSpecView({...knit},[...byProduct.get(knit.uuid),duplicate],C);
assert.ok(ambiguousView.ambiguousCurrentCells.length>=1);
assert.ok(!ambiguousView.mappedCurrentSkuIds.includes(duplicate.id));
const negative = (await transaction('public',tx=>tx.query(`SELECT count(*)::int n FROM ${SOURCE}.tplus_inventory_balance_source WHERE quantity<0`))).rows[0].n;
const historicalProducts = [...products.values()].flatMap(product => {
 const mappedIds = new Set(product.mappedCurrentSkuIds);
 const originalRows = rows.filter((row:any) => row.product_id === product.uuid && !mappedIds.has(row.sku_id));
 if (!originalRows.length) return [];
 return [{code:product.id,name:product.name,currentGroupId:product.groupId,
  historicalSkus:originalRows.map((row:any) => ({skuId:row.sku_id,color:row.color_name,
   colorEnabled:row.color_enabled,size:row.size_name,sizeCode:row.size_code,fit:row.fit_name,
   targetSize:sizeMapping.get(row.sku_id)?.targetSize || null,
   ambiguous:product.ambiguousCurrentCells.some((cell:any)=>cell.ids.includes(row.sku_id))}))}];
});
assert.equal(historicalProducts.reduce((sum,product)=>sum+product.historicalSkus.length,0),rows.length-mapped);
const summary = {products:products.size,sourceSkus:rows.length,audited:sizeMapping.size,currentMappedSkus:mapped,
 historicalSkus:rows.length-mapped,historicalProducts:historicalProducts.length,ambiguousCells:ambiguous,
 negativeStockRows:negative,knitColors:knit.selectedColorIds.length,knitSizes:knit.selectedSizeIds.length,oldSizes:old.selectedSizeIds.length};
if (process.env.PRODUCT_SPEC_AUDIT_OUTPUT) writeFileSync(process.env.PRODUCT_SPEC_AUDIT_OUTPUT,
 JSON.stringify({summary,products:historicalProducts},null,2)+'\n');
console.log(JSON.stringify(summary));
