import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync, rmSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomBytes, webcrypto} from 'node:crypto';
import vm from 'node:vm';
import Fastify from 'fastify';
import {readDatabaseConfig} from '../server/database/config.ts';
import {readSecurityConfig} from '../server/security/config.ts';
import {IdentityService} from '../server/security/service.ts';
import {installIdentity} from '../server/security/http.ts';
import {passwordCredential} from '../server/security/passwords.ts';

const env={APP_ENV:'qa',POSTGRES_HOST:'/private/t38-unit',POSTGRES_PORT:'55491',POSTGRES_DB:'demo_8877_t38_unit',POSTGRES_USER:'t38_unit_app',POSTGRES_ROLE_PREFIX:'t38_unit',
  POSTGRES_SOURCE_SCHEMA:'t38_source',POSTGRES_RUNTIME_SCHEMA:'t38_runtime',POSTGRES_AUTH_SCHEMA:'t38_auth',POSTGRES_CONTROL_SCHEMA:'t38_control',
  POSTGRES_INSTANCE_ID:'13f8764a-782b-4454-8375-b647e194983e',POSTGRES_CLUSTER_ID:'7691754635362465003'};
const database=readDatabaseConfig(env), origin='https://t38-qa.invalid';

function fixture(){
  const directory=mkdtempSync(join(tmpdir(),'naijue-t38-'));
  const secret=join(directory,'synthetic.key');writeFileSync(secret,randomBytes(48),{mode:0o600});
  const rows=new Map(), sessions=new Map(), audits=[];
  const session={lock:async()=>{},query:async(sql,values=[])=>{
    let result=[];
    if(sql.includes('WHERE login_name=$1 FOR SHARE')) result=[...rows.values()].filter(row=>row.login_name===values[0]);
    else if(sql.includes('.employee_session s JOIN')){
      const active=sessions.get(values[0]),row=rows.get(active?.employee_id);
      if(active&&row&&active.employee_version===row.version&&active.expires_at>values[1])result=[row];
    }else if(sql.includes('SELECT coalesce(')&&sql.includes(' AS allowed'))result=[{allowed:true}];
    else if(sql.includes('.employee_session(token,employee_id,employee_version,expires_at)'))sessions.set(values[0],{employee_id:values[1],employee_version:values[2],expires_at:values[3]});
    else if(sql.includes('.employee_login SET password_salt')){
      const row=rows.get(values[0]);rows.set(values[0],{...row,password_salt:values[1],password_hash:values[2],version:row.version+1});
    }else if(sql.includes('.employee_session WHERE employee_id=')){
      for(const [key,value] of sessions)if(value.employee_id===values[0])sessions.delete(key);
    }else if(sql.includes('.employee_session WHERE token='))sessions.delete(values[0]);
    else if(sql.includes('.employee_account_audit('))audits.push({actorId:values[0],employeeId:values[1],action:values[2],changes:JSON.parse(values[3])});
    else throw Error('Unrecognized fixture query');
    return {rows:result,rowCount:result.length};
  }};
  const access={read:work=>work(session),transaction:work=>work(session)};
  const identity=new IdentityService(access,database,readSecurityConfig({SESSION_ORIGIN:origin,SESSION_SECRET_FILE:secret},database));
  const app=Fastify();app.decorate('identity',identity);installIdentity(app,identity);
  return {app,identity,rows,sessions,audits,dispose:async()=>{await app.close();rmSync(directory,{recursive:true,force:true})}};
}

test('T38本人改密：会话与CSRF保护、禁止指定他人、旧凭据/全部旧会话失效、审计无密码',async t=>{
  const f=fixture();t.after(()=>f.dispose());
  const oldPassword='synthetic-old-password', newPassword='synthetic-new-password';
  const credential=await passwordCredential(oldPassword);
  for(const [id,role] of [['admin','管理员'],['warehouse','仓库人员'],['sales','营业员']])
    f.rows.set(id,{id,login_name:id,body:{name:id,role,storeId:role==='营业员'?'10000000-0000-4000-8000-000000000001':null,employmentStatus:'在职',loginEnabled:true},password_salt:credential.salt,password_hash:credential.hash,version:1});
  const login=async (id,password)=>f.app.inject({method:'POST',url:'/api/runtime/session',headers:{origin},payload:{loginName:id,password}});
  const credentials=response=>({cookie:response.headers['set-cookie'].split(';')[0],origin,'x-csrf-token':response.json().data.csrfToken});
  const change=(headers,payload)=>f.app.inject({method:'POST',url:'/api/runtime/password/change',headers,payload});
  assert.equal((await change({origin},{currentPassword:oldPassword,newPassword})).statusCode,401);
  for(const id of ['admin','warehouse','sales']){
    const first=await login(id,oldPassword),second=await login(id,oldPassword);
    assert.equal(first.statusCode,200,id+': '+first.body);assert.equal(second.statusCode,200,id+': '+second.body);
    const headers=credentials(first),other=credentials(second);
    assert.equal((await change({cookie:headers.cookie,origin},{currentPassword:oldPassword,newPassword})).statusCode,403);
    assert.equal((await change({...headers,origin:'https://attacker.invalid'},{currentPassword:oldPassword,newPassword})).statusCode,403);
    const before=f.audits.length,version=f.rows.get(id).version;
    assert.equal((await change(headers,{employeeId:'admin',currentPassword:oldPassword,newPassword})).statusCode,400);
    assert.equal((await change(headers,{currentPassword:'incorrect',newPassword})).json().error.code,'INVALID_CURRENT_PASSWORD');
    assert.equal((await change(headers,{currentPassword:oldPassword,newPassword:'short'})).statusCode,400);
    assert.equal(f.rows.get(id).version,version);assert.equal(f.audits.length,before);
    const changed=await change(headers,{currentPassword:oldPassword,newPassword});
    assert.equal(changed.statusCode,200,changed.body);assert.equal(changed.json().data.changed,true);
    assert.match(changed.headers['set-cookie'],/Max-Age=0/);
    assert.equal(f.rows.get(id).version,version+1);
    assert.equal((await f.app.inject({url:'/api/runtime/session',headers})).statusCode,401);
    assert.equal((await f.app.inject({url:'/api/runtime/session',headers:other})).statusCode,401);
    assert.equal((await login(id,oldPassword)).statusCode,401);
    assert.equal((await login(id,newPassword)).statusCode,200);
    assert.equal(f.audits.at(-1).actorId,id);assert.equal(f.audits.at(-1).employeeId,id);
    assert.equal(f.audits.at(-1).action,'本人修改密码');
    assert(!JSON.stringify(f.audits).includes(oldPassword));assert(!JSON.stringify(f.audits).includes(newPassword));
    assert(!changed.body.includes(newPassword));
  }
  const newest=await login('admin',newPassword),headers=credentials(newest);
  for(let i=0;i<5;i++)assert.equal((await change(headers,{currentPassword:'incorrect',newPassword:'synthetic-next-password'})).statusCode,400);
  assert.equal((await change(headers,{currentPassword:oldPassword,newPassword:'synthetic-next-password'})).statusCode,429);
});

test('T38前端传输：密码仅进请求正文，不进入业务请求记录',async()=>{
  const storage=new Map(), calls=[];
  const context={crypto:webcrypto,AbortController,URLSearchParams,setTimeout,clearTimeout,navigator:{onLine:true}};
  vm.createContext(context);vm.runInContext(readFileSync('frontend/service-client.js','utf8'),context);
  const client=context.ERP_API.createClient({actor:()=> 'synthetic',stateScope:'t38-unit',storage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},fetcher:async(path,options)=>{
    calls.push({path,options});return {ok:true,status:200,json:async()=>({ok:true,data:path.endsWith('/session')?{employee:{id:'synthetic'},csrfToken:'csrf-synthetic'}:{changed:true}})};
  }});
  await client.request('/runtime/session');
  await client.request('/runtime/password/change',{currentPassword:'synthetic-old-password',newPassword:'synthetic-new-password'});
  assert.equal(calls.at(-1).path,'/api/runtime/password/change');
  assert.equal(calls.at(-1).options.headers['X-CSRF-Token'],'csrf-synthetic');
  await client.request('/runtime/inventory',{filters:{}},{mode:'query'});
  assert.equal(calls.at(-1).options.headers['X-CSRF-Token'],undefined);
  assert.equal(client.pending().length,0);assert.equal(client.history().length,0);
  assert(!JSON.stringify([...storage]).includes('synthetic-old-password'));
  assert(!JSON.stringify([...storage]).includes('synthetic-new-password'));
});
