import {types} from 'node:util';
import {requireDomain} from '../../../packages/domain/src/errors.ts';
import type {Runtime27CommandCapability} from '../../../packages/application/src/runtime27-command-capability.ts';
import type {PgSalesPool} from './sales-unit-of-work.ts';
import {assertIssuedRuntime27Pool} from './runtime27-command-issuer.ts';
import {maintenanceContextClient,assertMaintenanceManagedProductContext} from './maintenance-command-unit-of-work.ts';

// Necessary own-lock witness only. These catalog names cover the currently
// inspected metadata classes, not every native/dynamic dependency or mechanism
// capable of changing server behavior. No lock or permission is acquired here.
const SQL=`/* standard27-product:catalog-stability */ WITH
 wanted(name) AS (VALUES ('pg_class'),('pg_attribute'),('pg_attrdef'),('pg_proc'),('pg_namespace'),('pg_type'),('pg_collation'),
 ('pg_constraint'),('pg_depend'),('pg_policy'),('pg_trigger'),('pg_rewrite'),('pg_inherits'),('pg_index'),('pg_am'),('pg_amop'),('pg_amproc'),
 ('pg_opclass'),('pg_opfamily'),('pg_language'),('pg_authid'),('pg_auth_members'),('pg_database'),('pg_db_role_setting'),('pg_parameter_acl'),
 ('pg_default_acl'),('pg_shdepend'),('pg_extension'),('pg_init_privs')),
 catalogs AS MATERIALIZED (SELECT w.name,c.oid,c.relisshared FROM wanted w LEFT JOIN pg_catalog.pg_class c ON c.oid=pg_catalog.to_regclass('pg_catalog.'||w.name)),
 reachable AS MATERIALIZED (SELECT r.oid FROM pg_catalog.pg_roles r WHERE r.rolname IN (current_user,session_user)
  OR pg_catalog.pg_has_role(session_user,r.oid,'SET') OR pg_catalog.pg_has_role(session_user,r.oid,'USAGE')
  OR pg_catalog.pg_has_role(current_user,r.oid,'USAGE') ORDER BY r.oid LIMIT 257),
 own_vx AS MATERIALIZED (SELECT virtualtransaction FROM pg_catalog.pg_locks
  WHERE locktype='virtualxid' AND pid=pg_backend_pid() AND granted AND mode='ExclusiveLock')
 SELECT pg_catalog.pg_backend_pid()::text AS backend_pid,pg_catalog.pg_current_xact_id_if_assigned()::text AS transaction_id,
  (SELECT min(virtualtransaction) FROM own_vx) AS virtual_transaction,
  (SELECT count(*)=1 FROM own_vx) AND NOT EXISTS(SELECT 1 FROM catalogs c WHERE c.oid IS NULL OR NOT EXISTS(
   SELECT 1 FROM pg_catalog.pg_locks l WHERE l.locktype='relation' AND l.pid=pg_backend_pid() AND l.granted
    AND l.relation=c.oid AND l.database=CASE WHEN c.relisshared THEN 0 ELSE (SELECT oid FROM pg_catalog.pg_database WHERE datname=current_database()) END
    AND l.virtualtransaction=(SELECT min(virtualtransaction) FROM own_vx)
    AND l.mode IN ('ShareLock','ShareRowExclusiveLock','ExclusiveLock','AccessExclusiveLock'))) AS catalog_locks_held,
  (SELECT count(*) BETWEEN 1 AND 256 FROM reachable)
   AND NOT EXISTS(SELECT 1 FROM reachable r CROSS JOIN catalogs c CROSS JOIN (VALUES ('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('TRIGGER')) p(privilege)
    WHERE pg_catalog.has_table_privilege(r.oid,c.oid,p.privilege))
   AND NOT EXISTS(SELECT 1 FROM reachable r CROSS JOIN catalogs c JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    CROSS JOIN (VALUES ('INSERT'),('UPDATE')) p(privilege) WHERE pg_catalog.has_column_privilege(r.oid,c.oid,a.attnum,p.privilege))
  AS catalog_writes_denied`;
type Witness={backend_pid:string;transaction_id:string;virtual_transaction:string;catalog_locks_held:true;catalog_writes_denied:true};
const scopes=new WeakMap<object,{client:object;busy:boolean;failed:boolean;witness?:Witness}>();
const fail=(ok:unknown)=>requireDomain(ok,'PRODUCT_EVIDENCE_CAPACITY_NOT_READY','Original catalog lock witness unavailable');
function snapshot(result:unknown):Witness {
 fail(result&&typeof result==='object'&&!types.isProxy(result));
 const d=Object.getOwnPropertyDescriptor(result,'rows');fail(d&&'value'in d&&Array.isArray(d.value)&&!types.isProxy(d.value));
 const rows=d!.value as unknown[];fail(rows.length===1);const entry=Object.getOwnPropertyDescriptor(rows,'0');fail(entry&&'value'in entry);
 const row:unknown=entry!.value;fail(row&&typeof row==='object'&&!types.isProxy(row)&&Object.getPrototypeOf(row)===Object.prototype);
 const keys=['backend_pid','transaction_id','virtual_transaction','catalog_locks_held','catalog_writes_denied'];fail(Reflect.ownKeys(row as object).length===keys.length);
 const copy:Record<string,unknown>={};for(const key of keys){const field=Object.getOwnPropertyDescriptor(row,key);fail(field?.enumerable&&'value'in field);copy[key]=field!.value;}
 fail(copy.catalog_locks_held===true&&copy.catalog_writes_denied===true);
 fail(['backend_pid','transaction_id'].every(k=>typeof copy[k]==='string'&&(copy[k] as string).length<=32&&/^[1-9][0-9]*$/.test(copy[k] as string)));
 fail(typeof copy.virtual_transaction==='string'&&copy.virtual_transaction.length<=64&&/^[1-9][0-9]*\/[1-9][0-9]*$/.test(copy.virtual_transaction));
 return Object.freeze(copy) as Witness;
}
/** Check actual native same-backend transaction lock observations, not caller
 * claims. This is NOT complete catalog stability proof or permission to acquire
 * system locks. The current ordinary role has no established authorized route
 * to these locks; missing evidence refuses. The disabled issuer stays disabled.
 * A future host must independently justify lock acquisition, all metadata and
 * native dependencies, privileged-actor control, and the full transaction path. */
export async function assertStandard27ProductCatalogLockWitness(pool:PgSalesPool,runtime:Runtime27CommandCapability,context:object):Promise<void> {
 assertIssuedRuntime27Pool(runtime,pool);assertMaintenanceManagedProductContext(context,pool);
 const client=maintenanceContextClient(context,pool);
 let state=scopes.get(context);if(!state){state={client,busy:false,failed:false};scopes.set(context,state);}
 if(state.busy)state.failed=true;fail(state.client===client&&!state.busy&&!state.failed);state.busy=true;
 const active=()=>fail(maintenanceContextClient(context,pool)===client&&!state!.failed);
 const observe=async()=>{active();const result=await client.query(SQL);active();const witness=snapshot(result);
  const prior=state!.witness;if(prior)fail(prior.backend_pid===witness.backend_pid&&prior.transaction_id===witness.transaction_id&&prior.virtual_transaction===witness.virtual_transaction);
  state!.witness=witness;};
 try {await observe();await runtime.assertReady(client,'DOCUMENT_COMMAND');active();await runtime.assertReady(client,'CATALOGUE_READ');active();await observe();}
 catch(error){state.failed=true;throw error;}finally{state.busy=false;}
}
