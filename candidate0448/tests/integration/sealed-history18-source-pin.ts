/** Synthetic fixture file seal only. This is NOT a production mapping/reference approval loader. */
import assert from "node:assert/strict";
import { constants } from "node:fs";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
export async function pinSyntheticClosureSourceFiles(roots: readonly string[]) {
 const pins: { root: string; relative: string; sha256: string; bytes: number }[] = []; let total = 0;
 const walk = async (root: string, relative: string): Promise<void> => {
  const path = join(root, relative), before = await lstat(path); assert.equal(before.isSymbolicLink(), false); assert.equal(await realpath(path), path, "No linked ancestors in synthetic source seal");
  if (before.isDirectory()) { for (const entry of (await readdir(path)).sort()) await walk(root, join(relative, entry)); return; }
  assert.ok(before.isFile() && before.size <= 8 * 1024 * 1024 && pins.length < 200);
  total += before.size; assert.ok(total <= 16 * 1024 * 1024, "Synthetic source fixture seal budget16MiB is fixed");
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
   const same = (s: Awaited<ReturnType<typeof handle.stat>>) => s.isFile() && !s.isSymbolicLink() && s.dev === before.dev && s.ino === before.ino && s.size === before.size && s.mode === before.mode && s.mtimeMs === before.mtimeMs && s.ctimeMs === before.ctimeMs;
   assert.ok(same(await handle.stat())); const bytes = await handle.readFile(); assert.equal(bytes.length, before.size);
   assert.ok(same(await handle.stat()) && same(await lstat(path)));
   pins.push({ root, relative, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length });
  } finally { await handle.close(); }
 };
 for (const root of roots) { assert.equal(root, resolve(root)); await walk(root, ""); }
 return pins;
}
