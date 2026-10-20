import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import type { PasswordCodec } from "./ports.ts";

// A versioned, exact format with bounded work. No dynamic parameters from an untrusted stored string.
const PREFIX = "naijue:scrypt:1:32768:8:1:";
const FORMAT = /^naijue:scrypt:1:32768:8:1:([0-9a-f]{32}):([0-9a-f]{128})$/;
const MAX_PASSWORD_BYTES = 1024;
function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, result) => error ? reject(error) : resolve(result));
  });
}
/** Uses only Node's supported crypto. Construction generates no password, token, salt or credential. */
export function createNodeScryptPasswords(): PasswordCodec {
  return Object.freeze({
    async hash(password: string): Promise<string> {
      if (typeof password !== "string" || password.length === 0 || Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES) throw new TypeError("Password input is unavailable");
      const salt = randomBytes(16);
      const derived = await derive(password, salt);
      try { return `${PREFIX}${salt.toString("hex")}:${derived.toString("hex")}`; }
      finally { derived.fill(0); salt.fill(0); }
    },
    async verify(password: string, encoded: string): Promise<boolean> {
      if (typeof password !== "string" || password.length === 0 || Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES || typeof encoded !== "string") return false;
      const match = FORMAT.exec(encoded);
      if (!match || match[0] !== encoded) return false;
      const expected = Buffer.from(match[2]!, "hex");
      const actual = await derive(password, Buffer.from(match[1]!, "hex"));
      try { return timingSafeEqual(actual, expected); }
      finally { actual.fill(0); expected.fill(0); }
    }
  });
}
