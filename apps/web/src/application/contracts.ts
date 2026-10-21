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

export type ApplicationRoute = 'inventory' | 'sales' | 'transfers' | 'customers' | 'suppliers';
export interface RouteStylesheet {
  /** Resolve only when the route's necessary CSS is usable. No construction-time load. */
  readonly load: () => Promise<unknown>;
  readonly dispose: () => void;
}
export interface InventoryRouteConfiguration {
  readonly stylesheet: RouteStylesheet;
  /** Omit unavailable stock-ledger actions, rather than installing dummy success. */
  readonly actions: Pick<InventoryActions, 'onOpenCell'>;
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
});

export interface ApplicationPresentation {
  readonly renderWorkspace: (input: { readonly principal: AuthenticationPrincipal; readonly controller: ApplicationController; readonly state: ApplicationSnapshot; readonly routeContent: ReactNode }) => ReactNode;
  /** Host supplies approved home/loading/error/cancel visuals and explicit retry/cancel controls. */
  readonly renderRouteState: (input: { readonly controller: ApplicationController; readonly state: ApplicationSnapshot }) => ReactNode;
}
