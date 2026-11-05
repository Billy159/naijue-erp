# Prepared supervisor v2 independent review

Status: no blocking findings remain for the reviewed startup-cleanup and stop-only recovery source. This supersedes the inherited startup-control concern in the preserved v1 review, not its historical observations. Root must still authorize and verify any physical lifecycle and engine run. This reviewer did not activate a supervisor, invoke PostgreSQL, read credentials, connect to a cluster, or change services, permissions or production source.

## Final frozen artifacts

- /workspace/shared/naijue-pg-backend-20261020-aq_irji4/prepared-supervisor.mjs
  - SHA-256: 8874c81620a67b475ba3bfd4aa9c74bfcbd7f4a841d4de3ab015d6553dee1325
- /workspace/shared/naijue-pg-backend-20261020-aq_irji4/supervisor-vs-current.patch
  - SHA-256: e0fd24b113a27c739265429c973ca945db26b2867bdfd734f509c05cf625b0c0

The final eight-hunk full diff was independently reversed against the prepared source entirely in memory. The reconstructed original source hash is 224b6836168da5dc767c20e6cbc1049f6025aad866f5a3295effb26ce5349a86, matching the original-holder identity. No original/live holder was read or modified. The source also passes `node --check`, exit 0. See `supervisor-v2-static-checks.log` and `supervisor-v2-source.sha256`.

## Startup and recovery findings

The bounded command file is now created before initdb. The normal command loop still begins only after successful setup and target creation, which is documented truthfully. The earlier identity diagnostic no longer claims control readiness. A start attempt is tracked before awaiting pg_ctl acknowledgement, so an uncertain acknowledgement cannot bypass cleanup.

On startup failure after a start attempt, cleanup inspects only the fixed new data directory. It checks status, orderly stops a running owned server, and requires subsequent status exit 3 with no signal before claiming verified stopped/not-running. Unexpected status, stop failure or a still-running result is uncertain, not PASS or READY. Before any start attempt, initdb failure does not invoke SQL or mutate a server through cleanup.

Uncertain cleanup retains the credential holder in a bounded-file recovery loop. That loop can invoke only the owned stop helper, only for an exact `stop` line. Prepare, either engine command, malformed/whitespace-suffixed stop and unknown text are ignored. A transient control-file read error keeps memory alive. A failed stop keeps recovery active; only a subsequent exact stop retries it. The new delta does not widen network, authentication, role, permission, service, source-archive or arbitrary-command authority.

## Independently found and fixed offset defect

The first cleanup candidate, c96e4f80be77f19d92543544777e81a07deb004477573bf298976a28cd3dfe9b, used a UTF-8 byte count as a JavaScript string slice offset. An ignored multibyte line could cause a later appended exact stop to be skipped. The reviewer reproduced this with the actual extracted recovery function and fake I/O, and the owner changed both normal and recovery offsets to `line.length + 1`, matching text.slice's UTF-16 indexing.

The original candidate is preserved as prepared-supervisor-before-unicode-offset-fix.mjs. A discriminating negative-control rerun of the independent four-test recovery harness against that actual candidate reports 3 passed, 1 failed, expected exit 1. The sole failure is the lost multibyte-line stop case. See `supervisor-v2-unicode-negative-control.log`.

An initially attempted negative-control invocation had already observed the fixed 8874c816 source; its 4/4 positive output is retained honestly as `supervisor-v2-intermediate-recovery.log`, with an explanatory note. It is not used as failing negative evidence.

## Final pure tests

Command: `PREPARED_SUPERVISOR_SOURCE=/workspace/shared/naijue-pg-backend-20261020-aq_irji4/prepared-supervisor.mjs node --test evidence/postgres-backend-0001-0008-preparation/operator-startup-faults.test.mjs evidence/backend-engine-suite-independent-20261020T2039Z/operator-recovery-independent.test.mjs`.

Result: exit 0, 10 passed, 0 failed, cancelled, skipped or todo. See `supervisor-v2-final-faults.log`.

- Six owner tests evaluate the complete actual supervisor body with injected fake process spawning, cryptography, filesystem, timers and process state. They cover post-start setup failure, unknown start acknowledgement, uncertain stop, uncertain status, initdb failure and multibyte recovery.
- Four additional independent tests evaluate the actual extracted recovery function with fake read/timer/stop objects. They cover ASCII command rejection, multibyte command rejection followed by a later exact stop, transient file-read failure and uncertain-stop retention/retry.

The original five-owner-test pass is retained in `supervisor-v2-owner-faults.log`. None of these simulations launches a subprocess, generates credentials, invokes SQL or mutates the filesystem. Actual PostgreSQL startup, orderly shutdown and unknown-outcome behavior remain runtime verification work, not established by synthetic fault logic. The root-controlled next lifecycle must preserve old data/evidence and independently verify the new physical target before selecting the exact backend archive.
