import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import type { PasswordCodec } from "./ports.ts";

// A versioned, exact format with bounded work. No dynamic parameters from an untrusted stored string.
const PREFIX = "naijue:scrypt:1:32768:8:1:";
const FORMAT = /^naijue:scrypt:1:32768:8:1:([0-9a-f]{32}):([0-9a-f]{128})$/;
const MAX_PASSWORD_BYTES = 1024;
/** Public, fixed work-only vector (zero salt / 'naijue-authentication-dummy-v1-not-an-account'), never an account credential. */
export const NODE_SCRYPT_DUMMY_HASH = PREFIX + '00000000000000000000000000000000:35b8d4df40dc10ca9506d2a4a8530d7f7f22bb9884793d4f81a0a1038d7c85104f02733bfe02db12f0b2d1d726d1914e41eb74a6d6e3250367e1faa77c417ed0';
export function isNodeScryptPasswordHash(encoded: string): boolean {
  const match = typeof encoded === 'string' ? FORMAT.exec(encoded) : null;
  return match !== null && match[0] === encoded;
}
/** Stable server-private key, reused across all instances/restarts. Never a
 * password hash, bare digest, request-selected salt or generated fallback.
 * Only this tag may enter the CREATE/RESET_PASSWORD request fingerprint. */
export function createNodeCredentialRequestTag(secret: Uint8Array): (password: string) => string {
  if (!(secret instanceof Uint8Array) || secret.byteLength !== 32) throw new TypeError("Explicit 32-byte private credential request key required");
  const key = Buffer.from(secret);
  return (password: string): string => {
    if (typeof password !== "string" || password.length === 0 || Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES)
      throw new TypeError("Bounded credential request input required");
    return createHmac("sha256", key).update("naijue:credential-request-tag:v1\0", "utf8").update(password, "utf8").digest("hex");
  };
}
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
