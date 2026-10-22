/** Small synthetic filesystem seal checks; no private sources, SQL or source approval grants. */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, realpath, writeFile, rm, symlink, open } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pinSyntheticClosureSourceFiles } from "./integration/sealed-history18-source-pin.ts";
test("synthetic full-file seal detects same-size edits and missing sources; no observed SQL can seed its expected byte pins", async t => {
 const root = await realpath(await mkdtemp(join(tmpdir(), "naijue-closure-pin-test-"))); t.after(() => rm(root, { recursive: true, force: true }));
 const file = join(root, "source.json"); await writeFile(file, '{"synthetic":1}', { flag: "wx", mode: 0o600 });
 const first = await pinSyntheticClosureSourceFiles([root]); assert.equal(first.length, 1);
 assert.deepEqual(await pinSyntheticClosureSourceFiles([root]), first);
 await writeFile(file, '{"synthetic":2}'); const changed = await pinSyntheticClosureSourceFiles([root]);
 assert.equal(changed[0]!.bytes, first[0]!.bytes); assert.notEqual(changed[0]!.sha256, first[0]!.sha256);
 await assert.rejects(pinSyntheticClosureSourceFiles([join(root, "missing")]));
});
test("synthetic source seal rejects symlink leaves, linked ancestors and oversized files without following or reading them", async t => {
 const root = await realpath(await mkdtemp(join(tmpdir(), "naijue-closure-pin-links-"))); t.after(() => rm(root, { recursive: true, force: true }));
 const file = join(root, "original"); await writeFile(file, "SYNTHETIC ORIGINAL", { flag: "wx", mode: 0o600 });
 await symlink(file, join(root, "linked-file")); await assert.rejects(pinSyntheticClosureSourceFiles([join(root, "linked-file")]));
 await symlink(root, join(root, "linked-root")); await assert.rejects(pinSyntheticClosureSourceFiles([join(root, "linked-root", "original")]));
 const large = join(root, "sparse-file"), handle = await open(large, "wx", 0o600);
 try { await handle.truncate(8 * 1024 * 1024 + 1); } finally { await handle.close(); }
 await assert.rejects(pinSyntheticClosureSourceFiles([large]));
 const pins = await pinSyntheticClosureSourceFiles([file]); assert.equal(pins.length, 1); assert.equal(pins[0]!.bytes, 18);
});
