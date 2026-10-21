import { SalesPageHost } from '../../sales/sales-route.tsx';
import { createSalesHttpReader, createSalesFilterReferenceHttpReader } from '../../sales/http-reader.ts';
import type { ApplicationRouteProps, PreparedApplicationRoute, RoutePreparation } from '../contracts.ts';
import type { SalesSession } from '../contracts.ts';

export function prepareSalesRoute(input: RoutePreparation): PreparedApplicationRoute {
  const configuration = input.configuration.sales;
  if (!configuration) throw new TypeError('Sales capability was not configured.');
  const reader = createSalesHttpReader(input.http), references = createSalesFilterReferenceHttpReader(input.http);
  const detailStylesheet = configuration.detailStylesheet;
  const detail = detailStylesheet ? { loadDetailStyles: () => detailStylesheet.load() } : {};
  return { View: ({ scope }: ApplicationRouteProps) => <SalesPageHost scope={scope} reader={reader} references={references} {...detail} /> };
}

/** Opt-in only. Read hosts and the development host do not infer this capability. */
export async function prepareSalesSession(input: RoutePreparation, onAccessFailure: () => void): Promise<SalesSession> {
  const module = await import('./sales-commands.tsx');
  return module.prepareSalesCommandSession(input, onAccessFailure);
}
