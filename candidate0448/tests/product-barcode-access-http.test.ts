/** Synthetic Fastify injection only: no listener, database, real identities or inferred mappings. */
import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { createProductMaintenanceHttpPlugin } from '../apps/api/src/product-maintenance-http.ts';
import type { ProductMaintenanceDependencies } from '../packages/application/src/product-maintenance-ports.ts';
import { CATALOGUE_PRICE_KEYS } from '../packages/application/src/catalogue-price-input.ts';
import { BARCODE_SCHEMES } from '../packages/application/src/barcode-generation.ts';
import { DomainError } from '../packages/domain/src/errors.ts';
import { actor, sid } from './support/synthetic-fixtures.ts';

const id = (n: number) => sid('product', n);
const values = { productCode: 'SYNTHETIC-ACCESS', name: 'SYNTHETIC ONLY', categoryId: id(1), supplierId: id(2),
  seasonIds: [], sizeGroupId: id(4), year: 2026, systemItemCode: '00001', thickness: null, collarPantsType: null,
  defaultBarcodeSchemeId: BARCODE_SCHEMES.y2020, enabled: true,
  prices: Object.fromEntries(CATALOGUE_PRICE_KEYS.map(key => [key, null])) };
const edit = { action: 'EDIT', requestKey: 'synthetic-barcode-access', id: id(10), expectedVersion: 1, values,
  skus: [], barcodes: [], generateBarcodeSkuIds: [id(11)] };
const candidate = { kind: 'barcode-schemes', search: '', page: 1, pageSize: 20 };

function fixture() {
  let authenticated = true, granted = false, reads = 0, mutations = 0, transactions = 0;
  const intents: string[] = [];
  const read = async (): Promise<never> => { reads++; throw Error('PRIVATE_UNEXPECTED_READ'); };
  const write = async (): Promise<never> => { mutations++; throw Error('PRIVATE_UNEXPECTED_WRITE'); };
  const dependencies: ProductMaintenanceDependencies = { now: () => 'UNUSED', newId: () => 'UNUSED', unitOfWork: {
    seasonContract: 'product-season-array-v1', async transaction(work) {
      transactions++;
      return work({ evidence: { async assertAllowed(current, family, action) {
        assert.deepEqual(current, actor); assert.equal(family, 'PRODUCT'); intents.push(action);
        if (!granted) throw new DomainError('FORBIDDEN', 'PRIVATE_REVOKED_ROLE');
      }, getReceipt: read, complete: write }, assertPendingCapacity: write, load: read, readReferences: read,
      async readCandidates(query) { reads++; return { kind: query.kind, page: query.page, pageSize: query.pageSize, total: 1,
        items: [{ id: BARCODE_SCHEMES.y2020, name: 'SYNTHETIC HISTORICAL SCHEME', code: null, parentId: null, version: null }] }; },
      validateReferences: read, assertCanDelete: read, putProduct: write, putSku: write, putBarcode: write });
    }
  } };
  const app = Fastify({ logger: false });
  app.register(createProductMaintenanceHttpPlugin({ authenticate: async () => authenticated ? actor : null, dependencies }));
  return { app, intents, stats: () => ({ reads, mutations, transactions }), grant: (next: boolean) => { granted = next; },
    authenticate: (next: boolean) => { authenticated = next; } };
}

test('product scheme candidate, detail and barcode refill routes reject current authority before protected reads or mutations', async t => {
  const f = fixture(); t.after(() => f.app.close());
  for (const [url, payload, intent] of [
    ['/products/maintenance/candidates/query', candidate, 'CANDIDATES'],
    ['/products/maintenance/v2/detail/query', { productId: id(10) }, 'DETAIL'],
    ['/products/v2/commands', edit, 'EDIT']
  ] as const) {
    const response = await f.app.inject({ method: 'POST', url, payload });
    assert.equal(response.statusCode, 403, response.body);
    assert.deepEqual(response.json(), { error: { code: 'FORBIDDEN', message: 'Access denied' } });
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(f.intents.at(-1), intent);
  }
  assert.deepEqual(f.stats(), { reads: 0, mutations: 0, transactions: 3 });
  assert.equal(f.app.server.listening, false);
});

test('product scheme candidates reauthorize after revocation and unauthenticated requests never enter a transaction', async t => {
  const f = fixture(); t.after(() => f.app.close());
  const send = () => f.app.inject({ method: 'POST', url: '/products/maintenance/candidates/query', payload: candidate });
  f.grant(true);
  const allowed = await send(); assert.equal(allowed.statusCode, 200, allowed.body);
  assert.equal(allowed.json().items[0].id, BARCODE_SCHEMES.y2020);
  f.grant(false);
  const revoked = await send(); assert.equal(revoked.statusCode, 403); assert.doesNotMatch(revoked.body, /PRIVATE|SYNTHETIC HISTORICAL/);
  assert.deepEqual(f.stats(), { reads: 1, mutations: 0, transactions: 2 });
  f.authenticate(false);
  const expired = await send(); assert.equal(expired.statusCode, 401);
  assert.deepEqual(f.stats(), { reads: 1, mutations: 0, transactions: 2 });
  assert.deepEqual(f.intents, ['CANDIDATES', 'CANDIDATES']);
});
