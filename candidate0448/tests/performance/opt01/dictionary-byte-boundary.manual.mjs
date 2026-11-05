/** One explicit manual protocol boundary check. No server, PG, browser or timing acceptance. */
import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  sourceRoot, frozenProfile, syntheticId,
  readyCase, jsonResponse, signal, sha256, endpointCounts,
} from './offline-harness.mjs';

const { createHttpJsonQuery } = await import(pathToFileURL(path.join(sourceRoot, 'apps/web/src/transport/http-query.ts')).href);
const { createTransferHttpReader } = await import(pathToFileURL(path.join(sourceRoot, 'apps/web/src/transfers/http-reader.ts')).href);
const { transferDetailResponse } = await import(pathToFileURL(path.join(sourceRoot, 'apps/web/src/transfers/response-validation.ts')).href);
const responseLimit = 8 * 1024 * 1024;

test('manual: two old complete dictionary pages fit and decode, same complete new standard envelope exceeds unchanged 8 MiB', async t => {
  // Native shape: 200 unique groups/codes; 1000 globally shared native sizes;
  // each (group,size) membership is unique with display_order 0..999.
  // SQL text names allow repeated G/S labels, and group codes remain distinct.
  const sizes = Array.from({ length: 1000 }, (_, index) => ({ id: syntheticId('size', 930000 + index), name: 'S', displayOrder: index }));
  const groups = Array.from({ length: 200 }, (_, index) => ({ id: syntheticId('sizeGroup', 930000 + index), name: 'G', sizes }));
  const codeFor = index => `OPT01-BYTE-G${String(index).padStart(3, '0')}`;
  assert.equal(new Set(groups.map(row => row.id)).size, 200);
  assert.equal(new Set(sizes.map(row => row.id)).size, 1000);

  // Full transfer detail has its OWN 20000-total-members cap. Therefore this
  // 200000-member dictionary is not called a stable full-detail success case.
  // Model the permitted separate read snapshots explicitly: owner detail at T0
  // has 100 members/group (20000 total), current dictionary at T1 has 1000/group.
  // The saved native SKU's size remains a member in both epochs.
  const profile = await frozenProfile('transfer', 'lines200');
  const template = profile.skus.find(row => row.id === profile.detail.document.lines[0].skuId);
  const currentSkus = profile.detail.document.lines.map((line, index) => ({ ...template,
    id: line.skuId, skuCode: `OPT01-BYTE-SKU${String(index).padStart(3, '0')}`,
    productId: syntheticId('product', 930000 + index), productCode: `OPT01-BYTE-P${String(index).padStart(3, '0')}`,
    productName: 'P', sizeGroupId: groups[index].id, sizeId: sizes[0].id, sizeName: sizes[0].name,
  }));
  profile.skus = currentSkus;
  profile.products = currentSkus.map(sku => ({ id: sku.productId, code: sku.productCode, name: sku.productName,
    sizeGroupId: sku.sizeGroupId, retailPrice: null, minimumPriceAvailability: 'UNAVAILABLE' }));
  profile.detail.catalog = {
    skus: currentSkus.map(({ id, skuCode, sizeName, barcodeAvailability, ...rest }) => ({ skuId: id, ...rest })),
    sizeGroups: groups.map((group, index) => ({ sizeGroupId: group.id, code: codeFor(index), name: group.name,
      members: group.sizes.slice(0, 100).map(size => ({ sizeId: size.id, code: null, name: size.name, displayOrder: size.displayOrder })) })),
  };
  const originalDetailBytes = JSON.stringify(profile.detail);
  assert.ok(Buffer.byteLength(originalDetailBytes) < responseLimit);
  let ownerDetailReads = 0;
  const detailReader = createTransferHttpReader({ origin: 'https://opt01-synthetic.invalid', basePath: '/api',
    fetch: async () => { ownerDetailReads++; return new Response(originalDetailBytes, { headers: { 'content-type': 'application/json' } }); } });
  const decodedDetail = await detailReader.readDetail({ parameters: { transferId: profile.detail.document.header.id }, signal: signal() });
  assert.equal(decodedDetail.catalog.sizeGroups.reduce((sum, group) => sum + group.members.length, 0), 20000);
  assert.equal(ownerDetailReads, 1);

  // An unchanged stable dictionary projection is shorter than this admitted
  // detail: it removes group/member code fields and uses shorter identity keys.
  const stableGroups = profile.detail.catalog.sizeGroups.map(group => ({ id: group.sizeGroupId, name: group.name,
    sizes: group.members.map(size => ({ id: size.sizeId, name: size.name, displayOrder: size.displayOrder })) }));
  const stableEnvelopeBytes = Buffer.byteLength(JSON.stringify({ version: 1, groups: stableGroups }));
  assert.ok(stableEnvelopeBytes < Buffer.byteLength(originalDetailBytes));
  assert.ok(stableEnvelopeBytes < responseLimit);

  // Show the full-detail cap really rejects the 200000-member stable variant.
  const largeStableDetail = { ...profile.detail, catalog: { ...profile.detail.catalog,
    sizeGroups: groups.map((group, index) => ({ sizeGroupId: group.id, code: codeFor(index), name: group.name,
      members: group.sizes.map(size => ({ sizeId: size.id, code: null, name: size.name, displayOrder: size.displayOrder })) })) } };
  assert.throws(() => transferDetailResponse(largeStableDetail, { transferId: profile.detail.document.header.id }));

  // T1 is an explicit in-memory current-read epoch, not a mutated frozen file,
  // actual PG update, or silent assumption that detail and dictionary are atomic.
  profile.detail = decodedDetail;
  profile.sizeGroups = groups;
  const pageReceipts = [], decodedGroups = [];
  let pageCalls = 0;
  const model = await readyCase(profile, { override: ({ endpoint, body, result }) => {
    if (endpoint !== '/dictionary-read/size-groups/query') return jsonResponse(result.body, result.status);
    assert.equal(body.search, ''); assert.equal(body.pageSize, 100);
    assert.equal(body.page, ++pageCalls);
    const bytes = JSON.stringify(result.body), length = Buffer.byteLength(bytes);
    assert.ok(length < responseLimit);
    pageReceipts.push({ page: body.page, bytes: length, sha256: sha256(bytes) });
    return new Response(bytes, { headers: { 'content-type': 'application/json' } });
  } });
  try {
    assert.equal(model.draft.lines.length, 200);
    assert.equal(new Set(model.draft.lines.map(row => row.sku.sizeGroupId)).size, 200);
    for (const page of [1, 2]) {
      const decoded = await model.session.getSnapshot().proposal.readSizeGroups({ search: '', page, pageSize: 100 }, signal());
      assert.equal(decoded.items.length, 100);
      assert.deepEqual(decoded.items, groups.slice((page - 1) * 100, page * 100));
      decodedGroups.push(...decoded.items);
    }
    assert.equal(pageCalls, 2);
    assert.deepEqual(decodedGroups, groups);
    assert.equal(decodedGroups.reduce((sum, group) => sum + group.sizes.length, 0), 200000);

    const envelope = JSON.stringify({ version: 1, groups });
    const envelopeBytes = Buffer.byteLength(envelope);
    assert.ok(envelopeBytes > responseLimit);
    let decodeCalls = 0, combinedCalls = 0;
    // No new production endpoint/decoder exists. Feed its complete STANDARD
    // envelope to the ORIGINAL generic HTTP boundary to prove byte rejection,
    // not a missing-export or new-envelope-schema failure.
    const combined = createHttpJsonQuery({ origin: 'https://opt01-synthetic.invalid', basePath: '/api',
      fetch: async () => { combinedCalls++; return new Response(envelope, { headers: { 'content-type': 'application/json' } }); } });
    await assert.rejects(() => combined.post('/dictionary-read/size-group-batch/query', { sizeGroupIds: groups.map(row => row.id) }, signal(), value => { decodeCalls++; return value; }),
      { kind: 'too-large', code: 'RESPONSE_TOO_LARGE' });
    assert.equal(combinedCalls, 1);
    assert.equal(decodeCalls, 0);
    t.diagnostic(JSON.stringify({ evidence: 'OFFLINE_STRICT_PROTOCOL_BOUNDARY_NOT_BROWSER_PG_OR_TIMING',
      originalOwnerDetailAtT0: { bytes: Buffer.byteLength(originalDetailBytes), totalMembers: 20000, strictDecoded: true },
      stableStandardEnvelopeAtT0: { bytes: stableEnvelopeBytes, belowDetailAndLimit: true },
      currentDictionaryAtT1: { groups: 200, membersPerGroup: 1000, totalMembers: 200000, oldPages: pageReceipts, allOldMembersDeepEqual: true },
      completeStandardEnvelopeAtT1: { version: 1, bytes: envelopeBytes, sha256: sha256(envelope), result: 'RESPONSE_TOO_LARGE', decoderCalls: decodeCalls },
      sourceLimits: { responseBytes: responseLimit, dictionaryMembersPerGroup: 1000, transferDetailTotalMembers: 20000 },
      originalInitializerCallsAfterOwnerDetail: endpointCounts(model.calls),
      scopeWarning: 'Stable 200000-member full transfer detail is rejected. Old dictionary protocol permits this data; full saved-session counterexample uses explicitly different T0/T1 read snapshots, not a claim of actual PG mutation or browser-ready success.' }));
  } finally { model.dispose(); }
});
