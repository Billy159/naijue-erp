import assert from 'node:assert/strict';
import test from 'node:test';
import { ReadScope } from '../loading/read-scope.ts';
import { StaffSettingsController } from './controller.ts';
import type { StaffSettingsRecord } from './contracts.ts';
const roles = [{ value: 'SALESPERSON', label: '营业员', requiresHall: true }];
const scope = () => new ReadScope({ accountId: 'a', sessionRevision: 's', permissionRevision: 'p' }, 'staff-test', null, () => {});
test('role, hall and optional account preparation validate separately and disabling a new account clears credentials', () => {
  const owner = scope(), controller = new StaffSettingsController(owner, null, roles);
  assert.ok(controller.validate().name); assert.ok(controller.validate().role);
  controller.update({ name: '员工', role: 'SALESPERSON', loginName: 'employee' });
  assert.ok(controller.validate(true).hall);
  controller.update({ hall: { id: 'h', name: '厅' } }); assert.deepEqual(controller.validate(true), {});
  // The form explicitly clears login input when opt-in is removed, never turns it into a saved account.
  controller.update({ loginEnabled: false, loginName: '' }); assert.deepEqual(controller.validate(), {});
  owner.dispose(); assert.equal(controller.getSnapshot().draft, null);
});
test('a resigned employee cannot prepare enabled login and a password leaves no state after invalidation', () => {
  const owner = scope(), record: StaffSettingsRecord = { id: 'staff', name: '旧员工', role: 'SALESPERSON', hall: { id: 'h', name: null }, contact: null, employmentStatus: '离职', version: 2,
    account: { id: 'account', staffId: 'staff', loginName: 'employee', loginEnabled: false, version: 3 } };
  const controller = new StaffSettingsController(owner, record, roles);
  assert.equal(controller.getSnapshot().draft?.loginEnabled, false);
  controller.update({ loginEnabled: true }); controller.setPasswordIntent(true); assert.ok(controller.validate().loginEnabled);
  assert.equal(record.account?.loginEnabled, false); owner.dispose();
  assert.equal(controller.getSnapshot().draft, null); assert.equal(controller.getSnapshot().dirty, false);
});

import { createStaffSettingsWorkspace } from './controller.ts';
import { StaffClientError, type StaffCommand, type StaffCommandClient, type StaffCommandResult, type StaffReceiptIdentity, type StaffSettingsReader } from './contracts.ts';
import { validateStaffCommand, validateStaffResult, validateStaffReceipt } from './response-validation.ts';
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const w8Roles = [...roles, { value: 'ADMIN', label: '管理员', requiresHall: false }, { value: 'WAREHOUSE', label: '仓库', requiresHall: false }];
const currentStaff = (account = true): StaffSettingsRecord => ({ id: uid(1), name: '原员工', role: 'ADMIN', hall: null, contact: null, employmentStatus: '在职', version: 7,
  account: account ? { id: uid(2), staffId: uid(1), loginName: 'admin-synthetic', loginEnabled: true, version: 11 } : null });
const outcome = (original: StaffReceiptIdentity): StaffCommandResult => ({ operationId: uid(99), kind: 'STAFF', targetId: original.action === 'CREATE' ? uid(1) : original.id, version: original.action === 'CREATE' ? 1 : original.expectedVersion + 1 });
const committedReceipt = (original: StaffReceiptIdentity) => ({ requestKey: original.requestKey, action: original.action, status: 'COMMITTED' as const, completedAt: '2026-10-22T00:00:00Z', result: outcome(original) });
function fixture(overrides: Partial<StaffCommandClient> = {}, read?: StaffSettingsReader['readDetail']) {
  const owner = scope(), sent: StaffCommand[] = [], fetched: string[] = []; let keys = 0, denied = 0, commits = 0;
  const client: StaffCommandClient = { async execute(command) { sent.push(command); return outcome(command); }, async receipt(original) { return committedReceipt(original); }, ...overrides };
  const reader: StaffSettingsReader = { async readList() { throw Error('not used'); }, async readDetail(readInput) { fetched.push(readInput.parameters.id); return read ? read(readInput) : { ...currentStaff(), version: 8, account: { ...currentStaff().account!, version: 12 } }; } };
  const options = { client, reader, writesEnabled: () => true, newRequestKey: () => `w8-${++keys}`, onAccessFailure() { denied++; }, onCommitted() { commits++; } };
  return { owner, options, sent, fetched, counts: () => ({ keys, denied, commits }) };
}
const tick = () => new Promise<void>(resolve => setImmediate(resolve));

test('W8 joint CREATE/EDIT preserve exact text, nullable contact and real parent/child versions; success reads actual child', async () => {
  const f = fixture(), editor = new StaffSettingsController(f.owner, currentStaff(), w8Roles, f.options);
  editor.update({ name: ' 改名 ', loginName: 'new-login' }); editor.setPasswordIntent(true);
  await editor.submit('synthetic-reset'); await tick();
  assert.deepEqual(f.sent[0], { action: 'EDIT', requestKey: 'w8-1', id: uid(1), expectedVersion: 7, values: { name: ' 改名 ', role: 'ADMIN', hallId: null, contact: null },
    account: { id: uid(2), expectedVersion: 11, loginName: 'new-login', loginEnabled: true, password: 'synthetic-reset' } });
  assert.equal(Object.hasOwn(editor.getSnapshot().draft!, 'password'), false); assert.equal(editor.getSnapshot().write.phase, 'committed');
  assert.equal(editor.getSnapshot().readback.record?.account?.version, 12); assert.deepEqual(f.fetched, [uid(1)]);
  assert.equal(JSON.stringify(editor.getSnapshot()).includes('synthetic-reset'), false); assert.equal('account' in editor.getSnapshot().write.result!, false);
  await editor.submit(); assert.equal(f.sent.length, 1); f.owner.dispose();
  for (const withAccount of [false, true]) {
    const f2 = fixture(), create = new StaffSettingsController(f2.owner, null, w8Roles, f2.options);
    create.update({ name: '新员工', role: 'SALESPERSON', hall: { id: uid(5), name: '一厅' }, loginEnabled: withAccount, loginName: 'new-staff' });
    await create.submit(withAccount ? 'synthetic-initial' : ''); assert.equal(f2.sent.length, 1);
    const command = f2.sent[0]!; assert.equal(command.action, 'CREATE');
    if (command.action === 'CREATE') assert.deepEqual(command.account, withAccount ? { id: null, expectedVersion: null, loginName: 'new-staff', loginEnabled: true, password: 'synthetic-initial' } : null);
    f2.owner.dispose();
  }
});
test('W8 unchanged account stays null, blank/null contact remains exact, new linked account uses null pair', async () => {
  for (const contact of [null, '']) {
    const f = fixture(), editor = new StaffSettingsController(f.owner, { ...currentStaff(), contact }, w8Roles, f.options);
    editor.update({ role: 'WAREHOUSE' }); await editor.submit(); const command = f.sent[0]!;
    assert.equal(command.action, 'EDIT'); if (command.action === 'EDIT') { assert.equal(command.account, null); assert.equal(command.values.contact, contact); }
    f.owner.dispose();
  }
  const f = fixture(), editor = new StaffSettingsController(f.owner, currentStaff(false), w8Roles, f.options);
  editor.update({ loginEnabled: true, loginName: 'new-linked' }); await editor.submit('synthetic-new');
  const command = f.sent[0]!; if (command.action !== 'EDIT') assert.fail();
  assert.deepEqual(command.account, { id: null, expectedVersion: null, loginName: 'new-linked', loginEnabled: true, password: 'synthetic-new' }); f.owner.dispose();
});
test('W8 pending and uncertain retain only safe original identity, forbid resend/close, recover original key across route lifetime', async () => {
  let reject: (error: unknown) => void = () => {}; let posts = 0, reads = 0; const recovered: StaffReceiptIdentity[] = [];
  const f = fixture({ execute() { posts++; return new Promise((_, no) => { reject = no; }); }, async receipt(original) { recovered.push(original); if (++reads === 1) throw new StaffClientError('not-found', 'RECEIPT_NOT_FOUND', 'read', 404); if (reads === 2) throw new StaffClientError('forbidden', 'FORBIDDEN', 'read', 403); return committedReceipt(original); } });
  const workspace = createStaffSettingsWorkspace({ ...f.options, scope: f.owner, roles: w8Roles }), editor = workspace.open(currentStaff())!;
  editor.setPasswordIntent(true); const pending = editor.submit('synthetic-secret');
  assert.equal(Object.hasOwn(editor.getSnapshot().draft!, 'password'), false); assert.equal(JSON.stringify(editor.getSnapshot()).includes('synthetic-secret'), false);
  const original = editor.getSnapshot().write.original; assert.deepEqual(original, { action: 'EDIT', requestKey: 'w8-1', id: uid(1), expectedVersion: 7 });
  assert.equal(Object.isFrozen(original), true); editor.update({ name: 'ignored' }); await editor.submit(); assert.equal(posts, 1); assert.equal(editor.requestClose(), false); assert.equal(workspace.close(), false);
  reject(new StaffClientError('network', 'NETWORK_ERROR', 'uncertain')); await pending;
  const route = scope(); assert.equal(workspace.matches(route), true); route.dispose(); assert.equal(editor.getSnapshot().write.original, original);
  for (let i = 0; i < 2; i++) { await editor.recover(); assert.equal(editor.getSnapshot().write.phase, 'uncertain'); assert.equal(f.owner.active, true); }
  await editor.recover(); await tick(); assert.equal(editor.getSnapshot().write.phase, 'committed'); assert.equal(workspace.canLeave(), true);
  assert.equal(posts, 1); assert.equal(f.counts().keys, 1); assert.equal(f.counts().denied, 0); assert.ok(recovered.every(item => item === original)); f.owner.dispose(); assert.equal(workspace.getSnapshot(), null);
});
test('W8 definite rejection requires reset reentry or explicit reset cancellation, gate and last admin remain authoritative', async () => {
  let posts = 0; const f = fixture({ async execute() { posts++; throw new StaffClientError('conflict', 'LAST_AVAILABLE_ADMIN', 'rejected', 409); } });
  const editor = new StaffSettingsController(f.owner, currentStaff(), w8Roles, f.options);
  editor.update({ name: '拟改名' }); editor.setPasswordIntent(true); await editor.submit('synthetic-reset'); assert.equal(editor.getSnapshot().needsPasswordReentry, true);
  await editor.submit(); assert.equal(posts, 1); assert.ok(editor.getSnapshot().errors.password);
  editor.cancelPasswordReset(); assert.equal(editor.getSnapshot().needsPasswordReentry, false); await editor.submit(); assert.equal(posts, 2);
  assert.equal(editor.getSnapshot().write.error?.code, 'LAST_AVAILABLE_ADMIN'); assert.equal(currentStaff().account?.loginEnabled, true);
  const readonly = new StaffSettingsController(f.owner, null, w8Roles, { ...f.options, writesEnabled: () => false });
  readonly.update({ name: '不会发送', role: 'ADMIN', loginEnabled: false }); await readonly.submit(); assert.equal(posts, 2);
  const optional = new StaffSettingsController(f.owner, null, w8Roles, f.options);
  optional.update({ name: '员工', role: 'ADMIN', loginName: 'optional' }); await optional.submit('synthetic-optional');
  assert.equal(optional.getSnapshot().needsPasswordReentry, true);
  optional.update({ loginEnabled: false, loginName: '' }); assert.equal(optional.getSnapshot().needsPasswordReentry, false);
  assert.deepEqual(optional.validate(), {}); await optional.submit(); assert.equal(posts, 4); f.owner.dispose();
});
test('W8 lifecycle uses fresh requested state/version, keeps account out of leave/reinstate payload and never enables login', async () => {
  for (const intent of ['LEAVE', 'REINSTATE'] as const) {
    const record = { ...currentStaff(), version: 20, employmentStatus: intent === 'LEAVE' ? '在职' : '离职' };
    const f = fixture({}, async () => ({ ...record, version: 21, employmentStatus: intent === 'LEAVE' ? '离职' : '在职', account: { ...record.account!, loginEnabled: false, version: 22 } }));
    const editor = new StaffSettingsController(f.owner, record, w8Roles, f.options, intent); await editor.submit(); await tick();
    assert.deepEqual(f.sent[0], { action: intent, requestKey: 'w8-1', id: uid(1), expectedVersion: 20 }); assert.equal(editor.getSnapshot().readback.record?.account?.loginEnabled, false);
    const stale = new StaffSettingsController(f.owner, { ...record, employmentStatus: intent === 'LEAVE' ? '离职' : '在职' }, w8Roles, f.options, intent); await stale.submit(); assert.ok(stale.getSnapshot().errors.employment); assert.equal(f.sent.length, 1); f.owner.dispose();
  }
});
test('W8 strict response and readback failures never manufacture account IDs or turn committed write into retry', async () => {
  let read = 0; const f = fixture({}, async () => { read++; return read === 1 ? { ...currentStaff(), version: 7 } : { ...currentStaff(), version: 8, account: { ...currentStaff().account!, id: uid(33), version: 40 } }; });
  const editor = new StaffSettingsController(f.owner, currentStaff(), w8Roles, f.options); editor.update({ name: '改名' }); await editor.submit(); await tick();
  assert.equal(editor.getSnapshot().write.phase, 'committed'); assert.equal(editor.getSnapshot().readback.phase, 'error'); assert.equal(editor.getSnapshot().readback.record, null);
  await editor.submit(); assert.equal(f.sent.length, 1); await editor.readback(); assert.equal(editor.getSnapshot().readback.record?.account?.id, uid(33)); f.owner.dispose();
  const malformed = fixture({ async execute(command) { return { ...outcome(command), accountId: uid(90) }; } }), e = new StaffSettingsController(malformed.owner, currentStaff(), w8Roles, malformed.options);
  e.update({ name: '改名' }); await e.submit(); assert.equal(e.getSnapshot().write.phase, 'uncertain'); assert.equal(malformed.counts().commits, 0); malformed.owner.dispose();
});
test('W8 identity invalidation and 401 clear password, original key and late result; 403 unknown retains identity', async () => {
  let finish: (result: StaffCommandResult) => void = () => {};
  const f = fixture({ execute() { return new Promise(resolve => { finish = resolve; }); } }), editor = new StaffSettingsController(f.owner, currentStaff(), w8Roles, f.options);
  editor.setPasswordIntent(true); const pending = editor.submit('synthetic-only'); f.owner.dispose(); finish(outcome({ action: 'EDIT', requestKey: 'w8-1', id: uid(1), expectedVersion: 7 })); await pending;
  assert.equal(editor.getSnapshot().draft, null); assert.equal(editor.getSnapshot().write.original, null); assert.equal(f.counts().commits, 0); assert.equal(f.fetched.length, 0);
  for (const kind of ['unauthenticated', 'forbidden'] as const) {
    const f2 = fixture({ async execute() { throw new StaffClientError(kind, kind === 'unauthenticated' ? 'UNAUTHENTICATED' : 'FORBIDDEN', 'uncertain'); } });
    const e = new StaffSettingsController(f2.owner, currentStaff(), w8Roles, f2.options); e.update({ name: '新名' }); e.setPasswordIntent(true); await e.submit('synthetic-only');
    assert.equal(f2.owner.active, kind === 'forbidden'); assert.equal(Object.hasOwn(e.getSnapshot().draft ?? {}, 'password'), false); f2.owner.dispose();
  }
});
test('W8 browser parser enforces exact joint contract and strict receipt binding', () => {
  const base = { action: 'CREATE', requestKey: 'w8-valid', values: { name: ' 精确 ', role: 'SALESPERSON', hallId: uid(3), contact: '' }, account: null };
  assert.deepEqual(validateStaffCommand(base), base);
  for (const bad of [{ ...base, employmentStatus: '在职' }, { ...base, values: { ...base.values, hallId: null } }, { ...base, account: { id: uid(2), expectedVersion: 3, loginName: 'x', loginEnabled: true, password: 'synthetic' } }, { ...base, account: { id: null, expectedVersion: null, loginName: '中'.repeat(86), loginEnabled: true, password: 'synthetic' } }]) assert.throws(() => validateStaffCommand(bad));
  const identity: StaffReceiptIdentity = { action: 'EDIT', requestKey: 'w8-original', id: uid(1), expectedVersion: 7 };
  assert.throws(() => validateStaffResult({ ...outcome(identity), targetId: uid(5) }, identity));
  assert.throws(() => validateStaffReceipt({ ...committedReceipt(identity), requestKey: 'wrong' }, identity));
  assert.throws(() => validateStaffReceipt({ ...committedReceipt(identity), action: 'LEAVE' }, identity));
});

test('W8 password privacy: public drafts ignore plaintext injection, only nonsecret intent survives route detach', async () => {
  const f = fixture(), workspace = createStaffSettingsWorkspace({ ...f.options, scope: f.owner, roles: w8Roles }), editor = workspace.open(currentStaff())!;
  const marker = 'synthetic-private-input';
  editor.update({ password: marker } as unknown as Parameters<typeof editor.update>[0]);
  assert.equal(JSON.stringify(editor.getSnapshot()).includes(marker), false); assert.equal(Object.hasOwn(editor.getSnapshot().draft!, 'password'), false);
  editor.setPasswordIntent(true); editor.passwordInputDetached();
  assert.equal(editor.getSnapshot().needsPasswordReentry, true); assert.equal(editor.getSnapshot().dirty, true);
  const route = scope(); route.dispose(); assert.equal(f.owner.active, true); assert.equal(JSON.stringify(workspace.getSnapshot()!.getSnapshot()).includes(marker), false);
  await editor.submit(); assert.equal(f.sent.length, 0); assert.ok(editor.getSnapshot().errors.password);
  editor.cancelPasswordReset(); assert.equal(editor.canLeave(), true); f.owner.dispose();
});
