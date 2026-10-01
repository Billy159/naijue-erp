import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {transaction,SOURCE,literal,Transaction} from './db.ts';
import {RUNTIME} from './runtime.ts';
import {installSchemeSupplement,approvedSchemeSupplement,stageSchemeSupplement,persistSchemeSupplement,supplementRevision} from './barcode-scheme-supplement.ts';

const ddl=readFileSync(new URL('./excel-barcode-authority.sql',import.meta.url),'utf8');
export const authorityRevision='excel-original-20260930-v1';

export async function installExcelBarcodeAuthority(tx:Transaction){await tx.execute(ddl);await installSchemeSupplement(tx);}
export async function excelBarcodePolicy(tx:Transaction){
 const present=(await tx.query("SELECT to_regclass('barcode_authority_policy') IS NOT NULL present")).rows[0].present;
 return present?(await tx.query('SELECT revision,source_sha256,body FROM barcode_authority_policy WHERE singleton')).rows[0]||null:null;
}
export async function excelManagedProduct(tx:Transaction,productId:string){
 if(!await excelBarcodePolicy(tx))return false;
 return (await tx.query('SELECT 1 FROM barcode_authority_product WHERE product_id=$1::uuid',[productId])).rowCount>0;
}
export function approvedExcelManifest(){
 const manifest=JSON.parse(readFileSync(new URL('./excel-barcode-authority-20260930.json',import.meta.url),'utf8'));
 const input=readFileSync(new URL('../../'+manifest.sourcePath,import.meta.url));
 if(createHash('sha256').update(input).digest('hex')!==manifest.sourceSha256)throw Error('APPROVED_EXCEL_HASH_MISMATCH');
 return manifest;
}

/** Replay opaque barcode facts. Never reads a goods, color or size segment from a barcode. */
export async function applyExcelBarcodeAuthority(manifest=approvedExcelManifest(),schema=RUNTIME){
 if(manifest.revision!==authorityRevision||manifest.sourceFile!=='基本数据对照表.xls')throw Error('UNAPPROVED_EXCEL_AUTHORITY');
 const records=manifest.records,active=records.filter((r:any)=>r.status==='ACTIVE');
 if(records.length!==10684||active.length!==10682||new Set(records.map((r:any)=>r.skuId)).size!==records.length||new Set(active.map((r:any)=>r.barcode)).size!==active.length)throw Error('EXCEL_AUTHORITY_SCOPE_INVALID');
 if(records.some((r:any)=>typeof r.barcode!=='string'||!r.barcode||r.barcode!==r.barcode.trim()))throw Error('EXCEL_BARCODE_MUST_BE_EXACT_TEXT');
 const supplement=approvedSchemeSupplement(manifest),totalActive=active.length+supplement.activeCount;
 return transaction(schema,async tx=>{
  await installExcelBarcodeAuthority(tx);
  await tx.execute('LOCK TABLE generated_barcode,product_barcode_alias,product_overlay,variant_overlay,barcode_authority_policy,barcode_authority_product,barcode_authority_record,barcode_scheme_supplement IN EXCLUSIVE MODE');
  const counts=(await tx.query(`SELECT (SELECT count(*)::int FROM ${SOURCE}.product) products,(SELECT count(*)::int FROM ${SOURCE}.variant) skus`)).rows[0];
  if(counts.products!==manifest.sourceProducts||counts.skus!==manifest.sourceSkus)throw Error('EXCEL_ORIGINAL_CATALOG_DRIFT');
  await tx.execute('CREATE TEMP TABLE excel_product_stage(product_id uuid PRIMARY KEY,code text,origin text) ON COMMIT DROP');
  await tx.execute(`INSERT INTO pg_temp.excel_product_stage SELECT product_id::uuid,code,origin FROM jsonb_to_recordset(${literal(JSON.stringify(manifest.managedProducts))}::jsonb) x(product_id text,code text,origin text)`);
  const changedIdentity=(await tx.query(`SELECT p.code FROM ${SOURCE}.product p LEFT JOIN pg_temp.excel_product_stage s ON s.product_id=p.id WHERE s.product_id IS NULL OR s.code<>p.code LIMIT 1`)).rows;
  if(changedIdentity.length)throw Error('EXCEL_ORIGINAL_PRODUCT_IDENTITY_MISMATCH');
  await tx.execute('CREATE TEMP TABLE excel_record_stage(sku_id uuid PRIMARY KEY,product_id uuid,status text,original_barcode text,record jsonb) ON COMMIT DROP');
  await tx.execute(`INSERT INTO pg_temp.excel_record_stage SELECT (r->>'skuId')::uuid,(r->>'productId')::uuid,r->>'status',r->>'barcode',r FROM jsonb_array_elements(${literal(JSON.stringify(records))}::jsonb) r`);
  const invalidOriginal=(await tx.query(`SELECT s.sku_id FROM pg_temp.excel_record_stage s
   LEFT JOIN ${SOURCE}.variant v ON v.id=s.sku_id LEFT JOIN ${SOURCE}.product p ON p.id=v.product_id
   LEFT JOIN ${SOURCE}.variant_option co ON co.variant_id=v.id AND co.dimension_id=(SELECT id FROM ${SOURCE}.spec_dimension WHERE code='COLOR')
   LEFT JOIN ${SOURCE}.spec_value c ON c.id=co.spec_value_id
   LEFT JOIN ${SOURCE}.variant_option zo ON zo.variant_id=v.id AND zo.dimension_id=(SELECT id FROM ${SOURCE}.spec_dimension WHERE code='SIZE')
   LEFT JOIN ${SOURCE}.spec_value z ON z.id=zo.spec_value_id
   WHERE (s.record->>'existingSku')::boolean AND (v.id IS NULL OR v.product_id<>s.product_id OR p.code<>s.record->>'code' OR c.name IS DISTINCT FROM s.record->>'colorName' OR z.name IS DISTINCT FROM s.record->>'sizeName') LIMIT 1`)).rows;
  if(invalidOriginal.length)throw Error('EXCEL_ORIGINAL_SKU_IDENTITY_MISMATCH');

  const newProductRows=manifest.newProducts;
  const newVariantRows=manifest.newVariants;
  await tx.execute('CREATE TEMP TABLE excel_new_product(id uuid PRIMARY KEY,code text,body jsonb) ON COMMIT DROP');
  await tx.execute(`INSERT INTO pg_temp.excel_new_product SELECT id::uuid,code,body FROM jsonb_to_recordset(${literal(JSON.stringify(newProductRows))}::jsonb) x(id text,code text,body jsonb)`);
  if((await tx.query('SELECT s.code FROM pg_temp.excel_new_product s JOIN product_overlay p ON p.code=s.code OR p.id=s.id WHERE p.id<>s.id OR p.code<>s.code OR p.deleted LIMIT 1')).rowCount)throw Error('EXCEL_NEW_PRODUCT_CONFLICT');
  const productsAdded=(await tx.query('SELECT count(*)::int n FROM pg_temp.excel_new_product s LEFT JOIN product_overlay p ON p.id=s.id WHERE p.id IS NULL')).rows[0].n;
  await tx.execute('INSERT INTO product_overlay(id,code,body) SELECT id,code,body FROM pg_temp.excel_new_product ON CONFLICT(id) DO NOTHING');
  await tx.execute('CREATE TEMP TABLE excel_new_variant(id uuid PRIMARY KEY,product_id uuid,color_id uuid,size_id uuid,fit_id text,size_name text,size_code text,group_name text) ON COMMIT DROP');
  await tx.execute(`INSERT INTO pg_temp.excel_new_variant SELECT id::uuid,product_id::uuid,color_id::uuid,size_id::uuid,fit_id,size_name,size_code,group_name FROM jsonb_to_recordset(${literal(JSON.stringify(newVariantRows))}::jsonb) x(id text,product_id text,color_id text,size_id text,fit_id text,size_name text,size_code text,group_name text)`);
  if((await tx.query(`SELECT n.id FROM pg_temp.excel_new_variant n JOIN variant_overlay v ON v.id=n.id OR (v.product_id=n.product_id AND v.color_id=n.color_id AND v.size_id=n.size_id AND v.fit_id=n.fit_id) WHERE v.id<>n.id OR (v.product_id,v.color_id,v.size_id,v.fit_id,v.size_name,v.size_code,v.group_name) IS DISTINCT FROM (n.product_id,n.color_id,n.size_id,n.fit_id,n.size_name,n.size_code,n.group_name) LIMIT 1`)).rowCount)throw Error('EXCEL_NEW_SKU_CONFLICT');
  if((await tx.query(`SELECT n.id FROM pg_temp.excel_new_variant n LEFT JOIN ${SOURCE}.spec_value c ON c.id=n.color_id LEFT JOIN ${SOURCE}.spec_value z ON z.id=n.size_id LEFT JOIN pg_temp.excel_product_stage p ON p.product_id=n.product_id WHERE c.name IS NULL OR z.name IS NULL OR p.product_id IS NULL LIMIT 1`)).rowCount)throw Error('EXCEL_NEW_SPEC_DIMENSION_MISSING');
  const specsAdded=(await tx.query('SELECT count(*)::int n FROM pg_temp.excel_new_variant s LEFT JOIN variant_overlay v ON v.id=s.id WHERE v.id IS NULL')).rows[0].n;
  await tx.execute('INSERT INTO variant_overlay(id,product_id,color_id,size_id,fit_id,size_name,size_code,group_name) SELECT * FROM pg_temp.excel_new_variant ON CONFLICT(id) DO NOTHING');

  await tx.execute('CREATE TEMP TABLE excel_barcode_stage(sku_id uuid PRIMARY KEY,product_id uuid,barcode text UNIQUE,scheme_id text,evidence jsonb) ON COMMIT DROP');
  await tx.execute(`INSERT INTO pg_temp.excel_barcode_stage SELECT sku_id,product_id,original_barcode,record->>'schemeId',jsonb_build_object('source','基本数据对照表.xls','rule',${literal(authorityRevision)},'sourceSha256',${literal(manifest.sourceSha256)},'originalBarcode',original_barcode,'originalProductCode',record->>'code','originalColorName',record->>'colorName','originalSizeName',record->>'sizeName','sourceColorCode',record->>'sourceColorCode','sourceSizeCode',record->>'sourceSizeCode','schemeName',record->>'schemeName','sheet',record->>'sheet','rows',record->'rows','generated',false) FROM pg_temp.excel_record_stage WHERE status='ACTIVE'`);
  await stageSchemeSupplement(tx,supplement);
  if((await tx.query('SELECT s.barcode FROM pg_temp.excel_barcode_stage s JOIN generated_barcode g ON g.barcode=s.barcode WHERE NOT EXISTS(SELECT 1 FROM pg_temp.excel_product_stage p WHERE p.product_id=g.product_id) LIMIT 1')).rowCount)throw Error('EXCEL_BARCODE_COLLIDES_WITH_OTHER_PRODUCT');
  if((await tx.query('SELECT s.barcode FROM pg_temp.excel_barcode_stage s JOIN product_barcode_alias g ON g.barcode=s.barcode WHERE NOT EXISTS(SELECT 1 FROM pg_temp.excel_product_stage p WHERE p.product_id=g.product_id) LIMIT 1')).rowCount)throw Error('EXCEL_BARCODE_COLLIDES_WITH_OTHER_ALIAS');
  const before=(await tx.query(`SELECT count(*)::int bindings,
   count(*) FILTER(WHERE s.sku_id IS NULL)::int removed,
   count(*) FILTER(WHERE s.sku_id IS NOT NULL AND g.barcode<>s.barcode)::int changed,
   count(*) FILTER(WHERE s.sku_id IS NOT NULL AND g.barcode=s.barcode)::int same
   FROM generated_barcode g JOIN pg_temp.excel_product_stage p ON p.product_id=g.product_id LEFT JOIN pg_temp.excel_barcode_stage s ON s.sku_id=g.sku_id`)).rows[0];
  const added=(await tx.query('SELECT count(*)::int n FROM pg_temp.excel_barcode_stage s LEFT JOIN generated_barcode g ON g.sku_id=s.sku_id WHERE g.sku_id IS NULL')).rows[0].n;
  await tx.execute('CREATE TABLE IF NOT EXISTS generated_barcode_retired (LIKE generated_barcode INCLUDING DEFAULTS)');
  await tx.execute(`INSERT INTO generated_barcode_retired SELECT g.* FROM generated_barcode g JOIN pg_temp.excel_product_stage p ON p.product_id=g.product_id LEFT JOIN pg_temp.excel_barcode_stage s ON s.sku_id=g.sku_id WHERE s.sku_id IS NULL OR g.barcode<>s.barcode`);
  await tx.execute(`DELETE FROM generated_barcode g USING pg_temp.excel_product_stage p WHERE p.product_id=g.product_id AND NOT EXISTS(SELECT 1 FROM pg_temp.excel_barcode_stage s WHERE s.sku_id=g.sku_id AND s.barcode=g.barcode)`);
  await tx.execute(`INSERT INTO generated_barcode(sku_id,product_id,barcode,scheme_id,evidence) SELECT * FROM pg_temp.excel_barcode_stage ON CONFLICT(sku_id) DO UPDATE SET product_id=excluded.product_id,barcode=excluded.barcode,scheme_id=excluded.scheme_id,evidence=excluded.evidence WHERE (generated_barcode.product_id,generated_barcode.barcode,generated_barcode.scheme_id,generated_barcode.evidence) IS DISTINCT FROM (excluded.product_id,excluded.barcode,excluded.scheme_id,excluded.evidence)`);
  const aliasesRemoved=(await tx.query('SELECT count(*)::int n FROM product_barcode_alias a JOIN pg_temp.excel_product_stage p ON p.product_id=a.product_id')).rows[0].n;
  await tx.execute('CREATE TABLE IF NOT EXISTS product_barcode_alias_retired (LIKE product_barcode_alias INCLUDING DEFAULTS)');
  await tx.execute('INSERT INTO product_barcode_alias_retired SELECT a.* FROM product_barcode_alias a JOIN pg_temp.excel_product_stage p ON p.product_id=a.product_id');
  await tx.execute('DELETE FROM product_barcode_alias a USING pg_temp.excel_product_stage p WHERE p.product_id=a.product_id');
  await tx.execute('INSERT INTO barcode_authority_product SELECT * FROM pg_temp.excel_product_stage ON CONFLICT(product_id) DO NOTHING');
  await tx.execute('INSERT INTO barcode_authority_record SELECT * FROM pg_temp.excel_record_stage ON CONFLICT(sku_id) DO UPDATE SET product_id=excluded.product_id,status=excluded.status,original_barcode=excluded.original_barcode,record=excluded.record WHERE barcode_authority_record.record IS DISTINCT FROM excluded.record');
  await persistSchemeSupplement(tx,supplement);
  const body={sourceFile:manifest.sourceFile,sourcePath:manifest.sourcePath,decision:manifest.decision,rawRows:manifest.rawRows,distinctSpecs:records.length,activeBarcodes:totalActive,excelApprovedBarcodes:active.length,duplicateBindingsRemoved:records.length-active.length,sourceSkus:manifest.sourceSkus,originalMissingSourceSkus:manifest.uncoveredSourceSkus,uncoveredSourceSkus:supplement.exceptionCount,noBarcodeRequiredCount:supplement.noBarcodeRequiredCount,historyFinalized:{revision:supplement.finalDecisionRevision,at:supplement.finalizedAt,decision:supplement.decision},automaticHistoricalProcessing:false,futureDataPolicy:'增量新增业务数据，不重新清洗或重生成已定稿历史数据',schemeSupplement:{revision:supplementRevision,scopeCount:supplement.scopeCount,activeCount:supplement.activeCount,exceptionCount:supplement.exceptionCount,noBarcodeRequiredCount:supplement.noBarcodeRequiredCount,decision:supplement.decision},supersedes:['C8 barcode freeze','C9 barcode freeze','unscoped historical barcode generation and aliases'],preserves:['source SKU identity','approved size mapping','stock','business documents']};
  await tx.execute(`INSERT INTO barcode_authority_policy(singleton,revision,source_sha256,body) VALUES(true,${literal(authorityRevision)},${literal(manifest.sourceSha256)},${literal(JSON.stringify(body))}::jsonb) ON CONFLICT(singleton) DO UPDATE SET revision=excluded.revision,source_sha256=excluded.source_sha256,body=excluded.body,updated_at=now() WHERE (barcode_authority_policy.revision,barcode_authority_policy.source_sha256,barcode_authority_policy.body) IS DISTINCT FROM (excluded.revision,excluded.source_sha256,excluded.body)`);
  const verified=(await tx.query(`SELECT count(*)::int planned,count(*) FILTER(WHERE g.barcode=s.barcode AND g.product_id=s.product_id AND g.evidence=s.evidence)::int exact FROM pg_temp.excel_barcode_stage s LEFT JOIN generated_barcode g ON g.sku_id=s.sku_id`)).rows[0];
  if(verified.planned!==totalActive||verified.exact!==totalActive)throw Error('APPROVED_BARCODE_READBACK_MISMATCH');
  const missing=(await tx.query(`SELECT count(*) FILTER(WHERE g.sku_id IS NULL)::int without_barcode,count(*) FILTER(WHERE g.sku_id IS NULL AND n.status IS DISTINCT FROM 'NOT_REQUIRED')::int pending,count(*) FILTER(WHERE g.sku_id IS NULL AND n.status='NOT_REQUIRED')::int not_required FROM ${SOURCE}.variant v JOIN pg_temp.excel_product_stage p ON p.product_id=v.product_id LEFT JOIN generated_barcode g ON g.sku_id=v.id LEFT JOIN pg_temp.scheme_supplement_stage n ON n.sku_id=v.id`)).rows[0];
  if(missing.pending!==supplement.exceptionCount||missing.not_required!==supplement.noBarcodeRequiredCount||missing.without_barcode!==missing.pending+missing.not_required)throw Error('SUPPLEMENT_PENDING_SCOPE_MISMATCH');
  return {revision:authorityRevision,supplementRevision,sourceSha256:manifest.sourceSha256,activeBarcodes:verified.exact,excelApprovedBarcodes:active.length,schemeSupplementBarcodes:supplement.activeCount,productsAdded,specsAdded,barcodesAdded:added,barcodesChanged:before.changed,barcodesUnchanged:before.same,oldBindingsRemoved:before.removed,archived:before.changed+before.removed,aliasesRemoved,duplicateBindingsRemoved:2,pendingSourceSkus:missing.pending,noBarcodeRequiredSkus:missing.not_required,sourceSkusWithoutBarcode:missing.without_barcode,historyFinalized:true};
 });
}
