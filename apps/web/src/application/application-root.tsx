import { Component, useEffect, useSyncExternalStore, type ErrorInfo, type ReactNode } from 'react';
import { AuthenticationPanel } from '../authentication/authentication-panel.tsx';
import type { ReadScope } from '../loading/read-scope.ts';
import { ApplicationController } from './controller.ts';
import type { ApplicationPresentation } from './contracts.ts';

class RouteBoundary extends Component<{ readonly scope: ReadScope; readonly controller: ApplicationController; readonly children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } { return { failed: true }; }
  override componentDidCatch(_error: Error, _info: ErrorInfo): void { this.props.controller.failRoute(this.props.scope); }
  override render(): ReactNode { return this.state.failed ? null : this.props.children; }
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
    const routeContent = state.phase === 'ready' && state.scope?.active && state.prepared
      ? <RouteBoundary key={state.scope.routeInstanceId} scope={state.scope} controller={controller}><state.prepared.View scope={state.scope} /></RouteBoundary>
      : presentation.renderRouteState({ controller, state });
    return presentation.renderWorkspace({ principal, controller, state, routeContent });
  }}</AuthenticationPanel>;
}
