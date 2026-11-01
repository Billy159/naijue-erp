/** Intentional target RED only. Not registered in root checks and not an existing ERP regression. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { frozenProfile, readyCase, actualGolden, expectedGolden, endpointCounts, signal } from './offline-harness.mjs';

for (const kind of ['sales', 'transfer']) {
  test(`OPT01 target RED: 30-product ${kind} after-detail DATA requests must fit ${kind === 'sales' ? 1 : 2}`, async t => {
    const profile = await frozenProfile(kind, 'distinct30'), model = await readyCase(profile);
    try {
      // Establish the real original initializer's valid semantic outcome BEFORE asserting the new budget.
      assert.deepEqual(actualGolden(kind, model.draft), expectedGolden(profile, model.input));
      if (kind === 'transfer') {
        // Original strict reader for the canonical form's required dictionary dependency.
        // This is protocol evidence, not execution of React effects or a claim of browser readiness.
        const groups = await model.session.getSnapshot().proposal.readSizeGroups({ search: '', page: 1, pageSize: 100 }, signal());
        const wanted = new Set(model.draft.lines.map(row => row.sku.sizeGroupId));
        assert.ok([...wanted].every(id => groups.items.some(group => group.id === id)));
        assert.deepEqual(groups.items, profile.sizeGroups, 'Original dictionary/session path must retain all members and their order.');
        for (const line of model.draft.lines) {
          assert.ok(groups.items.find(group => group.id === line.sku.sizeGroupId)?.sizes.some(size => size.id === line.sku.sizeId));
        }
      }
      const budget = kind === 'sales' ? 1 : 2;
      t.diagnostic(JSON.stringify({ kind, observedOfflineDataRequests: model.calls.length, budget, endpoints: endpointCounts(model.calls),
        evidence: 'OFFLINE_ORIGINAL_INITIALIZER_PLUS_DICTIONARY_DEPENDENCY_NOT_BROWSER_TIMING', fixture: 'FROZEN_V2_UNCHANGED' }));
      assert.ok(model.calls.length <= budget,
        `OPT01_REQUEST_BUDGET: ${kind} observed ${model.calls.length} after-detail DATA requests; target <= ${budget}. Original proposal is valid; optimization is not implemented.`);
    } finally { model.dispose(); }
  });
}
