/** Source contracts only: these tests never connect to or prove PostgreSQL. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const file = new URL('../adapters/postgres/migrations/0027_unified_business_documents.sql', import.meta.url);
const source = () => readFileSync(file, 'utf8');
const sql = () => source().replace(/--[^\n]*/g, '');
test('incremental 0027 adds exactly six approved columns, no new table or retirement', () => {
  const s = sql();
  assert.equal((s.match(/ADD COLUMN\b/gi) ?? []).length, 6);
  for (const name of ['source_system', 'created_by_staff_id', 'approved_by_staff_id', 'baseline_anchor_operation_id']) assert.ok(s.includes(name));
  assert.doesNotMatch(s, /CREATE\s+(?:UNLOGGED\s+)?TABLE|DROP\s+TABLE|TRUNCATE|CASCADE|DISABLE\s+TRIGGER|session_replication_role/i);
  assert.match(s, /VALUES\s*\(27,/);
});
test('namespace cannot be silently fabricated from mutable or legacy source names', () => {
  const s = sql();
  assert.match(s, /UNIFIED27_SOURCE_NAMESPACE_REVIEW_REQUIRED/);
  assert.match(s, /FOREIGN KEY\s*\(import_batch_id,\s*source_system\)/);
  assert.match(s, /REFERENCES naijue_erp.import_batch\s*\(id,\s*source_name\)/);
  assert.match(s, /UNIQUE INDEX import_global_source_identity[\s\S]*source_system,\s*source_entity_type,\s*source_key/);
  assert.doesNotMatch(s, /UPDATE\s+naijue_erp\.(?:import_batch|import_record)/i);
});
test('conversion is a closed non-stock profile, independent of fixed old publication', () => {
  const s = sql();
  assert.match(s, /inventory_mode IN \('CUTOFF_STOCK_BASELINE', 'DOCUMENT_CONVERSION'\)/);
  assert.match(s, /import_one_published_cutoff[\s\S]*inventory_mode = 'CUTOFF_STOCK_BASELINE'/);
  assert.match(s, /assert_document_conversion_batch/);
  assert.match(s, /DOCUMENT_CONVERSION_V1/);
  assert.match(s, /conversion cannot post or rebaseline inventory/);
});
test('migration receipt is unique typed ordinary target, reciprocal evidence retained', () => {
  const s = sql();
  assert.match(s, /CREATE UNIQUE INDEX document_migration_anchor_once[\s\S]*\(target_type, target_id\)[\s\S]*WHERE action = 'MIGRATE_DOCUMENT'/);
  assert.match(s, /action = 'MIGRATE_DOCUMENT'.*old_version IS NULL/);
  assert.match(s, /assert_document_migration/);
  assert.match(s, /actor_account_id/);
  assert.match(s, /occurred_at IS DISTINCT FROM r.completed_at/);
  assert.match(s, /migration creates no inventory effects/);
  assert.doesNotMatch(s, /DROP CONSTRAINT (?:receipt_requires|audit_receipt)/);
});
test('first reversal requires anchor XOR real original, exact line endpoint once', () => {
  const s = sql();
  assert.match(s, /num_nonnulls\(reverses_entry_id, baseline_anchor_operation_id\) = 1/);
  assert.match(s, /baseline_anchor_operation_id uuid[\s\S]*REFERENCES naijue_erp.operation_receipt\(id\)/);
  assert.match(s, /baseline_sales_reversal_once[\s\S]*baseline_anchor_operation_id, source_sales_line_id, endpoint/);
  assert.match(s, /baseline_transfer_reversal_once[\s\S]*baseline_anchor_operation_id, source_transfer_line_id, endpoint/);
  assert.match(s, /validate_unified_baseline_reversal/);
  assert.match(s, /source_document_version/);
  assert.match(s, /quantity_delta::numeric/);
});
test('unknown historical facts stay nullable; required money date references and current actor remain guarded', () => {
  const s = sql();
  for (const column of ['created_by_account_id', 'created_at', 'updated_at', 'created_role', 'allocated_discount', 'is_gift', 'account_name_snapshot', 'method_name_snapshot']) assert.match(s, new RegExp(`ALTER COLUMN ${column} DROP NOT NULL`));
  assert.doesNotMatch(s, /ALTER COLUMN (?:business_date|gross_amount|net_due|order_discount|quantity|deal_price|line_amount|payment_account_id|customer_id|warehouse_id) DROP NOT NULL/);
  assert.match(s, /assert_unified_current_actor/);
  assert.match(s, /approved_by_staff_id/);
});
test('settlements are unbounded but actual approvals still require net balance', () => {
  const s = sql();
  assert.match(s, /CREATE OR REPLACE FUNCTION naijue_erp.validate_sales_settlement/);
  assert.doesNotMatch(s, /count_rows\s*>\s*3/);
  assert.match(s, /total IS DISTINCT FROM h.net_due/);
  assert.match(s, /NEW.action = 'APPROVE'/);
});
test('source-only migration is transactional and all old histories stay FK-bound', () => {
  const s = sql();
  assert.match(s, /^\s*BEGIN;/);
  assert.match(s, /COMMIT;\s*$/);
  assert.doesNotMatch(s, /DROP (?:COLUMN|CONSTRAINT) (?:target_history|object_history|source_history)/i);
  assert.doesNotMatch(s, /DELETE FROM|INSERT INTO naijue_erp\.(?:sales|transfer|inventory)/i);
});
test('ordinary action/state, nullable visibility and settlement mutation do not bypass audit', () => {
 const s=sql();
 assert.match(s,/h->>'status' IS DISTINCT FROM \(CASE NEW.action WHEN 'APPROVE' THEN 'APPROVED' WHEN 'VOID' THEN 'VOID' ELSE 'DRAFT' END\)/);
 assert.match(s,/NOT coalesce\(\(h->>'created_role'/);
 assert.match(s,/array_append\(immutable,'created_role'\)/);
 assert.match(s,/unified_sales_settlement_command_consistency AFTER INSERT OR UPDATE OR DELETE/);
 assert.match(s,/settlement mutation requires exact same-transaction ordinary draft SAVE/);
 assert.match(s,/unchanged account retains original known\/unknown snapshots/);
 assert.match(s,/retired source settlement identity cannot be recycled/);
});
test('approved migration admission must balance complete preserved settlements; DRAFT may remain unbalanced', () => {
 const s=sql();
 const body=s.match(/CREATE OR REPLACE FUNCTION naijue_erp\.validate_sales_settlement\(\)[\s\S]*?\nEND \$\$;/)?.[0];
 assert.ok(body, 'closed settlement validator must exist');
 assert.match(body,/IF h.status='APPROVED' AND total IS DISTINCT FROM h.net_due THEN/);
 assert.doesNotMatch(body,/IF r.action='APPROVE' AND total IS DISTINCT FROM h.net_due THEN/);
 assert.ok(body.indexOf("IF h.status='APPROVED'") < body.indexOf("IF evidence.action='MIGRATE_DOCUMENT'"), 'migration dispatch must not skip the approved balance invariant');
});
test('source-bound existing settlement UPSERT is allowed only for the locked current canonical owner, never a retired ID', () => {
 const body=sql().match(/CREATE FUNCTION naijue_erp\.guard_retained_settlement_identity\(\)[\s\S]*?\nEND \$\$;/)?.[0];
 assert.ok(body);
 assert.match(body,/FROM naijue_erp.sales_header WHERE id=NEW.sales_id FOR UPDATE/);
 assert.match(body,/IF EXISTS\(SELECT 1 FROM naijue_erp.import_record[\s\S]*?AND NOT EXISTS\(SELECT 1 FROM naijue_erp.sales_settlement WHERE id=NEW.id AND sales_id=NEW.sales_id\)/);
 assert.ok(body.indexOf('FOR UPDATE') < body.indexOf('IF EXISTS'), 'lock owner before checking live row to close concurrent-delete/reinsert race');
 assert.match(body,/retired source settlement identity cannot be recycled/);
});
test('deferred sales line evidence checks final row and exact position-release events, not intermediate NEW as final', () => {
 const body=sql().match(/CREATE FUNCTION naijue_erp\.validate_unified_sales_line_commit\(\)[\s\S]*?\nEND \$\$;/)?.[0];
 assert.ok(body);
 assert.match(body,/SELECT \* INTO STRICT final_row FROM naijue_erp.sales_line WHERE id=NEW.id AND sales_id=NEW.sales_id/);
 assert.match(body,/after_line IS DISTINCT FROM naijue_erp.unified_sales_line_audit_values\(final_row\)/);
 assert.match(body,/release_event:=prior_event IS NOT DISTINCT FROM before_line/);
 assert.match(body,/jsonb_set\(prior_event,'\{isCurrent\}','false'::jsonb\)/);
 assert.match(body,/OLD.xmin::text::bigint=mod\(pg_current_xact_id\(\)::text::numeric,4294967296\)::bigint/);
 assert.match(body,/continuation_event:=old_same_transaction/);
 assert.doesNotMatch(body,/IF TG_OP='UPDATE' AND naijue_erp.unified_sales_line_audit_values\(NEW\)[^\n]*THEN RETURN NULL/);
 assert.match(body,/n_before=0 AND n_after=0/);
 assert.match(body,/ordinary sales line event is not an exact direct change or proven position-release transition/);
});

/** Executable protocol oracle only, not a PostgreSQL trigger simulation or engine proof. */
type EvidenceLine = { id:string; quantity:string; lineNo:number; isCurrent:boolean; snapshot:string|null };
const sameEvidence = (a:EvidenceLine|null,b:EvidenceLine|null) => JSON.stringify(a)===JSON.stringify(b);
function lineEventProtocol(input:{before:EvidenceLine|null;after:EvidenceLine|null;old:EvidenceLine|null;next:EvidenceLine;final:EvidenceLine;oldSameTransaction:boolean}):boolean {
 const {before,after,old,next,final,oldSameTransaction}=input;
 if(before===null&&after===null&&old!==null&&sameEvidence(old,next)&&sameEvidence(next,final))return true;
 if(after===null||!sameEvidence(after,final))return false;
 if(old===null)return before===null&&sameEvidence(next,after);
 if(before===null||sameEvidence(before,after))return false;
 const released={...before,isCurrent:false};
 return sameEvidence(old,before)&&sameEvidence(next,after)
  || sameEvidence(old,before)&&old.isCurrent&&sameEvidence(next,{...old,isCurrent:false})
  || oldSameTransaction&&before.isCurrent&&!old.isCurrent&&sameEvidence(old,released)&&sameEvidence(next,after);
}
test('position-release protocol oracle preserves native edit/deactivation/reactivation without false inactive prehistory', () => {
 const before:EvidenceLine={id:'retained',quantity:'2',lineNo:1,isCurrent:true,snapshot:null};
 const released={...before,isCurrent:false},after={...before,quantity:'3',lineNo:2};
 const event=(old:EvidenceLine|null,next:EvidenceLine,oldSameTransaction:boolean,prior:EvidenceLine|null=before,final:EvidenceLine=after)=>lineEventProtocol({before:prior,after:final,old,next,final,oldSameTransaction});
 assert.equal(event(before,released,false),true,'pure release retains exact original facts');
 assert.equal(event(released,after,true),true,'same-transaction continuation reaches exact final row');
 assert.equal(event(before,after,false),true,'direct changes still use exact before/after');
 assert.equal(event(before,released,false,before,released),true,'ordinary deactivation is exact direct change');
 assert.equal(event(released,released,true,before,released),true,'deactivation final UPSERT may be a physical no-op');
 assert.equal(event(released,after,false,released),true,'actual previously inactive row can reactivate with its true false before');
 assert.equal(event(null,after,false,null),true,'new row has no fabricated before');
 assert.equal(event(released,after,false),false,'previously inactive is not a current-transaction release');
 assert.equal(event(released,released,false),false,'no-op warming cannot forge initially active before');
 assert.equal(event({...before,quantity:'999'},released,false),false,'wrong original quantity is not normalized away');
 assert.equal(event(before,{...released,quantity:'999'},false),false,'release changes only isCurrent');
 assert.equal(event({...released,quantity:'999'},after,true),false,'same transaction alone does not prove original facts');
 assert.equal(event(released,{...after,snapshot:'invented'},true),false,'continuation must be exact final evidence');
 assert.equal(lineEventProtocol({before,after,old:released,next:after,final:released,oldSameTransaction:true}),false,'an incomplete release cannot claim a different final row');
 assert.equal(lineEventProtocol({before:null,after:null,old:before,next:before,final:before,oldSameTransaction:false}),true,'real unaudited no-op has no delta and equals final native row');
});
test('settlement UPSERT protocol oracle distinguishes live canonical row from retired or foreign identity', () => {
 const mayInsert=(sourceBound:boolean,currentOwner:string|null,newOwner:string)=>!sourceBound||currentOwner===newOwner;
 assert.equal(mayInsert(true,'sales-A','sales-A'),true);
 assert.equal(mayInsert(true,null,'sales-A'),false);
 assert.equal(mayInsert(true,'sales-B','sales-A'),false);
 assert.equal(mayInsert(false,null,'sales-A'),true);
 // SQL source test above additionally requires the canonical owner lock before
 // observing currentOwner; this oracle alone does not establish race safety.
});
test('new ordinary header audit projections include explicit nullable staff facts, without rewriting old receipts', () => {
 const s=sql();
 const sales=s.match(/CREATE FUNCTION naijue_erp\.unified_sales_header_audit_values\([\s\S]*?\n\$\$;/)?.[0];
 const transfer=s.match(/CREATE OR REPLACE FUNCTION naijue_erp\.transfer_header_audit_values\([\s\S]*?\n\$\$;/)?.[0];
 assert.ok(sales);assert.ok(transfer,'new transfer operations require a deliberate successor projection');
 for(const body of [sales,transfer]) {
  assert.match(body,/'createdByStaffId',\s*\(?\w+\)?\.created_by_staff_id/);
  assert.match(body,/'approvedByStaffId',\s*\(?\w+\)?\.approved_by_staff_id/);
  assert.doesNotMatch(body,/coalesce\([^\n]*staff|actor_account_id/i);
 }
 assert.doesNotMatch(s,/UPDATE naijue_erp\.(audit_change|operation_receipt)/i);
 assert.match(s,/a\.after_values->'header' IS DISTINCT FROM naijue_erp\.transfer_header_audit_values\(h\)/);
 assert.match(s,/a\.before_values->'header' IS DISTINCT FROM naijue_erp\.transfer_header_audit_values\(OLD\)/);
});
/** Narrow PL/pgSQL IF-structure regression, not a complete PostgreSQL parser. */
function assertHeaderIfNesting(body:string):void {
 const code=body.replace(/--[^\n]*/g,'').replace(/'(?:''|[^'])*'/g,"''");
 let depth=0;
 for(const token of code.matchAll(/\bEND\s+IF\b|\bIF\b/g)) {
  if(/^END/.test(token[0])) { assert.ok(depth>0, 'END IF without a corresponding open IF');depth--; }
  else depth++;
 }
 assert.equal(depth,0,'every header-validation IF must close exactly once');
}
test('actual engine42601 header nesting regression: no duplicate END IF after timestamp ELSIF', () => {
 const body=sql().match(/CREATE FUNCTION naijue_erp\.validate_unified_sales_header_commit\(\)[\s\S]*?\nEND \$\$;/)?.[0];
 assert.ok(body);assertHeaderIfNesting(body);
 assert.throws(()=>assertHeaderIfNesting(body.replace(' END LOOP;',' END IF;\n END LOOP;')),/END IF without/);
});
