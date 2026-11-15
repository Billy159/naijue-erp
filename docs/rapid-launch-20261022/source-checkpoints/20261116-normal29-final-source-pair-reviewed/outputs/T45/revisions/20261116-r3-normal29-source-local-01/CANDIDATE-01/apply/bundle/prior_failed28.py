"""Exact failed28 C/ACK, typed cleanup and original-auth restoration predecessor."""
from pathlib import Path
from types import ModuleType
import hashlib,json,stat

KEY='t45-first-r3-native-service-start-20261116-28'
RESTORE='t45-r3-ordinary28-auth-restore-20261116-01'
B=Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64/jobs')
R=Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3')
BOOT=R/'state/native-services'/KEY
SERVICE={'serviceKey':KEY,'proofSha256':'d57946c9ff13ee5715787ee1d1f0a13fe1ffd2a2898fa76ecc82545a5d3d18ae',
 'containerId':'0fe68379c491aa5d7cdbdf83eed54d7bb0eae8d3f714d72d5a3ffe1d8efcdcb9',
 'containerStartedAt':'2026-11-15T21:13:30.610912971Z','postmasterStart':'2026-11-15 21:13:32.007922+00'}
TERMINAL='89afe4cb6651db43fe530961e62040ded2ee8ed8ead9bb720ca079776ffe1408'
NORMAL_ROOT='94cdae517c242cc904c7f68d1b43f31ce01aa87f7f0089fc1de93fb77c2cc29f'
NORMAL_PUBLIC='334e43befe79babb40626da0313fcc3370eb1f603895b6e0ba790661299cba46'
INCOMPLETE_ROOT='d3d32bee8c9792f5cfe8354e050cfec3a07977af7e3b324826b2d84b4330526d'
INCOMPLETE_PUBLIC='73de51b472b7b8c910d0939c2bbbaabcfa4e54e450625a58894f433d0771bd7c'
CLEANUP='395dd08471c95dda1f56f4959ae315d135fbec582ff97f489167a6033cc840b8'
ACK='7296e03b9865a67718c0e938058dd7990000a72535e3b00a5a94e7b5be7b1b83'
RESTORE_TERMINAL='496966e4b649819a641dc72eab3a3a2ca65f3507f59f27d5d04144617d553db6'
RESTORE_ROOT='b8da5c9281edc26cc20c17702f0257fa1c95016a8744ae5a6eae7cf0c41ce5cc'
RESTORE_PUBLIC='00813a0504f7fffe54e2614554e4a3489a2bcd5a9f3c69921717e781a7a1e98e'
OLD_MAIN='31a3faa3370038cf0b3284527dc154124a824447a7d1a6f0a2f32d26f98a6c8e'
OLD_PROOF='6d9d2c9d72cd355c8feb94762fe08f38668cc4b8f5f0075dc04809cdafe8aa0c'
DATA={'device':66304,'inode':13502421,'uid':61035,'gid':61035,'mode':0o700}

def need(ok,code):
    if not ok:raise ValueError('PRIOR28_'+code)
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
    old=module(root(source/'normal_service05_after08.py',OLD_MAIN),source/'normal_service05_after08.py','prior28_actual_normal')
    proof=module(root(source/'normal_service05_after08_proof.py',OLD_PROOF),source/'normal_service05_after08_proof.py','prior28_actual_proof')
    facts=old.failed_start_publication(ops,proof,BOOT,SERVICE['containerId'])
    need(all(incomplete.get(k)==v for k,v in facts.items()),'EXACT_OLD_C_ACK_PUBLICATION_REQUIRED')
    p=json.loads(root(R/'authority/fresh35-current-production-service-v2-service-28.json',SERVICE['proofSha256'],False))
    birth=p['sharedPostgresNamespace']['container']
    need(p['requestKey']==KEY and birth['id']==SERVICE['containerId'] and birth['startedAt']==SERVICE['containerStartedAt']
         and p['physical']['postmasterStart']==SERVICE['postmasterStart'] and p['dataDirectoryIdentity']==DATA,'REAL_PREDECESSOR_TUPLE_REQUIRED')
    root(BOOT/'retained-ack.json',ACK)
    terminal(RESTORE,RESTORE_TERMINAL,'COMPLETED',0)
    restored=pair(RESTORE,'maintenance-auth-result.json',RESTORE_ROOT,RESTORE_PUBLIC)
    validate_restored_object(restored)
    marker=R/'state/native-services/ordinary28-auth-20261116-01/restored.json';s=marker.lstat()
    need(marker.resolve()==marker and stat.S_ISREG(s.st_mode) and s.st_uid==s.st_gid==0 and s.st_nlink==1 and not s.st_mode&0o077,'PRIVATE_RESTORE_MARKER_METADATA_REQUIRED')
    for cid in (SERVICE['containerId'],'b9020f198b8dafed8c79b6fdffb33766d5912abad40ae45b24b1cb8f5fd28b50',
                '0cbf0e2fa1350650a13dcd1e150359a774fcc566637943ee250936e3aa57ca89'):
        info=old.carrier_info(ops,cid)
        need(info['id']==cid and not info['running'] and info['pid']==0 and info['image']==ops.ENV_IMAGE,'OLD28_CONTAINER_STOP_REQUIRED')
    return dict(service=SERVICE,closureKind='FAILED_AFTER_C_ACK_CLEAN_STOP_AUTH_RESTORED',bindings=binding())
