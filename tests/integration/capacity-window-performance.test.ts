/** A02 finite REAL-QA entry for T45. Inert on import; no fixture, pool, secret,
 * approval or server is created until an approved host explicitly invokes it.
 * Uses real factories/pg/Sharp and independently observes original counters.
 * Host must privately retain returned measurements. No credentials are returned.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {lstat, readFile, realpath, readdir} from 'node:fs/promises';
import {isAbsolute, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {setTimeout as pause} from 'node:timers/promises';
import {Pool} from 'pg';
import {request as httpRequest} from 'node:http';
import type {PostgresPoolDriverFactory} from '../../adapters/postgres/src/bounded-pool.ts';
import type {NativeRuntime26Issuer} from '../../adapters/postgres/src/native-import-accounting-capability.ts';
import {checkedNativeRuntime26Capability} from '../../packages/application/src/native-import-schema-contract.ts';
import {productImageCodecSnapshot} from '../../adapters/media/src/sharp-product-image-codec.ts';
import {createOwnedPoolCapacityAdmission} from '../../apps/api/src/capacity-runtime-probe.ts';
import type {OwnedPoolCapacityOptions} from '../../apps/api/src/capacity-runtime-probe.ts';
import type {ObservableCapacityAdmission} from '../../apps/api/src/capacity-admission.ts';
import {CAPACITY_VOLUMES, CapacityAdmissionRejected} from '../../apps/api/src/capacity-admission.ts';
import {parseProductionRuntime26R3Configuration, createProductionRuntime26R3ApplicationApi,
  createProductionRuntime26FullApplicationApi} from '../../apps/api/src/production-provider-composition.ts';
import {readProductionStaffCredentialRequestTag} from '../../apps/api/src/production-main.ts';
import type {PostgresApplicationApi} from '../../apps/api/src/postgres-read-api.ts';
import {CURRENT_SALES_QA_TARGET} from './current-runtime26-sales-fixture.ts';

interface Pin {readonly path: string; readonly sha256: string}
interface Limits {
  readonly loginSamples: number; readonly readSamples: number; readonly cancelUploads: number;
  readonly settleMillis: number; readonly pollMillis: number; readonly expiryWaitMaxMillis: number;
  readonly inventory: {readonly concurrency: number; readonly maxEntries: number; readonly maxDepth: number; readonly maxDurationMillis: number};
}
interface Slo {
  readonly loginP95Millis: number; readonly loginP99Millis: number; readonly uploadMillis: number;
  readonly readP95Millis: number; readonly readP99Millis: number; readonly acquireMaxMillis: number;
  readonly rssGrowthBytes: number; readonly fdGrowth: number; readonly cpuMicros: number;
  readonly sessionRelationBytesPerSession: string; readonly walBytesPerSession: string;
  readonly mediaAllocationBytesPerUpload: string;
}
export interface CapacityWindowPerformanceContext {
  readonly authorization: 'CONFIRMED_QA897_A02_WINDOW';
  readonly selector: 'R3' | 'Full'; readonly configuration: unknown; readonly sourceCommit: string;
  readonly issuer: NativeRuntime26Issuer;
  readonly target: {readonly databaseOid: '21551'; readonly runtimeRole: string; readonly postmasterStart: string};
  readonly publication: {readonly batchId: string; readonly sourceHash: string; readonly historyPayloadHash: string};
  readonly privateScenario: Pin;
  readonly image: Pin & {readonly mime: 'image/png' | 'image/jpeg' | 'image/webp'};
  readonly keyAuthorization?: {readonly approved: true; readonly canonicalFile: string};
  /** Approved clock/facts/window/budgets, never test-created KNOWN/free-space. */
  readonly normal: OwnedPoolCapacityOptions;
  readonly lowWater: OwnedPoolCapacityOptions;
  readonly expiry: OwnedPoolCapacityOptions;
  readonly limits: Limits; readonly slo: Slo;
  readonly fdDirectory: '/proc/self/fd' | '/dev/fd';
  /** Explicit approved PRIVATE test listener, never public/port0 discovery. */
  readonly loopback: {readonly approved: true; readonly host: '127.0.0.1'; readonly port: number};
}
interface Scenario {
  readonly syntheticOnly: true; readonly loginName: string; readonly password: string;
  readonly productId: string; readonly existingMediaUrl: string; readonly existingMediaSha256: string;
  readonly uploads: readonly {readonly commandKey: string; readonly uploadKey: string}[];
}
interface Inventory {
  readonly postgres: {readonly bytes: {readonly total_relation_bytes: string; readonly database_bytes: string}};
  readonly media: readonly {readonly allocatedBytes: string}[];
  readonly status: string;
}
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const integer = (n: number, min = 1) => Number.isSafeInteger(n) && n >= min;
const decimal = (s: unknown): s is string => typeof s === 'string' && /^(?:0|[1-9]\d*)$/.test(s);
const lsn = (s: string) => {assert.ok(/^[0-9A-F]+\/[0-9A-F]+$/i.test(s), 'Actual WAL LSN required'); const [a,b] = s.split('/'); return (BigInt('0x'+a!) << 32n) + BigInt('0x'+b!);};
const percentile = (samples: number[], p: number) => {assert.ok(samples.length > 0); return [...samples].sort((a,b) => a-b)[Math.ceil(samples.length*p)-1]!;};
const ceil = (n: bigint, divisor: number) => n <= 0n ? n : (n + BigInt(divisor) - 1n) / BigInt(divisor);
async function pinned(pin: Pin, max: number, privateOnly: boolean): Promise<Buffer> {
  try {
    assert.ok(isAbsolute(pin.path) && resolve(pin.path) === pin.path && await realpath(pin.path) === pin.path && /^[a-f0-9]{64}$/.test(pin.sha256));
    const a = await lstat(pin.path);
    assert.ok(a.isFile() && !a.isSymbolicLink() && a.size > 0 && a.size <= max
      && (!privateOnly || a.uid === process.getuid?.() && (a.mode & 0o077) === 0));
    const b = await readFile(pin.path), z = await lstat(pin.path);
    assert.ok(a.dev === z.dev && a.ino === z.ino && a.mtimeMs === z.mtimeMs && a.ctimeMs === z.ctimeMs && a.size === z.size
      && b.length === a.size && sha(b) === pin.sha256); return b;
  } catch {throw Error('A02 approved pinned input unavailable; no private details exported');}
}
/** Actual driver under the owned bounded pool, forwards all queries/results.
 * Measures native acquisition wait/leases; does not claim the internal bounded
 * scheduler queue is a driver queue or manufacture a successful result.
 */
function driverObservation() {
  let allocations = 0, pending = 0, active = 0, acquireMaxMillis = 0, storageReads = 0;
  const driver: PostgresPoolDriverFactory = config => {
    allocations++; const pool = new Pool(config);
    return {on: (event, listener) => pool.on(event, listener), end: () => pool.end(), async connect() {
      pending++; const at = performance.now();
      try {
        const client = await pool.connect(); active++; let released = false;
        return {on: (event, listener) => client.on(event, listener), removeListener: (event, listener) => client.removeListener(event, listener),
          async query(sql, values) {const result=await client.query(sql,values);if(sql.includes('/* capacity-inventory:storage */'))storageReads++;return result;}, release(error) {if (released) throw Error('A02 duplicate driver release');
            client.release(error); released = true; active--;}};
      } finally {pending--; acquireMaxMillis = Math.max(acquireMaxMillis, performance.now()-at);}
    }};
  };
  return {driver, snapshot: () => Object.freeze({allocations, pending, active, acquireMaxMillis, storageReads})};
}
async function until(condition: () => boolean | Promise<boolean>, limits: Limits): Promise<void> {
  const until = performance.now() + limits.settleMillis;
  while (!await condition()) {assert.ok(performance.now() < until, 'Actual resource settle deadline exceeded'); await pause(limits.pollMillis);}
}
/** No injected readiness, codec, authorization, COMMIT or measurement callbacks. */
async function host(context: CapacityWindowPerformanceContext) {
  assert.ok(context?.authorization === 'CONFIRMED_QA897_A02_WINDOW', 'A02 original approved QA host required');
  const c = parseProductionRuntime26R3Configuration(context.configuration), limits = structuredClone(context.limits), slo = structuredClone(context.slo);
  assert.ok(c.postgres.target.database === CURRENT_SALES_QA_TARGET && context.target.databaseOid === '21551'
    && c.postgres.target.user === context.target.runtimeRole && c.build.sourceCommit === context.sourceCommit,
  'Registered QA897/OID21551 and frozen source/actual runtime required');
  assert.ok(context.selector === 'R3' || context.selector === 'Full');
  assert.ok(c.staffMaintenance!==true || context.keyAuthorization?.approved === true && c.staffCredentialRequestKeyFile === context.keyAuthorization.canonicalFile,
    'Staff-selected host requires owner-authorized private credential key; unselected staff does not read a key');
  assert.ok(limits && limits.inventory && [limits.loginSamples,limits.readSamples,limits.settleMillis,limits.pollMillis,limits.expiryWaitMaxMillis,
    limits.inventory.concurrency,limits.inventory.maxEntries,limits.inventory.maxDepth,limits.inventory.maxDurationMillis].every(n => integer(n)) && limits.loginSamples >= 2 && limits.loginSamples <= 20
    && limits.readSamples >= 2 && limits.readSamples <= 20 && [2,3].includes(limits.cancelUploads)
    && limits.settleMillis <= 30000 && limits.expiryWaitMaxMillis <= 30000 && limits.pollMillis <= limits.settleMillis,
  'Explicit finite representative sample/settle limits required');
  assert.ok(slo && [slo.loginP95Millis,slo.loginP99Millis,slo.uploadMillis,slo.readP95Millis,slo.readP99Millis,slo.acquireMaxMillis,
    slo.rssGrowthBytes,slo.fdGrowth,slo.cpuMicros].every(v=>integer(v,0))
    && [slo.sessionRelationBytesPerSession,slo.walBytesPerSession,slo.mediaAllocationBytesPerUpload].every(decimal)
    && slo.loginP95Millis > 0 && slo.loginP99Millis > 0 && slo.uploadMillis > 0 && slo.readP95Millis > 0 && slo.readP99Millis > 0,
  'All growth/resource/SLO thresholds required BEFORE measuring');
  const normalWindow=structuredClone(context.normal?.window),uploadCost=structuredClone(context.normal?.budgets?.upload?.worstCaseBytes);
  const inputs=[context.normal,context.lowWater,context.expiry];
  assert.ok(inputs.every(v=>v?.window?.approved && v.runtimeProbe?.target?.database===CURRENT_SALES_QA_TARGET
    && v.runtimeProbe.target.databaseOid==='21551' && v.runtimeProbe.target.role===context.target.runtimeRole
    && v.runtimeProbe.target.postmasterStart===context.target.postmasterStart)
    && new Set(inputs.map(v=>v.window!.token)).size===3,'All three exact independently approved representative windows required before any write');
  assert.ok(context.normal.budgets.session.maxAdmissions>=limits.loginSamples+1
    && context.normal.budgets.upload.maxAdmissions>=limits.cancelUploads+2 && context.normal.budgets.upload.maxInFlight>=limits.cancelUploads,
  'Approved finite representative workload must fit the existing window budget; never adjust it after measuring');
  // Construct once before measuring: each original component validates/captures
  // its exact budgets/TTL/facts contract. Never reset/recreate a used window.
  const prepared=inputs.map(options=>({options,value:createOwnedPoolCapacityAdmission(options)}));
  assert.ok(context.fdDirectory === '/proc/self/fd' || context.fdDirectory === '/dev/fd');
  assert.ok(context.loopback?.approved===true && context.loopback.host==='127.0.0.1' && integer(context.loopback.port)
    && context.loopback.port<=65535,'Exact owner-approved private loopback host/port required');
  const loopback=structuredClone(context.loopback);
  assert.ok(['image/png','image/jpeg','image/webp'].includes(context.image?.mime) && limits.inventory.concurrency<=limits.inventory.maxEntries,
    'Exact supported real image and bounded inventory inputs required');
  const runtime = checkedNativeRuntime26Capability(context.issuer?.runtime26); assert.ok(runtime && context.issuer.pool, 'Original genuine actual issuer required');
  const read = async (sql: string, values: unknown[] = []) => {
    const client = await context.issuer.pool.connect();
    try {await runtime.assertReady(client,'PRODUCT_MAINTENANCE'); return (await client.query(sql,values)).rows;}
    finally {client.release();}
  };
  const identity = (await read(`SELECT current_database() db,current_user role,session_user,
    (SELECT oid::text FROM pg_catalog.pg_database WHERE datname=current_database()) oid,pg_postmaster_start_time()::text started,
    (SELECT rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb FROM pg_catalog.pg_roles WHERE rolname=current_user) elevated,
    (SELECT pg_catalog.pg_get_userbyid(datdba)=current_user FROM pg_catalog.pg_database WHERE datname=current_database()) owns_db,
    (SELECT pg_catalog.pg_get_userbyid(nspowner)=current_user FROM pg_catalog.pg_namespace WHERE nspname='naijue_erp') owns_schema,
    EXISTS(SELECT 1 FROM pg_catalog.pg_class WHERE relnamespace='naijue_erp'::regnamespace AND relowner=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user)) owns_relation`))[0];
  assert.ok(identity && identity.db === CURRENT_SALES_QA_TARGET && identity.oid === '21551' && identity.role === context.target.runtimeRole
    && identity.session_user === identity.role && identity.started === context.target.postmasterStart && identity.elevated === false
    && identity.owns_db === false && identity.owns_schema === false && identity.owns_relation === false, 'Actual nonowner original role and process must match approved QA');
  const p = context.publication, published = await read('SELECT status,source_hash,history_payload_hash,history_validation_passed FROM naijue_erp.import_batch WHERE id=$1::uuid',[p.batchId]);
  assert.ok(published.length === 1 && published[0]!.status === 'IMPORTED' && published[0]!.source_hash === p.sourceHash
    && published[0]!.history_payload_hash === p.historyPayloadHash && published[0]!.history_validation_passed === true,
  'Original complete source import/PUBLISH/typed readback required; no STAGED maintenance');
  let s: Scenario;
  try {s = JSON.parse((await pinned(context.privateScenario,65536,true)).toString('utf8')) as Scenario;
    assert.ok(s.syntheticOnly === true && typeof s.loginName === 'string' && typeof s.password === 'string'
      && /^[0-9a-f-]{36}$/i.test(s.productId) && /^\/products\/media\/[A-Za-z0-9_/-]+$/.test(s.existingMediaUrl)
      && /^[a-f0-9]{64}$/.test(s.existingMediaSha256) && s.uploads.length >= limits.cancelUploads + 4
      && s.uploads.every(v => /^[A-Za-z0-9._:-]{1,128}$/.test(v.commandKey) && /^[A-Za-z0-9._:-]{1,128}$/.test(v.uploadKey))
      && new Set(s.uploads.map(v => v.uploadKey)).size === s.uploads.length
      && new Set(s.uploads.map(v => v.commandKey)).size === s.uploads.length);
  } catch {throw Error('A02 exact owner-private synthetic fixture missing or invalid');}
  const image = await pinned(context.image,8388608,false), observation = driverObservation();
  const resources = async () => ({rssBytes: process.memoryUsage().rss, fd: (await readdir(context.fdDirectory)).length, cpu: process.cpuUsage()});
  const inventoryModule = await import(new URL('../../scripts/ops/capacity-inventory.mjs',import.meta.url).href) as {
    inventoryCapacity(input: unknown, dependencies: unknown): Promise<Inventory>};
  const inventory = async () => {
    const result = await inventoryModule.inventoryCapacity({postgres:c.postgres,expected:{database:CURRENT_SALES_QA_TARGET,
      databaseOid:'21551',role:context.target.runtimeRole,postmasterStart:context.target.postmasterStart},limits:limits.inventory,
      mediaRoots:[{key:'A02_QA_ONLY',path:c.productMedia.root}]},{pool:context.issuer.pool});
    assert.ok(result.status === 'OBSERVED' && result.media.length === 1 && decimal(result.media[0]!.allocatedBytes), 'Actual bounded filesystem/PG inventory required');
    const rows = await read(`SELECT (SELECT count(*)::text FROM naijue_erp.auth_session) sessions,pg_current_wal_lsn()::text wal_lsn`);
    assert.ok(rows.length === 1 && decimal(rows[0]!.sessions) && typeof rows[0]!.wal_lsn === 'string', 'Actual session/WAL observation privileges required');
    return {sessionBytes:BigInt(result.postgres.bytes.total_relation_bytes),databaseBytes:BigInt(result.postgres.bytes.database_bytes),
      mediaBytes:BigInt(result.media[0]!.allocatedBytes),sessions:BigInt(String(rows[0]!.sessions)),wal:lsn(String(rows[0]!.wal_lsn))};
  };
  let api: PostgresApplicationApi | undefined, admission: ObservableCapacityAdmission | undefined;
  const open = async (options: OwnedPoolCapacityOptions) => {
    assert.ok(!api, 'Previous actual factory must close before rebuilding');
    admission = prepared.find(v=>v.options===options)?.value;assert.ok(admission && !admission.snapshot().closed,'Only original prepared unused window resource may open');
    const before=observation.snapshot().allocations;
    const tag = await readProductionStaffCredentialRequestTag(c);
    api = context.selector === 'Full' ? await createProductionRuntime26FullApplicationApi(c,observation.driver,tag,admission)
      : await createProductionRuntime26R3ApplicationApi(c,observation.driver,tag,undefined,admission);
    assert.ok(observation.snapshot().allocations===before+1,'Each actual factory must own exactly one pool');
    await api.app.listen({host:loopback.host,port:loopback.port});
  };
  const close = async () => {try {await api?.close();} finally {admission?.close(); api=undefined;}};
  const finish = async () => {try {await close();} finally {for(const v of prepared)v.value.close();}};
  const login = () => api!.app.inject({method:'POST',url:'/auth/login',headers:{origin:c.publicOrigin,'content-type':'application/json'},payload:{loginName:s.loginName,password:s.password}});
  const cookie = (response: Awaited<ReturnType<typeof login>>) => {assert.ok(response.statusCode === 200,'Actual login required');
    const header=response.headers['set-cookie']; assert.ok(typeof header === 'string' && header.startsWith('__Host-naijue_session=')); return header.split(';')[0]!;};
  const upload = (index: number, session: string, signal?: AbortSignal) => api!.app.inject({method:'POST',url:'/products/media/uploads',
    headers:{origin:c.publicOrigin,cookie:session,'content-type':context.image.mime,'x-product-id':s.productId,
      'x-command-key':s.uploads[index]!.commandKey,'x-upload-key':s.uploads[index]!.uploadKey},payload:image,...(signal ? {signal} : {})});
  const cancellableUpload = (index: number, session: string, signal: AbortSignal) => new Promise<number>(resolve=>{
    const req=httpRequest({host:loopback.host,port:loopback.port,method:'POST',path:'/products/media/uploads',agent:false,signal,
      headers:{origin:c.publicOrigin,cookie:session,'content-type':context.image.mime,'content-length':image.length,'x-product-id':s.productId,
        'x-command-key':s.uploads[index]!.commandKey,'x-upload-key':s.uploads[index]!.uploadKey}},response=>{
      response.resume();response.once('end',()=>resolve(response.statusCode??0));response.once('error',()=>resolve(0));});
    req.once('error',()=>resolve(0));req.end(image);
  });
  const settled = () => {const a=admission!.snapshot(), codec=productImageCodecSnapshot(), pg=observation.snapshot();
    return a.active.session === 0 && a.active.upload === 0 && !a.probe.inFlight && a.probe.waiters === 0 && codec.active === 0 && codec.queued === 0 && pg.pending === 0 && pg.active === 0;};
  const readMeasurements: {p95Millis:number;p99Millis:number}[]=[];
  const reads = async (session: string) => {
    const times: number[]=[];
    for(let i=0;i<limits.readSamples;i++) {const at=performance.now();
      const resolved=await api!.app.inject({url:'/auth/session',headers:{cookie:session}});
      assert.ok(resolved.statusCode === 200 && resolved.json<{principal:unknown}>().principal, 'Existing session must remain usable');
      const media=await api!.app.inject({url:s.existingMediaUrl,headers:{cookie:session}});
      assert.ok(media.statusCode === 200 && sha(media.rawPayload) === s.existingMediaSha256,'Existing controlled image must remain readable'); times.push(performance.now()-at);}
    const measured={p95Millis:percentile(times,.95),p99Millis:percentile(times,.99)};readMeasurements.push(measured);
    assert.ok(measured.p95Millis<=slo.readP95Millis && measured.p99Millis<=slo.readP99Millis,'Existing read SLO exceeded');
    return measured;
  };
  return {c,limits,slo,normalWindow,uploadCost,readMeasurements,observation,read,inventory,resources,open,close,finish,login,cookie,upload,cancellableUpload,settled,reads,
    get api(){return api!;},get admission(){return admission!;}};
}

export async function runCapacityWindowPerformance(context: CapacityWindowPerformanceContext) {
  assert.ok(context?.authorization === 'CONFIRMED_QA897_A02_WINDOW','A02 original approved QA host required');
  let phase='A02-01-PREFLIGHT',failure:Error|undefined; const h=await host(context),measurements:Record<string,unknown>={};
  try {
    phase='A02-02-NORMAL-HOST';await h.open(context.normal);const session=h.cookie(await h.login());
    assert.ok(h.observation.snapshot().storageReads>0,'Actual storage probe must run on this factory owned pool');
    const baselineReads=await h.reads(session);await until(h.settled,h.limits);
    const beforeResource=await h.resources(),before=await h.inventory(),latencies:number[]=[];
    phase='A02-03-REAL-PG-SESSION-UNIT-GROWTH';
    for(let i=0;i<h.limits.loginSamples;i++){const at=performance.now();h.cookie(await h.login());latencies.push(performance.now()-at);}
    await until(h.settled,h.limits);const afterSessions=await h.inventory();
    assert.ok(afterSessions.sessions-before.sessions === BigInt(h.limits.loginSamples),'Actual session count must equal successful issuance; exclusive QA required');
    const unitSession=ceil(afterSessions.sessionBytes-before.sessionBytes,h.limits.loginSamples),unitWal=ceil(afterSessions.wal-before.wal,h.limits.loginSamples);
    measurements.session={samples:latencies.length,p95Millis:percentile(latencies,.95),p99Millis:percentile(latencies,.99),
      relationBytesPerSession:unitSession.toString(),walBytesPerSession:unitWal.toString(),databaseDeltaBytes:(afterSessions.databaseBytes-before.databaseBytes).toString()};
    assert.ok(unitSession>=0n && unitSession<=BigInt(h.slo.sessionRelationBytesPerSession) && unitWal>=0n && unitWal<=BigInt(h.slo.walBytesPerSession),'Actual PG growth bound exceeded');
    assert.ok(context.normal.budgets.session.worstCaseBytes.postgres>=unitSession && context.normal.budgets.session.worstCaseBytes.wal>=unitWal,
      'Original approved per-session budget must cover measured native relation/index and WAL demand');
    assert.ok(percentile(latencies,.95)<=h.slo.loginP95Millis && percentile(latencies,.99)<=h.slo.loginP99Millis,'Actual issuance SLO exceeded');
    phase='A02-04-REAL-CODEC-UPLOAD-GROWTH';const at=performance.now(),uploaded=await h.upload(0,session);
    assert.ok(uploaded.statusCode === 200 && uploaded.json<{uploadId:string}>().uploadId,'Original real codec/stage upload must finish');
    const uploadMillis=performance.now()-at;measurements.uploadMillis=uploadMillis;assert.ok(uploadMillis<=h.slo.uploadMillis,'Actual codec/upload SLO exceeded');
    await until(h.settled,h.limits);const afterUpload=await h.inventory();
    measurements.uploadAllocatedBytes=(afterUpload.mediaBytes-afterSessions.mediaBytes).toString();
    assert.ok(afterUpload.mediaBytes>afterSessions.mediaBytes && afterUpload.mediaBytes-afterSessions.mediaBytes<=BigInt(h.slo.mediaAllocationBytesPerUpload),'Actual original/thumbnail/manifest allocation must be measured and bounded');
    assert.ok(h.uploadCost.media>=afterUpload.mediaBytes-afterSessions.mediaBytes,'Original worst-case upload budget must cover actual original/thumbnail/manifest allocation');
    phase='A02-05-ACCEPTED-UPLOAD-CANCELLATION';const charged=h.admission.snapshot(),controllers=Array.from({length:h.limits.cancelUploads},()=>new AbortController());
    const pending=controllers.map((controller,i)=>h.cancellableUpload(i+1,session,controller.signal));let cancelledStatuses:number[]=[];
    try {await until(()=>{const a=h.admission.snapshot(),codec=productImageCodecSnapshot();return a.admitted.upload-charged.admitted.upload===controllers.length
        && codec.active===1 && codec.queued===controllers.length-1;},h.limits);}
    finally {for(const controller of controllers)controller.abort();cancelledStatuses=await Promise.all(pending);await until(h.settled,h.limits);}
    measurements.cancelledStatuses=cancelledStatuses;
    assert.ok(cancelledStatuses.every(code=>code===0 || code===408),'Actual accepted cancellation must interrupt transport or return original abort status');
    const cancelled=h.admission.snapshot();assert.ok(cancelled.admitted.upload-charged.admitted.upload===controllers.length,'Every cancelled representative must actually have been admitted');
    measurements.cancellation={statuses:cancelledStatuses,admitted:cancelled.admitted.upload-charged.admitted.upload,active:cancelled.active,probe:cancelled.probe,
      chargedByteDeltas:Object.fromEntries(CAPACITY_VOLUMES.map(v=>[v,(cancelled.chargedBytes[v]-charged.chargedBytes[v]).toString()]))};
    for(const v of CAPACITY_VOLUMES)assert.ok(cancelled.chargedBytes[v]-charged.chargedBytes[v]===h.uploadCost[v]*BigInt(controllers.length),'Cancelled work cannot refund original window bytes');
    const afterCancellation=await h.inventory(),recovered=await h.upload(controllers.length+1,session);assert.ok(recovered.statusCode===200,'Real codec/FD/PG resources must remain usable after native work settles');
    await until(async()=>h.settled() && (await h.resources()).fd-beforeResource.fd<=h.slo.fdGrowth,h.limits);
    const afterResource=await h.resources(),pg=h.observation.snapshot();
    measurements.resources={before:beforeResource,after:afterResource,driver:pg,codec:productImageCodecSnapshot()};
    assert.ok(afterResource.rssBytes-beforeResource.rssBytes<=h.slo.rssGrowthBytes && afterResource.fd-beforeResource.fd<=h.slo.fdGrowth
      && afterResource.cpu.user-beforeResource.cpu.user+afterResource.cpu.system-beforeResource.cpu.system<=h.slo.cpuMicros
      && pg.acquireMaxMillis<=h.slo.acquireMaxMillis,'Actual bounded resource/acquisition SLO exceeded');
    const processEvidence={pid:process.pid,timeOrigin:performance.timeOrigin};await h.close();
    phase='A02-06-ACTUAL-LOW-WATER';await h.open(context.lowWater);
    for(const kind of ['session','upload'] as const)await assert.rejects(h.admission.acquire(kind),e=>e instanceof CapacityAdmissionRejected && e.reason==='LOW_WATER');
    const lowLogin=await h.login(),lowUpload=await h.upload(controllers.length+2,session);
    measurements.lowWaterStatus={login:lowLogin.statusCode,upload:lowUpload.statusCode};
    assert.ok(lowLogin.statusCode===503 && !lowLogin.headers['set-cookie'] && lowUpload.statusCode===503
      && lowLogin.json<{error:{code:string}}>().error.code==='CAPACITY_ADMISSION_UNAVAILABLE'
      && lowUpload.json<{error:{code:string}}>().error.code==='CAPACITY_ADMISSION_UNAVAILABLE'
      && lowLogin.headers['retry-after']===String(context.lowWater.retryAfterSeconds) && lowUpload.headers['retry-after']===String(context.lowWater.retryAfterSeconds),
    'Actual approved low-water floor must reject both original issuance paths');
    const lowWaterReads=await h.reads(session);await h.close();
    phase='A02-07-REAL-TIME-WINDOW-EXPIRY';await h.open(context.expiry);h.cookie(await h.login());
    const remaining=context.expiry.window!.expiresAt-context.expiry.now();assert.ok(remaining>=0 && remaining<=h.limits.expiryWaitMaxMillis,'Explicit bounded shortened expiry scenario required');
    await pause(remaining+1);
    for(const kind of ['session','upload'] as const)await assert.rejects(h.admission.acquire(kind),e=>e instanceof CapacityAdmissionRejected && e.reason==='WINDOW_EXPIRED');
    const expiredLogin=await h.login(),expiredUpload=await h.upload(controllers.length+3,session);
    measurements.expiredStatus={login:expiredLogin.statusCode,upload:expiredUpload.statusCode};
    assert.ok(expiredLogin.statusCode===503 && !expiredLogin.headers['set-cookie'] && expiredUpload.statusCode===503
      && expiredLogin.json<{error:{code:string}}>().error.code==='CAPACITY_ADMISSION_UNAVAILABLE'
      && expiredUpload.json<{error:{code:string}}>().error.code==='CAPACITY_ADMISSION_UNAVAILABLE','Expired window cannot auto-renew issuance/upload');
    const expiredReads=await h.reads(session);
    const logout=await h.api.app.inject({method:'POST',url:'/auth/logout',headers:{origin:h.c.publicOrigin,cookie:session,'content-type':'application/json'},payload:{}});
    assert.ok(logout.statusCode===204,'Actual logout/revocation must work after expiry');await until(h.settled,h.limits);
    return {status:'WINDOW_CASES_MEASURED_PHYSICAL_RESTART_PENDING' as const,sourceCommit:context.sourceCommit,databaseOid:'21551',processEvidence,
      normalWindow:h.normalWindow!,
      login:{samples:latencies.length,p95Millis:percentile(latencies,.95),p99Millis:percentile(latencies,.99)},uploadMillis,
      growth:{sessionRelationBytesPerSession:unitSession.toString(),walBytesPerSession:unitWal.toString(),databaseDeltaBytes:(afterSessions.databaseBytes-before.databaseBytes).toString(),
        uploadAllocatedBytes:(afterUpload.mediaBytes-afterSessions.mediaBytes).toString(),cancellationAllocatedDeltaBytes:(afterCancellation.mediaBytes-afterUpload.mediaBytes).toString()},
      resources:{before:beforeResource,after:afterResource,driver:pg,codec:productImageCodecSnapshot()},cancellation:measurements.cancellation,baselineReads,lowWaterReads,expiredReads,
      scope:'Actual API/native codec+PG; cancellation uses an explicitly approved private TCP listener and disconnect. Timings otherwise use server inject. Physical relation allocation is page-quantized and may be zero for this finite sample, not zero per-row/worst-case growth. WAL is whole-database concurrent observation, not causal attribution. Driver waits exclude private bounded scheduler queue. No production/public-proxy SLO claim.',
      remaining:['T45 actual process restart with prior pinned result and separately approved new inventory/window/token; same-process factory rebuild is not physical restart']};
  } catch {failure=Object.assign(Error(`A02 real QA failed at ${phase}; subsequent checks NOT_EXECUTED; no private inputs exported`),
    {status:'FAILED',phase,measurements:structuredClone({...measurements,reads:h.readMeasurements})});throw failure;}
  finally {try{await h.finish();}catch{if(failure)Object.assign(failure,{cleanupUnconfirmed:true});else throw Error('A02 cleanup unconfirmed after measured cases; no acceptance');}}
}

/** T45 invokes in a genuinely NEW process after retaining/pinning the previous
 * result above. No spawn/approval platform or automatic next window is created.
 */
export async function runCapacityPhysicalRestart(context: CapacityWindowPerformanceContext, previous: Pin) {
  assert.ok(context?.authorization==='CONFIRMED_QA897_A02_WINDOW','A02 original approved QA host required');
  let prior: Awaited<ReturnType<typeof runCapacityWindowPerformance>>;
  try {prior=JSON.parse((await pinned(previous,65536,true)).toString('utf8')) as typeof prior;}
  catch {throw Error('A02 original pinned process measurement unavailable');}
  assert.ok(prior.status==='WINDOW_CASES_MEASURED_PHYSICAL_RESTART_PENDING' && prior.databaseOid==='21551'
    && prior.sourceCommit===context.sourceCommit && (prior.processEvidence.pid!==process.pid || prior.processEvidence.timeOrigin!==performance.timeOrigin),
  'Actual different process and original pinned measurements required; factory reconstruction is insufficient');
  const current=context.normal.currentBinding();
  assert.ok(context.normal.window?.approved && context.normal.window.token!==prior.normalWindow.token
    && current.processInstanceId!==prior.normalWindow.binding.processInstanceId && current.restartGeneration>prior.normalWindow.binding.restartGeneration,
  'Actual new process binding and separately approved new inventory/window/token required');
  assert.ok(context.normal.now()>=prior.normalWindow.startsAt && context.normal.now()<prior.normalWindow.expiresAt,
    'Original window must still be live to measure restart rejection specifically; expired prior window is not restart evidence');
  // Old token remains bound to the OLD process. Reuse the actual new binding
  // source/facts producer; never substitute old identity or approve a window here.
  const old=createOwnedPoolCapacityAdmission({...context.normal,window:prior.normalWindow});
  try {for(const kind of ['session','upload'] as const)await assert.rejects(old.acquire(kind),e=>e instanceof CapacityAdmissionRejected && e.reason==='BINDING_CHANGED');}
  finally {old.close();}
  const h=await host(context);try {await h.open(context.normal);const before=await h.inventory(),cookie=h.cookie(await h.login());
    assert.ok((await h.upload(0,cookie)).statusCode===200,'Actual new approved process must regain bounded original issuance/upload');await until(h.settled,h.limits);
    const after=await h.inventory();assert.ok(after.sessions===before.sessions+1n && after.mediaBytes>before.mediaBytes,
      'Restart uses fresh exclusive upload keys and actual new session/media growth, never old stage replay');
    return {status:'PHYSICAL_RESTART_BOUNDARY_MEASURED' as const,sourceCommit:context.sourceCommit,databaseOid:'21551',processEvidence:{pid:process.pid,timeOrigin:performance.timeOrigin},
      priorProcess:prior.processEvidence,scope:'This receipt and original pinned window measurements require C review together; not production capacity acceptance'};
  } catch {throw Error('A02 physical restart real QA failed; subsequent checks NOT_EXECUTED; no private inputs exported');}
  finally {await h.finish();}
}

if(process.argv[1] && pathToFileURL(resolve(process.argv[1])).href===import.meta.url)test('A02 requires original actual QA host inputs',()=>{
  throw Error('A02 real PG/codec/window performance NOT_EXECUTED: import the finite runner from T45 approved QA897 host with actual source/review/publication/facts/budgets/SLO; no connection attempted');
});
