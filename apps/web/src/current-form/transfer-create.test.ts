import test from 'node:test';
import assert from 'node:assert/strict';
import { entityId } from '../../../../packages/domain/src/values.ts';
import type { NativeTransferCreateProposal } from '../../../../packages/application/src/native-transfer-preparation.ts';
import type { CurrentFormProduct, CurrentFormSku, CurrentTransferWarehouse } from '../../../../packages/application/src/current-form-ports.ts';
import { ReadContext } from '../loading/read-scope.ts';
import { TransferCommandWorkspace } from '../transfers/commands/controller.ts';
import { TransferCommandError, type TransferCommandDto, type TransferDraftDto } from '../transfers/commands/contracts.ts';
import { draft, detail, result, receipt, uuid, deferred } from '../transfers/commands/fixtures.test-support.ts';
import { TransferProposalSession } from './transfer-proposal.ts';
import { TransferNewDocumentSession, createTransferPreparationHttpClient, transferPreparationIntent, type TransferCreatePreparation } from './transfer-create.ts';
const native = { ...draft(), lines: [{ ...draft().lines[0]!, quantity: '1' }] } as TransferDraftDto;
const product: CurrentFormProduct = { id: entityId('product', uuid(50)), code: 'TEST', name: 'TEST product', retailPrice: null, minimumPriceAvailability: 'UNAVAILABLE' };
const sku: CurrentFormSku = { id: entityId('sku', native.lines[0]!.skuId), skuCode: 'TEST-SKU', productId: product.id, productCode: product.code, productName: product.name, colorId: entityId('color', uuid(5)), colorName: 'TEST red', fitId: entityId('fit', uuid(6)), fitName: 'TEST fit', sizeId: entityId('size', uuid(7)), sizeName: '165/S', sizeGroupId: entityId('sizeGroup', uuid(8)), barcodeAvailability: 'UNAVAILABLE' };
const warehouse = (id: string): CurrentTransferWarehouse => ({ id: entityId('warehouse', id), name: 'TEST warehouse', hallId: entityId('hall', uuid(90)), hallName: 'TEST hall', enabled: true, hallEnabled: true, hasNonzeroInventory: false });
const page = <T>(items: readonly T[]) => ({ page: 1, pageSize: 20 as const, exactTotal: BigInt(items.length), items });
async function setup(preparation?: TransferCreatePreparation, uncertain = false) {
  const context = new ReadContext({ accountId: 'TEST', sessionRevision: '1', permissionRevision: '1' }), scope = context.createScope('new-transfer');
  const proposal = new TransferProposalSession(scope, {
    async readTransferWarehouses() { return page([warehouse(native.header.fromWarehouseId), warehouse(native.header.toWarehouseId)]); },
    async readProducts() { return page([product]); }, async readProductSkus() { return page([sku]); },
  });
  const commands: TransferCommandDto[] = [], intents: NativeTransferCreateProposal[] = [];
  const workspace = new TransferCommandWorkspace({ scope, reader: { async readDetail() { return detail(); } }, newRequestKey: () => 'TEST.new-transfer', onAccessFailure() {}, client: {
    async execute(command) { commands.push(command); if (uncertain) throw new TransferCommandError('network', 'NETWORK', 'uncertain'); return result(command); }, async receipt(command) { return receipt(command); },
  } });
  const session = new TransferNewDocumentSession({ scope, proposal, workspace, preparation: preparation ?? { async prepareCreate(intent) { intents.push(intent); return native; } } });
  proposal.setHeader({ businessDate: native.header.businessDate, note: native.header.note! });
  await proposal.openPicker('FROM'); await proposal.select(native.header.fromWarehouseId); await proposal.openPicker('TO'); await proposal.select(native.header.toWarehouseId);
  await proposal.openPicker('PRODUCT'); await proposal.select(product.id); await proposal.select(sku.id); proposal.closePicker();
  return { session, proposal, workspace, context, scope, commands, intents };
}
test('validated proposal→native preparation→one actual SAVE with null CAS; browser snapshot facts are not sent to preparation', async () => {
  const h = await setup(); assert.equal(h.commands.length, 0); assert.equal(await h.session.save(), true);
  assert.equal(h.intents.length, 1); assert.deepEqual(Object.keys(h.intents[0]!).sort(), ['businessDate', 'fromWarehouseId', 'lines', 'note', 'toWarehouseId']);
  assert.deepEqual(h.intents[0]!.lines, [{ skuId: sku.id, quantity: '1' }]);
  assert.equal(h.commands.length, 1); const command = h.commands[0]!; assert.equal(command.action, 'SAVE'); assert.equal(command.expectedVersion, null);
  if (command.action !== 'SAVE') throw Error(); assert.ok('draft' in command); assert.equal(command.draft.lines[0]!.snapshot.barcode, '001234567890123'); assert.equal(command.draft.header.number, native.header.number);
  assert.equal(h.workspace.getSnapshot().write.phase, 'committed'); assert.equal(await h.session.save(), false); assert.equal(h.commands.length, 1);
});
test('duplicate save while preparation pending rejected; any raw edit cancels and stale response never writes', async () => {
  const pending = deferred<TransferDraftDto>(); let signal!: AbortSignal;
  const h = await setup({ prepareCreate: async (_intent, readSignal) => { signal = readSignal; return pending.promise; } });
  const saving = h.session.save(); assert.equal(await h.session.save(), false); h.proposal.setHeader({ note: 'changed' }); assert.equal(signal.aborted, true);
  pending.resolve(native); assert.equal(await saving, false); assert.equal(h.commands.length, 0); assert.equal(h.workspace.getSnapshot().editor, null);
});
test('cancel/reset/identity invalidate prepare responses, while local input remains until explicit discard', async () => {
  for (const mode of ['cancel', 'reset', 'identity'] as const) {
    const pending = deferred<TransferDraftDto>(); const h = await setup({ prepareCreate: async () => pending.promise }); const saving = h.session.save();
    if (mode === 'cancel') h.session.cancelPreparation(); else if (mode === 'reset') h.proposal.reset(true); else h.context.clear();
    pending.resolve(native); assert.equal(await saving, false); assert.equal(h.commands.length, 0);
    if (mode === 'cancel') assert.equal(h.proposal.getSnapshot().draft.lines.length, 1);
  }
});
test('unavailable/mismatched/missing-barcode preparation never sends SAVE; explicit retry retains user proposal', async () => {
  for (const prepared of [null, { ...native, header: { ...native.header, toWarehouseId: entityId('warehouse', uuid(999)) } }, { ...native, lines: [{ ...native.lines[0]!, snapshot: { ...native.lines[0]!.snapshot, barcode: null } }] }]) {
    const h = await setup({ async prepareCreate() { if (!prepared) throw Error('service absent'); return prepared; } });
    assert.equal(await h.session.save(), false); assert.equal(h.commands.length, 0); assert.equal(h.proposal.getSnapshot().draft.lines.length, 1); assert.match(h.session.getSnapshot().notice!, /未发送保存命令/);
  }
});
test('uncertain native SAVE stays owned by existing workspace; another prepare/save forbidden and receipt recovery uses original operation', async () => {
  const h = await setup(undefined, true); assert.equal(await h.session.save(), false); assert.equal(h.workspace.getSnapshot().write.phase, 'uncertain');
  assert.equal(await h.session.save(), false); assert.equal(h.intents.length, 1); assert.equal(h.workspace.canLeave(), false);
  h.session.cancelPreparation(); assert.equal(h.workspace.getSnapshot().write.phase, 'uncertain'); assert.equal(await h.workspace.checkReceipt(), true); assert.equal(h.workspace.getSnapshot().write.phase, 'committed');
});
test('preparation client is inert, bounded same-origin exact intent and validates returned intent binding', async () => {
  const h = await setup(), intent = transferPreparationIntent(h.proposal.validate()!); const calls: { url: string; init: RequestInit }[] = [];
  const client = createTransferPreparationHttpClient({ origin: 'https://synthetic.test', basePath: '/api', fetch: async (url, init) => { calls.push({ url, init }); return new Response(JSON.stringify(native), { headers: { 'content-type': 'application/json' } }); } });
  assert.equal(calls.length, 0); assert.equal((await client.prepareCreate(intent, new AbortController().signal)).header.id, native.header.id);
  assert.equal(calls[0]!.url, 'https://synthetic.test/api/transfers/prepare-create'); assert.equal(calls[0]!.init.credentials, 'same-origin'); assert.deepEqual(JSON.parse(calls[0]!.init.body as string), intent);
  assert.throws(() => client.prepareCreate({ ...intent, actor: 'FORGED' } as never, new AbortController().signal)); assert.equal(calls.length, 1);
  const mismatched = createTransferPreparationHttpClient({ origin: 'https://synthetic.test', basePath: '', fetch: async () => new Response(JSON.stringify({ ...native, lines: [{ ...native.lines[0]!, quantity: '2' }] }), { headers: { 'content-type': 'application/json' } }) });
  await assert.rejects(() => mismatched.prepareCreate(intent, new AbortController().signal), { kind: 'malformed-response' });
});
test('cross-identity proposal/workspace composition is rejected', async () => {
  const h = await setup(); const foreign = new ReadContext({ accountId: 'OTHER', sessionRevision: '1', permissionRevision: '1' }).createScope('foreign');
  assert.throws(() => new TransferNewDocumentSession({ proposal: h.proposal, workspace: h.workspace, scope: foreign, preparation: { async prepareCreate() { return native; } } }));
});

test('shared budgets accept 200-line preparation with escaped note and multi-byte native snapshots, then actual SAVE', async () => {
  const { TRANSFER_PREPARE_MAX_REQUEST_BYTES, TRANSFER_COMMAND_MAX_REQUEST_BYTES, TRANSFER_PREPARED_RESPONSE_MAX_BYTES } = await import('../../../../packages/application/src/transfer-payload-budget.ts');
  const { createTransferCommandHttpClient } = await import('../transfers/commands/http-client.ts');
  const large: TransferDraftDto = { header: { ...native.header, note: '\u0001'.repeat(10000) }, lines: Array.from({ length: 200 }, (_, index) => ({ ...native.lines[0]!, id: entityId('transferLine', uuid(1000 + index)), skuId: entityId('sku', uuid(2000 + index)), lineNo: index + 1, quantity: '9223372036854775807', snapshot: { ...native.lines[0]!.snapshot, productName: '合成商品'.repeat(30) } })) };
  const intent: NativeTransferCreateProposal = { businessDate: large.header.businessDate, note: large.header.note, fromWarehouseId: large.header.fromWarehouseId, toWarehouseId: large.header.toWarehouseId, lines: large.lines.map(row => ({ skuId: row.skuId, quantity: row.quantity })) };
  const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
  assert.ok(bytes(intent) > 65536 && bytes(intent) < TRANSFER_PREPARE_MAX_REQUEST_BYTES); assert.ok(bytes(large) < TRANSFER_PREPARED_RESPONSE_MAX_BYTES);
  let reads = 0, writes = 0;
  const preparation = createTransferPreparationHttpClient({ origin: 'https://synthetic.test', basePath: '', fetch: async (_url, init) => { reads++; assert.equal(new TextEncoder().encode(String(init.body)).byteLength, bytes(intent)); return new Response(JSON.stringify(large), { headers: { 'content-type': 'application/json' } }); } });
  const prepared = await preparation.prepareCreate(intent, new AbortController().signal);
  const command: TransferCommandDto = { action: 'SAVE', requestKey: 'TEST.large', expectedVersion: null, draft: prepared }; assert.ok(bytes(command) > 65536 && bytes(command) < TRANSFER_COMMAND_MAX_REQUEST_BYTES);
  const client = createTransferCommandHttpClient({ origin: 'https://synthetic.test', basePath: '', fetch: async (_url, init) => { writes++; assert.equal(new TextEncoder().encode(String(init.body)).byteLength, bytes(command)); return new Response(JSON.stringify(result(command)), { headers: { 'content-type': 'application/json' } }); } });
  assert.equal((await client.execute(command, new AbortController().signal)).status, 'DRAFT'); assert.equal(reads, 1); assert.equal(writes, 1);
  await assert.rejects(() => client.execute({ ...command, draft: { ...prepared, header: { ...prepared.header, note: '界'.repeat(TRANSFER_COMMAND_MAX_REQUEST_BYTES) } } }, new AbortController().signal), error => error instanceof TransferCommandError && error.outcome === 'not-sent'); assert.equal(writes, 1);
});
test('resolved editor discarded outside the manual view cannot reuse handed-off proposal', async () => {
  const h = await setup(); assert.equal(await h.session.save(), true); assert.equal(h.workspace.discardEditor(), true);
  assert.equal(h.session.getSnapshot().nativeHandoff, true); assert.equal(await h.session.save(), false); assert.equal(h.intents.length, 1); assert.equal(h.commands.length, 1);
});
