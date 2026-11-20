import { InactiveReadScopeError, type ReadScope } from './read-scope.ts';

export interface AsyncLeafDefinition<T> {
  /** Import code only. Business reads belong to the scoped query executor. */
  readonly load: () => Promise<T>;
  /** Resolve only after necessary styles are ready, not merely after inserting a link. */
  readonly loadStyles?: () => Promise<unknown>;
}

type Definitions = Record<string, AsyncLeafDefinition<unknown>>;
type Loaded<T extends AsyncLeafDefinition<unknown>> = Awaited<ReturnType<T['load']>>;
interface Entry {
  promise: Promise<unknown>;
  ready: boolean;
  retain: boolean;
}

/** Explicit activation only: no hover, idle, startup or predicted-route prefetch. */
export class AsyncLeafRegistry<T extends Definitions> {
  readonly #definitions: T;
  readonly #entries = new Map<keyof T, Entry>();
  readonly #maxRetainedEntries: number;

  constructor(definitions: T, options: { readonly maxRetainedEntries: number }) {
    if (!Number.isSafeInteger(options.maxRetainedEntries) || options.maxRetainedEntries < 1) {
      throw new Error('maxRetainedEntries must be a positive safe integer.');
    }
    const copied: Definitions = Object.create(null) as Definitions;
    for (const [key, definition] of Object.entries(definitions)) {
      if (typeof definition.load !== 'function' || (definition.loadStyles !== undefined && typeof definition.loadStyles !== 'function')) {
        throw new TypeError('Async leaves require import/style factories.');
      }
      copied[key] = Object.freeze({ ...definition });
    }
    this.#definitions = Object.freeze(copied) as T;
    this.#maxRetainedEntries = options.maxRetainedEntries;
  }

  /** Call only from an authorized route/action/tab activation, including a deep link. */
  load<K extends keyof T & string>(key: K, scope: ReadScope): Promise<Loaded<T[K]>> {
    if (!scope.active) return Promise.reject(new InactiveReadScopeError());
    if (!Object.hasOwn(this.#definitions, key)) return Promise.reject(new Error('Unknown async leaf.'));
    let entry = this.#entries.get(key);
    if (!entry) {
      const definition = this.#definitions[key]!;
      entry = { ready: false, retain: true, promise: Promise.resolve() };
      const currentEntry = entry;
      currentEntry.promise = Promise.resolve().then(async () => {
        const [module] = await Promise.all([definition.load(), definition.loadStyles?.()]);
        if (this.#entries.get(key) === currentEntry) {
          currentEntry.ready = true;
          if (currentEntry.retain) {
            this.#touch(key, currentEntry);
            this.#trim();
          } else {
            this.#entries.delete(key);
          }
        }
        return module;
      }).catch((error: unknown) => {
        if (this.#entries.get(key) === currentEntry) this.#entries.delete(key);
        throw error;
      });
      this.#entries.set(key, currentEntry);
    } else {
      entry.retain = true;
      this.#touch(key, entry);
    }
    // Dynamic imports cannot reliably be physically cancelled. Each consumer can
    // still detach immediately without cancelling another consumer's code load.
    return waitForScope(entry.promise, scope) as Promise<Loaded<T[K]>>;
  }

  status(key: keyof T): 'unloaded' | 'loading' | 'loaded' {
    const entry = this.#entries.get(key);
    return entry ? (entry.ready ? 'loaded' : 'loading') : 'unloaded';
  }

  /** Release ready references, keeping in-flight deduplication until settlement. */
  clear(): void {
    for (const [key, entry] of this.#entries) {
      if (entry.ready) this.#entries.delete(key);
      else entry.retain = false;
    }
  }

  #touch(key: keyof T, entry: Entry): void {
    this.#entries.delete(key);
    this.#entries.set(key, entry);
  }

  #trim(): void {
    let retained = [...this.#entries.values()].filter((entry) => entry.ready).length;
    for (const [key, entry] of this.#entries) {
      if (retained <= this.#maxRetainedEntries) break;
      if (entry.ready) { this.#entries.delete(key); retained -= 1; }
    }
  }
}

function waitForScope<T>(promise: Promise<T>, scope: ReadScope): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new InactiveReadScopeError());
    scope.signal.addEventListener('abort', abort, { once: true });
    promise.then(
      (value) => { if (scope.active) resolve(value); else abort(); },
      (error: unknown) => reject(scope.active ? error : new InactiveReadScopeError()),
    ).finally(() => scope.signal.removeEventListener('abort', abort));
    if (!scope.active) abort();
  });
}
