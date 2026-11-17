"""Fixed V2 normal-service proof; never an issuer or credential restorer."""
import hashlib,json,re
from datetime import datetime,timezone

JOB='t45-first-r3-native-service-start-20261111-04'
NAME='t45-fresh35-first-production-20261110-r3-service-04'
FORMAT='FRESH35_CURRENT_PRODUCTION_SERVICE_V2'
RECEIPT_FORMAT='FRESH35_NORMAL_SERVICE_RETAINED_V1'
RECEIPT_STATE='NORMAL_SERVICE_RETAINED_CURRENT_EPOCH_NOT_BUSINESS_ACCEPTANCE'
RECORD='4ed44478765d20c1ccde4f5a2c29441456a0ee7cd6ed1c16ccd2ee3d3b65c39e'
SOURCE='6c49bd9218e7cb313e7ac7d7cce83a166651e7418dd1c82322dc42589daefa16'
TARGET='fe0b2fe570382453f27def1c9d92eac8fc2fb5b37fc51f096a1a8c912bc28168'
WORK='/var/lib/naijue-erp/fresh35-production/fresh35-first-production-20261110-r3'
DATA={'device':66304,'inode':13502421,'uid':61035,'gid':61035,'mode':0o700}
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
    dt=datetime.fromisoformat(text+':00');delta=dt-datetime(1970,1,1,tzinfo=timezone.utc)
    return (delta.days*86400+delta.seconds)*1000000+delta.microseconds

def scope():
    return {'format':'T45_FIRST_R3_NORMAL_SERVICE_V1','decision':'START_SAME_PGDATA_WITH_ORIGINAL_RUNTIME_REFERENCE_READONLY',
            'requestKey':JOB,'carrierRequestKey':'t45-first-r3-native-service-start-20261111-04-02','containerName':NAME,'installationRecordSha256':RECORD,'sourceSetSha256':SOURCE,'targetSha256':TARGET,
            'dataDirectory':WORK+'/data','dataDirectoryIdentity':DATA,'runtimeRole':'erp35_runtime_20261110_r3',
            'runtimeLoginValidUntil':None,'maximumStartOperationSeconds':300,'maximumServiceSeconds':3600,
            'authenticationAction':'AUTHENTICATE_ORIGINAL_RUNTIME_REFERENCE_ONLY','previousRuntimeOutcome':'UNKNOWN_PRESERVED',
            'previousRequestKey':'t45-first-r3-native-service-start-20261111-03',
            'previousTerminalSha256':'dc54983b1b05e88b1adafb7e9642809342ab5bdbd64ab86c32be01d198552bc7',
            'previousResultSha256':'c9923facf2cb6a42f67de2febac5cc15954634436a967b2633f736e269004f6c',
            'previousCleanupSha256':'d133ce0aa72a0512a456ffcebc68a604ccca03f21fb551b1b34c9e62ee21a811',
            'runtimeReadinessMaxSeconds':20,'databaseRoleChanges':0,
            'previousCurrentProofSha256':'d1b6c766d96e2301ca62e92019df1128884b8e90f09b51ef270ea01b49a7d9eb',
            'coldCopyTerminalSha256':'a94f9ec670e4de6339e56ea66ebaf917d9fc4e140f03e11222e2c7cb30ad5777',
            'coldCopyResultSha256':'28d7925f5bc5b89805acf8a52e9d88c12c394f41adebc93cbb0a7afe157274e9',
            'coldCopyCompleteSha256':'f081eb73e96650c1623ab158dd11923c395600dd37f51e4d6940a7bb633148c1',
            'originalRuntimeMaterial':{'configuration':{'device':66304,'inode':13503993,'uid':0,'gid':0,'mode':0o600,'bytes':207},
                                       'libpqReference':{'device':66304,'inode':13503994,'uid':0,'gid':0,'mode':0o600,'bytes':131}},
            'cleanupTerminalSha256':'b70a2f253dae0e81ed95ba6ae0afcf11be5538d359fb7f64fca90668b9c548b0',
            'cleanupResultSha256':'ff0992f717ba72976f20dfbb1060c83ff82e6945b549c7fd6839676f80f1b391',
            'closeoutResultSha256':'4c603c85e6df1d5a18d59ad07f9e2a302e7c94e624a30c9c665a6ce71cfd5a16'}

def validate_authority(a,now):
    fixed=scope();extra={'startsAt','expiresAt','serviceLeaseExpiresAt','capacityExpiresAt','authorizationReference','normalServiceSha256','proofSourceSha256'}
    need(type(a) is dict and set(a)==set(fixed)|extra and all(a[k]==v for k,v in fixed.items()),'NORMAL_EXACT_AUTHORITY_SCOPE_REQUIRED')
    need(type(now) is int and all(type(a[k]) is int for k in ('startsAt','expiresAt','serviceLeaseExpiresAt','capacityExpiresAt'))
         and a['startsAt']<=now<a['expiresAt']<=a['startsAt']+1800000
         and a['expiresAt']<min(a['serviceLeaseExpiresAt'],a['capacityExpiresAt'])
         and max(a['serviceLeaseExpiresAt'],a['capacityExpiresAt'])<=a['startsAt']+3600000,'NORMAL_COORDINATION_AND_SERVICE_WINDOWS_REQUIRED')
    need(type(a['authorizationReference']) is str and 0<len(a['authorizationReference'])<=512
         and all(type(a[k]) is str and re.fullmatch('[a-f0-9]{64}',a[k]) for k in ('normalServiceSha256','proofSourceSha256')),
         'NORMAL_EXTERNAL_SOURCE_REVIEW_REFERENCE_REQUIRED')
    return min(a['serviceLeaseExpiresAt'],a['capacityExpiresAt'])

def build(record_raw,authorization_raw,receipt_raw,now):
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
         and physical['serverVersionNum']=='170011' and micros(physical['postmasterStart'])>micros(old['postmasterStart'])
         and micros(physical['postmasterStart'])>=a['startsAt']*1000,
         'NORMAL_SAME_DATA_NEW_MICROSECOND_EPOCH_REQUIRED')
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
