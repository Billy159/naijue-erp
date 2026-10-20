# Authentication frontend slice

Real React/TypeScript application code for login, current-session resolution, logout and self-password change. Construction and mounting are inert. It does not start a browser/server, open an account, log in automatically, create a user, select a database, or choose a deployment origin.

## Host integration

Public exports are in `index.ts`:

```tsx
const reads = new ReadContext();
const auth = new AuthenticationController({
  client: createAuthHttpClient({
    origin: explicitlyConfiguredHttpsOrigin,
    basePath: explicitlyConfiguredApiPrefix,
    fetch: explicitlyInjectedFetch,
  }),
  onIdentityChange: readContextAuthenticationLifecycle(reads),
});
// After the host explicitly decides to check its current cookie session:
void auth.resolveSession();
// Render inside the existing application, not a replacement preview/demo:
<AuthenticationPanel controller={auth}>
  {principal => <ExistingApplication principal={principal} readContext={reads} />}
</AuthenticationPanel>
// A business reader's UNAUTHENTICATED/401 must call auth.expire().
// Dispose both the controller and mounted business routes when their host is destroyed:
auth.dispose();
```

The host must import `ReadContext` from the existing loading module. `AuthenticationPanel` imports its own scoped stylesheet. No existing root, inventory, product drawer, preview, transport or backend file was changed in this slice. The host creates route/read scopes only for an authenticated identity. Business authorization always stays on the server; a displayed role is not an authorization grant.

`onIdentityChange` is required, synchronous, and must not throw. The supplied bridge calls `ReadContext.replaceIdentity`, which disposes all old scopes on identity replacement, same-account verification, session/permission revision change, logout, expiry, cancelled/uncertain writes, and disposal. Its session revision is only a local non-secret counter. It is never a cookie token. If the host supplies its own callback, it must invalidate the old `ReadContext` before publishing any replacement identity.

The panel offers an explicit current-session verification button, login form, current-account toolbar, logout and password dialog. `children` renders only while the controller holds a currently verified identity. Mounting itself does not request data. A host can explicitly call `resolveSession()` at bootstrap; do not place implicit-login/default-user behavior around it.

## HTTP contract and safety

- Exact configured HTTPS origin and explicit same-origin base path; injected fetch only. Every action uses one fixed endpoint and `mode/credentials: same-origin`, `cache: no-store`, `redirect: error`. No caller-selected route, token, actor, role or hall is transmitted.
- `POST /auth/login`: `{loginName,password}` -> exact `{principal,expiresAt}`.
- `GET /auth/session`: exact `{principal}`; null is a real unauthenticated result, never a synthetic fallback.
- `POST /auth/logout`: `{}` -> 204; failures are not shown as confirmed logout.
- `POST /auth/password`: `{currentPassword,newPassword}` -> 204. Confirmation is checked in the form and is not an extra server field.
- The only credential transport is the server-managed HttpOnly cookie. No cookie access, Authorization header, bearer token, local/session storage, saved user, initial password, fallback account or automatic retry is present.
- Principal/expiry JSON is strictly checked; extra token/password fields are rejected. Bounded streamed JSON (16 KiB) and an absolute monotonic request/body deadline fail closed, including synchronously resolved microtask streams; a timer still interrupts stalled awaits. Error messages are fixed client text, never raw server/provider messages or exception causes.
- Passwords use uncontrolled ephemeral input fields, not application drafts or persistent state. Forms use explicit validation rather than native constraint blocking, so actual submit-button clicks reach the clearing path even for missing/short fields. Submit clears password inputs immediately, including validation failures. Close, Escape and unmount reset detached password fields. Immutable JavaScript strings passed to the single in-flight request cannot be guaranteed to be memory-zeroized; no such claim is made.
- Password confirmation and the source-confirmed 8-character minimum are checked before self-change submission. The server remains authoritative for its password policy and UTF-8 limits. Old-password rejection retains the existing verified identity; real expiry and uncertain writes clear it.
- Repeated actions do not duplicate an in-flight request. Logout can supersede a pending login; cancellation, expiry, disposal and generation checks prevent late responses from restoring an old local identity. There is no automatic relogin after password change.
- Cancellation/timeout cannot prove that a server-side write did not execute or that a browser did not process Set-Cookie. The UI reports this uncertainty, clears the local identity, and offers explicit session verification. It does not falsely report successful logout/password change or silently retry a write.
- The login response has a known expiry and schedules local invalidation without network traffic. `/auth/session` intentionally provides no expiry; the host must forward later unauthenticated business responses to `expire()`. No heartbeat, refresh-token loop or invented session lifetime is introduced.

## Source basis and limits

Contracts were read from `apps/api/src/authentication.ts` and `packages/authentication/{README.md,src/ports.ts,src/service.ts,src/source-policy.ts}`. The approved frozen-Demo account summary was read from `/workspace/shared/erp-rewrite-planning/demo-source-evidence/noncore-functions-source-report.txt`: roles, employment/account switches and salesperson hall requirements inform the server contract, not new browser authorization logic.

That approved summary does not contain a login/password-screen screenshot or exact screen copy. Labels use the available ERP vocabulary (登录账号、修改密码、退出登录、旧密码、新密码、确认新密码); frozen-Demo pixel/interaction parity is not claimed.

## Synthetic verification

```sh
node --test apps/web/src/authentication/authentication.test.ts
node apps/web/src/authentication/tests/run-dom-tests.mjs
```

The first command covers mocked fetch and controller/model flows. The second bundles only this slice and exercises React with jsdom, without binding a server or making network requests. Logs and source digests are in `verification/`. Root test discovery is intentionally left for the integration owner.

Not verified: actual credentials/accounts, browser HttpOnly-cookie/TLS/proxy behavior, live server/database integration, real-browser rendering/focus, screenshots, frozen-Demo pixel parity, production abuse protection or deployment readiness.
