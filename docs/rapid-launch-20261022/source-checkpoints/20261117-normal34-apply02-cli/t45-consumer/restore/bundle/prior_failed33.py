"""Exact failed33 C/ACK, typed cleanup and original-auth restoration predecessor."""
from pathlib import Path
from types import ModuleType
import hashlib,json,stat

KEY = 't45-first-r3-native-service-start-20261116-33'
RESTORE = 't45-r3-ordinary33-auth-restore-20261116-02'
B=Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs')
R=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3')
BOOT=R/'state/native-services'/KEY
SERVICE = {'containerId': '823a830fffb5adf106f6d98cf92809e2900f93ce753ddaaf2c78a52ce6242383', 'containerStartedAt': '2026-11-16T14:39:10.568097848Z', 'postmasterStart': '2026-11-16 14:39:11.919988+00', 'proofSha256': '6e80fa88fd64387f9cef4baf341a441ee5f4e4bddc26dce80a476e057cf0b2b8', 'serviceKey': 't45-first-r3-native-service-start-20261116-33'}
TERMINAL = '93fae5ccba52c9f66788c1bba550b37e4e8271d4ba0e0b918ee15d4b6a42459e'
NORMAL_ROOT = 'd54bc926de87f10c3a5a1544a00a676e5a09ac818d439feb1b6c22884864bdc4'
NORMAL_PUBLIC = '66fe7f92a7bf0c9d6c550551b7d75ded06e63c2ac4e8497597d9038f30b1f944'
INCOMPLETE_ROOT = 'c30c24d57467bb950e0ddb0f8f2ef151375fe62532457cb8bf8018fef637cf5c'
INCOMPLETE_PUBLIC = 'd7e124a976e99842833af3f93c5da2faf9ff4ddaf3bb1cb25c0bbd36841a531a'
CLEANUP = 'b22542359e3fdc5738f2d282b1ea22dcb645ab9a737bd6d337fda445f465ff91'
ACK = 'b3c1966bda82c89f40b12bd99625f2a83d1f3fcfecba40be629f8ac55644c442'
RESTORE_TERMINAL = '7688b15851d8804dbb75d18827ddcfd7b09308af47b54acb18501aa418b3725d'
RESTORE_ROOT = '2c0380766ac61444cc791da8789b9ba841ee5a78dacff7d11fbc5c43bfd83725'
RESTORE_PUBLIC = '9ed1bcd12e87ad1f08ca136c88dc5435a36bc25986606467a7fe9756934d8142'
OLD_MAIN = 'defd7f48ad1d9f9ea5586c193cd3002fcd9ebc37695e7daa6f242b7add0c2a66'
OLD_PROOF = '1b8550677d727949873efc42afaa25b5d243e31f3e6f5266ff97c97bda68f3c0'
DATA={'device':66304,'inode':13502421,'uid':61035,'gid':61035,'mode':0o700}

def need(ok,code):
    if not ok:raise ValueError('PRIOR33_'+code)
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
         and inside['requestKey']=='t45-r3-ordinary33-auth-restore-20261116-01'
         and inside['exactOriginalVerifierAndExpiryVerifiedPrivately'] is True and inside['databaseStillStopped'] is True
         and all(inside[k] is False for k in ('runtimeAuthChanged','membershipsOrRoleAttributesChanged','naturalExpiryCountedAsRestoration'))
         and cleanup['ownContainerStopped'] is True and cleanup['ownedPidAbsent'] is True,'ACTUAL_ORIGINAL_AUTH_RESTORATION_REQUIRED')

def validate(ops,control,authority=None):
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
    p=json.loads(root(R/'authority/fresh35-current-production-service-v2-service-33.json',SERVICE['proofSha256'],False))
    birth=p['sharedPostgresNamespace']['container']
    need(p['requestKey']==KEY and birth['id']==SERVICE['containerId'] and birth['startedAt']==SERVICE['containerStartedAt']
         and p['physical']['postmasterStart']==SERVICE['postmasterStart'] and p['dataDirectoryIdentity']==DATA,'REAL_PREDECESSOR_TUPLE_REQUIRED')
    root(BOOT/'retained-ack.json',ACK)
    terminal(RESTORE,RESTORE_TERMINAL,'COMPLETED',0)
    restored=pair(RESTORE,'maintenance-auth-result.json',RESTORE_ROOT,RESTORE_PUBLIC)
    validate_restored_object(restored)
    marker=R/'state/native-services/ordinary33-auth-20261116-01/restored.json';s=marker.lstat()
    need(json.loads(root(marker,'adfe3f7b83825b304346292a84296b9f6d05d99edaab41db85dff39021979470'))==restored['result'],'EXACT_RESTORED_SAFE_RECEIPT_REQUIRED')
    need(marker.resolve()==marker and stat.S_ISREG(s.st_mode) and s.st_uid==s.st_gid==0 and s.st_nlink==1 and not s.st_mode&0o077,'PRIVATE_RESTORE_MARKER_METADATA_REQUIRED')
    for cid in ('823a830fffb5adf106f6d98cf92809e2900f93ce753ddaaf2c78a52ce6242383', '3810c1d477355494d289aa74eb6e9ea6b52907509ec3cd14bfa0b9cb15615d53', '7116f4db51edec7d962c259b4a2f32d63845414075ac732a4f92beb65ca7b024'):
        info=old.carrier_info(ops,cid)
        need(info['id']==cid and not info['running'] and info['pid']==0 and info['image']==ops.ENV_IMAGE,'OLD33_CONTAINER_STOP_REQUIRED')
    return dict(service=SERVICE,closureKind='FAILED_AFTER_C_ACK_CLEAN_STOP_AUTH_RESTORED',bindings=binding())
