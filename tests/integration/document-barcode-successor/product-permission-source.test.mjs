import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
test('product maintenance installer is bounded to explicit business columns with guard prerequisites',async()=>{
 const s=await readFile(new URL('../../../adapters/postgres/patches/0027_product_maintenance_permissions.psql',import.meta.url),'utf8');
 assert.match(s,/rolname='erp_unified27_runtime_2393dbc6db9581c2'/);assert.match(s,/NOT rolcanlogin/);
 for(const n of ['product_maintenance_before_root','product_maintenance_final_consistency','sku_maintenance_write','sku_creation_identity','barcode_maintenance_write','sku_barcode_retains_identity','maintenance_audit_actor','product_retained_delete','product_retained_reference','sku_retained_reference'])assert.ok(s.includes(n));
 const grants=s.split('\n').filter(x=>x.startsWith('GRANT '));assert.equal(grants.length,4);
 assert.match(grants[0],/^GRANT INSERT \(id,product_code,/);assert.match(grants[1],/^GRANT UPDATE \(product_code,/);assert.doesNotMatch(grants[1],/\bid\b|\bseason_id\b/);
 assert.equal(grants[2],'GRANT UPDATE (enabled,version) ON naijue_erp.sku TO :"runtime_role";');assert.equal(grants[3],'GRANT UPDATE (enabled) ON naijue_erp.sku_barcode TO :"runtime_role";');
 assert.doesNotMatch(s,/GRANT (?:ALL|DELETE)|CREATE ROLE|ALTER ROLE|\\quit/);assert.match(s,/PRODUCT_RUNTIME_ROLE_INVALID/);
});
test('product guard preflight validates routine execution metadata as well as body',async()=>{const s=await readFile(new URL('../../../adapters/postgres/patches/0027_product_maintenance_permissions.psql',import.meta.url),'utf8');for(const part of ["p.prokind='f'","p.provolatile='v'","p.prosqlbody IS NULL","p.proowner=n.nspowner","l.lanname='plpgsql'","p.prorettype='trigger'::regtype","p.proconfig=ARRAY['search_path=pg_catalog, naijue_erp, pg_temp']"])assert.ok(s.includes(part),part);});
test('product permission installer rejects role inheritance or membership',async()=>{const s=await readFile(new URL('../../../adapters/postgres/patches/0027_product_maintenance_permissions.psql',import.meta.url),'utf8');assert.match(s,/NOT rolinherit/);assert.match(s,/pg_auth_members/);});
