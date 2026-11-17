'Actual successful39 start, preservation stop and exact original authentication restoration.'
from pathlib import Path
from types import ModuleType
import hashlib,json,stat
KEY = 't45-first-r3-native-service-start-20261116-39'
STOP = 't45-r3-ordinary39-preserve-stop-20261116-01'
RESTORE = 't45-r3-ordinary39-auth-restore-20261116-01'
SERVICE = {'containerId': 'a17a885412cb8122e8b77a65d5058f1653c69a3cc20d1a11a3950e4fe6e4e1d5', 'containerStartedAt': '2026-11-17T05:39:38.918702945Z', 'postmasterStart': '2026-11-17 05:39:40.169724+00', 'proofSha256': '9aa960bc95192c2b72f61526df793a1bfccd3a9f047aa17f01cbe0632b73b6b3', 'serviceKey': 't45-first-r3-native-service-start-20261116-39'}
TERMINAL = '78f5caaae6ec9f733f97808550748a6ef486e5c14835e377a76061726b37cac2'
NORMAL_ROOT = '422bdd6ee1aab240357007d344231b6f00979a4b2af0f6e4aa84c3cea452ae09'
NORMAL_PUBLIC = 'fc3c44ea0bab6e92cc8ebd98b8db612c4329c37cf0beb7a0fbc31e6dc4138e87'
STOP_TERMINAL = '18b47182038fbb44f5541adf2bbce8baeda4c90acd05a1092f0481b393ebd575'
STOP_ROOT = '73567688aaa35d1a2b303ed03c03e5403ed648625131434b2338d4974a41a0d7'
STOP_PUBLIC = 'ed4c169630e1fe352dd2a54bc7da7f1448922e3410ebe3cf628c6df7b46aa42e'
CLEANUP = '5619126a8236edf660da4d132ce0483086975e75ff3f5e94482db60f4c370660'
ACK = 'd035fa81890f8cbc0b7ded918c5ceac7f28259c2c126e3c651f8ff364c9bdb8f'
RESTORE_TERMINAL = '400bcdd5c5aa69a11b45a03a90bb64a1bbce17a835cb2bf57636949b4ec411c7'
RESTORE_ROOT = '08f94d2ddcc78e733cac57313d04b0573a8003d81fe76a1ad482c6d716ecbeca'
RESTORE_PUBLIC = '80c510bb7f1fe0e13bfd8b462aa9cd5f6ca3d1791fbaa312a97d6a409e4ad365'
RESTORED_SAFE = 'ce98579474ee7adfff5a521f59d0e6e91e54eb964770f758a1dc695eb36c0f15'
OLD_MAIN = '8f87d994ce56007446dfa8b60c64ab28dc9d8bbb34a9c08db4f088a49f866eea'
DATA = {'device': 66304, 'gid': 61035, 'inode': 13502421, 'mode': 448, 'uid': 61035}
B=Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs')
R=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3')
BOOT=R/'state/native-services'/KEY
def need(ok,code):
    if not ok:raise ValueError('PRIOR39_'+code)
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
 p=json.loads(root(R/'authority/fresh35-current-production-service-v2-service-39.json',SERVICE['proofSha256'],False));birth=p['sharedPostgresNamespace']['container']
 need(p['requestKey']==KEY and birth['id']==SERVICE['containerId'] and birth['startedAt']==SERVICE['containerStartedAt'] and p['physical']['postmasterStart']==SERVICE['postmasterStart'] and p['dataDirectoryIdentity']==DATA,'ACTUAL_ORIGINAL_C_REQUIRED')
 ack=json.loads(root(BOOT/'retained-ack.json',ACK));need(ack==dict(requestKey=KEY,proofSha256=SERVICE['proofSha256'],serviceLeaseExpiresAt=p['sharedPostgresNamespace']['serviceLeaseExpiresAt']),'ORIGINAL_ACK_REQUIRED')
 terminal(RESTORE,RESTORE_TERMINAL);restored=pair(RESTORE,'maintenance-auth-result.json',RESTORE_ROOT,RESTORE_PUBLIC);validate_restored_object(restored)
 need(stopped['currentBatchTerminals']['t45-r3-batched-real-execute-20261115-01']=={'state':'FAILED','terminalSha256':'00132d00459328530dd4656d9a9e853b81abfbc92a73076fcde733d080cbdb35'},'CONSUMED_WRITER_FAILED_REQUIRED')
 for name,expected in {'/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary39-auth-20261116-01/applied.json': [66304, 13666945, 0, 0, 256, 1, 493, 1794893437013043029, 1794893437013043029], '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary39-auth-20261116-01/finite-auth.json': [66304, 13666942, 0, 0, 256, 1, 2549, 1794893436024056178, 1794893436024056178], '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary39-auth-20261116-01/original-auth.json': [66304, 13666939, 0, 0, 256, 1, 2533, 1794893435897057868, 1794893435897057868], '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary39-auth-20261116-01/restore-attempt.json': [66304, 13667009, 0, 0, 256, 1, 114, 1794896630532563884, 1794896630532563884], '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary39-auth-20261116-01/restored.json': [66304, 13667011, 0, 0, 256, 1, 466, 1794896631566578146, 1794896631566578146]}.items():
  marker=Path(name);s=marker.lstat();actual=[s.st_dev,s.st_ino,s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode),s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns]
  need(marker.resolve()==marker and stat.S_ISREG(s.st_mode) and actual==expected,'PRIVATE_RECOVERY_STAT_ONLY_REQUIRED')
 material=R/'state/installed-real-operation-batched-root08-20261117-01/source-materialization.json'
 raw=ops.read_file(material,65536,False);m=json.loads(raw)
 need(sha(raw)=='5bbfe6fa34d8e9c7990dbed5dfda745617d9f2c1fb58a9e431e9778b9339b67c'
  and m['state']=='SOURCE_PHYSICALLY_MATERIALIZED_SQL_UPGRADE_NOT_PERFORMED'
  and m['SQLUpgradePerformed']is False and m['importReady']is False and m['sourceFiles']==392,'ACTUAL_ROOT08_SOURCE_ONLY_REQUIRED')
 source=B/KEY/'bundle/normal_service05_after08.py';old=module(root(source,OLD_MAIN),source,'prior38_successful_source')
 for cid in (SERVICE['containerId'],restored['cleanup']['cid']):
  info=old.carrier_info(ops,cid);need(info['id']==cid and not info['running'] and info['pid']==0 and info['image']==ops.ENV_IMAGE,'ORIGINAL_CONTAINER_STOP_REQUIRED')
 return dict(service=SERVICE,closureKind='SUCCESSFUL_START_PRESERVATION_STOP_AUTH_RESTORED',bindings=binding())
