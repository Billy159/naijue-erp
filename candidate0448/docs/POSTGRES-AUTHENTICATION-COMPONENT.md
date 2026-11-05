# Standalone synthetic authentication component (not ERP runtime acceptance)

This additive dormant suite covers the current original authentication HTTP,
service, real PostgreSQL store, shared password-work gate, bounded login rate and
bounded session-capacity admission. It does **not** repair or replace the old
schema1–10 business suites, waive V8 metadata, install patches or prove current
ERP/schema/ACL/business/browser/TLS/production readiness.

Reuse `tests/integration/README.md`'s independently verified **fresh, exclusive,
owned direct-loopback cluster**, dedicated unprivileged `naijue_erp_test` LOGIN,
`naijue_erp_test_` plus8–32 lowercase hex database name, pinned migrations1–10,
finite driver limits and external cleanup requirements. One new target per run;
failed/partly used targets are retained, not retried/reset. The owner-role test is
not ordinary runtime-role security proof. No real accounts/data are supported.

Supply secrets in memory, never command arguments, tracked files or evidence:

```sh
# NODE_ENV=test
# NAIJUE_PG_INTEGRATION=I_APPROVE_A_FRESH_DISPOSABLE_LOCAL_DATABASE
# NAIJUE_PG_TEST_SUITE=authentication-component-0001-0010
# NAIJUE_PG_EXPECT_DATABASE=<approved fresh name>
# NAIJUE_PG_TEST_DATABASE_URL=<dedicated encoded-password direct-loopback URL>
# NAIJUE_PG_COMPONENT_DATA_DIRECTORY=<canonical private owned new cluster directory>
node scripts/run-postgres-authentication-component.mjs --run-authentication-component
```

The component verifies owned directory mode/canonical path, local postmaster
directory/port/start against authenticated database identity before fixture work.
It seeds one explicitly synthetic hall/staff/account with a random memory-only
password and original scrypt hash. No products, balances, business receipts or
audits are invented. Capacity uses the one existing pool, real PG storage sizes
and fresh `statfs` of that verified local cluster; all five logical volume labels
explicitly alias its one filesystem. This is not a production volume inventory,
independent runtime catalog review or multi-writer capacity proof.

Seven serial cases verify credential/origin rejection, actual session commit and
secure cookie/current read, password CPU429, concurrent session-capacity503,
logout/revocation, password change/authVersion and closed-capacity behavior.
Neither native-work overload nor capacity rejection may insert a session.
Expected successful total:8 tests (one parent plus7 cases),0 skips.

The runner does not provision/start/stop a server, load `.env`, replay unknown
commits, or delete data. Preserve source fingerprints/raw TAP/exit status and
independently prove owned cluster shutdown and port/process closure afterward.
Authentication credential rows are synthetic but still private; do not dump them.
