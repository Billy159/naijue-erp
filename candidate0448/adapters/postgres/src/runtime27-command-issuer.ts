import { requireDomain } from '../../../packages/domain/src/errors.ts';
import type { PgSalesClient, PgSalesPool } from './sales-unit-of-work.ts';
import type { Runtime27CommandCapability } from '../../../packages/application/src/runtime27-command-capability.ts';
import type { OrdinaryDocumentRuntime27Capability } from './ordinary-document-list-reader.ts';
import type { ProductMediaWriteCapability, ProductImageColorSwapCapability } from './product-maintenance-store.ts';
import type { CategoryOrderWriteCapability } from './catalogue-maintenance-store.ts';
import { assertMaintenanceDriverPool, maintenanceContextClient, assertMaintenanceProductImagesPrepared, bindMaintenanceCategoryOrderGuard } from './maintenance-command-unit-of-work.ts';

/** Bind ordinary 27 command checks to a live pool lease, not to request data.
 * Database RLS, ordinary role grants and actual triggers remain authoritative. */
const issued = new WeakMap<object, PgSalesPool>();
export function assertIssuedRuntime27Pool(runtime: object, pool: PgSalesPool): void {
 requireDomain(issued.get(runtime) === pool, 'NATIVE_RUNTIME27_NOT_READY', 'Actual runtime27 issuer and its original pool required');
}
const RUNTIME_ROLE = 'erp_unified27_runtime_2393dbc6db9581c2';
/** Existing native maintenance protocols on the same ordinary-role lease.
 * These checks consume the retained native guards, not retired import tables. */
export function createRuntime27MaintenanceCapabilities(pool: PgSalesPool, runtime: Runtime27CommandCapability): {
 readonly productMediaWrite: ProductMediaWriteCapability;
 readonly imageColorSwap: ProductImageColorSwapCapability;
 readonly categoryOrderWrite: CategoryOrderWriteCapability;
} {
 assertIssuedRuntime27Pool(runtime, pool);
 const verify = async (context: Parameters<ProductMediaWriteCapability['assertReady']>[0], images: boolean): Promise<void> => {
  const client = maintenanceContextClient(context, pool);
  await runtime.assertReady(client, 'DOCUMENT_COMMAND');
  const result = await client.query(`/* ordinary27-maintenance:retained-guards */ SELECT
   NOT EXISTS(SELECT 1 FROM (VALUES
    ('guard_maintenance_before_root()','76d30c01785877cfab4bb2bf167e1cdcd583677d204b7d7efa0c2cc2c79fa05c'),
    ('guard_maintenance_child_write()','ceef464210d22280de7bc92ed900eebd3156ec65089ecdd8c55bbaca9c975d95'),
    ('guard_product_image_color()','a49cc6bc4c49931eb50c81dd95e08a760b2ea6de73e19a0496611fe63fe22b18'),
    ('maintenance_check_category_order(naijue_erp.audit_change)','77c86d2788e88f2922a66c662a91b95c0f76d6ea00587148c36421feabde281e'),
    ('validate_maintenance_root_commit()','bf853800c33c492dd0b8224e489c42dfb1c9a046231001a3d42be830a257f479'),
    ('lock_category_tree_statement()','fe2f9bd7ed49d52697cb8a5aab6100bc61f2246c0f8ad02f945a7dbbd4a54834')) needed(signature,hash)
    WHERE NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc f JOIN pg_catalog.pg_namespace n ON n.oid=f.pronamespace
     WHERE f.oid=pg_catalog.to_regprocedure('naijue_erp.'||needed.signature) AND f.proowner=n.nspowner AND NOT f.prosecdef
      AND f.prokind='f' AND f.provolatile='v' AND NOT f.proretset AND NOT f.proleakproof
      AND f.prolang=(SELECT oid FROM pg_catalog.pg_language WHERE lanname='plpgsql')
      AND f.prorettype=CASE WHEN needed.signature LIKE 'maintenance_check_category_order(%' THEN 'void'::regtype ELSE 'trigger'::regtype END
      AND f.proconfig=ARRAY['search_path=pg_catalog, naijue_erp, pg_temp']
      AND pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(f.prosrc,'UTF8')),'hex')=needed.hash)) AS guards,
   NOT EXISTS(SELECT 1 FROM (VALUES
    ('product_image','image_maintenance_write','guard_maintenance_child_write()',31,false),
    ('product_image','product_image_color_membership','guard_product_image_color()',23,false),
    ('product','product_maintenance_before_root','guard_maintenance_before_root()',23,false),
    ('product','product_maintenance_final_consistency','validate_maintenance_root_commit()',21,true),
    ('product_category','product_category_maintenance_final_consistency','validate_maintenance_root_commit()',21,true),
    ('product_category','category_tree_statement_lock','lock_category_tree_statement()',30,false)) needed(tbl,trg,fn,typ,deferred)
    WHERE NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger t WHERE t.tgrelid=pg_catalog.to_regclass('naijue_erp.'||needed.tbl)
     AND t.tgname=needed.trg AND t.tgfoid=pg_catalog.to_regprocedure('naijue_erp.'||needed.fn)
     AND t.tgenabled='O' AND NOT t.tgisinternal AND t.tgtype=needed.typ AND t.tgnargs=0 AND t.tgqual IS NULL
     AND t.tgdeferrable=needed.deferred AND t.tginitdeferred=needed.deferred)) AS triggers,
   CASE WHEN $1::boolean THEN
    pg_catalog.has_table_privilege(current_user,'naijue_erp.product_image','SELECT') AND
    (SELECT bool_and(pg_catalog.has_column_privilege(current_user,'naijue_erp.product_image',name,'INSERT')) FROM unnest(ARRAY['id','product_id','file_ref','mime','byte_size','display_order','created_at','created_by_account_id','image_role','color_id','version']) name) AND
    (SELECT bool_and(pg_catalog.has_column_privilege(current_user,'naijue_erp.product_image',name,'UPDATE')) FROM unnest(ARRAY['file_ref','mime','byte_size','display_order','image_role','color_id','version']) name) AND
    pg_catalog.has_table_privilege(current_user,'naijue_erp.product_image','DELETE')
   ELSE pg_catalog.has_column_privilege(current_user,'naijue_erp.product_category','display_order','UPDATE') AND
    pg_catalog.has_column_privilege(current_user,'naijue_erp.product_category','version','UPDATE') END AS columns`, [images]);
  const row = result.rows[0];
  requireDomain(result.rows.length === 1 && row?.guards === true && row.triggers === true && row.columns === true,
   'NATIVE_RUNTIME27_NOT_READY', 'Retained maintenance guards and native column permissions required');
  maintenanceContextClient(context, pool);
 };
 const productMediaWrite: ProductMediaWriteCapability = Object.freeze({ profile: 'product-media-write-v22',
  assertVerified(driver: object) { assertIssuedRuntime27Pool(runtime, pool); assertMaintenanceDriverPool(driver, pool); },
  async assertReady(context: Parameters<ProductMediaWriteCapability['assertReady']>[0]) { await verify(context, true); },
  async assertPrepared(context: Parameters<ProductMediaWriteCapability['assertPrepared']>[0], completion: Parameters<ProductMediaWriteCapability['assertPrepared']>[1]) {
   assertMaintenanceProductImagesPrepared(context, pool, completion);
   await verify(context, true);
   assertMaintenanceProductImagesPrepared(context, pool, completion);
  } });
 return Object.freeze({ productMediaWrite,
  imageColorSwap: Object.freeze({ profile: 'product-image-color-swap-v4', assertVerified: productMediaWrite.assertVerified, assertReady: productMediaWrite.assertPrepared }),
  categoryOrderWrite: Object.freeze({ profile: 'CATEGORY_ORDER_UNDO_V15', async assertReady(context: Parameters<CategoryOrderWriteCapability['assertReady']>[0]) {
   await verify(context, false);
   bindMaintenanceCategoryOrderGuard(context, pool, () => verify(context, false));
  } }) });
}
const IDENTITY = `/* runtime27-command:identity */ SELECT current_database()::text AS database,current_user::text AS role,
 session_user::text AS session_user,inet_server_port() AS server_port,current_setting('row_security') AS row_security,current_setting('search_path') AS search_path,
 current_setting('session_replication_role') AS replication_role,r.rolsuper AS superuser,r.rolbypassrls AS bypass, sr.rolsuper AS session_superuser,sr.rolbypassrls AS session_bypass,r.rolinherit AS runtime_inherit,EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members m WHERE m.member=r.oid) AS runtime_membership,
 (has_database_privilege(current_user,current_database(),'CREATE') OR has_schema_privilege(current_user,'naijue_erp','CREATE')) AS can_create,
 (SELECT array_agg(version ORDER BY version)=ARRAY[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27] FROM naijue_erp.schema_migration) AS version_ok,
 EXISTS(SELECT 1 FROM pg_catalog.pg_proc f JOIN pg_catalog.pg_namespace n ON n.oid=f.pronamespace JOIN pg_catalog.pg_language l ON l.oid=f.prolang WHERE n.nspname='naijue_erp' AND f.proname='standard_business_ready' AND f.prokind='f' AND NOT f.proretset AND f.prosqlbody IS NULL AND f.pronargs=0 AND f.prorettype='boolean'::regtype AND f.proowner=n.nspowner AND f.prosecdef AND f.provolatile='s' AND l.lanname='sql' AND f.proconfig=ARRAY['search_path=pg_catalog, naijue_erp'] AND pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(f.prosrc,'UTF8')),'hex')='4f6893cc5ef4bbee1bd74d08435763fb3bfabf7dc5888ee72f03cf3387e412db') AS gate_ok, current_setting('transaction_read_only') AS read_only,current_setting('transaction_isolation') AS isolation,
 NOT EXISTS(SELECT 1 FROM unnest(ARRAY['product','sku','sku_barcode','sales_header','sales_line','sales_settlement','transfer_header','transfer_line','inventory_balance','inventory_ledger','hall','warehouse','customer','supplier','staff','product_category','color','fit','size','size_group','size_group_member','season','barcode_scheme','product_image','payment_method','payment_account','payment_account_hall','import_batch','import_record','operation_receipt','audit_change','runtime_document_number_allocation']) AS needed(name)
 LEFT JOIN pg_catalog.pg_class c ON c.relname=needed.name AND c.relnamespace='naijue_erp'::regnamespace
 WHERE c.oid IS NULL OR NOT c.relrowsecurity OR pg_catalog.row_security_active(c.oid) IS NOT TRUE OR c.relowner=r.oid OR
   (SELECT count(*) FROM pg_catalog.pg_policy p WHERE p.polrelid=c.oid)<>1 OR NOT EXISTS(
     SELECT 1 FROM pg_catalog.pg_policy p WHERE p.polrelid=c.oid AND p.polpermissive AND p.polcmd='*'
       AND p.polroles=ARRAY[r.oid] AND p.polqual IS NOT NULL AND p.polwithcheck IS NOT NULL
       AND NOT EXISTS(SELECT 1 FROM pg_catalog.regexp_matches(pg_catalog.pg_get_expr(p.polqual,p.polrelid),$literal$'(?:[^']|'')*'$literal$,'g') AS sql_literal(parts) WHERE sql_literal.parts[1] ~ '[[:space:]]')
       AND pg_catalog.regexp_replace(pg_catalog.pg_get_expr(p.polqual,p.polrelid),'[[:space:]]','','g')=pg_catalog.regexp_replace(CASE
        WHEN needed.name IN ('product','sku','sku_barcode','hall','warehouse','customer','supplier','product_category','color','fit','size','size_group','size_group_member','season','barcode_scheme','product_image','payment_method','payment_account','payment_account_hall','inventory_balance','inventory_ledger','import_batch','import_record','operation_receipt','audit_change','runtime_document_number_allocation') THEN 'naijue_erp.standard_business_ready()'
        WHEN needed.name='staff' THEN '(naijue_erp.standard_business_ready() OR ((role = ''ADMIN''::text) AND (hall_id IS NULL) AND (employment_status = ''在职''::text) AND (EXISTS ( SELECT 1 FROM naijue_erp.user_account a WHERE ((a.staff_id = staff.id) AND a.login_enabled AND (a.version = 1) AND (a.auth_version = 1) AND (a.created_at = a.updated_at))))))'
        WHEN needed.name='sales_header' THEN '(naijue_erp.standard_business_ready() AND ((import_batch_id IS NULL) OR (EXISTS ( SELECT 1 FROM naijue_erp.import_batch b WHERE ((b.id = sales_header.import_batch_id) AND (b.status = ''IMPORTED''::text))))))'
        WHEN needed.name='transfer_header' THEN '(naijue_erp.standard_business_ready() AND ((import_batch_id IS NULL) OR (EXISTS ( SELECT 1 FROM naijue_erp.import_batch b WHERE ((b.id = transfer_header.import_batch_id) AND (b.status = ''IMPORTED''::text))))))'
        WHEN needed.name IN ('sales_line','sales_settlement') THEN '(naijue_erp.standard_business_ready() AND (EXISTS ( SELECT 1 FROM naijue_erp.sales_header h WHERE (h.id = '||needed.name||'.sales_id))))'
        WHEN needed.name='transfer_line' THEN '(naijue_erp.standard_business_ready() AND (EXISTS ( SELECT 1 FROM naijue_erp.transfer_header h WHERE (h.id = transfer_line.transfer_id))))' END,'[[:space:]]','','g')
       AND CASE WHEN needed.name='staff' THEN pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid)='naijue_erp.standard_business_ready()' ELSE pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid)=pg_catalog.pg_get_expr(p.polqual,p.polrelid) END
       AND p.polname=CASE WHEN needed.name IN ('product','sku','sku_barcode','hall','warehouse','customer','supplier','staff','product_category','color','fit','size','size_group','size_group_member','season','barcode_scheme','product_image','payment_method','payment_account','payment_account_hall') THEN 'standard_published_master_runtime' ELSE 'standard_published_runtime' END)) AS policies_ok
 FROM pg_catalog.pg_roles r JOIN pg_catalog.pg_roles sr ON sr.rolname=session_user WHERE r.rolname=current_user`;
export function createRuntime27CommandIssuer(pool:PgSalesPool,target:{readonly database:string;readonly user:string;readonly port:number},policyProfile:'STANDARD_V1'|'WHOLE_V2'='STANDARD_V1'):Readonly<{pool:PgSalesPool;runtime27:Runtime27CommandCapability;ordinaryRead:OrdinaryDocumentRuntime27Capability}>{
 if(!pool||typeof pool.connect!=='function'||!target||typeof target.database!=='string'||!target.database||typeof target.user!=='string'||!target.user||!Number.isInteger(target.port)||target.port<1||target.port>65535)throw TypeError('Explicit owned pool and target required');
 if(policyProfile!=='STANDARD_V1'&&policyProfile!=='WHOLE_V2')throw TypeError('Exact runtime policy profile required');
 const identitySql=policyProfile==='WHOLE_V2'?IDENTITY.replace("ARRAY['search_path=pg_catalog, naijue_erp']","ARRAY['search_path=pg_catalog, naijue_erp, pg_temp']"):IDENTITY;
 const fixed=Object.freeze({...target});
 const status=(client:PgSalesClient):string|null=>{const f=(client as PgSalesClient & {getTransactionStatus?:()=>string|null}).getTransactionStatus;return typeof f==='function'?f.call(client):null;};
 const leases=new WeakMap<object,{raw:PgSalesClient;active:boolean;busy:boolean;failed:boolean;roleSet:boolean;transaction:'none'|'readonly'|'other'}>();
 const wrapped:PgSalesPool=Object.freeze({async connect(){
  const raw=await pool.connect(),state={raw,active:true,busy:false,failed:false,roleSet:false,transaction:'none' as 'none'|'readonly'|'other'};
  try { requireDomain(status(raw)==='I','NATIVE_RUNTIME27_NOT_READY','Idle physical connection required'); const switched=await raw.query('SET ROLE erp_unified27_runtime_2393dbc6db9581c2');
   requireDomain((switched as {command?:unknown}).command==='SET','NATIVE_RUNTIME27_NOT_READY','Exact runtime role required');
   const pathSet=await raw.query('SET search_path TO pg_catalog'); requireDomain((pathSet as {command?:unknown}).command==='SET','NATIVE_RUNTIME27_NOT_READY','Fixed search path required');
   const result=await raw.query(identitySql),x=result.rows[0];
   requireDomain(status(raw)==='I'&&result.rows.length===1&&x?.database===fixed.database&&x.role===RUNTIME_ROLE&&x.session_user===fixed.user&&x.server_port===fixed.port
     &&x.row_security==='on'&&x.search_path==='pg_catalog'&&x.replication_role==='origin'&&x.superuser===false&&x.bypass===false&&x.session_superuser===false&&x.session_bypass===false&&x.runtime_inherit===false&&x.runtime_membership===false
     &&x.can_create===false&&x.version_ok===true&&x.gate_ok===true&&x.policies_ok===true,'NATIVE_RUNTIME27_NOT_READY','Authorized runtime target and RLS required');
  } catch(error) { raw.release(true); throw error; }
  const lease:PgSalesClient={async query(sql,values){if(state.active&&state.busy)state.failed=true;const control=sql.trim().toUpperCase(),cleanup=control==='ROLLBACK';requireDomain(state.active&&!state.busy&&(!state.failed||cleanup),'NATIVE_RUNTIME27_NOT_READY','Original idle lease required');state.busy=true;try{const result=await raw.query(sql,values);requireDomain(state.active&&(!state.failed||cleanup),'NATIVE_RUNTIME27_NOT_READY','Lease closed or poisoned during query');const command=(result as {command?:unknown}).command;
    if(/^(BEGIN|COMMIT|ROLLBACK)(?:\s|$)/.test(control)){const expected=control.split(/\s+/)[0];requireDomain(command===expected&&status(raw)===(expected==='BEGIN'?'T':'I'),'NATIVE_RUNTIME27_NOT_READY','Unexpected transaction acknowledgement or native state');state.roleSet=false;state.transaction=control==='BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'?'readonly':control==='BEGIN ISOLATION LEVEL READ COMMITTED'?'other':'none';}return result;}catch(error){state.failed=true;throw error;}finally{state.busy=false;}},release(error){if(!state.active)return;state.active=false;raw.release(true);}};
  leases.set(lease,state);return lease;
 }});
 const runtime27:Runtime27CommandCapability=Object.freeze({profile:'EXACT27',contract:'STANDARD_RUNTIME27_COMMAND_V1',async assertReady(client:object,purpose:Parameters<Runtime27CommandCapability['assertReady']>[1]){
  const state=leases.get(client);if(state?.active&&state.busy)state.failed=true;requireDomain(state&&state.active&&!state.busy&&!state.failed&&state.transaction==='other'&&status(state.raw)==='T'&&['DOCUMENT_COMMAND','CATALOGUE_READ','INVENTORY_ADMISSION'].includes(purpose),'NATIVE_RUNTIME27_NOT_READY','Original authorized lease required');
  state.busy=true;try{if(!state.roleSet){const switched=await state.raw.query('SET LOCAL ROLE erp_unified27_runtime_2393dbc6db9581c2');requireDomain(state.active&&!state.failed&&status(state.raw)==='T'&&(switched as {command?:unknown}).command==='SET','NATIVE_RUNTIME27_NOT_READY','Exact active runtime role required');state.roleSet=true;}const r=await state.raw.query(identitySql);const x=r.rows[0];
   requireDomain(state.active&&!state.failed&&status(state.raw)==='T'&&r.rows.length===1&&x?.database===fixed.database&&x.role===RUNTIME_ROLE&&x.session_user===fixed.user&&x.server_port===fixed.port
    &&x.row_security==='on'&&x.search_path==='pg_catalog'&&x.replication_role==='origin'&&x.superuser===false&&x.bypass===false&&x.session_superuser===false&&x.session_bypass===false&&x.runtime_inherit===false&&x.runtime_membership===false&&x.can_create===false&&x.version_ok===true&&x.gate_ok===true
    &&x.read_only==='off'&&x.isolation==='read committed'&&x.policies_ok===true,'NATIVE_RUNTIME27_NOT_READY','Runtime target, role and transaction settings required');
  }catch(error){state.failed=true;throw error;}finally{state.busy=false;}
 }});
 const ordinaryRead:OrdinaryDocumentRuntime27Capability=Object.freeze({profile:'EXACT27',contract:'UNIFIED_ORDINARY_RUNTIME27_V1',async assertReady(client:object,purpose:'ORDINARY_DOCUMENT_READ'){
  const state=leases.get(client);if(state?.active&&state.busy)state.failed=true;requireDomain(state&&state.active&&!state.busy&&!state.failed&&state.transaction==='readonly'&&status(state.raw)==='T'&&purpose==='ORDINARY_DOCUMENT_READ','NATIVE_RUNTIME27_NOT_READY','Original authorized read lease required');
  state.busy=true;try{if(!state.roleSet){const switched=await state.raw.query('SET LOCAL ROLE erp_unified27_runtime_2393dbc6db9581c2');requireDomain(state.active&&!state.failed&&status(state.raw)==='T'&&(switched as {command?:unknown}).command==='SET','NATIVE_RUNTIME27_NOT_READY','Exact active runtime role required');state.roleSet=true;}const result=await state.raw.query(identitySql);const x=result.rows[0];
   requireDomain(state.active&&!state.failed&&status(state.raw)==='T'&&result.rows.length===1&&x?.database===fixed.database&&x.role===RUNTIME_ROLE&&x.session_user===fixed.user&&x.server_port===fixed.port&&x.row_security==='on'&&x.search_path==='pg_catalog'&&x.replication_role==='origin'&&x.superuser===false&&x.bypass===false&&x.session_superuser===false&&x.session_bypass===false&&x.runtime_inherit===false&&x.runtime_membership===false&&x.can_create===false&&x.version_ok===true&&x.gate_ok===true&&x.read_only==='on'&&x.isolation==='repeatable read'&&x.policies_ok===true,'NATIVE_RUNTIME27_NOT_READY','Runtime target, role and read-only snapshot required');
  }catch(error){state.failed=true;throw error;}finally{state.busy=false;}
 }});
 issued.set(runtime27, wrapped);
 return Object.freeze({pool:wrapped,runtime27,ordinaryRead});
}
