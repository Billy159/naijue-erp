import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {loadFresh35HistoricalSettlementDifferenceCandidate} from '../scripts/release/unified-install/fresh35-historical-settlement-difference-candidate.mjs';
import {applyRetirementSourceReplacement} from '../scripts/release/unified-install/fresh35-retirement-source.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),hash=x=>createHash('sha256').update(x).digest('hex');
let pending;const load=()=>pending??=loadFresh35HistoricalSettlementDifferenceCandidate(root);
test('approved difference successor composes exactly after210 and modifies only the four existing routines',async()=>{
 const c=await load();assert.equal(c.specs.length,4);assert.equal(c.manifest.successorRoutinePins.length,152);
 assert.deepEqual(c.specs.map(s=>s.signature.slice('naijue_erp.'.length,s.signature.indexOf('('))),['standard_whole_package_command_v2','assert_document_migration','validate_sales_settlement','standard_whole_package_verify_v2']);
 for(const s of c.specs){const before=c.predecessorBodies.find(r=>r.signature===s.signature).body;assert.equal(hash(applyRetirementSourceReplacement(before,s)),s.successor_sha256);assert.throws(()=>applyRetirementSourceReplacement(before+' ',s),/PREDECESSOR/);}
 assert.equal(c.specs.find(s=>s.signature.includes('.validate_sales_settlement(')).predecessor_sha256,'6264718f906a4d90a12547bbdf2c7aee91b49374beee2b1372147af2f13af953');
 for(const pin of c.manifest.sourcePins)assert.equal(hash(await readFile(new URL('../'+pin.path,import.meta.url))),pin.sha256,pin.path);
 assert.equal(c.manifest.permissionsChanged,false);assert.deepEqual(c.manifest.columnChanges,[]);assert.equal(c.manifest.newTables,0);assert.equal(c.manifest.newColumns,0);assert.equal(c.manifest.newRoutines,0);assert.equal(c.manifest.engineVerified,false);assert.equal(c.manifest.installationReady,false);
});
test('INITIALIZE binds exactly25/27 and existing request fingerprints, publication proof, source keys and original transaction remain intact',async()=>{
 const c=await load(),body=c.changedBodies.find(r=>r.signature.includes('.standard_whole_package_command_v2(')).body;
 for(const marker of ['historical_settlement_retention_approval',"sr_wire-ARRAY['utf8','sha256']","IS JSON OBJECT WITH UNIQUE KEYS","jsonb_array_length(sr_approval->'documents')<>25",'cardinality(sr_rows)<>27','HISTORICAL_SETTLEMENT_DIFFERENCE_REQUIRED','HISTORICAL_SETTLEMENT_EXACT_SET_REQUIRED','PERFORM naijue_erp.assert_document_migration(sr_operation)',"command_phase||':'||request::text",'WHOLE_EXISTING_OPERATION_REQUIRES_INSPECT','WHOLE_REQUEST_BINDING_INVALID','WHOLE_PHASE_ORDER_INVALID','SET CONSTRAINTS'])assert.ok(body.includes(marker),marker);
 // The extension is not placed on source rows and never changes their original hash inputs.
 const before=c.predecessorBodies.find(r=>r.signature.includes('.standard_whole_package_command_v2(')).body;
 const sourceAnchor="parsed:=jsonb_build_object('source_key',source_key,'fields',fields,'source_refs',entry->'source_refs');";
 assert.equal(body.split(sourceAnchor).length,before.split(sourceAnchor).length);assert(body.includes(sourceAnchor));
 assert.doesNotMatch(c.patchSql.replace(/^--.*$/gm,''),/\b(?:CREATE TABLE|ALTER TABLE|CREATE ROLE|GRANT |REVOKE |DISABLE TRIGGER|TRUNCATE |DELETE FROM)\b/i);
});
test('migration requires immutable initializer, exact original full rows and actual settlement fields before granting the MIGRATE-only difference',async()=>{
 const c=await load(),migration=c.changedBodies.find(r=>r.signature.includes('.assert_document_migration(')).body,settlement=c.changedBodies.find(r=>r.signature.includes('.validate_sales_settlement(')).body,old=c.predecessorBodies.find(r=>r.signature.includes('.validate_sales_settlement(')).body;
 for(const marker of ['HISTORICAL_SETTLEMENT_MIGRATION_ORIGIN_REQUIRED','HISTORICAL_SETTLEMENT_MIGRATION_SOURCE_DIFFERS',"sr_init_receipt.status IS DISTINCT FROM 'COMMITTED'", "sr_init_audit.actor_account_id IS DISTINCT FROM sr_init_receipt.actor_account_id", "sr_request->>'package_manifest_sha256' IS DISTINCT FROM b.source_hash", "sr_row->'fields' IS DISTINCT FROM sr_proof->'fields'",'retain_settlement_difference:=true','NOT retain_settlement_difference','HISTORICAL_LINE_AMOUNT_KNOWN_TOTALS_DIFFER'])assert(migration.includes(marker),marker);
 const changed=c.specs.find(s=>s.signature.includes('.validate_sales_settlement('));assert.equal(changed.replacements.length,1);assert(settlement.includes("IF evidence.action='MIGRATE_DOCUMENT' THEN\n  PERFORM naijue_erp.assert_document_migration(r.id);"));
 const suffix=" -- A historical empty settlement set is UNKNOWN even when net_due is zero.";assert.equal(settlement.slice(settlement.indexOf(suffix)),old.slice(old.indexOf(suffix)),'ordinary SAVE/APPROVE and all original restoration rules must remain byte-for-byte unchanged');
});
test('credential-bound readback validates all25 original snapshots and27 immutable source occurrences while preserving current edit validation and response fields',async()=>{
 const c=await load(),body=c.changedBodies.find(r=>r.signature.includes('.standard_whole_package_verify_v2(')).body,old=c.predecessorBodies.find(r=>r.signature.includes('.standard_whole_package_verify_v2(')).body;
 for(const marker of ['standard_whole_package_inspect_v2(init_request,encoded_scrypt)','WHOLE_VERIFY_COMMITTED_PACKAGE_REQUIRED','FOR SHARE','STANDARD_VERIFY_ORDINARY_CHAIN_INVALID','HISTORICAL_SETTLEMENT_ORIGINAL_READBACK_DIFFERS','sr_rows<>27','sr_count<>25',"sr_origin->'header'->>'stock_basis' IS DISTINCT FROM 'CUTOFF_HISTORY'","sr_row->'fields' IS DISTINCT FROM sr_proof->'fields'",'sr_total:=sr_total+'])assert(body.includes(marker),marker);
 const ret=" RETURN jsonb_build_object('historical_line_amount_differences'";assert.equal(body.slice(body.indexOf(ret)),old.slice(old.indexOf(ret)),'no new response or business balance field');
 assert.doesNotMatch(body,/UPDATE naijue_erp\.sales_|INSERT INTO naijue_erp\.sales_/);assert(c.reviewSql.includes("RAISE EXCEPTION 'FRESH35_SETTLEMENT_DIFFERENCE_REVIEW_ONLY'"));
});
