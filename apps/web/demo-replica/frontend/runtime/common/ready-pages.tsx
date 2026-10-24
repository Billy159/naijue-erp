import { createRoot, type Root } from 'react-dom/client';
import type { ReactNode } from 'react';
import type { ReplicaSession } from './session.ts';
import type { ReadScope } from '../../../../src/loading/read-scope.ts';
import type { ProductionHostConfiguration } from '../../../../src/production-host/configuration.ts';
import type { CatalogueRuntimeOptions } from '../catalogue/entry.tsx';
import type { InventoryMountOptions } from '../inventory/index.tsx';
import type { StoreMaintenanceWorkspace } from '../../../../src/settings/stores/maintenance-controller.ts';
import type { PartyWorkspace } from '../../../../src/parties/controller.ts';
import type { StaffSettingsWorkspace } from '../../../../src/staff-settings/controller.ts';
import type { AccountSettingsWorkspace } from '../../../../src/account-settings/controller.ts';
import type { PaymentSettingsWorkspace } from '../../../../src/payment-settings/controller.ts';
import { createSettingsAuditHttpReader } from '../../../../src/settings/audit/http-reader.ts';
import { blankAuditDraft } from '../../../../src/settings/audit/contracts.ts';
import { settingsAuditModulesFor } from '../../../../../../packages/application/src/settings-audit-validation.ts';

export interface ReadyPageOptions {
  readonly session: ReplicaSession;
  readonly routes: ProductionHostConfiguration['routes'];
  readonly newRequestKey: () => string;
  readonly inventory: Pick<InventoryMountOptions, 'ledgerDialog' | 'createWorkbook'> & Pick<InventoryMountOptions, 'onOpenSource'>;
  readonly catalogue: Pick<CatalogueRuntimeOptions, 'maintenance' | 'onChanged'>;
}
export interface MountedReplicaPage { readonly dispose: () => void; readonly canLeave: () => boolean }
const roles = Object.freeze([
  { value: 'ADMIN', label: '管理员', requiresHall: false },
  { value: 'WAREHOUSE', label: '仓库', requiresHall: false },
  { value: 'SALESPERSON', label: '营业员', requiresHall: true },
]);

/** Session workspaces survive page unmount. Only the selected page loads code or data. */
export function createReadyPageMounts(options: ReadyPageOptions, navigate: (route: string) => void) {
  const { session } = options;
  let owner: ReadScope | null = null;
  let stores: StoreMaintenanceWorkspace | undefined, parties: PartyWorkspace | undefined;
  let staff: StaffSettingsWorkspace | undefined, accounts: AccountSettingsWorkspace | undefined, payments: PaymentSettingsWorkspace | undefined;
  const access = (kind: 'unauthenticated' | 'forbidden') => session.onAccessFailure({ kind });
  const unresolved = () => !!owner?.active && !!(stores?.hasUnresolvedWrite() || parties?.hasUnresolvedWrite() || staff?.hasUnresolvedWrite() || accounts?.hasUnresolvedWrite() || payments?.hasUnresolvedWrite());
  const ownerScope = () => {
    if (!owner?.active) {
      owner = session.reads.createScope('replica-settings-session');
      stores = undefined; parties = undefined; staff = undefined; accounts = undefined; payments = undefined;
    }
    return owner;
  };
  const enabled = (flag: boolean | undefined, admin = false) => () => {
    const auth = session.auth.getSnapshot();
    return flag === true && auth.phase === 'authenticated' && (auth.principal?.role === 'ADMIN' || !admin && auth.principal?.role === 'WAREHOUSE');
  };
  const audit = () => {
    const role = session.auth.getSnapshot().principal?.role;
    const allowedModules = role === 'ADMIN' || role === 'WAREHOUSE' ? settingsAuditModulesFor(role, { ...blankAuditDraft, page: 1, pageSize: 20 }) : [];
    return { reader: createSettingsAuditHttpReader(session.http), allowedModules, hasUnresolvedWrite: unresolved };
  };
  async function mount(host: HTMLElement, route: string, scope: ReadScope): Promise<MountedReplicaPage> {
    const principal = session.auth.getSnapshot().principal;
    if (!principal || principal.accountId !== scope.identity.accountId || !scope.active) throw new Error('当前登录身份尚未确认。');
    const http = session.http, config = options.routes, flags = config.maintenance;
    if (route === 'inventory' && config.inventory) {
      const module = await import('../inventory/index.tsx');
      if (!scope.active) return { dispose: () => {}, canLeave: () => true };
      return { dispose: module.mountInventoryPage(host, { ...options.inventory, scope, http, onAccessFailure: session.onAccessFailure, onViewProduct: product => navigate('products/view/' + encodeURIComponent(product.id)) }), canLeave: () => true };
    }
    if (route === 'products' && config.products) {
      const module = await import('../products/index.tsx');
      if (!scope.active) return { dispose: () => {}, canLeave: () => true };
      return { dispose: module.mountProductList(host, { scope, http, onAccessFailure: session.onAccessFailure, openEditor: id => navigate(id === null ? 'products/new' : 'products/edit/' + encodeURIComponent(id)) }), canLeave: () => true };
    }
    if (route.startsWith('products/view/') && config.products && config.productFullPage) {
      const [module, readers] = await Promise.all([import('../products/index.tsx'), import('../../../../src/products/product-page-http-reader.ts')]);
      if (!scope.active) return { dispose: () => {}, canLeave: () => true };
      const id = decodeURIComponent(route.slice('products/view/'.length));
      const reader = readers.createProductFullPageHttpReader(http, ['prices', 'barcodes', 'stock'], config.productStockOverview ? { stockOverview: true } : {});
      let composed = reader;
      if (reader.barcodes && config.barcodeSchemes) {
        const { createDictionaryHttpReader } = await import('../../../../src/product-settings/size-groups/http-reader.ts');
        composed = { ...reader, barcodes: { ...reader.barcodes, schemeReader: { readBarcodeScheme: createDictionaryHttpReader(http).readBarcodeScheme } } };
      }
      if (!scope.active) return { dispose: () => {}, canLeave: () => true };
      return { dispose: await module.mountProductDetail(host, { scope, http, product: { id, label: id }, reader: composed, onAccessFailure: session.onAccessFailure, onOpenInventory: () => navigate('inventory'), close: () => navigate('products') }), canLeave: () => true };
    }
    if ((route === 'product-categories' && config.productCategories) || (route === 'product-settings' && config.productSettings) || (route === 'barcode-schemes' && config.barcodeSchemes)) {
      const [module, helpers] = await Promise.all([import('../catalogue/entry.tsx'), import('./source-helpers.tsx')]);
      if (!scope.active) return { dispose: () => {}, canLeave: () => true };
      let guard: (() => boolean) | null = null;
      const dispose = await module.mountCatalogue(host, route as 'product-categories' | 'product-settings' | 'barcode-schemes', {
        ...options.catalogue, renderPager: helpers.renderOriginalPager, categoryControlCss: helpers.originalCategoryControlCss, mountEmpty: helpers.mountOriginalEmpty, scope, http, onAccessFailure: access, onCanLeaveChange: value => { guard = value; },
        ...(config.productSettings ? { initialSettingTab: config.productSettings.initialTab } : {}),
      });
      return { dispose, canLeave: () => guard?.() ?? true };
    }
    ownerScope();
    let root: Root | null = null;
    const release = () => { root?.unmount(); root = null; };
    const paint = (view: ReactNode) => { if (scope.active) { root = createRoot(host); root.render(view); } };
    try {
      if ((route === 'settings/stores' || route === 'settings/warehouses') && config.storeSettings) {
        const module = await import('../settings/index.ts');
        if (!scope.active) { release(); return { dispose: () => {}, canLeave: () => true }; }
        stores ??= module.createStoreMaintenanceWorkspace({ scope: ownerScope(), client: module.createStoreSettingsCommandClient(http), newRequestKey: options.newRequestKey, writesEnabled: enabled(flags?.storeSettings), onAccessFailure: access });
        const workspace = stores;
        workspace.getViewState(route === 'settings/warehouses' ? 'warehouses' : config.storeSettings.initialTab);
        paint(<module.StoreSettingsRuntime scope={scope} reader={module.createOrganizationStoreSettingsReader(http)} maintenance={{ workspace, directory: module.createOrganizationSettingsDirectory({ scope, http }) }} allowedTabs={config.storeSettings.allowedTabs} allowHallDirectoryRead={config.storeSettings.allowHallDirectoryRead} audit={audit()} onAccessFailure={access} />);
        return { dispose: () => release(), canLeave: workspace.canLeave };
      }
      if ((route === 'settings/parties' || route === 'customers' || route === 'suppliers') && config.parties) {
        const module = await import('../settings/parties-entry.ts');
        if (!scope.active) { release(); return { dispose: () => {}, canLeave: () => true }; }
        parties ??= module.createPartyWorkspace({ scope: ownerScope(), client: module.createPartyHttpClient(http), newRequestKey: options.newRequestKey, onAccessFailure: error => access(error.kind === 'unauthenticated' ? 'unauthenticated' : 'forbidden') });
        const View = route === 'suppliers' ? module.SupplierRuntime : module.CustomerRuntime, workspace = parties;
        paint(<View workspace={workspace} {...(config.parties.readOnly ? { readOnly: true as const } : {})} audit={{ ...audit(), onAccessFailure: access }} />);
        return { dispose: () => release(), canLeave: workspace.canLeave };
      }
      if ((route === 'settings/staff' && config.staffSettings) || (route === 'settings/accounts' && config.accountSettings)) {
        if (principal.role !== 'ADMIN') throw new Error('当前账号无权打开此页面。');
        const module = await import('../settings/personnel-entry.ts');
        const directoryModule = await import('../../../../src/settings/stores/maintenance-http-client.ts');
        if (!scope.active) { release(); return { dispose: () => {}, canLeave: () => true }; }
        const reader = module.createStaffSettingsHttpReader(http);
        if (route === 'settings/staff') {
          staff ??= module.createStaffSettingsWorkspace({ scope: ownerScope(), roles, reader, client: module.createStaffSettingsCommandClient(http), newRequestKey: options.newRequestKey, writesEnabled: enabled(flags?.staffSettings, true), onAccessFailure: access, hasOtherUnresolvedWrite: () => !!(accounts?.hasUnresolvedWrite() || stores?.hasUnresolvedWrite() || payments?.hasUnresolvedWrite() || parties?.hasUnresolvedWrite()) });
          const workspace = staff;
          paint(<module.StaffRuntime scope={scope} reader={reader} directory={directoryModule.createOrganizationSettingsDirectory({ scope, http })} roles={roles} canPrepare={enabled(flags?.staffSettings, true)()} workspace={workspace} audit={audit()} onAccessFailure={access} />);
          return { dispose: () => release(), canLeave: workspace.canLeave };
        }
        const accountReader = module.createAccountSettingsHttpReader(http);
        accounts ??= module.createAccountSettingsWorkspace({ scope: ownerScope(), reader: accountReader, staffReader: reader, client: module.createAccountSettingsCommandClient(http), newRequestKey: options.newRequestKey, writesEnabled: enabled(flags?.accountSettings, true), onAccessFailure: access, hasOtherUnresolvedWrite: () => !!(staff?.hasUnresolvedWrite() || stores?.hasUnresolvedWrite() || payments?.hasUnresolvedWrite() || parties?.hasUnresolvedWrite()) });
        const workspace = accounts;
        paint(<module.AccountsRuntime scope={scope} reader={accountReader} staffReader={reader} roles={roles} canPrepare={enabled(flags?.accountSettings, true)()} workspace={workspace} audit={audit()} onAccessFailure={access} />);
        return { dispose: () => release(), canLeave: workspace.canLeave };
      }
      if ((route === 'settings/payments' || route === 'settings/fundAccounts') && config.paymentSettings) {
        const module = await import('../settings/payments-entry.ts');
        const directoryModule = await import('../../../../src/settings/stores/maintenance-http-client.ts');
        if (!scope.active) { release(); return { dispose: () => {}, canLeave: () => true }; }
        payments ??= module.createPaymentSettingsWorkspace({ scope: ownerScope(), client: module.createPaymentSettingsCommandClient(http), newRequestKey: options.newRequestKey, writesEnabled: enabled(flags?.paymentSettings), onAccessFailure: access });
        const workspace = payments;
        paint(<module.PaymentsRuntime scope={scope} reader={module.createPaymentSettingsHttpReader(http)} directory={directoryModule.createOrganizationSettingsDirectory({ scope, http })} workspace={workspace} canPrepare={enabled(flags?.paymentSettings)()} initialTab={route === 'settings/fundAccounts' ? 'accounts' : 'methods'} audit={audit()} onAccessFailure={access} />);
        return { dispose: () => release(), canLeave: workspace.canLeave };
      }
      throw new Error('此页面尚未接入当前版本。');
    } catch (error) { release(); throw error; }
  }
  return { mount, hasUnresolvedWrite: unresolved, dispose: () => { owner?.dispose(); owner = null; } };
}
