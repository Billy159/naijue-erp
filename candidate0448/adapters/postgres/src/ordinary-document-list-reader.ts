import {HISTORICAL_SALES_HALL_BATCH_CTES,decodeHistoricalSalesHallProjection} from './sales-historical-hall-projection.ts';
import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import type { ActorContext } from '../../../packages/application/src/ports.ts';
import type { DocumentCategorySummary, DocumentProductSummary, SalesListQuery, SalesQueryFilter, SalesReadScope, SalesScopedRead, SalesSummary, SalesSummaryQuantities } from '../../../packages/application/src/sales-query-ports.ts';
import type { TransferListQuery, TransferQueryFilter, TransferReadScope, TransferScopedRead, TransferSummary } from '../../../packages/application/src/transfer-query-ports.ts';
import { checkedSalesReadScope, parseSalesListQuery } from '../../../packages/application/src/sales-query-validation.ts';
import { checkedTransferReadScope, parseTransferListQuery } from '../../../packages/application/src/transfer-query-validation.ts';
import { DomainError, requireDomain } from '../../../packages/domain/src/errors.ts';
import { businessDate, decimalToMinor, entityId, type EntityKind } from '../../../packages/domain/src/values.ts';
import { moneyFromSql, nullableString, stringValue, versionFromSql } from './codec.ts';
import { sourceConfirmedReadIdentityOn, type CurrentIdentity } from './source-confirmed-read-authorization.ts';

export interface PgOrdinaryDocumentResult { readonly rows: Record<string, unknown>[]; readonly rowCount: number | null }
export interface PgOrdinaryDocumentClient {
  query(sql: string, values?: unknown[]): Promise<PgOrdinaryDocumentResult>;
  release(error?: Error | boolean): void;
}
export interface PgOrdinaryDocumentPool { connect(): Promise<PgOrdinaryDocumentClient> }
type PgCompatibility = Pool extends PgOrdinaryDocumentPool ? true : never;
const pgCompatibility: PgCompatibility = true; void pgCompatibility;
/** Host-only capability seam. This module neither issues this proof nor accepts26 as a substitute. */
export interface OrdinaryDocumentRuntime27Capability {
  readonly profile: 'EXACT27'; readonly contract: 'UNIFIED_ORDINARY_RUNTIME27_V1';
  readonly assertReady: (client: object, purpose: 'ORDINARY_DOCUMENT_READ') => Promise<void>;
}
export interface OrdinaryDocumentListOptions {
  readonly profile: 'source-confirmed-ordinary-documents-v1';
  readonly runtime27: OrdinaryDocumentRuntime27Capability;
  /** Verified DB generation shared across API workers, not a process-local random salt. */
  readonly databaseGeneration: string; readonly schemaDigest: string;
}
/** Native27 runtime role enforces publication; no source/provenance table is read by this business query. */
export interface NativeOrdinaryDocumentListOptions {
  readonly profile: 'source-confirmed-unified-native-v1';
  readonly runtime27: OrdinaryDocumentRuntime27Capability;
}
export interface OrdinaryDocumentIdentity {
  readonly dataset: 'LIVE'; readonly batchId: null; readonly documentId: string; readonly effectiveVersion: number;
  readonly productSummary: DocumentProductSummary; readonly categorySummary: DocumentCategorySummary;
}
export type OrdinarySalesSummary = SalesSummary & OrdinaryDocumentIdentity;
export type OrdinaryTransferSummary = TransferSummary & OrdinaryDocumentIdentity;
export interface OrdinaryDocumentPage<T> {
  readonly profile: 'ORDINARY_DOCUMENT_LIST_V1'; readonly page: number; readonly pageSize: number;
  readonly exactTotal: bigint; readonly readRevision: string; readonly items: readonly T[];
}
export interface OrdinarySalesTotalsQuery { readonly filter: SalesQueryFilter; readonly expectedRevision: string }
export interface OrdinaryTransferTotalsQuery { readonly filter: TransferQueryFilter; readonly expectedRevision: string }
export interface OrdinarySalesTotals extends SalesSummaryQuantities {
  readonly grossAmount: bigint; readonly orderDiscount: bigint; readonly netDue: bigint;
}
export interface OrdinaryDocumentTotals<T> {
  readonly profile: 'ORDINARY_DOCUMENT_TOTALS_V1'; readonly readRevision: string; readonly exactTotal: bigint; readonly totals: T;
}
type Kind = 'sales' | 'transfers';
type Scope = SalesReadScope | TransferReadScope;
type Parameters = SalesListQuery | TransferListQuery;
type Query = (sql: string, values?: unknown[]) => Promise<PgOrdinaryDocumentResult>;
const revisionPattern = /^[a-f0-9]{64}$/;
const stamp = (column: string) => `to_char(${column} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
const salesFrom = 'naijue_erp.sales_header h';
const transferFrom = 'naijue_erp.transfer_header h JOIN naijue_erp.warehouse fw ON fw.id=h.from_warehouse_id JOIN naijue_erp.warehouse tw ON tw.id=h.to_warehouse_id';
/** Explicit predicate complements verified runtime-role RLS; it is never an authorization grant. */
export const ORDINARY_DOCUMENT_PUBLICATION_SQL = `naijue_erp.standard_business_ready() AND (h.import_batch_id IS NULL OR EXISTS(SELECT 1 FROM naijue_erp.import_batch b WHERE b.id=h.import_batch_id AND b.status='IMPORTED'))`;
function fail(message: string): never { throw new DomainError('INVALID_DATABASE_VALUE', message); }
function one(result: PgOrdinaryDocumentResult): Record<string, unknown> { if (result.rows.length !== 1) fail('One ordinary aggregate row required'); return result.rows[0]!; }
function exact(value: unknown, unsigned = false): bigint {
  if (typeof value !== 'string' || !(unsigned ? /^(0|[1-9]\d*)$/ : /^(0|[1-9]\d*|-[1-9]\d*)$/).test(value)) fail('Exact ordinary decimal integer required');
  return BigInt(value);
}
function nullableExact(value: unknown, unsigned = false): bigint | null { return value === null ? null : exact(value, unsigned); }
const id = <K extends EntityKind>(kind: K, value: unknown) => entityId(kind, stringValue(value));
const nullableId = <K extends EntityKind>(kind: K, value: unknown) => value === null ? null : id(kind, value);
function choice<T extends string>(value: unknown, choices: readonly T[]): T { if (typeof value !== 'string' || !choices.includes(value as T)) fail('Unexpected ordinary enum'); return value as T; }
function quantities(row: Record<string, unknown>): SalesSummaryQuantities {
  const quantity = nullableExact(row.quantity), incomingQuantity = nullableExact(row.incoming_quantity, true), outgoingQuantity = nullableExact(row.outgoing_quantity, true);
  requireDomain(quantity === null ? incomingQuantity === null && outgoingQuantity === null : incomingQuantity !== null && outgoingQuantity !== null && quantity === outgoingQuantity - incomingQuantity,
    'INVALID_DATABASE_VALUE', 'Unknown gift classification and signed quantities must remain consistent');
  return { quantity, incomingQuantity, outgoingQuantity };
}
function products(row: Record<string, unknown>): DocumentProductSummary {
  const productCount = nullableExact(row.product_count, true);
  requireDomain(Array.isArray(row.product_items) && row.product_items.length <= 3 && typeof row.product_has_more === 'boolean', 'INVALID_DATABASE_VALUE', 'Bounded product preview required');
  const seen = new Set<string>();
  const items = row.product_items.map((item: unknown) => {
    requireDomain(item !== null && typeof item === 'object' && !Array.isArray(item), 'INVALID_DATABASE_VALUE', 'Product preview item required');
    const value = item as Record<string, unknown>, productId = nullableId('product', value.productId);
    requireDomain(productId === null || !seen.has(productId), 'INVALID_DATABASE_VALUE', 'Duplicate product preview identity'); if (productId !== null) seen.add(productId);
    return { productId, productCodeSnapshot: nullableString(value.productCodeSnapshot), productNameSnapshot: nullableString(value.productNameSnapshot) };
  });
  requireDomain(productCount === null || BigInt(items.length) === (productCount > 3n ? 3n : productCount) && row.product_has_more === (productCount > 3n), 'INVALID_DATABASE_VALUE', 'Product preview count mismatch');
  return { productCount, items, hasMore: row.product_has_more };
}
function categories(row: Record<string, unknown>, kind: Kind, unknownQuantity: boolean): DocumentCategorySummary {
  const metric = kind === 'sales' ? 'QUANTITY' : 'PRODUCT_COUNT';
  const stockBasis = choice(row.stock_basis, ['RUNTIME_LEDGER', 'CUTOFF_HISTORY']);
  // Imported documents are ordinary rows, but current catalog labels are not historical evidence.
  if (stockBasis === 'CUTOFF_HISTORY' || unknownQuantity) return { basis: 'UNKNOWN', metric, items: [], hasMore: false, categoryCount: null };
  requireDomain(Array.isArray(row.category_items) && row.category_items.length <= 3 && typeof row.category_has_more === 'boolean', 'INVALID_DATABASE_VALUE', 'Bounded category preview required');
  const categoryCount = exact(row.category_count, true), seen = new Set<string | null>();
  const items = row.category_items.map((item: unknown) => {
    requireDomain(item !== null && typeof item === 'object' && !Array.isArray(item), 'INVALID_DATABASE_VALUE', 'Category preview item required');
    const value = item as Record<string, unknown>, categoryId = nullableId('category', value.categoryId), categoryName = nullableString(value.categoryName), amount = exact(value.value, kind !== 'sales');
    requireDomain((categoryId === null) === (categoryName === null) && !seen.has(categoryId) && amount !== 0n, 'INVALID_DATABASE_VALUE', 'Category preview identity/value mismatch'); seen.add(categoryId);
    return { categoryId, categoryName, value: amount };
  });
  requireDomain(BigInt(items.length) === (categoryCount > 3n ? 3n : categoryCount) && row.category_has_more === (categoryCount > 3n), 'INVALID_DATABASE_VALUE', 'Category preview count mismatch');
  return { basis: 'CURRENT', metric, items, hasMore: row.category_has_more, categoryCount };
}
function salesSummary(row: Record<string, unknown>): OrdinarySalesSummary {
  const documentId = id('sales', row.id), version = versionFromSql(row.version), q = quantities(row);
  return { ...decodeHistoricalSalesHallProjection(row),id: documentId, number: stringValue(row.number), businessType: choice(row.business_type, ['SALE', 'RETURN', 'EXCHANGE']), businessDate: businessDate(stringValue(row.business_date)),
    hallId: nullableId('hall', row.hall_id), customerId: id('customer', row.customer_id), salespersonId: nullableId('staff', row.salesperson_id), warehouseId: id('warehouse', row.warehouse_id),
    status: choice(row.status, ['DRAFT', 'APPROVED', 'VOID']), version, grossAmount: moneyFromSql(row.gross_amount), orderDiscount: moneyFromSql(row.order_discount), netDue: moneyFromSql(row.net_due),
    updatedAt: nullableString(row.updated_at), responsibleStaffId: nullableId('staff', row.responsible_staff_id), responsibleName: nullableString(row.responsible_name), createdByName: nullableString(row.created_by_name),
    hallName: nullableString(row.hall_name), warehouseName: stringValue(row.warehouse_name), customerName: stringValue(row.customer_name), salespersonName: nullableString(row.salesperson_name), ...q,
    dataset: 'LIVE', batchId: null, documentId, effectiveVersion: version, productSummary: products(row), categorySummary: categories(row, 'sales', q.quantity === null) };
}
function transferSummary(row: Record<string, unknown>): OrdinaryTransferSummary {
  const documentId = id('transfer', row.id), version = versionFromSql(row.version);
  return { id: documentId, number: stringValue(row.number), businessDate: businessDate(stringValue(row.business_date)), fromWarehouseId: id('warehouse', row.from_warehouse_id), toWarehouseId: id('warehouse', row.to_warehouse_id),
    status: choice(row.status, ['DRAFT', 'APPROVED', 'VOID']), version, createdByAccountId: nullableId('account', row.created_by_account_id), createdAt: nullableString(row.created_at), updatedAt: nullableString(row.updated_at),
    responsibleStaffId: nullableId('staff', row.responsible_staff_id), responsibleName: nullableString(row.responsible_name), createdByName: nullableString(row.created_by_name), approvedByName: nullableString(row.approved_by_name),
    fromWarehouseName: stringValue(row.from_warehouse_name), toWarehouseName: stringValue(row.to_warehouse_name), fromHallName: stringValue(row.from_hall_name), toHallName: stringValue(row.to_hall_name), totalQuantity: exact(row.quantity, true),
    dataset: 'LIVE', batchId: null, documentId, effectiveVersion: version, productSummary: products(row), categorySummary: categories(row, 'transfers', false) };
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => [key, canonical(item)]));
  return value;
}
function unordered(values: readonly unknown[]): unknown[] { return values.map(canonical).sort((a, b) => { const x = JSON.stringify(a), y = JSON.stringify(b); return x < y ? -1 : x > y ? 1 : 0; }); }
function revisionScope(scope: Scope): unknown { return scope.kind === 'all' ? scope : { kind: scope.kind, clauses: unordered(scope.clauses) }; }
function revisionFilter(filter: Parameters['filter']): unknown { return Object.fromEntries(Object.entries(filter).map(([key, value]) => [key, Array.isArray(value) ? unordered(value) : value])); }
function actorCopy(actor: ActorContext): ActorContext {
  requireDomain(actor !== null && typeof actor === 'object' && Object.hasOwn(actor, 'hallId'), 'FORBIDDEN', 'Explicit current actor required');
  const base = { accountId: entityId('account', actor.accountId), hallId: actor.hallId === null ? null : entityId('hall', actor.hallId) };
  return Object.freeze('role' in actor ? { ...base, role: choice(actor.role, ['ADMIN', 'WAREHOUSE', 'SALESPERSON']) } : base);
}
function ownBag(value: unknown, fields: readonly string[]): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype && Reflect.ownKeys(value).length === fields.length && fields.every(key => { const d = Object.getOwnPropertyDescriptor(value, key); return d !== undefined && 'value' in d; });
}
export function checkedOrdinaryDocumentListOptions(options: OrdinaryDocumentListOptions | NativeOrdinaryDocumentListOptions): OrdinaryDocumentListOptions | NativeOrdinaryDocumentListOptions {
  if (ownBag(options, ['profile', 'runtime27']) && options.profile === 'source-confirmed-unified-native-v1') {
    const r = options.runtime27;
    if (!ownBag(r, ['profile', 'contract', 'assertReady']) || r.profile !== 'EXACT27' || r.contract !== 'UNIFIED_ORDINARY_RUNTIME27_V1' || typeof r.assertReady !== 'function') throw new TypeError('Actual native runtime27 read capability required');
    const verify = r.assertReady;
    return Object.freeze({profile:'source-confirmed-unified-native-v1', runtime27:Object.freeze({profile:'EXACT27',contract:'UNIFIED_ORDINARY_RUNTIME27_V1',async assertReady(c:object,p:'ORDINARY_DOCUMENT_READ'){const value:unknown=await verify(c,p);if(value!==undefined)throw new TypeError('Runtime27 proof must throw on failure');}})});
  }
  if (!ownBag(options, ['profile', 'runtime27', 'databaseGeneration', 'schemaDigest']) || options.profile !== 'source-confirmed-ordinary-documents-v1'
    || !ownBag(options.runtime27, ['profile', 'contract', 'assertReady']) || options.runtime27.profile !== 'EXACT27' || options.runtime27.contract !== 'UNIFIED_ORDINARY_RUNTIME27_V1' || typeof options.runtime27.assertReady !== 'function'
    || typeof options.databaseGeneration !== 'string' || !options.databaseGeneration.trim() || options.databaseGeneration.length > 512 || typeof options.schemaDigest !== 'string' || !revisionPattern.test(options.schemaDigest)) throw new TypeError('Explicit independently verified27 ordinary read capability and database generation required');
  const proof = options.runtime27.assertReady;
  return Object.freeze({ profile: 'source-confirmed-ordinary-documents-v1', databaseGeneration: options.databaseGeneration, schemaDigest: options.schemaDigest,
    runtime27: Object.freeze({ profile: 'EXACT27', contract: 'UNIFIED_ORDINARY_RUNTIME27_V1', async assertReady(client: object, purpose: 'ORDINARY_DOCUMENT_READ') { const result: unknown = await proof(client, purpose); if (result !== undefined) throw new TypeError('Runtime27 proof must complete without a boolean substitute'); } }) });
}
class Predicate {
  readonly values: unknown[] = []; readonly parts: string[];
  bind(value: unknown): string { this.values.push(value); return `$${this.values.length}`; }
  constructor(kind: Kind, scope: Scope, identity: CurrentIdentity, parameters: Parameters, native: boolean) {
    this.parts = [native ? 'naijue_erp.standard_business_ready()' : ORDINARY_DOCUMENT_PUBLICATION_SQL];
    const columns: Readonly<Record<string, string>> = kind === 'sales' ? { hallId: 'h.hall_id', warehouseId: 'h.warehouse_id', salespersonId: 'h.salesperson_id', createdByAccountId: 'h.created_by_account_id', createdHallId: 'h.created_hall_id' }
      : { fromHallId: 'fw.hall_id', toHallId: 'tw.hall_id', fromWarehouseId: 'h.from_warehouse_id', toWarehouseId: 'h.to_warehouse_id', createdByAccountId: 'h.created_by_account_id', createdHallId: 'h.created_hall_id', createdRole: 'h.created_role' };
    if (scope.kind === 'restricted') this.parts.push(`(${scope.clauses.map(clause => `(${Object.entries(clause).map(([key, value]) => `${columns[key]}=${this.bind(value)}::${key === 'createdRole' ? 'text' : 'uuid'}`).join(' AND ')})`).join(' OR ')})`);
    if (identity.role === 'SALESPERSON') {
      requireDomain(identity.hallId !== null, 'FORBIDDEN', 'Current salesperson hall required'); const hall = `${this.bind(identity.hallId)}::uuid`;
      this.parts.push(kind === 'sales' ? `h.hall_id=${hall}` : `(fw.hall_id=${hall} OR tw.hall_id=${hall} OR (h.created_hall_id=${hall} AND h.created_role='SALESPERSON'))`);
    }
    const filter = parameters.filter;
    for (const [date, operator] of [[filter.startDate, '>='], [filter.endDate, '<=']] as const) if (date !== null) this.parts.push(`h.business_date${operator}${this.bind(date)}::date`);
    const dimensions: readonly (readonly [readonly unknown[], string, string])[] = kind === 'sales'
      ? (() => { const f = filter as SalesQueryFilter; return [[f.statuses, 'status', 'text'], [f.businessTypes, 'business_type', 'text'], [f.hallIds, 'hall_id', 'uuid'], [f.salespersonIds, 'salesperson_id', 'uuid'], [f.customerIds, 'customer_id', 'uuid'], [f.warehouseIds, 'warehouse_id', 'uuid']] as const; })()
      : (() => { const f = filter as TransferQueryFilter; return [[f.statuses, 'status', 'text'], [f.fromWarehouseIds, 'from_warehouse_id', 'uuid'], [f.toWarehouseIds, 'to_warehouse_id', 'uuid']] as const; })();
    for (const [values, column, cast] of dimensions) if (values.length) this.parts.push(`h.${column}=ANY(${this.bind([...values])}::${cast}[])`);
    if (filter.number !== null) this.parts.push(`strpos(lower(h.number),lower(${this.bind(filter.number)}::text))>0`);
  }
  where(): string { return this.parts.map(part => `(${part})`).join(' AND '); }
}
function quantityMetrics(source: string): string {
  return `SELECT document_id,
    CASE WHEN count(*) FILTER(WHERE is_gift IS NULL)>0 THEN NULL ELSE sum(CASE WHEN is_gift IS FALSE THEN quantity ELSE 0 END) END AS quantity,
    CASE WHEN count(*) FILTER(WHERE is_gift IS NULL)>0 THEN NULL ELSE sum(CASE WHEN is_gift IS FALSE AND quantity<0 THEN -quantity ELSE 0 END) END AS incoming_quantity,
    CASE WHEN count(*) FILTER(WHERE is_gift IS NULL)>0 THEN NULL ELSE sum(CASE WHEN is_gift IS FALSE AND quantity>0 THEN quantity ELSE 0 END) END AS outgoing_quantity
    FROM ${source} GROUP BY document_id`;
}
function pageSql(kind: Kind, p: Predicate, parameters: Parameters): string {
  const lineTable = kind === 'sales' ? 'sales_line' : 'transfer_line', owner = kind === 'sales' ? 'sales_id' : 'transfer_id';
  const quantity = ['quantity', 'incoming_quantity', 'outgoing_quantity'].map(column => `CASE WHEN q.document_id IS NULL THEN '0' ELSE q.${column}::text END AS ${column}`).join(',');
  const headerColumns = kind === 'sales'
    ? `h.id,h.stock_basis,h.number,h.business_type,to_char(h.business_date,'YYYY-MM-DD') AS business_date,h.hall_id,h.customer_id,h.salesperson_id,h.warehouse_id,h.status,h.version,
       h.responsible_staff_id,responsible.name AS responsible_name,creator.name AS created_by_name,h.gross_amount::text,h.order_discount::text,h.net_due::text,${stamp('h.updated_at')} AS updated_at,
       hall_result.historical_hall_proofs,hall.name AS hall_name,wh.name AS warehouse_name,c.name AS customer_name,sp.name AS salesperson_name`
    : `h.id,h.stock_basis,h.number,to_char(h.business_date,'YYYY-MM-DD') AS business_date,h.from_warehouse_id,h.to_warehouse_id,h.status,h.version,h.created_by_account_id,${stamp('h.created_at')} AS created_at,${stamp('h.updated_at')} AS updated_at,
       h.responsible_staff_id,responsible.name AS responsible_name,creator.name AS created_by_name,approver.name AS approved_by_name,fw.name AS from_warehouse_name,tw.name AS to_warehouse_name,fh.name AS from_hall_name,th.name AS to_hall_name`;
  const headerJoins = kind === 'sales'
    ? 'LEFT JOIN naijue_erp.hall hall ON hall.id=h.hall_id JOIN naijue_erp.warehouse wh ON wh.id=h.warehouse_id JOIN naijue_erp.customer c ON c.id=h.customer_id LEFT JOIN naijue_erp.staff sp ON sp.id=h.salesperson_id'
    : 'JOIN naijue_erp.warehouse fw ON fw.id=h.from_warehouse_id JOIN naijue_erp.warehouse tw ON tw.id=h.to_warehouse_id JOIN naijue_erp.hall fh ON fh.id=fw.hall_id JOIN naijue_erp.hall th ON th.id=tw.hall_id LEFT JOIN naijue_erp.staff approver ON approver.id=h.approved_by_staff_id';
  const from = kind === 'sales' ? salesFrom : transferFrom;
  const limit = p.bind(parameters.pageSize), offset = p.bind(((BigInt(parameters.page) - 1n) * BigInt(parameters.pageSize)).toString());
  return `/* ordinary-document:page:${kind} */ WITH page_headers AS MATERIALIZED (
    SELECT h.* FROM ${from} WHERE ${p.where()} ORDER BY h.created_at DESC NULLS LAST,h.id ASC LIMIT ${limit} OFFSET ${offset}::bigint),
    ${kind==='sales'?HISTORICAL_SALES_HALL_BATCH_CTES+',':''}
    page_lines AS MATERIALIZED (SELECT p.id AS document_id,p.stock_basis,l.id AS line_id,l.line_no,l.quantity::numeric AS quantity,${kind === 'sales' ? 'l.is_gift' : 'false'} AS is_gift,
      s.product_id,l.product_code_snapshot,l.product_name_snapshot,cc.id AS category_id,cc.name AS category_name
      FROM page_headers p JOIN naijue_erp.${lineTable} l ON l.${owner}=p.id AND l.is_current
      LEFT JOIN naijue_erp.sku s ON s.id=l.sku_id LEFT JOIN naijue_erp.product cp ON cp.id=s.product_id AND p.stock_basis='RUNTIME_LEDGER' LEFT JOIN naijue_erp.product_category cc ON cc.id=cp.category_id),
    page_metrics AS (${quantityMetrics('page_lines')}),
    category_groups AS (SELECT document_id,category_id,category_name,min(line_no) AS first_line,
      ${kind === 'sales' ? 'sum(quantity)' : 'CASE WHEN bool_or(product_id IS NULL) THEN NULL ELSE count(DISTINCT product_id) END'} AS value
      FROM page_lines WHERE stock_basis='RUNTIME_LEDGER' AND ${kind === 'sales' ? 'is_gift IS FALSE' : 'quantity>0'} GROUP BY document_id,category_id,category_name
      HAVING ${kind === 'sales' ? 'sum(quantity)<>0' : 'bool_or(product_id IS NULL) OR count(DISTINCT product_id)>0'}),
    category_ranked AS (SELECT *,row_number() OVER(PARTITION BY document_id ORDER BY first_line,category_id) AS category_row FROM category_groups),
    category_summaries AS (SELECT document_id,jsonb_agg(jsonb_build_object('categoryId',category_id,'categoryName',category_name,'value',value::text) ORDER BY category_row) FILTER(WHERE category_row<=3) AS category_items,
      count(*)::text AS category_count,count(*)>3 AS category_has_more FROM category_ranked GROUP BY document_id),
    products AS (SELECT *,row_number() OVER(PARTITION BY document_id,coalesce(product_id::text,'line:'||line_id::text) ORDER BY line_no,line_id) AS identity_row FROM page_lines),
    previews AS (SELECT *,row_number() OVER(PARTITION BY document_id ORDER BY line_no,line_id) AS preview_row FROM products WHERE identity_row=1),
    product_summaries AS (SELECT document_id,CASE WHEN count(*) FILTER(WHERE product_id IS NULL)>0 THEN NULL ELSE count(*) END::text AS product_count,
      jsonb_agg(jsonb_build_object('productId',product_id,'productCodeSnapshot',product_code_snapshot,'productNameSnapshot',product_name_snapshot) ORDER BY preview_row) FILTER(WHERE preview_row<=3) AS product_items,
      count(*)>3 AS product_has_more FROM previews GROUP BY document_id)
    SELECT ${headerColumns},${quantity},CASE WHEN ps.document_id IS NULL THEN '0' ELSE ps.product_count END AS product_count,
      coalesce(ps.product_items,'[]'::jsonb) AS product_items,coalesce(ps.product_has_more,false) AS product_has_more,
      coalesce(cs.category_items,'[]'::jsonb) AS category_items,coalesce(cs.category_count,'0') AS category_count,coalesce(cs.category_has_more,false) AS category_has_more
    FROM page_headers h ${headerJoins} ${kind==='sales'?'LEFT JOIN hall_results hall_result ON hall_result.document_id=h.id':''} LEFT JOIN naijue_erp.staff responsible ON responsible.id=h.responsible_staff_id LEFT JOIN naijue_erp.staff creator ON creator.id=h.created_by_staff_id
      LEFT JOIN page_metrics q ON q.document_id=h.id LEFT JOIN product_summaries ps ON ps.document_id=h.id LEFT JOIN category_summaries cs ON cs.document_id=h.id
    ORDER BY h.created_at DESC NULLS LAST,h.id ASC`;
}
function totalsSql(kind: Kind, p: Predicate): string {
  const owner = kind === 'sales' ? 'sales_id' : 'transfer_id', table = kind === 'sales' ? 'sales_line' : 'transfer_line';
  const values = ['quantity', 'incoming_quantity', 'outgoing_quantity'].map(column => `CASE WHEN count(*) FILTER(WHERE q.document_id IS NOT NULL AND q.${column} IS NULL)>0 THEN NULL ELSE coalesce(sum(CASE WHEN q.document_id IS NULL THEN 0 ELSE q.${column} END),0) END::text AS ${column}`).join(',');
  const money = kind === 'sales' ? ',' + ['gross_amount', 'order_discount', 'net_due'].map(column => `coalesce(sum(h.${column}::numeric),0)::text AS ${column}`).join(',') : '';
  return `/* ordinary-document:totals:${kind} */ WITH matched AS MATERIALIZED (SELECT h.* FROM ${kind === 'sales' ? salesFrom : transferFrom} WHERE ${p.where()}),
    matched_lines AS (SELECT h.id AS document_id,l.quantity::numeric AS quantity,${kind === 'sales' ? 'l.is_gift' : 'false'} AS is_gift FROM matched h JOIN naijue_erp.${table} l ON l.${owner}=h.id AND l.is_current),
    metrics AS (${quantityMetrics('matched_lines')})
    SELECT count(*)::text AS exact_total,${values}${money} FROM matched h LEFT JOIN metrics q ON q.document_id=h.id`;
}
/** New ordinary-only adapter. No Pool ownership, listener, schema issuer, mutation, persistent cache,
 * receipt scan, source reconciliation or cross-request transaction. Scripted tests are not PG engine proof. */
export class PostgresOrdinaryDocumentListReader {
  readonly #pool: PgOrdinaryDocumentPool; readonly #options: OrdinaryDocumentListOptions | NativeOrdinaryDocumentListOptions;
  constructor(pool: PgOrdinaryDocumentPool, options: OrdinaryDocumentListOptions | NativeOrdinaryDocumentListOptions) {
    this.#options = checkedOrdinaryDocumentListOptions(options); if (typeof pool?.connect !== 'function') throw new TypeError('Explicit ordinary PostgreSQL pool required'); this.#pool = pool;
  }
  async #snapshot<T>(kind: Kind, actor: ActorContext, scope: Scope, parameters: Parameters, signal: AbortSignal, work: (query: Query, p: Predicate, readRevision: string) => Promise<T>): Promise<T> {
    const active = () => { if (signal.aborted) throw new DomainError(kind === 'sales' ? 'SALES_READ_ABORTED' : 'TRANSFER_READ_ABORTED', 'Ordinary document read aborted'); };
    active(); const client = await this.#pool.connect(); let began = false, committed = false, committing = false; let discard: Error | undefined;
    const query: Query = async (sql, values = []) => { active(); const result = await client.query(sql, values); active(); return result; };
    try {
      active(); await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); began = true; active();
      await this.#options.runtime27.assertReady(client, 'ORDINARY_DOCUMENT_READ'); active();
      const identity = await sourceConfirmedReadIdentityOn({ query }, actor, signal); active();
      const native = this.#options.profile === 'source-confirmed-unified-native-v1';
      const revision = one(await query(`/* ordinary-document:revision */ SELECT pg_current_snapshot()::text AS read_snapshot,${stamp('pg_postmaster_start_time()')} AS database_started_at,naijue_erp.standard_business_ready() AS business_ready${native ? ", concat_ws(':', coalesce(inet_server_addr()::text, 'local'), inet_server_port()::text, (SELECT oid::text FROM pg_database WHERE datname=current_database()), current_database()) AS database_identity" : ''}`));
      requireDomain(typeof revision.business_ready === 'boolean', 'INVALID_DATABASE_VALUE', 'Explicit ordinary publication readiness required');
      requireDomain(revision.business_ready, 'ORDINARY_DOCUMENTS_NOT_READY', 'Ordinary business documents are not published');
      const snapshot = stringValue(revision.read_snapshot), started = stringValue(revision.database_started_at);
      requireDomain(/^\d+:\d+:(?:\d+(?:,\d+)*)?$/.test(snapshot) && started.length > 0, 'INVALID_DATABASE_VALUE', 'Explicit ordinary MVCC snapshot metadata required');
      const target = native ? stringValue(revision.database_identity) : `${this.#options.databaseGeneration}:${this.#options.schemaDigest}`;
      requireDomain(target.length > 0, 'INVALID_DATABASE_VALUE', 'Actual database identity required');
      const readRevision = createHash('sha256').update(JSON.stringify(canonical(['ORDINARY_DOCUMENT_LIST_V1', target, started, snapshot, actor.accountId, identity, revisionScope(scope), kind, revisionFilter(parameters.filter)]))).digest('hex');
      const result = await work(query, new Predicate(kind, scope, identity, parameters, native), readRevision); active();
      committing = true; await client.query('COMMIT'); committed = true; active(); return result;
    } catch (error) {
      if (!began || committing && !committed) discard = error instanceof Error ? error : new Error('Ordinary snapshot failed');
      if (began && !committed) try { await client.query('ROLLBACK'); } catch (rollbackError) { discard = rollbackError instanceof Error ? rollbackError : new Error('Ordinary rollback failed'); throw new AggregateError([error, rollbackError], 'Ordinary read and rollback failed; client discarded'); }
      throw error;
    } finally { client.release(discard); }
  }
  async #page<T>(kind: Kind, actor: ActorContext, scope: Scope, parameters: Parameters, signal: AbortSignal, decode: (row: Record<string, unknown>) => T): Promise<OrdinaryDocumentPage<T>> {
    return this.#snapshot(kind, actor, scope, parameters, signal, async (query, p, readRevision) => {
      const exactTotal = exact(one(await query(`/* ordinary-document:count:${kind} */ SELECT count(*)::text AS exact_total FROM ${kind === 'sales' ? salesFrom : transferFrom} WHERE ${p.where()}`, [...p.values])).exact_total, true);
      const sql = pageSql(kind, p, parameters), rows = (await query(sql, p.values)).rows;
      const remaining = exactTotal - (BigInt(parameters.page) - 1n) * BigInt(parameters.pageSize), expected = remaining < 0n ? 0n : remaining > BigInt(parameters.pageSize) ? BigInt(parameters.pageSize) : remaining;
      requireDomain(BigInt(rows.length) === expected, 'INVALID_DATABASE_VALUE', 'Ordinary page does not match exact authorized header count');
      const seen = new Set<string>(); for (const row of rows) { const key = id(kind === 'sales' ? 'sales' : 'transfer', row.id); requireDomain(!seen.has(key), 'INVALID_DATABASE_VALUE', 'Duplicate ordinary page identity'); seen.add(key); }
      return { profile: 'ORDINARY_DOCUMENT_LIST_V1', page: parameters.page, pageSize: parameters.pageSize, exactTotal, readRevision, items: rows.map(decode) };
    });
  }
  async readSalesList(read: SalesScopedRead<SalesListQuery>): Promise<OrdinaryDocumentPage<OrdinarySalesSummary>> {
    const parameters = parseSalesListQuery(read.parameters), scope = checkedSalesReadScope(read.scope), actor = actorCopy(read.actor); return this.#page('sales', actor, scope, parameters, read.signal, salesSummary);
  }
  async readTransferList(read: TransferScopedRead<TransferListQuery>): Promise<OrdinaryDocumentPage<OrdinaryTransferSummary>> {
    const parameters = parseTransferListQuery(read.parameters), scope = checkedTransferReadScope(read.scope), actor = actorCopy(read.actor); return this.#page('transfers', actor, scope, parameters, read.signal, transferSummary);
  }
  async readSalesTotals(read: SalesScopedRead<OrdinarySalesTotalsQuery>): Promise<OrdinaryDocumentTotals<OrdinarySalesTotals>> {
    const parameters = this.#totalsParameters('sales', read.parameters) as SalesListQuery, scope = checkedSalesReadScope(read.scope), actor = actorCopy(read.actor), expectedRevision = read.parameters.expectedRevision;
    return this.#snapshot('sales', actor, scope, parameters, read.signal, async (query, p, readRevision) => {
      requireDomain(readRevision === expectedRevision, 'DOCUMENT_READ_CHANGED', 'Ordinary snapshot changed; refresh the page before totals');
      const row = one(await query(totalsSql('sales', p), p.values)), q = quantities(row), grossAmount = decimalToMinor(stringValue(row.gross_amount), { scale: 2 }), orderDiscount = decimalToMinor(stringValue(row.order_discount), { scale: 2 }), netDue = decimalToMinor(stringValue(row.net_due), { scale: 2 });
      requireDomain(grossAmount - orderDiscount === netDue, 'INVALID_DATABASE_VALUE', 'Ordinary money totals disagree');
      return { profile: 'ORDINARY_DOCUMENT_TOTALS_V1', readRevision, exactTotal: exact(row.exact_total, true), totals: { ...q, grossAmount, orderDiscount, netDue } };
    });
  }
  async readTransferTotals(read: TransferScopedRead<OrdinaryTransferTotalsQuery>): Promise<OrdinaryDocumentTotals<{ readonly totalQuantity: bigint }>> {
    const parameters = this.#totalsParameters('transfers', read.parameters) as TransferListQuery, scope = checkedTransferReadScope(read.scope), actor = actorCopy(read.actor), expectedRevision = read.parameters.expectedRevision;
    return this.#snapshot('transfers', actor, scope, parameters, read.signal, async (query, p, readRevision) => {
      requireDomain(readRevision === expectedRevision, 'DOCUMENT_READ_CHANGED', 'Ordinary snapshot changed; refresh the page before totals');
      const row = one(await query(totalsSql('transfers', p), p.values)); return { profile: 'ORDINARY_DOCUMENT_TOTALS_V1', readRevision, exactTotal: exact(row.exact_total, true), totals: { totalQuantity: exact(row.quantity, true) } };
    });
  }
  #totalsParameters(kind: Kind, input: unknown): Parameters {
    requireDomain(ownBag(input, ['filter', 'expectedRevision']) && typeof input.expectedRevision === 'string' && revisionPattern.test(input.expectedRevision), kind === 'sales' ? 'INVALID_SALES_QUERY' : 'INVALID_TRANSFER_QUERY', 'Exact ordinary totals filter and opaque revision required');
    const query = { filter: input.filter, page: 1, pageSize: 20 }; return kind === 'sales' ? parseSalesListQuery(query) : parseTransferListQuery(query);
  }
}
