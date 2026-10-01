import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import {install,RUNTIME} from './runtime.ts';
import {transaction,SOURCE,identifier} from './db.ts';
import {excelManagedProduct} from './excel-barcode-authority.ts';
import {productProfiles,saveProductProfile} from './product-profile.ts';
import {sizeMapping} from './size-mapping.ts';
import {currentSizeGroups} from '../../frontend/product-size-groups.mjs';

// Reproduce the workbook-managed product in a disposable overlay, never the live catalog.
const schema='v2_runtime_test_manual_alias_'+randomUUID().replaceAll('-','');
const results:string[]=[];
// Execute the real catalog read branch; only its IO uses the disposable overlay.
const http=readFileSync(new URL('./http.ts',import.meta.url),'utf8');
const start=http.indexOf(" if(url.pathname==='/runtime/catalog'){");
const end=http.indexOf(" if(url.pathname==='/runtime/inventory'){",start);
assert.ok(start>=0&&end>start);
const catalogBranch=stripTypeScriptTypes('(async()=>{'+http.slice(start,end)+'})()');
const readCatalog=async()=>{
 let data:any;
 await vm.runInNewContext(catalogBranch,{url:new URL('http://127.0.0.1/runtime/catalog'),SOURCE,
  q:(sql:string,args:any[]=[])=>transaction(schema,tx=>tx.query(sql,args)),
  installBarcodes:async()=>{},productProfiles:()=>productProfiles(schema),sizeMapping,currentSizeGroups,colorSplits:{},
  send:(value:any)=>{data=value}});
 return data;
};
await install(schema);
try {
 const fixture=(await transaction(schema,tx=>tx.query(`SELECT p.id,p.body->>'name' name,p.body->>'categoryId' category_code,g.sku_id,g.barcode
  FROM ${identifier(RUNTIME)}.product_overlay p
  JOIN ${identifier(RUNTIME)}.generated_barcode g ON g.product_id=p.id
  WHERE p.code='501XF5395665' AND g.barcode='95395665701503'`))).rows[0];
 assert.ok(fixture,'the reported product and confirmed primary barcode must exist');
 await transaction(schema,async tx=>{
  await tx.execute(`INSERT INTO barcode_authority_policy SELECT * FROM ${identifier(RUNTIME)}.barcode_authority_policy`);
  await tx.query(`INSERT INTO barcode_authority_product SELECT * FROM ${identifier(RUNTIME)}.barcode_authority_product WHERE product_id=$1::uuid RETURNING product_id`,[fixture.id]);
  await tx.query(`INSERT INTO generated_barcode SELECT * FROM ${identifier(RUNTIME)}.generated_barcode WHERE product_id=$1::uuid RETURNING sku_id`,[fixture.id]);
  await tx.query(`INSERT INTO product_overlay SELECT * FROM ${identifier(RUNTIME)}.product_overlay WHERE id=$1::uuid RETURNING id`,[fixture.id]);
  await tx.query(`INSERT INTO variant_overlay(id,product_id,color_id,size_id,fit_id,size_name,size_code,group_name,created_at)
   SELECT id,product_id,color_id,size_id,fit_id,size_name,size_code,group_name,created_at FROM ${identifier(RUNTIME)}.variant_overlay WHERE product_id=$1::uuid RETURNING id`,[fixture.id]);
  await tx.query(`INSERT INTO barcode_authority_record SELECT * FROM ${identifier(RUNTIME)}.barcode_authority_record WHERE product_id=$1::uuid RETURNING sku_id`,[fixture.id]);
  await tx.execute(`INSERT INTO product_master_overlay SELECT * FROM ${identifier(RUNTIME)}.product_master_overlay WHERE kind='colors' AND id IN (SELECT color_id::text FROM variant_overlay)`);
  assert.equal(await excelManagedProduct(tx,fixture.id),true,'exercise the actual Excel protection condition');
 });
 const immutable=()=>transaction(schema,tx=>tx.query(`SELECT
  (SELECT jsonb_agg(to_jsonb(g) ORDER BY sku_id) FROM generated_barcode g) main,
  (SELECT jsonb_agg(to_jsonb(r) ORDER BY sku_id) FROM barcode_authority_record r) authority,
  (SELECT jsonb_agg(to_jsonb(v) ORDER BY id) FROM variant_overlay v) runtime_skus,
  (SELECT jsonb_agg(to_jsonb(v) ORDER BY id) FROM ${SOURCE}.variant v WHERE product_id=$1::uuid) source_skus,
  (SELECT jsonb_agg(to_jsonb(b) ORDER BY barcode) FROM ${SOURCE}.tplus_product_barcode b WHERE product_id=$1::uuid) source_barcodes,
  (SELECT count(*) FROM variant_overlay) new_skus,
  (SELECT count(*) FROM inventory_delta) stock_effects`,[fixture.id])).then(r=>r.rows[0]);
 const before=await immutable();
 const profile={name:fixture.name,categoryId:fixture.category_code,year:'2026',season:'秋季',barcodeItemCode:'5395665',groupId:'UPPER',images:[]};
 const code='000旧条码-'+randomUUID(),note='历史规格：170/88A';
 const alias={skuId:fixture.sku_id,code,note};
 const save=(expectedVersion:number,aliases:any[],extra:any={})=>saveProductProfile({productId:fixture.id,expectedVersion,profile,aliases,...extra},schema);
 const first=await save(0,[alias]);
 assert.equal(first.version,1);assert.deepEqual(first.created,[]);
 let persisted=(await productProfiles(schema)).aliases.find(row=>row.barcode===code);
 assert.equal(persisted?.sku_id,fixture.sku_id);
 assert.equal(persisted?.product_id,fixture.id);
 assert.equal(persisted?.origin,'MANUAL');assert.equal(persisted?.historical_note,note);
 results.push('manual old barcode on Excel-managed SKU saves and reloads exact string, note and original identity');
 const retired='UNAPPROVED-MIGRATED-'+randomUUID();
 await transaction(schema,tx=>tx.query("INSERT INTO product_barcode_alias(barcode,product_id,sku_id,origin) VALUES($1,$2::uuid,$3::uuid,'MIGRATED') RETURNING barcode",[retired,fixture.id,fixture.sku_id]));
 const catalog=await readCatalog();
 assert.equal(catalog.aliases.find((row:any)=>row.barcode===code)?.sku_id,fixture.sku_id,'the actual catalog endpoint must expose the saved manual alias');
 assert.equal(catalog.aliases.some((row:any)=>row.barcode===retired),false,'retired/generated historical aliases stay excluded');
 const fixtureCatalog={...catalog,products:catalog.products.filter((p:any)=>p.id===fixture.id),skus:catalog.skus.filter((s:any)=>s.product_id===fixture.id),barcodes:catalog.barcodes.filter((b:any)=>b.product_id===fixture.id),profiles:catalog.profiles.filter((p:any)=>p.product_id===fixture.id)};
 writeFileSync(new URL('../../data-cleaning/verification/consolidation-20261001/old-barcode-saved-catalog.json',import.meta.url),JSON.stringify({catalog:fixtureCatalog,code,note,skuId:fixture.sku_id}));
 results.push('catalog read exposes manual aliases, retains approved primary codes and excludes retired inferred aliases');
 assert.equal((await save(1,[alias])).version,2);
 assert.equal((await productProfiles(schema)).aliases.filter(row=>row.barcode===code).length,1);
 results.push('later product save retains the existing alias without duplicating it');
 const sibling=(await transaction(schema,tx=>tx.query('SELECT sku_id FROM generated_barcode WHERE sku_id<>$1::uuid LIMIT 1',[fixture.sku_id]))).rows[0];
 assert.ok(sibling);
 await assert.rejects(save(2,[{...alias,skuId:sibling.sku_id}]),/BARCODE_ALREADY_BOUND/);
 await assert.rejects(save(2,[{...alias,code:fixture.barcode}]),/BARCODE_ALREADY_BOUND/);
 const imported=(await transaction(schema,tx=>tx.query(`SELECT barcode FROM ${SOURCE}.tplus_product_barcode WHERE sku_id IS NOT NULL LIMIT 1`))).rows[0];
 if(imported)await assert.rejects(save(2,[{...alias,code:imported.barcode}]),/BARCODE_ALREADY_BOUND/);
 const other=(await transaction(schema,tx=>tx.query(`SELECT p.id,p.name,c.code category_code,v.id sku_id FROM ${SOURCE}.product p
  JOIN ${SOURCE}.category c ON c.id=p.category_id JOIN ${SOURCE}.variant v ON v.product_id=p.id
  WHERE p.id<>$1::uuid LIMIT 1`,[fixture.id]))).rows[0];
 await assert.rejects(save(2,[{...alias,code:'UNOWNED-'+randomUUID(),skuId:other.sku_id}]),/INVALID_COMPATIBLE_BARCODE/);
 await assert.rejects(save(2,[{...alias,code:'   '}]),/INVALID_COMPATIBLE_BARCODE/);
 await assert.rejects(save(2,[{...alias,code:'TOO-LONG-'.repeat(11)}]),/INVALID_COMPATIBLE_BARCODE/);
 await assert.rejects(save(2,[alias,alias]),/INVALID_COMPATIBLE_BARCODE/);
 await assert.rejects(saveProductProfile({productId:other.id,expectedVersion:0,
  profile:{...profile,name:other.name,categoryId:other.category_code,barcodeItemCode:'7654321'},
  aliases:[{...alias,skuId:other.sku_id}]},schema),/BARCODE_ALREADY_BOUND/);
 await assert.rejects(save(0,[alias]),/PRODUCT_VERSION_CONFLICT/);
 results.push('duplicate main/other-SKU codes, wrong ownership, blank/long codes and stale saves are rejected atomically');
 assert.equal((await productProfiles(schema)).profiles.find(row=>row.product_id===fixture.id)?.version,2);
 await assert.rejects(save(2,[],{removedAliases:[fixture.barcode]}),/主条码不允许删除/);
 assert.equal((await save(2,[],{removedAliases:[code]})).version,3);
 assert.equal((await productProfiles(schema)).aliases.some(row=>row.barcode===code),false);
 assert.equal((await readCatalog()).aliases.some((row:any)=>row.barcode===code),false);
 assert.deepEqual(await immutable(),before,'manual aliases never rewrite primary codes, authority facts, source SKUs or inventory');
 results.push('manual alias removal works; protected main codes, authority records, source SKUs and stock remain identical');
 console.log(JSON.stringify({schema,results},null,2));
} finally {
 await transaction(schema,tx=>tx.execute(`DROP SCHEMA ${identifier(schema)} CASCADE`));
 console.log('Isolated manual-alias schema removed');
}
