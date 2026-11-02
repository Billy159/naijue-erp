/** Independent target-side readback, not a source converter or import executor.
 * The caller supplies the existing reviewed target pool and private sinks. No
 * credentials, pool construction, target write or expectation-derived rows. */
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const specs=[
 {name:'aliases',sink:'onAliases',key:['old_source_sku_id'],
  from:'naijue_erp.import_sku_alias a LEFT JOIN naijue_erp.sku s ON s.id=a.canonical_sku_id',where:'a.batch_id=$1::uuid',order:'a.old_source_sku_id COLLATE "C"',
  select:'a.old_source_sku_id,a.canonical_sku_id::text,a.source_row_id::text,a.canonical_source_key,a.mapping_basis,s.id::text AS actual_sku_id,s.product_id::text,s.color_id::text,s.fit_id::text,s.size_id::text,s.sku_code,s.enabled,s.version::text'},
 {name:'contributors',sink:'onContributors',key:['source_row_id'],
  from:'naijue_erp.import_stock_contributor c',where:'c.batch_id=$1::uuid',order:'c.source_row_id',
  select:'c.source_row_id::text,c.warehouse_id::text,c.canonical_sku_id::text,c.old_source_sku_id,c.canonical_stock_source_key,c.source_unit,c.signed_quantity::text,c.baseline_ledger_id::text'},
 {name:'balances',sink:'onBalances',key:['warehouse_id','sku_id'],
  from:'(SELECT DISTINCT warehouse_id,canonical_sku_id FROM naijue_erp.import_stock_contributor WHERE batch_id=$1::uuid) k LEFT JOIN naijue_erp.inventory_balance b ON b.warehouse_id=k.warehouse_id AND b.sku_id=k.canonical_sku_id',where:'true',order:'k.warehouse_id,k.canonical_sku_id',
  select:'k.warehouse_id::text,k.canonical_sku_id::text AS sku_id,(b.sku_id IS NOT NULL) AS balance_present,b.quantity::text,b.version::text,b.last_operation_id::text'},
];
export async function readTargetImportedStockSnapshot(pool,options){
 const {batchId,expectedSourceHash,pageRows=100,signal}=options;
 if(!uuid.test(batchId)||typeof expectedSourceHash!=='string'||!/^[a-f0-9]{64}$/.test(expectedSourceHash)
  ||!Number.isSafeInteger(pageRows)||pageRows<1||pageRows>500
  ||specs.some(s=>typeof options[s.sink]!=='function'))throw Error('TARGET_STOCK_READBACK_INPUT_REQUIRED');
 signal?.throwIfAborted();
 const client=await pool.connect();let transaction=false,releaseError;
 const active=()=>signal?.throwIfAborted();
 try{
  active();try{await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');transaction=true;}catch(error){releaseError=error;throw error;}
  await client.query("SET LOCAL statement_timeout='3s'");
  await client.query("SET LOCAL lock_timeout='1s'");
  await client.query("SET LOCAL idle_in_transaction_session_timeout='5s'");
  const identity=(await client.query(`SELECT current_database() AS database,current_user AS role,session_user AS session_role,pg_current_snapshot()::text AS snapshot,
    (SELECT r.rolcanlogin AND NOT (r.rolsuper OR r.rolinherit OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls)
     AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members m WHERE m.member=r.oid)
     AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_namespace n WHERE n.nspname='naijue_erp' AND n.nspowner=r.oid)
     AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='naijue_erp' AND c.relowner=r.oid)
     FROM pg_catalog.pg_roles r WHERE r.rolname=current_user) AS ordinary_login,
    current_setting('transaction_read_only') AS read_only,current_setting('transaction_isolation') AS isolation`)).rows[0];
  if(identity?.read_only!=='on'||identity.isolation!=='repeatable read')throw Error('TARGET_READONLY_SNAPSHOT_REQUIRED');
  if(identity.ordinary_login!==true||identity.role!==identity.session_role)throw Error('TARGET_ORDINARY_LOGIN_REQUIRED');
  const batch=(await client.query('SELECT id::text,source_hash,status,mapping_version,inventory_mode FROM naijue_erp.import_batch WHERE id=$1::uuid AND source_hash=$2::text',[batchId,expectedSourceHash])).rows;
  if(batch.length!==1||batch[0].id!==batchId||batch[0].source_hash!==expectedSourceHash)throw Error('TARGET_IMPORT_BATCH_NOT_MATCHED');
  const tables=[];
  for(const spec of specs){
   active();const sql=`FROM ${spec.from} WHERE ${spec.where}`;
   const count=(await client.query(`SELECT count(*)::text AS count ${sql}`,[batchId])).rows[0]?.count;
   if(typeof count!=='string'||!/^(0|[1-9][0-9]*)$/.test(count))throw Error('TARGET_READBACK_COUNT_REFUSED');
   await client.query(`DECLARE cleaning_readback_${spec.name} NO SCROLL CURSOR FOR SELECT ${spec.select} ${sql} ORDER BY ${spec.order}`,[batchId]);
   let read=0n;const seen=new Set();
   for(;;){
    active();const page=(await client.query(`FETCH FORWARD ${pageRows} FROM cleaning_readback_${spec.name}`)).rows;
    if(!Array.isArray(page)||page.length>pageRows)throw Error('TARGET_READBACK_PAGE_REFUSED');
    if(page.length===0)break;
    for(const row of page){
     if(spec.key.some(k=>typeof row[k]!=='string'||row[k].length===0))throw Error('TARGET_READBACK_IDENTITY_REFUSED');
     const key=JSON.stringify(spec.key.map(k=>row[k]));if(seen.has(key))throw Error('TARGET_READBACK_DUPLICATE_ROW');seen.add(key);
     read++;if(read>BigInt(count))throw Error('TARGET_READBACK_COUNT_MISMATCH');
    }
    // These are private database facts, never input expectations or source rows.
    await options[spec.sink](page);
   }
   await client.query(`CLOSE cleaning_readback_${spec.name}`);
   if(read.toString()!==count)throw Error('TARGET_READBACK_COUNT_MISMATCH');
   tables.push({name:spec.name,rows:count,eofObserved:true});
  }
  active();try{await client.query('ROLLBACK');transaction=false;}catch(error){transaction=false;releaseError=error;throw error;}
  return {status:'TARGET_IMPORTED_STOCK_READ_BACK_NOT_RECONCILED',identity,batch:batch[0],tables,
   dataCompared:false,sourceCompletenessVerified:false,targetWrites:0};
 }catch(error){
  if(transaction){try{await client.query('ROLLBACK');transaction=false;}catch(rollback){releaseError=rollback;throw new AggregateError([error,rollback],'TARGET_READBACK_AND_ROLLBACK_FAILED');}}
  throw error;
 }finally{client.release(releaseError);}
}
