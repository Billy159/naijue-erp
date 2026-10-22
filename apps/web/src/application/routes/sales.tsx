import { captureProductFullPageConfiguration } from '../../products/product-page-configuration.ts';
import { createCurrentFormHttpReader } from '../../current-form/http-reader.ts';
import { entityId } from '../../../../../packages/domain/src/values.ts';
import type { SalesProductCapability, DocumentProductInventoryNavigation, DocumentProductInventoryNavigationFactory } from '../../sales/document-presentation.tsx';
import { HttpQueryError } from '../../transport/http-query.ts';
import { SalesPageHost } from '../../sales/sales-route.tsx';
import { createSalesHttpReader, createSalesFilterReferenceHttpReader } from '../../sales/http-reader.ts';
import type { ApplicationRouteProps, PreparedApplicationRoute, RoutePreparation } from '../contracts.ts';
import type { SalesSession } from '../contracts.ts';

export function prepareSalesRoute(input: RoutePreparation, onUnauthorized?: () => void, openInventory?: DocumentProductInventoryNavigation): PreparedApplicationRoute {
  const configuration = input.configuration.sales;
  if (!configuration) throw new TypeError('Sales capability was not configured.');
  const product = createSalesProductCapability(input, onUnauthorized, openInventory);
  const reader = createSalesHttpReader(input.http), references = createSalesFilterReferenceHttpReader(input.http);
  const detailStylesheet = configuration.detailStylesheet;
  const detail = detailStylesheet ? { loadDetailStyles: () => detailStylesheet.load() } : {};
  return { View: ({ scope }: ApplicationRouteProps) => <SalesPageHost scope={scope} reader={reader} references={references} {...detail} {...(product ? { product } : {})} /> };
}

/** Opt-in only. Read hosts and the development host do not infer this capability. */
export async function prepareSalesSession(input: RoutePreparation, onAccessFailure: () => void, inventoryNavigation?: DocumentProductInventoryNavigationFactory): Promise<SalesSession> {
  const module = await import('./sales-commands.tsx');
  return module.prepareSalesCommandSession(input, onAccessFailure, inventoryNavigation);
}

/** Sales owns its own explicit full-page capability. No Products-route fallback. */
export function createSalesProductCapability(input: RoutePreparation, onUnauthorized?: () => void, openInventory?: DocumentProductInventoryNavigation): SalesProductCapability | undefined {
  const supplied = input.configuration.sales?.productFullPage;
  if (!supplied) return undefined;
  const configuration = captureProductFullPageConfiguration(supplied), reader = createCurrentFormHttpReader(input.http);
  return Object.freeze({ configuration, ...(onUnauthorized ? { onUnauthorized } : {}), ...(openInventory && configuration.allowedTabs.includes('stock') && configuration.reader.stock ? { openInventory } : {}), resolveTarget: async (skuId: string, hallId: string, signal: AbortSignal) => {
    if (!input.scope.active || signal.aborted) throw new HttpQueryError('aborted', 'QUERY_ABORTED');
    const joined = AbortSignal.any([input.scope.signal, signal]);
    const rows = await reader.readSkuBatch({ context: { kind: 'SALES', hallId: entityId('hall', hallId) }, skuIds: [entityId('sku', skuId)] }, joined);
    const row = rows[0]; if (joined.aborted || !row || row.id !== skuId || rows.length !== 1) throw new TypeError('Current SKU product relation unavailable.');
    return Object.freeze({ id: row.productId, label: `${row.productCode} · ${row.productName}` });
  } });
}
