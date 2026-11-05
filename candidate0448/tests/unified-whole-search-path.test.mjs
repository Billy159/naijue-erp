import test from'node:test';import assert from'node:assert/strict';import{renderWholeSearchPathHardening}from'../scripts/release/unified-install/whole-search-path-source.mjs';
test('all176 known routines are body-pinned before changing only search_path',async()=>{const sql=await renderWholeSearchPathHardening(process.cwd());assert.ok(sql.includes('WHOLE_EXACT')||sql.includes('<>176'));assert.ok(sql.includes('standard_import_identity'));assert.ok(sql.includes('pg_catalog, naijue_erp, pg_temp'));assert.ok(sql.includes("after_row-'proconfig' IS DISTINCT FROM before_row-'proconfig'"));assert.ok(!sql.includes('GRANT '));assert.equal((sql.match(/"signature":/g)||[]).length,352);});
test('nullable scheme successor is installed before hardening and pins the changed root guard',async()=>{const{readFile}=await import('node:fs/promises');const{createHash}=await import('node:crypto');const sql=await readFile('adapters/postgres/patches/0027_product_nullable_scheme_successor.sql','utf8');const body=sql.match(/CREATE OR REPLACE FUNCTION naijue_erp\.validate_maintenance_root_commit\(\)[\s\S]*?AS \$\$([\s\S]*?)\$\$;/)[1];const pathSql=await renderWholeSearchPathHardening(process.cwd());const pins=JSON.parse(pathSql.match(/\$pins\$(\[[\s\S]*?\])\$pins\$/)[1]);assert.equal(pins.find(p=>p.signature==='naijue_erp.validate_maintenance_root_commit()').sha256,createHash('sha256').update(body).digest('hex'));const{WHOLE_INSTALL_PATCHES}=await import('../scripts/release/unified-install/render-whole-package-local.mjs');assert.ok(WHOLE_INSTALL_PATCHES.indexOf('0027_product_nullable_scheme_successor.sql')>WHOLE_INSTALL_PATCHES.indexOf('0027_document_specification_barcodes_successor.sql'));assert.ok(WHOLE_INSTALL_PATCHES.indexOf('0027_product_nullable_scheme_successor.sql')<WHOLE_INSTALL_PATCHES.indexOf('0027_standard_import_whole_package_search_path_v2.sql'));});
test('named dollar body cannot swallow the next routine or swap recorded/sparse signatures',async()=>{
 const {renderWholeSearchPathHardening}=await import('../scripts/release/unified-install/whole-search-path-source.mjs');const text=await renderWholeSearchPathHardening(process.cwd());const pins=JSON.parse(text.match(/\$pins\$(\[[\s\S]*?\])\$pins\$/)[1]);
 assert.equal(pins.find(p=>p.signature==='naijue_erp.guard_recorded_live_balance_pair()').sha256,'891aea0441b73343caf02b249515b757884e760fefc444c644a5f25b74e88d0f');
 assert.equal(pins.find(p=>p.signature==='naijue_erp.validate_sparse_balance_commit()').sha256,'c071e1159a52b192e9526645c02febaaccd9c390cbe63c7850cdf2be4440077d');
});


test('multiline conversion successor preserves its exact signature and generated hardening matches checked-in source',async()=>{
 const{readFile}=await import('node:fs/promises');const{createHash}=await import('node:crypto');
 const source=await readFile('adapters/postgres/patches/0027_whole_conversion_prefix_counts_v2.sql','utf8');
 const body=source.match(/AS \$\$([\s\S]*?)\$\$;/)[1];
 const text=await renderWholeSearchPathHardening(process.cwd());const pins=JSON.parse(text.match(/\$pins\$(\[[\s\S]*?\])\$pins\$/)[1]);
 const matches=pins.filter(p=>p.signature.startsWith('naijue_erp.assert_document_conversion_batch('));
 assert.equal(matches.length,1);assert.equal(matches[0].signature,'naijue_erp.assert_document_conversion_batch(naijue_erp.import_batch,pg_catalog.jsonb,pg_catalog.text,pg_catalog.bool)');
 assert.equal(matches[0].sha256,createHash('sha256').update(body).digest('hex'));
 assert.equal(text,await readFile('adapters/postgres/patches/0027_standard_import_whole_package_search_path_v2.sql','utf8'));
});
test('successor parser rejects unknown, changed, duplicate or unparsed signatures instead of retaining old pins',async()=>{
 const{readWholeSuccessorPins}=await import('../scripts/release/unified-install/whole-search-path-source.mjs');
 const known=new Map([['synthetic',{signature:'naijue_erp.synthetic(pg_catalog.jsonb,pg_catalog.bool)',sha256:'a'.repeat(64)}]]);
 const sql='CREATE OR REPLACE FUNCTION naijue_erp.synthetic(value jsonb, ready boolean)\nRETURNS void LANGUAGE plpgsql AS $body$\nBEGIN RETURN; END\n$body$;';
 assert.equal(readWholeSuccessorPins(sql,known)[0].signature,known.get('synthetic').signature);
 for(const bad of [sql.replace('synthetic(','unknown('),sql.replace('value jsonb','value text'),sql+'\n'+sql])assert.throws(()=>readWholeSuccessorPins(bad,known),/WHOLE_SUCCESSOR_SIGNATURE_DIFFERS/);
 for(const bad of ['',sql.replace('RETURNS','BROKEN'),sql.replace('$body$;','$other$;')])assert.throws(()=>readWholeSuccessorPins(bad,known),/WHOLE_SUCCESSOR_ROUTINE_PARSE_REQUIRED/);
});
