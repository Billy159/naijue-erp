import { InventoryPageView } from '../../inventory/inventory-route.tsx';
import { createInventoryHttpReader } from '../../transport/inventory-http-reader.ts';
import { createProductHttpReader } from '../../transport/product-http-reader.ts';
import { createInventoryLedgerHttpReader } from '../../inventory/ledger-http-reader.ts';
import { createInventoryOutputReader } from '../../inventory/output-adapter.ts';
import type { HttpQueryError } from '../../transport/http-query.ts';
import type { ApplicationRouteProps, PreparedApplicationRoute, RoutePreparation } from '../contracts.ts';
import type { Selection } from '../../inventory/contracts.ts';
import type { InventoryLedgerCapability } from '../../inventory/ledger-contracts.ts';

export function prepareInventoryRoute(input: RoutePreparation, onAccessFailure?: (error: HttpQueryError) => void, navigation: { readonly initialProduct?: Selection; readonly returnToProduct?: () => Promise<boolean>; readonly onOpenSource?: InventoryLedgerCapability['onOpenSource'] } = {}): PreparedApplicationRoute {
  if (!input.configuration.inventory) throw new TypeError('Inventory capability was not configured.');
  const reader = createInventoryHttpReader(input.http), productReader = createProductHttpReader(input.http);
  const actions = input.configuration.inventory.actions;
  if (input.configuration.inventory.ledger && typeof onAccessFailure !== 'function') throw new TypeError('Inventory ledger requires the current route access owner.');
  const { onOpenSource, ...pageNavigation } = navigation;
  const ledger = input.configuration.inventory.ledger && onAccessFailure ? { reader: createInventoryLedgerHttpReader(input.http), onAccessFailure, ...(onOpenSource ? { onOpenSource } : {}) } : undefined;
  const output = onAccessFailure ? { reader: createInventoryOutputReader(input.http), onAccessFailure } : undefined;
  return { View: ({ scope }: ApplicationRouteProps) => <InventoryPageView {...pageNavigation} scope={scope} reader={reader} productReader={productReader} actions={actions} {...(ledger ? { ledger } : {})} {...(output ? { output } : {})} /> };
}
