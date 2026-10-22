import { StaffSettingsPage } from '../../staff-settings/staff-page.tsx';
import { createOrganizationSettingsDirectory } from '../../settings/stores/maintenance-http-client.ts';
import { createStaffSettingsWorkspace } from '../../staff-settings/controller.ts';
import { createStaffSettingsCommandClient, createStaffSettingsHttpReader } from '../../staff-settings/http-client.ts';
import type { ApplicationRouteProps, PreparedApplicationRoute, RoutePreparation } from '../contracts.ts';

export function prepareStaffSettingsRoute(input: RoutePreparation, onAccessFailure: (kind: 'unauthenticated' | 'forbidden') => void): PreparedApplicationRoute {
  const configuration = input.configuration.staffSettings;
  if (!configuration || typeof onAccessFailure !== 'function' || typeof configuration.view?.canPrepare !== 'boolean' || !Array.isArray(configuration.view.roles)) throw new TypeError('Explicit staff view dependencies are required.');
  if (input.principal.role !== 'ADMIN' || input.principal.accountId !== input.scope.identity.accountId) throw new TypeError('Staff settings requires a matching current administrator identity.');
  const workspace = configuration.view.workspace;
  if (workspace && !workspace.matches(input.scope)) throw new TypeError('Staff workspace identity does not match this route.');
  const directory = configuration.view.directory ?? createOrganizationSettingsDirectory({ scope: input.scope, http: input.http });
  return { ...(workspace ? { canLeave: () => workspace.canLeave() } : {}), View: ({ scope }: ApplicationRouteProps) => <StaffSettingsPage {...configuration.view} directory={directory} scope={scope} onAccessFailure={onAccessFailure} /> };
}

/** W8 owns one session workspace; W3 readback stays a real independent detail query. */
export function prepareStaffSettingsSession(input: RoutePreparation, onAccessFailure: (kind: 'unauthenticated' | 'forbidden') => void, hasOtherUnresolvedWrite: () => boolean) {
  const configuration = input.configuration.staffSettings, commands = configuration?.commands;
  if (!configuration || !commands || configuration.view.workspace || input.principal.role !== 'ADMIN' || input.principal.accountId !== input.scope.identity.accountId
    || typeof commands.newRequestKey !== 'function' || typeof commands.writesEnabled !== 'function' || typeof hasOtherUnresolvedWrite !== 'function') throw new TypeError('One explicit administrator staff session owner is required.');
  const workspace = createStaffSettingsWorkspace({ scope: input.scope, roles: configuration.view.roles, reader: createStaffSettingsHttpReader(input.http), client: createStaffSettingsCommandClient(input.http),
    newRequestKey: commands.newRequestKey, writesEnabled: commands.writesEnabled, onAccessFailure, hasOtherUnresolvedWrite });
  return { workspace, prepare(route: RoutePreparation, accessFailure: typeof onAccessFailure) {
    return prepareStaffSettingsRoute({ ...route, configuration: { ...route.configuration, staffSettings: { ...configuration, view: { ...configuration.view, workspace } } } }, accessFailure);
  } };
}
