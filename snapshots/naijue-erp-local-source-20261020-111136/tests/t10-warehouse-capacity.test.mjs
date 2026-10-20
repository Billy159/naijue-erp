import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve, join} from 'node:path';
import {pathToFileURL} from 'node:url';

const server = resolve(process.env.T10_CAPACITY_SERVER_ROOT ?? 'dist/server');
const load = name => import(pathToFileURL(join(server, name)).href);
const {SecurityRepository} = await load('security/repository.js');
const {transferList} = await load('domain/transfers/query.js');
const {saleList} = await load('domain/sales/query.js');
const uid = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const warehouseIds = [uid(201), uid(202)], hallId = uid(301);
const database = {schemas: {auth: 't10_auth', runtime: 't10_runtime', source: 't10_source'}};

// This is the fast query-budget regression seam. Real PostgreSQL equivalence
// and authentication/query counts are recorded by the focused revision harness.
function fixture(type, unknownLast = false) {
  const queries = [];
  const documents = Array.from({length: 50}, (_, n) => ({
    id: uid(400 + n), version: 1, transfer_creator_hall_id: null,
    transfer_creator_account_id: null, transfer_creator_role: null, creator: null,
    body: {header: type === 'TRANSFER'
      ? {source_from_warehouse_id: warehouseIds[0], source_to_warehouse_id: unknownLast && n === 49 ? uid(999) : warehouseIds[1]}
      : {hall_id: hallId, source_warehouse_id: unknownLast && n === 49 ? uid(999) : warehouseIds[0]}, lines: []},
  }));
  const session = {
    async query(sql, values = []) {
      queries.push(sql);
      let rows;
      if (sql.includes('FROM (SELECT 1) anchor')) rows = warehouseIds.includes(values[0])
        ? [{id: values[0], enabled: true, nonzero: false, hall_relations: [hallId], source_ownership_unknown: false}] : [];
      else if (sql.includes('SELECT id,manifest_sha256,body,target')) rows = [];
      else if (sql.includes('count(*)::text n')) rows = [{n: '0'}];
      else if (sql.startsWith('WITH active AS')) rows = [];
      else if (sql.startsWith('SELECT count(*)::text total')) rows = [{total: '50'}];
      else if (sql.startsWith('SELECT d.*')) rows = documents;
      else assert.fail('Unrecognized regression query: ' + sql);
      return {rows, rowCount: rows.length};
    },
    async lock() {assert.fail('Document lists must stay read-only');},
  };
  const repo = new SecurityRepository(session, database);
  const context = {repo, session, actor: {id: 'synthetic-admin', role: 'ADMIN', storeId: null, version: 1},
    documents: [], listScope: {type, storeId: null}, requestResult: null};
  return {queries, documents, repo, context};
}

for (const [type, list, warehouseLookups] of [['TRANSFER', transferList, 100], ['SALE', saleList, 50]]) {
  test(`50 ${type} rows keep every warehouse authorization without inventory projections`, async () => {
    const f = fixture(type), result = await list(f.context, {page: 1, size: 50});
    assert.deepEqual(result, {items: f.documents, total: 50, page: 1, size: 50});
    assert.equal(f.queries.filter(sql => sql.includes('FROM (SELECT 1) anchor')).length, warehouseLookups);
    assert.equal(f.queries.length, 2 + warehouseLookups, 'List SQL excludes the two unchanged HTTP/session authentication lookups');
    assert.equal(f.queries.filter(sql => sql.includes('inventory_history_run') || sql.includes('inventory_opening_run')).length, 0);
  });
  test(`${type} list still rejects an unknown warehouse on its fiftieth row`, async () => {
    const f = fixture(type, true);
    await assert.rejects(list(f.context, {page: 1, size: 50}), error => error.code === 'SCOPE');
    assert.equal(f.queries.filter(sql => sql.includes('FROM (SELECT 1) anchor')).length, warehouseLookups);
  });
}

test('existing full warehouse API still reads inventory in the supplied session', async () => {
  const f = fixture('TRANSFER'), warehouse = await f.repo.warehouse(warehouseIds[0]);
  assert.equal(warehouse.nonzero, false);
  assert.equal(f.queries.length, 4);
  assert.equal(f.queries.filter(sql => sql.startsWith('WITH active AS')).length, 1);
});
