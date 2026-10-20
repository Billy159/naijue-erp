import {pbkdf2, randomBytes, timingSafeEqual} from 'node:crypto';
import {invalid} from './errors.js';

const derive = (password: string, salt: string, iterations: number): Promise<Buffer> => new Promise((resolve, reject) => {
  pbkdf2(password, salt, iterations, 32, 'sha256', (error, key) => error ? reject(error) : resolve(key));
});
async function deriveCredential(password: string): Promise<{salt: string; hash: string}> {
  const salt = randomBytes(24).toString('hex');
  return {salt, hash: 'pbkdf2-sha256:600000:' + (await derive(password, salt, 600000)).toString('hex')};
}
export async function passwordCredential(password: unknown): Promise<{salt: string; hash: string}> {
  if (typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password) > 1024) return invalid();
  return deriveCredential(password);
}
/** Used only by the maintenance-only, approved first-initialization workflow. */
export async function firstPasswordCredential(password: unknown): Promise<{salt: string; hash: string}> {
  if (typeof password !== 'string' || password.length !== 6 || Buffer.byteLength(password) > 1024) return invalid();
  return deriveCredential(password);
}
export function supportedCredential(salt: string | null, hash: string | null): boolean {
  return salt !== null && /^(?:[a-f0-9]{48}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/.test(salt)
    && hash !== null && /^(?:pbkdf2-sha256:600000:)?[a-f0-9]{64}$/.test(hash);
}
export async function verifyPassword(password: string, salt: string | null, hash: string | null): Promise<boolean> {
  const modern = hash?.match(/^pbkdf2-sha256:600000:([a-f0-9]{64})$/);
  const legacy = hash && /^[a-f0-9]{64}$/.test(hash) ? hash : null;
  const valid = supportedCredential(salt, hash);
  const actual = await derive(password, valid ? salt! : '0'.repeat(48), modern || !valid ? 600000 : 210000);
  const expected = Buffer.from(modern?.[1] ?? legacy ?? '0'.repeat(64), 'hex');
  return !!valid && timingSafeEqual(actual, expected);
}
