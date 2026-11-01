# Framed dictionary feasibility gate v1 — counterexamples, no new decoder

Exclusive test-only research leaf. Existing frozen fixtures/reports, all production code, original HTTP entry/guards and root test registration are unchanged.

Run exact Node24.21.0 with concurrency1:

```sh
source /workspace/scratch/1f717a486422/toolchain/use-exact-node.sh
node --test --test-concurrency=1 tests/performance/opt01/dictionary-framed-prototype-v1/deadline-and-auth-counterexamples.test.mjs
```

A controlled `performance.now` clock advances without actual waiting, is restored in `finally`, and is used only inside this isolated test process. The actual original HTTP SDK's independent default30s deadline accepts two original16s page calls but rejects the same values arriving in one32s response. Even a future incremental whole-page decoder could accept only the first page at16s under that unchanged whole-request30s bound. Resetting per frame would replace/extend the original single-request deadline and is not done. This is a concrete admitted-duration counterexample, not a demand to reproduce arbitrary packet scheduling and not proof every bounded optimization is impossible.

A fast10s one-call model succeeds under unchanged guards, demonstrating a useful restricted subdomain; it is not a real new endpoint or after-detail≤2 production result. No streaming parser is force-built when the required general wiring is already unequal.

The actual original cookie authenticator is separately exercised with an explicitly stubbed token resolver. A captured revoked cookie is not interchangeable with a different valid same-account cookie on a later original request. Fresh per-page actor/business authorization alone does not reauthenticate an old HTTP session. This test does not execute actual login, cookie rotation, browser/PG/authentication storage or a production exploit. A future protocol must explicitly preserve session/authority boundaries, not assume captured credentials equal all later request credentials.

No large data, Node service/listener, network, PG, browser, new cache, fallback, endpoint, wire decoder or production implementation. Existing prefix-state semantics remain governed by the earlier actual-session/initializer counterexample. Current compatible action is legacy pagination; possible fast-subdomain request reduction is separate from universal deadline/auth/error/cancel equivalence. No universal≤2 or absolute optimization impossibility claim.
