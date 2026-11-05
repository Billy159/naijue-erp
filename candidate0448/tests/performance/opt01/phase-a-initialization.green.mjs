/** AFTER actual initializer/strict decoder against frozen v2 protocol data. Not browser/PG timing. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { frozenProfile, inputFor, expectedGolden, actualGolden, dataHash, profilesRoot, deferred } from './offline-harness.mjs';
import { routeProfile } from '../opt00/http-profile.mjs';
import { phaseLoad, phaseSourceBinding, signal, response, uid } from './phase-a-binding.mjs';
const [{ createCurrentFormHttpReader }, { SalesExistingDocumentSession }, { TransferExistingDocumentSession }, { ReadScope }] = await Promise.all([
  phaseLoad('apps/web/src/current-form/http-reader.ts'), phaseLoad('apps/web/src/current-form/sales-existing-document.ts'),
  phaseLoad('apps/web/src/current-form/transfer-existing-document.ts'), phaseLoad('apps/web/src/loading/read-scope.ts'),
]);
const { encodeCurrentFormSavedEditSkuBatchWireV2 } = await phaseLoad('apps/api/src/current-form-http.ts');
const goldenRoot = path.resolve(process.env.OPT01_GOLDEN_ROOT ?? path.resolve(profilesRoot, '../../performance-opt01/golden-v1'));
const goldenManifest = JSON.parse(await readFile(path.join(goldenRoot, 'manifest.json'), 'utf8'));
function routed(profile, endpoint, body) {
  if (endpoint !== '/current-form/saved-edit-sku-batch-v2/query') return routeProfile(profile, endpoint, body);
  // Synthetic data projection only. The actual PG authorization/source predicate is tested separately, not simulated as proof here.
  const actual = routeProfile(profile, '/current-form/sku-batch/query', body);
  if (actual.status !== 200) return actual;
  const byProduct = new Map(profile.products.map(row => [row.id, row]));
  return { status: 200, body: encodeCurrentFormSavedEditSkuBatchWireV2({ version: 1, skus: actual.body, products: [...new Set(actual.body.map(row => row.productId))].map(productId => {
    const product = byProduct.get(productId);
    return product ? { productId, state: 'ELIGIBLE', sizeGroupId: product.sizeGroupId } : { productId, state: 'UNAVAILABLE' };
  }) }) };
}
function setup(profile, options = {}) {
  const calls = [], input = options.input ?? inputFor(profile), ownerState = { input, expired: 0 };
  const scope = new ReadScope({ accountId: profile.principal.accountId, sessionRevision: 'OPT01_A_AFTER', permissionRevision: 'OPT01_A_AFTER' }, `phase-a-${profile.kind}`, profile.detail.document.header.id, () => {});
  const reader = createCurrentFormHttpReader({ origin: 'https://phase-a.invalid', basePath: '/api', fetch: async (url, init) => {
    const endpoint = new URL(url).pathname.slice('/api'.length), body = JSON.parse(init.body);
    calls.push({ endpoint, body }); const result = routed(profile, endpoint, body);
    assert.ok(!/prepare-|commands|receipts/.test(endpoint));
    return options.override ? options.override({ endpoint, body, init, result }) : new Response(JSON.stringify(result.body), { status: result.status, headers: { 'content-type': 'application/json' } });
  } });
  const expireExistingIdentity = () => { ownerState.expired++; scope.dispose(); };
  const owner = profile.kind === 'sales' ? { getSnapshot: () => ({ input: ownerState.input }), commands: { getSnapshot: () => ({ write: { phase: 'idle' } }) }, expireExistingIdentity }
    : { getSnapshot: () => ({ editor: { input: ownerState.input }, write: { phase: 'idle' } }), expireExistingIdentity };
  const Type = profile.kind === 'sales' ? SalesExistingDocumentSession : TransferExistingDocumentSession;
  const session = new Type({ owner, scope, reader, original: profile.detail, input, dirty: options.dirty ?? false,
    preparation: { prepareExisting() { throw Error('No preparation/write in read-only initialization test.'); } } });
  return { session, scope, input, ownerState, calls, dispose() { session.dispose(); scope.dispose(); } };
}
async function ready(model) {
  await model.session.initialize();
  assert.equal(model.session.getSnapshot().phase, 'ready');
  return model.session.getSnapshot().proposal;
}

test('after source binding is explicit and separate from immutable C03 reference', async t => { t.diagnostic(JSON.stringify(await phaseSourceBinding())); });
for (const kind of ['sales', 'transfer']) for (const shape of ['few', 'distinct30', 'lines200']) {
  test(`AFTER ${kind} ${shape}: frozen semantic golden identical, complete lines, actual DATA budget ${kind === 'sales' ? 1 : 2}`, async t => {
    const profile = await frozenProfile(kind, shape), model = setup(profile), before = dataHash(model.input);
    try {
      const proposal = await ready(model), draft = proposal.getSnapshot().draft, actual = actualGolden(kind, draft);
      assert.deepEqual(actual, expectedGolden(profile, model.input));
      assert.equal(dataHash(actual), goldenManifest.profiles.find(row => row.kind === kind && row.shape === shape).semanticSha256);
      assert.equal(dataHash(model.input), before); assert.equal(actual.lines.length, profile.oracle.lineCount);
      assert.equal(model.calls[0].endpoint, '/current-form/saved-edit-sku-batch-v2/query');
      if (kind === 'transfer') {
        const page = await proposal.readSizeGroups({ search: '', page: 1, pageSize: 100 }, signal());
        assert.deepEqual(page.items, profile.sizeGroups);
        for (const row of draft.lines) assert.ok(page.items.find(group => group.id === row.sku.sizeGroupId)?.sizes.some(size => size.id === row.sku.sizeId));
      }
      assert.equal(model.calls.length, kind === 'sales' ? 1 : 2);
      assert.ok(!model.calls.some(row => ['/current-form/products/query', '/current-form/sku-batch/query'].includes(row.endpoint)));
      t.diagnostic(JSON.stringify({ phase: 'OPT01_A_AFTER', kind, shape, lines: draft.lines.length, goldenSha256: dataHash(actual),
        dataRequests: model.calls.length, endpoints: model.calls.map(row => row.endpoint), evidence: 'OFFLINE_PROTOCOL_NOT_CANONICAL_READY_OR_TIMING' }));
    } finally { model.dispose(); }
  });
}
for (const kind of ['sales', 'transfer']) {
  test(`AFTER ${kind}: unavailable product metadata remains optional with no SKU-group admission fallback`, async () => {
    const profile = await frozenProfile(kind), target = profile.skus.find(row => row.id === profile.detail.document.lines[0].skuId).productId;
    profile.products = profile.products.filter(row => row.id !== target);
    const model = setup(profile);
    try {
      const draft = (await ready(model)).getSnapshot().draft;
      assert.deepEqual(actualGolden(kind, draft), expectedGolden(profile, model.input));
      assert.ok(draft.lines.filter(row => row.sku.productId === target).every(row => !Object.hasOwn(row.product, 'sizeGroupId')));
      assert.equal(model.calls.length, 1);
    } finally { model.dispose(); }
  });
  test(`AFTER ${kind}: missing SKU rejects all rows; malformed new endpoint never falls back to N+1`, async () => {
    for (const variant of ['missing-sku', 'bad-envelope']) {
      const profile = await frozenProfile(kind);
      if (variant === 'missing-sku') profile.skus = profile.skus.filter(row => row.id !== profile.detail.document.lines[0].skuId);
      const model = setup(profile, variant === 'bad-envelope' ? { override: () => response({ version: 99, skus: [], products: [] }) } : {});
      try {
        const before = dataHash(model.input); await model.session.initialize();
        assert.equal(model.session.getSnapshot().phase, 'unavailable'); assert.equal(model.session.getSnapshot().proposal, null);
        assert.equal(dataHash(model.input), before); assert.equal(model.calls.length, 1);
      } finally { model.dispose(); }
    }
  });
  test(`AFTER ${kind}: raw invalid input and dirty status survive without price/quantity normalization`, async () => {
    const profile = await frozenProfile(kind), input = structuredClone(inputFor(profile)); input.note = ' RAW USER NOTE ';
    if (kind === 'sales') { input.orderDiscount = '1.'; Object.assign(input.lines[0], { quantity: '0', dealPrice: '7.', discount: '?', zeroConfirmed: false }); }
    else input.quantities[profile.detail.document.lines[0].id] = '';
    const model = setup(profile, { input, dirty: true });
    try { const proposal = await ready(model); assert.deepEqual(actualGolden(kind, proposal.getSnapshot().draft), expectedGolden(profile, input)); assert.equal(proposal.getSnapshot().dirty, true); }
    finally { model.dispose(); }
  });
  test(`AFTER ${kind}: canceled/permission-lost scope consumes late success and late rejection`, async () => {
    for (const rejection of [false, true]) {
      const profile = await frozenProfile(kind), entered = deferred(), gate = deferred();
      let result;
      const model = setup(profile, { override: async value => { result = value.result; entered.resolve(); return gate.promise; } });
      try {
        const pending = model.session.initialize(); await entered.promise; model.scope.dispose(); await pending;
        if (rejection) gate.reject(Error('Synthetic late rejection')); else gate.resolve(response(result.body));
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(model.session.getSnapshot().disposed, true); assert.equal(model.session.getSnapshot().proposal, null); assert.equal(model.calls.length, 1);
      } finally { model.dispose(); }
    }
  });
  test(`AFTER ${kind}: pending owner-input replacement refuses stale proposal and retains newer input`, async () => {
    const profile = await frozenProfile(kind), entered = deferred(), gate = deferred();
    const model = setup(profile, { override: async ({ result }) => { entered.resolve(); await gate.promise; return response(result.body); } });
    try {
      const pending = model.session.initialize(); await entered.promise;
      const newer = structuredClone(model.input); newer.note = 'NEWER INPUT'; model.ownerState.input = newer;
      gate.resolve(); await pending;
      assert.equal(model.session.getSnapshot().phase, 'unavailable'); assert.equal(model.session.getSnapshot().proposal, null); assert.equal(model.ownerState.input, newer);
    } finally { model.dispose(); }
  });
}
test('AFTER sales: same actual SKU in independent saved line IDs preserves both original snapshots, prices and order', async () => {
  const profile = await frozenProfile('sales');
  profile.detail.document.lines[3].skuId = profile.detail.document.lines[0].skuId;
  const model = setup(profile);
  try {
    const draft = (await ready(model)).getSnapshot().draft;
    assert.deepEqual(actualGolden('sales', draft), expectedGolden(profile, model.input));
    assert.equal(draft.lines.length, 12); assert.equal(draft.lines[0].sku.id, draft.lines[3].sku.id);
    assert.notEqual(draft.lines[0].key, draft.lines[3].key); assert.equal(model.calls[0].body.skuIds.length, 11);
  } finally { model.dispose(); }
});
test('AFTER transfer: duplicate native SKU lines preserve original unavailable behavior before any read', async () => {
  const profile = await frozenProfile('transfer'); profile.detail.document.lines[1].skuId = profile.detail.document.lines[0].skuId;
  const model = setup(profile);
  try { await model.session.initialize(); assert.equal(model.session.getSnapshot().phase, 'unavailable'); assert.equal(model.calls.length, 0); }
  finally { model.dispose(); }
});
test('AFTER transfer: original dictionary denial remains independent; >100 unrelated groups retain G>1 unresolved budget', async t => {
  const profile = await frozenProfile('transfer', 'lines200');
  const denied = setup(profile, { override: ({ endpoint, result }) => new Response(JSON.stringify(endpoint.startsWith('/dictionary-read/') ? { error: { code: 'FORBIDDEN', message: 'Synthetic dictionary denial' } } : result.body),
    { status: endpoint.startsWith('/dictionary-read/') ? 403 : result.status, headers: { 'content-type': 'application/json' } }) });
  try { const proposal = await ready(denied); await assert.rejects(() => proposal.readSizeGroups({ search: '', page: 1, pageSize: 100 }, signal()), { kind: 'forbidden' }); }
  finally { denied.dispose(); }
  profile.sizeGroups = [...Array.from({ length: 101 }, (_, i) => ({ id: uid(900000 + i), name: `Unrelated ${i}`, sizes: [] })), ...profile.sizeGroups];
  const model = setup(profile);
  try {
    const proposal = await ready(model), wanted = new Set(proposal.getSnapshot().draft.lines.map(row => row.sku.sizeGroupId));
    const first = await proposal.readSizeGroups({ search: '', page: 1, pageSize: 100 }, signal());
    assert.ok(first.items.every(group => !wanted.has(group.id)));
    const second = await proposal.readSizeGroups({ search: '', page: 2, pageSize: 100 }, signal());
    assert.equal(second.items.filter(group => wanted.has(group.id)).length, 2);
    assert.equal(model.calls.length, 3); assert.ok(model.calls.length > 2);
    t.diagnostic('UNRESOLVED UNIVERSAL TARGET: metadata1 + original dictionary2 = after-detail3; phase A does not claim complete OPT01.');
  } finally { model.dispose(); }
});
