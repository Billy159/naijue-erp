import assert from 'node:assert/strict';
import test from 'node:test';
import { ReadContext } from '../../loading/read-scope.ts';
import { inventoryColorFitKey } from './model.ts';
import { InventoryWindowSession } from './session.ts';
import { syntheticPage, testAddress, testLayout, testViewport } from './fixtures.ts';
const identity = { accountId: 'synthetic-account', sessionRevision: 'synthetic-session', permissionRevision: 'synthetic-permission' };
function setup() {
  const context = new ReadContext(identity);
  const scope = context.createScope('synthetic-inventory-window-route');
  const session = new InventoryWindowSession(scope);
  return { context, scope, session };
}

test('only the current data ticket can publish; cancelled/late reads retain their own prior facts', () => {
  const { context, session } = setup();
  const first = session.begin(1)!;
  const firstPage = syntheticPage();
  assert.equal(session.accept(first, firstPage, testLayout()), true);
  const previous = session.model!;
  const oldRender = session.capture()!;
  const second = session.begin(2)!;
  const third = session.begin(3)!;
  assert.equal(session.isCurrent(oldRender), false);
  assert.equal(session.accept(second, { ...firstPage, readReference: 'stale-read' }, testLayout()), false);
  assert.equal(session.cancel(second), false);
  assert.equal(session.model, previous);
  assert.equal(session.cancel(third), true);
  assert.equal(session.accept(third, { ...firstPage, readReference: 'cancelled-read' }, testLayout()), false);
  assert.equal(session.model, previous);
  assert.equal(session.model!.data.readReference, firstPage.readReference);
  assert.throws(() => session.begin(3), /strictly increase/);
  const next = session.begin(4)!;
  assert.equal(session.accept(next, { ...firstPage, readReference: 'current-read' }, testLayout()), true);
  assert.equal(session.accept(next, firstPage, testLayout()), false);
  assert.equal(session.model!.data.readReference, 'current-read');
  // A copied sequence cannot impersonate the current opaque ticket.
  const fifth = session.begin(5)!;
  assert.equal(session.accept({ ...fifth }, firstPage, testLayout()), false);
  context.clear();
});

test('scope cancellation and account/permission replacement clear references and invalidate scheduled focus', () => {
  const { context, scope, session } = setup();
  const first = session.begin(1)!;
  assert.equal(session.accept(first, syntheticPage(), testLayout()), true);
  const focus = session.requestFocus(testAddress(), testViewport())!;
  assert.equal(session.isCurrentFocus(focus), true);
  const pending = session.begin(2)!;
  context.replaceIdentity({ ...identity, permissionRevision: 'new-permission' });
  assert.equal(scope.active, false); assert.equal(session.active, false);
  assert.equal(session.model, null); assert.equal(session.focus, null); assert.equal(session.capture(), null);
  assert.equal(session.isCurrentFocus(focus), false);
  assert.equal(session.begin(3), null);
  assert.equal(session.accept(pending, syntheticPage(), testLayout()), false);
  assert.equal(session.cancel(pending), false);
  assert.equal(session.reflow(testLayout()), false);
  assert.equal(session.requestFocus(testAddress(), testViewport()), null);
  const replacement = new InventoryWindowSession(context.createScope('replacement-route'));
  const newRead = replacement.begin(1)!;
  assert.equal(replacement.accept(newRead, syntheticPage(), testLayout()), true);
  assert.equal(replacement.isCurrent(focus.ticket), false);
  context.clear();
});

test('focus survives valid data/layout changes by logical ID but stale render actions never survive', () => {
  const { context, session } = setup();
  const first = session.begin(1)!;
  const data = syntheticPage();
  session.accept(first, data, testLayout());
  const address = testAddress({ productId: 'product-1', sizeId: 'size-4' });
  const focus = session.requestFocus(address, testViewport())!;
  assert.equal(session.isCurrentFocus(focus), true);
  assert.equal(session.reflow(testLayout({ collapsedProducts: new Set(['product-1']) })), true);
  assert.deepEqual(session.focus, address); assert.equal(session.isCurrentFocus(focus), false);
  const hidden = session.requestFocus(address, testViewport())!;
  assert.equal(hidden.scroll.kind, 'hidden');
  assert.equal(hidden.scroll.location.reveal.productId, 'product-1');
  assert.equal(session.reflow(testLayout({ collapsedColors: new Set([inventoryColorFitKey('product-1', 'color-0', 'fit-0')]) })), true);
  assert.deepEqual(session.focus, address);
  const next = session.begin(2)!;
  session.accept(next, { ...data, readReference: 'new-snapshot' }, testLayout());
  assert.deepEqual(session.focus, address);
  assert.equal(session.isCurrentFocus(hidden), false);
  const current = session.requestFocus(address, testViewport())!;
  assert.equal(current.ticket.readReference, 'new-snapshot');
  assert.equal(session.model!.cellTarget(address)!.readReference, 'new-snapshot');
  const removed = session.begin(3)!;
  session.accept(removed, syntheticPage(1), testLayout());
  assert.equal(session.focus, null); assert.equal(session.isCurrentFocus(current), false);
  context.clear();
});

test('a newer focus/clear invalidates earlier scheduled focus without changing data identity', () => {
  const { context, session } = setup();
  session.accept(session.begin(1)!, syntheticPage(), testLayout());
  const first = session.requestFocus(testAddress(), testViewport())!;
  const second = session.requestFocus(testAddress({ sizeId: 'size-2' }), testViewport())!;
  assert.equal(session.isCurrentFocus(first), false); assert.equal(session.isCurrentFocus(second), true);
  session.clearFocus(); assert.equal(session.isCurrentFocus(second), false);
  assert.equal(session.requestFocus(testAddress({ productId: 'absent' }), testViewport()), null);
  context.clear();
});

test('disposal, cancellation or replacement during measurement cannot publish a partially built model', () => {
  for (const action of ['dispose', 'cancel', 'replace'] as const) {
    const { context, session } = setup();
    session.accept(session.begin(1)!, syntheticPage(), testLayout());
    const previous = session.model;
    const ticket = session.begin(2)!;
    let changed = false;
    const accepted = session.accept(ticket, syntheticPage(), testLayout({ sizeWidth: () => {
      if (!changed) {
        changed = true;
        if (action === 'dispose') session.dispose();
        else if (action === 'cancel') session.cancel(ticket);
        else session.begin(3);
      }
      return 40;
    } }));
    assert.equal(accepted, false);
    assert.equal(session.model, action === 'dispose' ? null : previous);
    context.clear();
  }
});

test('reflow cannot restore a model after its scope is invalidated during measurement', () => {
  const { context, session } = setup();
  session.accept(session.begin(1)!, syntheticPage(), testLayout());
  assert.equal(session.reflow(testLayout({ sizeWidth: () => { context.clear(); return 40; } })), false);
  assert.equal(session.model, null);
  const dead = new InventoryWindowSession({ signal: AbortSignal.abort() });
  assert.equal(dead.active, false); assert.equal(dead.begin(1), null);
});
