/** Pure, session-owned popup arbitration. No document listener or shared singleton. */
export type PopupCloseReason = 'close' | 'replaced' | 'outside' | 'escape' | 'scope-disposed' | 'owner-disposed' | 'session-disposed';

export interface PopupOwnership {
  readonly active: boolean;
  /** Stale owners cannot close a newer popup. */
  close(): boolean;
  dispose(): boolean;
}

export interface PopupRequest {
  /** The existing route/drawer ReadScope.signal can be passed directly. */
  readonly signal: AbortSignal;
  readonly onClose: (reason: PopupCloseReason) => void;
}

interface OwnedPopup {
  readonly ownership: PopupOwnership;
  readonly release: (reason: PopupCloseReason) => boolean;
}

/**
 * Construct per authenticated app session; dispose before replacing that session.
 * A host may acquire ownership before a lazy action resolves. Its onClose must
 * invalidate pending open intent too, not only hide an already mounted popup.
 * DOM hit-testing and listener installation deliberately remain with that host.
 */
export class ExclusivePopupController {
  #current: OwnedPopup | null = null;
  #disposed = false;
  #generation = 0;

  get active(): PopupOwnership | null { return this.#current?.ownership ?? null; }
  get disposed(): boolean { return this.#disposed; }

  /** A rejected/aborted request never closes the current valid owner. */
  open(request: PopupRequest): PopupOwnership | null {
    if (this.#disposed || request.signal.aborted) return null;
    const generation = ++this.#generation;
    this.#current?.release('replaced');
    // A close callback may synchronously open a different owner or dispose the
    // scope/session. That newer intent wins instead of leaking a second owner.
    if (this.#disposed || request.signal.aborted || generation !== this.#generation) return null;
    let notify: PopupRequest['onClose'] | null = request.onClose;
    const requestSignal = request.signal;
    let signal: AbortSignal | null = requestSignal;
    const controller = this;
    const release = (reason: PopupCloseReason): boolean => {
      if (controller.#current !== record) return false;
      controller.#current = null;
      signal?.removeEventListener('abort', onAbort);
      signal = null;
      const callback = notify;
      notify = null;
      // Clean up first, even if the consumer callback throws or reenters.
      callback?.(reason);
      return true;
    };
    const ownership: PopupOwnership = Object.freeze({
      get active() { return controller.#current === record; },
      close: () => release('close'),
      dispose: () => release('owner-disposed'),
    });
    const record: OwnedPopup = { ownership, release };
    const onAbort = () => { release('scope-disposed'); };
    this.#current = record;
    requestSignal.addEventListener('abort', onAbort, { once: true });
    // Also guard custom AbortSignal adapters that become aborted while attaching.
    if (requestSignal.aborted) release('scope-disposed');
    return ownership.active ? ownership : null;
  }

  close(): boolean { return this.#current?.release('close') ?? false; }

  /** Pass the active ownership only when the event is inside its trigger/popup. */
  outside(inside: PopupOwnership | null): boolean {
    if (!this.#current || this.#current.ownership === inside) return false;
    return this.#current.release('outside');
  }

  /** Returns whether the host should preventDefault for this Escape. */
  escape(): boolean { return this.#current?.release('escape') ?? false; }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#generation++;
    this.#current?.release('session-disposed');
  }
}
