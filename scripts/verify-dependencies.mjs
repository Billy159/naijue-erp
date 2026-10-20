import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
for (const section of ['dependencies', 'devDependencies']) {
  assert.deepEqual(lock.packages[''][section], manifest[section], `${section} lock/manifest differ`);
  for (const [name, expected] of Object.entries(manifest[section])) {
    assert.match(expected, /^\d+\.\d+\.\d+$/);
    const installed = require(`${name}/package.json`).version;
    assert.equal(installed, expected, `${name}: installed version differs`);
    assert.equal(lock.packages[`node_modules/${name}`].version, expected, `${name}: locked version differs`);
    console.log(`${name}: installed and locked ${expected}`);
  }
}
console.log(`Dependency verification passed; ${Object.keys(lock.packages).length - 1} locked package entries, no installation performed.`);
