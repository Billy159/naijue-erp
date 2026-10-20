/** Relations are repository-owned CTE names, never request values. */
function selection(relation: string | undefined): string {
  if (!relation) return '';
  if (!/^[a-z][a-z_]*$/.test(relation)) throw new Error('Invalid inventory SKU relation');
  return ` AND EXISTS(SELECT 1 FROM ${relation} selected WHERE selected.sku_id=v.id)`;
}
function sourceSkus(source: string, relation: string | undefined, name: string): string {
  return `${name} AS MATERIALIZED (
      SELECT v.id,v.product_id,v.enabled,v.version,
        (SELECT jsonb_object_agg(d.code,jsonb_build_object('id',s.id,'code',s.code,'name',s.name))
          FROM ${source}.variant_option o JOIN ${source}.spec_dimension d ON d.id=o.dimension_id JOIN ${source}.spec_value s ON s.id=o.spec_value_id WHERE o.variant_id=v.id) options
      FROM ${source}.variant v WHERE true${selection(relation)}
    )`;
}
/** Quantity identity does not require specifications, display names or standard mappings. */
export function inventorySkuIdentitySql(source: string, runtime: string): string {
  return `sku_identities AS (
    SELECT id,product_id FROM ${source}.variant
    UNION ALL SELECT v.id,v.product_id FROM ${runtime}.variant_overlay v
    WHERE NOT EXISTS(SELECT 1 FROM ${source}.variant src WHERE src.id=v.id)
  )`;
}
/** Keyword search retains every original dimension, before pagination, without verifying display packs. */
export function inventorySkuOptionsSql(source: string, runtime: string, relation: string): string {
  return `${sourceSkus(source,relation,'search_source_skus')}, search_options AS MATERIALIZED (
    SELECT id,options FROM search_source_skus
    UNION ALL SELECT v.id,jsonb_build_object('SIZE',jsonb_build_object('id',v.size_id,'code',v.size_code,'name',v.size_name),
      'COLOR',jsonb_build_object('id',v.color_id,'code',coalesce(c.code,cm.body->>'code'),'name',coalesce(cm.body->>'name',c.name)))
    FROM ${runtime}.variant_overlay v LEFT JOIN ${source}.spec_value c ON c.id=v.color_id
    LEFT JOIN ${runtime}.product_master_overlay cm ON cm.kind='colors' AND cm.id=v.color_id::text
    WHERE NOT EXISTS(SELECT 1 FROM ${source}.variant src WHERE src.id=v.id)${selection(relation)}
  )`;
}
/** Specs are calculated once per selected SKU, rather than once per warehouse cell or mapping expression. */
export function inventorySkuDisplaySql(source: string, runtime: string, relation?: string): string {
  return `${sourceSkus(source,relation,'source_skus')}, mapped AS MATERIALIZED (
      SELECT v.*,m.value->'items'->v.id::text mapping,m.value->>'revision' mapping_revision,m.value->>'packSha256' mapping_pack_sha256,
        (m.value->>'packSha256') ~ '^[0-9a-f]{64}$'
        AND m.value->'items'->v.id::text #>> '{source,sku}'=v.id::text
        AND m.value->'items'->v.id::text #>> '{source,product}'=p.code
        AND m.value->'items'->v.id::text #>> '{source,color}'=v.options #>> '{COLOR,code}'
        AND m.value->'items'->v.id::text #>> '{source,sourceCode}'=v.options #>> '{SIZE,code}'
        AND m.value->'items'->v.id::text #>> '{source,sourceSize}'=v.options #>> '{SIZE,name}'
        AND m.value->'items'->v.id::text #>> '{source,sourceGroup}'=coalesce(g.name,ps.source_payload->>'sourceSizeGroupName',ps.source_payload->>'sourceSizeGroupCode')
        AND coalesce(m.value->'items'->v.id::text #>> '{target,group}','')<>''
        AND coalesce(m.value->'items'->v.id::text #>> '{target,fit}','')<>''
        AND coalesce(m.value->'items'->v.id::text #>> '{target,code}','')<>''
        AND coalesce(m.value->'items'->v.id::text #>> '{target,size}','')<>''
        AND (v.options #>> '{SIZE,name}'<>'无尺码' OR m.value->'items'->v.id::text #>> '{target,size}'='无尺码') verified
      FROM source_skus v LEFT JOIN ${source}.product p ON p.id=v.product_id
      LEFT JOIN ${source}.system_setting m ON m.key='inventory.standard-size-mappings'
      LEFT JOIN LATERAL (SELECT source_payload,source_size_group_id FROM ${source}.tplus_product_source ps WHERE ps.product_id=v.product_id
        AND ps.batch_id=(SELECT batch_id FROM ${source}.tplus_import_run WHERE status='COMMITTED' ORDER BY committed_at DESC NULLS LAST,started_at DESC LIMIT 1)) ps ON true
      LEFT JOIN ${source}.size_group g ON g.id=ps.source_size_group_id
    ), skus AS (
      SELECT id,product_id,enabled,version,'SOURCE'::text origin,
        CASE WHEN verified THEN mapping #>> '{target,group}' END standard_group,
        CASE WHEN verified THEN mapping #>> '{target,fit}' END standard_fit,
        CASE WHEN verified THEN mapping #>> '{target,size}' END standard_size,
        CASE WHEN verified THEN mapping #>> '{target,code}' END standard_code,options,
        CASE WHEN verified THEN 'CONFIRMED_SOURCE' WHEN mapping IS NOT NULL THEN 'SOURCE_IDENTITY_MISMATCH' ELSE 'UNMAPPED' END mapping_status,
        mapping_revision,mapping_pack_sha256
      FROM mapped
      UNION ALL SELECT v.id,v.product_id,true,1,'RUNTIME',v.group_name,v.fit_id,v.size_name,v.size_code,
        jsonb_build_object('SIZE',jsonb_build_object('id',v.size_id,'code',v.size_code,'name',v.size_name),
          'COLOR',jsonb_build_object('id',v.color_id,'code',coalesce(c.code,cm.body->>'code'),'name',coalesce(cm.body->>'name',c.name))),'CONFIRMED_RUNTIME',NULL::text,NULL::text
      FROM ${runtime}.variant_overlay v LEFT JOIN ${source}.spec_value c ON c.id=v.color_id
      LEFT JOIN ${runtime}.product_master_overlay cm ON cm.kind='colors' AND cm.id=v.color_id::text
      WHERE NOT EXISTS(SELECT 1 FROM ${source}.variant src WHERE src.id=v.id)${selection(relation)}
    )`;
}
