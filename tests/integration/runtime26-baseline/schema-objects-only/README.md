# Fresh source-schema objects rehearsal — not runtime acceptance

New successor only: frozen Phase1 six files, historical SQL/guards/pins, current
factory and completeACL gates remain unchanged. User-authorized scope is a NEW
owned isolated synthetic PG17.11 cluster, no production/data/deploy/push.

```
node --test tests/integration/runtime26-baseline/schema-objects-only/offline.test.mjs
node tests/integration/runtime26-baseline/schema-objects-only/run.mjs --help
# Only AFTER independent review of these exact NEW source hashes:
node tests/integration/runtime26-baseline/schema-objects-only/run.mjs --run-source-schema-objects-only c20261031e003 55442
```

Node24.21.0/original locked dependencies, private sibling PG17.11 and the host /usr/bin/python3 runtime are required (Python realpath/hash pinned). Node socket stdin is converted to a real anonymous pipe in isolated/no-site Python, then execve runs the exact initdb binary; secret remains stdin/RAM, never files/env/argv.
Engine never enters default npmtest. Only exact offline.test.mjs may be registered.
Any existing run directory or old/occupied port refuses. New path:
`development-results-20261031/pg-runtime26-schema-only-<id>/data`.
Any first failure is retained/quarantined/stopped, no replay/reset. A code fix
needs another NEW ID/port/physical cluster. Never reuse QA178 or earlier tests.

Strict own-data primitive snapshots prevent coercion/getter/hidden-key inputs.
Overall20minute budget starts before sourcework/bootstrap, covers native commands,
connect and every observer/source query, including local client timeouts on both session SET and SQL. Aborted-TX ROLLBACK is sent directly without an illegal preceding SET; cleanup has separate finite bounds.
Timed-out finite native commands TERM→KILL must definitively close before cleanup proceeds. The postmaster itself is directly foreground-spawned with a captured ChildProcess handle (never pg_ctl background fork); owned PID file ready status must match this child before connection. SIGINT fast shutdown waits its definitive close; forced SIGKILL never counts as clean stop.
TCP-only/SCRAM exact admin/DB/127.0.0.1 HBA rejects all other connections. Password
random memory-only via initdb stdin, never argv/files/evidence. Actual systemID,
PID/start/port/databaseOID and canonical owned0700 path/dev/inode are bound to
physical birth; path identity rechecked before later native commands/stop. The
NOLOGIN/NOINHERIT/unprivileged/connlimit0 tenant roles have no memberships.

Original40 sources/718 root statements retained, only26 schema-version INSERTs.
All original BEGIN/COMMIT boundaries retained with identity/source/exclusivity
checks. Only old target-specific v22 becomes a separately reviewed NEW carrier:
ONE transaction grant two sentinel columnUPDATE cells → exact131 full signature,
body+definition parent pins/schema1..26/two-cell guard → unchanged original member
→ revoke both cells → zero positive-column/table/sequence/schemaUSAGE assertion
→ commit. Sentinel has no LOGIN/CONNECT/USAGE/membership; not normal runtime ACL.
Original PUBLIC helper exception preserved; no blanket function revoke.

Nine dynamic sourceDO blocks have74 finite effects/30 trigger tuples. The earlier
seven Phase1 scanner markers were not exhaustive SQL parsing. Expected facts
come from original source/probes, never copied from target actual. Checks cover
137 exact full signatures/body hashes and selected attributes, source table/column
NAME sets,30 exact-schema zero-argument trigger tuples, versions1..26, validated
constraints and zero business rows. Actual canonical constraint/trigger definitions
and hashes remain OBSERVATION_ONLY where independent expected pins are absent.
Source installation does not execute deferred/runtime branches. No fullcanonical,
completeACL, ordinaryLOGIN, V8/HISTORY issuer, API/business acceptance or EXPLAIN
claim. Stop receipt is terminalPASS only after stop/PID/process/control/session/
confirmed-client-close proof; only ECONNREFUSED proves closed port, never EPERM.
All eight previous review findings have connection-free fault-injection cases;
new restored-environment hashes/results must replace discarded old draft evidence.

Separate opt-in native stdin transport probe (NO PostgreSQL/DB connection; Python required): `node --test tests/integration/runtime26-baseline/schema-objects-only/stdin-pipe-bridge.native-test.mjs`. This entry is NOT added to default npmtest. The first pre-cluster ENXIO attempt is quarantined/preserved; a new ID/port is mandatory after review.

PostgreSQL inet::text includes /32: native inet equality is used for the exact loopback guard, not display-string equality. Nonsecret bootstrap identity is recorded before validation. Official PG17 network-functions documentation defines this distinction; no catalog/ACL expected hash is derived from the observation. Failed e001/e002 targets are retained and never replayed.
