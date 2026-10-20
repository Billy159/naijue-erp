"""T32 v7 current calibration identity seam; target IDs are never portable.

The JSON contract is usable by T33's own bound consumer. Native QA functions
below operate only on a newly registered private T32 verification instance.
They do not write quantities or the formal business source/runtime schemas.
"""
import base64
import gzip
import hashlib
import json
import re
from pathlib import Path

class AdmissionError(ValueError):
    pass

def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))

def fingerprint(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()

def reject(code):
    raise AdmissionError(code)

def batch_fingerprint(plan):
    return fingerprint({k:v for k,v in plan.items() if k!='batchId'})

def requirements(plan):
    result={}
    for kind,rows in [('WAREHOUSE',plan['warehouses']),('SKU',plan['specifications'])]:
        for row in rows:
            key=(kind,row['targetKey'])
            expected=row['expectedExistingTargetId']
            value={'kind':kind,'targetKey':row['targetKey'],'expectedExistingTargetId':expected,
                   'allocation':row['allocation'],
                   'canonicalProductId':row.get('canonicalProductId'),
                   'sourceQuantitySpecKeys':[]}
            if key in result and any(result[key][k]!=value[k] for k in value if k!='sourceQuantitySpecKeys'):
                reject('CONFLICTING_TARGET_REQUIREMENT')
            old=result.setdefault(key,value)
            if kind=='SKU':old['sourceQuantitySpecKeys'].append(row['sourceQuantitySpecKey'])
    return list(result.values())

def validate(plan):
    if plan.get('schemaVersion')!='T32-CURRENT-QUANTITY-ADMISSION-v7' \
            or plan.get('dataClass')!='NON_FINAL' or plan.get('productionAuthorized') is not False \
            or plan.get('g6FinalBatch') is not False:
        reject('CURRENT_NON_FINAL_SCOPE_REQUIRED')
    if plan.get('quantitySelectionPolicy')!='USER_CONFIRMED_CURRENT_EXPORT_TARGET_CALIBRATION' \
            or plan.get('openingNature')!='DERIVED_FROM_TARGET_INVENTORY' \
            or plan.get('quantityValuesChanged') is not False \
            or plan.get('historicalOriginalIdsFabricated') is not False \
            or plan.get('exactHistoricalCutoffConfirmed') is not False:
        reject('CURRENT_CALIBRATION_METHOD_REQUIRED')
    if not all(re.fullmatch(r'[0-9a-f]{64}',plan.get(k,'')) for k in ['batchId','t30BatchId','priorT32BatchId']):
        reject('BOUND_BATCH_REQUIRED')
    wh={r['sourceWarehouseCode']:r for r in plan['warehouses']}
    sk={r['sourceQuantitySpecKey']:r for r in plan['specifications']}
    if len(wh)!=len(plan['warehouses']) or len(sk)!=len(plan['specifications']):
        reject('DUPLICATE_SOURCE_IDENTITY')
    for row in wh.values():
        if row['targetKey']!='WAREHOUSE:'+row['sourceWarehouseCode'] or row['targetId'] is not None:
            reject('PORTABLE_WAREHOUSE_TARGET_ID_REFUSED')
        if row['historicalOriginalId']!=row['expectedExistingTargetId']:
            reject('WAREHOUSE_ORIGINAL_ID_REPLACED')
        if row['expectedExistingTargetId'] is None and not row['creationEvidence']:
            reject('UNCONFIRMED_NEW_WAREHOUSE')
    for row in sk.values():
        if row['targetId'] is not None or row['historicalOriginalIdentityPromoted'] is not False \
                or row['sourceForeignKeysRewritten'] is not False or row['newBusinessEnabled'] is not False:
            reject('ORIGINAL_PROMOTION_OR_PORTABLE_SKU_ID_REFUSED')
        kind=row['identityKind']; sourcekey=row['sourceQuantitySpecKey']
        if kind=='CONFIRMED_HISTORICAL_SKU_AT_NEW_WAREHOUSE':
            if row['sourceHistoricalOriginalSkuId']!=sourcekey or row['expectedExistingTargetId']!=sourcekey \
                    or row['targetKey']!='CATALOG:'+sourcekey or not row['evidence']:
                reject('CONFIRMED_ORIGINAL_SKU_CHANGED')
        elif kind=='CURRENT_TPLUS_SOURCE_SPEC_OBSERVATION':
            facts=row['sourceOriginalFacts']
            if row['sourceHistoricalOriginalSkuId'] is not None or row['expectedExistingTargetId'] is not None \
                    or row['targetKey']!='CURRENT_OBSERVATION:'+sourcekey \
                    or row.get('t30CandidateDeterministicSkuId')!=facts['sku'] \
                    or row.get('rawSourceProvidedSkuId') is not None \
                    or row.get('candidateIdIsAdmittedHistoricalIdentity') is not False \
                    or row.get('candidateIdOrigin')!='T30_CLEANER_GENERATED_CANDIDATE_NOT_RAW_TPLUS_DATABASE_ID' \
                    or not facts['sourceGroup'] or not facts['sourceCode'] \
                    or not row['evidence']['targetInventorySourceRows'] \
                    or row['catalogDisplayCandidatesAreQuantityBinding'] is not False \
                    or row['reuseDisplayCandidateAsTargetAllowed'] is not False:
                reject('OBSERVED_SOURCE_IDENTITY_PROMOTED_OR_MERGED')
        elif kind=='T03_CORRECTED_CURRENT_SPEC':
            approved=row['approvedCurrentSpecification']; corrected=row['correctedSpec']
            code=row['exactPrimaryBarcode']; ref=row['evidence']['sourceBarcodeRecord']
            if row['sourceHistoricalOriginalSkuId'] is not None \
                    or sourcekey!='T03_CORRECTED_SPEC:'+code \
                    or row['correctedFit'] not in ['A','B'] \
                    or approved['fit']!=row['correctedFit'] or corrected['fit']!=row['correctedFit'] \
                    or corrected['newBarcode']!=code or ref['code']!=code \
                    or ref['skuKey']!=row['catalogKey'] or row['targetKey']!='CATALOG:'+row['catalogKey'] \
                    or ref['productKey']!=row['productCode'] \
                    or corrected['size']!=approved['size']['name'] \
                    or corrected['color']!=approved['color']['name'] \
                    or row['historicalRelatedIdsAreQuantityEquivalence'] is not False:
                reject('EXACT_APPROVED_FIT_BARCODE_BINDING_REQUIRED')
        else:reject('UNSUPPORTED_QUANTITY_NAMESPACE')
        if row['allocation']!=('GENERATE_IN_ACTUAL_TARGET' if row['expectedExistingTargetId'] is None else 'PRESERVE_PROVEN_ID'):
            reject('TARGET_ALLOCATION_POLICY_MISMATCH')
    seen=set();projections=set()
    for row in plan['pendingKeys']:
        whcode,key,unit=row['dimensionKey'];spec=sk.get(key); frozen=row['frozenQuantityRow']
        if spec is None or whcode not in wh or unit not in spec['measurementUnits'] \
                or whcode not in spec['warehouseCodes'] or row['measurementUnit']!=unit:
            reject('DIMENSION_OUTSIDE_EXPLICIT_SOURCE_COVERAGE')
        if row['dimensionKey']!=frozen['dimensionKey'] or fingerprint(frozen)!=row['sourceRowSha256'] \
                or frozen['openingNature']!='DERIVED_FROM_TARGET_INVENTORY':
            reject('CONFIRMED_QUANTITY_WITNESS_CHANGED')
        if row['historicalOriginalSkuId']!=spec['sourceHistoricalOriginalSkuId'] \
                or row['historicalOriginalSkuId']!=frozen['sourceHistoricalOriginalSkuId'] \
                or row['historicalOriginalWarehouseId']!=frozen['warehouseOriginalId'] \
                or row['skuTargetKey']!=spec['targetKey'] \
                or row['warehouseTargetKey']!=wh[whcode]['targetKey'] \
                or row['quantityNamespace']!=spec['quantityNamespace']:
            reject('SOURCE_ORIGINAL_KEYS_OR_NAMESPACE_REPLACED')
        dimension=tuple(row['dimensionKey']);projected=(row['warehouseTargetKey'],row['skuTargetKey'],unit)
        if dimension in seen or projected in projections:reject('DUPLICATE_OR_MERGED_QUANTITY_DIMENSION')
        seen.add(dimension);projections.add(projected)
    if len(seen)!=1767 or len(sk)!=987 or plan['fullKeyProjectionCheck']['duplicateTargetDimensions']!=0:
        reject('CURRENT_KEY_COVERAGE_MISMATCH')
    requests=requirements(plan)
    ids=set()
    for r in requests:
        if r['expectedExistingTargetId'] is not None:
            key=(r['kind'],r['expectedExistingTargetId'])
            if key in ids:reject('AMBIGUOUS_KNOWN_TARGET_ID')
            ids.add(key)
    if batch_fingerprint(plan)!=plan['batchId']:reject('PACKAGE_BATCH_FINGERPRINT_MISMATCH')
    return {'pendingKeys':len(seen),'specifications':len(sk),
            'allocationRequests':len(requests),'newTargetIds':sum(r['expectedExistingTargetId'] is None for r in requests)}

def load_package(path,expected_sha256):
    blob=Path(path).read_bytes()
    if hashlib.sha256(blob).hexdigest()!=expected_sha256:reject('PACKAGE_FILE_HASH_MISMATCH')
    plan=json.loads(gzip.decompress(blob));validate(plan);return plan

def resolve_all(plan,receipt,expected_target_binding):
    """Pure contract entry T33 can call after its own bound target readback.

    receipt.targetBinding must be emitted/verified by the actual T33 consumer,
    including database, cluster/instance ID, dataClass and its binding hash.
    This function validates identity results, not database connection evidence.
    """
    validate(plan)
    if receipt.get('schemaVersion')!='T32-QUANTITY-TARGET-RECEIPT-v1' \
            or receipt.get('batchId')!=plan['batchId'] or not receipt.get('targetBinding') \
            or receipt['targetBinding'].get('dataClass')!='NON_FINAL' \
            or receipt['targetBinding']!=expected_target_binding \
            or receipt.get('actualTargetReadbackPerformed') is not True:
        reject('ACTUAL_BOUND_TARGET_RECEIPT_REQUIRED')
    rows={(r['kind'],r['targetKey']):r for r in receipt['allocations']}
    requests=requirements(plan)
    if len(rows)!=len(receipt['allocations']) or set(rows)!={(r['kind'],r['targetKey']) for r in requests}:
        reject('TARGET_ALLOCATION_COVERAGE_MISMATCH')
    seen=set()
    for req in requests:
        actual=rows[(req['kind'],req['targetKey'])]; tid=actual['targetId']
        if not re.fullmatch(r'[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}',tid):reject('TARGET_UUID_REQUIRED')
        if req['expectedExistingTargetId'] is not None and tid!=req['expectedExistingTargetId']:
            reject('PROVEN_ORIGINAL_TARGET_ID_REPLACED')
        if req['expectedExistingTargetId'] is None and actual.get('generatedInThisTarget') is not True:
            reject('NEW_ID_NOT_GENERATED_IN_BOUND_TARGET')
        key=(req['kind'],tid)
        if key in seen:reject('TARGET_IDENTITIES_MERGED')
        seen.add(key)
    result=[];keys=set()
    for row in plan['pendingKeys']:
        wh=rows[('WAREHOUSE',row['warehouseTargetKey'])]['targetId']
        sku=rows[('SKU',row['skuTargetKey'])]['targetId']
        key=(wh,sku,row['measurementUnit'])
        if key in keys:reject('BOUND_QUANTITY_DIMENSIONS_MERGED')
        keys.add(key)
        result.append({'sourceDimensionKey':row['dimensionKey'],
                       'targetDimensionKey':list(key),
                       'historicalOriginalWarehouseId':row['historicalOriginalWarehouseId'],
                       'historicalOriginalSkuId':row['historicalOriginalSkuId'],
                       'quantityNamespace':row['quantityNamespace'],
                       'frozenQuantityRow':row['frozenQuantityRow'],
                       'sourceRowSha256':row['sourceRowSha256']})
    return {'schemaVersion':'T32-BOUND-CURRENT-QUANTITY-DIMENSIONS-v7',
            'batchId':plan['batchId'],'targetBinding':receipt['targetBinding'],
            'receiptSha256':fingerprint(receipt),'dataClass':'NON_FINAL',
            'quantitySelectionPolicy':plan['quantitySelectionPolicy'],
            'openingNature':plan['openingNature'],'productionAuthorized':False,
            'targetIdsPortable':False,'quantityValuesChanged':False,'dimensions':result}

def _native():
    import t32_identity_consumer
    return t32_identity_consumer

def native_apply(plan,target,fault_after_allocations=False):
    """Delta verification store only. Known rows must already exist in a QA fixture.

    T33 must verify/create records in its own approved target model and emit the
    same receipt shape; the T32 fixture schema is not a production adapter.
    """
    validate(plan);native=_native();native.verify_connection(target)
    payload_sha=fingerprint(plan)
    exists=native.sql(target,"SELECT to_regclass('t32_quantity.run') IS NOT NULL;")=='t'
    if exists:
        old=native.sql(target,'SELECT payload_sha FROM t32_quantity.run;')
        if old!=payload_sha:reject('DIFFERENT_CURRENT_QUANTITY_BATCH_REFUSED')
        return {'status':'REUSED_BOUND_CURRENT_QUANTITY_BATCH','writes':0}
    data=base64.b64encode(canonical(requirements(plan)).encode()).decode()
    body=base64.b64encode(canonical(plan).encode()).decode()
    sql="""
BEGIN;
CREATE SCHEMA t32_quantity;
CREATE TABLE t32_quantity.run(batch_id text PRIMARY KEY,payload_sha text NOT NULL);
CREATE TABLE t32_quantity.allocation(kind text,target_key text,target_id uuid NOT NULL DEFAULT gen_random_uuid(),
 generated boolean NOT NULL,PRIMARY KEY(kind,target_key),UNIQUE(kind,target_id));
CREATE TEMP TABLE requests(body jsonb) ON COMMIT DROP;
"""+"INSERT INTO requests VALUES(convert_from(decode('"+data+"','base64'),'utf8')::jsonb);"+"""
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM requests r CROSS JOIN LATERAL jsonb_array_elements(r.body) v
   LEFT JOIN t32_quantity_fixture.catalog c ON c.kind=v->>'kind' AND c.id=(v->>'expectedExistingTargetId')::uuid
   WHERE v->>'expectedExistingTargetId' IS NOT NULL AND c.id IS NULL)
 THEN RAISE EXCEPTION 'known_target_missing'; END IF;
END $$;
INSERT INTO t32_quantity.allocation(kind,target_key,target_id,generated)
 SELECT v->>'kind',v->>'targetKey',(v->>'expectedExistingTargetId')::uuid,false
 FROM requests r CROSS JOIN LATERAL jsonb_array_elements(r.body) v WHERE v->>'expectedExistingTargetId' IS NOT NULL;
INSERT INTO t32_quantity.allocation(kind,target_key,generated)
 SELECT v->>'kind',v->>'targetKey',true
 FROM requests r CROSS JOIN LATERAL jsonb_array_elements(r.body) v WHERE v->>'expectedExistingTargetId' IS NULL;
"""
    if fault_after_allocations:sql+="SELECT 1/0;"
    sql+="""
CREATE TABLE t32_quantity.source_spec(source_key text PRIMARY KEY,namespace text NOT NULL,original_sku_id uuid,
 target_key text NOT NULL,body jsonb NOT NULL);
CREATE TABLE t32_quantity.dimension(source_key jsonb PRIMARY KEY,warehouse_id uuid NOT NULL,sku_id uuid NOT NULL,
 unit text NOT NULL,body jsonb NOT NULL,UNIQUE(warehouse_id,sku_id,unit));
CREATE TEMP TABLE plan(body jsonb) ON COMMIT DROP;
"""+"INSERT INTO plan VALUES(convert_from(decode('"+body+"','base64'),'utf8')::jsonb);"+"""
INSERT INTO t32_quantity.source_spec SELECT v->>'sourceQuantitySpecKey',v->>'quantityNamespace',
 (v->>'sourceHistoricalOriginalSkuId')::uuid,v->>'targetKey',v
 FROM plan p CROSS JOIN LATERAL jsonb_array_elements(p.body->'specifications') v;
INSERT INTO t32_quantity.dimension SELECT v->'dimensionKey',w.target_id,s.target_id,v->>'measurementUnit',v
 FROM plan p CROSS JOIN LATERAL jsonb_array_elements(p.body->'pendingKeys') v
 JOIN t32_quantity.allocation w ON w.kind='WAREHOUSE' AND w.target_key=v->>'warehouseTargetKey'
 JOIN t32_quantity.allocation s ON s.kind='SKU' AND s.target_key=v->>'skuTargetKey';
CREATE FUNCTION t32_quantity.immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 RAISE EXCEPTION 'immutable_quantity_admission'; END $$;
"""
    for table in ['run','allocation','source_spec','dimension']:
        sql+=f'CREATE TRIGGER no_mutation BEFORE UPDATE OR DELETE OR TRUNCATE ON t32_quantity.{table} FOR EACH STATEMENT EXECUTE FUNCTION t32_quantity.immutable();'
    sql+="INSERT INTO t32_quantity.run VALUES('"+plan['batchId']+"','"+payload_sha+"');COMMIT;"
    native.sql(target,sql)
    return {'status':'APPLIED_BOUND_CURRENT_QUANTITY_IDENTITIES_ONLY',
            'writes':len(requirements(plan))+len(plan['specifications'])+len(plan['pendingKeys'])+1,
            'inventoryQuantityWrites':0}

def native_receipt(plan,target):
    native=_native();native.verify_connection(target)
    actual=native.sql(target,'SELECT payload_sha FROM t32_quantity.run;')
    if actual!=fingerprint(plan):reject('TARGET_STORED_BATCH_MISMATCH')
    rows=json.loads(native.sql(target,"SELECT json_agg(json_build_object('kind',kind,'targetKey',target_key,'targetId',target_id,'generatedInThisTarget',generated) ORDER BY kind,target_key) FROM t32_quantity.allocation;"))
    binding={'dataClass':'NON_FINAL','environment':'qa','clusterId':target['clusterId'],
             'database':target['database'],'nonce':target['nonce'],
             'targetContractSha256':fingerprint(target)}
    return {'schemaVersion':'T32-QUANTITY-TARGET-RECEIPT-v1','batchId':plan['batchId'],
            'targetBinding':binding,'actualTargetReadbackPerformed':True,'allocations':rows}
