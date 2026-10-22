import { ReadOnlyProductSettingsHost } from '../../product-settings/read-only-settings-host.tsx';
import { createCatalogueSettingsHttpReader } from '../../product-settings/colors/http-reader.ts';
import { createDictionaryHttpReader } from '../../product-settings/size-groups/http-reader.ts';
import type { ApplicationRouteProps, PreparedApplicationRoute, RoutePreparation } from '../contracts.ts';

export function prepareProductSettingsRoute(input: RoutePreparation, onAccessFailure: (kind: 'unauthenticated'|'forbidden') => void): PreparedApplicationRoute {
  const configuration = input.configuration.productSettings;
  if (!configuration || typeof onAccessFailure !== 'function' || !Array.isArray(configuration.allowedTabs) || !configuration.allowedTabs.length
    || configuration.allowedTabs.some(tab => tab !== 'colors' && tab !== 'groups' && tab !== 'fits' && tab !== 'seasons') || new Set(configuration.allowedTabs).size !== configuration.allowedTabs.length
    || !configuration.allowedTabs.includes(configuration.initialTab)) throw new TypeError('Explicit read-only product settings tabs and access owner are required.');
  if (input.principal.accountId !== input.scope.identity.accountId) throw new TypeError('Product settings identity does not match its scope.');
  const reader = createDictionaryHttpReader(input.http);
  const catalogueReader = configuration.allowedTabs.some(tab => tab === 'colors' || tab === 'fits') ? createCatalogueSettingsHttpReader(input.http) : undefined;
  let leaveGuard: (() => boolean) | null = null;
  const onCanLeaveChange = (guard: (() => boolean) | null) => { if (input.scope.active) leaveGuard = guard; };
  input.scope.signal.addEventListener('abort', () => { leaveGuard = null; }, { once: true });
  return { canLeave: () => !input.scope.active || leaveGuard === null || leaveGuard() === true,
    View: ({ scope }: ApplicationRouteProps) => <ReadOnlyProductSettingsHost scope={scope} reader={reader} {...(catalogueReader ? { catalogueReader } : {})} allowedTabs={configuration.allowedTabs}
      initialTab={configuration.initialTab} onAccessFailure={onAccessFailure} {...(configuration.maintenance ? { maintenance: configuration.maintenance } : {})} onCanLeaveChange={onCanLeaveChange} /> };
}
