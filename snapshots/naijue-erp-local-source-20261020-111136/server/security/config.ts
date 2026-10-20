import {isAbsolute} from 'node:path';
import {constants, openSync, fstatSync, readFileSync, closeSync} from 'node:fs';
import {createHash, createHmac, timingSafeEqual} from 'node:crypto';
import type {DatabaseConfig} from '../database/config.js';

export interface SecurityConfig {readonly origin: string; readonly secretFile: string; readonly ttlMs: number}
export function readSecurityConfig(env: NodeJS.ProcessEnv, database: DatabaseConfig | null): SecurityConfig | null {
  const origin = env['SESSION_ORIGIN'], secretFile = env['SESSION_SECRET_FILE'];
  if (!origin && !secretFile) return null; // Health-only foundation; no identity or business routes.
  if (!database || !origin || !secretFile || !isAbsolute(secretFile)) throw new Error('EXPLICIT_SESSION_CONFIGURATION_REQUIRED');
  let parsed: URL;
  try {parsed = new URL(origin);} catch {throw new Error('INVALID_SESSION_ORIGIN');}
  if (parsed.protocol !== 'https:' || parsed.origin !== origin || parsed.username || parsed.password) throw new Error('HTTPS_SESSION_ORIGIN_REQUIRED');
  const ttl = env['SESSION_TTL_SECONDS'] ?? '28800';
  if (!/^\d+$/.test(ttl) || Number(ttl) < 60 || Number(ttl) > 28800) throw new Error('INVALID_SESSION_TTL');
  return Object.freeze({origin, secretFile, ttlMs: Number(ttl) * 1000});
}

/** Raw keys never leave this module, appear in config JSON, or enter logs. */
export class SessionKeys {
  readonly cookieName: string;
  #secret: Buffer;
  #binding: string;
  constructor(readonly config: SecurityConfig, database: DatabaseConfig) {
    this.config = readSecurityConfig({SESSION_ORIGIN: config.origin, SESSION_SECRET_FILE: config.secretFile, SESSION_TTL_SECONDS: String(config.ttlMs / 1000)}, database)!;
    let fd: number | undefined;
    try {
      fd = openSync(config.secretFile, constants.O_RDONLY | constants.O_NOFOLLOW);
      const stat = fstatSync(fd);
      if (!stat.isFile() || stat.uid !== process.getuid?.() || (stat.mode & 0o077) !== 0 || stat.size < 32 || stat.size > 128) throw new Error();
      this.#secret = readFileSync(fd);
      if (this.#secret.length < 32 || this.#secret.length > 128) throw new Error();
    } catch {throw new Error('INVALID_SESSION_SECRET_FILE');}
    finally {if (fd !== undefined) closeSync(fd);}
    this.#binding = JSON.stringify([database.environment, database.instanceId, database.clusterId, database.database, database.schemas, database.roles.app, config.origin]);
    this.cookieName = '__Host-naijue_' + database.environment + '_' + createHash('sha256').update(this.#binding).digest('hex').slice(0, 12);
  }
  #digest(purpose: string, token: string): string {return createHmac('sha256', this.#secret).update(JSON.stringify([purpose, this.#binding, token])).digest('hex');}
  sessionDigest(token: string): string {return this.#digest('session', token);}
  csrf(token: string): string {return this.#digest('csrf', token);}
  csrfMatches(token: string, value: unknown): boolean {
    return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) && timingSafeEqual(Buffer.from(value, 'hex'), Buffer.from(this.csrf(token), 'hex'));
  }
  cookie(token: string, clear = false): string {
    return `${this.cookieName}=${clear ? '' : token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${clear ? 0 : Math.floor(this.config.ttlMs / 1000)}`;
  }
  token(cookie: string | undefined): string | null {
    const values = (cookie ?? '').split(';').map(v => v.trim()).filter(v => v.startsWith(this.cookieName + '='));
    if (values.length !== 1) return null;
    const token = values[0]?.slice(this.cookieName.length + 1) ?? '';
    return /^[a-f0-9]{64}$/.test(token) ? token : null;
  }
}
