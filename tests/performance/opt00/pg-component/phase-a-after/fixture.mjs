/** Pure literal finite source oracle. No driver, connection, DDL or publication. */
import {createHash} from 'node:crypto';
import {buildFixture,setupInsert,checkPriceContract} from '../contract.mjs';
import {CATALOGUE_PRICE_KEYS} from '../../../../../packages/application/src/catalogue-price-input.ts';
import {need} from '../../../../integration/runtime26-baseline/schema-objects-only/lifecycle.mjs';
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};
export function afterFixture(id){need(typeof id==='string'&&/^[a-f0-9]{13}$/.test(id)&&!['c20261031f001','c20261031f002'].includes(id),'FRESH_AFTER_ID_REQUIRED');const base=buildFixture({id});
 const uuid=kind=>{const h=createHash('sha256').update('synthetic:opt01:phase-a-after:'+id+':'+kind).digest('hex');return h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-a'+h.slice(17,20)+'-'+h.slice(20,32);};
 const disabledColor={id:uuid('disabled-color'),code:'002',name:'SYNTHETIC DISABLED COLOR'},disabledFit={id:uuid('disabled-fit'),code:'B',name:'SYNTHETIC DISABLED FIT'},outsideSize={id:uuid('outside-size'),code:'999',name:'SYNTHETIC OUTSIDE GROUP'};
 const otherProduct={id:uuid('other-product'),code:base.expectedProductCode+'-COLLISION',name:'SYNTHETIC COLLIDING PRODUCT',groupId:base.groups[0].id,retailPrice:'2.50'},otherSku={id:uuid('other-sku'),code:'SYNTHETIC-OTHER-SKU-'+id};
 const bad=[{kind:'disabled-product',id:uuid('bad-product-sku'),productId:base.disabledProductId,colorId:base.colorId,fitId:base.fitId,sizeId:base.sizes[0].id},{kind:'disabled-color',id:uuid('bad-color-sku'),productId:base.productId,colorId:disabledColor.id,fitId:base.fitId,sizeId:base.sizes[0].id},{kind:'disabled-fit',id:uuid('bad-fit-sku'),productId:base.productId,colorId:base.colorId,fitId:disabledFit.id,sizeId:base.sizes[0].id},{kind:'missing-member',id:uuid('bad-member-sku'),productId:base.productId,colorId:base.colorId,fitId:base.fitId,sizeId:outsideSize.id}];
 const common={productCode:base.expectedProductCode,productName:'SYNTHETIC PRODUCT',colorId:base.colorId,colorName:'SYNTHETIC COLOR',fitId:base.fitId,fitName:'SYNTHETIC FIT',barcodeAvailability:'UNAVAILABLE'};
 const good=base.skuIds.map((id,i)=>({...common,id,skuCode:'SYNTHETIC-SKU-'+base.id+'-'+i,productId:base.productId,sizeId:base.sizes[i===0?0:22].id,sizeName:base.sizes[i===0?0:22].name,sizeGroupId:base.targetGroupId}));
 good.push({...common,id:otherSku.id,skuCode:otherSku.code,productId:otherProduct.id,productCode:otherProduct.code,productName:otherProduct.name,sizeId:base.sizes[0].id,sizeName:base.sizes[0].name,sizeGroupId:otherProduct.groupId});
 let requested=otherProduct.id>base.productId?[otherSku.id,base.skuIds[1],base.skuIds[0]]:[base.skuIds[1],otherSku.id,base.skuIds[0]];
 if(JSON.stringify(requested)===JSON.stringify([...requested].sort()))requested=otherProduct.id>base.productId?[otherSku.id,base.skuIds[0],base.skuIds[1]]:[base.skuIds[0],otherSku.id,base.skuIds[1]];
 const orderedProducts=[...new Set(requested.map(id=>good.find(s=>s.id===id).productId))];
 return freeze({format:'PHASE_A_FINITE_LITERAL_REFERENCE_V1',base,disabledColor,disabledFit,outsideSize,otherProduct,otherSku,bad,good,requested,orderedProducts,counts:{...base.counts,color:2,fit:2,size:24,product:3,sku:7},totalRows:108,unavailableActualBranch:'PENDING_GENUINE_NON_IMPORTED_PRODUCT_SOURCE_MATERIAL_NOT_FAKE_ROWS'});
}
export function extraCommands(f){need(f?.format==='PHASE_A_FINITE_LITERAL_REFERENCE_V1','FINITE_AFTER_FIXTURE_REQUIRED');const out=[],add=(t,v)=>out.push({table:t,...setupInsert(t,v)});const b=f.base,p=checkPriceContract();
 add('color',[f.disabledColor.id,f.disabledColor.code,f.disabledColor.name,false,1]);add('fit',[f.disabledFit.id,f.disabledFit.code,f.disabledFit.name,false,1]);add('size',[f.outsideSize.id,f.outsideSize.code,f.outsideSize.name]);
 add('product',[f.otherProduct.id,f.otherProduct.code,f.otherProduct.name,b.categoryId,null,null,f.otherProduct.groupId,...CATALOGUE_PRICE_KEYS.map(k=>k==='retail_price'?f.otherProduct.retailPrice:p[k]),true,1,'OPT01-COLLISION']);
 for(const x of f.bad)add('sku',[x.id,x.productId,x.colorId,x.fitId,x.sizeId,'SYNTHETIC-BAD-'+x.kind+'-'+b.id,true,1,null]);
 add('sku',[f.otherSku.id,f.otherProduct.id,b.colorId,b.fitId,b.sizes[0].id,f.otherSku.code,true,1,null]);need(out.length===9,'EXACT_NINE_EXTRA_REFERENCE_INSERTS');return freeze(out);
}

export const NEGATIVE_STORAGE_SQL=`SELECT s.id,s.product_id,s.size_id,s.enabled AS sku_enabled,p.enabled AS product_enabled,c.enabled AS color_enabled,f.enabled AS fit_enabled,m.size_id AS member_size_id FROM naijue_erp.sku s JOIN naijue_erp.product p ON p.id=s.product_id JOIN naijue_erp.color c ON c.id=s.color_id JOIN naijue_erp.fit f ON f.id=s.fit_id LEFT JOIN naijue_erp.size_group_member m ON m.size_group_id=p.size_group_id AND m.size_id=s.size_id WHERE s.id=ANY($1::uuid[]) ORDER BY s.id LIMIT $2`;
export function assertNegativeStorage(f,rows){need(rows.length===4&&new Set(rows.map(r=>r.id)).size===4,'FOUR_ACTUAL_STORAGE_NEGATIVES_REQUIRED');for(const e of f.bad){const r=rows.find(r=>r.id===e.id);need(r&&r.product_id===e.productId&&r.size_id===e.sizeId&&r.sku_enabled===true&&r.product_enabled===(e.kind!=='disabled-product')&&r.color_enabled===(e.kind!=='disabled-color')&&r.fit_enabled===(e.kind!=='disabled-fit')&&(e.kind==='missing-member'?r.member_size_id===null:r.member_size_id===e.sizeId),'EXACT_ACTUAL_NEGATIVE_STORAGE_CAUSE:'+e.kind);}return{scope:'RESTRICTED_ROLE_STORAGE_OBSERVATION_NOT_APPLICATION_QUERY_OR_PERFORMANCE',cases:f.bad.map(r=>r.kind),count:4};}
