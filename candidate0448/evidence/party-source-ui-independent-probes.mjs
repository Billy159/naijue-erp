import assert from 'node:assert/strict';
import { ReadContext } from '../apps/web/src/loading/read-scope.ts';
import { createPartyWorkspace } from '../apps/web/src/parties/controller.ts';
import { PartyClientError } from '../apps/web/src/parties/contracts.ts';

// Bounded, synthetic, local-only independent probes. No browser, service, DB or network.
const id = '00000000-0000-4000-8000-000000000001';
const operationId = '00000000-0000-4000-8000-000000000002';
const original = { id, code: ' legacy untouched ', name: 'Original', enabled: true, version: 7, createdAt: null, updatedAt: null };
let keys = 0;
let mismatchedCode = true;
const commands = [];
let listReads = 0;
const context = new ReadContext({ accountId: 'TEST-INDEPENDENT-REVIEW', sessionRevision: '1', permissionRevision: '1' });
const scope = context.createScope('TEST-INDEPENDENT-REVIEW');
const client = {
  list: async (_kind, query) => { listReads++; return { items: query.page === 1 ? [original] : [], total: 1, page: query.page, pageSize: query.pageSize }; },
  detail: async () => original,
  candidates: async (_kind, query) => ({ items: [], total: 0, page: query.page, pageSize: query.pageSize }),
  execute: async (kind, command) => {
    commands.push(command);
    return { operationId, kind, partyId: id, version: 8, code: mismatchedCode ? 'changed-illegally' : original.code, enabled: command.enabled };
  },
  receipt: async () => { throw new PartyClientError('not-found', 'RECEIPT_NOT_FOUND', 'read', 404); },
};
const workspace = createPartyWorkspace({ scope, client, newRequestKey: () => `TEST-INDEPENDENT-${++keys}`, onAccessFailure: () => { throw Error('TEST callback error'); } });
const controller = workspace.get('CUSTOMER');
let supplier;
try {
  const applied = { search: '', enabled: 'ENABLED', page: 1, pageSize: 20 };
  await controller.queryList(applied);
  const readsBeforeTyping = listReads;
  const draft = { search: '  unqueried filter  ', enabled: 'DISABLED' };
  controller.setFilterDraft(draft);
  draft.search = 'caller mutation';
  assert.equal(listReads, readsBeforeTyping);
  assert.equal(controller.canLeave(), true);
  controller.suspend();
  assert.equal(controller.leaveRoute(), true);
  assert.deepEqual(controller.getSnapshot().filterDraft, { search: '  unqueried filter  ', enabled: 'DISABLED' });
  assert.deepEqual({ ...controller.list.getSnapshot().success.parameters }, applied);
  supplier = workspace.get('SUPPLIER');
  assert.deepEqual(supplier.getSnapshot().filterDraft, { search: '', enabled: 'ENABLED' });
  supplier.setFilterDraft({ search: 'supplier-only', enabled: 'ALL' });
  assert.equal(controller.getSnapshot().filterDraft.search, '  unqueried filter  ');
  controller.setFilterDraft({ search: '', enabled: 'ENABLED' });
  await controller.queryList(applied);
  assert.equal(listReads, readsBeforeTyping + 1);
  assert.deepEqual(controller.getSnapshot().filterDraft, { search: '', enabled: 'ENABLED' });
  console.log('PASS independent immutable per-kind filter draft survives allowed leave without reads or applied-range mutation; explicit reset applies exactly one read.');
  await controller.openExisting(id, 'EDIT');
  assert.equal(controller.canLeave(), true);
  controller.suspend();
  console.log(`OBSERVATION clean EDIT after generic suspend: ${controller.getSnapshot().editor ? 'retained' : 'cleared'}; route cleanup policy is separately reviewed against frozen App remount.`);
  assert.equal(controller.leaveRoute(), true);
  assert.equal(controller.getSnapshot().editor, null);
  console.log('PASS legitimate route leave clears a clean unchanged editor.');
  // Reopen explicitly so this safety probe also applies after route-leave correction.
  controller.discardEditor();
  await controller.openExisting(id, 'EDIT');
  controller.editName('Atomic name');
  controller.editEnabled(false);
  assert.equal(controller.leaveRoute(), false);
  assert.equal(await controller.submit(), false);
  assert.equal(controller.getSnapshot().write.phase, 'uncertain');
  assert.equal(controller.getSnapshot().editor.record.code, original.code);
  assert.equal(controller.getSnapshot().editor.draftName, 'Atomic name');
  assert.equal(controller.getSnapshot().editor.draftEnabled, false);
  assert.equal(controller.leaveRoute(), false);
  console.log('PASS changed-code result cannot become committed; exact old code and both draft fields are retained.');
  await controller.checkReceipt();
  assert.equal(controller.getSnapshot().write.receipt, 'absent');
  assert.equal(controller.canLeave(), false);
  mismatchedCode = false;
  assert.equal(await controller.replayOriginal(), true);
  assert.equal(controller.getSnapshot().write.phase, 'committed');
  assert.equal(commands[0], commands[1]);
  assert.equal(keys, 1);
  console.log('PASS receipt404 cannot release unresolved guard; explicit replay reuses identical object/key/name/enabled/CAS.');
} finally {
  workspace.dispose();
}
assert.equal(controller.getSnapshot().editor, null);
assert.equal(controller.getSnapshot().write.command, null);
assert.deepEqual(controller.getSnapshot().filterDraft, { search: '', enabled: 'ENABLED' });
assert.deepEqual(supplier.getSnapshot().filterDraft, { search: '', enabled: 'ENABLED' });
assert.deepEqual(workspace.scope.active, false);
console.log('PASS disposal clears both filter drafts, editor and command references.');
