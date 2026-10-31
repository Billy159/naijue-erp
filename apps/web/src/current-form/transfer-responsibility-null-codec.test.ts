import test from 'node:test';
import assert from 'node:assert/strict';
import type { NativeTransferCreateProposal, NativeTransferExistingProposal } from '../../../../packages/application/src/native-transfer-preparation.ts';
import { draft } from '../transfers/commands/fixtures.test-support.ts';
import { createTransferPreparationHttpClient } from './transfer-create.ts';
import { createTransferExistingPreparationHttpClient } from './existing-document-preparation.ts';

// Synthetic response-boundary tests only. No actual API, SAVE, staff lookup or persistence is exercised.
const staffId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
function preparation(responsibility: {} | { responsibleStaffId: string | null }) {
  const source = draft(), prepared = { ...source, header: { ...source.header, ...responsibility }, lines: [{ ...source.lines[0]!, quantity: '1' }] };
  const intent: NativeTransferCreateProposal = { businessDate: prepared.header.businessDate, note: prepared.header.note, fromWarehouseId: prepared.header.fromWarehouseId, toWarehouseId: prepared.header.toWarehouseId, lines: prepared.lines.map(line => ({ skuId: line.skuId, quantity: line.quantity })), ...responsibility };
  return { prepared, intent };
}

test('actual frontend create preparation client accepts preserved omitted/null/UUID responsibility with a read-only POST only', async () => {
  for (const responsibility of [{}, { responsibleStaffId: null }, { responsibleStaffId: staffId }]) {
    const { prepared, intent } = preparation(responsibility), calls: { url: string; init: RequestInit }[] = [];
    const client = createTransferPreparationHttpClient({ origin: 'https://synthetic.test', basePath: '/api', fetch: async (url, init) => { calls.push({ url, init }); return json(prepared); } });
    assert.equal(calls.length, 0);
    const parsed = await client.prepareCreate(intent, new AbortController().signal);
    assert.equal(Object.hasOwn(parsed.header, 'responsibleStaffId'), Object.hasOwn(intent, 'responsibleStaffId'));
    assert.equal(parsed.header.responsibleStaffId, intent.responsibleStaffId);
    assert.equal(calls.length, 1); assert.equal(calls[0]!.url, 'https://synthetic.test/api/transfers/prepare-create');
    assert.equal(calls[0]!.init.method, 'POST'); assert.equal(calls[0]!.init.credentials, 'same-origin');
    assert.deepEqual(JSON.parse(String(calls[0]!.init.body)), intent);
    assert.equal(Object.hasOwn(parsed.header, 'createdByAccountId'), false);
  }
});

test('actual frontend existing preparation preserves unknown/null without replacing it with current staff, and keeps CAS', async () => {
  for (const responsibility of [{}, { responsibleStaffId: null }, { responsibleStaffId: staffId }]) {
    const { prepared } = preparation(responsibility);
    const intent: NativeTransferExistingProposal = { transferId: prepared.header.id, expectedVersion: 2, businessDate: prepared.header.businessDate, note: prepared.header.note, fromWarehouseId: prepared.header.fromWarehouseId, toWarehouseId: prepared.header.toWarehouseId, lines: prepared.lines.map(line => ({ existingLineId: line.id, skuId: line.skuId, quantity: line.quantity })), ...responsibility };
    const calls: { url: string; init: RequestInit }[] = [];
    const client = createTransferExistingPreparationHttpClient({ origin: 'https://synthetic.test', basePath: '/api', fetch: async (url, init) => { calls.push({ url, init }); return json({ expectedVersion: 2, draft: prepared }); } });
    const parsed = await client.prepareExisting(intent, new AbortController().signal);
    assert.equal(parsed.expectedVersion, 2);
    assert.equal(Object.hasOwn(parsed.draft.header, 'responsibleStaffId'), Object.hasOwn(intent, 'responsibleStaffId'));
    assert.equal(parsed.draft.header.responsibleStaffId, intent.responsibleStaffId);
    assert.equal(calls.length, 1); assert.equal(calls[0]!.url, 'https://synthetic.test/api/transfers/prepare-existing');
    assert.deepEqual(JSON.parse(String(calls[0]!.init.body)), intent);
  }
});

test('nullable preparation still rejects mismatched responsibility and injected immutable creator facts', async () => {
  const { prepared, intent } = preparation({ responsibleStaffId: null });
  for (const header of [{ ...prepared.header, responsibleStaffId: staffId }, { ...prepared.header, createdByAccountId: 'aaaaaaaa-bbbb-cccc-dddd-ffffffffffff' }]) {
    let calls = 0;
    const client = createTransferPreparationHttpClient({ origin: 'https://synthetic.test', basePath: '/api', fetch: async () => { calls++; return json({ ...prepared, header }); } });
    await assert.rejects(() => client.prepareCreate(intent, new AbortController().signal), { kind: 'malformed-response' });
    assert.equal(calls, 1, 'no SAVE or retry is sent by preparation client');
  }
});
