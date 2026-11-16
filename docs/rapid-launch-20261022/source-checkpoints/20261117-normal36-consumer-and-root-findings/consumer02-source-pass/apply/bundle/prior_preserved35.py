"""Actual successful35 start, preservation stop and exact original authentication restoration."""
from pathlib import Path
from types import ModuleType
import hashlib,json,stat
KEY = 't45-first-r3-native-service-start-20261116-35'
STOP = 't45-r3-ordinary35-preserve-stop-20261116-01'
RESTORE = 't45-r3-ordinary35-auth-restore-20261116-01'
SERVICE = {'containerId': 'ed42d33a198fe1c35a72d5c27b3c138d2cd5e8bc892a73d39f83fc77c88c8c14', 'containerStartedAt': '2026-11-16T18:33:46.920948412Z', 'postmasterStart': '2026-11-16 18:33:48.303258+00', 'proofSha256': '82e15c91ea0b2b237ddada69e2345a78f28e1ee4301c45e859735853ba0a3ec0', 'serviceKey': 't45-first-r3-native-service-start-20261116-35'}
TERMINAL = '0bd548166072b27a28adf2784f754fbc13774bfde68fd05b687831836cce2426'
NORMAL_ROOT = 'd282fea89a6c981c0a8fb3292bfa8843e82d4c99321e6fdbff23c9e844cbb899'
NORMAL_PUBLIC = 'b7280b0c9d2152d38331ef966e786bd409955928516d53b87d38a724fffdb5d6'
STOP_TERMINAL = 'fb0a0503673a348504cbc7de62d5318fe1b60667789448e099b6189e4c805cd8'
STOP_ROOT = 'f1d6ed4a422ff9dfe6db88ceb2eea7155c650af1d96d3b251ed9a90f57673951'
STOP_PUBLIC = '284344322fa3a4213f56991006359386314247b921dd1e527047f62dae7e02d9'
CLEANUP = 'ab6e59eaf1f99785d3f36e3b5e2d25510332cf81ed7ce1b120447dba0150346c'
ACK = '7cb3a553fe96de7de11f35eff948da30f9933ae50403b5e0f7393b9671a5692a'
RESTORE_TERMINAL = 'e8b77fed8b54c3c31a59d82db724a378cfb41e6f4d523a10ac5acb63f83b3577'
RESTORE_ROOT = 'ca7ffc5eb4cb7ade449972579da939b39e96eb21d497bc9ca82e89e440744230'
RESTORE_PUBLIC = 'b01e7aef3d89c6a0655b87e0bc6cfe84c901aab021c059190bc986271258b099'
RESTORED_SAFE = '564feb3c3948d6590fdf5a6fb42532f44bdc5c0b059c6104cd288a3ec66b135f'
OLD_MAIN = 'd3c22969ce59d3e3da0e334f547329bace3cf52b5e4e93617d0e9be33ddae822'
DATA = {'device': 66304, 'gid': 61035, 'inode': 13502421, 'mode': 448, 'uid': 61035}
B=Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs')
R=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3')
BOOT=R/'state/native-services'/KEY
def need(ok,code):
    if not ok:raise ValueError('PRIOR35_'+code)
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
 p=json.loads(root(R/'authority/fresh35-current-production-service-v2-service-35.json',SERVICE['proofSha256'],False));birth=p['sharedPostgresNamespace']['container']
 need(p['requestKey']==KEY and birth['id']==SERVICE['containerId'] and birth['startedAt']==SERVICE['containerStartedAt'] and p['physical']['postmasterStart']==SERVICE['postmasterStart'] and p['dataDirectoryIdentity']==DATA,'ACTUAL_ORIGINAL_C_REQUIRED')
 ack=json.loads(root(BOOT/'retained-ack.json',ACK));need(ack==dict(requestKey=KEY,proofSha256=SERVICE['proofSha256'],serviceLeaseExpiresAt=p['sharedPostgresNamespace']['serviceLeaseExpiresAt']),'ORIGINAL_ACK_REQUIRED')
 terminal(RESTORE,RESTORE_TERMINAL);restored=pair(RESTORE,'maintenance-auth-result.json',RESTORE_ROOT,RESTORE_PUBLIC);validate_restored_object(restored)
 marker=R/'state/native-services/ordinary35-auth-20261116-01/restored.json';s=marker.lstat()
 need(json.loads(root(marker,RESTORED_SAFE))==restored['result'] and marker.resolve()==marker and stat.S_ISREG(s.st_mode) and s.st_uid==s.st_gid==0 and s.st_nlink==1 and not s.st_mode&0o077,'PRIVATE_SAFE_RESTORATION_RECEIPT_REQUIRED')
 source=B/KEY/'bundle/normal_service05_after08.py';old=module(root(source,OLD_MAIN),source,'prior35_successful_source')
 for cid in (SERVICE['containerId'],restored['cleanup']['cid']):
  info=old.carrier_info(ops,cid);need(info['id']==cid and not info['running'] and info['pid']==0 and info['image']==ops.ENV_IMAGE,'ORIGINAL_CONTAINER_STOP_REQUIRED')
 return dict(service=SERVICE,closureKind='SUCCESSFUL_START_PRESERVATION_STOP_AUTH_RESTORED',bindings=binding())
