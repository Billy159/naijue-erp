/** Existing receipt digests stay exact; pure capability binding does not require Node crypto. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonicalRequestValue } from '../packages/application/src/canonical-request-value.ts';
import { requestHash } from '../packages/application/src/request-hash.ts';
const vectors: readonly [unknown, string][] = [
 [null,'88561e211e862344bd3cc71c03f8ab25d8a79b9bdbaa1e083af7e0603f30f689'],
 ['1','b763ad64424cdd455d3ea7da92388f97aefb19e9dd5f7bfdfb83bfc2af6575b0'],
 [1n,'cc7130013527ac2a34de7f05846a80a6abc29cbd03fad13003867866f8c066d4'],
 [1,'9474fb1cdec61961a8fce26f02f8a66d7dbd3ffb113ead69c628935d765b1bc4'],
 [false,'72371ba06c39032d1a2acebf630184dcb072254fb05443788af8aabca3430171'],
 [9007199254740993n,'4f126d7c4b7bceb9596c0fea9678eef3c8cc66982902789761e950f48801fc04'],
 [{z:null,a:[1n,'1',true,{n:2}]},'531b701427d0c2a31ca6a71559706e7a01321da1087904ecce50035cdb265cee'],
 [[2,1],'968c5add48f87805ea4798c7c077e622e37825624cd11a716ef53e38999f6bea'],
 [{},'44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a'],
 [{n:null},'598ff709481b34227d1afcee8eb5e52419a24f10108ea7c333532f2a5b9f3c62'],
];
test('canonical extraction preserves original bd0c047 receipt SHA256 vectors exactly', () => {
 for (const [value, expected] of vectors) {
  assert.equal(requestHash(value), expected);
  assert.equal(createHash('sha256').update(canonicalRequestValue(value)).digest('hex'), expected);
 }
});
test('canonical equality retains native type, explicit unknowns, row order and exact large integers', () => {
 assert.equal(canonicalRequestValue({b:2,a:1n}),canonicalRequestValue({a:1n,b:2}));
 for (const [left,right] of [[null,false],[null,0],[1n,'1'],[1n,1],[{}, {n:null}],[[1,2],[2,1]], [9007199254740993n,9007199254740992n]])
  assert.notEqual(canonicalRequestValue(left),canonicalRequestValue(right));
});
test('canonical encoder still rejects unsupported/unsafe values rather than JSON-coercing them', () => {
 const cycle: Record<string,unknown>={};cycle.self=cycle;
 for (const value of [undefined,NaN,Infinity,1.25,Number.MAX_SAFE_INTEGER+1,new Date(0),cycle,()=>{},Symbol('bad')]) {
  assert.throws(()=>canonicalRequestValue(value),{code:'INVALID_REQUEST'});
  assert.throws(()=>requestHash(value),{code:'INVALID_REQUEST'});
 }
});
