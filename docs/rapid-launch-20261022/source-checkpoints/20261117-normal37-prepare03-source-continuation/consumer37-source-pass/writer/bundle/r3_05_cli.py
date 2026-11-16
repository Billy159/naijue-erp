"""Compact-zero CLI additions for the existing T45 R3 real worker."""
import hashlib
from pathlib import Path
import re

ROOT = Path('/var/lib/naijue-erp/fresh35-production/real-first-20261110-r3')
DEPLOY = '/opt/naijue-erp/fresh35-combined-v1'
SERVICE = Path('/run/naijue-rewrite/current-production-service.json')
AUTHORITY = Path('/etc/naijue-erp/fresh35-compact-zero-execution-v2.json')
MANIFEST = 'f4b86de73073da86fe8e49af5a871aaf1d3e856856a0912d835ea0180f1b0deb'
FORMAT = 'FRESH35_COMPACT_ZERO_REAL_IMPORT_BINDING_V2'
KEY = re.compile(r'(?:t45-first-20261110-r3-real-(prepare|execute|inspect)-[0-9]{8}-[0-9]{2}|t45-r3-batched-real-(execute)-20261115-01)')
APPROVALS = {
    'explicit-zero-approval': 'zero-approval-candidate.private.jsonl',
    'historical-hall-approval': 'historical-hall-approval.UNTRUSTED.DRAFT.private.json',
    'historical-line-amount-evidence': 'historical-line-amount-evidence.candidate.json',
    'staff-hall-approval': 'staff-null-hall-approval.candidate.private.json',
    'historical-settlement-retention-approval': 'historical-settlement-retention.UNTRUSTED.DRAFT.private.json',
    'current-effective-alignment': 'current-effective-alignment.UNTRUSTED.DRAFT.json',
}
HASHES = set(('installationRecordSha256 installProgramSha256 sourceSetSha256 targetSha256 catalogSha256 '
              'manifestSha256 planSha256 initializerSha256 stepsSha256 successorRecordSha256 '
              'successorSourceSetSha256 successorCatalogSpecSha256 currentServiceSha256').split())
LABELS = set(('sourceNamespace cutoffAt baselineBatchId documentBatchId initializerOperationId '
              'initializerRequestKey postmasterStart').split())


def require(ok, code):
    if not ok:
        raise ValueError(code)


def digest(value):
    return type(value) is str and re.fullmatch('[0-9a-f]{64}', value) is not None


def validate_prepared_binding(binding, expected):
    require(type(binding) is dict and set(binding)==HASHES|LABELS|{'format','stepCount'}
            and binding['format']==FORMAT and all(digest(binding[k]) for k in HASHES)
            and type(binding['stepCount']) is int and binding['stepCount']>0
            and all(type(binding[k]) is str and 0<len(binding[k])<=256 and binding[k].isprintable()
                    for k in LABELS), 'R3_COMPACT_PREPARED_BINDING_INVALID')
    require(binding['manifestSha256']==MANIFEST and
            all(binding.get(k)==v for k,v in expected.items()), 'R3_COMPACT_PREPARED_BINDING_DIFFERS')
    return binding


def prepared_result(raw, expected, strict):
    data = strict(raw)
    require(type(data) is dict and data.get('state')=='COMPACT_ZERO_PREPARED'
            and data.get('purpose')=='FIRST_REAL_BUSINESS_IMPORT'
            and data.get('target_profile')=='FRESH35_COMPACT_ZERO_FIRST_IMPORT_V2'
            and data.get('manifest_sha256')==MANIFEST
            and data.get('business_database_writes') is False
            and data.get('connection_cleanup')=='CLOSED'
            and data.get('local_cleanup') is None,
            'R3_COMPACT_PREPARE_NOT_CONFIRMED')
    binding = validate_prepared_binding(data['binding'],expected)
    require(data.get('plan_sha256')==binding['planSha256'],'R3_COMPACT_PREPARED_BINDING_DIFFERS')
    return {'state':data['state'],'connectionCleanup':'CLOSED','verification':'NOT_RUN',
            'businessDatabaseWrites':False,'binding':binding}


def require_execute_authority(raw, approved_sha, prepared, now, deadline, strict):
    require(digest(approved_sha) and hashlib.sha256(raw).hexdigest()==approved_sha,
            'R3_COMPACT_EXECUTION_AUTHORITY_BYTES_DIFFERS')
    value = strict(raw)
    require(type(value) is dict and set(value)=={'format','decision','binding','startsAt','expiresAt',
                                                 'authorizationReference','independentSafetyReviewSha256'}
            and value['format']=='FRESH35_COMPACT_ZERO_EXECUTION_AUTHORIZATION_V2'
            and value['decision']=='AUTHORIZE_EXACT_FIRST_REAL_BUSINESS_IMPORT_AND_READBACK'
            and value['binding']==prepared and digest(value['independentSafetyReviewSha256'])
            and type(value['authorizationReference']) is str and bool(value['authorizationReference'].strip())
            and type(value['startsAt']) is type(value['expiresAt']) is int
            and value['startsAt']<=now<value['expiresAt']<=deadline,
            'R3_COMPACT_EXECUTION_AUTHORITY_DIFFERS')


def cli_command(description, report, operation_root, compact):
    key = description['requestKey']
    mode = description['mode']
    match = KEY.fullmatch(key)
    require(match is not None and match[1].upper()==mode
            and report==ROOT/'reports'/key/'runtime/stream'
            and description['manifestSha256']==MANIFEST,
            'R3_COMPACT_EXACT_OPERATION_REQUIRED')
    required = {'admin154SuccessorSha256','admin154ParentSourceSha256','admin154ParentCatalogSpecSha256',
                'compactZeroSuccessorSha256','currentServiceSha256'}
    require(all(digest(compact.get(k)) for k in required) and type(compact['capacityExpiresAt']) is int,
            'R3_COMPACT_EXACT_INPUT_PINS_REQUIRED')
    require(set(description['approvals'])==set(APPROVALS) and
            all(digest(v) for v in description['approvals'].values()), 'R3_COMPACT_APPROVALS_REQUIRED')
    access = ROOT/'nonroot-access'/key/'worker'
    command = [DEPLOY+'/runtime/node/bin/node','--no-global-search-paths',
               str(operation_root/'tools/unified-import/cli.mjs'),'stream-import',
               '--package',str(ROOT/'package'),'--report',str(report),'--manifest-sha256',MANIFEST,
               '--target',str(access/'target.json'),'--admin',str(access/'initialize-admin.json'),
               '--connection',str(access/'private/controller-connection.json'),
               '--scrypt-file',str(access/'private/initial-admin-scrypt.secret'),
               '--target-profile','FRESH35_COMPACT_ZERO_FIRST_IMPORT_V2',
               '--fresh35-reference-inputs',DEPLOY+'/reference-inputs','--ack-exclusive-ddl-window',
               '--admin154-successor-sha256',compact['admin154SuccessorSha256'],
               '--admin154-parent-source-sha256',compact['admin154ParentSourceSha256'],
               '--admin154-parent-catalog-spec-sha256',compact['admin154ParentCatalogSpecSha256'],
               '--compact-zero-successor-sha256',compact['compactZeroSuccessorSha256'],
               '--current-service-sha256',compact['currentServiceSha256'],
               '--capacity-expires-at',str(compact['capacityExpiresAt']),
               '--provision-receipt',str(access/'private/original-admin-provision-receipt.json')]
    if mode=='PREPARE':
        command.append('--prepare-only')
    elif mode=='INSPECT':
        command.append('--inspect-only')
    if description['registrationSha256'] is not None:
        command.extend(('--registration',str(ROOT/'registration.json')))
    for option, name in sorted(APPROVALS.items()):
        command.extend(('--'+option,str(ROOT/'approvals'/name),'--'+option+'-sha256',description['approvals'][option]))
    return command
