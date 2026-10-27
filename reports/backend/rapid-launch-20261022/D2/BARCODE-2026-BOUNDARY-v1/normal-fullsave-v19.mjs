// Original native189 QA increment. Inert exports only; no DB/process/config/session construction.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const SCHEME='0e70e45e-1a51-4d44-afe8-0002cf3fb7ef';
const at=(input,path)=>import(pathToFileURL(resolve(input.sourceRoot,path)).href);
const exactTarget=input=>assert.deepEqual(input.target,{database:'erp_qa_rapid26_native_20261023_01',oid:'1032586',role:'erp_qa_v14_core_runtime_20261024_01'});
export async function preflight(pool,issued,input){
  exactTarget(input);assert.equal(issued.pool,pool);assert.equal(input.schemeId,SCHEME);assert.match(input.manualSystemItemCode,/^\d{7}$/);
  const c=await pool.connect();let began=false,primaryError;
  try{
    await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');began=true;
    await issued.runtime26.assertReady(c,'PRODUCT_MAINTENANCE');await issued.runtime26.assertReady(c,'PRODUCT_SEASONS_READ');
    const target=(await c.query("SELECT current_database() AS database,current_user AS role,(SELECT oid::text FROM pg_database WHERE datname=current_database()) AS oid")).rows[0];assert.deepEqual(target,input.target);
    const actor=(await c.query("SELECT a.login_enabled,s.role,s.employment_status,s.hall_id FROM naijue_erp.user_account a JOIN naijue_erp.staff s ON s.id=a.staff_id WHERE a.id=$1::uuid",[input.actor.accountId])).rows;
    const batch=(await c.query("SELECT status,completed_at IS NOT NULL AS completed,checkpoint->'counts'=checkpoint->'expected' AS complete FROM naijue_erp.import_batch WHERE id=$1::uuid",[input.publishedBatchId])).rows;
    const schemes=(await c.query('SELECT id,status,code_length FROM naijue_erp.barcode_scheme WHERE id=$1::uuid',[SCHEME])).rows;
    const colors=(await c.query('SELECT id,code,enabled,deleted_at IS NULL AS retained FROM naijue_erp.color WHERE id=ANY($1::uuid[]) ORDER BY id',[input.colorIds])).rows;
    const fits=(await c.query('SELECT id,code,enabled,deleted_at IS NULL AS retained FROM naijue_erp.fit WHERE id=$1::uuid',[input.fitId])).rows;
    const sizes=(await c.query('SELECT z.id,z.code FROM naijue_erp.size_group_member m JOIN naijue_erp.size z ON z.id=m.size_id WHERE m.size_group_id=$1::uuid ORDER BY z.id LIMIT 5001',[input.groupId])).rows;
    const occupied=(await c.query(`SELECT
      (SELECT count(*)::int FROM naijue_erp.product WHERE product_code=$1) AS products,
      (SELECT count(*)::int FROM naijue_erp.operation_receipt WHERE actor_account_id=$2::uuid AND request_key=ANY($3::text[])) AS receipts,
      (SELECT count(*)::int FROM naijue_erp.sku_barcode WHERE barcode=$4) AS compatible`,[input.productCode,input.actor.accountId,Object.values(input.keys),input.compatibleRaw])).rows[0];
    const permissions=(await c.query(`SELECT table_name,column_name,privilege,
      has_column_privilege(current_user,to_regclass('naijue_erp.'||table_name),column_name,privilege) AS allowed
      FROM (VALUES ('barcode_scheme','id','SELECT'),('barcode_scheme','status','SELECT'),('barcode_scheme','code_length','SELECT'),
      ('color','id','SELECT'),('color','code','SELECT'),('fit','id','SELECT'),('fit','code','SELECT'),('size','id','SELECT'),('size','code','SELECT')) v(table_name,column_name,privilege)`)).rows;
    const missing=[];
    if(actor.length!==1||actor[0].role!=='ADMIN'||!actor[0].login_enabled||actor[0].employment_status!=='在职'||actor[0].hall_id!==input.actor.hallId)missing.push('CURRENT_ADMIN_IDENTITY');
    if(batch.length!==1||batch[0].status!=='IMPORTED'||!batch[0].completed||!batch[0].complete)missing.push('ORIGINAL_PUBLISHED_BASELINE');
    if(schemes.length!==1||schemes[0].status!=='CURRENT'||schemes[0].code_length!==15)missing.push('ACTUAL_APPROVED_2026_SCHEME_CURRENT15');
    if(colors.length!==2||!colors.every(x=>x.enabled&&x.retained&&/^\d{3}$/.test(x.code)))missing.push('TWO_REAL_ENABLED_NUMERIC3_COLORS');
    if(fits.length!==1||!fits[0].enabled||!fits[0].retained||!/^[YABCDE]$/.test(fits[0].code))missing.push('REAL_APPROVED_FIT_CODE');
    const codedSizes=sizes.filter(x=>typeof x.code==='string'&&/^\d{3}$/.test(x.code));
    if(!sizes.length||sizes.length>2500||!codedSizes.length)missing.push('COMPLETE_REAL_SIZE_GROUP_WITH_AT_LEAST_ONE_CODED_SIZE');
    if(occupied.products||occupied.receipts||occupied.compatible)missing.push('FIXED_NEW_FIXTURE_KEYS_OR_CODE_ALREADY_EXIST_RECOVER_DO_NOT_REPLAY');
    if(permissions.some(p=>!p.allowed))missing.push('EXACT_NEW_REFERENCE_COLUMN_SELECT_PRIVILEGES');
    const candidateRaw=[];
    if(!missing.length){for(const colorId of input.colorIds){const color=colors.find(c=>c.id===colorId);for(const size of codedSizes)candidateRaw.push(`5${fits[0].code}${input.manualSystemItemCode}${color.code}${size.code}`);}
      const collisions=(await c.query('SELECT count(*)::int AS n FROM naijue_erp.sku_barcode WHERE barcode=ANY($1::text[])',[candidateRaw])).rows[0];if(collisions.n||new Set(candidateRaw).size!==candidateRaw.length)missing.push('GENERATED_RAW_ALREADY_RESERVED');}
    return {report:{status:missing.length?'BLOCKED_EXACT_PREFLIGHT':'READY_FOR_ORIGINAL_NORMAL_HOST_SESSION',target,missing,counts:{scheme:schemes.length,colors:colors.length,fits:fits.length,fullGroupSizes:sizes.length,codedSizes:codedSizes.length,nullSizeCodes:sizes.filter(x=>x.code===null).length},multiSizeWitness:sizes.length>1,normalHostSession:'NOT_VERIFIED',writeAclAndRowLocks:'NOT_PROVEN_BY_COLUMN_SELECT_ONLY',businessWrites:false},refs:{colors,fits,sizes}};
  }catch(error){primaryError=error;throw error;}
  finally{
    let rollbackError;
    try{if(began)await c.query('ROLLBACK');}
    catch(error){rollbackError=error;if(primaryError){const combined=new AggregateError([primaryError,error],'Preflight failed and rollback failed',{cause:primaryError});combined.code=primaryError.code;throw combined;}throw error;}
    finally{c.release(rollbackError);}
  }
}
function assertDisabled(detail,selected,main){
  const sku=detail.skus.find(s=>s.id===selected.id),barcode=detail.barcodes.find(b=>b.id===main.id);
  assert.ok(sku);assert.ok(barcode);
  for(const field of ['id','skuCode','colorId','fitId','sizeId'])assert.deepEqual(sku[field],selected[field]);
  for(const field of ['id','barcode','kind','schemeId','colorId','fitId','sizeId'])assert.deepEqual(barcode[field],main[field]);
  assert.equal(sku.enabled,false);assert.equal(barcode.enabled,false);
}
function assertProtectedSnapshot(row,input){
  assert.deepEqual((row.protected_roots??[]).map(p=>p.id).sort(),[...input.protectedProductIds].sort());
  for(const key of ['protected_ledger','protected_balances'])assert.ok(row[key].length<=5000,'Protected inventory exceeds this finite execution package');
}
function assertProtectedUnchanged(before,after,input){
  assertProtectedSnapshot(before,input);assertProtectedSnapshot(after,input);
  for(const key of ['protected_roots','protected_skus','protected_barcodes','protected_ledger','protected_balances','ledger','balances'])assert.deepEqual(after[key],before[key]);
}
function assertOperationRows(receipts,audits,input,command,result){
  assert.equal(result.kind,'PRODUCT');assert.equal(result.version,command.action==='CREATE'?1:command.expectedVersion+1);
  if(command.action!=='CREATE')assert.equal(result.targetId,command.id);
  assert.equal(receipts.length,1);assert.equal(audits.length,1);
  const r=receipts[0],a=audits[0];
  assert.equal(r.id,result.operationId);assert.equal(r.actor_account_id,input.actor.accountId);assert.equal(r.request_key,command.requestKey);
  assert.equal(r.target_type,'PRODUCT');assert.equal(r.target_id,result.targetId);assert.equal(r.action,command.action);assert.equal(r.status,'COMMITTED');assert.deepEqual(r.result_data,result);
  assert.equal(a.operation_id,result.operationId);assert.equal(a.actor_account_id,input.actor.accountId);assert.equal(a.object_type,'PRODUCT');assert.equal(a.object_id,result.targetId);assert.equal(a.action,command.action);
  assert.equal(a.old_version,command.action==='CREATE'?null:command.expectedVersion);assert.equal(a.new_version,result.version);
}

export async function runner(api,pool,issued,input,privateCookie,checkpoint){
  assert.equal(input.executionEnabled,true);assert.equal(typeof checkpoint,'function');assert.equal(api.trustedOrigin,input.origin);assert.equal(api.app.server.listening,false);
  assert.equal(typeof privateCookie,'string');assert.ok(privateCookie.length&&!/[\r\n]/.test(privateCookie));
  const admission=await preflight(pool,issued,input);if(admission.report.missing.length)return admission.report;
  const {createProductMaintenanceHttpClientV2,createProductMaintenanceHttpReaderV2}=await at(input,'apps/web/src/products/product-maintenance-http-client.ts');
  const auth=await api.app.inject({method:'GET',url:'/auth/session',headers:{cookie:privateCookie}});
  assert.equal(auth.statusCode,200);const principal=auth.json().principal;
  assert.equal(principal?.accountId,input.actor.accountId);assert.equal(principal.hallId,input.actor.hallId);assert.equal(principal.role,'ADMIN');
  const fetch=async(url,init)=>{const u=new URL(String(url));assert.equal(u.origin,input.origin);assert.ok(u.pathname.startsWith('/api/products/'));
    const h=Object.fromEntries(new Headers(init?.headers));h.cookie=privateCookie;h.origin=input.origin;
    const r=await api.app.inject({method:init?.method??'GET',url:u.pathname.slice(4)+u.search,headers:h,...(init?.body===undefined?{}:{payload:init.body})});
    const headers=new Headers();for(const name of ['content-type','content-length'])if(r.headers[name]!==undefined)headers.set(name,String(r.headers[name]));return new Response(r.body,{status:r.statusCode,headers});};
  const http={origin:input.origin,basePath:'/api',fetch},client=createProductMaintenanceHttpClientV2(http),reader=createProductMaintenanceHttpReaderV2(http),signal=new AbortController().signal;
  const detail=id=>reader.readDetail({parameters:{productId:id},signal,identity:{accountId:input.actor.accountId,hallId:input.actor.hallId},routeInstanceId:'D2-V19-NORMAL-FULLSAVE',entityId:id});
  async function snapshot(){const c=await pool.connect();try{const row=(await c.query(`SELECT
    (SELECT count(*)::int FROM naijue_erp.product) products,(SELECT count(*)::int FROM naijue_erp.sku) skus,
    (SELECT count(*)::int FROM naijue_erp.sku_barcode) barcodes,(SELECT count(*)::int FROM naijue_erp.audit_change) audits,
    (SELECT count(*)::int FROM naijue_erp.operation_receipt) receipts,
    (SELECT count(*)::int FROM naijue_erp.inventory_ledger) ledger,(SELECT count(*)::int FROM naijue_erp.inventory_balance) balances,
    (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM naijue_erp.product p WHERE id=ANY($1::uuid[])) protected_roots,
    (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM naijue_erp.sku s WHERE product_id=ANY($1::uuid[])) protected_skus,
    (SELECT jsonb_agg(to_jsonb(b) ORDER BY b.id) FROM naijue_erp.sku_barcode b JOIN naijue_erp.sku s ON s.id=b.sku_id WHERE s.product_id=ANY($1::uuid[])) protected_barcodes,
    (SELECT coalesce(jsonb_agg(to_jsonb(t)||jsonb_build_object('quantity_delta',t.quantity_delta::text) ORDER BY t.id),'[]'::jsonb) FROM
      (SELECT l.* FROM naijue_erp.inventory_ledger l JOIN naijue_erp.sku s ON s.id=l.sku_id WHERE s.product_id=ANY($1::uuid[]) ORDER BY l.id LIMIT 5001) t) protected_ledger,
    (SELECT coalesce(jsonb_agg(to_jsonb(t)||jsonb_build_object('quantity',t.quantity::text) ORDER BY t.warehouse_id,t.sku_id),'[]'::jsonb) FROM
      (SELECT b.* FROM naijue_erp.inventory_balance b JOIN naijue_erp.sku s ON s.id=b.sku_id WHERE s.product_id=ANY($1::uuid[]) ORDER BY b.warehouse_id,b.sku_id LIMIT 5001) t) protected_balances`,[input.protectedProductIds])).rows[0];assertProtectedSnapshot(row,input);return row;}finally{c.release();}}
  let phase='PREPARE',requestKey=null;const committed=[];
  const save=async(name,command)=>{phase=name;requestKey=command.requestKey;await checkpoint({phase,requestKey,status:'INTENT_BEFORE_ORIGINAL_HTTP'});const result=await client.execute(command,signal);committed.push({phase,requestKey,result});await checkpoint({phase,requestKey,status:'COMMITTED',result});const receipt=await client.receipt(command,signal);assert.deepEqual(receipt.result,result);assert.equal(receipt.requestKey,command.requestKey);assert.equal(receipt.action,command.action);assert.equal(receipt.status,'COMMITTED');
    const c=await pool.connect();try{
      const receipts=(await c.query('SELECT id,actor_account_id,request_key,target_type,target_id,action,status,result_data FROM naijue_erp.operation_receipt WHERE id=$1::uuid',[result.operationId])).rows;
      const audits=(await c.query('SELECT operation_id,actor_account_id,object_type,object_id,action,old_version,new_version FROM naijue_erp.audit_change WHERE operation_id=$1::uuid',[result.operationId])).rows;
      assertOperationRows(receipts,audits,input,command,result);
    }finally{c.release();}return result;};
  try{
    const before=await snapshot(),base=await detail(input.referenceProductId),values={...base.values,productCode:input.productCode,name:input.productName,systemItemCode:input.manualSystemItemCode,defaultBarcodeSchemeId:SCHEME,enabled:true};
    assert.equal(values.sizeGroupId,input.groupId);assert.ok(values.supplierId&&values.seasonIds!==null);
    const N=admission.refs.sizes.length,M=admission.refs.sizes.filter(s=>typeof s.code==='string'&&/^\d{3}$/.test(s.code)).length;
    const create={action:'CREATE',requestKey:input.keys.create,values,skus:[],barcodes:[],skuSelection:{colorIds:[input.colorIds[0]],fitIds:[input.fitId]}};
    const created=await save('CREATE_COMPLETE_GROUP',create);let d=await detail(created.targetId);assert.equal(d.skus.length,N);assert.equal(d.barcodes.length,M);
    const expectedRaw=(colorId,sizeId)=>`5${admission.refs.fits[0].code}${input.manualSystemItemCode}${admission.refs.colors.find(c=>c.id===colorId).code}${admission.refs.sizes.find(s=>s.id===sizeId).code}`;
    for(const sku of d.skus.filter(s=>typeof admission.refs.sizes.find(z=>z.id===s.sizeId)?.code==='string'&&/^\d{3}$/.test(admission.refs.sizes.find(z=>z.id===s.sizeId).code)))assert.ok(d.barcodes.some(b=>b.colorId===sku.colorId&&b.fitId===sku.fitId&&b.sizeId===sku.sizeId&&b.barcode===expectedRaw(sku.colorId,sku.sizeId)&&b.kind==='MAIN'&&b.enabled));
    const replayBefore=await snapshot();assert.deepEqual(await client.execute(create,signal),created);assert.deepEqual(await snapshot(),replayBefore);
    const selected=d.skus.find(s=>d.barcodes.some(b=>b.colorId===s.colorId&&b.fitId===s.fitId&&b.sizeId===s.sizeId&&b.kind==='MAIN')),main=d.barcodes.find(b=>b.colorId===selected.colorId&&b.fitId===selected.fitId&&b.sizeId===selected.sizeId&&b.kind==='MAIN');
    await save('DISABLE_NEW_FIXTURE_SKU_MAIN',{action:'EDIT',requestKey:input.keys.disable,id:d.productId,expectedVersion:d.version,values:d.values,
      skus:[{...selected,enabled:false}],barcodes:[{...main,enabled:false}]});
    const retained=await detail(d.productId);assertDisabled(retained,selected,main);
    const append={action:'EDIT',requestKey:input.keys.append,id:d.productId,expectedVersion:retained.version,values:retained.values,skus:[],barcodes:[],skuSelection:{colorIds:input.colorIds,fitIds:[input.fitId]}};
    const appended=await save('APPEND_COLOR_COMPLETE_GROUP',append);d=await detail(d.productId);assert.equal(d.skus.length,2*N);assert.equal(d.barcodes.length,2*M);assertDisabled(d,selected,main);
    for(const s of retained.skus)assert.deepEqual(d.skus.find(n=>n.id===s.id),s);for(const b of retained.barcodes)assert.deepEqual(d.barcodes.find(n=>n.id===b.id),b);
    const newSkus=d.skus.filter(s=>!retained.skus.some(old=>old.id===s.id));assert.equal(newSkus.length,N);
    for(const sku of newSkus){const code=admission.refs.sizes.find(z=>z.id===sku.sizeId).code;if(typeof code!=='string'||!/^\d{3}$/.test(code)){assert.equal(d.barcodes.some(b=>b.colorId===sku.colorId&&b.fitId===sku.fitId&&b.sizeId===sku.sizeId),false);continue;}assert.ok(d.barcodes.some(b=>b.colorId===sku.colorId&&b.fitId===sku.fitId&&b.sizeId===sku.sizeId&&b.barcode===expectedRaw(sku.colorId,sku.sizeId)&&b.kind==='MAIN'&&b.enabled));}
    const appendBefore=await snapshot();assert.deepEqual(await client.execute(append,signal),appended);assert.deepEqual(await snapshot(),appendBefore);
    const target=newSkus.find(s=>d.barcodes.some(b=>b.colorId===s.colorId&&b.fitId===s.fitId&&b.sizeId===s.sizeId&&b.kind==='MAIN')),prior=structuredClone(d.barcodes);
    await save('COMPATIBLE_RAW_SAME_NEW_SKU',{action:'EDIT',requestKey:input.keys.compatible,id:d.productId,expectedVersion:d.version,values:d.values,skus:[],barcodes:[{id:null,barcode:input.compatibleRaw,colorId:target.colorId,fitId:target.fitId,sizeId:target.sizeId,kind:'CONFIRMED_OLD',schemeId:null,enabled:true}]});
    d=await detail(d.productId);assert.equal(d.version,4);assert.equal(d.skus.length,2*N);assert.equal(d.barcodes.length,2*M+1);assertDisabled(d,selected,main);
    for(const b of prior)assert.deepEqual(d.barcodes.find(n=>n.id===b.id),b);
    assert.ok(d.barcodes.some(b=>b.barcode===input.compatibleRaw&&b.kind==='CONFIRMED_OLD'&&b.colorId===target.colorId&&b.fitId===target.fitId&&b.sizeId===target.sizeId));
    const after=await snapshot();assertProtectedUnchanged(before,after,input);assert.equal(new Set(committed.map(x=>x.result.operationId)).size,4);
    for(const [key,delta]of Object.entries({products:1,skus:2*N,barcodes:2*M+1,audits:4,receipts:4}))assert.equal(after[key]-before[key],delta);
    return {status:'PASS_LIMITED_ACTUAL_NORMAL_PRODUCT_V19_FULLSAVE',sourceCheckpoint:input.sourceCheckpoint,target:input.target,groupSize:N,codedSizes:M,nullSizeWitness:admission.refs.sizes.some(s=>s.code===null),multiSizeWitness:N>1,committed,
      checks:['Normal factory session/client/plugin/UOW CREATE+groupMAIN','New fixture disabled SKU/main unchanged during addedcolor fullgroup+MAIN','Original-key replay no new domain rows','Compatible raw exact realSKU without mainreplacement','Original protected C189 fixtures/inventory unchanged'],actualPg:true,newSyntheticFixtureRetained:true,notTested:['Network/TLS/browser','NULL size actual sample if absent','Cross-product natural23505 rollback/representativeperformance','Formal business release']};
  }catch(error){return {status:'FAILED_STOP_PRESERVE_ORIGINAL_KEYS_NO_RETRY',phase,requestKey,committed,errorCode:typeof error?.code==='string'?error.code:'FINITE_ASSERTION',uncertain:error?.outcome==='uncertain',next:'T45 recover exact original key/rows; never automatically rerun this four-save bundle or clean retained data.'};}
}
