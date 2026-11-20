import { ProductCategoriesPage } from '../../product-categories/product-categories-page.tsx';
import { createCatalogueSettingsHttpReader } from '../../product-settings/colors/http-reader.ts';
import type { ApplicationRouteProps, PreparedApplicationRoute, RoutePreparation } from '../contracts.ts';

/** Frontend composition is not enumeration/product-count authority. The exact server
 * catalogue grant and separate productCounts decision remain mandatory per query. */
export function prepareProductCategoriesRoute(input: RoutePreparation, onAccessFailure: (kind: 'unauthenticated'|'forbidden') => void): PreparedApplicationRoute {
  if (!input.configuration.productCategories || typeof onAccessFailure !== 'function') throw new TypeError('Explicit category read capability and current access owner are required.');
  if (input.principal.accountId !== input.scope.identity.accountId) throw new TypeError('Category identity does not match its read scope.');
  const reader = createCatalogueSettingsHttpReader(input.http);
  let leaveGuard: (() => boolean) | null = null;
  const onCanLeaveChange = (guard: (() => boolean) | null) => { if (input.scope.active) leaveGuard = guard; };
  input.scope.signal.addEventListener('abort', () => { leaveGuard = null; }, { once: true });
  return { canLeave: () => !input.scope.active || leaveGuard === null || leaveGuard() === true,
    View: ({ scope }: ApplicationRouteProps) => <ProductCategoriesPage scope={scope} reader={reader} onAccessFailure={onAccessFailure}
      {...(input.configuration.productCategories!.maintenance ? { maintenance: input.configuration.productCategories!.maintenance } : {})} onCanLeaveChange={onCanLeaveChange} /> };
}
