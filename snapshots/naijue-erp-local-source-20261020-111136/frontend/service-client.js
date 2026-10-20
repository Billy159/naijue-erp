/* Same-origin transport. Business rules and authorization belong to the server. */
(function (root) {
  'use strict';
  class ServiceError extends Error {
    constructor(message, details = {}) { super(message); this.name = 'ServiceError'; Object.assign(this, details); }
  }
  const aliases = { UNAUTHENTICATED: 'AUTH', SESSION_EXPIRED: 'AUTH', FORBIDDEN: 'SCOPE', VERSION_CONFLICT: 'REVISION', IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY', RESULT_UNKNOWN: 'PENDING_VERIFICATION' };
  function errorResult(error) { return { ok: false, error: error.message || '操作未完成', code: error.code || 'VALIDATION', requestId: error.requestId, operationId: error.operationId, latest: error.latest }; }
  function createClient(options = {}) {
    const fetcher = options.fetcher || ((...args) => root.fetch(...args));
    const actor = options.actor || (() => root.MASTER_DATA?.current()?.id || '');
    let settings = options, active = 0, csrfToken = null, identityGeneration = 0;
    const listeners = new Set();
    const records = new Map();
    const storage = options.storage === undefined ? (() => { try { return root.sessionStorage; } catch { return null; } })() : options.storage;
    const scope = () => settings.stateScope || '';
    const keyFor = (id, binding = scope()) => binding ? 'erp-api-requests-v2:' + encodeURIComponent(binding) + ':' + encodeURIComponent(id) : 'erp-api-requests-v1:' + encodeURIComponent(id);
    const historyKey = (id, binding) => keyFor(id, binding) + ':results';
    function pendingFor(id, binding = scope()) {
      const key = keyFor(id, binding);
      if (!records.has(key)) {
        let rows = [];
        try { rows = JSON.parse(storage?.getItem(key) || '[]'); } catch { /* pending work remains in memory */ }
        records.set(key, new Map((Array.isArray(rows) ? rows : []).filter(x => x.actorId === id && (!binding || x.stateScope === binding) && x.requestId && x.operationId).map(x => [x.requestId, x.phase === 'SUBMITTING' ? {...x,phase:'PENDING_VERIFICATION'} : x])));
      }
      return records.get(key);
    }
    function notify() { for (const fn of listeners) { try { fn(); } catch { /* observers cannot change a request result */ } } }
    function persist(id, binding = scope(), required = false) {
      try { if (!storage) throw Error('unavailable'); storage.setItem(keyFor(id, binding), JSON.stringify([...pendingFor(id, binding).values()])); }
      catch { if (required) throw new ServiceError('无法持久保存原请求 ID，本次尚未提交；请恢复浏览器存储后重试', {code:'STORAGE'}); }
      notify();
    }
    function track(row, required = false) {
      const binding = row.stateScope ?? scope(), pending = pendingFor(row.actorId, binding), before = pending.get(row.requestId);
      const safe = {actorId:row.actorId, stateScope:binding, requestId:row.requestId, operationId:row.operationId, objectId:row.objectId || '',
        documentId:row.documentId, phase:row.phase, resolution:row.resolution, committedVersion:row.committedVersion};
      pending.set(row.requestId, safe);
      try { persist(row.actorId, binding, required); } catch (error) { if (before) pending.set(row.requestId,before); else pending.delete(row.requestId); throw error; }
    }
    function historyFor(id = actor(), binding = scope()) {
      try { const rows = JSON.parse(storage?.getItem(historyKey(id,binding)) || '[]'); return Array.isArray(rows) ? rows.filter(row => row.actorId === id && row.stateScope === binding) : []; } catch { return []; }
    }
    function settle(row, resolution, code) {
      // Receipts contain transport evidence only, never business inputs or response bodies.
      const receipt = {actorId:row.actorId, stateScope:row.stateScope || '', requestId:row.requestId, operationId:row.operationId,
        documentId:row.documentId, committedVersion:row.committedVersion, resolution, code, completedAt:new Date().toISOString()};
      try { storage?.setItem(historyKey(row.actorId,row.stateScope || ''),JSON.stringify([receipt,...historyFor(row.actorId,row.stateScope || '').filter(x=>x.requestId!==row.requestId)].slice(0,100))); } catch { /* do not erase the durable pending ID on receipt failure */ return; }
      pendingFor(row.actorId,row.stateScope || '').delete(row.requestId); persist(row.actorId,row.stateScope || '');
    }
    function complete(requestId, actorId = actor()) { const row = pendingFor(actorId).get(requestId); if (row) settle(row,'COMMITTED'); }
    function operationFor(path, body) {
      if (path === '/preferences') return 'preferences.save';
      if (path.startsWith('/runtime/command')) return (body.documentType === 'TRANSFER' ? 'transfers.' : 'sales.') + ({delete: 'void'}[body.operation] || body.operation);
      if (path.startsWith('/runtime/employees')) return 'employees.save';
      if (path.startsWith('/runtime/specs/ensure')) return 'specs.ensureForTransaction';
      if (path.startsWith('/runtime/product-profile')) return 'products.save';
      if (path.startsWith('/runtime/product-delete')) return 'products.delete';
      if (path.startsWith('/runtime/product-master')) return 'productMasters.save';
      if (path.startsWith('/runtime/masters')) return 'masters.save';
      return 'work.command';
    }
    async function request(path, body, opts = {}) {
      // Callers supply an API-relative path; user URL parameters cannot select a service.
      if (typeof path !== 'string' || !/^\/(?!\/)/.test(path) || path.includes('\\') || path.split(/[?#]/)[0].split('/').some(s => { try { return decodeURIComponent(s) === '..'; } catch { return true; } })) throw new ServiceError('服务地址无效', { code: 'VALIDATION' });
      const url = '/api' + path;
      // Credential changes must never enter the business request journal or browser storage.
      const credentialChange = path === '/runtime/password/change';
      const authentication = /^\/runtime\/(session|logout)(?:\?|$)/.test(path) || credentialChange;
      const query = opts.mode === 'query' || body === undefined || body?.checkOnly || path.startsWith('/runtime/work') && ['logs', 'snapshot', 'work-result'].includes(body?.type);
      const mutation = !query && !authentication;
      const actorId = actor(), stateScope = scope(), generation = identityGeneration;
      const staleIdentity = () => actorId !== actor() || stateScope !== scope() || generation !== identityGeneration;
      const requestId = mutation ? body?.requestKey || body?.requestId || opts.requestId || root.crypto.randomUUID() : undefined;
      const operationId = mutation ? opts.operationId || operationFor(path, body) : undefined;
      const objectId = opts.objectId || body?.viewId || body?.documentId || body?.productId || body?.id || body?.record?.id || body?.docId || '';
      const previous = mutation && [...pendingFor(actorId).values()].find(x => x.operationId === operationId && x.objectId === objectId);
      if (previous) throw new ServiceError('原请求结果待核实，请先查询原请求', { code: 'PENDING_VERIFICATION', requestId: previous.requestId, operationId });
      const payload = mutation ? { ...body, requestKey: requestId } : body;
      const row = mutation ? { requestId, operationId, actorId, stateScope, objectId, documentId: body?.documentId, phase: 'SUBMITTING' } : null;
      if (mutation && root.REAL_DATA_MODE && (!actorId || !stateScope)) throw new ServiceError('请先登录并取得环境身份', {code:'AUTH'});
      if (row) track(row, true);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? settings.timeoutMs ?? 30000);
      active++; notify();
      let sent = false;
      try {
        if (root.navigator?.onLine === false) throw new ServiceError('连接已断开，输入已保留；本次尚未提交', { code: 'CONNECTION' });
        sent = true;
        const response = await fetcher(url, { credentials: 'same-origin', signal: controller.signal, ...(payload !== undefined ? { method: 'POST', headers: { 'Content-Type': 'application/json', ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}), ...(requestId ? { 'X-Request-ID': requestId } : {}) }, body: JSON.stringify(payload) } : {}) });
        let value;
        try { value = await response.json(); } catch { throw new ServiceError('服务响应无法读取', { code: response.status === 401 ? 'AUTH' : mutation || credentialChange && response.ok ? 'PENDING_VERIFICATION' : 'PROTOCOL', status: response.status }); }
        if (!authentication && staleIdentity()) throw new ServiceError('登录身份已变化，输入已保留，请重新核对', { code: 'AUTH', stale: true });
        if (!response.ok || value?.ok !== true) {
          const detail = value?.error && typeof value.error === 'object' ? value.error : value || {};
          const rawCode = detail.code || value?.code || (typeof value?.error === 'string' ? /VERSION/.test(value.error) ? 'REVISION' : /SETTLEMENT/.test(value.error) ? 'FUNDS' : undefined : undefined);
          let code = response.status === 401 ? 'AUTH' : aliases[rawCode] || rawCode || (response.status === 403 ? 'SCOPE' : response.status === 409 ? 'REVISION' : response.status >= 500 ? mutation ? 'PENDING_VERIFICATION' : 'CONNECTION' : 'VALIDATION');
          if (mutation && response.status >= 500 && code !== 'ROLLED_BACK') code = 'PENDING_VERIFICATION';
          throw new ServiceError(detail.message || (typeof value?.error === 'string' ? value.error : '服务操作未完成'), { code, status: response.status, latest: detail.latest || value?.latest, requestId, operationId });
        }
        if (/^\/runtime\/session(?:\?|$)/.test(path)) {csrfToken = typeof value.data?.csrfToken === 'string' ? value.data.csrfToken : null; if (value.data?.stateScope) settings = {...settings,stateScope:value.data.stateScope};}
        if (/^\/runtime\/logout(?:\?|$)/.test(path)) csrfToken = null;
        if (credentialChange) csrfToken = null;
        if (row) {
          const receipt = {...row, resolution:'COMMITTED', committedVersion:value.data?.document?.version ?? value.data?.version, documentId:value.data?.document?.id || row.documentId};
          if (opts.readback) track({ ...receipt, phase: 'READBACK_PENDING' });
          else settle(receipt,'COMMITTED');
        }
        return value.data;
      } catch (cause) {
        // Parsing and connection failures still belong to the identity that sent the request.
        const error = !authentication && staleIdentity()
          ? new ServiceError('登录身份已变化，输入已保留，请重新核对', { code: 'AUTH', stale: true, status: cause?.status })
          : cause instanceof ServiceError ? cause : new ServiceError(mutation && sent ? '提交结果待核实，输入已保留；请按原请求查询' : '连接暂时中断，输入已保留', { code: mutation && sent ? 'PENDING_VERIFICATION' : 'CONNECTION' });
        error.requestId ??= requestId; error.operationId ??= operationId;
        if (row) {
          if (error.code === 'PENDING_VERIFICATION' || sent && error.code === 'AUTH') track({ ...row, phase: 'PENDING_VERIFICATION' });
          else settle(row, error.code === 'ROLLED_BACK' ? 'ROLLED_BACK' : !sent ? 'NOT_SENT' : 'REJECTED', error.code);
        }
        if (error.code === 'AUTH' && !error.stale) { csrfToken = null; if (opts.expire !== false) settings.onAuthExpired?.(error.message); }
        throw error;
      } finally { clearTimeout(timeout); active--; notify(); }
    }
    async function result(requestId, operationId) {
      const owner = actor(), row = pendingFor(owner).get(requestId);
      if (!owner || !row || operationId && operationId !== row.operationId) throw new ServiceError('当前账号没有可查询的原请求', { code: 'SCOPE' });
      const value = await request('/requests/result?' + new URLSearchParams({ requestKey: requestId, operationId: row.operationId }), undefined, { mode: 'query' });
      if (value?.requestKey !== requestId || value?.operationId !== row.operationId || !['COMMITTED', 'ROLLED_BACK', 'PENDING_VERIFICATION', 'NOT_FOUND'].includes(value?.resolution)) throw new ServiceError('原请求回读不匹配，请稍后核实', { code: 'PROTOCOL', requestId, operationId: row.operationId });
      if (value.resolution === 'ROLLED_BACK') settle(row,'ROLLED_BACK');
      else if (value.resolution === 'COMMITTED') track({ ...row, phase: 'READBACK_PENDING', resolution:'COMMITTED', committedVersion:value.committedVersion ?? value.originalResponse?.document?.version ?? value.originalResponse?.version, documentId: value.documentId || row.documentId });
      return value;
    }
    return { request, result, complete, track, errorResult, ServiceError, configure: opts => { if(Object.hasOwn(opts,'stateScope'))identityGeneration++; settings = { ...settings, ...opts }; notify(); }, pending: () => actor() ? [...pendingFor(actor()).values()] : [], history: () => actor() ? historyFor() : [], get stateScope() {return scope();}, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); }, get busy() { return active > 0; } };
  }
  root.ERP_API = Object.assign(createClient(), { createClient, ServiceError, errorResult });
})(globalThis);
