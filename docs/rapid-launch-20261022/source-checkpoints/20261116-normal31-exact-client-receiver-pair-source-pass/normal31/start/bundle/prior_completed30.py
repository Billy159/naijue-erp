"""Exact completed30, preservation stop30 and original-auth restore30 predecessor."""
from pathlib import Path
from types import ModuleType
import hashlib,json,stat
B=Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs')
R=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3')
KEY='t45-first-r3-native-service-start-20261116-30'
STOP='t45-r3-ordinary30-preserve-stop-20261116-01'
RESTORE='t45-r3-ordinary30-auth-restore-20261116-01'
TERMINAL='34d2f5e0f7cf2fabf8192a340eda31dac53e8ab16cda8cc14fe6acba33b93ed4'
NORMAL_ROOT='bcb378acfa698c2bc8f7018bb713acc61318e66bf4f14bc2830cdec51790730d'
NORMAL_PUBLIC='161b4c3cb53b057746f8fd246ea79aff8b030eb0a45e4743158f3a110f0f4fe6'
STOP_TERMINAL='e52708fc14962a02d10906d25f9434268eb22ee4c36c754e75fc3b4bf70f2ddb'
STOP_ROOT='62ed7abefdb356fa4a7098d16f54f887191340949587a5406e51b4687007e5f3'
STOP_PUBLIC='46969fd0fb6dd5452f1b8e289248b0b0704dfc4a0e1a0e9bbc4c9eee0e9285d6'
CLEANUP='9073bc7b9f1d013e8c74833d5e5aac5fb630df84c4c27c9fd4628d6dc47f8e9a'
ACK='602335813cab4a66c9b5d3e741203e5486a99ef2fd026125b470b880756e4218'
RESTORE_TERMINAL='762af3ad2ca11c0b6675b942d0f0f33b3d53dba39d8d8f2decea0312e5547213'
RESTORE_ROOT='fc22b1917a3ef1b67b259d8fb878416bb20f84dbb11cc26796233db19fa1039a'
RESTORE_PUBLIC='778bafff2ccebbb40edde23b75e677b7aebbecd0d266e44f78a7bb6e95037013'
OLD_MAIN='9f1888e1446f5233307f33522ef67b8af6f3c363bfb5bde7eb7d9575a51f4192'
OLD_PROOF='3f3ba44243a14a088814b04f1e19c98113bfff4fc4d4112961dc185dfc26de19'
SERVICE={'containerId': '4ef547cb7a3acdf82b8c85a32c75e46f71dbf1ea850c205a1f0d755ab00922aa', 'containerStartedAt': '2026-11-15T23:13:26.882383571Z', 'postmasterStart': '2026-11-15 23:13:28.123147+00', 'proofSha256': 'abf3b3251289ebb5f40218f51991c1a3bafea4854097543be175ed400d9ce06c', 'serviceKey': 't45-first-r3-native-service-start-20261116-30'}
DATA={'device':66304,'inode':13502421,'uid':61035,'gid':61035,'mode':0o700}

BOOT=R/'state/native-services'/KEY

def need(ok,code):
    if not ok:raise ValueError('PRIOR30_'+code)
def sha(body):return hashlib.sha256(body).hexdigest()
def binding():
    return dict(previousTerminalSha256=TERMINAL,previousResultSha256=NORMAL_PUBLIC,
        previousCleanupSha256=CLEANUP,previousCurrentProofSha256=SERVICE['proofSha256'],
        previousStopTerminalSha256=STOP_TERMINAL,previousStopResultSha256=STOP_PUBLIC,
        restoreTerminalSha256=RESTORE_TERMINAL,restoreResultSha256=RESTORE_PUBLIC)
def module(body,path,name):
    m=ModuleType(name);m.__file__=str(path);exec(compile(body,str(path),'exec'),m.__dict__);return m

def validate_terminal_object(t,key):
    need((t.get('jobId'),t.get('taskId'),t.get('grantId'),t.get('status'),t.get('exitCode'))==
         (key,'T45','b16447fbc81f4d64','COMPLETED',0),'ACTUAL_COMPLETED_TERMINAL_REQUIRED')
def validate_objects(normal,stopped,clean,restored):
    need(normal['requestKey']==KEY and normal['status']=='NORMAL_SAME_R3_SERVICE_AND_RUNTIME_AUTHENTICATED_NOT_APP_ACCEPTANCE'
         and normal['cid']==SERVICE['containerId'] and normal['proofSha256']==SERVICE['proofSha256'],'EXACT_SUCCESSFUL_START_REQUIRED')
    need(stopped['requestKey']==STOP and stopped['status']=='NORMAL05_PRESERVATION_ONLY_CLEAN_STOP_CONFIRMED'
         and stopped['service']==SERVICE and stopped['pgStopped'] is True and stopped['cleanupSha256']==CLEANUP
         and stopped['businessAdvanced'] is False and stopped['originalKeyReplayed'] is False,'EXACT_PRESERVATION_STOP_REQUIRED')
    need(clean['requestKey']==KEY and clean['runtimeMaterialPreserved'] is True
         and all(clean['cleanup'][k] is True for k in ('cleanupComplete','cleanShutdown','ownedPidAbsent','portAbsent','dataPreserved'))
         and clean['cleanup']['databasePrivilegesChanged'] is False and clean['cleanup']['errors']==[],'ACTUAL_CLEAN_STOP_REQUIRED')
    inside=restored['result'];cleanup=restored['cleanup']
    need(restored['requestKey']==RESTORE and restored['phase']=='restore'
         and inside['status']=='EXACT_ORIGINAL_TWO_ROLE_AUTH_AND_BOUNDARIES_RESTORED_BY_OFFLINE_READBACK'
         and inside['exactOriginalVerifierAndExpiryVerifiedPrivately'] is True and inside['databaseStillStopped'] is True
         and all(inside[k] is False for k in ('runtimeAuthChanged','membershipsOrRoleAttributesChanged','naturalExpiryCountedAsRestoration'))
         and cleanup['ownContainerStopped'] is True and cleanup['ownedPidAbsent'] is True,'ACTUAL_ORIGINAL_AUTH_RESTORATION_REQUIRED')

def validate(ops,control,authority=None):
    if authority is not None:need(all(authority[k]==v for k,v in binding().items()),'ACTUAL_AUTHORITY_BINDINGS_REQUIRED')
    def root(path,pin,private=True):
        body=ops.read_file(path,65536,private);need(sha(body)==pin,'EXACT_ROOT_BYTES_REQUIRED');return body
    def pair(key,leaf,root_pin,public_pin):
        body=root(B/key/'results'/leaf,root_pin)
        public=ops.read_file(control/'jobs'/key/'results'/leaf,65536,False,False)
        need(sha(public)==public_pin and json.loads(body)==json.loads(public),'ROOT_PUBLIC_OBJECTS_REQUIRED')
        return json.loads(body)
    for key,pin in ((KEY,TERMINAL),(STOP,STOP_TERMINAL),(RESTORE,RESTORE_TERMINAL)):
        body=root(B/key/'r3-outer-terminal.json',pin)
        need(body==ops.read_file(control/'results'/(key+'.json'),65536,False,False),'TERMINAL_PUBLIC_COPY_REQUIRED')
        validate_terminal_object(json.loads(body),key)
    normal=pair(KEY,'normal-service-result.json',NORMAL_ROOT,NORMAL_PUBLIC)
    stopped=pair(STOP,'normal05-preserve-stop-result.json',STOP_ROOT,STOP_PUBLIC)
    clean=json.loads(root(BOOT/'cleanup.json',CLEANUP))
    restored=pair(RESTORE,'maintenance-auth-result.json',RESTORE_ROOT,RESTORE_PUBLIC)
    validate_objects(normal,stopped,clean,restored)
    source=B/KEY/'bundle'
    old=module(root(source/'normal_service05_after08.py',OLD_MAIN),source/'normal_service05_after08.py','prior30_actual_normal')
    proof=module(root(source/'normal_service05_after08_proof.py',OLD_PROOF),source/'normal_service05_after08_proof.py','prior30_actual_proof')
    facts=old.failed_start_publication(ops,proof,BOOT,SERVICE['containerId'])
    need(facts==dict(currentProofPresent=True,retainedAckPresent=True,retainedAckValidated=True,
         currentProofSha256=SERVICE['proofSha256'],retainedAckSha256=ACK),'EXACT_HISTORICAL_C_ACK_PUBLICATION_REQUIRED')
    p=json.loads(root(R/'authority/fresh35-current-production-service-v2-service-30.json',SERVICE['proofSha256'],False))
    birth=p['sharedPostgresNamespace']['container']
    need(p['requestKey']==KEY and birth['id']==SERVICE['containerId'] and birth['startedAt']==SERVICE['containerStartedAt']
         and p['physical']['postmasterStart']==SERVICE['postmasterStart'] and p['dataDirectoryIdentity']==DATA,'REAL_PREDECESSOR_TUPLE_REQUIRED')
    root(BOOT/'retained-ack.json',ACK)
    marker=R/'state/native-services/ordinary30-auth-20261116-01/restored.json';meta=marker.lstat()
    need(marker.resolve()==marker and stat.S_ISREG(meta.st_mode) and meta.st_uid==meta.st_gid==0 and meta.st_nlink==1 and not meta.st_mode&0o077,'PRIVATE_RESTORE_MARKER_METADATA_REQUIRED')
    for cid in (SERVICE['containerId'],'b3d228b01df1ce1505f7bd8c94d6a3a65cc694e2e8e08a6b719053cef0be745c','653f00ffc45e11e63c3bcd9a137fbc1293553cb3966e5403f415587942b2279e'):
        info=old.carrier_info(ops,cid)
        need(info['id']==cid and not info['running'] and info['pid']==0 and info['image']==ops.ENV_IMAGE,'OLD30_CONTAINER_STOP_REQUIRED')
    return dict(service=SERVICE,closureKind='COMPLETED_START_CLEAN_STOP_AUTH_RESTORED',bindings=binding())
