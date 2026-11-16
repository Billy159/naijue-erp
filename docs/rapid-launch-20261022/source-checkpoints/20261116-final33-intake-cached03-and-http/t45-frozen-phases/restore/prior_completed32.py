"""Exact completed31, preservation stop31 and original-auth restore31 predecessor."""
from pathlib import Path
from types import ModuleType
import hashlib,json,stat
B=Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs')
R=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3')
KEY = 't45-first-r3-native-service-start-20261116-32'
STOP = 't45-r3-ordinary32-preserve-stop-20261116-01'
RESTORE = 't45-r3-ordinary32-auth-restore-20261116-01'
TERMINAL = '0dd914833250cb93fcac74fba1d26740b9eda07cb94dc0c09fd93ed217b3d95b'
NORMAL_ROOT = '53de7a757c2ac942ba9c3241ae5b5e07a0919fa1420cda0668df4f89d67986bf'
NORMAL_PUBLIC = '833821ec6c4461fd81acd8e376ce066c07a46f035fa2835484814c9ee7fb4fcc'
STOP_TERMINAL = '544e6852d4fc4fd72e893a37ae70a4bea210ffab2dbf545722a8c764843a4525'
STOP_ROOT = '238075e9e127dd08c685fb4bcd8503e647e34530e5b02601d0480ae5e555a154'
STOP_PUBLIC = 'c42df34e6626b639fd4eb39013a5b0a40ad22c5195be68404aa4a808c6739914'
CLEANUP = 'ce45a97bd5611b692cb015cc718e3971ec21b3279b54cad9ef66fd2a9a9f1915'
ACK = 'b66d6851b9a488de9dde514bc1e34d1638af2033ad0629cfa7a2c38f3b6ae7af'
RESTORE_TERMINAL = 'f9ea3d772478aedb4cfc4fdf9e5713894c6611af69ab270b7d26c7908e7a92a3'
RESTORE_ROOT = '545dd9d12e10f40472c662c3eba0b7dc9bba132d661714b92dd7a76ccbec0849'
RESTORE_PUBLIC = '43b2490ac016005eec8c45d556898c47505343b3cf455cca52e06fb2d69843cd'
OLD_MAIN = 'f2df2046bd54db1b702c677705b33c131b1df140cd03aed68a8cc4ccd9636cc8'
OLD_PROOF = '42b6e4d21a0f134424a1f2e18964d67db8645fb39379ee44e0b238d0dce9f6e9'
SERVICE = {'containerId': '1d12c5abe2fadfc7ec5293fc9467f01c66c2ec4f9d7b1654a5b0a38c54f42d95', 'containerStartedAt': '2026-11-16T02:59:19.015923853Z', 'postmasterStart': '2026-11-16 02:59:20.307231+00', 'proofSha256': 'f1d1a4e9f85492cba0028febc4bf05390b490161cd2983afbe76209199d8480d', 'serviceKey': 't45-first-r3-native-service-start-20261116-32'}
DATA={'device':66304,'inode':13502421,'uid':61035,'gid':61035,'mode':0o700}

BOOT=R/'state/native-services'/KEY

def need(ok,code):
    if not ok:raise ValueError('PRIOR32_'+code)
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
    old=module(root(source/'normal_service05_after08.py',OLD_MAIN),source/'normal_service05_after08.py','prior32_actual_normal')
    proof=module(root(source/'normal_service05_after08_proof.py',OLD_PROOF),source/'normal_service05_after08_proof.py','prior32_actual_proof')
    facts=old.failed_start_publication(ops,proof,BOOT,SERVICE['containerId'])
    need(facts==dict(currentProofPresent=True,retainedAckPresent=True,retainedAckValidated=True,
         currentProofSha256=SERVICE['proofSha256'],retainedAckSha256=ACK),'EXACT_HISTORICAL_C_ACK_PUBLICATION_REQUIRED')
    p=json.loads(root(R/'authority/fresh35-current-production-service-v2-service-32.json',SERVICE['proofSha256'],False))
    birth=p['sharedPostgresNamespace']['container']
    need(p['requestKey']==KEY and birth['id']==SERVICE['containerId'] and birth['startedAt']==SERVICE['containerStartedAt']
         and p['physical']['postmasterStart']==SERVICE['postmasterStart'] and p['dataDirectoryIdentity']==DATA,'REAL_PREDECESSOR_TUPLE_REQUIRED')
    root(BOOT/'retained-ack.json',ACK)
    marker=R/'state/native-services/ordinary32-auth-20261116-01/restored.json';meta=marker.lstat()
    need(marker.resolve()==marker and stat.S_ISREG(meta.st_mode) and meta.st_uid==meta.st_gid==0 and meta.st_nlink==1 and not meta.st_mode&0o077,'PRIVATE_RESTORE_MARKER_METADATA_REQUIRED')
    for cid in (SERVICE['containerId'],'31b441e2cea0de1b6160dc03ca40b96c63e6cf034718778fa959c925552f39f2','a16354642ace1dcd2997fbd9978d754fb7d3e6f5c459c1451ce051fb0090f9cc'):
        info=old.carrier_info(ops,cid)
        need(info['id']==cid and not info['running'] and info['pid']==0 and info['image']==ops.ENV_IMAGE,'OLD32_CONTAINER_STOP_REQUIRED')
    return dict(service=SERVICE,closureKind='COMPLETED_START_CLEAN_STOP_AUTH_RESTORED',bindings=binding())
