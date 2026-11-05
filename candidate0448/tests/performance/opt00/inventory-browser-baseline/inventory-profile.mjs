/** TEST ONLY finite inventory preparation. NO listener, browser, build, DB, file
 * output, writes, production capability, timer instrumentation or performance claim. */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createSyntheticInventoryReader } from '../../../../apps/web/preview/synthetic-reader.ts';
import { emptyInventoryFilter } from '../../../../apps/web/src/inventory/contracts.ts';
import { inventoryResponse, candidatesResponse } from '../../../../apps/web/src/transport/response-validation.ts';
import { parseInventoryQuery, parseInventoryCandidateQuery } from '../../../../packages/application/src/inventory-query-validation.ts';
import { createInventoryIdentityMap } from './identity-map.mjs';

export const DATASET_VERSION = 'OPT00-INVENTORY-COMPLETE600-ORIGINAL-LABELS-NO-IMAGES-V1';
export const FACTORY_SHA256 = '50424f3e8f51a84b68917ab16f2122bc8e4c911db39c3c09e9e1cf0afcd365db';
const kinds = ['product', 'category', 'warehouse', 'supplier', 'fit', 'season'];
const liveProfiles = new WeakMap();
const sha = value => createHash('sha256').update(value).digest('hex');
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function active(signal) { if (signal.aborted) throw new DOMException('Synthetic inventory read aborted.', 'AbortError'); }
function read(parameters, signal = new AbortController().signal) {
  return { parameters, signal, identity: { accountId: 'SYNTHETIC-INVENTORY-ONLY', sessionRevision: '1', permissionRevision: '1' }, routeInstanceId: DATASET_VERSION, entityId: null };
}

export async function createInventoryProfile() {
  const actualFactory = await readFile(new URL('../../../../apps/web/preview/synthetic-reader.ts', import.meta.url));
  if (sha(actualFactory) !== FACTORY_SHA256) throw new TypeError('Pinned original inventory factory changed; review a new profile version.');
  const reader = createSyntheticInventoryReader({ productCount: 600, delayMs: 0 });
  const filter = emptyInventoryFilter(), products = [];
  // The original factory is page-bounded. Materialize its COMPLETE two-page
  // 500/100 domain before allocating any wire ID; do not ask it for size600.
  for (const page of [1, 2]) {
    const parameters = { filter, page, pageSize: 500 };
    const result = inventoryResponse(await reader.readInventory(read(parameters)), parameters);
    if (result.exactTotalProducts !== 600) throw new TypeError('Incomplete original inventory catalog.');
    products.push(...result.products);
  }
  if (products.length !== 600 || new Set(products.map(row => row.id)).size !== 600) throw new TypeError('The complete600 catalog must be unique.');
  const candidates = {};
  for (const kind of kinds) {
    const rows = []; let page = 1;
    for (;;) {
      const parameters = { kind, search: '', page, pageSize: 20, selectedIds: [], categoryIds: [] };
      const result = candidatesResponse(await reader.readCandidates(read(parameters)), parameters);
      rows.push(...result.items);
      if (page * 20 >= result.exactTotal) break;
      page++;
    }
    if (new Set(rows.map(row => row.id)).size !== rows.length) throw new TypeError('Duplicate declared candidate identity.');
    candidates[kind] = rows;
  }
  const identities = createInventoryIdentityMap({ products, candidates });
  const facts = freeze({ datasetVersion: DATASET_VERSION, factorySha256: FACTORY_SHA256,
    productCount: 600, stockPublication: 'COMPLETE_FINITE_SYNTHETIC_SOURCE_ONLY', images: 'NOT_APPLICABLE_NO_INVENTORY_IMAGE_COLUMN',
    products: identities.encode(products), candidates: identities.encode(candidates), identityEntries: identities.entries });
  const digest = sha(canonical(facts));
  function inventoryParameters(body) {
    parseInventoryQuery(body); // original wire UUID/selection/pagination boundary
    const decoded = { ...body, filter: Object.fromEntries(Object.entries(body.filter).map(([key, selections]) => {
      const kind = { products: 'product', categories: 'category', warehouses: 'warehouse', suppliers: 'supplier', fits: 'fit', seasons: 'season' }[key];
      return [key, selections.map(item => ({ id: identities.decodeId(item.id, kind), label: item.label }))];
    })) };
    return decoded;
  }
  function candidateParameters(body) {
    parseInventoryCandidateQuery(body);
    return { ...body, selectedIds: body.selectedIds.map(id => identities.decodeId(id, body.kind)), categoryIds: body.categoryIds.map(id => identities.decodeId(id, 'category')) };
  }
  const profile = Object.freeze({ facts, digest, identities,
    async inventory(body, signal) {
      active(signal); const parameters = inventoryParameters(body);
      const data = inventoryResponse(await reader.readInventory(read(parameters, signal)), parameters); active(signal);
      return inventoryResponse(identities.encode(data), body);
    },
    async candidates(body, signal) {
      active(signal); const parameters = candidateParameters(body);
      const data = candidatesResponse(await reader.readCandidates(read(parameters, signal)), parameters); active(signal);
      return candidatesResponse(identities.encode(data), body);
    },
  });
  liveProfiles.set(profile, { inventoryParameters, candidateParameters }); return profile;
}

export function profileDigest(profile) {
  if (!liveProfiles.has(profile) || sha(canonical(profile.facts)) !== profile.digest) throw new TypeError('Undeclared or drifted inventory profile.');
  return profile.digest;
}

/** Pure contract adapter, not an HTTP server or authentication implementation.
 * Failure modes are explicit correctness negatives, NEVER successful unknown0. */
export async function routeInventoryProfile(profile, endpoint, body, { signal = new AbortController().signal, failure = null } = {}) {
  if (!liveProfiles.has(profile)) throw new TypeError('An original prepared profile is required.');
  active(signal);
  if (!['/inventory/query', '/inventory/candidates/query'].includes(endpoint)) return { status: 501, body: { error: { code: 'NOT_IMPLEMENTED' } } };
  if (![null, 'not-ready', 'read-failed'].includes(failure)) throw new TypeError('Unknown correctness failure mode.');
  try {
    // Only request validation errors are400. An unexpected original factory or
    // response-validator failure below must propagate, not blame client input.
    const validators = liveProfiles.get(profile);
    if (endpoint === '/inventory/query') validators.inventoryParameters(body);
    else validators.candidateParameters(body);
  } catch (error) {
    if (error instanceof TypeError || error?.name === 'DomainError') return { status: 400, body: { error: { code: 'INVALID_INVENTORY_INPUT' } } };
    throw error;
  }
  if (failure) return { status: failure === 'not-ready' ? 503 : 500, body: { error: { code: failure === 'not-ready' ? 'INVENTORY_NOT_READY' : 'INTERNAL_ERROR' } } };
  try {
    const data = endpoint === '/inventory/query' ? await profile.inventory(body, signal) : await profile.candidates(body, signal);
    return { status: 200, body: data };
  } catch (error) {
    if (signal.aborted) throw new DOMException('Synthetic inventory read aborted.', 'AbortError');
    throw error;
  }
}
