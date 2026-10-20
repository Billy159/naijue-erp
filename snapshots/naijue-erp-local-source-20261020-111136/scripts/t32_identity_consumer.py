"""T32 identity package consumer. Only a freshly created, bound local QA cluster."""
from __future__ import annotations
import base64
import gzip
import hashlib
import json
import re
import subprocess
from pathlib import Path

class IdentityError(ValueError):
    pass

def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))

def fingerprint(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()

def validate(plan):
    if plan.get('schemaVersion') != 'T32-EFFECTIVE-IDENTITY-v6' or plan.get('productionAuthorized') is not False:
        raise IdentityError('INVALID_IDENTITY_PACKAGE_SCOPE')
    if plan.get('inventoryContributionDetermined') is not False:
        raise IdentityError('QUANTITY_IN_IDENTITY_PACKAGE_REFUSED')
    if not all(re.fullmatch(r'[0-9a-f]{64}', plan.get(k,'')) for k in ['batchId','t30BatchId','t30ManifestSha256']):
        raise IdentityError('INVALID_VERSION_IDENTITY')
    entities = {(r['kind'], r['key']): r for r in plan['entities']}
    if len(entities) != len(plan['entities']):
        raise IdentityError('DUPLICATE_ENTITY_KEY')
    codes = set()
    ids = set()
    for row in entities.values():
        key = (row['kind'], row['code'])
        if key in codes:
            raise IdentityError('DUPLICATE_ENTITY_CODE')
        codes.add(key)
        if row['id'] is not None:
            key = (row['kind'], row['id'])
            if key in ids:
                raise IdentityError('MERGED_EXISTING_IDENTITY')
            ids.add(key)
        elif row['kind'] not in ['warehouse', 'hall', 'employee', 'sku'] or not row['creationEvidence']:
            raise IdentityError('UNPROVEN_NEW_IDENTITY')
    aliases = {}
    for row in plan['aliases']:
        key = (row['kind'], row['namespace'], row['sourceKey'])
        if key in aliases or (row['kind'], row['targetKey']) not in entities:
            raise IdentityError('AMBIGUOUS_OR_MISSING_ALIAS_TARGET')
        if not row['evidence']:
            raise IdentityError('ALIAS_WITHOUT_EVIDENCE')
        aliases[key] = row['targetKey']
    for row in plan['productNamespaceProofs']:
        code = row['sourceCode']
        exchange = 'tp_product_' + hashlib.sha256(canonical([code]).encode()).hexdigest()[:24]
        from uuid import UUID
        expected = str(UUID(hashlib.md5(('tplus:product:' + exchange).encode()).hexdigest()))
        if expected != row['sourceProductId'] or row['approvedId'] != row['retainedProductId']:
            raise IdentityError('PRODUCT_NAMESPACE_PROOF_MISMATCH')
        if aliases.get(('product', 'CURRENT_T30', row['sourceProductId'])) != code:
            raise IdentityError('PRODUCT_NAMESPACE_ALIAS_MISSING')
        if entities[('product', code)]['id'] != row['retainedProductId']:
            raise IdentityError('RETAINED_APPROVED_PRODUCT_ID_REPLACED')
    occupancy = {}
    for row in plan['codes']:
        if not isinstance(row['code'], str) or not row['code']:
            raise IdentityError('EXACT_TEXT_BARCODE_REQUIRED')
        if ('product', row['productKey']) not in entities:
            raise IdentityError('BARCODE_PRODUCT_MISSING')
        if row['skuKey'] is not None:
            sku = entities.get(('sku', row['skuKey']))
            if sku is None or sku['body']['productKey'] != row['productKey']:
                raise IdentityError('BARCODE_SKU_REBOUND')
            previous = occupancy.setdefault(row['code'], row['skuKey'])
            if previous != row['skuKey']:
                raise IdentityError('CROSS_SKU_CODE_OCCUPANCY')
    for row in plan['historyReferences']:
        if row['originalSkuId'] != row['historicalForeignKey'] or row['quantityContribution'] is not None:
            raise IdentityError('HISTORICAL_SKU_OR_QUANTITY_REWRITE')
        if row['currentSourceBindingState'] != 'EXACT_DOCUMENT_SEQUENCE_AND_INVARIANT_FIELDS_WITH_RETAINED_KEYS':
            raise IdentityError('HISTORICAL_SOURCE_BINDING_UNRESOLVED')
    for row in plan['relations']:
        if ('warehouse', row['warehouseKey']) not in entities or ('hall', row['hallKey']) not in entities:
            raise IdentityError('HALL_WAREHOUSE_TARGET_MISSING')
    for row in plan['entities']:
        if row['kind'] == 'employee' and (row['body'].get('authenticationImported') or row['body'].get('usableLoginEnabled')):
            raise IdentityError('AUTHENTICATION_SECRET_PROVISIONING_OUT_OF_SCOPE')
        if row['kind'] == 'employee' and (row['body']['role'] not in ['ADMIN','WAREHOUSE','SALESPERSON']
                or row['body']['role']=='SALESPERSON' and ('hall',row['body']['hallKey']) not in entities):
            raise IdentityError('CONFIRMED_EMPLOYEE_ROLE_OR_HALL_MISMATCH')
        if row['kind'] == 'hall' and ('warehouse',row['body']['defaultWarehouseKey']) not in entities:
            raise IdentityError('HALL_DEFAULT_WAREHOUSE_MISSING')
    return {'entities': len(entities), 'namespaceProofs': len(plan['productNamespaceProofs']),
            'historyReferences': len(plan['historyReferences'])}

def load_package(path, expected_hash):
    raw = Path(path).read_bytes()
    if hashlib.sha256(raw).hexdigest() != expected_hash:
        raise IdentityError('PACKAGE_HASH_MISMATCH')
    plan = json.loads(gzip.decompress(raw))
    validate(plan)
    return plan

def assert_target(target):
    if target.get('environment') != 'qa' or target.get('dataClass') != 'ISOLATED_SOURCE_IDENTITY_MODEL':
        raise IdentityError('QA_TARGET_REQUIRED')
    if not re.fullmatch(r'demo_8877_t32_[a-z0-9_]+', target.get('database', '')):
        raise IdentityError('NON_ISOLATED_DATABASE_REFUSED')
    socket = Path(target.get('socket', ''))
    data = Path(target.get('dataDirectory', ''))
    suite = Path(target.get('suite', ''))
    if not socket.is_absolute() or not socket.name.startswith('demo_8877_t32_') or str(socket.parent) not in ['/tmp', '/private/tmp']:
        raise IdentityError('PRIVATE_QA_SOCKET_REQUIRED')
    if not data.is_relative_to(suite) or not (suite/'QA-CLUSTER.json').is_file():
        raise IdentityError('FRESH_CLUSTER_MARKER_REQUIRED')
    marker = json.loads((suite/'QA-CLUSTER.json').read_text())
    if marker['nonce'] != target.get('nonce') or marker['dataDirectory'] != str(data):
        raise IdentityError('QA_CLUSTER_MARKER_MISMATCH')
    if not re.fullmatch(r'[0-9]+', str(target.get('port', ''))) or target.get('user') != 't32_qa_admin':
        raise IdentityError('QA_CONNECTION_IDENTITY_MISMATCH')

def sql(target, statement):
    assert_target(target)
    tool = Path(target['pgBin'])/'psql'
    args = [str(tool), '-X', '-w', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', target['socket'],
            '-p', str(target['port']), '-U', target['user'], '-d', target['database']]
    run = subprocess.run(args, input=statement, text=True, capture_output=True,
        env={'PATH': str(tool.parent)+':/usr/bin:/bin', 'LANG': 'C', 'PGPASSFILE': '/dev/null'}, timeout=60)
    if run.returncode:
        # SQL may include private row payloads. Expose a fixed failure code, never stderr contents.
        raise IdentityError('ISOLATED_IDENTITY_SQL_REFUSED')
    return run.stdout.strip()

def verify_connection(target):
    assert_target(target)
    result = json.loads(sql(target, "SELECT json_build_object('database',current_database(),'user',session_user,"
        "'dataDirectory',current_setting('data_directory'),'listen',current_setting('listen_addresses'),"
        "'address',inet_server_addr(),'cluster',system_identifier::text) FROM pg_control_system();"))
    if result['database'] != target['database'] or result['user'] != target['user'] or result['listen'] != '' \
        or result['address'] is not None or result['dataDirectory'] != target['dataDirectory'] \
        or result['cluster'] != target['clusterId']:
        raise IdentityError('CONNECTED_QA_TARGET_MISMATCH')

def apply(plan, target, fault_after_originals=False):
    validate(plan)
    verify_connection(target)
    table_exists = sql(target, "SELECT to_regclass('t32_identity.run') IS NOT NULL;") == 't'
    if table_exists:
        old = sql(target, "SELECT payload_sha FROM t32_identity.run WHERE batch_id='" + plan['batchId'] + "';")
        if old:
            if old != fingerprint(plan):
                raise IdentityError('BATCH_PAYLOAD_CHANGED')
            return {'status': 'REUSED_IDENTICAL_QA_BATCH', 'writes': 0, 'idsRegenerated': False}
        raise IdentityError('EXISTING_DIFFERENT_QA_BATCH_REFUSED')
    encoded = base64.b64encode(canonical(plan).encode()).decode()
    setup = """
BEGIN;
CREATE SCHEMA t32_identity;
CREATE TABLE t32_identity.run(batch_id text PRIMARY KEY,payload_sha text NOT NULL,t30_batch text NOT NULL);
CREATE TABLE t32_identity.original(kind text,id text,body jsonb NOT NULL,PRIMARY KEY(kind,id));
CREATE FUNCTION t32_identity.deny_original_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'T32_ORIGINAL_IMMUTABLE'; END $$;
CREATE TRIGGER original_immutable BEFORE UPDATE OR DELETE ON t32_identity.original
FOR EACH ROW EXECUTE FUNCTION t32_identity.deny_original_mutation();
CREATE TRIGGER original_no_truncate BEFORE TRUNCATE ON t32_identity.original
FOR EACH STATEMENT EXECUTE FUNCTION t32_identity.deny_original_mutation();
CREATE TABLE t32_identity.entity(kind text,key text,id uuid NOT NULL DEFAULT gen_random_uuid(),code text NOT NULL,
 body jsonb NOT NULL,PRIMARY KEY(kind,key),UNIQUE(kind,id),UNIQUE(kind,code));
CREATE TABLE t32_identity.alias(kind text,namespace text,source_key text,target_key text,evidence jsonb NOT NULL,
 PRIMARY KEY(kind,namespace,source_key),FOREIGN KEY(kind,target_key) REFERENCES t32_identity.entity(kind,key));
CREATE TABLE t32_identity.code(key text PRIMARY KEY,code text NOT NULL,kind text,product_key text,
 sku_key text,active boolean NOT NULL,source jsonb NOT NULL);
CREATE TABLE t32_identity.warehouse_hall(warehouse_key text,hall_key text,PRIMARY KEY(warehouse_key,hall_key));
CREATE TABLE t32_identity.history_reference(key text PRIMARY KEY,body jsonb NOT NULL);
CREATE TABLE t32_identity.image(key text PRIMARY KEY,product_key text,body jsonb NOT NULL);
CREATE TEMP TABLE t32_payload(body jsonb);
"""
    setup += "INSERT INTO t32_payload VALUES(convert_from(decode('"+encoded+"','base64'),'utf8')::jsonb);\n"
    setup += """
INSERT INTO t32_identity.original SELECT v->>'kind',v->>'id',v->'body' FROM t32_payload,
 jsonb_array_elements(body->'originals') v;
"""
    if fault_after_originals:
        setup += "SELECT 1/0;\n"
    setup += """
INSERT INTO t32_identity.entity(kind,key,id,code,body)
 SELECT v->>'kind',v->>'key',coalesce(nullif(v->>'id','')::uuid,gen_random_uuid()),v->>'code',v->'body'
 FROM t32_payload,jsonb_array_elements(body->'entities') v;
INSERT INTO t32_identity.alias SELECT v->>'kind',v->>'namespace',v->>'sourceKey',v->>'targetKey',v->'evidence'
 FROM t32_payload,jsonb_array_elements(body->'aliases') v;
INSERT INTO t32_identity.code SELECT v->>'key',v->>'code',v->>'kind',v->>'productKey',v->>'skuKey',
 (v->>'active')::boolean,v->'source' FROM t32_payload,jsonb_array_elements(body->'codes') v;
INSERT INTO t32_identity.warehouse_hall SELECT v->>'warehouseKey',v->>'hallKey'
 FROM t32_payload,jsonb_array_elements(body->'relations') v;
INSERT INTO t32_identity.history_reference SELECT v->>'key',v FROM t32_payload,jsonb_array_elements(body->'historyReferences') v;
INSERT INTO t32_identity.image SELECT v->>'key',v->>'productKey',v FROM t32_payload,jsonb_array_elements(body->'images') v;
DO $$ BEGIN
 IF EXISTS(SELECT code FROM t32_identity.code WHERE sku_key IS NOT NULL GROUP BY code HAVING count(DISTINCT sku_key)>1)
 THEN RAISE EXCEPTION 'CROSS_SKU_CODE_OCCUPANCY'; END IF;
 IF EXISTS(SELECT 1 FROM t32_identity.code c LEFT JOIN t32_identity.entity p ON p.kind='product' AND p.key=c.product_key
 LEFT JOIN t32_identity.entity s ON s.kind='sku' AND s.key=c.sku_key
 WHERE p.key IS NULL OR c.sku_key IS NOT NULL AND (s.key IS NULL OR s.body->>'productKey'<>c.product_key))
 THEN RAISE EXCEPTION 'BARCODE_TARGET_MISMATCH'; END IF;
END $$;
"""
    setup += "INSERT INTO t32_identity.run VALUES('"+plan['batchId']+"','"+fingerprint(plan)+"','"+plan['t30BatchId']+"');\nCOMMIT;\n"
    sql(target, setup)
    return {'status': 'APPLIED_BOUND_ISOLATED_QA_IDENTITY_PACKAGE', 'writes': sum(len(plan[k]) for k in
        ['originals','entities','aliases','codes','relations','historyReferences','images'])+1,
        'productionApplied': False, 'passwordsOrSessionsImported': False}

def readback(target):
    verify_connection(target)
    q = """SELECT json_build_object(
 'entityCounts',(SELECT json_object_agg(kind,n) FROM (SELECT kind,count(*) n FROM t32_identity.entity GROUP BY kind) c),
 'entities',(SELECT json_agg(json_build_object('kind',kind,'key',key,'id',id,'code',code,'body',body) ORDER BY kind,key) FROM t32_identity.entity),
 'warehouseHallRelations',(SELECT json_agg(json_build_object('warehouseKey',r.warehouse_key,'warehouseId',w.id,'hallKey',r.hall_key,'hallId',h.id) ORDER BY r.warehouse_key,r.hall_key)
 FROM t32_identity.warehouse_hall r JOIN t32_identity.entity w ON w.kind='warehouse' AND w.key=r.warehouse_key
 JOIN t32_identity.entity h ON h.kind='hall' AND h.key=r.hall_key),
 'codeCounts',(SELECT json_object_agg(kind,n) FROM (SELECT kind,count(*) n FROM t32_identity.code GROUP BY kind) c),
 'originalRows',(SELECT count(*) FROM t32_identity.original),
 'historyRows',(SELECT count(*) FROM t32_identity.history_reference),
 'unknownHistoricalSkuRows',(SELECT count(*) FROM t32_identity.history_reference WHERE body->>'originalSkuId' IS NULL),
 'historyIdentityRewriteRows',(SELECT count(*) FROM t32_identity.history_reference WHERE body->>'originalSkuId' IS DISTINCT FROM body->>'historicalForeignKey'),
 'imageRows',(SELECT count(*) FROM t32_identity.image),
 'codeCrossSkuConflicts',(SELECT count(*) FROM (SELECT code FROM t32_identity.code WHERE sku_key IS NOT NULL GROUP BY code HAVING count(DISTINCT sku_key)>1) c));"""
    return json.loads(sql(target, q))
