import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {authenticationComponentSettings,AUTHENTICATION_COMPONENT_SUITE} from './integration/authentication-component-settings.ts';
const settings=()=>({NODE_ENV:'test',NAIJUE_PG_INTEGRATION:'I_APPROVE_A_FRESH_DISPOSABLE_LOCAL_DATABASE',NAIJUE_PG_TEST_SUITE:AUTHENTICATION_COMPONENT_SUITE,NAIJUE_PG_TEST_DATABASE_URL:'postgresql://naijue_erp_test:synthetic-not-real@127.0.0.1:55439/naijue_erp_test_aabbccdd',NAIJUE_PG_EXPECT_DATABASE:'naijue_erp_test_aabbccdd',NAIJUE_PG_COMPONENT_DATA_DIRECTORY:'/tmp/synthetic-owned-auth-component/data'});
test('standalone authentication component retains original fresh-loopback gates and explicit own cluster path',()=>{
 assert.equal(authenticationComponentSettings(settings()).database,'naijue_erp_test_aabbccdd');
 for(const patch of [{NAIJUE_PG_TEST_SUITE:'backend-0001-0010'},{NAIJUE_PG_COMPONENT_DATA_DIRECTORY:undefined},{NAIJUE_PG_COMPONENT_DATA_DIRECTORY:'relative/data'},{NAIJUE_PG_COMPONENT_DATA_DIRECTORY:'/tmp/a/../data'},{NAIJUE_PG_TEST_DATABASE_URL:'postgresql://naijue_erp_test:synthetic-not-real@example.invalid:55439/naijue_erp_test_aabbccdd'},{NAIJUE_PG_INTEGRATION:undefined}])assert.throws(()=>authenticationComponentSettings({...settings(),...patch}));
 assert.throws(()=>authenticationComponentSettings(settings(),true),/runner/);
});
test('standalone authentication runner refuses without explicit command and has a connection-free help entry',()=>{
 for(const [args,code]of [[[],2],[['--help'],0]]as const){const result=spawnSync(process.execPath,['scripts/run-postgres-authentication-component.mjs',...args],{encoding:'utf8'});assert.equal(result.status,code,result.stderr);assert.match(result.stdout+result.stderr,/component|Refused/);}
});
test('new component never substitutes full ERP factory, metadata approval or schema patches',()=>{
 const source=readFileSync(new URL('./integration/authentication-component.ts',import.meta.url),'utf8');
 assert.match(source,/createAuthenticationHttpPlugin/);assert.match(source,/createAuthenticationPasswordWork/);assert.match(source,/createOwnedPoolCapacityAdmission/);assert.match(source,/statfs\(directory/);
 assert.doesNotMatch(source,/createPostgresReadApi|createProductionRuntime26|createNativeRuntime26Issuer|GRANT\s|ALTER\s+TABLE|CREATE\s+TABLE|quantity_before|quantity_after/);
});
