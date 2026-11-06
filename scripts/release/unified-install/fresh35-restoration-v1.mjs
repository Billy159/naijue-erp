/** Restore-only protected record successor. No installation, account creation,
 * business SQL, import authority, external client or caller-issued completion. */
import {readFile,open,lstat} from 'node:fs/promises';
import {constants} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {parseStrictJson} from '../../../packages/application/src/unified-import-contract.ts';
import {assertTrustedRootPath,assertTrustedRootTree} from './trusted-install-path.mjs';
import {resolveFresh35ReferenceInputPaths,loadFresh35CombinedSource,describeFresh35CombinedSource,assertFresh35CombinedSourcesCurrent,combinedSha256 as hash} from './fresh35-combined-source-v1.mjs';
import {FRESH35_COMBINED_INTERFACE_ROLES,FRESH35_COMBINED_TARGET_MODULE_SHA256,bindFresh35RestoredTarget,assertFresh35RestoredTarget,describeFresh35CombinedTarget,fresh35CombinedBootstrapObserverSql,fresh35CombinedObserverGuard} from './fresh35-combined-target-v1.mjs';
import {buildFresh35CombinedCatalog,describeFresh35CombinedCatalog,assertFresh35CombinedCatalogCurrent,fresh35CombinedRestorationCatalogSql,validateFresh35CombinedRestorationCatalogObservation} from './fresh35-combined-catalog-v1.mjs';
import {assertInstallClientProtocolState} from './physical-adapter.mjs';
import {closePhysical} from '../../../tools/unified-import/whole-host-session.mjs';

const etc=process.platform==='darwin'?'/private/etc':'/etc';
export const FRESH35_RESTORATION_AUTHORIZATION_PATH=etc+'/naijue-erp/fresh35-restoration-v1.json';
const modulePath='scripts/release/unified-install/fresh35-restoration-v1.mjs';
const sourceRoot=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const loadedSha256=hash(await readFile(new URL(import.meta.url)));
const programs=new WeakMap(),completions=new WeakMap();
const need=(ok,code)=>{if(!ok)throw Error('FRESH35_RESTORATION_'+code)};
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x)}return x};
const own=(v,keys)=>v&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).length===keys.length&&keys.every(k=>{const d=Object.getOwnPropertyDescriptor(v,k);return d?.enumerable&&Object.hasOwn(d,'value')});
const q=x=>"'"+x.replaceAll("'","''")+"'";
const originKeys=['sourceInstallationRecordSha256','sourceSourceSetSha256','sourceProgramSha256','sourceTargetSha256','sourceCatalogSha256','databaseDumpSha256','backupReceiptSha256','databaseRestoreReceiptSha256','sourceRolesAclSha256'];
const roleKeys=['name','super','inherit','createRole','createDb','login','replication','bypass','limit','validUntil','config'];

/** Pure JSON consistency only. Passing here never issues a capability. */
export function validateFresh35RestorationOrigin(origin,target){
 const t=assertFresh35RestoredTarget(target);
 need(own(origin,originKeys)&&originKeys.every(k=>hex(origin[k])),'CLOSED_SOURCE_PROVENANCE_REQUIRED');
 need(['sourceInstallationRecordSha256','sourceTargetSha256','databaseDumpSha256','databaseRestoreReceiptSha256'].every(k=>origin[k]===t.restoration[k]),'SOURCE_PROVENANCE_DIFFERS');
 return freeze(structuredClone(origin));
}

export async function compileFresh35RestorationProgram({source,target,catalog,origin}){
 const s=describeFresh35CombinedSource(source),t=assertFresh35RestoredTarget(target),c=describeFresh35CombinedCatalog(catalog);
 need(origin?.sourceSourceSetSha256!==s.sourceSetSha256,'DISTINCT_RESTORE_SOURCE_REQUIRED');
 need(s.currentSourcePins.some(p=>p.path===modulePath&&p.sha256===loadedSha256),'LOADED_IMPLEMENTATION_SOURCE_DIFFERS');
 need(s.currentSourcePins.some(p=>p.path==='scripts/release/unified-install/fresh35-combined-target-v1.mjs'&&p.sha256===FRESH35_COMBINED_TARGET_MODULE_SHA256),'LOADED_TARGET_SOURCE_DIFFERS');
 await assertFresh35CombinedSourcesCurrent(source);await assertFresh35CombinedCatalogCurrent(catalog);
 const sql=fresh35CombinedRestorationCatalogSql(catalog,source,target);
 need(c.sourceSetSha256===s.sourceSetSha256&&c.completeMetadataGuard===true,'FULL_CATALOG_REQUIRED');
 const descriptor=freeze({format:'FRESH35_RESTORATION_PROGRAM_V1',sourceSetSha256:s.sourceSetSha256,targetSha256:hash(JSON.stringify(t)),catalogSpecSha256:c.catalogSpecSha256,origin:validateFresh35RestorationOrigin(origin,target),guardSqlSha256:hash(sql.guardSql),observationSqlSha256:hash(sql.observationSql),businessSchemaWrites:false,createsRoles:false,changesRuntimePrivileges:false,claimsSourceInstallCommit:false});
 const token=Object.freeze({profile:'FRESH35_RESTORATION_PROGRAM_V1'});
 programs.set(token,{source,target,catalog,sql,descriptor:freeze({...descriptor,programSha256:hash(JSON.stringify(descriptor))})});return token;
}
export function isFresh35RestorationProgram(program){return programs.has(program)}
export function describeFresh35RestorationProgram(program){need(programs.has(program),'GENUINE_PROGRAM_REQUIRED');return programs.get(program).descriptor}

/** Protected-loader structure check and genuine-program consistency check are
 * separate; JSON cannot become a physical observation or a completion. */
export function validateFresh35RestoredRecordShape(value){
 need(own(value,['format','restoredAt','binding','target','origin','programSha256','catalogSpecSha256','catalogSha256','rolesAclSha256','authorizationSha256','state']), 'CLOSED_RESTORED_RECORD_REQUIRED');
 need(value.format==='FRESH35_RESTORED_INSTALLATION_RECORD_V1'&&value.state==='RESTORED_FROM_VERIFIED_INSTALLATION'&&Number.isFinite(Date.parse(value.restoredAt)),'RESTORED_RECORD_STATE_REQUIRED');
 need(own(value.binding,['sourceSetSha256','targetSha256'])&&Object.values(value.binding).every(hex)&&own(value.origin,originKeys)&&Object.values(value.origin).every(hex),'RESTORED_RECORD_BINDING_REQUIRED');
 need(value.binding.sourceSetSha256!==value.origin.sourceSourceSetSha256,'DISTINCT_RESTORE_SOURCE_REQUIRED');
 need(['programSha256','catalogSpecSha256','catalogSha256','rolesAclSha256','authorizationSha256'].every(k=>hex(value[k]))&&value.target?.format==='FRESH35_RESTORED_TARGET_BINDING_V1'&&value.target?.purpose===value.state&&hash(JSON.stringify(value.target))===value.binding.targetSha256,'RESTORED_RECORD_TARGET_REQUIRED');
 need(Date.parse(value.restoredAt)>=value.target.startsAt&&Date.parse(value.restoredAt)<value.target.expiresAt,'RESTORED_RECORD_OBSERVATION_WINDOW_DIFFERS');
 return freeze(structuredClone(value));
}
export function validateFresh35RestoredRecord(value,program){
 const d=describeFresh35RestorationProgram(program),v=validateFresh35RestoredRecordShape(value);
 need(v.binding.sourceSetSha256===d.sourceSetSha256&&v.binding.targetSha256===d.targetSha256&&v.programSha256===d.programSha256&&v.catalogSpecSha256===d.catalogSpecSha256&&isDeepStrictEqual(v.origin,d.origin),'EXACT_RESTORATION_PROGRAM_REQUIRED');
 return v;
}

export function validateFresh35RestorationRoleAcl(actual,source,bootstrapRole){
 need(actual&&source&&Array.isArray(actual.roles)&&Array.isArray(source.roles)&&own(bootstrapRole,roleKeys)&&bootstrapRole.super===true&&bootstrapRole.login===true,'ROLE_ACL_SNAPSHOT_REQUIRED');
 need(!source.roles.some(r=>r.name===bootstrapRole.name),'DISTINCT_EXISTING_RESTORE_BOOTSTRAP_REQUIRED');
 const rest=actual.roles.filter(r=>r.name!==bootstrapRole.name),boot=actual.roles.filter(r=>r.name===bootstrapRole.name);
 need(boot.length===1&&isDeepStrictEqual(boot[0],bootstrapRole)&&isDeepStrictEqual(rest,source.roles),'EXACT_SOURCE_ROLES_PLUS_EXISTING_BOOTSTRAP_REQUIRED');
 const expected={...source,pgControlSystem:mapRestoredControlAcl(source.pgControlSystem,bootstrapRole.name)};
 need(isDeepStrictEqual({...actual,roles:source.roles},expected),'SOURCE_DATABASE_SCHEMA_OBJECT_ACL_DIFFERS');
 return hash(JSON.stringify(actual));
}

/** Source evidence remains immutable and describes the old physical target. */
export function validateFresh35RestorationInputs(a,sourceRecord,sourceDescriptor,sourceProgram,backup,restored,sourceRoles){
 need(a?.format==='FRESH35_RESTORATION_AUTHORIZATION_V1'&&a.decision==='AUTHORIZE_EXACT_VERIFIED_RESTORE_RECORD_ONCE','RESTORATION_DECISION_REQUIRED');
 need(own(sourceRecord,['format','installedAt','binding','target','transactionReceipt','programSha256','catalogSpecSha256','catalogSha256','authorizationSha256','state'])&&sourceRecord.format==='FRESH35_COMBINED_INSTALLATION_RECORD_V2'&&sourceRecord.state==='COMMITTED_AND_CATALOG_CHECKED'&&Number.isFinite(Date.parse(sourceRecord.installedAt)),'VERIFIED_SOURCE_INSTALL_REQUIRED');
 need(own(sourceRecord.binding,['sourceSetSha256','targetSha256'])&&Object.values(sourceRecord.binding).every(hex)&&['programSha256','catalogSpecSha256','catalogSha256','authorizationSha256'].every(k=>hex(sourceRecord[k]))&&sourceRecord.target?.format==='FRESH35_COMBINED_TARGET_BINDING_V2'&&sourceRecord.target?.purpose==='PRODUCTION_NEW_EMPTY_EXACT35','SOURCE_RECORD_BINDING_REQUIRED');
 const receipt=sourceRecord.transactionReceipt;need(own(receipt,['nonce','database','actor','transactionId','backendPid'])&&typeof receipt.nonce==='string'&&/^[a-f0-9]{48}$/.test(receipt.nonce)&&receipt.database===sourceRecord.target.proposal.database&&receipt.actor===sourceRecord.target.proposal.owner&&typeof receipt.transactionId==='string'&&/^[1-9][0-9]*$/.test(receipt.transactionId)&&Number.isSafeInteger(receipt.backendPid)&&receipt.backendPid>0,'ORIGINAL_SOURCE_TRANSACTION_EVIDENCE_REQUIRED');
 need(sourceDescriptor?.format==='FRESH35_COMBINED_CURRENT_SOURCE_V1'&&['capturedEvidenceAppliesToCurrentChanges','engineVerified','installationReady'].every(k=>sourceDescriptor[k]===false)&&sourceProgram?.format==='FRESH35_COMBINED_ATOMIC_PROGRAM_V1'&&sourceProgram.applicationTransactions===1&&['createsCluster','createsRoles','createsCredentials','oldTablesRemoved','hostEnabled'].every(k=>sourceProgram[k]===false)&&Array.isArray(sourceProgram.statements)&&sourceProgram.statements.length>0,'ORIGINAL_SOURCE_DESCRIPTOR_REQUIRED');
 need(sourceRecord.binding?.sourceSetSha256===sourceDescriptor?.sourceSetSha256&&sourceRecord.binding?.targetSha256===hash(JSON.stringify(sourceRecord.target))&&sourceRecord.programSha256===sourceProgram?.programSha256&&sourceProgram.targetSha256===sourceRecord.binding.targetSha256&&sourceProgram.sourceSetSha256===sourceRecord.binding.sourceSetSha256&&sourceProgram.catalogSha256===sourceRecord.catalogSpecSha256,'SOURCE_INSTALLATION_DESCRIPTOR_DIFFERS');
 need(hex(a.sourceSetSha256)&&a.sourceSetSha256!==sourceRecord.binding.sourceSetSha256,'DISTINCT_RESTORE_SOURCE_REQUIRED');
 const {programSha256,...body}=sourceProgram;need(hash(JSON.stringify(body))===programSha256,'SOURCE_PROGRAM_DIGEST_DIFFERS');
 const sourceKeys=['format','baseArtifacts','capturedSourcePins','currentSourcePins','currentSourceDelta','patches'];
 need(hash(JSON.stringify(Object.fromEntries(sourceKeys.map(k=>[k,sourceDescriptor[k]]))))===sourceDescriptor.sourceSetSha256,'SOURCE_DESCRIPTOR_DIGEST_DIFFERS');
 const t=a.target,p=sourceRecord.target.proposal;
 need(['database','owner','controller','runtime'].every(k=>t.proposal[k]===p[k])&&t.proposal.admin!==p.admin&&t.restoration.sourceAdmin===p.admin&&t.restoration.sourceSystemIdentifier===sourceRecord.target.physical.systemIdentifier&&t.physical.systemIdentifier!==sourceRecord.target.physical.systemIdentifier&&t.proposal.workspaceDirectory!==p.workspaceDirectory,'INDEPENDENT_RESTORED_TARGET_REQUIRED');
 need(backup?.format==='NEW35_LOGICAL_BACKUP_RESTORE_V1'&&backup.state==='BACKUP_CAPTURED_OFFLINE_TOC_ONLY'&&backup.mode==='backup'&&backup.installationRecordSha256===a.sourceRecord.sha256&&isDeepStrictEqual(backup.target,sourceRecord.target)&&backup.sourceSetSha256===sourceRecord.binding.sourceSetSha256,'EXACT_SOURCE_BACKUP_REQUIRED');
 need(backup.artifacts?.['database.dump']?.sha256===a.databaseDump.sha256&&backup.artifacts?.['source-catalog.private.json']?.sha256===a.sourceRolesAcl.sha256,'SOURCE_DUMP_AND_ROLE_ACL_DIFFERS');
 const closure=['database','rolesAuthAcl','app','media','configuration','installationAndSource','originalImport'];
 need(Array.isArray(backup.completeClosure)&&backup.completeClosure.length===closure.length&&closure.every(k=>backup.completeClosure.includes(k))&&isDeepStrictEqual(restored?.completeClosure,backup.completeClosure)&&['database.dump','roles-auth-acl.protected.sql','application.protected.pack','app-media-config.protected.tar','source-catalog.private.json','representative-source.private.json'].every(k=>backup.artifacts?.[k]?.bytes>0&&hex(backup.artifacts[k].sha256))&&restored?.opaqueFilesRestore?.extracted===true&&restored.opaqueFilesRestore.archiveSha256===backup.artifacts['app-media-config.protected.tar'].sha256,'COMPLETE_PROTECTED_RESTORE_CLOSURE_REQUIRED');
 need(restored?.format==='NEW35_LOGICAL_BACKUP_RESTORE_V1'&&restored.state==='DB_RESTORED_APP_NOT_VERIFIED'&&restored.mode==='restore'&&restored.backupReceiptSha256===a.backupReceipt.sha256&&restored.rolesAclCompared===true&&restored.ordinaryDatabaseRepresentativeRead==='PASS'&&restored.currentAppLoginRepresentativeRead==='NOT_TESTED'&&restored.restoredInstallationRecordCreated===false&&restored.sourceInstallationRecordReusableForRestore===false&&isDeepStrictEqual(restored.originalImport,backup.originalImport)&&isDeepStrictEqual(restored.backupArtifacts,backup.artifacts)&&isDeepStrictEqual(restored.sourceTarget,sourceRecord.target),'ACTUAL_COMPLETE_DATABASE_RESTORE_REQUIRED');
 need(['systemIdentifier','databaseOid','serverVersionNum','postmasterStart'].every(k=>restored.restoreTarget?.[k]===t.physical[k])&&restored.restoreTarget.database===t.proposal.database&&restored.restoreTarget.address===t.proposal.host&&restored.restoreTarget.port===t.proposal.port,'ACTUAL_RESTORE_PHYSICAL_TARGET_DIFFERS');
 need(backup.roleAclProjection==='INCLUDES_ATTACL_AND_CONTROL_SYSTEM_V1'&&restored.roleAclProjection===backup.roleAclProjection&&restored.controlSystemAclRestored===true&&restored.controlSystemAclNewConnectionReadback===true&&restored.builtinAclMapping?.sourceAdmin===p.admin&&restored.builtinAclMapping?.restoreAdmin===t.proposal.admin&&restored.builtinAclMapping?.function==='pg_catalog.pg_control_system()'&&restored.builtinAclMapping?.scope==='ONLY_BUILTIN_OWNER_GRANTOR_OID10','SOURCE_CONTROL_ACL_RESTORE_PROOF_REQUIRED');
 validateSourceControlAcl(sourceRoles?.pgControlSystem,p);
 validateOriginalRoleFrame(sourceRoles,p);
 need(sourceRoles&&Array.isArray(sourceRoles.roles)&&sourceRoles.roles.length===7&&sourceRoles.roles.some(r=>r.name===p.admin)&&a.restoreBootstrapRole.name===t.proposal.admin,'EXACT_ORIGINAL_ROLE_COHORT_REQUIRED');
 return freeze({sourceInstallationRecordSha256:a.sourceRecord.sha256,sourceSourceSetSha256:sourceRecord.binding.sourceSetSha256,sourceProgramSha256:sourceRecord.programSha256,sourceTargetSha256:sourceRecord.binding.targetSha256,sourceCatalogSha256:sourceRecord.catalogSha256,databaseDumpSha256:a.databaseDump.sha256,backupReceiptSha256:a.backupReceipt.sha256,databaseRestoreReceiptSha256:a.restoreReceipt.sha256,sourceRolesAclSha256:a.sourceRolesAcl.sha256});
}


function validateOriginalRoleFrame(snapshot,proposal){
 const flags=['super','inherit','createRole','createDb','replication','bypass'];
 for(const name of ['owner','controller','runtime']){const r=snapshot.roles.find(r=>r.name===proposal[name]);need(r&&flags.every(k=>r[k]===false)&&r.login===true&&r.limit===2,'ORIGINAL_LOGIN_ROLE_PRIVILEGES_DIFFER');}
 for(const name of Object.values(FRESH35_COMBINED_INTERFACE_ROLES)){const r=snapshot.roles.find(r=>r.name===name);need(r&&flags.every(k=>r[k]===false)&&r.login===false&&r.limit===0,'ORIGINAL_INTERFACE_ROLE_PRIVILEGES_DIFFER');}
 const admin=snapshot.roles.find(r=>r.name===proposal.admin);need(admin?.super===true&&admin.login===true,'ORIGINAL_ADMIN_ROLE_DIFFERS');
 const expected=[[FRESH35_COMBINED_INTERFACE_ROLES.initializer,proposal.controller,false,false,true],[FRESH35_COMBINED_INTERFACE_ROLES.importer,proposal.controller,false,false,true],[FRESH35_COMBINED_INTERFACE_ROLES.runtime,proposal.runtime,false,false,true]];
 const sorted=rows=>[...rows].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b),'en'));
 need(Array.isArray(snapshot.memberships)&&isDeepStrictEqual(sorted(snapshot.memberships),sorted(expected)),'ORIGINAL_ROLE_MEMBERSHIPS_DIFFER');
}
function validateSourceControlAcl(value,proposal){
 need(value?.function==='pg_catalog.pg_control_system()'&&value.owner===proposal.admin&&value.ownerOid==='10'&&value.language==='internal'&&value.source==='pg_control_system'&&value.securityDefiner===false&&value.returnsSet===false&&typeof value.definition==='string','ACTUAL_SOURCE_CONTROL_SYSTEM_REQUIRED');
 const expected=['admin','owner','controller','runtime'].map(k=>[proposal.admin,proposal[k],'EXECUTE',false]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b),'en'));
 need(Array.isArray(value.acl)&&isDeepStrictEqual([...value.acl].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b),'en')),expected),'SOURCE_CONTROL_EXEC_NO_PUBLIC_OR_EXTRA_ROLE');
}
function mapRestoredControlAcl(source,restoreAdmin){
 need(source?.function==='pg_catalog.pg_control_system()'&&typeof source.owner==='string'&&source.owner!==restoreAdmin&&Array.isArray(source.acl),'FIXED_CONTROL_SYSTEM_OWNER_MAPPING_REQUIRED');
 return {...source,owner:restoreAdmin,acl:source.acl.map(([grantor,grantee,privilege,grantable])=>[grantor===source.owner?restoreAdmin:grantor,grantee===source.owner?restoreAdmin:grantee,privilege,grantable]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b),'en'))};
}
export function fresh35RestorationOrdinaryProofSql(program){describeFresh35RestorationProgram(program);return roleAclSql}
export function validateFresh35RestorationOrdinaryProof(raw,record){
 validateFresh35RestoredRecordShape(record);need(typeof raw==='string'&&Buffer.byteLength(raw)<=16*1024*1024,'BOUNDED_ROLE_ACL_OBSERVATION_REQUIRED');
 need(hash(JSON.stringify(parseStrictJson(raw)))===record.rolesAclSha256,'ORDINARY_RESTORED_ROLE_ACL_GENERATION_DIFFERS');return true;
}

const fileIdentity=s=>[s.dev,s.ino,s.uid,s.mode,s.nlink,s.size,s.mtimeNs,s.ctimeNs].map(String).join(':');
async function protectedBytes(path,{privateFile=false,max=16*1024*1024}={}){
 await assertTrustedRootPath(path);const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{const before=await file.stat({bigint:true});need(before.isFile()&&before.uid===0n&&before.nlink===1n&&(before.mode&0o022n)===0n&&(!privateFile||(before.mode&0o077n)===0n)&&before.size>0n&&before.size<=BigInt(max),'PROTECTED_FILE_REQUIRED');
  const bytes=await file.readFile(),after=await file.stat({bigint:true}),current=await lstat(path,{bigint:true});need(BigInt(bytes.length)===before.size&&fileIdentity(before)===fileIdentity(after)&&fileIdentity(before)===fileIdentity(current),'PROTECTED_FILE_CHANGED');return {bytes,identity:fileIdentity(before)};
 }finally{await file.close()}
}
async function pinnedJson(ref){need(own(ref,['path','sha256'])&&typeof ref.path==='string'&&resolve(ref.path)===ref.path&&hex(ref.sha256),'PINNED_SOURCE_REFERENCE_REQUIRED');const loaded=await protectedBytes(ref.path);need(hash(loaded.bytes)===ref.sha256,'SOURCE_REFERENCE_CHANGED');return parseStrictJson(loaded.bytes.toString('utf8'))}
async function actualDump(ref,deadline){
 need(own(ref,['path','sha256'])&&hex(ref.sha256),'PINNED_DUMP_REQUIRED');await assertTrustedRootPath(ref.path);const f=await open(ref.path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{const before=await f.stat({bigint:true});need(before.isFile()&&before.uid===0n&&before.nlink===1n&&(before.mode&0o077n)===0n&&before.size>5n,'PRIVATE_DUMP_REQUIRED');const h=createHash('sha256'),buffer=Buffer.alloc(1024*1024);let position=0;
  for(;;){need(Date.now()<deadline,'AUTHORIZATION_WINDOW_EXPIRED');const {bytesRead}=await f.read(buffer,0,buffer.length,position);if(!bytesRead)break;if(position===0)need(buffer.subarray(0,5).toString()==='PGDMP','CUSTOM_DUMP_REQUIRED');h.update(buffer.subarray(0,bytesRead));position+=bytesRead;}
  need(h.digest('hex')===ref.sha256&&BigInt(position)===before.size&&fileIdentity(await f.stat({bigint:true}))===fileIdentity(before)&&fileIdentity(await lstat(ref.path,{bigint:true}))===fileIdentity(before),'ACTUAL_DUMP_CHANGED');
 }finally{await f.close()}
}

// The first package's normalized, password-free ACL observation, reused verbatim
// below. Root reads all roles, then permits exactly the existing restore bootstrap.
const roleAclSql=`SELECT json_build_object('roles',(SELECT json_agg(json_build_object('name',r.rolname,
     'super',r.rolsuper,'inherit',r.rolinherit,'createRole',r.rolcreaterole,'createDb',r.rolcreatedb,
     'login',r.rolcanlogin,'replication',r.rolreplication,'bypass',r.rolbypassrls,'limit',r.rolconnlimit,
     'validUntil',r.rolvaliduntil::text,'config',r.rolconfig) ORDER BY r.rolname) FROM pg_roles r WHERE r.rolname !~ '^pg_'),
     'memberships',(SELECT COALESCE(json_agg(json_build_array(p.rolname,r.rolname,m.admin_option,m.inherit_option,m.set_option)
     ORDER BY p.rolname,r.rolname),'[]'::json) FROM pg_auth_members m JOIN pg_roles p ON p.oid=m.roleid
     JOIN pg_roles r ON r.oid=m.member WHERE r.rolname !~ '^pg_'),
     'database',(SELECT json_build_object('name',datname,'owner',pg_get_userbyid(datdba),'acl',datacl::text)
     FROM pg_database WHERE datname=current_database()),
     'schemas',(SELECT json_agg(json_build_array(nspname,pg_get_userbyid(nspowner),nspacl::text) ORDER BY nspname)
     FROM pg_namespace WHERE nspname='naijue_erp'),
     'relations',(SELECT json_agg(json_build_array(c.relname,c.relkind,pg_get_userbyid(c.relowner),c.relacl::text,
     c.relrowsecurity,c.relforcerowsecurity) ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='naijue_erp'),
     'columnAcls',(SELECT json_agg(json_build_array(c.relname,a.attname,a.attnum,a.attacl::text) ORDER BY c.relname,a.attnum)
     FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='naijue_erp' AND a.attnum>0 AND NOT a.attisdropped),
     'pgControlSystem',(SELECT json_build_object('function','pg_catalog.pg_control_system()',
      'owner',pg_get_userbyid(p.proowner),'ownerOid',p.proowner::text,'language',l.lanname,
      'source',p.prosrc,'securityDefiner',p.prosecdef,'returnsSet',p.proretset,
      'definition',pg_get_functiondef(p.oid),'acl',(SELECT json_agg(json_build_array(
      pg_get_userbyid(x.grantor),CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,
      x.privilege_type,x.is_grantable) ORDER BY x.grantor::regrole::text COLLATE "C",
      CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END COLLATE "C",x.privilege_type)
      FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x))
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
      WHERE n.nspname='pg_catalog' AND p.proname='pg_control_system' AND p.pronargs=0),
     'functions',(SELECT json_agg(json_build_array(p.proname,pg_get_function_identity_arguments(p.oid),
     pg_get_userbyid(p.proowner),p.proacl::text,p.prosecdef,p.proconfig) ORDER BY p.proname,pg_get_function_identity_arguments(p.oid))
     FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='naijue_erp'),
     'defaults',(SELECT COALESCE(json_agg(json_build_array(pg_get_userbyid(d.defaclrole),n.nspname,d.defaclobjtype,d.defaclacl::text)
     ORDER BY pg_get_userbyid(d.defaclrole),n.nspname,d.defaclobjtype),'[]'::json) FROM pg_default_acl d
     LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace WHERE n.nspname='naijue_erp' OR d.defaclnamespace=0))::text AS restoration_json`;

const identitySql=`SELECT json_build_object('systemIdentifier',(pg_control_system()).system_identifier::text,'databaseOid',(SELECT oid::text FROM pg_database WHERE datname=current_database()),'serverVersionNum',current_setting('server_version_num'),'postmasterStart',pg_postmaster_start_time()::text,'database',current_database(),'currentUser',current_user,'sessionUser',session_user,'address',host(inet_server_addr()),'port',inet_server_port(),'roleOid',(SELECT oid::text FROM pg_roles WHERE rolname=current_user),'superuser',(SELECT rolsuper FROM pg_roles WHERE rolname=current_user),'recovery',pg_is_in_recovery(),'readOnly',current_setting('transaction_read_only'),'isolation',current_setting('transaction_isolation'),'replicationRole',current_setting('session_replication_role'))::text AS restoration_json`;

export function validateFresh35RestorationPhysical(row,target){
 const t=assertFresh35RestoredTarget(target);need(row&&['systemIdentifier','databaseOid','serverVersionNum','postmasterStart'].every(k=>row[k]===t.physical[k])&&row.database===t.proposal.database&&row.currentUser===t.proposal.admin&&row.sessionUser===t.proposal.admin&&row.address===t.proposal.host&&row.port===t.proposal.port&&row.roleOid==='10'&&row.superuser===true&&row.recovery===false&&row.readOnly==='on'&&row.isolation==='repeatable read'&&row.replicationRole==='origin','ACTUAL_RESTORATION_IDENTITY_DIFFERS');return true;
}

function validateAuthority(a,now){
 need(own(a,['format','decision','sourceSetSha256','sourceRecord','sourceDescriptor','sourceProgram','backupReceipt','restoreReceipt','sourceRolesAcl','databaseDump','target','restoreBootstrapRole','startsAt','expiresAt','independentSafetyReviewSha256','authorizationReference'])&&a.format==='FRESH35_RESTORATION_AUTHORIZATION_V1'&&a.decision==='AUTHORIZE_EXACT_VERIFIED_RESTORE_RECORD_ONCE'&&hex(a.sourceSetSha256)&&hex(a.independentSafetyReviewSha256)&&typeof a.authorizationReference==='string'&&a.authorizationReference.trim().length>0&&a.authorizationReference.length<=512,'EXTERNAL_RESTORATION_AUTHORIZATION_REQUIRED');
 need([a.startsAt,a.expiresAt,now].every(Number.isSafeInteger)&&a.startsAt<=now&&now<a.expiresAt&&a.expiresAt-a.startsAt<=1200000&&a.startsAt===a.target.startsAt&&a.expiresAt===a.target.expiresAt,'AUTHORIZATION_WINDOW_EXPIRED');
}

function importReadSql(i){
 need(i&&['batchId','documentBatchId','initializerOperationId'].every(k=>typeof i[k]==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(i[k]))&&hex(i.packageSha256)&&hex(i.planSha256)&&typeof i.initializerRequestKey==='string','ORIGINAL_IMPORT_BINDING_REQUIRED');
 return `SELECT json_build_object('batchCount',(SELECT count(*) FROM naijue_erp.import_batch WHERE id IN(${q(i.batchId)}::uuid,${q(i.documentBatchId)}::uuid) AND status='IMPORTED' AND source_hash=${q(i.packageSha256)}),'originalReceipt',EXISTS(SELECT 1 FROM naijue_erp.operation_receipt r JOIN naijue_erp.audit_change a ON a.operation_id=r.id WHERE r.id=${q(i.initializerOperationId)}::uuid AND r.request_key=${q(i.initializerRequestKey)} AND r.status='COMMITTED' AND a.after_values->'request'->>'package_manifest_sha256'=${q(i.packageSha256)} AND a.after_values->'request'->>'plan_sha256'=${q(i.planSha256)}))::text AS restoration_json`;
}

/** Only this fixed, root, native-client factory can issue a completion. Neither
 * client, I/O implementation, proof callback nor parsed completion is accepted. */
export async function runFresh35Restoration(){
 need(process.platform==='linux'&&process.getuid?.()===0&&process.geteuid?.()===0&&process.version==='v24.21.0','TRUSTED_NATIVE_ROOT_RUNTIME_REQUIRED');
 need(!Object.keys(process.env).some(k=>k==='NODE_OPTIONS'||k==='NODE_PATH'||k==='DATABASE_URL'||k.startsWith('PG')||k.startsWith('LD_')||k.startsWith('DYLD_')),'CLEAN_RUNTIME_REQUIRED');
 await assertTrustedRootTree(sourceRoot);await assertTrustedRootPath(process.execPath);
 const loaded=await protectedBytes(FRESH35_RESTORATION_AUTHORIZATION_PATH,{privateFile:true,max:65536}),a=parseStrictJson(loaded.bytes.toString('utf8'));
 validateAuthority(a,Date.now());const target=bindFresh35RestoredTarget(a.target),t=assertFresh35RestoredTarget(target);
 const sourceRecord=await pinnedJson(a.sourceRecord),sourceDescriptor=await pinnedJson(a.sourceDescriptor),sourceProgram=await pinnedJson(a.sourceProgram),backup=await pinnedJson(a.backupReceipt),restored=await pinnedJson(a.restoreReceipt),sourceRoles=await pinnedJson(a.sourceRolesAcl);
 const origin=validateFresh35RestorationInputs(a,sourceRecord,sourceDescriptor,sourceProgram,backup,restored,sourceRoles);await actualDump(a.databaseDump,a.expiresAt);
 const paths=await resolveFresh35ReferenceInputPaths(t.ordinary.referenceDirectory),source=await loadFresh35CombinedSource(sourceRoot,{baselineDirectory:paths.baselineDirectory});need(describeFresh35CombinedSource(source).sourceSetSha256===a.sourceSetSha256,'CURRENT_RESTORE_SOURCE_DIFFERS');
 const catalog=await buildFresh35CombinedCatalog(source,target,paths),program=await compileFresh35RestorationProgram({source,target,catalog,origin}),p=programs.get(program);
 const connection=parseStrictJson((await protectedBytes(join(t.proposal.workspaceDirectory,'credentials','restore-connection.json'),{privateFile:true,max:65536})).bytes.toString('utf8'));
 need(own(connection,['host','port','database','user','password'])&&['host','port','database'].every(k=>connection[k]===t.proposal[k])&&connection.user===t.proposal.admin&&typeof connection.password==='string'&&connection.password.length>0,'EXACT_EXISTING_RESTORE_BOOTSTRAP_CONNECTION_REQUIRED');
 const {FRESH35_COMBINED_RECORD_PATH,FRESH35_COMBINED_RECORD_MODULE_SHA256}=await import('./fresh35-combined-record-v1.mjs');
 need(describeFresh35CombinedSource(source).currentSourcePins.some(p=>p.path==='scripts/release/unified-install/fresh35-combined-record-v1.mjs'&&p.sha256===FRESH35_COMBINED_RECORD_MODULE_SHA256),'LOADED_PUBLISHER_SOURCE_DIFFERS');
 try{await lstat(FRESH35_COMBINED_RECORD_PATH);throw Error('FRESH35_RESTORATION_RECORD_ALREADY_EXISTS')}catch(e){if(e.code!=='ENOENT')throw e}
 const current=async()=>{validateAuthority(a,Date.now());need((await protectedBytes(FRESH35_RESTORATION_AUTHORIZATION_PATH,{privateFile:true,max:65536})).identity===loaded.identity,'AUTHORIZATION_CHANGED');await assertFresh35CombinedSourcesCurrent(source);await assertFresh35CombinedCatalogCurrent(catalog)};
 await current();const used=await open(FRESH35_RESTORATION_AUTHORIZATION_PATH+'.consumed',constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);try{await used.writeFile(hash(loaded.bytes)+'\n');await used.sync()}finally{await used.close()}
 const {Client}=await import('pg'),client=new Client({...connection,password:()=>connection.password,ssl:false,application_name:'fresh35-restored-record',connectionTimeoutMillis:5000,query_timeout:45000,statement_timeout:40000,lock_timeout:5000,options:'-c search_path=pg_catalog -c TimeZone=UTC'});
 let began=false,closed=false,raw,rolesAclSha256;
 const query=async sql=>{await current();assertInstallClientProtocolState(client);const result=await client.query(sql);assertInstallClientProtocolState(client);return result};
 const ack=(result,tag)=>need(result?.command===tag,'NATIVE_'+tag+'_ACK_REQUIRED');
 const one=result=>{ack(result,'SELECT');need(result.rows?.length===1&&typeof result.rows[0].restoration_json==='string','ONE_NATIVE_OBSERVATION_REQUIRED');return parseStrictJson(result.rows[0].restoration_json)};
 try{
  await client.connect();need(client instanceof Client&&Object.getPrototypeOf(client)===Client.prototype&&client.query===Client.prototype.query&&client._connected===true,'ORIGINAL_NATIVE_CLIENT_REQUIRED');assertInstallClientProtocolState(client,{idle:true});
  ack(await query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'),'BEGIN');began=true;
  validateFresh35RestorationPhysical(one(await query(identitySql)),target);
  const roleRows=one(await query(roleAclSql));rolesAclSha256=validateFresh35RestorationRoleAcl(roleRows,sourceRoles,a.restoreBootstrapRole);
  const imported=one(await query(importReadSql(restored.originalImport)));need(imported.batchCount===2&&imported.originalReceipt===true,'ORIGINAL_RESTORED_IMPORT_CLOSURE_DIFFERS');
  const observer=one(await query("SELECT json_build_object('count',count(*))::text AS restoration_json FROM pg_catalog.pg_proc WHERE pronamespace='pg_catalog'::regnamespace AND proname='fresh35_exclusive_backends'"));
  ack(await query('ROLLBACK'),'ROLLBACK');began=false;
  if(observer.count===0){
   const installed=await query(fresh35CombinedBootstrapObserverSql(target));need(Array.isArray(installed)&&installed.at(-1)?.command==='COMMIT'&&client.getTransactionStatus()==='I','OBSERVER_RESTORE_OUTCOME_UNKNOWN');
  }else{need(observer.count===1,'OBSERVER_UNKNOWN_OBJECT_REFUSED');ack(await query(fresh35CombinedObserverGuard(target)),'DO')}
  ack(await query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'),'BEGIN');began=true;
  validateFresh35RestorationPhysical(one(await query(identitySql)),target);
  need(validateFresh35RestorationRoleAcl(one(await query(roleAclSql)),sourceRoles,a.restoreBootstrapRole)===rolesAclSha256,'ROLE_ACL_CHANGED_DURING_RESTORATION');
  const guarded=await query(p.sql.guardSql);need(Array.isArray(guarded)&&guarded.length===2&&guarded.every(r=>r?.command==='DO'),'COMPLETE_TARGET_AND_CATALOG_GUARD_ACK_REQUIRED');const observed=await query(p.sql.observationSql);ack(observed,'SELECT');need(observed.rows?.length===1,'ONE_COMPLETE_CATALOG_REQUIRED');raw=observed.rows[0].catalog_json;
  validateFresh35CombinedRestorationCatalogObservation(raw,catalog,source,target);ack(await query('ROLLBACK'),'ROLLBACK');began=false;
  await closePhysical(client);closed=true;await current();
  const {publishInstallationRecord}=await import('./publish-installation-record.mjs');
  await publishInstallationRecord(join(t.proposal.workspaceDirectory,'restoration-program.json'),JSON.stringify(describeFresh35RestorationProgram(program)));
  await publishInstallationRecord(join(t.proposal.workspaceDirectory,'restoration-catalog.json'),raw);
  const token=Object.freeze({profile:'FRESH35_RESTORATION_COMPLETION_V1'});
  const descriptor=describeFresh35RestorationProgram(program);
  const record=freeze({format:'FRESH35_RESTORED_INSTALLATION_RECORD_V1',restoredAt:new Date().toISOString(),binding:{sourceSetSha256:descriptor.sourceSetSha256,targetSha256:descriptor.targetSha256},target:t,origin:descriptor.origin,programSha256:descriptor.programSha256,catalogSpecSha256:descriptor.catalogSpecSha256,catalogSha256:hash(raw),rolesAclSha256,authorizationSha256:hash(loaded.bytes),state:'RESTORED_FROM_VERIFIED_INSTALLATION'});
  validateFresh35RestoredRecord(record,program);completions.set(token,{record,sourceRoot,recordModuleSha256:FRESH35_COMBINED_RECORD_MODULE_SHA256,current});return token;
 }finally{try{if(began)try{await client.query('ROLLBACK')}catch{}}finally{if(!closed)await closePhysical(client)}}
}

export function isFresh35RestorationCompletion(value){return completions.has(value)}
export function describeFresh35RestorationCompletion(value){need(completions.has(value),'GENUINE_PHYSICAL_RESTORATION_COMPLETION_REQUIRED');const c=completions.get(value);return Object.freeze({record:c.record,sourceRoot:c.sourceRoot,recordModuleSha256:c.recordModuleSha256})}
export async function assertFresh35RestorationCompletionCurrent(value){need(completions.has(value),'GENUINE_PHYSICAL_RESTORATION_COMPLETION_REQUIRED');await completions.get(value).current()}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{need(process.argv.length===3&&process.argv[2]==='--execute-restored-record','FIXED_RESTORATION_ENTRY_REQUIRED');const completion=await runFresh35Restoration();const {publishFresh35CombinedRecord}=await import('./fresh35-combined-record-v1.mjs');const result=await publishFresh35CombinedRecord(completion);process.stdout.write(JSON.stringify({state:result.state,recordSha256:result.recordSha256,recordKind:'RESTORED_FROM_VERIFIED_INSTALLATION',applicationVerified:false,automaticRetry:false})+'\n')}
 catch{process.stderr.write('{"state":"RESTORATION_FAILED_OR_PUBLICATION_UNKNOWN","automaticRetry":false,"applicationVerified":false}\n');process.exitCode=2}
}
