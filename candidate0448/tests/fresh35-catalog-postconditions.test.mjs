import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { loadFresh35RetirementPlan } from '../scripts/release/unified-install/fresh35-retirement-plan.mjs';
import { loadFresh35PostconditionEvidence, projectFresh35CoreMetadata, buildFresh35CatalogPostconditions } from '../scripts/release/unified-install/fresh35-catalog-postconditions.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const dir=process.env.FRESH35_PREDECESSOR_EVIDENCE_DIR;
const mapping={schema178_owner_20261104_1710:'fresh35_owner_20261104_r1',schema178_controller_20261104_1710:'fresh35_controller_20261104_r1'};
test('postcondition renderer refuses caller invented metadata/complete flags',()=>{assert.throws(()=>buildFresh35CatalogPostconditions({}, {}, mapping,{complete:true,sql:'SELECT true;'}),/PINNED_POSTCONDITION_EVIDENCE_REQUIRED/);});
test('pinned real178 metadata projects exact full152 definitions, ACL and structural cohorts',{skip:!dir},async()=>{
 const evidence=await loadFresh35PostconditionEvidence(dir),plan=await loadFresh35RetirementPlan(root),model=projectFresh35CoreMetadata(evidence,plan,mapping);
 assert.equal(model.routines.length,152);assert.equal(model.constraints.length,326);assert.equal(model.indexes.length,111);assert.equal(model.triggers.length,570);assert.equal(model.relations.length,150);assert.equal(model.columnAcls.length,351);
 assert.equal(model.triggers.filter(row=>row.metadata.tgisinternal).length,418);assert.equal(model.constraints.filter(row=>row.name.startsWith('fresh27_')).length,0);
 assert.ok(model.routines.every(row=>row.owner===mapping[evidence.sourceTarget.target.owner]));assert.ok(JSON.stringify(model.routines).includes('fresh35_owner_20261104_r1=X/fresh35_owner_20261104_r1'));assert.equal(model.installationReady,false);
 assert.throws(()=>buildFresh35CatalogPostconditions(evidence,plan,mapping,{format:'FRESH35_SCHEMA_METADATA_SUPPLEMENT_V1',complete:true,sql:'SELECT true;',sourceSetSha256:plan.sourceSetSha256}),/GENUINE_SOURCE_METADATA_REQUIRED/);
});
test('metadata derivation rejects body/source/mapping drift and does not treat a cloned evidence as pinned',{skip:!dir},async()=>{
 const evidence=await loadFresh35PostconditionEvidence(dir),plan=await loadFresh35RetirementPlan(root);
 const wrong=structuredClone(evidence);wrong.functions[0].catalog.prosrc+='x';assert.throws(()=>projectFresh35CoreMetadata(wrong,plan,mapping),/ROUTINE_SOURCE_DIFFERS/);
 assert.throws(()=>projectFresh35CoreMetadata(evidence,plan,{...mapping,other:'extra'}),/ROLE_MAPPING/);
 assert.throws(()=>buildFresh35CatalogPostconditions(structuredClone(evidence),plan,mapping),/PINNED_POSTCONDITION/);
});

test('complete postcondition source binds original dump, mapped schema and every declared collection',{skip:!dir},async()=>{
 const evidence=await loadFresh35PostconditionEvidence(dir),plan=await loadFresh35RetirementPlan(root),result=buildFresh35CatalogPostconditions(evidence,plan,mapping);
 assert.equal(result.model.mappedSchemaSha256,'ee3ab325dd5b412d5d0efc0b47eecbf97d9c68eae30de8ba5c37c21d3af25d3a');
 assert.equal(result.model.tables.length,35);assert.equal(result.model.columns.length,351);assert.equal(result.model.sequences.length,4);assert.equal(result.model.policies.length,32);
 assert.equal(result.model.columns.filter(c=>c.generated==='s').length,33);assert.equal(result.model.columns.filter(c=>c.defaultExpression!==null).length,4);
 for(const name of ['ROUTINE_METADATA','SCHEMA_ACL','RELATIONS','COLUMNACLS','CONSTRAINTS','INDEXES','TRIGGERS','TABLES','COLUMNS','SEQUENCES','POLICIES','ROWTYPE_METADATA'])assert.ok(result.sql.includes('FRESH35_COMPLETE_'+name+'_DIFFER'),name);
 assert.match(result.sql,/pg_get_functiondef/);assert.match(result.sql,/pg_get_expr/);assert.match(result.sql,/quote_all_identifiers=on/);assert.match(result.sql,/quote_all_identifiers=off/);
 assert.equal(result.engineVerified,false);assert.equal(result.installationReady,false);assert.equal(result.targetAdmitted,false);
 assert.doesNotMatch(result.sql,/\bCREATE (?:TABLE|FUNCTION|ROLE)|\bGRANT .* ON|\bREVOKE .* ON|has_function_privilege|has_parameter_privilege/);
});
test('a genuine metadata object with changed mapped source still rejects',{skip:!dir},async()=>{
 const evidence=await loadFresh35PostconditionEvidence(dir),plan=await loadFresh35RetirementPlan(root);
 const {compileFresh35SchemaFromDump}=await import('../scripts/release/unified-install/fresh35-retirement-schema.mjs');
 const {mapFresh35RetirementIdentities}=await import('../scripts/release/unified-install/fresh35-retirement-identity.mjs');
 const {collectFresh35RetirementMetadata}=await import('../scripts/release/unified-install/fresh35-retirement-metadata.mjs');
 const compiled=compileFresh35SchemaFromDump(evidence.dump,plan,{dumpSha256:evidence.pins['schema178-naijue-erp.sql'],predecessorSourceSpecSha256:plan.predecessorSourceSpecSha256});
 const mapped=mapFresh35RetirementIdentities(compiled.sql,{owner:{source:evidence.sourceTarget.target.owner,target:mapping[evidence.sourceTarget.target.owner]},controller:{source:evidence.sourceTarget.target.controller,target:mapping[evidence.sourceTarget.target.controller]}});
 const altered=collectFresh35RetirementMetadata(mapped.sql.replace('CACHE 1;','CACHE 2;'));
 assert.throws(()=>buildFresh35CatalogPostconditions(evidence,plan,mapping,altered),/METADATA_SCHEMA_DIFFERS/);
});
test('PLpgSQL collection SQL qualifies JSON columns and collation has the declared object shape',async()=>{
 const {readFile}=await import('node:fs/promises');const source=await readFile(new URL('../scripts/release/unified-install/fresh35-catalog-postconditions.mjs',import.meta.url),'utf8');
 assert.match(source,/jsonb_agg\(observed\.item ORDER BY observed\.item::text/);
 assert.match(source,/jsonb_agg\(declared\.value ORDER BY declared\.value::text/);
 assert.doesNotMatch(source,/jsonb_agg\(item ORDER BY item::text/);
 assert.match(source,/'collation',CASE WHEN a\.attcollation=t\.typcollation THEN NULL ELSE pg_catalog\.jsonb_build_object\('schema',cn\.nspname,'name',coll\.collname\) END/);
});
