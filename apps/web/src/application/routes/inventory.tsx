import { InventoryPageView } from '../../inventory/inventory-route.tsx';
import { createInventoryHttpReader } from '../../transport/inventory-http-reader.ts';
import { createProductHttpReader } from '../../transport/product-http-reader.ts';
import type { ApplicationRouteProps, PreparedApplicationRoute, RoutePreparation } from '../contracts.ts';

export function prepareInventoryRoute(input: RoutePreparation): PreparedApplicationRoute {
  if (!input.configuration.inventory) throw new TypeError('Inventory capability was not configured.');
  const reader = createInventoryHttpReader(input.http), productReader = createProductHttpReader(input.http);
  const actions = input.configuration.inventory.actions;
  return { View: ({ scope }: ApplicationRouteProps) => <InventoryPageView scope={scope} reader={reader} productReader={productReader} actions={actions} /> };
}
