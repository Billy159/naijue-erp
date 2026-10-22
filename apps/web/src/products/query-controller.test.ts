import assert from 'node:assert/strict';
import test from 'node:test';
import { ReadContext } from '../loading/read-scope.ts';
import { HttpQueryError } from '../transport/http-query.ts';
import { checkedProductManagementCandidates, checkedProductManagementResponse, createProductManagementQuery, guardedProductManagementReader } from './query-controller.ts';
import { ProductCandidateWindow } from './candidate-window.ts';
import { emptyProductFilter, productFilterParameters, type ProductManagementListQuery, type ProductManagementReader } from './contracts.ts';

const context = () => new ReadContext({ accountId: 'test-account', sessionRevision: '1', permissionRevision: '1' });
const parameters = (): ProductManagementListQuery => ({ filter: productFilterParameters(emptyProductFilter()), page: 1, pageSize: 100 });
function deferred<T>() { let resolve!: (data: T) => void, reject!: (error: unknown) => void; const promise = new Promise<T>((yes,no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const emptyPage = { page: 1, pageSize: 100 as const, exactTotal: 0, items: [] };
const noCandidates: ProductManagementReader['readCandidates'] = async () => ({ page: 1, pageSize: 20, exactTotal: 0, items: [] });

test('all eight positive draft dimensions map to independent query fields; no label becomes a permission fact', () => {
  const draft = Object.fromEntries(Object.keys(emptyProductFilter()).map(kind => [kind, [{ id: `id-${kind}`, label: 'client label is not sent' }]])) as unknown as ReturnType<typeof emptyProductFilter>;
  assert.deepEqual(productFilterParameters(draft), { productIds: ['id-product'], categoryIds: ['id-category'], years: ['id-year'], seasonIds: ['id-season'], supplierIds: ['id-supplier'], fitIds: ['id-fit'], thicknesses: ['id-thickness'], shapeCodes: ['id-shape'] });
});
test('strict page/context proof rejects wrong page, unsafe total and truncated success', () => {
  assert.deepEqual(checkedProductManagementResponse(emptyPage, parameters()), emptyPage);
  assert.throws(() => checkedProductManagementResponse({ ...emptyPage, page: 2 }, parameters()));
  assert.throws(() => checkedProductManagementResponse({ ...emptyPage, exactTotal: 1 }, parameters()));
  assert.throws(() => checkedProductManagementResponse({ ...emptyPage, exactTotal: Number.MAX_SAFE_INTEGER + 1 }, parameters()));
  assert.throws(() => checkedProductManagementCandidates({ page: 1, pageSize: 20, exactTotal: 1, items: [] }, { kind:'year',search:'',selectedIds:[],page:1,pageSize:20 }));
});
test('newest request owns results; cancel aborts and ignores a late unauthorized old request', async () => {
  const ctx = context(), scope = ctx.createScope('products'), reads: { signal: AbortSignal; pending: ReturnType<typeof deferred<typeof emptyPage>> }[] = [];
  let failures = 0;
  const reader = guardedProductManagementReader(scope, { readCandidates: noCandidates, readList: read => { const pending = deferred<typeof emptyPage>(); reads.push({ signal: read.signal, pending }); return pending.promise; } }, () => failures++);
  const query = createProductManagementQuery(scope, reader);
  const first = query.run(parameters()), second = query.run(parameters());
  assert.equal(reads[0]!.signal.aborted, true); reads[1]!.pending.resolve(emptyPage); assert.equal((await second).status, 'success');
  reads[0]!.pending.reject(new HttpQueryError('forbidden','FORBIDDEN',403)); await first;
  assert.equal(failures,0); assert.equal(scope.active,true); assert.equal(query.getSnapshot().phase,'success');
  const cancelled = query.run(parameters()); query.cancel(); reads[2]!.pending.resolve(emptyPage); assert.equal((await cancelled).status,'discarded');
  assert.equal(query.getSnapshot().success?.data.exactTotal,0); ctx.clear(); assert.equal(query.getSnapshot().success,null);
});
test('current denial clears old facts and all pending read scope before notifying trusted host', async () => {
  const ctx = context(), scope = ctx.createScope('products'); let calls=0, notices=0;
  const reader = guardedProductManagementReader(scope, { readCandidates: noCandidates, async readList() { calls++; if(calls===1)return emptyPage; throw new HttpQueryError('forbidden','FORBIDDEN',403); } }, () => { notices++; assert.equal(scope.active,false); });
  const query = createProductManagementQuery(scope,reader); await query.run(parameters()); assert.ok(query.getSnapshot().success);
  await query.run(parameters()); assert.equal(notices,1); assert.equal(query.getSnapshot().phase,'disposed'); assert.equal(query.getSnapshot().success,null); ctx.clear();
});
test('candidate windows search debounce ownership, page boundaries and identity disposal do not resurrect late rows', async () => {
  const ctx=context(),scope=ctx.createScope('candidate'),pending=deferred<Awaited<ReturnType<ProductManagementReader['readCandidates']>>>();
  const reads: unknown[]=[];
  const model=new ProductCandidateWindow(scope,{ readList: async()=>emptyPage, readCandidates: read=>{reads.push(read.parameters);return pending.promise;} },'year');
  const load=model.loadNext(); model.reset('new search'); pending.resolve({page:1,pageSize:20,exactTotal:1,items:[{id:'2026',label:'2026年'}]}); await load;
  assert.equal(model.getSnapshot().items.length,0);assert.equal(model.getSnapshot().search,'new search');
  assert.deepEqual(JSON.parse(JSON.stringify(reads[0])),{kind:'year',search:'',page:1,pageSize:20,selectedIds:[]});ctx.clear(); assert.equal(model.getSnapshot().phase,'disposed');assert.equal(model.getSnapshot().items.length,0);
});
