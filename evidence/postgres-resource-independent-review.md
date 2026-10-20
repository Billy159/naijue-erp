# Independent frozen PostgreSQL resource-bound review

Reviewed 2026-10-20. Scope was limited to the three files listed below, their interactions with current adapters, installed pinned pg internals, and independent synthetic injected-driver probes. No real PostgreSQL, network operation, listener, installation, source edit, commit, or full aggregate run was performed. Review artifacts alone were written under evidence/.

## Result

The frozen runtime implementation has no identified production correctness/security blocker within its declared lazy composition-leaf scope. 23 independent sequential synthetic probes passed. The documentation needs one explicit compatibility disclosure before accepting the requested documentation contract: message and where are intentionally masked, and the existing real-engine deferred transfer COMMIT proof cannot be applied unchanged to this wrapper.

The owner-reported 23 leaf tests, 153 PostgreSQL-scoped regressions and focused types were not rerun or counted as independent proof. This review added 23 distinct probes, including integration with the real adapter transaction/snapshot paths and two protocol-only probes exercising the installed pg Client without connecting a socket.

## Frozen source identity

- adapters/postgres/src/bounded-pool.ts: 38d373b370c01997a4c17e912abefa8663a82ca00a57e7a86a72658c1021342b
- tests/postgres-bounded-pool.test.ts: 6a42a4a8d78e37f35aeeab21b19d87ecab685f3ddc6570a9dcaee4110855941f
- docs/postgres-resource-bounds.md: 11fbd44d053a6978d65f174eee3ff9b9eba88f6900354beab9e6311e58bd2cd8

These hashes were checked before and after the probes. Review findings refer to these bytes, not later owner edits.

## Finding: explicit masked-message/context integration limitation

Severity: documentation acceptance gap, not a current runtime regression.

Locations: docs/postgres-resource-bounds.md:25,35; adapters/postgres/src/bounded-pool.ts:69–80; tests/integration/proof.ts:9–18.

The docs already correctly explain sanitized messages and removal of other driver fields. However, they do not name the removed where field or disclose the resulting incompatibility with assertDeferredBalanceFailure. That assertion intentionally requires all of: SQLSTATE 23514, the exact expected database error message, and where identifying validate_transfer_balance_commit(). The new leaf preserves 23514 but replaces message and omits where. Applying the same deferred-COMMIT assertion through this wrapper therefore fails even when the intended native guard was reached. This can confuse future real-PG validation or encourage weakening the proof to accept an unrelated 23514.

Reproducer is the independent test named “sanitizer deliberately masks message/where required by deferred real-engine proof.” The original synthetic native error passes the existing assertion; new PostgresQueryError(original) fails it with the original message and context deliberately absent.

Recommended change: explicitly document both masked message and where, and state that the existing real-PG deferred balance proof must continue to observe the trusted raw-driver/test boundary or be deliberately adapted using a test-only observation path. Do not widen the public error surface or weaken the proof to SQLSTATE alone. Existing integration harness currently uses the raw Pool, so this is a future composition limitation, not a claim its current run is broken.

## Reviewed behavior and evidence

### Explicit, lazy driver configuration

- All required target/credential and positive finite timer settings are validated before driver construction. Nonempty explicit password prevents pgpass fallback. Explicit target, TLS, options, encoding, application name, SSL negotiation and replication override applicable ambient PostgreSQL values.
- Only supported driver options are forwarded. Caller-supplied connectionString, Client and log properties cannot replace target/driver behavior. The independent mutation probe confirms later caller changes cannot alter the copied target/TLS/max.
- The default Pool constructor is lazy; no call to connect is made by this module's constructor. The installed pg constructor and connection-parameters source were inspected without opening a connection. No global parser mutation was found.
- TLS configuration accepts only disabled or certificate verification with rejectUnauthorized:true and optional explicit CA. Extra insecure input options are not forwarded.

### Bounded admission and lifecycle

- slots account for active wrapper leases plus unresolved driver acquisition attempts. Timed-out attempts remain charged. Pending FIFO queue has an independent finite cap, including a zero-wait configuration.
- Queue pumping reserves slots before driver dispatch. Multi-slot out-of-order completion does not let newly admitted requests bypass existing FIFO waiters.
- Acquisition deadlines include queue time. Late successes are discarded, late failures release their own slot, and disposal synchronously closes admission and rejects queued/acquiring callers.
- Wrapper release is idempotent. Reentrant raw-release callbacks cannot reuse a slot until raw cleanup returns. An uncertain raw release is not retried and capacity remains quarantined even if some raw cleanup side effect already happened.
- Returning a lease during an in-flight query rejects its local promise, prevents pre-dispatch SQL where applicable, and ignores late outcomes. Checked-out driver error events cannot deliver a late query success.
- Disposal invokes end once, returns one promise, allows grace and then forces retained leases to discard. Outstanding acquisitions remain observed after timeout. A hung/failed/uncertain teardown is not reported as success.

### Existing adapters and error safety

- Static inspection found the only production adapter SQLSTATE/constraint translation in party-maintenance-store.ts:117–118. It needs code 23505 and customer_code_key or supplier_code_key. Both remain intact and were exercised through the actual PostgresPartyUnitOfWork plus bounded leaf, producing PARTY_CODE_CONFLICT and one ROLLBACK.
- Other current adapters do not branch on raw message, where, detail or other omitted driver metadata. They preserve rollback and unknown-COMMIT handling based on transaction state and Error identity rather than private driver text.
- All four existing transaction adapters (sales, transfer, authentication and party) were exercised with a SQLSTATE failure at COMMIT: each executes exactly one COMMIT and then one ROLLBACK, discarding the tainted connection.
- Those same four adapters were exercised with lost COMMIT acknowledgment/transport failure: the leaf retires the client; adapters produce a sanitized AggregateError when rollback cannot run on that retired client, and no second COMMIT or connection attempt is made. The original failure still states that the outcome may be unknown. No private raw-error marker survived String, inspect or JSON rendering.
- All three current read snapshot paths and both cutoff adapters were exercised with sanitized SQLSTATE failures, retaining a single rollback and safe code. Read snapshot probes call their actual runtime private-method implementations to isolate wrapper interaction from unrelated row decoding.
- The leaf uses the raw driver error only inside driver/query handling and creates a separate sanitized application error. It forwards only a boolean discard signal to raw release, so a caller error is not injected into pg internals or logged.

### Pinned pg internal safety, without network

Two independent tests use the actual installed pg Client with a pure EventEmitter protocol connection, injected through the trusted synthetic factory. No Client.connect(), real socket connection, authentication, server or listener is involved.

1. A server SQLSTATE ErrorResponse rejects COMMIT before ReadyForQuery. ROLLBACK remains at most one queued raw query until ReadyForQuery arrives, then runs once and settles. The tainted client is discarded after rollback. Sanitizing the outward error does not interfere with pg's internal error/ReadyForQuery flow.
2. The actual pg query_timeout path rejects a COMMIT locally. The wrapper discards the connection and pg Client.end() destroys the synthetic active-query stream. No SQL cancellation or retry is sent. This verifies local control flow, not physical network shutdown, server cancellation, or rollback.

## Verification and limits

Command: node --test --test-concurrency=1 evidence/postgres-resource-independent-probes.mjs

Result: 23 tests; 23 passed; 0 failed/skipped/cancelled.

Durable artifacts:
- evidence/postgres-resource-independent-probes.mjs
- evidence/postgres-resource-independent-probes.log
- evidence/postgres-resource-independent-source-sha256.txt
- evidence/postgres-resource-independent-review-manifest.json

Synthetic protocol probes cannot establish real PostgreSQL startup setting enforcement, authentication/TLS behavior, lock timeouts, socket closure, transaction isolation, deferred constraints, durability/unknown commit reconciliation, cancellation semantics, or performance/capacity. The docs correctly require an authorized isolated real-database validation before production use. An arbitrary broken injected driver or blocked event loop cannot be made physically safe by Promise deadlines alone. No acceptance of real-PG production behavior is implied.
