import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, rmSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {readConfig} from '../dist/server/config.js';
import {createApp} from '../dist/server/app.js';
import {readDatabaseConfig,assertIsolatedTarget} from '../dist/server/database/config.js';

const fixture = {APP_ENV:'qa', POSTGRES_HOST:'/tmp/t08-unit-socket',POSTGRES_PORT:'55488',POSTGRES_DB:'demo_8877_unit',POSTGRES_ROLE_PREFIX:'t08_unit',POSTGRES_USER:'t08_unit_app',
  POSTGRES_SOURCE_SCHEMA:'t08_source',POSTGRES_RUNTIME_SCHEMA:'t08_runtime',POSTGRES_AUTH_SCHEMA:'t08_auth',POSTGRES_CONTROL_SCHEMA:'t08_control',
  POSTGRES_INSTANCE_ID:'34f8764a-782b-4454-8375-b647e194983e',POSTGRES_CLUSTER_ID:'7691754635362465003'};

test('all database targets, layers, roles and environment identities are explicit', () => {
  assert.throws(()=>readDatabaseConfig({}),/REQUIRED/);
  for(const key of Object.keys(fixture)) assert.throws(()=>readDatabaseConfig({...fixture,[key]:undefined}),/REQUIRED/);
  for(const POSTGRES_DB of ['postgres service=x', 'postgres;drop_database', 'PG_CASE', 'pg_system', 'a'.repeat(64)]) assert.throws(()=>readDatabaseConfig({...fixture,POSTGRES_DB}));
  for(const POSTGRES_USER of ['billy','postgres','t08_unit_migrator']) assert.throws(()=>readDatabaseConfig({...fixture,POSTGRES_USER}),/APPLICATION_ROLE/);
  assert.throws(()=>readDatabaseConfig({...fixture,POSTGRES_AUTH_SCHEMA:fixture.POSTGRES_RUNTIME_SCHEMA}),/DISTINCT/);
  assert.throws(()=>readDatabaseConfig({...fixture,POSTGRES_SOURCE_SCHEMA:'public'}),/DISTINCT/);
  assert.throws(()=>readDatabaseConfig({...fixture,POSTGRES_INSTANCE_ID:'not-an-id'}),/IDENTITY/);
  assert.throws(()=>readDatabaseConfig({...fixture,POSTGRES_HOST:'localhost'}),/TCP_REQUIRES/);
  assert.equal(readDatabaseConfig({...fixture,POSTGRES_HOST:'db',POSTGRES_PASSFILE:'/external/passfile',POSTGRES_SSLMODE:'disable'}).sslmode,'disable');
  assert.throws(()=>readDatabaseConfig({...fixture,POSTGRES_PASSWORD:'never-accepted'}),/PASSFILE/);
});

test('maintenance refuses production and business databases before any connection', () => {
  for(const extra of [{APP_ENV:'production'}, {POSTGRES_DB:'business_management'}, {POSTGRES_DB:'postgres'}]) {
    const env={...fixture,...extra};
    assert.throws(()=>assertIsolatedTarget(readDatabaseConfig(env)),/ISOLATED_DATABASE_REQUIRED/);
    const result=spawnSync(process.execPath,['scripts/database.mjs','bootstrap'],{env:{PATH:process.env.PATH,...env,PSQL_BIN:'/nonexistent-do-not-connect'},encoding:'utf8'});
    assert.equal(result.status,1); assert.equal(result.stdout,''); assert.match(result.stderr,/^ISOLATED_DATABASE_REQUIRED\n$/);
  }
});

test('disabled foundation and configured HTTP paths never migrate or seed identities', async t => {
  const base=resolve('logs/T14');mkdirSync(base,{recursive:true});
  const mediaRoot=mkdtempSync(join(base,'database-config-media-'));
  t.after(()=>rmSync(mediaRoot,{recursive:true,force:true}));
  assert.equal(readConfig({MEDIA_STORAGE_ROOT:mediaRoot}).database,null);
  assert.throws(()=>readConfig({APP_ENV:'production'}),/POSTGRES_HOST_REQUIRED/);
  assert.throws(()=>readConfig({APP_DATABASE_MODE:'disabled',POSTGRES_DB:'demo_8877_unit'}),/DISABLED_DATABASE/);
  const app=createApp(readConfig({...fixture,MEDIA_STORAGE_ROOT:mediaRoot}));
  try {
    assert.equal((await app.inject('/api/health')).json().businessReady,false);
    for(const path of ['/api/migrate','/api/initialize','/runtime/command','/api/login']) {
      assert.equal((await app.inject({method:'POST',url:path,payload:{actorId:'local-admin'}})).statusCode,404);
    }
  } finally {await app.close();}
});
