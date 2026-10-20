import { SalesPageHost } from '../../sales/sales-route.tsx';
import { createSalesHttpReader, createSalesFilterReferenceHttpReader } from '../../sales/http-reader.ts';
import type { ApplicationRouteProps, PreparedApplicationRoute, RoutePreparation } from '../contracts.ts';

export function prepareSalesRoute(input: RoutePreparation): PreparedApplicationRoute {
  if (!input.configuration.sales) throw new TypeError('Sales capability was not configured.');
  const reader = createSalesHttpReader(input.http), references = createSalesFilterReferenceHttpReader(input.http);
  return { View: ({ scope }: ApplicationRouteProps) => <SalesPageHost scope={scope} reader={reader} references={references} /> };
}
