/** T45 explicit-client driver. This file never opens a connection, creates data,
 * reads environment credentials or modifies a database. SOURCE844 is the baseline. */
import test from 'node:test';import assert from 'node:assert/strict';import {performance} from 'node:perf_hooks';
interface Query {readonly sql:string;readonly values:unknown[]}
interface Client {query(sql:string,values?:unknown[]):Promise<{rows:Record<string,unknown>[]}>}
export async function compareHistoryQuerySlo(input:{client:Client;baseline:readonly Query[];candidate:Query;decodeBaseline:(results:readonly Record<string,unknown>[][])=>unknown;decodeCandidate:(rows:Record<string,unknown>[])=>unknown;
 authorization:{target:string;isolatedNonOwner:true;approved:true};scale:{salesHeaders:number;transferHeaders:number;salesLines:number;transferLines:number};}){
 assert.equal(input.authorization.approved,true);assert.equal(input.authorization.isolatedNonOwner,true);assert.ok(input.authorization.target.length>0);
 assert.ok(input.baseline.length>0&&input.baseline.length<=2);
 for(const q of [...input.baseline,input.candidate])assert.match(q.sql.trim(),/^(?:\/\*[\s\S]*?\*\/\s*)?(?:WITH|SELECT)\b/i);
 await input.client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 try{
 const baselineMs:number[]=[],candidateMs:number[]=[];
 for(let i=0;i<3;i++){
  const start=performance.now(),old=[];for(const q of input.baseline)old.push((await input.client.query(q.sql,q.values)).rows);baselineMs.push(performance.now()-start);
  const next=performance.now(),rows=(await input.client.query(input.candidate.sql,input.candidate.values)).rows;candidateMs.push(performance.now()-next);
  assert.deepEqual(input.decodeCandidate(rows),input.decodeBaseline(old));
 }
 const plans=[];for(const q of [...input.baseline,input.candidate])plans.push((await input.client.query('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) '+q.sql,q.values)).rows);
 return {baselineSource:'SOURCE844 c0eba03398fbfb9520ff33f8c04b1b8c558f2144',scale:input.scale,baselineMs,candidateMs,firstRuns:1,repeatedRuns:2,cacheResetPerformed:false,sloMs:2000,candidateWithinSlo:candidateMs.every(n=>n<=2000),plans};
 }finally{await input.client.query('ROLLBACK');}
}
test('P03 real isolated PostgreSQL baseline/difference/EXPLAIN/SLO', {skip:'Requires C-approved fresh isolated non-owner target and T45 supplied client/fixture/query inputs; no implicit database access'},()=>{});
