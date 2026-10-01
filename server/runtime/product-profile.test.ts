import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { install } from './runtime.ts';
import { identifier, SOURCE, transaction } from './db.ts';
import { productProfiles, saveProductProfile, deleteProduct } from './product-profile.ts';
import { changeProductMaster } from './product-master.ts';
import { compatibleFit } from '../adapter.mjs';
import { sizeMapping } from './size-mapping.ts';
import {currentSizeGroups} from '../../frontend/product-size-groups.mjs';

const schema = 'v2_runtime_test_product_' + Date.now();
await install(schema);
try {
  const products = (await transaction(schema, tx => tx.query(
    `SELECT p.id,p.name,c.code category_code,v.id sku_id
     FROM ${SOURCE}.product p JOIN ${SOURCE}.category c ON c.id=p.category_id
     JOIN ${SOURCE}.variant v ON v.product_id=p.id
     WHERE p.enabled AND p.code IN ('000JK0000006','026MS5133001') ORDER BY p.code LIMIT 2`
  ))).rows;
  assert.equal(products.length, 2);
  const [first, second] = products;
  const alias = 'PROFILE-TEST-' + randomUUID();
  const required={year:'2026',season:'秋季',barcodeItemCode:'7664320'};
  const profile = { ...required, name: first.name, categoryId: first.category_code, groupId: 'UPPER', images: [] };
  for(const [field,message] of [['year','请选择年份'],['season','请选择季节'],['barcodeItemCode','请填写系统货号']]){
    for(const value of [undefined,'','   '])await assert.rejects(saveProductProfile({productId:first.id,expectedVersion:0,profile:{...profile,[field]:value}},schema),new RegExp(message));
  }
  assert.equal((await productProfiles(schema)).profiles.length,0,'incomplete profiles never write');
  const saved = await saveProductProfile({ productId: first.id, expectedVersion: 0, profile,
    aliases: [{ skuId: first.sku_id, code: alias, note: '历史规格：165/84A' }] }, schema);
  assert.equal(saved.version, 1);
  const all = await productProfiles(schema);
  assert.equal(all.profiles.find(x => x.product_id === first.id)?.body.name, first.name);
  assert.equal(all.aliases.find(x => x.barcode === alias)?.historical_note, '历史规格：165/84A');
  assert.equal(all.aliases.find(x => x.barcode === alias)?.origin, 'MANUAL');
  const importedAlias = 'IMPORTED-TEST-' + randomUUID();
  await transaction(schema, tx => tx.query("INSERT INTO product_barcode_alias(barcode,product_id,sku_id,historical_note) VALUES($1,$2::uuid,$3::uuid,'原始兼容条码') RETURNING barcode", [importedAlias, first.id, first.sku_id]));
  await assert.rejects(saveProductProfile({ productId: first.id, expectedVersion: 0, profile }, schema), /PRODUCT_VERSION_CONFLICT/);
  await assert.rejects(saveProductProfile({ productId: second.id, expectedVersion: 0,
    profile: { ...required,barcodeItemCode:'7664322',name: second.name, categoryId: second.category_code, images: [] },
    aliases: [{ skuId: second.sku_id, code: alias }] }, schema), /BARCODE_ALREADY_BOUND/);
  const sourceSpecs = (await transaction(schema, tx => tx.query(
    `SELECT v.id sku_id,c.spec_value_id color_id,z.spec_value_id size_id,s.name size_name,s.code size_code,f.name fit_name
     FROM ${SOURCE}.variant v
     JOIN ${SOURCE}.variant_option c ON c.variant_id=v.id
     JOIN ${SOURCE}.spec_dimension cd ON cd.id=c.dimension_id AND cd.code='COLOR'
     JOIN ${SOURCE}.variant_option z ON z.variant_id=v.id
     JOIN ${SOURCE}.spec_dimension zd ON zd.id=z.dimension_id AND zd.code='SIZE'
     JOIN ${SOURCE}.spec_value s ON s.id=z.spec_value_id
     JOIN ${SOURCE}.product p ON p.id=v.product_id LEFT JOIN ${SOURCE}.fit f ON f.id=p.fit_id
     WHERE v.product_id=$1::uuid`, [first.id]
  ))).rows;
  const upper=currentSizeGroups().find(x=>x.id==='UPPER');
  const sizes = [...new Map(sourceSpecs.map(x => {
    const name=sizeMapping.get(x.sku_id)?.targetSize;
    const currentSize=upper.sizes.find(size=>size.name===name);
    assert.ok(currentSize,'audited source size must be in the current group');
    return [name,{...currentSize,groupName:upper.name}];
  })).values()];
  assert.deepEqual(sizes.map(x => x.name), ['175/L']);
  const extra = {...upper.sizes.find(x=>x.name==='170/M'),groupName:upper.name};
  const specs = { colors: [...new Set(sourceSpecs.map(x => x.color_id))], sizes: [...sizes, extra], fits: [compatibleFit(sourceSpecs[0].fit_name).id] };
  const withSpecs = await saveProductProfile({ productId: first.id, expectedVersion: 1, profile, specs }, schema);
  assert.equal(withSpecs.created.length, 1, 'the original audited SKU is reused; only the new size creates a SKU');
  assert.ok(withSpecs.created.every(x => x.skuId !== first.sku_id));
  assert.equal((await productProfiles(schema)).aliases.find(x => x.barcode === importedAlias)?.origin, 'MIGRATED');
  const savedProfile = (await productProfiles(schema)).profiles.find(x => x.product_id === first.id);
  assert.ok(savedProfile?.body.specSizeRecords.some(x => x.name === extra.name));
  const extraSku = withSpecs.created.find(x => x.sizeName === extra.name);
  await transaction(schema, tx => tx.query('INSERT INTO product_barcode_alias(barcode,product_id,sku_id) VALUES($1,$2::uuid,$3::uuid) RETURNING barcode', ['PROFILE-EXTRA-' + randomUUID(), first.id, extraSku.skuId]));
  await assert.rejects(saveProductProfile({ productId: first.id, expectedVersion: 2, profile, specs: { ...specs, sizes } }, schema), /已有 SKU/);
  await assert.rejects(saveProductProfile({ productId: first.id, expectedVersion: 2, profile, specs: { ...specs, sizes: [extra] } }, schema), /已有原始 SKU/);

  await saveProductProfile({ productId: first.id, expectedVersion: 2, profile, removedAliases: [alias,importedAlias] }, schema);
  const remainingAliases = (await productProfiles(schema)).aliases.filter(x => x.product_id === first.id);
  assert.ok(!remainingAliases.some(x => x.barcode === alias));
  assert.ok(!remainingAliases.some(x => x.barcode === importedAlias));
  assert.ok((await productProfiles(schema)).profiles.find(x=>x.product_id===first.id)?.body.specSizeRecords.some(x=>x.name===extra.name),'base edit preserves saved SKU mapping');
  const knit = (await transaction(schema, tx => tx.query(`SELECT p.id,p.name,c.code category_code FROM ${SOURCE}.product p JOIN ${SOURCE}.category c ON c.id=p.category_id WHERE p.code='026MS5133001'`))).rows[0];
  const knitRows = (await transaction(schema, tx => tx.query(`SELECT v.id sku_id,c.spec_value_id color_id FROM ${SOURCE}.variant v JOIN ${SOURCE}.variant_option c ON c.variant_id=v.id JOIN ${SOURCE}.spec_dimension d ON d.id=c.dimension_id AND d.code='COLOR' WHERE v.product_id=$1::uuid`, [knit.id]))).rows;
  const knitColors = [...new Set(knitRows.map(x => x.color_id))];
  const knitSizes = [...new Set(knitRows.map(x => sizeMapping.get(x.sku_id)?.targetSize).filter(Boolean))];
  assert.ok(knitColors.length > 5 && knitSizes.length > 5);
  const addedColor = randomUUID();
  await changeProductMaster({kind:'colors',id:addedColor,action:'save',body:{name:'新增组合测试色',code:'TEST-'+addedColor.slice(0,8)}},schema);
  const knitResult = await saveProductProfile({productId:knit.id,expectedVersion:0,profile:{...required,barcodeItemCode:'7664323',name:knit.name,categoryId:knit.category_code,groupId:'UPPER',images:[]},
    specs:{colors:[...knitColors,addedColor],fits:['A'],sizes:knitSizes.map(name=>({...upper.sizes.find(x=>x.name===name),groupName:upper.name}))}},schema);
  assert.equal(knitResult.created.length,knitSizes.length,'adding a color creates only its combinations, not gaps in the original matrix');
  assert.ok(knitResult.created.every(x=>x.colorId===addedColor));
  const noSku = (await transaction(schema,tx=>tx.query(`SELECT p.id,p.name,c.code category_code FROM ${SOURCE}.product p JOIN ${SOURCE}.category c ON c.id=p.category_id WHERE NOT EXISTS (SELECT 1 FROM ${SOURCE}.variant v WHERE v.product_id=p.id) LIMIT 1`))).rows[0];
  assert.ok(noSku);
  assert.equal((await saveProductProfile({productId:noSku.id,expectedVersion:0,profile:{...required,barcodeItemCode:'7664324',name:noSku.name,categoryId:noSku.category_code,images:[]}},schema)).created.length,0);
  const validColor=(await transaction(schema,tx=>tx.query(`SELECT s.id FROM ${SOURCE}.spec_value s JOIN ${SOURCE}.spec_dimension d ON d.id=s.dimension_id AND d.code='COLOR' WHERE s.code ~ '^\\d{3}$' LIMIT 1`))).rows[0];
  assert.ok(validColor);
  const newProductId = randomUUID(),newCode='PC'+randomUUID().replaceAll('-','').slice(0,12);
  const testGroup={id:'PROFILETEST',name:'测试尺码组',sizes:[{id:'first-test-size',name:'测试尺码A',code:'888'},{id:'second-test-size',name:'测试尺码B',code:'889'}]};
  // Seed a pre-existing custom group fixture; users can no longer add or edit groups.
  await transaction(schema,tx=>tx.query("INSERT INTO product_master_overlay(kind,id,body) VALUES('groups',$1,$2::jsonb) RETURNING id",[testGroup.id,JSON.stringify(testGroup)]));
  const newProfile={...required,name:'新商品持久化测试',categoryId:first.category_code,supplierId:randomUUID(),fitId:'A',fitIds:['A'],groupId:testGroup.id,schemeId:'2026',barcodeItemCode:'7664321',images:[]};
  const newSaved=await saveProductProfile({productId:newProductId,newCode,expectedVersion:0,profile:newProfile,specs:{colors:[validColor.id],sizes:[{id:'first-test-size',name:'测试尺码A',code:'888',groupName:'测试尺码组'}],fits:['A']}},schema);
  assert.equal(newSaved.created.length,1);
  const createdRows=(await transaction(schema,tx=>tx.query('SELECT code,body FROM product_overlay WHERE id=$1::uuid',[newProductId]))).rows;
  assert.equal(createdRows[0].code,newCode);
  assert.match(createdRows[0].body.barcodeItemCode,/^\d{7}$/);
  const firstBarcode=(await transaction(schema,tx=>tx.query('SELECT barcode,scheme_id FROM generated_barcode WHERE sku_id=$1::uuid',[newSaved.created[0].skuId]))).rows[0];
  assert.equal(firstBarcode.scheme_id,'2026');
  assert.equal((await deleteProduct({productId:newProductId,expectedVersion:1,checkOnly:true},schema)).canDelete,true);
  assert.equal((await transaction(schema,tx=>tx.query('SELECT id FROM product_overlay WHERE id=$1::uuid',[newProductId]))).rowCount,1);
  const existingSize=createdRows[0].body.specSizeRecords[0];
  const switched=await saveProductProfile({productId:newProductId,expectedVersion:1,profile:{...newProfile,barcodeItemCode:createdRows[0].body.barcodeItemCode,schemeId:'2023'},specs:{colors:[validColor.id],sizes:[{...testGroup.sizes[0],groupName:testGroup.name},{id:'second-test-size',name:'测试尺码B',code:'889',groupName:'测试尺码组'}],fits:['A']}},schema);
  assert.equal(switched.created.length,1);
  const secondBarcode=(await transaction(schema,tx=>tx.query('SELECT barcode,scheme_id FROM generated_barcode WHERE sku_id=$1::uuid',[switched.created[0].skuId]))).rows[0];
  assert.equal(secondBarcode.scheme_id,'2023');
  assert.equal((await transaction(schema,tx=>tx.query('SELECT barcode FROM generated_barcode WHERE sku_id=$1::uuid',[newSaved.created[0].skuId]))).rows[0].barcode,firstBarcode.barcode);
  await assert.rejects(saveProductProfile({productId:newProductId,expectedVersion:2,profile:{...newProfile,barcodeItemCode:createdRows[0].body.barcodeItemCode},removedAliases:[firstBarcode.barcode]},schema),/主条码不允许删除/);
  await assert.rejects(saveProductProfile({productId:newProductId,expectedVersion:2,profile:{...newProfile,barcodeItemCode:createdRows[0].body.barcodeItemCode},specs:{colors:[validColor.id],fits:['A'],sizes:[{id:'retired-id',name:'历史旧尺码',code:'999',groupName:testGroup.name}]}},schema),/当前尺码组选择/);
  const warehouse=(await transaction(schema,tx=>tx.query(`SELECT id FROM ${SOURCE}.warehouse LIMIT 1`))).rows[0].id;
  await transaction(schema,tx=>tx.query('INSERT INTO inventory_delta(warehouse_id,sku_id,quantity) VALUES($1::uuid,$2::uuid,1) RETURNING sku_id',[warehouse,newSaved.created[0].skuId]));
  await assert.rejects(deleteProduct({productId:newProductId,expectedVersion:2},schema),/库存不为 0/);
  await transaction(schema,tx=>tx.query('DELETE FROM inventory_delta WHERE sku_id=$1::uuid RETURNING sku_id',[newSaved.created[0].skuId]));
  assert.equal((await deleteProduct({productId:newProductId,expectedVersion:2},schema)).deleted,true);
  assert.equal((await transaction(schema,tx=>tx.query('SELECT id FROM product_overlay WHERE id=$1::uuid',[newProductId]))).rowCount,0);
  const oldColor=randomUUID(),oldProductId=randomUUID();
  await changeProductMaster({kind:'colors',id:oldColor,action:'save',body:{name:'测试旧方案颜色',code:'1'}},schema);
  await transaction(schema,tx=>tx.query("INSERT INTO product_master_overlay(kind,id,body) VALUES('groups','OLDTEST',$1::jsonb) RETURNING id",[JSON.stringify({name:'测试旧尺码组',sizes:[{id:'old-test-size',name:'测试旧尺码',code:'11'}]})]));
  const oldSaved=await saveProductProfile({productId:oldProductId,newCode:'OLD'+randomUUID().replaceAll('-','').slice(0,12),expectedVersion:0,
    profile:{...newProfile,groupId:'OLDTEST',schemeId:'2018',freeCode:''},specs:{colors:[oldColor],sizes:[{id:'old-test-size',name:'测试旧尺码',code:'11',groupName:'测试旧尺码组'}],fits:['A']}},schema);
  const oldBarcode=(await transaction(schema,tx=>tx.query('SELECT barcode,scheme_id FROM generated_barcode WHERE sku_id=$1::uuid',[oldSaved.created[0].skuId]))).rows[0];
  assert.match(oldBarcode.barcode,/^8\d{8}$/);
  assert.equal(oldBarcode.scheme_id,'2018');
  assert.match((await productProfiles(schema)).profiles.find(x=>x.product_id===oldProductId)?.body.freeCode,/^\d{5}$/);
  await deleteProduct({productId:oldProductId,expectedVersion:1},schema);
  await changeProductMaster({kind:'colors',id:oldColor,action:'delete'},schema);
  const originalBarcode=(await transaction(schema,tx=>tx.query(`SELECT barcode FROM ${SOURCE}.tplus_product_barcode WHERE product_id=$1::uuid LIMIT 1`,[first.id]))).rows[0];
  if(originalBarcode){
   await saveProductProfile({productId:first.id,expectedVersion:3,profile,removedAliases:[originalBarcode.barcode]},schema);
   assert.ok((await productProfiles(schema)).profiles.find(x=>x.product_id===first.id).body.removedHistoricalBarcodes.includes(originalBarcode.barcode));
   assert.equal((await transaction(schema,tx=>tx.query(`SELECT barcode FROM ${SOURCE}.tplus_product_barcode WHERE product_id=$1::uuid AND barcode=$2`,[first.id,originalBarcode.barcode]))).rowCount,1,'historical source fact remains intact');
  }
  console.log('product profile persistence and barcode uniqueness passed');
} finally {
  await transaction('public', tx => tx.execute(`DROP SCHEMA ${identifier(schema)} CASCADE`));
}
