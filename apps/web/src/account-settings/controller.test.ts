import assert from 'node:assert/strict';
import test from 'node:test';
import { ReadScope } from '../loading/read-scope.ts';
import { AccountSettingsController, createAccountSettingsWorkspace } from './controller.ts';
import { AccountClientError, type AccountCommand, type AccountCommandClient, type AccountCommandResult, type AccountReceiptIdentity, type AccountSettingsRecord, type StaffSettingsReader } from './contracts.ts';
import { accountStaffCandidate } from './response-validation.ts';
import type { StaffSettingsRecord } from '../staff-settings/contracts.ts';
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const staff = (): StaffSettingsRecord => ({ id: uuid(2), name: '员工', role: 'ADMIN', hall: null, contact: null, employmentStatus: '在职', version: 9, account: null });
const account = (): AccountSettingsRecord => ({ id: uuid(1), version: 7, loginName: 'original', loginEnabled: true, createdAt: '2026-10-22T00:00:00.123456Z', updatedAt: '2026-10-22T01:00:00.234567Z', staff: { id: uuid(2), name: '员工', role: 'ADMIN', hallId: null, employmentStatus: '在职' } });
const resultFor = (original: AccountReceiptIdentity): AccountCommandResult => ({ operationId: uuid(99), kind: 'ACCOUNT', targetId: original.action === 'CREATE' ? uuid(1) : original.id, version: original.action === 'CREATE' ? 1 : original.expectedVersion + 1 });
const receiptFor = (original: AccountReceiptIdentity) => ({ requestKey: original.requestKey, action: original.action, status: 'COMMITTED' as const, completedAt: '2026-10-22T00:00:00Z', result: resultFor(original) });
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
function setup(client: Partial<AccountCommandClient> = {}, staffRead?: StaffSettingsReader['readDetail']) {
  const scope = new ReadScope({ accountId: 'w7-actor', sessionRevision: '1', permissionRevision: '1' }, 'w7-session', null, () => {});
  const sent: AccountCommand[] = [], reads: string[] = []; let keys = 0, denied = 0, commits = 0;
  const options = { client: { async execute(command: AccountCommand) { sent.push(command); return resultFor(command); }, async receipt(original: AccountReceiptIdentity) { return receiptFor(original); }, ...client },
    reader: { async readList() { throw Error('not used'); }, async readDetail() { return { ...account(), version: 8 }; } },
    staffReader: { async readList() { throw Error('not used'); }, async readDetail(read: Parameters<StaffSettingsReader['readDetail']>[0]) { reads.push(read.parameters.id); return staffRead ? staffRead(read) : staff(); } },
    writesEnabled: () => true, newRequestKey: () => `w7-${++keys}`, onAccessFailure() { denied++; }, onCommitted() { commits++; } };
  return { scope, options, sent, reads, counts: () => ({ keys, denied, commits }) };
}
test('W7 five native actions preserve exact text/identity/version and never rebind staff or mutate employment', async () => {
  for (const intent of ['CREATE', 'EDIT', 'DISABLE', 'RESTORE', 'RESET_PASSWORD'] as const) {
    const f = setup(), record = intent === 'CREATE' ? null : { ...account(), loginEnabled: intent !== 'RESTORE' };
    const editor = new AccountSettingsController(f.scope, record, intent, f.options);
    if (intent === 'CREATE') editor.selectStaff(accountStaffCandidate(staff()));
    if (intent === 'EDIT' || intent === 'CREATE') editor.update({ loginName: ' exact login ' });
    if (intent === 'RESET_PASSWORD') editor.setPasswordIntent(true);
    await editor.submit(intent === 'CREATE' || intent === 'RESET_PASSWORD' ? 'synthetic-once' : ''); await tick();
    const command = f.sent[0]!; assert.equal(command.action, intent); assert.equal(editor.getSnapshot().write.phase, 'committed');
    assert.equal(JSON.stringify(editor.getSnapshot()).includes('synthetic-once'), false); assert.equal(Object.hasOwn(editor.getSnapshot().draft!, 'password'), false);
    if (command.action === 'CREATE') { assert.equal(command.values.staffId, uuid(2)); assert.equal(command.values.loginName, ' exact login '); assert.deepEqual(f.reads, [uuid(2)]); }
    else { assert.equal(command.id, uuid(1)); assert.equal(command.expectedVersion, 7); if (command.action === 'EDIT') assert.deepEqual(command.values, { loginName: ' exact login ', loginEnabled: true }); }
    await editor.submit('synthetic-again'); assert.equal(f.sent.length, 1); assert.equal(account().staff.employmentStatus, '在职'); f.scope.dispose();
  }
});
test('W7 CREATE rechecks actual staff before first key and rejects concurrent account creation without a command', async () => {
  const f = setup({}, async () => ({ ...staff(), account: { id: uuid(5), staffId: uuid(2), loginName: 'already', loginEnabled: true, version: 1 } }));
  const e = new AccountSettingsController(f.scope, null, 'CREATE', f.options); e.selectStaff(accountStaffCandidate(staff())); e.update({ loginName: 'new' }); await e.submit('synthetic-new');
  assert.equal(f.sent.length, 0); assert.equal(f.counts().keys, 0); assert.equal(e.getSnapshot().write.error?.code, 'ACCOUNT_REFERENCE_UNAVAILABLE'); assert.equal(JSON.stringify(e.getSnapshot()).includes('synthetic-new'), false); f.scope.dispose();
  const f2 = setup({}, async () => ({ ...staff(), employmentStatus: '离职' })), e2 = new AccountSettingsController(f2.scope, null, 'CREATE', f2.options);
  e2.selectStaff(accountStaffCandidate(staff())); e2.update({ loginName: 'disabled-new' }); await e2.submit('synthetic-new'); assert.equal(f2.sent.length, 0); assert.ok(e2.getSnapshot().errors.loginEnabled);
  e2.update({ loginEnabled: false }); await e2.submit('synthetic-new'); assert.equal(f2.sent.length, 1); f2.scope.dispose();
});
test('W7 secret remains input-only and reset rejection requires reentry; closed gate and injected plaintext cannot write', async () => {
  let posts = 0; const f = setup({ async execute() { posts++; throw new AccountClientError('invalid-request', 'INVALID_ACCOUNT_PASSWORD', 'rejected', 400); } });
  const e = new AccountSettingsController(f.scope, account(), 'RESET_PASSWORD', f.options);
  e.update({ password: 'synthetic-injected' } as unknown as Parameters<typeof e.update>[0]); e.setPasswordIntent(true);
  assert.equal(JSON.stringify(e.getSnapshot()).includes('synthetic-injected'), false); e.passwordInputDetached(); await e.submit(); assert.equal(posts, 0);
  await e.submit('synthetic-once'); assert.equal(posts, 1); assert.equal(e.getSnapshot().needsPasswordReentry, true); await e.submit(); assert.equal(posts, 1); assert.ok(e.getSnapshot().errors.password);
  const closed = new AccountSettingsController(f.scope, account(), 'RESET_PASSWORD', { ...f.options, writesEnabled: () => false }); await closed.submit('synthetic-once'); assert.equal(posts, 1); f.scope.dispose();
});
test('W7 uncertain reset retains safe original identity across remount and read404/403, never resends', async () => {
  let posts = 0, reads = 0; const seen: AccountReceiptIdentity[] = [];
  const f = setup({ async execute() { posts++; throw new AccountClientError('network', 'NETWORK_ERROR', 'uncertain'); }, async receipt(original) { seen.push(original); if (++reads === 1) throw new AccountClientError('not-found', 'RECEIPT_NOT_FOUND', 'read', 404); if (reads === 2) throw new AccountClientError('forbidden', 'FORBIDDEN', 'read', 403); return receiptFor(original); } });
  const workspace = createAccountSettingsWorkspace({ ...f.options, scope: f.scope }), e = workspace.open(account(), 'RESET_PASSWORD')!;
  e.setPasswordIntent(true); await e.submit('synthetic-secret'); const original = e.getSnapshot().write.original;
  assert.equal(JSON.stringify(e.getSnapshot()).includes('synthetic-secret'), false); assert.equal(workspace.close(), false); assert.equal(workspace.open(null), null); await e.submit('synthetic-again'); assert.equal(posts, 1);
  const route = new ReadScope(f.scope.identity, 'route', null, () => {}); assert.equal(workspace.matches(route), true); route.dispose(); assert.equal(e.getSnapshot().write.original, original);
  await e.recover(); await e.recover(); assert.equal(e.getSnapshot().write.phase, 'uncertain'); assert.equal(f.scope.active, true); await e.recover();
  assert.equal(e.getSnapshot().write.phase, 'committed'); assert.equal(posts, 1); assert.equal(f.counts().keys, 1); assert.ok(seen.every(item => item === original)); f.scope.dispose();
});
test('W7 lifecycle validates current state and surfaces last-admin conflict without client-side optimistic state', async () => {
  let posts = 0; const f = setup({ async execute() { posts++; throw new AccountClientError('conflict', 'LAST_AVAILABLE_ADMIN', 'rejected', 409); } });
  const e = new AccountSettingsController(f.scope, account(), 'DISABLE', f.options); await e.submit(); assert.equal(e.getSnapshot().write.error?.code, 'LAST_AVAILABLE_ADMIN'); assert.equal(e.record?.loginEnabled, true);
  const changed = new AccountSettingsController(f.scope, { ...account(), loginEnabled: false }, 'DISABLE', f.options); await changed.submit(); assert.ok(changed.getSnapshot().errors.state);
  const left = new AccountSettingsController(f.scope, { ...account(), loginEnabled: false, staff: { ...account().staff, employmentStatus: '离职' } }, 'RESTORE', f.options); await left.submit(); assert.ok(left.getSnapshot().errors.state); assert.equal(posts, 1); f.scope.dispose();
});
test('W7 confirmed write with failed readback stays committed; mismatched result is uncertain; identity abort ignores late completion', async () => {
  const f = setup(), e = new AccountSettingsController(f.scope, account(), 'EDIT', { ...f.options, reader: { ...f.options.reader, async readDetail() { return { ...account(), version: 8, staff: { ...account().staff, id: uuid(66) } }; } } });
  e.update({ loginName: 'renamed' }); await e.submit(); await tick(); assert.equal(e.getSnapshot().write.phase, 'committed'); assert.equal(e.getSnapshot().readback.phase, 'error'); await e.submit(); assert.equal(f.sent.length, 1); f.scope.dispose();
  const bad = setup({ async execute(command) { return { ...resultFor(command), kind: 'STAFF' } as unknown as AccountCommandResult; } }), b = new AccountSettingsController(bad.scope, account(), 'DISABLE', bad.options); await b.submit(); assert.equal(b.getSnapshot().write.phase, 'uncertain'); bad.scope.dispose();
  let resolve: (v: AccountCommandResult) => void = () => {}; const late = setup({ execute() { return new Promise(done => { resolve = done; }); } }), w = createAccountSettingsWorkspace({ ...late.options, scope: late.scope }), item = w.open(account(), 'RESET_PASSWORD')!;
  const pending = item.submit('synthetic-late'); late.scope.dispose(); resolve(resultFor({ action: 'RESET_PASSWORD', requestKey: 'w7-1', id: uuid(1), expectedVersion: 7 })); await pending; assert.equal(w.getSnapshot(), null); assert.equal(item.getSnapshot().draft, null); assert.equal(late.counts().commits, 0);
});
