/** Explicit historical TEST oracle. Never rewrites active sources or imports a
 * production configuration. No PG target/client/engine is created here. */
import {createHash} from 'node:crypto';
import {readFile,readdir,lstat,realpath,mkdir,mkdtemp,writeFile,symlink,rm} from 'node:fs/promises';
import path from 'node:path';import {tmpdir} from 'node:os';import {fileURLToPath,pathToFileURL} from 'node:url';import {spawnSync} from 'node:child_process';
import {loadPairedSourcePlan} from '../performance/opt02/current-native-stock/reference-compiler-cohort-v2/source-cohort.mjs';
const ROOT=fileURLToPath(new URL('../../',import.meta.url)),HERE=fileURLToPath(new URL('.',import.meta.url));
export const HISTORICAL_CLOSURE_SHA256='ce0996cddf0860b1f5a7f9003d59f8d71fffbafd789ccee17f3686a3d98c2d92';
const retainedInputs=Object.freeze({
 'adapters/postgres/src/bounded-pool.ts':'fixtures/adapters__postgres__src__bounded-pool.ts.original.txt',
 'adapters/postgres/src/catalogue-completeness.ts':'fixtures/adapters__postgres__src__catalogue-completeness.ts.original.txt',
 'adapters/postgres/src/inventory-ledger-query-reader.ts':'fixtures/adapters__postgres__src__inventory-ledger-query-reader.ts.original.txt',
 'adapters/postgres/src/inventory-query-reader.ts':'fixtures/adapters__postgres__src__inventory-query-reader.ts.original.txt',
 'adapters/postgres/src/maintenance-command-unit-of-work.ts':'fixtures/adapters__postgres__src__maintenance-command-unit-of-work.ts.original.txt',
 'adapters/postgres/src/native-document-specification.ts':'fixtures/adapters__postgres__src__native-document-specification.ts.original.txt',
 'adapters/postgres/src/organization-maintenance-store.ts':'fixtures/adapters__postgres__src__organization-maintenance-store.ts.original.txt',
 'adapters/postgres/src/product-details-query-reader.ts':'fixtures/adapters__postgres__src__product-details-query-reader.ts.original.txt',
 'adapters/postgres/src/product-management-query-reader.ts':'fixtures/adapters__postgres__src__product-management-query-reader.ts.original.txt',
 'adapters/postgres/src/product-query-reader.ts':'fixtures/adapters__postgres__src__product-query-reader.ts.original.txt',
 'packages/application/src/document-specification.ts':'fixtures/packages__application__src__document-specification.ts.original.txt',
 'packages/application/src/inventory-query-contracts.ts':'fixtures/packages__application__src__inventory-query-contracts.ts.original.txt',
 'packages/application/src/inventory-query-response.ts':'fixtures/packages__application__src__inventory-query-response.ts.original.txt',
 'packages/application/src/inventory-query-validation.ts':'fixtures/packages__application__src__inventory-query-validation.ts.original.txt',
 'packages/application/src/organization-maintenance-ports.ts':'fixtures/packages__application__src__organization-maintenance-ports.ts.original.txt',
 'packages/application/src/organization-maintenance-validation.ts':'fixtures/packages__application__src__organization-maintenance-validation.ts.original.txt',
 'packages/application/src/product-management-query-service.ts':'fixtures/packages__application__src__product-management-query-service.ts.original.txt',
 'adapters/postgres/src/current-form-reader.ts':'fixtures/adapters__postgres__src__current-form-reader.ts.original.txt',
 'adapters/postgres/src/product-maintenance-store.ts':'fixtures/adapters__postgres__src__product-maintenance-store.ts.original.txt',
 'apps/api/src/current-form-http.ts':'fixtures/apps__api__src__current-form-http.ts.original.txt',
 'apps/api/src/postgres-read-api.ts':'fixtures/apps__api__src__postgres-read-api.ts.original.txt',
 'apps/api/src/product-maintenance-http.ts':'fixtures/apps__api__src__product-maintenance-http.ts.original.txt',
 'packages/application/src/catalogue-maintenance-service.ts':'fixtures/packages__application__src__catalogue-maintenance-service.ts.original.txt',
 'packages/application/src/catalogue-maintenance-validation.ts':'fixtures/packages__application__src__catalogue-maintenance-validation.ts.original.txt',
 'packages/application/src/inventory-ledger-query-validation.ts':'fixtures/packages__application__src__inventory-ledger-query-validation.ts.original.txt',
 'packages/application/src/product-maintenance-ports.ts':'fixtures/packages__application__src__product-maintenance-ports.ts.original.txt',
 'packages/application/src/product-maintenance-service.ts':'fixtures/packages__application__src__product-maintenance-service.ts.original.txt',
 'packages/application/src/product-maintenance-validation.ts':'fixtures/packages__application__src__product-maintenance-validation.ts.original.txt',
 'packages/application/src/request-hash.ts':'fixtures/request-hash.original.txt',
 'adapters/postgres/src/auth-store.ts':'fixtures/postgres-auth-store.original.txt',
 'packages/authentication/src/ports.ts':'fixtures/authentication-ports.original.txt',
 'packages/authentication/src/service.ts':'fixtures/authentication-service.original.txt',
 'adapters/postgres/src/sales-native-facts.ts':'fixtures/postgres-sales-native-facts.original.txt',
 'apps/api/src/document-list-wire.ts':'fixtures/document-list-wire.original.txt',
 'apps/api/src/sales-query-http.ts':'fixtures/sales-query-http.original.txt',
 'apps/api/src/transfer-query-http.ts':'fixtures/transfer-query-http.original.txt',
 'packages/application/src/sales-query-service.ts':'fixtures/sales-query-service.original.txt',
 'packages/application/src/transfer-query-service.ts':'fixtures/transfer-query-service.original.txt',
 'packages/application/src/current-form-ports.ts':'fixtures/current-form-ports.original.txt',
 'packages/application/src/current-form-validation.ts':'fixtures/current-form-validation.original.txt',
 'adapters/postgres/src/sales-query-reader.ts':'fixtures/sales-query-reader.original.txt',
 'adapters/postgres/src/history-revision-store.ts':'fixtures/history-revision-store.original.txt',
 'adapters/postgres/src/inventory-posting-balances.ts':'fixtures/inventory-posting-balances.original.txt',
 'adapters/postgres/src/sales-unit-of-work.ts':'fixtures/sales-unit-of-work.original.txt',
 'adapters/postgres/src/transfer-query-reader.ts':'fixtures/transfer-query-reader.original.txt',
 'adapters/postgres/src/transfer-unit-of-work.ts':'fixtures/transfer-unit-of-work.original.txt',
 'apps/api/src/input.ts':'fixtures/input.original.txt',
 'apps/api/src/sales-http.ts':'fixtures/sales-http.original.txt',
 'apps/api/src/transfer-http.ts':'fixtures/transfer-http.original.txt',
 'apps/api/src/transfer-input.ts':'fixtures/transfer-input.original.txt',
 'packages/application/src/inventory-posting.ts':'fixtures/inventory-posting.original.txt',
 'packages/application/src/native-sales-preparation.ts':'fixtures/native-sales-preparation.original.txt',
 'packages/application/src/native-transfer-preparation.ts':'fixtures/native-transfer-preparation.original.txt',
 'packages/application/src/ports.ts':'fixtures/ports.original.txt',
 'packages/application/src/sales-business-rules.ts':'fixtures/sales-business-rules.original.txt',
 'packages/application/src/sales-change-evidence.ts':'fixtures/sales-change-evidence.original.txt',
 'packages/application/src/sales-native-facts.ts':'fixtures/sales-native-facts.original.txt',
 'packages/application/src/sales-query-ports.ts':'fixtures/sales-query-ports.original.txt',
 'packages/application/src/sales-service.ts':'fixtures/sales-service.original.txt',
 'packages/application/src/transfer-ports.ts':'fixtures/transfer-ports.original.txt',
 'packages/application/src/transfer-query-ports.ts':'fixtures/transfer-query-ports.original.txt',
 'packages/application/src/transfer-service.ts':'fixtures/transfer-service.original.txt',
 'packages/domain/src/documents.ts':'fixtures/documents.original.txt',
 'packages/domain/src/inventory.ts':'fixtures/inventory.original.txt',
 'tests/integration/runtime26-baseline/offline.test.mjs':'fixtures/runtime26-baseline-offline.original.txt'
});
const H=x=>createHash('sha256').update(x).digest('hex'),oracles=new WeakMap();
const need=(v,c)=>{if(!v)throw Object.assign(new Error(c),{code:c});};
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};
async function manifest(){const bytes=await readFile(path.join(HERE,'HISTORICAL-TEST-CLOSURE.json'));need(H(bytes)===HISTORICAL_CLOSURE_SHA256,'HISTORICAL_CLOSURE_MANIFEST_CHANGED');const m=JSON.parse(bytes);need(m.format==='HISTORICAL_RUNTIME26_TEST_ORACLE_CLOSURE_V1'&&m.files.length===417&&new Set(m.files.map(f=>f.path)).size===417&&m.entrypoints.length===2,'EXACT_HISTORICAL_TEST_CLOSURE_REQUIRED');return freeze(m);}
function safeRelative(p){return typeof p==='string'&&!path.isAbsolute(p)&&!p.split('/').some(x=>x==='..'||x==='')&&!/[\\\0-\x1f]/.test(p);}
export async function historicalClosureDescriptor(){const m=await manifest();return freeze({format:m.format,sha256:HISTORICAL_CLOSURE_SHA256,files:m.files.length,bytes:m.files.reduce((n,f)=>n+f.bytes,0),overlays:2,originalSourceFingerprint:m.originalSourceFingerprint,entrypoints:m.entrypoints,authority:'TEST_ORACLE_ONLY'});}
export async function verifyHistoricalInputBytes(relative,bytes){const m=await manifest(),f=m.files.find(x=>x.path===relative);need(f&&Buffer.isBuffer(bytes)&&bytes.length===f.bytes&&H(bytes)===f.sha256,'EXACT_HISTORICAL_MEMBER_BYTES_REQUIRED');return true;}
export async function verifyActiveSuccessorInputBytes(bytes){const m=await manifest();need(Buffer.isBuffer(bytes)&&H(bytes)===m.activeSuccessorGuard.sha256,'ACTIVE_SUCCESSOR_MUST_NOT_BE_REPLACED_WITH_HISTORICAL_ORACLE');return true;}
async function checkedInputs(sourceRoot){const m=await manifest(),rows=[];need(path.isAbsolute(sourceRoot)&&path.resolve(sourceRoot)===sourceRoot,'CANONICAL_EXPLICIT_TEST_SOURCE_ROOT_REQUIRED');await verifyActiveSuccessorInputBytes(await readFile(path.join(ROOT,m.activeSuccessorGuard.path)));
 for(const f of m.files){need(safeRelative(f.path),'SAFE_CLOSED_HISTORICAL_MEMBER_REQUIRED');const file=f.provider==='ORIGINAL_PINNED_FIXTURE'?path.join(HERE,f.fixture):sourceRoot===path.resolve(ROOT)&&Object.hasOwn(retainedInputs,f.path)?path.join(HERE,retainedInputs[f.path]):path.join(sourceRoot,f.path);let s;try{s=await lstat(file);}catch(e){if(e.code==='ENOENT')throw Object.assign(new Error('HISTORICAL_SOURCE_MEMBER_MISSING:'+f.path),{code:'HISTORICAL_SOURCE_MEMBER_MISSING'});throw e;}need(s.isFile()&&!s.isSymbolicLink()&&s.size===f.bytes,'REGULAR_EXACT_HISTORICAL_MEMBER_REQUIRED:'+f.path);const bytes=await readFile(file);need(H(bytes)===f.sha256,'HISTORICAL_SOURCE_MEMBER_CHANGED:'+f.path);rows.push({record:f,bytes});}
 // Explicit external roots must themselves be historical26; never silently
 // discard migration27 from a caller-supplied current/successor tree. The known
 // active root above is an explicit, fixed-byte historical fixture projection.
 if(sourceRoot!==path.resolve(ROOT)){
  const expected=m.files.map(f=>f.path).filter(p=>/^adapters\/postgres\/migrations\/\d{4}.*\.sql$/.test(p)).sort();
  const actual=(await readdir(path.join(sourceRoot,'adapters/postgres/migrations'))).filter(p=>/^\d{4}.*\.sql$/.test(p)).map(p=>'adapters/postgres/migrations/'+p).sort();
  need(expected.length===26&&JSON.stringify(actual)===JSON.stringify(expected),'EXACT_EXTERNAL_HISTORICAL_26_MIGRATIONS_REQUIRED');
 }
 return {m,rows};}
function verifyDependencies(){const p=spawnSync(process.execPath,[path.join(ROOT,'scripts/verify-dependencies.mjs')],{cwd:ROOT,encoding:'utf8',timeout:30000});need(!p.error&&p.status===0,'EXISTING_INSTALLED_DEPENDENCY_BOUNDARY_FAILED');return H(p.stdout);}
export async function materializeHistoricalOracle(input={}){
 need(input&&Object.getPrototypeOf(input)===Object.prototype&&Reflect.ownKeys(input).every(k=>['sourceRoot','scratchParent'].includes(k)),'CLOSED_HISTORICAL_ORACLE_OPTIONS_REQUIRED');
 for(const k of Reflect.ownKeys(input)){const d=Object.getOwnPropertyDescriptor(input,k);need(d&&Object.hasOwn(d,'value'),'NO_HISTORICAL_OPTIONS_ACCESSORS');}
 need(process.version==='v24.21.0'&&!process.env.NODE_OPTIONS&&!process.env.NODE_PATH&&process.env.NODE_PG_FORCE_NATIVE===undefined,'EXACT_NODE_NO_PRELOAD_OR_NATIVE_OVERRIDE_REQUIRED');
 const sourceRoot=input.sourceRoot??path.resolve(ROOT),{m,rows}=await checkedInputs(sourceRoot);const dependenciesCheck=verifyDependencies();
 const parent=path.resolve(input.scratchParent??tmpdir()),ps=await lstat(parent);need(ps.isDirectory()&&!ps.isSymbolicLink()&&await realpath(parent)===parent,'CANONICAL_SCRATCH_PARENT_REQUIRED');
 const directory=await mkdtemp(path.join(parent,'naijue-historical-test-'));const birth=await lstat(directory);let succeeded=false;
 try{for(const {record:f,bytes}of rows){const dest=path.join(directory,f.path);await mkdir(path.dirname(dest),{recursive:true,mode:0o700});await writeFile(dest,bytes,{flag:'wx',mode:0o400});}
  const external=[];for(const name of m.externalInstalledTestDependencies.linkedEntryPackages){need(!m.files.some(f=>f.path.startsWith('node_modules/'+name+'/')),'EXTERNAL_PACKAGE_MUST_NOT_SHADOW_PINNED_COHORT');const target=await realpath(path.join(ROOT,'node_modules',name)),dest=path.join(directory,'node_modules',name);await symlink(target,dest,'dir');external.push({name,target});}
  // True paired loader verifies original200 and mints its own source/module
  // brands from this one root. No copied object/boolean supplies that brand.
  const paired=await loadPairedSourcePlan({sourceRoot:directory});need(paired.plan.sourceFingerprint===m.originalSourceFingerprint,'ORIGINAL_SOURCE_ORACLE_FINGERPRINT_REQUIRED');
  const token=Object.freeze({profile:'HISTORICAL_RUNTIME26_TEST_ORACLE_V1'});oracles.set(token,{directory,birth,m,sourceRoot,external,dependenciesCheck});await verifyHistoricalOracle(token);succeeded=true;return token;
 }finally{if(!succeeded)await rm(directory,{recursive:true,force:true});}
}
function state(token){need(oracles.has(token),'ORIGINAL_HISTORICAL_TEST_ORACLE_REQUIRED');return oracles.get(token);}
export function historicalOracleData(token){const s=state(token);return freeze({root:s.directory,scope:'HISTORICAL_SOURCE_ORACLE_NOT_CURRENT_SUCCESSOR_OR_TARGET',sourceFingerprint:s.m.originalSourceFingerprint,files:s.m.files.length,entryUrls:s.m.entrypoints.map(p=>pathToFileURL(path.join(s.directory,p)).href),installedDependenciesAreExternal:true,authority:'NONE'});}
export async function verifyHistoricalOracle(token){const s=state(token),actual=await lstat(s.directory);need(actual.isDirectory()&&!actual.isSymbolicLink()&&actual.dev===s.birth.dev&&actual.ino===s.birth.ino&&actual.uid===s.birth.uid&&await realpath(s.directory)===s.directory,'ORACLE_ROOT_BIRTH_CHANGED');for(const f of s.m.files){const file=path.join(s.directory,f.path),st=await lstat(file);need(st.isFile()&&!st.isSymbolicLink()&&await realpath(file)===file,'CANONICAL_ORACLE_MEMBER_REQUIRED');const b=await readFile(file);need(b.length===f.bytes&&H(b)===f.sha256,'ORACLE_MEMBER_CHANGED:'+f.path);}for(const x of s.external)need(await realpath(path.join(s.directory,'node_modules',x.name))===x.target,'DECLARED_EXTERNAL_TEST_PACKAGE_CHANGED');return true;}
export async function closeHistoricalOracle(token){const s=state(token);await verifyHistoricalOracle(token);await checkedInputs(s.sourceRoot);verifyDependencies();await rm(s.directory,{recursive:true,force:false});oracles.delete(token);return freeze({closed:true,sourceUnchanged:true,originalPinsUnchanged:true,scope:'TEST_SOURCE_ONLY_NO_PG'});}
