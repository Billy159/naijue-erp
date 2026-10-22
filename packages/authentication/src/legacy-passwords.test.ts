/** Synthetic credential data only; no source credentials, accounts or database. */
import test from "node:test";
import assert from "node:assert/strict";
import { pbkdf2Sync } from "node:crypto";
import { createNodeMigratedLegacyPasswords, wrapTrustedLegacyCredential } from "./legacy-passwords.ts";
import { createNodeScryptPasswords } from "./passwords.ts";
test("legacy migration preserves both fixed source costs and exact UTF-8 salt text", async () => {
  const codec = createNodeMigratedLegacyPasswords(), password = "123456";
  for (const [iterations, salt] of [[600000, "a".repeat(48)], [210000, "00000000-0000-4000-8000-000000000001"]] as const) {
    const digest = pbkdf2Sync(password, salt, iterations, 32, "sha256").toString("hex");
    const encoded = wrapTrustedLegacyCredential({ salt, hash: iterations === 600000 ? "pbkdf2-sha256:600000:" + digest : digest });
    assert.equal(encoded, `naijue:pbkdf2-sha256:1:${iterations}:${salt}:${digest}`);
    assert.equal(await codec.verify(password, encoded), true); assert.equal(await codec.verify(password + "x", encoded), false);
    assert.equal(await createNodeScryptPasswords().verify(password, encoded), false);
  }
});
test("legacy compatibility never changes new scrypt encoding or accepts unknown plaintext/costs/shapes", async () => {
  const codec = createNodeMigratedLegacyPasswords(), password = "SYNTHETIC_NEW_PASSWORD";
  const hash = await codec.hash(password); assert.match(hash, /^naijue:scrypt:1:32768:8:1:/); assert.equal(await codec.verify(password, hash), true);
  for (const value of [password, "a".repeat(64), `pbkdf2-sha256:600000:${"b".repeat(64)}`,
    ...["0", "1", "600001", "999999999999", "6e5", "600000:extra"].map(cost => `naijue:pbkdf2-sha256:1:${cost}:${"a".repeat(48)}:${"b".repeat(64)}`),
    `naijue:pbkdf2-sha256:1:600000:${"a".repeat(48)}:${"b".repeat(64)}\n`]) assert.equal(await codec.verify(password, value), false);
  assert.equal(await codec.verify("字".repeat(342), hash), false);
  for (const input of [{ salt: "a".repeat(47), hash: "b".repeat(64) }, { salt: "a".repeat(48), hash: "b".repeat(64) + "\n" },
    { salt: "a".repeat(48), hash: "pbkdf2-sha256:210000:" + "b".repeat(64) }, { salt: "a".repeat(48), hash: password }]) assert.throws(() => wrapTrustedLegacyCredential(input), TypeError);
});
