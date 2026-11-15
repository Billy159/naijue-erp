"""Fixed V2 normal-service proof; never an issuer or credential restorer."""
import hashlib,json,re
from datetime import datetime,timezone

JOB = 't45-first-r3-native-service-start-20261116-26'
NAME = 't45-fresh35-first-production-20261110-r3-service-26'
FORMAT='FRESH35_CURRENT_PRODUCTION_SERVICE_V2'
RECEIPT_FORMAT='FRESH35_NORMAL_SERVICE_RETAINED_V1'
RECEIPT_STATE='NORMAL_SERVICE_RETAINED_CURRENT_EPOCH_NOT_BUSINESS_ACCEPTANCE'
RECORD='4ed44478765d20c1ccde4f5a2c29441456a0ee7cd6ed1c16ccd2ee3d3b65c39e'
SOURCE='6c49bd9218e7cb313e7ac7d7cce83a166651e7418dd1c82322dc42589daefa16'
TARGET='fe0b2fe570382453f27def1c9d92eac8fc2fb5b37fc51f096a1a8c912bc28168'
WORK='/var/lib/naijue-erp/fresh35-production/fresh35-first-production-20261110-r3'
DATA={'device':66304,'inode':13502421,'uid':61035,'gid':61035,'mode':0o700}
RECORD38='fresh35-compact-zero-successor-v2.json'
POST38_SOURCE='e43584e931791601974440955dfe3464cd0f3d9220141acfe5a9172212841d15'
POST38_CATALOG_SPEC='5ab03ca9c07eae189d326e2816a753fdfc35f4e84e8d5398763983dafa107027'
POST38_MODEL='44b64832ab36289180f17757ea726d8de747da5ef24ef5365d642831e350b998'
POST38_SQL='b61b31b6116b3f0891dc4cd1f9182aa438d22ad987e29ac2ec73c04f72f5d0ba'
ADMIN154_RECORD_SHA='96d35d3b4c7b356b334849373611068d07bb12b3fcf6c6f47dacce3d570a3e3e'
ADMIN154_CATALOG_SPEC='811c3cf6df32c6cfabc77071812f7e3abd43a0ea64b9f7b4d982b8ccae791d67'
ADMIN154_MODEL='0d80600b46c95f11bf2ddcb8101bce66e292735e4543a6a383039b32feda2d20'
ADMIN154_EPOCH='2026-11-13 03:37:40.014546+00'
SERVICE14_EPOCH='2026-11-13 07:35:39.511422+00'
DDL_SERVICE_PROOF='76326acb7db45e6a65a1eb6b88b9b44a1cf6ed7bf8bae09d5f99e2f3184a8727'
DDL_EPOCH='2026-11-13 08:53:20.527136+00'
PREVIOUS_JOB = 't45-first-r3-native-service-start-20261115-24'
PREVIOUS_EPOCH = '2026-11-15 15:21:19.205528+00'
PREVIOUS_STOP = 't45-r3-ordinary24-preserve-stop-20261115-01'
PHYSICAL={'systemIdentifier':'7706545564479176741','databaseOid':'16393','serverVersionNum':'170011'}
SQL36_ROOT_RESULT='c02a30ddb237435a5e8a21bfb5a309fb572b0c0061a928c519fc25ec35f85120'
SQL36_TERMINAL='362329cd68913d9ea4cde447a9dc7bbb833df6127dc831a23387b1079f5a1115'
SQL36_ARTIFACT='ae9ac401ab79d478795cebaf2b85852e9f40d9c46fc790c6b638dc910221c3ac'
PHASES={'SQL36':'t45-r3-baseline-scope-sql36-20261111-02',
        'ADMIN_PROVISION_ONLY':'t45-r3-baseline-scope-admin-provision-20261113-05',
        'SQL38':'t45-r3-baseline-scope-sql38-20261111-01'}
GRANT='b16447fbc81f4d64'
FIELDS={'format','requestKey','authorizationSha256','checkedAt','installationRecordSha256','targetSha256','sourceSetSha256',
        'serviceReceiptSha256','dataDirectory','dataDirectoryIdentity','physical','sharedPostgresNamespace',
        'postmaster','guardian','runtimeRole','runtimeLoginValidUntil'}
RECEIPT_FIELDS={'format','state','requestKey','authorizationSha256','checkedAt','installationRecordSha256','targetSha256','sourceSetSha256',
                'dataDirectory','dataDirectoryIdentity','physical','container','postmaster','guardian','runtimeRole','runtimeLoginValidUntil','serviceLeaseExpiresAt'}

def need(ok,code):
    if not ok:raise ValueError(code)
def digest(raw):return hashlib.sha256(raw).hexdigest()
def canonical(value):
    raw=(json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False)+'\n').encode('utf8')
    need(0<len(raw)<=65536,'NORMAL_PROOF_SIZE_REQUIRED');return raw
def micros(text):
    need(type(text) is str and re.fullmatch(r'\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{1,6})?\+00',text),'NORMAL_PG_TIMESTAMP_FORMAT_REQUIRED')
    seconds, _, fraction = text[:-3].partition('.')
    dt = datetime.fromisoformat(seconds + '.' + fraction.ljust(6, '0') + '+00:00')
    delta = dt - datetime(1970,1,1,tzinfo=timezone.utc)
    return (delta.days*86400+delta.seconds)*1000000+delta.microseconds

def scope():
    return {'format':'T45_FIRST_R3_NORMAL_SERVICE_V1','decision':'START_SAME_PGDATA_WITH_ORIGINAL_RUNTIME_REFERENCE_READONLY',
            'requestKey':JOB,'containerName':NAME,'installationRecordSha256':RECORD,'sourceSetSha256':SOURCE,'targetSha256':TARGET,
            'dataDirectory':WORK+'/data','dataDirectoryIdentity':DATA,'runtimeRole':'erp35_runtime_20261110_r3',
            'runtimeLoginValidUntil':None,'maximumStartOperationSeconds':300,'maximumServiceSeconds':3600,
            'authenticationAction':'AUTHENTICATE_ORIGINAL_RUNTIME_REFERENCE_ONLY','previousRuntimeOutcome':'UNKNOWN_PRESERVED',
            'previousRequestKey':PREVIOUS_JOB,'previousStopRequestKey':PREVIOUS_STOP,
            'runtimeReadinessMaxSeconds':20,'databaseRoleChanges':0,
            'restoreRequestKey':'t45-r3-ordinary25-auth-restore-20261116-01',
            'applyRequestKey':'t45-r3-ordinary26-auth-apply-20261116-01',
            'ddlServiceProofSha256':DDL_SERVICE_PROOF,'ddlPostmasterStart':DDL_EPOCH,
            'admin154RecordSha256':ADMIN154_RECORD_SHA,'admin154PostmasterStart':ADMIN154_EPOCH,
            'admin154SourceSetSha256':'d69cae66caf44473cd6c578943852e0f8eb4af38064135d2c0fcebc368aa3afe',
            'coldCopyTerminalSha256':'a94f9ec670e4de6339e56ea66ebaf917d9fc4e140f03e11222e2c7cb30ad5777',
            'coldCopyResultSha256':'28d7925f5bc5b89805acf8a52e9d88c12c394f41adebc93cbb0a7afe157274e9',
            'coldCopyCompleteSha256':'f081eb73e96650c1623ab158dd11923c395600dd37f51e4d6940a7bb633148c1',
            'originalRuntimeMaterial':{'configuration':{'device':66304,'inode':13503993,'uid':0,'gid':0,'mode':0o600,'bytes':207},
                                       'libpqReference':{'device':66304,'inode':13503994,'uid':0,'gid':0,'mode':0o600,'bytes':131}},
            'cleanupTerminalSha256':'b70a2f253dae0e81ed95ba6ae0afcf11be5538d359fb7f64fca90668b9c548b0',
            'cleanupResultSha256':'ff0992f717ba72976f20dfbb1060c83ff82e6945b549c7fd6839676f80f1b391',
            'closeoutResultSha256':'4c603c85e6df1d5a18d59ad07f9e2a302e7c94e624a30c9c665a6ce71cfd5a16'}

def validate_authority(a,now):
    fixed=scope();dynamic={'previousTerminalSha256','previousResultSha256','previousCleanupSha256','previousCurrentProofSha256',
                           'previousStopTerminalSha256','previousStopResultSha256','restoreTerminalSha256','restoreResultSha256',
                           'applyTerminalSha256','applyResultSha256'}
    del fixed['maximumServiceSeconds']
    extra={'startsAt','expiresAt','serviceLeaseExpiresAt','capacityExpiresAt','maximumServiceSeconds','authorizationReference','normalServiceSha256','proofSourceSha256','record38Sha256','phaseResults','phaseTerminals'}|dynamic
    need(type(a) is dict and set(a)==set(fixed)|extra and all(a[k]==v for k,v in fixed.items()),'NORMAL_EXACT_AUTHORITY_SCOPE_REQUIRED')
    need(type(now) is int and all(type(a[k]) is int for k in ('startsAt','expiresAt','serviceLeaseExpiresAt','capacityExpiresAt','maximumServiceSeconds'))
         and a['startsAt']<=now<a['expiresAt']<=a['startsAt']+1800000
         and a['maximumServiceSeconds']>0
         and a['serviceLeaseExpiresAt']==a['capacityExpiresAt']==a['startsAt']+a['maximumServiceSeconds']*1000
         and a['serviceLeaseExpiresAt'] < 2**53
         and a['expiresAt']<work_deadline(a), 'NORMAL_COORDINATION_AND_SERVICE_WINDOWS_REQUIRED')
    need(type(a['authorizationReference']) is str and 0<len(a['authorizationReference'])<=512
         and all(is_digest(a[k]) for k in ({'normalServiceSha256','proofSourceSha256','record38Sha256'}|dynamic))
         and all(type(a[k]) is dict and set(a[k])==set(PHASES)
                 and all(is_digest(value) for value in a[k].values()) for k in ('phaseResults','phaseTerminals'))
         and a['phaseResults']['SQL36']==SQL36_ROOT_RESULT and a['phaseTerminals']['SQL36']==SQL36_TERMINAL,
         'NORMAL_EXTERNAL_SOURCE_REVIEW_REFERENCE_REQUIRED')
    need(micros(a['admin154PostmasterStart'])<micros(SERVICE14_EPOCH)<micros(a['ddlPostmasterStart'])<micros(PREVIOUS_EPOCH)<a['startsAt']*1000,
         'NORMAL05_ACTUAL_SERVICE15_DDL_EPOCH_REQUIRED')
    return work_deadline(a)


def work_deadline(a):
    # Keep the original 25-second clean stop and container cleanup inside the authority.
    return a['serviceLeaseExpiresAt']-35000

def validate_admin154(raw,a):
    need(type(raw) is bytes and 0<len(raw)<=65536 and digest(raw)==a['admin154RecordSha256'],
         'NORMAL05_PROTECTED_ADMIN154_RECORD_DIFFERS')
    r=json.loads(raw)
    need(set(r)=={'format','predecessor','successor','physical','transactionReceipt','appliedAt','authorizationSha256'}
         and r['format']=='FRESH35_A53_ADMIN154_SUCCESSOR_RECORD_V1'
         and r['predecessor']['recordSha256']==RECORD and r['predecessor']['sourceSetSha256']==SOURCE
         and r['predecessor']['targetSha256']==TARGET
         and r['successor']['sourceSetSha256']==a['admin154SourceSetSha256']
         and r['successor']['catalogSpecSha256']==ADMIN154_CATALOG_SPEC and r['successor']['modelSha256']==ADMIN154_MODEL
         and r['successor']['patchSqlSha256']=='6d051a5f4a8dce3183a8c01074e43dadf73942d60ca8a6c99287950dc9c62c9b'
         and set(r['physical'])=={'systemIdentifier','databaseOid','database','serverVersionNum','postmasterStart'}
         and r['physical']['systemIdentifier']=='7706545564479176741' and r['physical']['databaseOid']=='16393'
         and r['physical']['database']=='erp_fresh35_20261110_r3' and r['physical']['serverVersionNum']=='170011'
         and r['transactionReceipt']['database']=='erp_fresh35_20261110_r3'
         and r['transactionReceipt']['actor']=='erp35_owner_20261110_r3',
         'NORMAL05_EXACT_PREDECESSOR_AND_154_SUCCESSOR_REQUIRED')
    need(micros(r['physical']['postmasterStart'])==micros(a['admin154PostmasterStart'])==micros(ADMIN154_EPOCH),
         'NORMAL05_HISTORICAL_SQL36_EPOCH_DIFFERS')
    return r

def is_digest(value):
    return type(value) is str and re.fullmatch('[a-f0-9]{64}',value) is not None

def validate_post38(raw,parent,a,current=None):
    need(type(raw) is bytes and 0<len(raw)<=65536 and digest(raw)==a['record38Sha256'],
         'NORMAL_EXACT_PROTECTED_SQL38_RECORD_REQUIRED')
    r=json.loads(raw)
    pred={key:parent['successor'][key] for key in ('catalogSha256','catalogSpecSha256','modelSha256','sourceSetSha256')}
    pred['recordSha256']=a['admin154RecordSha256']
    successor=r.get('successor',{})
    receipt=r.get('transactionReceipt',{})
    need(set(r)=={'format','predecessor','successor','physical','transactionReceipt','appliedAt','authorizationSha256'}
         and r['format']=='FRESH35_COMPACT_ZERO_SUCCESSOR_RECORD_V2'
         and r['predecessor']==pred and set(r['physical'])==set(parent['physical'])
         and all(r['physical'][key]==parent['physical'][key] for key in (*PHYSICAL,'database'))
         and set(successor)=={'catalogSha256','catalogSpecSha256','modelSha256','patchSqlSha256','sourceSetSha256'}
         and all(is_digest(value) for value in successor.values())
         and successor['catalogSpecSha256']==POST38_CATALOG_SPEC and successor['patchSqlSha256']==POST38_SQL
         and successor['sourceSetSha256']==POST38_SOURCE and successor['modelSha256']==POST38_MODEL
         and receipt.get('actor')=='erp35_owner_20261110_r3' and receipt.get('database')==r['physical']['database']
         and is_digest(r['authorizationSha256']),
         'NORMAL_EXACT_154_SQL38_SOURCE_CATALOG_EPOCH_REQUIRED')
    epoch=micros(r['physical']['postmasterStart'])
    need(epoch==micros(a['ddlPostmasterStart']) and epoch>micros(SERVICE14_EPOCH),
         'NORMAL05_SQL38_SERVICE15_EPOCH_DIFFERS')
    if current is not None:
        need(all(current[key]==r['physical'][key] for key in PHYSICAL) and epoch<micros(current['postmasterStart']),
             'NORMAL05_NEW_EPOCH_MUST_FOLLOW_SQL38')
    return r

def validate_phase_result(phase,raw,a):
    need(type(raw) is bytes and 0<len(raw)<=65536 and digest(raw)==a['phaseResults'][phase],
         'NORMAL_POST38_ORIGINAL_PHASE_RESULT_PIN_REQUIRED')
    r=json.loads(raw)
    need(r.get('requestKey')==PHASES[phase] and r.get('phase')==phase,'NORMAL_POST38_ORIGINAL_PHASE_KEY_REQUIRED')
    if phase=='ADMIN_PROVISION_ONLY':
        native=r.get('nativeResult',{});origin=r.get('provisionOrigin',{})
        need(r.get('status')=='ADMIN154_NATIVE_ADMIN_RESULT_RETAINED_NOT_BUSINESS_ACCEPTANCE'
             and r.get('successorRecordSha256')==a['admin154RecordSha256']
             and native.get('state') in ('COMMITTED','ALREADY_COMMITTED') and native.get('connection_cleanup')=='CLOSED'
             and type(native.get('nativeExitCode')) is int and native['nativeExitCode']==0
             and native.get('journal')!='UNCONFIRMED' and native.get('summary_redacted') is not True
             and r.get('currentServiceSha256')==a['ddlServiceProofSha256']==DDL_SERVICE_PROOF
             and micros(r.get('postmasterStart'))==micros(a['ddlPostmasterStart'])
             and type(origin.get('operation_id')) is str
             and re.fullmatch('[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}',origin['operation_id'])
             and is_digest(origin.get('request_sha256')),'NORMAL_POST38_ACTUAL_ORIGINAL_A_COMMIT_REQUIRED')
    else:
        pin=a['admin154RecordSha256'] if phase=='SQL36' else a['record38Sha256']
        need(r.get('status')=='NATIVE154_COMMIT_READBACK_AND_ROOT_PROTECTED_RECORD_PUBLISHED_LOADED'
             and r.get('recordSha256')==pin and r.get('connectionCleanup')=='CLOSED'
             and r.get('sourceSetSha256')==(SQL36_ARTIFACT if phase=='SQL36' else POST38_SOURCE)
             and (phase=='SQL36' or is_digest(r.get('sourceSql38NodeEnvelopeSha256'))),
             'NORMAL_POST38_ACTUAL_PROTECTED_COMMIT_READBACK_REQUIRED')
    return r

def validate_terminal(raw,key,pin):
    need(type(raw) is bytes and 0<len(raw)<=65536 and digest(raw)==pin,'NORMAL05_DISPATCHER_TERMINAL_BYTES_DIFFERS')
    row=json.loads(raw)
    need((row.get('jobId'),row.get('taskId'),row.get('grantId'),row.get('scope'),row.get('status'),row.get('exitCode'))==
         (key,'T45',GRANT,'ERP_EXISTING_TASKS_THROUGH_T51','COMPLETED',0) and type(row['exitCode']) is int,
         'NORMAL05_DISPATCHER_TERMINAL_NOT_COMPLETED')

def validate_previous_stop(terminal_raw,result_raw,a,cid):
    validate_terminal(terminal_raw,PREVIOUS_STOP,a['previousStopTerminalSha256'])
    need(type(result_raw) is bytes and 0<len(result_raw)<=65536 and digest(result_raw)==a['previousStopResultSha256'],
         'NORMAL05_PREVIOUS_STOP_RESULT_BYTES_DIFFERS')
    result=json.loads(result_raw)
    service=result['service']
    need(result.get('status')=='NORMAL05_PRESERVATION_ONLY_CLEAN_STOP_CONFIRMED'
         and result['requestKey']==PREVIOUS_STOP and result['preserveMode']=='ACTIVE_HOLD'
         and result['pgStopped'] is True and result['businessAdvanced'] is False
         and result['holdRetained'] is True and result['writerTerminalSha256']=='ef30fec62cb5a606b0003a6538ff746e14887f3e674b81ed050a75492825831e'
         and result['cleanupSha256']==a['previousCleanupSha256']
         and service['serviceKey']==PREVIOUS_JOB and service['containerId']==cid
         and service['proofSha256']==a['previousCurrentProofSha256']
         and service['postmasterStart']==PREVIOUS_EPOCH,
         'NORMAL16_EXACT_SERVICE05_CLEAN_STOP_REQUIRED')
    return service

def build(record_raw,authorization_raw,receipt_raw,now,admin154_raw,record38_raw):
    need(digest(record_raw)==RECORD,'NORMAL_IMMUTABLE_RECORD_DIFFERS')
    record=json.loads(record_raw);a=json.loads(authorization_raw);r=json.loads(receipt_raw)
    lease=validate_authority(a,now)
    need(set(r)==RECEIPT_FIELDS and receipt_raw==canonical(r),'NORMAL_RETAINED_RECEIPT_CLOSED_CANONICAL_REQUIRED')
    need(r['format']==RECEIPT_FORMAT and r['state']==RECEIPT_STATE and r['requestKey']==a['requestKey']==JOB
         and r['authorizationSha256']==digest(authorization_raw),'NORMAL_EXTERNAL_AUTHORITY_PROVENANCE_REQUIRED')
    need(r['installationRecordSha256']==RECORD and r['sourceSetSha256']==SOURCE and r['targetSha256']==TARGET
         and record['binding']=={'sourceSetSha256':SOURCE,'targetSha256':TARGET},'NORMAL_INSTALLATION_BINDING_DIFFERS')
    need(r['dataDirectory']==WORK+'/data' and r['dataDirectoryIdentity']==DATA
         and r['runtimeRole']=='erp35_runtime_20261110_r3' and r['runtimeLoginValidUntil'] is None,
         'NORMAL_ORIGINAL_DATA_OR_RUNTIME_ROLE_DIFFERS')
    old=record['target']['physical'];physical=r['physical']
    need(set(physical)==set(old)=={'systemIdentifier','databaseOid','serverVersionNum','postmasterStart'}
         and all(physical[k]==old[k] for k in ('systemIdentifier','databaseOid','serverVersionNum'))
         and physical['serverVersionNum']=='170011' and micros(physical['postmasterStart'])>max(micros(old['postmasterStart']),micros(PREVIOUS_EPOCH))
         and micros(physical['postmasterStart'])>=a['startsAt']*1000,
         'NORMAL_SAME_DATA_NEW_MICROSECOND_EPOCH_REQUIRED')
    parent=validate_admin154(admin154_raw,a)
    validate_post38(record38_raw,parent,a,physical)
    container=r['container'];need(set(container)=={'id','name','imageId','startedAt','hostPid','startTicks','networkNamespace','frontEndpoint'}
         and container['name']==NAME and re.fullmatch('[a-f0-9]{64}',container['id'])
         and container['imageId']=='sha256:6de44f436389594e4647c8503764f8f6a56bc964b4e33cf31a3fbb9ba8bfa769'
         and type(container['hostPid']) is int and container['hostPid']>1
         and re.fullmatch('[0-9]+',container['startTicks'])
         and set(container['networkNamespace'])=={'device','inode'} and all(type(v) is int and v>0 for v in container['networkNamespace'].values())
         and set(container['frontEndpoint'])=={'id','aliases'} and re.fullmatch('[a-f0-9]{64}',container['frontEndpoint']['id'])
         and 'naijue-rewrite-fresh35-first-20261110-r3-app' in container['frontEndpoint']['aliases'],
         'NORMAL_CURRENT_CONTAINER_GENERATION_REQUIRED')
    for process in (r['postmaster'],r['guardian']):
        need(set(process)=={'pid','starttime','exe'} and type(process['pid']) is int and process['pid']>1
             and re.fullmatch('[0-9]+',process['starttime']) and type(process['exe']) is str and process['exe'].startswith('/'),
             'NORMAL_CURRENT_PROCESS_IDENTITY_REQUIRED')
    need(r['postmaster']['pid']!=r['guardian']['pid']
         and r['postmaster']['exe']=='/opt/naijue-erp/fresh35-combined-v1/runtime/pg/usr/lib/postgresql/17/bin/postgres'
         and re.fullmatch(r'/usr/bin/python3(?:\.[0-9]+)?',r['guardian']['exe']),
         'NORMAL_GUARDIAN_PARENT_IDENTITY_REQUIRED')
    need(type(r['checkedAt']) is type(r['serviceLeaseExpiresAt']) is type(now) is int
         and a['startsAt']<=r['checkedAt']<=now<r['serviceLeaseExpiresAt']==lease,
         'NORMAL_CURRENT_SERVICE_FINITE_WINDOW_REQUIRED')
    shared={'format':'OWNED_POSTGRES_SHARED_NAMESPACE_V1','container':container,'creationOperationId':JOB,
            'sourceSetSha256':SOURCE,'targetSha256':TARGET,'installationRecordSha256':RECORD,'serviceLeaseExpiresAt':r['serviceLeaseExpiresAt']}
    out={k:r[k] for k in ('requestKey','authorizationSha256','checkedAt','installationRecordSha256','targetSha256','sourceSetSha256',
                         'dataDirectory','dataDirectoryIdentity','physical','postmaster','guardian','runtimeRole','runtimeLoginValidUntil')}
    out.update(format=FORMAT,serviceReceiptSha256=digest(receipt_raw),sharedPostgresNamespace=shared)
    need(set(out)==FIELDS,'NORMAL_CURRENT_PROOF_CLOSED_FIELDS_REQUIRED');return canonical(out)
