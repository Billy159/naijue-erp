import type { ReadContext, ReadIdentity } from '../loading/read-scope.ts';
import { AuthClientError, validLoginInput, validPasswordInput, type AuthClient, type AuthenticationPrincipal, type LoginInput, type PasswordChangeInput } from './contracts.ts';

export type AuthenticationOperation = 'resolve' | 'login' | 'logout' | 'password';
export type IdentityChangeReason = 'initial' | 'verification' | 'login' | 'identity' | 'logout' | 'expired' | 'password-changed' | 'cancelled' | 'uncertain' | 'disposed';
export interface IdentityChange {
  readonly principal: AuthenticationPrincipal | null;
  /** A non-secret in-memory generation, not a cookie/session credential. Never persist it. */
  readonly sessionRevision: string;
  readonly reason: IdentityChangeReason;
}
export interface AuthenticationSnapshot {
  readonly phase: 'unresolved' | 'resolving' | 'anonymous' | 'authenticated' | 'logging-in' | 'logging-out' | 'changing-password' | 'error' | 'cancelled';
  readonly principal: AuthenticationPrincipal | null;
  readonly operation: AuthenticationOperation | null;
  readonly error: AuthClientError | null;
  readonly notice: 'password-changed' | 'logged-out' | 'expired' | 'cancelled' | 'uncertain' | null;
}
export interface AuthenticationControllerOptions {
  readonly client: AuthClient;
  /** REQUIRED: invalidate the host's ReadContext before displaying the replacement identity. */
  readonly onIdentityChange: (change: IdentityChange) => void;
  readonly now?: () => number;
}
const idle: AuthenticationSnapshot = Object.freeze({ phase: 'unresolved', principal: null, operation: null, error: null, notice: null });
/** Holds identity/UI status only. Inputs are passed once to the client, never copied into a state, draft, retry closure or log. */
export class AuthenticationController {
  readonly #client: AuthClient;
  readonly #lifecycle: (change: IdentityChange) => void;
  readonly #now: () => number;
  readonly #listeners = new Set<() => void>();
  #state = idle;
  #generation = 0;
  #identityRevision = 0;
  #request: AbortController | null = null;
  #expiry: ReturnType<typeof setTimeout> | null = null;
  #disposed = false;
  constructor(options: AuthenticationControllerOptions) {
    if (typeof options?.onIdentityChange !== 'function' || typeof options.client?.login !== 'function'
      || typeof options.client.session !== 'function' || typeof options.client.logout !== 'function' || typeof options.client.changeOwnPassword !== 'function') {
      throw new TypeError('An explicit authentication client and host identity lifecycle callback are required.');
    }
    this.#client = options.client; this.#lifecycle = options.onIdentityChange; this.#now = options.now ?? Date.now;
    this.#identity('initial');
  }
  readonly getSnapshot = (): AuthenticationSnapshot => this.#state;
  readonly subscribe = (listener: () => void): (() => void) => {
    if (this.#disposed) return () => {};
    this.#listeners.add(listener); return () => this.#listeners.delete(listener);
  };
  get busy(): boolean { return this.#request !== null; }
  #publish(next: AuthenticationSnapshot): void {
    this.#state = Object.freeze(next);
    for (const listener of [...this.#listeners]) listener();
  }
  #identity(reason: IdentityChangeReason, principal: AuthenticationPrincipal | null = null): void {
    if (this.#expiry !== null) clearTimeout(this.#expiry);
    this.#expiry = null;
    this.#identityRevision++;
    this.#lifecycle(Object.freeze({ principal, reason, sessionRevision: String(this.#identityRevision) }));
  }
  #begin(operation: AuthenticationOperation): { controller: AbortController; generation: number } {
    this.#generation++;
    this.#request?.abort();
    const controller = new AbortController(); this.#request = controller;
    const phases = { resolve: 'resolving', login: 'logging-in', logout: 'logging-out', password: 'changing-password' } as const;
    this.#publish({ ...this.#state, phase: phases[operation], operation, error: null, notice: null });
    return { controller, generation: this.#generation };
  }
  #current(request: { controller: AbortController; generation: number }): boolean {
    return !this.#disposed && request.generation === this.#generation && request.controller === this.#request && !request.controller.signal.aborted;
  }
  #done(request: { controller: AbortController; generation: number }): boolean {
    if (!this.#current(request)) return false;
    this.#request = null; return true;
  }
  #authenticated(principal: AuthenticationPrincipal, expiresAt?: string): void {
    this.#identity('identity', principal);
    this.#publish({ phase: 'authenticated', principal, operation: null, error: null, notice: null });
    if (expiresAt !== undefined) {
      const expiry = Date.parse(expiresAt);
      const schedule = () => {
        if (this.#disposed || this.#state.principal !== principal) return;
        const remaining = expiry - this.#now();
        if (remaining <= 0) { this.expire(); return; }
        this.#expiry = setTimeout(schedule, Math.min(remaining, 2_147_483_647));
        this.#expiry.unref?.();
      };
      schedule();
    }
  }
  #failure(operation: AuthenticationOperation, error: unknown): void {
    const safe = error instanceof AuthClientError ? error : new AuthClientError('server');
    if (safe.kind === 'unauthenticated') {
      this.#identity('expired');
      this.#publish({ phase: 'error', principal: null, operation, error: safe, notice: 'expired' });
      return;
    }
    const uncertain = (operation === 'password' || operation === 'logout' || operation === 'login')
      && !['invalid-input', 'credentials', 'password-rejected', 'forbidden'].includes(safe.kind);
    if (uncertain) this.#identity('uncertain');
    this.#publish({ phase: safe.kind === 'aborted' ? 'cancelled' : 'error', principal: uncertain ? null : this.#state.principal,
      operation, error: safe, notice: uncertain ? 'uncertain' : null });
  }
  /** Explicit initial/session verification. It never logs in, refreshes a session or retries a write. */
  async resolveSession(): Promise<boolean> {
    if (this.#disposed || this.busy) return false;
    this.#identity('verification');
    this.#publish({ ...idle, principal: null });
    const request = this.#begin('resolve');
    try {
      const principal = await this.#client.session(request.controller.signal);
      if (!this.#done(request)) return false;
      if (principal) this.#authenticated(principal);
      else this.#publish({ phase: 'anonymous', principal: null, operation: null, error: null, notice: null });
      return true;
    } catch (error: unknown) {
      if (!this.#done(request)) return false;
      this.#failure('resolve', error); return false;
    }
  }
  async login(input: LoginInput): Promise<boolean> {
    if (this.#disposed || this.busy) return false;
    if (!validLoginInput(input)) {
      this.#publish({ ...this.#state, phase: 'error', operation: 'login', error: new AuthClientError('invalid-input'), notice: null }); return false;
    }
    this.#identity('login');
    this.#publish({ ...idle, principal: null });
    const request = this.#begin('login');
    try {
      const result = await this.#client.login(input, request.controller.signal);
      if (!this.#done(request)) return false;
      if (!Number.isFinite(Date.parse(result.expiresAt)) || Date.parse(result.expiresAt) <= this.#now()) {
        this.#failure('login', new AuthClientError('unauthenticated')); return false;
      }
      this.#authenticated(result.principal, result.expiresAt); return true;
    } catch (error: unknown) {
      if (!this.#done(request)) return false;
      this.#failure('login', error); return false;
    }
  }
  /** Can supersede a pending login/resolve so a late response cannot restore its identity. */
  async logout(): Promise<boolean> {
    if (this.#disposed || this.#state.operation === 'logout' && this.busy) return false;
    this.#identity('logout');
    this.#publish({ ...idle, principal: null });
    const request = this.#begin('logout');
    try {
      await this.#client.logout(request.controller.signal);
      if (!this.#done(request)) return false;
      this.#publish({ phase: 'anonymous', principal: null, operation: null, error: null, notice: 'logged-out' }); return true;
    } catch (error: unknown) {
      if (!this.#done(request)) return false;
      this.#failure('logout', error); return false;
    }
  }
  async changeOwnPassword(input: PasswordChangeInput): Promise<boolean> {
    if (this.#disposed || this.busy || !this.#state.principal) return false;
    if (!validPasswordInput(input?.currentPassword) || !validPasswordInput(input?.newPassword)) {
      this.#publish({ ...this.#state, phase: 'error', operation: 'password', error: new AuthClientError('invalid-input'), notice: null }); return false;
    }
    const request = this.#begin('password');
    try {
      await this.#client.changeOwnPassword(input, request.controller.signal);
      if (!this.#done(request)) return false;
      this.#identity('password-changed');
      this.#publish({ phase: 'anonymous', principal: null, operation: null, error: null, notice: 'password-changed' }); return true;
    } catch (error: unknown) {
      if (!this.#done(request)) return false;
      this.#failure('password', error); return false;
    }
  }
  cancel(): void {
    if (this.#disposed || !this.busy) return;
    const operation = this.#state.operation;
    this.#generation++; this.#request?.abort(); this.#request = null;
    this.#identity('cancelled');
    this.#publish({ phase: 'cancelled', principal: null, operation, error: null, notice: 'cancelled' });
  }
  /** Host calls this on a cookie-session expiry/401 from a business request. No automatic login or retry. */
  expire(): void {
    if (this.#disposed) return;
    this.#generation++; this.#request?.abort(); this.#request = null;
    this.#identity('expired');
    this.#publish({ phase: 'anonymous', principal: null, operation: null, error: null, notice: 'expired' });
  }
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true; this.#generation++; this.#request?.abort(); this.#request = null;
    this.#identity('disposed'); this.#state = idle; this.#listeners.clear();
  }
}
/** Recommended host bridge. replaceIdentity invalidates all old scopes, including same-account permission revisions. */
export function readContextAuthenticationLifecycle(context: ReadContext): (change: IdentityChange) => void {
  return change => {
    const principal = change.principal;
    const identity: ReadIdentity | null = principal ? { accountId: principal.accountId, sessionRevision: change.sessionRevision,
      permissionRevision: JSON.stringify([principal.authVersion, principal.staffId, principal.role, principal.hallId]) } : null;
    context.replaceIdentity(identity);
  };
}
