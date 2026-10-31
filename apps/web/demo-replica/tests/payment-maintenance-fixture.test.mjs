import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {createPaymentMaintenanceFixture} from './payment-maintenance-fixture.mjs';
import {createPaymentSettingsCommandClient,createPaymentSettingsHttpReader} from '../../src/payment-settings/http-client.ts';
import {qaMethods,qaPaymentAccounts} from '../frontend/qa-reference-fixtures.mts';
const options=f=>({origin:'https://synthetic-management.invalid',basePath:'/api',fetch:async(url,init)=>{const r=await f.request({url:String(url),method:init.method,headers:init.headers,body:init.body});return new Response(r.body,{status:r.status,headers:r.headers});}});
const signal=()=>new AbortController().signal;
const read=(id)=>({parameters:{id},signal:signal(),identity:{accountId:'synthetic',sessionRevision:'1',permissionRevision:'1'},routeInstanceId:'payment-test',entityId:null});
test('payment actual client HTTP service and one store CREATE EDIT original receipt and target readback',async t=>{
 const f=await createPaymentMaintenanceFixture();t.after(()=>f.close());const http=options(f),client=createPaymentSettingsCommandClient(http),reader=createPaymentSettingsHttpReader(http);
 const methodCommand={action:'CREATE',requestKey:'payment-new-method',values:{name:'SYNTHETIC 新方式',enabled:true}};
 const method=await client.execute('methods',methodCommand,signal());assert.equal((await reader.readDetail('methods',read(method.targetId))).name,methodCommand.values.name);
 assert.deepEqual(await client.execute('methods',methodCommand,signal()),method);assert.equal((await client.receipt('methods',methodCommand,signal())).result.targetId,method.targetId);assert.equal(f.snapshot().audit.length,1);
 await assert.rejects(()=>client.execute('methods',{...methodCommand,values:{...methodCommand.values,name:'不同内容'}},signal()),{code:'IDEMPOTENCY_CONFLICT'});
 const create={action:'CREATE',requestKey:'payment-new-account',values:{name:'SYNTHETIC 全厅账户',enabled:true,paymentMethodId:method.targetId,hallIds:[]}};
 const created=await client.execute('accounts',create,signal());const fresh=await reader.readDetail('accounts',read(created.targetId));assert.deepEqual(fresh.halls,[]);assert.equal(fresh.paymentMethod.id,method.targetId);
 const historic=qaPaymentAccounts[0];const edit={action:'EDIT',requestKey:'payment-edit-account',id:historic.id,expectedVersion:historic.version,values:{name:'SYNTHETIC 已修改账户',enabled:false,paymentMethodId:historic.paymentMethod.id,hallIds:historic.halls.map(h=>h.id)}};
 const edited=await client.execute('accounts',edit,signal());const reopened=await reader.readDetail('accounts',read(edited.targetId));assert.equal(reopened.name,edit.values.name);assert.equal(reopened.enabled,false);assert.equal(reopened.version,edit.expectedVersion+1);assert.deepEqual(reopened.halls.map(h=>h.id),edit.values.hallIds);
 await assert.rejects(()=>client.execute('accounts',{...edit,requestKey:'payment-stale'},signal()),{code:'VERSION_CONFLICT'});assert.equal(f.snapshot().audit.length,3);assert.equal(f.snapshot().receipts.size,3);
 f.revoke();await assert.rejects(()=>client.execute('methods',{...methodCommand,requestKey:'payment-denied'},signal()),{kind:'forbidden',outcome:'rejected'});await assert.rejects(()=>client.receipt('methods',methodCommand,signal()),{kind:'forbidden',outcome:'read'});assert.equal(f.snapshot().audit.length,3);
});
test('payment original UOW rolls back row receipt and audit on completion failure',async t=>{
 const f=await createPaymentMaintenanceFixture();t.after(()=>f.close());const before=f.snapshot(),client=createPaymentSettingsCommandClient(options(f));f.failCompletion();const command={action:'EDIT',requestKey:'payment-rollback',id:qaMethods[0].id,expectedVersion:qaMethods[0].version,values:{name:'SYNTHETIC 不应保留',enabled:true}};
 await assert.rejects(()=>client.execute('methods',command,signal()),{outcome:'uncertain'});assert.deepEqual(f.snapshot(),before);await assert.rejects(()=>client.receipt('methods',command,signal()),{code:'RECEIPT_NOT_FOUND'});f.failCompletion(false);await client.execute('methods',command,signal());assert.equal(f.snapshot().audit.length,1);
});
test('production stdio bridge payment writer is explicit and defaults remain read-only',async t=>{
 for(const flags of [[],['--payment-maintenance']]){const child=spawn(process.execPath,['--experimental-transform-types',fileURLToPath(new URL('./production-browser-fixture.mjs',import.meta.url)),...flags],{stdio:['pipe','pipe','pipe']});t.after(()=>child.kill());let stderr='';child.stderr.on('data',x=>stderr+=x);const lines=createInterface({input:child.stdout})[Symbol.asyncIterator]();const command={action:'CREATE',requestKey:'payment-bridge',values:{name:'SYNTHETIC bridge method',enabled:true}};child.stdin.write(JSON.stringify({url:'https://synthetic-management.invalid/api/payment/methods/commands',method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(command)})+'\n');const line=await lines.next();assert.equal(line.done,false,stderr);const response=JSON.parse(line.value);assert.equal(response.status,flags.length?200:501,stderr);child.stdin.end();}
});
