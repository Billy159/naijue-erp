/** Offline protocol/session evidence only. Never starts a listener, browser or database. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { canonicalJson, dataHash, syntheticId } from '../opt00/fixture-generator.mjs';
import { profileDigest, routeProfile } from '../opt00/http-profile.mjs';

export { canonicalJson, dataHash, syntheticId };
export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const resultRoot = path.resolve(repoRoot, '../development-results-20261031');
export const sourceRoot = path.resolve(process.env.OPT01_SOURCE_ROOT ?? path.join(resultRoot, 'cumulative-C03-work/candidate'));
export const profilesRoot = path.resolve(process.env.OPT01_PROFILES_ROOT ?? path.join(resultRoot, 'performance-opt00/http-profiles-v2'));
export const BASELINE_COMMIT = '0905e799e69b0a486b0ae3366774c0c8fc3e7232';
export const BASELINE_TREE = 'a2735e895e7a5a233cf9c85baa2d41744c1e4e61';
export const MANIFEST_SHA256 = '507d574dee47cf3cbcca985efe88a3d17c76c25df1bfe733542c370af5f9ebe3';
export const LOGICAL_SHA256 = '0d8222981e8d3371c6f2dffa5f26b5d4f49e4ed5898ea236dc9af7ba99cc87c8';
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const signal = () => new AbortController().signal;

assert.equal(process.version, 'v24.21.0', 'Use the authorized exact Node toolchain.');
const git = (...args) => execFileSync('git', ['-C', sourceRoot, ...args], { encoding: 'utf8' }).trim();
export const sourceIdentity = Object.freeze({ root: sourceRoot, commit: git('rev-parse', 'HEAD'), tree: git('rev-parse', 'HEAD^{tree}') });
// This RED-first receipt deliberately targets immutable C03, not active WIP or C06.
assert.equal(sourceIdentity.commit, BASELINE_COMMIT, 'This phase is pinned to original C03; candidate-mode needs a later reviewed test revision.');
assert.equal(sourceIdentity.tree, BASELINE_TREE);
assert.equal(git('status', '--porcelain=v1'), '', 'Original baseline must remain clean.');
const pins = JSON.parse(await readFile(new URL('./source-pins.json', import.meta.url), 'utf8'));
for (const pin of pins.files) {
  assert.equal(sha256(await readFile(path.join(sourceRoot, pin.path))), pin.sha256, `Original source drift: ${pin.path}`);
}

const load = relative => import(pathToFileURL(path.join(sourceRoot, relative)).href);
const [http, salesSession, transferSession, salesValidation, salesForm, transferValidation, scopes, salesResponse, transferResponse, dictionary] = await Promise.all([
  load('apps/web/src/current-form/http-reader.ts'),
  load('apps/web/src/current-form/sales-existing-document.ts'),
  load('apps/web/src/current-form/transfer-existing-document.ts'),
  load('apps/web/src/sales/commands/validation.ts'),
  load('apps/web/src/sales/commands/form-model.ts'),
  load('apps/web/src/transfers/commands/validation.ts'),
  load('apps/web/src/loading/read-scope.ts'),
  load('apps/web/src/sales/response-validation.ts'),
  load('apps/web/src/transfers/response-validation.ts'),
  load('packages/application/src/dictionary-read-validation.ts'),
]);
export const { createCurrentFormHttpReader } = http;
export const { salesInputMoney } = salesForm;
export const { validateDictionarySizeGroup } = dictionary;

const manifestBytes = await readFile(path.join(profilesRoot, 'profiles-manifest.json'));
assert.equal(sha256(manifestBytes), MANIFEST_SHA256, 'Frozen v2 manifest must not change.');
export const profileManifest = JSON.parse(manifestBytes);
assert.equal(profileManifest.baseline.candidateCommit, BASELINE_COMMIT);
assert.equal(profileManifest.baseline.candidateTree, BASELINE_TREE);
assert.equal(profileManifest.profiles.length, 6);
const cachedProfiles = new Map();

/** Loads the existing frozen bytes. Counterexamples use separate clones, never edit the files. */
export async function frozenProfile(kind, shape = 'few') {
  const name = `${kind}-${shape}.json`;
  if (!cachedProfiles.has(name)) {
    const entry = profileManifest.profiles.find(row => row.path === name);
    assert.ok(entry, `Explicit frozen profile required: ${name}`);
    const bytes = await readFile(path.join(profilesRoot, name));
    assert.equal(sha256(bytes), entry.fileSha256, `Frozen file drift: ${name}`);
    const value = JSON.parse(bytes);
    assert.equal(profileDigest(value), entry.profileSha256);
    assert.equal(value.logicalDataSha256, LOGICAL_SHA256);
    const id = value.detail.document.header.id;
    if (kind === 'sales') salesResponse.salesDetailResponse(value.detail, { salesId: id });
    else transferResponse.transferDetailResponse(value.detail, { transferId: id });
    cachedProfiles.set(name, value);
  }
  return structuredClone(cachedProfiles.get(name));
}

export function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...extraHeaders } });
}

/** The original strict HTTP client runs against this injected test transport. No network. */
export function transportFor(profile, override) {
  const calls = [];
  const reader = createCurrentFormHttpReader({
    origin: 'https://opt01-synthetic.invalid', basePath: '/api',
    fetch: async (url, init) => {
      const endpoint = new URL(url).pathname.slice('/api'.length);
      const body = JSON.parse(init.body);
      const call = { endpoint, body };
      calls.push(call);
      assert.equal(init.method, 'POST');
      assert.equal(init.mode, 'same-origin');
      assert.equal(init.credentials, 'same-origin');
      assert.equal(init.cache, 'no-store');
      assert.equal(init.redirect, 'error');
      assert.ok(!/commands|prepare-|receipts/.test(endpoint), 'Initialization must not dispatch writes/preparation.');
      const result = routeProfile(profile, endpoint, body);
      return override ? override({ endpoint, body, init, result, call }) : jsonResponse(result.body, result.status);
    },
  });
  return { reader, calls };
}

export function inputFor(profile) {
  return profile.kind === 'sales'
    ? salesForm.salesFormInput(salesValidation.draftFromSalesDetail(profile.detail))
    : transferValidation.inputFromTransferDraft(transferValidation.draftFromTransferDetail(profile.detail));
}

/** Original initializer/proposal owners; minimal owner snapshot facade, not a full page/editor. */
export function sessionFor(profile, reader, options = {}) {
  const scope = new scopes.ReadScope({ accountId: profile.principal.accountId, sessionRevision: 'OPT01_OFFLINE', permissionRevision: 'OPT01_OFFLINE' },
    `opt01:${profile.kind}`, profile.detail.document.header.id, () => {});
  const input = options.input ?? inputFor(profile);
  const control = { input, expired: 0 };
  const expireExistingIdentity = () => { control.expired++; scope.dispose(); };
  const preparation = { prepareExisting() { throw new Error('OPT01 offline initialization never prepares or writes.'); } };
  const owner = profile.kind === 'sales'
    ? { getSnapshot: () => ({ input: control.input }), commands: { getSnapshot: () => ({ write: { phase: 'idle' } }) }, expireExistingIdentity }
    : { getSnapshot: () => ({ editor: { input: control.input }, write: { phase: 'idle' } }), expireExistingIdentity };
  const Type = profile.kind === 'sales' ? salesSession.SalesExistingDocumentSession : transferSession.TransferExistingDocumentSession;
  const session = new Type({ owner, scope, reader, preparation, original: profile.detail, input, dirty: options.dirty ?? false });
  return { session, scope, input, control, dispose: () => { session.dispose(); scope.dispose(); } };
}

/** Semantic golden, independently derived from frozen source document + original raw input. */
export function expectedGolden(profile, input = inputFor(profile)) {
  const bySku = new Map(profile.skus.map(row => [row.id, row]));
  const admitted = new Map(profile.products.map(row => [row.id, row]));
  const originalById = new Map(profile.detail.document.lines.map(row => [row.id, row]));
  const originals = profile.kind === 'sales' ? input.lines.map(row => originalById.get(row.id)) : profile.detail.document.lines;
  const lines = originals.map((old, index) => {
    const sku = bySku.get(old.skuId);
    assert.ok(sku, 'Golden requires an actual native SKU, never a guessed relation.');
    const product = admitted.get(sku.productId);
    const raw = profile.kind === 'sales' ? input.lines[index] : null;
    return {
      nativeLineId: old.id, skuId: old.skuId, skuCode: sku.skuCode, productId: sku.productId,
      productCode: sku.productCode, productName: sku.productName,
      productSizeGroupId: product?.sizeGroupId ?? null, skuSizeGroupId: sku.sizeGroupId,
      sourceSnapshot: old.snapshot, quantity: raw ? raw.quantity : input.quantities[old.id],
      ...(raw ? {
        referencePrice: old.referencePrice === null ? null : salesInputMoney(old.referencePrice),
        dealPrice: raw.dealPrice, pricingRule: raw.pricingRule, discount: raw.discount,
        isGift: raw.isGift, zeroConfirmed: raw.zeroConfirmed,
      } : { referencePrice: null }),
    };
  });
  return {
    kind: profile.kind, businessDate: input.businessDate, note: input.note,
    ...(profile.kind === 'sales' ? { orderDiscount: input.orderDiscount } : {}), lines,
  };
}

export function actualGolden(kind, draft) {
  return {
    kind, businessDate: draft.businessDate, note: draft.note,
    ...(kind === 'sales' ? { orderDiscount: draft.orderDiscount } : {}),
    lines: draft.lines.map(row => ({
      nativeLineId: kind === 'sales' ? row.key : row.existingLineId,
      skuId: row.sku.id, skuCode: row.sku.skuCode, productId: row.sku.productId,
      productCode: row.product.code, productName: row.product.name,
      productSizeGroupId: row.product.sizeGroupId ?? null, skuSizeGroupId: row.sku.sizeGroupId,
      sourceSnapshot: row.sourceSnapshot, quantity: row.quantity,
      referencePrice: row.product.retailPrice,
      ...(kind === 'sales' ? { dealPrice: row.dealPrice, pricingRule: row.pricingRule, discount: row.discount, isGift: row.isGift, zeroConfirmed: row.zeroConfirmed } : {}),
    })),
  };
}

export async function readyCase(profile, options = {}) {
  const transport = transportFor(profile, options.override);
  const model = sessionFor(profile, transport.reader, options);
  try {
    const inputHash = dataHash(model.input);
    await model.session.initialize();
    assert.equal(model.session.getSnapshot().phase, 'ready', 'Original setup must reach ready before a budget assertion.');
    assert.equal(dataHash(model.input), inputHash, 'Initialization must not mutate the input object.');
    return { ...transport, ...model, draft: model.session.getSnapshot().proposal.getSnapshot().draft };
  } catch (error) { model.dispose(); throw error; }
}

export function endpointCounts(calls) {
  return Object.fromEntries([...new Set(calls.map(row => row.endpoint))].map(endpoint => [endpoint, calls.filter(row => row.endpoint === endpoint).length]));
}

export function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
