import { createRoot, type Root } from 'react-dom/client';
import type { ReactNode } from 'react';
import type {ReplicaTransferSession} from '../documents/transfers-session.ts';
import type {TransferListViewState} from '../documents/transfers-list.tsx';
import type { ReplicaSalesSession } from '../documents/sales-session.ts';
import type { SalesListViewState } from '../documents/sales-list.tsx';
import type { ReplicaSession } from './session.ts';
import {loadInventoryProductDrawerModule} from './inventory-product-loader.ts';
import {createInventoryProductActivation} from './inventory-product-activation.ts';
import type { ReadScope } from '../../../../src/loading/read-scope.ts';
import type { ProductionHostConfiguration } from '../../../../src/production-host/configuration.ts';
import type { CatalogueRuntimeOptions } from '../catalogue/entry.tsx';
import type { CatalogueCommandSession } from '../catalogue/session.ts';
import type { CatalogueMaintenanceCommand } from '../../../../src/product-settings/catalogue-maintenance-http-client.ts';
import type { InventoryMountOptions, InventoryProductContext, InventoryQuerySnapshot } from '../inventory/index.tsx';
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
export interface MountedReplicaPage { readonly dispose: () => void; readonly canLeave: () => boolean;readonly canDiscard?:()=>boolean;readonly discard?:()=>boolean }
const roles = Object.freeze([
  { value: 'ADMIN', label: '管理员', requiresHall: false },
  { value: 'WAREHOUSE', label: '仓库', requiresHall: false },
  { value: 'SALESPERSON', label: '营业员', requiresHall: true },
]);

/** Session workspaces survive page unmount. Only the selected page loads code or data. */
export function createReadyPageMounts(options: ReadyPageOptions, navigate: (route: string) => void | Promise<boolean>, prepareRoute?: (route: string, signal: AbortSignal) => Promise<void>) {
  const { session } = options;
  let owner: ReadScope | null = null;
  let sales: ReplicaSalesSession | null = null, salesView: SalesListViewState | null = null;
  let salesViewScope: ReadScope | null = null;
  let transfers:ReplicaTransferSession|null=null,transferView:TransferListViewState|null=null;
  let transferViewScope: ReadScope | null = null;
  let inventoryContextScope: ReadScope | null = null;
  let inventoryQuery: InventoryQuerySnapshot | null = null;
  let inventoryProductContext: InventoryProductContext | null = null;
  const inventoryContextOwner = () => {
    if (!inventoryContextScope?.active) {
      inventoryQuery = null; inventoryProductContext = null;
      inventoryContextScope = session.reads.createScope('replica-inventory-query-context');
      const contextOwner = inventoryContextScope;
      contextOwner.signal.addEventListener('abort', () => {
        if (inventoryContextScope === contextOwner) {
          inventoryQuery = null; inventoryProductContext = null; inventoryContextScope = null;
        }
      }, { once: true });
    }
    return inventoryContextScope;
  };
  const openProductInventory = async (scope: ReadScope, product: InventoryProductContext['product']) => {
    if (!scope.active) return false;
    const contextOwner = inventoryContextOwner();
    const entry = snapshotQueryParameters({ identity: contextOwner.identity, product, previousQuery: inventoryQuery });
    inventoryProductContext = entry;
    let accepted = false;
    try {
      accepted = await navigate('inventory') === true;
      return accepted;
    } finally {
      if (!accepted && inventoryProductContext === entry) inventoryProductContext = null;
    }
  };
  const productRecovery = new Map<string | null, ProductMaintenanceCommand>();
  let catalogue: CatalogueCommandSession | undefined;
  // Invalidated identities retain their exact unresolved command for handoff;
  // they never authorize a new identity or trigger an automatic replay.
  const catalogueRecovery = new Map<string, { readonly identity: ReadScope['identity']; readonly kind: 'CATEGORY'|'COLOR'|'FIT'; readonly command: CatalogueMaintenanceCommand }>();
  let stores: StoreMaintenanceWorkspace | undefined, parties: PartyWorkspace | undefined;
  let staff: StaffSettingsWorkspace | undefined, accounts: AccountSettingsWorkspace | undefined, payments: PaymentSettingsWorkspace | undefined;
  const access = (kind: 'unauthenticated' | 'forbidden') => session.onAccessFailure({ kind });
  const unresolved = () => !!catalogue?.hasUnresolvedWrite() || !!(transfers?.scope.active&&(transfers.workspace.hasUnresolvedWrite||[...transfers.historyOwners.values()].some(entry=>entry.owner.unresolved))) || !!(sales?.scope.active && sales.editor.commands.hasUnresolvedWrite || sales?.scope.active&&[...sales.historyOwners.values()].some(entry=>entry.owner.unresolved)) || !!owner?.active && !!(stores?.hasUnresolvedWrite() || parties?.hasUnresolvedWrite() || staff?.hasUnresolvedWrite() || accounts?.hasUnresolvedWrite() || payments?.hasUnresolvedWrite());
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
  const catalogueCommands = async (page: ReadScope): Promise<CatalogueCommandSession | undefined> => {
    const flags = options.routes.maintenance;
    if (![flags?.categories, flags?.colors, flags?.fits].some(flag => enabled(flag)())) return undefined;
    if (catalogue?.scope.active) return catalogue;
    const module = await import('../catalogue/session.ts');
    if (!page.active || session.auth.getSnapshot().principal?.accountId !== page.identity.accountId) return undefined;
    const identity = Object.freeze({ ...page.identity });
    catalogue = module.createCatalogueCommandSession(session, flags, options.newRequestKey, (kind, command) => {
      catalogueRecovery.set(command.requestKey, { identity, kind, command: snapshotQueryParameters(command) });
    });
    return catalogue;
  };
  const audit = () => {
    const role = session.auth.getSnapshot().principal?.role;
    const allowedModules = role === 'ADMIN' || role === 'WAREHOUSE' ? settingsAuditModulesFor(role, { ...blankAuditDraft, page: 1, pageSize: 20 }) : [];
    return { reader: createSettingsAuditHttpReader(session.http), allowedModules, hasUnresolvedWrite: unresolved };
  };
  const documentProductActivation=(host:HTMLElement,scope:ReadScope,viewport:string)=>{
      const marker=viewport+':'+scope.routeInstanceId;
      return createInventoryProductActivation({scope,host,anchorSelector:'button[data-document-product]',viewportSelector:viewport,load:async mode=>{
        const [drawer,reader]=await Promise.all([loadInventoryProductDrawerModule(mode),import('../../../../src/transport/product-http-reader.ts'),import('../../runtime-styles.ts').then(styles=>styles.prepareInventoryProductDrawerStyles(scope.signal))]);
        return {open:context=>drawer.openInventoryProductDrawer({...context,reader:reader.createProductHttpReader(session.http),onAccessFailure:session.onAccessFailure})};
      },feedback:state=>{
        const toast=host.ownerDocument.getElementById('toast');if(!toast)return;
        if(state.phase==='ready'||state.phase==='disposed'){if(toast.dataset.inventoryProductOpen===marker){toast.replaceChildren();toast.style.display='none';delete toast.dataset.inventoryProductOpen;}return;}
        toast.dataset.inventoryProductOpen=marker;toast.replaceChildren(state.phase==='loading'?'正在打开商品资料…':'商品资料未能打开，请重试。');toast.style.display='block';
        if(state.phase==='error'&&state.retry){const retry=host.ownerDocument.createElement('button');retry.type='button';retry.className='btn';retry.textContent='重试';retry.onclick=state.retry;toast.append(' ',retry);}
      }});
  };
  async function mount(host: HTMLElement, route: string, scope: ReadScope): Promise<MountedReplicaPage> {
    const principal = session.auth.getSnapshot().principal;
    if (!principal || principal.accountId !== scope.identity.accountId || !scope.active) throw new Error('当前登录身份尚未确认。');
    const http = session.http, config = options.routes, flags = config.maintenance;
    if ((route==='sales'||route==='sales/new'||route.startsWith('sales/view/')||route.startsWith('sales/edit/')||route.startsWith('sales/history/')) && config.sales) {
      const [module,factory,references,products] = await Promise.all([import('../documents/sales-entry.tsx'),import('../documents/sales-session.ts'),import('../../../../src/sales/http-reader.ts'),import('../../../../src/transport/product-http-reader.ts')]);
      if(!scope.active)return {dispose:()=>{},canLeave:()=>true};
      if(!sales?.scope.active)sales=factory.createReplicaSalesSession(session,{instanceId:'replica-sales-owner',newRequestKey:options.newRequestKey,responsibleReady:config.documentResponsibleReady===true});
      if (!salesViewScope?.active) {
        salesViewScope = session.reads.createScope('replica-sales-list-view');
        salesView = module.newSalesListViewState();
        const viewOwner = salesViewScope;
        viewOwner.signal.addEventListener('abort', () => {
          if (salesViewScope === viewOwner) { salesView = null; salesViewScope = null; }
        }, { once: true });
      }
      const resetSales=()=>{sales?.dispose();sales=null;};
      const activation=config.salesProductFullPage?documentProductActivation(host,scope,'#sale-lines'):null;
      try{const mounted=module.mountSales(host,route,{principal,session:sales,scope,view:salesView!,references:references.createSalesFilterReferenceHttpReader(http),productReader:products.createProductHttpReader(http),http,historyRevision:options.historyRevision?.sales===true,newRequestKey:options.newRequestKey,manualCreate:config.salesManualCreate===true,existingEdit:config.salesExistingEdit===true,denied:session.onAccessFailure,navigate,onCommitted:resetSales,onDiscarded:resetSales,...(activation?{viewProduct:(product:{id:string;label:string})=>{void activation.open(product);}}:{})});return {...mounted,dispose:()=>{activation?.dispose();mounted.dispose();}};}catch(error){activation?.dispose();throw error;}
    }
    if ((route==='transfer'||route.startsWith('transfer/'))&&config.transfers){
      const [module,factory,products]=await Promise.all([import('../documents/transfers-entry.tsx'),import('../documents/transfers-session.ts'),import('../../../../src/transport/product-http-reader.ts')]);
      if(!scope.active)return {dispose:()=>{},canLeave:()=>true};
      if(route==='transfer/new'&&transfers?.scope.active&&transfers.workspace.getSnapshot().editor&&factory.transferCanLeave(transfers)){transfers.dispose();transfers=null;}
      if(!transfers?.scope.active)transfers=factory.createReplicaTransferSession(session,{instanceId:'replica-transfer-owner',newRequestKey:options.newRequestKey,responsibleReady:config.documentResponsibleReady===true});
      if (!transferViewScope?.active) {
        transferViewScope = session.reads.createScope('replica-transfer-list-view');
        transferView = module.newTransferListViewState();
        const viewOwner = transferViewScope;
        viewOwner.signal.addEventListener('abort', () => {
          if (transferViewScope === viewOwner) { transferView = null; transferViewScope = null; }
        }, { once: true });
      }
      // Frozen transfer-current.openProductDetail uses the same original three-tab
      // product Drawer. The parent edit DOM/session never leaves this route.
      const activation=config.transferProductFullPage?documentProductActivation(host,scope,'#tc-lines'):null;
      try{const mounted=module.mountTransfers(host,route,{manualCreate:config.transferManualCreate===true,reset:()=>{transfers?.dispose();transfers=null;transferView!.reload=true;},productReader:products.createProductHttpReader(http),session:transfers,scope,view:transferView!,existingEdit:config.transferExistingEdit===true,http,historyRevision:options.historyRevision?.transfers===true,newRequestKey:options.newRequestKey,denied:session.onAccessFailure,navigate,...(activation?{viewProduct:(product:{id:string;label:string})=>{void activation.open(product);}}:{})});return {...mounted,dispose:()=>{activation?.dispose();mounted.dispose();}};}catch(error){activation?.dispose();throw error;}
    }
    if (route === 'inventory' && config.inventory) {
      const module = await import('../inventory/index.tsx');
      if (!scope.active) return { dispose: () => {}, canLeave: () => true };
      const contextOwner = inventoryContextOwner(), productContext = inventoryProductContext;
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
      try{release=module.mountInventoryPage(host,{...options.inventory,scope,http,...(productContext?{productContext}:{}),onQueryApplied:snapshot=>{if(scope.active&&contextOwner.active)inventoryQuery=snapshotQueryParameters(snapshot);},onAccessFailure:session.onAccessFailure,onViewProduct:product=>{void activation.open(product);}});inventoryProductContext=null;}catch(error){activation.dispose();throw error;}
      return {dispose:()=>{activation.dispose();release();},canLeave:()=>true};
    }
    if (route === 'products' && config.products) {
      const module = await import('../products/index.tsx');
      if (!scope.active) return { dispose: () => {}, canLeave: () => true };
      return { dispose: module.mountProductList(host, { scope, http, onAccessFailure: session.onAccessFailure, openEditor: id => navigate(id === null ? 'products/new' : 'products/edit/' + encodeURIComponent(id)) }), canLeave: () => true };
    }
    if ((route === 'products/new' || route.startsWith('products/edit/')) && config.products) {
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
      const dictionary = dictionaries.createDictionaryHttpReader(http), catalogueSession = await catalogueCommands(scope), maintenance = catalogueSession?.maintenance;
      if (!scope.active) return { dispose: () => {}, canLeave: () => true };
      const capability: ProductEditorCapability = {
        loadStyles: () => prepareRoute(route, scope.signal), reader: clients.createProductMaintenanceHttpReaderV2(http), client: clients.createProductMaintenanceHttpClientV2(http), newRequestKey: options.newRequestKey,
        allowedActions: enabled(flags?.products)() ? ['CREATE','EDIT','DISABLE','RESTORE','DELETE'] : [],
        onRecoveryRequired: (command, identity) => { if (!matches(identity)) return; const target = command.action === 'CREATE' ? null : command.id, previous = productRecovery.get(target); if (!previous || previous.requestKey === command.requestKey) productRecovery.set(target, snapshotQueryParameters(command)); },
        recovery: { read: (identity, target) => matches(identity) ? productRecovery.get(target) ?? null : null, resolved: (identity, key) => { if (matches(identity)) for (const [target, command] of productRecovery) if (command.requestKey === key) productRecovery.delete(target); } },
        productReader: products.createProductHttpReader(http), dictionaryReader: dictionary, ...(config.barcodeSchemes ? { barcodeSchemeReader: dictionary } : {}),
        ...(config.productFullPage && detailReader.stock ? { stock: detailReader.stock } : {}),
        media: clients.createProductEditorMediaHttpReader(http), mediaUpload: clients.createProductMediaUploadHttpClient(http),
        ...(maintenance?.COLOR || maintenance?.FIT ? { catalogueMaintenance: { ...(maintenance.COLOR ? { colors: maintenance.COLOR } : {}), ...(maintenance.FIT ? { fits: maintenance.FIT } : {}) } } : {}),
      };
      const dispose = module.mountProductEditor(host, { parent: scope, productId, capability, http,
        catalogueOptions: { onChanged: options.catalogue.onChanged, ...(catalogueSession ? { maintenance: catalogueSession.maintenance, commandOwners: catalogueSession.commandOwners } : {}), scope, http, catalogue: catalogueReaders.createCatalogueSettingsHttpReader(http), dictionaries: dictionary, renderPager: helpers.renderOriginalPager, categoryControlCss: helpers.originalCategoryControlCss, mountEmpty: helpers.mountOriginalEmpty, onAccessFailure: access, onCanLeaveChange: value => { inlineGuard = value; } },
        onAccessFailure: session.onAccessFailure, onCanLeaveChange: value => { guard = value; }, onOpenInventory: async product => openProductInventory(scope, product), onClose: () => handoff('products'), onSaved: id => handoff('products/view/' + encodeURIComponent(id)),
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
      return { dispose: await module.mountProductDetail(host, { scope, http, product: { id, label: id }, reader: composed, onAccessFailure: session.onAccessFailure, onOpenInventory: product => openProductInventory(scope, product), close: () => navigate('products') }), canLeave: () => true };
    }
    if ((route === 'product-categories' && config.productCategories) || (route === 'product-settings' && config.productSettings) || (route === 'barcode-schemes' && config.barcodeSchemes)) {
      const [module, helpers] = await Promise.all([import('../catalogue/entry.tsx'), import('./source-helpers.tsx')]);
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
        const workspace = parties;
        paint(<module.PartiesRuntime initialTab={route === 'suppliers' ? 'SUPPLIER' : 'CUSTOMER'} workspace={workspace} {...(config.parties.readOnly ? { readOnly: true as const } : {})} audit={{ ...audit(), onAccessFailure: access }} />);
        return { dispose: () => release(), canLeave: () => workspace.canLeave() && !module.hasPendingPartyReadback(workspace) };
      }
      if ((route === 'settings/staff' || route === 'settings/accounts') && config.staffSettings) {
        if (principal.role !== 'ADMIN') throw new Error('当前账号无权打开此页面。');
        const module = await import('../settings/personnel-entry.ts');
        const directoryModule = await import('../../../../src/settings/stores/maintenance-http-client.ts');
        if (!scope.active) { release(); return { dispose: () => {}, canLeave: () => true }; }
        const reader = module.createStaffSettingsHttpReader(http);
        staff ??= module.createStaffSettingsWorkspace({ scope: ownerScope(), roles, reader, client: module.createStaffSettingsCommandClient(http), newRequestKey: options.newRequestKey, writesEnabled: enabled(flags?.staffSettings, true), onAccessFailure: access, hasOtherUnresolvedWrite: () => !!(accounts?.hasUnresolvedWrite() || stores?.hasUnresolvedWrite() || payments?.hasUnresolvedWrite() || parties?.hasUnresolvedWrite()) });
        // Staff already contains its paired account and owns the combined maintenance form.
        // The old accounts deep link resolves here without creating a second daily workflow.
        const workspace = staff;
        paint(<module.StaffRuntime scope={scope} reader={reader} directory={directoryModule.createOrganizationSettingsDirectory({ scope, http })} roles={roles} canPrepare={enabled(flags?.staffSettings, true)()} workspace={workspace} audit={audit()} onAccessFailure={access} />);
        return { dispose: () => release(), canLeave: workspace.canLeave };
      }
      if ((route === 'settings/payments' || route === 'settings/fundAccounts') && config.paymentSettings) {
        const module = await import('../settings/payments-entry.ts');
        const directoryModule = await import('../../../../src/settings/stores/maintenance-http-client.ts');
        if (!scope.active) { release(); return { dispose: () => {}, canLeave: () => true }; }
        payments ??= module.createPaymentSettingsWorkspace({ scope: ownerScope(), client: module.createPaymentSettingsCommandClient(http), newRequestKey: options.newRequestKey, writesEnabled: enabled(flags?.paymentSettings), onAccessFailure: access });
        const workspace = payments;
        paint(<module.PaymentsRuntime scope={scope} reader={module.createPaymentSettingsHttpReader(http)} directory={directoryModule.createOrganizationSettingsDirectory({ scope, http })} workspace={workspace} canPrepare={enabled(flags?.paymentSettings)()} initialTab={route === 'settings/fundAccounts' ? 'accounts' : 'methods'} audit={audit()} onAccessFailure={access} />);
        return { dispose: () => release(), canLeave: () => workspace.canLeave() && !module.hasPendingPaymentReadback(workspace) };
      }
      throw new Error('此页面尚未接入当前版本。');
    } catch (error) { release(); throw error; }
  }
  return { mount, hasUnresolvedWrite: unresolved, retainedCatalogueCommands: () => [...catalogueRecovery.values()], dispose: () => { inventoryContextScope?.dispose();salesViewScope?.dispose();salesViewScope=null;salesView=null;transferViewScope?.dispose();transferViewScope=null;transferView=null;catalogue?.dispose();catalogue=undefined;transfers?.dispose();transfers=null;sales?.dispose(); sales = null; owner?.dispose(); owner = null; } };
}
