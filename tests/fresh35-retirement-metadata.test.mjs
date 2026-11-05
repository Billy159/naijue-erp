import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { collectFresh35RetirementMetadata, requireFresh35RetirementMetadata } from '../scripts/release/unified-install/fresh35-retirement-metadata.mjs';

const owner='fresh35_owner_20261104_r1';
const role='erp_unified27_runtime_2393dbc6db9581c2';
const section=(name,type,sql,schema='naijue_erp')=>`--\n-- Name: ${name}; Type: ${type}; Schema: ${schema}; Owner: ${owner}\n--\n\n${sql}\n\n`;
const dump=parts=>`--\n-- PostgreSQL database dump\n--\n\n${parts.join('')}-- PostgreSQL database dump complete\n`;
const schema=section('naijue_erp','SCHEMA',`CREATE SCHEMA "naijue_erp";\nALTER SCHEMA "naijue_erp" OWNER TO "${owner}";`,'-');
const tableSql=`CREATE TABLE "naijue_erp"."sample" (
    "id" "uuid" NOT NULL,
    "price" numeric(18,2) DEFAULT (COALESCE(1, 2)) NOT NULL,
    "payload" "jsonb" DEFAULT '{"comma": [1,2], "quote": "a,b"}'::"jsonb",
    "tags" "uuid"[],
    "folded" "text" GENERATED ALWAYS AS (COALESCE('a,b'::"text", 'c'::"text")) STORED,
    "barcode" "text" NOT NULL COLLATE "pg_catalog"."C",
    CONSTRAINT "sample_check" CHECK (("price" > (0)::numeric))
);\nALTER TABLE "naijue_erp"."sample" OWNER TO "${owner}";`;
const table=section('sample','TABLE',tableSql);
const policySql=`CREATE POLICY "sample_policy" ON "naijue_erp"."sample" AS RESTRICTIVE FOR SELECT TO "${role}", PUBLIC USING ((COALESCE('a,b'::"text", 'c'::"text") = 'a,b'::"text"));`;
const policy=section('sample sample_policy','POLICY',policySql);
const seqSql=`CREATE SEQUENCE "naijue_erp"."sample_seq"\n    START WITH 1\n    INCREMENT BY 1\n    NO MINVALUE\n    NO MAXVALUE\n    CACHE 1;\nALTER SEQUENCE "naijue_erp"."sample_seq" OWNER TO "${owner}";`;
const seq=section('sample_seq','SEQUENCE',seqSql);
const fixture=()=>dump([schema,table,seq,policy]);
const findColumn=(metadata,name)=>metadata.columns.find(column=>column.name===name);

test('extracts resolved declaration metadata without splitting nested commas or quoted JSON',()=>{
 const m=collectFresh35RetirementMetadata(fixture());
 assert.equal(m.tables.length,1);assert.equal(m.columns.length,6);
 assert.equal(findColumn(m,'price').typeSql,'numeric(18,2)');
 assert.equal(findColumn(m,'price').typeSchema,'pg_catalog');assert.equal(findColumn(m,'price').typeName,'numeric');
 assert.equal(findColumn(m,'price').typeModifier,1179654);
 assert.equal(findColumn(m,'price').defaultExpression,'(COALESCE(1, 2))');assert.equal(findColumn(m,'price').notNull,true);
 assert.equal(findColumn(m,'payload').defaultExpression,`'{"comma": [1,2], "quote": "a,b"}'::"jsonb"`);
 assert.equal(findColumn(m,'tags').arrayDimensions,1);assert.equal(findColumn(m,'tags').typeName,'uuid');
 assert.equal(findColumn(m,'folded').generatedExpression,`COALESCE('a,b'::"text", 'c'::"text")`);
 assert.equal(findColumn(m,'folded').generated,'s');assert.equal(findColumn(m,'folded').defaultExpression,null);
 assert.deepEqual(findColumn(m,'barcode').collation,{schema:'pg_catalog',name:'C'});
 assert.equal(m.tables[0].owner,owner);assert.equal(m.tables[0].rowSecurity,false);
 assert.equal(m.sourceSha256,createHash('sha256').update(fixture()).digest('hex'));
 assert.equal(m.engineVerified,false);assert.equal(m.catalogAdmitted,false);assert.equal(m.installationReady,false);assert.equal(m.existingTargetMutation,false);
 assert.ok(Object.isFrozen(m)&&Object.isFrozen(m.columns)&&Object.isFrozen(m.columns[0]));
});

test('genuine source brand rejects caller copies and all plain objects',()=>{
 const m=collectFresh35RetirementMetadata(fixture());assert.equal(requireFresh35RetirementMetadata(m),m);
 for(const forged of [{...m},JSON.parse(JSON.stringify(m)),{complete:true,sql:fixture()},null,42])assert.throws(()=>requireFresh35RetirementMetadata(forged),/GENUINE_SOURCE_METADATA_REQUIRED/);
 assert.equal(m.aclEffectiveStateResolved,false);assert.deepEqual(m.roleNames,[role,owner].sort());
});

test('extracts bigint sequence defaults as decimal strings, not lossy numbers',()=>{
 const s=collectFresh35RetirementMetadata(fixture()).sequences[0];
 const {parameterResolution,...values}=s;assert.deepEqual(parameterResolution,{postgresqlMajor:17,dataTypeDefaulted:true,minimumDefaulted:true,maximumDefaulted:true,boundsRule:'BY_TYPE_AND_INCREMENT_DIRECTION'});
 assert.deepEqual(values,{schema:'naijue_erp',name:'sample_seq',owner,dataType:'bigint',typeSchema:'pg_catalog',typeName:'int8',start:'1',increment:'1',min:'1',max:'9223372036854775807',cache:'1',cycle:false,ownedBy:null});
 const sql=fixture().replace('START WITH 1','AS integer\n    START WITH -3').replace('INCREMENT BY 1','INCREMENT BY -2').replace('NO MINVALUE','MINVALUE -2147483648').replace('NO MAXVALUE','NO MAXVALUE\n    CYCLE');
 const other=collectFresh35RetirementMetadata(sql).sequences[0];assert.equal(other.max,'-1');assert.equal(other.min,'-2147483648');assert.equal(other.increment,'-2');assert.equal(other.cycle,true);assert.equal(other.typeName,'int4');
});

test('rejects sequence increment/cache values outside PostgreSQL int8 storage bounds',()=>{
 for(const [before,after] of [
  ['INCREMENT BY 1','INCREMENT BY 9223372036854775808'],
  ['INCREMENT BY 1','INCREMENT BY -9223372036854775809'],
  ['CACHE 1','CACHE 9223372036854775808'],
 ]) assert.throws(()=>collectFresh35RetirementMetadata(fixture().replace(before,after)),/SEQUENCE_PARAMETERS_OUT_OF_INT8_RANGE/);
 for(const [before,after] of [
  ['INCREMENT BY 1','INCREMENT BY 9223372036854775807'],
  ['INCREMENT BY 1','INCREMENT BY -9223372036854775808'],
  ['CACHE 1','CACHE 9223372036854775807'],
 ]) {
  const input=fixture().replace(before,after).replace('START WITH 1','START WITH -1');
  const valid=before.startsWith('INCREMENT')&&after.includes('-')?input:fixture().replace(before,after);
  const m=collectFresh35RetirementMetadata(valid);assert.equal(requireFresh35RetirementMetadata(m),m);
 }
});

test('extracts policy command, permissiveness, resolved roles and unwrapped expressions',()=>{
 const p=collectFresh35RetirementMetadata(fixture()).policies[0];
 assert.deepEqual(p,{schema:'naijue_erp',table:'sample',name:'sample_policy',command:'r',permissive:false,roles:[role,'PUBLIC'],usingExpression:`(COALESCE('a,b'::"text", 'c'::"text") = 'a,b'::"text")`,withCheckExpression:null});
 const sql=fixture().replace('AS RESTRICTIVE FOR SELECT ', '').replace('USING ((COALESCE', 'USING ((COALESCE').replace("= 'a,b'::\"text\"));", "= 'a,b'::\"text\")) WITH CHECK (true);");
 const all=collectFresh35RetirementMetadata(sql).policies[0];assert.equal(all.command,'*');assert.equal(all.permissive,true);assert.equal(all.withCheckExpression,'true');
});

test('extracts ordered ACL statements including column grants and revokes with grantor identity',()=>{
 const acl=section('COLUMN sample.id','ACL',`GRANT INSERT("id"),UPDATE("id") ON TABLE "naijue_erp"."sample" TO "${role}" WITH GRANT OPTION;\nREVOKE GRANT OPTION FOR UPDATE("id") ON TABLE "naijue_erp"."sample" FROM PUBLIC;`);
 const schemaAcl=section('SCHEMA naijue_erp','ACL',`REVOKE ALL ON SCHEMA "naijue_erp" FROM PUBLIC;\nGRANT USAGE ON SCHEMA "naijue_erp" TO "fresh35_controller_20261104_r1";`,'-');
 const m=collectFresh35RetirementMetadata(dump([schema,table,acl,schemaAcl]));
 assert.equal(m.aclStatements.length,4);const a=m.aclStatements[0];assert.equal(a.objectType,'COLUMN');assert.equal(a.column,'id');assert.equal(a.owner,owner);assert.equal(a.grantor,owner);assert.deepEqual(a.grantees,[role]);assert.equal(a.grantOption,true);assert.deepEqual(a.privileges,[{privilege:'INSERT',columns:['id']},{privilege:'UPDATE',columns:['id']}]);assert.equal(m.aclStatements[1].grantOptionOnly,true);assert.equal(m.aclStatements[2].action,'REVOKE');
});

test('extracts row security and rejects conflicting duplicate metadata',()=>{
 const row=section('sample','ROW SECURITY','ALTER TABLE "naijue_erp"."sample" ENABLE ROW LEVEL SECURITY;');
 assert.equal(collectFresh35RetirementMetadata(dump([schema,table,row])).tables[0].rowSecurity,true);
 assert.throws(()=>collectFresh35RetirementMetadata(dump([schema,table,row,row])),/DUPLICATE/);
 assert.throws(()=>collectFresh35RetirementMetadata(dump([schema,table,table])),/DUPLICATE/);
});

for(const [name,mutate,error] of [
 ['incomplete dump',sql=>sql.replace('-- PostgreSQL database dump complete','-- incomplete'),/COMPLETE_DUMP/],
 ['unsupported column clause',sql=>sql.replace('"id" "uuid" NOT NULL','"id" "uuid" NOT NULL REFERENCES other(id)'),/COLUMN/],
 ['identity column',sql=>sql.replace('"id" "uuid" NOT NULL','"id" bigint GENERATED BY DEFAULT AS IDENTITY'),/COLUMN/],
 ['unsupported collation',sql=>sql.replace('COLLATE "pg_catalog"."C"','COLLATE "missing"'),/COLLATION/],
 ['unterminated literal',sql=>sql.replace("'a,b'::\"text\", 'c'", "'a,b::\"text\", 'c'"),/QUOTE|UNTERMINATED/],
 ['unknown sequence option',sql=>sql.replace('CACHE 1','CACHE 1\n    BOGUS'),/SEQUENCE/],
 ['policy extra statement',sql=>sql.replace(policySql,policySql+'\nDROP TABLE "naijue_erp"."sample";'),/POLICY/],
 ['policy numeric role OID',sql=>sql.replace(`TO "${role}", PUBLIC`, 'TO 16390'),/POLICY_ROLE/],
 ['mismatched section target',sql=>sql.replace('CREATE TABLE "naijue_erp"."sample"','CREATE TABLE "naijue_erp"."other"'),/TABLE_TARGET/],
 ['unsupported table suffix',sql=>sql.replace(');\nALTER TABLE',') WITH (fillfactor=70);\nALTER TABLE'),/TABLE/],
 ['unowned table',sql=>sql.replace(`ALTER TABLE "naijue_erp"."sample" OWNER TO "${owner}";`,''),/TABLE_OWNER/],
]) test(`fails closed: ${name}`,()=>assert.throws(()=>collectFresh35RetirementMetadata(mutate(fixture())),error));

test('rejects ACL target, identity, and unsupported privilege layouts rather than guessing',()=>{
 for(const sql of [
  `GRANT UPDATE("tags") ON TABLE "naijue_erp"."sample" TO "${role}";`,
  'GRANT UPDATE("id") ON TABLE "naijue_erp"."other" TO PUBLIC;',
  'GRANT UPDATE("id") ON TABLE "naijue_erp"."sample" TO 16390;',
  'GRANT MADEUP("id") ON TABLE "naijue_erp"."sample" TO PUBLIC;',
  'GRANT UPDATE("id") ON TABLE "naijue_erp"."sample" TO PUBLIC; DROP SCHEMA "naijue_erp";',
 ]) assert.throws(()=>collectFresh35RetirementMetadata(dump([schema,table,section('COLUMN sample.id','ACL',sql)])),/ACL/);
});

const observed='/workspace/scratch/f6bee04e937b/fresh35-retirement-projection-20261104/direct35-schema-fresh-identities.sql';
test('observed projection rejects first-sequence int8 increment/cache overflow',{skip:!fs.existsSync(observed)},()=>{
 const sql=fs.readFileSync(observed,'utf8');
 for(const option of ['CACHE','INCREMENT BY']) assert.throws(()=>collectFresh35RetirementMetadata(sql.replace(`${option} 1`,`${option} 9223372036854775808`)),/SEQUENCE_PARAMETERS_OUT_OF_INT8_RANGE/);
});
test('observed generated projection: 35 tables, 351 columns, 4 sequences, 32 policies, 99 scoped ACL statements',{skip:!fs.existsSync(observed)},()=>{
 const sql=fs.readFileSync(observed,'utf8');const m=collectFresh35RetirementMetadata(sql);
 assert.equal(m.sourceSha256,'ee3ab325dd5b412d5d0efc0b47eecbf97d9c68eae30de8ba5c37c21d3af25d3a');
 assert.equal(m.tables.length,35);assert.equal(m.columns.length,351);assert.equal(m.sequences.length,4);assert.equal(m.policies.length,32);assert.equal(m.aclStatements.length,99);
 assert.equal(m.columns.filter(c=>c.generated==='s').length,33);assert.equal(m.tables.filter(t=>t.rowSecurity).length,32);
 assert.ok(m.tables.every(t=>t.owner===owner));assert.ok(m.policies.every(p=>p.roles.length===1&&p.roles[0]===role));
 assert.equal(m.aclStatements.filter(a=>a.objectType==='SCHEMA').length,4);assert.equal(m.aclStatements.filter(a=>a.objectType==='SEQUENCE').length,2);
});
