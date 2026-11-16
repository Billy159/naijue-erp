"""Exact failed34 C/ACK, typed cleanup and original-auth restoration predecessor."""
from pathlib import Path
from types import ModuleType
import hashlib,json,stat

KEY = 't45-first-r3-native-service-start-20261116-34'
RESTORE = 't45-r3-ordinary34-auth-restore-20261116-01'
B=Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs')
R=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3')
BOOT=R/'state/native-services'/KEY
SERVICE = {'containerId': '3ebc60712697f9a4fe8bd333fec07a6128b57a9c7b879c865332859acc237967', 'containerStartedAt': '2026-11-16T17:11:20.986520431Z', 'postmasterStart': '2026-11-16 17:11:22.392132+00', 'proofSha256': 'a30976e3decacda1d23da2014cb32ed4d42d7295d7c9cc073060d4084653a34d', 'serviceKey': 't45-first-r3-native-service-start-20261116-34'}
TERMINAL = '9a97f8c6702b0e1f1916c508bd1afb9c1c968200491e6226046d6ef584192c59'
NORMAL_ROOT = 'f4870f877c98e8075cf31754d7a46af631f4f780e0a775aa6ca1712f3980b6be'
NORMAL_PUBLIC = 'c8207babd477b0e2dad89021de225cbb2841dd192b580e7aa384fb3ea67b5d76'
INCOMPLETE_ROOT = '86d02a8dc156a789aeb5bcee0b8f0320f8ccf96a61cba8a6e6816fd696e4ac61'
INCOMPLETE_PUBLIC = '069347c8b42ed65d61feec264ec85d16b42138b10505d75b0d886fbf93116f97'
CLEANUP = '41838bb703af6a5326a91a5bcad1ef4abd51f290191d147d7519c4df46ac68d5'
ACK = '773a34c1a5e3111e531ede3bacf24e7f96d92d47ff5435fef94b8be6e8203b4a'
RESTORE_TERMINAL = '6ec792da7f9738b0d0983c2561b19129767ca6105fd800820f41bfc03fcd548a'
RESTORE_ROOT = '87e2d61a95d1b8d41e386028c6d3e21d96f5e348c349539cc64e0515e3cb5757'
RESTORE_PUBLIC = '62238aac84a4aa016b3e07cc91112ffa79a15b196c8543d36b56d827cf0f88eb'
OLD_MAIN = 'c9e3fd6d53bc3a8c2c60222d1abb2435ddad82d1cba6b97dcaf9326405348693'
OLD_PROOF = '7822dfca50c4233433b4cb9fb040ba02f4748edac1841555ca3652cca4cbc4e5'
DATA={'device':66304,'inode':13502421,'uid':61035,'gid':61035,'mode':0o700}

def need(ok,code):
    if not ok:raise ValueError('PRIOR34_'+code)
def sha(body):return hashlib.sha256(body).hexdigest()
def binding():
    return dict(previousTerminalSha256=TERMINAL,previousResultSha256=NORMAL_PUBLIC,
        previousCleanupSha256=CLEANUP,previousCurrentProofSha256=SERVICE['proofSha256'],
        previousIncompleteRootSha256=INCOMPLETE_ROOT,previousRetainedAckSha256=ACK,
        restoreTerminalSha256=RESTORE_TERMINAL,restoreResultSha256=RESTORE_PUBLIC)
def module(body,path,name):
    m=ModuleType(name);m.__file__=str(path);exec(compile(body,str(path),'exec'),m.__dict__);return m

def validate_terminal_object(t,key,status,exit_code):
    need((t.get('jobId'),t.get('taskId'),t.get('grantId'),t.get('status'),t.get('exitCode'))==
         (key,'T45','b16447fbc81f4d64',status,exit_code),'EXACT_TERMINAL_OUTCOME_REQUIRED')

def validate_failed_objects(normal,incomplete,clean):
    need(normal['requestKey']==KEY and normal['status']=='NORMAL_OUTCOME_UNCONFIRMED_ORIGINAL_KEY_ONLY','ORIGINAL_FAILED_RESULT_REQUIRED')
    need(incomplete['requestKey']==KEY and incomplete['cid']==SERVICE['containerId']
         and all(incomplete.get(k) is True for k in ('confirmed','containerStopped','createAttempted','currentProofPresent','retainedAckPresent','retainedAckValidated'))
         and incomplete['successfulResultHandoff'] is False and incomplete['runtimeMaterialPreserved'] is True
         and incomplete['currentProofSha256']==SERVICE['proofSha256'] and incomplete['retainedAckSha256']==ACK
         and incomplete['cleanStop']['cleanupLeaf']=='failed-start-cleanup.json'
         and incomplete['cleanStop']['cleanupSha256']==CLEANUP,'TYPED_AFTER_C_ACK_CLEANUP_REQUIRED')
    need(clean['requestKey']==KEY and clean['status']=='NORMAL_FAILED_START_CLEAN_STOP_CONFIRMED'
         and clean['originalPGDATAAndCleanStateVerified'] is True and clean['dataDirectoryIdentity']==DATA,'ORIGINAL_CLEAN_DATA_REQUIRED')

def validate_restored_object(restored):
    inside=restored['result'];cleanup=restored['cleanup']
    need(restored['requestKey']==RESTORE and restored['phase']=='restore'
         and inside['status']=='EXACT_ORIGINAL_TWO_ROLE_AUTH_AND_BOUNDARIES_RESTORED_BY_OFFLINE_READBACK'
         and inside['requestKey']=='t45-r3-ordinary34-auth-restore-20261116-01'
         and inside['exactOriginalVerifierAndExpiryVerifiedPrivately'] is True and inside['databaseStillStopped'] is True
         and all(inside[k] is False for k in ('runtimeAuthChanged','membershipsOrRoleAttributesChanged','naturalExpiryCountedAsRestoration'))
         and cleanup['ownContainerStopped'] is True and cleanup['ownedPidAbsent'] is True,'ACTUAL_ORIGINAL_AUTH_RESTORATION_REQUIRED')

def validate(ops,control,authority=None):
    need(type(SERVICE['containerStartedAt']) is str and type(SERVICE['postmasterStart']) is str,'EXACT_C_TUPLE_EVIDENCE_REQUIRED')
    if authority is not None:
        need(all(authority[k]==v for k,v in binding().items()),'ACTUAL_AUTHORITY_BINDINGS_REQUIRED')
    def root(path,pin,private=True):
        body=ops.read_file(path,65536,private);need(sha(body)==pin,'EXACT_ROOT_BYTES_REQUIRED');return body
    def pair(key,leaf,root_pin,public_pin):
        body=root(B/key/'results'/leaf,root_pin)
        public=ops.read_file(control/'jobs'/key/'results'/leaf,65536,False,False)
        need(sha(public)==public_pin and json.loads(body)==json.loads(public),'ROOT_PUBLIC_OBJECTS_REQUIRED')
        return json.loads(body)
    def terminal(key,pin,status,exit_code):
        raw=root(B/key/'r3-outer-terminal.json',pin)
        need(raw==ops.read_file(control/'results'/(key+'.json'),65536,False,False),'TERMINAL_PUBLIC_COPY_REQUIRED')
        t=json.loads(raw)
        validate_terminal_object(t,key,status,exit_code)
    terminal(KEY,TERMINAL,'FAILED',2)
    normal=pair(KEY,'normal-service-result.json',NORMAL_ROOT,NORMAL_PUBLIC)
    incomplete=pair(KEY,'normal-service-incomplete.json',INCOMPLETE_ROOT,INCOMPLETE_PUBLIC)
    clean=json.loads(root(BOOT/'failed-start-cleanup.json',CLEANUP))
    validate_failed_objects(normal,incomplete,clean)
    source=B/KEY/'bundle'
    old=module(root(source/'normal_service05_after08.py',OLD_MAIN),source/'normal_service05_after08.py','prior33_actual_normal')
    proof=module(root(source/'normal_service05_after08_proof.py',OLD_PROOF),source/'normal_service05_after08_proof.py','prior33_actual_proof')
    facts=old.failed_start_publication(ops,proof,BOOT,SERVICE['containerId'])
    need(all(incomplete.get(k)==v for k,v in facts.items()),'EXACT_OLD_C_ACK_PUBLICATION_REQUIRED')
    p=json.loads(root(R/'authority/fresh35-current-production-service-v2-service-34.json',SERVICE['proofSha256'],False))
    birth=p['sharedPostgresNamespace']['container']
    need(p['requestKey']==KEY and birth['id']==SERVICE['containerId'] and birth['startedAt']==SERVICE['containerStartedAt']
         and p['physical']['postmasterStart']==SERVICE['postmasterStart'] and p['dataDirectoryIdentity']==DATA,'REAL_PREDECESSOR_TUPLE_REQUIRED')
    root(BOOT/'retained-ack.json',ACK)
    terminal(RESTORE,RESTORE_TERMINAL,'COMPLETED',0)
    restored=pair(RESTORE,'maintenance-auth-result.json',RESTORE_ROOT,RESTORE_PUBLIC)
    validate_restored_object(restored)
    marker=R/'state/native-services/ordinary34-auth-20261116-01/restored.json';s=marker.lstat()
    need(json.loads(root(marker,'381d10acbc171f793e785366d3b3b74899bd344bf67235e9fefd4601ee2666a2'))==restored['result'],'EXACT_RESTORED_SAFE_RECEIPT_REQUIRED')
    need(marker.resolve()==marker and stat.S_ISREG(s.st_mode) and s.st_uid==s.st_gid==0 and s.st_nlink==1 and not s.st_mode&0o077,'PRIVATE_RESTORE_MARKER_METADATA_REQUIRED')
    for cid in ('3ebc60712697f9a4fe8bd333fec07a6128b57a9c7b879c865332859acc237967', '5b05f408fcdbc653fbd3c66d5b731bbfb7e054fd505f313a03ed6a13bee1ab69', 'a77e815a9151ccb73d0f9b99cffeef404115ac62996ac0f20c6e151f9443e893'):
        info=old.carrier_info(ops,cid)
        need(info['id']==cid and not info['running'] and info['pid']==0 and info['image']==ops.ENV_IMAGE,'OLD34_CONTAINER_STOP_REQUIRED')
    return dict(service=SERVICE,closureKind='FAILED_AFTER_C_ACK_CLEAN_STOP_AUTH_RESTORED',bindings=binding())
