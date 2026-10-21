import { createSalesHttpReader, createSalesFilterReferenceHttpReader } from '../../sales/http-reader.ts';
import type { ApplicationRouteProps, RoutePreparation, SalesSession } from '../contracts.ts';
import { createSalesCommandHttpClient } from '../../sales/commands/http-client.ts';
import { SalesEditorSession } from '../../sales/commands/editor-session.ts';
import { SalesCommandPageHost } from '../../sales/commands/page-host.tsx';

/** Separately imported opt-in leaf. Read-only routes do not import write clients
 * or session owners merely to render a sales list. */
export function prepareSalesCommandSession(input: RoutePreparation, onAccessFailure: () => void): SalesSession {
  const configuration = input.configuration.sales, commands = configuration?.commands;
  if (!commands || !configuration.detailStylesheet || typeof commands.newRequestKey !== 'function'
    || commands.preparation && (typeof commands.preparation.prepareCreate !== 'function' || typeof commands.preparation.prepareEdit !== 'function')) throw new TypeError('Explicit sales command capability is required.');
  const reader = createSalesHttpReader(input.http);
  const workspace = new SalesEditorSession({ scope: input.scope, principal: input.principal, reader,
    client: createSalesCommandHttpClient(input.http), newRequestKey: commands.newRequestKey, onAccessFailure,
    ...(commands.preparation ? { preparation: commands.preparation } : {}) });
  const loadDetailStyles = () => configuration.detailStylesheet!.load();
  return Object.freeze({ workspace, prepare: (route: RoutePreparation) => {
    const routeReader = createSalesHttpReader(route.http), references = createSalesFilterReferenceHttpReader(route.http);
    return { View: ({ scope }: ApplicationRouteProps) => <SalesCommandPageHost scope={scope} reader={routeReader} references={references} session={workspace} loadDetailStyles={loadDetailStyles} /> };
  } });
}
