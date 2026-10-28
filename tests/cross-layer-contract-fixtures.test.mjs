/** H04: one fixture crosses the real browser owner, HTTP adapter and application
 * parser. The store is a synthetic seam; PostgreSQL commit/rollback and posting
 * evidence remains the original P04 integration driver's responsibility. */
import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { createHistoryRevisionHttpPlugin } from '../apps/api/src/history-revision-http.ts';
import { HistoryRevisionOwner } from '../apps/web/demo-replica/frontend/runtime/documents/history-revision.ts';
import { ReadContext } from '../apps/web/src/loading/read-scope.ts';
import { DomainError } from '../packages/domain/src/errors.ts';
import { historyActor, historyId } from './support/imported-history-query-fixtures.ts';

for (const kind of ['sales', 'transfers']) {
  for (const lostAt of ['response', 'commit-acknowledgement']) {
    test(`H04 ${kind}: ${lostAt} keeps the same command through UI, HTTP and recovery`, async t => {
      const command = {
        kind, documentId: historyId(3), expectedVersion: 1,
        requestKey: `H04-${kind}-${lostAt}`, reason: 'Synthetic cross-layer original-key fixture',
        lines: [{ lineId: historyId(8), quantity: '3' }], totals: null, settlements: [],
        ...(kind === 'transfers' ? { header: { responsibleStaffId: null } } : {}),
      };
      const receipt = {
        dataset: 'HISTORY', kind, documentId: command.documentId,
        operationId: historyId(9), revisionId: historyId(10), version: 2,
        ledgerEntryIds: kind === 'transfers' ? [historyId(11), historyId(12)] : [historyId(11)],
      };
      const app = Fastify(), storeCommands = [];
      t.after(() => app.close());
      app.register(createHistoryRevisionHttpPlugin({
        authenticate: async () => historyActor,
        dependencies: {
          now: () => '2026-10-28T00:00:00Z',
          authorization: { async authorize(actor, input) {
            assert.equal(actor.accountId, historyActor.accountId);
            return { actorAccountId: actor.accountId, dataset: 'HISTORY', kind: input.kind, documentId: input.documentId };
          } },
          store: { async revise(actor, input, grant, _now, signal) {
            assert.equal(actor.accountId, historyActor.accountId);
            assert.equal(grant.dataset, 'HISTORY');
            assert.equal(signal.aborted, false);
            storeCommands.push(structuredClone(input));
            if (lostAt === 'commit-acknowledgement' && storeCommands.length === 1) {
              throw new DomainError('HISTORY_REVISION_COMMIT_OUTCOME_UNKNOWN', 'Synthetic acknowledgement loss');
            }
            // A real store must obtain this receipt through original-key lookup.
            return receipt;
          } },
        },
      }), { prefix: '/api' });
      const context = new ReadContext({ accountId: historyActor.accountId, sessionRevision: 'h04-session', permissionRevision: 'h04-permission' });
      const scope = context.createScope('h04-history', command.documentId);
      t.after(() => context.clear());
      const requests = [], statuses = [];
      const owner = new HistoryRevisionOwner({
        scope, target: { kind, documentId: command.documentId, batchId: historyId(4), effectiveVersion: 1 },
        denied: () => assert.fail('No authorization denial is expected'),
        http: { origin: 'http://127.0.0.1:3000', basePath: '/api', fetch: async (url, init) => {
          assert.equal(init.method, 'POST');
          assert.equal(init.credentials, 'same-origin');
          requests.push(String(init.body));
          const response = await app.inject({ method: 'POST', url: new URL(url).pathname,
            headers: { 'content-type': 'application/json' }, payload: String(init.body) });
          statuses.push(response.statusCode);
          if (lostAt === 'response' && requests.length === 1) throw Error('Synthetic response lost after HTTP completion');
          return new Response(response.body, { status: response.statusCode, headers: { 'content-type': 'application/json' } });
        } },
      });
      assert.equal(await owner.submit(command), false);
      assert.equal(owner.getSnapshot().phase, 'uncertain');
      assert.equal(owner.getSnapshot().receipt, null);
      assert.deepEqual(storeCommands, [command]);
      assert.equal(await owner.submit({ ...command, requestKey: command.requestKey + '-different' }), false);
      assert.equal(requests.length, 1, 'An unresolved operation must not dispatch a new key');
      assert.equal(await owner.replayOriginal(), true);
      assert.equal(requests.length, 2);
      assert.equal(requests[0], requests[1], 'Recovery must retain the exact body and original key');
      assert.deepEqual(storeCommands, [command, command]);
      assert.deepEqual(statuses, [lostAt === 'response' ? 200 : 503, 200]);
      assert.equal(owner.getSnapshot().phase, 'committed');
      assert.deepEqual(owner.getSnapshot().receipt, receipt);
      if (kind === 'transfers') assert.equal(storeCommands[1].header.responsibleStaffId, null);
    });
  }
}
