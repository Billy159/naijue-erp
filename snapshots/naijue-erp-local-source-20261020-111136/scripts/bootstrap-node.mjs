import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync, mkdirSync, existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// This bootstrap deliberately runs with the existing Node. All build/install scripts enforce the pinned version.
const root = fileURLToPath(new URL('../', import.meta.url));
const pin = JSON.parse(readFileSync(resolve(root, 'config/toolchain.json'), 'utf8'));
if (!['darwin', 'linux'].includes(process.platform) || !['arm64', 'x64'].includes(process.arch)) throw new Error('Use a version manager to install the exact Node/npm versions on this platform.');
const folder = `node-v${pin.node}-${process.platform}-${process.arch}`;
const destination = resolve(root, '.runtime', folder);
if (existsSync(destination)) {
  const result = spawnSync(resolve(destination, 'bin/node'), ['--version'], {encoding: 'utf8'});
  if (result.status !== 0 || result.stdout.trim() !== 'v' + pin.node) throw new Error('Existing runtime does not match the pin; inspect it before replacing.');
  console.log(`Pinned runtime already exists: ${destination}`);
} else {
  mkdirSync(resolve(root, '.runtime'), {recursive: true});
  const name = `${folder}.tar.gz`;
  const response = await fetch(pin.checksums);
  if (!response.ok) throw new Error(`Checksum request failed: ${response.status}`);
  const checksums = await response.text();
  const checksum = checksums.split('\n').map(s => s.trim().split(/\s+/)).find(row => row[1] === name)?.[0];
  if (!checksum) throw new Error('Platform archive is absent from the official release checksums');
  const archive = await fetch(pin.release + name);
  if (!archive.ok) throw new Error(`Runtime download failed: ${archive.status}`);
  const bytes = Buffer.from(await archive.arrayBuffer());
  if (createHash('sha256').update(bytes).digest('hex') !== checksum) throw new Error('Runtime checksum mismatch');
  const path = resolve(root, '.runtime', name);
  writeFileSync(path, bytes);
  const extracted = spawnSync('tar', ['-xzf', path, '-C', resolve(root, '.runtime')], {stdio: 'inherit'});
  if (extracted.error || extracted.status !== 0) throw new Error('Runtime extraction failed');
  console.log(`Verified official Node runtime installed inside this project: ${destination}`);
}
