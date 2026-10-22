import { ProductsPageView } from '../../products/products-route.tsx';
import { createProductManagementHttpReader } from '../../products/http-reader.ts';
import { createProductHttpReader } from '../../transport/product-http-reader.ts';
import { createDictionaryHttpReader } from '../../product-settings/size-groups/http-reader.ts';
import { InactiveReadScopeError } from '../../loading/read-scope.ts';
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
export function prepareProductsRoute(input: ProductsRoutePreparation, onAccessFailure?: (error: HttpQueryError) => void): PreparedApplicationRoute {
  const configuration = input.configuration.products;
  const accessFailure = onAccessFailure ?? configuration?.onAccessFailure;
  if (!configuration || typeof accessFailure !== 'function') throw new TypeError('Explicit product management query capability and access-failure owner are required.');
  if (input.principal.accountId !== input.scope.identity.accountId) throw new TypeError('Product management identity does not match its read scope.');
  const reader = createProductManagementHttpReader(input.http);
  const product = configuration.product ? { reader: createProductHttpReader(input.http), loadStyles: () => configuration.product!.stylesheet.load() } : undefined;
  // Both capabilities are explicit host opt-ins. A product grant or ADMIN
  // role alone does not imply dictionary-description access.
  const dictionary = configuration.maintenance && !configuration.maintenance.barcodeSchemeReader && input.configuration.barcodeSchemes
    ? createDictionaryHttpReader(input.http) : null;
  const maintenance = configuration.maintenance && dictionary ? { ...configuration.maintenance, barcodeSchemeReader: {
    readBarcodeScheme: async (read: Parameters<typeof dictionary.readBarcodeScheme>[0]) => {
      if (!input.scope.active || read.signal.aborted) throw new InactiveReadScopeError();
      const signal = AbortSignal.any([input.scope.signal, read.signal]);
      const result = await dictionary.readBarcodeScheme({ ...read, signal });
      if (!input.scope.active || signal.aborted) throw new InactiveReadScopeError();
      return result;
    },
  } } : configuration.maintenance;
  let leaveGuard: (() => boolean) | null = null;
  const onCanLeaveChange = (guard: (() => boolean) | null) => { if (input.scope.active) leaveGuard = guard; };
  input.scope.signal.addEventListener('abort', () => { leaveGuard = null; }, { once: true });
  return {
    canLeave: () => !input.scope.active || leaveGuard === null || leaveGuard() === true,
    View: ({ scope }: ApplicationRouteProps) => <ProductsPageView scope={scope} reader={reader} onAccessFailure={accessFailure} onCanLeaveChange={onCanLeaveChange}
      {...(product ? { product } : {})} {...(configuration.fullPage ? { fullPage: configuration.fullPage } : {})} {...(maintenance ? { maintenance } : {})} />,
  };
}
