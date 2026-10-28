/** T45 runs only against a separately authorized disposable synthetic database.
 * No fallback URL, automatic migration, teardown, or original ERP target. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
const database=process.env.NAIJUE_HV2_B14_DATABASE;
const connectionString=process.env.NAIJUE_HV2_B14_URL;
const enabled=process.env.NAIJUE_HV2_B14_SYNTHETIC_AUTHORIZATION==='CONFIRMED_NEW_ISOLATED';

test('B14 real nonowner final-state and two-connection serialization', {timeout:30000},async()=>{
 assert.ok(enabled&&database&&/^erp_hv2_b14_[a-z0-9_]+$/.test(database)&&connectionString,'Explicit new synthetic target and authorization required');
 const pool=new Pool({connectionString,max:3,connectionTimeoutMillis:3000,statement_timeout:10000,lock_timeout:6000});
 const a=await pool.connect(),b=await pool.connect(),observer=await pool.connect();
 try{
  const i=(await a.query(`SELECT current_database() db,current_user role,session_user,
   (SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname=current_user) elevated,
   (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='naijue_erp.product_category'::regclass) owner`)).rows[0];
  assert.equal(i.db,database);assert.equal(i.role,i.session_user);assert.equal(i.elevated,false);assert.notEqual(i.role,i.owner);
  const count=(await a.query(`SELECT count(*)::integer n FROM pg_trigger WHERE tgrelid='naijue_erp.product_category'::regclass
   AND tgname IN ('category_tree_statement_lock','category_final_component_depth') AND tgenabled='O'`)).rows[0];assert.equal(count.n,2);
  const root=randomUUID(),other=randomUUID(),child=randomUUID();
  await a.query('BEGIN ISOLATION LEVEL READ COMMITTED');
  await a.query(`INSERT INTO naijue_erp.product_category(id,parent_id,name,display_order,version) VALUES($1,NULL,'SYNTHETIC_B14_ROOT',0,1),($2,NULL,'SYNTHETIC_B14_OTHER',1,1)`,[root,other]);
  await a.query('COMMIT');
  // Strong snapshots cannot validate a stale component after the directory wait.
  await a.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
  await assert.rejects(a.query('UPDATE naijue_erp.product_category SET parent_id=$2 WHERE id=$1',[root,other]),{code:'40001'});await a.query('ROLLBACK');
  await a.query('BEGIN ISOLATION LEVEL READ COMMITTED');
  await a.query(`INSERT INTO naijue_erp.product_category(id,parent_id,name,display_order,version) VALUES($1,$2,'SYNTHETIC_B14_CHILD',0,1)`,[child,root]);
  await b.query('BEGIN ISOLATION LEVEL READ COMMITTED');
  const pid=(await b.query('SELECT pg_backend_pid() pid')).rows[0].pid;
  const pending=b.query('UPDATE naijue_erp.product_category SET parent_id=$2 WHERE id=$1',[root,other]);
  // Attach rejection handler immediately; COMMIT validates after this wait.
  const outcome=pending.then(()=>null,(error:unknown)=>error);
  let blocked=false;
  for(let n=0;n<100;n++){
   blocked=(await observer.query('SELECT cardinality(pg_blocking_pids($1))>0 blocked',[pid])).rows[0].blocked;
   if(blocked)break;await new Promise(resolve=>setTimeout(resolve,10));
  }
  assert.equal(blocked,true,'Second connection must actually wait on the directory lock');
  await a.query('COMMIT');assert.equal(await outcome,null);
  await assert.rejects(b.query('COMMIT'),{code:'23514'});await b.query('ROLLBACK');
  const final=(await a.query('SELECT parent_id FROM naijue_erp.product_category WHERE id=$1',[root])).rows[0];assert.equal(final.parent_id,null);
  // Legal leaf move remains possible, with original maintenance guards enabled.
  await a.query('BEGIN ISOLATION LEVEL READ COMMITTED');await a.query('UPDATE naijue_erp.product_category SET parent_id=$2 WHERE id=$1',[child,other]);await a.query('COMMIT');
  assert.equal((await a.query('SELECT parent_id FROM naijue_erp.product_category WHERE id=$1',[child])).rows[0].parent_id,other);
 }finally{
  await Promise.allSettled([a.query('ROLLBACK'),b.query('ROLLBACK')]);a.release();b.release();observer.release();await pool.end();
 }
});
