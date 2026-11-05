# Bounded authentication module

This module supplies explicit login, session resolution, logout, and self-password-change. It does not start a server, choose an environment/database, create an account, seed a default administrator, import credentials, write credential files, or sign anyone in automatically.

## Required integration

Construct `createAuthenticationService` with trusted storage, a UTC clock returning canonical ISO milliseconds, a password codec, and an explicit authentication policy. `createSourceAuthenticationPolicy(sessionTtlSeconds)` contains only the narrowly source-confirmed rules: roles `ADMIN`, `WAREHOUSE`, `SALESPERSON`; employment `在职`; salesperson requires a normal hall; normal self-password change requires at least 8 JavaScript string characters and at most 1024 UTF-8 bytes. The maintenance-only six-digit bootstrap exception is intentionally absent. The host must explicitly choose session lifetime. Missing/invalid configuration fails closed.

`createNodeScryptPasswords` uses the built-in asynchronous Node scrypt implementation, a random 128-bit salt, fixed bounded parameters N=32768/r=8/p=1, a 64-byte derived key, and constant-time key comparison. The entire exact versioned salt/hash representation fits the existing `user_account.password_hash` field. There is no plaintext fallback, algorithm/parameter downgrade, or automatic import of the earlier separate-salt representation. Any credential-format migration requires a separately approved plan. Hashing is not a substitute for the separately required password policy.

`PostgresAuthenticationStore` accepts an already configured trusted pool and supplies parameterized transactional operations. Account reads lock account and staff rows, then read/lock a referenced hall in a separate current statement. Session validation then re-reads and locks the session after its account, so a logout committed during the account-lock wait cannot authenticate the initial stale lookup. Self-change verifies the old hash/version, replaces the hash, increments both account-maintenance and authentication versions, and revokes all existing sessions in the same transaction. Authentication version mismatch independently invalidates every old session. No new session is created on password change; a fresh explicit login is required.

`0003_auth_sessions.sql` is additive schema plus version-3 migration metadata only. It creates the session table/indexes without account changes, seeds, credentials, session rows, business-data backfill, or migration execution. Sessions persist only a SHA-256 hash of a fresh random 256-bit opaque token, account/auth version, timestamps and revocation. Raw session tokens must never be stored or logged.

## HTTP boundary

Register `createAuthenticationHttpPlugin({service, trustedOrigin})` with an explicit exact external HTTPS origin. Routes:

- `POST /auth/login`: JSON `loginName`, `password`; sets a fresh host-only `__Host-naijue_session` cookie and returns principal/expiry, never the token/hash/password in JSON.
- `GET /auth/session`: returns `{principal: null}` when unauthenticated, otherwise the current server-derived account/staff/role/hall/auth-version identity. It does not create or refresh a session.
- `POST /auth/logout`: empty JSON object; revokes the presented session before clearing the cookie. A storage failure is not reported as confirmed logout.
- `POST /auth/password`: JSON `currentPassword`, `newPassword`; requires the existing session, changes password atomically, then clears the cookie.

All cookies are HttpOnly, Secure, SameSite=Strict and Path=/ with no Domain. All write requests require the exact configured Origin; conflicting Authorization headers, duplicate/malformed session cookies, mismatching Origins and cross-site Fetch Metadata are rejected. No CORS is enabled. Responses have `Cache-Control: no-store`. Unknown JSON fields/query parameters are rejected. Storage/policy exceptions are not serialized back to the client. The module does not log request bodies, passwords, tokens or authentication hashes and does not write authentication audits containing them. The embedding server must not log them either: configure logger redaction for Cookie, Set-Cookie, Authorization and password request fields, and avoid request-query/body logging.

`createSalesSessionAuthenticator` is directly usable as `SalesHttpOptions.authenticate`. Sales passes method/URL/headers/IP, the callback enforces cookie request origin checks and derives account/hall from current server state. The client cannot supply an actor. This authenticates identity only: the existing separate trusted sales authorization policy remains mandatory. An optional hall on administrator/warehouse staff is not a grant of global business access. Every non-null staff hall must currently be normal; unknown roles, employment states, invalid hall references, disabled accounts and stale/revoked/expired sessions fail closed.

## Deliberate limits

No listener, deployed service, real database execution, actual account or live-login validation is included. Tests use synthetic in-process Fastify injection and explicitly scripted pg protocol responses. They do not validate real PostgreSQL SQL/locking/durability, browser cookie behavior, production TLS/proxy setup or distributed security.

There is no implemented distributed rate limiter, brute-force/credential-stuffing control, account provisioning/reset, forgot-password email/SMS, cleanup scheduler, session-management UI, persistent identity expansion or password-format migration. A deployment must separately configure/verify appropriate abuse protection, HTTPS, trusted-origin/proxy handling, safe logging, privileged account maintenance and durable storage. No such production readiness is claimed by these tests.
