import test from 'node:test';
import assert from 'node:assert/strict';
import { createReviewProfileSession } from './profile-session.ts';
import type { UnifiedReviewProfile } from './review-profile.ts';

function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
function makeOwner(profile: UnifiedReviewProfile, onClosed: () => void) {
    let principal: object | null = null, closed = false, revision = 0;
    const controls = { allowLeave: true, guard: null as ReturnType<typeof deferred<boolean>> | null, entry: null as ReturnType<typeof deferred<void>> | null, revoke: null as ReturnType<typeof deferred<void>> | null };
    const calls = { navigate: 0, enter: 0, revoke: 0, transportRevoke: 0, dispose: 0 };
    const owner = { profile, controls, calls,
      app: { controller: { authentication: { getSnapshot: () => ({ principal }) }, async navigate(route: unknown) { assert.equal(route, null); calls.navigate++; return controls.guard ? controls.guard.promise : controls.allowLeave; } } },
      transport: { revoke() { calls.transportRevoke++; } },
      async enter() { calls.enter++; const captured = revision; if (controls.entry) await controls.entry.promise; if (closed || revision !== captured) return false; principal = {}; return true; },
      async revoke() { calls.revoke++; revision++; principal = null; if (controls.revoke) await controls.revoke.promise; },
      dispose() { if (closed) return; closed = true; calls.dispose++; revision++; principal = null; onClosed(); },
    }; return owner;
}
function fixture() {
  let live = 0, maximum = 0;
  const owners: ReturnType<typeof makeOwner>[] = [];
  function mount(profile: UnifiedReviewProfile) {
    live++; maximum = Math.max(maximum, live);
    const owner = makeOwner(profile, () => { live--; }); owners.push(owner); return owner;
  }
  const session = createReviewProfileSession(mount);
  return { session, owners, live: () => live, maximum: () => maximum };
}
test('profile session is inert; invalid literals and unchanged profile have no owner/IO side effects', async () => {
  const f = fixture(); assert.equal(f.live(), 1); assert.equal(f.owners[0]!.calls.enter, 0); const snapshot = f.session.getSnapshot(); assert.equal(f.session.getSnapshot(), snapshot);
  let getterCalls = 0; const object = { get profile() { getterCalls++; return 'standard'; } };
  for (const value of [null, undefined, '', 'STANDARD', 'admin', {}, object, Symbol('profile')]) await assert.rejects(f.session.switchProfile(value), TypeError);
  assert.equal(getterCalls, 0); assert.equal(f.owners.length, 1); assert.equal(await f.session.switchProfile('standard'), true); assert.equal(f.owners[0]!.calls.navigate, 0); f.session.dispose(); assert.equal(f.live(), 0);
});
test('navigate false preserves exact old app/transport and delegates both dirty/uncertain decisions', async () => {
  const f = fixture(); assert.equal(await f.session.enter(), true); const owner = f.owners[0]!, app = f.session.app, transport = f.session.transport;
  for (const reason of ['dirty', 'uncertain']) { owner.controls.allowLeave = false; assert.equal(await f.session.switchProfile('transfer-readonly'), false, reason); assert.equal(await f.session.enter(), false, 'Re-entry also delegates protection before reauthorization'); assert.equal(owner.calls.enter, 1); assert.equal(f.session.app, app); assert.equal(f.session.transport, transport); assert.equal(f.session.getSnapshot().profile, 'standard'); assert.equal(f.session.getSnapshot().notice, 'cannot-leave'); assert.equal(owner.calls.dispose, 0); assert.equal(owner.calls.transportRevoke, 0); }
  owner.controls.allowLeave = true; assert.equal(await f.session.switchProfile('transfer-readonly'), true); assert.equal(owner.calls.dispose, 1); assert.equal(owner.calls.transportRevoke, 1); assert.equal(f.live(), 1); assert.equal(f.maximum(), 1); assert.equal(f.session.app.controller.authentication.getSnapshot().principal, null); assert.equal(f.owners[1]!.calls.enter, 0); f.session.dispose();
});
test('revoke during pending switch invalidates generation and cannot be silently ignored', async () => {
  const f = fixture(); await f.session.enter(); const owner = f.owners[0]!; owner.controls.guard = deferred<boolean>(); const pending = f.session.switchProfile('transfer-readonly');
  assert.equal(f.session.getSnapshot().phase, 'switching'); assert.equal(await f.session.enter(), false); assert.equal(await f.session.switchProfile('transfer-readonly'), false);
  await f.session.revoke(); assert.equal(owner.calls.revoke, 1); assert.equal(f.session.getSnapshot().notice, 'revoked'); owner.controls.guard.resolve(true); assert.equal(await pending, false); assert.equal(f.owners.length, 1); assert.equal(f.session.getSnapshot().profile, 'standard'); assert.equal(f.session.app.controller.authentication.getSnapshot().principal, null); assert.equal(f.live(), 1); f.session.dispose();
});
test('dispose during pending switch prevents every late remount and releases only its owner', async () => {
  const f = fixture(); await f.session.enter(); const owner = f.owners[0]!; owner.controls.guard = deferred<boolean>(); const pending = f.session.switchProfile('transfer-readonly'); f.session.dispose();
  assert.equal(f.live(), 0); owner.controls.guard.resolve(true); assert.equal(await pending, false); assert.equal(f.owners.length, 1); assert.equal(f.session.getSnapshot().phase, 'disposed'); assert.equal(await f.session.enter(), false); assert.equal(await f.session.switchProfile('standard'), false); await f.session.revoke(); assert.equal(f.live(), 0); assert.equal(f.owners.length, 1);
});
test('revoke cancels in-flight enter; concurrent enter/switch reject without replacing ownership', async () => {
  const f = fixture(), owner = f.owners[0]!; owner.controls.entry = deferred<void>(); const entry = f.session.enter(); assert.equal(await f.session.enter(), false); assert.equal(await f.session.switchProfile('transfer-readonly'), false);
  await f.session.revoke(); owner.controls.entry.resolve(); assert.equal(await entry, false); assert.equal(owner.calls.enter, 1); assert.equal(f.session.getSnapshot().phase, 'ready'); assert.equal(f.session.getSnapshot().notice, 'revoked'); assert.equal(f.session.app.controller.authentication.getSnapshot().principal, null); f.session.dispose();
});
test('newer revoke owns completion; older revoke and disposal cannot restore readiness', async () => {
  const f = fixture(), owner = f.owners[0]!; const firstGate = deferred<void>(), secondGate = deferred<void>(); owner.controls.revoke = firstGate; const first = f.session.revoke(); owner.controls.revoke = secondGate; const second = f.session.revoke(); assert.equal(owner.calls.revoke, 2);
  firstGate.resolve(); await first; assert.equal(f.session.getSnapshot().phase, 'revoking'); assert.equal(await f.session.enter(), false); f.session.dispose(); secondGate.resolve(); await second; assert.equal(f.session.getSnapshot().phase, 'disposed'); assert.equal(f.owners.length, 1); assert.equal(f.live(), 0);
});
