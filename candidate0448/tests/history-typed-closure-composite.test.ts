/** Typed host/store seam negative tests only. Production source providers are deliberately unavailable. */
import test from "node:test";
import assert from "node:assert/strict";
import { openAuthorizedHistoryClosureReader, HISTORY_CLOSURE_SOURCE_GROUPS } from "../scripts/import-v2/authorized-history-closure-reader.mjs";
import type { HistoryClosureSourceFactory, HistoryClosureSourceGroup, HistoryClosureSourceSession } from "../scripts/import-v2/authorized-history-closure-reader.mjs";
import { PostgresHistoryTypedClosureStore } from "../adapters/postgres/src/history-typed-closure.ts";
import { closureInput } from "./support/history-closure-fixtures.ts";
for (const unavailable of ["PARTIES", "HEADERS"] as const) test(`missing production ${unavailable} source/mapping or completed original header evidence rejects before store connection`, async () => {
 const input = closureInput(); let opened = 0, closed = 0, connections = 0;
 const factory = (group: HistoryClosureSourceGroup): HistoryClosureSourceFactory => async () => {
  if (group === unavailable) throw Error("PRODUCTION_SOURCE_OR_ORIGINAL_HEADER_COMPLETION_MISSING");
  opened++;
  const session: HistoryClosureSourceSession = { verify: async () => {}, sourceRows: function* () {}, typedRows: function* () {}, documents: function* () {}, close: async () => { closed++; } };
  return session;
 };
 const openSources = Object.fromEntries(HISTORY_CLOSURE_SOURCE_GROUPS.map(g => [g, factory(g)])) as Record<HistoryClosureSourceGroup, HistoryClosureSourceFactory>;
 const composite = await openAuthorizedHistoryClosureReader({ scope: { batchId: input.batchId, fixedSourceNamespace: input.fixedSourceNamespace, selectionSha256: input.plan.selectionSha256, authorizedPayloadHash: input.plan.authorizedPayloadHash, expectedCounts: input.plan.expectedCounts, expectedSourceEntityCounts: input.plan.sourceEntityCounts }, openSources, trustedSelectionSha256: input.plan.selectionSha256, trustedAuthorizedPayloadHash: input.plan.authorizedPayloadHash });
 const store = new PostgresHistoryTypedClosureStore({ async connect() { connections++; throw Error("MUST_NOT_CONNECT"); } }, { authorizeStage: composite.authorizeStage });
 await assert.rejects(store.stage(input), /PRODUCTION_SOURCE_OR_ORIGINAL_HEADER_COMPLETION_MISSING/);
 assert.equal(connections, 0); assert.equal(closed, opened); await composite.close();
});
