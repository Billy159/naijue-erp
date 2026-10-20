import './check-toolchain.mjs';
import {spawnSync} from 'node:child_process';
import {mkdirSync, rmSync, readdirSync, copyFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {root} from './files.mjs';

// A failed compile must never leave a stale successful backend available.
rmSync(resolve(root, 'dist/server'), {recursive: true, force: true});
mkdirSync(resolve(root, 'dist'), {recursive: true});
const result = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.json'], {cwd: root, stdio: 'inherit'});
if (result.error) throw result.error;
if (result.status !== 0) {
  rmSync(resolve(root, 'dist/server'), {recursive: true, force: true});
  process.exit(result.status ?? 1);
}
const sqlSource = resolve(root, 'server/database/sql');
const sqlOutput = resolve(root, 'dist/server/database/sql');
mkdirSync(sqlOutput, {recursive: true});
for (const name of readdirSync(sqlSource)) {
  if (!/^(?:\d{4}-[a-z-]+\.sql|0001-manifest\.json)$/.test(name)) throw new Error('Unexpected database build resource');
  copyFileSync(resolve(sqlSource,name),resolve(sqlOutput,name));
}
console.log('Strict backend build: PASS');
