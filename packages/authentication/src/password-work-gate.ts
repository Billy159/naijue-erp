import type { AuthenticationPasswordWork, PasswordCodec, PasswordWorkKind } from './ports.ts';

export class PasswordWorkRejected extends Error {
  readonly code: 'PASSWORD_WORK_BUSY' | 'AUTHENTICATION_CANCELLED';
  readonly retryAfterSeconds: number;
  constructor(code: PasswordWorkRejected['code'], retryAfterSeconds: number) {
    super(code === 'PASSWORD_WORK_BUSY' ? 'Password work capacity is exhausted' : 'Authentication was cancelled');
    this.name = 'PasswordWorkRejected'; this.code = code; this.retryAfterSeconds = retryAfterSeconds;
  }
}
export function assertAuthenticationActive(signal?: AbortSignal): void {
  if (signal?.aborted) throw new PasswordWorkRejected('AUTHENTICATION_CANCELLED', 0);
}
export interface PasswordWorkGate {
  run<T>(kind: PasswordWorkKind, work: () => Promise<T>, signal?: AbortSignal): Promise<T>;
}
/** No queue, timer, pool or production defaults. One gate is shared by every codec consumer in an instance. */
export function createPasswordWorkGate(options: {
  readonly maxConcurrent: number; readonly maxAnonymous: number; readonly retryAfterSeconds: number;
}): PasswordWorkGate {
  if (![options?.maxConcurrent, options?.maxAnonymous, options?.retryAfterSeconds].every(value => Number.isSafeInteger(value) && value > 0)
    || options.maxAnonymous > options.maxConcurrent) throw new TypeError('Explicit finite password work budgets required');
  const {maxConcurrent, maxAnonymous, retryAfterSeconds} = options;
  let active = 0, anonymous = 0;
  return Object.freeze({async run<T>(kind: PasswordWorkKind, work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!['login', 'authenticated'].includes(kind) || typeof work !== 'function') throw new TypeError('Explicit password work category required');
    assertAuthenticationActive(signal);
    if (active >= maxConcurrent || kind === 'login' && anonymous >= maxAnonymous) throw new PasswordWorkRejected('PASSWORD_WORK_BUSY', retryAfterSeconds);
    active++; if (kind === 'login') anonymous++;
    try {
      const result = await work(); // Do not race this promise with abort: the native worker still owns the slot.
      assertAuthenticationActive(signal); return result;
    } finally { active--; if (kind === 'login') anonymous--; }
  }});
}
/** Format selection happens before a SINGLE raw verify. A wrong supported password never triggers another dummy derivation. */
export function createAuthenticationPasswordWork(raw: PasswordCodec, gate: PasswordWorkGate, options: {
  readonly supports: (encoded: string) => boolean; readonly dummyHash: string;
}): AuthenticationPasswordWork {
  if (typeof raw?.hash !== 'function' || typeof raw?.verify !== 'function' || typeof gate?.run !== 'function'
    || typeof options?.supports !== 'function' || !options.supports(options.dummyHash)) throw new TypeError('Explicit codec, shared work gate and supported fixed dummy required');
  const {supports, dummyHash} = options;
  return Object.freeze({
    async verify(password: string, encoded: string | undefined, kind: PasswordWorkKind, signal?: AbortSignal) {
      const supported = typeof encoded === 'string' && supports(encoded);
      const matches = await gate.run(kind, () => raw.verify(password, supported ? encoded : dummyHash), signal);
      return supported && matches;
    },
    hash(password: string, signal?: AbortSignal) { return gate.run('authenticated', () => raw.hash(password), signal); }
  });
}
/** Maintenance gets a facade over the SAME gate; do not also acquire a work slot around this facade. */
export function gatePasswordCodec(raw: PasswordCodec, gate: PasswordWorkGate, kind: PasswordWorkKind): PasswordCodec {
  return Object.freeze({hash: (password: string) => gate.run(kind, () => raw.hash(password)),
    verify: (password: string, encoded: string) => gate.run(kind, () => raw.verify(password, encoded))});
}
