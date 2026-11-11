/** Original opt-in synthetic PG harness style, one existing empty target only.
 * Does not create/drop/start/stop/install/grant or construct host authority. */
import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {NODE_SCRYPT_DUMMY_HASH} from '../../packages/authentication/src/passwords.ts';
import {buildSyntheticBaselineScopeSqlProgram} from '../fixtures/unified-import/baseline-scope-synthetic.ts';
import {registerBaselineScopeSqlAtomicity} from './baseline-scope-sql-atomicity.mjs';
if(process.argv.length!==4||process.argv[2]!=='--confirmed-synthetic-config'||!process.argv[3].startsWith('/'))throw Error('Usage: node tests/integration/run-baseline-scope-pg.mjs --confirmed-synthetic-config /absolute/private-config.json');
const bytes=await readFile(process.argv[3]);if(bytes.length>65536)throw Error('Synthetic config too large');let config;
try{config=JSON.parse(bytes.toString('utf8'));}finally{bytes.fill(0);}
const keys=(v,names)=>v&&Object.keys(v).sort().join(',')===names.sort().join(',');
if(!keys(config,['confirmedSynthetic','confirmedDisposable','host','port','database','writer','observer','runtime'])||config.confirmedSynthetic!==true||config.confirmedDisposable!==true
 ||!['127.0.0.1','::1'].includes(config.host)||!Number.isSafeInteger(config.port)||config.port<1024||config.port>65535||!/^synthetic_[a-z0-9_]+$/.test(config.database)
 ||[config.writer,config.observer,config.runtime].some(c=>!keys(c,['user','password'])||typeof c.user!=='string'||!/^[a-z_][a-z0-9_]{0,62}$/.test(c.user)||typeof c.password!=='string')
 ||new Set([config.writer.user,config.observer.user,config.runtime.user]).size!==3)throw Error('EXPLICIT_SINGLE_DISPOSABLE_SYNTHETIC_TARGET_REQUIRED');
const patch=await readFile(new URL('../../adapters/postgres/patches/0038_inventory_baseline_scope_successor.sql',import.meta.url),'utf8'),pins=JSON.parse(patch.split('$baseline_scope_changes$')[1]);assert.equal(pins.length,9);
let consumed=false;
registerBaselineScopeSqlAtomicity(test,async()=>{
 assert.equal(consumed,false);consumed=true;
 const c=config,connection=who=>({host:c.host,port:c.port,database:c.database,user:c[who].user,password:c[who].password,ssl:false,connectionTimeoutMillis:5000,statement_timeout:120000,query_timeout:125000,lock_timeout:10000,options:'-c search_path=pg_catalog -c TimeZone=UTC'});
 const writer=new pg.Client(connection('writer')),observer=new pg.Client(connection('observer')),runtimePool=new pg.Pool({...connection('runtime'),max:4});let fixture;
 const close=async()=>{try{await fixture?.dispose();}finally{const results=await Promise.allSettled([runtimePool.end(),writer.end(),observer.end()]);assert.ok(results.every(r=>r.status==='fulfilled'),'all synthetic connections must close');}};
 try{await writer.connect();await observer.connect();
  const actual=(await observer.query(`SELECT current_database() db,d.oid::text oid,pg_control_system.system_identifier::text system_identifier,
   (SELECT count(*)::integer FROM pg_class c WHERE c.relnamespace='naijue_erp'::regnamespace AND c.relkind IN ('r','p')) tables,
   (SELECT count(*)::integer FROM pg_proc p WHERE p.pronamespace='naijue_erp'::regnamespace AND p.prokind='f') routines,
   encode(sha256(convert_to((SELECT string_agg(pg_get_functiondef(p.oid),E'\n' ORDER BY p.oid) FROM pg_proc p WHERE p.pronamespace='naijue_erp'::regnamespace AND p.prokind='f'),'UTF8')),'hex') source_binding
   FROM pg_database d CROSS JOIN pg_control_system() pg_control_system WHERE d.datname=current_database()`)).rows[0];
  assert.equal(actual.db,c.database);assert.equal(actual.tables,35);assert.equal(actual.routines,154);
  const matched=await observer.query(`SELECT count(*)::integer n FROM jsonb_array_elements($1::jsonb) pin JOIN pg_proc p ON p.oid=to_regprocedure(pin->>'signature') WHERE encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')=pin->>'successor_sha256'`,[JSON.stringify(pins)]);assert.equal(matched.rows[0].n,9,'actual installed SQL38 bodies required');
  fixture=await buildSyntheticBaselineScopeSqlProgram({protocol:'STANDARD_IMPORT_SQL_V1',system_identifier:actual.system_identifier,database_oid:actual.oid,database_name:actual.db,catalog_sha256:actual.source_binding},tmpdir());
  return {writer,observer,runtimePool,fixture,encodedScrypt:NODE_SCRYPT_DUMMY_HASH,database:c.database,runtimeUser:c.runtime.user,port:c.port,close};
 }catch(error){await close();throw error;}
});
