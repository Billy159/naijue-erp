import type { ApplicationRoute } from '../src/application/contracts.ts';
import { reviewProfile, type UnifiedReviewProfile } from './review-profile.ts';

interface ProfileOwner {
  readonly app: { readonly controller: {
    readonly authentication: { getSnapshot(): { readonly principal: unknown } };
    navigate(route: ApplicationRoute | null): Promise<boolean>;
  } };
  readonly transport: { revoke(): void };
  enter(route?: ApplicationRoute | null): Promise<boolean>;
  revoke(): Promise<void>;
  dispose(): void;
}
export interface ReviewProfileSnapshot {
  readonly profile: UnifiedReviewProfile;
  readonly phase: 'ready' | 'entering' | 'switching' | 'revoking' | 'error' | 'disposed';
  readonly notice: 'cannot-leave' | 'changed' | 'revoked' | 'failed' | null;
}

/** Synthetic host owner. At most one business Application is mounted by the
 * supplied factory; the eventual Arco review toolbar may have a separate root.
 * Existing Application navigation decides dirty/uncertain protection. This
 * facade never invents or clears a business draft to make a switch succeed. */
export function createReviewProfileSession<Owner extends ProfileOwner>(mount: (profile: UnifiedReviewProfile) => Owner) {
  if (typeof mount !== 'function') throw new TypeError('Explicit synthetic owner factory required.');
  let current = mount('standard'), mounted = true, disposed = false, generation = 0, busy: number | null = null;
  let state: ReviewProfileSnapshot = Object.freeze({ profile: 'standard', phase: 'ready', notice: null });
  const listeners = new Set<() => void>();
  const publish = (phase: ReviewProfileSnapshot['phase'], notice: ReviewProfileSnapshot['notice'], profile = state.profile) => {
    state = Object.freeze({ profile, phase, notice }); for (const listener of listeners) listener();
  };
  const owns = (token: number, owner: Owner) => !disposed && generation === token && current === owner;
  return Object.freeze({
    get app(): Owner['app'] { return current.app; },
    get transport(): Owner['transport'] { return current.transport; },
    getSnapshot: () => state,
    subscribe(listener: () => void) { if (disposed) return () => {}; listeners.add(listener); return () => { listeners.delete(listener); }; },
    async enter(route: ApplicationRoute | null = null): Promise<boolean> {
      if (disposed || !mounted || busy !== null) return false;
      const owner = current, token = ++generation; busy = token; publish('entering', null);
      try {
        // Re-entering an authenticated synthetic session must not turn the
        // existing debug action into an escape from a dirty/uncertain draft.
        if (owner.app.controller.authentication.getSnapshot().principal) {
          const allowed = await owner.app.controller.navigate(null);
          if (!owns(token, owner)) return false;
          if (!allowed) { publish('ready', 'cannot-leave'); return false; }
        }
        const entered = await owner.enter(route);
        if (!owns(token, owner)) return false;
        publish('ready', entered ? null : 'failed'); return entered;
      } catch {
        if (owns(token, owner)) publish('error', 'failed'); return false;
      } finally { if (busy === token) busy = null; }
    },
    async switchProfile(value: unknown): Promise<boolean> {
      const next = reviewProfile(value); // Reject invalid values before IO or owner changes.
      if (disposed || busy !== null) return false;
      if (next === state.profile && mounted) return true;
      const owner = current, token = ++generation; busy = token; publish('switching', null);
      try {
        const allowed = !mounted || !owner.app.controller.authentication.getSnapshot().principal || await owner.app.controller.navigate(null);
        if (!owns(token, owner)) return false;
        if (!allowed) { publish('ready', 'cannot-leave'); return false; }
        if (mounted) {
          owner.transport.revoke();
          // Synchronous dispose clears the old auth/read scopes/root before the
          // next factory can mount. No two live business roots during handoff.
          try { owner.dispose(); } catch {
            disposed = true; generation++; busy = null; publish('disposed', 'failed'); listeners.clear(); return false;
          }
          mounted = false;
        }
        current = mount(next); mounted = true;
        publish('ready', 'changed', next); return true; // New owner remains inert until explicit enter.
      } catch {
        if (owns(token, owner)) publish('error', 'failed'); return false;
      } finally { if (busy === token) busy = null; }
    },
    async revoke(): Promise<void> {
      // Revocation must invalidate a pending switch/enter immediately. Unlike
      // those operations it is never ignored because the transition is busy.
      const token = ++generation, owner = current; busy = token;
      owner.transport.revoke();
      if (disposed || !mounted) { busy = null; return; }
      publish('revoking', null);
      try { await owner.revoke(); if (owns(token, owner)) publish('ready', 'revoked'); }
      catch { if (owns(token, owner)) publish('error', 'failed'); }
      finally { if (busy === token) busy = null; }
    },
    dispose(): void {
      generation++; busy = null; // Invalidate even when a switch is waiting on navigate.
      if (disposed) return;
      disposed = true;
      try { current.transport.revoke(); if (mounted) current.dispose(); }
      finally { mounted = false; publish('disposed', null); listeners.clear(); }
    },
  });
}
