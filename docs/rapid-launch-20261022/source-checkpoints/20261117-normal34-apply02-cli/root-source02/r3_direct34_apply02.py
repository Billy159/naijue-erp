"""Six fixed direct REAL phases on retained DB05."""
from pathlib import Path
import os
import subprocess
import time


FORMAT = 'T45_R3_DIRECT33_BATCHED_REAL_V1'
POLICY_NAME = 'direct34-batched-real.json'
READONLY_POLICY = '338d30dc3b3d39de130f0152899eeb92a1aa91c9c60d2073b06a2227bb4024cd'
JOBS = {'apply': 't45-r3-ordinary34-auth-apply-20261116-02', 'catalog_update': 't45-r3-batched161-command-successor-20261116-01', 'input_materialize': 't45-r3-final33-input-materialize-20261116-02', 'materialize': 't45-r3-batched-root06-source-delta-20261116-01', 'prepare': 't45-r3-final33-plan-prepare-20261116-01', 'restore': 't45-r3-ordinary34-auth-restore-20261116-01', 'start': 't45-first-r3-native-service-start-20261116-34', 'stop': 't45-r3-ordinary34-preserve-stop-20261116-01', 'writer': 't45-r3-batched-real-execute-20261115-01'}
HISTORICAL_INSTALL = {'publicResultSha256': 'c3f11ec9de8c87c59fbd39201f8cfb9a82069485096a9ca3a7c2da14132b6749',
 'requestKey': 't45-r3-batched-install-20261116-02',
 'rootResultSha256': 'e14e9b649d9b4d4864360384e93e059cdda80c37e769de91f2452abd1af87792',
 'terminalSha256': '01b46789810bde6d88f43cfddcce77d5bc6f28694fbb37b1b431e6caff69a4f2'}
ORIGINAL_WRITER = 't45-first-20261110-r3-real-execute-20261114-06'
INSPECT = 't45-r3-original-transaction-inspect-20261114-01'
INSPECT_TERMINAL = '33af79a05da4659e18febe940629f264bc1b3ffcdeede110aa1aac10af29a5c0'
INSPECT_RESULTS = {
    'original02-readonly-inspect-result.json': (
        '433d6ec22852aecdf6c3f1626b7a43648439839e80c1bae015589f03de4b96c1',
        '67089d704b994d1e98d6532a1e6e78c982d40d1d90e8e39e0b76d8bda6cb35a4'),
    'original02-readonly-inspect-process-cleanup.json': (
        '5daf2a828935ff91d33333c81af8e576372fb1f295f46065c1bae349f574647e',
        'd9cd2791e151625880d96b7eba6b07e8d2b6d9aa157022062ae8dbf4864d9f45'),
    'original02-readonly-inspect-child-cleanup.json': (
        'f82e9cef4af19aec31212139f9b661c5038986de8d9953cef13916b71955980f',
        '2f0c4aeaecefda51a2ba739ab4a04741051270762c1c79ff6c74825ccc64f29d'),
}
PREVIOUS21_READER_RESULTS = {'original03-readonly-inspect-process-cleanup.json': ('e1ecdbc1997e6a8cf12f13e77dba9337dbf663b626ac9a02ab5d18dcea6c6bcf', '90235e14a5fee775d19c4cbb4d35cb55cdabe623200e5a588a8c37cde832a85d'), 'original03-readonly-inspect-result.json': ('61345639bd63317a936e19609271159d579b4e5b3c9037599e41d02181aba8b7', '72986ce091248a503dd311613f6c38598b1784e66877db812a3b71649ca53e02'), 'retained21-readback-child-cleanup.json': ('5d1ec298eefa4ae826922e82d288c29bb1a7ce1793b0fd307ca84156ea12b97d', 'c3af674e83add83c349f7ac23aac691e7d9e2cc578bee0a71eb891340627e2ba')}
PREVIOUS22_READER_RESULTS = {'original04-readonly-inspect-process-cleanup.json': ('fb6580eb9fc66d8eb6314534e3c90608c4898f8f30a6a1de91249d9c49e47d48', 'de54e6bd915e751f380c1619ef2c6f5766d09d0c62e4517efa628c660199522c'), 'original04-readonly-inspect-result.json': ('c8bc01f1710444f3caf7b1b65265feb5ded0130635150ab44b754e59ac9179a3', '1cfba32fd2971ab40dbe8bc35417a3eeb9d960a425a38bf8c90260faa0d66895'), 'retained22-readback-child-cleanup.json': ('3fd5410e5936c1e7c85fc6404f49e740812fb04fd5ec81a5dd1186dc71d0851b', '5397ba062d5ee85e7d00d13f8b01124da2961cb8c4196a229a9cb1f12651fda2')}
SERVICE_KEY = JOBS['start']
HOST = Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3')
PROOF = HOST/'authority/fresh35-current-production-service-v2-service-34.json'
PREVIOUS_SERVICE = {'containerId': '036e8221eaafb4fb473b5f9a5e7a61142d57e8dcd8ea76374916cbbe80f2ded8', 'containerStartedAt': '2026-11-14T04:17:02.413303865Z', 'postmasterStart': '2026-11-14 04:17:03.806731+00', 'proofSha256': 'ea7f29a555c0672d11457a1ae45788f7ce2495ecc25683a748a6e9b8dd9ded9b', 'serviceKey': 't45-first-r3-native-service-start-20261114-22'}


import hashlib,json,stat
GRANT='b16447fbc81f4d64'
B = Path('/root/erp-release-20261006-01-worker/grant-b16447fbc81f4d64')
P = Path('/usr/local/lib/naijue-erp-night/grant-b16447fbc81f4d64')
C = Path('/home/naijue/erp-release-20261006-01-control/grant-b16447fbc81f4d64')
USED = {'apply': {'exitCode': 0,
           'leaf': 'maintenance-auth-result.json',
           'publicResultSha256': '15d9d4dba833eb105683e51880a46c9aab037f90cdd57530ad139e91d87b2de7',
           'requestKey': 't45-r3-ordinary33-auth-apply-20261116-01',
           'rootResultSha256': 'c6f32cd3132c6505d620c7f7ef777050e860694c736213e60eb07eeb53f36859',
           'terminalSha256': 'c4bf8e001c88ce6929d062ead377c0dbadae0ca0eaae079c75e871954c5a51c6',
           'terminalStatus': 'COMPLETED',
           'value': {'SQL36OrBusinessImport': False,
                     'automaticReplay': False,
                     'cleanup': {'automaticReplay': False,
                                 'cid': '3810c1d477355494d289aa74eb6e9ea6b52907509ec3cd14bfa0b9cb15615d53',
                                 'confirmed': True,
                                 'createAttempted': True,
                                 'exitCode': 0,
                                 'oomKilled': False,
                                 'ownContainerStopped': True,
                                 'ownedPidAbsent': True,
                                 'requestKey': 't45-r3-ordinary33-auth-apply-20261116-01',
                                 'sourceDataPreserved': True,
                                 'stage': 'READ_BACK_OWN_CONTAINER_STOP'},
                     'newDatabaseOrRole': False,
                     'normal08Or05Started': False,
                     'phase': 'apply',
                     'requestKey': 't45-r3-ordinary33-auth-apply-20261116-01',
                     'result': {'authenticationAttempted': False,
                                'automaticReplay': False,
                                'credentialValidUntilByRole': {'erp35_admin_20261110_r3': 1794845751546,
                                                               'erp35_controller_20261110_r3': 1794845631546},
                                'membershipsOrRoleAttributesChanged': False,
                                'newRoles': 0,
                                'privateRecoveryBasisRetained': True,
                                'requestKey': 't45-r3-ordinary33-auth-apply-20261116-01',
                                'roles': ['erp35_controller_20261110_r3', 'erp35_admin_20261110_r3'],
                                'runtimeAuthChanged': False,
                                'status': 'EXACT_TWO_ROLE_FINITE_AUTH_FIELDS_READ_BACK_NOT_NATIVE_COMMIT_ACK'},
                     'status': 'FINITE_MAINTENANCE_AUTH_STEP_AND_OWN_CONTAINER_EXIT_CONFIRMED'}},
 'restore01': {'exitCode': 2,
               'leaf': 'maintenance-auth-result.json',
               'publicResultSha256': '43546173512cf80af6f66350e1a10a41a71d7d1dc0154791d8c967839deab6e9',
               'requestKey': 't45-r3-ordinary33-auth-restore-20261116-01',
               'rootResultSha256': 'eba7deb6e9aa8091b2619794cf71261d282c377b485a6132f2058a6d9b190c71',
               'terminalSha256': '6d05f1bab9fccde6b178cd4496f38822434b6137b332eaa74dc9f10a15331e8c',
               'terminalStatus': 'FAILED',
               'value': {'automaticReplay': False,
                         'phase': 'restore',
                         'privateRecoveryBasisAndPartialStatePreserved': True,
                         'requestKey': 't45-r3-ordinary33-auth-restore-20261116-01',
                         'safeCode': 'ORDINARY05_FAILED_START_SOURCE_DIFFERS',
                         'status': 'FINITE_AUTH_STEP_UNCONFIRMED_ORIGINAL_KEY_ONLY'}},
 'restore02': {'exitCode': 0,
               'leaf': 'maintenance-auth-result.json',
               'publicResultSha256': '9ed1bcd12e87ad1f08ca136c88dc5435a36bc25986606467a7fe9756934d8142',
               'requestKey': 't45-r3-ordinary33-auth-restore-20261116-02',
               'rootResultSha256': '2c0380766ac61444cc791da8789b9ba841ee5a78dacff7d11fbc5c43bfd83725',
               'terminalSha256': '7688b15851d8804dbb75d18827ddcfd7b09308af47b54acb18501aa418b3725d',
               'terminalStatus': 'COMPLETED',
               'value': {'SQL36OrBusinessImport': False,
                         'automaticReplay': False,
                         'cleanup': {'automaticReplay': False,
                                     'cid': '7116f4db51edec7d962c259b4a2f32d63845414075ac732a4f92beb65ca7b024',
                                     'confirmed': True,
                                     'createAttempted': True,
                                     'exitCode': 0,
                                     'oomKilled': False,
                                     'ownContainerStopped': True,
                                     'ownedPidAbsent': True,
                                     'requestKey': 't45-r3-ordinary33-auth-restore-20261116-02',
                                     'sourceDataPreserved': True,
                                     'stage': 'READ_BACK_OWN_CONTAINER_STOP'},
                         'newDatabaseOrRole': False,
                         'normal08Or05Started': False,
                         'phase': 'restore',
                         'requestKey': 't45-r3-ordinary33-auth-restore-20261116-02',
                         'result': {'automaticReplay': False,
                                    'databaseStillStopped': True,
                                    'exactOriginalVerifierAndExpiryVerifiedPrivately': True,
                                    'membershipsOrRoleAttributesChanged': False,
                                    'naturalExpiryCountedAsRestoration': False,
                                    'privateRecoveryBasisRetained': True,
                                    'requestKey': 't45-r3-ordinary33-auth-restore-20261116-01',
                                    'roles': ['erp35_controller_20261110_r3', 'erp35_admin_20261110_r3'],
                                    'runtimeAuthChanged': False,
                                    'status': 'EXACT_ORIGINAL_TWO_ROLE_AUTH_AND_BOUNDARIES_RESTORED_BY_OFFLINE_READBACK'},
                         'status': 'FINITE_MAINTENANCE_AUTH_STEP_AND_OWN_CONTAINER_EXIT_CONFIRMED'}},
 'start': {'exitCode': 2,
           'leaf': 'normal-service-result.json',
           'publicResultSha256': '66fe7f92a7bf0c9d6c550551b7d75ded06e63c2ac4e8497597d9038f30b1f944',
           'requestKey': 't45-first-r3-native-service-start-20261116-33',
           'rootResultSha256': 'd54bc926de87f10c3a5a1544a00a676e5a09ac818d439feb1b6c22884864bdc4',
           'terminalSha256': '93fae5ccba52c9f66788c1bba550b37e4e8271d4ba0e0b918ee15d4b6a42459e',
           'terminalStatus': 'FAILED',
           'value': {'automaticRetry': False,
                     'requestKey': 't45-first-r3-native-service-start-20261116-33',
                     'safeCode': 'DESCRIBE_NATIVE_FAILED_READ_PRIVATE_PROCESS_RECEIPT',
                     'status': 'NORMAL_OUTCOME_UNCONFIRMED_ORIGINAL_KEY_ONLY'}}}
ORIGINAL_JOBS = {'apply': 't45-r3-ordinary33-auth-apply-20261116-01',
 'catalog_update': 't45-r3-batched161-command-successor-20261116-01',
 'input_materialize': 't45-r3-final33-input-materialize-20261116-02',
 'materialize': 't45-r3-batched-root06-source-delta-20261116-01',
 'prepare': 't45-r3-final33-plan-prepare-20261116-01',
 'restore': 't45-r3-ordinary33-auth-restore-20261116-01',
 'start': 't45-first-r3-native-service-start-20261116-33',
 'stop': 't45-r3-ordinary33-preserve-stop-20261116-01',
 'writer': 't45-r3-batched-real-execute-20261115-01'}
JOBS = {'apply': 't45-r3-ordinary34-auth-apply-20261116-02', 'catalog_update': 't45-r3-batched161-command-successor-20261116-01', 'input_materialize': 't45-r3-final33-input-materialize-20261116-02', 'materialize': 't45-r3-batched-root06-source-delta-20261116-01', 'prepare': 't45-r3-final33-plan-prepare-20261116-01', 'restore': 't45-r3-ordinary34-auth-restore-20261116-01', 'start': 't45-first-r3-native-service-start-20261116-34', 'stop': 't45-r3-ordinary34-preserve-stop-20261116-01', 'writer': 't45-r3-batched-real-execute-20261115-01'}
COMPLETED = {'input_materialize': {'leaf': 'final33-input-materialization-result.json',
                       'marker': '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/r3-final33-private-import-input-20261116-01/materialization-receipt.json',
                       'publicResultSha256': '796bdede6fc7f7ce464c5ca3966963335f80e24f4fc9248aedb3d10776417d64',
                       'requestKey': 't45-r3-final33-input-materialize-20261116-02',
                       'rootResultSha256': '556cb0e3a336aaed7c5c156cc531b90c0895a63c65d1020e91dcfe1b00bbdb58',
                       'terminalSha256': 'b959313cb4d054bd1017480781c280cecc787ce41ad0990cdd88c807d2f73004',
                       'value': {'PGConnections': 0,
                                 'archiveMembers': [31, 34],
                                 'businessDatabaseWrites': False,
                                 'deliveryIndexSha256': '954bbd6508725fa0e9f38140d4ef8830d266d10d5ec8f9556db6196c8412d88f',
                                 'elapsedSeconds': 68.479,
                                 'manifestSha256': '7ebdac46d6f266065368b26d91821882284ce91a9071c23a98176bacede78679',
                                 'minimumFreeBytes': 30064771072,
                                 'preflightIndex': {'bytes': 2329927680,
                                                    'sha256': 'b5a6e1449795ccd4eef72de1599335633e2ee55cd076a7a0a920e9c4b063e9dd'},
                                 'preflightSummary': {'bytes': 58708922,
                                                      'sha256': '6751463c596b0330faf7851c255bf972cbede3cfad6c0fed027e5befd137336d'},
                                 'profileSha256': '71b861440bc6368da3f2c0b6293fc87af6af0de77991b145c9f7c74daf9663c7',
                                 'requestKey': 't45-r3-final33-input-materialize-20261116-02',
                                 'sourceInputsOverwritten': False,
                                 'state': 'FINAL33_PRIVATE_INPUTS_MATERIALIZED_NO_PG_OR_PRECHECK_REPLAY',
                                 'targetDirectory': '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/r3-final33-private-import-input-20261116-01',
                                 'targetIdentity': {'device': 66304, 'inode': 13665604}}},
 'materialize': {'leaf': 'batched-source-materialization.json',
                 'marker': '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/installed-real-operation-batched-root06-20261116-01/source-materialization.json',
                 'publicResultSha256': '0bd916e2d757a93de11853899f8ca69d2b884a60c3104b80286daa2687311e7e',
                 'requestKey': 't45-r3-batched-root06-source-delta-20261116-01',
                 'rootResultSha256': '73ec88d3de4b7239972b5282d2750076846d95b190801992e2bcf42c9ff5b171',
                 'terminalSha256': '13cdb833a19ab30816660d1300f244ab41d3bd4485bcd8f50715d2b5b54e99c6',
                 'value': {'automaticReplay': False,
                           'changedFiles': 16,
                           'databaseConnections': 0,
                           'databaseWrites': 0,
                           'inheritedUnchangedFiles': 371,
                           'installerRunnerSha256': '6c7653bac1aa19e90a05ee8167e59305c906c8bdda6866ef0c562545107fe8f4',
                           'liveCatalogVerified': False,
                           'nodeModulesChanged': False,
                           'originalSourcePreserved': True,
                           'predecessorMaterializationSha256': 'e8f8032b00601e976c094f0365064d0385d7af8f48f9f7bbb465dca896bf3a5e',
                           'requestKey': 't45-r3-batched-root06-source-delta-20261116-01',
                           'serviceStarted': False,
                           'sourceDescriptionSha256': '6ae38a43efeea1a146fae71fb1cd8d9996d70ec5df2362ebb9e8461d707c2d2e',
                           'sourceFiles': 387,
                           'sourceRoot': '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/installed-real-operation-batched-root06-20261116-01/operation',
                           'sourceRowsSha256': '078f2c0019df117ae9a32e2276feebca9094ce6dc91e5eaede3f8d9201202fe9',
                           'sourceSetSha256': 'd20f9f89091f7a0c1006fdadf0c5fecc7711dc7398d8e2cf0471789c2f9ea898',
                           'state': 'EXACT_FROZEN_SOURCE_MATERIALIZED_NO_INSTALL_OR_EXECUTION'}}}
BOOT = Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/t45-first-r3-native-service-start-20261116-33')
CUSTODY = Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary33-auth-20261116-01')
CUSTODY_FILES = ['/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary33-auth-20261116-01/original-auth.json',
 '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary33-auth-20261116-01/finite-auth.json',
 '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary33-auth-20261116-01/applied.json',
 '/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/state/native-services/ordinary33-auth-20261116-01/restore-attempt.json']
ROLE_SHA = '33bcd2fbe1a81631d710f46ab40bf2687cdc40162baf02de474951e85e17d69f'
CLEANUP_SHA = 'b22542359e3fdc5738f2d282b1ea22dcb645ab9a737bd6d337fda445f465ff91'
INCOMPLETE_SHA = 'c30c24d57467bb950e0ddb0f8f2ef151375fe62532457cb8bf8018fef637cf5c'
RESTORE_CLEANUP_SHA = '3dba242155468f723fbd61b7185750fcdabfa928a3236b14dc7b9e558fa3dcac'
RESTORED_SHA = 'adfe3f7b83825b304346292a84296b9f6d05d99edaab41db85dff39021979470'
PRIOR_SERVICE = {'containerId': '823a830fffb5adf106f6d98cf92809e2900f93ce753ddaaf2c78a52ce6242383',
 'containerStartedAt': '2026-11-16T14:39:10.568097848Z',
 'postmasterStart': '2026-11-16 14:39:11.919988+00',
 'proofSha256': '6e80fa88fd64387f9cef4baf341a441ee5f4e4bddc26dce80a476e057cf0b2b8',
 'serviceKey': 't45-first-r3-native-service-start-20261116-33'}
PRIOR_BINDINGS = {'previousCleanupSha256': 'b22542359e3fdc5738f2d282b1ea22dcb645ab9a737bd6d337fda445f465ff91',
 'previousCurrentProofSha256': '6e80fa88fd64387f9cef4baf341a441ee5f4e4bddc26dce80a476e057cf0b2b8',
 'previousIncompleteRootSha256': 'c30c24d57467bb950e0ddb0f8f2ef151375fe62532457cb8bf8018fef637cf5c',
 'previousResultSha256': '66fe7f92a7bf0c9d6c550551b7d75ded06e63c2ac4e8497597d9038f30b1f944',
 'previousRetainedAckSha256': 'b3c1966bda82c89f40b12bd99625f2a83d1f3fcfecba40be629f8ac55644c442',
 'previousTerminalSha256': '93fae5ccba52c9f66788c1bba550b37e4e8271d4ba0e0b918ee15d4b6a42459e',
 'restoreResultSha256': '9ed1bcd12e87ad1f08ca136c88dc5435a36bc25986606467a7fe9756934d8142',
 'restoreTerminalSha256': '7688b15851d8804dbb75d18827ddcfd7b09308af47b54acb18501aa418b3725d'}
OLD_CONTAINERS = [('t45-r3-ordinary33-auth-apply-20261116-01', '3810c1d477355494d289aa74eb6e9ea6b52907509ec3cd14bfa0b9cb15615d53'),
 ('t45-r3-ordinary33-auth-restore-20261116-02', '7116f4db51edec7d962c259b4a2f32d63845414075ac732a4f92beb65ca7b024'),
 ('t45-first-r3-native-service-start-20261116-33', '823a830fffb5adf106f6d98cf92809e2900f93ce753ddaaf2c78a52ce6242383')]
def need(ok, code):
    if not ok:
        raise ValueError('NORMAL34_REGISTRATION_' + code)
def sha(raw):
    return hashlib.sha256(raw).hexdigest()
def identity(s):
    return [s.st_dev, s.st_ino, s.st_uid, s.st_gid, stat.S_IMODE(s.st_mode), s.st_nlink,
            s.st_size, s.st_mtime_ns, s.st_ctime_ns]
def read(path,owner=0):
 need(path.resolve()==path,'CANONICAL_INPUT_REQUIRED')
 with os.fdopen(os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK),'rb')as f:
  s=os.fstat(f.fileno());need(stat.S_ISREG(s.st_mode)and s.st_uid==owner and s.st_nlink==1 and not s.st_mode&0o022 and 0<s.st_size<=4*1024**2,'PROTECTED_INPUT_REQUIRED')
  raw=f.read(4*1024**2+1);need(len(raw)==s.st_size and identity(s)==identity(os.fstat(f.fileno()))==identity(path.lstat()),'INPUT_CHANGED')
 return raw,identity(s)
def check_completed_value(phase, terminal, value):
    expected = COMPLETED[phase]
    need((terminal.get('jobId'),terminal.get('status'),terminal.get('exitCode'),terminal.get('phaseStarted')) == (expected['requestKey'],'COMPLETED',0,True),'COMPLETED_TERMINAL_DIFFERS')
    need(value == expected['value'],'COMPLETED_RESULT_VALUE_DIFFERS')
def completed_preparation():
    result={}
    for phase, expected in COMPLETED.items():
        key=expected['requestKey']
        terminal=read(B/'jobs'/key/'r3-outer-terminal.json')[0]
        public_terminal=read(C/'results'/(key+'.json'),1000)[0]
        root=read(B/'jobs'/key/'results'/expected['leaf'])[0]
        public=read(C/'jobs'/key/'results'/expected['leaf'],1000)[0]
        marker=read(Path(expected['marker']))[0]
        need(sha(terminal)==expected['terminalSha256'] and terminal==public_terminal,'COMPLETED_TERMINAL_BYTES_DIFFER')
        need(sha(root)==expected['rootResultSha256'] and sha(public)==expected['publicResultSha256'] and root==marker,'COMPLETED_RESULT_OR_MARKER_SHA_DIFFERS')
        value=json.loads(root);need(value==json.loads(public),'COMPLETED_RESULT_OBJECTS_DIFFER')
        check_completed_value(phase,json.loads(terminal),value)
        if phase=='input_materialize':
            target=Path(value['targetDirectory']);s=target.lstat()
            need(target.resolve()==target and stat.S_ISDIR(s.st_mode) and (s.st_dev,s.st_ino,s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode))==(66304,13665604,0,61035,0o750),'COMPLETED_INPUT_TARGET_IDENTITY_DIFFERS')
        else:
            for target in (Path(value['sourceRoot']).parent,Path(value['sourceRoot'])):
                s=target.lstat();need(target.resolve()==target and stat.S_ISDIR(s.st_mode) and s.st_uid==s.st_gid==0 and stat.S_IMODE(s.st_mode)==0o755,'COMPLETED_SOURCE_TARGET_DIFFERS')
        result[phase]={k:v for k,v in expected.items() if k!='leaf'}
        result[phase].update(terminalBytesEqual=True,resultObjectsEqual=True,markerEqualsRoot=True)
    return result
def validate_used_value(phase,terminal,value):
    e=USED[phase]
    need((terminal.get('jobId'),terminal.get('taskId'),terminal.get('grantId'),terminal.get('status'),terminal.get('exitCode'),terminal.get('phaseStarted'))==(e['requestKey'],'T45',GRANT,e['terminalStatus'],e['exitCode'],True),'EXACT_USED_TERMINAL_REQUIRED')
    need(value==e['value'],'EXACT_USED_RESULT_REQUIRED')

REFUSED_KEY = 't45-r3-ordinary34-auth-apply-20261116-01'
REFUSED_TERMINAL_SHA = '39dd96689785ea6fc041eef092fd3097677f2e3ffbc3c5c6b56f2fce482c3600'
REFUSED_REQUEST_SHA = '39bcfdde2286969bd3fd9035ad5efcc0e42d279453b5f997c8ba2e9bd2505807'
REFUSED_HOST_SHA = '5467fa0e5bb89f7002bd7fa62a477acb9c5021dad9ad1297610bf61fcc0f6e5d'
REFUSED_ROLE_SHA = '60ff1ff38900e1d07001486e05848124b1ed64bba0ea425357d4ac9006af16c6'
REFUSED_MANIFEST_SHA = '544a6f1d3a87fb02a5a66ba701a199c5597e9e5fd3d86863e6c6faaa60df05a3'
REFUSED_TERMINAL = {'atUTC': '2026-11-16T16:22:59.960926+00:00',
 'businessAcceptanceClaimed': False,
 'elapsedSeconds': 0.04957998695317656,
 'errorCode': 'R3_CONTINUITY_DIRECT33_EXACT_FINITE_AUTHORITY_REQUIRED',
 'exitCode': 2,
 'exports': [],
 'finishedAtUTC': '2026-11-16T16:23:00.036362+00:00',
 'grantId': 'b16447fbc81f4d64',
 'jobId': 't45-r3-ordinary34-auth-apply-20261116-01',
 'phaseStarted': False,
 'privateLogsExported': False,
 'scope': 'ERP_EXISTING_TASKS_THROUGH_T51',
 'status': 'REFUSED_R3_CONTINUITY_BEFORE_PHASE',
 'taskId': 'T45',
 'unit': 'naijue-erp-op-b16447fb-cec65c8ea6c4'}
REFUSED_REQUEST = {'args': [],
 'businessCutoverConfirmed': False,
 'gateEvidence': {},
 'grantId': 'b16447fbc81f4d64',
 'jobId': 't45-r3-ordinary34-auth-apply-20261116-01',
 'manifestSha256': '544a6f1d3a87fb02a5a66ba701a199c5597e9e5fd3d86863e6c6faaa60df05a3',
 'scope': 'ERP_EXISTING_TASKS_THROUGH_T51',
 'script': 'ordinary05_roles_job.py',
 'taskEvidence': {},
 'taskId': 'T45',
 'timeoutSeconds': 300}

def refused_apply34_history():
    # Immutable original-key evidence only. Do not require future custody/PG state here.
    job=B/'jobs'/REFUSED_KEY
    terminal=read(job/'r3-outer-terminal.json')[0]
    public=read(C/'results'/(REFUSED_KEY+'.json'),1000)[0]
    request=read(job/'request.json')[0]
    need(sha(terminal)==REFUSED_TERMINAL_SHA and terminal==public and json.loads(terminal)==REFUSED_TERMINAL,'EXACT_APPLY34_BEFORE_PHASE_REFUSAL_REQUIRED')
    need(sha(request)==REFUSED_REQUEST_SHA and json.loads(request)==REFUSED_REQUEST and REFUSED_REQUEST['args']==[],'EXACT_ORIGINAL_APPLY34_EMPTY_ARGS_REQUIRED')
    need(REFUSED_TERMINAL['phaseStarted'] is False and REFUSED_TERMINAL['exports']==[] and REFUSED_TERMINAL['status']=='REFUSED_R3_CONTINUITY_BEFORE_PHASE' and REFUSED_TERMINAL['exitCode']==2 and REFUSED_TERMINAL['errorCode']=='R3_CONTINUITY_DIRECT33_EXACT_FINITE_AUTHORITY_REQUIRED','NO_EXECUTED_APPLY_OR_FAKE_RESTORE_ALLOWED')
    for leaf,pin in [('host-authorization.json',REFUSED_HOST_SHA),('roles-authorization.json',REFUSED_ROLE_SHA),('bundle-manifest.json',REFUSED_MANIFEST_SHA)]:
        need(sha(read(job/'bundle'/leaf)[0])==pin,'EXACT_REFUSED_APPLY34_BUNDLE_REQUIRED')
    need(not os.path.lexists(job/'phase.private.log') and not any(os.path.lexists(job/'results'/leaf) for leaf in ('maintenance-auth-intent.json','maintenance-auth-inside.json','maintenance-auth-cleanup.json','maintenance-auth-result.json')),'ORIGINAL_REFUSED_KEY_CHILD_EVIDENCE_PRESENT')
    return {'requestKey':REFUSED_KEY,'terminalSha256':REFUSED_TERMINAL_SHA,'requestSha256':REFUSED_REQUEST_SHA,'phaseStarted':False,'credentialWriteOccurred':False}

def required_history():
    completed_preparation()
    for phase,e in USED.items():
        key=e['requestKey'];terminal=read(B/'jobs'/key/'r3-outer-terminal.json')[0];public_t=read(C/'results'/(key+'.json'),1000)[0]
        root=read(B/'jobs'/key/'results'/e['leaf'])[0];public=read(C/'jobs'/key/'results'/e['leaf'],1000)[0]
        need(sha(terminal)==e['terminalSha256'] and terminal==public_t,'EXACT_USED_TERMINAL_BYTES_REQUIRED')
        need(sha(root)==e['rootResultSha256'] and sha(public)==e['publicResultSha256'] and json.loads(root)==json.loads(public),'EXACT_USED_RESULT_OBJECTS_REQUIRED')
        validate_used_value(phase,json.loads(terminal),json.loads(root))
    raw=read(B/'jobs'/USED['start']['requestKey']/'results/normal-service-incomplete.json')[0]
    public=read(C/'jobs'/USED['start']['requestKey']/'results/normal-service-incomplete.json',1000)[0]
    need(sha(raw)==INCOMPLETE_SHA and sha(public)=='d7e124a976e99842833af3f93c5da2faf9ff4ddaf3bb1cb25c0bbd36841a531a' and json.loads(raw)==json.loads(public),'EXACT_INCOMPLETE_PAIR_REQUIRED')
    incomplete=json.loads(raw);cleanup=read(BOOT/'failed-start-cleanup.json')[0];clean=json.loads(cleanup)
    need(sha(cleanup)==CLEANUP_SHA and incomplete.get('successfulResultHandoff') is False and incomplete.get('pid')==0
         and incomplete.get('cid')==PRIOR_SERVICE['containerId'] and all(incomplete.get(k) is True for k in ('confirmed','containerStopped','createAttempted','currentProofPresent','retainedAckPresent','retainedAckValidated','runtimeMaterialPreserved')),'REAL_FAILED33_AFTER_ACK_REQUIRED')
    need(incomplete['cleanStop']==dict(clean,cleanupLeaf='failed-start-cleanup.json',cleanupSha256=CLEANUP_SHA)
         and clean['status']=='NORMAL_FAILED_START_CLEAN_STOP_CONFIRMED' and clean['requestKey']==USED['start']['requestKey']
         and clean['originalPGDATAAndCleanStateVerified'] is True and clean['dataDirectoryIdentity']=={'device':66304,'inode':13502421,'uid':61035,'gid':61035,'mode':448},'REAL_FAILED33_CLEAN_STOP_REQUIRED')
    proof=read(Path('/srv/naijue-erp/isolated-targets/fresh35-first-production-20261110-r3/authority/fresh35-current-production-service-v2-service-33.json'))[0]
    need(sha(proof)==PRIOR_SERVICE['proofSha256']==incomplete['currentProofSha256'],'ACTUAL_FAILED33_C_CHANGED')
    p=json.loads(proof);birth=p['sharedPostgresNamespace']['container']
    need(p['requestKey']==PRIOR_SERVICE['serviceKey'] and birth['id']==PRIOR_SERVICE['containerId'] and birth['startedAt']==PRIOR_SERVICE['containerStartedAt'] and p['physical']['postmasterStart']==PRIOR_SERVICE['postmasterStart'] and p['dataDirectoryIdentity']==clean['dataDirectoryIdentity'],'ACTUAL_FAILED33_SERVICE_CHANGED')
    ack=read(BOOT/'retained-ack.json')[0]
    need(sha(ack)==PRIOR_BINDINGS['previousRetainedAckSha256']==incomplete['retainedAckSha256'] and json.loads(ack)=={'requestKey':PRIOR_SERVICE['serviceKey'],'proofSha256':PRIOR_SERVICE['proofSha256'],'serviceLeaseExpiresAt':p['sharedPostgresNamespace']['serviceLeaseExpiresAt']},'ACTUAL_VALIDATED_FAILED33_ACK_REQUIRED')
    restore=USED['restore02']['value'];inside=restore['result']
    need(inside['requestKey']==USED['restore01']['requestKey'] and inside['status']=='EXACT_ORIGINAL_TWO_ROLE_AUTH_AND_BOUNDARIES_RESTORED_BY_OFFLINE_READBACK' and inside['exactOriginalVerifierAndExpiryVerifiedPrivately'] is True and inside['databaseStillStopped'] is True and all(inside[k] is False for k in ('naturalExpiryCountedAsRestoration','runtimeAuthChanged','membershipsOrRoleAttributesChanged')),'ACTUAL_RESTORE02_ORIGINAL_AUTH_REQUIRED')
    raw=read(B/'jobs'/USED['restore02']['requestKey']/'results/maintenance-auth-cleanup.json')[0]
    need(sha(raw)==RESTORE_CLEANUP_SHA and json.loads(raw)==restore['cleanup'] and all(restore['cleanup'][k] is True for k in ('confirmed','ownContainerStopped','ownedPidAbsent','sourceDataPreserved')),'ACTUAL_RESTORE02_CLEANUP_REQUIRED')
    need(sha(read(CUSTODY/'authority.json')[0])==ROLE_SHA and sha(read(CUSTODY/'restored.json')[0])==RESTORED_SHA and json.loads(read(CUSTODY/'restored.json')[0])==inside,'ACTUAL_SAFE_RESTORATION_RECEIPT_REQUIRED')
    failed=B/'jobs'/USED['restore01']['requestKey']
    need(not any(os.path.lexists(failed/'results'/leaf) for leaf in ('maintenance-auth-intent.json','maintenance-auth-inside.json','maintenance-auth-cleanup.json')),'RESTORE01_PRE_INNER_REFUSAL_CHANGED')
    identities={}
    for path in CUSTODY_FILES:
        p=Path(path);s=p.lstat();need(p.resolve()==p and stat.S_ISREG(s.st_mode) and s.st_uid==s.st_gid==0 and s.st_nlink==1 and stat.S_IMODE(s.st_mode)==0o400 and 0<s.st_size<=65536,'PRIVATE_CUSTODY_METADATA_REQUIRED');identities[path]=identity(s)
    for key,cid in OLD_CONTAINERS:
        q=subprocess.run(['/usr/bin/docker','inspect','--format','{"id":{{json .Id}},"running":{{json .State.Running}},"pid":{{json .State.Pid}},"operation":{{json (index .Config.Labels "t45.operation")}}}',cid],capture_output=True,timeout=5)
        need(q.returncode==0 and not q.stderr and 0<len(q.stdout)<=4096 and json.loads(q.stdout)=={'id':cid,'running':False,'pid':0,'operation':key},'EXACT_OLD33_CONTAINER_NOT_STOPPED')
    refused_apply34_history()
    return identities


class Original02AbsentContinuation:
    def __init__(self, readonly, cfg, policy_sha256):
        self.readonly, self.old, self.core = readonly, readonly.old, readonly.core
        self.root, self.cfg, self.jobs = readonly.root, cfg, readonly.jobs
        self.need(readonly.policy_sha256 == READONLY_POLICY, 'EXACT_READONLY_POLICY_REQUIRED')
        c = self.core
        raw = c.read(self.root / POLICY_NAME)
        self.need(c.digest(policy_sha256) and c.sha(raw) == policy_sha256,
                  'POLICY_NOT_REGISTERED')
        self.policy_sha256 = policy_sha256
        p = self.policy = c.strict(raw)
        self.need(type(p) is dict and set(p) == {
            'format', 'grantId', 'startsAt', 'expiresAt', 'jobs'}
            and p['format'] == FORMAT and p['grantId'] == c.GRANT == cfg['grantId']
            and type(p['startsAt']) is type(p['expiresAt']) is int
            and 0 < p['startsAt'] < p['expiresAt'] <= p['startsAt'] + 14400000
            and p['expiresAt'] <= int(cfg['expiresAtEpoch'] * 1000)
            and type(p['jobs']) is dict and set(p['jobs']) == set(JOBS),
            'EXACT_POLICY_REQUIRED')
        for phase, rule in p['jobs'].items():
            self.need(type(rule) is dict and set(rule) == {
                'jobId', 'script', 'authorityLeaf', 'bundlePins',
                'timeoutSeconds', 'deadlineField'}
                and rule['jobId'] == JOBS[phase]
                and all(type(rule[k]) is str and c.MEMBER.fullmatch(rule[k])
                        for k in ('script', 'authorityLeaf'))
                and rule['script'].endswith(('.py', '.mjs', '.js'))
                and rule['authorityLeaf'].endswith('.json')
                and rule['deadlineField'] == 'expiresAt'
                and type(rule['timeoutSeconds']) is int
                and 1 <= rule['timeoutSeconds'] <= 7200
                and type(rule['bundlePins']) is dict
                and 1 <= len(rule['bundlePins']) <= 127
                and rule['script'] in rule['bundlePins']
                and rule['authorityLeaf'] not in rule['bundlePins']
                and all(type(leaf) is str and c.MEMBER.fullmatch(leaf) and c.digest(pin)
                        for leaf, pin in rule['bundlePins'].items()),
                'EXACT_JOB_RULE_REQUIRED')

    def need(self, ok, code):
        self.core.need(ok, 'R3_CONTINUITY_DIRECT33_' + code)

    def private(self, key):
        return Path(self.cfg['private']) / 'jobs' / key

    def original_basis(self):
        self.readonly.original_basis()
        required_history()
        self.previous24_closed()
        self.previous25_closed()
        self.previous26_closed()
        self.previous_completed_closed(27)
        self.previous28_closed()
        self.previous29_closed()
        self.previous_completed_closed(30)
        self.previous_completed_closed(31)
        self.previous_completed_closed(32)
        self.previous20()
        self.previous21()
        self.previous21_outcome()
        self.previous22_closed()
        self.failed06_outcome()
        self.previous22_outcome()
        self.failed05_outcome()
        self.original05_absent()
        c = self.core
        self.need(c.sha(c.read(self.root / 'failed19-readonly-recovery.json')) == READONLY_POLICY,
                  'READONLY_POLICY_CHANGED')
        pin, terminal = self.old.preservation_terminal(INSPECT, {'COMPLETED'})
        self.need(pin == INSPECT_TERMINAL and terminal.get('exitCode') == 0,
                  'OBSERVED_ABSENT_TERMINAL_REQUIRED')
        objects = {}
        for leaf, (root_pin, public_pin) in INSPECT_RESULTS.items():
            raw = c.read(self.private(INSPECT) / 'results' / leaf)
            public = c.read(Path(self.cfg['control']) / 'jobs' / INSPECT / 'results' / leaf,
                            root=False)
            value = c.strict(raw)
            self.need(c.sha(raw) == root_pin and c.sha(public) == public_pin
                      and value == c.strict(public) and value.get('requestKey') == INSPECT,
                      'OBSERVED_ABSENT_RESULTS_CHANGED')
            objects[leaf] = value
        result = objects['original02-readonly-inspect-result.json']
        child = objects['original02-readonly-inspect-child-cleanup.json']
        self.need(result.get('state') == 'ABSENT'
                  and result.get('originalCombinationMatched') is True
                  and result.get('originalRecoveryRuns') == 1
                  and result.get('connectionCleanup') == 'CLOSED'
                  and result.get('rollbackAcknowledged') is True
                  and all(child.get(k) is True for k in (
                      'childReaped', 'descendantsReaped',
                      'originalInputMetadataRestored', 'scratchEmpty')),
                  'OBSERVED_ABSENT_AND_CLEANUP_REQUIRED')

    def previous20(self):
        c = self.core
        values = {}
        for phase, key, terminal_pin, result_pin, cleanup_pin in (
            ('stop', 't45-r3-ordinary20-preserve-stop-20261114-01',
             'd0fe364e5686e6704aab0873277ee8e3557cb3fd3958ecca82d5e5da61b5ab19',
             'bd89b6685cf4195fc3b0a50603f79290490750cf001a5d8b773e77add58c53d3',
             '2c7137d143f65a82a1e38413f057c302ea8e9e7f2ee9d376a0fc9d8cf1c35af8'),
            ('restore', 't45-r3-ordinary20-auth-restore-20261114-01',
             '0ddac14cf8a9f4aa84857eb4a49aa5ac4febf2a4318bdfc14fc175565ab14b79',
             'db6941b64ea9758be4022d33593303a1ae41ae90bccefa532b21df8e0241eb4a',
             '984c70a1714cfe52465616e869a9593ae1528a87551e73d40adfd380366a9b6c')):
            pin, terminal = self.old.preservation_terminal(key, {'COMPLETED'})
            self.need(pin == terminal_pin and terminal.get('exitCode') == 0,
                      'PREVIOUS20_TERMINAL_CHANGED')
            leaf = 'normal05-preserve-stop-result.json' if phase == 'stop' else 'maintenance-auth-result.json'
            raw = c.read(self.private(key) / 'results' / leaf)
            value = c.strict(raw)
            self.need(c.sha(raw) == result_pin and value.get('requestKey') == key,
                      'PREVIOUS20_RESULT_CHANGED')
            if phase == 'restore':
                self.need(c.sha(c.read(self.private(key) / 'results/maintenance-auth-cleanup.json')) == cleanup_pin,
                          'PREVIOUS20_RESTORE_CLEANUP_CHANGED')
                self.need(value['result']['status'] == 'EXACT_ORIGINAL_TWO_ROLE_AUTH_AND_BOUNDARIES_RESTORED_BY_OFFLINE_READBACK'
                          and value['cleanup']['ownContainerStopped'] is True
                          and value['cleanup']['ownedPidAbsent'] is True,
                          'PREVIOUS20_ORIGINAL_AUTH_RESTORATION_REQUIRED')
            else:
                raw_cleanup = c.read(HOST / 'state/native-services/t45-first-r3-native-service-start-20261114-20/cleanup.json')
                self.need(c.sha(raw_cleanup) == cleanup_pin and value.get('cleanupSha256') == cleanup_pin
                          and value.get('pgStopped') is True and value.get('holdRetained') is True,
                          'PREVIOUS20_CLEAN_STOP_REQUIRED')
                values['service'] = value['service']
        service = values['service']
        raw = subprocess.run(['/usr/bin/docker', 'inspect', '--format',
            '{"id":{{json .Id}},"startedAt":{{json .State.StartedAt}},'
            '"running":{{json .State.Running}},"pid":{{json .State.Pid}},'
            '"operation":{{json (index .Config.Labels "t45.operation")}}}',
            service['containerId']], capture_output=True, timeout=5, check=True).stdout
        self.need(0 < len(raw) <= 4096 and c.strict(raw) == {
            'id': service['containerId'], 'startedAt': service['containerStartedAt'],
            'running': False, 'pid': 0, 'operation': service['serviceKey']},
            'PREVIOUS20_CONTAINER_NOT_STOPPED')


    def previous21_outcome(self):
        c = self.core
        writer = 't45-first-20261110-r3-real-execute-20261114-03'
        pin, terminal = self.old.preservation_terminal(writer, {'FAILED'})
        self.need(pin == '03e4eabb9cbf2ef9a9f6558219625a13c2412c45f31fafc65dfab0d7c8d0c3cf'
                  and terminal.get('exitCode') == 2 and terminal.get('phaseStarted') is True,
                  'EXACT_FAILED03_TERMINAL_REQUIRED')
        reader = 't45-first-20261110-r3-real-readback-20261114-21'
        pin, terminal = self.old.preservation_terminal(reader, {'COMPLETED'})
        self.need(pin == '3e53c1c63dc3a863fe1d62f75c7f6a6122f944773b871f59075b5564a0a2a79e' and terminal.get('exitCode') == 0,
                  'EXACT_ORIGINAL03_INSPECT_TERMINAL_REQUIRED')
        for leaf, (root_pin, public_pin) in PREVIOUS21_READER_RESULTS.items():
            root_raw = c.read(self.private(reader) / 'results' / leaf)
            public_raw = c.read(Path(self.cfg['control']) / 'jobs' / reader / 'results' / leaf, root=False)
            value = c.strict(root_raw)
            self.need(c.sha(root_raw) == root_pin and c.sha(public_raw) == public_pin
                      and value == c.strict(public_raw) and value.get('requestKey') == reader,
                      'EXACT_ORIGINAL03_INSPECT_RECEIPT_REQUIRED')
            if leaf == 'original03-readonly-inspect-result.json':
                self.need(value.get('state') == 'ABSENT' and value.get('originalCombinationMatched') is True
                          and value.get('originalRecoveryRuns') == 1
                          and value.get('rollbackAcknowledged') is True
                          and value.get('connectionCleanup') == 'CLOSED',
                          'EXACT_ORIGINAL03_NATIVE_ABSENT_REQUIRED')
            if leaf == 'retained21-readback-child-cleanup.json':
                self.need(value.get('connectionCleanup') == 'CLOSED'
                          and all(value.get(key) is True for key in (
                              'childReaped', 'descendantsReaped', 'originalInputMetadataRestored', 'scratchEmpty')),
                          'EXACT_ORIGINAL03_INSPECT_CLEANUP_REQUIRED')

    def previous22_outcome(self):
        c = self.core
        writer = 't45-first-20261110-r3-real-execute-20261114-04'
        pin, terminal = self.old.preservation_terminal(writer, {'FAILED'})
        self.need(pin == 'e5612d1a32287ee5923f4906634e68ee9ddda69e33b8aefa33e073b57825d083'
                  and terminal.get('exitCode') == 2 and terminal.get('phaseStarted') is True,
                  'EXACT_FAILED04_TERMINAL_REQUIRED')
        reader = 't45-first-20261110-r3-real-readback-20261114-22'
        pin, terminal = self.old.preservation_terminal(reader, {'COMPLETED'})
        self.need(pin == 'b6de0dd2a2078768ffba3b0d75ee7964946ba50cab6bf8a8b21b77228d4d9068' and terminal.get('exitCode') == 0,
                  'EXACT_ORIGINAL04_INSPECT_TERMINAL_REQUIRED')
        for leaf, (root_pin, public_pin) in PREVIOUS22_READER_RESULTS.items():
            root_raw = c.read(self.private(reader) / 'results' / leaf)
            public_raw = c.read(Path(self.cfg['control']) / 'jobs' / reader / 'results' / leaf, root=False)
            value = c.strict(root_raw)
            self.need(c.sha(root_raw) == root_pin and c.sha(public_raw) == public_pin
                      and value == c.strict(public_raw) and value.get('requestKey') == reader,
                      'EXACT_ORIGINAL04_INSPECT_RECEIPT_REQUIRED')
            if leaf == 'original04-readonly-inspect-result.json':
                self.need(value.get('state') == 'ABSENT' and value.get('originalCombinationMatched') is True
                          and value.get('originalRecoveryRuns') == 1
                          and value.get('initializerSerializedBytes') == 51225175
                          and value.get('rollbackAcknowledged') is True
                          and value.get('connectionCleanup') == 'CLOSED',
                          'EXACT_ORIGINAL04_NATIVE_ABSENT_REQUIRED')
            if leaf == 'retained22-readback-child-cleanup.json':
                self.need(value.get('connectionCleanup') == 'CLOSED'
                          and all(value.get(key) is True for key in (
                              'childReaped', 'descendantsReaped', 'originalInputMetadataRestored', 'scratchEmpty')),
                          'EXACT_ORIGINAL04_INSPECT_CLEANUP_REQUIRED')

    def failed05_outcome(self):
        c, key = self.core, 't45-first-20261110-r3-real-execute-20261114-05'
        terminal_pin, terminal = self.old.preservation_terminal(key, {'FAILED'})
        self.need(terminal_pin == '9309599188c16c457c04d5ee421abc8fb5677129d698067f7f37f9624775533e'
                  and terminal.get('exitCode') == 2 and terminal.get('phaseStarted') is True,
                  'EXACT_FAILED05_OUTER_AND_CLEANUP_REQUIRED')
        expected = {'retained22-writer-result.json': ('5b6b16dcfdf90dd9fd8842276423c7fafa929567d44e4d10af58910e773f8194', 'e7a25589ba69e0995bcd5f80ea655c6abd0eec72a5ee0e27d848e11d86a92768'), 'retained22-writer-child-cleanup.json': ('1f81a8a0e108868822ad9a5454d02a1a2acdc446d602b83b8c0031a46e3292c6', '8b999f768573616d6c07fc3dc3176b0bd2195510749fc37caa850a5fa307aaa2')}
        for leaf, (root_pin, public_pin) in expected.items():
            root_raw = c.read(self.private(key) / 'results' / leaf)
            public_raw = c.read(Path(self.cfg['control']) / 'jobs' / key / 'results' / leaf, root=False)
            value = c.strict(root_raw)
            self.need(c.sha(root_raw) == root_pin and c.sha(public_raw) == public_pin
                      and value == c.strict(public_raw) and value.get('requestKey') == key,
                      'EXACT_FAILED05_RESULT_AND_CLEANUP_REQUIRED')
            if leaf == 'retained22-writer-child-cleanup.json':
                self.need(all(value.get(k) is True for k in ('childReaped', 'descendantsReaped',
                          'originalInputMetadataRestored', 'scratchEmpty')),
                          'EXACT_FAILED05_PROCESS_SETTLEMENT_REQUIRED')
            if leaf == 'retained22-writer-result.json':
                self.need(value.get('state') == 'UNKNOWN' and value.get('safeCode') ==
                          'FRESH35_HOST_RETAINED_ORIGINAL_PUBLISH_REQUIRED',
                          'EXACT_FAILED05_UNKNOWN_NATIVE_REQUIRED')

    def failed06_outcome(self):
        c, key = self.core, ORIGINAL_WRITER
        terminal_pin, terminal = self.old.preservation_terminal(key, {'FAILED'})
        self.need(terminal_pin == '3b185cc24fdbb986ffb4b68c6e3bde4b6e293523d698ee86dbdf5f2ebf63daa2'
                  and terminal.get('exitCode') == 2 and terminal.get('phaseStarted') is True
                  and self.child_settled(ORIGINAL_WRITER, 'writer'), 'EXACT_FAILED06_OUTER_AND_CLEANUP_REQUIRED')
        expected = {'retained22-writer-result.json': ('794cf28dee5c43be9fcf7abcd6d6f744282828cebf9ca18024765beca1d7c0e8', '17e36e38b208e8642c1279f7136acc1419f809d2a60806ea15cf145a407d0e3f'), 'retained22-writer-child-cleanup.json': ('03f71ddce86d36f835ba6f625137fd9367eb6c621dcda2fd830cc90bf7b40876', 'de2c6b449a0934f8c012a6ea5769b240cfa7edb1be4a84a6c37babb6a1743dea')}
        for leaf, (root_pin, public_pin) in expected.items():
            root_raw = c.read(self.private(key) / 'results' / leaf)
            public_raw = c.read(Path(self.cfg['control']) / 'jobs' / key / 'results' / leaf, root=False)
            value = c.strict(root_raw)
            self.need(c.sha(root_raw) == root_pin and c.sha(public_raw) == public_pin
                      and value == c.strict(public_raw) and value.get('requestKey') == key,
                      'EXACT_FAILED06_RESULT_AND_CLEANUP_REQUIRED')
            if leaf == 'retained22-writer-result.json':
                self.need(value.get('state') == 'UNKNOWN' and value.get('safeCode') ==
                          'RETAINED20_CHILD_RESULT_UNCONFIRMED',
                          'EXACT_FAILED06_UNKNOWN_NATIVE_REQUIRED')

    def original05_absent(self):
        c, key = self.core, 't45-first-20261110-r3-real-readback-20261114-22-03'
        terminal_pin, terminal = self.old.preservation_terminal(key, {'COMPLETED'})
        self.need(terminal_pin == 'e46d4d059a6551e878dfafdd8b17244843fa35fb4350e6dfd2416e0425da3443' and terminal.get('exitCode') == 0,
                  'EXACT_ORIGINAL05_READONLY_TERMINAL_REQUIRED')
        expected = {'original05-readonly-inspect-process-cleanup.json': ('6c0a0b249df143c2bdc110c6acb458d2e256923838c40ec2444f2c503003761f', '0fe98ff1753fa357164163d578b07e34de16a3b33927a3a37400e8b4b4f0f46e'), 'original05-readonly-inspect-result.json': ('4bc365494c2512e11a038818497f15cc8e697884e92f02bcdfc9fbd5fc3053ee', '82493e91c218b0ff5ee4d22622e0597e85f95f2e5bfeda51c05c853a3816ad33'), 'retained22-readback-child-cleanup.json': ('c4856e8e6cd52930148eef148b7919a6e580c585d50f24582b71710acc74b633', '7e77e9291654235f94aebf294ebf2bd8532db39c239c0fecf0c5781f4591ed4d')}
        for leaf, (root_pin, public_pin) in expected.items():
            root_raw = c.read(self.private(key) / 'results' / leaf)
            public_raw = c.read(Path(self.cfg['control']) / 'jobs' / key / 'results' / leaf, root=False)
            value = c.strict(root_raw)
            self.need(c.sha(root_raw) == root_pin and c.sha(public_raw) == public_pin
                      and value == c.strict(public_raw) and value.get('requestKey') == key,
                      'EXACT_ORIGINAL05_READONLY_RESULTS_REQUIRED')
            if leaf == 'original05-readonly-inspect-result.json':
                self.need(value.get('originalWriterKey') == 't45-first-20261110-r3-real-execute-20261114-05'
                          and value.get('state') == 'ABSENT' and value.get('readOnlyTransactionConfirmed') is True
                          and value.get('originalCombinationMatched') is True
                          and value.get('originalRecoveryRuns') == 0
                          and value.get('initializerRetainedWriterSha256') == '47a82a4e02c608e499268995d086b77a1163896c77dad9a6ea317f08b35f53f4'
                          and value.get('initializerSerializedBytes') == 51225175
                          and value.get('rollbackAcknowledged') is True and value.get('connectionCleanup') == 'CLOSED'
                          and value.get('businessWrites') == 0,
                          'EXACT_ORIGINAL05_NATIVE_ABSENT_REQUIRED')
            if leaf == 'retained22-readback-child-cleanup.json':
                self.need(value.get('childEntered') is True and value.get('connectionCleanup') == 'CLOSED'
                          and all(value.get(k) is True for k in ('childReaped', 'descendantsReaped',
                                  'originalInputMetadataRestored', 'scratchEmpty')),
                          'EXACT_ORIGINAL05_READONLY_CLEANUP_REQUIRED')

    def previous21(self):
        c = self.core
        values = {}
        for phase, key, terminal_pin, result_pin, cleanup_pin in (
            ('stop', 't45-r3-ordinary21-preserve-stop-20261114-01',
             'b70020b04b0dbe67de8f3871b1950d8ecc20130363ec074b2291d35c9f69ee2a',
             '9ffdfb46e0bb028e0f4862c5b8006f51de4a17125a4135d5c5cf56366a07476f',
             '2cbc2471f7acfc46fbf387ca19127e362579632b6328183e969ddbaf9bfa0066'),
            ('restore', 't45-r3-ordinary21-auth-restore-20261114-01',
             '34ea2e745715b7757ba0aefd0706524419af90f46d1de736808b7d169569bc25',
             '293da43c2535f31eeaa091a10fbaa2f7c7da4c86aa16b1330b247a5f2226356b',
             'f373d8e7fe600adfab16568adf37935ebde4dd98fada888f7135eaf89d5d9942')):
            pin, terminal = self.old.preservation_terminal(key, {'COMPLETED'})
            self.need(pin == terminal_pin and terminal.get('exitCode') == 0,
                      'PREVIOUS21_TERMINAL_CHANGED')
            leaf = 'normal05-preserve-stop-result.json' if phase == 'stop' else 'maintenance-auth-result.json'
            raw = c.read(self.private(key) / 'results' / leaf)
            value = c.strict(raw)
            self.need(c.sha(raw) == result_pin and value.get('requestKey') == key,
                      'PREVIOUS21_RESULT_CHANGED')
            if phase == 'restore':
                self.need(c.sha(c.read(self.private(key) / 'results/maintenance-auth-cleanup.json')) == cleanup_pin,
                          'PREVIOUS21_RESTORE_CLEANUP_CHANGED')
                self.need(value['result']['status'] == 'EXACT_ORIGINAL_TWO_ROLE_AUTH_AND_BOUNDARIES_RESTORED_BY_OFFLINE_READBACK'
                          and value['cleanup']['ownContainerStopped'] is True
                          and value['cleanup']['ownedPidAbsent'] is True,
                          'PREVIOUS21_ORIGINAL_AUTH_RESTORATION_REQUIRED')
            else:
                raw_cleanup = c.read(HOST / 'state/native-services/t45-first-r3-native-service-start-20261114-21/cleanup.json')
                self.need(c.sha(raw_cleanup) == cleanup_pin and value.get('cleanupSha256') == cleanup_pin
                          and value.get('pgStopped') is True and value.get('holdRetained') is True,
                          'PREVIOUS21_CLEAN_STOP_REQUIRED')
                values['service'] = value['service']
        service = values['service']
        raw = subprocess.run(['/usr/bin/docker', 'inspect', '--format',
            '{"id":{{json .Id}},"startedAt":{{json .State.StartedAt}},'
            '"running":{{json .State.Running}},"pid":{{json .State.Pid}},'
            '"operation":{{json (index .Config.Labels "t45.operation")}}}',
            service['containerId']], capture_output=True, timeout=5, check=True).stdout
        self.need(0 < len(raw) <= 4096 and c.strict(raw) == {
            'id': service['containerId'], 'startedAt': service['containerStartedAt'],
            'running': False, 'pid': 0, 'operation': service['serviceKey']},
            'PREVIOUS21_CONTAINER_NOT_STOPPED')


    def previous22_closed(self):
        c = self.core
        records = (
            ('t45-r3-ordinary22-preserve-stop-20261114-01', '78d2922382cedce0d840003e8b6967b24d64c638c9fb3dbc4c5f494b5fb6101c',
             'normal05-preserve-stop-result.json', '9060a62e627a97d7f19312768d4405dcad7d357883488ee600dc3ccb412ab772', 'a70d218148c8cbd791619633a4d58f4c452e6b4ae1a315d5a470435cb4dbb80e'),
            ('t45-r3-ordinary22-auth-restore-20261114-01', '9e668ec5999ca8e6e4fd8558a0de1cb5b8f4cb56487b0237a2a61c825bf705ce',
             'maintenance-auth-result.json', '60142ddc2b3e51436f2096a8558b1018909f99446f7b260ec3a8b93bb410115f', '2b35fcb2dadbf1858aec46c58dad65b5dd891434e0475e68d030ebba18d4e609'),
        )
        values = []
        for key, terminal_pin, leaf, root_pin, public_pin in records:
            pin, terminal = self.old.preservation_terminal(key, {'COMPLETED'})
            self.need(pin == terminal_pin and terminal.get('exitCode') == 0
                      and terminal.get('phaseStarted') is True, 'PREVIOUS22_TERMINAL_DIFFERS')
            root = c.read(self.private(key) / 'results' / leaf)
            public = c.read(Path(self.cfg['control']) / 'jobs' / key / 'results' / leaf,
                            root=False)
            value = c.strict(root)
            self.need(c.sha(root) == root_pin and c.sha(public) == public_pin
                      and c.strict(public) == value and value.get('requestKey') == key,
                      'PREVIOUS22_RESULT_DIFFERS')
            values.append(value)
        stop, restore = values
        cleanup_pin = '5dfcffc05a1b77b9aace7f481266ff01de014b34c511e96459a922a3c9078d5d'
        raw = c.read(HOST / 'state/native-services' / PREVIOUS_SERVICE['serviceKey'] / 'cleanup.json')
        cleanup = c.strict(raw)
        self.need(c.sha(raw) == cleanup_pin and stop.get('cleanupSha256') == cleanup_pin
                  and stop.get('service') == PREVIOUS_SERVICE and stop.get('holdRetained') is True
                  and stop.get('pgStopped') is True and stop.get('businessAdvanced') is False
                  and all(cleanup['cleanup'].get(k) is True for k in
                          ('cleanupComplete','cleanShutdown','dataPreserved','ownedPidAbsent','portAbsent')),
                  'PREVIOUS22_CLEAN_STOP_REQUIRED')
        raw = c.read(self.private(records[1][0]) / 'results/maintenance-auth-cleanup.json')
        self.need(c.sha(raw) == '79441e3c87dcf726e2ec87aa8591626e2b19fded8262240eea96562f2b7ffea8'
                  and restore['result'].get('status') ==
                      'EXACT_ORIGINAL_TWO_ROLE_AUTH_AND_BOUNDARIES_RESTORED_BY_OFFLINE_READBACK'
                  and restore['result'].get('exactOriginalVerifierAndExpiryVerifiedPrivately') is True
                  and restore['result'].get('runtimeAuthChanged') is False
                  and restore['cleanup'].get('ownContainerStopped') is True
                  and restore['cleanup'].get('ownedPidAbsent') is True,
                  'PREVIOUS22_ORIGINAL_AUTH_RESTORATION_REQUIRED')
        raw = subprocess.run(['/usr/bin/docker', 'inspect', '--format',
            '{"id":{{json .Id}},"startedAt":{{json .State.StartedAt}},'
            '"running":{{json .State.Running}},"pid":{{json .State.Pid}},'
            '"operation":{{json (index .Config.Labels "t45.operation")}}}',
            PREVIOUS_SERVICE['containerId']], capture_output=True, timeout=5, check=True).stdout
        self.need(0 < len(raw) <= 4096 and c.strict(raw) == {
            'id': PREVIOUS_SERVICE['containerId'], 'startedAt': PREVIOUS_SERVICE['containerStartedAt'],
            'running': False, 'pid': 0, 'operation': PREVIOUS_SERVICE['serviceKey']},
            'PREVIOUS22_CONTAINER_NOT_STOPPED')

    def previous24_closed(self):
        c = self.core
        rows = (
            ('t45-r3-ordinary24-preserve-stop-20261115-01', '0a9ea80f2c52494c584e2dc7999766e725e604c9ec7d12c92af7424d1eb83a39', 'normal05-preserve-stop-result.json', '24c937badca67b63d07d13a7e976dc6433c0468dc7de50cf100f20a6e5f096a0', '69a6c160c867b4049555a91313a6e4b42cdc10f2584aaa0d221fed3b4ede7a88'),
            ('t45-r3-ordinary24-auth-restore-20261115-01', '977a2d3ff1bb03e9bb8304a541dbc8b3e250df2c26aa0efe17b917c504947825', 'maintenance-auth-result.json', 'b275e1369531bb303ed0587a59a37af9215553afbedc782101ce2325ee8186ac', '47c6e57b0b1cbcfa95e019e37b082d96989aa77c09aec76a64e983601b8a9dff'))
        values = []
        for key, terminal_pin, leaf, root_pin, public_pin in rows:
            pin, terminal = self.old.preservation_terminal(key, {'COMPLETED'})
            self.need(pin == terminal_pin and terminal.get('exitCode') == 0, 'PREVIOUS24_EXACT_TERMINAL_REQUIRED')
            raw = c.read(self.private(key) / 'results' / leaf)
            public = c.read(Path(self.cfg['control']) / 'jobs' / key / 'results' / leaf, root=False)
            result = c.strict(raw)
            self.need(c.sha(raw) == root_pin and c.sha(public) == public_pin and result == c.strict(public) and result.get('requestKey') == key, 'PREVIOUS24_EXACT_RESULT_REQUIRED')
            values.append(result)
        stop, restore = values
        self.need(stop.get('pgStopped') is True and stop.get('holdRetained') is True and stop.get('businessAdvanced') is False and stop.get('originalKeyReplayed') is False, 'PREVIOUS24_STOP_REQUIRED')
        inside = restore.get('result', {})
        self.need(inside.get('status') == 'EXACT_ORIGINAL_TWO_ROLE_AUTH_AND_BOUNDARIES_RESTORED_BY_OFFLINE_READBACK' and inside.get('exactOriginalVerifierAndExpiryVerifiedPrivately') is True and inside.get('naturalExpiryCountedAsRestoration') is False and inside.get('runtimeAuthChanged') is False and inside.get('membershipsOrRoleAttributesChanged') is False and restore.get('cleanup', {}).get('ownContainerStopped') is True and restore.get('cleanup', {}).get('ownedPidAbsent') is True, 'PREVIOUS24_ORIGINAL_AUTH_RESTORATION_REQUIRED')
        service = stop['service']
        raw = subprocess.run(['/usr/bin/docker', 'inspect', '--format', '{"id":{{json .Id}},"startedAt":{{json .State.StartedAt}},"running":{{json .State.Running}},"pid":{{json .State.Pid}},"operation":{{json (index .Config.Labels "t45.operation")}}}', service['containerId']], capture_output=True, timeout=5, check=True).stdout
        self.need(0 < len(raw) <= 4096 and c.strict(raw) == {'id': service['containerId'], 'startedAt': service['containerStartedAt'], 'running': False, 'pid': 0, 'operation': service['serviceKey']}, 'PREVIOUS24_CONTAINER_NOT_STOPPED')

    def previous25_closed(self):
        c = self.core
        start = 't45-first-r3-native-service-start-20261116-25'
        terminal_pin, terminal = self.old.preservation_terminal(start, {'FAILED'})
        self.need(terminal_pin == '79c3657f7f0051c1646215ee7e5149ecfb6e6fa31606750167bc2e8f3b3f5738' and terminal.get('exitCode') == 2 and terminal.get('phaseStarted') is True, 'EXACT_FAILED25_TERMINAL_REQUIRED')
        raw = c.read(self.private(start) / 'results/normal-service-result.json')
        public = c.read(Path(self.cfg['control']) / 'jobs' / start / 'results/normal-service-result.json', root=False)
        self.need(c.sha(raw) == 'c2a5ee898726e66ebb53e309cb39d803069fa1336f19fd5c50b016187f5e90be' and c.sha(public) == '10afe3a1ffe08b295773a9277fd3949b4752159a682c05e63f92f466ca66a896' and c.strict(raw) == c.strict(public), 'EXACT_FAILED25_RESULT_REQUIRED')
        restore = 't45-r3-ordinary25-auth-restore-20261116-01'
        pin, value = self.old.preservation_terminal(restore, {'COMPLETED'})
        self.need(pin == '1b82a691e39b0a72495542757664773a9a204f84bc3331da243ab7f6fb2be238' and value.get('exitCode') == 0, 'EXACT_RESTORED25_TERMINAL_REQUIRED')
        raw = c.read(self.private(restore) / 'results/maintenance-auth-result.json')
        public = c.read(Path(self.cfg['control']) / 'jobs' / restore / 'results/maintenance-auth-result.json', root=False)
        value = c.strict(raw)
        self.need(c.sha(raw) == 'ecf79874833ade08d7f63aceb1d6a80b587f1644ce727c22d9bc591cd54ea74d' and c.sha(public) == '86b34120506dbced1f182c2e3c429a8be7c209f8ffa347a0ce955b4efc26523f' and value == c.strict(public) and value.get('requestKey') == restore, 'EXACT_RESTORED25_RESULT_REQUIRED')
        inside = value['result']
        self.need(inside.get('status') == 'EXACT_ORIGINAL_TWO_ROLE_AUTH_AND_BOUNDARIES_RESTORED_BY_OFFLINE_READBACK' and inside.get('exactOriginalVerifierAndExpiryVerifiedPrivately') is True and inside.get('naturalExpiryCountedAsRestoration') is False and inside.get('runtimeAuthChanged') is False and inside.get('membershipsOrRoleAttributesChanged') is False and value['cleanup'].get('ownContainerStopped') is True and value['cleanup'].get('ownedPidAbsent') is True, 'EXACT_ORIGINAL_AUTH25_RESTORATION_REQUIRED')
        boot = HOST / 'state/native-services' / start
        expected = {'normal_service05_after08.py':'3ea7979bd8e7a6ad69247331dad49b9c348c281df70733f0f64bd03b169df1dc','normal_service05_after08_proof.py':'f2cd59a11222656b8697367abd20e790dbbc1ddd4edbadf838fe6584ceec446b','fresh35-production-carrier.py':'40f9700e21a6488380e9b91aaa0f1a12cf6c9f05397ec835a0247f4d3f21a360'}
        self.need(set(p.name for p in boot.iterdir()) == set(expected) and all(c.sha(c.read(boot/name, maximum=262144)) == pin for name,pin in expected.items()) and not os.path.lexists(HOST/'authority/fresh35-current-production-service-v2-service-25.json'), 'FAILED25_PARTIAL_BOOT_OR_NO_C_CHANGED')
        q = subprocess.run(['/usr/bin/docker','ps','-aq','--filter','label=t45.operation='+start],capture_output=True,timeout=5)
        self.need(q.returncode == 0 and not q.stdout.strip() and not q.stderr, 'FAILED25_CONTAINER_PRESENT_OR_UNKNOWN')

    def previous26_closed(self):
        c = self.core
        start = 't45-first-r3-native-service-start-20261116-26'
        pin, terminal = self.old.preservation_terminal(start, {'FAILED'})
        self.need(pin == '853a201e55ebc282d2d5a736423ab3bf6a9ff82af6d03500f5d67e0964a3bb39' and terminal.get('exitCode') == 2 and terminal.get('phaseStarted') is True, 'EXACT_FAILED26_TERMINAL_REQUIRED')
        raw = c.read(self.private(start)/'results/normal-service-result.json')
        public = c.read(Path(self.cfg['control'])/'jobs'/start/'results/normal-service-result.json',root=False)
        self.need(c.sha(raw) == '5aa3c60a23da88f369f89868556bf95470eae3cb407a3c8dbd6f5562e1eb6dca' and c.sha(public) == 'ff2e88f0b8cb3ad04ce5c4c06e07818d8b7c0456b8507b43bf81f529c34155d1' and c.strict(raw) == c.strict(public), 'EXACT_FAILED26_RESULT_REQUIRED')
        restore = 't45-r3-ordinary26-auth-restore-20261116-01'
        pin, terminal = self.old.preservation_terminal(restore, {'COMPLETED'})
        self.need(pin == '944dfa9b110fd836ee9e99a8944446111b1e68808d92280a5d220e91cd67fc63' and terminal.get('exitCode') == 0, 'EXACT_RESTORED26_TERMINAL_REQUIRED')
        raw = c.read(self.private(restore)/'results/maintenance-auth-result.json')
        public = c.read(Path(self.cfg['control'])/'jobs'/restore/'results/maintenance-auth-result.json',root=False)
        value = c.strict(raw)
        self.need(c.sha(raw) == 'd521106c1c1a5a20601f7ad125dd2c254ff1879a78d25c5a299c0464ed527bd8' and c.sha(public) == '57aff18487f294415830404abaf18f8a970b04b779d22e2d226018539c5879cb' and value == c.strict(public) and value.get('requestKey') == restore, 'EXACT_RESTORED26_RESULT_REQUIRED')
        inside = value['result']
        self.need(inside.get('status') == 'EXACT_ORIGINAL_TWO_ROLE_AUTH_AND_BOUNDARIES_RESTORED_BY_OFFLINE_READBACK' and inside.get('exactOriginalVerifierAndExpiryVerifiedPrivately') is True and inside.get('naturalExpiryCountedAsRestoration') is False and inside.get('runtimeAuthChanged') is False and inside.get('membershipsOrRoleAttributesChanged') is False and value['cleanup'].get('ownContainerStopped') is True and value['cleanup'].get('ownedPidAbsent') is True, 'EXACT_ORIGINAL_AUTH26_RESTORATION_REQUIRED')
        self.need(not os.path.lexists(HOST/'authority/fresh35-current-production-service-v2-service-26.json'), 'FAILED26_C_UNEXPECTED')
        q = subprocess.run(['/usr/bin/docker','ps','-aq','--filter','label=t45.operation='+start],capture_output=True,timeout=5)
        self.need(q.returncode == 0 and not q.stdout.strip() and not q.stderr, 'FAILED26_CONTAINER_PRESENT_OR_UNKNOWN')

    def previous_completed_closed(self, generation):
        c = self.core
        specifications = {
            27: ([('ba1caa324ceba9a191479d45bd6e1b497e78b5adc7946d21589c296a2e300cd4', '808c633e8d7f11bac5e09efa21cbb3b40f39272a103b89af191624915b869609', '4446a6673b6684ecf26c9d5da4982cd27d75fd68dca578c65072330921b6b5d7'), ('2dc418392380fe9313facee2b85cf06d79ad2b1e8fcac1faedd6c0263d1fd04f', 'a5aa0eecb1cfa711b922a1cbbd227a25b7316c93bcfc83dc4ab4c60f5a56d24a', '62ca4c34ae9313a1d5c9de745878ef9f8567e2d6f98af11d283c16e64d0c9502'), ('957f0f26d7ed9272ea675c855a7726e9627af7946774b9b8827fb720d47aafe0', '90e8fc47b7df781cb325dc9e653510c2080da0e336748146e25d8751a4cc9fc7', '9e2a41c47eeb23745dae3558266f3b01b9776594f95a766e8a4f742ee30a2be2')], '6c8f40034cd8f1940648d7bc9d9614fa660cfac1fa3844aae6847516902f8448', '2026-11-15T18:38:28.428863507Z', '2026-11-15 18:38:29.737044+00', '2640ef4df8bc3e2c64f31d327a41a1c4fddc9adf99584b68169ab854fe6c6dbb', 'fda7c05908d7b94223901638b83a417d2d7f1c624d6d195abae6ede6fc0702e8', 'b8286a2e7449b7b9e165975fd5492fc6084eea1d1b9322e1b5f57e40c4c57339'),
            30: ([('34d2f5e0f7cf2fabf8192a340eda31dac53e8ab16cda8cc14fe6acba33b93ed4', 'bcb378acfa698c2bc8f7018bb713acc61318e66bf4f14bc2830cdec51790730d', '161b4c3cb53b057746f8fd246ea79aff8b030eb0a45e4743158f3a110f0f4fe6'), ('e52708fc14962a02d10906d25f9434268eb22ee4c36c754e75fc3b4bf70f2ddb', '62ed7abefdb356fa4a7098d16f54f887191340949587a5406e51b4687007e5f3', '46969fd0fb6dd5452f1b8e289248b0b0704dfc4a0e1a0e9bbc4c9eee0e9285d6'), ('762af3ad2ca11c0b6675b942d0f0f33b3d53dba39d8d8f2decea0312e5547213', 'fc22b1917a3ef1b67b259d8fb878416bb20f84dbb11cc26796233db19fa1039a', '778bafff2ccebbb40edde23b75e677b7aebbecd0d266e44f78a7bb6e95037013')], '4ef547cb7a3acdf82b8c85a32c75e46f71dbf1ea850c205a1f0d755ab00922aa', '2026-11-15T23:13:26.882383571Z', '2026-11-15 23:13:28.123147+00', 'abf3b3251289ebb5f40218f51991c1a3bafea4854097543be175ed400d9ce06c', '9073bc7b9f1d013e8c74833d5e5aac5fb630df84c4c27c9fd4628d6dc47f8e9a', '8d72b0d314a7775a67acb3ec6f65cbe86aa65ef5323488206d9b1550a80db2d4'),
            31: ([('5246a9abdb987e4309c4bc6d181373623580b019fb32a5290d8677058d94ef21', '326773273e586e3d1864bda75c81f0f94c28dc537362bb7c1160796ccd43902d', '1140621973efc4247ee7ac35667cf705345d68f5e2bda716c8c68f3df093d03f'), ('9ff56dfa1229233855b0cfacd9de65278bb6fd5b36dce0962e748d40c5455a49', 'dc995ed92abadab3f4a9c0a72c1ed361ce1ce45f5eb666fa6df42a71a9f47a92', 'c4dfe6d6b2bcd9684503f119101eeb2e5f6c028561e8534ef716dafb93b76089'), ('4541b36de09569184c0198d9573e5becdb01d7babf1fecc7ffd7d83d3a511c7d', '023d953c3fece2054074002486c6f355465cb8d70458ad1b6fc447cae8db5778', '72bcef34100e9b5324306b744580bee9b3c9044ee6370b2477bcced891fc5794')], '3c83bbf2bb61d2342759b0b2be1a918b866d2a7b3021cc3eb1d14058471c1a00', '2026-11-16T00:16:42.588439615Z', '2026-11-16 00:16:43.861378+00', '42e7a80f72519feed61892a4598f7f654005e9c44535aaee0ac6f4c66a3c112e', '929460035e9b5ab7c9a9a9639a69322b6879e590bf1827006ef3c94dcd6e86cf', '1b9cc4f95114b336f65bccfbd87e60d07b90d2b72d0e628d5b6a9795f483b87f'),
            32: ([('0dd914833250cb93fcac74fba1d26740b9eda07cb94dc0c09fd93ed217b3d95b',
               '53de7a757c2ac942ba9c3241ae5b5e07a0919fa1420cda0668df4f89d67986bf',
               '833821ec6c4461fd81acd8e376ce066c07a46f035fa2835484814c9ee7fb4fcc'),
              ('544e6852d4fc4fd72e893a37ae70a4bea210ffab2dbf545722a8c764843a4525',
               '238075e9e127dd08c685fb4bcd8503e647e34530e5b02601d0480ae5e555a154',
               'c42df34e6626b639fd4eb39013a5b0a40ad22c5195be68404aa4a808c6739914'),
              ('f9ea3d772478aedb4cfc4fdf9e5713894c6611af69ab270b7d26c7908e7a92a3',
               '545dd9d12e10f40472c662c3eba0b7dc9bba132d661714b92dd7a76ccbec0849',
               '43b2490ac016005eec8c45d556898c47505343b3cf455cca52e06fb2d69843cd')],
             '1d12c5abe2fadfc7ec5293fc9467f01c66c2ec4f9d7b1654a5b0a38c54f42d95',
             '2026-11-16T02:59:19.015923853Z',
             '2026-11-16 02:59:20.307231+00',
             'f1d1a4e9f85492cba0028febc4bf05390b490161cd2983afbe76209199d8480d',
             'ce45a97bd5611b692cb015cc718e3971ec21b3279b54cad9ef66fd2a9a9f1915',
             'dfe98ab8a267a44bcbca9eb77705f99b67c1f1942593e2f9b52f596a5d63be14'),
        }
        self.need(type(generation) is int and generation in specifications, 'FIXED_SUCCESSFUL_GENERATION_REQUIRED')
        pins, cid, birth, epoch, proof, cleanup_pin, restore_cleanup = specifications[generation]
        service = dict(containerId=cid, containerStartedAt=birth, postmasterStart=epoch, proofSha256=proof,
                       serviceKey=f't45-first-r3-native-service-start-20261116-{generation}')
        paths = (
            ('start', service['serviceKey'], 'normal-service-result.json'),
            ('stop', f't45-r3-ordinary{generation}-preserve-stop-20261116-01', 'normal05-preserve-stop-result.json'),
            ('restore', f't45-r3-ordinary{generation}-auth-restore-20261116-01', 'maintenance-auth-result.json'),
        )
        values = {}
        for (phase, key, leaf), (terminal_pin, root_pin, public_pin) in zip(paths, pins):
            pin, terminal = self.old.preservation_terminal(key, {'COMPLETED'})
            self.need(pin == terminal_pin and terminal.get('exitCode') == 0
                      and terminal.get('phaseStarted') is True, f'PREVIOUS{generation}_TERMINAL_CHANGED')
            raw = c.read(self.private(key) / 'results' / leaf)
            public = c.read(Path(self.cfg['control']) / 'jobs' / key / 'results' / leaf, root=False)
            value = c.strict(raw)
            self.need(c.sha(raw) == root_pin and c.sha(public) == public_pin
                      and value == c.strict(public) and value.get('requestKey') == key,
                      f'PREVIOUS{generation}_RESULT_CHANGED')
            values[phase] = value
        started, stopped, restored = (values[p] for p in ('start', 'stop', 'restore'))
        self.need(started.get('status') == 'NORMAL_SAME_R3_SERVICE_AND_RUNTIME_AUTHENTICATED_NOT_APP_ACCEPTANCE'
                  and started.get('proofSha256') == service['proofSha256']
                  and started.get('cid') == service['containerId']
                  and started.get('readOnlyReadiness') is True,
                  f'PREVIOUS{generation}_ACTUAL_START_REQUIRED')
        raw = c.read(HOST / 'state/native-services' / service['serviceKey'] / 'cleanup.json')
        cleanup = c.strict(raw)
        self.need(c.sha(raw) == cleanup_pin and stopped.get('cleanupSha256') == cleanup_pin
                  and stopped.get('service') == service and stopped.get('pgStopped') is True
                  and stopped.get('holdRetained') is True and stopped.get('businessAdvanced') is False
                  and stopped.get('originalKeyReplayed') is False
                  and all(cleanup['cleanup'].get(k) is True for k in
                          ('cleanupComplete', 'cleanShutdown', 'dataPreserved', 'ownedPidAbsent', 'portAbsent')),
                  f'PREVIOUS{generation}_CLEAN_STOP_REQUIRED')
        raw = c.read(self.private(paths[2][1]) / 'results/maintenance-auth-cleanup.json')
        inside = restored['result']
        self.need(c.sha(raw) == restore_cleanup
                  and inside.get('status') == 'EXACT_ORIGINAL_TWO_ROLE_AUTH_AND_BOUNDARIES_RESTORED_BY_OFFLINE_READBACK'
                  and inside.get('exactOriginalVerifierAndExpiryVerifiedPrivately') is True
                  and inside.get('naturalExpiryCountedAsRestoration') is False
                  and inside.get('runtimeAuthChanged') is False
                  and inside.get('membershipsOrRoleAttributesChanged') is False
                  and restored['cleanup'].get('ownContainerStopped') is True
                  and restored['cleanup'].get('ownedPidAbsent') is True,
                  f'PREVIOUS{generation}_ORIGINAL_AUTH_RESTORATION_REQUIRED')
        raw = c.read(HOST / 'authority' / f'fresh35-current-production-service-v2-service-{generation}.json')
        self.need(c.sha(raw) == service['proofSha256'], f'PREVIOUS{generation}_PROTECTED_PROOF_CHANGED')
        raw = subprocess.run(['/usr/bin/docker', 'inspect', '--format',
            '{"id":{{json .Id}},"startedAt":{{json .State.StartedAt}},'
            '"running":{{json .State.Running}},"pid":{{json .State.Pid}},'
            '"operation":{{json (index .Config.Labels "t45.operation")}}}',
            service['containerId']], capture_output=True, timeout=5, check=True).stdout
        self.need(0 < len(raw) <= 4096 and c.strict(raw) == {
            'id': service['containerId'], 'startedAt': service['containerStartedAt'],
            'running': False, 'pid': 0, 'operation': service['serviceKey']},
            f'PREVIOUS{generation}_CONTAINER_NOT_STOPPED')


    def previous28_closed(self):
        self.previous_failed_closed(28)

    def previous29_closed(self):
        self.previous_failed_closed(29)

    def previous_failed_closed(self, generation):
        c = self.core
        specifications = {28: {'start': 't45-first-r3-native-service-start-20261116-28', 'restore': 't45-r3-ordinary28-auth-restore-20261116-01', 'startTerminal': '89afe4cb6651db43fe530961e62040ded2ee8ed8ead9bb720ca079776ffe1408', 'normalRoot': '94cdae517c242cc904c7f68d1b43f31ce01aa87f7f0089fc1de93fb77c2cc29f', 'normalPublic': '334e43befe79babb40626da0313fcc3370eb1f603895b6e0ba790661299cba46', 'incompleteRoot': 'd3d32bee8c9792f5cfe8354e050cfec3a07977af7e3b324826b2d84b4330526d', 'incompletePublic': '73de51b472b7b8c910d0939c2bbbaabcfa4e54e450625a58894f433d0771bd7c', 'cid': '0fe68379c491aa5d7cdbdf83eed54d7bb0eae8d3f714d72d5a3ffe1d8efcdcb9', 'cleanup': '395dd08471c95dda1f56f4959ae315d135fbec582ff97f489167a6033cc840b8', 'proof': 'd57946c9ff13ee5715787ee1d1f0a13fe1ffd2a2898fa76ecc82545a5d3d18ae', 'ack': '7296e03b9865a67718c0e938058dd7990000a72535e3b00a5a94e7b5be7b1b83', 'restoreTerminal': '496966e4b649819a641dc72eab3a3a2ca65f3507f59f27d5d04144617d553db6', 'restoreRoot': 'b8da5c9281edc26cc20c17702f0257fa1c95016a8744ae5a6eae7cf0c41ce5cc', 'restorePublic': '00813a0504f7fffe54e2614554e4a3489a2bcd5a9f3c69921717e781a7a1e98e', 'restoreCleanup': '91477439a305528bf3a71041ab6db699cd8ae62869a3fd35c01c38249e648949', 'proofLeaf': 'fresh35-current-production-service-v2-service-28.json'}, 29: {'start': 't45-first-r3-native-service-start-20261116-29', 'restore': 't45-r3-ordinary29-auth-restore-20261116-01', 'startTerminal': '30e747021f4775edb001b3ce1d7463b813b3240b99819ac1cd5236e4c22c8990', 'normalRoot': '769ca923a3e9f15eb4a010d4e23a991ab06ce8bed759bd22f6d5580ae1a9c426', 'normalPublic': 'cfa0c252b4fe4ebb1a732b369c9ff41095bfa9f8e78da80a57669b501648b5d2', 'incompleteRoot': '70c903267ecca60c8b0de9e9dfb6a044d3060516690d30f3997e4c89bcb153ab', 'incompletePublic': 'a3b82949618b7f7aa95b723bfda4c4615cf3b150c9e2369eff5209182e1c830f', 'cid': '8debce1e870690f3d27172d3f7a8161df3333b8f7016815a26f28efa9718c7b0', 'cleanup': '4bc125537c15b9593e663b07fc95ea96f07e170e809c9b4a58d106bef8ae06cf', 'proof': 'e50a7112cb48fc987b220a514e62e2e370b08bc3322bfa0ed42babc50d379568', 'ack': 'ba6a0699b5b37a7b5e81bbd86ad5e8f9735e85f842da6449387c4ab91592a781', 'restoreTerminal': '536e3726f2a4f0785e2ffc64fa8f89c82830652dd78ae29a773cf4c77a218004', 'restoreRoot': 'f0cb72700e78fd5097911e0169054272c66b570fad2dcf0b2572cc2f66c34039', 'restorePublic': 'dd4e900aed60490397f99a14f6a275f8cf16239b764ab95799e569ca41aa0aed', 'restoreCleanup': '1d50af6619b16eae16013ad0063b26cb5705eec58b49e156fffefd1ba3015b21', 'proofLeaf': 'fresh35-current-production-service-v2-service-29.json'}}
        self.need(generation in specifications, "EXACT_PREVIOUS_FAILED_GENERATION_REQUIRED")
        s = specifications[generation]
        start = s['start']
        restore = s['restore']
        terminal_pin, terminal = self.old.preservation_terminal(start, {'FAILED'})
        self.need(terminal_pin == s['startTerminal']
                  and terminal.get('exitCode') == 2 and terminal.get('phaseStarted') is True,
                  'PREVIOUS_FAILED_FAILED_TERMINAL_REQUIRED')
        def result(key, leaf, root_pin, public_pin):
            raw = c.read(self.private(key) / 'results' / leaf)
            public = c.read(Path(self.cfg['control']) / 'jobs' / key / 'results' / leaf, root=False)
            value = c.strict(raw)
            self.need(c.sha(raw) == root_pin and c.sha(public) == public_pin
                      and value == c.strict(public) and value.get('requestKey') == key,
                      'PREVIOUS_FAILED_RESULT_CHANGED')
            return value
        normal = result(start, 'normal-service-result.json',
            s['normalRoot'],
            s['normalPublic'])
        incomplete = result(start, 'normal-service-incomplete.json',
            s['incompleteRoot'],
            s['incompletePublic'])
        self.need(normal.get('status') == 'NORMAL_OUTCOME_UNCONFIRMED_ORIGINAL_KEY_ONLY'
                  and normal.get('automaticRetry') is False
                  and all(incomplete.get(k) is True for k in
                      ('confirmed', 'containerStopped', 'createAttempted', 'originalKeyOnly',
                       'runtimeMaterialPreserved', 'currentProofPresent', 'retainedAckValidated'))
                  and incomplete.get('automaticRetry') is False
                  and incomplete.get('successfulResultHandoff') is False
                  and incomplete.get('pid') == 0
                  and incomplete.get('cid') == s['cid'],
                  'PREVIOUS_FAILED_TYPED_AFTER_FAILURE_REQUIRED')
        cleanup_pin = s['cleanup']
        raw = c.read(HOST / 'state/native-services' / start / 'failed-start-cleanup.json')
        cleanup = c.strict(raw)
        self.need(c.sha(raw) == cleanup_pin and incomplete['cleanStop']['cleanupLeaf'] == 'failed-start-cleanup.json'
                  and incomplete['cleanStop']['cleanupSha256'] == cleanup_pin
                  and {k: v for k, v in incomplete['cleanStop'].items()
                       if k not in ('cleanupLeaf', 'cleanupSha256')} == cleanup
                  and cleanup.get('status') == 'NORMAL_FAILED_START_CLEAN_STOP_CONFIRMED'
                  and cleanup.get('originalPGDATAAndCleanStateVerified') is True
                  and cleanup.get('runtimeMaterialPreserved') is True
                  and cleanup.get('requestKey') == start
                  and cleanup.get('dataDirectoryIdentity') == {
                      'device': 66304, 'inode': 13502421, 'uid': 61035, 'gid': 61035, 'mode': 0o700},
                  'PREVIOUS_FAILED_ORIGINAL_PGDATA_CLEAN_STOP_REQUIRED')
        raw = c.read(HOST / 'authority' / s['proofLeaf'])
        proof_pin = s['proof']
        self.need(c.sha(raw) == proof_pin and incomplete.get('currentProofSha256') == proof_pin,
                  'PREVIOUS_FAILED_PUBLISHED_PROOF_CHANGED')
        raw = c.read(HOST / 'state/native-services' / start / 'retained-ack.json')
        ack_pin = s['ack']
        self.need(c.sha(raw) == ack_pin and incomplete.get('retainedAckSha256') == ack_pin,
                  'PREVIOUS_FAILED_PUBLISHED_ACK_CHANGED')
        terminal_pin, terminal = self.old.preservation_terminal(restore, {'COMPLETED'})
        self.need(terminal_pin == s['restoreTerminal']
                  and terminal.get('exitCode') == 0 and terminal.get('phaseStarted') is True,
                  'PREVIOUS_FAILED_RESTORE_TERMINAL_REQUIRED')
        restored = result(restore, 'maintenance-auth-result.json',
            s['restoreRoot'],
            s['restorePublic'])
        raw = c.read(self.private(restore) / 'results/maintenance-auth-cleanup.json')
        inside = restored['result']
        self.need(c.sha(raw) == s['restoreCleanup']
                  and inside.get('status') == 'EXACT_ORIGINAL_TWO_ROLE_AUTH_AND_BOUNDARIES_RESTORED_BY_OFFLINE_READBACK'
                  and inside.get('exactOriginalVerifierAndExpiryVerifiedPrivately') is True
                  and inside.get('naturalExpiryCountedAsRestoration') is False
                  and inside.get('runtimeAuthChanged') is False
                  and inside.get('membershipsOrRoleAttributesChanged') is False
                  and restored['cleanup'].get('ownContainerStopped') is True
                  and restored['cleanup'].get('ownedPidAbsent') is True,
                  'PREVIOUS_FAILED_ORIGINAL_AUTH_RESTORATION_REQUIRED')
        # This is the exact old CID only; a future generation install/writer must not require all PG stopped.
        q = subprocess.run(['/usr/bin/docker', 'inspect', '--format',
            '{"id":{{json .Id}},"running":{{json .State.Running}},"pid":{{json .State.Pid}},'
            '"operation":{{json (index .Config.Labels "t45.operation")}}}',
            incomplete['cid']], capture_output=True, timeout=5, check=True)
        self.need(not q.stderr and 0 < len(q.stdout) <= 4096 and c.strict(q.stdout) == {
            'id': incomplete['cid'], 'running': False, 'pid': 0, 'operation': start},
            'PREVIOUS_FAILED_CONTAINER_NOT_STOPPED')

    def current_service(self, service):
        c = self.core
        self.need(type(service) is dict and set(service) == {
            'serviceKey', 'proofSha256', 'containerId', 'containerStartedAt', 'postmasterStart'}
            and service['serviceKey'] == SERVICE_KEY
            and all(c.digest(service[k]) for k in ('proofSha256', 'containerId')),
            'EXACT_SERVICE_FIELDS_REQUIRED')
        self.successful('start')
        raw = c.read(PROOF)
        p = c.strict(raw)
        shared, physical = p['sharedPostgresNamespace'], p['physical']
        birth = shared['container']
        self.need(c.sha(raw) == service['proofSha256']
                  and p['requestKey'] == shared['creationOperationId'] == service['serviceKey']
                  and birth['id'] == service['containerId']
                  and birth['startedAt'] == service['containerStartedAt']
                  and physical['postmasterStart'] == service['postmasterStart']
                  and physical['systemIdentifier'] == '7706545564479176741'
                  and physical['databaseOid'] == '16393'
                  and physical['serverVersionNum'] == '170011'
                  and shared['serviceLeaseExpiresAt'] <= self.policy['expiresAt']
                  and time.time_ns() // 1000000 < shared['serviceLeaseExpiresAt'],
                  'EXACT_LIVE28_PROOF_REQUIRED')
        boot = HOST / 'state/native-services' / service['serviceKey']
        self.need(c.strict(c.read(boot / 'carrier-birth.json')) == birth
                  and c.strict(c.read(boot / 'retained-ack.json')) == {
                      'requestKey': service['serviceKey'],
                      'proofSha256': service['proofSha256'],
                      'serviceLeaseExpiresAt': shared['serviceLeaseExpiresAt']},
                  'EXACT_LIVE28_RETAINED_ACK_REQUIRED')
        try:
            raw = subprocess.run(['/usr/bin/docker', 'inspect', '--format',
                '{"id":{{json .Id}},"startedAt":{{json .State.StartedAt}},'
                '"running":{{json .State.Running}},"pid":{{json .State.Pid}},'
                '"operation":{{json (index .Config.Labels "t45.operation")}}}',
                service['containerId']], capture_output=True, timeout=5, check=True).stdout
        except (OSError, subprocess.SubprocessError):
            self.need(False, 'LIVE28_CONTAINER_EVIDENCE_UNAVAILABLE')
        v = c.strict(raw)
        self.need(0 < len(raw) <= 4096 and set(v) == {
            'id', 'startedAt', 'running', 'pid', 'operation'}
            and v['id'] == service['containerId'] and v['startedAt'] == service['containerStartedAt']
            and v['running'] is True and type(v['pid']) is int and v['pid'] > 0
            and v['operation'] == service['serviceKey'], 'LIVE28_CONTAINER_DIFFERS')
        return p

    def settled(self, phase):
        return self.child_settled(JOBS[phase], phase)

    def child_settled(self, key, phase):
        c = self.core
        if not os.path.lexists(self.private(key) / 'request.json'):
            return False
        # The dispatcher records a protected terminal even for a refusal before
        # launching these two jobs. Such a refusal never touches input access.
        _, terminal = self.old.preservation_terminal(key, {
            'COMPLETED', 'FAILED', 'REFUSED_D0_INTERLOCK_BEFORE_PHASE',
            'REFUSED_R3_CONTINUITY_BEFORE_PHASE', 'INTERRUPTED_UNKNOWN_OUTCOME_NO_REPLAY'})
        self.need(type(terminal.get('exitCode')) is int or (
            terminal['status'] == 'INTERRUPTED_UNKNOWN_OUTCOME_NO_REPLAY'
            and terminal.get('exitCode') is None), 'ORIGINAL_OUTER_TERMINAL_REQUIRED')
        if terminal.get('phaseStarted') is False:
            self.need(terminal['status'].startswith('REFUSED_') and terminal['exitCode'] == 2,
                      'EXACT_PRE_CHILD_REFUSAL_REQUIRED')
            return True
        self.need(terminal.get('phaseStarted') is True, 'CHILD_START_OUTCOME_REQUIRED')
        leaf = ('retained22-' if key == ORIGINAL_WRITER else 'retained23-') + phase + '-child-cleanup.json'
        raw = c.read(self.private(key) / 'results' / leaf)
        public = c.read(Path(self.cfg['control']) / 'jobs' / key / 'results' / leaf, root=False)
        cleanup = c.strict(raw)
        self.need(cleanup == c.strict(public) and cleanup.get('requestKey') == key
                  and cleanup.get('connectionCleanup') in (
                      'CLOSED', 'NOT_OPENED', 'REAPED_EXCLUSIVE_PROCESS')
                  and all(cleanup.get(k) is True for k in (
                      'childReaped', 'descendantsReaped',
                      'originalInputMetadataRestored', 'scratchEmpty')),
                  'ORIGINAL_CHILD_CONNECTION_AND_INPUT_CLEANUP_REQUIRED')
        # REAPED_EXCLUSIVE_PROCESS describes only the exact process cleanup.
        # Original-key verification and preservation may follow; it proves
        # neither the server transaction outcome nor an acknowledged DB close.
        return True

    def frozen(self, phase, job, private):
        c, p = self.core, self.policy
        rule = p['jobs'][phase]
        now = time.time_ns() // 1000000
        self.need(p['startsAt'] <= now < p['expiresAt'], 'FINITE_POLICY_EXPIRED')
        self.need(private == self.private(JOBS[phase])
                  and job.get('script') == rule['script'] and job.get('taskId') == 'T45'
                  and job.get('grantId') == c.GRANT and job.get('scope') == self.cfg['scope']
                  and type(job.get('timeoutSeconds')) is int
                  and job['timeoutSeconds'] == rule['timeoutSeconds']
                  and c.pack(c.strict(c.read(private / 'request.json'))) == c.pack(job)
                  and not os.path.lexists(private / 'r3-outer-terminal.json'),
                  'EXACT_FROZEN_JOB_REQUIRED')
        raw = c.read(private / 'bundle/bundle-manifest.json')
        manifest = c.strict(raw)
        rows = manifest.get('files', [])
        self.need(c.sha(raw) == job.get('manifestSha256')
                  and set(manifest) == {'taskId', 'jobId', 'files'}
                  and manifest['taskId'] == 'T45' and manifest['jobId'] == JOBS[phase]
                  and type(rows) is list and 2 <= len(rows) <= 128
                  and all(type(row) is dict and set(row) == {'name', 'bytes', 'sha256'}
                          and type(row['name']) is str and c.MEMBER.fullmatch(row['name'])
                          and type(row['bytes']) is int and 0 <= row['bytes'] <= 4 * 1024**2
                          and c.digest(row['sha256']) for row in rows)
                  and len({row['name'] for row in rows}) == len(rows)
                  and {row['name'] for row in rows} ==
                  set(rule['bundlePins']) | {rule['authorityLeaf']},
                  'EXACT_FROZEN_MANIFEST_REQUIRED')
        authority, authority_pin = None, None
        for row in rows:
            content = c.read(private / 'bundle' / row['name'], maximum=4 * 1024**2)
            pin = c.sha(content)
            self.need(len(content) == row['bytes'] and pin == row['sha256']
                      and (row['name'] == rule['authorityLeaf']
                           or pin == rule['bundlePins'][row['name']]),
                      'EXACT_FROZEN_MEMBER_REQUIRED')
            if row['name'] == rule['authorityLeaf']:
                authority, authority_pin = c.strict(content), pin
        self.need(type(authority) is dict and authority.get('requestKey') == JOBS[phase]
                  and job.get('args') == [authority_pin]
                  and type(authority.get('startsAt')) is int
                  and type(authority.get('expiresAt')) is int
                  and p['startsAt'] <= authority['startsAt'] <= now
                  and (now + 240000 <= authority['expiresAt'] <= authority['startsAt'] + 300000
                       if phase == 'input_materialize' else now + rule['timeoutSeconds'] * 1000 < authority['expiresAt'])
                  and authority['expiresAt'] <= p['expiresAt'],
                  'EXACT_FINITE_AUTHORITY_REQUIRED')
        return authority

    def submitted(self, phase):
        path = self.private(JOBS[phase]) / 'request.json'
        if not os.path.lexists(path):
            return False
        value = self.core.strict(self.core.read(path))
        self.need(value.get('jobId') == JOBS[phase] and value.get('taskId') == 'T45'
                  and value.get('grantId') == self.core.GRANT
                  and value.get('scope') == self.cfg['scope'], 'EXACT_SUBMITTED_PREDECESSOR_REQUIRED')
        return True

    def successful(self, phase):
        _, terminal = self.old.preservation_terminal(JOBS[phase], {'COMPLETED'})
        self.need(terminal.get('exitCode') == 0, 'SUCCESSFUL_PREDECESSOR_REQUIRED')

    def historical_install(self):
        c = self.core
        key = HISTORICAL_INSTALL['requestKey']
        pin, terminal = self.old.preservation_terminal(key, {'COMPLETED'})
        leaf = 'batched-install-result.json'
        raw = c.read(self.private(key) / 'results' / leaf)
        public = c.read(Path(self.cfg['control']) / 'jobs' / key / 'results' / leaf, root=False)
        result = c.strict(raw)
        self.need(pin == HISTORICAL_INSTALL['terminalSha256'] and terminal.get('exitCode') == 0
                  and c.sha(raw) == HISTORICAL_INSTALL['rootResultSha256']
                  and c.sha(public) == HISTORICAL_INSTALL['publicResultSha256']
                  and result == c.strict(public) and result.get('requestKey') == key
                  and result.get('state') == 'DB05_CATALOG_INSTALLED_AND_CAPTURED'
                  and result.get('acknowledgedLayers') == 13
                  and result.get('connectionCleanup') == 'CLOSED',
                  'RETAINED_DB05_INSTALL_REQUIRED')

    def current_batch_settled_or_absent(self, phase):
        key = JOBS[phase]
        c = self.core
        if self.submitted(phase):
            _, terminal = self.old.preservation_terminal(key, {
                'COMPLETED', 'FAILED', 'REFUSED_D0_INTERLOCK_BEFORE_PHASE',
                'REFUSED_R3_CONTINUITY_BEFORE_PHASE', 'INTERRUPTED_UNKNOWN_OUTCOME_NO_REPLAY'})
            self.need(terminal.get('finishedAtUTC') is not None
                      and terminal.get('phaseStarted') in (True, False),
                      'CURRENT_BATCH_TERMINAL_REQUIRED')
        else:
            for grant in (c.GRANT, '5cc58239751e4e2a'):
                control = Path(self.cfg['control']).with_name('grant-' + grant)
                worker = Path(self.cfg['private']).with_name('grant-' + grant)
                self.need(not any(os.path.lexists(p) for p in (
                    control / 'requests' / (key + '.json'), control / 'requests' / (key + '.tmp'),
                    control / 'jobs' / key, control / 'results' / (key + '.json'), worker / 'jobs' / key)),
                    'CURRENT_BATCH_NOT_PROVEN_UNSUBMITTED')
        q = subprocess.run(['/usr/bin/systemctl', 'is-active',
                            'naijue-erp-op-' + c.GRANT[:8] + '-' + c.sha(key.encode())[:12] + '.service'],
                           capture_output=True, timeout=5)
        self.need(q.returncode in (3, 4) and q.stdout.strip() in (b'inactive', b'unknown')
                  and not q.stderr, 'CURRENT_BATCH_UNIT_ACTIVE_OR_UNKNOWN')

    def admit(self, job, private):
        phase = next((name for name, key in JOBS.items() if job.get('jobId') == key), None)
        self.need(job.get('jobId')!=REFUSED_KEY,'REFUSED_APPLY34_01_REISSUE_FORBIDDEN')
        if phase is None:
            self.need(job.get('jobId') not in ['t45-r3-ordinary33-auth-apply-20261116-01', 't45-first-r3-native-service-start-20261116-33', 't45-r3-ordinary33-preserve-stop-20261116-01', 't45-r3-ordinary33-auth-restore-20261116-01', 't45-r3-ordinary33-auth-restore-20261116-02'],'OLD33_MAINTENANCE_REISSUE_FORBIDDEN')
            return self.readonly.admit(job, private)
        self.need(phase not in ('input_materialize','materialize'),'COMPLETED_PREPARATION_REISSUE_FORBIDDEN')
        authority = self.frozen(phase, job, private)
        self.original_basis()
        if phase in ('input_materialize', 'materialize', 'apply', 'start'):
            self.core.stopped_generation(self.old.service)
        if phase == 'apply':
            self.successful('input_materialize')
            self.successful('materialize')
        elif phase == 'start':
            self.successful('input_materialize')
            self.successful('materialize')
            self.successful('apply')
        elif phase == 'catalog_update':
            self.current_service(authority.get('service'))
            self.historical_install()
            self.need(not self.submitted('writer'), 'CURRENT_WRITER_ALREADY_SUBMITTED')
            self.current_batch_settled_or_absent('writer')
        elif phase == 'prepare':
            self.current_service(authority.get('service'))
            self.historical_install()
            self.successful('input_materialize')
            self.successful('catalog_update')
            self.need(not self.submitted('writer'), 'CURRENT_WRITER_ALREADY_SUBMITTED')
            self.current_batch_settled_or_absent('writer')
        elif phase == 'writer':
            self.current_service(authority.get('service'))
            self.historical_install()
            self.successful('catalog_update')
            self.successful('prepare')
        elif phase == 'stop':
            self.need(self.submitted('start'), 'START_SUBMISSION_REQUIRED')
            self.need(self.child_settled(ORIGINAL_WRITER, 'writer'), 'ORIGINAL_WRITER_NOT_SETTLED')
            self.historical_install()
            self.current_batch_settled_or_absent('catalog_update')
            self.current_batch_settled_or_absent('prepare')
            self.current_batch_settled_or_absent('writer')
        elif phase == 'restore':
            self.need(self.submitted('apply'), 'APPLY_SUBMISSION_REQUIRED')
            if self.submitted('start'):
                if authority.get('service') is None and authority.get('stopRequestKey') == JOBS['start']:
                    pin, terminal = self.old.preservation_terminal(JOBS['start'], {'FAILED'})
                    self.need(terminal.get('exitCode') == 2
                              and authority.get('stopTerminalSha256') == pin
                              and all(self.core.digest(authority.get(k)) for k in
                                      ('stopResultSha256', 'stopCleanupSha256')),
                              'EXACT_FAILED_START_CLEANUP_BINDING_REQUIRED')
                    self.core.stopped_generation(self.old.service)
                else:
                    self.successful('stop')
            else:
                self.core.stopped_generation(self.old.service)
        return 'direct33-batched-' + phase

    def finish(self, phase):
        if phase in {'direct33-batched-' + name for name in JOBS}:
            return None
        return self.readonly.finish(phase)
