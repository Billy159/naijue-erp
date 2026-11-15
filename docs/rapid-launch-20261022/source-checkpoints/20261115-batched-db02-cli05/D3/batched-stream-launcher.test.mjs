import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const cli = new URL('./source/tools/unified-import/cli.mjs', import.meta.url);
const route = new URL('./source/tools/unified-import/stream-import-cli.mjs', import.meta.url);

test('launcher accepts COMPLETED only with verified readback and closed cleanup', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'd3-launcher-'));
  for (const [verification, expectedExit] of [['VERIFIED', 0], ['NOT_RUN', 3]]) {
    const preload = join(directory, verification + '.mjs');
    const result = {state: 'COMPLETED', verification: {state: verification}, connection_cleanup: 'CLOSED'};
    await writeFile(preload, `import {mock} from 'node:test';\nmock.module(${JSON.stringify(route.href)}, {exports:{runStreamImport:async()=>(${JSON.stringify(result)})}});\n`);
    const child = spawnSync(process.execPath, ['--experimental-test-module-mocks', '--import', preload, fileURLToPath(cli), 'stream-import'], {encoding: 'utf8'});
    assert.equal(child.status, expectedExit, child.stderr);
    assert.equal(JSON.parse(child.stdout).state, 'COMPLETED');
  }
});
