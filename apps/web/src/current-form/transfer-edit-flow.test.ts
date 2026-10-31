import test from 'node:test';
import assert from 'node:assert/strict';
import { entityId } from '../../../../packages/domain/src/values.ts';
import { ReadContext } from '../loading/read-scope.ts';
import { TransferProposalSession, transferProposalRowKey, type TransferProposalReader } from './transfer-proposal.ts';
import type { CatalogueSettingsEntry, CatalogueSettingsListQuery, CatalogueSettingsPage } from '../../../../packages/application/src/catalogue-settings-read-ports.ts';
import type { CurrentFormPage, CurrentFormSku, CurrentFormProduct, CurrentTransferWarehouse } from '../../../../packages/application/src/current-form-ports.ts';
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const product: CurrentFormProduct = { id: entityId('product', uid(1)), code: 'SYN', name: 'Synthetic', sizeGroupId: entityId('sizeGroup', uid(2)), retailPrice: null, minimumPriceAvailability: 'UNAVAILABLE' };
const y: CurrentFormSku = { id: entityId('sku', uid(3)), skuCode: 'SYN-WHITE-Y', productId: product.id, productCode: product.code, productName: product.name, colorId: entityId('color', uid(4)), colorName: '白色', fitId: entityId('fit', uid(5)), fitName: 'Y版（修身）', sizeId: entityId('size', uid(6)), sizeName: '165/S', sizeGroupId: product.sizeGroupId!, barcodeAvailability: 'UNAVAILABLE' };
const a: CurrentFormSku = { ...y, id: entityId('sku', uid(7)), skuCode: 'SYN-BLUE-A', colorId: entityId('color', uid(8)), colorName: '蓝色', fitId: entityId('fit', uid(9)), fitName: '标准型（实际名称可改）' };
const wh = (n: number): CurrentTransferWarehouse => ({ id: entityId('warehouse', uid(n)), name: 'SYN warehouse', hallId: entityId('hall', uid(12)), hallName: 'SYN hall', enabled: true, hallEnabled: true, hasNonzeroInventory: false });
const page = <T>(items: readonly T[]): CurrentFormPage<T> => ({ page: 1, pageSize: 20, exactTotal: BigInt(items.length), items });
const fitPage = (items: readonly CatalogueSettingsEntry[]): CatalogueSettingsPage<CatalogueSettingsEntry> => ({ page: 1, pageSize: 20, total: items.length, items });
const canonicalA: CatalogueSettingsEntry = { id: a.fitId, code: 'A', name: '非A显示名', enabled: true, version: 1 };
type FitsReader = (query: CatalogueSettingsListQuery, signal: AbortSignal) => Promise<CatalogueSettingsPage<CatalogueSettingsEntry>>;
function setup(readFits?: FitsReader) {
  const context = new ReadContext({ accountId: uid(99), sessionRevision: 'test', permissionRevision: 'test' }), scope = context.createScope('transfer-edit');
  const reader: TransferProposalReader & { readFits?: FitsReader } = { readProducts: async () => page([product]), readProductSkus: async () => page([y, a]), readTransferWarehouses: async () => page([wh(10), wh(11)]), ...(readFits ? { readFits } : {}) };
  return { session: new TransferProposalSession(scope, reader), context };
}
/** Bounded rendezvous: old implementations that never call readFits fail an
 * explicit assertion as soon as product selection completes, not an infinite await. */
async function expectDefaultReadStarted(started: Promise<void>, picking: Promise<boolean>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const outcome = await Promise.race([
      started.then(() => 'started' as const),
      picking.then(() => 'product-completed-without-fits' as const, () => 'product-rejected-before-fits' as const),
      new Promise<'deadline-without-fits'>(resolve => { timer = setTimeout(() => resolve('deadline-without-fits'), 2000); }),
    ]);
    assert.equal(outcome, 'started', `Expected current-product default fits read to start; observed ${outcome}.`);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}
async function expectSelectionSettled(picking: Promise<boolean>, label: string): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const outcome = await Promise.race([
      picking.then(() => 'settled' as const, () => 'settled' as const),
      new Promise<'deadline'>(resolve => { timer = setTimeout(() => resolve('deadline'), 1000); }),
    ]);
    assert.equal(outcome, 'settled', `${label}: product selection did not settle after deferred release / disposal.`);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}
async function selectProduct(session: TransferProposalSession) { await session.openPicker('PRODUCT'); assert.equal(await session.selectPendingProduct(product.id), true); }
function seed(session: TransferProposalSession) { assert.equal(session.initializeFromSaved({ businessDate: '2026-10-31', note: 'SYN saved', from: wh(10), to: wh(11), lines: [{ sku: y, product, quantity: '1', existingLineId: uid(80) }] }), true); }

test('fit is selectable before color; selecting color never clears an explicit fit', async () => {
  const { session } = setup(); await selectProduct(session);
  assert.equal(session.getSnapshot().pending.color === null, true);
  assert.equal(session.selectPendingSpec('fit', y.fitId), true);
  assert.equal(session.selectPendingSpec('color', a.colorId), true);
  assert.equal(session.getSnapshot().pending.fit?.id, y.fitId);
  // Choosing independent axes never fabricates a SKU or accepts a mismatched genuine SKU.
  assert.equal(session.setPendingQuantity(a.id, '2'), false);
  assert.equal(session.getSnapshot().draft.lines.length, 0, 'independent selections create no draft line'); session.dispose();
});
test('default A uses confirmed dictionary code and current product SKU ID, not fit label or SKU order', async () => {
  const { session } = setup(async q => { assert.equal(q.search, 'A'); return fitPage([{ id: y.fitId, code: 'Y', name: 'A版（不是A代码）', enabled: true, version: 1 }, canonicalA]); });
  await selectProduct(session); assert.equal(session.getSnapshot().pending.fit?.id, a.fitId); assert.equal(session.getSnapshot().pending.color === null, true);
  assert.equal(session.selectPendingSpec('color', a.colorId), true); assert.equal(session.getSnapshot().pending.fit?.id, a.fitId); assert.equal(session.setPendingQuantity(a.id, '2'), true); session.dispose();
});
test('missing, disabled, foreign or ambiguous canonical A never guesses a default', async () => {
  for (const entries of [[], [{ ...canonicalA, enabled: false }], [{ ...canonicalA, id: uid(77) }], [canonicalA, { ...canonicalA, id: y.fitId }]]) {
    const { session } = setup(async () => fitPage(entries)); await selectProduct(session); assert.equal(session.getSnapshot().pending.fit === null, true); assert.equal(session.selectPendingSpec('fit', y.fitId), true); session.dispose();
  }
});
test('late default read cannot replace a user-selected Y; late identity response cannot resurrect pending input', async () => {
  const deferred: { finish?: (page: CatalogueSettingsPage<CatalogueSettingsEntry>) => void } = {};
  let started!: () => void;
  let picking: Promise<boolean> | null = null;
  const waiting = new Promise<void>(r => { started = r; });
  const { session, context } = setup(async () => new Promise<CatalogueSettingsPage<CatalogueSettingsEntry>>(resolve => { deferred.finish = resolve; started(); }));
  try {
    await session.openPicker('PRODUCT'); picking = session.selectPendingProduct(product.id);
    await expectDefaultReadStarted(waiting, picking);
    assert.equal(session.selectPendingSpec('fit', y.fitId), true);
    assert.equal(typeof deferred.finish, 'function', 'the started deferred read supplies its resolver');
    deferred.finish!(fitPage([canonicalA])); await expectSelectionSettled(picking, 'late user selection'); await picking;
    assert.equal(session.getSnapshot().pending.fit?.id, y.fitId);
    context.clear(); assert.equal(session.getSnapshot().disposed, true); assert.equal(session.getSnapshot().pending.fit === null, true);
  } finally {
    // Resolve even after an earlier assertion fails; readers may ignore abort.
    deferred.finish?.(fitPage([canonicalA])); context.clear(); session.dispose();
    if (picking) await expectSelectionSettled(picking, 'late user selection cleanup');
  }
});
test('existing Y replacement never invokes fresh A default, cancel restores clean original draft', async () => {
  let defaults = 0; const { session } = setup(async () => { defaults++; return fitPage([canonicalA]); }); seed(session); const original = session.getSnapshot().draft;
  assert.equal(session.beginReplacement(transferProposalRowKey(y)), true); await new Promise<void>(r => setImmediate(r));
  assert.equal(session.getSnapshot().pending.fit?.id, y.fitId); assert.equal(defaults, 0);
  session.cancelReplacement(); assert.equal(session.getSnapshot().draft === original, true); assert.equal(session.getSnapshot().dirty, false); session.dispose();
});
test('cancel preserves preexisting header edits and draft edits made during replacement', () => {
  const { session } = setup(); seed(session); session.setHeader({ note: 'SYN user note' });
  assert.equal(session.beginReplacement(transferProposalRowKey(y)), true); session.setQuantity(y.id, '3'); session.cancelReplacement();
  assert.equal(session.getSnapshot().draft.note, 'SYN user note'); assert.equal(session.getSnapshot().draft.lines[0]!.quantity, '3'); assert.equal(session.getSnapshot().dirty, true); session.dispose();
});
test('default fit read failure retains current product candidates and manual fit selection', async () => {
  const { session } = setup(async () => { throw Error('SYN directory unavailable'); }); await selectProduct(session);
  assert.equal(session.getSnapshot().pending.phase, 'ready'); assert.equal(session.getSnapshot().pending.fit === null, true); assert.match(session.getSnapshot().notice!, /手工选择版型/); assert.equal(session.selectPendingSpec('fit', y.fitId), true); session.dispose();
});

test('an A dictionary response after identity invalidation cannot resurrect a disposed draft', async () => {
  const deferred: { finish?: (page: CatalogueSettingsPage<CatalogueSettingsEntry>) => void } = {};
  let started!: () => void;
  let picking: Promise<boolean> | null = null;
  const waiting = new Promise<void>(r => { started = r; });
  const { session, context } = setup(async () => new Promise<CatalogueSettingsPage<CatalogueSettingsEntry>>(resolve => { deferred.finish = resolve; started(); }));
  try {
    await session.openPicker('PRODUCT'); picking = session.selectPendingProduct(product.id);
    await expectDefaultReadStarted(waiting, picking);
    context.clear(); assert.equal(typeof deferred.finish, 'function', 'the started deferred read supplies its resolver');
    deferred.finish!(fitPage([canonicalA])); await expectSelectionSettled(picking, 'late identity response'); await picking;
    assert.equal(session.getSnapshot().disposed, true); assert.equal(session.getSnapshot().pending.fit === null, true); assert.equal(session.getSnapshot().pending.product === null, true);
  } finally {
    deferred.finish?.(fitPage([canonicalA])); context.clear(); session.dispose();
    if (picking) await expectSelectionSettled(picking, 'late identity response cleanup');
  }
});

test('an active clean replacement still requires explicit reset/cancel discard', () => {
  const { session } = setup(); seed(session); const original = session.getSnapshot().draft;
  assert.equal(session.beginReplacement(transferProposalRowKey(y)), true); assert.equal(session.getSnapshot().dirty, false);
  assert.equal(session.reset(), false); assert.equal(session.cancel(), false); assert.equal(session.getSnapshot().draft === original, true); assert.equal(session.getSnapshot().replacement !== null, true, 'replacement remains active');
  session.cancelReplacement(); assert.equal(session.getSnapshot().dirty, false); session.dispose();
});
