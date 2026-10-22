import { pbkdf2, timingSafeEqual } from "node:crypto";
import type { PasswordCodec } from "./ports.ts";
import { createNodeScryptPasswords } from "./passwords.ts";

const ENVELOPE = /^naijue:pbkdf2-sha256:1:(600000|210000):([0-9a-f]{48}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):([0-9a-f]{64})$/;
const SALT = /^(?:[0-9a-f]{48}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
/** Private C-operated migration helper only. Source identity/authorization must be
 * verified separately; this function proves format, never source trust. Preserves
 * the exact original UTF-8 salt TEXT and digest without seeing a password. No
 * plaintext acceptance, hash recalculation, account creation or DB/file access. */
export function wrapTrustedLegacyCredential(input: { readonly salt: string; readonly hash: string }): string {
  if (!input || typeof input !== "object" || Reflect.ownKeys(input).length !== 2
    || typeof input.salt !== "string" || ![36, 48].includes(input.salt.length) || !SALT.test(input.salt)
    || typeof input.hash !== "string") throw new TypeError("Unsupported source credential format");
  const modern = /^pbkdf2-sha256:600000:([0-9a-f]{64})$/.exec(input.hash);
  const legacy = /^[0-9a-f]{64}$/.exec(input.hash);
  if (modern?.[0] === input.hash) return `naijue:pbkdf2-sha256:1:600000:${input.salt}:${modern[1]}`;
  if (legacy?.[0] === input.hash) return `naijue:pbkdf2-sha256:1:210000:${input.salt}:${input.hash}`;
  throw new TypeError("Unsupported source credential format");
}
/** Explicit trusted production opt-in. New hashes and own-password changes always
 * use the existing scrypt encoder. Only two source-confirmed fixed PBKDF2 costs
 * are accepted; raw old columns, unknown envelopes and malicious costs fail closed. */
export function createNodeMigratedLegacyPasswords(): PasswordCodec {
  const current = createNodeScryptPasswords();
  return Object.freeze({ hash: current.hash,
    async verify(password: string, encoded: string): Promise<boolean> {
      if (typeof password !== "string" || password.length === 0 || Buffer.byteLength(password, "utf8") > 1024 || typeof encoded !== "string") return false;
      if (encoded.startsWith("naijue:scrypt:")) return current.verify(password, encoded);
      const match = ENVELOPE.exec(encoded);
      if (!match || match[0] !== encoded) return false;
      // Select fixed constants, never a work parameter parsed from arbitrary input.
      const iterations = match[1] === "600000" ? 600000 : 210000;
      const expected = Buffer.from(match[3]!, "hex");
      const actual = await new Promise<Buffer>((resolve, reject) => {
        pbkdf2(password, match[2]!, iterations, 32, "sha256", (error, bytes) => error ? reject(error) : resolve(bytes));
      });
      try { return timingSafeEqual(actual, expected); }
      finally { actual.fill(0); expected.fill(0); }
    }
  });
}
