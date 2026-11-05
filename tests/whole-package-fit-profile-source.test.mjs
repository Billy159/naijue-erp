/** Offline source/contract regression only. No PostgreSQL connection or execution. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {
 SCHEMA_DECLARATIONS_SHA256, NUMERIC_FIT_SCHEMA_DECLARATIONS_SHA256,
 STAFF_DEPARTURE_SCHEMA_DECLARATIONS_SHA256, TABLE_SCHEMAS, NUMERIC_FIT_TABLE_SCHEMAS,
} from '../packages/application/src/unified-import-contract.ts';
import {renderWholeSearchPathHardening} from '../scripts/release/unified-install/whole-search-path-source.mjs';
import {loadWholeCatalogSpec} from '../scripts/release/unified-install/whole-catalog-gate.mjs';

const read=name=>readFileSync(new URL('../adapters/postgres/patches/'+name,import.meta.url),'utf8');
const sha=text=>createHash('sha256').update(text).digest('hex');
const sql=read('0027_standard_import_whole_package_v2.sql');
const body=sql.match(/CREATE OR REPLACE FUNCTION naijue_erp\.standard_whole_package_command_v2\([^\n]+\nSET [^\n]+ AS \$\$([\s\S]*?)\$\$;/)[1];
const blockPattern=/     -- WHOLE_FIT_PROFILE_GUARD_BEGIN\n[\s\S]*?     -- WHOLE_FIT_PROFILE_GUARD_END\n/g;
const blocks=sql.match(blockPattern);
assert.equal(blocks?.length,1);
const guard=blocks[0];
const rule=guard.match(/CASE WHEN cfg->>'schema_declarations_sha256' IN\s*\(([^)]+)\)\s*THEN '([^']+)' ELSE '([^']+)' END/);
assert.ok(rule);
const numericProfiles=[...rule[1].matchAll(/'([a-f0-9]{64})'/g)].map(m=>m[1]);
const beforeBody='30086edb37c34555f0833db665f62f77ccf72a5f7d0d785c22e35e9aa65411f3';
const afterBody=sha(body);
const signature='naijue_erp.standard_whole_package_command_v2(jsonb,text,text,uuid,integer)';
// This intentionally models only the source predicate, not PL/pgSQL or a server.
// Require the complete value so JavaScript's end-anchor behavior cannot accept a trailing newline.
const sourcePredicate=(profile,code)=>typeof code==='string'&&new RegExp(numericProfiles.includes(profile)?rule[2]:rule[3]).exec(code)?.[0]===code;

test('candidate differs from exact prior kernel only by the FIT validation block',()=>{
 assert.equal(sha(sql.replace(blockPattern,'')),'d9fdb77367c03ca6d726f50992fd4bdfd30beb8c62a2aa1b3cc4a228defede31');
 assert.equal(sha(body.replace(blockPattern,'')),beforeBody);
 assert.notEqual(afterBody,beforeBody);
 assert.doesNotMatch(guard,/\b(?:INSERT|UPDATE|DELETE|ALTER|GRANT|REVOKE|CREATE|DROP)\b|jsonb_set\(/);
});

test('FIT validation uses immutable INIT before preparation or native population and rejects NULL/coercion',()=>{
 const at=body.indexOf(guard);
 assert.ok(at>body.indexOf("cfg:=initial_request->'payload';old_cp:=b.checkpoint;"));
 assert.match(body.slice(0,at),/SELECT a\.after_values->'request' INTO STRICT initial_request[\s\S]*?r\.target_id=baseline\.id AND r\.action='IMPORT_INITIALIZE_CURRENT_ADMIN'/);
 assert.ok(at<body.indexOf('INSERT INTO naijue_erp.operation_receipt'));
 assert.ok(at<body.indexOf('jsonb_populate_record(NULL::naijue_erp.%I'));
 assert.match(guard,/IF kind='FIT' AND \(jsonb_typeof\(fields->'code'\) IS DISTINCT FROM 'string'/);
 assert.match(guard,/fields->>'code' COLLATE "C" ~/);
 assert.match(guard,/END\) IS DISTINCT FROM true\) THEN/);
 assert.match(guard,/RAISE EXCEPTION 'WHOLE_FIT_SCHEMA_PROFILE_INVALID' USING ERRCODE='23514'/);
 assert.doesNotMatch(guard,/payload->|request->|coalesce|::(?:numeric|integer)|trim|upper|lower/);
});

test('SQL source selects exactly the two explicit numeric contracts, retaining omitted/legacy letter rules',()=>{
 assert.deepEqual(numericProfiles,[NUMERIC_FIT_SCHEMA_DECLARATIONS_SHA256,STAFF_DEPARTURE_SCHEMA_DECLARATIONS_SHA256]);
 assert.equal(rule[2],NUMERIC_FIT_TABLE_SCHEMAS.fit.code.pattern);
 assert.equal(rule[3],TABLE_SCHEMAS.fit.code.pattern);
 const init=body.match(/payload->>'schema_declarations_sha256' NOT IN \(([^)]+)\)/);
 assert.ok(init);
 assert.deepEqual([...init[1].matchAll(/'([a-f0-9]{64})'/g)].map(m=>m[1]),[SCHEMA_DECLARATIONS_SHA256,...numericProfiles]);
 assert.match(body,/payload \? 'schema_declarations_sha256' AND \(jsonb_typeof\(payload->'schema_declarations_sha256'\) IS DISTINCT FROM 'string'/);
});

test('source-predicate model covers all ASCII, exact numeric strings and malformed values without rewriting',()=>{
 const letters='ABCDEFGHIJKLMNOPQRSTUVWXYZ',digits='356789';
 for(const profile of [undefined,SCHEMA_DECLARATIONS_SHA256,...numericProfiles]){
  const allowed=letters+(numericProfiles.includes(profile)?digits:'');
  for(let i=0;i<128;i++)assert.equal(sourcePredicate(profile,String.fromCharCode(i)),allowed.includes(String.fromCharCode(i)),`${profile}:${i}`);
  for(const invalid of [null,undefined,5,true,false,{},[],['5'],'','05','AA',' 5','5 ','5\n','A\n','Ａ','５','É','😀']){
   assert.equal(sourcePredicate(profile,invalid),false,JSON.stringify({profile,invalid}));
  }
 }
 for(const profile of [undefined,SCHEMA_DECLARATIONS_SHA256])assert.equal(sourcePredicate(profile,'5'),false);
 for(const profile of numericProfiles)assert.equal(sourcePredicate(profile,'5'),true);
});

test('access and both hardening passes pin exactly the new body, with no other pin/ACL changes',()=>{
 for(const [name,count,beforeFile] of [
  ['0027_standard_import_whole_package_access_v2.sql',1,'0271875e7b123b8dee2db81ffcef3038277e9111777c864be580ee538a3a291c'],
  ['0027_standard_import_whole_package_search_path_v2.sql',2,'892613c0aefc9aa0c7e793da481e09899b626dedfa6d52d74811bbea545f6210'],
 ]){
  const text=read(name),needle=JSON.stringify({signature,sha256:afterBody}).slice(1,-1);
  assert.equal(text.split(needle).length-1,count);
  assert.equal(text.includes(beforeBody),false);
  assert.equal(sha(text.replaceAll(afterBody,beforeBody)),beforeFile);
 }
});

test('generated hardening and source-derived installed-catalog expectations agree on the candidate',async()=>{
 assert.equal(await renderWholeSearchPathHardening(process.cwd()),read('0027_standard_import_whole_package_search_path_v2.sql'));
 const spec=await loadWholeCatalogSpec(process.cwd());
 assert.deepEqual(spec.pins.filter(p=>p.signature===signature).map(p=>p.sha256),[afterBody]);
});
