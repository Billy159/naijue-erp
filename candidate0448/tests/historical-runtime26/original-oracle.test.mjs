/** Runs byte-identical historical assertions in one explicitly paired graph.
 * Active e6 successor tests remain separate and are NOT replaced by this oracle. */
import {after,test} from 'node:test';import assert from 'node:assert/strict';
import {materializeHistoricalOracle,historicalOracleData,closeHistoricalOracle} from './oracle.mjs';
const oracle=await materializeHistoricalOracle(),data=historicalOracleData(oracle);
after(async()=>{const closed=await closeHistoricalOracle(oracle);assert.equal(closed.sourceUnchanged,true);});
test('explicit historical oracle is original726/C41 graph, not active successor metadata',()=>{assert.equal(data.files,417);assert.equal(data.sourceFingerprint,'726d84f1303bcb5deb599c19de89f8cdfad89c8f365e34fa36ca4de49051bcbb');assert.equal(data.authority,'NONE');});
for(const entry of data.entryUrls)await import(entry);
