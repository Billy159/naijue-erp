import './check-toolchain.mjs';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {root} from './files.mjs';

const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const lock = JSON.parse(readFileSync(resolve(root, 'package-lock.json'), 'utf8'));
for (const [name, version] of Object.entries({...pkg.dependencies, ...pkg.devDependencies})) {
  if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version)) throw new Error(`Unpinned direct dependency: ${name}`);
  const installed = JSON.parse(readFileSync(resolve(root, 'node_modules', name, 'package.json'), 'utf8'));
  if (installed.version !== version || lock.packages['node_modules/' + name]?.version !== version) throw new Error(`Dependency version mismatch: ${name}`);
}
for (const [name, metadata] of Object.entries(lock.packages)) {
  if (!name) continue;
  if (!metadata.version || !metadata.integrity || !metadata.resolved?.startsWith('https://registry.npmjs.org/')) throw new Error(`Missing registry lock evidence: ${name}`);
}
console.log(`Exact direct dependencies and registry integrity: PASS (${Object.keys(lock.packages).length - 1} locked packages)`);
