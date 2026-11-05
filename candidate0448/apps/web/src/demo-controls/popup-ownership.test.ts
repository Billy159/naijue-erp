import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import test from 'node:test';
import { ExclusivePopupController, type PopupCloseReason, type PopupOwnership } from './popup-ownership.ts';

const abortListeners = (scope: AbortController) => getEventListeners(scope.signal, 'abort').length;

test('opening another closes the previous owner; stale handles cannot close it', () => {
  const controller = new ExclusivePopupController();
  const scope = new AbortController();
  const reasons: PopupCloseReason[] = [];
  const first = controller.open({ signal: scope.signal, onClose: reason => reasons.push(reason) });
  assert.ok(first?.active);
  const second = controller.open({ signal: scope.signal, onClose: reason => reasons.push(reason) });
  assert.ok(second?.active);
  assert.equal(first.active, false);
  assert.deepEqual(reasons, ['replaced']);
  assert.equal(first.close(), false);
  assert.equal(first.dispose(), false);
  assert.equal(controller.active, second);
  assert.equal(abortListeners(scope), 1);
  assert.equal(second.close(), true);
  assert.equal(second.close(), false);
  assert.deepEqual(reasons, ['replaced', 'close']);
  assert.equal(controller.active, null);
  assert.equal(abortListeners(scope), 0);
});

test('outside distinguishes current popup/trigger from outside or a stale owner', () => {
  const controller = new ExclusivePopupController();
  const scope = new AbortController();
  const reasons: PopupCloseReason[] = [];
  const first = controller.open({ signal: scope.signal, onClose: reason => reasons.push(reason) });
  assert.equal(controller.outside(first), false);
  assert.ok(first?.active);
  assert.equal(controller.outside(null), true);
  assert.deepEqual(reasons, ['outside']);
  assert.equal(controller.outside(null), false);
  const second = controller.open({ signal: scope.signal, onClose: reason => reasons.push(reason) });
  assert.equal(controller.outside(first), true);
  assert.equal(second?.active, false);
  assert.deepEqual(reasons, ['outside', 'outside']);
  assert.equal(abortListeners(scope), 0);
});

test('Escape and owner disposal close exactly once and detach scope listeners', () => {
  const controller = new ExclusivePopupController();
  const scope = new AbortController();
  const reasons: PopupCloseReason[] = [];
  controller.open({ signal: scope.signal, onClose: reason => reasons.push(reason) });
  assert.equal(controller.escape(), true);
  assert.equal(controller.escape(), false);
  const next = controller.open({ signal: scope.signal, onClose: reason => reasons.push(reason) });
  assert.equal(next?.dispose(), true);
  scope.abort();
  assert.deepEqual(reasons, ['escape', 'owner-disposed']);
  assert.equal(abortListeners(scope), 0);
});

test('scope disposal revokes pending lazy ownership and cannot affect a later scope', () => {
  const controller = new ExclusivePopupController();
  const oldScope = new AbortController();
  const reasons: PopupCloseReason[] = [];
  const pending = controller.open({ signal: oldScope.signal, onClose: reason => reasons.push(reason) });
  oldScope.abort();
  assert.equal(pending?.active, false, 'Late module resolution must check this before attaching/opening');
  assert.deepEqual(reasons, ['scope-disposed']);
  assert.equal(abortListeners(oldScope), 0);
  const scope = new AbortController();
  const next = controller.open({ signal: scope.signal, onClose: reason => reasons.push(reason) });
  assert.equal(controller.open({ signal: oldScope.signal, onClose: () => assert.fail('aborted owner') }), null);
  assert.equal(controller.active, next);
  controller.dispose();
  assert.deepEqual(reasons, ['scope-disposed', 'session-disposed']);
  assert.equal(abortListeners(scope), 0);
});

test('controllers are separate per session and disposal permanently rejects new owners', () => {
  const first = new ExclusivePopupController();
  const second = new ExclusivePopupController();
  const scope = new AbortController();
  const reasons: PopupCloseReason[] = [];
  const a = first.open({ signal: scope.signal, onClose: reason => reasons.push(reason) });
  const secondReasons: PopupCloseReason[] = [];
  const b = second.open({ signal: scope.signal, onClose: reason => secondReasons.push(reason) });
  first.dispose();
  first.dispose();
  assert.equal(a?.active, false);
  assert.equal(b?.active, true);
  assert.equal(first.disposed, true);
  assert.equal(first.open({ signal: scope.signal, onClose: () => assert.fail('disposed session') }), null);
  assert.deepEqual(reasons, ['session-disposed']);
  assert.deepEqual(secondReasons, []);
  assert.equal(abortListeners(scope), 1);
  second.dispose();
  assert.deepEqual(secondReasons, ['session-disposed']);
  assert.equal(abortListeners(scope), 0);
});

test('replacement callbacks may reenter: newest open wins, not outer request', () => {
  const controller = new ExclusivePopupController();
  const scope = new AbortController();
  let newest: PopupOwnership | null = null;
  const reasons: PopupCloseReason[] = [];
  controller.open({ signal: scope.signal, onClose: reason => {
    reasons.push(reason);
    newest = controller.open({ signal: scope.signal, onClose: next => reasons.push(next) });
  } });
  const obsolete = controller.open({ signal: scope.signal, onClose: () => assert.fail('obsolete open') });
  assert.equal(obsolete, null);
  assert.ok(newest);
  assert.equal(controller.active, newest);
  assert.equal(abortListeners(scope), 1);
  controller.dispose();
  assert.deepEqual(reasons, ['replaced', 'session-disposed']);
  assert.equal(abortListeners(scope), 0);
});

test('a replacement callback may dispose session or next scope without creating an owner', () => {
  const controller = new ExclusivePopupController();
  const scope = new AbortController();
  controller.open({ signal: scope.signal, onClose: () => controller.dispose() });
  assert.equal(controller.open({ signal: scope.signal, onClose: () => assert.fail('disposed session') }), null);
  assert.equal(controller.active, null);
  assert.equal(abortListeners(scope), 0);

  const next = new ExclusivePopupController();
  const oldScope = new AbortController();
  const newScope = new AbortController();
  next.open({ signal: oldScope.signal, onClose: () => newScope.abort() });
  assert.equal(next.open({ signal: newScope.signal, onClose: () => assert.fail('disposed next scope') }), null);
  assert.equal(next.active, null);
  assert.equal(abortListeners(oldScope), 0);
  assert.equal(abortListeners(newScope), 0);
});

test('throwing close callback cannot leave an orphan owner or listener', () => {
  const controller = new ExclusivePopupController();
  const scope = new AbortController();
  const owned = controller.open({ signal: scope.signal, onClose: () => { throw new Error('consumer failed'); } });
  assert.throws(() => controller.open({ signal: scope.signal, onClose: () => assert.fail('unreturned owner') }), /consumer failed/);
  assert.equal(owned?.active, false);
  assert.equal(controller.active, null);
  assert.equal(abortListeners(scope), 0);
  const next = controller.open({ signal: scope.signal, onClose() {} });
  assert.ok(next?.active);
  controller.dispose();
  assert.equal(abortListeners(scope), 0);
});
