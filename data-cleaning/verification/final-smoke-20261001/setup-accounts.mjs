import {transaction} from '../../../server/runtime/db.ts';
import {installEmployeeAuth,migrateEmployeeAccounts,saveEmployeeAccount,AUTH_SCHEMA} from '../../../server/runtime/employee-auth.ts';
import {readFileSync,writeFileSync} from 'node:fs';
import {pbkdf2Sync} from 'node:crypto';
if(!process.env.POSTGRES_DB?.startsWith('demo_8877_'))throw Error('Isolated database required');
const password='SmkDemo20261001!',salt='final-smoke-test-fixture',hall=JSON.parse(readFileSync('server/runtime/hall-config.json')).stores.find(x=>x.name==='大西洋银泰ST');
await transaction('public',tx=>tx.execute(`CREATE SCHEMA IF NOT EXISTS ${AUTH_SCHEMA}; CREATE TABLE IF NOT EXISTS ${AUTH_SCHEMA}.operator(id text PRIMARY KEY,name text NOT NULL,role text NOT NULL,enabled boolean NOT NULL DEFAULT true)`));
await installEmployeeAuth();
const admin={id:'smoke-admin',name:'Smoke验收管理员',code:'SMK-A',role:'管理员',employmentStatus:'在职',loginEnabled:true,loginName:'smoke-admin',enabled:true,authVersion:1,credential:{salt,hash:pbkdf2Sync(password,salt,210000,32,'sha256').toString('hex')}};
if(!(await transaction(AUTH_SCHEMA,tx=>tx.query('SELECT id FROM employee_login LIMIT 1'))).rowCount)await migrateEmployeeAccounts([admin]);
const rows=[admin];
for(const [id,name,role] of [['smoke-warehouse','Smoke验收仓库员','仓库人员'],['smoke-sales','Smoke验收营业员','营业员']])rows.push(await saveEmployeeAccount(admin,{record:{id,name,code:id,role,storeId:hall.id,employmentStatus:'在职',loginEnabled:true,loginName:id,enabled:true},password}));
for(const row of rows){await transaction('v2_runtime_stage03c',tx=>tx.query(`INSERT INTO operator(id,name,role,enabled) VALUES($1,$2,$3,true) ON CONFLICT(id) DO UPDATE SET name=excluded.name,role=excluded.role RETURNING id`,[row.id,row.name,{'管理员':'ADMIN','仓库人员':'WAREHOUSE','营业员':'SALESPERSON'}[row.role]]));delete row.credential;}
writeFileSync('data-cleaning/verification/final-smoke-20261001/test-accounts.json',JSON.stringify({database:process.env.POSTGRES_DB,authSchema:AUTH_SCHEMA,accounts:rows},null,2));
console.log('Persisted test accounts ready',rows.map(x=>x.loginName).join(', '),hall.id);
