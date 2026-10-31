/** Closed process-local stdio bridge. Related successful reads are never rewritten. */
import { createInterface } from 'node:readline';
import { createMultiHallReadFixture } from './fixture.mjs';
const args = process.argv.slice(2);
if (args.length !== 4 || args[0] !== '--repo' || args[2] !== '--expected-checkpoint') throw Error('Use --repo ABS --expected-checkpoint FULL_SHA');
const fixture = await createMultiHallReadFixture({ repoRoot: args[1], expectedCheckpoint: args[3] });
try {
  for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
    try {
      const request = JSON.parse(line);
      if (request.control === 'inspect') {
        process.stdout.write(JSON.stringify({ control: 'inspect', sourceCheckpoint: fixture.sourceCheckpoint, source: fixture.snapshot(), statistics: fixture.statistics(), calls: fixture.calls() }) + '\n');
        continue;
      }
      process.stdout.write(JSON.stringify(await fixture.request(request)) + '\n');
    } catch (error) {
      process.stdout.write(JSON.stringify({ status: 500, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ error: { code: 'SYNTHETIC_BRIDGE_FAILURE', message: String(error) } }) }) + '\n');
    }
  }
} finally { await fixture.close(); }
