import { ReadOnlyStoreSettingsHost } from '../../settings/stores/read-only-host.tsx';
import { createOrganizationStoreSettingsReader, createOrganizationSettingsDirectory, createStoreSettingsCommandClient } from '../../settings/stores/maintenance-http-client.ts';
import { createStoreMaintenanceWorkspace, type StoreMaintenanceWorkspace } from '../../settings/stores/maintenance-controller.ts';
import { StoreSettingsMaintenanceHost } from '../../settings/stores/maintenance-host.tsx';
import type { ApplicationRouteProps, PreparedApplicationRoute, RoutePreparation } from '../contracts.ts';

export function prepareStoreSettingsRoute(input: RoutePreparation, onAccessFailure: (kind: 'unauthenticated' | 'forbidden') => void, workspace?: StoreMaintenanceWorkspace): PreparedApplicationRoute {
  const configuration = input.configuration.storeSettings;
  if (!configuration || typeof onAccessFailure !== 'function' || typeof configuration.allowHallDirectoryRead !== 'boolean'
    || !Array.isArray(configuration.allowedTabs) || !configuration.allowedTabs.length
    || configuration.allowedTabs.some(tab => tab !== 'stores' && tab !== 'warehouses')
    || new Set(configuration.allowedTabs).size !== configuration.allowedTabs.length
    || !configuration.allowedTabs.includes(configuration.initialTab)) throw new TypeError('Explicit read-only store settings configuration is required.');
  if (input.principal.accountId !== input.scope.identity.accountId) throw new TypeError('Store settings identity does not match its scope.');
  if (workspace && !workspace.matches(input.scope)) throw new TypeError('Store workspace identity does not match this route.');
  const reader = createOrganizationStoreSettingsReader(input.http);
  if (workspace) {
    const directory = createOrganizationSettingsDirectory({ scope: input.scope, http: input.http, ...(configuration.commands?.customers ? { customers: configuration.commands.customers } : {}) });
    return { canLeave: () => workspace.canLeave(), View: ({ scope }: ApplicationRouteProps) => <StoreSettingsMaintenanceHost scope={scope} reader={reader} workspace={workspace} directory={directory}
      allowedTabs={configuration.allowedTabs} initialTab={configuration.initialTab} allowHallDirectoryRead={configuration.allowHallDirectoryRead} onAccessFailure={onAccessFailure} /> };
  }
  return { View: ({ scope }: ApplicationRouteProps) => <ReadOnlyStoreSettingsHost scope={scope} reader={reader} allowedTabs={configuration.allowedTabs}
    initialTab={configuration.initialTab} allowHallDirectoryRead={configuration.allowHallDirectoryRead} onAccessFailure={onAccessFailure} /> };
}

/** The authenticated session owns both bounded editors; route retries only replace reads. */
export function prepareStoreSettingsSession(input: RoutePreparation, onAccessFailure: (kind: 'unauthenticated' | 'forbidden') => void) {
  const configuration = input.configuration.storeSettings, commands = configuration?.commands;
  if (!configuration || !commands || typeof commands.newRequestKey !== 'function' || typeof commands.writesEnabled !== 'function') throw new TypeError('Explicit store command owner and write gates are required.');
  const workspace = createStoreMaintenanceWorkspace({ scope: input.scope, client: createStoreSettingsCommandClient(input.http),
    newRequestKey: commands.newRequestKey, writesEnabled: commands.writesEnabled, onAccessFailure });
  return { workspace, prepare(route: RoutePreparation, accessFailure: typeof onAccessFailure) { return prepareStoreSettingsRoute(route, accessFailure, workspace); } };
}
