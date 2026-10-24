import { ProductsPageView } from '../../products/products-route.tsx';
import { createProductManagementHttpReader } from '../../products/http-reader.ts';
import { createProductHttpReader } from '../../transport/product-http-reader.ts';
import { createDictionaryHttpReader } from '../../product-settings/size-groups/http-reader.ts';
import { InactiveReadScopeError } from '../../loading/read-scope.ts';
import type { ProductInventoryNavigationRequest, ProductReturnContext, ProductFilterDraft } from '../../products/contracts.ts';
import { productFilterParameters } from '../../products/contracts.ts';
import { parseProductManagementListQuery } from '../../../../../packages/application/src/product-management-query-validation.ts';
import { entityId } from '../../../../../packages/domain/src/values.ts';
import { snapshotQueryParameters } from '../../loading/query-parameters.ts';
import type { HttpQueryError } from '../../transport/http-query.ts';
import type { ApplicationRouteProps, PreparedApplicationRoute, RoutePreparation, ProductsRouteConfiguration as ApplicationProductsRouteConfiguration } from '../contracts.ts';

/** Separate opt-in capability. Shared Application registration remains the composition owner's task.
 * This does not define a role policy or make an unconfigured navigation item actionable. */
export interface ProductsRouteConfiguration extends ApplicationProductsRouteConfiguration {
  /** Standalone hosts supply this; the Application controller injects its current-scope owner. */
  readonly onAccessFailure?: (error: HttpQueryError) => void;
}
export type ProductsRoutePreparation = Omit<RoutePreparation, 'configuration'> & {
  readonly configuration: RoutePreparation['configuration'] & { readonly products?: ProductsRouteConfiguration };
};
export interface ProductRouteNavigation {
  readonly openInventory?: (request: ProductInventoryNavigationRequest) => Promise<boolean>;
  readonly receiveReturnContext?: ProductReturnContext;
}
/** Copy only the agreed serializable presentation fields. No commands, result
 * rows, provider functions or live DOM are retained in a return journey. */
export function captureProductInventoryRequest(request: ProductInventoryNavigationRequest): ProductInventoryNavigationRequest {
  const selection = (item: { readonly id: string; readonly label: string }) => {
    if (!item || typeof item.id !== 'string' || typeof item.label !== 'string' || !item.label.trim() || item.label.length > 1000) throw new TypeError('Invalid navigation target.');
    return { id: item.id, label: item.label };
  };
  const product = selection(request.product), context = request.returnContext;
  entityId('product', product.id);
  if (!context || context.version !== 1 || context.product.id !== product.id || context.tab !== 'stock' || !['editor', 'read-only'].includes(context.view) || typeof context.advanced !== 'boolean') throw new TypeError('Invalid product return context.');
  const selected = (kind: keyof ProductFilterDraft) => context.filterDraft[kind].map(selection);
  const filterDraft: ProductFilterDraft = { product: selected('product'), category: selected('category'), year: selected('year'), season: selected('season'), supplier: selected('supplier'), fit: selected('fit'), thickness: selected('thickness'), shape: selected('shape') };
  parseProductManagementListQuery({ page: 1, pageSize: context.initialPageSize, filter: productFilterParameters(filterDraft) });
  const appliedQuery = context.appliedQuery === null ? null : parseProductManagementListQuery({ ...context.appliedQuery, filter: { ...context.appliedQuery.filter } });
  const position = (value: { readonly top: number; readonly left: number }) => {
    if (!value || !Number.isFinite(value.top) || !Number.isFinite(value.left)) throw new TypeError('Invalid return scroll.');
    return { top: value.top, left: value.left };
  };
  if (!Array.isArray(context.listScroll) || context.listScroll.length > 1000) throw new TypeError('Invalid scroll context.');
  const listScroll = context.listScroll.map(value => { if (!Number.isSafeInteger(value.ancestorDepth) || value.ancestorDepth < 0) throw new TypeError('Invalid scroll ancestor.'); return { ancestorDepth: value.ancestorDepth, ...position(value) }; });
  return snapshotQueryParameters({ product, returnContext: { version: 1, product: { ...product }, view: context.view, tab: 'stock', filterDraft, appliedQuery, advanced: context.advanced,
    initialPageSize: context.initialPageSize, listScroll, tableScroll: position(context.tableScroll) } } satisfies ProductInventoryNavigationRequest);
}
export function prepareProductsRoute(input: ProductsRoutePreparation, onAccessFailure?: (error: HttpQueryError) => void, navigation: ProductRouteNavigation = {}): PreparedApplicationRoute {
  const configuration = input.configuration.products;
  const accessFailure = onAccessFailure ?? configuration?.onAccessFailure;
  if (!configuration || typeof accessFailure !== 'function') throw new TypeError('Explicit product management query capability and access-failure owner are required.');
  if (input.principal.accountId !== input.scope.identity.accountId) throw new TypeError('Product management identity does not match its read scope.');
  const reader = createProductManagementHttpReader(input.http);
  const product = configuration.product ? { reader: createProductHttpReader(input.http), loadStyles: () => configuration.product!.stylesheet.load() } : undefined;
  // Both capabilities are explicit host opt-ins. A product grant or ADMIN
  // role alone does not imply dictionary-description access.
  const barcodes = configuration.fullPage?.allowedTabs.includes('barcodes') ? configuration.fullPage.reader.barcodes : undefined;
  const dictionary = input.configuration.barcodeSchemes && (barcodes && !barcodes.schemeReader || configuration.maintenance && !configuration.maintenance.barcodeSchemeReader)
    ? createDictionaryHttpReader(input.http) : null;
  const schemeReader = dictionary ? {
    readBarcodeScheme: async (read: Parameters<typeof dictionary.readBarcodeScheme>[0]) => {
      if (!input.scope.active || read.signal.aborted) throw new InactiveReadScopeError();
      const signal = AbortSignal.any([input.scope.signal, read.signal]);
      const result = await dictionary.readBarcodeScheme({ ...read, signal });
      if (!input.scope.active || signal.aborted) throw new InactiveReadScopeError();
      return result;
    },
  } : null;
  const maintenance = configuration.maintenance && !configuration.maintenance.barcodeSchemeReader && schemeReader
    ? { ...configuration.maintenance, barcodeSchemeReader: schemeReader } : configuration.maintenance;
  const fullPage = configuration.fullPage && barcodes && !barcodes.schemeReader && schemeReader
    ? { ...configuration.fullPage, reader: { ...configuration.fullPage.reader, barcodes: { ...barcodes, schemeReader } } } : configuration.fullPage;
  let leaveGuard: (() => boolean) | null = null;
  const onCanLeaveChange = (guard: (() => boolean) | null) => { if (input.scope.active) leaveGuard = guard; };
  input.scope.signal.addEventListener('abort', () => { leaveGuard = null; }, { once: true });
  return {
    canLeave: () => !input.scope.active || leaveGuard === null || leaveGuard() === true,
    View: ({ scope }: ApplicationRouteProps) => <ProductsPageView {...navigation} scope={scope} reader={reader} onAccessFailure={accessFailure} onCanLeaveChange={onCanLeaveChange}
      {...(product ? { product } : {})} {...(fullPage ? { fullPage } : {})} {...(maintenance ? { maintenance } : {})} />,
  };
}
