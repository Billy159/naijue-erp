import { PaymentSettingsPage } from '../../payment-settings/payment-page.tsx';
import { createOrganizationSettingsDirectory } from '../../settings/stores/maintenance-http-client.ts';
import { createPaymentSettingsWorkspace } from '../../payment-settings/controller.ts';
import { createPaymentSettingsCommandClient } from '../../payment-settings/http-client.ts';
import type { ApplicationRouteProps, PreparedApplicationRoute, RoutePreparation } from '../contracts.ts';

export function preparePaymentSettingsRoute(input: RoutePreparation, onAccessFailure: (kind: 'unauthenticated' | 'forbidden') => void): PreparedApplicationRoute {
  const configuration = input.configuration.paymentSettings;
  if (!configuration || typeof onAccessFailure !== 'function' || typeof configuration.view?.canPrepare !== 'boolean') throw new TypeError('Explicit payment view dependencies are required.');
  if (input.principal.accountId !== input.scope.identity.accountId) throw new TypeError('Payment settings identity does not match its scope.');
  const workspace = configuration.view.workspace;
  if (workspace && !workspace.matches(input.scope)) throw new TypeError('Payment workspace identity does not match this route.');
  const directory = configuration.view.directory ?? createOrganizationSettingsDirectory({ scope: input.scope, http: input.http });
  return { ...(workspace ? { canLeave: () => workspace.canLeave() } : {}),
    View: ({ scope }: ApplicationRouteProps) => <PaymentSettingsPage {...configuration.view} directory={directory} scope={scope} onAccessFailure={onAccessFailure} /> };
}

/** Called once with a session scope; normal route teardown never owns this key. */
export function preparePaymentSettingsSession(input: RoutePreparation, onAccessFailure: (kind: 'unauthenticated' | 'forbidden') => void) {
  const configuration = input.configuration.paymentSettings, commands = configuration?.commands;
  if (!configuration || !commands || configuration.view.workspace || typeof commands.newRequestKey !== 'function' || typeof commands.writesEnabled !== 'function') throw new TypeError('One explicit payment command owner is required.');
  const workspace = createPaymentSettingsWorkspace({ scope: input.scope, client: createPaymentSettingsCommandClient(input.http),
    newRequestKey: commands.newRequestKey, writesEnabled: commands.writesEnabled, onAccessFailure });
  return { workspace, prepare(route: RoutePreparation, accessFailure: typeof onAccessFailure) {
    return preparePaymentSettingsRoute({ ...route, configuration: { ...route.configuration, paymentSettings: { ...configuration, view: { ...configuration.view, workspace } } } }, accessFailure);
  } };
}
