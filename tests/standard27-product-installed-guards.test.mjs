import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
const source=()=>readFileSync(new URL('../adapters/postgres/src/standard27-product-installed-guards.ts',import.meta.url),'utf8');
test('installed guard pins match both actual uninstalled candidate function bodies',()=>{
 const s=source();for(const path of ['0027_standard_product_writer_serialization_candidate.sql','0027_standard_product_provenance_barrier_candidate.sql']){
  const ddl=readFileSync(new URL('../adapters/postgres/patches/'+path,import.meta.url),'utf8');const body=ddl.match(/AS \$body\$([\s\S]*?)\$body\$;/);assert.ok(body);assert.ok(s.includes(createHash('sha256').update(body[1]).digest('hex')));assert.match(ddl,/RAISE EXCEPTION 'STANDARD27_PRODUCT_\w+_NOT_ADMITTED'/);
 }
});
test('all fourteen exact trigger identities are required without admitting extras',()=>{
 const s=source();assert.match(s,/expected_triggers\(relation,name,signature,kind\)/);
 for(const table of ['product','sku','sku_barcode','product_image','audit_change','operation_receipt'])assert.ok(s.includes("('"+table+"','standard27_product_writer_serialization'"));
 for(const table of ['import_batch','import_record','audit_change','operation_receipt'])for(const name of ['standard27_product_provenance_barrier','standard27_product_provenance_barrier_truncate'])assert.ok(s.includes("('"+table+"','"+name+"'"));
 assert.match(s,/t\.tgtype=e\.kind/);assert.match(s,/unexpected_bindings/);assert.match(s,/count\(\*\) FROM expected_triggers\)=14/);
});
test('trigger state, constraint attributes, arguments and transition tables are exact',()=>{
 const s=source();for(const clause of ["t.tgenabled='O'",'NOT t.tgisinternal','NOT t.tgdeferrable','NOT t.tginitdeferred','t.tgqual IS NULL',"t.tgattr=''::int2vector",'t.tgnargs=0',"t.tgargs=''::bytea",'t.tgoldtable IS NULL','t.tgnewtable IS NULL','t.tgparentid=0','t.tgconstraint=0','t.tgconstrrelid=0','t.tgconstrindid=0'])assert.ok(s.includes(clause),clause);
});
test('candidate functions require invoker metadata and owner-only explicit ACL',()=>{
 const s=source();for(const clause of ['NOT p.prosecdef',"l.lanname='plpgsql'",'p.proowner=n.nspowner','p.prosqlbody IS NULL','NOT p.proleakproof',"p.proparallel='u'",'p.prosupport=0','p.proacl IS NOT NULL','x.grantee=p.proowner','x.grantor=p.proowner',"x.privilege_type='EXECUTE'",'NOT x.is_grantable'])assert.ok(s.includes(clause),clause);assert.match(s,/count\(\*\)=1/);
});
test('guard check is only a prerequisite inside closed issuer and never installs SQL',()=>{
 const s=source(),host=readFileSync(new URL('../adapters/postgres/src/standard27-product-capacity-issuer.ts',import.meta.url),'utf8');assert.doesNotMatch(s,/\bCREATE FUNCTION\b|\bGRANT EXECUTE\b|\$1/);assert.match(host,/CLOSURE_ADMITTED: boolean = false/);assert.match(host,/client\.query\(STANDARD27_PRODUCT_INSTALLED_GUARDS_SQL\)/);assert.match(host,/guards_present === true/);
});
