import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

const expected = JSON.parse(readFileSync(new URL('../config/toolchain.json', import.meta.url), 'utf8'));
if (process.versions.node !== expected.node) {
  throw new Error(`Node ${expected.node} is required; received ${process.versions.node}. Use scripts/npm.sh or the pinned runtime.`);
}
const npm = execFileSync('npm', ['--version'], {encoding: 'utf8'}).trim();
if (npm !== expected.npm) throw new Error(`npm ${expected.npm} is required; received ${npm}`);
