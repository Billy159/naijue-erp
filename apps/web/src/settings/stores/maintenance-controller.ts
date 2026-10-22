import type { ReadScope } from '../../loading/read-scope.ts';
import type { SettingsErrors } from './maintenance-contracts.ts';

export interface SettingsDraftSnapshot<T> {
  readonly draft: Readonly<T> | null; readonly errors: SettingsErrors;
  readonly dirty: boolean; readonly closePrompt: boolean; readonly disposed: boolean;
}
function immutable<T>(value: T): T {
  const copy: T = structuredClone(value);
  const freeze = (item: unknown): void => {
    if (item && typeof item === 'object') { for (const child of Object.values(item)) freeze(child); Object.freeze(item); }
  };
  freeze(copy); return copy;
}
/** Local editable preparation only. No submit, success, key generation, persistence
 * or speculative write DTO is installed before the B05 contract is frozen. */
export class SettingsDraftController<T extends object> {
  readonly #scope: ReadScope;
  readonly #validate: (draft: Readonly<T>) => SettingsErrors;
  readonly #listeners = new Set<() => void>();
  #baseline: Readonly<T> | null;
  #snapshot: SettingsDraftSnapshot<T>;
  readonly #abort = () => this.dispose();
  constructor(scope: ReadScope, initial: T, validate: (draft: Readonly<T>) => SettingsErrors) {
    this.#scope = scope; this.#validate = validate; this.#baseline = immutable(initial);
    this.#snapshot = Object.freeze({ draft: this.#baseline, errors: Object.freeze({}), dirty: false, closePrompt: false, disposed: false });
    scope.signal.addEventListener('abort', this.#abort, { once: true });
    if (!scope.active) this.dispose();
  }
  getSnapshot = (): SettingsDraftSnapshot<T> => this.#snapshot;
  subscribe = (listener: () => void): (() => void) => {
    if (this.#snapshot.disposed) return () => {};
    this.#listeners.add(listener); return () => { this.#listeners.delete(listener); };
  };
  #publish(next: SettingsDraftSnapshot<T>): void {
    this.#snapshot = Object.freeze(next);
    for (const listener of [...this.#listeners]) { try { listener(); } catch { /* Consumer cannot prevent clearing private form state. */ } }
  }
  update(patch: Partial<T>): void {
    if (!this.#scope.active || this.#snapshot.disposed || !this.#snapshot.draft) return;
    const draft = immutable({ ...this.#snapshot.draft, ...patch }) as Readonly<T>;
    this.#publish({ ...this.#snapshot, draft, errors: Object.freeze({}), dirty: JSON.stringify(draft) !== JSON.stringify(this.#baseline), closePrompt: false });
  }
  validate(): SettingsErrors {
    if (!this.#scope.active || this.#snapshot.disposed || !this.#snapshot.draft) return Object.freeze({});
    const errors = Object.freeze({ ...this.#validate(this.#snapshot.draft) });
    this.#publish({ ...this.#snapshot, errors }); return errors;
  }
  requestClose(): boolean {
    if (this.#snapshot.disposed) return true;
    if (!this.#snapshot.dirty) { this.dispose(); return true; }
    this.#publish({ ...this.#snapshot, closePrompt: true }); return false;
  }
  keepEditing(): void { if (!this.#snapshot.disposed) this.#publish({ ...this.#snapshot, closePrompt: false }); }
  canLeave(): boolean { return !this.#snapshot.dirty; }
  dispose(): void {
    if (this.#snapshot.disposed) return;
    this.#scope.signal.removeEventListener('abort', this.#abort); this.#baseline = null;
    this.#publish({ draft: null, errors: Object.freeze({}), dirty: false, closePrompt: false, disposed: true }); this.#listeners.clear();
  }
}
