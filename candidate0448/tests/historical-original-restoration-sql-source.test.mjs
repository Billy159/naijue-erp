/** SOURCE CONSTRUCTION ONLY. No PostgreSQL parser, privileges, trigger or transaction proof. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const hash = value => createHash('sha256').update(value).digest('hex');
const extract = (source, name) => {
 const match = source.match(new RegExp('CREATE (?:OR REPLACE )?FUNCTION naijue_erp\\.' + name + '\\([\\s\\S]*?AS \\$\\$([\\s\\S]*?)\\$\\$;'));
 assert(match, `missing function ${name}`); return match[1];
};
const candidatePath = 'adapters/postgres/patches/0027_historical-original-restoration_successor.sql';
function candidate() {
 const sql = read(candidatePath);
 const spec = JSON.parse(sql.match(/\$source_changes\$([\s\S]*?)\$source_changes\$/)[1]);
 let body = extract(read('adapters/postgres/migrations/0027_unified_business_documents.sql'), 'validate_sales_settlement');
 const prior = JSON.parse(read('adapters/postgres/patches/0027_historical_missing_settlement_successor.sql').match(/\$source_changes\$([\s\S]*?)\$source_changes\$/)[1]);
 for (const change of prior.replacements) { assert.equal(body.split(change.before).length - 1, 1); body = body.split(change.before).join(change.after); }
 assert.equal(hash(body), spec.predecessor_sha256);
 const before = body;
 const extension = sql.match(/\$restoration_proof\$([\s\S]*?)\$restoration_proof\$/)[1];
 for (const change of spec.replacements) {
  const after = change.after === '$RESTORATION_PROOF' ? extension + change.before : change.after;
  assert.equal(body.split(change.before).length - 1, 1); body = body.split(change.before).join(after);
 }
 assert.equal(hash(body), spec.successor_sha256);
 return { sql, spec, body, before, extension };
}
test('candidate builds exactly on missing-settlement successor with literal single anchors and pins', () => {
 const { sql, spec } = candidate();
 assert.match(sql, /SOURCE CANDIDATE ONLY/);
 for (const dep of spec.dependencies) {
  if (dep.from_candidate) {
   const prior = JSON.parse(read(dep.source).match(/\$source_profile_changes\$([\s\S]*?)\$source_profile_changes\$/)[1]);
   let body = extract(read('adapters/postgres/patches/0027_standard_import_whole_package_v2.sql'), dep.name);
   assert.equal(hash(body), prior.predecessor_sha256);
   for (const change of prior.replacements) { assert.equal(body.split(change.before).length - 1, 1); body = body.split(change.before).join(change.after); }
   assert.equal(hash(body), prior.successor_sha256); assert.equal(hash(body), dep.sha256);
  } else assert.equal(hash(extract(read(dep.source), dep.name)), dep.sha256, dep.signature);
 }
 assert.match(sql, /before_meta IS DISTINCT FROM after_meta/);
 assert.match(sql, /RESTORATION_DEPENDENCY_DIFFERS/);
 assert.match(sql, /RESTORATION_TRIGGER_DIFFERS/);
 assert.match(sql, /RESTORATION_METADATA_UNSAFE/);
 assert.match(sql, /grantee=0/);
 assert.doesNotMatch(sql.replace(/--[^\n]*/g, ''), /\b(?:GRANT|DROP|TRUNCATE|ALTER ROLE|CREATE ROLE|SECURITY DEFINER)\b/i);
});
test('ordinary historical absence including zero net requires proof, normal settlement equality remains strict', () => {
 const { body } = candidate();
 assert.match(body, /h\.status='APPROVED' AND h\.stock_basis='CUTOFF_HISTORY' AND settlement_count=0 AND evidence\.action<>'MIGRATE_DOCUMENT'/);
 assert.match(body, /preserve_missing_original IS NOT TRUE AND total IS DISTINCT FROM h\.net_due/);
 assert.match(body, /HISTORICAL_ORIGINAL_RESTORATION_REQUIRED/);
 assert.doesNotMatch(body, /net_due\s*=\s*0/);
});
test('origin requires immutable positive-version approved SALE, digest, source and published baseline closure', () => {
 const { extension } = candidate();
 for (const guard of ['RESTORATION_ORIGIN_INVALID','RESTORATION_PUBLICATION_INVALID','RESTORATION_SOURCE_INVALID','RESTORATION_BASELINE_INVALID']) assert(extension.includes(guard));
 assert.match(extension, /origin_version:=origin_audit\.new_version/);
 assert.match(extension, /origin_version IS NULL OR origin_version<1 OR origin_version>=h\.version/);
 assert.match(extension, /origin_header->'version' IS DISTINCT FROM to_jsonb\(origin_version\)/);
 assert.match(extension, /origin_receipt\.result_data->'version' IS DISTINCT FROM to_jsonb\(origin_version\)/);
 assert.match(extension, /origin_header->>'business_type' IS DISTINCT FROM 'SALE'/);
 assert.match(extension, /origin_header->>'status' IS DISTINCT FROM 'APPROVED'/);
 assert.match(extension, /origin_receipt\.result_data->>'exposureDigest' IS DISTINCT FROM encode\(sha256/);
 assert.match(extension, /origin_snapshot->'settlements' IS DISTINCT FROM '\[\]'::jsonb/);
 assert.doesNotMatch(extension, /PERFORM naijue_erp\.(?:assert_document_migration|assert_unified_current_actor|standard_import_identity)|naijue_erp\.(?:standard_import_record_proof|standard_import_row_intent|import_source_row)/);
});
test('all actual rows and non-lifecycle header columns must still equal source origin exactly', () => {
 const { extension } = candidate();
 assert.match(extension, /current_snapshot->'lines' IS DISTINCT FROM origin_snapshot->'lines'/);
 assert.match(extension, /current_snapshot->'settlements' IS DISTINCT FROM '\[\]'::jsonb/);
 assert.match(extension, /\(current_snapshot->'header'\) - mutable_header/);
 assert.match(extension, /origin_header - mutable_header/);
 assert.match(extension, /RESTORATION_CURRENT_ROWS_DIFFER/);
});
test('every audit and receipt version is covered without truncation or gaps', () => {
 const { extension } = candidate();
 assert.match(extension, /audit_count IS DISTINCT FROM h\.version::bigint-origin_version::bigint\+1/);
 assert.match(extension, /receipt_count IS DISTINCT FROM h\.version::bigint-origin_version::bigint\+1/);
 assert.match(extension, /step\.old_version IS DISTINCT FROM expected_version/);
 assert.match(extension, /step\.new_version IS DISTINCT FROM expected_version\+1/);
 assert.match(extension, /expected_version IS DISTINCT FROM h\.version/);
 assert.match(extension, /expected_version:=origin_version/);
 assert.match(extension, /aa\.new_version>origin_version ORDER BY aa\.new_version/);
 assert.match(extension, /expected_version=origin_version AND l\.baseline_anchor_operation_id=origin_receipt\.id/);
 assert.match(extension, /expected_version>origin_version AND l\.baseline_anchor_operation_id IS NULL/);
 assert.doesNotMatch(extension, /origin_audit\.new_version IS DISTINCT FROM 1|expected_version[=:>]1|aa\.new_version>1/);
 assert.doesNotMatch(extension, /\bLIMIT\b|MAX_HISTORY|2000/);
});
test('any line or settlement delta or economic header delta anywhere in the chain rejects', () => {
 const { extension } = candidate();
 for (const side of ['before_values','after_values']) for (const rows of ['lines','settlements']) assert(extension.includes(`step.${side}->'${rows}' IS DISTINCT FROM '[]'::jsonb`));
 assert.match(extension, /allowed_header:=CASE step\.action WHEN 'SAVE' THEN ARRAY\['version','note','responsibleStaffId','updatedAt'\]/);
 assert.match(extension, /before_header - allowed_header IS DISTINCT FROM '\{\}'::jsonb/);
 assert.match(extension, /after_header - allowed_header IS DISTINCT FROM '\{\}'::jsonb/);
 assert.match(extension, /RESTORATION_ECONOMIC_OR_UNSUPPORTED_DELTA/);
});
test('sparse header pairs reject omissions, preserve explicit null and compare timestamps as instants', () => {
 const { extension } = candidate();
 assert.match(extension, /array_agg\(key ORDER BY key\).*jsonb_object_keys\(before_header\)/);
 assert.match(extension, /array_agg\(key ORDER BY key\).*jsonb_object_keys\(after_header\)/);
 assert.match(extension, /IF field IN \('updatedAt','approvedAt'\) THEN/);
 assert.match(extension, /::timestamptz IS DISTINCT FROM/);
 assert.match(extension, /cursor_header:=jsonb_set\(cursor_header,ARRAY\[field\],after_header->field\)/);
 assert.match(extension, /RESTORATION_SPARSE_HEADER_INVALID/);
});
test('source body leaves ordinary actor, exact line effects and native mutation validators intact', () => {
 const { body, before, extension } = candidate();
 assert.equal(body.slice(body.indexOf(" IF evidence.action='MIGRATE_DOCUMENT' THEN PERFORM")), before.slice(before.indexOf(" IF evidence.action='MIGRATE_DOCUMENT' THEN PERFORM")));
 assert.doesNotMatch(extension, /\b(?:INSERT|UPDATE|DELETE|EXECUTE|CREATE|ALTER|SET CONSTRAINTS)\b|xmin|pg_current_xact_id/i);
 assert.match(extension, /RESTORATION_EFFECTS_INVALID/);
 assert.match(extension, /step\.result_data->>'operationId' IS DISTINCT FROM step\.operation_id::text/);
});

test('known header, signed-line and allocation contradictions reject before missing-evidence exception', () => {
 const { extension } = candidate();
 assert.match(extension, /h\.gross_amount IS DISTINCT FROM \(SELECT sum\(ln\.line_amount\)/);
 assert.match(extension, /h\.net_due IS DISTINCT FROM h\.gross_amount-h\.order_discount/);
 assert.match(extension, /ln\.line_amount IS DISTINCT FROM ln\.quantity::numeric\*ln\.deal_price/);
 assert.match(extension, /RESTORATION_KNOWN_ECONOMICS_DIFFER/);
 assert.match(extension, /ln\.allocated_discount IS NULL/);
 assert(extension.indexOf('RESTORATION_KNOWN_ECONOMICS_DIFFER') < extension.indexOf('preserve_missing_original:=true'));
});

test('trigger admission binds original predicates, full event columns and zero arguments', () => {
 const {sql,spec}=candidate();
 const sources=['adapters/postgres/migrations/0001_runtime_sales.sql','adapters/postgres/migrations/0007_sparse_inventory_cutoff.sql','adapters/postgres/migrations/0027_unified_business_documents.sql'].map(read).join('\n');
 for(const guard of spec.triggers){
  const declarations=[...sources.matchAll(new RegExp(`CREATE (?:CONSTRAINT )?TRIGGER ${guard.name}\\b[\\s\\S]*?;`,'g'))];
  const original=declarations.at(-1)?.[0]; assert(original,guard.name);
  assert.doesNotMatch(original,/UPDATE OF|REFERENCING/);
  assert(original.endsWith(`EXECUTE FUNCTION naijue_erp.${guard.function}();`));
  if(guard.name==='unified_ordinary_operation_consistency')assert.match(original,/WHEN\(NEW\.target_type IN \('SALES','TRANSFER'\)\)/);
  else assert.doesNotMatch(original,/\bWHEN\b/);
 }
 const gate=sql.slice(sql.indexOf(" FOR guard IN"),sql.indexOf(' definition:=pg_catalog.pg_get_functiondef'));
 for(const invariant of ["NOT t.tgisinternal","t.tgnargs=0","t.tgargs=''::bytea","t.tgattr=''::int2vector","t.tgoldtable IS NULL","t.tgnewtable IS NULL","ELSE t.tgqual IS NULL END"]){assert(gate.includes(invariant),invariant);}
 assert(gate.includes("WHEN guard->>'name'='unified_ordinary_operation_consistency' THEN t.tgqual IS NOT NULL"));
 const expected="$trigger$((new.target_type = ANY (ARRAY['SALES'::text, 'TRANSFER'::text])))$trigger$";
 assert(gate.includes("split_part(split_part(pg_catalog.pg_get_triggerdef(t.oid,false),' WHEN ',2),' EXECUTE FUNCTION ',1)="+expected));
 assert(read('adapters/postgres/src/published-document-inventory-anchor-reader.ts').includes(expected),'same exact predicate as current published anchor verifier');
});
