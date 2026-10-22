import { randomUUID } from 'node:crypto';
import { requireDomain } from '../../../packages/domain/src/errors.ts';
import { entityId, quantity } from '../../../packages/domain/src/values.ts';
import { checkedInventoryActor } from '../../../packages/application/src/inventory-query-service.ts';
import { checkedInventoryScope } from '../../../packages/application/src/inventory-query-validation.ts';
import { checkedProductDetailsScope, checkedProductStockPage, parseProductDetailsPageQuery, checkedProductStockOverviewScope, parseProductStockOverviewQuery, checkedProductStockOverviewResult } from '../../../packages/application/src/product-details-query-validation.ts';
import { checkedNativeRuntime26Capability } from '../../../packages/application/src/native-import-schema-contract.ts';
import type { NativeRuntime26Capability } from '../../../packages/application/src/native-import-schema-contract.ts';
import { COMPLETE_SCOPE_DECISION } from '../../../packages/application/src/inventory-cutoff-import.ts';
import { decodeImportCheckpoint } from './inventory-cutoff-import-store.ts';
import { assertHistoryPublicationSchema19 } from '../../../packages/application/src/history-typed-publication.ts';
import { assertNativeImportAccountingSchema19Guards } from './native-import-accounting-capability.ts';
import { readInventoryKeyAdmissions } from './inventory-key-admission-reader.ts';
import type { InventoryAdmissionRuntime } from './inventory-key-admission-reader.ts';
import type { InventoryQuery, InventoryQueryAuthorization } from '../../../packages/application/src/inventory-query-contracts.ts';
import type { ProductDetailsPageQuery, ProductDetailsScopedRead, ProductWarehouseStockPage, ProductWarehouseStockReader, ProductStockOverviewScopedRead, ProductStockOverviewResult } from '../../../packages/application/src/product-details-query-ports.ts';
import type { PgSalesClient, PgSalesPool } from './sales-unit-of-work.ts';

const must = (ok: unknown, code = 'INVENTORY_INTEGRITY_FAILED') => requireDomain(ok, code, 'Product warehouse inventory is unavailable');
const active = (signal: AbortSignal) => must(!signal.aborted, 'INVENTORY_READ_ABORTED');
const numericCount = (v: unknown): bigint => { must(typeof v === 'string' && /^(0|[1-9]\d*)$/.test(v)); return BigInt(v as string); };

/** Product stock v1: a product grant never substitutes for current inventory/warehouse authorization.
 * Rows are actual SKU identities × authorized warehouses, paged in SQL; no stock zeroes are persisted.
 * Exact19 works through its published import membership. New-creation qualification remains closed
 * until D1 supplies an independently validated EXACT23/24 runtime capability.
 */
export class PostgresProductWarehouseStockReader implements ProductWarehouseStockReader {
  private readonly pool: PgSalesPool;
  private readonly authorize: InventoryQueryAuthorization['authorize'];
  private readonly runtime: InventoryAdmissionRuntime | null;
  private readonly runtime26: NativeRuntime26Capability | undefined;
  constructor(pool: PgSalesPool, authorization: InventoryQueryAuthorization, runtime: InventoryAdmissionRuntime | null = null, runtime26?: NativeRuntime26Capability) {
    if (typeof pool?.connect !== 'function' || typeof authorization?.authorize !== 'function') throw TypeError('Explicit inventory authorization and pool required');
    if (runtime !== null && (!['EXACT23', 'EXACT24'].includes(runtime.profile) || typeof runtime.assertReady !== 'function')) throw TypeError('Explicit D1 admission runtime required');
    this.pool = pool; this.authorize = authorization.authorize.bind(authorization);
    this.runtime = runtime === null ? null : Object.freeze({ profile: runtime.profile, assertReady: runtime.assertReady.bind(runtime) });
    this.runtime26 = checkedNativeRuntime26Capability(runtime26);
  }
  async readStock(read: ProductDetailsScopedRead<ProductDetailsPageQuery>): Promise<ProductWarehouseStockPage | null> {
    checkedProductDetailsScope(read); must(read.intent.kind === 'stock', 'FORBIDDEN');
    const actor = checkedInventoryActor(read.actor), parameters = parseProductDetailsPageQuery(read.parameters), signal = read.signal;
    const productId = entityId('product', parameters.productId);
    const request: InventoryQuery = { page: 1, pageSize: 100, filter: { productIds: [productId], categoryIds: [], warehouseIds: [], supplierIds: [], fitIds: [], seasonIds: [] } };
    const scope = checkedInventoryScope(await this.authorize(actor, { kind: 'inventory', parameters: request }, signal)); active(signal);
    const client = await this.pool.connect(); let began = false, committing = false, committed = false, discard: Error | undefined;
    const query: PgSalesClient['query'] = (sql, values) => { active(signal); return client.query(sql, values); };
    try {
      await query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); began = true;
      const versions = (await query('/* product-stock:schema */ SELECT array_agg(version ORDER BY version) versions FROM naijue_erp.schema_migration')).rows;
      must(versions.length === 1 && Array.isArray(versions[0]!.versions), 'INVENTORY_NOT_READY');
      const profile = versions[0]!.versions as unknown[];
      const legacy = profile.length === 19;
      if (legacy) { assertHistoryPublicationSchema19(profile); await assertNativeImportAccountingSchema19Guards({ query, release() { throw Error('Cannot release borrowed stock client'); } }); }
      else {
        must(this.runtime !== null && profile.length === (this.runtime.profile === 'EXACT23' ? 23 : 24)
          && profile.every((n, i) => n === i + 1), 'INVENTORY_NOT_READY');
        await this.runtime!.assertReady({ query });
      }
      const products = (await query('/* product-stock:product */ SELECT id FROM naijue_erp.product WHERE id=$1::uuid LIMIT 2', [productId])).rows;
      must(products.length <= 1); if (products.length === 0) { committing = true; await query('COMMIT'); committed = true; active(signal); return null; }
      must(products[0]!.id === productId);
      const publication = (await query(`/* product-stock:publication */ SELECT b.id,b.checkpoint,b.completed_at IS NOT NULL completed,
        EXISTS(SELECT 1 FROM naijue_erp.import_record r WHERE r.import_batch_id=b.id AND r.status='IMPORTED'
          AND r.target_type='IMPORT_BATCH' AND r.target_id=b.id AND r.source_entity_type='INVENTORY_SCOPE_APPROVAL'
          AND r.source_key='FINAL_COMPLETE_SCOPE' AND r.decision_reason=$1 AND r.source_record_hash=b.source_hash
          AND r.source_file_ref=b.source_manifest_ref) final_approval
        FROM naijue_erp.import_batch b WHERE b.status='IMPORTED' AND b.inventory_mode='CUTOFF_STOCK_BASELINE' ORDER BY b.id LIMIT 2`, [COMPLETE_SCOPE_DECISION])).rows;
      must(publication.length > 0, 'INVENTORY_NOT_READY'); must(publication.length === 1 && publication[0]!.completed === true && publication[0]!.final_approval === true);
      const batchId = entityId('operation', publication[0]!.id as string), checkpoint = decodeImportCheckpoint(publication[0]!.checkpoint);
      must(checkpoint.sequence > 0 && checkpoint.expected.IMPORT_BATCH === 1 && Object.entries(checkpoint.expected).every(([k, n]) => checkpoint.counts[k as keyof typeof checkpoint.counts] === n)
        && checkpoint.cursor === Object.values(checkpoint.counts).reduce((sum, n) => sum + n, 0));
      const warehouses = (await query(`/* product-stock:warehouses */ SELECT w.id,w.hall_id,w.name FROM naijue_erp.warehouse w
        JOIN naijue_erp.hall h ON h.id=w.hall_id WHERE w.id=ANY($1::uuid[]) AND w.hall_id=ANY($2::uuid[]) ORDER BY array_position($1::uuid[],w.id)`,
      [scope.warehouses.map(w => w.id), scope.hallIds])).rows;
      must(warehouses.length === scope.warehouses.length);
      warehouses.forEach((w, i) => { const expected = scope.warehouses[i]!; must(w.id === expected.id && w.hall_id === expected.hallId && w.name === expected.label); });
      const counts = (await query(`/* product-stock:count */ SELECT count(*)::text total,
        coalesce(bool_and(EXISTS(SELECT 1 FROM naijue_erp.size_group_member m WHERE m.size_group_id=p.size_group_id AND m.size_id=s.size_id)),true) valid_sizes
        FROM naijue_erp.sku s JOIN naijue_erp.product p ON p.id=s.product_id WHERE s.product_id=$1::uuid`, [productId])).rows;
      must(counts.length === 1 && counts[0]!.valid_sizes === true);
      const total = numericCount(counts[0]!.total) * BigInt(warehouses.length); must(total <= BigInt(Number.MAX_SAFE_INTEGER), 'INVENTORY_READ_TOO_LARGE');
      const rows = (await query(`/* product-stock:page */ SELECT w.id warehouse_id,w.name warehouse_name,s.id sku_id,
        b.warehouse_id IS NOT NULL balance_present,b.quantity::text quantity,b.version,b.last_operation_id,
        EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger l WHERE l.warehouse_id=w.id AND l.sku_id=s.id) ledger_present,
        EXISTS(SELECT 1 FROM naijue_erp.import_record r WHERE r.import_batch_id=$4::uuid AND r.status='IMPORTED' AND r.target_type='WAREHOUSE' AND r.target_id=w.id) warehouse_published,
        EXISTS(SELECT 1 FROM naijue_erp.import_record r WHERE r.import_batch_id=$4::uuid AND r.status='IMPORTED' AND r.target_type='SKU' AND r.target_id=s.id) sku_published
        FROM naijue_erp.sku s CROSS JOIN naijue_erp.warehouse w
        LEFT JOIN naijue_erp.inventory_balance b ON b.warehouse_id=w.id AND b.sku_id=s.id
        WHERE s.product_id=$1::uuid AND w.id=ANY($2::uuid[]) AND w.hall_id=ANY($3::uuid[])
        ORDER BY array_position($2::uuid[],w.id),s.sku_code COLLATE "C",s.id LIMIT $5 OFFSET $6::bigint`,
      [productId, scope.warehouses.map(w => w.id), scope.hallIds, batchId, parameters.pageSize, String((parameters.page - 1) * parameters.pageSize)])).rows;
      must(rows.length <= parameters.pageSize);
      const admissions = legacy ? null : await readInventoryKeyAdmissions({ query }, rows.map(r => ({ warehouseId: r.warehouse_id as string, skuId: r.sku_id as string })));
      const items = rows.map((r, i) => {
        entityId('sku', r.sku_id as string); const w = scope.warehouses.find(w => w.id === r.warehouse_id);
        must(w && r.warehouse_name === w.label && typeof r.balance_present === 'boolean' && typeof r.ledger_present === 'boolean');
        must(typeof r.warehouse_published === 'boolean' && typeof r.sku_published === 'boolean');
        if (r.balance_present) { must(r.ledger_present === true && typeof r.quantity === 'string' && Number.isSafeInteger(r.version) && (r.version as number) > 0); quantity(r.quantity as string); entityId('operation', r.last_operation_id as string); }
        else must(r.quantity === null && r.version === null && r.last_operation_id === null && r.ledger_present === false);
        const admission = admissions?.[i]; if (admission?.admitted) must(admission.publishedBatchId === batchId);
        const admitted = legacy ? r.warehouse_published === true && r.sku_published === true : admission!.admitted;
        return { warehouseId: w!.id, warehouseName: w!.label, skuId: r.sku_id as string,
          quantity: admitted ? r.balance_present ? r.quantity as string : '0' : null, state: admitted ? 'KNOWN' as const : 'UNKNOWN' as const };
      });
      const result = checkedProductStockPage({ productId, page: parameters.page, pageSize: parameters.pageSize, total: Number(total), items }, parameters);
      active(signal); committing = true; await query('COMMIT'); committed = true; active(signal); return result;
    } catch (error) {
      if (!committed && (!began || committing)) discard = error instanceof Error ? error : Error('Product stock outcome unknown');
      if (began && !committing) try { await client.query('ROLLBACK'); } catch (rollback) { discard = rollback instanceof Error ? rollback : Error('Stock rollback failed'); throw new AggregateError([error, rollback], 'Product stock read failed'); }
      throw error;
    } finally { client.release(discard); }
  }
  async readOverview(read: ProductStockOverviewScopedRead): Promise<ProductStockOverviewResult | null> {
    checkedProductStockOverviewScope(read);
    const actor = checkedInventoryActor(read.actor), parameters = parseProductStockOverviewQuery(read.parameters), signal = read.signal;
    const productId = entityId('product', parameters.productId);
    const request: InventoryQuery = { page: 1, pageSize: 100, filter: { productIds: [productId], categoryIds: [], warehouseIds: [], supplierIds: [], fitIds: [], seasonIds: [] } };
    const scope = checkedInventoryScope(await this.authorize(actor, { kind: 'inventory', parameters: request }, signal)); active(signal);
    const client = await this.pool.connect(); let began = false, committing = false, committed = false, discard: Error | undefined;
    const query: PgSalesClient['query'] = (sql, values) => { active(signal); return client.query(sql, values); };
    try {
      await query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); began = true;
      const versions = (await query('/* product-overview:schema */ SELECT array_agg(version ORDER BY version) versions FROM naijue_erp.schema_migration')).rows;
      must(versions.length === 1 && Array.isArray(versions[0]!.versions), 'INVENTORY_NOT_READY');
      const profile = versions[0]!.versions as unknown[], legacy = profile.length === 19;
      if (legacy) { assertHistoryPublicationSchema19(profile); await assertNativeImportAccountingSchema19Guards({ query, release() { throw Error('Cannot release borrowed overview client'); } }); }
      else {
        must(this.runtime26 !== undefined && profile.length === 26 && profile.every((n, i) => n === i + 1), 'INVENTORY_NOT_READY');
        await this.runtime26!.assertReady(client, 'INVENTORY_ADMISSION');
      }
      const products = (await query('/* product-overview:product */ SELECT id FROM naijue_erp.product WHERE id=$1::uuid LIMIT 2', [productId])).rows;
      must(products.length <= 1); if (products.length === 0) { committing = true; await query('COMMIT'); committed = true; active(signal); return null; }
      must(products[0]!.id === productId);
      const publication = (await query(`/* product-overview:publication */ SELECT b.id,b.checkpoint,b.completed_at IS NOT NULL completed,
        EXISTS(SELECT 1 FROM naijue_erp.import_record r WHERE r.import_batch_id=b.id AND r.status='IMPORTED'
          AND r.target_type='IMPORT_BATCH' AND r.target_id=b.id AND r.source_entity_type='INVENTORY_SCOPE_APPROVAL'
          AND r.source_key='FINAL_COMPLETE_SCOPE' AND r.decision_reason=$1 AND r.source_record_hash=b.source_hash
          AND r.source_file_ref=b.source_manifest_ref) final_approval
        FROM naijue_erp.import_batch b WHERE b.status='IMPORTED' AND b.inventory_mode='CUTOFF_STOCK_BASELINE' ORDER BY b.id LIMIT 2`, [COMPLETE_SCOPE_DECISION])).rows;
      must(publication.length > 0, 'INVENTORY_NOT_READY'); must(publication.length === 1 && publication[0]!.completed === true && publication[0]!.final_approval === true);
      const batchId = entityId('operation', publication[0]!.id as string), checkpoint = decodeImportCheckpoint(publication[0]!.checkpoint);
      must(checkpoint.sequence > 0 && checkpoint.expected.IMPORT_BATCH === 1 && Object.entries(checkpoint.expected).every(([k, n]) => checkpoint.counts[k as keyof typeof checkpoint.counts] === n)
        && checkpoint.cursor === Object.values(checkpoint.counts).reduce((sum, n) => sum + n, 0));
      const warehouseIds = scope.warehouses.map(w => w.id);
      const warehouses = (await query(`/* product-overview:warehouses */ SELECT w.id,w.hall_id,w.name FROM naijue_erp.warehouse w
        JOIN naijue_erp.hall h ON h.id=w.hall_id WHERE w.id=ANY($1::uuid[]) AND w.hall_id=ANY($2::uuid[]) ORDER BY array_position($1::uuid[],w.id)`,
      [warehouseIds, scope.hallIds])).rows;
      must(warehouses.length === scope.warehouses.length);
      warehouses.forEach((w, i) => { const expected = scope.warehouses[i]!; must(w.id === expected.id && w.hall_id === expected.hallId && w.name === expected.label); });
      const coverage = (await query(`/* product-overview:coverage */ SELECT NOT EXISTS(SELECT 1 FROM naijue_erp.warehouse w
        WHERE NOT(w.id=ANY($1::uuid[]) AND w.hall_id=ANY($2::uuid[]))) full_coverage`, [warehouseIds, scope.hallIds])).rows;
      must(coverage.length === 1 && typeof coverage[0]!.full_coverage === 'boolean');
      const counted = (await query(`/* product-overview:sku-count */ SELECT count(*)::text total,
        coalesce(bool_and(EXISTS(SELECT 1 FROM naijue_erp.size_group_member m WHERE m.size_group_id=p.size_group_id AND m.size_id=s.size_id)),true) valid_sizes
        FROM naijue_erp.sku s JOIN naijue_erp.product p ON p.id=s.product_id WHERE s.product_id=$1::uuid`, [productId])).rows;
      must(counted.length === 1 && counted[0]!.valid_sizes === true);
      const skuCount = numericCount(counted[0]!.total);
      must(skuCount > 0n, 'INVENTORY_NOT_READY'); must(skuCount * BigInt(warehouseIds.length) <= 1000000n, 'INVENTORY_READ_TOO_LARGE');
      // The one bounded grouped query covers ALL native keys. No old paginated
      // read, balance-presence SKU filter, UI page summation or per-key JS query.
      const resultRows = (await query(`/* product-overview:aggregate */ WITH authorized_warehouses AS (
        SELECT w.id,w.name FROM naijue_erp.warehouse w WHERE w.id=ANY($2::uuid[]) AND w.hall_id=ANY($3::uuid[])
      ), product_skus AS (SELECT s.id FROM naijue_erp.sku s WHERE s.product_id=$1::uuid), facts AS MATERIALIZED (
        SELECT w.id warehouse_id,w.name warehouse_name,s.id sku_id,b.warehouse_id IS NOT NULL balance_present,
          b.quantity,b.version,b.last_operation_id,
          EXISTS(SELECT 1 FROM naijue_erp.inventory_ledger l WHERE l.warehouse_id=w.id AND l.sku_id=s.id) ledger_present,
          ${legacy ? `(EXISTS(SELECT 1 FROM naijue_erp.import_record r WHERE r.import_batch_id=$4::uuid AND r.status='IMPORTED' AND r.target_type='WAREHOUSE' AND r.target_id=w.id)
            AND EXISTS(SELECT 1 FROM naijue_erp.import_record r WHERE r.import_batch_id=$4::uuid AND r.status='IMPORTED' AND r.target_type='SKU' AND r.target_id=s.id)) admitted,
          $4::uuid admitted_batch` : 'a.admitted,a.published_batch_id admitted_batch'}
        FROM authorized_warehouses w CROSS JOIN product_skus s
        LEFT JOIN naijue_erp.inventory_balance b ON b.warehouse_id=w.id AND b.sku_id=s.id
        ${legacy ? '' : 'LEFT JOIN LATERAL naijue_erp.inventory_key_admission(w.id,s.id) a ON true'}
      ) SELECT warehouse_id,warehouse_name,count(*)::text key_count,
        count(*) FILTER(WHERE admitted IS FALSE)::text unknown_keys,
        coalesce(sum(CASE WHEN admitted THEN coalesce(quantity,0)::numeric ELSE 0::numeric END),0)::text known_quantity,
        bool_or(admitted IS NULL OR (admitted AND admitted_batch IS DISTINCT FROM $4::uuid)
          OR (balance_present AND (NOT ledger_present OR quantity IS NULL OR version IS NULL OR version<=0 OR last_operation_id IS NULL))
          OR (NOT balance_present AND (ledger_present OR quantity IS NOT NULL OR version IS NOT NULL OR last_operation_id IS NOT NULL))) invalid
        FROM facts GROUP BY warehouse_id,warehouse_name ORDER BY array_position($2::uuid[],warehouse_id)`,
      [productId, warehouseIds, scope.hallIds, batchId])).rows;
      must(resultRows.length === warehouses.length);
      let unknownKeys = 0, total = 0n;
      const allItems = resultRows.map((row, i) => {
        const expected = scope.warehouses[i]!;
        must(row.warehouse_id === expected.id && row.warehouse_name === expected.label && row.invalid === false && numericCount(row.key_count) === skuCount);
        const unknown = numericCount(row.unknown_keys); must(unknown <= skuCount);
        must(typeof row.known_quantity === 'string' && row.known_quantity.length <= 100 && /^(?:0|[1-9]\d*|-[1-9]\d*)$/.test(row.known_quantity));
        const known = BigInt(row.known_quantity as string); unknownKeys += Number(unknown); total += known;
        return { warehouseId: expected.id, warehouseName: expected.label, state: unknown === 0n ? 'KNOWN' as const : 'UNKNOWN' as const,
          quantity: unknown === 0n ? known.toString() : null, unknownSkuCount: Number(unknown) };
      });
      const nonZero = allItems.filter(row => row.state === 'KNOWN' && row.quantity !== '0').length;
      const unknownWarehouses = allItems.filter(row => row.state === 'UNKNOWN').length;
      const items = parameters.warehouseMode === 'ALL' ? allItems : allItems.filter(row => row.state === 'UNKNOWN' || row.quantity !== '0');
      const result = checkedProductStockOverviewResult({ kind: 'PRODUCT_STOCK_OVERVIEW_V1', productId, warehouseMode: parameters.warehouseMode,
        readReference: `product-stock:${randomUUID()}`, coverage: coverage[0]!.full_coverage ? 'ALL_BUSINESS_WAREHOUSES' : 'AUTHORIZED_SUBSET',
        counts: { authorizedWarehouses: warehouses.length, nonZeroWarehouses: nonZero, zeroWarehouses: warehouses.length - nonZero - unknownWarehouses,
          unknownWarehouses, returnedWarehouses: items.length },
        total: { state: unknownKeys === 0 ? 'KNOWN' : 'UNKNOWN', quantity: unknownKeys === 0 ? total.toString() : null, unknownSkuWarehouseKeys: unknownKeys }, items }, parameters);
      active(signal); committing = true; await query('COMMIT'); committed = true; active(signal); return result;
    } catch (error) {
      if (!committed && (!began || committing)) discard = error instanceof Error ? error : Error('Product overview outcome unknown');
      if (began && !committing) try { await client.query('ROLLBACK'); } catch (rollbackError) { discard = rollbackError instanceof Error ? rollbackError : Error('Overview rollback failed'); throw new AggregateError([error, rollbackError], 'Product overview read failed'); }
      throw error;
    } finally { client.release(discard); }
  }
}
