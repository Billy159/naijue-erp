import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
const functionSql=s=>{const a=s.indexOf('CREATE OR REPLACE FUNCTION naijue_erp.validate_maintenance_root_commit()');assert.ok(a>=0);const b=s.indexOf('$$;',a);assert.ok(b>a);return s.slice(a,b+3);};
test('product scheme-null successor changes only the mandatory scheme rejection',async()=>{
 const baseline=functionSql(await readFile(new URL('../../../adapters/postgres/patches/0027_standard_import_initialization.sql',import.meta.url),'utf8'));
 const successor=functionSql(await readFile(new URL('../../../adapters/postgres/patches/0027_product_nullable_scheme_successor.sql',import.meta.url),'utf8'));
 const rejection="    IF TG_OP='INSERT' AND (new_root->>'default_barcode_scheme_id') IS NULL THEN\n      RAISE EXCEPTION 'New runtime product requires an explicit real default barcode scheme' USING ERRCODE='23514';\n    END IF;\n";
 assert.equal(baseline.split(rejection).length,2);assert.equal(successor,baseline.replace(rejection,''));assert.match(successor,/maintenance_check_product_children\(a,false\)/);
});
test('ordinary27 host pins the nullable-scheme root guard version',async()=>{const s=await readFile(new URL('../../../adapters/postgres/src/ordinary27-product-capacity.ts',import.meta.url),'utf8');assert.match(s,/bf853800c33c492dd0b8224e489c42dfb1c9a046231001a3d42be830a257f479/);assert.doesNotMatch(s,/380af956881696be97d73eab55fe033275802ba97ea4cfef47bc79d535db4c11/);});
