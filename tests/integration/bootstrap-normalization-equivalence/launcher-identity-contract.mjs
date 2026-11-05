/** Draft-only launcher binding. No OS observation, process launch, PG client,
 * environment mutation or accepted receipt exists in this module. */
import {readFile} from 'node:fs/promises';import {resolve} from 'node:path';import {createHash} from 'node:crypto';
import {parseStrictJson} from '../../../packages/application/src/unified-import-contract.ts';
import {renderNormalizationExperiment,SOURCE_PINS} from './render.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const need=(ok,message='LAUNCHER_IDENTITY_DRAFT_INVALID')=>{if(!ok)throw Error(message);};
const keys=(x,names)=>need(x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).sort().join(',')===[...names].sort().join(','));
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const decimal=x=>typeof x==='string'&&/^[1-9][0-9]*$/.test(x);
const uint=x=>Number.isSafeInteger(x)&&x>0;
const specs=new WeakMap();
export async function loadLauncherSourceContract(root){
 const rendered=await renderNormalizationExperiment(root),fixture=await readFile(resolve(root,'tests/integration/bootstrap-normalization-equivalence/fixture.psql'),'utf8');
 need(fixture===rendered,'LAUNCHER_FIXTURE_SOURCE_DIFFERS');
 need(fixture.split('\n').filter(x=>x.trim()&&!x.startsWith('--'))[0]==='\\quit 3','LAUNCHER_FIXTURE_MUST_REMAIN_DISABLED');
 const token=Object.freeze({profile:'BOOTSTRAP_NORMALIZATION_LAUNCHER_SOURCE_ONLY_V1'});
 specs.set(token,Object.freeze({fixtureSha256:hash(fixture),sourcePinsSha256:hash(JSON.stringify(SOURCE_PINS)),observerImplemented:false,executionEnabled:false}));return token;
}
export function describeLauncherSourceContract(token){need(specs.has(token),'LAUNCHER_GENUINE_SOURCE_CONTRACT_REQUIRED');return specs.get(token);}
export function validateLauncherIdentityDraft(text,token){
 const spec=describeLauncherSourceContract(token);
 need(typeof text==='string'&&Buffer.byteLength(text)<=65536,'LAUNCHER_DRAFT_BOUNDS');const d=parseStrictJson(text);
 keys(d,['format','runNonce','fixtureSha256','sourcePinsSha256','launcher','process','directory','connection','cluster','database','environment','observer','executionEnabled']);
 need(d.format==='DISPOSABLE_PG_LAUNCHER_IDENTITY_DRAFT_V1'&&hex(d.runNonce)&&d.fixtureSha256===spec.fixtureSha256&&d.sourcePinsSha256===spec.sourcePinsSha256&&d.executionEnabled===false);
 const directory='/tmp/erp-norm-'+d.runNonce.slice(0,16);
 keys(d.launcher,['executable','sha256','uid','pid','startIdentity']);
 need(d.launcher.executable==='/usr/bin/node'&&hex(d.launcher.sha256)&&uint(d.launcher.uid)&&uint(d.launcher.pid)&&typeof d.launcher.startIdentity==='string'&&/^[1-9][0-9]{0,19}$/.test(d.launcher.startIdentity));
 keys(d.process,['executable','sha256','uid','pid','parentPid','startIdentity','dataDirectory','socketDirectory','port','serverVersion']);
 need(d.process.executable==='/usr/lib/postgresql/17/bin/postgres'&&hex(d.process.sha256)&&d.process.uid===d.launcher.uid&&uint(d.process.pid)&&d.process.pid!==d.launcher.pid&&d.process.parentPid===d.launcher.pid&&typeof d.process.startIdentity==='string'&&/^[1-9][0-9]{0,19}$/.test(d.process.startIdentity));
 need(d.process.dataDirectory===directory+'/data'&&d.process.socketDirectory===directory+'/socket'&&Number.isInteger(d.process.port)&&d.process.port>1024&&d.process.port<=65535&&typeof d.process.serverVersion==='string'&&/^17[0-9]{4}$/.test(d.process.serverVersion));
 keys(d.directory,['root','data','socket','uid','device','inode','mode','symlink','priorContents','creationMethod','restoredFrom']);
 need(d.directory.root===directory&&d.directory.data===d.process.dataDirectory&&d.directory.socket===d.process.socketDirectory&&d.directory.uid===d.process.uid&&decimal(d.directory.device)&&decimal(d.directory.inode)&&d.directory.mode==='0700'&&d.directory.symlink===false&&d.directory.priorContents==='EMPTY'&&d.directory.creationMethod==='INITDB_NEW_DIRECTORY_ONLY'&&d.directory.restoredFrom===null);
 keys(d.connection,['transport','host','port','database','user','sessionUser','backendPid']);
 need(d.connection.transport==='UNIX_SOCKET'&&d.connection.host===d.process.socketDirectory&&d.connection.port===d.process.port&&d.connection.database==='synthetic_normalization_'+d.runNonce.slice(0,16)&&d.connection.user==='normalization_owner'&&d.connection.sessionUser===d.connection.user&&uint(d.connection.backendPid)&&d.connection.backendPid!==d.process.pid&&d.connection.backendPid!==d.launcher.pid);
 keys(d.cluster,['systemIdentifier','dataDirectory','postmasterPid','postmasterStartIdentity','serverVersion','inventory']);
 need(decimal(d.cluster.systemIdentifier)&&d.cluster.dataDirectory===d.process.dataDirectory&&d.cluster.postmasterPid===d.process.pid&&d.cluster.postmasterStartIdentity===d.process.startIdentity&&d.cluster.serverVersion===d.process.serverVersion);
 need(Array.isArray(d.cluster.inventory)&&d.cluster.inventory.length===4);
 const expectedNames=['postgres',d.connection.database,'template0','template1'].sort();
 need(JSON.stringify(d.cluster.inventory.map(x=>x.name).sort())===JSON.stringify(expectedNames));
 for(const item of d.cluster.inventory){keys(item,['name','userRelations','userRoutines','subscriptions','foreignServers','extensions','userSchemas']);need(item.userRelations===0&&item.userRoutines===0&&item.subscriptions===0&&item.foreignServers===0&&JSON.stringify(item.extensions)==='["plpgsql"]'&&JSON.stringify(item.userSchemas)==='["public"]');}
 keys(d.database,['name','oid','systemIdentifier','backendPid','user','sessionUser','ordinaryRole','roleMemberships','eventTriggers','applicationSchemaPresent','transactionState']);
 need(d.database.name===d.connection.database&&decimal(d.database.oid)&&d.database.systemIdentifier===d.cluster.systemIdentifier&&d.database.backendPid===d.connection.backendPid&&d.database.user===d.connection.user&&d.database.sessionUser===d.connection.sessionUser&&d.database.ordinaryRole===true&&JSON.stringify(d.database.roleMemberships)==='[]'&&d.database.eventTriggers===0&&d.database.applicationSchemaPresent===false&&d.database.transactionState==='IDLE');
 keys(d.environment,['LANG','LC_ALL','TZ']);need(d.environment.LANG==='C'&&d.environment.LC_ALL==='C'&&d.environment.TZ==='UTC');
 keys(d.observer,['format','receipt','authenticated']);need(d.observer.format==='INDEPENDENT_OBSERVER_NOT_IMPLEMENTED'&&d.observer.receipt===null&&d.observer.authenticated===false);
 return Object.freeze({structurallyValidDraft:true,identityAuthenticated:false,receiptAccepted:false,executionEnabled:false,fixtureSha256:spec.fixtureSha256});
}
// Deliberately no receipt issuer. Caller JSON, hashes, approval flags, source
// tokens and apparently matching OS/DB claims cannot grant execution authority.
export async function verifyDisposableClusterReceipt(){throw Error('TRUSTED_DISPOSABLE_CLUSTER_OBSERVER_UNIMPLEMENTED');}
export async function launchNormalizationExperiment(){throw Error('TRUSTED_DISPOSABLE_CLUSTER_OBSERVER_UNIMPLEMENTED');}
