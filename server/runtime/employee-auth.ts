import {pbkdf2Sync,randomBytes,timingSafeEqual} from 'node:crypto';
import {transaction,type Transaction} from './db.ts';
import {RUNTIME} from './runtime.ts';

export const roles=['管理员','仓库人员','营业员'];
export const AUTH_SCHEMA=process.env.DEMO_EMPLOYEE_AUTH_SCHEMA||RUNTIME;
if(AUTH_SCHEMA!==RUNTIME&&!AUTH_SCHEMA.startsWith('v2_runtime_test_'))throw Error('AUTH_TEST_SCHEMA_REQUIRED');
export const authCookieName=AUTH_SCHEMA===RUNTIME?'v2_operator':'v2_employee_qa';
const expiresIn=8*3600000;
const fail=(message:string):never=>{throw Error(message)};
const publicEmployee=(row:any)=>({...row.body,id:row.id,authVersion:row.version,hasPassword:!!row.password_hash});
export async function installEmployeeAuth(schema=AUTH_SCHEMA){
 await transaction(schema,async tx=>{
  await tx.execute(`CREATE TABLE IF NOT EXISTS employee_login (
   id text PRIMARY KEY, login_name text UNIQUE, body jsonb NOT NULL,
   password_salt text, password_hash text, version integer NOT NULL DEFAULT 1,
   updated_at timestamptz NOT NULL DEFAULT now()
  ); CREATE TABLE IF NOT EXISTS employee_session (
   token text PRIMARY KEY, employee_id text NOT NULL REFERENCES employee_login(id),
   employee_version integer NOT NULL, expires_at bigint NOT NULL
  ); CREATE TABLE IF NOT EXISTS employee_account_audit (
   id bigserial PRIMARY KEY, actor_id text NOT NULL, employee_id text NOT NULL,
   action text NOT NULL, changes jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
  ); ALTER TABLE operator DROP CONSTRAINT IF EXISTS operator_role_check;
  ALTER TABLE operator ADD CONSTRAINT operator_role_check CHECK(role IN ('ADMIN','WAREHOUSE','SALESPERSON'));`);
 });
}
async function operator(tx:Transaction,e:any){
 const role={'管理员':'ADMIN','仓库人员':'WAREHOUSE','营业员':'SALESPERSON'}[e.role];
 await tx.query(`INSERT INTO operator(id,name,role,enabled) VALUES($1,$2,$3,$4)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name,role=excluded.role,enabled=excluded.enabled RETURNING id`,
 [e.id,e.name,role,e.loginEnabled&&e.employmentStatus==='在职']);
}
// One-time migration is invoked only by the temporary local migrator after it verifies
// the existing Demo cookie against the running old service. It is not a public route.
export async function migrateEmployeeAccounts(records:any[],schema=AUTH_SCHEMA){
 return transaction(schema,async tx=>{
  await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[schema+':employee-login']);
  if((await tx.query('SELECT id FROM employee_login LIMIT 1')).rowCount)fail('账号已经迁移');
  if(!records.some(e=>e.role==='管理员'&&e.loginEnabled&&e.credential?.hash))fail('缺少现有管理员账号');
  for(const input of records){
   if(!roles.includes(input.role)||!input.id||!input.name)continue;
   const e={...input,employmentStatus:input.employmentStatus||'在职'},credential=e.credential;
   delete e.credential;delete e.password;
   e.loginName=String(e.loginName||'').trim();e.loginEnabled=!!e.loginEnabled&&e.employmentStatus==='在职';
   await tx.query(`INSERT INTO employee_login(id,login_name,body,password_salt,password_hash,version)
    VALUES($1,$2,$3::jsonb,$4,$5,$6) RETURNING id`,
    [e.id,e.loginName||null,JSON.stringify(e),credential?.salt||null,credential?.hash||null,input.authVersion||1]);
   await operator(tx,e);
  }
 });
}
export async function loginEmployee(loginName:string,password:string,schema=AUTH_SCHEMA){
 const name=String(loginName||'').trim();
 return transaction(schema,async tx=>{
  const row=(await tx.query('SELECT * FROM employee_login WHERE login_name=$1',[name])).rows[0];
  if(!row?.password_hash||typeof password!=='string')fail('登录账号或密码不正确');
  const hash=pbkdf2Sync(password,row.password_salt,210000,32,'sha256').toString('hex');
  if(!timingSafeEqual(Buffer.from(hash,'hex'),Buffer.from(row.password_hash,'hex')))fail('登录账号或密码不正确');
  if(row.body.employmentStatus!=='在职')fail('员工已离职，无法登录');
  if(!row.body.loginEnabled)fail('登录权限已关闭，请联系管理员');
  if(!roles.includes(row.body.role))fail('员工角色未配置，请联系管理员');
  const token=randomBytes(32).toString('hex');
  await tx.query('INSERT INTO employee_session VALUES($1,$2,$3,$4) RETURNING token',[token,row.id,row.version,Date.now()+expiresIn]);
  return {token,employee:publicEmployee(row)};
 });
}
export async function employeeSession(token:string|undefined,schema=AUTH_SCHEMA){
 if(!token)return null;
 return transaction(schema,async tx=>{
  const row=(await tx.query(`SELECT e.* FROM employee_session s JOIN employee_login e ON e.id=s.employee_id
   WHERE s.token=$1 AND s.expires_at>$2 AND s.employee_version=e.version
   AND e.body->>'employmentStatus'='在职' AND (e.body->>'loginEnabled')::boolean`,[token,Date.now()])).rows[0];
  return row&&roles.includes(row.body.role)?publicEmployee(row):null;
 });
}
export async function resumeMigratedEmployee(id:string,version:number,schema=AUTH_SCHEMA){
 return transaction(schema,async tx=>{
  const row=(await tx.query('SELECT * FROM employee_login WHERE id=$1 AND version=$2',[id,version])).rows[0];
  if(!row?.body.loginEnabled||row.body.employmentStatus!=='在职')fail('现有登录已失效');
  const token=randomBytes(32).toString('hex');
  await tx.query('INSERT INTO employee_session VALUES($1,$2,$3,$4) RETURNING token',[token,id,version,Date.now()+expiresIn]);
  return {token,employee:publicEmployee(row)};
 });
}
export async function logoutEmployee(token:string,schema=AUTH_SCHEMA){
 await transaction(schema,tx=>tx.query('DELETE FROM employee_session WHERE token=$1 RETURNING token',[token]));
}
export async function employeeAccounts(actor:any,schema=AUTH_SCHEMA){
 if(actor?.role!=='管理员')fail('只有管理员可以管理员工与账号');
 return transaction(schema,async tx=>(await tx.query('SELECT * FROM employee_login ORDER BY updated_at,id')).rows.map(publicEmployee));
}
export async function saveEmployeeAccount(actor:any,input:any,schema=AUTH_SCHEMA){
 if(actor?.role!=='管理员')fail('只有管理员可以管理员工与账号');
 return transaction(schema,async tx=>{
  await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[schema+':employee-login']);
  const record=input.record||{},old=(await tx.query('SELECT * FROM employee_login WHERE id=$1',[record.id])).rows[0];
  if(old&&input.expectedVersion!==old.version)fail('员工资料已更新，请重新打开核对');
  const e={...(old?.body||{}),...record};delete e.credential;delete e.password;delete e.hasPassword;delete e.authVersion;
  if(!e.id||!String(e.name||'').trim())fail('请填写姓名');
  if(!roles.includes(e.role))fail('请选择管理员、仓库人员或营业员');
  if(!['在职','离职'].includes(e.employmentStatus))fail('员工状态无效');
  e.name=e.name.trim();e.loginName=String(e.loginName||'').trim();e.enabled=e.employmentStatus==='在职';
  if(e.employmentStatus==='离职')e.loginEnabled=false;
  if(old?.body.employmentStatus==='离职'&&e.employmentStatus==='在职')e.loginEnabled=false;
  if(old?.login_name&&!e.loginName)fail('已有登录账号不能为空');
  if(e.loginEnabled&&!e.loginName)fail('请填写登录账号');
  if(e.loginName&&(await tx.query('SELECT id FROM employee_login WHERE login_name=$1 AND id<>$2',[e.loginName,e.id])).rowCount)fail('登录账号已存在，请使用其他账号');
  let salt=old?.password_salt,hash=old?.password_hash;
  if(input.password){
   if(typeof input.password!=='string'||input.password.length<8)fail('密码至少8位');
   salt=randomBytes(24).toString('hex');hash=pbkdf2Sync(input.password,salt,210000,32,'sha256').toString('hex');
  }
  if(e.loginEnabled&&!hash)fail('首次开通登录请填写初始密码');
  if(old?.body.role==='管理员'&&old.body.loginEnabled&&!(e.role==='管理员'&&e.loginEnabled&&e.enabled)){
   const others=await tx.query(`SELECT id FROM employee_login WHERE id<>$1 AND body->>'role'='管理员'
    AND body->>'employmentStatus'='在职' AND (body->>'loginEnabled')::boolean`,[e.id]);
   if(!others.rowCount)fail('不能关闭最后一个可登录管理员');
  }
  const sensitive=['loginName','loginEnabled','employmentStatus','role','storeId'];
  const version=(old?.version||0)+(!old||input.password||sensitive.some(k=>old.body[k]!==e[k])?1:0);
  const row=(await tx.query(`INSERT INTO employee_login(id,login_name,body,password_salt,password_hash,version)
   VALUES($1,$2,$3::jsonb,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET login_name=excluded.login_name,
   body=excluded.body,password_salt=excluded.password_salt,password_hash=excluded.password_hash,
   version=excluded.version,updated_at=now() RETURNING *`,[e.id,e.loginName||null,JSON.stringify(e),salt||null,hash||null,version])).rows[0];
  await operator(tx,e);
  const changes=['name','role','storeId','phone',...sensitive].filter((k,i,a)=>a.indexOf(k)===i&&old?.body[k]!==e[k]).map(field=>({field,before:old?.body[field]??null,after:e[field]??null}));
  if(input.password)changes.push({field:'credential',before:old?.password_hash?'已设置':null,after:old?.password_hash?'已重置':'已设置'});
  const action=!old?'新增':old.body.employmentStatus!==e.employmentStatus?(e.employmentStatus==='离职'?'办理离职':'恢复在职'):old.body.loginEnabled!==e.loginEnabled?(e.loginEnabled?'登录账号恢复':'登录账号关闭'):input.password?'重置密码':'修改';
  await tx.query('INSERT INTO employee_account_audit(actor_id,employee_id,action,changes) VALUES($1,$2,$3,$4::jsonb) RETURNING id',[actor.id,e.id,action,JSON.stringify(changes)]);
  return publicEmployee(row);
 });
}

export function runtimeAccess(employee:any,path:string,body?:any){
 if(!roles.includes(employee?.role))return false;
 if(path.startsWith('/runtime/employees'))return employee.role==='管理员';
 if(['/runtime/product-profile','/runtime/product-delete','/runtime/product-master','/runtime/master-reference'].includes(path))return employee.role!=='营业员';
 // Shared read APIs (catalog/specs/inventory) remain available to business selectors.
 if(path==='/runtime/command'&&body?.documentType==='PURCHASE')return employee.role!=='营业员';
 return true;
}
