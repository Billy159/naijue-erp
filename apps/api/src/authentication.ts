import type { IncomingHttpHeaders } from "node:http";
import type { FastifyPluginAsync } from "fastify";
import type { ActorContext } from "../../../packages/application/src/ports.ts";
import { AuthenticationError } from "../../../packages/authentication/src/service.ts";
import type { AuthenticationService } from "../../../packages/authentication/src/service.ts";
import type { SalesAuthenticationInput } from "./sales-http.ts";
import { PasswordWorkRejected } from '../../../packages/authentication/src/password-work-gate.ts';
import { LoginAdmissionRejected } from './login-admission.ts';
import type { LoginAdmission } from './login-admission.ts';

const COOKIE = "__Host-naijue_session";
class RequestRejected extends Error {
  readonly code: "INVALID_AUTH_INPUT" | "ORIGIN_REJECTED";
  constructor(code: RequestRejected["code"]) { super("Authentication request rejected"); this.code = code; }
}
export interface AuthenticationHttpOptions {
  readonly service: AuthenticationService;
  /** Exact external HTTPS origin, from trusted server configuration. No request Host/X-Forwarded-* inference. */
  readonly trustedOrigin: string;
  /** Mandatory for login routes in production; shared by both external /api and internal /auth dispatch. */
  readonly loginAdmission?: LoginAdmission;
}
function configuration(options: AuthenticationHttpOptions): { service: AuthenticationService; trustedOrigin: string } {
  const service = options?.service;
  let origin: URL;
  try { origin = new URL(options?.trustedOrigin); }
  catch { throw new TypeError("Authentication requires an explicit trusted HTTPS origin"); }
  if (origin.protocol !== "https:" || origin.origin !== options.trustedOrigin || origin.username || origin.password
    || typeof service?.login !== "function" || typeof service?.resolve !== "function" || typeof service?.logout !== "function" || typeof service?.changeOwnPassword !== "function") {
    throw new TypeError("Authentication requires an explicit trusted service and HTTPS origin");
  }
  return { service, trustedOrigin: origin.origin };
}
function cookieRequest(headers: Readonly<IncomingHttpHeaders>, method: string, trustedOrigin: string): void {
  // Cookie-only boundary: ambiguous credentials, cross-site browser requests and missing write origins fail closed.
  if (headers.authorization !== undefined) throw new RequestRejected("INVALID_AUTH_INPUT");
  const origin = headers.origin;
  const site = headers["sec-fetch-site"];
  if (origin !== undefined && origin !== trustedOrigin) throw new RequestRejected("ORIGIN_REJECTED");
  if (site !== undefined && site !== "same-origin" && site !== "none") throw new RequestRejected("ORIGIN_REJECTED");
  if (!["GET", "HEAD", "OPTIONS"].includes(method) && origin !== trustedOrigin) throw new RequestRejected("ORIGIN_REJECTED");
}
function cookieToken(headers: Readonly<IncomingHttpHeaders>): string | null {
  const cookies = headers.cookie;
  if (cookies === undefined) return null;
  if (typeof cookies !== "string" || cookies.length > 8192) throw new RequestRejected("INVALID_AUTH_INPUT");
  let token: string | null = null;
  for (const part of cookies.split(";")) {
    const equals = part.indexOf("=");
    if (equals < 0 || part.slice(0, equals).trim() !== COOKIE) continue;
    if (token !== null) throw new RequestRejected("INVALID_AUTH_INPUT");
    token = part.slice(equals + 1).trim();
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new RequestRejected("INVALID_AUTH_INPUT");
  }
  return token;
}
function fields(body: unknown, names: readonly string[]): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== names.length
    || !names.every(name => Object.hasOwn(body, name)) || Object.keys(body).some(name => !names.includes(name))) throw new RequestRejected("INVALID_AUTH_INPUT");
  return body as Record<string, unknown>;
}
function stringField(body: Record<string, unknown>, name: string): string {
  const value = body[name];
  if (typeof value !== "string") throw new RequestRejected("INVALID_AUTH_INPUT");
  return value;
}
function noQuery(query: unknown): void {
  if (!query || typeof query !== "object" || Object.keys(query).length !== 0) throw new RequestRejected("INVALID_AUTH_INPUT");
}
const clearCookie = (): string => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
/** Encapsulated routes only. This does not listen, select a database, create accounts, enable CORS, or log credentials. */
export function createAuthenticationHttpPlugin(options: AuthenticationHttpOptions): FastifyPluginAsync {
  const { service, trustedOrigin } = configuration(options);
  const admission = options.loginAdmission;
  if (typeof admission?.acquire !== 'function') throw new TypeError('Authentication routes require explicit bounded login admission');
  const acquireLogin = admission.acquire.bind(admission);
  return async function authenticationHttp(app) {
    app.addHook("onRequest", async (request, reply) => {
      reply.header("Cache-Control", "no-store").header("Pragma", "no-cache");
      cookieRequest(request.headers, request.method, trustedOrigin);
      cookieToken(request.headers);
    });
    app.setErrorHandler((error, _request, reply) => {
      if (error instanceof LoginAdmissionRejected || error instanceof PasswordWorkRejected && error.code === 'PASSWORD_WORK_BUSY')
        return reply.header('Retry-After', String(error.retryAfterSeconds)).code(429).send({error: {code: 'AUTHENTICATION_BUSY', message: 'Authentication capacity is temporarily unavailable'}});
      if (error instanceof PasswordWorkRejected && error.code === 'AUTHENTICATION_CANCELLED')
        return reply.code(408).send({error: {code: 'AUTHENTICATION_CANCELLED', message: 'Authentication request ended'}});
      if (error instanceof RequestRejected) return reply.code(error.code === "ORIGIN_REJECTED" ? 403 : 400).send({ error: { code: error.code, message: "Authentication request rejected" } });
      if (error instanceof AuthenticationError) {
        const status = error.code === "INVALID_AUTH_INPUT" ? 400 : error.code === "PASSWORD_REJECTED" ? 422 : 401;
        return reply.code(status).send({ error: { code: error.code, message: error.message } });
      }
      const code = (error as { code?: string }).code;
      if (code === "FST_ERR_CTP_BODY_TOO_LARGE") return reply.code(413).send({ error: { code: "BODY_TOO_LARGE", message: "Request body is too large" } });
      if (code === "FST_ERR_CTP_INVALID_JSON_BODY" || code === "FST_ERR_CTP_EMPTY_JSON_BODY") return reply.code(400).send({ error: { code: "INVALID_JSON", message: "A valid JSON body is required" } });
      if (code === "FST_ERR_CTP_INVALID_MEDIA_TYPE") return reply.code(415).send({ error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Use application/json" } });
      // Never serialize provider, policy, SQL, password or cookie contents.
      return reply.code(500).send({ error: { code: "INTERNAL_ERROR", message: "The request could not be completed" } });
    });
    const json = (headers: Readonly<IncomingHttpHeaders>): void => {
      if (headers["content-type"]?.split(";")[0]?.trim().toLowerCase() !== "application/json") throw new RequestRejected("INVALID_AUTH_INPUT");
    };
    const workSignal = (request: { raw: import('node:http').IncomingMessage }, reply: { raw: import('node:http').ServerResponse }) => {
      const controller = new AbortController();
      const abort = () => controller.abort();
      const closed = () => { if (!reply.raw.writableEnded) abort(); };
      request.raw.once('aborted', abort); reply.raw.once('close', closed);
      if (request.raw.aborted) abort();
      return {signal: controller.signal, close() { request.raw.removeListener('aborted', abort); reply.raw.removeListener('close', closed); }};
    };
    app.post("/auth/login", { bodyLimit: 8192 }, async (request, reply) => {
      noQuery(request.query); json(request.headers);
      const body = fields(request.body, ["loginName", "password"]);
      const loginName = stringField(body, 'loginName'), password = stringField(body, 'password');
      if (loginName.length === 0 || Buffer.byteLength(loginName, 'utf8') > 256) throw new RequestRejected('INVALID_AUTH_INPUT');
      // trustProxy is false at the production assembly: never consume request headers as a source identity.
      const lease = acquireLogin(request.raw.socket.remoteAddress ?? '', loginName), work = workSignal(request, reply);
      try {
        const result = await service.login(loginName, password, work.signal);
        reply.header("Set-Cookie", `${COOKIE}=${result.token}; Path=/; HttpOnly; Secure; SameSite=Strict; Expires=${new Date(result.expiresAt).toUTCString()}`);
        return { principal: result.principal, expiresAt: result.expiresAt };
      } finally { work.close(); lease.release(); }
    });
    app.get("/auth/session", async request => {
      noQuery(request.query);
      const token = cookieToken(request.headers);
      return { principal: token ? await service.resolve(token) : null };
    });
    app.post("/auth/logout", { bodyLimit: 8192 }, async (request, reply) => {
      noQuery(request.query); json(request.headers); fields(request.body, []);
      const token = cookieToken(request.headers);
      if (token) await service.logout(token);
      // Clear only after revocation is confirmed. An uncertain storage result is not reported as successful logout.
      return reply.header("Set-Cookie", clearCookie()).code(204).send();
    });
    app.post("/auth/password", { bodyLimit: 8192 }, async (request, reply) => {
      noQuery(request.query); json(request.headers);
      const body = fields(request.body, ["currentPassword", "newPassword"]);
      const token = cookieToken(request.headers);
      if (!token) throw new AuthenticationError("UNAUTHENTICATED");
      const work = workSignal(request, reply);
      try { await service.changeOwnPassword(token, stringField(body, "currentPassword"), stringField(body, "newPassword"), work.signal); }
      finally { work.close(); }
      return reply.header("Set-Cookie", clearCookie()).code(204).send();
    });
  };
}
/** Plug directly into SalesHttpOptions.authenticate. Business authorization remains separately mandatory. */
export function createSalesSessionAuthenticator(options: AuthenticationHttpOptions): (input: SalesAuthenticationInput) => Promise<ActorContext | null> {
  const { service, trustedOrigin } = configuration(options);
  return async input => {
    try {
      if (typeof input?.method !== "string" || typeof input?.url !== "string" || !input.url.startsWith("/") || input.url.startsWith("//")) return null;
      cookieRequest(input.headers, input.method, trustedOrigin);
      const token = cookieToken(input.headers);
      if (!token) return null;
      const principal = await service.resolve(token);
      return principal ? Object.freeze({ accountId: principal.accountId, hallId: principal.hallId }) : null;
    } catch (error) {
      if (error instanceof RequestRejected) return null;
      throw error;
    }
  };
}
