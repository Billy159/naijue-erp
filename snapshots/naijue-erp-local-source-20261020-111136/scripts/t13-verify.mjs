import './check-toolchain.mjs';
import assert from 'node:assert/strict';
import {createHash, randomBytes, randomUUID} from 'node:crypto';
import {chmodSync, existsSync, mkdirSync, readFileSync, utimesSync, writeFileSync} from 'node:fs';
import {isAbsolute, join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import sharp from 'sharp';
import {LocalCluster} from './t14/cluster.mjs';

const root = process.cwd();
const pg = process.env.T13_PG_BIN;
if (!pg || !isAbsolute(pg)) throw new Error('T13_PG_BIN_MUST_SELECT_LOCAL_POSTGRESQL_17');
if (Object.keys(process.env).some(key => /^(?:POSTGRES_|PGHOST$|PGPORT$|PGDATABASE$|PGUSER$|PGPASSWORD$|PGPASSFILE$|PGSERVICE$|DATABASE_URL$)/.test(key))) {
  throw new Error('T13_AMBIENT_DATABASE_CONFIGURATION_FORBIDDEN');
}
const runId = new Date().toISOString().replaceAll(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8);
const run = resolve(root, 'work/T13', runId), log = resolve(root, 'logs/T13', runId), evidenceDir = resolve(root, 'outputs/T13');
for (const path of [run, log, evidenceDir]) mkdirSync(path, {recursive: true, mode: 0o700});
const report = {task: 'T13', runId, status: 'RUNNING', databaseConnections: 0, productionConnections: 0, remoteServerOperations: 0, syntheticHttpRequests: 0,
  realBusinessDatabaseConnections: 0, checks: [], errors: []};
const cluster = new LocalCluster(root, run, pg, log, 'qa');
let app;
const record = (name, details = {}) => {report.checks.push({name, status: 'PASS', ...details});};
const failCode = response => response.json()?.error?.code;
const sha256 = value => createHash('sha256').update(value).digest('hex');
const ident = value => {if (!/^[a-z][a-z0-9_]{0,62}$/.test(value)) throw Error('T13_INVALID_IDENTIFIER'); return '"' + value + '"';};

async function login(server) {
  report.syntheticHttpRequests++;
  const response = await server.inject({method: 'POST', url: '/api/runtime/session', headers: {
    origin: 'https://erp.synthetic.test', 'content-type': 'application/json'}, payload: {loginName: 't13-admin', password: 'Synthetic-T13-Password-2026'}});
  assert.equal(response.statusCode, 200, 'synthetic administrator login');
  const cookieHeader = response.headers['set-cookie'];
  const cookie = (Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader)?.split(';', 1)[0];
  assert(cookie);
  return {cookie, csrf: response.json().data.csrfToken};
}

function request(server, session, method, url, payload) {
  report.syntheticHttpRequests++;
  const headers = {origin: 'https://erp.synthetic.test', cookie: session.cookie};
  if (method !== 'GET') {headers['content-type'] = 'application/json'; headers['x-csrf-token'] = session.csrf;}
  return server.inject({method, url, headers, ...(payload === undefined ? {} : {payload})});
}

async function tableRows(server, runtimeSchema) {
  return server.dataAccess.read(async session => (await session.query(`SELECT id::text,product_id::text,path,sha256,media_type,role,color_name,name,sort_order
    FROM ${ident(runtimeSchema)}.product_image ORDER BY id`)).rows);
}

function stagePayload(productId, requestKey, name, bytes) {
  return {productId, requestKey, declaredType: 'image/png', file: {name, base64: bytes.toString('base64')}};
}

async function stage(server, session, productId, key, name, bytes) {
  const response = await request(server, session, 'POST', `/api/media/${productId}/stage`, stagePayload(productId, key, name, bytes));
  assert.equal(response.statusCode, 200, 'stage upload: ' + response.body);
  assert.equal(response.json().data.state, 'STAGED');
  return response.json().data;
}

async function readMedia(server, session, id, purpose = 'original') {
  const response = await request(server, session, 'GET', `/api/media/${id}?purpose=${purpose}`);
  assert.equal(response.statusCode, 200, 'media read: ' + response.body);
  return response.json().data;
}

try {
  await cluster.start();
  const database = await cluster.create('t13_qa');
  const prefix = 't13_' + randomUUID().replaceAll('-', '').slice(0, 8);
  const instanceId = randomUUID();
  const appEnv = {APP_ENV: 'qa', APP_DATABASE_MODE: 'required', APP_HOST: '127.0.0.1', APP_PORT: '18879',
    POSTGRES_HOST: cluster.host, POSTGRES_PORT: String(cluster.port), POSTGRES_DB: database, POSTGRES_USER: prefix + '_app',
    POSTGRES_ROLE_PREFIX: prefix, POSTGRES_SOURCE_SCHEMA: prefix + '_source', POSTGRES_RUNTIME_SCHEMA: prefix + '_runtime',
    POSTGRES_AUTH_SCHEMA: prefix + '_auth', POSTGRES_CONTROL_SCHEMA: prefix + '_control', POSTGRES_INSTANCE_ID: instanceId,
    POSTGRES_CLUSTER_ID: cluster.clusterId, POSTGRES_SSLMODE: 'disable', SESSION_ORIGIN: 'https://erp.synthetic.test'};
  const configLoader = await import(pathToFileURL(resolve(root, 'server/database/config.ts')));
  const {bootstrapSql} = await import(pathToFileURL(resolve(root, 'server/database/bootstrap.ts')));
  const {loadMigrations, migrationSql} = await import(pathToFileURL(resolve(root, 'server/database/migrations.ts')));
  const {maintenanceSql} = await import(pathToFileURL(resolve(root, 'server/database/psql.ts')));
  const {passwordCredential} = await import(pathToFileURL(resolve(root, 'server/security/passwords.ts')));
  const {createApp} = await import(pathToFileURL(resolve(root, 'server/app.ts')));
  const {readConfig} = await import(pathToFileURL(resolve(root, 'server/config.ts')));
  const databaseConfig = configLoader.readDatabaseConfig(appEnv);
  configLoader.assertIsolatedTarget(databaseConfig);
  await cluster.systemSql(database, bootstrapSql(databaseConfig, cluster.admin));
  const migrations = loadMigrations(databaseConfig);
  await maintenanceSql(databaseConfig, databaseConfig.roles.migrator, migrationSql(databaseConfig, migrations), join(pg, 'psql'));
  record('在本地新建私有 PostgreSQL 17、qa/demo_8877 隔离库并应用当前正式迁移', {database, migrations: migrations.map(item => item.id)});

  const runtime = ident(databaseConfig.schemas.runtime), auth = ident(databaseConfig.schemas.auth);
  const userId = 't13-admin', productId = '10000000-0000-4000-8000-000000000013';
  const credential = await passwordCredential('Synthetic-T13-Password-2026');
  await cluster.systemSql(database, `INSERT INTO ${runtime}.product_overlay(id,code,body) VALUES('${productId}','SYNTHETIC-T13-PRODUCT','{}'::jsonb);
    INSERT INTO ${auth}.employee_login(id,login_name,body,password_salt,password_hash,version)
    VALUES('${userId}','t13-admin','{"name":"Synthetic Admin","role":"管理员","employmentStatus":"在职","enabled":true,"loginEnabled":true}'::jsonb,
      '${credential.salt}','${credential.hash}',1);`);

  const secret = join(run, 'session-secret.bin'); writeFileSync(secret, randomBytes(48), {mode: 0o600}); chmodSync(secret, 0o600);
  const storageBase = join(run, 'media');
  const config = readConfig({...appEnv, MEDIA_STORAGE_ROOT: storageBase, SESSION_SECRET_FILE: secret});
  app = createApp(config);
  let session = await login(app);
  const imageOne = await sharp({create: {width: 720, height: 1080, channels: 3, background: {r: 41, g: 112, b: 213}}}).png().toBuffer();
  const badBefore = await tableRows(app, databaseConfig.schemas.runtime);
  const bad = await request(app, session, 'POST', `/api/media/${productId}/stage`, stagePayload(productId, 'bad-image', 'fake.png', Buffer.from('synthetic but not an image')));
  assert.equal(bad.statusCode, 400); assert.equal(failCode(bad), 'VALIDATION');
  assert.deepEqual(await tableRows(app, databaseConfig.schemas.runtime), badBefore);
  record('损坏图像拒绝且运行态 DB 媒体表不变', {responseStatus: bad.statusCode, databaseRowsBefore: badBefore.length, databaseRowsAfter: badBefore.length});

  const first = await stage(app, session, productId, 'first-save', 'synthetic-one.png', imageOne);
  assert.equal(first.environment, 'qa');
  const save = await request(app, session, 'POST', `/api/media/${productId}/associate`,
    {mediaId: first.mediaId, role: 'main', colorName: null, sortOrder: 0});
  assert.equal(save.statusCode, 200, 'associate media: ' + save.body); assert.equal(save.json().data.state, 'ATTACHED');
  let rows = await tableRows(app, databaseConfig.schemas.runtime);
  assert.equal(rows.length, 1); assert.equal(rows[0].id, first.mediaId); assert.equal(rows[0].sha256, sha256(imageOne));
  assert.equal(rows[0].path, `objects/${sha256(imageOne).slice(0, 2)}/${sha256(imageOne)}.png`);
  const originalOne = await readMedia(app, session, first.mediaId);
  assert.equal(Buffer.from(originalOne.content, 'base64').toString('hex'), imageOne.toString('hex'));
  const thumbnailOne = await readMedia(app, session, first.mediaId, 'thumbnail');
  const thumbMeta = await sharp(Buffer.from(thumbnailOne.content, 'base64')).metadata();
  assert.equal(thumbnailOne.contentType, 'image/webp'); assert(thumbMeta.width <= 480 && thumbMeta.height <= 480);
  record('保存后 DB 哈希/路径与持久文件一致，原图和 480px 内 WebP 缩略图可读', {mediaId: first.mediaId, originalBytes: imageOne.length,
    originalSha256: sha256(imageOne), thumbnail: {width: thumbMeta.width, height: thumbMeta.height}});

  await app.close(); app = createApp(config); session = await login(app);
  const restarted = await readMedia(app, session, first.mediaId);
  assert.equal(Buffer.from(restarted.content, 'base64').toString('hex'), imageOne.toString('hex'));
  record('关闭并重建应用实例后原图仍可读', {mediaId: first.mediaId});

  const imageTwo = await sharp({create: {width: 600, height: 420, channels: 3, background: {r: 223, g: 67, b: 101}}}).png().toBuffer();
  const imageOrphan = await sharp({create: {width: 300, height: 300, channels: 3, background: {r: 71, g: 188, b: 52}}}).png().toBuffer();
  const imageBackup = await sharp({create: {width: 280, height: 360, channels: 3, background: {r: 114, g: 56, b: 192}}}).png().toBuffer();
  const imageRegistered = await sharp({create: {width: 360, height: 280, channels: 3, background: {r: 35, g: 151, b: 177}}}).png().toBuffer();
  const second = await stage(app, session, productId, 'second-replace', 'synthetic-two.png', imageTwo);
  const replaced = await request(app, session, 'PUT', `/api/media/${productId}/replace/${first.mediaId}`, {mediaId: second.mediaId});
  assert.equal(replaced.statusCode, 200, 'replace media: ' + replaced.body); assert.equal(replaced.json().data.state, 'ATTACHED');
  rows = await tableRows(app, databaseConfig.schemas.runtime);
  assert.equal(rows.length, 2);
  const historic = rows.find(row => row.id === first.mediaId), current = rows.find(row => row.id === second.mediaId);
  assert.equal(historic.role, 'history/main'); assert.equal(historic.sha256, sha256(imageOne));
  assert.equal(current.role, 'main'); assert.equal(current.sha256, sha256(imageTwo));
  assert.equal(Buffer.from((await readMedia(app, session, first.mediaId)).content, 'base64').toString('hex'), imageOne.toString('hex'));
  assert.equal(Buffer.from((await readMedia(app, session, second.mediaId)).content, 'base64').toString('hex'), imageTwo.toString('hex'));
  const retry = await request(app, session, 'PUT', `/api/media/${productId}/replace/${first.mediaId}`, {mediaId: second.mediaId});
  assert.equal(retry.statusCode, 200); assert.equal((await tableRows(app, databaseConfig.schemas.runtime)).length, 2);
  record('替换以新媒体 ID 激活，旧 DB 行/原图保留为历史；重试不会重复插入', {rows: rows.length, oldSha256: historic.sha256, newSha256: current.sha256});

  const beforeCancel = await tableRows(app, databaseConfig.schemas.runtime);
  const pending = await stage(app, session, productId, 'cancel-me', 'synthetic-cancel.png', imageOne);
  const cancel = await request(app, session, 'DELETE', `/api/media/${productId}/stage/${pending.mediaId}`, {});
  assert.equal(cancel.statusCode, 200); assert.equal(cancel.json().data.state, 'CANCELLED');
  assert.deepEqual(await tableRows(app, databaseConfig.schemas.runtime), beforeCancel);
  const cancelRetry = await request(app, session, 'POST', `/api/media/${productId}/stage`, stagePayload(productId, 'cancel-me', 'synthetic-cancel.png', imageOne));
  assert.equal(cancelRetry.statusCode, 409);
  assert.equal(Buffer.from((await readMedia(app, session, second.mediaId)).content, 'base64').toString('hex'), imageTwo.toString('hex'));
  record('取消只删除暂存副本，原有效媒体与 DB 引用不变；相同请求键不能复活已取消内容');

  const store = new (await import(pathToFileURL(resolve(root, 'server/media/store.ts')))).MediaStore(config.media);
  const orphan = await stage(app, session, productId, 'expired-orphan', 'synthetic-orphan.png', imageOrphan);
  const orphanRecord = await store.stageRecord(orphan.mediaId, userId, productId);
  const orphanStored = await store.promote(orphanRecord);
  const orphanPath = join(config.media.root, 'staging', orphan.mediaId + '.json');
  const orphanMeta = JSON.parse(readFileSync(orphanPath, 'utf8')); orphanMeta.expiresAt = new Date(0).toISOString();
  writeFileSync(orphanPath, JSON.stringify(orphanMeta) + '\n', {mode: 0o600});
  const backupMedia = await stage(app, session, productId, 'backup-pin', 'synthetic-backup.png', imageBackup);
  const backupToken = await store.stageRecord(backupMedia.mediaId, userId, productId);
  const backupStored = await store.promote(backupToken);
  const backupPath = join(config.media.root, 'staging', backupMedia.mediaId + '.json');
  const backupMeta = JSON.parse(readFileSync(backupPath, 'utf8')); backupMeta.expiresAt = new Date(0).toISOString();
  writeFileSync(backupPath, JSON.stringify(backupMeta) + '\n', {mode: 0o600});
  const registeredMedia = await stage(app, session, productId, 'registered-pin', 'synthetic-registered.png', imageRegistered);
  const registeredToken = await store.stageRecord(registeredMedia.mediaId, userId, productId);
  const registeredStored = await store.promote(registeredToken);
  const registeredPath = join(config.media.root, 'staging', registeredMedia.mediaId + '.json');
  const registeredMeta = JSON.parse(readFileSync(registeredPath, 'utf8')); registeredMeta.expiresAt = new Date(0).toISOString();
  writeFileSync(registeredPath, JSON.stringify(registeredMeta) + '\n', {mode: 0o600});
  writeFileSync(join(config.media.root, 'registered', 't07-media-index.json'), JSON.stringify({version: 1,
    records: [{sourceSha256: registeredMedia.checksum, storageKey: registeredStored.path}]}), {mode: 0o600});
  const firstPath = join(config.media.root, 'staging', first.mediaId + '.json');
  const firstMeta = JSON.parse(readFileSync(firstPath, 'utf8')); firstMeta.expiresAt = new Date(0).toISOString();
  writeFileSync(firstPath, JSON.stringify(firstMeta) + '\n', {mode: 0o600});
  const durablePaths = [orphanStored.path, orphanStored.thumbnailPath, backupStored.path, backupStored.thumbnailPath,
    registeredStored.path, registeredStored.thumbnailPath, rows.find(row => row.id === first.mediaId).path,
    `thumbnails/${first.checksum.slice(0, 2)}/${first.checksum}.webp`];
  for (const relativePath of durablePaths) {
    const path = join(config.media.root, relativePath);
    utimesSync(path, new Date(0), new Date(0));
  }
  const referenceRows = await tableRows(app, databaseConfig.schemas.runtime);
  const cleanup = await store.cleanupStaging({now: Date.now(), referencedIds: new Set(referenceRows.map(row => row.id)),
    referencedHashes: new Set(referenceRows.map(row => row.sha256)), backupHashes: new Set([backupMedia.checksum])});
  assert(cleanup.removed >= 1);
  assert.equal(existsSync(orphanPath), false);
  assert.equal(existsSync(join(config.media.root, orphanStored.path)), false);
  assert.equal(existsSync(join(config.media.root, orphanStored.thumbnailPath)), false);
  assert.equal(existsSync(firstPath), true);
  assert.equal(existsSync(backupPath), true);
  assert.equal(existsSync(registeredPath), true);
  assert.equal(existsSync(join(config.media.root, backupStored.path)), true);
  assert.equal(existsSync(join(config.media.root, backupStored.thumbnailPath)), true);
  assert.equal(existsSync(join(config.media.root, registeredStored.path)), true);
  assert.equal(existsSync(join(config.media.root, registeredStored.thumbnailPath)), true);
  assert.equal(cleanup.persistentHashesCleaned, 1);
  assert.equal(cleanup.persistentFilesRemoved, 2);
  assert.equal(sha256((await store.read(backupMedia.checksum, 'image/png', 'original')).body), backupMedia.checksum);
  assert.equal(sha256((await store.read(first.checksum, 'image/png', 'original')).body), first.checksum);
  record('过期暂存与七天前的永久孤儿可清；DB、备份及登记索引引用保留，文件哈希校验通过', cleanup);

  const otherEnvironment = {...config.media, environment: 'stage'};
  await assert.rejects(new (await import(pathToFileURL(resolve(root, 'server/media/store.ts')))).MediaStore(otherEnvironment)
    .read(first.checksum, 'image/png', 'original'), /MEDIA_ENVIRONMENT_MISMATCH/);
  record('环境标记阻止将 qa 媒体根当作 stage 根读取');
  await app.close(); app = undefined;
  await cluster.stop();
  report.status = 'PASS'; report.finishedAt = new Date().toISOString(); report.databaseConnections = 'one managed local PostgreSQL 17 instance';
} catch (error) {
  report.status = 'FAIL'; report.finishedAt = new Date().toISOString();
  report.errors.push({code: error?.message ?? 'UNKNOWN', exitCode: error?.exitCode ?? null});
  process.exitCode = 1;
} finally {
  try {await app?.close();} catch (error) {report.errors.push({code: 'APP_CLOSE_FAILED', detail: error.message}); report.status = 'FAIL';}
  try {await cluster.stop();} catch (error) {report.errors.push({code: 'CLUSTER_STOP_FAILED', detail: error.message}); report.status = 'FAIL';}
  writeFileSync(resolve(evidenceDir, 'verification.json'), JSON.stringify(report, null, 2) + '\n', {mode: 0o600});
  writeFileSync(resolve(log, 'result.json'), JSON.stringify(report, null, 2) + '\n', {mode: 0o600});
  console.log(`T13 ${report.status}; ${report.checks.length} checks; database connections=${report.databaseConnections}`);
}
