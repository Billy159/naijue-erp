import { createHash } from 'node:crypto';

export interface LoginRateBudget { readonly burst: number; readonly tokens: number; readonly intervalMillis: number }
export interface LoginAdmission {
  acquire(source: string, loginName: string): { release(): void };
}
export class LoginAdmissionRejected extends Error {
  readonly code = 'LOGIN_ADMISSION_BUSY';
  readonly retryAfterSeconds: number;
  constructor(retryAfterSeconds: number) { super('Login capacity is exhausted'); this.name = 'LoginAdmissionRejected'; this.retryAfterSeconds = retryAfterSeconds; }
}
type Bucket = { tokens: number; at: number; expiresAt: number };
/** Explicit injected budgets only. No account mutation, waiting queue, timer, raw username/IP keys or proxy header inference. */
export function createLoginAdmission(options: {
  readonly global: LoginRateBudget; readonly source: LoginRateBudget; readonly sourceAccount: LoginRateBudget;
  readonly entryTtlMillis: number; readonly maxEntries: number; readonly maxRetryAfterSeconds: number;
  readonly now: () => number;
}): LoginAdmission {
  const rates = [options?.global, options?.source, options?.sourceAccount];
  if (rates.some(rate => !rate || ![rate.burst, rate.tokens, rate.intervalMillis].every(value => Number.isSafeInteger(value) && value > 0))
    || ![options?.entryTtlMillis, options?.maxEntries, options?.maxRetryAfterSeconds].every(value => Number.isSafeInteger(value) && value > 0)
    || options.maxEntries < 3 || typeof options.now !== 'function'
    || rates.some(rate => options.entryTtlMillis < rate.burst / rate.tokens * rate.intervalMillis)) throw new TypeError('Explicit bounded login admission budgets and clock required');
  const [globalRate, sourceRate, pairRate] = rates.map(rate => Object.freeze({...rate})) as [LoginRateBudget, LoginRateBudget, LoginRateBudget];
  const {entryTtlMillis, maxEntries, maxRetryAfterSeconds, now} = options;
  const buckets = new Map<string, Bucket>(), inFlight = new Set<string>();
  let global: Bucket | undefined, last = -Infinity;
  const key = (kind: string, value: unknown): string => createHash('sha256').update(kind).update('\0').update(JSON.stringify(value)).digest('hex');
  const time = (): number => { const value = now(); if (!Number.isFinite(value) || value < last) throw new TypeError('Monotonic login admission clock required'); last = value; return value; };
  const fresh = (rate: LoginRateBudget, at: number): Bucket => ({tokens: rate.burst, at, expiresAt: at + entryTtlMillis});
  const refill = (bucket: Bucket, rate: LoginRateBudget, at: number): void => {
    bucket.tokens = Math.min(rate.burst, bucket.tokens + (at - bucket.at) * rate.tokens / rate.intervalMillis);
    bucket.at = at; bucket.expiresAt = at + entryTtlMillis;
  };
  const reject = (milliseconds: number): never => { throw new LoginAdmissionRejected(Math.min(maxRetryAfterSeconds, Math.max(1, Math.ceil(milliseconds / 1000)))); };
  return Object.freeze({acquire(source: string, loginName: string) {
    if (typeof source !== 'string' || source.length === 0 || source.length > 256 || typeof loginName !== 'string'
      || loginName.length === 0 || Buffer.byteLength(loginName, 'utf8') > 256) throw new TypeError('Bounded socket source and exact login name required');
    const at = time(), sourceKey = key('source', source), pairKey = key('source-account', [source, loginName]), accountKey = key('account', loginName);
    for (const [id, bucket] of buckets) if (bucket.expiresAt <= at) buckets.delete(id);
    const missing = Number(!buckets.has(sourceKey)) + Number(!buckets.has(pairKey));
    if (buckets.size + missing + inFlight.size + Number(!inFlight.has(accountKey)) > maxEntries) return reject(entryTtlMillis);
    global ??= fresh(globalRate, at);
    const a = buckets.get(sourceKey) ?? fresh(sourceRate, at), b = buckets.get(pairKey) ?? fresh(pairRate, at);
    refill(global, globalRate, at); refill(a, sourceRate, at); refill(b, pairRate, at);
    // In-flight account occupancy is independent of source. No cumulative failures or permanent account lock.
    if (inFlight.has(accountKey)) return reject(1);
    const wait = Math.max(...[[global, globalRate], [a, sourceRate], [b, pairRate]].map(([bucket, rate]) => {
      const state = bucket as Bucket, budget = rate as LoginRateBudget;
      return state.tokens >= 1 ? 0 : (1 - state.tokens) * budget.intervalMillis / budget.tokens;
    }));
    if (wait > 0) return reject(wait);
    global.tokens--; a.tokens--; b.tokens--; buckets.set(sourceKey, a); buckets.set(pairKey, b); inFlight.add(accountKey);
    let released = false;
    return Object.freeze({release() { if (!released) { released = true; inFlight.delete(accountKey); } }});
  }});
}
