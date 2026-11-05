import { createPartyHttpClient } from '../../parties/http-client.ts';
import { createPartyWorkspace } from '../../parties/controller.ts';
import { CustomerPageHost, SupplierPageHost } from '../../parties/party-route.tsx';
import type { PartySession, RoutePreparation } from '../contracts.ts';
import { settingsAuditModulesFor } from '../../../../../packages/application/src/settings-audit-validation.ts';
import { blankAuditDraft } from '../../settings/audit/contracts.ts';

/** Session-scoped recovery state is NOT the disposable top-level route's read scope. */
export function preparePartySession(input: RoutePreparation, onAccessFailure: () => void, onAuditAccessFailure?: (route: 'customers' | 'suppliers', kind: 'unauthenticated' | 'forbidden') => void): PartySession {
  const config = input.configuration.parties;
  if (!config) throw new TypeError('Party capability was not configured.');
  const workspace = createPartyWorkspace({ scope: input.scope, client: createPartyHttpClient(input.http), newRequestKey: config.newRequestKey, onAccessFailure });
  const modules = input.principal.role === 'ADMIN' || input.principal.role === 'WAREHOUSE'
    ? settingsAuditModulesFor(input.principal.role, { ...blankAuditDraft, page: 1, pageSize: 20 }) : [];
  const auditFor = (route: 'customers' | 'suppliers') => config.audit && onAuditAccessFailure ? { ...config.audit,
    allowedModules: config.audit.allowedModules.filter(module => modules.includes(module)), onAccessFailure: (kind: 'unauthenticated' | 'forbidden') => onAuditAccessFailure(route, kind) } : undefined;
  return Object.freeze({ workspace, prepare: (route: 'customers' | 'suppliers') => ({
    View: () => { const audit = auditFor(route), props = { workspace, ...(config.readOnly ? { readOnly: true as const } : {}), ...(audit ? { audit } : {}) }; return route === 'customers' ? <CustomerPageHost {...props} /> : <SupplierPageHost {...props} />; },
  }) });
}
