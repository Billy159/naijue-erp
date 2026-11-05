import test from 'node:test';import assert from 'node:assert/strict';import {createHash}from'node:crypto';
import{mapFresh35RetirementIdentities}from'../scripts/release/unified-install/fresh35-retirement-identity.mjs';
const mapping={owner:{source:'schema178_owner_old',target:'schema35_owner_new'},controller:{source:'schema178_controller_old',target:'schema35_controller_new'}};
const fixture=body=>`-- PostgreSQL database dump\n-- Name: probe(); Type: FUNCTION; Schema: naijue_erp; Owner: schema178_owner_old\nCREATE FUNCTION "naijue_erp"."probe"() RETURNS void LANGUAGE plpgsql AS $function$${body}$function$;\nALTER FUNCTION "naijue_erp"."probe"() OWNER TO "schema178_owner_old";\n-- Name: SCHEMA naijue_erp; Type: ACL; Schema: -; Owner: schema178_owner_old\nGRANT USAGE ON SCHEMA "naijue_erp" TO "schema178_controller_old";\n-- PostgreSQL database dump complete\n`;
const hash=value=>createHash('sha256').update(value).digest('hex');
test('explicit role mapping changes only headers and outer role tokens while preserving function bodies and ACL privileges',()=>{
 const sql=fixture('BEGIN RETURN; END;'),result=mapFresh35RetirementIdentities(sql,mapping);
 assert.equal(result.sourceSha256,hash(sql));assert.equal(result.sha256,hash(result.sql));
 assert.equal(result.bodyHashesBefore[0],result.bodyHashesAfter[0]);assert.equal(result.changes.length,4);
 assert.match(result.sql,/OWNER TO "schema35_owner_new"/);assert.match(result.sql,/GRANT USAGE ON SCHEMA "naijue_erp" TO "schema35_controller_new"/);
 assert.doesNotMatch(result.sql,/schema178_/);assert.equal(result.privilegeKindsAndGrantOptionsChanged,false);
});
test('identities embedded in function bodies, string literals or non-role identifier positions refuse instead of global replace',()=>{
 assert.throws(()=>mapFresh35RetirementIdentities(fixture("BEGIN PERFORM 'schema178_owner_old'; END;"),mapping),/EMBEDDED_IDENTITY/);
 assert.throws(()=>mapFresh35RetirementIdentities(fixture('BEGIN RETURN; END;').replace('probe"() RETURNS','schema178_owner_old"() RETURNS'),mapping),/NON_ROLE_IDENTITY/);
});
test('mapping cannot overlap, reuse the old role, touch a protected role or omit a declared source identity',()=>{
 const sql=fixture('BEGIN RETURN; END;');
 for(const change of [{...mapping,owner:{...mapping.owner,target:mapping.owner.source}},{...mapping,owner:{...mapping.owner,target:'erp_unified27_runtime_2393dbc6db9581c2'}},{...mapping,controller:{...mapping.controller,source:'missing_controller'}}])assert.throws(()=>mapFresh35RetirementIdentities(sql,change),/IDENTITY_MAPPING|IDENTITY_SOURCE/);
});
