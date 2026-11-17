"""Supplemental fixed37 filesystem metadata only; never invoke Node/PG/business."""
from pathlib import Path
import errno,json,os,stat,struct,sys
SERVICE={'containerId': '4ec61582c6dc2856b3d843d47af15c73a6cb65355c6f5916a2d386adca251fd6', 'containerStartedAt': '2026-11-16T23:08:51.161418347Z', 'postmasterStart': '2026-11-16 23:08:52.417902+00', 'proofSha256': 'cba7c6cbe81503d054f00c03a9c2a8bd7943bf86be8c3f29df6db3a49fc02527', 'serviceKey': 't45-first-r3-native-service-start-20261116-37'}
SLOTS=[{'container': '/var/lib/naijue-erp/fresh35-production/final33-private/t45-r3-final33-plan-prepare-20261116-03/scratch', 'host': '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/final33-private/t45-r3-final33-plan-prepare-20261116-03/scratch', 'note': None, 'required': 'read_write_search', 'slot': 'SCRATCH_DIRECTORY', 'stage': 'PREPARE_CALL'}, {'container': '/var/lib/naijue-erp/fresh35-production/r3-final33-private-import-input-20261116-01/package/standard-preflight-20261116-1140-r1/index.sqlite', 'host': '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/r3-final33-private-import-input-20261116-01/package/standard-preflight-20261116-1140-r1/index.sqlite', 'note': 'Index opened readonly only later; summary/manifest succeeded in PREPARE_READERS before reported error.', 'required': 'read', 'slot': 'INPUT_INDEX', 'stage': 'PREPARE_CALL'}, {'container': '/var/lib/naijue-erp/fresh35-production/r3-final33-private-import-input-20261116-01/package/standard-preflight-20261116-1140-r1/index.sqlite-wal', 'host': '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/r3-final33-private-import-input-20261116-01/package/standard-preflight-20261116-1140-r1/index.sqlite-wal', 'note': None, 'required': 'existence_only', 'slot': 'INDEX_SIDECAR_WAL', 'stage': 'PREPARE_CALL'}, {'container': '/var/lib/naijue-erp/fresh35-production/r3-final33-private-import-input-20261116-01/package/standard-preflight-20261116-1140-r1/index.sqlite-shm', 'host': '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/r3-final33-private-import-input-20261116-01/package/standard-preflight-20261116-1140-r1/index.sqlite-shm', 'note': None, 'required': 'existence_only', 'slot': 'INDEX_SIDECAR_SHM', 'stage': 'PREPARE_CALL'}, {'container': '/var/lib/naijue-erp/fresh35-production/r3-final33-private-import-input-20261116-01/package/standard-preflight-20261116-1140-r1/index.sqlite-journal', 'host': '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/r3-final33-private-import-input-20261116-01/package/standard-preflight-20261116-1140-r1/index.sqlite-journal', 'note': None, 'required': 'existence_only', 'slot': 'INDEX_SIDECAR_JOURNAL', 'stage': 'PREPARE_CALL'}, {'container': '/etc/naijue-erp/fresh35-combined-installation-v1.json', 'host': '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/t45-first-r3-native-service-start-20261116-37/authority-61035/fresh35-combined-installation-v1.json', 'note': 'Preparation authority was removed by successful nativeAuthorityRemoved cleanup; absence now is not the error cause.', 'required': 'read', 'slot': 'INSTALL_RECORD', 'stage': 'PREPARE_CALL'}, {'container': '/etc/naijue-erp/fresh35-admin154-successor-v1.json', 'host': '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/t45-first-r3-native-service-start-20261116-37/authority-61035/fresh35-admin154-successor-v1.json', 'note': 'Preparation authority was removed by successful nativeAuthorityRemoved cleanup; absence now is not the error cause.', 'required': 'read', 'slot': 'ADMIN154_RECORD', 'stage': 'PREPARE_CALL'}, {'container': '/etc/naijue-erp/fresh35-compact-zero-successor-v2.json', 'host': '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/t45-first-r3-native-service-start-20261116-37/authority-61035/fresh35-compact-zero-successor-v2.json', 'note': 'Preparation authority was removed by successful nativeAuthorityRemoved cleanup; absence now is not the error cause.', 'required': 'read', 'slot': 'COMPACT_ZERO_RECORD', 'stage': 'PREPARE_CALL'}, {'container': '/etc/naijue-erp/fresh35-batched-preparation-v1.json', 'host': '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/t45-first-r3-native-service-start-20261116-37/authority-61035/fresh35-batched-preparation-v1.json', 'note': 'Preparation authority was removed by successful nativeAuthorityRemoved cleanup; absence now is not the error cause.', 'required': 'read', 'slot': 'NATIVE_PREPARATION_AUTHORITY', 'stage': 'PREPARE_CALL'}, {'container': '/var/lib/naijue-erp/fresh35-production/installed-real-operation-batched-root06-20261116-01/operation', 'host': '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/installed-real-operation-batched-root06-20261116-01/operation', 'note': None, 'required': 'read_search', 'slot': 'ROOT06_OPERATION_ROOT', 'stage': 'PREPARE_CALL'}, {'container': '/var/lib/naijue-erp/fresh35-production/installed-real-operation-51724553-20261114-01/operation/node_modules', 'host': '/srv/naijue-erp/isolated-targets/r3-e894-linux-deps-check-20261110-01/payload/node_modules', 'note': 'Host mapping is declared source; caller verifies actual C37 Mounts before treating host/container correspondence as observed.', 'required': 'read_search', 'slot': 'LINUX_PG_DRIVER_ROOT', 'stage': 'PREPARE_CALL'}, {'container': '/var/lib/naijue-erp/fresh35-production/installed-real-operation-51724553-20261114-01/operation/node_modules/.package-lock.json', 'host': '/srv/naijue-erp/isolated-targets/r3-e894-linux-deps-check-20261110-01/payload/node_modules/.package-lock.json', 'note': 'Host mapping is declared source; caller verifies actual C37 Mounts before treating host/container correspondence as observed.', 'required': 'read', 'slot': 'LINUX_PG_LOCKFILE', 'stage': 'PREPARE_CALL'}, {'container': '/var/lib/naijue-erp/fresh35-production/installed-real-operation-51724553-20261114-01/operation/node_modules/pg/esm/index.mjs', 'host': '/srv/naijue-erp/isolated-targets/r3-e894-linux-deps-check-20261110-01/payload/node_modules/pg/esm/index.mjs', 'note': 'Host mapping is declared source; caller verifies actual C37 Mounts before treating host/container correspondence as observed.', 'required': 'read', 'slot': 'LINUX_PG_ESM_ENTRY', 'stage': 'PREPARE_CALL'}, {'container': '/var/lib/naijue-erp/fresh35-production/installed-real-operation-51724553-20261114-01/operation/node_modules/pg/lib/index.js', 'host': '/srv/naijue-erp/isolated-targets/r3-e894-linux-deps-check-20261110-01/payload/node_modules/pg/lib/index.js', 'note': 'Host mapping is declared source; caller verifies actual C37 Mounts before treating host/container correspondence as observed.', 'required': 'read', 'slot': 'LINUX_PG_CJS_ENTRY', 'stage': 'PREPARE_CALL'}, {'container': '/opt/naijue-erp/fresh35-combined-v1/reference-inputs', 'host': None, 'note': None, 'required': 'read_search', 'slot': 'REFERENCE_ROOT', 'stage': 'PREPARE_CALL'}, {'container': '/opt/naijue-erp/fresh35-combined-v1/reference-inputs/INDEX.json', 'host': None, 'note': None, 'required': 'read', 'slot': 'REFERENCE_INDEX', 'stage': 'PREPARE_CALL'}, {'container': '/opt/naijue-erp/fresh35-combined-v1/reference-inputs/fresh35-install-review-plan-20261105-r2/00-BLOCKED-entry.sql', 'host': None, 'note': None, 'required': 'read', 'slot': 'REFERENCE_FIXED_1', 'stage': 'PREPARE_CALL'}, {'container': '/opt/naijue-erp/fresh35-combined-v1/reference-inputs/fresh35-install-review-plan-20261105-r2/01-schema-REVIEW-ONLY.sql', 'host': None, 'note': None, 'required': 'read', 'slot': 'REFERENCE_FIXED_2', 'stage': 'PREPARE_CALL'}, {'container': '/opt/naijue-erp/fresh35-combined-v1/reference-inputs/fresh35-install-review-plan-20261105-r2/02-lineage-REVIEW-ONLY.sql', 'host': None, 'note': None, 'required': 'read', 'slot': 'REFERENCE_FIXED_3', 'stage': 'PREPARE_CALL'}, {'container': '/opt/naijue-erp/fresh35-combined-v1/reference-inputs/fresh35-install-review-plan-20261105-r2/candidate-source-pins.json', 'host': None, 'note': None, 'required': 'read', 'slot': 'REFERENCE_FIXED_4', 'stage': 'PREPARE_CALL'}, {'container': '/opt/naijue-erp/fresh35-combined-v1/reference-inputs/fresh35-install-review-plan-20261105-r2/expected-core-metadata.json', 'host': None, 'note': None, 'required': 'read', 'slot': 'REFERENCE_FIXED_5', 'stage': 'PREPARE_CALL'}, {'container': '/opt/naijue-erp/fresh35-combined-v1/reference-inputs/fresh35-install-review-plan-20261105-r2/expected-declared-metadata.json', 'host': None, 'note': None, 'required': 'read', 'slot': 'REFERENCE_FIXED_6', 'stage': 'PREPARE_CALL'}, {'container': '/opt/naijue-erp/fresh35-combined-v1/reference-inputs/fresh35-install-review-plan-20261105-r2/migration-lineage.json', 'host': None, 'note': None, 'required': 'read', 'slot': 'REFERENCE_FIXED_7', 'stage': 'PREPARE_CALL'}, {'container': '/opt/naijue-erp/fresh35-combined-v1/reference-inputs/fresh35-v2-guard-schema-review-20261105-r2/expected-catalog-model.json', 'host': None, 'note': None, 'required': 'read', 'slot': 'REFERENCE_FIXED_8', 'stage': 'PREPARE_CALL'}, {'container': '/opt/naijue-erp/fresh35-combined-v1/reference-inputs/cloud-pg-schema178v2-20261105-r2/evidence/functions.json', 'host': None, 'note': None, 'required': 'read', 'slot': 'REFERENCE_FIXED_9', 'stage': 'PREPARE_CALL'}]
C05='/var/lib/naijue-erp/fresh35-production/real-first-20261110-r3'
def error_code(error):
 return {errno.EACCES:'EACCES',errno.EPERM:'EPERM',errno.ENOENT:'ENOENT',errno.ENOTDIR:'ENOTDIR',errno.ELOOP:'ELOOP',errno.ENOTSUP:'ENOTSUP'}.get(getattr(error,'errno',None),'OTHER')
def acl(path):
 result={}
 for name in ('system.posix_acl_access','system.posix_acl_default'):
  try:raw=os.getxattr(path,name,follow_symlinks=False)
  except OSError as e:
   if e.errno==getattr(errno,'ENODATA',61):result[name]={'state':'ABSENT'}
   else:result[name]={'state':error_code(e)}
   continue
  if len(raw)>4096 or len(raw)<4 or (len(raw)-4)%8 or struct.unpack_from('<I',raw)[0]!=2:result[name]={'state':'UNSUPPORTED_FORMAT'};continue
  entries=[]
  for off in range(4,len(raw),8):
   tag,perm,ident=struct.unpack_from('<HHI',raw,off);entries.append({'tag':tag,'permissions':perm,'numericId':None if ident==4294967295 else ident})
  result[name]={'state':'PRESENT','entries':entries}
 return result
def meta(path):
 try:
  s=path.lstat();return dict(state='PRESENT',device=s.st_dev,inode=s.st_ino,uid=s.st_uid,gid=s.st_gid,mode=stat.S_IMODE(s.st_mode),nlink=s.st_nlink,bytes=s.st_size,type='DIRECTORY'if stat.S_ISDIR(s.st_mode)else'REGULAR'if stat.S_ISREG(s.st_mode)else'SYMLINK'if stat.S_ISLNK(s.st_mode)else'OTHER',acl=acl(path))
 except OSError as e:return dict(state=error_code(e))
def user_checks(paths):
 rd,wr=os.pipe();pid=os.fork()
 if pid==0:
  os.close(rd)
  try:
   os.setgroups([]);os.setgid(61035);os.setuid(61035);out={}
   for label,path in paths.items():
    try:path.lstat();state='OK'
    except OSError as e:state=error_code(e)
    out[label]=dict(lstat=state,read=os.access(path,os.R_OK,effective_ids=True),write=os.access(path,os.W_OK,effective_ids=True),searchOrExecute=os.access(path,os.X_OK,effective_ids=True))
   raw=json.dumps(dict(uid=os.getuid(),euid=os.geteuid(),gid=os.getgid(),egid=os.getegid(),groups=os.getgroups(),checks=out)).encode()
   with os.fdopen(wr,'wb')as f:f.write(raw)
  except BaseException:
   with os.fdopen(wr,'wb')as f:f.write(b'{"state":"UID_PROBE_UNCONFIRMED"}')
  os._exit(0)
 os.close(wr)
 with os.fdopen(rd,'rb')as f:raw=f.read(262145)
 _,status=os.waitpid(pid,0)
 assert status==0 and len(raw)<=262144
 return json.loads(raw)
def main():
 assert sys.platform=='linux'and os.getuid()==os.geteuid()==0
 # Caller verifies exact live C37 CID/birth/mounts. No public/private body read.
 covered=set(Path(C05).parents)|{Path(C05)}
 paths={};facts={};slots={};by_path={}
 for row in SLOTS:
  p=Path(row['container']);labels=[]
  assert p.is_absolute()and str(p)==os.path.normpath(p)
  for depth,parent in enumerate([*reversed(p.parents),p]):
   if parent in covered:continue # Do not repeat the observed PLAN ancestor chain.
   label=by_path.get(parent)
   if label is None:
    label=row['slot']+':'+str(depth);by_path[parent]=label
    paths[label]=parent;facts[label]=meta(parent)
   labels.append(label)
  slots[row['slot']]={'required':row['required'],'stage':row['stage'],'chain':labels}
 probe=user_checks(paths)
 expected={'uid':61035,'euid':61035,'gid':61035,'egid':61035,'groups':[]}
 assert all(probe.get(k)==v for k,v in expected.items())
 return dict(state='READONLY_FIXED37_SUPPLEMENTAL_PERMISSION_METADATA',expectedService=SERVICE,callerMustVerifyLiveServiceAndMounts=True,alreadyObservedPlanChainNotReprobed=True,c05UnobservedIdentityAndAcl=meta(Path(C05)),slots=slots,metadata=facts,nativeIdentityAccess=probe,postgresTransport='FIXED_TCP_NOT_UDS',PGConnections=0,fileBodiesOrDigestsRead=False,originalNativeErrorPathOrSyscallRecovered=False,permissionOrAclChanges=0,filesCreatedOrOpenedForWrite=0,NodeOrNativeOrJobInvoked=False,missingPreparationAuthorityExpectedAfterCleanup=True)
if __name__=='__main__':
 assert len(sys.argv)==1
 print(json.dumps(main(),sort_keys=True))
