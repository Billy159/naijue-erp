import {createHash} from 'node:crypto';
import {readFileSync, readdirSync, lstatSync, mkdirSync, writeFileSync} from 'node:fs';
import {resolve, dirname, relative, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export function safeFile(base, name) {
  if (typeof name !== 'string' || !name || name.includes('\\') || name.split('/').some(p => !p || p === '..' || p === '.')) throw new Error(`Invalid path: ${name}`);
  const path = resolve(base, name);
  if (!path.startsWith(resolve(base) + sep)) throw new Error(`Path escapes root: ${name}`);
  let current = resolve(base);
  for (const part of name.split('/')) {
    current = resolve(current, part);
    if (lstatSync(current).isSymbolicLink()) throw new Error(`Symlinks are forbidden: ${current}`);
  }
  if (!lstatSync(path).isFile()) throw new Error(`Not a regular file: ${path}`);
  return path;
}
export function fileRecords(base) {
  const result = [];
  function walk(folder) {
    for (const e of readdirSync(folder, {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = resolve(folder, e.name);
      if (e.isSymbolicLink()) throw new Error(`Symlink in artifact: ${path}`);
      if (e.isDirectory()) walk(path);
      else if (e.isFile()) {
        const bytes = readFileSync(path);
        result.push({path: relative(base, path).split(sep).join('/'), bytes: bytes.length, sha256: sha256(bytes)});
      } else throw new Error(`Non-regular artifact entry: ${path}`);
    }
  }
  walk(base);
  return result.sort((a, b) => a.path.localeCompare(b.path));
}
export function writeJson(path, value) {
  mkdirSync(dirname(path), {recursive: true});
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
}
