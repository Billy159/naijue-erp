import { AccountSettingsPage } from '../../account-settings/account-page.tsx';
import { createAccountSettingsWorkspace } from '../../account-settings/controller.ts';
import { createAccountSettingsCommandClient, createAccountSettingsHttpReader } from '../../account-settings/http-client.ts';
import { createStaffSettingsHttpReader } from '../../staff-settings/http-client.ts';
import type { ApplicationRouteProps, PreparedApplicationRoute, RoutePreparation } from '../contracts.ts';

/** The approved separate account page is an independent ADMIN capability. */
export function prepareAccountSettingsRoute(input: RoutePreparation, onAccessFailure: (kind: 'unauthenticated' | 'forbidden') => void): PreparedApplicationRoute {
  const configuration = input.configuration.accountSettings;
  if (!configuration || typeof onAccessFailure !== 'function' || typeof configuration.view?.canPrepare !== 'boolean' || !Array.isArray(configuration.view.roles)) throw new TypeError('Explicit account view dependencies are required.');
  if (input.principal.role !== 'ADMIN' || input.principal.accountId !== input.scope.identity.accountId) throw new TypeError('Account settings requires a matching current administrator.');
  const workspace = configuration.view.workspace;
  if (configuration.view.canPrepare && !workspace) throw new TypeError('Account preparation requires a session owner.');
  if (workspace && !workspace.matches(input.scope)) throw new TypeError('Account workspace identity does not match this route.');
  return { ...(workspace ? { canLeave: () => workspace.canLeave() } : {}), View: ({ scope }: ApplicationRouteProps) => <AccountSettingsPage {...configuration.view} scope={scope} onAccessFailure={onAccessFailure} /> };
}

/** The session owner retains only F3's safe draft/receipt state. Password remains
 * exclusively inside its mounted form and one submit argument, never the root. */
export function prepareAccountSettingsSession(input: RoutePreparation, onAccessFailure: (kind: 'unauthenticated' | 'forbidden') => void, hasOtherUnresolvedWrite: () => boolean) {
  const configuration = input.configuration.accountSettings, commands = configuration?.commands;
  if (!configuration || !commands || configuration.view.workspace || input.principal.role !== 'ADMIN' || input.principal.accountId !== input.scope.identity.accountId
    || typeof commands.newRequestKey !== 'function' || typeof commands.writesEnabled !== 'function' || typeof hasOtherUnresolvedWrite !== 'function') throw new TypeError('One explicit administrator account session owner is required.');
  const reader = createAccountSettingsHttpReader(input.http), staffReader = createStaffSettingsHttpReader(input.http);
  const workspace = createAccountSettingsWorkspace({ scope: input.scope, reader, staffReader, client: createAccountSettingsCommandClient(input.http),
    newRequestKey: commands.newRequestKey, writesEnabled: commands.writesEnabled, onAccessFailure, hasOtherUnresolvedWrite });
  return { workspace, prepare(route: RoutePreparation, accessFailure: typeof onAccessFailure) {
    return prepareAccountSettingsRoute({ ...route, configuration: { ...route.configuration, accountSettings: { ...configuration, view: { ...configuration.view, reader, staffReader, workspace } } } }, accessFailure);
  } };
}
