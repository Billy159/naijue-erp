import { createPartyHttpClient } from '../../parties/http-client.ts';
import { createPartyWorkspace } from '../../parties/controller.ts';
import { CustomerPageHost, SupplierPageHost } from '../../parties/party-route.tsx';
import type { PartySession, RoutePreparation } from '../contracts.ts';

/** Session-scoped recovery state is NOT the disposable top-level route's read scope. */
export function preparePartySession(input: RoutePreparation, onAccessFailure: () => void): PartySession {
  const config = input.configuration.parties;
  if (!config) throw new TypeError('Party capability was not configured.');
  const workspace = createPartyWorkspace({ scope: input.scope, client: createPartyHttpClient(input.http), newRequestKey: config.newRequestKey, onAccessFailure });
  return Object.freeze({ workspace, prepare: (route: 'customers' | 'suppliers') => ({
    View: () => route === 'customers' ? <CustomerPageHost workspace={workspace} /> : <SupplierPageHost workspace={workspace} />,
  }) });
}
