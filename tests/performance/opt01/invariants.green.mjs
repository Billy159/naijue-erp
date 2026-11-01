/** GREEN baseline invariants, not browser/PG/performance acceptance. Explicit invocation only. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  frozenProfile, inputFor, readyCase, sessionFor, transportFor, jsonResponse,
  expectedGolden, actualGolden, dataHash, signal, syntheticId, deferred,
  endpointCounts, createCurrentFormHttpReader, validateDictionarySizeGroup,
  sourceIdentity, profileManifest,
} from './offline-harness.mjs';

test('evidence is bound to immutable original C03 and all six frozen v2 profiles', async t => {
  for (const row of profileManifest.profiles) {
    const profile = await frozenProfile(row.kind, row.shape);
    assert.equal(profile.logicalDataSha256, row.logicalDataSha256);
  }
  t.diagnostic(JSON.stringify({ evidence: 'OFFLINE_PROTOCOL_ONLY', source: sourceIdentity, frozenProfiles: 6 }));
});

for (const kind of ['sales', 'transfer']) for (const shape of ['few', 'distinct30', 'lines200']) {
  test(`${kind} ${shape}: independent golden preserves native line IDs/order/quantity/prices/snapshots`, async t => {
    const profile = await frozenProfile(kind, shape);
    const model = await readyCase(profile);
    try {
      const expected = expectedGolden(profile, model.input), actual = actualGolden(kind, model.draft);
      assert.deepEqual(actual, expected);
      assert.equal(actual.lines.length, profile.oracle.lineCount);
      assert.equal(new Set(actual.lines.map(row => row.skuId)).size, profile.oracle.uniqueSkuCount);
      assert.equal(new Set(actual.lines.map(row => row.productId)).size, profile.oracle.productCount);
      assert.equal(model.session.getSnapshot().proposal.getSnapshot().dirty, false);
      const batch = model.calls.find(row => row.endpoint === '/current-form/sku-batch/query');
      assert.deepEqual(batch.body.skuIds, profile.detail.document.lines.map(row => row.skuId));
      if (kind === 'transfer' && shape === 'lines200') {
        // The frozen 200-line profile already spans two groups, not an all-one-group shortcut.
        assert.equal(new Set(actual.lines.map(row => row.skuSizeGroupId)).size, 2);
        const groups = await model.session.getSnapshot().proposal.readSizeGroups({ search: '', page: 1, pageSize: 100 }, signal());
        assert.deepEqual(groups.items, profile.sizeGroups);
        for (const line of actual.lines) assert.ok(groups.items.find(group => group.id === line.skuSizeGroupId)?.sizes.some(size => size.id === model.draft.lines.find(row => row.sku.id === line.skuId).sku.sizeId));
      }
      t.diagnostic(JSON.stringify({ kind, shape, goldenSha256: dataHash(expected), lines: actual.lines.length,
        groups: [...new Set(actual.lines.map(row => row.skuSizeGroupId))], initializationCalls: endpointCounts(model.calls), evidence: 'OFFLINE_PROTOCOL_ONLY' }));
    } finally { model.dispose(); }
  });
}

for (const kind of ['sales', 'transfer']) {
  test(`${kind}: projected unavailable product metadata keeps old optional group and all saved rows`, async () => {
    const profile = await frozenProfile(kind);
    const target = profile.skus.find(row => row.id === profile.detail.document.lines[0].skuId).productId;
    // A separate in-memory reader projection. NOT an assertion that a SQL source predicate ran.
    profile.products = profile.products.filter(row => row.id !== target);
    const model = await readyCase(profile);
    try {
      assert.deepEqual(actualGolden(kind, model.draft), expectedGolden(profile, model.input));
      const affected = model.draft.lines.filter(row => row.sku.productId === target);
      assert.ok(affected.length > 1);
      for (const row of affected) {
        assert.equal(Object.hasOwn(row.product, 'sizeGroupId'), false);
        assert.ok(row.sku.sizeGroupId);
        assert.ok(row.sourceSnapshot);
      }
      // Original missing-product behavior intentionally has repeated negative searches.
      assert.ok(model.calls.filter(row => row.endpoint === '/current-form/products/query' && row.body.search === affected[0].sku.productCode).length > 1);
    } finally { model.dispose(); }
  });

  test(`${kind}: missing actual SKU rejects whole session without dropping native lines`, async () => {
    const profile = await frozenProfile(kind);
    profile.skus = profile.skus.filter(row => row.id !== profile.detail.document.lines[0].skuId);
    const { reader, calls } = transportFor(profile), model = sessionFor(profile, reader);
    const before = dataHash(model.input);
    try {
      await model.session.initialize();
      assert.equal(model.session.getSnapshot().phase, 'unavailable');
      assert.equal(model.session.getSnapshot().proposal, null);
      assert.equal(dataHash(model.input), before);
      assert.equal(calls.length, 1);
    } finally { model.dispose(); }
  });

  test(`${kind}: raw unfinished/invalid inputs survive initialization without normalization to zero`, async () => {
    const profile = await frozenProfile(kind), input = structuredClone(inputFor(profile));
    input.note = '  synthetic user note  ';
    if (kind === 'sales') {
      input.orderDiscount = '12.';
      Object.assign(input.lines[0], { quantity: '0', dealPrice: '7.', discount: '?', zeroConfirmed: false });
    } else input.quantities[profile.detail.document.lines[0].id] = '';
    const model = await readyCase(profile, { input, dirty: true });
    try {
      assert.deepEqual(actualGolden(kind, model.draft), expectedGolden(profile, input));
      assert.equal(model.session.getSnapshot().proposal.getSnapshot().dirty, true);
    } finally { model.dispose(); }
  });

  test(`${kind}: permission/navigation scope loss consumes late rejection without ready resurrection`, async () => {
    const profile = await frozenProfile(kind), entered = deferred(), gate = deferred();
    const { reader, calls } = transportFor(profile, async () => { entered.resolve(); return gate.promise; });
    const model = sessionFor(profile, reader);
    try {
      const pending = model.session.initialize();
      await entered.promise;
      model.scope.dispose();
      await pending;
      gate.reject(new Error('Synthetic late transport rejection after scope invalidation.'));
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(model.session.getSnapshot().disposed, true);
      assert.equal(model.session.getSnapshot().proposal, null);
      assert.equal(calls.length, 1);
    } finally { model.dispose(); }
  });

  test(`${kind}: replacing owner input during pending read keeps newer input and refuses adoption`, async () => {
    const profile = await frozenProfile(kind), entered = deferred(), gate = deferred();
    const { reader } = transportFor(profile, async ({ result }) => { entered.resolve(); await gate.promise; return jsonResponse(result.body, result.status); });
    const model = sessionFor(profile, reader);
    try {
      const pending = model.session.initialize();
      await entered.promise;
      const newer = structuredClone(model.input); newer.note = 'NEWER USER INPUT';
      model.control.input = newer;
      gate.resolve();
      await pending;
      assert.equal(model.session.getSnapshot().phase, 'unavailable');
      assert.equal(model.session.getSnapshot().proposal, null);
      assert.equal(model.control.input, newer);
      assert.equal(model.control.input.note, 'NEWER USER INPUT');
    } finally { model.dispose(); }
  });
}

test('sales: unknown reference price, exact zero and current catalogue price stay distinct', async () => {
  const profile = await frozenProfile('sales');
  assert.equal(profile.detail.document.lines[1].pricingRule, 'UNIT_PRICE');
  assert.equal(profile.detail.document.lines[2].pricingRule, 'UNIT_PRICE');
  profile.detail.document.lines[1].referencePrice = null;
  profile.detail.document.lines[2].referencePrice = '0';
  for (const product of profile.products) product.retailPrice = '999999.99';
  const model = await readyCase(profile);
  try {
    assert.deepEqual(actualGolden('sales', model.draft), expectedGolden(profile, model.input));
    assert.equal(model.draft.lines[1].product.retailPrice, null);
    assert.equal(model.draft.lines[2].product.retailPrice, '0.00');
    assert.ok(model.draft.lines.every(row => row.product.retailPrice !== '999999.99'));
  } finally { model.dispose(); }
});

test('legacy SKU wire stays a bare exact-order array and rejects the planned additive envelope or extra fields', async () => {
  const profile = await frozenProfile('sales'), ids = profile.detail.document.lines.slice(0, 3).map(row => row.skuId);
  const query = { context: { kind: 'SALES', hallId: profile.detail.document.header.hallId }, skuIds: ids };
  const original = await transportFor(profile).reader.readSkuBatch(query, signal());
  assert.deepEqual(original.map(row => row.id), ids);
  for (const body of [
    { version: 1, skus: original, products: [] },
    original.map((row, index) => index ? row : { ...row, enabled: true }),
    [...original].reverse(), original.slice(1),
  ]) {
    const { reader } = transportFor(profile, () => jsonResponse(body));
    await assert.rejects(() => reader.readSkuBatch(query, signal()), { kind: 'malformed-response' });
  }
});

test('old search decodes unrelated page collisions: target-only future lookup has a narrower intentional error domain', async () => {
  const profile = await frozenProfile('sales'), target = profile.skus.find(row => row.id === profile.detail.document.lines[0].skuId);
  const query = { context: { kind: 'SALES', hallId: profile.detail.document.header.hallId }, search: target.productCode, page: 1, pageSize: 20 };
  const first = await transportFor(profile).reader.readProducts(query, signal());
  assert.ok(first.items.length && first.items.every(row => row.id !== target.productId));
  const { reader } = transportFor(profile, ({ result }) => {
    const body = structuredClone(result.body); body.items[0].retailPrice = 'BROKEN_UNRELATED_PRICE';
    return jsonResponse(body);
  });
  await assert.rejects(() => reader.readProducts(query, signal()), { kind: 'malformed-response' });
  const model = await readyCase(profile);
  try { assert.deepEqual(actualGolden('sales', model.draft), expectedGolden(profile, model.input)); }
  finally { model.dispose(); }
  // No target-only endpoint exists yet. This documents old scope, not a fake future equivalence PASS.
});

test('dictionary access can be independently denied after successful current-form initialization', async () => {
  const profile = await frozenProfile('transfer');
  const model = await readyCase(profile, { override: ({ endpoint, result }) => endpoint === '/dictionary-read/size-groups/query'
    ? jsonResponse({ error: { code: 'FORBIDDEN', message: 'Synthetic dictionary policy denied.' } }, 403)
    : jsonResponse(result.body, result.status) });
  try {
    assert.equal(model.session.getSnapshot().phase, 'ready');
    await assert.rejects(() => model.session.getSnapshot().proposal.readSizeGroups({ search: '', page: 1, pageSize: 100 }, signal()), { kind: 'forbidden' });
    assert.equal(model.calls.filter(row => row.endpoint === '/dictionary-read/size-groups/query').length, 1);
    // No assertion of UI readiness: the actual canonical matrix must handle the failure separately.
  } finally { model.dispose(); }
});

test('dictionary target beyond 100 unrelated groups keeps full no-SKU axes; empty/missing are not the same', async () => {
  const profile = await frozenProfile('transfer', 'lines200');
  const axis = { id: syntheticId('size', 900000), name: 'SYNTHETIC NO SKU AXIS', displayOrder: 99 };
  profile.sizeGroups[0].sizes.push(axis);
  const unrelated = Array.from({ length: 101 }, (_, index) => ({ id: syntheticId('sizeGroup', 900000 + index), name: `SYNTHETIC UNRELATED ${index}`, sizes: [] }));
  profile.sizeGroups = [...unrelated, ...profile.sizeGroups];
  const { reader } = transportFor(profile), query = { search: '', pageSize: 100 };
  const first = await reader.readSizeGroups({ ...query, page: 1 }, signal());
  const second = await reader.readSizeGroups({ ...query, page: 2 }, signal());
  const wanted = new Set(profile.detail.document.lines.map(line => profile.skus.find(sku => sku.id === line.skuId).sizeGroupId));
  assert.equal(wanted.size, 2);
  assert.ok(first.items.every(group => !wanted.has(group.id)));
  const actual = second.items.filter(group => wanted.has(group.id));
  assert.equal(actual.length, 2);
  assert.ok(actual[0].sizes.some(size => size.id === axis.id));
  assert.ok(!profile.skus.some(sku => sku.sizeId === axis.id));
  assert.deepEqual(validateDictionarySizeGroup(unrelated[0]).sizes, []);
  assert.throws(() => validateDictionarySizeGroup({ id: unrelated[0].id, name: unrelated[0].name }), { code: 'INVALID_DICTIONARY_RESPONSE' });
});

test('dictionary transport/resource limits remain unchanged and oversized responses never become truncated successes', async t => {
  const profile = await frozenProfile('transfer'), query = { search: '', page: 1, pageSize: 100 };
  const defaultLimit = 8 * 1024 * 1024;
  // Tiny actual body: exercise the original declared-size guard without allocating a huge payload.
  const huge = createCurrentFormHttpReader({ origin: 'https://opt01-synthetic.invalid', basePath: '/api',
    fetch: async () => jsonResponse({}, 200, { 'content-length': String(defaultLimit + 1) }) });
  await assert.rejects(() => huge.readSizeGroups(query, signal()), { kind: 'too-large', code: 'RESPONSE_TOO_LARGE' });
  const denied = transportFor(profile, () => jsonResponse({ error: { code: 'DICTIONARY_READ_TOO_LARGE', message: 'Synthetic technical overflow.' } }, 413));
  await assert.rejects(() => denied.reader.readSizeGroups(query, signal()), { kind: 'too-large' });
  const members = Array.from({ length: 1000 }, (_, index) => ({ id: syntheticId('size', 910000 + index), name: 'S', displayOrder: index }));
  const group = { id: syntheticId('sizeGroup', 910000), name: 'G', sizes: members };
  assert.equal(validateDictionarySizeGroup(group).sizes.length, 1000);
  assert.throws(() => validateDictionarySizeGroup({ ...group, sizes: [...members, { id: syntheticId('size', 920000), name: 'S', displayOrder: 1000 }] }), { code: 'INVALID_DICTIONARY_RESPONSE' });
  // Exact size arithmetic: fixed UUID/name widths, no 200000-member allocation or new wire implementation.
  const oneGroupBytes = Buffer.byteLength(JSON.stringify(group));
  const potentialBytes = Buffer.byteLength('{"version":1,"groups":[]}') + 200 * oneGroupBytes + 199;
  assert.ok(potentialBytes > defaultLimit, '200 targets x 1000 members does not guarantee fit under the old 8 MiB response limit.');
  assert.ok(Buffer.byteLength(JSON.stringify({ sizeGroupIds: Array(200).fill(group.id) })) < 8192, '200 UUID request is below the existing 8192-byte dictionary body limit; identities still need uniqueness validation.');
  t.diagnostic(JSON.stringify({ hypothetical200Groups1000MembersBytes: potentialBytes, existingDefaultResponseBytes: defaultLimit,
    existingPerGroupMembers: 1000, evidence: 'SIZE_ARITHMETIC_AND_ORIGINAL_GUARDS_ONLY', overflowPolicy: 'FAIL_NOT_TRUNCATE_OR_INCREASE_LIMIT' }));
});
