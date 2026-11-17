'Actual successful37 start, preservation stop and exact original authentication restoration.'
from pathlib import Path
from types import ModuleType
import hashlib,json,stat
KEY = 't45-first-r3-native-service-start-20261116-37'
STOP = 't45-r3-ordinary37-preserve-stop-20261116-01'
RESTORE = 't45-r3-ordinary37-auth-restore-20261116-01'
SERVICE = {'containerId': '4ec61582c6dc2856b3d843d47af15c73a6cb65355c6f5916a2d386adca251fd6', 'containerStartedAt': '2026-11-16T23:08:51.161418347Z', 'postmasterStart': '2026-11-16 23:08:52.417902+00', 'proofSha256': 'cba7c6cbe81503d054f00c03a9c2a8bd7943bf86be8c3f29df6db3a49fc02527', 'serviceKey': 't45-first-r3-native-service-start-20261116-37'}
TERMINAL = 'dc0fde1f2276bda2dd09068d803ea6aee132f2123d046e098f719120dba6896f'
NORMAL_ROOT = '5624cc719db9e45aeb927ef73de6f1ccdaa48e579f31ed554e8e0f4b0d40c4e3'
NORMAL_PUBLIC = '9d3242c03d57f721f7ada850821d7d719ada23f9711268076a61c2d8d5e86d8d'
STOP_TERMINAL = 'd7843509b5b4062545a92d8b3da0501e77450519196b7ccff2a18352192c818e'
STOP_ROOT = '494b4f01b3b5865b50b2fa45ab13c40b9601b69e1d4a65a3e5654b69c026769a'
STOP_PUBLIC = '5cd1f878caa47967318a5a0f69cfacaf7dbfb81158188eb71cd9742fb6b601eb'
CLEANUP = '69fce98b9086f9a4c5fc4e9aec9065fd86687959e64474b617749bc9ed515d3c'
ACK = '36e7eba2a3ebdbb2a2e559d8dcba181c43746d621181211fff8e210ee788ecb2'
RESTORE_TERMINAL = '97dc45bd776ee72489fd7448acb6f3f0463e9f4d8d277acbfa76b04fc1e89e69'
RESTORE_ROOT = '4ad0c6d2a1057462824c39c8e5372766ab2366376c8e4779f8da20d838e4d2f3'
RESTORE_PUBLIC = 'b14893c32626bde5e03b91d78660fa853c5776126e62e83b9b43797ad39ca3da'
RESTORED_SAFE = '9a4711ac1b3feb35520261f3830e06f08c4ff3d824a66be0f7979cdaeae8d7c9'
OLD_MAIN = '700e175b89aee2836e4de2c157f576b35f64a85ac648e3302050764779d9d63d'
DATA = {'device': 66304, 'gid': 61035, 'inode': 13502421, 'mode': 448, 'uid': 61035}
B=Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs')
R=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3')
BOOT=R/'state/native-services'/KEY
def need(ok,code):
    if not ok:raise ValueError('PRIOR37_'+code)
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
 p=json.loads(root(R/'authority/fresh35-current-production-service-v2-service-37.json',SERVICE['proofSha256'],False));birth=p['sharedPostgresNamespace']['container']
 need(p['requestKey']==KEY and birth['id']==SERVICE['containerId'] and birth['startedAt']==SERVICE['containerStartedAt'] and p['physical']['postmasterStart']==SERVICE['postmasterStart'] and p['dataDirectoryIdentity']==DATA,'ACTUAL_ORIGINAL_C_REQUIRED')
 ack=json.loads(root(BOOT/'retained-ack.json',ACK));need(ack==dict(requestKey=KEY,proofSha256=SERVICE['proofSha256'],serviceLeaseExpiresAt=p['sharedPostgresNamespace']['serviceLeaseExpiresAt']),'ORIGINAL_ACK_REQUIRED')
 terminal(RESTORE,RESTORE_TERMINAL);restored=pair(RESTORE,'maintenance-auth-result.json',RESTORE_ROOT,RESTORE_PUBLIC);validate_restored_object(restored)
 marker=R/'state/native-services/ordinary37-auth-20261116-01/restored.json';s=marker.lstat()
 need(json.loads(root(marker,RESTORED_SAFE))==restored['result'] and marker.resolve()==marker and stat.S_ISREG(s.st_mode) and s.st_uid==s.st_gid==0 and s.st_nlink==1 and not s.st_mode&0o077,'PRIVATE_SAFE_RESTORATION_RECEIPT_REQUIRED')
 source=B/KEY/'bundle/normal_service05_after08.py';old=module(root(source,OLD_MAIN),source,'prior37_successful_source')
 for cid in (SERVICE['containerId'],restored['cleanup']['cid']):
  info=old.carrier_info(ops,cid);need(info['id']==cid and not info['running'] and info['pid']==0 and info['image']==ops.ENV_IMAGE,'ORIGINAL_CONTAINER_STOP_REQUIRED')
 return dict(service=SERVICE,closureKind='SUCCESSFUL_START_PRESERVATION_STOP_AUTH_RESTORED',bindings=binding())
