import {createHash, createPublicKey, verify} from 'node:crypto';
import {constants, openSync, fstatSync, readFileSync, closeSync, readdirSync, lstatSync} from 'node:fs';
import {isAbsolute, dirname, join, parse, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import type {DatabaseConfig} from './config.js';
import {databaseIdentifier as ident, readDatabaseConfig} from './config.js';
import {identityRecord, bootstrapAssertionSql} from './identity.js';
import type {DataSession} from './session.js';
import {DataAccessError, databaseError} from './access-errors.js';
import {Client, type QueryResult, type QueryResultRow} from 'pg';
import {passwordProvider} from './credentials.js';
import type {SqlValue} from './session.js';

export type ProductionPhase = 'MAINTENANCE_ONLY' | 'FORMAL_IMPORT' | 'BUSINESS_ACTIVE';
export type ProductionOperation = 'database-plan' | 'database-bootstrap' | 'database-migrate' | 'database-inspect'
  | 'employee-initialization' | 'historical-import' | 'baseline-import' | 'baseline-activation' | 'business-runtime';
export interface ProductionAdmissionFiles {
  readonly admissionFile: string;
  readonly authorityPublicKeyFile: string;
  readonly authorityPublicKeySha256: string;
  readonly releaseFile: string;
}
const brand: unique symbol = Symbol('production-admission');
export interface ProductionAdmission {readonly [brand]: true}
export interface ProductionAccess {
  readonly admission: ProductionAdmission;
  readonly operation: ProductionOperation;
  readonly sourceSha256?: string;
}
interface FileReference {readonly path: string; readonly sha256: string}
interface ReceiptReference extends FileReference {readonly decisionPointer: string}
interface Approval {
  readonly target: string;
  readonly phase: ProductionPhase;
  readonly expires: number;
  readonly bootstrapUser: string;
  readonly sources: Readonly<Record<string, string | null>>;
  readonly files: readonly FileReference[];
}
const approvals = new WeakMap<ProductionAdmission, Approval>();
const permission: Readonly<Record<ProductionPhase, readonly ProductionOperation[]>> = {
  MAINTENANCE_ONLY: ['database-plan','database-bootstrap','database-migrate','database-inspect'],
  FORMAL_IMPORT: ['database-plan','database-inspect','employee-initialization','historical-import','baseline-import'],
  BUSINESS_ACTIVE: ['database-plan','database-inspect','baseline-activation','business-runtime'],
};
const sourceKeys: Partial<Record<ProductionOperation, string>> = {
  'employee-initialization':'employeesPlanSha256', 'historical-import':'historicalBodySha256',
  'baseline-import':'baselineSha256', 'baseline-activation':'baselineSha256',
};
function fail(code: string): never {throw new DataAccessError(code);}
function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return fail('INVALID_PRODUCTION_ADMISSION');
  return value as Record<string, unknown>;
}
function fields(value: Record<string, unknown>, names: readonly string[]): void {
  if (Object.keys(value).sort().join('|') !== [...names].sort().join('|')) fail('INVALID_PRODUCTION_ADMISSION_FIELDS');
}
function digest(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) return fail('INVALID_PRODUCTION_DIGEST');
  return value;
}
const sha = (value: Buffer | string): string => createHash('sha256').update(value).digest('hex');
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object') {
    const record = object(value);
    return '{' + Object.keys(record).sort().map(key => JSON.stringify(key) + ':' + canonical(record[key])).join(',') + '}';
  }
  const result = JSON.stringify(value); if (result === undefined) return fail('INVALID_PRODUCTION_ADMISSION'); return result;
}
/** No passwords or connection defaults are included; credential location is bound, not its contents. */
export function productionTarget(config: DatabaseConfig): Record<string, unknown> {
  return {...identityRecord(config),host:config.host,port:config.port,user:config.user,sslmode:config.sslmode,passfile:config.passfile ?? null};
}
function privateBytes(path: string): Buffer {
  let fd: number | undefined;
  try {
    if (!isAbsolute(path) || path.includes('\0')) fail('PRIVATE_PRODUCTION_FILE_REQUIRED');
    let part = parse(path).root;
    for (const item of path.slice(part.length).split('/')) {
      if (!item || item === '.' || item === '..') fail('PRIVATE_PRODUCTION_FILE_REQUIRED');
      part = join(part,item); if (lstatSync(part).isSymbolicLink()) fail('PRIVATE_PRODUCTION_FILE_REQUIRED');
    }
    fd = openSync(path,constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = fstatSync(fd);
    // Owner-write is also denied: authority artifacts are installed as private read-only mounts.
    if (!stat.isFile() || (stat.uid !== 0 && stat.uid !== process.getuid?.()) || (stat.mode & 0o277) !== 0 || stat.size < 1 || stat.size > 1048576)
      fail('PRIVATE_PRODUCTION_FILE_REQUIRED');
    const bytes = readFileSync(fd); if (bytes.length > 1048576) fail('PRIVATE_PRODUCTION_FILE_REQUIRED'); return bytes;
  } catch (error) {if (error instanceof DataAccessError) throw error; return fail('PRIVATE_PRODUCTION_FILE_REQUIRED');}
  finally {if (fd !== undefined) closeSync(fd);}
}
function json(bytes: Buffer): unknown {
  try {return JSON.parse(bytes.toString('utf8')) as unknown;} catch {return fail('INVALID_PRODUCTION_ADMISSION_JSON');}
}
function reference(value: unknown, receipt = false): FileReference | ReceiptReference {
  const ref = object(value); fields(ref,receipt ? ['path','sha256','decisionPointer'] : ['path','sha256']);
  if (typeof ref['path'] !== 'string' || !isAbsolute(ref['path'])) fail('INVALID_PRODUCTION_EVIDENCE_REFERENCE');
  if (receipt && (typeof ref['decisionPointer'] !== 'string' || !/^\/(?:[A-Za-z0-9_~-]+\/)*[A-Za-z0-9_~-]+$/.test(ref['decisionPointer']))) fail('INVALID_PRODUCTION_DECISION_POINTER');
  return Object.freeze({path:ref['path'],sha256:digest(ref['sha256']),...(receipt ? {decisionPointer:ref['decisionPointer'] as string} : {})});
}
function referencedBytes(ref: FileReference): Buffer {
  const bytes = privateBytes(ref.path); if (sha(bytes) !== ref.sha256) fail('PRODUCTION_EVIDENCE_CHANGED'); return bytes;
}
function pointer(value: unknown, path: string): unknown {
  let result = value;
  for (const key of path.slice(1).split('/').map(part => part.replaceAll('~1','/').replaceAll('~0','~'))) {
    const record = object(result); if (!Object.hasOwn(record,key)) return fail('PRODUCTION_EVIDENCE_NOT_READY'); result = record[key];
  }
  return result;
}
/** Executing modules + exact SQL closure, independent of values supplied in a grant. */
export function productionReleaseBinding(): {sqlClosureSha256: string; moduleSha256: Readonly<Record<string, string>>} {
  const dir = dirname(fileURLToPath(import.meta.url));
  const extension = fileURLToPath(import.meta.url).endsWith('.ts') ? '.ts' : '.js';
  const modules = Object.fromEntries(['access','config','cli','production-admission'].map(name => [name,sha(readFileSync(join(dir,name+extension)))]));
  const sqlDir = join(dir,'sql');
  const names = readdirSync(sqlDir).sort();
  if (!names.length || names.some(name => !/^(?:\d{4}-[a-z-]+\.sql|0001-manifest\.json)$/.test(name))) fail('UNEXPECTED_PRODUCTION_SQL_RESOURCE');
  return {sqlClosureSha256:sha(canonical(names.map(name => ({name,sha256:sha(readFileSync(join(sqlDir,name)))})))),moduleSha256:Object.freeze(modules)};
}
function checkTime(value: Record<string, unknown>, phase: ProductionPhase): number {
  const issued = typeof value['issuedAt'] === 'string' ? Date.parse(value['issuedAt']) : NaN;
  if (phase === 'BUSINESS_ACTIVE' && value['expiresAt'] === null) {
    if (!Number.isFinite(issued) || issued > Date.now()) fail('PRODUCTION_ADMISSION_EXPIRED_OR_NOT_YET_VALID');
    return Number.POSITIVE_INFINITY; // Durable T51 approval; independent of temporary SSH credentials.
  }
  const expires = typeof value['expiresAt'] === 'string' ? Date.parse(value['expiresAt']) : NaN;
  if (!Number.isFinite(issued) || !Number.isFinite(expires) || issued > Date.now() || expires <= Date.now() || expires <= issued)
    fail('PRODUCTION_ADMISSION_EXPIRED_OR_NOT_YET_VALID');
  return expires;
}
function readReceipt(value: unknown, subject: string, target: string, release: string, registered = false): {ref: ReceiptReference; document: Record<string, unknown>} {
  const ref = reference(value,true) as ReceiptReference;
  const document = object(json(referencedBytes(ref)));
  const decision = pointer(document,ref.decisionPointer);
  const passes: readonly unknown[] = ['PASS','PASS_TASK_ACCEPTANCE','PASS_GATE_ACCEPTANCE','PASS_REUSED_EXISTING_CONTROLLER_ACCEPTANCE'];
  if (!passes.includes(decision) && !(registered && decision === 'TARGET_REGISTERED')) fail('PRODUCTION_EVIDENCE_NOT_READY');
  if (/^G[456]$/.test(subject)) {
    if (document['gateId'] !== subject && !ref.decisionPointer.split('/').includes(subject)) fail('PRODUCTION_GATE_RECEIPT_MISMATCH');
  } else if (document['taskId'] !== subject) fail('PRODUCTION_TASK_RECEIPT_MISMATCH');
  if (subject === 'T48' || subject === 'T49' || subject === 'T50') {
    if (canonical(document['target']) !== target || canonical(document['release']) !== release) fail('PRODUCTION_RECEIPT_BINDING_MISMATCH');
  }
  return {ref,document};
}

/** Only an external authorized issuer can sign. There is deliberately no runtime issuing function. */
export function readProductionAdmission(config: DatabaseConfig, files: ProductionAdmissionFiles): ProductionAdmission {
  if (config.environment !== 'production') fail('PRODUCTION_ADMISSION_REQUIRES_PRODUCTION_ENVIRONMENT');
  const publicBytes = privateBytes(files.authorityPublicKeyFile);
  if (sha(publicBytes) !== digest(files.authorityPublicKeySha256) || !publicBytes.toString('utf8').startsWith('-----BEGIN PUBLIC KEY-----')) fail('UNTRUSTED_PRODUCTION_AUTHORITY');
  let key;
  try {key = createPublicKey(publicBytes);} catch {return fail('UNTRUSTED_PRODUCTION_AUTHORITY');}
  if (key.asymmetricKeyType !== 'ed25519') fail('UNTRUSTED_PRODUCTION_AUTHORITY');
  const admissionBytes = privateBytes(files.admissionFile);
  const envelope = object(json(admissionBytes)); fields(envelope,['payload','signature']);
  const payload = object(envelope['payload']);
  if (typeof envelope['signature'] !== 'string') fail('INVALID_PRODUCTION_SIGNATURE');
  const signature = Buffer.from(envelope['signature'],'base64');
  if (signature.length !== 64 || signature.toString('base64') !== envelope['signature'] || !verify(null,Buffer.from(canonical(payload)),key,signature)) fail('INVALID_PRODUCTION_SIGNATURE');
  fields(payload,['schemaVersion','admissionId','issuerTask','phase','issuedAt','expiresAt','controlDirectory','target','bootstrapUser','release','sources','evidence']);
  if (payload['schemaVersion'] !== 'ERP-PRODUCTION-ADMISSION-v1' || typeof payload['admissionId'] !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(payload['admissionId'])) fail('INVALID_PRODUCTION_ADMISSION');
  const phase = payload['phase'];
  if (phase !== 'MAINTENANCE_ONLY' && phase !== 'FORMAL_IMPORT' && phase !== 'BUSINESS_ACTIVE') fail('INVALID_PRODUCTION_PHASE');
  const issuer = payload['issuerTask'];
  if (phase === 'MAINTENANCE_ONLY' ? issuer !== 'T48' : phase === 'FORMAL_IMPORT' ? issuer !== 'T48' && issuer !== 'T50' : issuer !== 'T51') fail('PRODUCTION_ISSUER_PHASE_MISMATCH');
  const expires = checkTime(payload,phase), target = canonical(productionTarget(config));
  const controlDirectory = payload['controlDirectory'];
  if (typeof controlDirectory !== 'string' || !isAbsolute(controlDirectory) || controlDirectory === parse(controlDirectory).root
    || controlDirectory.includes('\0') || controlDirectory.split(sep).some(part => part === '.' || part === '..')) fail('INVALID_PRODUCTION_CONTROL_DIRECTORY');
  if (phase === 'BUSINESS_ACTIVE' && /(?:^|\/)(?:tmp|jobs?|job-[^/]+|overnight-auth[^/]*|release-receipts)(?:\/|$)/.test(controlDirectory)) fail('DURABLE_PRODUCTION_CONTROL_REQUIRED');
  if (canonical(payload['target']) !== target) fail('PRODUCTION_TARGET_MISMATCH');
  if (typeof payload['bootstrapUser'] !== 'string') fail('INVALID_PRODUCTION_BOOTSTRAP_USER');
  const bootstrapUser = payload['bootstrapUser']; ident(bootstrapUser);
  if (Object.values(config.roles).includes(bootstrapUser)) fail('SEPARATE_PRODUCTION_BOOTSTRAP_USER_REQUIRED');
  const release = object(payload['release']);
  fields(release,['appImageDigest','releaseCandidateSha256','backendSourceSha256','sqlClosureSha256','moduleSha256','receiptSha256']);
  if (typeof release['appImageDigest'] !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(release['appImageDigest'])) fail('INVALID_PRODUCTION_IMAGE');
  digest(release['releaseCandidateSha256']); digest(release['backendSourceSha256']);
  const local = productionReleaseBinding();
  if (release['sqlClosureSha256'] !== local.sqlClosureSha256 || canonical(release['moduleSha256']) !== canonical(local.moduleSha256)) fail('PRODUCTION_RELEASE_BYTES_MISMATCH');
  const {receiptSha256,...releaseCore} = release;
  const releaseRef = Object.freeze({path:files.releaseFile,sha256:digest(receiptSha256)});
  const deployed = object(json(referencedBytes(releaseRef)));
  fields(deployed,['schemaVersion','phase','controlDirectory','target','release']);
  if (deployed['schemaVersion'] !== 'ERP-PRODUCTION-RELEASE-v1' || deployed['phase'] !== phase || deployed['controlDirectory'] !== controlDirectory
    || canonical(deployed['target']) !== target || canonical(deployed['release']) !== canonical(releaseCore)) fail('PRODUCTION_DEPLOYMENT_PHASE_MISMATCH');
  const sources = object(payload['sources']); fields(sources,['employeesPlanSha256','historicalBodySha256','baselineSha256']);
  for (const value of Object.values(sources)) if (value !== null) digest(value);
  const evidence = object(payload['evidence']); fields(evidence,['g4','g5','g6','t47','t48','t49','t50','userAuthorization']);
  const refs: FileReference[] = [
    Object.freeze({path:files.admissionFile,sha256:sha(admissionBytes)}),
    Object.freeze({path:files.authorityPublicKeyFile,sha256:sha(publicBytes)}),releaseRef,
  ];
  const receipt = (name: string, subject: string, registered = false): Record<string, unknown> => {
    const item = readReceipt(evidence[name],subject,target,canonical(releaseCore),registered); refs.push(item.ref); return item.document;
  };
  const userRef = reference(evidence['userAuthorization']); referencedBytes(userRef); refs.push(userRef);
  if (phase === 'MAINTENANCE_ONLY') {
    receipt('g4','G4'); receipt('t47','T47'); receipt('t48','T48',true);
    if (evidence['g5'] !== null || evidence['g6'] !== null || evidence['t49'] !== null || evidence['t50'] !== null) fail('PRODUCTION_PHASE_EVIDENCE_MISMATCH');
  } else {
    receipt('g5','G5'); const ready = receipt('t48','T48');
    if (ready['databaseReady'] !== true) fail('PRODUCTION_EVIDENCE_NOT_READY');
    const frozen = receipt('t49','T49');
    if (sources['baselineSha256'] === null || frozen['baselineSha256'] !== sources['baselineSha256'] || frozen['baselineFrozen'] !== true
      || canonical(frozen['sources']) !== canonical(sources)) fail('PRODUCTION_SOURCE_NOT_FROZEN');
    if (phase === 'BUSINESS_ACTIVE') {
      receipt('g6','G6'); const actual = receipt('t50','T50');
      if (actual['baselineSha256'] !== sources['baselineSha256'] || actual['importReadbackMatched'] !== true || actual['pairedBackupVerified'] !== true || actual['businessCutoverConfirmed'] !== true) fail('PRODUCTION_CUTOVER_NOT_READY');
    } else if (evidence['g6'] !== null || evidence['t50'] !== null) fail('PRODUCTION_PHASE_EVIDENCE_MISMATCH');
    // Previous G4/T47 are subsumed by actual G5, not demanded a second time.
    if (evidence['g4'] !== null || evidence['t47'] !== null) fail('PRODUCTION_PHASE_EVIDENCE_MISMATCH');
  }
  if (refs.some(ref => !ref.path.startsWith(controlDirectory + sep))) fail('PRODUCTION_CONTROL_FILES_NOT_BOUND');
  const grant: ProductionAdmission = Object.freeze({[brand]:true as const});
  approvals.set(grant,Object.freeze({target,phase,expires,bootstrapUser,sources:Object.freeze({...sources}) as Readonly<Record<string,string | null>>,files:Object.freeze(refs)}));
  return grant;
}

function approved(config: DatabaseConfig, admission: ProductionAdmission): Approval {
  const result = approvals.get(admission);
  if (!result) return fail('UNAUTHENTIC_PRODUCTION_CAPABILITY');
  if (config.environment !== 'production' || result.target !== canonical(productionTarget(config))) fail('PRODUCTION_TARGET_MISMATCH');
  if (result.expires <= Date.now()) fail('PRODUCTION_ADMISSION_EXPIRED_OR_NOT_YET_VALID');
  for (const ref of result.files) referencedBytes(ref); // Revocation/receipt replacement fails closed.
  return result;
}
export function assertProductionAdmission(config: DatabaseConfig, admission: ProductionAdmission, operation: ProductionOperation, sourceSha256?: string): void {
  const result = approved(config,admission);
  if (!permission[result.phase].includes(operation)) fail('PRODUCTION_OPERATION_NOT_ADMITTED');
  const required = sourceKeys[operation];
  if (required && (digest(sourceSha256) !== result.sources[required] || !result.sources[required])) fail('PRODUCTION_SOURCE_MISMATCH');
  if (!required && sourceSha256 !== undefined) fail('UNEXPECTED_PRODUCTION_SOURCE_BINDING');
}
export function assertProductionBootstrapUser(config: DatabaseConfig, admission: ProductionAdmission, user: string): void {
  assertProductionAdmission(config,admission,'database-bootstrap');
  if (approved(config,admission).bootstrapUser !== user) fail('PRODUCTION_BOOTSTRAP_USER_MISMATCH');
}
/** Call after complete action locks, before writes; no second connection and no gate creation. */
export async function assertProductionSession(session: Pick<DataSession,'query'>, config: DatabaseConfig, admission: ProductionAdmission,
  operation: ProductionOperation, sourceSha256?: string, login: 'app' | 'migrator' = 'app'): Promise<void> {
  assertProductionAdmission(config,admission,operation,sourceSha256);
  if (login === 'migrator' && !['historical-import','baseline-import','database-migrate','database-inspect'].includes(operation)) fail('PRODUCTION_LOGIN_OPERATION_MISMATCH');
  const result = await session.query<{database: string; login: string; user: string; identity: unknown; safe: boolean}>(`SELECT current_database() AS database,session_user AS login,current_user AS "user",
    (SELECT identity FROM ${ident(config.schemas.control)}.environment_identity WHERE singleton) AS identity,
    current_database()=$1 AND session_user=$2 AND current_user=$2
    AND (SELECT identity FROM ${ident(config.schemas.control)}.environment_identity WHERE singleton)=$3::jsonb
    AND ${ident(config.schemas.control)}.cluster_identifier()=$4
    AND current_setting('server_version_num')::int BETWEEN 170000 AND 179999
    AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname=session_user AND rolcanlogin AND NOT rolsuper
      AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls AND NOT rolinherit)
    AND NOT EXISTS (SELECT 1 FROM pg_database WHERE datname=current_database() AND datdba=(SELECT oid FROM pg_roles WHERE rolname=session_user))
    AND (NOT $5::boolean OR (
      NOT EXISTS (SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=session_user))
      AND NOT has_database_privilege(session_user,current_database(),'CREATE') AND NOT has_database_privilege(session_user,current_database(),'TEMP')
      AND NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname NOT LIKE 'pg_%'
        AND (nspowner=(SELECT oid FROM pg_roles WHERE rolname=session_user) OR has_schema_privilege(session_user,oid,'CREATE')))
      AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relowner=(SELECT oid FROM pg_roles WHERE rolname=session_user))
    )) AS safe`,[config.database,config.roles[login],JSON.stringify(identityRecord(config)),config.clusterId,login === 'app']);
  const row = result.rows[0];
  if (!row || row.safe !== true || row.database !== config.database || row.login !== config.roles[login] || row.user !== config.roles[login] || canonical(row.identity) !== canonical(identityRecord(config))) fail('PRODUCTION_LIVE_TARGET_MISMATCH');
  assertProductionAdmission(config,admission,operation,sourceSha256);
}

export interface ProductionDdlState {readonly controlSchemaExists: boolean}
export type ProductionDdlScript = string | ((state: ProductionDdlState) => string);
export type ProductionDdlPlan =
  | {readonly operation: 'database-bootstrap'; readonly bootstrapUser: string; readonly script: ProductionDdlScript}
  | {readonly operation: 'database-migrate'; readonly script: ProductionDdlScript};

interface SqlStatement {readonly sql: string; readonly code: string}
/** Split trusted installation templates at SQL top level, never inside quotes/comments/DO bodies. */
function installationStatements(sql: string): readonly SqlStatement[] {
  if (typeof sql !== 'string' || !sql || sql.includes('\0') || sql.length > 16777216) fail('INVALID_PRODUCTION_DDL_SCRIPT');
  const statements: SqlStatement[] = [];
  let start = 0, code = '', quote = '', dollar = '', block = 0, line = false, escaped = false;
  for (let index = 0; index < sql.length; index++) {
    const char = sql[index]!, next = sql[index+1];
    if (line) {if (char === '\n') {line = false; code += '\n';} continue;}
    if (block) {
      if (char === '/' && next === '*') {block++; index++;}
      else if (char === '*' && next === '/') {block--; index++;}
      continue;
    }
    if (dollar) {if (sql.startsWith(dollar,index)) {index += dollar.length-1; dollar = '';} continue;}
    if (quote) {
      if (escaped && char === '\\') {index++; continue;}
      if (char === quote) {if (next === quote) index++; else quote = '';}
      continue;
    }
    if (char === '-' && next === '-') {line = true; index++; code += ' '; continue;}
    if (char === '/' && next === '*') {block = 1; index++; code += ' '; continue;}
    if (char === "'" || char === '"') {
      quote = char; escaped = char === "'" && /(?:^|[^a-zA-Z0-9_])[eE]$/.test(sql.slice(0,index)); code += ' ? '; continue;
    }
    if (char === '$') {
      const tag = sql.slice(index).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0];
      if (tag) {dollar = tag; index += tag.length-1; code += ' ? '; continue;}
    }
    if (char === ';') {
      if (code.trim()) statements.push({sql:sql.slice(start,index).trim(),code:code.trim()});
      start = index+1; code = ''; continue;
    }
    code += char;
  }
  if (quote || dollar || block) fail('INVALID_PRODUCTION_DDL_SCRIPT');
  if (code.trim()) statements.push({sql:sql.slice(start).trim(),code:code.trim()});
  return statements;
}

/** A single live pg transaction owns all locks, statements and the only possible final COMMIT. */
async function executeMaintenance(config: DatabaseConfig, admission: ProductionAdmission,
  operation: 'database-bootstrap' | 'database-migrate' | 'database-inspect', login: string, script: ProductionDdlScript): Promise<string> {
  assertProductionAdmission(config,admission,operation);
  const bootstrap = operation === 'database-bootstrap', readOnly = operation === 'database-inspect';
  if (bootstrap) assertProductionBootstrapUser(config,admission,login);
  else if (login !== (readOnly ? config.roles.app : config.roles.migrator)) fail('PRODUCTION_LOGIN_OPERATION_MISMATCH');
  const client = new Client({host:config.host,port:config.port,database:config.database,user:login,
    password:passwordProvider({...config,user:login}),ssl:config.sslmode === 'verify-full' ? {rejectUnauthorized:true} : false,
    sslnegotiation:'postgres',connectionTimeoutMillis:5000,statement_timeout:300000,lock_timeout:10000,
    query_timeout:310000,idle_in_transaction_session_timeout:10000,application_name:'naijue-controlled-production-maintenance',
    client_encoding:'UTF8',options:'-c search_path=pg_catalog -c timezone=UTC -c standard_conforming_strings=on',keepAlive:true});
  let inTransaction = false, committed = false, commitIssued = false, initialControl = false, broken = false;
  client.on('error',() => {broken = true;});
  const query = <Row extends QueryResultRow>(text: string, values: readonly SqlValue[] = []) => {
    const statement = {text,values:[...values],queryMode:'extended'};
    return client.query<Row>(statement);
  };
  const scope = {query};
  const check = async (final = false): Promise<void> => {
    assertProductionAdmission(config,admission,operation);
    if (broken) fail('PRODUCTION_MAINTENANCE_CONNECTION_LOST');
    const current = (await query<{role: string}>('SELECT current_user AS role')).rows[0]?.role;
    if (!current || ![login,...Object.values(config.roles)].includes(current)) fail('PRODUCTION_DDL_ROLE_MISMATCH');
    if (current !== login) await query('RESET ROLE');
    if (bootstrap) {
      await query(bootstrapAssertionSql(config,login));
      const exists = (await query<{present: boolean}>('SELECT to_regclass($1) IS NOT NULL AS present',[ident(config.schemas.control)+'.environment_identity'])).rows[0]?.present;
      if (exists) {
        const row = (await query<{identity: unknown}>(`SELECT identity FROM ${ident(config.schemas.control)}.environment_identity WHERE singleton`)).rows[0];
        if (row && canonical(row.identity) !== canonical(identityRecord(config))) fail('PRODUCTION_LIVE_TARGET_MISMATCH');
        if ((initialControl || final) && !row) fail('PRODUCTION_BOOTSTRAP_IDENTITY_REQUIRED');
      } else if (initialControl || final) fail('PRODUCTION_BOOTSTRAP_IDENTITY_REQUIRED');
    } else await assertProductionSession(scope,config,admission,operation,undefined,readOnly ? 'app' : 'migrator');
    assertProductionAdmission(config,admission,operation);
    if (current !== login && !final) await query('SET LOCAL ROLE '+ident(current));
  };
  try {
    await client.connect();
    assertProductionAdmission(config,admission,operation);
    await query(readOnly ? 'BEGIN READ ONLY' : 'BEGIN'); inTransaction = true;
    if (!readOnly) {
      // Bootstrap and core/additive migrations share a complete, deterministic lock set.
      for (const key of [config.database+':t08-bootstrap',config.instanceId+':schema-migrations'].sort())
        await query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[key]);
    }
    // Revalidate after potentially delayed lock acquisition, before any installation write.
    const registered = (await query<{present: boolean}>('SELECT to_regnamespace($1) IS NOT NULL AS present',[config.schemas.control])).rows[0];
    initialControl = registered?.present === true;
    await check();
    const text = typeof script === 'function' ? script(Object.freeze({controlSchemaExists:initialControl})) : script;
    const all = installationStatements(text), first = all[0], last = all.at(-1);
    if (!first || !last || !/^BEGIN(?:\s+READ\s+ONLY)?$/i.test(first.code)
      || (readOnly ? !/^ROLLBACK$/i.test(last.code) : !/^COMMIT$/i.test(last.code))) fail('CONTROLLED_PRODUCTION_TRANSACTION_REQUIRED');
    const body = all.slice(1,-1);
    for (const statement of body) {
      if (/^(?:BEGIN|START|COMMIT|END|ROLLBACK|ABORT|SAVEPOINT|RELEASE|PREPARE)\b/i.test(statement.code)
        || /^(?:SET|RESET)\s+(?:(?:LOCAL|SESSION)\s+)?SESSION\s+AUTHORIZATION\b/i.test(statement.code)
        || /^SET\s+(?:LOCAL\s+)?TRANSACTION\b/i.test(statement.code)) fail('PRODUCTION_DDL_TRANSACTION_ESCAPE');
    }
    const output: string[] = [];
    for (const statement of body) {
      await check();
      const result = await query(statement.sql);
      for (const row of result.rows) {
        const values = Object.values(row);
        if (values.length !== 1) fail('PRODUCTION_MAINTENANCE_OUTPUT_SHAPE');
        const value = values[0];
        if (value !== '' && value !== null && value !== undefined) output.push(typeof value === 'object' ? JSON.stringify(value) : String(value));
      }
    }
    // No complete SQL batch ever contains a reachable caller-controlled COMMIT.
    await check(true);
    assertProductionAdmission(config,admission,operation);
    if (readOnly) {await query('ROLLBACK'); inTransaction = false;}
    else {commitIssued = true; await query('COMMIT'); committed = true; inTransaction = false;}
    return output.join('\n').trim();
  } catch (error) {
    if (inTransaction && !committed) {try {await query('ROLLBACK');} catch { /* disconnect also rolls back */ }}
    if (commitIssued && !committed) throw new DataAccessError('COMMIT_OUTCOME_UNKNOWN',databaseError(error).sqlState);
    throw databaseError(error);
  } finally {try {await client.end();} catch { /* no pooled/checked-out client remains */ }}
}

export function executeProductionDdl(config: DatabaseConfig, admission: ProductionAdmission, plan: ProductionDdlPlan): Promise<string> {
  if (!plan || !['database-bootstrap','database-migrate'].includes(plan.operation)) return Promise.reject(new DataAccessError('PRODUCTION_DDL_OPERATION_REQUIRED'));
  return executeMaintenance(config,admission,plan.operation,plan.operation === 'database-bootstrap' ? plan.bootstrapUser : config.roles.migrator,plan.script);
}
export function executeProductionInspection(config: DatabaseConfig, admission: ProductionAdmission, script: string): Promise<string> {
  return executeMaintenance(config,admission,'database-inspect',config.roles.app,script);
}

const nativeCodeTables = {
  'source.tplus_product_barcode': {layer:'source',write:true,columns:['batch_id','source_id','product_id','barcode','unit','is_default','binding_scope','sku_id','sku_binding_known','source_payload'],required:['batch_id','source_id','product_id','barcode','unit','is_default','binding_scope','sku_id','sku_binding_known','source_payload']},
  'source.barcode': {layer:'source',write:true,columns:['id','value','variant_id','status','role','scheme_version_id','source','generated_input_snapshot','quarantine_reason','created_at'],required:['id','value','variant_id','status','role','source']},
  'runtime.generated_barcode': {layer:'runtime',write:true,columns:['sku_id','product_id','barcode','scheme_id','evidence','created_at'],required:['sku_id','product_id','barcode','scheme_id','evidence']},
  'runtime.generated_barcode_retired': {layer:'runtime',write:true,columns:['sku_id','product_id','barcode','scheme_id','evidence','created_at'],required:['sku_id','product_id','barcode','scheme_id','evidence']},
  'runtime.product_barcode_alias': {layer:'runtime',write:true,columns:['barcode','product_id','sku_id','historical_note','created_at','origin'],required:['barcode','product_id','sku_id','historical_note','origin']},
  'runtime.product_barcode_alias_retired': {layer:'runtime',write:true,columns:['barcode','product_id','sku_id','historical_note','created_at','origin'],required:['barcode','product_id','sku_id','historical_note','origin']},
  'source.product': {layer:'source',write:false,columns:['id','code','code_normalized','name','enabled','version'],required:[]},
  'source.variant': {layer:'source',write:false,columns:['id','product_id','option_key','enabled','version'],required:[]},
  'source.tplus_import_run': {layer:'source',write:false,columns:['batch_id','status','manifest_sha256','database_name','schema_name'],required:[]},
  'runtime.product_overlay': {layer:'runtime',write:false,columns:['id','code','body','deleted','created_at','updated_at'],required:[]},
  'runtime.product_profile_overlay': {layer:'runtime',write:false,columns:['product_id','body','version','updated_at'],required:[]},
  'runtime.variant_overlay': {layer:'runtime',write:false,columns:['id','product_id','color_id','size_id','size_name','group_name','created_at','fit_id','size_code'],required:[]},
  'runtime.inventory_quantity_identity': {layer:'runtime',write:false,columns:['kind','target_key','id','generated_in_target','evidence_sha256','body'],required:[]},
} as const;
export type ProductionNativeCodeTable = keyof typeof nativeCodeTables;
export interface ProductionNativeCodeSession {
  select<Row extends QueryResultRow = QueryResultRow>(table: ProductionNativeCodeTable, where?: Readonly<Record<string,SqlValue>>, columns?: readonly string[]): Promise<QueryResult<Row>>;
  insert<Row extends QueryResultRow = QueryResultRow>(table: ProductionNativeCodeTable, row: Readonly<Record<string,SqlValue>>): Promise<QueryResult<Row>>;
  insertBatch<Row extends QueryResultRow = QueryResultRow>(table: ProductionNativeCodeTable, rows: readonly Readonly<Record<string,SqlValue>>[]): Promise<QueryResult<Row>>;
  witness(): Promise<{database: string; user: string; backendPid: number; sourceSha256: string; transactionTimestamp: string}>;
}
function nativeParameter(value: SqlValue): SqlValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'bigint') return value;
  if (typeof value === 'string' && !value.includes('\0') && Buffer.byteLength(value)<=1048576) return value;
  if (typeof value === 'number' && Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value))) return value;
  if (value instanceof Date && Number.isFinite(value.getTime())) return new Date(value);
  if (Buffer.isBuffer(value) && value.byteLength<=1048576) return Buffer.from(value);
  if (Array.isArray(value) && value.length<=50000) return Array.from(value,item => {
    if (Array.isArray(item)) return fail('INVALID_NATIVE_CODE_PARAMETER'); return nativeParameter(item as SqlValue);
  });
  return fail('INVALID_NATIVE_CODE_PARAMETER');
}

/** Formal, source-bound native import. No application privilege, raw client, SQL or role escape. */
export async function withProductionNativeCodeImport<T>(input: DatabaseConfig, admission: ProductionAdmission,
  sourceSha256: string, work: (native: ProductionNativeCodeSession) => Promise<T>): Promise<T> {
  const config = readDatabaseConfig({APP_ENV:input.environment,POSTGRES_HOST:input.host,POSTGRES_PORT:String(input.port),POSTGRES_DB:input.database,
    POSTGRES_USER:input.user,POSTGRES_ROLE_PREFIX:input.roles.app.replace(/_app$/,''),POSTGRES_PASSFILE:input.passfile,POSTGRES_SSLMODE:input.sslmode,
    POSTGRES_INSTANCE_ID:input.instanceId,POSTGRES_CLUSTER_ID:input.clusterId,POSTGRES_SOURCE_SCHEMA:input.schemas.source,
    POSTGRES_RUNTIME_SCHEMA:input.schemas.runtime,POSTGRES_AUTH_SCHEMA:input.schemas.auth,POSTGRES_CONTROL_SCHEMA:input.schemas.control});
  if (canonical(config.roles)!==canonical(input.roles)) fail('INVALID_NATIVE_CODE_ROLES');
  Object.freeze(config.roles);Object.freeze(config.schemas);Object.freeze(config);
  assertProductionAdmission(config,admission,'historical-import',sourceSha256);
  if (approved(config,admission).phase!=='FORMAL_IMPORT') fail('FORMAL_NATIVE_CODE_STAGE_REQUIRED');
  const client=new Client({host:config.host,port:config.port,database:config.database,user:config.roles.migrator,
    password:passwordProvider({...config,user:config.roles.migrator}),ssl:config.sslmode==='verify-full'?{rejectUnauthorized:true}:false,
    sslnegotiation:'postgres',connectionTimeoutMillis:5000,statement_timeout:30000,lock_timeout:5000,query_timeout:31000,
    idle_in_transaction_session_timeout:15000,options:'-c search_path=pg_catalog -c timezone=UTC',client_encoding:'UTF8',keepAlive:true,
    application_name:'naijue-controlled-native-code-import'});
  let active=false,pending=false,failed:DataAccessError|undefined,inTransaction=false,commitIssued=false,committed=false,broken=false,workFailed=false;
  client.on('error',()=>{broken=true;});
  const query=<Row extends QueryResultRow>(text:string,values:readonly SqlValue[]=[])=>client.query<Row>({text,values:[...values]});
  const witness=async ():Promise<void>=>{if(broken)fail('NATIVE_CODE_CONNECTION_LOST');await assertProductionSession({query},config,admission,'historical-import',sourceSha256,'migrator');};
  const schemaCache=new Set<ProductionNativeCodeTable>();
  async function managed<Row extends QueryResultRow>(table:ProductionNativeCodeTable,build:(name:string)=>{sql:string;values:readonly SqlValue[]}):Promise<QueryResult<Row>> {
    let ownsPending=false;
    try {
      if(!active)fail('NATIVE_CODE_SESSION_CLOSED');if(failed)throw failed;if(pending)fail('CONCURRENT_NATIVE_CODE_QUERY');pending=true;ownsPending=true;
      if(!Object.hasOwn(nativeCodeTables,table))fail('NATIVE_CODE_TABLE_NOT_ADMITTED');
      const policy=nativeCodeTables[table],name=ident(config.schemas[policy.layer])+'.'+ident(table.split('.')[1]!);
      const statement=build(name);
      await witness();await query('SET LOCAL ROLE '+ident(config.roles[policy.layer]));
      try {
        if(!schemaCache.has(table)) {
          const actual=(await query<{columns:unknown}>('SELECT ARRAY(SELECT attname::text FROM pg_attribute WHERE attrelid=$1::regclass AND attnum>0 AND NOT attisdropped ORDER BY attnum) AS columns',[name])).rows[0]?.columns;
          if(!Array.isArray(actual) || !Array.from(actual).every(column=>typeof column==='string') || policy.columns.some(column=>!actual.includes(column)) || (policy.write&&canonical([...actual].sort())!==canonical([...policy.columns].sort()))) fail('NATIVE_CODE_TABLE_COLUMNS_MISMATCH');
          schemaCache.add(table);
        }
        const request={text:statement.sql,values:[...statement.values],queryMode:'extended'};
        const result=await client.query<Row>(request);await query('RESET ROLE');await witness();return result;
      } finally {try{await query('RESET ROLE');}catch{ /* aborted transaction is rolled back below */ }}
    } catch(error){failed??=databaseError(error);throw failed;}finally{if(ownsPending)pending=false;}
  }
  const projection=(columns:readonly string[]):string=>columns.map(column=>column==='created_at'?ident(column)+'::text AS '+ident(column):ident(column)).join(',');
  const native:ProductionNativeCodeSession=Object.freeze({
    select<Row extends QueryResultRow>(table:ProductionNativeCodeTable,where:Readonly<Record<string,SqlValue>>={},columns?:readonly string[]):Promise<QueryResult<Row>> {
      return managed<Row>(table,name=>{
        const policy=nativeCodeTables[table],selected=columns?[...columns]:[...policy.columns],keys=Object.keys(where);
        if(!selected.length||new Set(selected).size!==selected.length||[...selected,...keys].some(column=>!(policy.columns as readonly string[]).includes(column)))fail('NATIVE_CODE_COLUMN_NOT_ADMITTED');
        const values=keys.map(key=>nativeParameter(where[key]!));
        return {sql:`SELECT ${projection(selected)} FROM ${name}`+(keys.length?' WHERE '+keys.map((key,index)=>Array.isArray(values[index])?`${ident(key)}=ANY($${index+1})`:`${ident(key)} IS NOT DISTINCT FROM $${index+1}`).join(' AND '):''),values};
      });
    },
    insert<Row extends QueryResultRow>(table:ProductionNativeCodeTable,row:Readonly<Record<string,SqlValue>>):Promise<QueryResult<Row>> {return native.insertBatch<Row>(table,[row]);},
    insertBatch<Row extends QueryResultRow>(table:ProductionNativeCodeTable,rows:readonly Readonly<Record<string,SqlValue>>[]):Promise<QueryResult<Row>> {
      return managed<Row>(table,name=>{
        const policy=nativeCodeTables[table];if(!policy.write)fail('NATIVE_CODE_TABLE_READ_ONLY');
        if(!Array.isArray(rows)||rows.length<1||rows.length>500)fail('NATIVE_CODE_BATCH_BOUNDARY');
        const keys=Object.keys(rows[0]!).sort();
        if(!keys.length||keys.some(key=>!(policy.columns as readonly string[]).includes(key))||policy.required.some(key=>!keys.includes(key)))fail('NATIVE_CODE_COLUMN_NOT_ADMITTED');
        const values:SqlValue[]=[];const tuples=Array.from(rows,row=>{
          if(!row||canonical(Object.keys(row).sort())!==canonical(keys))fail('NATIVE_CODE_ROW_COLUMNS_MISMATCH');
          return '('+keys.map(key=>{const value=nativeParameter(row[key]!);if(Array.isArray(value))fail('NATIVE_CODE_ROW_ARRAY_NOT_ADMITTED');values.push(value);return '$'+values.length;}).join(',')+')';
        });
        return {sql:`INSERT INTO ${name}(${keys.map(ident).join(',')}) VALUES ${tuples.join(',')} RETURNING ${projection(policy.columns)}`,values};
      });
    },
    async witness(){
      let ownsPending=false;
      try{if(!active)fail('NATIVE_CODE_SESSION_CLOSED');if(pending)fail('CONCURRENT_NATIVE_CODE_QUERY');if(failed)throw failed;
        pending=true;ownsPending=true;await witness();const row=(await query<{database:string;user:string;backendPid:number;transactionTimestamp:string}>('SELECT current_database() AS database,current_user AS "user",pg_backend_pid() AS "backendPid",transaction_timestamp()::text AS "transactionTimestamp"')).rows[0];
        if(!row||row.database!==config.database||row.user!==config.roles.migrator)fail('NATIVE_CODE_LIVE_TARGET_MISMATCH');return {...row,sourceSha256};
      }catch(error){failed??=databaseError(error);throw failed;}finally{if(ownsPending)pending=false;}
    },
  });
  try {
    await client.connect();assertProductionAdmission(config,admission,'historical-import',sourceSha256);
    await query('BEGIN');inTransaction=true;
    for(const key of ['0:idempotency:native-code:'+sourceSha256,'approved-current-source-codes','current-source-master-registration'].sort())
      await query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[config.instanceId+':'+key]);
    await witness();active=true;
    let result:T;
    try{result=await work(native);}catch(error){workFailed=true;throw error;}
    active=false;if(failed)throw failed;if(pending)fail('UNAWAITED_NATIVE_CODE_QUERY');
    await query('RESET ROLE');await witness();assertProductionAdmission(config,admission,'historical-import',sourceSha256);
    commitIssued=true;await query('COMMIT');committed=true;inTransaction=false;return result;
  }catch(error){active=false;if(inTransaction&&!committed&&!pending){try{await query('ROLLBACK');}catch{ /* disconnect rolls back */ }}
    if(commitIssued&&!committed)throw new DataAccessError('COMMIT_OUTCOME_UNKNOWN',databaseError(error).sqlState);if(workFailed)throw error;throw databaseError(error);
  }finally{active=false;try{await client.end();}catch{ /* no retained owner role or leased connection */ }}
}
