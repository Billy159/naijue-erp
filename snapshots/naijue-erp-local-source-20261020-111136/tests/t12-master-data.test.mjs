import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';

const require=createRequire(import.meta.url),projectRoot=new URL('../',import.meta.url),source=readFileSync(new URL('../frontend/master-data.js',import.meta.url),'utf8');

test('real mode ignores browser business snapshots and imports only reviewed, identity-matched overrides',async()=>{
 const halls=[{id:'hall-1',code:'H-1',name:'营业厅一',enabled:true,defaultCustomerId:'party-1',defaultWarehouseId:'warehouse-1'},{id:'hall-2',code:'H-2',name:'营业厅二',enabled:true,defaultCustomerId:'',defaultWarehouseId:''}];
 const warehouses=[{id:'warehouse-1',code:'W-1',name:'仓库一',enabled:true,type:'WAREHOUSE',hallRelations:['hall-1'],sourceOwnershipUnknown:false,storeId:'hall-1',ownershipPending:false}];
 const staff=[{id:'employee-1',code:'E-1',name:'来源员工',role:'营业员',hallId:'hall-1',storeId:'hall-1',phone:'',employmentStatus:'在职',enabled:true,loginEnabled:false,loginName:'',sourceFacts:{source:{name:'来源身份'}},version:0}];
 const party={id:'party-1',code:'C-1',name:'来源客户',enabled:true,usage:['customer'],tags:['customer'],sourceFacts:{source:{kind:'synthetic'}}};
 const snapshot={stores:[{...halls[0],name:'本机改名'},{id:'synthetic-hall',code:'SYN-1',name:'不匹配合成厅'}],warehouses:[{...warehouses[0],hallRelations:['hall-1','hall-2']}],staff:[{...staff[0],name:'本机员工名',phone:'13800000000',loginEnabled:true,loginName:'legacy-admin',credential:{salt:'must-not-migrate',hash:'must-not-migrate'},sourceFacts:{replacement:true}}]};
 const values=new Map([['erp-runtime-masters-v1:normal',JSON.stringify(snapshot)]]),writes=[];
 const localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>{writes.push(key);values.set(key,String(value))},removeItem:key=>values.delete(key)};
 const sessionStorage={getItem:()=>null,setItem(){},removeItem(){}};
 const ctx={window:null,location:{search:'',hash:''},URLSearchParams,localStorage,sessionStorage,structuredClone,crypto:webcrypto,TextEncoder,Date,Promise,console,
  addEventListener(){},removeEventListener(){},dispatchEvent(){},document:{querySelector(){return null}},CustomEvent:class CustomEvent{},
  navigator:{locks:{request:async(_key,work)=>work()}},ERP_DEMO:{warehouses:[],products:[]},PRODUCT_CATALOG:{suppliers:[],colors:[],groups:[],categories:[]},SALES_SERVICE:{catalog:{}}};
 ctx.window=ctx;ctx.REAL_DATA_MODE=true;vm.createContext(ctx);vm.runInContext(source,ctx);
 const M=ctx.MASTER_DATA;M.serverAuth={};
 M.attachRuntime({revision:0,stores:halls,warehouses,parties:[party],staff,payments:[],fundAccounts:[],categories:[],audit:[]});
 M.setSessionEmployee({id:'admin-1',name:'管理员',role:'管理员',storeId:'',enabled:true,employmentStatus:'在职',loginEnabled:true,authVersion:1});
 assert.deepEqual([...writes].filter(key=>key==='erp-runtime-masters-v1:normal'),[],'boot must not rewrite the old business snapshot');
 const candidates=M.legacyOverrideCandidates();
 assert.equal(candidates.length,3);
 assert.deepEqual(Array.from(candidates,row=>row.type),['stores','warehouses','staff']);
 const employee=candidates.find(row=>row.type==='staff');
 assert.deepEqual(Array.from(employee.changedFields).sort(),['name','phone']);
 assert.equal('credential' in employee.record,false);
 assert.equal(employee.record.loginName,'');
 assert.equal(JSON.stringify(employee.record.sourceFacts),JSON.stringify(staff[0].sourceFacts));
 const commits=[];
 M.runtimeCommit=async(type,record)=>{
  commits.push({type,id:record.id,record:structuredClone(record)});
  const base=structuredClone(M.data),item=base[type].find(row=>row.id===record.id);
  Object.assign(item,record,{version:(item.version||0)+1});base.revision++;
  M.attachRuntime(base);
  return {ok:true,record:item};
 };
 const result=await M.importLegacyOverrides(candidates);
 assert.equal(result.length,3);assert.ok(result.every(row=>row.ok));
 assert.deepEqual(commits.map(row=>row.type),['stores','warehouses','staff']);
 assert.equal(M.data.stores.find(row=>row.id==='hall-1').name,'本机改名');
 assert.deepEqual(Array.from(M.data.warehouses.find(row=>row.id==='warehouse-1').hallRelations),['hall-1','hall-2']);
 assert.equal(M.data.staff.find(row=>row.id==='employee-1').name,'本机员工名');
 assert.equal(M.data.staff.find(row=>row.id==='employee-1').loginEnabled,false);
 assert.equal(M.data.staff.find(row=>row.id==='employee-1').loginName,'');
 assert.equal(JSON.stringify(M.data.staff.find(row=>row.id==='employee-1').sourceFacts),JSON.stringify(staff[0].sourceFacts));
 assert.equal(values.get('erp-runtime-masters-v1:normal'),JSON.stringify(snapshot),'manual migration leaves the source snapshot available for review');
});
