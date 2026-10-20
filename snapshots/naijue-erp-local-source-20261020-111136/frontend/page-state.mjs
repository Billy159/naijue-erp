const clone = value => structuredClone(value);
const stale = (message = '读取范围已变化，请重新加载', code = 'STALE_SCOPE') => Object.assign(new Error(message), {stale: true, code});
const aborted = () => stale('读取已取消', 'REQUEST_CANCELLED');

/** Read-only, memory-only cache. Each consumer may cancel without cancelling a
 * shared request. Scope changes abort every old request even if the underlying
 * transport ignores AbortSignal, and late responses can never refill the cache. */
export function createScopedReadClient({request, scope}) {
  if (typeof scope !== 'function') throw new TypeError('A session/version scope is required');
  const pending = new Map(), cache = new Map();
  let owner = String(scope()), epoch = 0, disposed = false;
  function sync() {
    const next = String(scope());
    if (disposed) throw aborted();
    if (owner !== next) {
      owner = next; epoch++;
      for (const record of pending.values()) record.controller.abort();
      pending.clear(); cache.clear();
    }
    return owner;
  }
  function consume(task, expectedScope, expectedEpoch, signal) {
    if (signal?.aborted) return Promise.reject(aborted());
    return new Promise((resolve, reject) => {
      const cancel = () => reject(aborted());
      signal?.addEventListener('abort', cancel, {once: true});
      task.then(value => {
        if (signal?.aborted) throw aborted();
        if (sync() !== expectedScope || epoch !== expectedEpoch) throw stale();
        return value;
      }).then(resolve, reject).finally(() => signal?.removeEventListener('abort', cancel));
    });
  }
  function read(key, reader, {cacheMs = 0, refresh = false, signal} = {}) {
    try {
      const expectedScope = sync(), expectedEpoch = epoch;
      if (!key || typeof reader !== 'function' || !Number.isFinite(cacheMs) || cacheMs < 0) throw new TypeError('A read key, callback and valid cache lifetime are required');
      if (signal?.aborted) return Promise.reject(aborted());
      const cached = cache.get(key);
      if (!refresh && cached && cached.expires > Date.now()) return consume(Promise.resolve(cached.value), expectedScope, expectedEpoch, signal);
      if (refresh) {pending.get(key)?.controller.abort(); pending.delete(key); cache.delete(key);}
      let record = pending.get(key);
      if (!record) {
        const controller = new AbortController();
        record = {controller};
        const cancellation = new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject(aborted()), {once: true}));
        const work = Promise.resolve().then(() => {
          if (controller.signal.aborted || sync() !== expectedScope || epoch !== expectedEpoch) throw stale();
          return reader({signal: controller.signal, scope: expectedScope});
        });
        record.task = Promise.race([work, cancellation]).then(value => {
          if (controller.signal.aborted || sync() !== expectedScope || epoch !== expectedEpoch) throw stale();
          if (cacheMs) cache.set(key, {value, expires: Date.now() + cacheMs});
          return value;
        });
        pending.set(key, record);
        record.task.then(() => {if (pending.get(key) === record) pending.delete(key);}, () => {if (pending.get(key) === record) pending.delete(key);});
      }
      return consume(record.task, expectedScope, expectedEpoch, signal);
    } catch (error) {return Promise.reject(error);}
  }
  function invalidate(match = '') {
    sync();
    const matches = typeof match === 'function' ? match : key => String(key).startsWith(match);
    for (const [key, record] of pending) if (matches(key)) {record.controller.abort(); pending.delete(key);}
    for (const key of cache.keys()) if (matches(key)) cache.delete(key);
  }
  return {
    read, invalidate, scope: sync,
    query(path, body, options = {}) {
      if (typeof request !== 'function') return Promise.reject(new TypeError('Read transport not configured'));
      const {cacheMs, refresh, signal, ...transport} = options;
      return read(JSON.stringify([path, body ?? null]), control => request(path, body, {...transport, mode: 'query', signal: control.signal}), {cacheMs, refresh, signal});
    },
    dispose() {for (const record of pending.values()) record.controller.abort(); pending.clear(); cache.clear(); disposed = true;},
  };
}

/** Page drafts live in state, not DOM. Navigation keeps them within the same
 * environment/account/permission/data-version; changing that scope drops them. */
export function createScopedPageStore({scope}) {
  if (typeof scope !== 'function') throw new TypeError('A session/version scope is required');
  const handles = new Map();
  let owner = String(scope()), epoch = 0;
  function sync() {
    const next = String(scope());
    if (next === owner) return;
    owner = next; epoch++;
    for (const handle of handles.values()) handle.reset();
  }
  function page(key, initial = {}) {
    sync();
    if (handles.has(key)) return handles.get(key).public;
    const listeners = new Set();
    const fresh = () => clone(typeof initial === 'function' ? initial() : initial);
    let state = fresh();
    const emit = () => {for (const listener of listeners) listener();};
    const handle = {reset() {state = fresh(); emit();}, public: {
      getSnapshot() {sync(); return state;},
      subscribe(listener) {listeners.add(listener); return () => listeners.delete(listener);},
      capture() {sync(); return {scope: owner, epoch};},
      update(change, token) {
        sync();
        if (token && (token.scope !== owner || token.epoch !== epoch)) throw stale();
        const next = typeof change === 'function' ? change(state) : {...state, ...change};
        if (next !== state) {state = next; emit();}
        return state;
      },
      reset() {sync(); handle.reset();},
    }};
    handles.set(key, handle);
    return handle.public;
  }
  return {page, sync, clear() {epoch++; for (const handle of handles.values()) handle.reset();}, get scope() {sync(); return owner;}};
}

export function quantityText(value, unknown = '未知') {
  if (value === null || value === undefined || value === '') return unknown;
  if (typeof value === 'number' && (!Number.isFinite(value) || Number.isInteger(value) && !Number.isSafeInteger(value))) throw new TypeError('Invalid inventory quantity');
  const text = String(value);
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) throw new TypeError('Invalid inventory quantity');
  return text;
}

export function inventoryMemberKey(member) {
  const warehouse = member.warehouseId ?? member.warehouse_id ?? member.w;
  const sku = member.skuId ?? member.variant_id;
  if (typeof warehouse !== 'string' || !warehouse || typeof sku !== 'string' || !sku) throw new TypeError('Original warehouse and SKU identity are required');
  return JSON.stringify([warehouse, sku, member.unit == null ? null : String(member.unit)]);
}
