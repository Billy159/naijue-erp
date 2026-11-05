import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';import{createHash}from'node:crypto';
const read=path=>readFileSync(new URL('../adapters/postgres/'+path,import.meta.url),'utf8'),hash=x=>createHash('sha256').update(x).digest('hex');
const extract=(s,name)=>s.match(new RegExp('CREATE OR REPLACE FUNCTION naijue_erp\\.'+name+'\\([\\s\\S]*?AS \\$\\$([\\s\\S]*?)\\$\\$;'))[1];
test('missing settlement successor preserves exact migration proof and rejects ordinary approval bypass',()=>{
 const sql=read('patches/0027_historical_missing_settlement_successor.sql'),spec=JSON.parse(sql.match(/\$source_changes\$([\s\S]*?)\$source_changes\$/)[1]);
 let body=extract(read('migrations/0027_unified_business_documents.sql'),'validate_sales_settlement');assert.equal(hash(body),spec.predecessor_sha256);
 assert.equal(hash(extract(read('patches/0027_standard_import_initialization.sql'),'assert_document_migration')),spec.migration_proof_sha256);
 for(const x of spec.replacements){assert.equal(body.split(x.before).length-1,1);body=body.split(x.before).join(x.after);}assert.equal(hash(body),spec.successor_sha256);
 assert.match(body,/count\(\*\) INTO total,settlement_count/);
 assert(body.indexOf('PERFORM naijue_erp.assert_document_migration(r.id)')<body.indexOf('preserve_missing_original:='));
 assert.match(body,/h\.business_type='SALE' AND h\.stock_basis='CUTOFF_HISTORY' AND settlement_count=0/);
 assert.match(body,/evidence\.after_values->'settlements'='\[\]'::jsonb/);
 assert.match(body,/h\.status='APPROVED' AND preserve_missing_original IS NOT TRUE AND total IS DISTINCT FROM h\.net_due/);
 assert.equal((body.match(/preserve_missing_original:=/g)||[]).length,1);
 assert.match(sql,/MISSING_SETTLEMENT_PROOF_DIFFERS/);assert.match(sql,/before_meta IS DISTINCT FROM after_meta/);
 assert.doesNotMatch(sql,/\b(?:GRANT|DROP|TRUNCATE|ALTER ROLE|CREATE ROLE)\b/i);
});
