import { InactiveReadScopeError, type ReadIdentity, type ReadScope } from './read-scope.ts';
import { snapshotQueryParameters } from './query-parameters.ts';

export interface QueryExecution<P> {
  readonly sequence: number;
  readonly parameters: Readonly<P>;
}
export interface QuerySuccess<P, D> extends QueryExecution<P> {
  readonly data: D;
}
export interface QuerySnapshot<P, D> {
  readonly phase: 'idle' | 'loading' | 'success' | 'error' | 'stale' | 'disposed';
  readonly request: QueryExecution<P> | null;
  /** This has its OWN executed parameters, never the current editable filter draft. */
  readonly success: QuerySuccess<P, D> | null;
  readonly error: unknown | null;
}
export type QueryOutcome<D> =
  | { readonly status: 'success'; readonly data: D }
  | { readonly status: 'error'; readonly error: unknown }
  | { readonly status: 'discarded'; readonly reason: 'superseded' | 'disposed' | 'older-version' };
export interface QueryRead<P> {
  readonly parameters: Readonly<P>;
  readonly signal: AbortSignal;
  readonly identity: ReadIdentity;
  readonly routeInstanceId: string;
  readonly entityId: string | null;
}
export interface LatestQueryOptions<P, D> {
  readonly scope: ReadScope;
  readonly execute: (read: QueryRead<P>) => Promise<D>;
  /** For a single versioned entity only. A list's row versions are not one version. */
  readonly versionOf?: (data: D) => bigint;
  /** Consumer callback errors must not stop account cleanup or alter query facts. */
  readonly onSubscriberError?: (error: unknown) => void;
}

/** Read-only primitive. It never submits, retries or cancels a business command. */
export class LatestQuery<P, D> {
  readonly #options: LatestQueryOptions<P, D>;
  readonly #listeners = new Set<() => void>();
  readonly #onScopeAbort = () => this.dispose();
  #sequence = 0;
  #controller: AbortController | null = null;
  #knownVersion: bigint | null = null;
  #snapshot: QuerySnapshot<P, D> = Object.freeze({ phase: 'idle', request: null, success: null, error: null });

  constructor(options: LatestQueryOptions<P, D>) {
    this.#options = Object.freeze({ ...options });
    options.scope.signal.addEventListener('abort', this.#onScopeAbort, { once: true });
    if (!options.scope.active) this.dispose();
  }

  getSnapshot = (): QuerySnapshot<P, D> => this.#snapshot;

  subscribe = (listener: () => void): (() => void) => {
    if (this.#snapshot.phase === 'disposed') return () => {};
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  };

  /** No request occurs until explicitly called. Editing a filter is not a query. */
  async run(parameters: P): Promise<QueryOutcome<D>> {
    if (!this.#options.scope.active || this.#snapshot.phase === 'disposed') {
      return { status: 'discarded', reason: 'disposed' };
    }
    const parameterSnapshot = snapshotQueryParameters(parameters);
    const execution = Object.freeze({ sequence: ++this.#sequence, parameters: parameterSnapshot });
    this.#controller?.abort();
    const controller = new AbortController();
    this.#controller = controller;
    this.#publish({ phase: 'loading', request: execution, success: this.#snapshot.success, error: null });
    try {
      const afterNotification = this.#discarded(execution.sequence);
      if (afterNotification) return afterNotification;
      const data = await abortableRead(() => this.#options.execute({
        parameters: execution.parameters,
        signal: controller.signal,
        identity: this.#options.scope.identity,
        routeInstanceId: this.#options.scope.routeInstanceId,
        entityId: this.#options.scope.entityId,
      }), controller.signal);
      const discarded = this.#discarded(execution.sequence);
      if (discarded) return discarded;
      const version = this.#version(data);
      if (version !== null && this.#knownVersion !== null && version < this.#knownVersion) {
        this.#publish({ phase: 'stale', request: execution, success: this.#snapshot.success, error: null });
        return this.#discarded(execution.sequence) ?? { status: 'discarded', reason: 'older-version' };
      }
      if (version !== null) this.#knownVersion = version;
      this.#publish({ phase: 'success', request: execution, success: Object.freeze({ ...execution, data }), error: null });
      return this.#discarded(execution.sequence) ?? { status: 'success', data };
    } catch (error: unknown) {
      const discarded = this.#discarded(execution.sequence);
      if (discarded) return discarded;
      this.#publish({ phase: 'error', request: execution, success: this.#snapshot.success, error });
      return this.#discarded(execution.sequence) ?? { status: 'error', error };
    } finally {
      if (this.#controller === controller) this.#controller = null;
    }
  }

  /** Apply an already-successful command's authoritative DTO, not an optimistic draft. */
  acceptAuthoritative(parameters: P, data: D): void {
    if (!this.#options.scope.active || this.#snapshot.phase === 'disposed') throw new InactiveReadScopeError();
    const snapshot = snapshotQueryParameters(parameters);
    const version = this.#version(data);
    if (version !== null && this.#knownVersion !== null && version < this.#knownVersion) {
      throw new Error('An authoritative response cannot regress the known entity version.');
    }
    const execution = Object.freeze({ sequence: ++this.#sequence, parameters: snapshot });
    this.#controller?.abort();
    this.#controller = null;
    if (version !== null) this.#knownVersion = version;
    this.#publish({ phase: 'success', request: execution, success: Object.freeze({ ...execution, data }), error: null });
  }

  /** Stop this read only; prior successful results retain their executed range. */
  cancel(): void {
    if (this.#snapshot.phase === 'disposed') return;
    ++this.#sequence;
    this.#controller?.abort();
    this.#controller = null;
    const success = this.#snapshot.success;
    this.#publish({ phase: success ? 'success' : 'idle', request: success, success, error: null });
  }

  /** Close/target replacement/account changes clear all result references. */
  dispose(): void {
    if (this.#snapshot.phase === 'disposed') return;
    ++this.#sequence;
    this.#controller?.abort();
    this.#controller = null;
    this.#knownVersion = null;
    this.#options.scope.signal.removeEventListener('abort', this.#onScopeAbort);
    this.#publish({ phase: 'disposed', request: null, success: null, error: null });
    this.#listeners.clear();
  }

  #version(data: D): bigint | null {
    if (!this.#options.versionOf) return null;
    const version = this.#options.versionOf(data);
    if (typeof version !== 'bigint' || version < 0n) throw new TypeError('Entity versions must be non-negative bigints.');
    return version;
  }

  #discarded(sequence: number): QueryOutcome<D> | null {
    if (!this.#options.scope.active || this.#snapshot.phase === 'disposed') return { status: 'discarded', reason: 'disposed' };
    if (sequence !== this.#sequence) return { status: 'discarded', reason: 'superseded' };
    return null;
  }

  #publish(snapshot: QuerySnapshot<P, D>): void {
    this.#snapshot = Object.freeze(snapshot);
    for (const listener of [...this.#listeners]) {
      try { listener(); } catch (error: unknown) {
        try { this.#options.onSubscriberError?.(error); } catch { /* Do not compromise invalidation. */ }
      }
    }
  }
}

/** Detach immediately even when a read transport ignores AbortSignal. */
function abortableRead<T>(start: () => Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const aborted = () => reject(new InactiveReadScopeError());
    signal.addEventListener('abort', aborted, { once: true });
    if (signal.aborted) { signal.removeEventListener('abort', aborted); aborted(); return; }
    let read: Promise<T>;
    try { read = start(); } catch (error: unknown) {
      signal.removeEventListener('abort', aborted);
      reject(error);
      return;
    }
    Promise.resolve(read).then(resolve, reject).finally(() => signal.removeEventListener('abort', aborted));
  });
}
