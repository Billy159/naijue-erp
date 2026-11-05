import type { ReadScope } from '../../../../src/loading/read-scope.ts';
import type { CatalogueCommandSession } from './session.ts';
import type { CatalogueMaintenanceCommand } from '../../../../src/product-settings/catalogue-maintenance-http-client.ts';
import { snapshotQueryParameters } from '../../../../src/loading/query-parameters.ts';
import type {ReadyPageOptions,MountedReplicaPage,Navigate,PrepareRoute} from '../common/feature-contracts.ts';
export function createCatalogueFeature(options:ReadyPageOptions){
  const {session}=options;
  const access=(kind:'unauthenticated'|'forbidden')=>session.onAccessFailure({kind});
  const enabled = (flag: boolean | undefined, admin = false) => () => {
    const auth = session.auth.getSnapshot();
    return flag === true && auth.phase === 'authenticated' && (auth.principal?.role === 'ADMIN' || !admin && auth.principal?.role === 'WAREHOUSE');
  };
  let catalogue:CatalogueCommandSession|undefined;
  const catalogueRecovery=new Map<string,{identity:ReadScope['identity'];kind:'CATEGORY'|'COLOR'|'FIT';command:CatalogueMaintenanceCommand}>();
  const catalogueCommands = async (page: ReadScope): Promise<CatalogueCommandSession | undefined> => {
    const flags = options.routes.maintenance;
    if (![flags?.categories, flags?.colors, flags?.fits].some(flag => enabled(flag)())) return undefined;
    if (catalogue?.scope.active) return catalogue;
    const module = await import('./session.ts');
    if (!page.active || session.auth.getSnapshot().principal?.accountId !== page.identity.accountId) return undefined;
    const identity = Object.freeze({ ...page.identity });
    catalogue = module.createCatalogueCommandSession(session, flags, options.newRequestKey, (kind, command) => {
      catalogueRecovery.set(command.requestKey, { identity, kind, command: snapshotQueryParameters(command) });
    });
    return catalogue;
  };
  async function mount(host: HTMLElement, route: string, scope: ReadScope): Promise<MountedReplicaPage> {
    const principal = session.auth.getSnapshot().principal;
    if (!principal || principal.accountId !== scope.identity.accountId || !scope.active) throw new Error('当前登录身份尚未确认。');
    const http = session.http, config = options.routes, flags = config.maintenance;
    if ((route === 'product-categories' && config.productCategories) || (route === 'product-settings' && config.productSettings) || (route === 'barcode-schemes' && config.barcodeSchemes)) {
      const [module, helpers] = await Promise.all([import('./entry.tsx'), import('../common/source-helpers.tsx')]);
      if (!scope.active) return { dispose: () => {}, canLeave: () => true };
      const catalogueSession = route === 'barcode-schemes' ? undefined : await catalogueCommands(scope);
      if (!scope.active) return { dispose: () => {}, canLeave: () => true };
      let guard: (() => boolean) | null = null;
      const dispose = await module.mountCatalogue(host, route as 'product-categories' | 'product-settings' | 'barcode-schemes', {
        onChanged: options.catalogue.onChanged, ...(catalogueSession ? { maintenance: catalogueSession.maintenance, commandOwners: catalogueSession.commandOwners } : {}), renderPager: helpers.renderOriginalPager, categoryControlCss: helpers.originalCategoryControlCss, mountEmpty: helpers.mountOriginalEmpty, scope, http, onAccessFailure: access, onCanLeaveChange: value => { guard = value; },
        ...(config.productSettings ? { initialSettingTab: config.productSettings.initialTab,
          allowedSettingTabs: (['colors', 'groups', 'fits', 'seasons'] as const).filter(tab => config.productSettings && config.productSettings[tab]) } : {}),
      });
      return { dispose, canLeave: () => guard?.() ?? true };
    }
    throw new Error('此页面尚未接入当前版本。');
  }
  const prepare=(route:string)=>Promise.all([import('./entry.tsx'),route==='product-categories'?import('./category-page.tsx'):route==='product-settings'?import('./dictionary-page.tsx'):import('./scheme-page.tsx')]);
  return {prepare,mount,commands:catalogueCommands,hasUnresolvedWrite:()=>!!catalogue?.hasUnresolvedWrite(),retainedCommands:()=>[...catalogueRecovery.values()],dispose(){catalogue?.dispose();catalogue=undefined;}};
}
