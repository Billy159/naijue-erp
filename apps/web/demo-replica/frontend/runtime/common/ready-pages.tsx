import { createRoot, type Root } from 'react-dom/client';
import type { ReactNode } from 'react';
import type { ReplicaSalesSession } from '../documents/sales-session.ts';
import type { SalesListViewState } from '../documents/sales-list.tsx';
import type { ReplicaSession } from './session.ts';
import {loadInventoryProductDrawerModule} from './inventory-product-loader.ts';
import {createInventoryProductActivation} from './inventory-product-activation.ts';
import type { ReadScope } from '../../../../src/loading/read-scope.ts';
import type { ProductionHostConfiguration } from '../../../../src/production-host/configuration.ts';
import type { CatalogueRuntimeOptions } from '../catalogue/entry.tsx';
import type { InventoryMountOptions } from '../inventory/index.tsx';
import type { StoreMaintenanceWorkspace } from '../../../../src/settings/stores/maintenance-controller.ts';
import type { PartyWorkspace } from '../../../../src/parties/controller.ts';
import type { StaffSettingsWorkspace } from '../../../../src/staff-settings/controller.ts';
import type { AccountSettingsWorkspace } from '../../../../src/account-settings/controller.ts';
import type { ProductEditorCapability, ProductMaintenanceCommand } from '../../../../src/products/product-editor-contracts.ts';
import { snapshotQueryParameters } from '../../../../src/loading/query-parameters.ts';
import type { PaymentSettingsWorkspace } from '../../../../src/payment-settings/controller.ts';
import { createSettingsAuditHttpReader } from '../../../../src/settings/audit/http-reader.ts';
import { blankAuditDraft } from '../../../../src/settings/audit/contracts.ts';
import { settingsAuditModulesFor } from '../../../../../../packages/application/src/settings-audit-validation.ts';

export interface ReadyPageOptions {
  readonly session: ReplicaSession;
  readonly routes: ProductionHostConfiguration['routes'];
  readonly newRequestKey: () => string;
  /** C opts in only when the original private HREV write capability is paired. Server authorizes independently. */
  readonly historyRevision?: Readonly<Partial<Record<'sales'|'transfers',boolean>>>;
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
export function createReadyPageMounts(options: ReadyPageOptions, navigate: (route: string) => void, prepareRoute?: (route: string, signal: AbortSignal) => Promise<void>) {
  const { session } = options;
  let owner: ReadScope | null = null;
  let sales: ReplicaSalesSession | null = null, salesView: SalesListViewState | null = null;
  const productRecovery = new Map<string | null, ProductMaintenanceCommand>();
  let stores: StoreMaintenanceWorkspace | undefined, parties: PartyWorkspace | undefined;
  let staff: StaffSettingsWorkspace | undefined, accounts: AccountSettingsWorkspace | undefined, payments: PaymentSettingsWorkspace | undefined;
  const access = (kind: 'unauthenticated' | 'forbidden') => session.onAccessFailure({ kind });
  const unresolved = () => !!(sales?.scope.active && sales.editor.commands.hasUnresolvedWrite || sales?.scope.active&&[...sales.historyOwners.values()].some(entry=>entry.owner.unresolved)) || !!owner?.active && !!(stores?.hasUnresolvedWrite() || parties?.hasUnresolvedWrite() || staff?.hasUnresolvedWrite() || accounts?.hasUnresolvedWrite() || payments?.hasUnresolvedWrite());
  const ownerScope = () => {
    if (!owner?.active) {
      owner = session.reads.createScope('replica-settings-session');
      productRecovery.clear();
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
    if ((route==='sales'||route==='sales/new'||route.startsWith('sales/view/')||route.startsWith('sales/edit/')||route.startsWith('sales/history/')) && config.sales) {
      const [module,factory,references,products] = await Promise.all([import('../documents/sales-entry.tsx'),import('../documents/sales-session.ts'),import('../../../../src/sales/http-reader.ts'),import('../../../../src/transport/product-http-reader.ts')]);
      if(!scope.active)return {dispose:()=>{},canLeave:()=>true};
      if(!sales?.scope.active)sales=factory.createReplicaSalesSession(session,{instanceId:'replica-sales-owner',newRequestKey:options.newRequestKey});
      salesView??=module.newSalesListViewState();
      const resetSales=()=>{sales?.dispose();sales=null;};
      return module.mountSales(host,route,{principal,session:sales,scope,view:salesView,references:references.createSalesFilterReferenceHttpReader(http),productReader:products.createProductHttpReader(http),http,historyRevision:options.historyRevision?.sales===true,newRequestKey:options.newRequestKey,manualCreate:config.salesManualCreate===true,existingEdit:config.salesExistingEdit===true,denied:session.onAccessFailure,navigate,onCommitted:resetSales,onDiscarded:resetSales});
    }
    if (route === 'inventory' && config.inventory) {
      const module = await import('../inventory/index.tsx');
      if (!scope.active) return { dispose: () => {}, canLeave: () => true };
      const marker='inventory-product:'+scope.routeInstanceId;
      const activation=createInventoryProductActivation({scope,host,load:async mode=>{
        const [drawer,reader]=await Promise.all([loadInventoryProductDrawerModule(mode),import('../../../../src/transport/product-http-reader.ts'),import('../../runtime-styles.ts').then(styles=>styles.prepareInventoryProductDrawerStyles(scope.signal))]);
        return {open:context=>drawer.openInventoryProductDrawer({...context,reader:reader.createProductHttpReader(http),onAccessFailure:session.onAccessFailure})};
      },feedback:state=>{
        const toast=host.ownerDocument.getElementById('toast');if(!toast)return;
        if(state.phase==='ready'||state.phase==='disposed'){if(toast.dataset.inventoryProductOpen===marker){toast.replaceChildren();toast.style.display='none';delete toast.dataset.inventoryProductOpen;}return;}
        toast.dataset.inventoryProductOpen=marker;toast.replaceChildren(state.phase==='loading'?'正在打开商品资料…':'商品资料未能打开，请重试。');toast.style.display='block';
        if(state.phase==='error'&&state.retry){const retry=host.ownerDocument.createElement('button');retry.type='button';retry.className='btn';retry.textContent='重试';retry.onclick=state.retry;toast.append(' ',retry);}
      }});
      let release:()=>void;
      try{release=module.mountInventoryPage(host,{...options.inventory,scope,http,onAccessFailure:session.onAccessFailure,onViewProduct:product=>{void activation.open(product);}});}catch(error){activation.dispose();throw error;}
      return {dispose:()=>{activation.dispose();release();},canLeave:()=>true};
    }
    if (route === 'products' && config.products) {
      const module = await import('../products/index.tsx');
      if (!scope.active) return { dispose: () => {}, canLeave: () => true };
      return { dispose: module.mountProductList(host, { scope, http, onAccessFailure: session.onAccessFailure, openEditor: id => navigate(id === null ? 'products/new' : 'products/edit/' + encodeURIComponent(id)) }), canLeave: () => true };
    }
    if ((route === 'products/new' || route.startsWith('products/edit/')) && config.products && enabled(flags?.products)()) {
      if (!prepareRoute) throw new Error('商品编辑样式加载尚未接入。');
      const [module, clients, products, dictionaries, full, catalogueReaders, helpers] = await Promise.all([
        import('../products/editor-entry.tsx'), import('../../../../src/products/product-maintenance-http-client.ts'),
        import('../../../../src/transport/product-http-reader.ts'), import('../../../../src/product-settings/size-groups/http-reader.ts'),
        import('../../../../src/products/product-page-http-reader.ts'), import('../../../../src/product-settings/colors/http-reader.ts'), import('./source-helpers.tsx'),
      ]);
      if (!scope.active) return { dispose: () => {}, canLeave: () => true };
      const owner = ownerScope(), productId = route === 'products/new' ? null : decodeURIComponent(route.slice('products/edit/'.length));
      const matches = (identity: typeof scope.identity) => owner.active && ['accountId','sessionRevision','permissionRevision'].every(key => identity[key as keyof typeof identity] === owner.identity[key as keyof typeof identity]);
      let guard: (() => boolean) | null = null, inlineGuard: (() => boolean) | null = null, destination: string | null = null, queued = false;
      const handoff = (next: string) => { guard = null; destination = next; if (!queued) { queued = true; queueMicrotask(() => { queued = false; if (scope.active && destination) navigate(destination); }); } };
      const detailReader = full.createProductFullPageHttpReader(http, ['stock'], config.productStockOverview ? { stockOverview: true } : {});
      const dictionary = dictionaries.createDictionaryHttpReader(http), maintenance = options.catalogue.maintenance;
      const capability: ProductEditorCapability = {
        loadStyles: () => prepareRoute(route, scope.signal), reader: clients.createProductMaintenanceHttpReaderV2(http), client: clients.createProductMaintenanceHttpClientV2(http), newRequestKey: options.newRequestKey,
        allowedActions: ['CREATE','EDIT','DISABLE','RESTORE','DELETE'],
        onRecoveryRequired: (command, identity) => { if (!matches(identity)) return; const target = command.action === 'CREATE' ? null : command.id, previous = productRecovery.get(target); if (!previous || previous.requestKey === command.requestKey) productRecovery.set(target, snapshotQueryParameters(command)); },
        recovery: { read: (identity, target) => matches(identity) ? productRecovery.get(target) ?? null : null, resolved: (identity, key) => { if (matches(identity)) for (const [target, command] of productRecovery) if (command.requestKey === key) productRecovery.delete(target); } },
        productReader: products.createProductHttpReader(http), dictionaryReader: dictionary, ...(config.barcodeSchemes ? { barcodeSchemeReader: dictionary } : {}),
        ...(config.productFullPage && detailReader.stock ? { stock: detailReader.stock } : {}),
        media: clients.createProductEditorMediaHttpReader(http), mediaUpload: clients.createProductMediaUploadHttpClient(http),
        ...(maintenance?.COLOR || maintenance?.FIT ? { catalogueMaintenance: { ...(maintenance.COLOR ? { colors: maintenance.COLOR } : {}), ...(maintenance.FIT ? { fits: maintenance.FIT } : {}) } } : {}),
      };
      const dispose = module.mountProductEditor(host, { parent: scope, productId, capability, http,
        catalogueOptions: { ...options.catalogue, scope, http, catalogue: catalogueReaders.createCatalogueSettingsHttpReader(http), dictionaries: dictionary, renderPager: helpers.renderOriginalPager, categoryControlCss: helpers.originalCategoryControlCss, mountEmpty: helpers.mountOriginalEmpty, onAccessFailure: access, onCanLeaveChange: value => { inlineGuard = value; } },
        onAccessFailure: session.onAccessFailure, onCanLeaveChange: value => { guard = value; }, onClose: () => handoff('products'), onSaved: id => handoff('products/view/' + encodeURIComponent(id)),
      });
      return { dispose, canLeave: () => (guard?.() ?? true) && (inlineGuard?.() ?? true) };
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
        const [module, customers] = await Promise.all([import('../settings/index.ts'), import('../../../../src/parties/http-client.ts')]);
        if (!scope.active) { release(); return { dispose: () => {}, canLeave: () => true }; }
        stores ??= module.createStoreMaintenanceWorkspace({ scope: ownerScope(), client: module.createStoreSettingsCommandClient(http), newRequestKey: options.newRequestKey, writesEnabled: enabled(flags?.storeSettings), onAccessFailure: access });
        const workspace = stores;
        workspace.getViewState(route === 'settings/warehouses' ? 'warehouses' : config.storeSettings.initialTab);
        paint(<module.StoreSettingsRuntime scope={scope} reader={module.createOrganizationStoreSettingsReader(http)} maintenance={{ workspace, directory: module.createOrganizationSettingsDirectory({ scope, http, customers: customers.createPartyHttpClient(http) }) }} allowedTabs={config.storeSettings.allowedTabs} allowHallDirectoryRead={config.storeSettings.allowHallDirectoryRead} audit={audit()} onAccessFailure={access} />);
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
  return { mount, hasUnresolvedWrite: unresolved, dispose: () => { sales?.dispose(); sales = null; owner?.dispose(); owner = null; } };
}
