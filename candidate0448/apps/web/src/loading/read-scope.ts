/** Non-secret identity revisions. Never put session tokens or passwords here. */
export interface ReadIdentity {
  readonly accountId: string;
  readonly sessionRevision: string;
  readonly permissionRevision: string;
}

/** A single mounted route, drawer or entity. Dispose before replacing its target. */
export class ReadScope {
  readonly identity: ReadIdentity;
  readonly routeInstanceId: string;
  readonly entityId: string | null;
  readonly #controller = new AbortController();
  readonly #release: () => void;

  constructor(identity: ReadIdentity, routeInstanceId: string, entityId: string | null, release: () => void) {
    this.identity = Object.freeze({ ...identity });
    this.routeInstanceId = routeInstanceId;
    this.entityId = entityId;
    this.#release = release;
  }

  get signal(): AbortSignal { return this.#controller.signal; }
  get active(): boolean { return !this.signal.aborted; }

  dispose(): void {
    if (!this.active) return;
    this.#release();
    this.#controller.abort();
  }
}

/** Own one per app session, not a global data store. No persistence or data cache. */
export class ReadContext {
  #identity: ReadIdentity | null = null;
  readonly #scopes = new Set<ReadScope>();

  constructor(identity?: ReadIdentity) {
    if (identity) this.replaceIdentity(identity);
  }

  /** Always invalidates scopes, including a same-account permission/session change. */
  replaceIdentity(identity: ReadIdentity | null): void {
    const next = identity ? validatedIdentity(identity) : null;
    this.#identity = null;
    for (const scope of [...this.#scopes]) scope.dispose();
    this.#identity = next;
  }

  createScope(routeInstanceId: string, entityId: string | null = null): ReadScope {
    if (!this.#identity) throw new Error('An active read identity is required.');
    if (!routeInstanceId.trim()) throw new Error('A route instance ID is required.');
    let scope: ReadScope;
    scope = new ReadScope(this.#identity, routeInstanceId, entityId, () => this.#scopes.delete(scope));
    this.#scopes.add(scope);
    return scope;
  }

  clear(): void { this.replaceIdentity(null); }
}

function validatedIdentity(identity: ReadIdentity): ReadIdentity {
  for (const value of [identity.accountId, identity.sessionRevision, identity.permissionRevision]) {
    if (typeof value !== 'string' || !value.trim()) throw new Error('Identity fields must be non-empty revisions.');
  }
  return Object.freeze({
    accountId: identity.accountId,
    sessionRevision: identity.sessionRevision,
    permissionRevision: identity.permissionRevision,
  });
}

export class InactiveReadScopeError extends Error {
  constructor() {
    super('The read scope is no longer active.');
    this.name = 'InactiveReadScopeError';
  }
}
