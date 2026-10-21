import { useMemo } from 'react';
import { InventoryPageView } from '../../src/inventory/inventory-route.tsx';
import { createAcceptanceInventory, createAcceptanceProducts } from '../fixtures.ts';
import type { AcceptanceRouteProps } from '../contracts.ts';
export function View({ scope, report }: AcceptanceRouteProps) {
  const reader = useMemo(() => createAcceptanceInventory(report), [report]);
  const productReader = useMemo(() => createAcceptanceProducts(report), [report]);
  return <InventoryPageView scope={scope} reader={reader} productReader={productReader} />;
}
