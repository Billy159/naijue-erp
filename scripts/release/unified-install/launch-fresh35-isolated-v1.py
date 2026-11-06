#!/usr/bin/python3
"""Linux-only trusted deployment controller. Source review is NOT run permission.
Invoke the fixed deployed file with OS-trusted Python -I -S. No permission repair,
OS account creation, authorization-file creation, old-cluster access or retry.
The external authority files are inputs; this controller cannot issue them.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import selectors
import signal
import stat
import subprocess
import sys
import time
from datetime import datetime, timezone

DEPLOY = Path('/opt/naijue-erp/fresh35-combined-v1')
ETC = Path('/etc/naijue-erp')
PARENT = Path('/var/lib/naijue-erp/fresh35-isolated')
SELF = DEPLOY / 'scripts/release/unified-install/launch-fresh35-isolated-v1.py'
ENTRY = DEPLOY / 'scripts/release/unified-install/fresh35-isolated-entry-v1.mjs'
NODE = DEPLOY / 'runtime/node/bin/node'
BIN = DEPLOY / 'runtime/pg/usr/lib/postgresql/17/bin'
SHARE = DEPLOY / 'runtime/pg/usr/share/postgresql/17'
AUTH = ETC / 'fresh35-isolated-provision-v1.json'
MANIFEST = ETC / 'fresh35-isolated-deployment-v1.json'
INSTALL_AUTH = ETC / 'fresh35-combined-execution-v1.json'
INTERFACES = ('erp_unified27_initializer_2393dbc6db9581c2', 'erp_unified27_importer_2393dbc6db9581c2', 'erp_unified27_runtime_2393dbc6db9581c2')
TOOL_PINS = {'postgres':'6468a969338215cb3912cf9c0b894bdbbd37b9a709926db078e9a5bf8bdc3e16','initdb':'a0363354125bc00f25075bb47fc32a2838fa7668c008326227f5bc04d628ca1d','psql':'3c94c29652ea7ff8803ab1ca35e48c38a39c8a94a8c8eeadbb1d87c68494506c','pg_controldata':'b54c1bdeeab0953598b8447127b2230b1748ea1989dd972e6ee02455f256f180'}
NODE_SHA = '7fde7b8afa198da66257f42ee2001d874c7355631e6d1579a5fb5ef1f246df4c'
APPLICATION_SCRYPT_NAME = 'synthetic-application-scrypt.txt'
ORDINARY_SCENARIO_NAME = 'fresh35-ordinary-scenario.json'
ORDINARY_CREDENTIAL_KEY_NAME = 'staff-credential-request-key.bin'
CAPACITY_REVIEW_SHA = 'de1de45ff4256a8f58c760e5f30af75d1e487fe5777ea2e44f9f1beb2b34226a'
CAPACITY_COLLECTOR_SHA = '1c34a9c8707f53f62348b2bb6ca77f465f669eae2a16b598d0a303fc05533338'
CAPACITY_PROFILE = Path('/run/naijue-rewrite/capacity/owner-profile.json')
ORDINARY_CONFIGURATION = DEPLOY/'runtime/fresh35-ordinary-runtime-v1.json'
# The retained cohort from fresh35-retirement-plan, not a caller-supplied list.
SNAPSHOT_TABLES = ('audit_change','auth_session','barcode_scheme','color','customer','fit','hall','import_batch','import_record','inventory_balance','inventory_ledger','operation_receipt','payment_account','payment_account_hall','payment_method','product','product_category','product_image','runtime_document_number_allocation','sales_header','sales_line','sales_settlement','schema_migration','season','size','size_group','size_group_member','sku','sku_barcode','staff','supplier','transfer_header','transfer_line','user_account','warehouse')

# Frozen D1 finite readback templates; no credentials or caller-selected SQL.
SCENE_PUBLICATION_SQL = 'WITH init AS (\n SELECT r.id AS root_operation,r.actor_account_id,r.target_id AS baseline_id,\n        a.after_values->\'request\' AS request\n FROM naijue_erp.operation_receipt r\n JOIN naijue_erp.audit_change a ON a.operation_id=r.id\n WHERE r.target_type=\'IMPORT\' AND r.action=\'IMPORT_INITIALIZE_CURRENT_ADMIN\'\n   AND r.status=\'COMMITTED\' AND a.object_type=\'IMPORT\'\n   AND a.object_id=r.target_id AND a.actor_account_id=r.actor_account_id\n   AND a.action=r.action AND a.occurred_at=r.completed_at\n   AND a.after_values->>\'phase\'=\'INITIALIZE\'\n   AND a.after_values->\'whole_package_v2\'->>\'root_operation\'=r.id::text\n   AND a.after_values->\'request\'->>\'namespace\'=\'synthetic.unified.v1\'\n   AND a.after_values->\'request\'->>\'package_manifest_sha256\'=$1::text\n   AND a.after_values->\'request\'->>\'plan_sha256\'=$2::text\n   AND a.after_values->\'request\'->\'payload\'->\'admin\'->>\'login_name\'=\'synthetic-fresh35-admin\'\n), published AS (\n SELECT b.id,b.source_name,b.source_hash,b.history_payload_hash,b.inventory_mode,\n        b.checkpoint,b.completed_at,r.id AS publication_operation,a.after_values\n FROM naijue_erp.import_batch b\n JOIN naijue_erp.operation_receipt r ON r.target_type=\'IMPORT\' AND r.target_id=b.id\n JOIN naijue_erp.audit_change a ON a.operation_id=r.id\n WHERE b.status=\'IMPORTED\' AND b.completed_at IS NOT NULL\n   AND b.source_name=\'synthetic.unified.v1\' AND b.source_hash=$1::text\n   AND r.action=\'IMPORT_PUBLISH\' AND r.status=\'COMMITTED\'\n   AND r.result_data->>\'profile\'=\'STANDARD_IMPORT_SQL_V1\'\n   AND r.result_data->>\'planSha256\'=$2::text\n   AND r.result_data->>\'packageManifestSha256\'=$1::text\n   AND r.result_data->>\'status\'=\'IMPORTED\'\n   AND a.object_type=\'IMPORT\' AND a.object_id=b.id AND a.action=r.action\n   AND a.actor_account_id=r.actor_account_id AND a.occurred_at=r.completed_at\n   AND b.completed_at=r.completed_at AND a.after_values->\'checkpoint\'=b.checkpoint\n   AND b.checkpoint->\'counts\'=b.checkpoint->\'expected\'\n)\nSELECT i.root_operation::text AS "initializerOperationId",base.id::text AS "baselineBatchId",\n       docs.id::text AS "documentBatchId",docs.source_hash AS "sourceHash",\n       docs.history_payload_hash AS "historyPayloadHash",\n       base.publication_operation::text AS "baselinePublicationOperationId",\n       docs.publication_operation::text AS "documentPublicationOperationId",\n       u.id::text AS "accountId",u.login_name AS "loginName",u.login_enabled AS "loginEnabled",\n       st.id::text AS "adminStaffId",st.role AS "adminRole",st.employment_status AS "adminEmployment"\nFROM init i\nJOIN published base ON base.id=i.baseline_id AND base.inventory_mode=\'CUTOFF_STOCK_BASELINE\'\n AND base.after_values->>\'phase\'=\'BASELINE_SEAL\'\n AND base.after_values->\'whole_package_v2\'->>\'root_operation\'=i.root_operation::text\nJOIN published docs ON docs.id=(i.request->\'payload\'->>\'document_batch_id\')::uuid\n AND docs.inventory_mode=\'DOCUMENT_CONVERSION\' AND docs.after_values->>\'phase\'=\'DOCUMENT_PUBLISH\'\n AND docs.after_values->\'whole_package_v2\'->>\'root_operation\'=i.root_operation::text\nJOIN naijue_erp.user_account u ON u.id=i.actor_account_id\n AND u.id=(i.request->\'payload\'->\'admin\'->>\'account_id\')::uuid\nJOIN naijue_erp.staff st ON st.id=u.staff_id\n AND st.id=(i.request->\'payload\'->\'admin\'->>\'staff_id\')::uuid'

SCENE_REFERENCES_SQL = "WITH refs AS (\n SELECT target_type,target_id FROM naijue_erp.import_record\n WHERE import_batch_id=$1::uuid AND source_system='synthetic.unified.v1' AND status='IMPORTED'\n AND (target_type,source_key) IN (\n ('HALL','hall:01'),('HALL','hall:02'),('WAREHOUSE','warehouse:01'),('WAREHOUSE','warehouse:02'),\n ('CUSTOMER','customer:01'),('STAFF','staff:01'),('PRODUCT','product:01'),('SKU','sku:01'),\n ('SKU_BARCODE','sku_barcode:01'),('PAYMENT_ACCOUNT','payment_account:01'),('PAYMENT_METHOD','payment_method:01'))\n)\nSELECT 'HALL' AS kind,jsonb_build_object('id',h.id,'enabled',h.enabled,'version',h.version,\n 'defaultCustomerId',h.default_customer_id,'defaultWarehouseId',h.default_sales_warehouse_id) AS value\n FROM naijue_erp.hall h JOIN refs r ON r.target_type='HALL' AND r.target_id=h.id\nUNION ALL SELECT 'WAREHOUSE',jsonb_build_object('id',w.id,'hallId',w.hall_id,'enabled',w.enabled,'version',w.version)\n FROM naijue_erp.warehouse w JOIN refs r ON r.target_type='WAREHOUSE' AND r.target_id=w.id\nUNION ALL SELECT 'CUSTOMER',jsonb_build_object('id',c.id,'enabled',c.enabled,'version',c.version)\n FROM naijue_erp.customer c JOIN refs r ON r.target_type='CUSTOMER' AND r.target_id=c.id\nUNION ALL SELECT 'STAFF',jsonb_build_object('id',s.id,'hallId',s.hall_id,'role',s.role,'employmentStatus',s.employment_status,'version',s.version)\n FROM naijue_erp.staff s JOIN refs r ON r.target_type='STAFF' AND r.target_id=s.id\nUNION ALL SELECT 'PRODUCT',jsonb_build_object('id',p.id,'enabled',p.enabled,'deletedAt',p.deleted_at,'version',p.version,\n 'sizeGroupId',p.size_group_id,'retailPrice',p.retail_price::text,'minimumPrice',p.minimum_price::text)\n FROM naijue_erp.product p JOIN refs r ON r.target_type='PRODUCT' AND r.target_id=p.id\nUNION ALL SELECT 'SKU',jsonb_build_object('id',s.id,'productId',s.product_id,'colorId',s.color_id,'fitId',s.fit_id,'sizeId',s.size_id,'enabled',s.enabled,'version',s.version)\n FROM naijue_erp.sku s JOIN refs r ON r.target_type='SKU' AND r.target_id=s.id\nUNION ALL SELECT 'SKU_BARCODE',jsonb_build_object('id',b.id,'skuId',b.sku_id,'barcode',b.barcode,'kind',b.barcode_kind,'enabled',b.enabled)\n FROM naijue_erp.sku_barcode b JOIN refs r ON r.target_type='SKU_BARCODE' AND r.target_id=b.id\nUNION ALL SELECT 'PAYMENT_ACCOUNT',jsonb_build_object('id',p.id,'methodId',p.payment_method_id,'enabled',p.enabled,'version',p.version)\n FROM naijue_erp.payment_account p JOIN refs r ON r.target_type='PAYMENT_ACCOUNT' AND r.target_id=p.id\nUNION ALL SELECT 'PAYMENT_METHOD',jsonb_build_object('id',p.id,'enabled',p.enabled,'version',p.version)\n FROM naijue_erp.payment_method p JOIN refs r ON r.target_type='PAYMENT_METHOD' AND r.target_id=p.id"

SCENE_BALANCES_SQL = 'WITH refs AS (\n SELECT target_type,target_id FROM naijue_erp.import_record\n WHERE import_batch_id=$1::uuid AND source_system=\'synthetic.unified.v1\' AND status=\'IMPORTED\'\n AND ((target_type=\'WAREHOUSE\' AND source_key IN(\'warehouse:01\',\'warehouse:02\'))\n   OR (target_type=\'SKU\' AND source_key=\'sku:01\'))\n), wanted AS (\n SELECT w.target_id warehouse_id,s.target_id sku_id FROM refs w CROSS JOIN refs s\n WHERE w.target_type=\'WAREHOUSE\' AND s.target_type=\'SKU\'\n)\nSELECT k.warehouse_id::text AS "warehouseId",k.sku_id::text AS "skuId",\n       b.quantity::text AS quantity,b.version,b.last_operation_id::text AS "lastOperationId",\n       b.updated_at::text AS "updatedAt",b.warehouse_id IS NOT NULL AS present\nFROM wanted k LEFT JOIN naijue_erp.inventory_balance b\n ON b.warehouse_id=k.warehouse_id AND b.sku_id=k.sku_id\nORDER BY k.warehouse_id,k.sku_id'

def need(value, code):
    if not value:
        raise RuntimeError('FRESH35_ISOLATED_' + code)

def digest(path):
    with Path(path).open('rb') as file:
        return hashlib.file_digest(file, 'sha256').hexdigest()

def strict_json(raw):
    def pairs(items):
        out = {}
        for key, value in items:
            need(key not in out, 'DUPLICATE_JSON_KEY')
            out[key] = value
        return out
    return json.loads(raw, object_pairs_hook=pairs, parse_constant=lambda _: need(False, 'NONFINITE_JSON'))

# Closed coordinator diagnostics only; no native message, SQL or private input.
VALIDATION_STEPS = ('BEGIN','LOCK_AND_INSPECT','INITIALIZE','STEP','SUMMARIZE','CONSTRAINTS','COMMIT')
VALIDATION_INTERNAL_CODES = ('BEGIN_ACK_INVALID','BATCH_ID_CONFLICT','BATCH_STATE_INVALID','STEP_INVALID','STEP_ORDER_INVALID','REQUEST_BINDING_INVALID','CHUNK_BOUND_INVALID','STEP_LIMIT_EXCEEDED','PUBLISH_INCOMPLETE','CONSTRAINTS_ACK_INVALID','COMMIT_ACK_INVALID','KERNEL_STATE_INVALID','KERNEL_REPLY_INVALID','ROLE_ACK_INVALID','EXPLICIT_ZERO_APPROVAL_BINDING_INVALID','PRIVATE_VALUE_IN_PUBLIC_REQUEST','PUBLIC_REQUEST_STRUCTURE_BOUND','SQL_REQUEST_INVALID','HISTORICAL_SETTLEMENT_APPROVAL_HASH')

def validation_diagnostic_fields(value):
    sqlstate=value.get('validationSQLSTATE');step=value.get('validationStep');code=value.get('validationInternalCode')
    return {'validationSQLSTATE':sqlstate if type(sqlstate) is str and re.fullmatch('[A-Z0-9]{5}',sqlstate) else None,
            'validationStep':step if type(step) is str and step in VALIDATION_STEPS else None,
            'validationInternalCode':code if type(code) is str and code in VALIDATION_INTERNAL_CODES else None}

def persist_stage_child_failure(root, result, stage):
    diagnostic={'state':'OUTCOME_UNKNOWN_NO_REPLAY','stage':stage,'exitCode':result.returncode,'automaticRetry':False}
    raw=result.stderr
    if type(raw) is bytes and 0<len(raw)<=16384:
        try:
            reported=strict_json(raw)
            if type(reported) is dict:
                code=reported.get('validationCode')
                diagnostic['validationStage']=reported.get('validationStage') if reported.get('validationStage') in [None,'BAD_APPROVAL','MISSING_SETTLEMENT','FINAL_PUBLISH'] else None
                diagnostic['validationCode']=code if type(code) is str and re.fullmatch('[A-Z][A-Z0-9_]{0,80}',code) else None
                diagnostic.update(validation_diagnostic_fields(reported))
        except (ValueError,RuntimeError,UnicodeError,TypeError):pass
    json_new(root/(stage+'-child-failure.json'),diagnostic)

def persist_install_child_failure(root, result, descriptor):
    diagnostic={'state':'OUTCOME_UNKNOWN_NO_REPLAY','exitCode':result.returncode,'automaticRetry':False,'diagnosticUnavailable':True}
    raw=result.stderr
    if type(raw) is bytes and 0<len(raw)<=16384:
        try:
            v=strict_json(raw.decode('utf-8'))
            keys={'state','installState','code','validationStage','validationCode','automaticRetry','stage','step','originalSQLSTATE','originalInternalCode','rollbackSQLSTATE','rollbackInternalCode','validationSQLSTATE','validationStep','validationInternalCode'}
            need(type(v) is dict and set(v)==keys,'INSTALL_DIAGNOSTIC_FIELDS')
            need(v['state']=='INSTALL_FAILED_OR_OUTCOME_UNKNOWN' and v['code']=='FRESH35_ISOLATED_ENTRY_FAILED' and v['automaticRetry'] is False,'INSTALL_DIAGNOSTIC_STATE')
            need(v['installState'] in [None,'NOT_STARTED','IN_TRANSACTION','ROLLED_BACK','ROLLBACK_UNCONFIRMED','COMMIT_OUTCOME_UNKNOWN','COMMITTED_UNPUBLISHED','FAILED_NO_INSTALLED_RESULT'],'INSTALL_DIAGNOSTIC_INSTALL_STATE')
            need(v['stage'] in ['BOUND','BEGIN','STEP','OBSERVE','COMMIT','ROLLBACK','CLOSE','UNKNOWN'],'INSTALL_DIAGNOSTIC_STAGE')
            need((v['stage']=='STEP' and type(v['step']) is str and re.fullmatch('[A-Za-z0-9_./:-]{1,160}',v['step']) and v['step'] in {step['name'] for step in descriptor['statements']}) or (v['stage']!='STEP' and v['step'] is None),'INSTALL_DIAGNOSTIC_STEP')
            need(v['validationStage'] in [None,'BAD_APPROVAL','MISSING_SETTLEMENT','FINAL_PUBLISH'],'INSTALL_DIAGNOSTIC_VALIDATION_STAGE')
            for key in ['validationCode','originalSQLSTATE','rollbackSQLSTATE','originalInternalCode','rollbackInternalCode']:
                value=v[key]
                if value is None:continue
                pattern='[A-Z0-9]{5}' if key.endswith('SQLSTATE') else '[A-Z][A-Z0-9_]{0,80}' if key=='validationCode' else '(?:FRESH35_COMBINED_[A-Z0-9_]{1,63}|CLIENT_CLOSE_TIMEOUT)'
                need(type(value) is str and re.fullmatch(pattern,value),'INSTALL_DIAGNOSTIC_CODE')
            need({key:v[key] for key in ['validationSQLSTATE','validationStep','validationInternalCode']}==validation_diagnostic_fields(v),'INSTALL_DIAGNOSTIC_VALIDATION_FIELDS')
            diagnostic.update(v);diagnostic['diagnosticUnavailable']=False
        except (ValueError,RuntimeError,UnicodeError,TypeError):pass
    json_new(root/'installation-child-failure.json',diagnostic)

def trusted(path, tree=False):
    path = Path(path)
    need(path.is_absolute() and str(path) == os.path.normpath(path), 'CANONICAL_PATH')
    for current in [Path('/')] + list(reversed(path.parents))[1:] + [path]:
        info = current.lstat()
        need(info.st_uid == 0 and not info.st_mode & 0o022 and not stat.S_ISLNK(info.st_mode) and (stat.S_ISDIR(info.st_mode) or stat.S_ISREG(info.st_mode)), 'ROOT_TRUST_REQUIRED')
        # Any POSIX extended/default ACL is an unreviewed permission contract.
        need(not any(k.startswith('system.posix_acl_') for k in os.listxattr(current, follow_symlinks=False)), 'EXTENDED_ACL_NOT_REVIEWED')
    if tree and path.is_dir():
        for child in path.iterdir():
            trusted(child, True)

def read_private(path):
    trusted(path)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        info = os.fstat(fd)
        need(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and info.st_nlink == 1 and info.st_mode & 0o077 == 0 and 0 < info.st_size <= 4*1024*1024, 'PRIVATE_AUTHORITY_INPUT')
        return os.read(fd, info.st_size + 1)
    finally:
        os.close(fd)

def exact_keys(value, names):
    need(type(value) is dict and set(value) == set(names), 'CLOSED_INPUT')

def validate_authorization(a, now_ms):
    exact_keys(a, ['format','decision','deploymentManifestSha256','sourceSetSha256','proposal','postgresUid','postgresGid','startsAt','expiresAt','independentSafetyReviewSha256','authorizationReference'])
    need(a['format'] == 'FRESH35_ISOLATED_PROVISION_AUTHORIZATION_V1' and a['decision'] == 'AUTHORIZE_EXACT_NEW35_INSTALL_RECORD_AND_SYNTHETIC_IMPORT', 'PROVISION_AUTHORITY_REQUIRED')
    for key in ['deploymentManifestSha256','sourceSetSha256','independentSafetyReviewSha256']:
        need(type(a[key]) is str and re.fullmatch('[a-f0-9]{64}', a[key]), 'AUTHORITY_HASH')
    need(type(a['authorizationReference']) is str and 0 < len(a['authorizationReference']) <= 512, 'AUTHORITY_REFERENCE')
    for key in ['postgresUid','postgresGid']:
        need(type(a[key]) is int and 0 < a[key] < 2**31, 'DEDICATED_NONROOT_POSTGRES_ACCOUNT')
    need(all(type(a[k]) is int for k in ['startsAt','expiresAt']) and a['startsAt'] <= now_ms < a['expiresAt'] - 90000 and 0 < a['expiresAt'] - a['startsAt'] <= 1200000, 'ORIGINAL_WINDOW')
    p = a['proposal']
    exact_keys(p, ['database','owner','controller','runtime','admin','host','port','workspaceDirectory'])
    m = re.fullmatch(r'synthetic_fresh35_([0-9]{8})_(r[1-9][0-9]{0,3})', p['database'])
    need(m is not None, 'NEW_DATABASE_NAME')
    for role in ['owner','controller','runtime','admin']:
        need(p[role] == 'fresh35_' + role + '_' + m[1] + '_' + m[2], 'EXACT_ROLE_NAMES')
    need(p['host'] == '127.0.0.1' and type(p['port']) is int and 1024 < p['port'] < 65536 and p['port'] not in [5432,55437,55438,55439,57628], 'NEW_LOOPBACK_ENDPOINT')
    need(p['workspaceDirectory'] == str(PARENT / ('cloud-pg-fresh35-' + m[1] + '-' + m[2])), 'EXACT_NEW_WORKSPACE')
    return a

def verify_deployment(a):
    trusted(DEPLOY, True)
    raw = read_private(MANIFEST)
    need(hashlib.sha256(raw).hexdigest() == a['deploymentManifestSha256'], 'DEPLOYMENT_MANIFEST_DIFFERS')
    m = strict_json(raw)
    exact_keys(m, ['format','files'])
    need(m['format'] == 'FRESH35_ISOLATED_DEPLOYMENT_V1' and type(m['files']) is list, 'DEPLOYMENT_MANIFEST')
    files = {}
    for row in m['files']:
        exact_keys(row, ['path','sha256'])
        p = row['path']
        need(type(p) is str and p and not p.startswith('/') and str(Path(p)) == p and '..' not in Path(p).parts and p not in files and re.fullmatch('[a-f0-9]{64}', row['sha256']), 'DEPLOYMENT_ENTRY')
        files[p] = row['sha256']
    actual = {str(p.relative_to(DEPLOY)): digest(p) for p in DEPLOY.rglob('*') if p.is_file()}
    need(actual == files, 'COMPLETE_DEPLOYMENT_BYTES_DIFFER')
    need(digest(NODE) == NODE_SHA, 'NODE_24_21_0_PIN')
    for name, sha in TOOL_PINS.items():
        need(digest(BIN/name) == sha, 'PG_17_11_TOOL_PIN')
    # Dependencies outside DEPLOY remain part of the OS trust root, checked here.
    trusted('/usr/lib/x86_64-linux-gnu/libpq.so.5.17')
    need(Path('/lib/x86_64-linux-gnu/libpq.so.5').resolve() == Path('/usr/lib/x86_64-linux-gnu/libpq.so.5.17') and digest('/usr/lib/x86_64-linux-gnu/libpq.so.5.17') == 'f64dcec14657e4123621448442cd3d0795744d238e588774f5c864f592f4860d', 'LIBPQ_PIN')

def write_new(path, data, mode=0o400, owner=None):
    fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, mode)
    try:
        with os.fdopen(fd, 'wb', closefd=False) as file:
            file.write(data)
            file.flush()
            os.fchmod(fd,mode)
            if owner is not None:os.fchown(fd,*owner)
            os.fsync(fd)
    finally:
        os.close(fd)
    fd = os.open(Path(path).parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)

def json_new(path, value, mode=0o400):
    write_new(path, (json.dumps(value, sort_keys=True) + '\n').encode(),mode=mode)

def persist_bootstrap_network_observation(a, obs, system_id):
    p=a['proposal'];root=Path(p['workspaceDirectory']);trusted(root)
    need(stat.S_IMODE(root.lstat().st_mode)==0o711,'NETWORK_OBSERVATION_PARENT_MODE')
    need(obs['systemIdentifier']==system_id and type(obs['databaseOid']) is str and re.fullmatch('[1-9][0-9]*',obs['databaseOid']) and obs['serverVersionNum']=='170011' and type(obs['postmasterStart']) is str and bool(obs['postmasterStart']),'POST_BOOTSTRAP_PHYSICAL_IDENTITY')
    need(obs['address']==p['host']=='127.0.0.1' and obs['port']==p['port'] and type(obs['port']) is int and obs['actor']==p['admin'] and obs['listenAddresses']=='127.0.0.1' and obs['unixSocketDirectories']=='' and obs['dataDirectory']==str(root/'data') and obs['hbaFile']==str(root/'data/pg_hba.conf'),'POST_BOOTSTRAP_NETWORK_IDENTITY')
    proof={'format':'FRESH35_SYNTHETIC_BOOTSTRAP_NETWORK_OBSERVATION_V1',**{k:obs[k] for k in ['systemIdentifier','databaseOid','serverVersionNum','postmasterStart']},'host':obs['address'],'port':obs['port'],'listenAddresses':obs['listenAddresses'],'unixSocketDirectories':obs['unixSocketDirectories'],'adminActor':obs['actor'],'startsAt':a['startsAt'],'expiresAt':a['expiresAt'],'sourceSetSha256':a['sourceSetSha256']}
    path=root/'bootstrap-network-observation.json';json_new(path,proof,mode=0o444);trusted(path)
    info=path.lstat();need(stat.S_ISREG(info.st_mode) and info.st_nlink==1 and stat.S_IMODE(info.st_mode)==0o444,'NETWORK_OBSERVATION_FILE_METADATA')
    return proof

def clean_env(root, role=None):
    out = {'PATH':'/usr/bin:/bin','LC_ALL':'C','HOME':str(root),'TZ':'UTC'}
    if role:
        out.update(PGPASSFILE=str(root/'credentials'/(role+'.pgpass')),PGCONNECT_TIMEOUT='5',PGOPTIONS='-c search_path=pg_catalog -c lock_timeout=5000 -c statement_timeout=15000 -c TimeZone=UTC')
    return out

def load_linux_runtime_dependencies(root):
    # A real load of the locked Linux artifacts, with no application/PG startup.
    # createRequire is anchored at the protected package, never the eval cwd.
    script=("import {createRequire} from 'node:module';const require=createRequire('"+(DEPLOY/'package.json').as_uri()+"');"
            "if(process.platform!=='linux'||process.arch!=='x64')throw Error('LINUX_X64_RUNTIME_REQUIRED');"
            "const fastify=require('fastify'),pg=require('pg'),sharp=require('sharp');"
            "const versions={fastify:require('fastify/package.json').version,pg:require('pg/package.json').version,sharp:sharp.versions?.sharp};"
            "if(versions.fastify!=='5.12.5'||versions.pg!=='8.23.1'||versions.sharp!=='0.35.5'||typeof fastify!=='function'||typeof pg.Client!=='function'||typeof sharp!=='function'||typeof sharp.versions?.vips!=='string')throw Error('LOCKED_RUNTIME_LOAD_FAILED');"
            "process.stdout.write(JSON.stringify({platform:process.platform,arch:process.arch,...versions,libvips:sharp.versions.vips})+'\\n');")
    r=subprocess.run([str(NODE),'--no-global-search-paths','--input-type=module','--eval',script],capture_output=True,env=clean_env(root),timeout=20)
    need(r.returncode==0 and len(r.stdout)<=4096,'LINUX_RUNTIME_DEPENDENCY_LOAD_FAILED')
    result=strict_json(r.stdout);exact_keys(result,['platform','arch','fastify','pg','sharp','libvips'])
    need(all(result[k]==v for k,v in [('platform','linux'),('arch','x64'),('fastify','5.12.5'),('pg','8.23.1'),('sharp','0.35.5')]) and type(result['libvips']) is str and re.fullmatch('[0-9][A-Za-z0-9.+-]{0,63}',result['libvips']),'LINUX_RUNTIME_DEPENDENCY_LOAD_DIFFERS')
    return result

def create_synthetic_application_credential(root, watch, seconds):
    # Independent application credential, never a DB role password. Only the
    # retained Node codec consumes its plaintext via stdin; neither argv, env,
    # receipts nor public fixture requests receive password/hash material.
    import secrets
    password=secrets.token_urlsafe(32)
    script=("import {readFileSync} from 'node:fs';"
            "import {createNodeScryptPasswords,isNodeScryptPasswordHash,NODE_SCRYPT_DUMMY_HASH} from '"+
            (DEPLOY/'packages/authentication/src/passwords.ts').as_uri()+"';"
            "const password=readFileSync(0,'utf8'),codec=createNodeScryptPasswords();"
            "const encoded=await codec.hash(password);"
            "if(!isNodeScryptPasswordHash(encoded)||encoded===NODE_SCRYPT_DUMMY_HASH||!await codec.verify(password,encoded))throw Error('PRIVATE_CREDENTIAL_GENERATION_FAILED');"
            "process.stdout.write(encoded+'\\n');")
    need(seconds>0 and watch.poll() is None,'APPLICATION_CREDENTIAL_WINDOW_OR_GUARDIAN')
    r=subprocess.run([str(NODE),'--no-global-search-paths','--input-type=module','--eval',script],input=password.encode(),capture_output=True,env=clean_env(root),timeout=min(20,seconds))
    need(r.returncode==0 and len(r.stdout)<512 and re.fullmatch(rb'naijue:scrypt:1:32768:8:1:[0-9a-f]{32}:[0-9a-f]{128}\n',r.stdout) is not None,'APPLICATION_CREDENTIAL_GENERATION_FAILED')
    need(watch.poll() is None,'GUARDIAN_LOST_BEFORE_APPLICATION_CREDENTIAL_WRITE')
    write_new(root/'credentials'/APPLICATION_SCRYPT_NAME,r.stdout,0o600)
    return password

def write_ordinary_scenario(a, root, scenario, watch):
    # Supplied only after actual PUBLISH/ref/balance readback. This bounded
    # writer does not create accounts, proposals, inventory facts or keys.
    need(type(scenario) is dict and scenario.get('syntheticOnly') is True,'ORDINARY_ACTUAL_SCENARIO_REQUIRED')
    exact_keys(scenario,['syntheticOnly','login','salesPositive','salesMixed','transfer','initialInventory','keys','forbidden'])
    login=scenario['login'];forbidden=scenario['forbidden']
    need(type(login) is dict and type(forbidden) is dict,'ORDINARY_PRIVATE_LOGIN_REQUIRED')
    exact_keys(login,['accountId','loginName','password'])
    exact_keys(forbidden,['staffId','loginName','password','setupRequestKey','sales','requestKey'])
    for values in [login,forbidden]:
        need(type(values.get('loginName')) is str and values['loginName'] and type(values.get('password')) is str and 0<len(values['password'].encode())<=1024,'ORDINARY_PRIVATE_LOGIN_REQUIRED')
    data=(json.dumps(scenario,sort_keys=True)+'\n').encode()
    need(0<len(data)<=262144,'ORDINARY_PRIVATE_SCENARIO_BOUND')
    need(watch.poll() is None,'GUARDIAN_LOST_BEFORE_ORDINARY_SCENARIO_WRITE')
    need(type(a['postgresUid']) is int and a['postgresUid']>0 and type(a['postgresGid']) is int and a['postgresGid']>0,'ORDINARY_NONROOT_SCENARIO_OWNER')
    private=root/'ordinary-private';private.mkdir(mode=0o700)
    os.chown(private,a['postgresUid'],a['postgresGid'],follow_symlinks=False)
    path=private/ORDINARY_SCENARIO_NAME
    write_new(path,data,0o600,owner=(a['postgresUid'],a['postgresGid']))
    import secrets
    write_new(private/ORDINARY_CREDENTIAL_KEY_NAME,secrets.token_bytes(32),0o600,owner=(a['postgresUid'],a['postgresGid']))
    return path

def build_ordinary_scenario(scene,application_password):
    # IDs, enablement, relations, price and stock come from the finite actual
    # readback. Only NEW synthetic business proposals/password/keys are chosen.
    r=scene['references'];pub=scene['publication']
    staff=r['STAFF'][0];product=r['PRODUCT'][0];sku=r['SKU'][0];barcode=r['SKU_BARCODE'][0];customer=r['CUSTOMER'][0];account=r['PAYMENT_ACCOUNT'][0];method=r['PAYMENT_METHOD'][0]
    need(staff.get('role')=='SALESPERSON' and staff.get('employmentStatus')=='在职','ORDINARY_ACTIVE_SALESPERSON_REQUIRED')
    for kind in ['HALL','WAREHOUSE','CUSTOMER','PRODUCT','SKU','SKU_BARCODE','PAYMENT_ACCOUNT','PAYMENT_METHOD']:
        need(all(v.get('enabled') is True for v in r[kind]),'ORDINARY_ENABLED_REFERENCES_REQUIRED')
    halls=[h for h in r['HALL'] if h['id']==staff.get('hallId')];need(len(halls)==1,'ORDINARY_STAFF_HALL_REQUIRED');hall=halls[0]
    warehouses=[w for w in r['WAREHOUSE'] if w.get('hallId')==hall['id']];need(len(warehouses)==1,'ORDINARY_STAFF_WAREHOUSE_REQUIRED');warehouse=warehouses[0]
    other=[w for w in r['WAREHOUSE'] if w['id']!=warehouse['id'] and w.get('hallId')!=hall['id'] and any(h['id']==w.get('hallId') for h in r['HALL'])];need(len(other)==1,'ORDINARY_SECOND_HALL_WAREHOUSE_REQUIRED');other=other[0]
    need(hall.get('defaultCustomerId')==customer['id'] and hall.get('defaultWarehouseId')==warehouse['id'] and sku.get('productId')==product['id'] and product.get('deletedAt') is None and barcode.get('skuId')==sku['id'] and barcode.get('kind')=='MAIN' and account.get('methodId')==method['id'],'ORDINARY_ACTUAL_REFERENCE_RELATION_DIFFERS')
    price=product.get('retailPrice');minimum=product.get('minimumPrice');money=r'(?:0|[1-9][0-9]*)\.[0-9]{2}'
    need(type(price) is str and re.fullmatch(money,price) and type(minimum) is str and re.fullmatch(money,minimum),'ORDINARY_ACTUAL_PRICE_REQUIRED')
    cents=lambda value:int(value.replace('.',''))
    need(cents(price)>0 and cents(price)>=cents(minimum),'ORDINARY_PRICE_OR_MINIMUM_DIFFERS')
    need(type(application_password) is str and application_password,'ORDINARY_APPLICATION_PASSWORD_REQUIRED')
    date=datetime.now(timezone.utc).date().isoformat()
    line={'skuId':sku['id'],'existingLineId':None,'quantity':'1','dealPrice':price,'pricingRule':'UNIT_PRICE','discountTenths':None,'isGift':False,'zeroConfirmed':False}
    sale={'salesId':None,'businessType':'SALE','businessDate':date,'note':None,'hallId':hall['id'],'customerId':customer['id'],'salespersonId':staff['id'],'warehouseId':warehouse['id'],'orderDiscount':'0.00','lines':[dict(line)],'settlements':[{'existingSettlementId':None,'paymentAccountId':account['id'],'paymentMethodId':method['id'],'direction':'RECEIVE','amount':price}]}
    mixed={**sale,'lines':[{**line,'quantity':'2'},{**line,'quantity':'-1'}]}
    transfer={'transferId':None,'businessDate':date,'note':None,'fromWarehouseId':warehouse['id'],'toWarehouseId':other['id'],'lines':[{'skuId':sku['id'],'existingLineId':None,'quantity':'1'}]}
    import secrets
    prefix='fresh35-ordinary:'+secrets.token_hex(12);password=secrets.token_urlsafe(32)
    need(password!=application_password,'ORDINARY_INDEPENDENT_PASSWORD_REQUIRED')
    keys={family:{action:prefix+':'+family+':'+action for action in ['save','approve','unapprove','reopen','reapprove','rollback','unknownCommit']} for family in ['salesPositive','salesMixed','transfer']}
    forbidden={**sale,'hallId':other['hallId'],'warehouseId':other['id']}
    return {'syntheticOnly':True,'login':{'accountId':pub['accountId'],'loginName':pub['loginName'],'password':application_password},'salesPositive':sale,'salesMixed':mixed,'transfer':transfer,'initialInventory':[{k:b[k] for k in ['warehouseId','skuId','quantity','version']} for b in scene['balances']],'keys':keys,'forbidden':{'staffId':staff['id'],'loginName':'synthetic-fresh35-salesperson','password':password,'setupRequestKey':prefix+':staff:setup','sales':forbidden,'requestKey':prefix+':staff:deny'}}

def read_ordinary_configuration(a):
    # The release owner fills build only in this manifest-bound, nonsecret
    # issuance copy. A null source template must never reach target creation.
    trusted(ORDINARY_CONFIGURATION);fd=os.open(ORDINARY_CONFIGURATION,os.O_RDONLY|os.O_NOFOLLOW)
    try:
        before=os.fstat(fd);need(stat.S_ISREG(before.st_mode) and before.st_uid==0 and before.st_nlink==1 and not before.st_mode&0o022 and 0<before.st_size<=65536,'ORDINARY_CONFIGURATION_BOUND')
        raw=os.read(fd,65537);after=os.fstat(fd)
        need(len(raw)==before.st_size and (before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns,before.st_ctime_ns)==(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns,after.st_ctime_ns),'ORDINARY_CONFIGURATION_CHANGED')
    finally:os.close(fd)
    config=strict_json(raw);p=a['proposal']
    need(type(config) is dict and type(config.get('build')) is dict and type(config['build'].get('sourceCommit')) is str and re.fullmatch('[a-f0-9]{40}',config['build']['sourceCommit']) and type(config['build'].get('buildId')) is str and 0<len(config['build']['buildId'])<=100,'ORDINARY_ISSUANCE_BUILD_NOT_FIXED')
    t=config.get('postgres',{}).get('target',{})
    need(set(t)=={'host','port','database','user','password','ssl'} and t.get('password') is None and t.get('ssl') is False and all(t.get(k)==v for k,v in [('host',p['host']),('port',p['port']),('database',p['database']),('user',p['runtime'])]),'ORDINARY_TEMPLATE_TARGET_OR_SECRET_DIFFERS')
    need(config.get('publicOrigin')=='https://1n5635n614.goho.co' and config.get('profile')=='source-confirmed-native-exact35-v1' and config.get('documentCommands')=='NATIVE_RUNTIME' and config.get('staffMaintenance') is True and config.get('productMedia')=={'root':str(Path(p['workspaceDirectory'])/'media'),'rootKey':'fresh35-synthetic-r1'} and config.get('staffCredentialRequestKeyFile')==str(Path(p['workspaceDirectory'])/'ordinary-private'/ORDINARY_CREDENTIAL_KEY_NAME),'ORDINARY_TEMPLATE_FIXED_SCOPE_DIFFERS')
    need(config.get('assets')=={'root':str(DEPLOY/'web'),'entry':'index.html'} and (DEPLOY/'web/index.html').is_file(),'ORDINARY_EXACT_WEB_ARTIFACT_REQUIRED')
    return config

def hydrate_ordinary_configuration(a,configuration):
    p=a['proposal'];raw=read_private(Path(p['workspaceDirectory'])/'credentials'/(p['runtime']+'.pgpass'))
    prefix=f"127.0.0.1:{p['port']}:*:{p['runtime']}:".encode()
    need(raw.startswith(prefix) and re.fullmatch(rb'[a-f0-9]{64}\n',raw[len(prefix):]),'ORDINARY_EXACT_RUNTIME_PASSFILE_REQUIRED')
    config=strict_json(json.dumps(configuration));config['postgres']['target']['password']=raw[len(prefix):-1].decode()
    return config

def ordinary_child_process(proc):
    # This is the actual owned Node child, never the Python controller/PID 1.
    need(proc.poll() is None and proc.pid!=os.getpid(),'ORDINARY_NODE_CHILD_NOT_LIVE')
    identity=process_identity(proc.pid)
    fields=(Path('/proc')/str(proc.pid)/'stat').read_text().rsplit(')',1)[1].split()
    boot=Path('/proc/sys/kernel/random/boot_id').read_text().strip()
    need(identity['exe']==str(NODE) and fields[0] not in ['Z','X'] and fields[1]==str(os.getpid()) and fields[19]==identity['starttime'] and re.fullmatch('[a-f0-9-]{36}',boot),'ORDINARY_NODE_CHILD_IDENTITY_DIFFERS')
    return {'pid':proc.pid,'linuxStartTicks':identity['starttime'],'linuxBootId':boot}

ORDINARY_FAILURE_PHASES = ('PRIVATE_INPUT','REAL_CAPACITY','REAL_SYNTHETIC_ADMISSION','REAL_CAPACITY_PREFLIGHT','REAL_ADMIN_ACCOUNT_SETUP','AUTHENTICATED_SCOPE_DENIAL')+tuple('REAL_ADMIN_ACCOUNT_SETUP:'+step for step in ('STAFF_DETAIL','ABSENT_RECEIPT','CREATE','RESET_PASSWORD','ACCOUNT_DETAIL','RECEIPT_READBACK','REPLAY','ACCOUNT_READBACK','STAFF_LINK','LOGIN','SESSION'))+tuple(name+':'+step for name in ('salesPositive','salesMixed','transfer') for step in ('PREPARE','SAVE','APPROVE','UNAPPROVE','REOPEN','REAL_ROLLBACK','LOST_COMMIT_ACK','DETAIL'))
ORDINARY_ENTRY_PHASES = ('UID_CHECK','PRIVATE_CONTEXT','PRIVATE_PATHS','CAPACITY_BINDING','CREDENTIAL_TAG_IMPORT','CREDENTIAL_TAG_READ','INTEGRATION_IMPORT','INTEGRATION_CALL')
ORDINARY_ERROR_TYPES = ('Error','AssertionError','TypeError','RangeError','SyntaxError')
ORDINARY_GUARD_CODES = ('ERR_ASSERTION','ERR_INVALID_ARG_TYPE','ERR_INVALID_ARG_VALUE','ERR_OUT_OF_RANGE','ERR_MODULE_NOT_FOUND','ERR_UNKNOWN_FILE_EXTENSION','ERR_ACCESS_DENIED')
ORDINARY_SQLSTATES = ('42601','42702','42501','42P01','42703','42883','23502','23503','23505','23514','22012','22P02','40001','40P01','57014','55P03','55000','P0001','28P01','3D000','53300','57P01','08006')
ORDINARY_ERRNOS = ('EACCES','EPERM','ENOENT','ELOOP','ENOTDIR','ECONNREFUSED','ECONNRESET','ETIMEDOUT','EPIPE','EHOSTUNREACH','ENETUNREACH','EADDRINUSE')
ORDINARY_EXPECTED_INTEGERS = (0,1,2,3,4,5,6,14,23,200,403,404,500,61035)

def ordinary_failure_diagnostic(value):
    # Decode only the fixed child's closed error wire; never retain its text.
    nullable=lambda v,allowed:v is None or (type(v) is str and v in allowed)
    if type(value) is not dict or set(value)!={'state','automaticRetry','diagnostic','entryFailure'}:return None
    if value['state']!='FRESH35_ORDINARY_FAILED_OR_OUTCOME_UNKNOWN' or value['automaticRetry'] is not False:return None
    d=value['diagnostic'];entry=value['entryFailure']
    if d is not None:
        if entry is not None or type(d) is not dict or set(d)!={'format','phase','source','errorType','guardCode','sqlstate','errno','expectedInteger','actualInteger'}:return None
        if d['format']!='FRESH35_ORDINARY_FAILURE_V1' or d['source'] not in ('runFresh35OrdinaryIntegration:catch','runFresh35OrdinaryIntegration:cleanup'):return None
        if not all(nullable(d[k],allowed) for k,allowed in [('phase',ORDINARY_FAILURE_PHASES),('errorType',ORDINARY_ERROR_TYPES),('guardCode',ORDINARY_GUARD_CODES),('sqlstate',ORDINARY_SQLSTATES),('errno',ORDINARY_ERRNOS)]):return None
        expected=d['expectedInteger'];actual=d['actualInteger']
        if not (expected is None and actual is None) and not (d['errorType']=='AssertionError' and type(expected) is int and expected in ORDINARY_EXPECTED_INTEGERS and type(actual) is int and 0<=actual<=65535):return None
        return {'childFailure':dict(d)}
    if entry is not None:
        if type(entry) is not dict or set(entry)!={'format','phase','source','errorType','guardCode','errno'}:return None
        if entry['format']!='FRESH35_ORDINARY_ENTRY_FAILURE_V1' or entry['source']!='ordinary_runner_arguments:catch' or not (type(entry['phase']) is str and entry['phase'] in ORDINARY_ENTRY_PHASES):return None
        if not all(nullable(entry[k],allowed) for k,allowed in [('errorType',ORDINARY_ERROR_TYPES),('guardCode',ORDINARY_GUARD_CODES),('errno',ORDINARY_ERRNOS)]):return None
        return {'entryFailure':dict(entry)}
    return None

def ordinary_runner_arguments(a, root):
    # Fixed dormant call seam. No CLI runner/path/callback and no alternate
    # capacity admission. A complete original private context must be supplied
    # on stdin after the real child and reviewed collector/profile are bound.
    runner=(DEPLOY/'tests/integration/live-ledger-balance-pairs.integration.test.ts').as_uri()
    script=("import {readFileSync} from 'node:fs';import {isNativeError} from 'node:util/types';import {AssertionError} from 'node:assert';"
            "let readFailure=null,phase='UID_CHECK';try{if(process.getuid?.()!=="+str(a['postgresUid'])+"||process.geteuid?.()!=="+str(a['postgresUid'])+"||process.getgid?.()!=="+str(a['postgresGid'])+")throw Error('ORDINARY_OS_UID_REQUIRED');"
            "phase='PRIVATE_CONTEXT';const c=JSON.parse(readFileSync(0,'utf8'));"
            "if(!c||Object.keys(c).sort().join(',')!=='capacityLaunch,configuration,privateScenarioFile,publication,staffCredentialRequestTag'||c.staffCredentialRequestTag!==null||c.configuration?.staffMaintenance!==true)throw Error('PRIVATE_CONTEXT_UNAVAILABLE');"
            "phase='PRIVATE_PATHS';if(c.privateScenarioFile!=="+json.dumps(str(root/'ordinary-private'/ORDINARY_SCENARIO_NAME))+")throw Error('FIXED_PRIVATE_SCENARIO_REQUIRED');"
            "if(c.configuration.staffCredentialRequestKeyFile!=="+json.dumps(str(root/'ordinary-private'/ORDINARY_CREDENTIAL_KEY_NAME))+")throw Error('FIXED_CREDENTIAL_REQUEST_KEY_REQUIRED');"
            "phase='CAPACITY_BINDING';const stat=readFileSync('/proc/self/stat','utf8'),ticks=stat.slice(stat.lastIndexOf(')')+2).split(/\\s+/)[19],boot=readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim(),p=c.capacityLaunch?.process;"
            "if(!p||p.pid!==process.pid||p.linuxStartTicks!==ticks||p.linuxBootId!==boot||c.capacityLaunch?.window?.binding?.processInstanceId!==`${boot}:${process.pid}:${ticks}`)throw Error('REAL_CHILD_CAPACITY_BINDING_REQUIRED');"
            "phase='CREDENTIAL_TAG_IMPORT';const {readProductionStaffCredentialRequestTag}=await import('"+(DEPLOY/'apps/api/src/production-main.ts').as_uri()+"');"
            "phase='CREDENTIAL_TAG_READ';const tag=await readProductionStaffCredentialRequestTag(c.configuration);if(typeof tag!=='function')throw Error('REAL_CREDENTIAL_REQUEST_TAG_REQUIRED');"
            "phase='INTEGRATION_IMPORT';const {runFresh35OrdinaryIntegration,describeFresh35OrdinaryFailure}=await import('"+runner+"');readFailure=describeFresh35OrdinaryFailure;"
            "phase='INTEGRATION_CALL';await runFresh35OrdinaryIntegration({...c,staffCredentialRequestTag:tag});"
            "process.stdout.write(JSON.stringify({state:'FRESH35_ORDINARY_RUNNER_COMPLETED',connectionCleanup:'CLOSED',browserVerified:false,networkVerified:false,productionVerified:false})+'\\n');"
            "}catch(error){const diagnostic=typeof readFailure==='function'?readFailure(error):null,native=isNativeError(error);"
            "const own=k=>{try{const d=Object.getOwnPropertyDescriptor(error,k);return d&&'value'in d?d.value:undefined;}catch{return undefined;}};"
            "const code=native?own('code'):undefined,pick=(allowed,v)=>typeof v==='string'&&allowed.includes(v)?v:null;"
            "const errorType=!native?null:error instanceof AssertionError?'AssertionError':error instanceof TypeError?'TypeError':error instanceof RangeError?'RangeError':error instanceof SyntaxError?'SyntaxError':'Error';"
            "const entryFailure=diagnostic===null?{format:'FRESH35_ORDINARY_ENTRY_FAILURE_V1',phase,source:'ordinary_runner_arguments:catch',errorType,guardCode:pick("+json.dumps(ORDINARY_GUARD_CODES)+",code),errno:pick("+json.dumps(ORDINARY_ERRNOS)+",code)??(native?pick("+json.dumps(ORDINARY_ERRNOS)+",own('errno')):null)}:null;"
            "process.stdout.write(JSON.stringify({state:'FRESH35_ORDINARY_FAILED_OR_OUTCOME_UNKNOWN',automaticRetry:false,diagnostic,entryFailure})+'\\n');process.exitCode=1;}")
    return [str(NODE),'--no-global-search-paths','--input-type=module','--eval',script]

def ordinary_runner_launch(a,root):
    return {'args':ordinary_runner_arguments(a,root),'stdin':subprocess.PIPE,'stdout':subprocess.PIPE,'stderr':subprocess.PIPE,'env':{**clean_env(root),'TMPDIR':str(root/'ordinary-system')},'user':a['postgresUid'],'group':a['postgresGid'],'extra_groups':[],'start_new_session':True,'cwd':str(root)}

def prepare_ordinary_directories(a,root):
    for name in ['ordinary-backup','media','ordinary-system']:
        path=root/name;path.mkdir(mode=0o700)
        os.chown(path,a['postgresUid'],a['postgresGid'],follow_symlinks=False)

def collect_ordinary_capacity_facts(a,root,child,seconds):
    identity=ordinary_child_process(child)
    paths={'postgres':str(root/'data'),'wal':str(root/'data/pg_wal'),'backup':str(root/'ordinary-backup'),'system':str(root/'ordinary-system'),'media':str(root/'media')}
    script=("import {readFileSync,readlinkSync,realpathSync,statSync,statfsSync} from 'node:fs';import {tmpdir} from 'node:os';"
            "const i=JSON.parse(readFileSync(0,'utf8'));if(tmpdir()!==i.paths.system)throw Error('ACTUAL_TMP_DIRECTORY_REQUIRED');"
            "const ns='linux:'+readlinkSync('/proc/self/ns/mnt');if(ns!=='linux:'+readlinkSync('/proc/'+i.process.pid+'/ns/mnt'))throw Error('CHILD_NAMESPACE_DIFFERS');"
            "const stat=readFileSync('/proc/'+i.process.pid+'/stat','utf8'),ticks=stat.slice(stat.lastIndexOf(')')+2).split(/\\s+/)[19],boot=readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim();"
            "if(ticks!==i.process.linuxStartTicks||boot!==i.process.linuxBootId)throw Error('CHILD_PROCESS_CHANGED');"
            "const volumes={};for(const k of ['postgres','wal','backup','system','media']){const path=realpathSync(i.paths[k]);if((k!=='wal'&&path!==i.paths[k])||!path.startsWith(i.root+'/'))throw Error('CURRENT_SCOPE_CANONICAL_PATH_REQUIRED');"
            "const s=statSync(path,{bigint:true}),f=statfsSync(path,{bigint:true});if(!s.isDirectory())throw Error('DIRECTORY_REQUIRED');volumes[k]={path,namespace:ns,device:String(s.dev),filesystemType:String(f.type)};}"
            "process.stdout.write(JSON.stringify({namespace:ns,process:i.process,volumes})+'\\n');")
    need(seconds>0,'ORDINARY_CAPACITY_WINDOW_EXPIRED')
    r=subprocess.run([str(NODE),'--no-global-search-paths','--input-type=module','--eval',script],input=json.dumps({'root':str(root),'paths':paths,'process':identity}).encode(),capture_output=True,env={**clean_env(root),'TMPDIR':paths['system']},timeout=min(15,seconds))
    need(r.returncode==0 and len(r.stdout)<=65536,'ORDINARY_CAPACITY_FACTS_FAILED')
    facts=strict_json(r.stdout);exact_keys(facts,['namespace','process','volumes'])
    need(facts['process']==identity==ordinary_child_process(child) and type(facts['namespace']) is str and facts['namespace'].startswith('linux:mnt:['),'ORDINARY_CAPACITY_PROCESS_OR_NAMESPACE_DIFFERS')
    exact_keys(facts['volumes'],list(paths))
    for key,value in facts['volumes'].items():
        exact_keys(value,['path','namespace','device','filesystemType'])
        need(value['namespace']==facts['namespace'] and type(value['path']) is str and str(Path(value['path']))==value['path'] and value['path'].startswith(str(root)+'/') and (key=='wal' or value['path']==paths[key]) and all(type(value[k]) is str and re.fullmatch('[0-9]+',value[k]) for k in ['device','filesystemType']),'ORDINARY_CAPACITY_VOLUME_DIFFERS')
    return facts

def prepare_ordinary_capacity(a,target,descriptor,root,child,facts,scene,configuration):
    # C explicitly selected this original schema/budget template. Facts and
    # process identity are measured; no availableBytes is cached or supplied.
    need(type(configuration) is dict and type(configuration.get('build')) is dict and re.fullmatch('[0-9a-f]{40}',configuration['build'].get('sourceCommit','')),'ORDINARY_RUNTIME_CONFIGURATION_NOT_FIXED')
    need(configuration.get('postgres',{}).get('max')==1 and configuration.get('productMedia',{}).get('root')==str(root/'media') and 'inventoryOutputSpool' not in configuration,'ORDINARY_RUNTIME_TOPOLOGY_OR_MEDIA_DIFFERS')
    process=ordinary_child_process(child);need(facts['process']==process,'ORDINARY_CAPACITY_CHILD_CHANGED')
    p=a['proposal'];t={'host':p['host'],'port':p['port'],'database':p['database'],'role':p['runtime'],'databaseOid':target['physical']['databaseOid'],'postmasterStart':target['physical']['postmasterStart']}
    configured=configuration.get('postgres',{}).get('target',{})
    need(all(configured.get(k)==v for k,v in [('host',t['host']),('port',t['port']),('database',t['database']),('user',t['role'])]),'ORDINARY_RUNTIME_TARGET_DIFFERS')
    encode=lambda value:json.dumps(value,sort_keys=True,separators=(',',':')).encode()
    fingerprint=lambda value:hashlib.sha256(encode(value)).hexdigest()
    volumes={}
    for key,value in facts['volumes'].items():
        volumes[key]={**value,'physicalVolume':value['namespace']+':'+value['device']+':'+value['filesystemType']}
    binding={'candidateFingerprint':configuration['build']['sourceCommit'],'targetFingerprint':fingerprint({'target':t,'physical':target['physical']}),'writerTopologyFingerprint':fingerprint({'poolMax':1,'observerMax':1,'adminCleanupReserved':1,'runtimeRole':p['runtime'],'sourceSetSha256':descriptor['sourceSetSha256']}),'inventoryFingerprint':fingerprint({'publication':scene['publication'],'balances':scene['balances']}),'processInstanceId':process['linuxBootId']+':'+str(process['pid'])+':'+process['linuxStartTicks'],'restartGeneration':0,'writerCount':1,'physicalVolumes':{k:v['physicalVolume'] for k,v in volumes.items()}}
    starts=int(time.time()*1000);observed=scene['observedAtMillis'];expires=a['expiresAt']
    need(a['startsAt']<=observed<=starts<expires-60000,'ORDINARY_ORIGINAL_WINDOW_OR_OBSERVATION_EXPIRED')
    # Nonsecret per-child window identity, bound to the existing external scope;
    # this is not a newly issued action/native/install authorization.
    token=fingerprint({'externalAuthorization':a['authorizationReference'],'startsAt':a['startsAt'],'expiresAt':expires,'process':process,'target':t})
    profile={'schemaVersion':1,'profile':'OWNER_FIXED_STATFS_V1','reviewSha256':CAPACITY_REVIEW_SHA,'target':t,'binding':binding,'windowToken':token,'startsAt':starts,'expiresAt':expires,'maxAgeMillis':15000,'namespace':facts['namespace'],'volumes':volumes}
    data=encode(profile)+b'\n';need(len(data)<=65536,'ORDINARY_CAPACITY_PROFILE_BOUND')
    path=PARENT/'capacity/owner-profile.json';trusted(path)
    fd=os.open(path,os.O_WRONLY|os.O_NOFOLLOW)
    try:
        info=os.fstat(fd);alias=CAPACITY_PROFILE.stat()
        need(stat.S_ISREG(info.st_mode) and info.st_uid==0 and info.st_nlink==1 and stat.S_IMODE(info.st_mode)==0o644 and info.st_size==0 and (info.st_dev,info.st_ino)==(alias.st_dev,alias.st_ino) and os.statvfs(CAPACITY_PROFILE).f_flag&os.ST_RDONLY,'ORDINARY_FIXED_EMPTY_PROFILE_ALIAS_REQUIRED')
        with os.fdopen(fd,'wb',closefd=False) as file:file.write(data);file.flush();os.fsync(fd)
    finally:os.close(fd)
    worst={k:'1048576' if k in ['postgres','wal'] else '65536' for k in volumes}
    return {'schemaVersion':1,'profile':'OWNER_REVIEWED_CAPACITY_EXEC_V1','target':t,'window':{'approved':True,'token':token,'inventoryObservedAt':observed,'startsAt':starts,'expiresAt':expires,'binding':binding},'process':process,'budgets':{'session':{'maxAdmissions':64,'maxInFlight':1,'worstCaseBytes':dict(worst)},'upload':{'maxAdmissions':1,'maxInFlight':1,'worstCaseBytes':dict(worst)}},'minimumFreeBytes':{k:'67108864' for k in volumes},'safetyBytes':{k:'8388608' for k in volumes},'probeTtlMillis':30000,'probeTimeoutMillis':20000,'maxProbeWaiters':1,'retryAfterSeconds':1,'producer':{'executable':str(DEPLOY/'scripts/ops/capacity-live-statfs.mjs'),'sha256':CAPACITY_COLLECTOR_SHA,'args':['--profile='+hashlib.sha256(data).hexdigest()],'timeoutMillis':15000,'maxOutputBytes':65536,'reviewSha256':CAPACITY_REVIEW_SHA,'volumes':{k:{n:v[n] for n in ['path','physicalVolume','namespace']} for k,v in volumes.items()}}}

def run_ordinary_business(a,target,descriptor,root,scene,configuration,application_password,watch,deadline):
    child=None;identity=None;phase='PRIVATE_SCENARIO';result=None;reaped=False;child_failure=None
    def remaining():
        need(watch.poll() is None and time.monotonic()<deadline-90,'ORDINARY_ORIGINAL_WINDOW_OR_GUARDIAN_LOST')
        return deadline-time.monotonic()-90
    try:
        remaining();scenario=build_ordinary_scenario(scene,application_password)
        path=write_ordinary_scenario(a,root,scenario,watch);scenario=None
        prepare_ordinary_directories(a,root)
        phase='PRIVATE_CONFIGURATION';configuration=hydrate_ordinary_configuration(a,configuration)
        phase='ORDINARY_CHILD';remaining();child=subprocess.Popen(**ordinary_runner_launch(a,root))
        process=ordinary_child_process(child);identity={'pid':process['pid'],'starttime':process['linuxStartTicks'],'exe':str(NODE)}
        phase='ACTUAL_CAPACITY_FACTS';facts=collect_ordinary_capacity_facts(a,root,child,remaining())
        capacity=prepare_ordinary_capacity(a,target,descriptor,root,child,facts,scene,configuration)
        publication=scene['publication']
        context={'configuration':configuration,'capacityLaunch':capacity,'staffCredentialRequestTag':None,'publication':{'batchId':publication['documentBatchId'],'sourceHash':publication['sourceHash'],'historyPayloadHash':publication['historyPayloadHash'],'planSha256':scene['planSha256']},'privateScenarioFile':str(path)}
        phase='REAL_PG_AND_MIDDLEWARE';wire=json.dumps(context).encode();need(len(wire)<=262144,'ORDINARY_PRIVATE_CONTEXT_BOUND')
        stdout,stderr=child.communicate(input=wire,timeout=remaining());wire=None;context=None;configuration=None
        need(len(stdout)<=4096,'ORDINARY_PUBLIC_RESULT_BOUND')
        returned=strict_json(stdout)
        if child.returncode!=0:child_failure=ordinary_failure_diagnostic(returned)
        need(child.returncode==0 and returned=={'state':'FRESH35_ORDINARY_RUNNER_COMPLETED','connectionCleanup':'CLOSED','browserVerified':False,'networkVerified':False,'productionVerified':False},'ORDINARY_FAILED_OR_OUTCOME_UNKNOWN')
        result={**returned,'sourceSetSha256':descriptor['sourceSetSha256'],'programSha256':descriptor['programSha256'],'targetSha256':descriptor['targetSha256'],'sourceCommit':capacity['window']['binding']['candidateFingerprint'],'capacityProfileSha256':capacity['producer']['args'][0].removeprefix('--profile='),'capacityReviewSha256':CAPACITY_REVIEW_SHA,'childProcess':process,'syntheticOnly':True}
    except Exception as error:
        failure={'state':'FAILED_OR_OUTCOME_UNKNOWN','phase':phase,'code':str(error) if re.fullmatch('FRESH35_[A-Z0-9_]+',str(error)) else type(error).__name__,'automaticRetry':False,'commitOutcome':'CONSULT_ORIGINAL_REQUEST_RECEIPTS_NO_REPLAY','childDiagnosticUnavailable':child_failure is None}
        if child_failure is not None:failure.update(child_failure)
        json_new(root/'ordinary-failure.json',failure)
        raise
    finally:
        if child is not None:
            if child.poll() is None and identity is not None and same_process(identity):
                child.send_signal(signal.SIGTERM)
                try:child.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    if same_process(identity):child.kill();child.wait(timeout=3)
            if child.poll() is not None:child.wait();reaped=True
        else:reaped=True
        json_new(root/'ordinary-child-cleanup.json',{'childReaped':reaped,'pid':child.pid if child else None,'businessOutcomeInferredFromCleanup':False})
        need(reaped,'ORDINARY_NODE_CLEANUP_UNCONFIRMED')
    need(result is not None,'ORDINARY_RESULT_NOT_CONFIRMED')
    return result

def hba_text(p):
    return f"local all all reject\nhost postgres,{p['database']} {p['admin']} 127.0.0.1/32 scram-sha-256\nhost {p['database']} {p['owner']} 127.0.0.1/32 scram-sha-256\nhost {p['database']} {p['controller']} 127.0.0.1/32 scram-sha-256\nhost {p['database']} {p['runtime']} 127.0.0.1/32 scram-sha-256\nhost all all 0.0.0.0/0 reject\nhost all all ::/0 reject\n"

def server_args(p):
    return [str(BIN/'postgres'),'-D',str(Path(p['workspaceDirectory'])/'data'),'-h','127.0.0.1','-p',str(p['port']),'-k','', *sum((['-c',s] for s in ['max_connections=8','shared_buffers=32MB','work_mem=4MB','max_parallel_workers=0','fsync=on','synchronous_commit=on','password_encryption=scram-sha-256','log_statement=none','log_min_error_statement=panic','log_min_duration_statement=-1','log_duration=off','log_connections=off','log_disconnections=off','log_min_messages=warning']), [])]

def bootstrap_sql(a, passwords):
    p = a['proposal']
    expiry = datetime.fromtimestamp(a['expiresAt']/1000,timezone.utc).strftime('%Y-%m-%d %H:%M:%S+00')
    need(set(passwords) == {p[k] for k in ['admin','owner','controller','runtime']} and all(re.fullmatch('[a-f0-9]{64}', v) for v in passwords.values()), 'GENERATED_PASSWORD_SHAPE')
    roles = f"ALTER ROLE {p['admin']} VALID UNTIL '{expiry}';\n"
    for key in ['owner','controller','runtime']:
        r = p[key]
        roles += f"CREATE ROLE {r} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 2 PASSWORD '{passwords[r]}' VALID UNTIL '{expiry}';\n"
    for r in INTERFACES:
        roles += f'CREATE ROLE {r} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 0;\n'
    for r, member in [(INTERFACES[0],p['controller']),(INTERFACES[1],p['controller']),(INTERFACES[2],p['runtime'])]:
        roles += f'GRANT {r} TO {member} WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;\n'
    database = f"CREATE DATABASE {p['database']} OWNER {p['owner']};\n"
    acl = f"REVOKE ALL ON DATABASE {p['database']} FROM PUBLIC; GRANT CONNECT ON DATABASE {p['database']} TO {p['controller']},{p['runtime']};\nGRANT EXECUTE ON FUNCTION pg_catalog.pg_control_system() TO {p['owner']},{p['controller']},{p['runtime']};\n"
    return roles, database, acl

def process_identity(pid):
    root = Path('/proc')/str(pid)
    return {'pid':pid,'starttime':root.joinpath('stat').read_text().rsplit(')',1)[1].split()[19],'exe':os.readlink(root/'exe')}

def same_process(identity):
    try:
        return process_identity(identity['pid']) == identity and identity['exe'] == str(BIN/'postgres')
    except FileNotFoundError:
        return False

def port_absent(port, observation=None):
    if observation is None:
        for name in ['/proc/net/tcp','/proc/net/tcp6']:
            for line in Path(name).read_text().splitlines()[1:]:
                if int(line.split()[1].split(':')[1],16) == port:
                    return False
        return True
    # One cleanup sample in this same namespace; no recheck, retry or relaxation.
    states=tuple(f'{state:02X}' for state in range(1,13))+('UNKNOWN',)
    observation.update({'format':'FRESH35_CLEANUP_PORT_OBSERVATION_V1',
        'stage':'AFTER_OWNED_PG_WAIT_AND_CREDENTIAL_CLEANUP_BEFORE_CONTAINER_STOP',
        'startedAtUTC':datetime.now(timezone.utc).isoformat(),'finishedAtUTC':None,
        'namespace':None,'reading':'netns','readError':None,'complete':False,
        'matchingRows':0,'matchingStates':{table:{state:0 for state in states} for table in ('tcp','tcp6')},'portAbsent':None,'noActiveTcpRows':None})
    try:
        namespace=Path('/proc/self/ns/net').stat()
        if not all(type(value) is int and value>0 for value in (namespace.st_dev,namespace.st_ino)):raise ValueError('NETNS_IDENTITY_UNKNOWN')
        observation['namespace']={'device':namespace.st_dev,'inode':namespace.st_ino}
        for table in ('tcp','tcp6'):
            observation['reading']=table
            lines=Path('/proc/net/'+table).read_text().splitlines()
            header=('sl','local_address','rem_address' if table=='tcp' else 'remote_address','st','tx_queue','rx_queue','tr','tm->when','retrnsmt','uid','timeout','inode')
            if not lines or tuple(lines[0].split()[:len(header)])!=header:raise ValueError('TCP_TABLE_HEADER_INVALID')
            for line in lines[1:]:
                fields=line.split()
                if len(fields)<4 or re.fullmatch('[A-Fa-f0-9]{2}',fields[3]) is None:raise ValueError('TCP_ROW_INVALID')
                local=re.fullmatch(r'[A-Fa-f0-9]{8}:([A-Fa-f0-9]{4})' if table=='tcp' else r'[A-Fa-f0-9]{32}:([A-Fa-f0-9]{4})',fields[1])
                if local is None:raise ValueError('TCP_LOCAL_ENDPOINT_INVALID')
                if int(local.group(1),16)==port:
                    state=fields[3].upper()
                    observation['matchingStates'][table][state if state in states else 'UNKNOWN']+=1
                    observation['matchingRows']+=1
        absent=observation['matchingRows']==0
        # Cleanup-only quiescence: not a claim that the port can be rebound.
        no_active=all(count==0 for counts in observation['matchingStates'].values() for state,count in counts.items() if state!='06')
        observation.update(complete=True,portAbsent=absent,noActiveTcpRows=no_active,reading=None)
        return absent
    except Exception as error:
        observation['readError']=('DENIED' if isinstance(error,PermissionError) else
            'NOT_FOUND' if isinstance(error,FileNotFoundError) else
            'INVALID_DATA' if isinstance(error,(ValueError,IndexError,UnicodeError)) else 'READ_FAILED')
        raise
    finally:
        observation['finishedAtUTC']=datetime.now(timezone.utc).isoformat()

def owned_listener(identity, port):
    if not same_process(identity):
        return False
    try:
        sockets = {os.readlink(p) for p in (Path('/proc')/str(identity['pid'])/'fd').iterdir()}
        return any((f := line.split())[1] == f'0100007F:{port:04X}' and f[3] == '0A' and 'socket:['+f[9]+']' in sockets for line in Path('/proc/net/tcp').read_text().splitlines()[1:])
    except (FileNotFoundError, PermissionError):
        return False

def psql(a, role, database, sql, timeout=20):
    p=a['proposal']; root=Path(p['workspaceDirectory'])
    r = subprocess.run([str(BIN/'psql'),'-X','-qAt','--no-password','--host','127.0.0.1','--port',str(p['port']),'--dbname',database,'--username',role,'--set','ON_ERROR_STOP=1','--set','VERBOSITY=sqlstate'],input=sql.encode(),capture_output=True,env=clean_env(root,role),timeout=timeout)
    # Never persist SQL, stderr or passwords; detailed nonsensitive observations
    # are returned only after a successful fixed query.
    if r.returncode != 0:
        codes = re.findall(rb'(?:ERROR|FATAL):\s+([0-9A-Z]{5})(?:\s|$)', r.stderr)
        need(False, 'PSQL_SQLSTATE_'+codes[-1].decode() if codes else 'PSQL_FAILED')
    return r.stdout.decode()

def bootstrap_exclusive_observer(a, argv, remaining):
    # SQL is generated only by the fixed, source-verified original entry.
    root=Path(a['proposal']['workspaceDirectory'])
    result=subprocess.run(argv+['--bootstrap-observer'],capture_output=True,env=clean_env(root),timeout=remaining())
    need(result.returncode==0,'BOOTSTRAP_OBSERVER_DESCRIPTION_FAILED')
    need(isinstance(result.stdout,bytes) and 0<len(result.stdout)<=262144,'BOOTSTRAP_OBSERVER_SQL_BOUND')
    sql=result.stdout.decode('utf-8')
    p=a['proposal'];psql(a,p['admin'],p['database'],sql,timeout=min(20,remaining()))

def snapshot_sql():
    # One private psql connection, one read-only RR transaction. Only bounded
    # counts/digests and catalog/identity metadata leave it; no table rows.
    sql = r"""BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL row_security=off;
SET LOCAL idle_in_transaction_session_timeout='15s';
SELECT json_build_object('kind','context','actor',current_user,'sessionActor',session_user,
 'database',current_database(),'databaseOid',(SELECT oid::text FROM pg_database WHERE datname=current_database()),
 'systemIdentifier',(SELECT system_identifier::text FROM pg_control_system()),
 'postmasterStart',pg_postmaster_start_time()::text,'serverVersionNum',current_setting('server_version_num'),
 'address',host(inet_server_addr()),'port',inet_server_port(),'dataDirectory',current_setting('data_directory'),
 'readOnly',current_setting('transaction_read_only'),'isolation',current_setting('transaction_isolation'),
 'superuser',(SELECT rolsuper FROM pg_roles WHERE rolname=current_user),
 'bypassRls',(SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user),
 'tables',(SELECT coalesce(json_agg(json_build_object('name',relname,'kind',relkind,
 'selectAllowed',has_table_privilege(oid,'SELECT'),'rlsActive',row_security_active(oid),
 'rlsEnabled',relrowsecurity,'rlsForced',relforcerowsecurity) ORDER BY relname),'[]'::json)
 FROM pg_class WHERE relnamespace='naijue_erp'::regnamespace AND relkind IN ('r','p')),
 'sequences',(SELECT coalesce(json_agg(relname ORDER BY relname),'[]'::json) FROM pg_class
 WHERE relnamespace='naijue_erp'::regnamespace AND relkind='S'))::text;
"""
    for name in SNAPSHOT_TABLES:
        sql += ("SELECT json_build_object('kind','table','name','"+name+"','count',count(*)::text,"
                "'sha256',encode(sha256(convert_to(coalesce(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),''),'UTF8')),'hex'))::text "
                'FROM (SELECT * FROM naijue_erp."'+name+'" LIMIT 10001) t;\n')
    # Names originate only from this schema's actual sequence catalog. format
    # quotes both identifier and JSON label; no external SQL or path parameter.
    sql += r"""SELECT format('SELECT json_build_object(''kind'',''sequence'',''name'',%L,''value'',last_value::text,''called'',is_called)::text FROM naijue_erp.%I;',relname,relname)
FROM pg_class WHERE relnamespace='naijue_erp'::regnamespace AND relkind='S'
 AND relname ~ '^[a-z_][a-z_0-9]*$'
 AND (SELECT count(*) FROM pg_class WHERE relnamespace='naijue_erp'::regnamespace AND relkind='S')<=50
ORDER BY relname
\gexec
ROLLBACK;
"""
    return sql

def validate_snapshot(raw, a, target):
    need(len(raw.encode()) <= 128*1024, 'SNAPSHOT_OUTPUT_BOUND')
    rows=[strict_json(line) for line in raw.splitlines() if line.strip()]
    need(rows and type(rows[0]) is dict and rows[0].get('kind')=='context', 'SNAPSHOT_CONTEXT_REQUIRED')
    c=rows[0];p=a['proposal'];physical=target['physical']
    need(c.get('actor')==p['admin'] and c.get('sessionActor')==p['admin'] and (c.get('superuser') is True or c.get('bypassRls') is True), 'SNAPSHOT_FULL_VISIBILITY_ROLE')
    need(c.get('database')==p['database'] and c.get('address')=='127.0.0.1' and c.get('port')==p['port'] and c.get('dataDirectory')==str(Path(p['workspaceDirectory'])/'data') and all(c.get(k)==physical[k] for k in ['databaseOid','systemIdentifier','serverVersionNum','postmasterStart']), 'SNAPSHOT_PHYSICAL_TARGET_DIFFERS')
    need(c.get('readOnly')=='on' and c.get('isolation')=='repeatable read', 'SNAPSHOT_READONLY_RR_REQUIRED')
    tables=c.get('tables');seqs=c.get('sequences')
    need(type(tables) is list and [t.get('name') for t in tables]==list(SNAPSHOT_TABLES) and all(t.get('kind')=='r' and t.get('selectAllowed') is True and t.get('rlsActive') is False for t in tables), 'SNAPSHOT_EXACT35_OR_RLS_DIFFERS')
    need(type(seqs) is list and len(seqs)<=50 and all(type(n) is str and re.fullmatch('[a-z_][a-z_0-9]*',n) for n in seqs) and seqs==sorted(set(seqs)), 'SNAPSHOT_SEQUENCE_COHORT')
    values={'tables':{},'sequences':{}}
    need(len(rows)==1+35+len(seqs), 'SNAPSHOT_ROW_COHORT')
    for row in rows[1:]:
        need(type(row) is dict, 'SNAPSHOT_ROW')
        if row.get('kind')=='table':
            exact_keys(row,['kind','name','count','sha256']);name=row['name']
            need(name in SNAPSHOT_TABLES and name not in values['tables'] and type(row['count']) is str and re.fullmatch('[0-9]+',row['count']) and int(row['count'])<=10000 and type(row['sha256']) is str and re.fullmatch('[a-f0-9]{64}',row['sha256']), 'SNAPSHOT_TABLE_BOUND_OR_DIGEST')
            values['tables'][name]={k:row[k] for k in ['count','sha256']}
        else:
            exact_keys(row,['kind','name','value','called']);name=row['name']
            need(row['kind']=='sequence' and name in seqs and name not in values['sequences'] and type(row['value']) is str and re.fullmatch('[0-9]+',row['value']) and type(row['called']) is bool, 'SNAPSHOT_SEQUENCE_VALUE')
            values['sequences'][name]={k:row[k] for k in ['value','called']}
    need(set(values['tables'])==set(SNAPSHOT_TABLES) and set(values['sequences'])==set(seqs), 'SNAPSHOT_INCOMPLETE')
    return {'context':c,'snapshot':values,'transaction':'ROLLED_BACK','connectionCleanup':'CLOSED','sqlstate':None}

def observe_snapshot(a, target, seconds):
    need(seconds>0, 'SNAPSHOT_WINDOW_EXPIRED')
    raw=psql(a,a['proposal']['admin'],a['proposal']['database'],snapshot_sql(),min(20,seconds))
    return validate_snapshot(raw,a,target)

def scene_readback_sql(binding):
    for key in ['manifestSha256','planSha256']:
        need(type(binding.get(key)) is str and re.fullmatch('[a-f0-9]{64}',binding[key]),'SCENE_EXACT_BATCH_BINDING_REQUIRED')
    publication=SCENE_PUBLICATION_SQL.replace('$1::text',"'"+binding['manifestSha256']+"'::text").replace('$2::text',"'"+binding['planSha256']+"'::text")
    queries=[('publication',publication)]
    for kind,query in [('references',SCENE_REFERENCES_SQL),('balances',SCENE_BALANCES_SQL)]:
        # Re-derive the exactly-one baseline inside this SAME RR snapshot. A
        # missing/ambiguous publication never becomes first-row/default data.
        selected='WITH scene_published AS (\n'+publication+'\n), '
        query=selected+query[len('WITH '):]
        query=query.replace('$1::uuid','(SELECT "baselineBatchId"::uuid FROM scene_published)')
        queries.append((kind,query))
    sql=snapshot_sql().split("SELECT json_build_object('kind','table'",1)[0]
    for kind,query in queries:
        sql+="SELECT json_build_object('kind','"+kind+"','rows',coalesce(json_agg(q),'[]'::json))::jsonb::text FROM (\n"+query+'\n) q;\n'
    return sql+'ROLLBACK;\n'

def observe_scene(a,target,binding,seconds):
    need(seconds>0,'SCENE_WINDOW_EXPIRED')
    raw=psql(a,a['proposal']['admin'],a['proposal']['database'],scene_readback_sql(binding),min(20,seconds))
    need(len(raw.encode())<=262144,'SCENE_OUTPUT_BOUND')
    rows=[strict_json(line) for line in raw.splitlines() if line.strip()]
    need(len(rows)==4 and [r.get('kind') for r in rows]==['context','publication','references','balances'],'SCENE_ROW_COHORT')
    c=rows[0];p=a['proposal'];physical=target['physical']
    need(c.get('actor')==p['admin'] and c.get('sessionActor')==p['admin'] and (c.get('superuser') is True or c.get('bypassRls') is True),'SCENE_FULL_VISIBILITY_ROLE')
    need(c.get('database')==p['database'] and c.get('address')=='127.0.0.1' and c.get('port')==p['port'] and c.get('dataDirectory')==str(Path(p['workspaceDirectory'])/'data') and all(c.get(k)==physical[k] for k in ['databaseOid','systemIdentifier','serverVersionNum','postmasterStart']),'SCENE_PHYSICAL_TARGET_DIFFERS')
    need(c.get('readOnly')=='on' and c.get('isolation')=='repeatable read' and type(c.get('tables')) is list and [t.get('name') for t in c['tables']]==list(SNAPSHOT_TABLES) and all(t.get('selectAllowed') is True and t.get('rlsActive') is False for t in c['tables']),'SCENE_READONLY_FULL35_REQUIRED')
    publication=rows[1].get('rows');refs=rows[2].get('rows');balances=rows[3].get('rows')
    need(type(publication) is list and len(publication)==1 and type(publication[0]) is dict,'SCENE_EXACT_PUBLICATION_REQUIRED')
    publication=publication[0]
    need(publication.get('sourceHash')==binding['manifestSha256'] and (publication.get('historyPayloadHash') is None or type(publication['historyPayloadHash']) is str and re.fullmatch('[a-f0-9]{64}',publication['historyPayloadHash'])),'SCENE_PUBLICATION_HASH_DIFFERS')
    need(publication.get('loginName')=='synthetic-fresh35-admin' and publication.get('loginEnabled') is True and publication.get('adminRole')=='ADMIN' and publication.get('adminEmployment')=='在职','SCENE_REAL_ADMIN_REQUIRED')
    uuid='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
    for key in ['initializerOperationId','baselineBatchId','documentBatchId','baselinePublicationOperationId','documentPublicationOperationId','accountId','adminStaffId']:
        need(type(publication.get(key)) is str and re.fullmatch(uuid,publication[key]),'SCENE_PUBLICATION_ID_REQUIRED')
    expected={'HALL':2,'WAREHOUSE':2,'CUSTOMER':1,'STAFF':1,'PRODUCT':1,'SKU':1,'SKU_BARCODE':1,'PAYMENT_ACCOUNT':1,'PAYMENT_METHOD':1}
    need(type(refs) is list and len(refs)==sum(expected.values()),'SCENE_REFERENCE_COHORT')
    grouped={kind:[] for kind in expected}
    for ref in refs:
        need(type(ref) is dict and set(ref)=={'kind','value'} and ref['kind'] in grouped and type(ref['value']) is dict,'SCENE_REFERENCE_ROW')
        value=ref['value'];need(type(value.get('id')) is str and re.fullmatch(uuid,value['id']),'SCENE_REFERENCE_ID')
        grouped[ref['kind']].append(value)
    need(all(len(grouped[k])==count and len({r['id'] for r in grouped[k]})==count for k,count in expected.items()),'SCENE_REFERENCE_MISSING_OR_DUPLICATE')
    wh={w['id'] for w in grouped['WAREHOUSE']};sku=grouped['SKU'][0]['id']
    need(type(balances) is list and len(balances)==2 and {(v.get('warehouseId'),v.get('skuId')) for v in balances}=={(w,sku) for w in wh},'SCENE_BALANCE_COHORT')
    for value in balances:
        need(value.get('present') is True and type(value.get('quantity')) is str and re.fullmatch('-?(?:0|[1-9][0-9]*)',value['quantity']) and type(value.get('version')) is int and value['version']>0,'SCENE_MISSING_BALANCE_OR_VERSION')
    # Kept only in private caller memory for scene construction, never a public
    # report or install/host receipt. NULL history payload remains actual NULL.
    return {'publication':publication,'references':grouped,'balances':balances,'planSha256':binding['planSha256'],'observedAtMillis':int(time.time()*1000)}

def validate_stage_binding(result, descriptor, previous=None):
    b=result.get('fixtureBinding');exact_keys(b,['format','sourceSetSha256','installProgramSha256','targetSha256','manifestSha256','planSha256','initializerSha256','stepsSha256'])
    need(b['format']=='FRESH35_SYNTHETIC_RETENTION25_STAGE_BINDING_V1' and all(type(v) is str and re.fullmatch('[a-f0-9]{64}',v) for k,v in b.items() if k!='format'), 'STAGE_BINDING_SHAPE')
    need(b['sourceSetSha256']==descriptor['sourceSetSha256'] and b['installProgramSha256']==descriptor['programSha256'] and b['targetSha256']==descriptor['targetSha256'], 'STAGE_PROGRAM_SOURCE_TARGET_DIFFERS')
    # Same canonicalRequestValue encoding as requestHash, limited to this
    # closed string-only binding, not a second general request implementation.
    canonical='{'+','.join(json.dumps(k)+':s'+json.dumps(b[k]) for k in sorted(b))+'}'
    need(result.get('fixtureBindingSha256')==hashlib.sha256(canonical.encode()).hexdigest(), 'STAGE_BINDING_HASH_DIFFERS')
    if previous is not None:
        need(b==previous['fixtureBinding'] and result['fixtureBindingSha256']==previous['fixtureBindingSha256'], 'STAGE_FIXTURE_CHANGED')
    return result['fixtureBindingSha256']

def verify_synthetic_stages(a, target, descriptor, root, child, observer):
    # Production closures supplied below retain the original guardian/listener
    # and deadline checks. The direct model tests supply no PG or subprocess.
    before=observer();json_new(root/'snapshot-after-install.json',before)
    rollback=child('--verify-host-rollback')
    binding=validate_stage_binding(rollback,descriptor)
    need(rollback.get('state')=='FRESH35_SYNTHETIC_ROLLBACK_VERIFIED' and rollback.get('stage')=='rollback' and rollback.get('rollbackVerified') is True and rollback.get('originalBatchAbsent') is True and rollback.get('connectionCleanup')=='CLOSED' and rollback.get('syntheticImportVerified') is False and rollback.get('businessVerified') is False, 'ROLLBACK_STAGE_RESULT_REQUIRED')
    json_new(root/'rollback-host-result.json',rollback)
    after_rollback=observer();json_new(root/'snapshot-after-rollback.json',after_rollback)
    need(before['snapshot']==after_rollback['snapshot'], 'ROLLBACK_SNAPSHOT_CHANGED')
    committed=child('--verify-host-commit',binding)
    validate_stage_binding(committed,descriptor,rollback)
    need(committed.get('state')=='FRESH35_CONTROLLER_HOST_VERIFIED' and committed.get('stage')=='commit' and committed.get('ordinaryUid')==a['postgresUid'] and committed.get('connectionCleanup')=='CLOSED' and committed.get('syntheticImportVerified') is True and committed.get('businessVerified') is False and committed.get('importState')=='COMMITTED' and committed.get('replayState')=='ALREADY_COMMITTED' and committed.get('readbackState')=='VERIFIED' and committed.get('settlementRetentionVerified') is True and type(committed.get('retainedHeaders')) is int and committed['retainedHeaders']==25 and type(committed.get('retainedSettlements')) is int and committed['retainedSettlements']==27, 'COMMIT_STAGE_RESULT_REQUIRED')
    json_new(root/'host-result.json',committed)
    after_commit=observer();json_new(root/'snapshot-after-commit.json',after_commit)
    need(after_commit['context']==after_rollback['context'] and set(after_commit['snapshot']['sequences'])==set(before['snapshot']['sequences']), 'POST_COMMIT_OBSERVER_COHORT_DIFFERS')
    return committed

def clear_credentials(root, p, postgres_uid):
    errors=[]
    for name in [p[k]+'.pgpass' for k in ['admin','owner','controller','runtime']]+[APPLICATION_SCRYPT_NAME]:
        path=root/'credentials'/name
        try:
            s=path.lstat(); need(stat.S_ISREG(s.st_mode) and s.st_uid==0 and s.st_nlink==1,'CREDENTIAL_FILE_IDENTITY'); path.unlink()
        except FileNotFoundError:
            pass
        except Exception as e:
            errors.append(type(e).__name__)
    path=root/'pg-private/initpw'
    try:
        s=path.lstat();need(stat.S_ISREG(s.st_mode) and s.st_nlink==1,'INITPW_IDENTITY');path.unlink()
    except FileNotFoundError:
        pass
    except Exception as e:
        errors.append(type(e).__name__)
    ordinary=root/'ordinary-private'
    try:
        s=ordinary.lstat();need(stat.S_ISDIR(s.st_mode) and not stat.S_ISLNK(s.st_mode) and s.st_uid in [0,postgres_uid] and stat.S_IMODE(s.st_mode)==0o700,'ORDINARY_PRIVATE_DIRECTORY_IDENTITY')
        for name in [ORDINARY_SCENARIO_NAME,ORDINARY_CREDENTIAL_KEY_NAME]:
            scenario=ordinary/name
            try:
                s=scenario.lstat();need(stat.S_ISREG(s.st_mode) and s.st_nlink==1 and s.st_uid in [0,postgres_uid] and stat.S_IMODE(s.st_mode)==0o600,'ORDINARY_PRIVATE_SCENARIO_IDENTITY');scenario.unlink()
            except FileNotFoundError:pass
        ordinary.rmdir()
    except FileNotFoundError:pass
    except Exception as e:errors.append(type(e).__name__)
    return not errors and not any((root/'credentials').iterdir()) and not path.exists() and not ordinary.exists() and not ordinary.is_symlink()

def cleanup_owned_server(a, proc, identity, system_id, deadline):
    """Only this Popen child, with PID/starttime/exe/listener rechecks. No restart.
    A failed revoke/unclean stop is retained as failure, not hidden by file removal.
    """
    p=a['proposal'];root=Path(p['workspaceDirectory']);errors=[]
    result={'loginsRevoked':False,'credentialsRemoved':False,'ownedPidAbsent':False,'portAbsent':False,'cleanShutdown':False,'noActiveTcpRows':False,'tcpCleanupRule':'FRESH35_NO_ACTIVE_TCP_ROWS_V1'}
    try:
        if proc and proc.poll() is None and identity and owned_listener(identity,p['port']) and system_id and time.monotonic()<deadline-5:
            names=[p[k] for k in ['owner','controller','runtime','admin']]
            try:
                database='postgres';observer_revoke='';binding=root/'target-binding.json'
                if binding.exists() or binding.is_symlink():
                    target=strict_json(read_private(binding))
                    need(target.get('proposal')==p and target.get('startsAt')==a['startsAt'] and target.get('expiresAt')==a['expiresAt'] and target.get('physical',{}).get('systemIdentifier')==system_id,'CLEANUP_OBSERVER_TARGET_BINDING_DIFFERS')
                    database=p['database']
                    observer_revoke="IF pg_catalog.to_regprocedure('pg_catalog.fresh35_exclusive_backends()') IS NOT NULL THEN REVOKE ALL ON FUNCTION pg_catalog.fresh35_exclusive_backends() FROM "+p['owner']+","+p['controller']+"; END IF; "
                sql="DO $revoke$ BEGIN IF (SELECT system_identifier::text FROM pg_catalog.pg_control_system()) <> '"+system_id+"' THEN RAISE EXCEPTION 'PHYSICAL_TARGET_DIFFERS'; END IF; "+observer_revoke+''.join("IF EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='"+r+"') THEN ALTER ROLE "+r+" NOLOGIN PASSWORD NULL VALID UNTIL '-infinity'; END IF; " for r in names)+"END $revoke$;"
                psql(a,p['admin'],database,sql,timeout=min(8,max(1,deadline-time.monotonic()-3)));result['loginsRevoked']=True
            except Exception as e:
                errors.append({'phase':'revoke','type':type(e).__name__})
        if proc:
            for sig,seconds in [(signal.SIGINT,12),(signal.SIGQUIT,5),(signal.SIGKILL,3)]:
                if proc.poll() is not None:break
                if identity and not same_process(identity):errors.append({'phase':'stop','type':'OWNERSHIP_CHANGED'});break
                try:
                    # Direct, unreaped child PID cannot be reused. No discovered
                    # PID or broad process-group termination is ever used.
                    proc.send_signal(sig);proc.wait(timeout=min(seconds,max(.1,deadline-time.monotonic())))
                except subprocess.TimeoutExpired:pass
                except ProcessLookupError:proc.poll()
    except Exception as e:
        errors.append({'phase':'stop','type':type(e).__name__})
    finally:
        try:result['credentialsRemoved']=clear_credentials(root,p,a['postgresUid'])
        except Exception as e:errors.append({'phase':'credentials','type':type(e).__name__})
        try:
            result['ownedPidAbsent']=proc is None or proc.poll() is not None
            result['portObservation']={}
            result['portAbsent']=port_absent(p['port'],result['portObservation'])
            result['noActiveTcpRows']=result['portObservation'].get('noActiveTcpRows') is True
            if proc and result['ownedPidAbsent'] and not (root/'data/postmaster.pid').exists():
                r=subprocess.run([str(BIN/'pg_controldata'),'-D',str(root/'data')],capture_output=True,env=clean_env(root),timeout=5)
                control=r.stdout.decode(errors='replace')
                match=re.search(r'^Database system identifier:\s*(\d+)$',control,re.M)
                result['cleanShutdown']=r.returncode==0 and bool(match) and match[1]==system_id and bool(re.search(r'^Database cluster state:\s*shut down$',control,re.M))
        except Exception as e:errors.append({'phase':'observe','type':type(e).__name__})
    result['errors']=errors;result['cleanupComplete']=all(result[k] for k in ['loginsRevoked','credentialsRemoved','ownedPidAbsent','noActiveTcpRows','cleanShutdown']) and not errors
    return result

def initialization_args(p):
    root=Path(p['workspaceDirectory'])
    return [str(BIN/'initdb'),'-D',str(root/'data'),'-L',str(SHARE),'--username',p['admin'],'--pwfile',str(root/'pg-private/initpw'),'--auth-local=scram-sha-256','--auth-host=scram-sha-256','--encoding=UTF8','--locale=C']

def enable_child_subreaper():
    # Per-process Linux supervision, not an OS-wide setting. Failure is fatal
    # before initdb exists. No ctypes/native call is made by the offline models.
    import ctypes
    libc=ctypes.CDLL(None,use_errno=True)
    need(libc.prctl(36,1,0,0,0)==0,'CHILD_SUBREAPER_REQUIRED')
    observed=ctypes.c_int(0)
    need(libc.prctl(37,ctypes.byref(observed),0,0,0)==0 and observed.value==1,'CHILD_SUBREAPER_NOT_EFFECTIVE')

def direct_child_pids():
    raw=(Path('/proc')/str(os.getpid())/'task'/str(os.getpid())/'children').read_text().split()
    need(all(re.fullmatch('[1-9][0-9]*',x) for x in raw),'CHILD_LIST_INVALID')
    values=[int(x) for x in raw];need(len(set(values))==len(values),'DUPLICATE_CHILD_PID')
    return values

def owned_initialization_child(pid,session_id,uid):
    # Called only for the guardian's actual direct children, after initdb is
    # reaped. A live direct child cannot be PID-reused until this guardian reaps
    # it. No other thread or code path waits/reaps children during this phase.
    path=Path('/proc')/str(pid)
    fields=(path/'stat').read_text().rsplit(')',1)[1].split()
    values=re.search(r'^Uid:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*$',(path/'status').read_text(),re.M)
    need(int(fields[1])==os.getpid() and int(fields[2])==session_id and int(fields[3])==session_id and values is not None and all(int(v)==uid for v in values.groups()),'INITIALIZER_CHILD_OWNERSHIP_DIFFERS')
    if fields[0]!='Z':
        exe=os.readlink(path/'exe')
        need(exe in {str(BIN/'initdb'),str(BIN/'postgres'),str(Path('/bin/sh').resolve())},'INITIALIZER_CHILD_EXECUTABLE_DIFFERS')
    return {'pid':pid,'starttime':fields[19],'session':session_id,'state':fields[0]}

def stop_and_reap_initialization(proc,a,deadline):
    errors=[];initializer_reaped=False;descendants_reaped=False
    cleanup_end=min(deadline,time.monotonic()+20)
    try:
        # This is our direct, unreaped Popen child, not a looked-up process.
        for sig,seconds in [(signal.SIGTERM,3),(signal.SIGKILL,3)]:
            if proc.poll() is not None:break
            proc.send_signal(sig)
            try:proc.wait(timeout=min(seconds,max(.1,cleanup_end-time.monotonic())))
            except subprocess.TimeoutExpired:pass
        initializer_reaped=proc.poll() is not None
        if not initializer_reaped:
            errors.append('INITIALIZER_EXIT_UNCONFIRMED')
        else:
            # Linux subreaper adoption completes before the dead parent can be
            # waited. Killing each adopted parent may expose another generation;
            # repeat the actual direct-child list, never scan/kill by UID/name.
            while True:
                children=direct_child_pids()
                if not children:
                    descendants_reaped=True;break
                need(time.monotonic()<cleanup_end,'INITIALIZER_DESCENDANT_DEADLINE')
                for pid in children:
                    owned_initialization_child(pid,proc.pid,a['postgresUid'])
                    # ECHILD, identity uncertainty and permission failures stop
                    # this cleanup with false flags, never masquerade as gone.
                    reaped,_=os.waitpid(pid,os.WNOHANG)
                    if reaped==pid:continue
                    need(reaped==0,'INITIALIZER_CHILD_WAIT_DIFFERS')
                    for sig,seconds in [(signal.SIGTERM,1),(signal.SIGKILL,2)]:
                        owned_initialization_child(pid,proc.pid,a['postgresUid'])
                        os.kill(pid,sig)
                        until=min(cleanup_end,time.monotonic()+seconds)
                        while True:
                            reaped,_=os.waitpid(pid,os.WNOHANG)
                            if reaped==pid:break
                            need(reaped==0,'INITIALIZER_CHILD_WAIT_DIFFERS')
                            if time.monotonic()>=until:break
                            time.sleep(.02)
                        if reaped==pid:break
                    need(reaped==pid,'INITIALIZER_CHILD_EXIT_UNCONFIRMED')
    except Exception as error:
        errors.append(type(error).__name__)
    return {'initializerReaped':initializer_reaped,'descendantsReaped':descendants_reaped,'errors':errors}

def drive_initializer(io,deadline):
    """Shared real/mock control flow. Model IO cannot produce an install token.
    Parent EOF, signal or budget exhaustion never sends initialization success.
    """
    started=False;success=False;reason='INITIALIZER_NOT_STARTED';errors=[]
    cleanup={'initializerReaped':True,'descendantsReaped':True,'errors':[]}
    try:
        if io.parent_event(0) is not None:reason='PARENT_EOF';return {'initialized':False,'stopReason':reason,**cleanup}
        need(not io.stop_requested() and io.now()<deadline-60,'INITIALIZER_START_WINDOW')
        io.enable_subreaper();io.launch();started=True
        operation_end=min(deadline-60,io.now()+60)
        while True:
            event=io.parent_event(min(.1,max(0,operation_end-io.now())))
            if event is not None:reason='PARENT_EOF' if event=='EOF' else 'PARENT_STOP';break
            if io.stop_requested():reason='GUARDIAN_SIGNAL';break
            if io.now()>=operation_end:reason='INITIALIZER_DEADLINE';break
            status=io.poll_initializer()
            if status is None:continue
            if status!=0:reason='INITIALIZER_FAILED';break
            if io.children():reason='INITIALIZER_DESCENDANTS_REMAINED';break
            success=True;reason='INITIALIZER_EXITED';break
    except Exception as error:
        reason='INITIALIZER_ERROR';errors.append(type(error).__name__)
    finally:
        if started:
            try:cleanup=io.stop_and_reap()
            except Exception as error:cleanup={'initializerReaped':False,'descendantsReaped':False,'errors':[type(error).__name__]}
    return {'initialized':success and cleanup['initializerReaped'] and cleanup['descendantsReaped'] and not cleanup['errors'],
        'stopReason':reason,'initializerReaped':cleanup['initializerReaped'],'descendantsReaped':cleanup['descendantsReaped'],'errors':errors+cleanup['errors']}

def supervise_initializer(a,selector,stop_requested,deadline):
    p=a['proposal'];root=Path(p['workspaceDirectory'])
    class IO:
        child=None
        def now(self):return time.monotonic()
        def parent_event(self,timeout):
            if not selector.select(timeout):return None
            line=sys.stdin.readline()
            return 'EOF' if line=='' else 'STOP'
        def stop_requested(self):return stop_requested()
        def enable_subreaper(self):enable_child_subreaper()
        def launch(self):
            self.child=subprocess.Popen(initialization_args(p),stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,env=clean_env(root),user=a['postgresUid'],group=a['postgresGid'],extra_groups=[],start_new_session=True)
        def poll_initializer(self):return self.child.poll()
        def children(self):return direct_child_pids()
        def stop_and_reap(self):return stop_and_reap_initialization(self.child,a,deadline)
    return drive_initializer(IO(),deadline)

def include_initialization_cleanup(result,initialization):
    result={**result,'initialization':initialization}
    result['cleanupComplete']=result['cleanupComplete'] and initialization['initializerReaped'] and initialization['descendantsReaped'] and not initialization['errors']
    return result

def retry_parent_credential_cleanup(watch,clear):
    # Guardian owns stop/reap then clear. Parent may retry only after it exited.
    return clear() if watch is None or watch.poll() is not None else False

def supervise(a):
    p=a['proposal'];root=Path(p['workspaceDirectory']);proc=None;identity=None;system_id=None;stop=False
    deadline=time.monotonic()+max(0,a['expiresAt']/1000-time.time())
    initialization={'initialized':False,'initializerReaped':True,'descendantsReaped':True,'stopReason':'NOT_STARTED','errors':[]}
    initialization_attempted=False
    def requested(*_):
        nonlocal stop
        stop=True
    for s in [signal.SIGTERM,signal.SIGINT,signal.SIGHUP]:signal.signal(s,requested)
    sel=selectors.DefaultSelector();sel.register(sys.stdin,selectors.EVENT_READ)
    try:
        # Guardian is running before credentials/initdb. Parent EOF always reaches
        # cleanup, even if initialization never gets as far as launching PG.
        print('GUARDIAN_READY',flush=True)
        while not stop and time.monotonic()<deadline-45:
            if not sel.select(min(1,max(.01,deadline-45-time.monotonic()))):continue
            line=sys.stdin.readline()
            if line=='INITIALIZE\n':
                need(not initialization_attempted,'INITIALIZE_ONCE');initialization_attempted=True
                initialization=supervise_initializer(a,sel,lambda:stop,deadline)
                json_new(root/'initialization-result.json',initialization)
                if not initialization['initialized']:break
                print('INITIALIZED',flush=True);continue
            if line!='START\n':break
            need(initialization['initialized'],'INITIALIZATION_ACK_REQUIRED')
            need(proc is None and port_absent(p['port']),'START_ONCE_NEW_PORT')
            birth=strict_json((root/'birth.json').read_bytes());system_id=birth['systemIdentifier']
            with (root/'server-private.log').open('xb',buffering=0) as log:
                proc=subprocess.Popen(server_args(p),stdin=subprocess.DEVNULL,stdout=log,stderr=log,env=clean_env(root),user=a['postgresUid'],group=a['postgresGid'],extra_groups=[],start_new_session=True)
            for _ in range(100):
                if proc.poll() is not None:break
                try:
                    identity=process_identity(proc.pid)
                    if same_process(identity):break
                except FileNotFoundError:pass
                time.sleep(.01)
            need(identity and same_process(identity),'OWNED_PG_PROCESS')
            json_new(root/'owned-process.json',identity)
            json_new(root/'server-command.json',{'argv':server_args(p),'identity':identity,'deadlineMonotonic':deadline})
            print('SERVER_STARTED',flush=True)
            while not stop and time.monotonic()<deadline-45 and proc.poll() is None:
                if sel.select(min(1,max(.01,deadline-45-time.monotonic()))):
                    sys.stdin.readline();stop=True
            break
    finally:
        result=cleanup_owned_server(a,proc,identity,system_id,deadline)
        result=include_initialization_cleanup(result,initialization)
        json_new(root/'cleanup.json',result)
        print('CLEANUP_COMPLETE' if result['cleanupComplete'] else 'CLEANUP_UNCONFIRMED',flush=True)
    return 0 if result['cleanupComplete'] else 1

def main():
    need(sys.platform=='linux' and os.getuid()==0 and os.geteuid()==0 and sys.flags.isolated and sys.flags.no_site,'ROOT_ISOLATED_PYTHON_REQUIRED')
    need(Path(__file__)==SELF and len(sys.argv)==2 and sys.argv[1] in ['--preflight-only','--run-authorized-once','--supervise-owned-child'],'FIXED_ENTRY')
    trusted(Path(sys.executable).resolve());trusted(PARENT)
    raw=read_private(AUTH);a=validate_authorization(strict_json(raw),int(time.time()*1000));verify_deployment(a)
    p=a['proposal'];root=Path(p['workspaceDirectory'])
    if sys.argv[1]=='--supervise-owned-child':
        parent=strict_json(read_private(root/'controller-process.json'))
        need(os.getppid()==parent['pid'] and process_identity(parent['pid'])==parent,'ONLY_LIVE_CREATING_CONTROLLER')
        parent_args=(Path('/proc')/str(parent['pid'])/'cmdline').read_bytes().split(b'\0')
        need([x.decode() for x in parent_args if x][-2:]==[str(SELF),'--run-authorized-once'],'EXACT_CONTROLLER_MODE')
        need(read_private(Path(str(AUTH)+'.consumed')).decode()==hashlib.sha256(raw).hexdigest()+'\n','PROVISION_CONSUMPTION_DIFFERS')
        json_new(root/'guardian-started.json',{'controller':parent,'authorizationSha256':hashlib.sha256(raw).hexdigest(),'restartAllowed':False})
        return supervise(a)
    configuration=read_ordinary_configuration(a)
    need(not root.exists() and not root.is_symlink() and port_absent(p['port']),'NEW_UNUSED_TARGET')
    need(not INSTALL_AUTH.exists() and not Path(str(INSTALL_AUTH)+'.consumed').exists(),'NO_STALE_INSTALL_AUTHORIZATION')
    # Dedicated service account must already exist and have no running process.
    import pwd
    need(pwd.getpwuid(a['postgresUid']).pw_gid==a['postgresGid'],'EXISTING_SERVICE_ACCOUNT')
    for path in Path('/proc').iterdir():
        if path.name.isdecimal():
            try:need(path.stat().st_uid!=a['postgresUid'],'SERVICE_ACCOUNT_ALREADY_ACTIVE')
            except FileNotFoundError:pass
    runtime_dependencies=load_linux_runtime_dependencies(root)
    if sys.argv[1]=='--preflight-only':
        print(json.dumps({'state':'READ_ONLY_PREFLIGHT_PASSED','noCredentialsCreated':True,'noServicesStarted':True,'runtimeDependencies':runtime_dependencies}));return 0
    # Single-use external authorization; no replacement, unlink, repair or retry.
    write_new(str(AUTH)+'.consumed',(hashlib.sha256(raw).hexdigest()+'\n').encode())
    os.umask(0o077);root.mkdir(mode=0o700);os.chmod(root,0o711)
    (root/'credentials').mkdir(mode=0o700);(root/'pg-private').mkdir(mode=0o700)
    os.chown(root/'pg-private',a['postgresUid'],a['postgresGid'])
    watch=None;success=False;record_published=None;host_verified=False;synthetic_import_verified=False;snapshots_verified=False;ordinary_verified=False;passwords={};application_password=None;deadline=time.monotonic()+max(0,a['expiresAt']/1000-time.time())
    def remaining():
        need(time.monotonic()<deadline-60,'CLEANUP_RESERVE');return max(1,min(60,deadline-time.monotonic()-45))
    def interrupted(*_):raise RuntimeError('FRESH35_ISOLATED_PARENT_STOP')
    for s in [signal.SIGTERM,signal.SIGINT,signal.SIGHUP]:signal.signal(s,interrupted)
    try:
        json_new(root/'controller-process.json',process_identity(os.getpid()))
        json_new(root/'runtime-dependencies.json',runtime_dependencies)
        watch=subprocess.Popen([sys.executable,'-I','-S',str(SELF),'--supervise-owned-child'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,env=clean_env(root),start_new_session=True)
        sel=selectors.DefaultSelector();sel.register(watch.stdout,selectors.EVENT_READ)
        need(sel.select(8) and watch.stdout.readline()=='GUARDIAN_READY\n','GUARDIAN_READY')
        application_password=create_synthetic_application_credential(root,watch,remaining())
        import secrets
        passwords={p[k]:secrets.token_hex(32) for k in ['admin','owner','controller','runtime']}
        for role,pw in passwords.items():
            need(watch.poll() is None,'GUARDIAN_LOST_BEFORE_CREDENTIAL_WRITE');write_new(root/'credentials'/(role+'.pgpass'),f"127.0.0.1:{p['port']}:*:{role}:{pw}\n".encode(),0o600)
        write_new(root/'pg-private/initpw',(passwords[p['admin']]+'\n').encode(),0o400);os.chown(root/'pg-private/initpw',a['postgresUid'],a['postgresGid'])
        (root/'data').mkdir(mode=0o700);os.chown(root/'data',a['postgresUid'],a['postgresGid'])
        watch.stdin.write('INITIALIZE\n');watch.stdin.flush()
        need(sel.select(remaining()+5) and watch.stdout.readline()=='INITIALIZED\n','INITDB_FAILED_OR_NOT_REAPED')
        hba=hba_text(p);(root/'data/pg_hba.conf').write_text(hba)
        json_new(root/'hba-source.json',{'text':hba,'sha256':hashlib.sha256(hba.encode()).hexdigest()})
        r=subprocess.run([str(BIN/'pg_controldata'),'-D',str(root/'data')],capture_output=True,env=clean_env(root),timeout=5)
        m=re.search(r'^Database system identifier:\s*(\d+)$',r.stdout.decode(),re.M);need(r.returncode==0 and m,'CONTROL_SYSTEM_ID')
        sid=m[1];json_new(root/'birth.json',{'systemIdentifier':sid,'startsAt':a['startsAt'],'expiresAt':a['expiresAt']})
        watch.stdin.write('START\n');watch.stdin.flush();need(sel.select(8) and watch.stdout.readline()=='SERVER_STARTED\n','START_ACK')
        owned=strict_json((root/'owned-process.json').read_bytes())
        for _ in range(40):
            remaining();need(watch.poll() is None and same_process(owned),'SERVER_STILL_OWNED')
            if owned_listener(owned,p['port']):
                pidfile=(root/'data/postmaster.pid').read_text().splitlines()
                need(int(pidfile[0])==owned['pid'] and pidfile[1]==str(root/'data') and int(pidfile[3])==p['port'],'POSTMASTER_PID_DATA_PORT')
                try:psql(a,p['admin'],'postgres','SELECT 1;',5);break
                except RuntimeError:pass
            time.sleep(.25)
        else:need(False,'START_NOT_READY')
        identity_sql="SELECT json_build_object('systemIdentifier',(SELECT system_identifier::text FROM pg_catalog.pg_control_system()),'databaseOid',(SELECT oid::text FROM pg_catalog.pg_database WHERE datname=current_database()),'serverVersionNum',current_setting('server_version_num'),'postmasterStart',pg_catalog.pg_postmaster_start_time()::text,'address',host(inet_server_addr()),'port',inet_server_port(),'dataDirectory',current_setting('data_directory'),'hbaFile',current_setting('hba_file'),'listenAddresses',current_setting('listen_addresses'),'unixSocketDirectories',current_setting('unix_socket_directories'),'actor',session_user)::text;"
        obs=strict_json(psql(a,p['admin'],'postgres',identity_sql));need(obs['systemIdentifier']==sid and obs['address']=='127.0.0.1' and obs['port']==p['port'] and obs['serverVersionNum']=='170011' and obs['dataDirectory']==str(root/'data') and obs['hbaFile']==str(root/'data/pg_hba.conf') and obs['listenAddresses']=='127.0.0.1' and obs['unixSocketDirectories']=='' and obs['actor']==p['admin'],'BOOTSTRAP_PHYSICAL_TARGET')
        role_sql,db_sql,acl_sql=bootstrap_sql(a,passwords)
        for database,sql in [('postgres',role_sql),('postgres',db_sql),(p['database'],acl_sql)]:
            remaining();need(owned_listener(owned,p['port']),'BOOTSTRAP_LISTENER');psql(a,p['admin'],database,sql)
        passwords.clear();role_sql=None;sql=None;pw=None
        obs=strict_json(psql(a,p['admin'],p['database'],identity_sql));persist_bootstrap_network_observation(a,obs,sid)
        need((root/'data/pg_hba.conf').read_text()==hba,'HBA_BYTES_CHANGED')
        hba_rows=strict_json(psql(a,p['admin'],p['database'],"SELECT coalesce(json_agg(json_build_object('type',type,'database',database,'user_name',user_name,'address',address,'auth_method',auth_method,'error',error) ORDER BY rule_number),'[]'::json)::text FROM pg_catalog.pg_hba_file_rules;"))
        need(len(hba_rows)==7 and all(row['error'] is None for row in hba_rows),'HBA_PARSE_DIFFERS')
        json_new(root/'hba-observation.json',hba_rows)
        target={'proposal':p,'physical':{k:obs[k] for k in ['systemIdentifier','databaseOid','serverVersionNum','postmasterStart']},'startsAt':a['startsAt'],'expiresAt':a['expiresAt']}
        json_new(root/'target-binding.json',target)
        verify_deployment(a)
        argv=[str(NODE),'--no-global-search-paths',str(ENTRY)]
        bootstrap_exclusive_observer(a,argv,remaining)
        # Describe runs real current program compilation but no SQL/connection.
        r=subprocess.run(argv+['--describe'],capture_output=True,env=clean_env(root),timeout=remaining());need(r.returncode==0,'PROGRAM_DESCRIPTION_FAILED')
        descriptor=strict_json(r.stdout);need(descriptor['sourceSetSha256']==a['sourceSetSha256'],'CURRENT_SOURCE_SET_DIFFERS');json_new(root/'program-description.json',descriptor)
        # External authority must review this physical target/program and supply
        # the existing exact protected install authorization. Never mint it here.
        print(json.dumps({'state':'AWAITING_EXTERNAL_EXACT_INSTALL_AUTHORIZATION','program':descriptor,'target':target,'expiresAt':a['expiresAt']}),flush=True)
        while not INSTALL_AUTH.exists():
            remaining();need(watch.poll() is None and owned_listener(owned,p['port']),'GUARDIAN_OR_TARGET_LOST');time.sleep(.25)
        read_private(INSTALL_AUTH);verify_deployment(a);need(owned_listener(owned,p['port']),'PRE_INSTALL_LISTENER')
        r=subprocess.run(argv+['--execute'],capture_output=True,env=clean_env(root),timeout=max(1,deadline-time.monotonic()-45))
        if r.returncode!=0:persist_install_child_failure(root,r,descriptor)
        need(r.returncode==0,'INSTALL_FAILED_OR_OUTCOME_UNKNOWN')
        result=strict_json(r.stdout);need(result.get('state')=='RECORD_DURABLY_PUBLISHED' and result.get('recordPublished') is True and result.get('sourceSetSha256')==a['sourceSetSha256'],'INSTALL_COMPLETION_REQUIRED');json_new(root/'installation-result.json',result);record_published=True
        def host_window():
            remaining();need(watch.poll() is None and owned_listener(owned,p['port']),'PRE_HOST_TARGET_LOST')
            return max(1,deadline-time.monotonic()-45)
        def stage_child(*flags):
            stage='rollback' if flags[0]=='--verify-host-rollback' else 'commit'
            try:
                r=subprocess.run(argv+list(flags),capture_output=True,env=clean_env(root),timeout=host_window())
            except subprocess.TimeoutExpired:
                json_new(root/(stage+'-child-failure.json'),{'state':'OUTCOME_UNKNOWN_NO_REPLAY','stage':stage,'timedOut':True,'automaticRetry':False})
                raise
            if r.returncode!=0:
                persist_stage_child_failure(root,r,stage)
            need(r.returncode==0,'CONTROLLER_HOST_FAILED_OR_OUTCOME_UNKNOWN')
            return strict_json(r.stdout)
        host_result=verify_synthetic_stages(a,target,descriptor,root,stage_child,lambda:observe_snapshot(a,target,host_window()))
        host_verified=True;synthetic_import_verified=True;snapshots_verified=True
        scene=observe_scene(a,target,host_result['fixtureBinding'],host_window())
        ordinary_result=run_ordinary_business(a,target,descriptor,root,scene,configuration,application_password,watch,deadline)
        json_new(root/'ordinary-result.json',ordinary_result);ordinary_verified=True;scene=None;success=True
    except Exception as error:
        json_new(root/'failure.json',{'code':str(error) if re.fullmatch('FRESH35_[A-Z0-9_]+',str(error)) else type(error).__name__,'automaticRetry':False,'commitOutcome':'CONSULT_APPLICATION_JOURNAL_NOT_INFERRED'})
    finally:
        passwords.clear()
        application_password=None
        for s in [signal.SIGTERM,signal.SIGINT,signal.SIGHUP]:signal.signal(s,signal.SIG_IGN)
        if watch:
            try:watch.stdin.close()
            except (BrokenPipeError,ValueError):pass
            try:watch.wait(timeout=max(1,min(40,deadline-time.monotonic())))
            except subprocess.TimeoutExpired:success=False
        # File cleanup is retried locally only; never retry SQL or restart PG.
        files_clear=retry_parent_credential_cleanup(watch,lambda:clear_credentials(root,p,a['postgresUid']))
        cleanup=strict_json((root/'cleanup.json').read_bytes()) if (root/'cleanup.json').is_file() else {'cleanupComplete':False}
        success=success and files_clear and cleanup.get('cleanupComplete') is True
        json_new(root/'result.json',{'state':'ISOLATED_INSTALL_HOST_AND_SYNTHETIC_IMPORT_VERIFIED_AND_STOPPED' if success else 'FAILED_OR_CLEANUP_UNCONFIRMED','cleanup':cleanup,'recordPublished':record_published,'hostVerified':host_verified,'syntheticImportVerified':synthetic_import_verified,'independentSnapshotsVerified':snapshots_verified,'ordinaryBusinessVerified':ordinary_verified,'hostEnabled':False,'businessVerified':False,'productionVerified':False})
        print(json.dumps({'state':'ISOLATED_INSTALL_HOST_AND_SYNTHETIC_IMPORT_VERIFIED_AND_STOPPED' if success else 'FAILED_OR_CLEANUP_UNCONFIRMED','recordPublished':record_published,'hostVerified':host_verified,'syntheticImportVerified':synthetic_import_verified,'independentSnapshotsVerified':snapshots_verified,'ordinaryBusinessVerified':ordinary_verified,'businessVerified':False,'productionVerified':False,'workspace':str(root)}))
    return 0 if success else 1

if __name__=='__main__':
    try:sys.exit(main())
    except Exception as error:
        sys.stderr.write((str(error) if re.fullmatch('FRESH35_[A-Z0-9_]+',str(error)) else 'FRESH35_ISOLATED_FAILED')+'\n');sys.exit(1)
