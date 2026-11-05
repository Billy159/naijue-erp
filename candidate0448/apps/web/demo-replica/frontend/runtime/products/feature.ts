import { entityId } from '../../../../../../packages/domain/src/values.ts';
import type { ReadScope } from '../../../../src/loading/read-scope.ts';
import type { ProductEditorCapability, ProductMaintenanceCommand } from '../../../../src/products/product-editor-contracts.ts';
import { snapshotQueryParameters } from '../../../../src/loading/query-parameters.ts';
import type {ReadyPageOptions,MountedReplicaPage,Navigate,PrepareRoute} from '../common/feature-contracts.ts';
import type {createCatalogueFeature} from '../catalogue/feature.ts';
import type {createInventoryFeature} from '../inventory/feature.ts';
export function createProductsFeature(options:ReadyPageOptions,navigate:Navigate,prepareRoute:PrepareRoute|undefined,catalogue:ReturnType<typeof createCatalogueFeature>,inventory:ReturnType<typeof createInventoryFeature>){
  const {session}=options;
  const access=(kind:'unauthenticated'|'forbidden')=>session.onAccessFailure({kind});
  const enabled = (flag: boolean | undefined, admin = false) => () => {
    const auth = session.auth.getSnapshot();
    return flag === true && auth.phase === 'authenticated' && (auth.principal?.role === 'ADMIN' || !admin && auth.principal?.role === 'WAREHOUSE');
  };
  let owner:ReadScope|null=null;
  const productRecovery=new Map<string|null,ProductMaintenanceCommand>();
  const ownerScope=()=>{if(!owner?.active){owner=session.reads.createScope('replica-products-session');productRecovery.clear();}return owner;};
  const catalogueCommands=catalogue.commands,openProductInventory=inventory.openProductInventory;
  async function mount(host: HTMLElement, route: string, scope: ReadScope): Promise<MountedReplicaPage> {
    const principal = session.auth.getSnapshot().principal;
    if (!principal || principal.accountId !== scope.identity.accountId || !scope.active) throw new Error('当前登录身份尚未确认。');
    const http = session.http, config = options.routes, flags = config.maintenance;
    // Validate the whole encoded leaf before loading readers or mounting React.
    // Domain validation is reused: no normalisation or invented product identity.
    if (route.startsWith('products/view/') || route.startsWith('products/edit/')) {
      try { entityId('product', decodeURIComponent(route.slice('products/view/'.length))); }
      catch {
        const box = document.createElement('div'), back = document.createElement('button');
        box.className = 'iw-state'; box.setAttribute('role', 'alert'); box.textContent = '商品链接无效，请返回商品列表。';
        back.className = 'btn'; back.type = 'button'; back.textContent = '返回商品列表';
        back.onclick = () => { if (scope.active) navigate('products'); }; box.append(' ', back); host.replaceChildren(box);
        return { dispose: () => { back.onclick = null; box.remove(); }, canLeave: () => true };
      }
    }
    if (route === 'products' && config.products) {
      const module = await import('./index.tsx');
      if (!scope.active) return { dispose: () => {}, canLeave: () => true };
      return { dispose: module.mountProductList(host, { scope, http, onAccessFailure: session.onAccessFailure, openEditor: id => navigate(id === null ? 'products/new' : 'products/edit/' + encodeURIComponent(id)) }), canLeave: () => true };
    }
    if ((route === 'products/new' || route.startsWith('products/edit/')) && config.products) {
      if (!prepareRoute) throw new Error('商品编辑样式加载尚未接入。');
      const [module, clients, products, dictionaries, full, catalogueReaders, helpers] = await Promise.all([
        import('./editor-entry.tsx'), import('../../../../src/products/product-maintenance-http-client.ts'),
        import('../../../../src/transport/product-http-reader.ts'), import('../../../../src/product-settings/size-groups/http-reader.ts'),
        import('../../../../src/products/product-page-http-reader.ts'), import('../../../../src/product-settings/colors/http-reader.ts'), import('../common/source-helpers.tsx'),
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
        media: clients.createProductEditorMediaHttpReader(http),
        ...(config.productMediaReady===true&&enabled(flags?.products)()?{mediaUpload:clients.createProductMediaUploadHttpClient(http)}:{}),
        ...(maintenance?.COLOR || maintenance?.FIT ? { catalogueMaintenance: { ...(maintenance.COLOR ? { colors: maintenance.COLOR } : {}), ...(maintenance.FIT ? { fits: maintenance.FIT } : {}) } } : {}),
      };
      const dispose = module.mountProductEditor(host, { parent: scope, productId, capability, http,
        catalogueOptions: { onChanged: options.catalogue.onChanged, ...(catalogueSession ? { maintenance: catalogueSession.maintenance, commandOwners: catalogueSession.commandOwners } : {}), scope, http, catalogue: catalogueReaders.createCatalogueSettingsHttpReader(http), dictionaries: dictionary, renderPager: helpers.renderOriginalPager, categoryControlCss: helpers.originalCategoryControlCss, mountEmpty: helpers.mountOriginalEmpty, onAccessFailure: access, onCanLeaveChange: value => { inlineGuard = value; } },
        onAccessFailure: session.onAccessFailure, onCanLeaveChange: value => { guard = value; }, onOpenInventory: async product => openProductInventory(scope, product), onClose: () => handoff('products'), onSaved: id => handoff('products/view/' + encodeURIComponent(id)),
      });
      return { dispose, canLeave: () => (guard?.() ?? true) && (inlineGuard?.() ?? true) };
    }
    if (route.startsWith('products/view/') && config.products && config.productFullPage) {
      const [module, readers] = await Promise.all([import('./detail-entry.tsx'), import('../../../../src/products/product-page-http-reader.ts')]);
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
    throw new Error('此页面尚未接入当前版本。');
  }
  const prepare=(route:string)=>route==='products'?import('./index.tsx'):route.startsWith('products/view/')?import('./detail-entry.tsx'):import('./editor-entry.tsx');
  return {prepare,mount,hasUnresolvedWrite:()=>false,dispose(){owner?.dispose();owner=null;productRecovery.clear();}};
}
