import type { ComponentType, ReactNode } from 'react';
import type { ApplicationController } from './controller.ts';
import type { AuthenticationPrincipal } from '../authentication/contracts.ts';
import type { InventoryActions } from '../inventory/contracts.ts';
import type { ReadScope } from '../loading/read-scope.ts';
import type { HttpQueryOptions } from '../transport/http-query.ts';
import type { PartyWorkspace } from '../parties/controller.ts';
import type { SalesFormPreparationProvider } from '../sales/commands/contracts.ts';
import type { SalesEditorSession } from '../sales/commands/editor-session.ts';
import type { TransferFormPreparationProvider } from '../transfers/commands/contracts.ts';
import type { TransferCommandWorkspace } from '../transfers/commands/controller.ts';
import type { ProductFullPageConfiguration } from '../products/product-page-contracts.ts';

export type ApplicationRoute = 'inventory' | 'sales' | 'transfers' | 'customers' | 'suppliers' | 'products' | 'product-categories' | 'product-settings' | 'barcode-schemes' | 'store-settings';
export interface RouteStylesheet {
  /** Resolve only when the route's necessary CSS is usable. No construction-time load. */
  readonly load: () => Promise<unknown>;
  readonly dispose: () => void;
}
export interface InventoryRouteConfiguration {
  readonly stylesheet: RouteStylesheet;
  /** Omit unavailable stock-ledger actions, rather than installing dummy success. */
  readonly actions: Pick<InventoryActions, 'onOpenCell'>;
  /** Explicit ledger UI opt-in; each real request retains current server authorization. */
  readonly ledger?: true;
}
export interface SalesRouteConfiguration {
  readonly stylesheet: RouteStylesheet;
  /** Optional full-page read-only detail action CSS. Omission disables viewing,
   * not the list. Never loaded with route or shell CSS. */
  readonly detailStylesheet?: RouteStylesheet;
  /** Explicit write-host opt-in only, after native server reference/economics
   * composition is available. Omission preserves the existing read-only route. */
  readonly commands?: { readonly newRequestKey: () => string; readonly preparation?: SalesFormPreparationProvider; readonly manualCreate?: true };
}
export interface TransferRouteConfiguration {
  readonly stylesheet: RouteStylesheet;
  /** Separate full-page detail action CSS. Never loaded with route or shell CSS. */
  readonly detailStylesheet: RouteStylesheet;
  /** Omit when the real shared action-style handshake is unavailable. */
  readonly product?: { readonly stylesheet: RouteStylesheet };
  readonly commands?: { readonly newRequestKey: () => string; readonly preparation?: TransferFormPreparationProvider; readonly manualCreate?: true };
}
export interface PartiesRouteConfiguration {
  readonly stylesheet: RouteStylesheet;
  /** Required real host key provider. Never fabricated, reused across actions or defaulted. */
  readonly newRequestKey: () => string;
  /** Explicit presentation-only read mode. Not a server authorization grant;
   * omission preserves the existing maintenance/session protocol. */
  readonly readOnly?: true;
}
/** Read-only catalogue list; absence never implies a route or catalogue grant. */
export interface ProductsRouteConfiguration {
  readonly stylesheet: RouteStylesheet;
  readonly product?: { readonly stylesheet: RouteStylesheet };
  readonly fullPage?: ProductFullPageConfiguration;
}
export type ReadOnlyProductSettingTab = 'colors' | 'groups' | 'fits' | 'seasons';
export interface ProductCategoriesRouteConfiguration { readonly stylesheet: RouteStylesheet }
export interface ProductSettingsRouteConfiguration {
  readonly stylesheet: RouteStylesheet;
  readonly allowedTabs: readonly ReadOnlyProductSettingTab[];
  readonly initialTab: ReadOnlyProductSettingTab;
}
export interface BarcodeSchemesRouteConfiguration { readonly stylesheet: RouteStylesheet }
export type ReadOnlyStoreSettingsTab = 'stores' | 'warehouses';
export interface StoreSettingsRouteConfiguration {
  readonly stylesheet: RouteStylesheet;
  readonly allowedTabs: readonly ReadOnlyStoreSettingsTab[];
  readonly initialTab: ReadOnlyStoreSettingsTab;
  /** Explicit UI directory-read intent; every list/detail still requires its
   * own current server grant. Never substitutes a transaction candidate. */
  readonly allowHallDirectoryRead: boolean;
}
export interface ApplicationConfiguration {
  /** Exact trusted HTTPS application origin, explicit API prefix and injected fetch. */
  readonly http: HttpQueryOptions;
  /** Required approved host shell. No guessed menu/sidebar/layout is supplied by this composition. */
  readonly presentation: ApplicationPresentation;
  /** Explicit capabilities. Omitted routes have no actionable navigation target,
   * module import, CSS or reader; the canonical frame retains disabled labels. */
  readonly routes: {
    readonly inventory?: InventoryRouteConfiguration;
    readonly sales?: SalesRouteConfiguration;
    readonly transfers?: TransferRouteConfiguration;
    readonly parties?: PartiesRouteConfiguration;
    readonly products?: ProductsRouteConfiguration;
    readonly productCategories?: ProductCategoriesRouteConfiguration;
    readonly productSettings?: ProductSettingsRouteConfiguration;
    readonly barcodeSchemes?: BarcodeSchemesRouteConfiguration;
    readonly storeSettings?: StoreSettingsRouteConfiguration;
  };
}
export interface ApplicationRouteProps { readonly scope: ReadScope }
export interface PreparedApplicationRoute {
  readonly View: ComponentType<ApplicationRouteProps>;
}
export interface RoutePreparation {
  readonly scope: ReadScope;
  readonly http: HttpQueryOptions;
  readonly principal: AuthenticationPrincipal;
  readonly configuration: ApplicationConfiguration['routes'];
}
export interface PartySession {
  readonly workspace: PartyWorkspace;
  readonly prepare: (route: 'customers' | 'suppliers') => PreparedApplicationRoute;
}
export interface SalesSession {
  readonly canLeave?: () => boolean;
  readonly workspace: SalesEditorSession;
  readonly prepare: (route: RoutePreparation) => PreparedApplicationRoute;
}
export interface TransferSession {
  readonly canLeave?: () => boolean;
  readonly workspace: TransferCommandWorkspace;
  readonly prepare: (route: RoutePreparation) => PreparedApplicationRoute;
}
export type ApplicationSnapshot = {
  readonly phase: 'home' | 'loading' | 'ready' | 'error' | 'cancelled' | 'disposed';
  readonly route: ApplicationRoute | null;
  readonly scope: ReadScope | null;
  readonly prepared: PreparedApplicationRoute | null;
  readonly notice: 'cannot-leave' | null;
};
export const routeLabels: Readonly<Record<ApplicationRoute, string>> = Object.freeze({
  inventory: '库存状况表', sales: '销货列表', transfers: '调拨单列表', customers: '客户资料', suppliers: '供应商资料',
  products: '商品信息', 'product-categories': '商品分类', 'product-settings': '商品设置', 'barcode-schemes': '条码方案', 'store-settings': '营业厅与仓库',
});

export interface ApplicationPresentation {
  readonly renderWorkspace: (input: { readonly principal: AuthenticationPrincipal; readonly controller: ApplicationController; readonly state: ApplicationSnapshot; readonly routeContent: ReactNode }) => ReactNode;
  /** Host supplies approved home/loading/error/cancel visuals and explicit retry/cancel controls. */
  readonly renderRouteState: (input: { readonly controller: ApplicationController; readonly state: ApplicationSnapshot }) => ReactNode;
}
