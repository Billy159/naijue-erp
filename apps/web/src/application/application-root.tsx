import { Component, useEffect, useSyncExternalStore, type ErrorInfo, type ReactNode } from 'react';
import { AuthenticationPanel } from '../authentication/authentication-panel.tsx';
import type { ReadScope } from '../loading/read-scope.ts';
import { ApplicationController } from './controller.ts';
import type { ApplicationPresentation } from './contracts.ts';

class RouteBoundary extends Component<{ readonly scope: ReadScope; readonly controller: ApplicationController; readonly children: ReactNode; readonly retain?: boolean; readonly hidden?: boolean }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } { return { failed: true }; }
  override componentDidCatch(_error: Error, _info: ErrorInfo): void { this.props.controller.failRoute(this.props.scope); }
  override render(): ReactNode {
    const children = this.state.failed ? null : this.props.children;
    return this.props.retain ? <div hidden={this.props.hidden} inert={this.props.hidden} style={{ display: this.props.hidden ? 'none' : 'contents' }}>{children}</div> : children;
  }
}
/** Owns real auth/route composition, not a replacement design system or guessed Demo frame. */
export function ApplicationRoot({ controller, presentation }: { readonly controller: ApplicationController; readonly presentation: ApplicationPresentation }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const beforeUnload = (event: BeforeUnloadEvent) => { if (!controller.canLeave()) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [controller]);
  return <AuthenticationPanel controller={controller.authentication}>{principal => {
    const retained = controller.retainedDocument;
    const ready = state.phase === 'ready' && state.scope?.active && state.prepared;
    // Stable keyed siblings keep only the bounded original document mounted.
    // Hidden + inert removes its controls from both pointer and keyboard paths.
    const routeContent = <>{[...(retained ? [retained] : []), ...(ready ? [state] : [])].map(route => route.scope?.active && route.prepared
      ? <RouteBoundary key={route.scope.routeInstanceId} scope={route.scope} controller={controller} retain={route.route === 'sales' || route.route === 'transfers'} hidden={route === retained}><route.prepared.View scope={route.scope} /></RouteBoundary> : null)}{!ready && presentation.renderRouteState({ controller, state })}</>;
    return presentation.renderWorkspace({ principal, controller, state, routeContent });
  }}</AuthenticationPanel>;
}
