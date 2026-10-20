import assert from 'node:assert/strict';
import test from 'node:test';
import { ReadContext } from '../loading/read-scope.ts';
import { PartyClientError, type PartyClient, type PartyCommand, type PartyKind, type PartyRecord, type PartyResult, type PartySearch } from './contracts.ts';
import { createPartyWorkspace } from './controller.ts';
import { validateCandidates, validateCommand, validateDetail, validateList, validateReceipt, validateResult, validateSearch } from './response-validation.ts';

const id = '00000000-0000-4000-8000-000000000001'; const op = '00000000-0000-4000-8000-000000000002';
const original: PartyRecord = { id, code: ' 原编码旧-001 ', name: ' 原名称 ', enabled: true, version: 7, createdAt: null, updatedAt: null };
const search: PartySearch = { search: '', enabled: 'ALL', page: 1, pageSize: 20 };
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function result(kind: PartyKind, command: PartyCommand): PartyResult { return { operationId: op, kind, partyId: command.action === 'CREATE' ? id : command.id,
  version: command.action === 'CREATE' ? 1 : command.expectedVersion + 1, code: command.action === 'CREATE' ? kind === 'CUSTOMER' ? 'KH000001' : 'GYS000001' : original.code, enabled: command.action === 'EDIT' ? command.enabled : command.action !== 'DISABLE' }; }
function setup(overrides: Partial<PartyClient> = {}) {
  const calls: { method: string; kind: PartyKind; input: unknown; signal: AbortSignal }[] = []; let keyCount = 0; let access = 0;
  const client: PartyClient = {
    list: async (kind, query, signal) => { calls.push({ method: 'list', kind, input: query, signal }); return { items: query.page === 1 ? [original] : [], total: 1, page: query.page, pageSize: query.pageSize }; },
    detail: async (kind, target, signal) => { calls.push({ method: 'detail', kind, input: target, signal }); return original; },
    candidates: async (kind, query, signal) => { calls.push({ method: 'candidates', kind, input: query, signal }); return { items: [{ id, code: original.code, name: original.name }], total: 1, page: query.page, pageSize: query.pageSize }; },
    execute: async (kind, command, signal) => { calls.push({ method: 'execute', kind, input: command, signal }); return result(kind, command); },
    receipt: async () => { throw new PartyClientError('not-found', 'RECEIPT_NOT_FOUND', 'read', 404); }, ...overrides,
  };
  const context = new ReadContext({ accountId: 'TEST-OWNER', sessionRevision: '1', permissionRevision: '1' }); const scope = context.createScope('TEST-PARTIES');
  const workspace = createPartyWorkspace({ scope, client, newRequestKey: () => `TEST-KEY-${++keyCount}`, onAccessFailure: () => { access++; } });
  return { workspace, client, calls, context, scope, keys: () => keyCount, access: () => access };
}

test('independent lazy workspace constructs no reads and retains each bounded list without merging names/codes', async () => {
  const f = setup(); const customers = f.workspace.get('CUSTOMER'); const suppliers = f.workspace.get('SUPPLIER');
  assert.notEqual(customers, suppliers); assert.equal(f.calls.length, 0); assert.equal(f.workspace.get('CUSTOMER'), customers);
  await customers.queryList(search); assert.equal(suppliers.list.getSnapshot().success, null);
  await suppliers.queryList({ ...search, search: '独立' }); assert.deepEqual(f.calls.map(call => call.kind), ['CUSTOMER', 'SUPPLIER']);
  assert.equal(customers.list.getSnapshot().success?.parameters.search, ''); assert.equal(suppliers.list.getSnapshot().success?.parameters.search, '独立');
  f.workspace.dispose(); assert.equal(f.scope.active, false); assert.throws(() => f.workspace.get('CUSTOMER')); assert.equal(customers.list.getSnapshot().success, null);
});

test('per-kind unapplied filter drafts survive route leave independently of applied results and clear with identity', async () => {
  const f = setup(); const c = f.workspace.get('CUSTOMER'); const s = f.workspace.get('SUPPLIER');
  const defaults = { search: '', enabled: 'ENABLED' };
  assert.deepEqual(c.getSnapshot().filterDraft, defaults); assert.deepEqual(s.getSnapshot().filterDraft, defaults);
  await c.queryList(search); const applied = c.list.getSnapshot().success; const beforeDraft = f.calls.length;
  const draft = { search: ' 未执行客户筛选 ', enabled: 'DISABLED' as const }; c.setFilterDraft(draft); draft.search = '外部修改';
  s.setFilterDraft({ search: '独立供应商草稿', enabled: 'ALL' });
  assert.equal(f.calls.length, beforeDraft); assert.equal(c.list.getSnapshot().success, applied); assert.equal(c.canLeave(), true);
  c.suspend(); assert.equal(c.leaveRoute(), true); assert.equal(f.workspace.get('CUSTOMER'), c);
  assert.deepEqual(c.getSnapshot().filterDraft, { search: ' 未执行客户筛选 ', enabled: 'DISABLED' }); assert.ok(Object.isFrozen(c.getSnapshot().filterDraft));
  assert.deepEqual(s.getSnapshot().filterDraft, { search: '独立供应商草稿', enabled: 'ALL' });
  for (const invalid of [{ search: 'x'.repeat(201), enabled: 'ALL' }, { search: '\0', enabled: 'ALL' }, { search: '', enabled: 'invalid' }]) c.setFilterDraft(invalid as Parameters<typeof c.setFilterDraft>[0]);
  assert.deepEqual(c.getSnapshot().filterDraft, { search: ' 未执行客户筛选 ', enabled: 'DISABLED' });
  await c.queryList({ ...search, pageSize: 50 }); assert.equal(c.list.getSnapshot().success?.parameters.search, ''); assert.equal(c.getSnapshot().filterDraft.search, ' 未执行客户筛选 ');
  c.setFilterDraft({ search: '', enabled: 'ENABLED' }); const beforeReset = f.calls.length;
  assert.equal(f.calls.length, beforeReset); await c.queryList({ search: '', enabled: 'ENABLED', page: 1, pageSize: 50 });
  assert.equal(f.calls.length, beforeReset + 1); assert.deepEqual(c.getSnapshot().filterDraft, defaults); assert.equal(c.list.getSnapshot().success?.parameters.pageSize, 50);
  f.context.replaceIdentity({ accountId: 'TEST-OWNER', sessionRevision: '2', permissionRevision: '2' });
  for (const controller of [c, s]) { assert.equal(controller.getSnapshot().disposed, true); assert.deepEqual(controller.getSnapshot().filterDraft, defaults); assert.equal(controller.list.getSnapshot().success, null); controller.setFilterDraft({ search: '不得恢复', enabled: 'ALL' }); assert.deepEqual(controller.getSnapshot().filterDraft, defaults); }
  f.workspace.dispose();
});

test('create allocates no client code and generates one key only on explicit valid submit', async () => {
  const f = setup(); const c = f.workspace.get('SUPPLIER'); assert.equal(c.openCreate(), true); assert.equal(f.keys(), 0); assert.equal(await c.submit(), false);
  c.editName(' 同名原样保留 '); assert.equal(c.canLeave(), false); assert.equal(c.requestClose(), false); assert.equal(c.getSnapshot().editor?.closePrompt, true); c.keepEditing();
  assert.equal(await c.submit(), true); assert.equal(f.keys(), 1); assert.deepEqual(f.calls[0]?.input, { action: 'CREATE', requestKey: 'TEST-KEY-1', name: ' 同名原样保留 ' });
  assert.equal(c.getSnapshot().write.result?.code, 'GYS000001'); assert.equal(c.canLeave(), true); assert.equal(c.editName('改变'), undefined); assert.equal(c.getSnapshot().editor?.draftName, ' 同名原样保留 ');
  assert.equal(await c.submit(), false); assert.equal(f.calls.length, 1); assert.equal(c.requestClose(), true); assert.equal(c.getSnapshot().editor, null); f.workspace.dispose();
});

test('edit reads current target only, preserves original code/null timestamps and sends native CAS without code', async () => {
  const f = setup(); const c = f.workspace.get('CUSTOMER'); await c.queryList(search); await c.openExisting(id, 'EDIT');
  assert.equal(c.getSnapshot().editor?.record?.code, original.code); assert.equal(c.getSnapshot().editor?.record?.createdAt, null); assert.equal(await c.submit(), false);
  c.editName(' 新名称 '); assert.equal(await c.submit(), true); const command = f.calls.find(call => call.method === 'execute')?.input;
  assert.deepEqual(command, { action: 'EDIT', requestKey: 'TEST-KEY-1', id, expectedVersion: 7, name: ' 新名称 ', enabled: true });
  assert.equal(c.getSnapshot().listStale, true); assert.equal(f.calls.filter(call => call.method === 'list').length, 1); assert.equal(c.list.getSnapshot().success?.data.items[0]?.name, original.name);
  c.requestClose(); c.refreshList(); await new Promise(resolve => setImmediate(resolve)); assert.equal(f.calls.filter(call => call.method === 'list').length, 2); f.workspace.dispose();
});

test('only native disable/restore commands, enabled-state guard and default-customer rejection preserve facts', async () => {
  const f = setup({ execute: async () => { throw new PartyClientError('conflict', 'CUSTOMER_DEFAULT_IN_USE', 'rejected', 409); } });
  const c = f.workspace.get('CUSTOMER'); await c.openExisting(id, 'DISABLE'); assert.equal(await c.submit(), false);
  assert.equal(c.getSnapshot().write.phase, 'rejected'); assert.match(c.getSnapshot().notice!, /默认客户/); assert.equal(c.getSnapshot().editor?.record?.enabled, true);
  c.discardEditor(); await c.openExisting(id, 'RESTORE'); assert.equal(await c.submit(), false); assert.equal(f.keys(), 1); f.workspace.dispose();
  const s = setup({ detail: async () => ({ ...original, enabled: false }) }); const supplier = s.workspace.get('SUPPLIER'); await supplier.openExisting(id, 'RESTORE'); assert.equal(await supplier.submit(), true);
  assert.deepEqual(s.calls.at(-1)?.input, { action: 'RESTORE', requestKey: 'TEST-KEY-1', id, expectedVersion: 7 }); s.workspace.dispose();
});

test('uncertain write blocks duplicate/new/close and absent receipt never proves not committed; exact replay preserves key/CAS/name', async () => {
  const sent: PartyCommand[] = []; let recover = false;
  const f = setup({ execute: async (kind, command) => { sent.push(command); if (!recover) throw new PartyClientError('network', 'NETWORK_ERROR', 'uncertain'); return result(kind, command); } });
  const c = f.workspace.get('CUSTOMER'); await c.openExisting(id, 'EDIT'); c.editName(' 保留草稿 '); assert.equal(await c.submit(), false);
  const originalCommand = c.getSnapshot().write.command; assert.ok(Object.isFrozen(originalCommand)); assert.equal(c.getSnapshot().write.phase, 'uncertain');
  c.editName('不会改变'); assert.equal(c.getSnapshot().editor?.draftName, ' 保留草稿 '); assert.equal(c.requestClose(), false); assert.equal(c.discardEditor(), false); assert.equal(c.openCreate(), false); assert.equal(c.canLeave(), false);
  assert.equal(await c.submit(), false); assert.equal(f.keys(), 1); assert.equal(sent.length, 1);
  assert.equal(await c.checkReceipt(), false); assert.equal(c.getSnapshot().write.phase, 'uncertain'); assert.equal(c.getSnapshot().write.receipt, 'absent'); assert.match(c.getSnapshot().notice!, /不代表未提交/);
  c.suspend(); assert.equal(f.workspace.get('CUSTOMER'), c); assert.equal(c.getSnapshot().write.command, originalCommand); recover = true;
  assert.equal(await c.replayOriginal(), true); assert.equal(sent[0], sent[1]); assert.equal(f.keys(), 1); assert.equal(c.getSnapshot().write.phase, 'committed'); f.workspace.dispose();
});

test('receipt recovery validates native key/action/target/CAS and does not treat original result as current detail', async () => {
  let reads = 0; const f = setup({ execute: async () => { throw new PartyClientError('timeout', 'PARTY_TIMEOUT', 'uncertain'); }, receipt: async (kind, key) => {
    reads++; const command = f.workspace.get(kind).getSnapshot().write.command!; return { requestKey: key, action: command.action, status: 'COMMITTED', completedAt: '2026-10-20T12:00:00Z', result: result(kind, command) };
  } }); const c = f.workspace.get('CUSTOMER'); await c.openExisting(id, 'EDIT'); c.editName('新名称'); await c.submit();
  assert.equal(await c.checkReceipt(), true); assert.equal(reads, 1); assert.equal(c.getSnapshot().write.receipt, 'found'); assert.equal(c.getSnapshot().editor?.record?.name, original.name); assert.match(c.getSnapshot().notice!, /后续变更/); assert.equal(f.keys(), 1); f.workspace.dispose();
});

test('replay rejection stays uncertain because it cannot prove original uncommitted', async () => {
  let attempt = 0; const f = setup({ execute: async () => { if (++attempt === 1) throw new PartyClientError('network', 'NETWORK_ERROR', 'uncertain'); throw new PartyClientError('conflict', 'VERSION_CONFLICT', 'rejected', 409); } });
  const c = f.workspace.get('CUSTOMER'); c.openCreate(); c.editName('新增'); await c.submit(); await c.replayOriginal(); assert.equal(c.getSnapshot().write.phase, 'uncertain'); assert.equal(f.keys(), 1); f.workspace.dispose();
});

test('definitive CAS conflict retains draft, fetches current facts separately and rebases only by explicit preparation', async () => {
  let latest = false; const sent: PartyCommand[] = [];
  const f = setup({ detail: async () => latest ? { ...original, name: '他人新名称', version: 11 } : original, execute: async (kind, command) => { sent.push(command); if (!latest) throw new PartyClientError('conflict', 'VERSION_CONFLICT', 'rejected', 409); return result(kind, command); } });
  const c = f.workspace.get('CUSTOMER'); await c.openExisting(id, 'EDIT'); c.editName(' 我的名称 '); await c.submit(); latest = true; assert.equal(await c.readCurrent(), true);
  assert.equal(c.getSnapshot().editor?.draftName, ' 我的名称 '); assert.equal(c.getSnapshot().editor?.record?.version, 7); assert.equal(c.getSnapshot().editor?.current?.version, 11); assert.equal(await c.submit(), false);
  assert.equal(c.prepareCurrentVersion(), true); assert.equal(await c.submit(), true); assert.equal(f.keys(), 2); assert.deepEqual(sent[1], { action: 'EDIT', requestKey: 'TEST-KEY-2', id, expectedVersion: 11, name: ' 我的名称 ', enabled: true }); f.workspace.dispose();
});

test('duplicate clicks serialize; route suspend retains uncertain command and ignores late success', async () => {
  const pending = deferred<PartyResult>(); let writeSignal: AbortSignal | undefined;
  const f = setup({ execute: async (_kind, _command, signal) => { writeSignal = signal; return pending.promise; } }); const c = f.workspace.get('CUSTOMER'); c.openCreate(); c.editName('新增');
  const first = c.submit(); assert.equal(await c.submit(), false); const command = c.getSnapshot().write.command!; assert.equal(f.keys(), 1);
  c.suspend(); assert.equal(writeSignal?.aborted, true); assert.equal(c.getSnapshot().write.phase, 'uncertain'); pending.resolve(result('CUSTOMER', command)); assert.equal(await first, false); assert.equal(c.getSnapshot().write.phase, 'uncertain'); f.workspace.dispose();
});

test('detail close/replace cancellation discards ignored-signal results and suspended detail can retry', async () => {
  const pending = deferred<PartyRecord>(); let signal: AbortSignal | undefined; const f = setup({ detail: async (_kind, _id, current) => { signal = current; return pending.promise; } }); const c = f.workspace.get('CUSTOMER');
  const open = c.openExisting(id, 'EDIT'); c.suspend(); assert.equal(signal?.aborted, true); assert.equal(c.getSnapshot().editor?.phase, 'error'); assert.equal(c.requestClose(), true);
  pending.resolve(original); assert.equal(await open, false); assert.equal(c.getSnapshot().editor, null); f.workspace.dispose();
});

test('identity/session/permission invalidation clears both independent lists, editor, drafts and pending command; late response cannot restore', async () => {
  const pending = deferred<PartyResult>(); const f = setup({ execute: async () => pending.promise }); const c = f.workspace.get('CUSTOMER'); const s = f.workspace.get('SUPPLIER');
  await c.queryList(search); await s.queryList(search); c.openCreate(); c.editName('旧身份'); const write = c.submit(); const command = c.getSnapshot().write.command!;
  f.context.replaceIdentity({ accountId: 'TEST-OWNER', sessionRevision: '2', permissionRevision: '2' });
  for (const controller of [c, s]) { assert.equal(controller.getSnapshot().disposed, true); assert.equal(controller.getSnapshot().editor, null); assert.equal(controller.getSnapshot().write.command, null); assert.equal(controller.list.getSnapshot().success, null); }
  pending.resolve(result('CUSTOMER', command)); assert.equal(await write, false); assert.equal(c.getSnapshot().write.command, null); f.workspace.dispose();
});

test('401/403 clears shared party scope before host callback, while stale cancelled errors cannot expire a replacement identity', async () => {
  const f = setup({ list: async () => { throw new PartyClientError('forbidden', 'FORBIDDEN', 'read', 403); } }); const c = f.workspace.get('CUSTOMER'); const s = f.workspace.get('SUPPLIER'); s.openCreate(); s.editName('旧'); await c.queryList(search);
  assert.equal(f.access(), 1); assert.equal(c.getSnapshot().disposed, true); assert.equal(s.getSnapshot().editor, null);
  const pending = deferred<import('./contracts.ts').PartyPage<PartyRecord>>(); const next = setup({ list: async () => pending.promise }); const old = next.workspace.get('CUSTOMER'); const read = old.queryList(search); next.context.clear();
  pending.reject(new PartyClientError('unauthenticated', 'UNAUTHENTICATED', 'read', 401)); await read; assert.equal(next.access(), 0); f.workspace.dispose(); next.workspace.dispose();
});

test('exact total bounds page correction and latest query ignores superseded results', async () => {
  const f = setup(); const c = f.workspace.get('CUSTOMER'); await c.queryList({ ...search, page: 99 }); assert.deepEqual(f.calls.map(call => (call.input as PartySearch).page), [99, 1]); assert.equal(c.list.getSnapshot().success?.data.page, 1); f.workspace.dispose();
});

test('untrusted DTOs reject extra fields, identity/version regressions, wrong totals and malformed native receipts', () => {
  assert.throws(() => validateCommand({ action: 'CREATE', requestKey: 'x', name: 'n', code: 'KH1' } as PartyCommand));
  assert.throws(() => validateSearch({ ...search, pageSize: 200 } as unknown as PartySearch));
  assert.throws(() => validateDetail({ ...original, id: op }, id)); assert.throws(() => validateDetail({ ...original, version: 0 }, id));
  assert.equal(validateDetail(original, id).code, original.code);
  assert.throws(() => validateList({ items: [original], total: 2, page: 1, pageSize: 20 }, search));
  assert.throws(() => validateList({ items: [original], total: 1, page: 1, pageSize: 20 }, { ...search, enabled: 'DISABLED' }));
  assert.throws(() => validateCandidates({ items: [{ id, name: 'n', code: 'c', enabled: true }], total: 1, page: 1, pageSize: 20 }, { search: '', page: 1, pageSize: 20 }));
  const command: PartyCommand = { action: 'EDIT', id, expectedVersion: 7, requestKey: 'x', name: 'n', enabled: true };
  assert.throws(() => validateResult({ ...result('CUSTOMER', command), version: 7 }, 'CUSTOMER', command));
  assert.throws(() => validateReceipt({ requestKey: 'x', action: 'RESTORE', status: 'COMMITTED', completedAt: '2026-10-20T12:00:00Z', result: result('CUSTOMER', command) }, 'CUSTOMER', 'x', command));
});

test('list wrapper owns an immutable executed range during await and never adjusts with a mutated draft', async () => {
  const pending = deferred<import('./contracts.ts').PartyPage<PartyRecord>>(); const requested: PartySearch[] = [];
  const f = setup({ list: async (_kind, input) => { requested.push(input); return requested.length === 1 ? pending.promise : { items: [original], total: 1, page: input.page, pageSize: input.pageSize }; } });
  const c = f.workspace.get('CUSTOMER'); const draft = { ...search, page: 3 }; const read = c.queryList(draft);
  draft.search = 'must not run'; draft.pageSize = 100; pending.resolve({ items: [], total: 1, page: 3, pageSize: 20 }); await read;
  assert.deepEqual(requested.map(input => ({ ...input })), [{ ...search, page: 3 }, search]); f.workspace.dispose();
});

test('atomic edit owns both name and state in one key/CAS; blocked default disable preserves both fields', async () => {
  const sent: PartyCommand[] = []; const f = setup({ execute: async (_kind, command) => { sent.push(command); throw new PartyClientError('conflict', 'CUSTOMER_DEFAULT_IN_USE', 'rejected', 409); } });
  const c = f.workspace.get('CUSTOMER'); await c.openExisting(id, 'EDIT'); c.editName(' 同时改名 '); c.editEnabled(false); assert.equal(c.hasDirtyDraft, true); assert.equal(await c.submit(), false);
  assert.deepEqual(sent, [{ action: 'EDIT', requestKey: 'TEST-KEY-1', id, expectedVersion: 7, name: ' 同时改名 ', enabled: false }]);
  assert.equal(c.getSnapshot().editor?.record?.name, original.name); assert.equal(c.getSnapshot().editor?.record?.enabled, true); assert.equal(c.getSnapshot().editor?.draftName, ' 同时改名 '); assert.equal(c.getSnapshot().editor?.draftEnabled, false); assert.equal(f.keys(), 1); f.workspace.dispose();
});

test('state-only edit is dirty; uncertain atomic recovery locks both fields and replays identical state/name/key/CAS', async () => {
  let recover = false; const sent: PartyCommand[] = []; const f = setup({ execute: async (kind, command) => { sent.push(command); if (!recover) throw new PartyClientError('network', 'NETWORK_ERROR', 'uncertain'); return result(kind, command); } });
  const c = f.workspace.get('SUPPLIER'); await c.openExisting(id, 'EDIT'); c.editEnabled(false); assert.equal(c.hasDirtyDraft, true); assert.equal(c.requestClose(), false); c.keepEditing(); await c.submit();
  c.editEnabled(true); c.editName('ignored'); assert.equal(c.getSnapshot().editor?.draftEnabled, false); assert.equal(c.getSnapshot().editor?.draftName, original.name); recover = true; assert.equal(await c.replayOriginal(), true);
  assert.equal(sent.length, 2); assert.equal(sent[0], sent[1]); assert.deepEqual(sent[0], { action: 'EDIT', requestKey: 'TEST-KEY-1', id, expectedVersion: 7, name: original.name, enabled: false }); assert.equal(f.keys(), 1); f.workspace.dispose();
});

test('legitimate route leave drops clean editors and detached detail, never dirty or unresolved recovery', async () => {
  const f = setup(); const c = f.workspace.get('CUSTOMER'); await c.openExisting(id, 'EDIT'); assert.equal(c.canLeave(), true); c.suspend(); assert.equal(c.leaveRoute(), true); assert.equal(c.getSnapshot().editor, null);
  await c.openExisting(id, 'EDIT'); c.editEnabled(false); c.suspend(); assert.equal(c.leaveRoute(), false); assert.equal(c.getSnapshot().editor?.draftEnabled, false); c.discardEditor(); f.workspace.dispose();
  const pending = deferred<PartyRecord>(); const loading = setup({ detail: async () => pending.promise }); const d = loading.workspace.get('CUSTOMER'); const open = d.openExisting(id, 'EDIT'); d.suspend(); assert.equal(d.leaveRoute(), true); assert.equal(d.getSnapshot().editor, null); pending.resolve(original); assert.equal(await open, false); assert.equal(d.getSnapshot().editor, null); loading.workspace.dispose();
  const uncertain = setup({ execute: async () => { throw new PartyClientError('network', 'NETWORK_ERROR', 'uncertain'); } }); const u = uncertain.workspace.get('CUSTOMER'); u.openCreate(); u.editName('必须保留'); await u.submit(); const command = u.getSnapshot().write.command; u.suspend(); assert.equal(u.leaveRoute(), false); assert.equal(u.getSnapshot().write.command, command); assert.equal(u.getSnapshot().editor?.draftName, '必须保留'); uncertain.workspace.dispose();
});
