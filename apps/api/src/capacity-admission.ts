/** A02 instance-local admission only. Trusted host configuration/probes supply every target, window and byte budget. */
import type {LoginAdmission} from './login-admission.ts';

export const CAPACITY_VOLUMES = ['postgres', 'wal', 'backup', 'system', 'media'] as const;
export type CapacityVolume = typeof CAPACITY_VOLUMES[number];
export type CapacityBytes = Readonly<Record<CapacityVolume, bigint>>;
export type CapacityWriteKind = 'session' | 'upload';
export interface CapacityBinding {
  readonly candidateFingerprint: string;
  readonly targetFingerprint: string;
  readonly writerTopologyFingerprint: string;
  readonly inventoryFingerprint: string;
  readonly processInstanceId: string;
  readonly restartGeneration: number;
  readonly writerCount: number;
}
export interface CapacityWindow {
  readonly approved: boolean;
  /** An approval identifier, never a login credential or authority to mutate business data. */
  readonly token: string;
  readonly inventoryObservedAt: number;
  readonly startsAt: number;
  readonly expiresAt: number;
  readonly binding: CapacityBinding;
}
export type CapacityReading = {
  readonly status: 'KNOWN'; readonly windowToken: string; readonly binding: CapacityBinding;
  readonly observedAt: number; readonly databaseBytes: bigint; readonly sessionRelationBytes: bigint;
  /** Actual target volumes. API-local statfs cannot supply a remote PostgreSQL/WAL value. */
  readonly freeBytes: CapacityBytes;
} | { readonly status: 'UNKNOWN' };
export interface CapacityWriteBudget {
  readonly maxAdmissions: number;
  readonly maxInFlight: number;
  readonly worstCaseBytes: CapacityBytes;
}
export interface CapacityAdmission {
  acquire(kind: CapacityWriteKind, signal?: AbortSignal): Promise<ReturnType<LoginAdmission['acquire']>>;
  /** Stops new admission and aborts the probe; never releases another consumer's active work early. */
  close(): void;
}
export class CapacityAdmissionRejected extends Error {
  readonly code = 'CAPACITY_ADMISSION_UNAVAILABLE';
  readonly statusCode = 503;
  readonly reason: string;
  readonly retryAfterSeconds: number;
  constructor(reason: string, retryAfterSeconds: number) {
    super('New session or upload capacity is temporarily unavailable'); this.name = 'CapacityAdmissionRejected';
    this.reason = reason; this.retryAfterSeconds = retryAfterSeconds;
  }
}
const bindingKeys = ['candidateFingerprint', 'targetFingerprint', 'writerTopologyFingerprint', 'inventoryFingerprint', 'processInstanceId'] as const;
const positive = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
const timestamp = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
function bytes(v: CapacityBytes): boolean {
  return !!v && CAPACITY_VOLUMES.every(k => typeof v[k] === 'bigint' && v[k] >= 0n);
}
function binding(v: CapacityBinding): boolean {
  return !!v && bindingKeys.every(k => typeof v[k] === 'string' && v[k].length > 0 && v[k].length <= 256)
    && timestamp(v.restartGeneration) && v.writerCount === 1;
}
function sameBinding(a: CapacityBinding, b: CapacityBinding): boolean {
  return binding(a) && binding(b) && bindingKeys.every(k => a[k] === b[k])
    && a.restartGeneration === b.restartGeneration && a.writerCount === b.writerCount;
}
/** One component per approved process/writer. Recreating a counter is not a cross-restart quota.
 * Every restart needs a newly inventoried approval bound to that actual process identity.
 * The probe promise must settle only AFTER its PG/FD/native resources have settled and been released.
 * A timed-out, still-running probe remains the sole physical probe; new callers cannot multiply it.
 */
export function createCapacityAdmission(options: {
  readonly window: CapacityWindow | null;
  readonly budgets: Readonly<Record<CapacityWriteKind, CapacityWriteBudget>>;
  readonly minimumFreeBytes: CapacityBytes;
  /** Owner-measured margin covering TTL growth plus already admitted in-flight worst-case work. */
  readonly safetyBytes: CapacityBytes;
  readonly probeTtlMillis: number; readonly probeTimeoutMillis: number;
  readonly maxProbeWaiters: number; readonly retryAfterSeconds: number;
  readonly now: () => number;
  readonly currentBinding: () => CapacityBinding;
  readonly probe: (context: { readonly window: CapacityWindow; readonly signal: AbortSignal }) => Promise<CapacityReading>;
}): CapacityAdmission {
  if (!options || ![options.probeTtlMillis, options.probeTimeoutMillis, options.maxProbeWaiters, options.retryAfterSeconds].every(positive)
    || options.probeTtlMillis > 30_000 || options.probeTimeoutMillis > options.probeTtlMillis
    || !bytes(options.minimumFreeBytes) || !bytes(options.safetyBytes)
    || typeof options.now !== 'function' || typeof options.currentBinding !== 'function' || typeof options.probe !== 'function'
    || !['session', 'upload'].every(k => {
      const b = options.budgets?.[k as CapacityWriteKind];
      return !!b && positive(b.maxAdmissions) && positive(b.maxInFlight) && b.maxInFlight <= b.maxAdmissions
        && bytes(b.worstCaseBytes) && CAPACITY_VOLUMES.some(v => b.worstCaseBytes[v] > 0n);
    })) throw new TypeError('Explicit finite capacity budgets, TTL <=30s, probe and trusted clocks/binding required');
  const {now, currentBinding, probe, probeTtlMillis, probeTimeoutMillis, maxProbeWaiters, retryAfterSeconds} = options;
  const window = options.window === null ? null : structuredClone(options.window);
  if (window !== null && (!binding(window.binding) || ![window.inventoryObservedAt, window.startsAt, window.expiresAt].every(timestamp)
    || window.inventoryObservedAt > window.startsAt || window.startsAt >= window.expiresAt || typeof window.approved !== 'boolean'
    || typeof window.token !== 'string' || window.token.length > 256)) throw new TypeError('Exact approved observation window and single-writer process binding required');
  const budgets = structuredClone(options.budgets), minimum = {...options.minimumFreeBytes}, safety = {...options.safetyBytes};
  const admitted = {session: 0, upload: 0}, active = {session: 0, upload: 0};
  const charged: Record<CapacityVolume, bigint> = {postgres: 0n, wal: 0n, backup: 0n, system: 0n, media: 0n};
  let closed = false, lastTime = -1, cache: {reading: CapacityReading; until: number} | undefined;
  type Pending = { controller: AbortController; promise: Promise<void>; listeners: Set<(value: CapacityReading) => void>; result: CapacityReading | undefined };
  let pending: Pending | undefined;
  const rejected = (reason: string) => new CapacityAdmissionRejected(reason, retryAfterSeconds);
  function time(): number {
    let at: number;
    try { at = now(); } catch { throw rejected('CLOCK_INVALID'); }
    if (!timestamp(at) || at < lastTime) throw rejected('CLOCK_INVALID');
    lastTime = at; return at;
  }
  function current(at: number): CapacityWindow {
    if (closed) throw rejected('CLOSED');
    if (!window?.approved || window.token.length === 0) throw rejected('WINDOW_UNAPPROVED');
    if (at < window.startsAt || at >= window.expiresAt) throw rejected('WINDOW_EXPIRED');
    let actual: CapacityBinding;
    try { actual = currentBinding(); } catch { throw rejected('BINDING_UNAVAILABLE'); }
    if (!sameBinding(actual, window.binding)) throw rejected('BINDING_CHANGED');
    return window;
  }
  const cancelled = (): Error => Object.assign(new Error('Capacity admission was cancelled'), {name: 'AbortError'});
  function startProbe(approved: CapacityWindow, at: number): Pending {
    const controller = new AbortController();
    const item: Pending = {controller, promise: Promise.resolve(), listeners: new Set(), result: undefined};
    pending = item;
    let finished = false, timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (reading: CapacityReading): void => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      let result: CapacityReading = {status: 'UNKNOWN'}, end = at;
      try {
        end = time(); current(end);
        if (reading.status === 'KNOWN' && reading.windowToken === approved.token && sameBinding(reading.binding, approved.binding)
          && timestamp(reading.observedAt) && reading.observedAt >= at && reading.observedAt <= end
          && end - reading.observedAt < probeTtlMillis && bytes(reading.freeBytes)
          && typeof reading.databaseBytes === 'bigint' && reading.databaseBytes >= 0n
          && typeof reading.sessionRelationBytes === 'bigint' && reading.sessionRelationBytes >= 0n) result = structuredClone(reading);
      } catch { /* Unknown identity/window/clock never populates a positive cache. */ }
      cache = {reading: result, until: result.status === 'KNOWN' ? result.observedAt + probeTtlMillis : end + probeTtlMillis};
      item.result = result;
      for (const deliver of item.listeners) deliver(result);
      item.listeners.clear();
    };
    const onProbeAbort = () => finish({status: 'UNKNOWN'});
    controller.signal.addEventListener('abort', onProbeAbort, {once: true});
    timer = setTimeout(() => { finish({status: 'UNKNOWN'}); controller.abort(); }, probeTimeoutMillis);
    // Keep pending until the real worker has settled, even after timeout or cancellation.
    item.promise = Promise.resolve().then(() => {
      if (controller.signal.aborted) return {status: 'UNKNOWN'} as const;
      return probe({window: structuredClone(approved), signal: controller.signal});
    }).then(finish, () => finish({status: 'UNKNOWN'})).finally(() => {
      clearTimeout(timer);
      controller.signal.removeEventListener('abort', onProbeAbort);
      if (pending === item) pending = undefined;
    });
    return item;
  }
  async function reading(approved: CapacityWindow, at: number, signal?: AbortSignal): Promise<CapacityReading> {
    if (cache && at < cache.until) return cache.reading;
    const item = pending ?? startProbe(approved, at);
    if (item.result) return item.result;
    if (item.listeners.size >= maxProbeWaiters) throw rejected('PROBE_BUSY');
    let onAbort: (() => void) | undefined;
    let deliver: ((value: CapacityReading) => void) | undefined;
    try {
      if (signal?.aborted) throw cancelled();
      return await new Promise<CapacityReading>((resolve, reject) => {
        deliver = resolve; item.listeners.add(deliver);
        if (signal) {
          onAbort = () => reject(cancelled()); signal.addEventListener('abort', onAbort, {once: true});
          if (signal.aborted) onAbort();
        }
      });
    } finally {
      if (onAbort && signal) signal.removeEventListener('abort', onAbort);
      if (deliver) item.listeners.delete(deliver);
      if (item.listeners.size === 0 && !item.result) item.controller.abort();
    }
  }
  return Object.freeze({
    async acquire(kind: CapacityWriteKind, signal?: AbortSignal) {
      if (kind !== 'session' && kind !== 'upload') throw new TypeError('Only new session or upload admission is supported');
      if (signal?.aborted) throw cancelled();
      const approved = current(time());
      const available = await reading(approved, lastTime, signal);
      if (signal?.aborted) throw cancelled();
      const at = time(); current(at);
      if (available.status !== 'KNOWN' || at - available.observedAt >= probeTtlMillis) throw rejected('PROBE_UNAVAILABLE');
      const budget = budgets[kind];
      if (admitted[kind] >= budget.maxAdmissions) throw rejected('WINDOW_BUDGET_EXHAUSTED');
      if (active[kind] >= budget.maxInFlight) throw rejected('IN_FLIGHT_LIMIT');
      if (CAPACITY_VOLUMES.some(v => available.freeBytes[v] < minimum[v] + safety[v] + charged[v] + budget.worstCaseBytes[v])) throw rejected('LOW_WATER');
      admitted[kind]++; active[kind]++;
      // Conservative window charge is never refunded by cancellation, unknown COMMIT, release or a fresh probe.
      // A later reading may already include the bytes: accepting that double charge avoids crediting unproven reclamation.
      for (const v of CAPACITY_VOLUMES) charged[v] += budget.worstCaseBytes[v];
      let released = false;
      return Object.freeze({release() { if (!released) { released = true; active[kind]--; } }});
    },
    close() { if (!closed) { closed = true; cache = undefined; pending?.controller.abort(); } }
  });
}
