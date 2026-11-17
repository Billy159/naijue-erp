# Start43 execution-description source diagnosis

Scope: existing local source and stored Start43 evidence only. No Node, database,
server, clock, issuer, CAS, writer or replay was invoked. No frozen source changed.
Current installed Root baseline is 132, not 127.

## Observed failure

`NORMAL43-EXECUTION-PREPARATION-02/runtime/start/START-ORIGINAL-KEY-READBACK-01.PRIVATE.json`
records terminal `ea9deaadd2e6ba1e4b25558ee28d8cd339f34980adc011d917dae4ce52be2ba1`,
FAILED/exit 2; describe process exit 2, stdout 113 bytes, stderr 0 bytes,
trace empty, safeCode `FINAL43_EXECUTION_DESCRIPTION_UNCONFIRMED`.
The failure cleanup confirms the original DATA clean, carrier stopped, PID and
port absent, own operation inactive. No writer was issued or submitted.

## Confirmed source contradiction

The exact consumer02 `start/bundle/final-execution-describe.mjs` requires
UID/EUID/GID/EGID all zero at line 24. At line 39 it calls
`api.describeFresh35FinalExecutionBinding` in that same process.

The installed Root08 source row for `tools/unified-import/r3-service20-entry.mjs`
is `a36f2a10911f19682e488bd1432924f4616f8e7b5007691e4ac50caafe3a68f6`.
It re-exports the function from `fresh35-host-session.mjs`.
The actual Root08 host source is
`ROOT08-EXECUTION-PREPARATION-01/job-bundle/delta-02.asset.json`, digest
`5e4f50a53cc93f96271b1fee3956b8f14f4607db5dbab46c28eb97f02e0d46aa`,
matching its source row. Lines 1030-1031 call
`readFresh35BatchedContextInputs`, whose line 1001 calls
`loadFresh35CombinedRecordEnvelope`.

The Root08 source row for
`scripts/release/unified-install/fresh35-combined-record-v1.mjs` is
`b411833ec42648645a25d187fb089554e304649e94190de38a36d70725a46e2a`.
The existing APP-SETTLEMENT24 candidate copy matches that exact row. Its lines
44-45 require integer UID and UID/EUID both nonzero,
`ORDINARY_RUNTIME_REQUIRED`.

The generator's root requirement and this ordinary-process requirement cannot
both hold. This is a deterministic source blocker in the description chain.
It is not proof that the actual Start43 reached this guard: an earlier input,
file or runtime check could have failed first.

## Why the current receipt cannot identify the first assertion

The generator's line 56 catch discards the exception and writes only the fixed
UNKNOWN object. It does not retain a guard code, exception type or stack.
The Python owner captures those stdout/stderr bytes; it cannot recover a
discarded exception. Therefore the current 113-byte stdout/empty stderr alone
cannot name the first failing assertion.

Keep actual failures, Source04 118e and consumer02 8b492 frozen. Do not alter the
ordinary loader or bypass its existing identity boundary. Any consumer change
or diagnostic execution belongs to a separately specified Main scope and T45's
ownership. Original prepare05/SQLite/44910 steps, business IDs, SQL, writer key,
role deadlines and existing publication limits remain unchanged.
