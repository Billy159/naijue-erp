# Disposable PostgreSQL acceptance

The current runbook is [tests/integration/README.md](../tests/integration/README.md).

Current executable selections are only `sparse-0001-0010` and `backend-0001-0010`, each requiring a separately approved fresh direct-loopback target and exact migrations0001→0010 before any product fixture. Current schema1–10 engine acceptance is **NOT RUN** during this source-preparation step.

Earlier genuine PostgreSQL results are preserved with their exact frozen source and hashes. In particular the frozen `2d0f5d2ef79a1d48f63a85cb0242661d2e54efde` schema1–8 results and separately reviewed inventory-reader optimization remain historical proof, not passes for current source/schema10. Historical1–5/1–8 suite names are now refused before Pool construction. No production compatibility mode was added.

See the current runbook for source-only checks, the complete plan, target/role/source guards, synthetic fixture order, execution authorization, result limitations and owned external lifecycle cleanup. This documentation does not authorize running PostgreSQL or accessing real uploaded data.
