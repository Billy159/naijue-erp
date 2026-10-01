import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {transaction} from './db.ts';
import {install} from './runtime.ts';
import {changeProductMaster,productMasters} from './product-master.ts';

const schema='v2_runtime_product_master_test_'+randomUUID().replaceAll('-','').slice(0,12);
await install(schema);
try{
 const root='test-root-'+randomUUID(),child='test-child-'+randomUUID();
 let saved=await changeProductMaster({kind:'categories',id:root,action:'save',body:{name:'测试一级',parent:'all',order:0,standard:true}},schema);
 assert.equal(saved.version,1);
 saved=await changeProductMaster({kind:'categories',id:child,action:'save',body:{name:'测试二级',parent:root,order:0,standard:true}},schema);
 assert.equal(saved.version,1);
 const sibling='test-sibling-'+randomUUID();
 await changeProductMaster({kind:'categories',id:sibling,action:'save',body:{name:'测试二级同级',parent:root,order:1,standard:true}},schema);
 const sorted=await changeProductMaster({kind:'categories',id:child,action:'order',body:{ids:[sibling,child]}},schema);
 assert.deepEqual(sorted.items.map((item:any)=>[item.id,item.body.order,item.body.parent]),[[sibling,0,root],[child,1,root]]);
 await assert.rejects(changeProductMaster({kind:'categories',id:child,action:'order',body:{ids:[root,child]}},schema),/同一级/);
 await changeProductMaster({kind:'categories',id:sibling,action:'delete'},schema);
 await assert.rejects(changeProductMaster({kind:'categories',id:root,action:'delete'},schema),/下级分类/);
 await changeProductMaster({kind:'categories',id:child,action:'delete'},schema);
 assert.equal((await changeProductMaster({kind:'categories',id:root,action:'check-delete'},schema)).canDelete,true);
 assert.equal((await productMasters(schema)).find(x=>x.id===root)?.deleted,false);
 await changeProductMaster({kind:'categories',id:root,action:'delete'},schema);
 assert.equal((await productMasters(schema)).some(x=>x.id===root||x.id===child),false);
 const color=randomUUID();
 await changeProductMaster({kind:'colors',id:color,action:'save',body:{name:'测试颜色',code:'987'}},schema);
 await changeProductMaster({kind:'colors',id:color,action:'delete'},schema);
 assert.equal((await productMasters(schema)).some(x=>x.id===color),false);
 assert.equal((await changeProductMaster({kind:'colors',id:color,action:'save',body:{name:'测试颜色',code:'987'}},schema)).version,1);
 await assert.rejects(
  changeProductMaster({kind:'groups',id:'UPPER',action:'check-delete'},schema),
  /尺码组不允许删除/
 );
 const beforeReadonly=await productMasters(schema);
 for(const id of ['UPPER','new-group-'+randomUUID()])
  await assert.rejects(changeProductMaster({kind:'groups',id,action:'save',body:{name:'不能修改',sizes:[{id:'s1',name:'测试尺码'}]}},schema),/尺码组为只读资料/);
 for(const id of ['春季','new-season-'+randomUUID()])
  await assert.rejects(changeProductMaster({kind:'seasons',id,action:'save',body:{name:'不能修改'}},schema),/季节为只读资料/);
 assert.deepEqual(await productMasters(schema),beforeReadonly);
 const fit='fit-'+randomUUID();
 await changeProductMaster({kind:'fits',id:fit,action:'save',body:{name:'测试版型',code:'Z'}},schema);
 assert.equal((await productMasters(schema)).find(x=>x.id===fit)?.body.name,'测试版型');
 console.log('product master persistence and dependency checks passed');
}finally{await transaction(schema,tx=>tx.execute('DROP SCHEMA '+schema+' CASCADE'))}
