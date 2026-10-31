import test from 'node:test';
import assert from 'node:assert/strict';
import { entityId } from '../../../../packages/domain/src/values.ts';
import type { CurrentFormPage, CurrentFormProduct, CurrentFormSku, CurrentTransferWarehouse } from '../../../../packages/application/src/current-form-ports.ts';
import type { DictionarySizeGroup } from '../../../../packages/application/src/dictionary-read-ports.ts';
import { ReadContext } from '../loading/read-scope.ts';
import { TransferProposalSession, transferProposalLineIdentity, transferProposalRowKey, type TransferProposalLine, type TransferProposalReader } from './transfer-proposal.ts';

// Local-only synthetic candidate reads. No API, command, prepare, persistence, or stock port.
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const product: CurrentFormProduct = { id: entityId('product', uuid(3)), code: 'APPEND-TEST', name: 'SYNTHETIC append product', sizeGroupId: entityId('sizeGroup', uuid(8)), retailPrice: null, minimumPriceAvailability: 'UNAVAILABLE' };
const xs: CurrentFormSku = { id: entityId('sku', uuid(4)), skuCode: 'APPEND-TEST-XS', productId: product.id, productCode: product.code, productName: product.name, colorId: entityId('color', uuid(5)), colorName: 'SYNTHETIC red', fitId: entityId('fit', uuid(6)), fitName: 'SYNTHETIC fit A', sizeId: entityId('size', uuid(7)), sizeName: '160/XS', sizeGroupId: entityId('sizeGroup', uuid(8)), barcodeAvailability: 'UNAVAILABLE' };
const small: CurrentFormSku = { ...xs, id: entityId('sku', uuid(14)), skuCode: 'APPEND-TEST-S', sizeId: entityId('size', uuid(17)), sizeName: '165/S' };
const medium: CurrentFormSku = { ...xs, id: entityId('sku', uuid(24)), skuCode: 'APPEND-TEST-M', sizeId: entityId('size', uuid(27)), sizeName: '170/M' };
const blueXs: CurrentFormSku = { ...xs, id: entityId('sku', uuid(34)), skuCode: 'APPEND-TEST-BLUE-XS', colorId: entityId('color', uuid(35)), colorName: 'SYNTHETIC blue' };
const blueSmall: CurrentFormSku = { ...blueXs, id: entityId('sku', uuid(36)), skuCode: 'APPEND-TEST-BLUE-S', sizeId: small.sizeId, sizeName: small.sizeName };
const fitB: CurrentFormSku = { ...xs, id: entityId('sku', uuid(44)), skuCode: 'APPEND-TEST-FIT-B', fitId: entityId('fit', uuid(46)), fitName: 'SYNTHETIC fit B' };
const otherProduct: CurrentFormProduct = { ...product, id: entityId('product', uuid(53)), code: 'OTHER-TEST', name: 'SYNTHETIC other product' };
const other: CurrentFormSku = { ...xs, id: entityId('sku', uuid(54)), skuCode: 'OTHER-TEST-XS', productId: otherProduct.id, productCode: otherProduct.code, productName: otherProduct.name };
const group: DictionarySizeGroup = { id: xs.sizeGroupId, name: 'SYNTHETIC actual group', sizes: [xs, small, medium].map((row, i) => ({ id: row.sizeId, name: row.sizeName, displayOrder: i })) };
const warehouse = (n: number): CurrentTransferWarehouse => ({ id: entityId('warehouse', uuid(n)), name: `SYNTHETIC warehouse ${n}`, hallId: entityId('hall', uuid(90)), hallName: 'SYNTHETIC hall', enabled: true, hallEnabled: true, hasNonzeroInventory: false });
const sourceSnapshot = { productCode: 'OLD-CODE', productName: 'OLD product', colorName: 'OLD red', fitName: 'OLD fit', sizeName: 'OLD size', barcode: null };
const page = <T>(items: readonly T[]): CurrentFormPage<T> => ({ page: 1, pageSize: 20, exactTotal: BigInt(items.length), items });
function setup(skus: readonly CurrentFormSku[] = [xs, small, medium, blueXs, blueSmall, fitB, other]) {
  const context = new ReadContext({ accountId: uuid(99), sessionRevision: 'append-test', permissionRevision: 'append-test' });
  const scope = context.createScope('transfer-append-test');
  const reader: TransferProposalReader = {
    async readTransferWarehouses() { return page([warehouse(1), warehouse(2)]); },
    async readProducts() { return page([product, otherProduct]); },
    async readProductSkus(q) { return page(skus.filter(row => row.productId === q.productId)); },
    async readSizeGroups(q) { return { page: q.page, pageSize: q.pageSize, total: 1, items: [group] }; },
  };
  return new TransferProposalSession(scope, reader);
}
function saved(session: TransferProposalSession, rows: readonly TransferProposalLine[] = [{ sku: xs, product, quantity: '3', existingLineId: uuid(80), sourceSnapshot }]) {
  assert.equal(session.initializeFromSaved({ businessDate: '2026-10-29', note: 'SYNTHETIC append regression', from: warehouse(1), to: warehouse(2), lines: rows }), true);
}
async function pending(session: TransferProposalSession, target = xs, amount = '2') {
  await session.openPicker('PRODUCT');
  assert.equal(await session.selectPendingProduct(target.productId), true);
  assert.equal(session.selectPendingSpec('color', target.colorId), true);
  assert.equal(session.selectPendingSpec('fit', target.fitId), true);
  assert.equal(session.setPendingQuantity(target.id, amount), true);
}
function lines(session: TransferProposalSession) {
  return session.getSnapshot().draft.lines.map(row => ({ id: row.sku?.id ?? null, size: transferProposalLineIdentity(row).sizeId, quantity: row.quantity, existingLineId: row.existingLineId ?? null }));
}

test('APPEND-CONTEXT original same group/new size: cancel preserves both inputs; confirm adds only actual new SKU', async t => {
  const session = setup(); t.after(() => session.dispose()); saved(session); await pending(session, small);
  const before = session.getSnapshot();
  assert.equal(session.commitPending(), false, 'existing product/color/fit/actual group must confirm even with no overlapping size');
  assert.deepEqual(session.getSnapshot().appendRequest, { kind: 'entry', quantity: '2' });
  assert.equal(session.getSnapshot().draft, before.draft); assert.equal(session.getSnapshot().pending, before.pending);
  session.cancelAppend(); assert.equal(session.getSnapshot().appendRequest, null);
  assert.equal(session.getSnapshot().draft, before.draft); assert.equal(session.getSnapshot().pending, before.pending);
  assert.equal(session.commitPending(true), false, 'cancelled confirmation is not reusable');
  assert.equal(session.getSnapshot().draft, before.draft);
  assert.equal(session.commitPending(), false); assert.equal(session.commitPending(true), true);
  assert.deepEqual(lines(session), [{ id: xs.id, size: xs.sizeId, quantity: '3', existingLineId: uuid(80) }, { id: small.id, size: small.sizeId, quantity: '2', existingLineId: null }]);
  assert.equal(session.getSnapshot().draft.lines[0], before.draft.lines[0]);
  assert.deepEqual(session.getSnapshot().draft.lines[0]!.sourceSnapshot, sourceSnapshot);
  assert.equal(session.getSnapshot().pending.product, null); assert.equal(session.getSnapshot().appendRequest, null);
});

test('APPEND-CONTEXT exact same SKU keeps existing pointer/snapshot and exact bigint arithmetic', async t => {
  const session = setup(); t.after(() => session.dispose()); saved(session, [{ sku: xs, product, quantity: '9007199254740993', existingLineId: uuid(80), sourceSnapshot }]); await pending(session, xs);
  assert.equal(session.commitPending(), false); assert.deepEqual(session.getSnapshot().appendRequest, { kind: 'entry', quantity: '2' });
  assert.equal(session.commitPending(true), true);
  assert.deepEqual(lines(session), [{ id: xs.id, size: xs.sizeId, quantity: '9007199254740995', existingLineId: uuid(80) }]);
  assert.deepEqual(session.getSnapshot().draft.lines[0]!.sourceSnapshot, sourceSnapshot);
  assert.equal(session.getSnapshot().draft.lines[0]!.sku!.barcodeAvailability, 'UNAVAILABLE');
  assert.equal('barcode' in session.getSnapshot().draft.lines[0]!.sku!, false);
});

test('APPEND-CONTEXT local missing-SKU size uses same confirmation without inventing a native SKU', async t => {
  const session = setup([xs]); t.after(() => session.dispose()); saved(session); await pending(session, xs, '');
  await session.readSizeGroups({ search: '', page: 1, pageSize: 100 }, new AbortController().signal);
  assert.equal(session.setPendingSizeQuantity(group, small.sizeId, '2'), true);
  const before = session.getSnapshot(); assert.equal(session.commitPending(), false);
  assert.deepEqual(session.getSnapshot().appendRequest, { kind: 'entry', quantity: '2' }); assert.equal(session.getSnapshot().draft, before.draft);
  assert.equal(session.commitPending(true), true);
  const added = session.getSnapshot().draft.lines[1]!; assert.equal(added.sku, null);
  assert.equal(transferProposalLineIdentity(added).sizeId, small.sizeId); assert.equal(added.quantity, '2'); assert.equal(added.existingLineId, undefined);
  assert.equal(session.saveProposal(null), null, 'existing saved-line pointers cannot become a new document');
  assert.deepEqual(session.saveProposal(uuid(90))!.lines[1], { existingLineId: null, spec: { productId: product.id, colorId: xs.colorId, fitId: xs.fitId, sizeId: small.sizeId }, quantity: '2' });
});

for (const [name, target] of [['different color', blueXs], ['different fit', fitB], ['different product', other]] as const) {
  test(`APPEND-CONTEXT ${name} is a genuinely new group and does not require confirmation`, async t => {
    const session = setup(); t.after(() => session.dispose()); saved(session); await pending(session, target);
    assert.equal(session.commitPending(), true); assert.equal(session.getSnapshot().appendRequest, null);
    assert.deepEqual(lines(session).map(row => [row.id, row.quantity]), [[xs.id, '3'], [target.id, '2']]);
  });
}

test('APPEND-CONTEXT confirmation basis invalidates on pending edit, preserving the edited input', async t => {
  const session = setup(); t.after(() => session.dispose()); saved(session); await pending(session, small);
  assert.equal(session.commitPending(), false); const before = session.getSnapshot().draft;
  session.setPendingQuantity(small.id, '4'); assert.equal(session.getSnapshot().appendRequest, null);
  assert.equal(session.commitPending(true), false); assert.equal(session.getSnapshot().draft, before); assert.equal(session.getSnapshot().pending.quantities[small.id], '4');
  assert.equal(session.commitPending(), false); assert.deepEqual(session.getSnapshot().appendRequest, { kind: 'entry', quantity: '4' });
  assert.equal(session.commitPending(true), true); assert.equal(session.getSnapshot().draft.lines[1]!.quantity, '4');
});

test('APPEND-CONTEXT confirmation basis invalidates on original line edit, retaining exact new original quantity', async t => {
  const session = setup(); t.after(() => session.dispose()); saved(session); await pending(session, small);
  assert.equal(session.commitPending(), false); session.setQuantity(xs.id, '7'); const before = session.getSnapshot().draft;
  assert.equal(session.commitPending(true), false); assert.equal(session.getSnapshot().draft, before);
  assert.equal(session.commitPending(), false); assert.equal(session.commitPending(true), true);
  assert.deepEqual(lines(session).map(row => [row.id, row.quantity]), [[xs.id, '7'], [small.id, '2']]);
});

test('APPEND-CONTEXT replacement into existing group/new size confirms; cancellation restores original group and bottom entry', async t => {
  const session = setup(); t.after(() => session.dispose());
  saved(session, [{ sku: xs, product, quantity: '3', existingLineId: uuid(80), sourceSnapshot }, { sku: blueSmall, product, quantity: '2', existingLineId: uuid(81) }]);
  await pending(session, other, '4'); const before = session.getSnapshot();
  assert.equal(session.beginReplacement(transferProposalRowKey(blueSmall)), true); await session.readPendingSkus();
  assert.equal(session.selectPendingSpec('color', xs.colorId), true); assert.equal(session.selectPendingSpec('fit', xs.fitId), true);
  assert.equal(session.getSnapshot().pending.quantities[small.id], '2');
  assert.equal(session.commitPending(), false); assert.deepEqual(session.getSnapshot().appendRequest, { kind: 'replace', quantity: '2' });
  assert.equal(session.getSnapshot().draft, before.draft); session.cancelAppend(); assert.equal(session.getSnapshot().draft, before.draft);
  session.cancelReplacement(); assert.equal(session.getSnapshot().draft, before.draft); assert.equal(session.getSnapshot().pending, before.pending);
  assert.equal(session.beginReplacement(transferProposalRowKey(blueSmall)), true); await session.readPendingSkus();
  session.selectPendingSpec('color', xs.colorId); session.selectPendingSpec('fit', xs.fitId);
  assert.equal(session.commitPending(), false); assert.equal(session.commitPending(true), true);
  assert.deepEqual(lines(session), [{ id: xs.id, size: xs.sizeId, quantity: '3', existingLineId: uuid(80) }, { id: small.id, size: small.sizeId, quantity: '2', existingLineId: uuid(81) }]);
  assert.equal(session.getSnapshot().pending, before.pending); assert.equal(session.getSnapshot().replacement, null);
});

test('APPEND-CONTEXT replacement to self has no extra prompt or quantity append', async t => {
  const session = setup(); t.after(() => session.dispose()); saved(session);
  assert.equal(session.beginReplacement(transferProposalRowKey(xs)), true); await session.readPendingSkus();
  assert.equal(session.commitPending(), true); assert.equal(session.getSnapshot().appendRequest, null);
  assert.deepEqual(lines(session), [{ id: xs.id, size: xs.sizeId, quantity: '3', existingLineId: uuid(80) }]);
  assert.deepEqual(session.getSnapshot().draft.lines[0]!.sourceSnapshot, sourceSnapshot);
});

test('APPEND-CONTEXT in-flight replacement is fail-closed if an original line changes after prompt', async t => {
  const session = setup(); t.after(() => session.dispose());
  saved(session, [{ sku: xs, product, quantity: '3', existingLineId: uuid(80), sourceSnapshot }, { sku: blueSmall, product, quantity: '2', existingLineId: uuid(81) }]);
  assert.equal(session.beginReplacement(transferProposalRowKey(blueSmall)), true); await session.readPendingSkus();
  session.selectPendingSpec('color', xs.colorId); session.selectPendingSpec('fit', xs.fitId);
  assert.equal(session.commitPending(), false); assert.equal(session.getSnapshot().appendRequest?.kind, 'replace');
  assert.equal(session.setQuantity(blueSmall.id, '9'), true); const before = session.getSnapshot().draft;
  assert.equal(session.commitPending(true), false); assert.equal(session.getSnapshot().draft, before); assert.match(session.getSnapshot().notice!, /原行数量已变化/);
  session.cancelReplacement(); assert.equal(session.getSnapshot().draft, before); assert.equal(session.getSnapshot().replacement, null);
  assert.equal(session.getSnapshot().draft.lines.find(row => row.sku?.id === blueSmall.id)!.quantity, '9');
});

test('APPEND-CONTEXT existing nonzero matrix duplicate still sums only the matching coordinate', async t => {
  const session = setup([xs, small]); t.after(() => session.dispose()); saved(session);
  await session.readSizeGroups({ search: '', page: 1, pageSize: 100 }, new AbortController().signal);
  assert.equal(session.setMatrixSizeQuantity(transferProposalRowKey(xs), group, medium.sizeId, '5'), true);
  await pending(session, xs, ''); assert.equal(session.setPendingSizeQuantity(group, medium.sizeId, '2'), true);
  assert.equal(session.commitPending(), false); assert.equal(session.commitPending(true), true);
  assert.equal(session.getSnapshot().draft.lines[0]!.quantity, '3'); assert.equal(session.getSnapshot().draft.lines[1]!.quantity, '7');
  assert.equal(session.getSnapshot().draft.lines[1]!.sku, null); assert.deepEqual(session.getSnapshot().matrixQuantities, {});
});
