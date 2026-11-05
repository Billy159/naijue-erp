/** TEST ONLY. No PG/client/pool/issuer construction, SQL or clock injection.
 * The host's optional fixed-brand tap observes ONLY its captured runtime fence.
 * These numbers need separately bound real-host evidence; pure mocks are not PG
 * performance proof. Client.query wall is not server execution/EXPLAIN loops.
 */
import { createHash } from 'node:crypto';
import { hrtime } from 'node:process';
import { captureData } from '../../../../integration/runtime26-baseline/schema-objects-only/lifecycle.mjs';

const now = hrtime.bigint; // Real monotonic clock; deliberately no injectable clock.
const states = new WeakMap();
const LIMITS = Object.freeze({ queries: 512, sampleBytes: 4 * 1024 * 1024, sqlBytes: 128 * 1024,
  bindingBytes: 128 * 1024, parameters: 64, arrayItems: 20000, depth: 4, sourceLiterals: 32 });
const need = (ok, code) => { if (!ok) throw Object.assign(new Error(code), { code }); };
const sha = text => createHash('sha256').update(text).digest('hex');
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const credential = /\b(?:PASSWORD|PASSWD|SCRAM-SHA-256|CONNECTION\s+STRING|SSLKEY|SSLCERT)\b/i;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const numeric = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
const date = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2}))?$/;
const stateOf = value => { need(states.has(value), 'ORIGINAL_CURRENT_RUNTIME_QUERY_METRICS_REQUIRED'); return states.get(value); };
const invalid = (s, code) => { if (!s.reasons.includes(code)) s.reasons.push(code); };
function arrayData(value, limit) {
  need(Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype
    && value.length <= limit && Reflect.ownKeys(value).length === value.length + 1, 'BOUNDED_DENSE_DATA_ARRAY_REQUIRED');
  const values = [];
  for (let i = 0; i < value.length; i++) {
    const d = Object.getOwnPropertyDescriptor(value, String(i));
    need(d && d.enumerable && Object.hasOwn(d, 'value'), 'NO_BINDING_ACCESSORS_OR_HOLES'); values.push(d.value);
  }
  return values;
}
function safeValue(value, literals, budget, depth = 0) {
  need(depth <= LIMITS.depth, 'BINDING_DEPTH_LIMIT');
  need(--budget.items >= 0, 'TOTAL_BINDING_ITEM_LIMIT');
  const charge = bytes => { budget.bytes -= bytes; need(budget.bytes >= 0, 'BINDING_BYTE_LIMIT'); };
  if (value === null || typeof value === 'boolean') { charge(5); return value; }
  if (typeof value === 'number') { need(Number.isFinite(value) && Number.isSafeInteger(value) && !Object.is(value, -0), 'SAFE_INTEGER_BINDING_REQUIRED'); charge(24); return value; }
  if (typeof value === 'string') {
    need(value.length <= 8192 && value.isWellFormed()
      && (uuid.test(value) || numeric.test(value) || date.test(value) || literals.has(value)), 'UNREVIEWED_TEXT_BINDING');
    charge(Buffer.byteLength(JSON.stringify(value))); return value;
  }
  // No objects, Date/Buffer/toPostgres hooks, accessors, clients, pools or results.
  need(Array.isArray(value), 'UNSAFE_BINDING_OBJECT');
  need(value.length <= LIMITS.arrayItems, 'TOTAL_BINDING_ITEM_LIMIT'); charge(2 + value.length);
  return arrayData(value, LIMITS.arrayItems).map(v => safeValue(v, literals, budget, depth + 1));
}
function packet(config, literals) {
  const q = captureData(config, ['text', 'values', 'query_timeout']);
  need(typeof q.text === 'string' && q.text.isWellFormed() && q.text.length <= LIMITS.sqlBytes
    && Buffer.byteLength(q.text) <= LIMITS.sqlBytes && !credential.test(q.text), 'UNSAFE_OR_OVERSIZE_SQL');
  const budget = { bytes: LIMITS.bindingBytes, items: LIMITS.arrayItems };
  const values = q.values === undefined ? [] : arrayData(q.values, LIMITS.parameters).map(v => safeValue(v, literals, budget));
  const bytes = Buffer.byteLength(JSON.stringify(values)); need(bytes <= LIMITS.bindingBytes, 'BINDING_BYTE_LIMIT');
  return { sql: q.text, sqlSha256: sha(q.text), bindings: values, valuesWereUndefined: q.values === undefined,
    kind: /^SET statement_timeout='[1-9][0-9]{0,4}ms'$/.test(q.text) ? 'HOST_TIMEOUT_SET'
      : /^(?:BEGIN\b|COMMIT$|ROLLBACK$)/i.test(q.text) ? 'TRANSACTION_CONTROL' : 'RUNTIME_SQL' };
}
function finish(state, s, started) {
  if (s.inFlight) { invalid(s, 'QUERY_OUTLIVED_SERVICE_WINDOW'); state.windowBoundaryLost = true; }
  if (s.observed === 0) invalid(s, 'NO_CAPTURED_RUNTIME_QUERY_IN_WINDOW');
  const serviceWallNs = (now() - started).toString();
  const report = { format: 'TEST_ONLY_CURRENT_RUNTIME_QUERY_METRICS_V1',
    status: s.reasons.length ? 'INVALID_SAMPLE' : 'VALID_SAMPLE',
    authority: 'NONE', independentlyProvesPgExecution: false,
    scope: 'CAPTURED_RUNTIME_TEST_METRICS_NOT_ENGINE_ISSUER_OR_PERFORMANCE_APPROVAL',
    label: s.label, clock: 'process.hrtime.bigint', serviceWallNs,
    sumCapturedQueryWallNs: s.totalNs.toString(),
    queryCount: s.reasons.length ? null : s.observed,
    observedCapturedQueryCalls: s.observed, recordedEvents: s.events.length,
    unrecordedEvents: s.observed - s.events.length, reasons: [...s.reasons], events: s.events.map(e => ({ ...e })),
    limits: { ...LIMITS },
    meaning: 'Service wall includes original service/lease/guards. Query wall surrounds captured runtime fenced Client.query promise only; includes network/client wait and timeout/transaction SQL, excludes admin/setup queries. Neither count is server-plan loops or request count.',
    instrumentation: 'Service wall also includes optional collector overhead and original test-host checks; it is not automatically full HTTP/API latency. Query wall excludes safe-packet preparation, not network/driver/scheduler time.',
    timingProof: 'Requires independent real-host/source/target/sample evidence; offline mocks prove protocol only.' };
  state.active = null; state.completed = freeze(report);
}

/** Explicit source literals are for already-reviewed constant strings only,
 * never credentials/user text. Everything else is UUID/numeric/date/bool/null or
 * a bounded array thereof. Unrepresentable input invalidates, never redacts a
 * sample into PASS or changes the SQL sent to PG. Only one sample is retained. */
export function createCurrentRuntimeQueryMetrics(input = { safeSourceTextValues: [] }) {
  const args = captureData(input, ['safeSourceTextValues']);
  const texts = arrayData(args.safeSourceTextValues, LIMITS.sourceLiterals);
  need(texts.every(v => typeof v === 'string' && v.length > 0 && v.length <= 2048 && v.isWellFormed()
    && !/[\u0000-\u001f]/.test(v) && !/password|passwd|scram|secret|token|credential|connection/i.test(v)), 'REVIEWED_NONCREDENTIAL_SOURCE_LITERALS_ONLY');
  need(new Set(texts).size === texts.length, 'UNIQUE_SOURCE_LITERALS_REQUIRED');
  const state = { active: null, completed: null, windowBoundaryLost: false, literals: new Set(texts) };
  const controller = Object.freeze({
    async sampleService(label, work) {
      if (state.active) { invalid(state.active, 'CONCURRENT_SERVICE_WINDOWS'); throw Object.assign(new Error('CONCURRENT_SERVICE_WINDOWS'), { code: 'CONCURRENT_SERVICE_WINDOWS' }); }
      need(state.completed === null, 'TAKE_PREVIOUS_SAMPLE_BEFORE_NEXT_WINDOW');
      need(!state.windowBoundaryLost, 'METRICS_WINDOW_BOUNDARY_LOST_NEW_CONTROLLER_REQUIRED');
      need(typeof label === 'string' && /^[a-z0-9][a-z0-9:_-]{0,63}$/.test(label) && typeof work === 'function', 'FIXED_SAMPLE_LABEL_AND_ORIGINAL_SERVICE_CALLBACK_REQUIRED');
      const s = { label, reasons: [], events: [], observed: 0, bytes: 4096, totalNs: 0n, inFlight: 0 };
      state.active = s; const started = now(); let failed = false, originalError;
      try { await work(); } catch (error) { failed = true; originalError = error; invalid(s, 'ORIGINAL_SERVICE_ERROR'); }
      try { finish(state, s, started); }
      catch {
        // Secondary collector failure must NEVER replace service/cancellation/
        // unknown-COMMIT errors or turn a damaged measurement into PASS.
        state.active = null; state.windowBoundaryLost = true;
        state.completed = { format: 'TEST_ONLY_CURRENT_RUNTIME_QUERY_METRICS_V1', status: 'INVALID_SAMPLE',
          authority: 'NONE', independentlyProvesPgExecution: false, label,
          serviceWallNs: null, sumCapturedQueryWallNs: null, queryCount: null,
          reasons: ['COLLECTION_FINALIZATION_FAILED'], events: [],
          observedCapturedQueryCalls: s.observed, unrecordedEvents: s.observed, recordedEvents: 0 };
      }
      if (failed) throw originalError;
      // No service result/client/issuer is retained or returned by the sampler.
    },
    takeSample() { need(state.active === null && state.completed !== null, 'ONE_COMPLETED_SAMPLE_REQUIRED'); const value = state.completed; state.completed = null; return value; },
  });
  states.set(controller, state); return controller;
}
export function assertCurrentRuntimeQueryMetrics(value) { stateOf(value); return value; }

/** Fixed host tap, NOT a client/pool/lease or alternative SQL entry point. Host
 * supplies a transient call to its ORIGINAL physical fence; this function never
 * retains that closure in the controller/report. No await before physical send.
 * The original fence remains the final synchronous quarantine check. */
export function observeCapturedRuntimeQuery(metrics, config, send) {
  const state = stateOf(metrics), s = state.active;
  if (!s) return send();
  s.observed++;
  let data, event = null;
  try { data = packet(config, state.literals); }
  catch { invalid(s, 'COLLECTION_INPUT_REJECTED'); }
  if (s.observed > LIMITS.queries) invalid(s, 'QUERY_COUNT_LIMIT');
  else {
    const candidate = { index: s.observed, ...(data ?? { sql: null, sqlSha256: null, bindings: null, kind: 'UNSAFE_INPUT_NOT_LOGGED' }),
      status: 'PENDING', capturedQueryWallNs: null, errorCode: null };
    try {
      const bytes = Buffer.byteLength(JSON.stringify(candidate)) + 256; // Reserve settled status/duration/error-code JSON.
      if (s.bytes + bytes > LIMITS.sampleBytes) invalid(s, 'SAMPLE_BYTE_LIMIT');
      else { s.bytes += bytes; s.events.push(candidate); event = candidate; }
    } catch { invalid(s, 'COLLECTION_RECORDING_FAILED'); }
  }
  if (s.inFlight) {
    invalid(s, 'CONCURRENT_CAPTURED_QUERIES');
    state.windowBoundaryLost = true;
    if (event) event.status = 'UNTRACKED_CONCURRENT';
    // Do not serialize/retry/cancel the original concurrent query or retain
    // unbounded pending collectors. Such a sample cannot claim valid latency.
    return send();
  }
  const started = now(); s.inFlight++;
  const settle = (status, error) => {
    const duration = now() - started; s.inFlight--; s.totalNs += duration;
    if (event) { event.status = status; event.capturedQueryWallNs = duration.toString();
      try { const d = error && typeof error === 'object' ? Object.getOwnPropertyDescriptor(error, 'code') : null;
        event.errorCode = d && Object.hasOwn(d, 'value') && typeof d.value === 'string' && /^[A-Z0-9_]{1,64}$/.test(d.value) ? d.value : null;
      } catch { invalid(s, 'COLLECTION_ERROR_CODE_REJECTED'); } }
    if (status !== 'FULFILLED') invalid(s, status === 'SYNC_THROW_UNCONFIRMED_SEND' ? 'SYNCHRONOUS_SEND_ERROR' : 'ORIGINAL_QUERY_ERROR');
  };
  const safeSettle = (status, error) => {
    try { settle(status, error); }
    catch { invalid(s, 'COLLECTION_SETTLEMENT_FAILED'); state.windowBoundaryLost = true; }
  };
  let result;
  try { result = send(); }
  catch (error) { safeSettle('SYNC_THROW_UNCONFIRMED_SEND', error); throw error; }
  if (!(result instanceof Promise)) { invalid(s, 'NONPROMISE_QUERY_RESULT'); safeSettle('UNCONFIRMED_NONPROMISE_SEND'); return result; }
  // Side observer only: preserve the ORIGINAL Promise identity/cancellation
  // surface and original await/error scheduling, not an extra chained query.
  void result.then(() => { safeSettle('FULFILLED'); }, error => { safeSettle('REJECTED', error); });
  return result;
}
