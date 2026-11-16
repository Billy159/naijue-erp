"""Actual successful36 start, preservation stop and exact original authentication restoration."""
from pathlib import Path
from types import ModuleType
import hashlib,json,stat
KEY = 't45-first-r3-native-service-start-20261116-36'
STOP = 't45-r3-ordinary36-preserve-stop-20261116-01'
RESTORE = 't45-r3-ordinary36-auth-restore-20261116-01'
SERVICE = {'containerId': '8f1705b2cdb8277170196bf9fd4132e59d0f639380385d5c5952ff2797eaf2e9', 'containerStartedAt': '2026-11-16T21:21:12.05366201Z', 'postmasterStart': '2026-11-16 21:21:13.328927+00', 'proofSha256': '1c2e696ca6708c438e93e917a2d6003fd579c5a777529c7a8fb43a4110461801', 'serviceKey': 't45-first-r3-native-service-start-20261116-36'}
TERMINAL = 'c6bc4d7dfb5be9afca0a1505159a1c487d8504a35f8df1f3de3db84b2b9f5a06'
NORMAL_ROOT = 'e12b554b5644bc36b62152e06e9248d66d5fa42c8b2e2c8b40871fecd06f5a66'
NORMAL_PUBLIC = '1cdf4eafa8be54dc3eda875b13165b4af2e3dbb03922032f6bbaa53c47313fd3'
STOP_TERMINAL = '5d25717f747ee3f5db1b7ef8684da855a9e519a67bad21b64a9faf006f7e5fd0'
STOP_ROOT = '79a55a62872a71f5372bc4420d5829eec9171bc719f2548e1b333267da918ca6'
STOP_PUBLIC = 'dc9a120560cea3ce7c4fd84c477cc881a031fedd54e532a4d91c7810efef4257'
CLEANUP = '5743e18db1bbcb250aa91701ec61e47efd2cdd5bafe3202b765d07b85a2b43b7'
ACK = '2aec997f4ec24c1bb3623a99aa9134d245601c99d87d175c9855ae9538b1c80e'
RESTORE_TERMINAL = '05b4053582802f473a9b49bed1b9f4b4ff6cc9125999418ca90b3e36471180f1'
RESTORE_ROOT = 'fa11b9b1d9c9f0051e3d1791341974016115e0522417e319f2c8ea200bb589ac'
RESTORE_PUBLIC = '19bfcbb87599d163670b89172828d868a1507968d809903ae3bd69b9bc99741a'
RESTORED_SAFE = '60d6d5a5b16b321c334222ffaef9dc8ac0a0bf69e822878743a920151bfdbb4d'
OLD_MAIN = 'e39debb1bc94db8328c5c50fc2894491db01d396d4f5936bd13307506ac82d75'
DATA = {'device': 66304, 'gid': 61035, 'inode': 13502421, 'mode': 448, 'uid': 61035}
B=Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs')
R=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3')
BOOT=R/'state/native-services'/KEY
def need(ok,code):
    if not ok:raise ValueError('PRIOR36_'+code)
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
 p=json.loads(root(R/'authority/fresh35-current-production-service-v2-service-36.json',SERVICE['proofSha256'],False));birth=p['sharedPostgresNamespace']['container']
 need(p['requestKey']==KEY and birth['id']==SERVICE['containerId'] and birth['startedAt']==SERVICE['containerStartedAt'] and p['physical']['postmasterStart']==SERVICE['postmasterStart'] and p['dataDirectoryIdentity']==DATA,'ACTUAL_ORIGINAL_C_REQUIRED')
 ack=json.loads(root(BOOT/'retained-ack.json',ACK));need(ack==dict(requestKey=KEY,proofSha256=SERVICE['proofSha256'],serviceLeaseExpiresAt=p['sharedPostgresNamespace']['serviceLeaseExpiresAt']),'ORIGINAL_ACK_REQUIRED')
 terminal(RESTORE,RESTORE_TERMINAL);restored=pair(RESTORE,'maintenance-auth-result.json',RESTORE_ROOT,RESTORE_PUBLIC);validate_restored_object(restored)
 marker=R/'state/native-services/ordinary36-auth-20261116-01/restored.json';s=marker.lstat()
 need(json.loads(root(marker,RESTORED_SAFE))==restored['result'] and marker.resolve()==marker and stat.S_ISREG(s.st_mode) and s.st_uid==s.st_gid==0 and s.st_nlink==1 and not s.st_mode&0o077,'PRIVATE_SAFE_RESTORATION_RECEIPT_REQUIRED')
 source=B/KEY/'bundle/normal_service05_after08.py';old=module(root(source,OLD_MAIN),source,'prior36_successful_source')
 for cid in (SERVICE['containerId'],restored['cleanup']['cid']):
  info=old.carrier_info(ops,cid);need(info['id']==cid and not info['running'] and info['pid']==0 and info['image']==ops.ENV_IMAGE,'ORIGINAL_CONTAINER_STOP_REQUIRED')
 return dict(service=SERVICE,closureKind='SUCCESSFUL_START_PRESERVATION_STOP_AUTH_RESTORED',bindings=binding())
