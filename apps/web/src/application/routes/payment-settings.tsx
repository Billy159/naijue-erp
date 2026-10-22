import { PaymentSettingsPage } from '../../payment-settings/payment-page.tsx';
import { createOrganizationSettingsDirectory } from '../../settings/stores/maintenance-http-client.ts';
import type { ApplicationRouteProps, PreparedApplicationRoute, RoutePreparation } from '../contracts.ts';

export function preparePaymentSettingsRoute(input: RoutePreparation, onAccessFailure: (kind: 'unauthenticated' | 'forbidden') => void): PreparedApplicationRoute {
  const configuration = input.configuration.paymentSettings;
  if (!configuration || typeof onAccessFailure !== 'function' || typeof configuration.view?.canPrepare !== 'boolean') throw new TypeError('Explicit payment view dependencies are required.');
  if (input.principal.accountId !== input.scope.identity.accountId) throw new TypeError('Payment settings identity does not match its scope.');
  const directory = configuration.view.directory ?? createOrganizationSettingsDirectory({ scope: input.scope, http: input.http });
  return { View: ({ scope }: ApplicationRouteProps) => <PaymentSettingsPage {...configuration.view} directory={directory} scope={scope} onAccessFailure={onAccessFailure} /> };
}
