import { ProductsPageView } from '../../products/products-route.tsx';
import { createProductManagementHttpReader } from '../../products/http-reader.ts';
import { createProductHttpReader } from '../../transport/product-http-reader.ts';
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
  return { View: ({ scope }: ApplicationRouteProps) => <ProductsPageView scope={scope} reader={reader} onAccessFailure={accessFailure} {...(product ? { product } : {})} {...(configuration.fullPage ? { fullPage: configuration.fullPage } : {})} /> };
}
