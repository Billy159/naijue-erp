import { mountUnifiedHarness } from './harness-app.tsx';
import { createReviewProfileSession } from './profile-session.ts';
import type { SyntheticCall } from './types.ts';

/** One business Application at a time in the same DOM root. This is only the
 * synthetic review host, never a real application/authorization fallback. */
export function mountUnifiedProfileSession(root: HTMLElement, onCall?: (call: SyntheticCall) => void) {
  let logOwner = 0;
  const session = createReviewProfileSession(profile => {
    const own = ++logOwner;
    return mountUnifiedHarness(root, call => { if (own === logOwner) onCall?.(call); }, profile);
  });
  return Object.freeze({
    get app() { return session.app; }, get transport() { return session.transport; },
    getSnapshot: session.getSnapshot, subscribe: session.subscribe,
    enter: session.enter, switchProfile: session.switchProfile, revoke: session.revoke,
    dispose() { logOwner++; session.dispose(); },
  });
}
export type UnifiedProfileSession = ReturnType<typeof mountUnifiedProfileSession>;
