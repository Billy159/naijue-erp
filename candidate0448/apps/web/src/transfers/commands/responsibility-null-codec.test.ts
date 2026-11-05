import test from 'node:test';
import assert from 'node:assert/strict';
import { draft, uuid } from './fixtures.test-support.ts';
import { draftFromTransferInput, inputFromTransferDraft, validateTransferCommand, validateTransferDraft } from './validation.ts';

// UUID syntax fixture only: this codec cannot prove catalogue membership or SAVE authority.
const staffId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const withResponsible = (value: unknown) => { const base = draft(); return { ...base, header: { ...base.header, responsibleStaffId: value } }; };

test('transfer draft codec preserves distinct omitted, own null and canonical staff UUID intents', () => {
  const omitted = validateTransferDraft(draft());
  assert.equal(Object.hasOwn(omitted.header, 'responsibleStaffId'), false);
  for (const value of [null, staffId]) {
    const input = withResponsible(value), before = structuredClone(input), parsed = validateTransferDraft(input);
    assert.equal(Object.hasOwn(parsed.header, 'responsibleStaffId'), true);
    assert.equal(parsed.header.responsibleStaffId, value);
    assert.deepEqual(input, before, 'input is not mutated or defaulted');
    assert.notEqual(parsed, input); assert.notEqual(parsed.header, input.header);
    assert.ok(Object.isFrozen(parsed)); assert.ok(Object.isFrozen(parsed.header)); assert.ok(Object.isFrozen(parsed.lines[0]!.snapshot));
    assert.deepEqual(JSON.parse(JSON.stringify(parsed)).header.responsibleStaffId, value);
  }
});

test('transfer draft nullable responsibility rejects every non-null non-canonical UUID', () => {
  for (const value of [undefined, '', ' ', 'not-a-staff-id', staffId.toUpperCase(), 7, true, {}, [], [staffId]]) {
    assert.throws(() => validateTransferDraft(withResponsible(value)), TypeError);
  }
});

test('nullable responsibility does not admit creator, approval, status or unknown command fields', () => {
  const base = withResponsible(null);
  for (const [key, value] of Object.entries({ createdByAccountId: uuid(30), createdAt: '2026-10-20T00:00:00Z', createdHallId: uuid(10), createdRole: 'ADMIN', approvedByAccountId: uuid(31), approvedAt: null, status: 'DRAFT', version: 1, unknown: null })) {
    assert.throws(() => validateTransferDraft({ ...base, header: { ...base.header, [key]: value } }), TypeError);
  }
  const command = { action: 'SAVE', requestKey: 'TEST.null-codec', expectedVersion: null, draft: base };
  assert.throws(() => validateTransferCommand({ ...command, actor: { accountId: uuid(30) } }), TypeError);
  assert.throws(() => validateTransferCommand({ ...command, createdByAccountId: uuid(30) }), TypeError);
});

test('legacy SAVE codec and quantity edits retain own null without inventing a responsible or creator', () => {
  const base = validateTransferDraft(withResponsible(null)), input = inputFromTransferDraft(base);
  const changed = draftFromTransferInput(base, { ...input, quantities: { ...input.quantities, [base.lines[0]!.id]: '3' } });
  assert.equal(Object.hasOwn(changed.header, 'responsibleStaffId'), true); assert.equal(changed.header.responsibleStaffId, null);
  assert.equal(changed.lines[0]!.quantity, '3'); assert.equal(base.lines[0]!.quantity, draft().lines[0]!.quantity);
  assert.equal(Object.hasOwn(changed.header, 'createdByAccountId'), false);
  for (const expectedVersion of [null, 2]) {
    const parsed = validateTransferCommand({ action: 'SAVE', requestKey: 'TEST.null-codec', expectedVersion, draft: changed });
    assert.equal(parsed.expectedVersion, expectedVersion);
    assert.ok(parsed.action === 'SAVE' && 'draft' in parsed);
    if (parsed.action !== 'SAVE' || !('draft' in parsed)) throw Error('Expected original legacy draft command.');
    assert.equal(parsed.draft.header.responsibleStaffId, null);
  }
  // Acceptance here is serialization only, not permission to clear an existing non-null SQL value.
});
