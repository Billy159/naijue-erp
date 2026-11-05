import assert from 'node:assert/strict';
import test from 'node:test';
import { TransferCommandError, type TransferCommandDto } from './contracts.ts';
import { createTransferCommandHttpClient } from './http-client.ts';
import { draft, result, receipt, uuid } from './fixtures.test-support.ts';
const command = (): TransferCommandDto => ({ action: 'SAVE', requestKey: 'TEST.original:1', expectedVersion: null, draft: draft() });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
test('SYNTHETIC transfer HTTP client: inert exact native URLs, body, credentials and receipt correlation, no automatic retry', async () => {
  const calls: { url: string; init: RequestInit }[] = [], c = command(); const client = createTransferCommandHttpClient({ origin: 'https://synthetic.test', basePath: '/api', fetch: async (url, init) => { calls.push({ url, init }); return json(init.method === 'POST' ? result(c) : receipt(c)); } });
  assert.equal(calls.length, 0); await client.execute(c, new AbortController().signal); assert.equal(calls[0]!.url, 'https://synthetic.test/api/transfers/commands'); assert.equal(calls[0]!.init.credentials, 'same-origin'); assert.deepEqual(JSON.parse(String(calls[0]!.init.body)), c); assert.equal((JSON.parse(String(calls[0]!.init.body)) as { actor?: unknown }).actor, undefined);
  await client.receipt(c, new AbortController().signal); assert.equal(calls[1]!.url, 'https://synthetic.test/api/transfers/receipts/TEST.original%3A1'); assert.equal(calls[1]!.init.method, 'GET'); assert.equal(calls.length, 2);
});
test('SYNTHETIC transfer HTTP client: wire rejection is definitive; malformed result/network/redirect remain uncertain', async () => {
  for (const [response, outcome] of [[json({ error: { code: 'VERSION_CONFLICT', message: 'not retained' } }, 409), 'rejected'], [json({ ...result(command()), transferId: uuid(999) }), 'uncertain'], [new Response('bad', { status: 502 }), 'uncertain']] as const) {
    const client = createTransferCommandHttpClient({ origin: 'https://synthetic.test', basePath: '', fetch: async () => response }); await assert.rejects(client.execute(command(), new AbortController().signal), e => e instanceof TransferCommandError && e.outcome === outcome);
  }
  let calls = 0; const client = createTransferCommandHttpClient({ origin: 'https://synthetic.test', basePath: '', fetch: async () => { calls++; throw new Error('private detail'); } }); await assert.rejects(client.execute(command(), new AbortController().signal), e => e instanceof TransferCommandError && e.outcome === 'uncertain' && !e.message.includes('private')); assert.equal(calls, 1);
});
test('SYNTHETIC transfer HTTP client: input/abort before dispatch sends nothing; receipt404 is read only', async () => {
  let calls = 0; const client = createTransferCommandHttpClient({ origin: 'https://synthetic.test', basePath: '', fetch: async () => { calls++; return json({ error: { code: 'RECEIPT_NOT_FOUND', message: 'Absent' } }, 404); } });
  await assert.rejects(client.execute({ ...command(), actor: 'spoof' } as unknown as TransferCommandDto, new AbortController().signal), e => e instanceof TransferCommandError && e.outcome === 'not-sent');
  const signal = AbortSignal.abort(); await assert.rejects(client.execute(command(), signal), e => e instanceof TransferCommandError && e.outcome === 'not-sent'); assert.equal(calls, 0);
  await assert.rejects(client.receipt(command(), new AbortController().signal), e => e instanceof TransferCommandError && e.code === 'RECEIPT_NOT_FOUND' && e.outcome === 'read');
});
test('SYNTHETIC transfer native snapshot409 codes are definitive rollback rejections; unknown409 stays uncertain', async () => {
  for (const code of ['NATIVE_TRANSFER_SNAPSHOT_UNAVAILABLE', 'TRANSFER_SNAPSHOT_MISMATCH', 'UNRECOGNIZED_FUTURE_ERROR']) {
    const client = createTransferCommandHttpClient({ origin: 'https://synthetic.test', basePath: '', fetch: async () => json({ error: { code, message: 'not retained' } }, 409) });
    await assert.rejects(() => client.execute(command(), new AbortController().signal), error => error instanceof TransferCommandError
      && error.outcome === (code === 'UNRECOGNIZED_FUTURE_ERROR' ? 'uncertain' : 'rejected'));
  }
});
