import type {AuthorizedContext} from '../../security/service.js';
import {listMasterRecords, type MasterRecord} from '../../security/master-data.js';

export interface SaleSku {
  id: string; product_id: string; enabled: boolean; product_enabled: boolean;
  unit: string | null; quantity_scale: number | null; minimum_price: string | null;
  product_code: string; product_name: string; color_id: string | null; size_id: string | null;
}
export interface SaleReferences {skus: Map<string,SaleSku>; masters: Map<string,MasterRecord>}

/** Focused reads of T08/T12 identities; no barcode generation or catalogue mutations. */
export async function saleReferences(context: AuthorizedContext, ids: readonly string[]): Promise<SaleReferences> {
  const {session,repo}=context,s=repo.source,r=repo.runtime;
  const rows=(await session.query<SaleSku>(`WITH wanted AS (
      SELECT v.id,v.product_id,v.enabled,NULL::uuid color_id,NULL::uuid size_id FROM ${s}.variant v WHERE v.id=ANY($1::uuid[])
      UNION ALL SELECT v.id,v.product_id,true,v.color_id,v.size_id FROM ${r}.variant_overlay v WHERE v.id=ANY($1::uuid[])
        AND NOT EXISTS(SELECT 1 FROM ${s}.variant src WHERE src.id=v.id)
    ) SELECT v.id::text,v.product_id::text,
      v.enabled AND NOT coalesce(pp.body->'disabledSkuIds' ? v.id::text,false) enabled,
      coalesce((pp.body->>'enabled')::boolean,p.enabled,(po.body->>'enabled')::boolean,true) AND NOT coalesce(po.deleted,false) product_enabled,
      coalesce(u.name,po.body->>'unit') unit,
      coalesce(u.quantity_scale::text,po.body->>'quantityScale')::integer quantity_scale,
      CASE WHEN pp.body ? 'minimumPrice' THEN pp.body->>'minimumPrice' WHEN po.body ? 'minimumPrice' THEN po.body->>'minimumPrice'
        ELSE coalesce(ps.source_payload->>'minimumPrice',ps.source_payload#>>'{source,最低售价}') END minimum_price,
      coalesce(p.code,po.code) product_code,coalesce(pp.body->>'name',p.name,po.body->>'name') product_name,
      coalesce(v.color_id,(SELECT vo.spec_value_id FROM ${s}.variant_option vo JOIN ${s}.spec_dimension d ON d.id=vo.dimension_id WHERE vo.variant_id=v.id AND d.code='COLOR'))::text color_id,
      coalesce(v.size_id,(SELECT vo.spec_value_id FROM ${s}.variant_option vo JOIN ${s}.spec_dimension d ON d.id=vo.dimension_id WHERE vo.variant_id=v.id AND d.code='SIZE'))::text size_id
    FROM wanted v LEFT JOIN ${s}.product p ON p.id=v.product_id LEFT JOIN ${s}.unit u ON u.id=p.unit_id
    LEFT JOIN ${r}.product_overlay po ON po.id=v.product_id LEFT JOIN ${r}.product_profile_overlay pp ON pp.product_id=v.product_id
    LEFT JOIN ${s}.tplus_product_source ps ON ps.product_id=v.product_id AND ps.batch_id=(SELECT batch_id FROM ${s}.tplus_import_run
      WHERE status='COMMITTED' ORDER BY committed_at DESC NULLS LAST,started_at DESC LIMIT 1)`,[ids])).rows;
  const catalog=await listMasterRecords(session,repo);
  return {skus:new Map(rows.map(row=>[row.id,row])),masters:new Map(catalog.records.map(row=>[row.kind+'|'+row.id,row]))};
}

export async function importedSaleBody(context: AuthorizedContext, id: string): Promise<Record<string,unknown>|null> {
  return (await context.session.query<{body:Record<string,unknown>}>(`SELECT body FROM ${context.repo.runtime}.revision
    WHERE document_id=$1::uuid AND original_imported ORDER BY revision LIMIT 1`,[id])).rows[0]?.body??null;
}
