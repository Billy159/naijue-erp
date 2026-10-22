import { ReadOnlyStoreSettingsHost } from '../../settings/stores/read-only-host.tsx';
import { createStoreSettingsHttpReader } from '../../settings/stores/http-reader.ts';
import type { ApplicationRouteProps, PreparedApplicationRoute, RoutePreparation } from '../contracts.ts';

export function prepareStoreSettingsRoute(input: RoutePreparation, onAccessFailure: (kind: 'unauthenticated' | 'forbidden') => void): PreparedApplicationRoute {
  const configuration = input.configuration.storeSettings;
  if (!configuration || typeof onAccessFailure !== 'function' || typeof configuration.allowHallDirectoryRead !== 'boolean'
    || !Array.isArray(configuration.allowedTabs) || !configuration.allowedTabs.length
    || configuration.allowedTabs.some(tab => tab !== 'stores' && tab !== 'warehouses')
    || new Set(configuration.allowedTabs).size !== configuration.allowedTabs.length
    || !configuration.allowedTabs.includes(configuration.initialTab)) throw new TypeError('Explicit read-only store settings configuration is required.');
  if (input.principal.accountId !== input.scope.identity.accountId) throw new TypeError('Store settings identity does not match its scope.');
  const reader = createStoreSettingsHttpReader(input.http);
  return { View: ({ scope }: ApplicationRouteProps) => <ReadOnlyStoreSettingsHost scope={scope} reader={reader} allowedTabs={configuration.allowedTabs}
    initialTab={configuration.initialTab} allowHallDirectoryRead={configuration.allowHallDirectoryRead} onAccessFailure={onAccessFailure} /> };
}
