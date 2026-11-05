/** Source renderer test only: writes a fresh temporary bundle, never opens a database. */
import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createHash} from 'node:crypto';
import {renderWholeLocal,WHOLE_INSTALL_PATCHES} from '../scripts/release/unified-install/render-whole-package-local.mjs';
import {loadWholeCatalogSpec} from '../scripts/release/unified-install/whole-catalog-gate.mjs';
const name='0027_standard_known_balance_runtime_v2.sql',zero='0027_standard_import_whole_package_zero_balance_v2.sql',search='0027_standard_import_whole_package_search_path_v2.sql',access='0027_standard_import_whole_package_access_v2.sql';
const names=['guard_cutoff_ledger','guard_recorded_live_balance_pair','validate_sparse_balance_commit','validate_transfer_effect'];
test('fresh renderer actually includes exact known-balance successor after zero and before catalogue/access pin gates',async()=>{
 const root=await mkdtemp(join(tmpdir(),'synthetic-known-balance-render-'));try{
  const target=join(root,'bundle'),manifest=await renderWholeLocal(target),sql=await readFile(join(target,'01-schema-and-whole.sql'),'utf8'),source=await readFile(new URL(`../adapters/postgres/patches/${name}`,import.meta.url),'utf8');
  assert.equal(WHOLE_INSTALL_PATCHES.filter(v=>v===name).length,1);assert.ok(WHOLE_INSTALL_PATCHES.indexOf(zero)<WHOLE_INSTALL_PATCHES.indexOf(name));assert.ok(WHOLE_INSTALL_PATCHES.indexOf(name)<WHOLE_INSTALL_PATCHES.indexOf(search));assert.ok(WHOLE_INSTALL_PATCHES.indexOf(search)<WHOLE_INSTALL_PATCHES.indexOf(access));
  const marker=`-- adapters/postgres/patches/${name}\n`;assert.equal(sql.split(marker).length,2);assert.ok(sql.includes(marker+source));
  const pin=manifest.pins.find(v=>v.path.endsWith('/'+name));assert.ok(pin);assert.equal(pin.sourceSha256,createHash('sha256').update(source).digest('hex'));assert.equal(pin.renderedSha256,pin.sourceSha256);
  const spec=await loadWholeCatalogSpec(process.cwd());
  for(const n of names){const escaped=n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const matches=[...source.matchAll(new RegExp(`CREATE OR REPLACE FUNCTION naijue_erp\\.${escaped}\\(\\)[\\s\\S]*? AS (\\$[A-Za-z_]*\\$)([\\s\\S]*?)\\1;`,'g'))];assert.equal(matches.length,1,n);const hash=createHash('sha256').update(matches[0][2]).digest('hex');const pin=spec.pins.find(p=>p.signature===`naijue_erp.${n}()`);assert.ok(pin,`${n} catalog pin`);assert.equal(pin.sha256,hash,`${n} exact signature/body pin`);assert.equal(pin.search_path,'search_path=pg_catalog, naijue_erp, pg_temp');}
 }finally{await rm(root,{recursive:true,force:true});}
});
