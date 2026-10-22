import { StaffSettingsPage } from '../../staff-settings/staff-page.tsx';
import type { ApplicationRouteProps, PreparedApplicationRoute, RoutePreparation } from '../contracts.ts';

export function prepareStaffSettingsRoute(input: RoutePreparation, onAccessFailure: (kind: 'unauthenticated' | 'forbidden') => void): PreparedApplicationRoute {
  const configuration = input.configuration.staffSettings;
  if (!configuration || typeof onAccessFailure !== 'function' || typeof configuration.view?.canPrepare !== 'boolean' || !Array.isArray(configuration.view.roles)) throw new TypeError('Explicit staff view dependencies are required.');
  if (input.principal.accountId !== input.scope.identity.accountId) throw new TypeError('Staff settings identity does not match its scope.');
  return { View: ({ scope }: ApplicationRouteProps) => <StaffSettingsPage {...configuration.view} scope={scope} onAccessFailure={onAccessFailure} /> };
}
