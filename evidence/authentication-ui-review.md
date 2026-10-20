# Authentication UI independent review

Reviewed 2026-10-20, initial frozen authentication slice in `/workspace/shared/naijue-erp-rewrite/apps/web/src/authentication/`. Reviewer did not edit application or test source. No network, real account/login, credentials, browser service, server/listener, PostgreSQL, installs, local Mac, push or deployment was used.

## Final disposition

PASS for this restricted frontend slice after two reported defects were corrected and independently rechecked. No open slice-local blocker remains. This is not a claim that host integration or production authentication is complete. The original findings and their closure evidence follow.

### R1: Timer-only deadlines accept a response after the configured deadline

Initial `http-client.ts` (SHA-256 `31da06327cd267eb6b471be0120faa166f45376f4981bc096f0a7d8e7a7f4325`) used a timeout timer and abort-state checks without an elapsed-time deadline. The stream has a useful 16,384-byte and 16,384-chunk bound, so this is not an infinite empty-chunk loop. However, a finite sequence of already-resolved body microtasks starves the timer and can return a successful result after the deadline.

Independent targeted probe, using the actual client and a native synthetic `ReadableStream`: `timeoutMs: 1`; `pull()` produces 8,000 `new Uint8Array(0)` chunks, then UTF-8 `{"principal":null}` and closes. The session operation returned `null` successfully after 81.25 ms; a same-delay observer timer had not fired. No fetch/network was performed. The sibling query-transport finding was not assumed to apply; this was reproduced independently.

Required outcome: a monotonic absolute deadline checked before/after fetch, each stream await/iteration, decoding/parsing and final DTO validation, while retaining the timer for genuinely stalled awaits. Deadline errors must remain sanitized `timeout`, cancel/detach the body, and not be downgraded to a server/status error or accepted success. Cover a valid body behind finite empty-chunk microtasks in a deterministic regression.

### R2: Native invalid-submit path retains entered passwords

Initial `authentication-panel.tsx` (SHA-256 `98b117b03aeb79bd873d6e3db69a1a5ea45b23b5f6ba3dd3e23195db4cb875be`) clears secrets in React `onSubmit`, but both forms have native `required` constraints and password-change inputs have `minLength`. Browser constraint validation runs before submission and can prevent that handler from executing. Thus the claim that attempted invalid submission clears passwords was not met.

Independent targeted jsdom/React probe used the actual submit button's `.click()`, not `dispatchEvent('submit')`:

- Missing login name with a filled password: zero login calls, password still present.
- Password dialog with filled old password and confirmation but missing new password: zero password-change calls, both entered secrets still present.

jsdom does not implement the minlength constraint completely, so that real-browser case was identified by source semantics, not claimed as executed. Existing DOM groups manually dispatch submit and bypassed the confirmed required-constraint path.

Required outcome: route invalid attempts through the explicit clear-and-validate handler (for example, `noValidate` with the existing manual required/byte/minimum/matching validation), or clear the fields in invalid-event handling. Regressions must click the real submit buttons with missing fields and verify all secret fields are blank and no request occurs.

## Positive findings from source and evidence review

- Initial source and backend-reference SHA-256 manifests verified completely before corrections started. Existing evidence contains 14 passing unit tests, 7 passing synthetic DOM groups and isolated strict typecheck success. Reviewer inspected that evidence rather than rerunning duplicate suites.
- The client matches `apps/api/src/authentication.ts`: login POST exact `{loginName,password}` -> 200 exact `{principal,expiresAt}`; session GET -> 200 exact `{principal}` with truthful null; logout POST `{}` -> 204; password POST exact `{currentPassword,newPassword}` -> 204. It distinguishes 401 invalid credentials from unauthenticated, 422 password-policy rejection, 403 origin rejection, and 400/413/415 input errors.
- Construction and mounting are inert. The client uses a trusted exact HTTPS origin, constrained deployment prefix, fixed endpoints, same-origin mode/cookies, no-store and redirect:error. Redirected/opaque/changed response URLs fail closed. No token, password, actor, hall or role override is added to a request.
- Exact successful DTO key checks reject extra token/password properties. UUIDs, auth version, principal field bounds and canonical expiry are checked. Error text is fixed client text, with no raw provider bodies or error causes retained. No application cookie reads, Authorization header, local/session storage, secret logging, default account, implicit login or write retry was found.
- Password strings are ephemeral request inputs, not controller state, retry closures or draft storage. Successful/handler-reached submissions clear fields before validation or requests. Dialog close, Escape, native cancel and unmount clear captured detached fields. The README correctly avoids claiming JavaScript string zeroization.
- Repeated operations are synchronously deduplicated. Logout may supersede pending login/resolve; generation, controller identity and aborted checks prevent late local identity restoration after cancellation, supersession, expiry or disposal.
- The required synchronous identity lifecycle callback precedes replacement identity publication. The supplied ReadContext bridge disposes old scopes even for same-account permission/session revision changes. Logout and uncertain writes clear identity immediately; password-policy and wrong-old-password rejections retain a still-verified identity; successful password change clears all scopes and requires explicit fresh login.
- Known login expiry schedules local invalidation without network traffic. Session resolution has no invented expiry because the backend does not return one. Business 401/UNAUTHENTICATED forwarding to `expire()` is an explicit host requirement.
- Logout/password failures and cancelled writes do not falsely announce success. Cancellation of a write cannot prove server-side nonexecution or cookie rollback, and the UI describes this uncertainty.

## Integration and verification boundaries

The new slice exports real reusable components and a host bridge, but no existing application root/route, deployed origin, fetch binding, business-401 bridge or aggregate test discovery was wired by this slice. README explicitly documents host composition and controller disposal; this remains integration work, not an independent review failure inside this restricted slice.

No actual browser HttpOnly-cookie/TLS/proxy behavior, Set-Cookie race under cancelled login, rendering/focus in a real browser, backend/database integration, frozen-Demo screenshot or pixel parity, rate limiting/abuse defense, or deployment readiness was verified. The logout-supersedes-login tests establish local identity suppression, not a proof about cookie effects of an earlier in-flight response. Do not expand those claims.

The recorded shared typecheck observation contains unrelated party-maintenance union-ID errors. That old observation is not a fresh whole-repository typecheck result. The integration owner must establish the final aggregate result against the eventual combined source.

## Corrected-source reverification and freeze

Both fixes were inspected and independently rechecked against corrected source on 2026-10-20 at approximately 17:01 UTC:

- R1 closed: the client now maintains a `performance.now()` absolute deadline, checkpoints fetch/body/decode/parse/validation and preserves timeout precedence through error-body handling. The original native finite-empty-chunk probe, with a preconstructed response and `timeoutMs: 5`, rejected with sanitized `timeout` for both status 200 and 401 while the observer timer was still unfired. Response bodies were cancelled. Observed outputs: 200 at 13.71 ms after 15 pulls, cancelled=true; 401 at 8.43 ms after 169 pulls, cancelled=true. The operation cannot preempt synchronous execution precisely at the deadline; importantly, it no longer accepts an over-deadline result or relies on timer scheduling. Chunk and byte bounds remain present.
- R2 closed: both forms use `noValidate`, preserving explicit required/byte/minimum/matching checks after clearing secrets. The same actual-button-click missing-login-name probe now clears the login password and shows validation with zero login calls. The missing-new-password probe now clears old password and confirmation with zero change calls. A further actual-click short-new-password probe also cleared all secret fields without calling the client.
- Corrected evidence inspected, without duplicating the full suites: 15/15 unit tests passed, all 7 DOM groups passed, isolated strict typecheck exit 0. Added regression code covers deterministic monotonic starvation for status 200/401 and late-fetch body cancellation, plus actual invalid-submit button clicks. No test skips/failures/cancellations were recorded.
- All 10 corrected source-manifest entries and all 6 unchanged backend/source-reference manifest entries independently passed `sha256sum -c`.

Final source manifest SHA-256: `4c9c90e540eb712ed582462d3c6c3cf02356b710f13dab63e2df66abd18fb052`.

Corrected implementation hashes:

- `http-client.ts`: `3c81a8bfe900365fb3bc5005f412f041127b98bf1f4bd405aa42dc89922ff44c`.
- `authentication-panel.tsx`: `1ff20c077fde60ee74939ca1dc7293867aaf3d635b0905b3c435fd7d017a49f8`.
- `authentication.test.ts`: `396d6dd9b6b61a1ca23b752ba5f024a5ef7e8fab354d503dc34f501aa14c534d`.
- `tests/run-dom-tests.mjs`: `ece3c6659591b3102d9ffb484337023e2f2c4b60a52aaa5260681813185a966b`.

No additional confirmed slice-local blocker was found. Re-review is needed if these frozen implementation files change. Host/aggregate integration and the runtime boundaries above remain explicit.
