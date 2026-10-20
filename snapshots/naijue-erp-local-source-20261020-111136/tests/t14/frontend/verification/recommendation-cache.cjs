const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'real-data-bridge.mjs'), 'utf8');
const start = source.indexOf('const recommendationCache='), end = source.indexOf('function adaptedCatalogProduct', start);
const requests = [], bridge = {};
const ctx = vm.createContext({ bridge, window: {}, api: () => new Promise(resolve => requests.push(resolve)) });
vm.runInContext(source.slice(start, end), ctx);
const invalidate = () => {
  if (bridge.invalidateRecommendations) bridge.invalidateRecommendations('hall-a');
  else vm.runInContext("recommendationCache.delete('hall-a')", ctx);
};
(async () => {
  const stale = bridge.ensureRecommendations('hall-a');
  invalidate(); // Approving or reversing a sale invalidates the prior request.
  requests[0]({ customerId: 'old', accounts: [{ methodId: 'wechat', accountId: 'old-account' }] });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(bridge.recommendationForHall('hall-a'), null, 'a response begun before a sale mutation must not restore stale recommendations');
  assert.equal(requests.length, 2, 'the stale waiter must obtain the current effective recommendation');
  const current = { customerId: 'new', accounts: [{ methodId: 'wechat', accountId: 'latest-account' }] };
  requests[1](current);
  assert.deepEqual(await stale, current);
  assert.deepEqual(bridge.recommendationForHall('hall-a'), current);
  invalidate();
  const reverse = bridge.ensureRecommendations('hall-a');
  requests[2]({ customerId: 'old', accounts: [] });
  assert.equal((await reverse).customerId, 'old');
  assert.equal(bridge.recommendationForHall('hall-a').accounts.length, 0);
  assert(source.includes('bridge.invalidateRecommendations(d.storeId)'), 'successful sale writes use the same invalidation path');
  console.log('Recommendation request race, current waiter and sale reversal: PASS');
})().catch(error => { console.error(error); process.exitCode = 1; });
