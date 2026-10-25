import type { ReplicaSession } from '../common/session.ts';
import type { ProductionHostConfiguration } from '../../../../src/production-host/configuration.ts';
import { createCatalogueMaintenanceHttpClient, type CatalogueMaintenanceAction, type CatalogueMaintenanceCommand } from '../../../../src/product-settings/catalogue-maintenance-http-client.ts';
import { CatalogueEditorController } from '../../../../src/product-settings/catalogue-maintenance-state.ts';
import type { CatalogueMaintenanceCapability } from '../../../../src/product-settings/colors/contracts.ts';
import type { CatalogueRuntimeOptions } from './entry.tsx';

type Kind = 'CATEGORY' | 'COLOR' | 'FIT';
/** One current authenticated catalogue command owner. This is the original D2
 * client pairing; construction performs no HTTP and grants no server authority. */
export function createCatalogueCommandSession(session: ReplicaSession, flags: ProductionHostConfiguration['routes']['maintenance'], newRequestKey: () => string,
  retain: (kind: Kind, command: CatalogueMaintenanceCommand) => void) {
  const auth = session.auth.getSnapshot();
  if (auth.phase !== 'authenticated' || !auth.principal || !['ADMIN', 'WAREHOUSE'].includes(auth.principal.role)) throw new Error('当前账号未获资料维护能力。');
  const scope = session.reads.createScope('replica-catalogue-commands');
  const maintenance: NonNullable<CatalogueRuntimeOptions['maintenance']> = {};
  const commandOwners: NonNullable<CatalogueRuntimeOptions['commandOwners']> = {};
  for (const [kind, flag] of [['CATEGORY', flags?.categories], ['COLOR', flags?.colors], ['FIT', flags?.fits]] as const) {
    if (flag !== true) continue;
    const order = kind === 'CATEGORY' && flags?.categoryOrderReady === true;
    const allowedActions: readonly CatalogueMaintenanceAction[] = order ? ['CREATE', 'EDIT', 'DELETE', 'REORDER', 'UNDO_REORDER'] : ['CREATE', 'EDIT', 'DELETE'];
    const base = { client: createCatalogueMaintenanceHttpClient(session.http, kind), allowedActions, newRequestKey, onRecoveryRequired: (command: CatalogueMaintenanceCommand) => retain(kind, command) };
    const capability: CatalogueMaintenanceCapability = kind === 'CATEGORY' ? { ...base, kind, ...(order ? { categoryOrderReady: true as const } : {}) } : { ...base, kind };
    maintenance[kind] = capability;
    commandOwners[kind] = new CatalogueEditorController({ ...capability, scope, onAccessFailure: error => session.onAccessFailure(error) });
  }
  return {
    scope, maintenance, commandOwners,
    hasUnresolvedWrite: () => scope.active && Object.values(commandOwners).some(controller => ['submitting', 'checking', 'uncertain', 'committed'].includes(controller.getSnapshot().phase)),
    dispose: () => scope.dispose(),
  };
}
export type CatalogueCommandSession = ReturnType<typeof createCatalogueCommandSession>;
