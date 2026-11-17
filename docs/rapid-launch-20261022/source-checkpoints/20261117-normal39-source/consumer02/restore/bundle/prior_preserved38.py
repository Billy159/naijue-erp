'Actual successful38 start, preservation stop and exact original authentication restoration.'
from pathlib import Path
from types import ModuleType
import hashlib,json,stat
KEY = 't45-first-r3-native-service-start-20261116-38'
STOP = 't45-r3-ordinary38-preserve-stop-20261116-01'
RESTORE = 't45-r3-ordinary38-auth-restore-20261116-01'
SERVICE = {'containerId': '4a2be3fca19bf1f46151c0271d5a0cb2cd10b280cd43c483e93d478be85f18d2', 'containerStartedAt': '2026-11-17T02:16:22.168473079Z', 'postmasterStart': '2026-11-17 02:16:23.493239+00', 'proofSha256': 'a9e740c7dff329838f8fd82572d90353378c6e8b3fb1a3c29ac1fdd2362837e3', 'serviceKey': 't45-first-r3-native-service-start-20261116-38'}
TERMINAL = 'da9c547a4981c1edd31049ddb138073991a6a279562435fcd573d1fa57998aaf'
NORMAL_ROOT = 'a87fac20c34ff46336287e16d3e3dd808df0d67176467921b860e5b266bd6f2d'
NORMAL_PUBLIC = '5faf78825a2589ea2b276d269646cf947a0f0b2695a76ff7917941c0333c4059'
STOP_TERMINAL = '2f87bec15310fd9b6d0f28a8084e54ee4b926681c7d2dee07e0473ab51411dec'
STOP_ROOT = '2815ba3c28d758f273cef7cff94bdcf1ff5bb4c95fa3bcf64f6f14c8493a6b55'
STOP_PUBLIC = '25242a3faa21121b89378436a36e1a36105a313f65542b0c6b857eee6fb39d8d'
CLEANUP = '35f2d4075a0726d07a7d8a69d45e789f0b21f02aaae5bdf6666492359e921b69'
ACK = 'dfb22f8067931383447cacbc9a1f15987232853cbda869a24d41bc1ddf430721'
RESTORE_TERMINAL = 'f6c2773391ac2aa1c3c76181905b310517d736d933bdf7c6b55678c132e60747'
RESTORE_ROOT = '83c86cc684d3fbe63c752b73bdfa42cc4046145f5ea754baa10561ca1fd2486f'
RESTORE_PUBLIC = '28ea93fa6f66b93479fe7d0696a1d167dd6344bb18737e0cb6f1df83846069be'
RESTORED_SAFE = 'ce98579474ee7adfff5a521f59d0e6e91e54eb964770f758a1dc695eb36c0f15'
OLD_MAIN = 'cd7dd571be34a459a7f50809f4f2e999e1a736a8061f875e8a7aa2bfa48c0b26'
DATA = {'device': 66304, 'gid': 61035, 'inode': 13502421, 'mode': 448, 'uid': 61035}
B=Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs')
R=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3')
BOOT=R/'state/native-services'/KEY
def need(ok,code):
    if not ok:raise ValueError('PRIOR38_'+code)
def sha(body):return hashlib.sha256(body).hexdigest()
def module(body,path,name):
    m=ModuleType(name);m.__file__=str(path);exec(compile(body,str(path),'exec'),m.__dict__);return m
def validate_terminal_object(t,key,status,exit_code):
    need((t.get('jobId'),t.get('taskId'),t.get('grantId'),t.get('status'),t.get('exitCode'))==
         (key,'T45','b16447fbc81f4d64',status,exit_code),'EXACT_TERMINAL_OUTCOME_REQUIRED')

def binding():
 return dict(previousTerminalSha256=TERMINAL,previousResultSha256=NORMAL_PUBLIC,previousCurrentProofSha256=SERVICE['proofSha256'],previousRetainedAckSha256=ACK,previousCleanupSha256=CLEANUP,previousStopRequestKey=STOP,previousStopTerminalSha256=STOP_TERMINAL,previousStopResultSha256=STOP_PUBLIC,restoreTerminalSha256=RESTORE_TERMINAL,restoreResultSha256=RESTORE_PUBLIC)
def validate_restored_object(restored):
 inside=restored['result'];cleanup=restored['cleanup']
 need(restored['requestKey']==RESTORE and restored['phase']=='restore' and inside['requestKey']==RESTORE and inside['status']=='EXACT_ORIGINAL_TWO_ROLE_AUTH_AND_BOUNDARIES_RESTORED_BY_OFFLINE_READBACK' and inside['exactOriginalVerifierAndExpiryVerifiedPrivately'] is True and inside['databaseStillStopped'] is True and all(inside[k] is False for k in ('runtimeAuthChanged','membershipsOrRoleAttributesChanged','naturalExpiryCountedAsRestoration')) and cleanup['ownContainerStopped'] is True and cleanup['ownedPidAbsent'] is True,'ORIGINAL_AUTH_RESTORATION_REQUIRED')
def validate(ops,control,authority=None):
 if authority is not None:need(all(authority.get(k)==v for k,v in binding().items()),'EXPLICIT_SUCCESSFUL_PREDECESSOR_BINDING_REQUIRED')
 def root(path,pin,private=True):
  raw=ops.read_file(path,65536,private);need(sha(raw)==pin,'EXACT_ROOT_BYTES_REQUIRED');return raw
 def terminal(key,pin):
  raw=root(B/key/'r3-outer-terminal.json',pin);need(raw==ops.read_file(control/'results'/(key+'.json'),65536,False,False),'TERMINAL_ROOT_PUBLIC_REQUIRED');validate_terminal_object(json.loads(raw),key,'COMPLETED',0)
 def pair(key,leaf,rpin,ppin):
  raw=root(B/key/'results'/leaf,rpin);public=ops.read_file(control/'jobs'/key/'results'/leaf,65536,False,False);need(sha(public)==ppin and json.loads(raw)==json.loads(public),'ROOT_PUBLIC_OBJECTS_REQUIRED');return json.loads(raw)
 terminal(KEY,TERMINAL)
 normal=pair(KEY,'normal-service-result.json',NORMAL_ROOT,NORMAL_PUBLIC)
 need(normal['requestKey']==KEY and normal['status']=='NORMAL_SAME_R3_SERVICE_AND_RUNTIME_AUTHENTICATED_NOT_APP_ACCEPTANCE' and normal['proofSha256']==SERVICE['proofSha256'] and normal['cid']==SERVICE['containerId'] and normal['readOnlyReadiness'] is True,'REAL_SUCCESSFUL_START_REQUIRED')
 terminal(STOP,STOP_TERMINAL)
 stopped=pair(STOP,'normal05-preserve-stop-result.json',STOP_ROOT,STOP_PUBLIC)
 need(stopped['requestKey']==STOP and stopped['status']=='NORMAL05_PRESERVATION_ONLY_CLEAN_STOP_CONFIRMED' and stopped['service']==SERVICE and stopped['pgStopped'] is True and stopped['cleanupSha256']==CLEANUP and stopped['businessAdvanced'] is False and stopped['originalKeyReplayed'] is False,'PRESERVATION_STOP_REQUIRED')
 clean=json.loads(root(BOOT/'cleanup.json',CLEANUP))
 need(clean['requestKey']==KEY and all(clean['cleanup'][k] is True for k in ('cleanupComplete','cleanShutdown','dataPreserved','ownedPidAbsent','portAbsent')),'CLEAN_DATA_PRESERVED_REQUIRED')
 p=json.loads(root(R/'authority/fresh35-current-production-service-v2-service-38.json',SERVICE['proofSha256'],False));birth=p['sharedPostgresNamespace']['container']
 need(p['requestKey']==KEY and birth['id']==SERVICE['containerId'] and birth['startedAt']==SERVICE['containerStartedAt'] and p['physical']['postmasterStart']==SERVICE['postmasterStart'] and p['dataDirectoryIdentity']==DATA,'ACTUAL_ORIGINAL_C_REQUIRED')
 ack=json.loads(root(BOOT/'retained-ack.json',ACK));need(ack==dict(requestKey=KEY,proofSha256=SERVICE['proofSha256'],serviceLeaseExpiresAt=p['sharedPostgresNamespace']['serviceLeaseExpiresAt']),'ORIGINAL_ACK_REQUIRED')
 terminal(RESTORE,RESTORE_TERMINAL);restored=pair(RESTORE,'maintenance-auth-result.json',RESTORE_ROOT,RESTORE_PUBLIC);validate_restored_object(restored)
 failed_raw=root(B/'t45-r3-final33-plan-prepare-20261116-04/r3-outer-terminal.json','96901db99ba450caf5d1f21c0421a50866c9eaf47d7cbd4a38beb8ac8e5a518c')
 need(failed_raw==ops.read_file(control/'results/t45-r3-final33-plan-prepare-20261116-04.json',65536,False,False),'FAILED04_ROOT_PUBLIC_REQUIRED')
 validate_terminal_object(json.loads(failed_raw),'t45-r3-final33-plan-prepare-20261116-04','FAILED',2)
 failed=pair('t45-r3-final33-plan-prepare-20261116-04','final33-prepare-result.json','81d92aadb2f8b298660924b11fddbf8b074609f36d70e767860ef967f5f93bfa','111dd7b6c011ae7cd85326df4ce7efd986ec336a3062ff72e2cbd68fa0a38df6')
 need(failed.get('state')=='UNKNOWN' and failed.get('nativeConnectionCleanup')=='UNKNOWN','FAILED04_NATIVE_UNKNOWN_MUST_REMAIN_UNKNOWN')
 need(stopped['currentBatchTerminals']['t45-r3-batched-real-execute-20261115-01']=={'state':'NOT_SUBMITTED'},'WRITER_REMAINS_NEVER_SUBMITTED')
 for name,expected in {'/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary38-auth-20261116-01/applied.json': [66304, 13666453, 0, 0, 256, 1, 493, 1794881502154151899, 1794881502154151899], '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary38-auth-20261116-01/finite-auth.json': [66304, 13666450, 0, 0, 256, 1, 2549, 1794881501072145929, 1794881501072145929], '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary38-auth-20261116-01/original-auth.json': [66304, 13666447, 0, 0, 256, 1, 2533, 1794881500939145195, 1794881500939145195], '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary38-auth-20261116-01/restore-attempt.json': [66304, 13666510, 0, 0, 256, 1, 114, 1794883094251589094, 1794883094251589094], '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary38-auth-20261116-01/restored.json': [66304, 13666512, 0, 0, 256, 1, 466, 1794883095325574673, 1794883095325574673]}.items():
  marker=Path(name);s=marker.lstat()
  actual=[s.st_dev,s.st_ino,s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode),s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns]
  need(marker.resolve()==marker and stat.S_ISREG(s.st_mode) and actual==expected,'PRIVATE_RECOVERY_STAT_ONLY_REQUIRED')
 source=B/KEY/'bundle/normal_service05_after08.py';old=module(root(source,OLD_MAIN),source,'prior38_successful_source')
 for cid in (SERVICE['containerId'],restored['cleanup']['cid']):
  info=old.carrier_info(ops,cid);need(info['id']==cid and not info['running'] and info['pid']==0 and info['image']==ops.ENV_IMAGE,'ORIGINAL_CONTAINER_STOP_REQUIRED')
 return dict(service=SERVICE,closureKind='SUCCESSFUL_START_PRESERVATION_STOP_AUTH_RESTORED',bindings=binding())
