import assert from 'node:assert/strict';
import test from 'node:test';
import { ReadContext } from '../loading/read-scope.ts';
import { createPartyWorkspace } from './controller.ts';
import { PartyClientError, type PartyClient, type PartyCommand, type PartyKind, type PartyReceipt, type PartyRecord, type PartyResult } from './contracts.ts';

const id = '00000000-0000-4000-8000-000000000101';
const operationId = '00000000-0000-4000-8000-000000000102';
const record: PartyRecord = { id, code: 'SYNTHETIC-ORIGINAL-CODE', name: ' 原名称 ', enabled: true, version: 7, createdAt: null, updatedAt: null };
const range = { search: '', enabled: 'ALL' as const, page: 1, pageSize: 20 as const };
const denied = (kind: 'forbidden' | 'unauthenticated', outcome: 'read' | 'rejected' | 'uncertain' = 'read') =>
  new PartyClientError(kind, kind === 'forbidden' ? 'FORBIDDEN' : 'UNAUTHENTICATED', outcome, kind === 'forbidden' ? 403 : 401);
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function committed(kind: PartyKind, command: PartyCommand): PartyResult {
  assert.notEqual(command.action, 'CREATE');
  return { operationId, kind, partyId: command.action === 'CREATE' ? id : command.id, version: command.action === 'CREATE' ? 1 : command.expectedVersion + 1, code: record.code, enabled: command.action === 'EDIT' ? command.enabled : command.action !== 'DISABLE' };
}
function receipt(kind: PartyKind, command: PartyCommand): PartyReceipt { return { requestKey: command.requestKey, action: command.action, status: 'COMMITTED', completedAt: '2026-10-20T12:00:00Z', result: committed(kind, command) }; }
function fixture(overrides: Partial<PartyClient> = {}) {
  let keys = 0; let access = 0;
  const sent: PartyCommand[] = [];
  const context = new ReadContext({ accountId: 'SYNTHETIC-OWNER', sessionRevision: '1', permissionRevision: '1' });
  const scope = context.createScope('SYNTHETIC-PARTY-RECOVERY');
  const client: PartyClient = {
    list: async (_kind, query) => ({ items: [record], total: 1, page: query.page, pageSize: query.pageSize }),
    detail: async () => record,
    candidates: async (_kind, query) => ({ items: [], total: 0, page: query.page, pageSize: query.pageSize }),
    execute: async () => { throw new PartyClientError('network', 'NETWORK_ERROR', 'uncertain'); },
    receipt: async () => { throw denied('forbidden'); },
    ...overrides,
  };
  const execute = client.execute;
  client.execute = async (kind, command, signal) => { sent.push(command); return execute(kind, command, signal); };
  const workspace = createPartyWorkspace({ scope, client, newRequestKey: () => `SYNTHETIC-RECOVERY-KEY-${++keys}`, onAccessFailure: () => {
    // Current authentication invalidation must clear both kinds before the host bridge.
    access++; assert.equal(scope.active, false);
  } });
  return { context, scope, workspace, sent, keys: () => keys, access: () => access };
}
async function prepare(f: ReturnType<typeof fixture>, kind: PartyKind = 'CUSTOMER') {
  const controller = f.workspace.get(kind); await controller.openExisting(id, 'EDIT');
  controller.editName(' 原样保留的名称 '); controller.editEnabled(false);
  return controller;
}

for (const kind of ['CUSTOMER', 'SUPPLIER'] as const) test(`${kind} receipt403 preserves exact unresolved atomic command and explicit receipt recovery`, async () => {
  let readable = false; let receiptCalls = 0;
  const f = fixture({ receipt: async (currentKind, key) => {
    receiptCalls++; if (!readable) throw denied('forbidden');
    const command = f.sent[0]!; assert.equal(key, command.requestKey); return receipt(currentKind, command);
  } });
  try {
    const controller = await prepare(f, kind); await controller.submit(); const command = controller.getSnapshot().write.command!; const editor = controller.getSnapshot().editor;
    assert.ok(Object.isFrozen(command)); assert.deepEqual(command, { action: 'EDIT', requestKey: 'SYNTHETIC-RECOVERY-KEY-1', id, expectedVersion: 7, name: ' 原样保留的名称 ', enabled: false });
    assert.equal(await controller.checkReceipt(), false);
    assert.equal(f.scope.active, true); assert.equal(f.access(), 0); assert.equal(controller.getSnapshot().disposed, false);
    assert.equal(controller.getSnapshot().write.phase, 'uncertain'); assert.equal(controller.getSnapshot().write.command, command); assert.equal(controller.getSnapshot().write.result, null);
    assert.equal(controller.getSnapshot().write.receipt, 'failed'); assert.equal(controller.getSnapshot().write.error?.kind, 'forbidden'); assert.equal(controller.getSnapshot().editor, editor);
    controller.editName('不得替换'); controller.editEnabled(true);
    assert.equal(controller.requestClose(), false); assert.equal(controller.discardEditor(), false); assert.equal(controller.openCreate(), false); assert.equal(controller.canLeave(), false);
    assert.equal(await controller.submit(), false); assert.equal(controller.getSnapshot().editor, editor); assert.equal(f.sent.length, 1); assert.equal(f.keys(), 1); assert.equal(receiptCalls, 1);
    controller.suspend(); assert.equal(controller.getSnapshot().write.command, command); readable = true;
    assert.equal(await controller.checkReceipt(), true); assert.equal(controller.getSnapshot().write.phase, 'committed'); assert.equal(controller.getSnapshot().write.receipt, 'found');
    assert.equal(controller.getSnapshot().write.command, command); assert.equal(controller.getSnapshot().editor?.record?.version, 7); assert.equal(f.sent.length, 1); assert.equal(f.keys(), 1);
  } finally { f.workspace.dispose(); }
});

test('replay403 rejection cannot establish rollback and later explicit replay uses identical object/key/CAS/payload', async () => {
  let attempts = 0;
  const f = fixture({ execute: async (kind, command) => {
    if (++attempts === 1) throw new PartyClientError('network', 'NETWORK_ERROR', 'uncertain');
    if (attempts === 2) throw denied('forbidden', 'rejected');
    return committed(kind, command);
  } });
  try {
    const controller = await prepare(f); await controller.submit(); const command = controller.getSnapshot().write.command;
    assert.equal(await controller.replayOriginal(), false); assert.equal(f.scope.active, true); assert.equal(f.access(), 0);
    assert.equal(controller.getSnapshot().write.phase, 'uncertain'); assert.equal(controller.getSnapshot().write.result, null); assert.equal(controller.getSnapshot().write.command, command);
    assert.equal(f.sent.length, 2); assert.equal(f.sent[0], f.sent[1]); assert.equal(f.keys(), 1);
    assert.equal(await controller.replayOriginal(), true); assert.equal(f.sent.length, 3); assert.equal(f.sent[2], command); assert.equal(f.keys(), 1); assert.equal(controller.getSnapshot().write.phase, 'committed');
  } finally { f.workspace.dispose(); }
});

for (const phase of ['submitting', 'uncertain'] as const) test(`sibling403 read does not discard another kind's ${phase} command`, async () => {
  const pending = deferred<PartyResult>();
  const f = fixture({ execute: async () => pending.promise, list: async () => { throw denied('forbidden'); } });
  try {
    const controller = await prepare(f); const submitting = controller.submit(); const command = controller.getSnapshot().write.command!;
    if (phase === 'uncertain') { pending.reject(new PartyClientError('network', 'NETWORK_ERROR', 'uncertain')); await submitting; }
    const sibling = f.workspace.get('SUPPLIER'); await sibling.queryList(range);
    assert.equal(f.scope.active, true); assert.equal(f.access(), 0); assert.equal(sibling.getSnapshot().disposed, false); assert.equal(sibling.list.getSnapshot().phase, 'error');
    assert.equal(controller.getSnapshot().write.phase, phase); assert.equal(controller.getSnapshot().write.command, command); assert.equal(controller.canLeave(), false); assert.equal(f.sent.length, 1); assert.equal(f.keys(), 1);
    if (phase === 'submitting') { controller.suspend(); pending.resolve(committed('CUSTOMER', command)); assert.equal(await submitting, false); assert.equal(controller.getSnapshot().write.phase, 'uncertain'); }
  } finally { f.workspace.dispose(); }
});

test('a definitively rejected fresh sibling403 cannot discard the other kind\'s uncertain command', async () => {
  const f = fixture({ execute: async kind => { if (kind === 'SUPPLIER') throw denied('forbidden', 'rejected'); throw new PartyClientError('network', 'NETWORK_ERROR', 'uncertain'); } });
  try {
    const controller = await prepare(f); await controller.submit(); const command = controller.getSnapshot().write.command;
    const sibling = await prepare(f, 'SUPPLIER'); await sibling.submit();
    assert.equal(f.scope.active, true); assert.equal(f.access(), 0); assert.equal(controller.getSnapshot().write.phase, 'uncertain'); assert.equal(controller.getSnapshot().write.command, command);
    assert.equal(sibling.getSnapshot().write.phase, 'rejected'); assert.equal(f.sent.length, 2); assert.equal(f.keys(), 2);
  } finally { f.workspace.dispose(); }
});

for (const action of ['receipt', 'replay', 'sibling'] as const) test(`current401 during ${action} still invalidates both party stores and host session`, async () => {
  let attempts = 0;
  const f = fixture({ execute: async () => { if (++attempts > 1) throw denied('unauthenticated', 'rejected'); throw new PartyClientError('network', 'NETWORK_ERROR', 'uncertain'); }, receipt: async () => { throw denied('unauthenticated'); }, list: async () => { throw denied('unauthenticated'); } });
  try {
    const controller = await prepare(f); await controller.submit(); const sibling = f.workspace.get('SUPPLIER'); sibling.openCreate(); sibling.editName('另一类草稿');
    if (action === 'receipt') await controller.checkReceipt(); else if (action === 'replay') await controller.replayOriginal(); else await sibling.queryList(range);
    assert.equal(f.access(), 1); assert.equal(f.scope.active, false);
    for (const current of [controller, sibling]) { assert.equal(current.getSnapshot().disposed, true); assert.equal(current.getSnapshot().editor, null); assert.equal(current.getSnapshot().write.command, null); assert.equal(current.list.getSnapshot().success, null); }
  } finally { f.workspace.dispose(); }
});

for (const kind of ['forbidden', 'unauthenticated'] as const) test(`late ${kind} receipt after suspension cannot expire current identity or remove original recovery`, async () => {
  const pending = deferred<PartyReceipt>(); const f = fixture({ receipt: async () => pending.promise });
  try {
    const controller = await prepare(f); await controller.submit(); const command = controller.getSnapshot().write.command; const checking = controller.checkReceipt();
    controller.suspend(); pending.reject(denied(kind)); assert.equal(await checking, false);
    assert.equal(f.scope.active, true); assert.equal(f.access(), 0); assert.equal(controller.getSnapshot().write.phase, 'uncertain'); assert.equal(controller.getSnapshot().write.command, command); assert.equal(f.keys(), 1); assert.equal(f.sent.length, 1);
    f.context.replaceIdentity({ accountId: 'SYNTHETIC-REPLACEMENT', sessionRevision: '2', permissionRevision: '2' });
    assert.equal(controller.getSnapshot().write.command, null); assert.equal(controller.getSnapshot().disposed, true);
  } finally { f.workspace.dispose(); }
});

for (const kind of ['forbidden', 'unauthenticated'] as const) test(`late ${kind} receipt cannot expire or repopulate a replacement identity`, async () => {
  const pending = deferred<PartyReceipt>(); const f = fixture({ receipt: async () => pending.promise });
  try {
    const controller = await prepare(f); await controller.submit(); const checking = controller.checkReceipt();
    f.context.replaceIdentity({ accountId: 'SYNTHETIC-REPLACEMENT', sessionRevision: '2', permissionRevision: '2' });
    const replacementScope = f.context.createScope('SYNTHETIC-REPLACEMENT-PARTIES');
    pending.reject(denied(kind)); assert.equal(await checking, false);
    assert.equal(f.access(), 0); assert.equal(replacementScope.active, true); assert.equal(controller.getSnapshot().disposed, true); assert.equal(controller.getSnapshot().editor, null); assert.equal(controller.getSnapshot().write.command, null);
    replacementScope.dispose();
  } finally { f.workspace.dispose(); }
});

test('ordinary403 still invalidates when there is no unresolved command, including a definitively rejected fresh submission', async () => {
  for (const action of ['list', 'submit'] as const) {
    const f = fixture({ list: async () => { throw denied('forbidden'); }, execute: async () => { throw denied('forbidden', 'rejected'); } });
    try {
      const controller = f.workspace.get('CUSTOMER');
      if (action === 'list') await controller.queryList(range); else { await prepare(f); await controller.submit(); }
      assert.equal(f.access(), 1); assert.equal(f.scope.active, false); assert.equal(controller.getSnapshot().disposed, true); assert.equal(controller.getSnapshot().write.command, null);
    } finally { f.workspace.dispose(); }
  }
});

test('uncertain fresh403 cannot establish rollback and preserves the original command without automatic retry', async () => {
  const f = fixture({ execute: async () => { throw denied('forbidden', 'uncertain'); } });
  try {
    const controller = await prepare(f); await controller.submit();
    assert.equal(f.scope.active, true); assert.equal(f.access(), 0); assert.equal(controller.getSnapshot().write.phase, 'uncertain'); assert.equal(controller.getSnapshot().write.command, f.sent[0]); assert.equal(f.sent.length, 1); assert.equal(f.keys(), 1);
  } finally { f.workspace.dispose(); }
});
