# Sales action authorization: source-only PostgreSQL acceptance preparation

This is an append-only four-group extension of the existing backend-0001-0008 suite, based on frozen implementation commit 60457e0. The previous 22-test suite keeps its original source helpers and evidence scope. The plan lists 24 scenario labels. Together with the setup subtest and outer test, a future exact fresh-target invocation is expected to contain 26 total tests; none has been executed in this preparation. The separate 24 passing connection-free regression tests are not PostgreSQL engine evidence.

The new cases exercise the actual sales action policy and PostgreSQL UoW with bounded explicit synthetic reference/economics fixtures. They reuse existing canonical synthetic account/staff facts, read no credential columns, create no accounts or passwords, and do not enable a production write host.

GET-receipt cases deliberately use EXPLICIT TEST-ONLY AUTHENTICATION with Fastify.inject. They verify native transaction-bound receipt authorization and original SAVE recovery after later approval, not session-authorized public writes, a browser, TLS or production authentication.

Lock cases must observe the specified backend PID waiting on the specified blocker through pg_blocking_pids and wait_event_type before releasing the blocker. Their finite observation/drain bounds are not delay-based evidence or retries. Controlled account/staff/hall maintenance is excluded from business-state comparisons and restored after each scenario. Header, line, settlement, receipt, audit, ledger and balance contents must remain unchanged on denied operations.

No PostgreSQL startup, connection, execution, operator change, migration change, old-target rerun, network request, new secret or commit is performed by the source-preparation worker. Only root may freeze the reviewed source and authorize the sole runtime owner to run it once on a separately fresh target.
