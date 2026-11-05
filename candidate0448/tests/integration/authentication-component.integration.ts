/** Separate real-PG component; deliberately absent from ordinary npm test/check. */
import test from 'node:test';
import {authenticationComponentSettings} from './authentication-component-settings.ts';
import {openFreshDatabase} from './database.ts';
import {runAuthenticationComponent} from './authentication-component.ts';
test('REAL PostgreSQL standalone authentication component; not ERP runtime acceptance',{timeout:120000},async t=>{
 const settings=authenticationComponentSettings(process.env,true);
 const database=await openFreshDatabase(settings);
 t.after(()=>database.close());
 await runAuthenticationComponent(t,database.pool,settings);
});
