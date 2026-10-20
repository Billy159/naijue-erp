"""Read current approved fields from T32's bound QA store without rewriting source."""
from t32_identity_consumer import sql, verify_connection

def install(target):
    verify_connection(target)
    sql(target,"""
BEGIN;
CREATE VIEW t32_identity.effective_product AS
 SELECT key,id,body || coalesce(body->'approvedCurrentMasterFields','{}'::jsonb) AS body
 FROM t32_identity.entity WHERE kind='product';
CREATE VIEW t32_identity.effective_party AS
 SELECT id AS source_key,(body->>'historicalId')::uuid AS id,body->>'sourceCode' AS code,
 body->>'originalName' AS name,body->>'confirmedClassification' AS classification,body->'source' AS source
 FROM t32_identity.original WHERE kind='T30_PARTY'
 AND coalesce((body->>'currentViewExcluded')::boolean,false)=false
 AND body->>'confirmedClassification' IN ('supplier','customer');
CREATE VIEW t32_identity.effective_specification AS
 SELECT key,id,body->>'productKey' AS product_key,
 coalesce(body->'approvedCurrentSpecification',body->'explicitCatalogSpecification') AS current_specification,
 body->'originalIdentityFacts' AS original_identity_facts,body->>'newBusinessEnabled' AS new_business_enabled
 FROM t32_identity.entity WHERE kind='sku';
CREATE VIEW t32_identity.effective_image AS
 SELECT i.key,p.id AS product_id,i.body
 FROM t32_identity.image i JOIN t32_identity.entity p ON p.kind='product' AND p.key=i.product_key;
CREATE VIEW t32_identity.history_display AS
 SELECT h.key,h.body->>'originalSkuId' AS historical_sku_id,h.body->>'originalQuantity' AS original_quantity,
 h.body->>'originalUnit' AS original_unit,s.id AS candidate_qa_sku_id,
 false AS candidate_may_replace_original,NULL::numeric AS inventory_contribution,
 h.body AS retained_reference
 FROM t32_identity.history_reference h LEFT JOIN t32_identity.code c
 ON c.kind='PRIMARY' AND c.active AND c.code=h.body->'displayOnly'->>'newBarcode'
 LEFT JOIN t32_identity.entity s ON s.kind='sku' AND s.key=c.sku_key;
COMMIT;
""")

def current_products(target):
    import json
    verify_connection(target)
    return json.loads(sql(target,"SELECT coalesce(json_agg(json_build_object('key',key,'id',id,'body',body)), '[]') FROM t32_identity.effective_product;"))

def resolve_exact_code(target, code):
    import base64,json
    encoded=base64.b64encode(code.encode()).decode()
    verify_connection(target)
    return json.loads(sql(target,"SELECT coalesce(json_agg(json_build_object('skuId',s.id,'productId',p.id,'active',c.active,'kind',c.kind)), '[]') "
        "FROM t32_identity.code c JOIN t32_identity.entity p ON p.kind='product' AND p.key=c.product_key "
        "LEFT JOIN t32_identity.entity s ON s.kind='sku' AND s.key=c.sku_key "
        "WHERE c.code=convert_from(decode('"+encoded+"','base64'),'utf8');"))

def install_retained_fields(target, records):
    """Retain known fields when the new source did not explicitly cover them."""
    import base64,json
    verify_connection(target)
    allowed={'categoryId','unit','price','purchasePrice','supplierCode'}
    for row in records:
        if set(row['retained'])-allowed or set(row['currentSupplement'])-{'supplierCode'} or not row['source']:
            raise ValueError('UNAPPROVED_RETAINED_MASTER_FIELD')
    data=base64.b64encode(json.dumps(records,ensure_ascii=False,separators=(',',':')).encode()).decode()
    sql(target,"""
BEGIN;
CREATE TABLE t32_identity.retained_product_fields(product_key text PRIMARY KEY,expected_id uuid,retained jsonb,
 current_supplement jsonb,source jsonb NOT NULL);
"""+"INSERT INTO t32_identity.retained_product_fields SELECT v->>'productKey',(v->>'expectedId')::uuid,"+
        "v->'retained',v->'currentSupplement',v->'source' FROM jsonb_array_elements(convert_from(decode('"+data+"','base64'),'utf8')::jsonb) v;"+"""
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM t32_identity.retained_product_fields f LEFT JOIN t32_identity.entity e
 ON e.kind='product' AND e.key=f.product_key WHERE e.id IS NULL OR e.id<>f.expected_id)
 THEN RAISE EXCEPTION 'RETAINED_PRODUCT_FIELD_IDENTITY_MISMATCH'; END IF;
END $$;
CREATE OR REPLACE VIEW t32_identity.effective_product AS
 SELECT e.key,e.id,coalesce(f.retained,'{}'::jsonb) || jsonb_strip_nulls(e.body)
 || coalesce(f.current_supplement,'{}'::jsonb) || coalesce(e.body->'approvedCurrentMasterFields','{}'::jsonb) AS body
 FROM t32_identity.entity e LEFT JOIN t32_identity.retained_product_fields f ON f.product_key=e.key
 WHERE e.kind='product';
COMMIT;
""")
