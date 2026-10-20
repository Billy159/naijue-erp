import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalJson, hashIdempotencyPayload} from '../server/domain/idempotency/index.ts';
import {DecimalError, formatScaled, multiplyMoneyByQuantity, parseBusinessDay, parseScaled} from '../server/domain/transactions/decimal.ts';
import {documentCommandLocks} from '../server/domain/transactions/command.ts';

test('currency and inventory values use exact fixed point precision and NUMERIC(18) bounds', () => {
  assert.equal(parseScaled('1234567890123456.70',2),123456789012345670n);
  assert.equal(formatScaled(parseScaled('-0.0250',4),4),'-0.0250');
  assert.equal(parseScaled('3.12000',2),312n);
  assert.throws(() => parseScaled('3.12001',2), error => error instanceof DecimalError && error.code === 'DECIMAL_PRECISION');
  assert.throws(() => parseScaled('10000000000000000.00',2), error => error instanceof DecimalError && error.code === 'DECIMAL_OVERFLOW');
  assert.throws(() => parseScaled('1e3',2), error => error instanceof DecimalError && error.code === 'INVALID_DECIMAL');
  assert.throws(() => formatScaled(1000000000000000000n,2), error => error instanceof DecimalError && error.code === 'DECIMAL_OVERFLOW');
});

test('decimal input rejects JSON numbers before their lost precision can be treated as exact', () => {
  for (const places of [2,4]) for (const value of [0,1,0.1,JSON.parse('1.000000000000000001'),JSON.parse('9007199254740993'),JSON.parse('10000000000000.0001')]) {
    assert.throws(() => parseScaled(value,places), error => error instanceof DecimalError && error.code === 'INVALID_DECIMAL');
  }
  assert.equal(parseScaled('9007199254740993',2),900719925474099300n);
  assert.equal(parseScaled('10000000000000.0001',4),100000000000000001n);
  assert.throws(() => parseScaled('1.000000000000000001',4), error => error instanceof DecimalError && error.code === 'DECIMAL_PRECISION');
});

test('unit-price multiplication rounds half away from zero without floating point', () => {
  assert.equal(multiplyMoneyByQuantity(105n,15000n),158n);
  assert.equal(multiplyMoneyByQuantity(-105n,15000n),-158n);
  assert.equal(multiplyMoneyByQuantity(1n,4999n),0n);
  assert.equal(multiplyMoneyByQuantity(1n,5000n),1n);
});

test('business dates validate Gregorian leap years without timezone conversion', () => {
  assert.equal(parseBusinessDay('2000-02-29'),'2000-02-29');
  assert.equal(parseBusinessDay('2026-10-02'),'2026-10-02');
  for (const value of ['1900-02-29','2025-02-29','2026-04-31','2026-1-01','2026-10-02T00:00:00Z']) {
    assert.throws(() => parseBusinessDay(value), error => error instanceof DecimalError && error.code === 'INVALID_BUSINESS_DAY');
  }
});

test('idempotency payload hashing is canonical and rejects values outside JSON', () => {
  assert.equal(canonicalJson({b:2,a:{z:true,c:null}}),'{"a":{"c":null,"z":true},"b":2}');
  assert.equal(hashIdempotencyPayload({b:2,a:1}),hashIdempotencyPayload({a:1,b:2}));
  assert.throws(() => canonicalJson({a:undefined}));
  assert.throws(() => canonicalJson([,1]));
  const cyclic = {}; cyclic.self = cyclic;
  assert.throws(() => canonicalJson(cyclic));
});

test('posting actions declare snapshot, idempotency, document, and shared inventory locks up front', () => {
  const input = {documentId:'10000000-0000-4000-8000-000000000001',documentType:'TRANSFER',operation:'approve',expectedVersion:1,requestKey:'t17-approve'};
  assert.deepEqual(documentCommandLocks(input,'transfers.approve'),[
    {scope:'reference',key:'inventory-opening-snapshot'},
    {scope:'idempotency',key:'transfers.approve:t17-approve'},
    {scope:'document',key:input.documentId},
    {scope:'inventory',key:'posting-ledger'},
  ]);
});
