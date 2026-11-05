# Authentication review

Scope: independent read-only review of `packages/authentication/**`, `apps/api/src/authentication.ts` and focused tests, minimal sales HTTP request metadata changes, `adapters/postgres/src/auth-store.ts`, and additive migration `0003_auth_sessions.sql`.

Status: no remaining blocker found in the bounded code/synthetic scope after corrections. Two concurrent-state consistency issues were found, acknowledged and fixed by the implementation owner. The corrected source and the independent reproduction/fix replay were reviewed. No source file was edited by the reviewer.

## Findings

1. **Stale session across an account-lock wait.** The original resolver read an unlocked session, acquired current account/staff state afterward, and then used the original revocation value. A targeted synthetic interleaving reproduced acceptance after logout completed and an initially disabled account became enabled; no instant had both an active session and enabled account. Fixed: the service now re-reads and locks the session after the account lock, consistently ordering account before session. The independent interleaving replay now rejects the revoked session.
2. **Hall state was not serialized.** The original account query used a left-joined hall snapshot while locking only account and staff. A hall update could race or become stale while those locks waited. Fixed: the adapter now reads the referenced hall in a separate post-account/staff `SELECT ... FOR SHARE` statement, failing closed when absent or disabled. Session validation reads the trusted clock only after these waits and its session-lock wait.

## Reviewed protections

- Fresh 256-bit opaque session credentials, canonical base64url validation, SHA-256 domain-separated hashes only in persisted session rows. No plaintext token, password, seed account, fallback credential, listener, environment selection, or credential-file write was found.
- Versioned, exact fixed-cost scrypt format; malformed/legacy/plaintext formats fail verification. Bounded password byte length, random salt and constant-time derived-key comparison.
- Exact expiry rejects `expiresAt <= now`, future creation and invalid lifetimes. Clock read occurs after account storage waits. Current employment, enabled login, known role, required hall and enabled referenced hall are checked. Unknown states fail closed.
- Password change verifies the old password and explicit host policy, updates exact old hash/auth version via compare-and-set, increments account and authentication versions, and revokes all account sessions within one transaction. No replacement login is created.
- Cookie-only HTTP boundary: `__Host-`, HttpOnly, Secure, SameSite=Strict, Path=/, no Domain; no token/hash/password JSON. Exact configured HTTPS Origin required for mutations, cross-site Fetch Metadata and conflicting Authorization rejected. Duplicate/malformed session cookies, extra JSON fields and query parameters rejected. Logout clears only after successful revocation. Unknown provider/SQL/policy exceptions are replaced with generic HTTP errors.
- Sales receives method/URL metadata and derives account/hall from the authentication service, not client actor fields. Separate existing business authorization remains mandatory.
- Parameterized SQL and explicit transaction/rollback boundaries. Commit uncertainty and rollback failure discard the connection rather than report success. Migration is additive and contains no account seed, session row, business-data backfill or credential data. It records version 3 in `schema_migration`, consistent with 0001/0002.

## Validation boundaries

Reviewer executed the same focused in-process synthetic concurrency probe before and after the fix: it reproduced finding 1 originally and correctly rejected after the fix. The implementation owner separately owns the auth/Sales focused regression run; this review does not substitute a fresh aggregate rerun. No PostgreSQL execution, server listener, real account, migration application, credential access or local executor task was performed. Scripted pg tests cannot establish actual PostgreSQL syntax, row-lock behavior or durability.

Deployment remains a separately authorized concern: TLS/proxy/origin configuration, logger redaction, abuse/rate limiting, provisioning/reset and password-format migration are not proven by this review or synthetic tests. These limits are explicitly documented by the module.
