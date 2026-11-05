import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { loadFresh35RetirementSource, applyRetirementSourceReplacement, deriveRetainedRoutineClosure } from '../scripts/release/unified-install/fresh35-retirement-source.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const hash=value=>createHash('sha256').update(value).digest('hex');
test('resolves every actual current whole-sales body including dynamic successors',async()=>{
 const source=await loadFresh35RetirementSource(root);
 assert.equal(source.routines.length,178);
 assert.equal(new Set(source.routines.map(r=>r.signature)).size,178);
 for(const routine of source.routines)assert.equal(hash(routine.body),routine.bodySha256);
 assert.equal(source.routines.find(r=>r.name==='standard_whole_package_command_v2').bodySha256,'8d66fc0b618be87284dd60d00d2fae656458bf7b8adda7fb7405d0a475bcb93d');
 assert.equal(source.routines.find(r=>r.name==='validate_sales_settlement').bodySha256,'16dea25b6153d032e9f095e709d0f5e2fc8d583ad16806403eab83b6eeb60488');
 assert.equal(source.routines.find(r=>r.name==='standard_zero_amount_archive_trace').body.includes('ZERO_ARCHIVE_IMPORTER_REQUIRED'),true);
 assert.equal(source.engineVerified,false);assert.equal(source.installationReady,false);
});
test('an exact body replacement refuses changed predecessors, duplicate anchors and wrong outputs',()=>{
 const before='first second';const spec={predecessor_sha256:hash(before),successor_sha256:hash('first third'),replacements:[{before:'second',after:'third'}]};
 assert.equal(applyRetirementSourceReplacement(before,spec),'first third');
 assert.throws(()=>applyRetirementSourceReplacement(before+'!',spec),/PREDECESSOR/);
 assert.throws(()=>applyRetirementSourceReplacement(before,{...spec,successor_sha256:hash('wrong')}),/SUCCESSOR/);
 assert.throws(()=>applyRetirementSourceReplacement('second second',{...spec,predecessor_sha256:hash('second second')}),/ANCHOR/);
});
test('retained closure refuses an omitted callee and any remaining legacy relation or rowtype',()=>{
 const keep={signature:'naijue_erp.keep()',name:'keep',body:'BEGIN PERFORM naijue_erp.old(); END;',bodySha256:hash('BEGIN PERFORM naijue_erp.old(); END;')};
 const old={signature:'naijue_erp.old()',name:'old',body:'BEGIN RETURN; END;',bodySha256:hash('BEGIN RETURN; END;')};
 assert.throws(()=>deriveRetainedRoutineClosure([keep,old],['naijue_erp.old()']),/OMITTED_CALLEE/);
 assert.throws(()=>deriveRetainedRoutineClosure([{...keep,body:'SELECT * FROM naijue_erp.import_source_row'}],[]),/LEGACY_REFERENCE/);
 assert.throws(()=>deriveRetainedRoutineClosure([{...keep,signature:'naijue_erp.keep(naijue_erp.import_source_row)',body:'BEGIN RETURN; END;'}],[]),/LEGACY_REFERENCE/);
 assert.throws(()=>deriveRetainedRoutineClosure([old],['naijue_erp.missing()']),/OMITTED_ROUTINE_MISSING/);
 assert.deepEqual(deriveRetainedRoutineClosure([old],[]).retained.map(r=>r.signature),['naijue_erp.old()']);
});
