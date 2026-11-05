import test from 'node:test';
import assert from 'node:assert/strict';
import { PostgresMaintenanceCommandUnitOfWork } from '../adapters/postgres/src/maintenance-command-unit-of-work.ts';
import { createRuntime27CommandIssuer } from '../adapters/postgres/src/runtime27-command-issuer.ts';
import { PostgresProductMaintenanceUnitOfWork } from '../adapters/postgres/src/product-maintenance-store.ts';
import { CATALOGUE_PRICE_KEYS } from '../packages/application/src/catalogue-price-input.ts';
import { createOrdinary27ProductCapacityFactory } from '../adapters/postgres/src/ordinary27-product-capacity.ts';
import { entityId } from '../packages/domain/src/values.ts';
const id='10000000-0000-4000-8000-000000000001', op='10000000-0000-4000-8000-000000000002', actor=entityId('account','10000000-0000-4000-8000-000000000003'), staff='10000000-0000-4000-8000-000000000004';
const completion={kind:'PRODUCT',action:'EDIT',targetId:id,operationId:op,actorAccountId:actor,requestKey:'x',requestHash:'a'.repeat(64),oldVersion:3,newVersion:4,beforeValues:{version:3},afterValues:{version:4},completedAt:'2026-11-03T08:00:00.000Z'} as const;
function fixture(failAtIdentity = 0, seasonOk = true, guardsOk = true, indexesOk = true, skuPresent = false, rootWriteHook?: () => Promise<void>){
 const calls:string[]=[];let status='I', identities=0, guards=guardsOk;
 const raw={getTransactionStatus(){return status},async query(q:string){calls.push(q);
  if(q.startsWith('UPDATE naijue_erp.product SET') && rootWriteHook) await rootWriteHook();
  if(q.startsWith('SET'))return {rows:[],rowCount:0,command:'SET'};
  if(q.startsWith('BEGIN')){status='T';return {rows:[],rowCount:0,command:'BEGIN'}}
  if(q==='COMMIT'||q==='ROLLBACK'){status='I';return {rows:[],rowCount:0,command:q}}
  const rows=q.includes('runtime27-command:identity')?[{database:'synthetic_test',role:'erp_unified27_runtime_2393dbc6db9581c2',session_user:'runtime',server_port:5432,row_security:'on',search_path:'pg_catalog',replication_role:'origin',superuser:false,bypass:false,session_superuser:false,session_bypass:false,runtime_inherit:false,runtime_membership:false,can_create:false,version_ok:true,gate_ok:true,read_only:'off',isolation:'read committed',policies_ok:++identities !== failAtIdentity}]:q.includes('ordinary27-product-write-contract')?[{guards,reference_guards:true,columns:true,indexes:indexesOk}]:q.includes('ordinary27-product-season-contract')?[{column_ok:seasonOk,constraint_ok:true,triggers_ok:true,validator_ok:true}]:q.includes('FROM naijue_erp.product WHERE')?[{id,product_code:'P',name:'P',category_id:staff,supplier_id:null,season_id:null,size_group_id:staff,year:null,system_item_code:null,thickness:null,collar_pants_type:null,default_barcode_scheme_id:null,enabled:true,version:3,deleted_at:null,season_ids:[],...Object.fromEntries(CATALOGUE_PRICE_KEYS.map(k=>[k,null]))}]:q.includes('FROM naijue_erp.sku WHERE')&&skuPresent?[{id:op,product_id:id,sku_code:'S',color_id:staff,fit_id:staff,size_id:staff,enabled:true,version:1,created_operation_id:null}]:q.includes('product-barcode:default-fit')?[{id:staff,code:'A'}]:q.includes('ordinary27-product-history')?[{count:'1',bytes:'20'}]:q.includes('maintenance:identity')?[{account_id:actor,staff_id:staff,login_enabled:true,role:'ADMIN',employment_status:'在职',hall_id:null}]:q.includes('maintenance:complete')?[{result_data:{operationId:op,kind:'PRODUCT',targetId:id,version:4}}]:[];
  return {rows,rowCount:1,command:'SELECT'}},release(){}};
 const issuer=createRuntime27CommandIssuer({async connect(){return raw}},{database:'synthetic_test',user:'runtime',port:5432});
 return {calls,pool:issuer.pool,runtime:issuer.runtime27,invalidateGuards(){guards=false}};
}
test('ordinary existing product admission rechecks exact completed evidence before COMMIT',async()=>{
 const f=fixture(),factory=createOrdinary27ProductCapacityFactory(f.pool,f.runtime),driver=new PostgresMaintenanceCommandUnitOfWork(f.pool);
 await driver.transaction(async ctx=>{await ctx.evidence.assertAllowed({accountId:actor,hallId:null},'PRODUCT','EDIT');await ctx.evidence.getReceipt(actor,'x','PRODUCT');await factory(ctx)(completion);await ctx.evidence.prepare!(completion);await ctx.evidence.complete(completion)});
 assert.ok(f.calls.filter(q=>q.includes('runtime27-command:identity')).length>=4);assert.ok(f.calls.some(q=>q.includes('ordinary27-product-history')));assert.ok(!f.calls.find(q=>q.includes('ordinary27-product-history'))!.includes('import_record'));assert.ok(f.calls.includes('COMMIT'));
});
test('incomplete admission cannot commit',async()=>{const f=fixture(),driver=new PostgresMaintenanceCommandUnitOfWork(f.pool),factory=createOrdinary27ProductCapacityFactory(f.pool,f.runtime);await assert.rejects(driver.transaction(async ctx=>{await factory(ctx)(completion)}));assert.ok(f.calls.includes('ROLLBACK'),f.calls.map(q=>q.slice(0,50)).join('|'));assert.ok(!f.calls.includes('COMMIT'));});
test('altered replay is rejected',async()=>{const f=fixture(),driver=new PostgresMaintenanceCommandUnitOfWork(f.pool),factory=createOrdinary27ProductCapacityFactory(f.pool,f.runtime);await assert.rejects(driver.transaction(async ctx=>{const admit=factory(ctx);await admit(completion);await admit({...completion,newVersion:5});}));assert.ok(f.calls.includes('ROLLBACK'));});

test('ordinary product mode requires issuer and its actual driver',()=>{const f=fixture(),driver=new PostgresMaintenanceCommandUnitOfWork(f.pool),factory=createOrdinary27ProductCapacityFactory(f.pool,f.runtime);assert.doesNotThrow(()=>new PostgresProductMaintenanceUnitOfWork(driver,{ordinary27Capacity:factory,deletionGuard:null}));assert.throws(()=>new PostgresProductMaintenanceUnitOfWork({transaction:async()=>undefined} as never,{ordinary27Capacity:factory,deletionGuard:null}));assert.throws(()=>new PostgresProductMaintenanceUnitOfWork(driver,{ordinary27Capacity:(()=>{}) as never,deletionGuard:null}));assert.throws(()=>createOrdinary27ProductCapacityFactory(f.pool,{...f.runtime}));});

test('ordinary mode reads unambiguous default fit from published business table',async()=>{const f=fixture(),driver=new PostgresMaintenanceCommandUnitOfWork(f.pool),factory=createOrdinary27ProductCapacityFactory(f.pool,f.runtime),uow=new PostgresProductMaintenanceUnitOfWork(driver,{ordinary27Capacity:factory,deletionGuard:null});await uow.transaction(async tx=>{await tx.load(id);assert.equal(await tx.readDefaultHistoricalFit!(),staff)});});

test('runtime change immediately before commit rolls back',async()=>{const f=fixture(4),factory=createOrdinary27ProductCapacityFactory(f.pool,f.runtime),driver=new PostgresMaintenanceCommandUnitOfWork(f.pool);await assert.rejects(driver.transaction(async ctx=>{await ctx.evidence.assertAllowed({accountId:actor,hallId:null},'PRODUCT','EDIT');await ctx.evidence.getReceipt(actor,'x','PRODUCT');await factory(ctx)(completion);await ctx.evidence.prepare!(completion);await ctx.evidence.complete(completion)}));assert.ok(f.calls.includes('ROLLBACK'),f.calls.map(q=>q.slice(0,50)).join('|'));assert.ok(!f.calls.includes('COMMIT'));});
test('ordinary product mode requires actual season-array contract',async()=>{const f=fixture(),driver=new PostgresMaintenanceCommandUnitOfWork(f.pool),factory=createOrdinary27ProductCapacityFactory(f.pool,f.runtime),uow=new PostgresProductMaintenanceUnitOfWork(driver,{ordinary27Capacity:factory,deletionGuard:null});assert.equal(uow.seasonContract,'product-season-array-v1');await uow.transaction(async()=>{});assert.ok(f.calls.some(q=>q.includes('ordinary27-product-season-contract')));});

test('missing actual season contract blocks transaction before work',async()=>{const f=fixture(0,false),driver=new PostgresMaintenanceCommandUnitOfWork(f.pool),factory=createOrdinary27ProductCapacityFactory(f.pool,f.runtime),uow=new PostgresProductMaintenanceUnitOfWork(driver,{ordinary27Capacity:factory,deletionGuard:null});let ran=false;await assert.rejects(uow.transaction(async()=>{ran=true}));assert.equal(ran,false);assert.ok(f.calls.includes('ROLLBACK'));});

test('missing actual product write guards blocks transaction before work',async()=>{const f=fixture(0,true,false),driver=new PostgresMaintenanceCommandUnitOfWork(f.pool),factory=createOrdinary27ProductCapacityFactory(f.pool,f.runtime),uow=new PostgresProductMaintenanceUnitOfWork(driver,{ordinary27Capacity:factory,deletionGuard:null});let ran=false;await assert.rejects(uow.transaction(async()=>{ran=true}));assert.equal(ran,false);assert.ok(f.calls.includes('ROLLBACK'));});

test('missing barcode uniqueness guard blocks product transaction',async()=>{const f=fixture(0,true,true,false),driver=new PostgresMaintenanceCommandUnitOfWork(f.pool),factory=createOrdinary27ProductCapacityFactory(f.pool,f.runtime),uow=new PostgresProductMaintenanceUnitOfWork(driver,{ordinary27Capacity:factory,deletionGuard:null});let ran=false;await assert.rejects(uow.transaction(async()=>{ran=true}));assert.equal(ran,false)});
test('product guard query pins function execution context and trigger arguments',async()=>{const f=fixture(),driver=new PostgresMaintenanceCommandUnitOfWork(f.pool),factory=createOrdinary27ProductCapacityFactory(f.pool,f.runtime),uow=new PostgresProductMaintenanceUnitOfWork(driver,{ordinary27Capacity:factory,deletionGuard:null});await uow.transaction(async()=>{});const sql=f.calls.find(q=>q.includes('ordinary27-product-write-contract'))!;assert.match(sql,/p\.proowner=n\.nspowner/);assert.match(sql,/l\.lanname='plpgsql'/);assert.match(sql,/p\.proconfig=ARRAY\['search_path=pg_catalog, naijue_erp, pg_temp'\]/);assert.match(sql,/NOT tgisinternal AND tgnargs=0/);});
test('ordinary product lifecycle actions can be admitted on an existing version',async()=>{for(const action of ['DISABLE','RESTORE','DELETE']){const f=fixture(),factory=createOrdinary27ProductCapacityFactory(f.pool,f.runtime),driver=new PostgresMaintenanceCommandUnitOfWork(f.pool);await assert.rejects(driver.transaction(async ctx=>{await factory(ctx)({...completion,action});throw Error('SYNTHETIC_STOP_AFTER_ADMISSION')}),/SYNTHETIC_STOP_AFTER_ADMISSION/);}});
test('preflight pins retained guard functions and exact season trigger metadata',async()=>{const f=fixture(),driver=new PostgresMaintenanceCommandUnitOfWork(f.pool),factory=createOrdinary27ProductCapacityFactory(f.pool,f.runtime),uow=new PostgresProductMaintenanceUnitOfWork(driver,{ordinary27Capacity:factory,deletionGuard:null});await uow.transaction(async()=>{});const write=f.calls.find(q=>q.includes('ordinary27-product-write-contract'))!,season=f.calls.find(q=>q.includes('ordinary27-product-season-contract'))!;for(const x of ['guard_retained_catalogue_delete','guard_retained_catalogue_reference','product_retained_delete','product_retained_reference','sku_retained_reference'])assert.ok(write.includes(x),x);assert.match(write,/p\.provolatile='v'/);for(const x of ['tgtype','tgqual','tgattr','tgnargs','tgdeferrable','tginitdeferred','proowner','lanname','proconfig','prosecdef'])assert.ok(season.includes(x),x);});

test('ordinary delete safely admits only SKU-free roots, retaining unknown stock guard',async()=>{for(const present of [false,true]){const f=fixture(0,true,true,true,present),driver=new PostgresMaintenanceCommandUnitOfWork(f.pool),factory=createOrdinary27ProductCapacityFactory(f.pool,f.runtime),uow=new PostgresProductMaintenanceUnitOfWork(driver,{ordinary27Capacity:factory,deletionGuard:null});await uow.transaction(async tx=>{const previous=await tx.load(id);if(present)await assert.rejects(tx.assertCanDelete(previous!),{code:'PRODUCT_DELETE_NOT_READY'});else await tx.assertCanDelete(previous!)});assert.ok(!f.calls.some(q=>q.includes('history_sales_line')));}});
test('season preflight verifies retained dictionary against truncate',async()=>{const f=fixture(),driver=new PostgresMaintenanceCommandUnitOfWork(f.pool),factory=createOrdinary27ProductCapacityFactory(f.pool,f.runtime),uow=new PostgresProductMaintenanceUnitOfWork(driver,{ordinary27Capacity:factory,deletionGuard:null});await uow.transaction(async()=>{});const sql=f.calls.find(q=>q.includes('ordinary27-product-season-contract'))!;assert.match(sql,/season_array_no_truncate/);assert.match(sql,/reject_immutable_change/);});
test('ordinary delete cannot accept a caller-changed loaded aggregate',async()=>{const f=fixture(),driver=new PostgresMaintenanceCommandUnitOfWork(f.pool),factory=createOrdinary27ProductCapacityFactory(f.pool,f.runtime),uow=new PostgresProductMaintenanceUnitOfWork(driver,{ordinary27Capacity:factory,deletionGuard:null});await uow.transaction(async tx=>{const prev=(await tx.load(id))!;await assert.rejects(tx.assertCanDelete({...prev,product:{...prev.product,name:'changed'}}),{code:'TRANSACTION_SCOPE'});});});

test('retained guards invalidated before commit roll back the completed product operation',async()=>{const f=fixture(),factory=createOrdinary27ProductCapacityFactory(f.pool,f.runtime),driver=new PostgresMaintenanceCommandUnitOfWork(f.pool);await assert.rejects(driver.transaction(async ctx=>{await ctx.evidence.assertAllowed({accountId:actor,hallId:null},'PRODUCT','EDIT');await ctx.evidence.getReceipt(actor,'x','PRODUCT');await factory(ctx)(completion);await ctx.evidence.prepare!(completion);await ctx.evidence.complete(completion);f.invalidateGuards()}));assert.ok(f.calls.includes('ROLLBACK'),f.calls.map(q=>q.slice(0,50)).join('|'));assert.ok(!f.calls.includes('COMMIT'));});

test('ordinary soft delete cannot bypass the successful original deletion check',async()=>{
 const f=fixture(),driver=new PostgresMaintenanceCommandUnitOfWork(f.pool),factory=createOrdinary27ProductCapacityFactory(f.pool,f.runtime),uow=new PostgresProductMaintenanceUnitOfWork(driver,{ordinary27Capacity:factory,deletionGuard:null});
 await uow.transaction(async tx=>{const prev=(await tx.load(id))!;await assert.rejects(tx.putProduct({...prev.product,version:4,deletedAt:'2026-11-04T00:00:00.000Z',enabled:false},prev.product),{code:'PRODUCT_DELETE_NOT_READY'});});
 assert.ok(!f.calls.some(q=>q.startsWith('UPDATE naijue_erp.product SET')));
});
test('ordinary soft delete consumes a check bound to the original root once',async()=>{
 const f=fixture(),driver=new PostgresMaintenanceCommandUnitOfWork(f.pool),factory=createOrdinary27ProductCapacityFactory(f.pool,f.runtime),uow=new PostgresProductMaintenanceUnitOfWork(driver,{ordinary27Capacity:factory,deletionGuard:null});
 await uow.transaction(async tx=>{const prev=(await tx.load(id))!,next={...prev.product,version:4,deletedAt:'2026-11-04T00:00:00.000Z',enabled:false};await tx.assertCanDelete(prev);await assert.rejects(tx.putProduct(next,{...prev.product,name:'changed'}),{code:'PRODUCT_DELETE_NOT_READY'});await tx.putProduct(next,prev.product);await assert.rejects(tx.putProduct(next,prev.product),{code:'PRODUCT_DELETE_NOT_READY'});});
 assert.equal(f.calls.filter(q=>q.startsWith('UPDATE naijue_erp.product SET')).length,1);
});
test('failed deletion recheck invalidates prior successful deletion check',async()=>{
 const f=fixture(),driver=new PostgresMaintenanceCommandUnitOfWork(f.pool),factory=createOrdinary27ProductCapacityFactory(f.pool,f.runtime),uow=new PostgresProductMaintenanceUnitOfWork(driver,{ordinary27Capacity:factory,deletionGuard:null});
 await uow.transaction(async tx=>{const prev=(await tx.load(id))!;await tx.assertCanDelete(prev);await assert.rejects(tx.assertCanDelete({...prev,product:{...prev.product,name:'changed'}}));await assert.rejects(tx.putProduct({...prev.product,version:4,deletedAt:'2026-11-04T00:00:00.000Z',enabled:false},prev.product),{code:'PRODUCT_DELETE_NOT_READY'});});
 assert.ok(!f.calls.some(q=>q.startsWith('UPDATE naijue_erp.product SET')));
});
test('intervening SKU mutation invalidates an ordinary deletion check',async()=>{
 const f=fixture(),driver=new PostgresMaintenanceCommandUnitOfWork(f.pool),factory=createOrdinary27ProductCapacityFactory(f.pool,f.runtime),uow=new PostgresProductMaintenanceUnitOfWork(driver,{ordinary27Capacity:factory,deletionGuard:null});
 await uow.transaction(async tx=>{const prev=(await tx.load(id))!;await tx.assertCanDelete(prev);await tx.putSku({id:op,productId:id,skuCode:'S',colorId:staff,fitId:staff,sizeId:staff,enabled:true,version:1,createdOperationId:null},undefined);await assert.rejects(tx.assertCanDelete(prev),{code:'TRANSACTION_SCOPE'});await assert.rejects(tx.putProduct({...prev.product,version:4,deletedAt:'2026-11-04T00:00:00.000Z',enabled:false},prev.product),{code:'PRODUCT_DELETE_NOT_READY'});});
 assert.ok(!f.calls.some(q=>q.startsWith('UPDATE naijue_erp.product SET')));
});

test('failed root SQL write consumes deletion authorization and prevents same-transaction retry or recheck',async()=>{
 const f=fixture(0,true,true,true,false,async()=>{throw new Error('SYNTHETIC_ROOT_WRITE_FAILURE')}),driver=new PostgresMaintenanceCommandUnitOfWork(f.pool),factory=createOrdinary27ProductCapacityFactory(f.pool,f.runtime),uow=new PostgresProductMaintenanceUnitOfWork(driver,{ordinary27Capacity:factory,deletionGuard:null});
 await assert.rejects(uow.transaction(async tx=>{
  const prev=(await tx.load(id))!,next={...prev.product,version:4,deletedAt:'2026-11-04T00:00:00.000Z',enabled:false};
  await tx.assertCanDelete(prev);
  await assert.rejects(tx.putProduct(next,prev.product),/SYNTHETIC_ROOT_WRITE_FAILURE/);
  await assert.rejects(tx.putProduct(next,prev.product),{code:'PRODUCT_DELETE_NOT_READY'});
  await assert.rejects(tx.assertCanDelete(prev),{code:'TRANSACTION_SCOPE'});
  throw new Error('SYNTHETIC_ABORT_AFTER_FAILURE');
 }),/SYNTHETIC_ABORT_AFTER_FAILURE/);
 assert.equal(f.calls.filter(q=>q.startsWith('UPDATE naijue_erp.product SET')).length,1);
 assert.ok(f.calls.includes('ROLLBACK'));assert.ok(!f.calls.includes('COMMIT'));
});

test('ordinary edit invalidates earlier deletion check and prevents old-snapshot recheck',async()=>{
 const f=fixture(),driver=new PostgresMaintenanceCommandUnitOfWork(f.pool),factory=createOrdinary27ProductCapacityFactory(f.pool,f.runtime),uow=new PostgresProductMaintenanceUnitOfWork(driver,{ordinary27Capacity:factory,deletionGuard:null});
 await uow.transaction(async tx=>{
  const prev=(await tx.load(id))!;await tx.assertCanDelete(prev);
  await tx.putProduct({...prev.product,name:'Edited',version:4},prev.product);
  await assert.rejects(tx.assertCanDelete(prev),{code:'TRANSACTION_SCOPE'});
  await assert.rejects(tx.putProduct({...prev.product,version:4,deletedAt:'2026-11-04T00:00:00.000Z',enabled:false},prev.product),{code:'PRODUCT_DELETE_NOT_READY'});
 });
 assert.equal(f.calls.filter(q=>q.startsWith('UPDATE naijue_erp.product SET')).length,1);
});

test('parallel deletion calls cannot share authorization while the first SQL write is pending',async()=>{
 let release!:()=>void,started!:()=>void;
 const pending=new Promise<void>(resolve=>{release=resolve}),entered=new Promise<void>(resolve=>{started=resolve});
 const f=fixture(0,true,true,true,false,async()=>{started();await pending}),driver=new PostgresMaintenanceCommandUnitOfWork(f.pool),factory=createOrdinary27ProductCapacityFactory(f.pool,f.runtime),uow=new PostgresProductMaintenanceUnitOfWork(driver,{ordinary27Capacity:factory,deletionGuard:null});
 await uow.transaction(async tx=>{
  const prev=(await tx.load(id))!,next={...prev.product,version:4,deletedAt:'2026-11-04T00:00:00.000Z',enabled:false};await tx.assertCanDelete(prev);
  const first=tx.putProduct(next,prev.product);
  try {await entered;await assert.rejects(tx.putProduct(next,prev.product),{code:'PRODUCT_DELETE_NOT_READY'});await assert.rejects(tx.assertCanDelete(prev),{code:'TRANSACTION_SCOPE'});}
  finally {release();await first;}
 });
 assert.equal(f.calls.filter(q=>q.startsWith('UPDATE naijue_erp.product SET')).length,1);
});

test('a pending ordinary soft deletion rejects a concurrent SKU append before SQL dispatch',async()=>{
 let release!:()=>void,started!:()=>void;
 const pending=new Promise<void>(resolve=>{release=resolve}),entered=new Promise<void>(resolve=>{started=resolve});
 const f=fixture(0,true,true,true,false,async()=>{started();await pending}),driver=new PostgresMaintenanceCommandUnitOfWork(f.pool),factory=createOrdinary27ProductCapacityFactory(f.pool,f.runtime),uow=new PostgresProductMaintenanceUnitOfWork(driver,{ordinary27Capacity:factory,deletionGuard:null});
 await uow.transaction(async tx=>{
  const prev=(await tx.load(id))!;await tx.assertCanDelete(prev);
  const deletion=tx.putProduct({...prev.product,version:4,deletedAt:'2026-11-04T00:00:00.000Z',enabled:false},prev.product);
  try {
   await entered;
   await assert.rejects(tx.putSku({id:op,productId:id,skuCode:'S',colorId:staff,fitId:staff,sizeId:staff,enabled:true,version:1,createdOperationId:null},undefined),{code:'PRODUCT_DELETED'});
  } finally {release();await deletion;}
 });
 assert.ok(!f.calls.some(q=>q.startsWith('INSERT INTO naijue_erp.sku(')));
});

test('ordinary soft deletion prevents later SKU creation in the same transaction',async()=>{
 const f=fixture(),driver=new PostgresMaintenanceCommandUnitOfWork(f.pool),factory=createOrdinary27ProductCapacityFactory(f.pool,f.runtime),uow=new PostgresProductMaintenanceUnitOfWork(driver,{ordinary27Capacity:factory,deletionGuard:null});
 await uow.transaction(async tx=>{
  const prev=(await tx.load(id))!;await tx.assertCanDelete(prev);
  await tx.putProduct({...prev.product,version:4,deletedAt:'2026-11-04T00:00:00.000Z',enabled:false},prev.product);
  await assert.rejects(tx.putSku({id:op,productId:id,skuCode:'S',colorId:staff,fitId:staff,sizeId:staff,enabled:true,version:1,createdOperationId:null},undefined),{code:'PRODUCT_DELETED'});
 });
 assert.ok(!f.calls.some(q=>q.startsWith('INSERT INTO naijue_erp.sku(')));
});
