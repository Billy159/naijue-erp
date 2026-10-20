import assert from 'node:assert/strict';
import { decimalToMinor, quantity, multiplyMoney } from '../dist/packages/domain/src/values.js';
import { createSalesService } from '../dist/packages/application/src/sales-service.js';
import { LatestQuery } from '../dist/apps/web/src/loading/latest-query.js';
assert.equal(multiplyMoney(decimalToMinor('0.10', { scale: 2 }), quantity('3')), 30n);
assert.equal(typeof createSalesService, 'function');
assert.equal(typeof LatestQuery, 'function');
console.log('Emitted JS imports and exact arithmetic pass. No server started; no database/client constructed.');
