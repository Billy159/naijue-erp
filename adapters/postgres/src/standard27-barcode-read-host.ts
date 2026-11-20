import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {types as utilTypes} from 'node:util';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {REVIEWED_SUCCESSOR_CATALOG_SQL} from '../../../tools/unified-import/execution-client.ts';
import {SOURCE49_SUPPLEMENTAL_SQL} from '../../../tools/unified-import/execution-v2-admission.ts';
import type {PgSalesClient,PgSalesPool} from './sales-unit-of-work.ts';
import type {CurrentFormBarcode27Capability,CurrentFormBarcodeAggregate27Capability} from './current-form-reader.ts';

/** This configuration is a privileged deployment artifact, not request data or
 * an assertion of its own review. An independent installer must first review
 * the exact target catalog/policies/ACL/function/trigger closure, source files
 * and full row visibility and fix these pins for that target. A hash alone does
 * not prove any of those facts. No installer, account, credentials, grant, or
 * reviewed target is created here. Never expose this factory to an HTTP caller. */
export interface Barcode27ReviewedHostPins {
 readonly database:string;readonly databaseOid:string;readonly systemIdentifier:string;
 readonly host:string;readonly port:number;readonly serverVersion:string;readonly role:string;readonly sessionUser:string;
 readonly catalogSha256:string;readonly supplementalSha256:string;
 readonly sourceSha256:Readonly<Record<'reader'|'aggregate'|'model'|'decoder'|'catalogue',string>>;
}
const FILES=Object.freeze({reader:'current-form-reader.ts',aggregate:'standard27-created-barcode-proof.ts',model:'../../../packages/application/src/standard27-product-capacity-model.ts',decoder:'../../../packages/application/src/standard27-audit-exact-decoder.ts',catalogue:'standard-catalogue-completeness27.ts'});
// Closed until an independently reviewed, installed target and controlled-writer
// proof bind the whole dependency/RLS closure; caller-provided pins are not proof.
const BARCODE27_HOST_ADMITTED: boolean = false;
const SCOPES=Object.freeze(['product','product_category','sku','sku_barcode','product_image','color','fit','size','size_group_member','import_record','import_batch','operation_receipt','audit_change']);
const deny=():never=>{throw Error('BARCODE27_READ_HOST_NOT_READY');};
const sha=(x:Uint8Array|string)=>createHash('sha256').update(x).digest('hex');
const isHash=(x:unknown):x is string=>typeof x==='string'&&/^[0-9a-f]{64}$/.test(x);
const exactObject=(value:unknown,keys:readonly string[]):Record<string,unknown>=>{
 if(!value||typeof value!=='object'||utilTypes.isProxy(value)||Object.getPrototypeOf(value)!==Object.prototype||Reflect.ownKeys(value).length!==keys.length)deny();
 const out:Record<string,unknown>={};for(const k of keys){const d=Object.getOwnPropertyDescriptor(value,k);if(!d?.enumerable||!('value'in d))deny();out[k]=d!.value;}return out;
};
const KEYS=['database','databaseOid','systemIdentifier','host','port','serverVersion','role','sessionUser','catalogSha256','supplementalSha256','sourceSha256'] as const;
const ID_SQL=`/* barcode27-host:identity */ SELECT pg_catalog.current_database()::text database,(SELECT oid::text FROM pg_catalog.pg_database WHERE datname=pg_catalog.current_database()) database_oid,
 (SELECT system_identifier::text FROM pg_catalog.pg_control_system()) system_identifier,pg_catalog.host(pg_catalog.inet_server_addr()) host,pg_catalog.inet_server_port() port,pg_catalog.current_setting('server_version_num') server_version,
 current_user::text role,session_user::text session_user,pg_catalog.current_setting('transaction_isolation') isolation,pg_catalog.current_setting('transaction_read_only') read_only,
 pg_catalog.current_setting('row_security') row_security,pg_catalog.current_setting('session_replication_role') replication_role,pg_catalog.current_setting('search_path') search_path,
 pg_catalog.has_schema_privilege(current_user,'naijue_erp','CREATE') schema_create,pg_catalog.has_database_privilege(current_user,pg_catalog.current_database(),'CREATE') database_create,pg_catalog.pg_backend_pid()::text backend,pg_catalog.pg_current_xact_id_if_assigned()::text xid,
 (SELECT r.rolsuper OR r.rolcanlogin OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication OR r.rolinherit OR EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members m WHERE m.member=r.oid) FROM pg_catalog.pg_roles r WHERE r.rolname=current_user) unsafe`;
const VISIBILITY_SQL=`/* barcode27-host:visibility */ SELECT c.relname::text relation,c.relrowsecurity rls,c.relforcerowsecurity force_rls,
 c.relowner=(current_user::regrole)::oid owned,has_table_privilege(current_user,c.oid,'SELECT') can_select,
 (SELECT count(*)::integer FROM pg_policy p WHERE p.polrelid=c.oid) policy_count,
 (SELECT count(*)::integer FROM pg_policy p WHERE p.polrelid=c.oid AND p.polcmd IN ('*','r') AND p.polpermissive
   AND p.polroles=ARRAY[(current_user::regrole)::oid] AND pg_get_expr(p.polqual,p.polrelid) IN ('standard_business_ready()','naijue_erp.standard_business_ready()')) full_visible_policy_count
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='naijue_erp' AND c.relname=ANY($1::text[]) ORDER BY c.relname`;
/** Binds one pool lease to the exact two assertions required by the scanner.
 * Safe only when pool and pins are installed by the trusted server; still not a
 * live PG acceptance. The wrapper exposes SELECT and the reader's exact RR
 * transaction lifecycle only; all metadata checks run on the underlying client. */
export function createStandard27BarcodeReadHost(pool:PgSalesPool, originalPins:Barcode27ReviewedHostPins):{
 readonly pool:PgSalesPool;readonly barcode:CurrentFormBarcode27Capability;readonly aggregate:CurrentFormBarcodeAggregate27Capability } {
 if(!BARCODE27_HOST_ADMITTED)deny();
 if(!pool||typeof pool.connect!=='function')deny();const p=exactObject(originalPins,KEYS);
 for(const k of ['database','databaseOid','systemIdentifier','host','serverVersion','role','sessionUser'])if(typeof p[k]!=='string'||!(p[k] as string).length)deny();
 if(!Number.isInteger(p.port)||(p.port as number)<1||(p.port as number)>65535||!isHash(p.catalogSha256)||!isHash(p.supplementalSha256))deny();
 const files=exactObject(p.sourceSha256,Object.keys(FILES));for(const k of Object.keys(FILES))if(!isHash(files[k]))deny();
 const pins=Object.freeze({...p,sourceSha256:Object.freeze({...files})}) as unknown as Barcode27ReviewedHostPins;
 type NativeClient=PgSalesClient & {getTransactionStatus():string|null;_queryable:boolean;_ending:boolean;_activeQuery:unknown;_queryQueue:unknown[];_sentQueryQueue:unknown[];readyForQuery:boolean;pipeline:boolean};
 type Lease={raw:NativeClient;phase:'idle'|'open'|'closed';backend:string|null;checked:boolean;busy:boolean;tainted:boolean;released:boolean};
 const wireIdle=(raw:NativeClient,status:string)=>{if(raw._queryable!==true||raw._ending!==false||raw._activeQuery!=null||!Array.isArray(raw._queryQueue)||raw._queryQueue.length!==0||!Array.isArray(raw._sentQueryQueue)||raw._sentQueryQueue.length!==0||raw.readyForQuery!==true||raw.pipeline!==false||raw.getTransactionStatus()!==status)deny();};
 const leases=new WeakMap<object,Lease>();
 const verify=async(client:object,purpose:string)=>{
  if(purpose!=='BARCODE_READ'&&purpose!=='BARCODE_AGGREGATE_READ')deny();const found=leases.get(client);if(!found||found.released||found.phase==='closed'||found.busy||found.tainted)deny();const lease=found as Lease;lease.checked=false;lease.busy=true;try {
  const status=lease.phase==='idle'?'I':'T';wireIdle(lease.raw,status);
  const meta=async(sql:string,values?:unknown[])=>{wireIdle(lease.raw,status);const r=await lease.raw.query(sql,values);wireIdle(lease.raw,status);if((r as {command?:unknown}).command!=='SELECT')deny();return r;};
  for(const [k,path] of Object.entries(FILES)){const bytes=await readFile(fileURLToPath(new URL(path,import.meta.url)));if(sha(bytes)!==(pins.sourceSha256 as Record<string,string>)[k])deny();}
  const first=(await meta(ID_SQL)).rows;if(first.length!==1)deny();const x=first[0]!;
  if(x.database!==pins.database||x.database_oid!==pins.databaseOid||x.system_identifier!==pins.systemIdentifier||x.host!==pins.host||x.port!==pins.port||x.server_version!==pins.serverVersion||x.role!==pins.role||x.session_user!==pins.sessionUser||x.row_security!=='on'||x.replication_role!=='origin'||x.search_path!=='pg_catalog, naijue_erp'||x.schema_create!==false||x.database_create!==false||x.unsafe!==false||x.xid!==null||typeof x.backend!=='string'||!/^\d+$/.test(x.backend))deny();
  if(lease.backend!==null&&lease.backend!==x.backend)deny();lease.backend=x.backend as string;
  if(lease.phase==='open'&&(x.isolation!=='repeatable read'||x.read_only!=='on'))deny();
  const observed=(await meta(REVIEWED_SUCCESSOR_CATALOG_SQL,['[]',null])).rows;if(observed.length!==1||typeof observed[0]!.result_json!=='string')deny();let catalog:unknown;try{catalog=JSON.parse(observed[0]!.result_json as string);}catch{deny();}
  if(!catalog||typeof catalog!=='object'||(catalog as Record<string,unknown>).current_catalog_sha256!==pins.catalogSha256)deny();
  const extra=(await meta(SOURCE49_SUPPLEMENTAL_SQL)).rows;if(extra.length!==1||typeof extra[0]!.extra!=='string'||sha(extra[0]!.extra as string)!==pins.supplementalSha256)deny();
  const policies=(await meta(VISIBILITY_SQL,[[...SCOPES]])).rows;if(policies.length!==SCOPES.length)deny();const seen=new Set<string>();
  for(const row of policies){if(typeof row.relation!=='string'||!SCOPES.includes(row.relation)||seen.has(row.relation)||row.rls!==true||row.owned!==false||row.can_select!==true||row.policy_count!==1||row.full_visible_policy_count!==1)deny();seen.add(row.relation as string);}
  const ready=(await meta('/* barcode27-host:published */ SELECT naijue_erp.standard_business_ready() AS ready')).rows;if(ready.length!==1||ready[0]!.ready!==true)deny();
  const end=(await meta(ID_SQL)).rows;if(end.length!==1||JSON.stringify(end[0])!==JSON.stringify(x))deny();wireIdle(lease.raw,status);if(lease.phase==='open')lease.checked=true;
  } catch(error){lease.tainted=true;throw error;} finally {lease.busy=false;}
 };
 const wrapped:PgSalesPool=Object.freeze({async connect(){const raw=await pool.connect() as NativeClient;try{const require=createRequire(import.meta.url),pg=require('pg') as {Client:new (...args:never[])=>NativeClient};const version=JSON.parse(await readFile(require.resolve('pg/package.json'),'utf8')) as {version?:unknown};if(version.version!=='8.23.1'||sha(await readFile(require.resolve('pg/lib/client.js')))!=='ad6aa93c26b0bf26db1f2ebe74216212790a04c41af5585c63760f9fa8322a32'||!(raw instanceof pg.Client)||raw.getTransactionStatus!==pg.Client.prototype.getTransactionStatus||raw.query!==pg.Client.prototype.query)deny();wireIdle(raw,'I');}catch(error){raw.release(true);throw error;}const l:Lease={raw,phase:'idle',backend:null,checked:false,busy:false,tainted:false,released:false};
  const c:PgSalesClient={async query(sql:string,values?:unknown[]){if(l.released||l.phase==='closed'||l.busy||typeof sql!=='string')deny();l.busy=true;try {
   if(sql==='BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'){if(l.phase!=='idle'||l.tainted||raw.getTransactionStatus()!=='I')deny();wireIdle(raw,'I');l.tainted=true;const result=await raw.query(sql,values);wireIdle(raw,'T');if((result as {command?:unknown}).command!=='BEGIN')deny();l.phase='open';l.checked=false;l.tainted=false;return result;}
   if(sql==='COMMIT'||sql==='ROLLBACK'){if(l.phase!=='open'||(sql==='COMMIT'&&(l.tainted||!l.checked||raw.getTransactionStatus()!=='T')))deny();const priorTaint=l.tainted;const status=raw.getTransactionStatus();if(status!=='T'&&status!=='E')deny();wireIdle(raw,status as string);l.tainted=true;const result=await raw.query(sql,values);wireIdle(raw,'I');if((result as {command?:unknown}).command!==sql)deny();l.phase='closed';l.tainted=priorTaint;return result;}
   if(l.phase!=='open'||l.tainted||!l.checked||raw.getTransactionStatus()!=='T'||sql.includes(';')||!/^\s*(?:\/\*[^*]*\*\/\s*)?(?:SELECT|WITH)\b/i.test(sql))deny();wireIdle(raw,'T');const result=await raw.query(sql,values);wireIdle(raw,'T');if((result as {command?:unknown}).command!=='SELECT')deny();return result;
   } catch(error){l.tainted=true;throw error;} finally {l.busy=false;}
  },release(error?:Error|boolean){if(l.released)return;l.released=true;raw.release(l.phase==='closed'&&!l.tainted&&!l.busy?error:true);}};
  leases.set(c,l);return Object.freeze(c);
 }});
 const barcode=Object.freeze({profile:'EXACT27' as const,contract:'STANDARD_BARCODE_READ27_V1' as const,async assertReady(c:object,purpose:'BARCODE_READ'){await verify(c,purpose);}});
 const aggregate=Object.freeze({profile:'EXACT27' as const,contract:'STANDARD_BARCODE_AGGREGATE_READ27_V1' as const,async assertReady(c:object,purpose:'BARCODE_AGGREGATE_READ'){await verify(c,purpose);}});
 return Object.freeze({pool:wrapped,barcode,aggregate});
}
